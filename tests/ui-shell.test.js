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

test('search, browse, and transcript views have responsive presentation styles', async () => {
  const css = await readFile('src/styles.css', 'utf8')
  assert.match(css, /\.search-bar\s*\{/)
  assert.match(css, /\.conversation-row\s*\{/)
  assert.match(css, /\.search-excerpt\s*\{/)
  assert.match(css, /\.transcript-message\s*\{/)
  assert.match(css, /\.is-search-hit/)
})

test('v0.3.3 ships transcript cleanup and the package-open install metadata', async () => {
  const [manifestText, indexHtml, svg, packageText, appSource, worker] = await Promise.all([
    readFile('public/manifest.webmanifest', 'utf8'),
    readFile('index.html', 'utf8'),
    readFile('public/icons/package-open.svg', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('src/app.js', 'utf8'),
    readFile('sw.js', 'utf8'),
  ])
  const manifest = JSON.parse(manifestText)
  const pkg = JSON.parse(packageText)
  assert.equal(pkg.version, '0.3.3')
  assert.match(appSource, /const VERSION = '0\.3\.3'/)
  assert.match(svg, /lucide-package-open/)
  assert.match(indexHtml, /apple-touch-icon/)
  assert.equal(manifest.icons.some(icon => icon.src.includes('archive-512.png')), true)
  assert.match(worker, /archive-shell-v0\.3\.3/)
  assert.match(worker, /src\/search\/indexService\.js/)
  assert.match(worker, /src\/search\/searchIndex\.js/)
  assert.match(worker, /src\/organization\/metadataService\.js/)
})
