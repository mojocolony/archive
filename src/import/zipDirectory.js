const EOCD_SIGNATURE = 0x06054b50
const ZIP64_EOCD_SIGNATURE = 0x06064b50
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const CENTRAL_FILE_SIGNATURE = 0x02014b50
const LOCAL_FILE_SIGNATURE = 0x04034b50
const ZIP64_EXTRA_ID = 0x0001
const UINT32_MAX = 0xffffffff
const UINT16_MAX = 0xffff
const MAX_EOCD_SEARCH = 22 + 0xffff
const MAX_CENTRAL_DIRECTORY_BYTES = 512 * 1024 * 1024

function toSafeNumber(value, label) {
  if (typeof value === 'number') return value
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds JavaScript safe integer range`)
  }
  return Number(value)
}

function decodeName(bytes, utf8) {
  if (utf8) return new TextDecoder('utf-8').decode(bytes)
  const decoded = new TextDecoder('utf-8').decode(bytes)
  if (!decoded.includes('\ufffd')) return decoded
  try {
    return new TextDecoder('windows-1252').decode(bytes)
  } catch {
    return decoded
  }
}

async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer())
}

function findEocd(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) !== EOCD_SIGNATURE) continue
    const commentLength = view.getUint16(i + 20, true)
    if (i + 22 + commentLength <= bytes.length) return i
  }
  return -1
}

async function readZip64DirectoryInfo(file, eocdAbsoluteOffset, tail, tailStart) {
  const locatorAbsoluteOffset = eocdAbsoluteOffset - 20
  let locatorBytes

  if (locatorAbsoluteOffset >= tailStart) {
    const start = locatorAbsoluteOffset - tailStart
    locatorBytes = tail.subarray(start, start + 20)
  } else {
    locatorBytes = await blobBytes(file.slice(locatorAbsoluteOffset, locatorAbsoluteOffset + 20))
  }

  if (locatorBytes.length < 20) throw new Error('ZIP64 locator is truncated')
  const locator = new DataView(locatorBytes.buffer, locatorBytes.byteOffset, locatorBytes.byteLength)
  if (locator.getUint32(0, true) !== ZIP64_LOCATOR_SIGNATURE) {
    throw new Error('ZIP64 locator not found')
  }

  const zip64Offset = toSafeNumber(locator.getBigUint64(8, true), 'ZIP64 EOCD offset')
  const headerBytes = await blobBytes(file.slice(zip64Offset, zip64Offset + 56))
  if (headerBytes.length < 56) throw new Error('ZIP64 EOCD record is truncated')
  const header = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength)
  if (header.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE) {
    throw new Error('ZIP64 EOCD record not found')
  }

  return {
    totalEntries: toSafeNumber(header.getBigUint64(32, true), 'ZIP entry count'),
    centralDirectorySize: toSafeNumber(header.getBigUint64(40, true), 'ZIP central directory size'),
    centralDirectoryOffset: toSafeNumber(header.getBigUint64(48, true), 'ZIP central directory offset'),
  }
}

export function parseZip64ExtendedInfo(extraBytes, sentinels) {
  let originalSize = sentinels.originalSize32
  let compressedSize = sentinels.compressedSize32
  let localHeaderOffset = sentinels.localHeaderOffset32
  let diskStart = sentinels.diskStart16

  const view = new DataView(extraBytes.buffer, extraBytes.byteOffset, extraBytes.byteLength)
  let cursor = 0

  while (cursor + 4 <= extraBytes.length) {
    const id = view.getUint16(cursor, true)
    const length = view.getUint16(cursor + 2, true)
    const dataStart = cursor + 4
    const dataEnd = dataStart + length
    if (dataEnd > extraBytes.length) break

    if (id === ZIP64_EXTRA_ID) {
      let p = dataStart
      if (sentinels.originalSize32 === UINT32_MAX) {
        originalSize = toSafeNumber(view.getBigUint64(p, true), 'ZIP64 original size')
        p += 8
      }
      if (sentinels.compressedSize32 === UINT32_MAX) {
        compressedSize = toSafeNumber(view.getBigUint64(p, true), 'ZIP64 compressed size')
        p += 8
      }
      if (sentinels.localHeaderOffset32 === UINT32_MAX) {
        localHeaderOffset = toSafeNumber(view.getBigUint64(p, true), 'ZIP64 local header offset')
        p += 8
      }
      if (sentinels.diskStart16 === UINT16_MAX && p + 4 <= dataEnd) {
        diskStart = view.getUint32(p, true)
      }
      break
    }

    cursor = dataEnd
  }

  return { originalSize, compressedSize, localHeaderOffset, diskStart }
}

export async function readZipDirectory(file) {
  if (!(file instanceof Blob)) throw new TypeError('ZIP source must be a File or Blob')
  if (file.size < 22) throw new Error('ZIP file is too small')

  const tailSize = Math.min(file.size, MAX_EOCD_SEARCH)
  const tailStart = file.size - tailSize
  const tail = await blobBytes(file.slice(tailStart, file.size))
  const eocdIndex = findEocd(tail)
  if (eocdIndex < 0) throw new Error('ZIP end-of-central-directory record not found')

  const eocd = new DataView(tail.buffer, tail.byteOffset + eocdIndex, tail.byteLength - eocdIndex)
  const totalEntries32 = eocd.getUint16(10, true)
  const centralDirectorySize32 = eocd.getUint32(12, true)
  const centralDirectoryOffset32 = eocd.getUint32(16, true)

  let info = {
    totalEntries: totalEntries32,
    centralDirectorySize: centralDirectorySize32,
    centralDirectoryOffset: centralDirectoryOffset32,
  }

  if (
    totalEntries32 === UINT16_MAX ||
    centralDirectorySize32 === UINT32_MAX ||
    centralDirectoryOffset32 === UINT32_MAX
  ) {
    info = await readZip64DirectoryInfo(
      file,
      tailStart + eocdIndex,
      tail,
      tailStart,
    )
  }

  if (info.centralDirectorySize > MAX_CENTRAL_DIRECTORY_BYTES) {
    throw new Error(
      `ZIP central directory is unexpectedly large (${info.centralDirectorySize} bytes)`,
    )
  }

  const centralBytes = await blobBytes(
    file.slice(
      info.centralDirectoryOffset,
      info.centralDirectoryOffset + info.centralDirectorySize,
    ),
  )
  const view = new DataView(
    centralBytes.buffer,
    centralBytes.byteOffset,
    centralBytes.byteLength,
  )
  const entries = []
  let cursor = 0

  while (cursor + 46 <= centralBytes.length && entries.length < info.totalEntries) {
    if (view.getUint32(cursor, true) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error(`Invalid central directory entry at byte ${cursor}`)
    }

    const flags = view.getUint16(cursor + 8, true)
    const compressionMethod = view.getUint16(cursor + 10, true)
    const compressedSize32 = view.getUint32(cursor + 20, true)
    const originalSize32 = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const diskStart16 = view.getUint16(cursor + 34, true)
    const localHeaderOffset32 = view.getUint32(cursor + 42, true)

    const nameStart = cursor + 46
    const extraStart = nameStart + nameLength
    const commentStart = extraStart + extraLength
    const next = commentStart + commentLength
    if (next > centralBytes.length) throw new Error('Central directory entry is truncated')

    const path = decodeName(
      centralBytes.subarray(nameStart, nameStart + nameLength),
      Boolean(flags & 0x0800),
    )
    const extra = centralBytes.subarray(extraStart, extraStart + extraLength)
    const zip64 = parseZip64ExtendedInfo(extra, {
      originalSize32,
      compressedSize32,
      localHeaderOffset32,
      diskStart16,
    })

    entries.push({
      path,
      flags,
      encrypted: Boolean(flags & 0x0001),
      compressionMethod,
      compressedSize: zip64.compressedSize,
      originalSize: zip64.originalSize,
      localHeaderOffset: zip64.localHeaderOffset,
      directory: path.endsWith('/'),
    })

    cursor = next
  }

  if (entries.length !== info.totalEntries) {
    throw new Error(
      `ZIP directory expected ${info.totalEntries} entries but found ${entries.length}`,
    )
  }

  return entries
}

async function entryDataStart(file, entry) {
  const headerBytes = await blobBytes(
    file.slice(entry.localHeaderOffset, entry.localHeaderOffset + 30),
  )
  if (headerBytes.length < 30) throw new Error(`Local header is truncated: ${entry.path}`)
  const header = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength)
  if (header.getUint32(0, true) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Local header signature is invalid: ${entry.path}`)
  }
  const nameLength = header.getUint16(26, true)
  const extraLength = header.getUint16(28, true)
  return entry.localHeaderOffset + 30 + nameLength + extraLength
}

