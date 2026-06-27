import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { viteBeastiesOutput } from '../dist/index.js'

const fixtureDirectory = path.resolve('test/fixture/vike-output')

const assertUnprocessedFixtureHtml = (sourceHtml) => {
  assert.match(sourceHtml, /href="\/assets\/app\.css"/)
  assert.match(sourceHtml, /class="btn btn-primary"/)
  assert.doesNotMatch(sourceHtml, />\s*Hello\s*</)
  assert.doesNotMatch(sourceHtml, /unterberg\.dev|modulepreload|entry-client-routing/)
}

const assertProcessedHtml = (processedHtml, sourceHtml) => {
  assert.notEqual(processedHtml, sourceHtml)
  assert.match(processedHtml, /--color-base-100/)
  assert.match(processedHtml, /class="btn btn-primary"/)
  assert.match(processedHtml, /class="card bg-base-200 border border-base-300/)
  assert.doesNotMatch(processedHtml, /<html[^>]*\sdata-beasties-container(?:\s|>)/i)
  assert.doesNotMatch(processedHtml, /unterberg\.dev|modulepreload|entry-client-routing/)
  assert.doesNotMatch(processedHtml, /vite-beasties-theme-vars/)
}

const runPlugin = async (pluginOptions, config) => {
  const plugin = viteBeastiesOutput(pluginOptions)

  plugin.configResolved?.(config)
  await plugin.closeBundle.call({})
}

const captureInfoLogs = async (callback) => {
  const originalInfo = console.info
  const logs = []

  console.info = (...messages) => {
    logs.push(messages.join(' '))
  }

  try {
    await callback()
  } finally {
    console.info = originalInfo
  }

  return logs
}

test('processes an explicitly configured output directory', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-output-'))
  const outputDirectory = path.join(temporaryDirectory, 'dist')

  await fs.cp(fixtureDirectory, outputDirectory, { recursive: true })

  const sourceHtml = await fs.readFile(path.join(fixtureDirectory, 'client/index.html'), 'utf8')
  assertUnprocessedFixtureHtml(sourceHtml)
  const config = {
    root: temporaryDirectory,
    base: '/',
    build: {
      outDir: 'dist',
    },
  }

  await runPlugin({ outputDirectory: 'dist/client' }, config)

  const htmlPath = path.join(outputDirectory, 'client/index.html')
  const processedHtml = await fs.readFile(htmlPath, 'utf8')

  assertProcessedHtml(processedHtml, sourceHtml)
})

test('defaults to the Vite build output directory', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-output-'))
  const outputDirectory = path.join(temporaryDirectory, 'dist')

  await fs.cp(path.join(fixtureDirectory, 'client'), outputDirectory, { recursive: true })

  const sourceHtml = await fs.readFile(path.join(fixtureDirectory, 'client/index.html'), 'utf8')
  assertUnprocessedFixtureHtml(sourceHtml)
  const config = {
    root: temporaryDirectory,
    base: '/',
    build: {
      outDir: 'dist',
    },
  }

  await runPlugin(undefined, config)

  const htmlPath = path.join(outputDirectory, 'index.html')
  const processedHtml = await fs.readFile(htmlPath, 'utf8')

  assertProcessedHtml(processedHtml, sourceHtml)
})

test('processes only explicitly included HTML files', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-output-'))
  const outputDirectory = path.join(temporaryDirectory, 'dist')
  const nestedDirectory = path.join(outputDirectory, 'client/nested')

  await fs.cp(fixtureDirectory, outputDirectory, { recursive: true })
  await fs.mkdir(nestedDirectory, { recursive: true })
  await fs.copyFile(path.join(fixtureDirectory, 'client/index.html'), path.join(nestedDirectory, 'page.html'))

  const sourceHtml = await fs.readFile(path.join(fixtureDirectory, 'client/index.html'), 'utf8')
  assertUnprocessedFixtureHtml(sourceHtml)
  const config = {
    root: temporaryDirectory,
    base: '/',
    build: {
      outDir: 'dist',
    },
  }

  await runPlugin({ include: 'dist/client/index.html' }, config)

  const processedHtml = await fs.readFile(path.join(outputDirectory, 'client/index.html'), 'utf8')
  const skippedHtml = await fs.readFile(path.join(nestedDirectory, 'page.html'), 'utf8')

  assertProcessedHtml(processedHtml, sourceHtml)
  assert.equal(skippedHtml, sourceHtml)
})

test('processes HTML files matched by include globs', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-output-'))
  const outputDirectory = path.join(temporaryDirectory, 'dist')
  const nestedDirectory = path.join(outputDirectory, 'client/nested')

  await fs.cp(fixtureDirectory, outputDirectory, { recursive: true })
  await fs.mkdir(nestedDirectory, { recursive: true })
  await fs.copyFile(path.join(fixtureDirectory, 'client/index.html'), path.join(nestedDirectory, 'page.html'))

  const sourceHtml = await fs.readFile(path.join(fixtureDirectory, 'client/index.html'), 'utf8')
  assertUnprocessedFixtureHtml(sourceHtml)
  const config = {
    root: temporaryDirectory,
    base: '/',
    build: {
      outDir: 'dist',
    },
  }

  await runPlugin({ include: 'dist/client/**/*.html' }, config)

  const processedRootHtml = await fs.readFile(path.join(outputDirectory, 'client/index.html'), 'utf8')
  const processedNestedHtml = await fs.readFile(path.join(nestedDirectory, 'page.html'), 'utf8')

  assertProcessedHtml(processedRootHtml, sourceHtml)
  assertProcessedHtml(processedNestedHtml, sourceHtml)
})

