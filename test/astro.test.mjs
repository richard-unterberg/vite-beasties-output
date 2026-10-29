import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { astroBeastiesOutput } from '@unterberg/vite-beasties-output/astro'
import { build } from 'astro'

const nodeModulesDirectory = fileURLToPath(new URL('../node_modules/', import.meta.url))

const scenarios = [
  { name: 'static output', output: 'dist', processedPages: ['index.html', 'docs/index.html', 'excluded/index.html'] },
  {
    name: 'custom output and base with nested include',
    output: 'website',
    base: '/blog/',
    options: { include: 'website/docs/**/*.html' },
    processedPages: ['docs/index.html'],
  },
  {
    name: 'explicit containers',
    output: 'dist',
    options: { explicitContainersOnly: true },
    processedPages: ['index.html', 'docs/index.html'],
  },
  {
    name: 'prerendered server output',
    output: 'dist/browser',
    server: true,
    processedPages: ['index.html', 'docs/index.html', 'excluded/index.html'],
  },
]

for (const scenario of scenarios) {
  test(`Astro processes HTML after page generation (${scenario.name})`, async (t) => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'astro-beasties-')))
    t.after(() => fs.rm(root, { recursive: true, force: true }))
    await fs.symlink(nodeModulesDirectory, path.join(root, 'node_modules'), 'dir')
    await fs.mkdir(path.join(root, 'src/pages/docs'), { recursive: true })
    await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}')
    await fs.writeFile(path.join(root, 'src/styles.css'), '.critical{color:red}.forced{color:blue}.unused{color:green}')
    for (const page of ['index.astro', 'docs/index.astro', 'excluded.astro']) {
      const cssPath = page.startsWith('docs/') ? '../../styles.css' : '../styles.css'
      await fs.writeFile(
        path.join(root, 'src/pages', page),
        `---
import ${JSON.stringify(cssPath)}
export const prerender = true
---
<html lang="en"><head><title>Fixture</title></head><body>
<main ${page === 'excluded.astro' ? '' : 'data-beasties-container'}><h1 class="critical">Fixture</h1></main>
<style is:inline>.preserved{color:purple}</style>
</body></html>`,
      )
    }

    const integrations = []
    let adapter
    if (scenario.server) {
      const serverEntry = path.join(root, 'server.mjs')
      await fs.writeFile(serverEntry, 'export const handler = () => new Response("fixture")')
      await fs.writeFile(path.join(root, 'src/pages/runtime.astro'), '<p>Runtime response</p>')
      adapter = {
        name: 'fixture-adapter',
        hooks: {
          'astro:config:done': ({ setAdapter }) => {
            setAdapter({
              name: 'fixture-adapter',
              entrypointResolution: 'auto',
              serverEntrypoint: pathToFileURL(serverEntry),
              supportedAstroFeatures: { serverOutput: 'stable' },
            })
          },
        },
      }
    }

    // A preceding hook proves the input is final HTML with external CSS.
    const originalPages = new Map()
    let originalServerEntry
    integrations.push({
      name: 'fixture-before-beasties',
      hooks: {
        'astro:build:done': async ({ dir }) => {
          assert.equal(fileURLToPath(dir), `${path.join(root, scenario.output)}${path.sep}`)
          for (const page of ['index.html', 'docs/index.html', 'excluded/index.html']) {
            const html = await fs.readFile(new URL(page, dir), 'utf8')
            assert.match(html, /<link[^>]+rel="stylesheet"/)
            assert.doesNotMatch(html, /<style[^>]*>[^<]*\.critical/)
            originalPages.set(page, html)
          }
          if (scenario.server) {
            originalServerEntry = await fs.readFile(path.join(root, 'dist/server/entry.mjs'), 'utf8')
          }
        },
      },
    })
    integrations.push(
      astroBeastiesOutput({
        ...scenario.options,
        beastiesOptions: { allowRules: [/\.forced/] },
      }),
      {
        name: 'fixture-after-beasties',
        hooks: {
          'astro:build:done': async ({ dir }) => {
            for (const [page, source] of originalPages) {
              const html = await fs.readFile(new URL(page, dir), 'utf8')
              if (!scenario.processedPages.includes(page)) {
                assert.equal(html, source, `${page} must remain unchanged`)
                continue
              }

              const criticalCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
                .map((match) => match[1])
                .join('')
              assert.match(criticalCss, /\.critical\{color:red\}/)
              assert.match(criticalCss, /\.forced\{color:#00f\}/)
              assert.doesNotMatch(criticalCss, /\.unused/)
              assert.match(html, /<style>\.preserved\{color:purple\}<\/style>/)
              assert.doesNotMatch(html, /<html[^>]*\sdata-beasties-container(?:\s|>)/i)
              if (page !== 'excluded/index.html') {
                assert.match(html, /<main data-beasties-container>/)
              }
              const cssUrl = source.match(/href="([^"]+\.css)"/)?.[1]
              assert.ok(cssUrl)
              assert.ok(cssUrl.startsWith(scenario.base ?? '/'))
              const css = await fs.readFile(new URL(cssUrl.slice((scenario.base ?? '/').length), dir), 'utf8')
              assert.match(css, /\.unused/)
            }
          },
        },
      },
    )

    const logs = []
    const originalInfo = console.info
    console.info = (...messages) => logs.push(messages.join(' '))
    try {
      await build({
        root: pathToFileURL(`${root}${path.sep}`),
        configFile: false,
        logLevel: 'silent',
        cacheDir: './.astro-cache/',
        outDir: scenario.output === 'website' ? './website/' : './dist/',
        base: scenario.base,
        output: scenario.server ? 'server' : 'static',
        adapter,
        build: { inlineStylesheets: 'never', client: './browser' },
        integrations,
      })
    } finally {
      console.info = originalInfo
    }

    assert.deepEqual(logs, [
      `[vite-beasties-output] Processed ${scenario.processedPages.length} HTML ${scenario.processedPages.length === 1 ? 'file' : 'files'}`,
    ])
    if (scenario.server) {
      assert.ok(originalServerEntry)
      assert.equal(await fs.readFile(path.join(root, 'dist/server/entry.mjs'), 'utf8'), originalServerEntry)
      await assert.rejects(fs.access(path.join(root, scenario.output, 'runtime/index.html')), { code: 'ENOENT' })
    }
  })
}