function concatChunks(chunks, total) {
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

async function readStreamPrefix(stream, maxBytes) {
  const reader = stream.getReader()
  const chunks = []
  let total = 0

  try {
    while (total < maxBytes) {
      const { value, done } = await reader.read()
      if (done) break
      const remaining = maxBytes - total
      const kept = value.subarray(0, remaining)
      chunks.push(kept)
      total += kept.length
      if (kept.length < value.length || total >= maxBytes) {
        await reader.cancel('prefix complete')
        break
      }
    }
  } finally {
    reader.releaseLock()
  }

  return concatChunks(chunks, total)
}

export async function readEntryTextPrefix(file, entry, maxBytes = 2 * 1024 * 1024) {
  if (entry.directory) return ''
  if (entry.encrypted) throw new Error(`Encrypted ZIP entries are not supported: ${entry.path}`)
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('maxBytes must be positive')

  const dataStart = await entryDataStart(file, entry)
  const compressedBlob = file.slice(dataStart, dataStart + entry.compressedSize)
  let bytes

  if (entry.compressionMethod === 0) {
    bytes = await blobBytes(compressedBlob.slice(0, Math.min(maxBytes, entry.originalSize)))
  } else if (entry.compressionMethod === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser does not support streaming DEFLATE decompression')
    }
    const stream = compressedBlob.stream().pipeThrough(new DecompressionStream('deflate-raw'))
    bytes = await readStreamPrefix(stream, maxBytes)
  } else {
    throw new Error(
      `Unsupported ZIP compression method ${entry.compressionMethod}: ${entry.path}`,
    )
  }

  return new TextDecoder('utf-8').decode(bytes)
}