test('logs processed HTML count unless Beasties logging is silent', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-output-'))
  const outputDirectory = path.join(temporaryDirectory, 'dist')

  await fs.cp(fixtureDirectory, outputDirectory, { recursive: true })

  const config = {
    root: temporaryDirectory,
    base: '/',
    build: {
      outDir: 'dist',
    },
  }

  const logs = await captureInfoLogs(async () => {
    await runPlugin({ outputDirectory: 'dist/client' }, config)
  })

  assert.deepEqual(logs, ['[vite-beasties-output] Processed 1 HTML file'])
})

test('does not log processed HTML count when Beasties logging is silent', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-output-'))
  const outputDirectory = path.join(temporaryDirectory, 'dist')

  await fs.cp(fixtureDirectory, outputDirectory, { recursive: true })

  const config = {
    root: temporaryDirectory,
    base: '/',
    build: {
      outDir: 'dist',
    },
  }

  const logs = await captureInfoLogs(async () => {
    await runPlugin({ outputDirectory: 'dist/client', beastiesOptions: { logLevel: 'silent' } }, config)
  })

  assert.deepEqual(logs, [])
})

test('removes Beasties container marker from html while preserving custom containers', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-output-'))
  const outputDirectory = path.join(temporaryDirectory, 'dist')

  await fs.cp(path.join(fixtureDirectory, 'client'), outputDirectory, { recursive: true })

  const htmlPath = path.join(outputDirectory, 'index.html')
  const sourceHtml = await fs.readFile(htmlPath, 'utf8')
  await fs.writeFile(
    htmlPath,
    sourceHtml
      .replace('<html lang="en">', '<html lang="en" data-beasties-container>')
      .replace('<div id="root"', '<div data-beasties-container id="root"'),
  )

  const config = {
    root: temporaryDirectory,
    base: '/',
    build: {
      outDir: 'dist',
    },
  }

  await runPlugin(undefined, config)

  const processedHtml = await fs.readFile(htmlPath, 'utf8')

  assert.doesNotMatch(processedHtml, /<html[^>]*\sdata-beasties-container(?:\s|>)/i)
  assert.match(processedHtml, /<div data-beasties-container id="root"/)
})

test('inlines critical CSS from multiple Beasties containers', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-output-'))
  const outputDirectory = path.join(temporaryDirectory, 'dist')
  const assetsDirectory = path.join(outputDirectory, 'assets')

  await fs.mkdir(assetsDirectory, { recursive: true })
  await fs.writeFile(
    path.join(outputDirectory, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <link rel="stylesheet" href="/assets/app.css">
  </head>
  <body>
    <header data-beasties-container="true">
      <nav class="critical-first">
        <ul class="space-x-4">
          <li></li>
          <li></li>
        </ul>
      </nav>
    </header>
    <main data-beasties-container="true">
      <h1 class="critical-second"></h1>
    </main>
  </body>
</html>`,
  )
  await fs.writeFile(
    path.join(assetsDirectory, 'app.css'),
    `.critical-first {
  color: #123456;
}

.critical-second {
  color: #abcdef;
}

:where(.space-x-4 > :not(:last-child)) {
  margin-inline-end: 1rem;
}

.non-critical {
  color: #fedcba;
}
`,
  )

  const config = {
    root: temporaryDirectory,
    base: '/',
    build: {
      outDir: 'dist',
    },
  }

  await runPlugin(undefined, config)

  const processedHtml = await fs.readFile(path.join(outputDirectory, 'index.html'), 'utf8')

  assert.match(processedHtml, /\.critical-first/)
  assert.match(processedHtml, /\.critical-second/)
  assert.match(processedHtml, /\.space-x-4/)
  assert.doesNotMatch(processedHtml, /<body[^>]*\sdata-beasties-container(?:\s|>)/i)
  assert.match(processedHtml, /<header data-beasties-container="true">/)
  assert.match(processedHtml, /<main data-beasties-container="true">/)
})

test('preserves inline body styles by default', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-output-'))
  const outputDirectory = path.join(temporaryDirectory, 'dist')

  await fs.cp(path.join(fixtureDirectory, 'client'), outputDirectory, { recursive: true })

  const htmlPath = path.join(outputDirectory, 'index.html')
  const sourceHtml = await fs.readFile(htmlPath, 'utf8')
  await fs.writeFile(
    htmlPath,
    sourceHtml.replace(
      '<div id="root" class="relative min-h-lvh">',
      '<div id="root" class="relative min-h-lvh"><style>.hydration-owned-style{color:rebeccapurple}</style>',
    ),
  )

  const config = {
    root: temporaryDirectory,
    base: '/',
    build: {
      outDir: 'dist',
    },
  }

  await runPlugin(undefined, config)

  const processedHtml = await fs.readFile(htmlPath, 'utf8')
  const processedBody = processedHtml.match(/<body[\s\S]*<\/body>/i)?.[0] ?? ''

  assert.match(processedHtml, /--color-base-100/)
  assert.match(processedBody, /<style>\.hydration-owned-style\{color:rebeccapurple\}<\/style>/)
})
