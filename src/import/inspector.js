import { summarizeJsonPrefix } from './jsonShape.js'
import { summarizeFirstValueSchema } from './deepJsonShape.js'
import { readEntryTextPrefix, readZipDirectory } from './zipDirectory.js'

const DEFAULT_JSON_PREFIX_BYTES = 2 * 1024 * 1024

function categoryForPath(path) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.csv')) return 'csv'
  if (lower.endsWith('/')) return 'directory'
  return 'asset'
}

function extensionForPath(path) {
  const name = path.split('/').at(-1) ?? ''
  const index = name.lastIndexOf('.')
  if (index <= 0 || index === name.length - 1) return '(none)'
  return name.slice(index).toLowerCase()
}

export async function inspectChatGptExport(file, options = {}) {
  const now = options.now ?? (() => new Date().toISOString())
  const jsonPrefixBytes = options.jsonPrefixBytes ?? DEFAULT_JSON_PREFIX_BYTES
  const onProgress = options.onProgress ?? (() => {})

  onProgress({ stage: 'directory', completed: 0, total: null })
  const directory = await readZipDirectory(file)
  const entries = []

  for (let index = 0; index < directory.length; index += 1) {
    const entry = directory[index]
    const category = categoryForPath(entry.path)
    let jsonShape = null
    let deepSchema = null
    let inspectionError = null

    // Only inspect top-level JSON. Nested JSON may be a user attachment.
    if (category === 'json' && !entry.path.includes('/')) {
      try {
        const prefix = await readEntryTextPrefix(file, entry, jsonPrefixBytes)
        jsonShape = summarizeJsonPrefix(prefix)
        deepSchema = summarizeFirstValueSchema(prefix, { maxDepth: 8 })
      } catch (error) {
        inspectionError = error instanceof Error ? error.message : String(error)
      }
    }

    entries.push({
      path: entry.path,
      category,
      compressedSize: entry.compressedSize,
      originalSize: entry.originalSize,
      compressionMethod: entry.compressionMethod,
      encrypted: entry.encrypted,
      jsonShape,
      deepSchema,
      inspectionError,
    })

    onProgress({ stage: 'entries', completed: index + 1, total: directory.length })
  }

  return {
    inspectionVersion: 2,
    sourceFileName: file.name || 'export.zip',
    sourceFileSize: file.size,
    inspectedAt: now(),
    entryCount: entries.length,
    entries,
  }
}

export function sanitizeInspectionReport(report) {
  const structuralEntries = report.entries
    .filter(
      entry =>
        !entry.path.includes('/') &&
        ['json', 'html', 'csv'].includes(entry.category),
    )
    .map(entry => ({
      path: entry.path,
      category: entry.category,
      compressedSize: entry.compressedSize,
      originalSize: entry.originalSize,
      compressionMethod: entry.compressionMethod,
      encrypted: entry.encrypted,
      jsonShape:
        entry.deepSchema?.schema?.dynamicMap === true
          ? { ...entry.jsonShape, topLevelKeys: ['<dynamic-key>'] }
          : entry.jsonShape,
      deepSchema: entry.deepSchema,
      inspectionError: entry.inspectionError,
    }))

  const assets = new Map()
  for (const entry of report.entries) {
    if (entry.category === 'directory') continue
    if (structuralEntries.some(structural => structural.path === entry.path)) continue

    const extension = extensionForPath(entry.path)
    const current = assets.get(extension) ?? {
      extension,
      count: 0,
      totalOriginalBytes: 0,
    }
    current.count += 1
    current.totalOriginalBytes += entry.originalSize ?? 0
    assets.set(extension, current)
  }

  return {
    inspectionVersion: report.inspectionVersion,
    sourceFileName: report.sourceFileName,
    sourceFileSize: report.sourceFileSize,
    inspectedAt: report.inspectedAt,
    entryCount: report.entryCount,
    entries: structuralEntries,
    assetSummary: [...assets.values()].sort((a, b) =>
      a.extension.localeCompare(b.extension),
    ),
  }
}
