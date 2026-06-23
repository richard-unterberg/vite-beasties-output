# vite-beasties-output

A small post-build Vite plugin that runs Beasties against already generated HTML output.

Unlike generic Beasties integrations, this plugin is designed for builds where HTML files already exist in an output directory. It processes those files after bundling and adds a small compatibility layer for DaisyUI/Tailwind theme variables that are required by critical CSS but may not be picked up by Beasties automatically.

## What it does

- Runs only during `build`
- Runs late with `enforce: 'post'`
- Scans generated `.html` files from the configured output directory
- Processes each HTML file with Beasties
- Re-injects critical DaisyUI/Tailwind theme variables when needed
- Writes optimized HTML back to disk

## How it differs from vite-plugin-beasties

`vite-beasties-output` is intentionally opinionated for output-directory post-processing in SSR/SSG style projects. It is not a replacement for a generic in-pipeline Beasties plugin.

## Installation

```sh
pnpm add -D @unterberg/vite-beasties-output
```

## Usage

```ts
import { defineConfig } from 'vite'
import { viteBeastiesOutput } from '@unterberg/vite-beasties-output'

export default defineConfig({
  plugins: [
    viteBeastiesOutput({
      outputDirectory: 'dist/client',
      beastiesOptions: {
        preload: 'swap',
        compress: true,
        logLevel: 'warn',
      },
    }),
  ],
})
```

If `outputDirectory` is omitted, the plugin uses Vite's `build.outDir`.

## Output directory

Point `outputDirectory` at the directory that contains the generated HTML files you want to process. The plugin scans that directory recursively for `.html` files and resolves local linked stylesheets from the same output root.

```txt
dist/client/
├─ index.html
├─ nested/
│  └─ page.html
└─ assets/
   └─ app.css
```

## Options

### `outputDirectory`

The output directory to scan. Relative paths are resolved from Vite's project root. Absolute paths are used as-is.

```ts
viteBeastiesOutput({
  outputDirectory: 'dist/client',
})
```

When omitted, this defaults to Vite's `build.outDir`.

### `beastiesOptions`

Pass any [Beasties option](https://github.com/danielroe/beasties#options) except `path` and `publicPath` (which the plugin controls internally):

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

1. Scans the configured output directory recursively for `.html` files
2. For each HTML file, processes it through Beasties to extract and inline critical CSS
3. Detects DaisyUI/Tailwind-style theme variables (color-scheme, --color-base-100) in referenced stylesheets
4. Re-injects those theme variables with a marker comment so they survive critical CSS extraction
5. Writes the optimized HTML back to disk

## Limitations

- **Output root must match public paths**: Absolute stylesheet URLs are resolved from `outputDirectory`, using Vite's configured `base`.
- **Beasties path control**: Beasties `path` and `publicPath` are controlled by the plugin based on `outputDirectory` and Vite's resolved config.
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
- `outputDirectory` points at the generated HTML output root, or your HTML files are in Vite's `build.outDir`
