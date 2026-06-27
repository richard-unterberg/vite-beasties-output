import fs from 'node:fs/promises'
import path from 'node:path'
import Beasties from 'beasties'
import type { Plugin, ResolvedConfig } from 'vite'

const HTML_FILE_EXTENSION = '.html'
const GLOB_PATTERN_CHARACTER_PATTERN = /[*?]/

type PreloadStrategy = false | 'body' | 'media' | 'swap' | 'swap-high' | 'swap-low' | 'js' | 'js-lazy'

type KeyframeStrategy = 'critical' | 'all' | 'none'

type LogLevel = 'info' | 'warn' | 'error' | 'trace' | 'debug' | 'silent'

export interface SafeBeastiesOptions {
  external?: boolean
  inlineThreshold?: number
  minimumExternalSize?: number
  pruneSource?: boolean
  mergeStylesheets?: boolean
  reduceInlineStyles?: boolean
  allowRules?: Array<string | RegExp>
  preload?: PreloadStrategy
  noscriptFallback?: boolean
  inlineFonts?: boolean
  preloadFonts?: boolean
  fonts?: boolean
  keyframes?: KeyframeStrategy
  compress?: boolean
  safeParser?: boolean
  logLevel?: LogLevel
}

export interface ViteBeastiesOutputOptions {
  outputDirectory?: string
  include?: string | string[]
  beastiesOptions?: SafeBeastiesOptions
}

const DEFAULT_BEASTIES_OPTIONS: SafeBeastiesOptions = {
  preload: 'swap',
  pruneSource: false,
  reduceInlineStyles: false,
  compress: true,
  logLevel: 'warn',
}

const DEFAULT_ALLOW_RULES: Array<string | RegExp> = [/^:where\(\.(?:[^ >+~)]*\\:)*-?space-[xy]-/]

const shouldLogSummary = (logLevel: LogLevel | undefined) => {
  return (logLevel ?? DEFAULT_BEASTIES_OPTIONS.logLevel) !== 'silent'
}

const pluralizeFiles = (fileCount: number) => {
  return fileCount === 1 ? 'file' : 'files'
}

const isNodeError = (error: unknown): error is Error & { code?: string } => {
  return error instanceof Error && 'code' in error
}

const readDirectoryIfExists = async (directoryPath: string) => {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true })
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

const getPathType = async (filePath: string) => {
  try {
    const fileStat = await fs.stat(filePath)

    if (fileStat.isDirectory()) {
      return 'directory'
    }

    if (fileStat.isFile()) {
      return 'file'
    }

    return 'other'
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return 'missing'
    }

    throw error
  }
}

const collectHtmlFiles = async (directoryPath: string): Promise<string[]> => {
  const entries = await readDirectoryIfExists(directoryPath)
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name)

      if (entry.isDirectory()) {
        return collectHtmlFiles(entryPath)
      }

      return entry.isFile() && path.extname(entry.name) === HTML_FILE_EXTENSION ? [entryPath] : []
    }),
  )

  return files.flat()
}

const uniqueSortedFiles = (files: string[]) => {
  return [...new Set(files)].sort((left, right) => left.localeCompare(right))
}

const normalizeFilePath = (filePath: string) => {
  return filePath.split(path.sep).join('/')
}

const hasGlobPattern = (filePath: string) => {
  return GLOB_PATTERN_CHARACTER_PATTERN.test(filePath)
}

const getGlobBaseDirectory = (resolvedPattern: string) => {
  const normalizedPattern = normalizeFilePath(resolvedPattern)
  const globIndex = normalizedPattern.search(GLOB_PATTERN_CHARACTER_PATTERN)

  if (globIndex === -1) {
    return path.dirname(resolvedPattern)
  }

  const staticPrefix = normalizedPattern.slice(0, globIndex)
  const slashIndex = staticPrefix.lastIndexOf('/')
  const baseDirectory = slashIndex === -1 ? '.' : staticPrefix.slice(0, slashIndex)

  return path.normalize(baseDirectory || path.parse(resolvedPattern).root)
}

