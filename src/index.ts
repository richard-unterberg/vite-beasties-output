import fs from 'node:fs/promises'
import path from 'node:path'
import Beasties from 'beasties'
import type { Plugin, ResolvedConfig } from 'vite'

const HTML_FILE_EXTENSION = '.html'
const CSS_FILE_EXTENSION = '.css'
const CRITICAL_THEME_STYLE_MARKER = '/* nivel-critical-theme-vars */'

type StylesheetCache = Map<string, string | undefined>

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
  beastiesOptions?: SafeBeastiesOptions
}

const DEFAULT_BEASTIES_OPTIONS: SafeBeastiesOptions = {
  preload: 'swap',
  pruneSource: false,
  compress: true,
  logLevel: 'warn',
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

const getAttribute = (tag: string, attributeName: string) => {
  const match = tag.match(new RegExp(`\\s${attributeName}=["']([^"']+)["']`, 'i'))
  return match?.[1]
}

const hasRel = (tag: string, relName: string) => {
  return getAttribute(tag, 'rel')?.split(/\s+/).includes(relName) === true
}

const removeUrlSuffix = (href: string) => {
  return href.split(/[?#]/, 1)[0]
}

const normalizeBasePath = (base: string) => {
  return base.endsWith('/') ? base : `${base}/`
}

const resolveOutputDirectory = (config: ResolvedConfig, outputDirectory: string | undefined) => {
  const directory = outputDirectory ?? config.build.outDir

  return path.resolve(config.root, directory)
}

const collectStylesheetHrefs = (html: string) => {
  const hrefs = new Set<string>()

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const href = getAttribute(tag, 'href')

    if (href && hasRel(tag, 'stylesheet') && removeUrlSuffix(href).endsWith(CSS_FILE_EXTENSION)) {
      hrefs.add(href)
    }
  }

  return [...hrefs]
}

const resolveOutputStylesheetPath = (
  stylesheetHref: string,
  htmlFile: string,
  outputDirectory: string,
  publicBase: string,
) => {
  const hrefWithoutSuffix = removeUrlSuffix(stylesheetHref)

  if (/^(?:https?:)?\/\//i.test(hrefWithoutSuffix)) {
    return
  }

  if (!hrefWithoutSuffix.startsWith('/')) {
    return path.resolve(path.dirname(htmlFile), hrefWithoutSuffix)
  }

  const normalizedBase = normalizeBasePath(publicBase)
  const relativeHref = hrefWithoutSuffix.startsWith(normalizedBase)
    ? hrefWithoutSuffix.slice(normalizedBase.length)
    : hrefWithoutSuffix.replace(/^\/+/, '')

  return path.join(outputDirectory, relativeHref)
}

const extractCriticalThemeCss = (css: string) => {
  const rules = new Set<string>()

  // Keep opinionated DaisyUI/Tailwind theme rule extraction for first release behavior parity.
  for (const match of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const selector = match[1]?.trim()
    const body = match[2]

    if (!selector || !body.includes('color-scheme:') || !body.includes('--color-base-100')) {
      continue
    }

    rules.add(`${selector}{${body}}`)
  }

  return [...rules].join('')
}

const readCriticalThemeCss = async (stylesheetPath: string, stylesheetCache: StylesheetCache) => {
  if (stylesheetCache.has(stylesheetPath)) {
    return stylesheetCache.get(stylesheetPath)
  }

  try {
    const css = await fs.readFile(stylesheetPath, 'utf8')
    const criticalThemeCss = extractCriticalThemeCss(css)
    stylesheetCache.set(stylesheetPath, criticalThemeCss)
    return criticalThemeCss
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      stylesheetCache.set(stylesheetPath, undefined)
      return
    }

    throw error
  }
}

const collectCriticalThemeCss = async (
  html: string,
  htmlFile: string,
  outputDirectory: string,
  publicBase: string,
  stylesheetCache: StylesheetCache,
) => {
  const criticalThemeCss = await Promise.all(
    collectStylesheetHrefs(html).map(async (stylesheetHref) => {
      const stylesheetPath = resolveOutputStylesheetPath(stylesheetHref, htmlFile, outputDirectory, publicBase)

      if (!stylesheetPath) {
        return
      }

      return readCriticalThemeCss(stylesheetPath, stylesheetCache)
    }),
  )

  return [...new Set(criticalThemeCss.filter((css): css is string => Boolean(css)))].join('')
}

const injectCriticalThemeCss = (html: string, css: string) => {
  if (!css || html.includes(CRITICAL_THEME_STYLE_MARKER)) {
    return html
  }

  const styleOpenMatch = html.match(/<style\b[^>]*>/i)

  if (styleOpenMatch?.index === undefined) {
    return html
  }

  const insertIndex = styleOpenMatch.index + styleOpenMatch[0].length
  return `${html.slice(0, insertIndex)}${CRITICAL_THEME_STYLE_MARKER}${css}${html.slice(insertIndex)}`
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

      const outputDirectory = resolveOutputDirectory(currentResolvedConfig, pluginOptions.outputDirectory)
      const htmlFiles = await collectHtmlFiles(outputDirectory)

      if (htmlFiles.length === 0) {
        return
      }

      const beasties = new Beasties({
        ...DEFAULT_BEASTIES_OPTIONS,
        ...pluginOptions.beastiesOptions,
        path: outputDirectory,
        publicPath: currentResolvedConfig.base,
      } as unknown as ConstructorParameters<typeof Beasties>[0])
      const stylesheetCache: StylesheetCache = new Map()

      await Promise.all(
        htmlFiles.map(async (htmlFile) => {
          const html = await fs.readFile(htmlFile, 'utf8')
          const criticalThemeCss = await collectCriticalThemeCss(
            html,
            htmlFile,
            outputDirectory,
            currentResolvedConfig.base,
            stylesheetCache,
          )
          const processedHtml = injectCriticalThemeCss(await beasties.process(html), criticalThemeCss)

          if (processedHtml !== html) {
            await fs.writeFile(htmlFile, processedHtml)
          }
        }),
      )
    },
  }
}

export const viteBeastiesOutputPlugin = viteBeastiesOutput
