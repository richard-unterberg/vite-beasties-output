import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { viteBeastiesOutput } from '../dist/index.js'

test('processes generated client HTML output and injects critical theme CSS', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-beasties-output-'))
  const fixtureDirectory = path.resolve('test/fixture/vike-output')
  const outputDirectory = path.join(temporaryDirectory, 'dist')

  await fs.cp(fixtureDirectory, outputDirectory, { recursive: true })

  const sourceHtml = await fs.readFile(path.join(fixtureDirectory, 'client/index.html'), 'utf8')
  assert.match(sourceHtml, /href="\/assets\/app\.css"/)
  assert.match(sourceHtml, /class="btn btn-primary"/)
  assert.doesNotMatch(sourceHtml, />\s*Hello\s*</)
  assert.doesNotMatch(sourceHtml, /unterberg\.dev|modulepreload|entry-client-routing/)

  const plugin = viteBeastiesOutput()
  const config = {
    root: temporaryDirectory,
    base: '/',
    build: {
      outDir: 'dist/server',
    },
  }

  plugin.configResolved?.(config)

  await plugin.closeBundle.call({
    environment: {
      config: {
        consumer: 'server',
        build: {
          outDir: 'dist/server',
        },
      },
    },
  })

  const htmlPath = path.join(outputDirectory, 'client/index.html')
  const processedHtml = await fs.readFile(htmlPath, 'utf8')

  assert.notEqual(processedHtml, sourceHtml)
  assert.match(processedHtml, /nivel-critical-theme-vars/)
  assert.match(processedHtml, /--color-base-100/)
  assert.match(processedHtml, /class="btn btn-primary"/)
  assert.match(processedHtml, /class="card bg-base-200 border border-base-300/)
  assert.doesNotMatch(processedHtml, /unterberg\.dev|modulepreload|entry-client-routing/)
  assert.equal(processedHtml.match(/nivel-critical-theme-vars/g)?.length, 1)
})
