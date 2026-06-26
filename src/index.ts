import fs from 'node:fs/promises'
import path from 'node:path'
import Beasties from 'beasties'
import type { Plugin, ResolvedConfig } from 'vite'

const HTML_FILE_EXTENSION = '.html'

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

const resolveOutputDirectory = (config: ResolvedConfig, outputDirectory: string | undefined) => {
  const directory = outputDirectory ?? config.build.outDir

  return path.resolve(config.root, directory)
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

      await Promise.all(
        htmlFiles.map(async (htmlFile) => {
          const html = await fs.readFile(htmlFile, 'utf8')
          const processedHtml = await beasties.process(html)

          if (processedHtml !== html) {
            await fs.writeFile(htmlFile, processedHtml)
          }
        }),
      )
    },
  }
}

export const viteBeastiesOutputPlugin = viteBeastiesOutput
