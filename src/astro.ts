import { fileURLToPath } from 'node:url'
import type { AstroConfig, AstroIntegration } from 'astro'
import { processHtmlOutput, type ViteBeastiesOutputOptions as AstroBeastiesOutputOptions } from './output'

export type { SafeBeastiesOptions, ViteBeastiesOutputOptions as AstroBeastiesOutputOptions } from './output'

export const astroBeastiesOutput = (pluginOptions: AstroBeastiesOutputOptions = {}): AstroIntegration => {
  let resolvedConfig: AstroConfig

  return {
    name: 'astro-beasties-output',
    hooks: {
      'astro:config:done': ({ config }) => {
        resolvedConfig = config
      },
      'astro:build:done': async ({ dir }) => {
        const outputDirectory = pluginOptions.outputDirectory ?? fileURLToPath(dir)

        await processHtmlOutput(
          {
            root: fileURLToPath(resolvedConfig.root),
            base: resolvedConfig.base,
            build: { outDir: fileURLToPath(dir) },
          },
          { ...pluginOptions, outputDirectory },
        )
      },
    },
  }
}
