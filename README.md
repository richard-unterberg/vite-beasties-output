# vite-beasties-output

Post-build Vite plugin that runs [Beasties](https://github.com/danielroe/beasties) against already generated HTML output.

Small post-build adapter around Beasties. It focuses on processing emitted HTML files on disk rather than participating in Vite’s in-pipeline HTML transformation.

That makes it suitable for SSG, prerendered, or otherwise statically emitted HTML output. It does not modify runtime SSR responses directly. For SSR-only applications, this plugin only has an effect if the build produces actual `.html` files that can be processed after the build.

## What it does

* Runs only during `build`
* Runs late with `enforce: 'post'`
* Scans generated `.html` files from the configured output directory, or processes explicit `include` paths/globs
* Processes each HTML file with Beasties
* Writes optimized HTML back to disk
* Logs how many HTML files were processed, unless Beasties logging is `silent`

Beasties may add `data-beasties-container` to the top-level `<html>` tag while processing. The plugin removes that marker from final output to avoid leaking optimization-only attributes into hydrated documents. Custom Beasties containers inside the document are preserved.

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
    }),
  ],
})
```

For Vike prerender builds, `dist/client` is usually the relevant output directory because prerendered HTML files are written there.

You can also process specific generated HTML files instead of scanning the whole output directory:

```ts
viteBeastiesOutput({
  include: ['dist/client/index.html', 'dist/client/docs/**/*.html'],
})
```

For SSR-only Vike builds without prerendering, the server output usually contains runtime modules such as `page_*.mjs` files instead of final `.html` files. This plugin does not modify those runtime SSR modules and therefore cannot inline critical CSS into SSR responses by itself.

Vike full builds can invoke Vite more than once. In that case, you may see an early `Processed 0 HTML files` message during the client build before Vike has prerendered any HTML, followed by a later message after the prerendered HTML files exist.

If `outputDirectory` is omitted, the plugin uses Vite's `build.outDir`.

## Output directory

Point `outputDirectory` at the directory that contains the generated HTML files you want to process. The plugin scans that directory recursively for `.html` files and lets Beasties resolve linked stylesheets from that output root.

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

In Vike prerender projects, this is often not enough because the build may involve separate client and server output directories. In that case, point `outputDirectory` directly at the directory containing the generated `.html` files, usually `dist/client`.

### `include`

Specific HTML files or glob patterns to process instead of scanning the output directory. Relative paths are resolved from Vite's project root. Supported glob tokens are `*`, `**`, and `?`.

```ts
viteBeastiesOutput({
  include: 'dist/client/index.html',
})
```

```ts
viteBeastiesOutput({
  include: ['dist/client/index.html', 'dist/client/docs/**/*.html'],
})
```

When `include` is set, the plugin only processes matched `.html` files. If `outputDirectory` is also set, Beasties resolves linked CSS from that directory. If `outputDirectory` is omitted, the plugin infers the Beasties root from the include path or glob base.

### `explicitContainersOnly`

When `true`, the plugin only processes HTML files that already contain `data-beasties-container`. Files without an explicit container are left unchanged, which prevents Beasties from falling back to its default whole-document critical CSS pass.

```ts
viteBeastiesOutput({
  explicitContainersOnly: true,
})
```

This is useful when you want critical CSS extraction to be opt-in per page or per region. The default is `false`, matching Beasties' normal behavior.

### `beastiesOptions`

Pass supported [Beasties options](https://github.com/danielroe/beasties#options). The plugin controls `path` and `publicPath` internally based on `outputDirectory` and Vite's resolved `base`.

```ts
viteBeastiesOutput({
  beastiesOptions: {
    preload: 'swap',        // 'body' | 'media' | 'swap' | 'swap-high' | 'swap-low' | 'js' | 'js-lazy' | false
    compress: true,         // Compress critical CSS
    logLevel: 'warn',       // 'info' | 'warn' | 'error' | 'trace' | 'debug' | 'silent'
    pruneSource: false,     // Do not remove source CSS files
    reduceInlineStyles: false, // Preserve inline <style> tags rendered by the app/framework
    allowRules: [],         // Always include matching selectors in critical CSS
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
  reduceInlineStyles: false,
  compress: true,
  logLevel: 'warn',
}
```

## DaisyUI and theme variables

The plugin does not automatically parse or re-inject DaisyUI/Tailwind theme rules. Beasties runs after Tailwind and DaisyUI have generated the final CSS, so comments placed around `@plugin 'daisyui/theme'`, `@theme`, or `@custom-variant` directives may be removed before Beasties can see them.

For DaisyUI theme variables, prefer Beasties' native `allowRules` option:

```ts
viteBeastiesOutput({
  outputDirectory: 'dist/client',
  beastiesOptions: {
    allowRules: [
      /data-theme=.*dark/,
      /data-theme=.*light/,
      /^:root:has\(input\.theme-controller/,
      /^:where\(:root\)$/,
    ],
  },
})
```

Beasties include comments are still useful for plain CSS rules, but only when those comments survive into the built CSS file that Beasties processes:

```css
/* beasties:include */
.always-critical {
  color: currentColor;
}
```

## How it differs from vite-plugin-beasties

`@unterberg/vite-beasties-output` is not intended to replace the official [`vite-plugin-beasties`](https://www.npmjs.com/package/vite-plugin-beasties).

Use `vite-plugin-beasties` for regular Vite projects where HTML is processed through Vite’s `transformIndexHtml` hook. Use `@unterberg/vite-beasties-output` when your final HTML files already exist in an output directory after the build, for example in SSG or prerender setups.

This plugin does not inject critical CSS into runtime SSR responses. It only processes `.html` files that already exist on disk.

| Feature                        | `vite-plugin-beasties`                                                                              | `@unterberg/vite-beasties-output`                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Main purpose                   | Generic Vite integration for Beasties                                                               | Post-build processing for already emitted HTML files                  |
| Best suited for                | Standard Vite apps using Vite’s HTML pipeline                                                       | SSG, prerendered, or statically emitted HTML output                   |
| Build hook                     | `transformIndexHtml`                                                                                | `closeBundle`                                                         |
| When it runs                   | During Vite’s HTML transformation                                                                   | After the build output has been written                               |
| HTML source                    | HTML passed through Vite’s HTML transform pipeline                                                  | `.html` files found in the configured output directory                |
| Output handling                | Returns transformed HTML to Vite                                                                    | Writes optimized HTML files back to disk                              |
| Output directory control       | Uses Vite’s `build.outDir` internally                                                               | Explicit `outputDirectory` option                                     |
| Runtime SSR support            | Can work only if SSR HTML passes through Vite’s HTML transform flow                                 | Not supported directly; runtime SSR responses are not modified        |
| Vike prerender compatibility   | May not process final prerendered HTML if it is emitted outside the normal Vite HTML transform flow | Designed for this case                                                |
| Vike SSR-only compatibility    | Not the primary target                                                                              | Not supported unless `.html` files are emitted to disk                |
| Beasties `path` / `publicPath` | Controlled internally from Vite config                                                              | Controlled internally from `outputDirectory` and Vite `base`          |
| CSS pruning default            | Enabled by default in the plugin implementation                                                     | Disabled by default                                                   |
| Intended relationship          | Official generic Vite plugin                                                                        | Narrow output-directory adapter                                       |
| Recommended use                | Use this first for regular Vite HTML builds                                                         | Use only when final HTML exists after build and needs post-processing |

## Runtime SSR limitation

This plugin is intentionally file-based. It scans an output directory for `.html` files and processes those files with Beasties after the build has finished.

It does not hook into a framework’s runtime rendering pipeline. If an application renders HTML dynamically at request time, there is no final HTML file for this plugin to process.

Supporting runtime SSR critical CSS would require integrating Beasties, or precomputed critical CSS, directly into the server rendering flow. That is outside the scope of this plugin.

## How it works

The plugin runs after your Vite build completes. It:

1. Finds HTML files from `include`, or scans the configured output directory recursively for `.html` files
2. For each HTML file, processes it through Beasties to extract and inline critical CSS, unless `explicitContainersOnly` is enabled and the file has no `data-beasties-container`
3. Writes the optimized HTML back to disk
4. Logs the number of HTML files processed when `beastiesOptions.logLevel` is not `silent`

## Limitations

* **Static HTML only**: The plugin only processes `.html` files that exist on disk after the build.
* **No direct runtime SSR injection**: SSR responses rendered at request time are not modified.
* **Output root must match public paths**: Absolute stylesheet URLs are resolved from `outputDirectory`, or from the inferred `include` base when `outputDirectory` is omitted, using Vite's configured `base`.
* **Beasties path control**: Beasties `path` and `publicPath` are controlled by the plugin based on `outputDirectory` and Vite's resolved config.
* **Explicit container mode**: Set `explicitContainersOnly: true` when unmarked HTML should be skipped instead of letting Beasties evaluate the whole document.
* **Inline style preservation**: Existing inline `<style>` tags are preserved by default to avoid mutating framework-rendered HTML before hydration. Set `beastiesOptions.reduceInlineStyles: true` if you explicitly want Beasties to process and merge inline styles.
* **Multiple Beasties containers**: Beasties evaluates only the first `data-beasties-container` it finds. When multiple containers are present, the plugin temporarily promotes `<body>` as the processing container so all marked critical regions can contribute CSS, then removes that plugin-added body marker from final HTML.
* **Beasties owns CSS selection**: The plugin does not add extra CSS parsing or framework-specific rule preservation. Use Beasties options such as `allowRules` or CSS comments like `/* beasties:include */` when a project needs explicit rule inclusion.

## Troubleshooting

### Expected rules are missing from critical CSS

Use Beasties' native include mechanisms for rules that cannot be discovered from the generated HTML. For DaisyUI or theme variables, see [DaisyUI and theme variables](#daisyui-and-theme-variables).

If you use multiple `data-beasties-container` regions, make sure you are on a plugin version that includes multiple-container normalization. Beasties itself only evaluates the first container.

### Plugin not running

Verify:

* You're running `pnpm build` or another production build command
* Your Vite config has the plugin in the `plugins` array
* `outputDirectory` points at the generated HTML output root
* Your build actually emits `.html` files

For Vike prerender builds, an early `Processed 0 HTML files` log can be normal because Vike writes prerendered HTML after the first Vite build phase. Check the final log message and the generated `dist/client/**/*.html` files.

### Processed 0 HTML files

This usually means the configured output directory does not contain generated `.html` files.

For prerendered or SSG builds, check where the framework writes its final HTML output and point `outputDirectory` there.

For runtime SSR-only builds, this is expected if the build only emits server modules such as `.mjs` files. Runtime SSR responses are not processed by this plugin.

## Why critical CSS matters

Static and prerendered applications can produce clean, route-specific HTML output that is ready to render immediately. Critical CSS keeps that advantage intact by inlining only the styles needed for the initial viewport, allowing the browser to paint meaningful content before loading the full stylesheet.

This reduces render-blocking CSS, improves perceived performance, and helps keep fast static output truly fast.
