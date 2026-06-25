# vite-beasties-output Agent Context

## Project Overview

**vite-beasties-output** is a small, opinionated Vite post-build plugin that processes generated HTML output through Beasties to extract and inline critical CSS, with special handling for DaisyUI/Tailwind theme variables.

**Target users**: Developers building SSR/SSG sites (especially with Vike) who want critical CSS inlining without adopting a generic Beasties pipeline plugin.

**Version**: 0.1.0 (intentionally minimal first release)  
**Node baseline**: >=22  
**Package type**: ESM only  

## Architecture

### Plugin Lifecycle

1. **configResolved**: Stores resolved Vite config for later use
2. **closeBundle**: Runs after all assets are built (Vite's post-build hook)
   - Checks environment context (must be server consumer in Vike)
   - Scans `dist/client` recursively for `.html` files
   - For each HTML file:
     - Reads stylesheet hrefs and attempts to resolve local CSS files
     - Extracts critical DaisyUI/Tailwind theme rules (color-scheme + --color-base-100)
     - Processes HTML through Beasties with user-provided options merged with defaults
     - Re-injects theme rules if they exist, prefixed with marker comment
     - Writes modified HTML back to disk

### Output Layout Assumption

Output path: "dist/client" will result:

```
dist/
├─ client/          ← Plugin scans here for *.html
│  ├─ index.html
│  ├─ [subroutes].html
│  └─ assets/
│     └─ *.css      ← Plugin reads referenced CSS from here
└─ server/
```

## Key Files

### [src/index.ts](src/index.ts)

**Main implementation**. Key exports and constants:

- `viteBeastiesOutput`: Factory function returning the Vite Plugin object
- `viteBeastiesOutputPlugin`: Alias for backward compat (may be removed in v1)
- `ViteBeastiesOutputOptions`: User-facing plugin options interface (currently only `beastiesOptions`)
- `SafeBeastiesOptions`: Curated Beasties options safe for passthrough (excludes path, publicPath, remote, etc.)
- `CRITICAL_THEME_STYLE_MARKER`: `/* vite-beasties-theme-vars */` comment used to mark injected theme rules
- Helper functions: `collectHtmlFiles`, `collectStylesheetHrefs`, `extractCriticalThemeCss`, `injectCriticalThemeCss`

### [test/smoke.test.mjs](test/smoke.test.mjs)

Node built-in test runner. Single test verifies:
- Fixture HTML is clean (no production noise)
- Local stylesheet is referenced and processed
- Beasties processes HTML (output differs from input)
- Theme marker is injected exactly once
- DaisyUI/Tailwind class hooks remain preserved

### [test/fixture/vike-output/](test/fixture/vike-output/)

Minimal but realistic test fixture:
- `client/index.html`: Clean class-only DOM with no text content (points to local CSS)
- `client/assets/app.css`: Theme variables (color-scheme, --color-base-100) + utility/component classes
- `server/`: Empty directory (part of assumed layout)

### [package.json](package.json)

**Exportable npm package** with:
- ESM-only entry point: `dist/index.js`
- TypeScript declarations: `dist/index.d.ts`
- Build: `tsup src/index.ts --format esm --dts --clean --target node22`
- Runtime dep: `beasties` (latest)
- Peer dep: `vite` (>=6)
- Dev tools: `@biomejs/biome`, `knip`, `lefthook`, `typescript`

### [README.md](README.md)

User-facing documentation covering installation, usage, options, limitations, and troubleshooting.

### [.nvmrc](.nvmrc)

Specifies Node 22 for project tools.

### [tsconfig.json](tsconfig.json)

TypeScript config for library package:
- Target: ES2022
- Module: ESNext
- `moduleResolution: Bundler` (tsup-friendly)
- `noEmit: true` (tsup handles emit)
- Strict mode enabled

### [biome.json](biome.json)

Code formatter and linter config. Enforces:
- 2-space indent
- No semicolons
- Single quotes
- Tailwind CSS parser enabled
- Recommended rules with some customization

### [knip.json](knip.json)

Dead-code/unused-export detector:
- Ignores `critical_legacy.ts` (historical reference)
- Excludes duplicate-export warnings (needed for legacy alias)

### [lefthook.yml](lefthook.yml)

Git pre-commit hooks (managed by pnpm prepare).

## Feature Set & Constraints

### What It Does

✅ Runs post-build, finds all HTML in client output  
✅ Processes each HTML through Beasties for critical CSS extraction  
✅ Re-injects DaisyUI/Tailwind theme variables (color-scheme, --color-base-100)  
✅ Respects user Beasties options (preload, compress, logLevel, etc.)  
✅ Stores theme CSS in local cache to avoid re-reading files  
✅ Recursive HTML file discovery (handles nested routes)  

### Intentional Limitations (First Release)

❌ No `path` or `publicPath` configuration (plugin owns these)  
❌ No remote stylesheet fetching  
❌ No additional stylesheet resolution beyond local file paths  
❌ No custom theme rule patterns (hardcoded to DaisyUI/Tailwind)  
❌ Not a replacement for generic `vite-plugin-beasties`  

### Known Constraints

- **Vike-specific layout**: Only works with server/client sibling directories
- **Environment check**: Plugin returns early unless `environment.config.consumer === 'server'` (Vike-only hook)
- **Theme detection**: Requires both `color-scheme:` and `--color-base-100` in the same CSS rule to extract
- **Marker uniqueness**: Assumes only one theme marker per HTML file; multiple markers would not be re-injected

## Development Workflow

### Build and Test

```bash
pnpm install                    # Install deps
pnpm build                      # tsup → dist/
pnpm test                       # Build + node --test
pnpm run verify                 # knip + format + lint + typecheck + test
```

### Validation Before Publish

```bash
pnpm run verify                 # Full check suite
pnpm pack --dry-run             # Simulate npm package
npm publish --access public     # Publish (when ready)
```

### Code Quality

- **Format**: `pnpm format` (Biome)
- **Lint**: `pnpm lint` (Biome)
- **Type**: `pnpm typecheck` (TypeScript)
- **Unused**: `pnpm knip` (dead-code detection)

## Extension Points

### Adding New User Options

1. Add field to `SafeBeastiesOptions` if exposing a Beasties option
2. Update `ViteBeastiesOutputOptions` if adding a top-level plugin option
3. Merge user options into Beasties constructor (see lines 255–260 in src/index.ts)
4. Update README with new option docs

### Customizing Theme Variable Detection

Currently hardcoded in `extractCriticalThemeCss()` (lines 148–164):

```ts
if (!selector || !body.includes('color-scheme:') || !body.includes('--color-base-100')) {
  continue
}
```

To support custom theme patterns:
- Accept a regex or pattern function in `SafeBeastiesOptions`
- Pass it to `extractCriticalThemeCss()` instead of hardcoded check
- Update tests and README

### Supporting Different Output Layouts

Currently hardcoded path resolution in `closeBundle()` (lines 246–248):

```ts
const serverOutDir = environment?.config?.build?.outDir ?? currentResolvedConfig.build.outDir
const serverOutputDirectory = path.resolve(currentResolvedConfig.root, serverOutDir)
const outputDirectory = path.join(path.dirname(serverOutputDirectory), 'client')
```

To add layout flexibility:
- Accept `outputLayout` or similar in options
- Map layout names to path resolution strategies
- Update Vike integration docs

## Debugging Tips

- **Plugin not running**: Check `environment.config.consumer` is 'server' in Vike context
- **Theme rules not extracted**: Verify CSS has both `color-scheme:` and `--color-base-100` in same rule
- **Stylesheet not found**: Check href in HTML matches actual file path in dist/client
- **Marker appearing multiple times**: Indicates either closeBundle ran twice or pre-existing marker in HTML

## Notes for AI Agents

- Prefer minimal, opinionated solutions over configurability (follow v0.1.0 philosophy)
- Do not add configurable theme patterns or layout resolvers without strong real-world evidence
- Keep Beasties option passthrough simple; don't try to preset values the user might want to override
- When expanding, consider the DaisyUI/Tailwind ecosystem (btn, card, base-* color naming)
- Test changes against the fixture to ensure class names and theme variables remain visible
- Use Node 22+ features freely (no polyfills needed)
- Keep the marker comment stable (`vite-beasties-theme-vars`); it's part of the contract