const escapeRegExpCharacter = (character: string) => {
  return character.replace(/[\\^$+?.()|[\]{}]/g, '\\$&')
}

const globPatternToRegExp = (resolvedPattern: string) => {
  const normalizedPattern = normalizeFilePath(resolvedPattern)
  let pattern = '^'

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index]
    const nextCharacter = normalizedPattern[index + 1]

    if (character === '*' && nextCharacter === '*') {
      if (normalizedPattern[index + 2] === '/') {
        pattern += '(?:.*/)?'
        index += 2
      } else {
        pattern += '.*'
        index += 1
      }

      continue
    }

    if (character === '*') {
      pattern += '[^/]*'
      continue
    }

    if (character === '?') {
      pattern += '[^/]'
      continue
    }

    pattern += escapeRegExpCharacter(character)
  }

  pattern += '$'

  return new RegExp(pattern)
}

const collectIncludedHtmlFiles = async (config: ResolvedConfig, include: string | string[]) => {
  const includePatterns = Array.isArray(include) ? include : [include]
  const files = await Promise.all(
    includePatterns.map(async (includePattern) => {
      const resolvedPattern = path.resolve(config.root, includePattern)

      if (!hasGlobPattern(includePattern)) {
        const pathType = await getPathType(resolvedPattern)

        if (pathType === 'directory') {
          return collectHtmlFiles(resolvedPattern)
        }

        return pathType === 'file' && path.extname(resolvedPattern) === HTML_FILE_EXTENSION ? [resolvedPattern] : []
      }

      const baseDirectory = getGlobBaseDirectory(resolvedPattern)
      const globRegExp = globPatternToRegExp(resolvedPattern)
      const candidateFiles = await collectHtmlFiles(baseDirectory)

      return candidateFiles.filter((filePath) => globRegExp.test(normalizeFilePath(filePath)))
    }),
  )

  return uniqueSortedFiles(files.flat())
}

const resolveCommonDirectory = (directories: string[]) => {
  if (directories.length === 0) {
    return undefined
  }

  const [firstDirectory, ...remainingDirectories] = directories.map((directory) => path.resolve(directory))
  const commonSegments = firstDirectory.split(path.sep)

  for (const directory of remainingDirectories) {
    const directorySegments = directory.split(path.sep)

    while (
      commonSegments.length > 0 &&
      commonSegments.join(path.sep) !== directorySegments.slice(0, commonSegments.length).join(path.sep)
    ) {
      commonSegments.pop()
    }
  }

  const commonDirectory = commonSegments.join(path.sep)

  return commonDirectory === '' ? path.parse(firstDirectory).root : commonDirectory
}

const resolveIncludeBaseDirectory = async (config: ResolvedConfig, include: string | string[]) => {
  const includePatterns = Array.isArray(include) ? include : [include]
  const baseDirectories = await Promise.all(
    includePatterns.map(async (includePattern) => {
      const resolvedPattern = path.resolve(config.root, includePattern)

      if (hasGlobPattern(includePattern)) {
        return getGlobBaseDirectory(resolvedPattern)
      }

      const pathType = await getPathType(resolvedPattern)

      return pathType === 'directory' ? resolvedPattern : path.dirname(resolvedPattern)
    }),
  )

  return resolveCommonDirectory(baseDirectories)
}

const resolveOutputDirectory = (config: ResolvedConfig, outputDirectory: string | undefined) => {
  const directory = outputDirectory ?? config.build.outDir

  return path.resolve(config.root, directory)
}

const resolveBeastiesPath = async (
  config: ResolvedConfig,
  outputDirectory: string | undefined,
  include: string | string[] | undefined,
) => {
  if (outputDirectory || !include) {
    return resolveOutputDirectory(config, outputDirectory)
  }

  return (await resolveIncludeBaseDirectory(config, include)) ?? resolveOutputDirectory(config, outputDirectory)
}

const resolveHtmlFiles = async (
  config: ResolvedConfig,
  outputDirectory: string | undefined,
  include: string | string[] | undefined,
) => {
  if (include) {
    return collectIncludedHtmlFiles(config, include)
  }

  return collectHtmlFiles(resolveOutputDirectory(config, outputDirectory))
}

