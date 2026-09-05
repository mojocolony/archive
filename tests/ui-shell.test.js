import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('PWA shell exposes Archive navigation and install metadata', async () => {
  const html = await readFile('index.html', 'utf8')
  assert.match(html, /<title>Archive<\/title>/)
  assert.match(html, /rel="manifest" href="\.\/public\/manifest\.webmanifest"/)
  assert.match(html, /id="app"/)
  assert.match(html, /src="\.\/src\/app\.js"/)
})

test('manifest defines a standalone Archive PWA with local icons', async () => {
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'))
  assert.equal(manifest.name, 'Archive')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.icons.some(icon => icon.sizes === '192x192'), true)
  assert.equal(manifest.icons.some(icon => icon.sizes === '512x512'), true)
})
