# vite-beasties-output

A small post-build Vite plugin that runs Beasties against already generated HTML output.

Unlike generic Beasties integrations, this plugin is designed for SSR/SSG-style builds where HTML files already exist in the client output directory. It processes those files after bundling and adds a small compatibility layer for DaisyUI/Tailwind theme variables that are required by critical CSS but may not be picked up by Beasties automatically.

## What it does

- Runs only during `build`
- Runs late with `enforce: 'post'`
- Scans generated `.html` files from client output
- Processes each HTML file with Beasties
- Re-injects critical DaisyUI/Tailwind theme variables when needed
- Writes optimized HTML back to disk

## How it differs from vite-plugin-beasties

`vite-beasties-output` is intentionally opinionated for output-directory post-processing in SSR/SSG style projects (for example, Vike-like output layouts). It is not a replacement for a generic in-pipeline Beasties plugin.

## Installation

```sh
pnpm add -D vite-beasties-output
```

## Usage

```ts
import { defineConfig } from 'vite'
import { viteBeastiesOutput } from 'vite-beasties-output'

export default defineConfig({
  plugins: [
    viteBeastiesOutput({
      beastiesOptions: {
        preload: 'swap',
        compress: true,
        logLevel: 'warn',
      },
    }),
  ],
})
```

## Expected output layout

This plugin currently assumes a Vike-like output layout where the server output directory and client output directory are siblings:

```txt
dist/
├─ client/
│  ├─ index.html
│  └─ assets/
└─ server/
```

## Options

### `beastiesOptions`

Pass any [Beasties option](https://github.com/Mrmiffo/beasties#options) except `path` and `publicPath` (which the plugin controls internally):

```ts
viteBeastiesOutput({
  beastiesOptions: {
    preload: 'swap',        // 'body' | 'media' | 'swap' | 'swap-high' | 'swap-low' | 'js' | 'js-lazy' | false
    compress: true,         // Compress critical CSS
    logLevel: 'warn',       // 'info' | 'warn' | 'error' | 'trace' | 'debug' | 'silent'
    pruneSource: false,     // Do not remove source CSS files
    inlineFonts: false,     // Do not inline @font-face rules
    keyframes: 'critical',  // 'critical' | 'all' | 'none'
  },
})
```

### Defaults

The plugin ships with sensible defaults:

```ts
{
  preload: 'swap',
  pruneSource: false,
  compress: true,
  logLevel: 'warn',
}
```

## How it works

The plugin runs after your Vite build completes. It:

1. Scans the `dist/client` directory for `.html` files
2. For each HTML file, processes it through Beasties to extract and inline critical CSS
3. Detects DaisyUI/Tailwind-style theme variables (color-scheme, --color-base-100) in referenced stylesheets
4. Re-injects those theme variables with a marker comment so they survive critical CSS extraction
5. Writes the optimized HTML back to disk

## Limitations

- **Vike-like output layout only**: The plugin assumes a specific directory structure where server and client outputs are siblings.
- **No configurable paths**: `path` and `publicPath` are always controlled by the plugin based on Vite's resolved config.
- **Local stylesheets only**: The plugin processes only `.css` files found on disk in the output directory. Remote stylesheets are not supported.
- **DaisyUI/Tailwind opinionated**: Theme variable detection is specific to Tailwind/DaisyUI color schemes; other custom theme systems may need adjustment.

## Troubleshooting

### Theme variables not being injected

Ensure your CSS contains both `color-scheme:` and `--color-base-100` in the same rule block:

```css
:root {
  color-scheme: light;
  --color-base-100: #ffffff;
  /* other theme variables */
}
```

### Plugin not running

Verify:
- You're running `pnpm build` (not dev mode)
- Your Vite config has the plugin in the `plugins` array
- Your environment is recognized as `consumer: 'server'` in Vike's plugin context

## Contributing

This plugin is intentionally small and opinionated for a fast first release. If you have suggestions, open an issue on GitHub.
