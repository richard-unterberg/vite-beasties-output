import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build, createBuilder } from 'vite'

import { viteBeastiesOutput } from '../dist/index.js'

const fixtureDirectory = fileURLToPath(new URL('./fixture/vike-output/client/', import.meta.url))
const pluginUrl = new URL('../dist/index.js', import.meta.url).href

for (const explicitPaths of [false, true]) {
  test(`processes prerendered HTML after all environments close (${explicitPaths ? 'explicit paths' : 'client outDir'})`, async (t) => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-app-')))
    t.after(() => fs.rm(root, { recursive: true, force: true }))
    await fs.writeFile(path.join(root, 'entry.js'), 'export const value = 1')
    // A config file makes Vite create separate plugin instances for each environment.
    await fs.writeFile(
      path.join(root, 'vite.config.mjs'),
      `import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { viteBeastiesOutput } from ${JSON.stringify(pluginUrl)}

const fixture = ${JSON.stringify(fixtureDirectory)}
export default {
  logLevel: 'silent',
  publicDir: false,
  environments: {
    client: { build: { outDir: 'dist/client', rollupOptions: { input: 'entry.js' } } },
    ssr: { build: { outDir: 'dist/server', ssr: 'entry.js' } },
  },
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.client)
      await builder.build(builder.environments.ssr)
    },
  },
  plugins: [
    {
      name: 'fixture-prerender',
      enforce: 'pre',
      buildApp: {
        order: 'post',
        async handler(builder) {
          assert.ok(builder.environments.client.isBuilt)
          assert.ok(builder.environments.ssr.isBuilt)
          const output = path.join(builder.config.root, 'dist/client')
          await fs.cp(fixture, output, { recursive: true })
          await fs.mkdir(path.join(output, 'getting-started'), { recursive: true })
          await fs.copyFile(path.join(output, 'index.html'), path.join(output, 'getting-started/index.html'))
          await fs.copyFile(path.join(output, 'index.html'), path.join(output, 'excluded.html'))
        },
      },
    },
    {
      name: 'fixture-finalize',
      enforce: 'post',
      buildApp: {
        order: 'post',
        async handler(builder) {
          // Vike's CLI can exit here: HTML must already be processed.
          const html = await fs.readFile(path.join(builder.config.root, 'dist/client/index.html'), 'utf8')
          assert.ok(html.includes('<style>'), 'critical CSS must exist before app finalization')
        },
      },
    },
    viteBeastiesOutput(${JSON.stringify(explicitPaths ? { outputDirectory: 'dist/client', include: ['dist/client/index.html', 'dist/client/getting-started/**/*.html'] } : {})}),
  ],
}
`,
    )

    const logs = []
    const originalInfo = console.info
    console.info = (...messages) => logs.push(messages.join(' '))
    try {
      const builder = await createBuilder({ root, configLoader: 'native' })
      await builder.buildApp()
    } finally {
      console.info = originalInfo
    }

    for (const page of ['index.html', 'getting-started/index.html']) {
      const html = await fs.readFile(path.join(root, 'dist/client', page), 'utf8')
      assert.match(html, /<style>[\s\S]*\.btn-primary/)
      assert.match(html, /--color-base-100/)
      assert.doesNotMatch(html, /<html[^>]*\sdata-beasties-container(?:\s|>)/i)
    }
    const excludedHtml = await fs.readFile(path.join(root, 'dist/client/excluded.html'), 'utf8')
    if (explicitPaths) {
      assert.equal(excludedHtml, await fs.readFile(path.join(fixtureDirectory, 'index.html'), 'utf8'))
    } else {
      assert.match(excludedHtml, /<style>[\s\S]*\.btn-primary/)
    }
    assert.deepEqual(logs, [`[vite-beasties-output] Processed ${explicitPaths ? 2 : 3} HTML files`])
  })
}

test('processes HTML in a standalone Vite build', async (t) => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-standalone-')))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.cp(fixtureDirectory, root, { recursive: true })

  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [viteBeastiesOutput({ beastiesOptions: { logLevel: 'silent' } })],
  })

  const html = await fs.readFile(path.join(root, 'dist/index.html'), 'utf8')
  assert.match(html, /<style>[\s\S]*\.btn-primary/)
})
