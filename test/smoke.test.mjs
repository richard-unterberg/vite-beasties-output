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
  assert.doesNotMatch(processedHtml, /unterberg\.dev|modulepreload|entry-client-routing/)
  assert.doesNotMatch(processedHtml, /vite-beasties-theme-vars/)
}

const runPlugin = async (pluginOptions, config) => {
  const plugin = viteBeastiesOutput(pluginOptions)

  plugin.configResolved?.(config)
  await plugin.closeBundle.call({})
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
