import type { Plugin, ResolvedConfig } from 'vite'
import { processHtmlOutput, type ViteBeastiesOutputOptions } from './output'

export type { SafeBeastiesOptions, ViteBeastiesOutputOptions } from './output'

export const viteBeastiesOutput = (pluginOptions: ViteBeastiesOutputOptions = {}): Plugin => {
  let resolvedConfig: ResolvedConfig | undefined

  return {
    name: 'vite-beasties-output',
    apply: 'build',
    configResolved: (config) => {
      resolvedConfig = config
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        // App builds emit HTML after the individual environment bundles have closed.
        if (!resolvedConfig || resolvedConfig.builder) {
          return
        }

        await processHtmlOutput(resolvedConfig, pluginOptions)
      },
    },
    buildApp: {
      order: 'post',
      async handler(builder) {
        if (!builder.config.builder) {
          return
        }

        // Use normal plugin ordering: Vike prerenders in an enforce:'pre' plugin
        // and can force-exit the CLI in an enforce:'post' plugin.
        const clientConfig = builder.environments.client?.config ?? builder.config
        await processHtmlOutput(clientConfig, pluginOptions)
      },
    },
  }
}

export const viteBeastiesOutputPlugin = viteBeastiesOutput