const BODY_TAG_PATTERN = /<body\b[^>]*>/i
const BODY_BEASTIES_CONTAINER_PATTERN = /<body\b[^>]*\sdata-beasties-container(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>/i
const BEASTIES_CONTAINER_ATTRIBUTE_PATTERN = /\sdata-beasties-container(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=[\s>])/gi

const countBeastiesContainerAttributes = (html: string) => {
  return [...html.matchAll(BEASTIES_CONTAINER_ATTRIBUTE_PATTERN)].length
}

const ensureSingleBeastiesContainerRoot = (html: string) => {
  if (countBeastiesContainerAttributes(html) < 2 || BODY_BEASTIES_CONTAINER_PATTERN.test(html)) {
    return html
  }

  return html.replace(BODY_TAG_PATTERN, (bodyTag) => bodyTag.replace(/>$/, ' data-beasties-container>'))
}

const removeBodyBeastiesContainerAttribute = (html: string) => {
  return html.replace(BODY_TAG_PATTERN, (bodyTag) => bodyTag.replace(BEASTIES_CONTAINER_ATTRIBUTE_PATTERN, ''))
}

const removeHtmlBeastiesContainerAttribute = (html: string) => {
  return html.replace(/(<html\b[^>]*)\sdata-beasties-container(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=[\s>])/i, '$1')
}

export const viteBeastiesOutput = (pluginOptions: ViteBeastiesOutputOptions = {}): Plugin => {
  let resolvedConfig: ResolvedConfig | undefined

  return {
    name: 'vite-beasties-output',
    apply: 'build',
    enforce: 'post',
    configResolved: (config) => {
      resolvedConfig = config
    },
    async closeBundle() {
      if (!resolvedConfig) {
        return
      }

      const currentResolvedConfig = resolvedConfig

      const beastiesPath = await resolveBeastiesPath(
        currentResolvedConfig,
        pluginOptions.outputDirectory,
        pluginOptions.include,
      )
      const htmlFiles = await resolveHtmlFiles(
        currentResolvedConfig,
        pluginOptions.outputDirectory,
        pluginOptions.include,
      )
      const logLevel = pluginOptions.beastiesOptions?.logLevel ?? DEFAULT_BEASTIES_OPTIONS.logLevel

      if (htmlFiles.length === 0) {
        if (shouldLogSummary(logLevel)) {
          console.info('[vite-beasties-output] Processed 0 HTML files')
        }

        return
      }

      const beasties = new Beasties({
        ...DEFAULT_BEASTIES_OPTIONS,
        ...pluginOptions.beastiesOptions,
        allowRules: [...DEFAULT_ALLOW_RULES, ...(pluginOptions.beastiesOptions?.allowRules ?? [])],
        path: beastiesPath,
        publicPath: currentResolvedConfig.base,
      } as unknown as ConstructorParameters<typeof Beasties>[0])

      await Promise.all(
        htmlFiles.map(async (htmlFile) => {
          const html = await fs.readFile(htmlFile, 'utf8')
          const shouldPromoteBodyContainer =
            countBeastiesContainerAttributes(html) > 1 && !BODY_BEASTIES_CONTAINER_PATTERN.test(html)
          const htmlForBeasties = shouldPromoteBodyContainer ? ensureSingleBeastiesContainerRoot(html) : html
          const processedHtml = removeHtmlBeastiesContainerAttribute(
            shouldPromoteBodyContainer
              ? removeBodyBeastiesContainerAttribute(await beasties.process(htmlForBeasties))
              : await beasties.process(htmlForBeasties),
          )

          if (processedHtml !== html) {
            await fs.writeFile(htmlFile, processedHtml)
          }
        }),
      )

      if (shouldLogSummary(logLevel)) {
        console.info(`[vite-beasties-output] Processed ${htmlFiles.length} HTML ${pluralizeFiles(htmlFiles.length)}`)
      }
    },
  }
}

export const viteBeastiesOutputPlugin = viteBeastiesOutput
