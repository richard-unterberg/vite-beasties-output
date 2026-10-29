# vite-beasties-output Agent Context

## Project Overview

**vite-beasties-output** is a small, opinionated Vite post-build plugin that processes generated HTML output through Beasties to extract and inline critical CSS.

**Target users**: Developers building SSR/SSG sites (especially with Vike) who want critical CSS inlining without adopting a generic Beasties pipeline plugin.

**Version**: 0.1.4 (intentionally minimal early release)  
**Node baseline**: >=22  
**Package type**: ESM only  

## Architecture

### Plugin Lifecycle

1. **configResolved**: Stores resolved Vite config for later use
2. **closeBundle / buildApp**: Standalone builds process HTML in `closeBundle`.
   App builds with Vite's `builder` configured skip environment-level closures
   and process HTML in the `buildApp` post hook after Vike prerendering and
   before Vike's CLI finalization. The plugin uses normal plugin ordering and
   the client environment's config (or the builder config if no client exists).
   - Resolves the configured output directory, defaulting to Vite's `build.outDir`
   - Scans the output directory recursively for `.html` files
   - For each HTML file:
     - Processes HTML through Beasties with user-provided options merged with defaults
     - Writes modified HTML back to disk
3. **Astro integration**: The separate `/astro` entry exports
   `astroBeastiesOutput` for Astro's `integrations` array. It processes HTML in
   `astro:build:done`, using the hook's actual client output directory and
   Astro's resolved root and base. Astro generates HTML after the Vite hooks,
   so using the Vite plugin in Astro's `vite.plugins` runs too early.

### Output Layout Assumption

Recommended Vike output path: "dist/client" will result:

```
dist/
├─ client/          ← Plugin scans here for *.html
│  ├─ index.html
│  ├─ [subroutes].html
│  └─ assets/
│     └─ *.css      ← Beasties resolves linked CSS from here
└─ server/
```

## Key Files

### [src/index.ts](src/index.ts)

**Main implementation**. Key exports and constants:

- `viteBeastiesOutput`: Factory function returning the Vite Plugin object
- `viteBeastiesOutputPlugin`: Alias for backward compat (may be removed in v1)
- `ViteBeastiesOutputOptions`: User-facing plugin options interface (`outputDirectory`, `beastiesOptions`)
- `SafeBeastiesOptions`: Curated Beasties options safe for passthrough (excludes path, publicPath, remote, etc.)
- Shared HTML processing, file discovery, and option types live in
  [src/output.ts](src/output.ts). Both framework adapters use this module.

### [src/astro.ts](src/astro.ts)

Astro adapter with type-only Astro imports, built as the separate `/astro`
package export. Astro is an optional peer, so Vite consumers do not need it.

### [test/astro.test.mjs](test/astro.test.mjs)

Real Astro builds verify root and nested static pages, custom output and base,
include filtering, explicit containers, and prerendered server output. They
also verify that processing finishes before subsequent `astro:build:done`
hooks, preserves inline styles and source CSS, and logs one final count.

### [test/smoke.test.mjs](test/smoke.test.mjs)

Node built-in test runner. Single test verifies:
- Fixture HTML is clean (no production noise)
- Local stylesheet is referenced and processed
- Beasties processes HTML (output differs from input)
- No framework-specific theme marker is injected
- Fixture class hooks remain preserved

### [test/build.test.mjs](test/build.test.mjs)

Real Vite builds verify that app builds process root and nested HTML emitted
after client/server bundles close, preserve include filtering, use the client
output directory by default, finish before app finalization, and log one final count. A standalone Vite HTML
build verifies the `closeBundle` path.

### [test/fixture/vike-output/](test/fixture/vike-output/)

Minimal but realistic test fixture:
- `client/index.html`: Clean class-only DOM with no text content (points to local CSS)
- `client/assets/app.css`: Theme variables + utility/component classes
- `server/`: Empty directory (part of assumed layout)

### [package.json](package.json)

**Exportable npm package** with:
- ESM-only entry point: `dist/index.js`
- TypeScript declarations: `dist/index.d.ts`
- Build: `tsup src/index.ts src/astro.ts --format esm --dts --clean --target node18`
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
✅ Respects user Beasties options (preload, compress, logLevel, etc.)  
✅ Recursive HTML file discovery (handles nested routes)  

### Intentional Limitations (First Release)

❌ No `path` or `publicPath` configuration (plugin owns these)  
❌ No remote stylesheet fetching  
❌ No framework-specific CSS parsing or rule preservation  
❌ Not a replacement for generic `vite-plugin-beasties`  

### Known Constraints

- **Output directory required for Vike**: Vike SSR/prerender builds usually need `outputDirectory: 'dist/client'`
- **Beasties-owned rule selection**: Use Beasties `allowRules` or `/* beasties:include */` comments for explicit CSS inclusion

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
3. Merge user options into Beasties constructor
4. Update README with new option docs

### Supporting Different Output Layouts

To add layout flexibility:
- Accept `outputLayout` or similar in options
- Map layout names to path resolution strategies
- Update Vike integration docs

## Debugging Tips

- **Plugin not running**: Verify Vite is running a production build and the plugin is in the `plugins` array
- **No HTML processed**: Check `outputDirectory` points at the directory containing generated `.html` files
- **Expected CSS not inlined**: Use Beasties `allowRules` or CSS include comments for rules Beasties cannot infer from HTML

## Notes for AI Agents

- Prefer minimal, opinionated solutions over configurability (follow v0.1.0 philosophy)
- Do not add framework-specific CSS parsing or layout resolvers without strong real-world evidence
- Keep Beasties option passthrough simple; don't try to preset values the user might want to override
- Test changes against the fixture to ensure class names and expected critical CSS remain visible
- Use Node 22+ features freely (no polyfills needed)
