function skipWhitespace(text, index) {
  while (index < text.length && /\s/.test(text[index])) index += 1
  return index
}

function extractBalancedValue(text, start) {
  const opener = text[start]
  const closer = opener === '{' ? '}' : opener === '[' ? ']' : null
  if (!closer) return null

  const stack = []
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch)
      continue
    }

    if (ch === '}' || ch === ']') {
      const expected = ch === '}' ? '{' : '['
      if (stack.at(-1) !== expected) return null
      stack.pop()
      if (stack.length === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

function firstArrayValueText(text, arrayStart) {
  let i = skipWhitespace(text, arrayStart + 1)
  if (text[i] === ']') return null

  if (text[i] === '{' || text[i] === '[') {
    return extractBalancedValue(text, i)
  }

  // The structural probe only needs compound first values. Avoid retaining
  // primitive source values in any intermediate report object.
  return null
}

function isDynamicKey(key) {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) ||
    /^file[-_][A-Za-z0-9_.-]{6,}$/i.test(key) ||
    /^[0-9a-f]{32,}$/i.test(key)
  )
}

function safeStructuralKey(key) {
  if (/^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/.test(key)) return key
  return '<redacted-key>'
}

function primitiveType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function schemaOf(value, depth, maxDepth) {
  const type = primitiveType(value)
  if (depth >= maxDepth) return { type }

  if (type === 'array') {
    const first = value.find(item => item !== undefined)
    return {
      type: 'array',
      itemSchema: first === undefined ? null : schemaOf(first, depth + 1, maxDepth),
    }
  }

  if (type !== 'object') return { type }

  const rawKeys = Object.keys(value)
  if (rawKeys.length === 0) return { type: 'object', keys: [], properties: {} }

  const dynamicCount = rawKeys.filter(isDynamicKey).length
  if (dynamicCount > 0 && dynamicCount / rawKeys.length >= 0.6) {
    const firstValue = value[rawKeys[0]]
    return {
      type: 'object',
      dynamicMap: true,
      valueSchema: schemaOf(firstValue, depth + 1, maxDepth),
    }
  }

  const keyPairs = rawKeys.map(raw => [raw, safeStructuralKey(raw)])
  const safeKeys = [...new Set(keyPairs.map(([, safe]) => safe))].sort()
  const properties = {}

  for (const [raw, safe] of keyPairs) {
    if (safe === '<redacted-key>') {
      if (!properties[safe]) properties[safe] = { type: primitiveType(value[raw]) }
      continue
    }
    properties[safe] = schemaOf(value[raw], depth + 1, maxDepth)
  }

  return {
    type: 'object',
    keys: safeKeys,
    properties,
  }
}

export function summarizeFirstValueSchema(input, options = {}) {
  const text = String(input ?? '')
  const maxDepth = options.maxDepth ?? 7
  const start = skipWhitespace(text, 0)
  const first = text[start]

  if (first === '[') {
    const valueText = firstArrayValueText(text, start)
    if (!valueText) {
      return { rootType: 'array', firstValueType: null, schema: null, complete: false }
    }

    try {
      const value = JSON.parse(valueText)
      return {
        rootType: 'array',
        firstValueType: primitiveType(value),
        schema: schemaOf(value, 0, maxDepth),
        complete: true,
      }
    } catch {
      return { rootType: 'array', firstValueType: null, schema: null, complete: false }
    }
  }

  if (first === '{') {
    const valueText = extractBalancedValue(text, start)
    if (!valueText) {
      return { rootType: 'object', firstValueType: 'object', schema: null, complete: false }
    }

    try {
      const value = JSON.parse(valueText)
      return {
        rootType: 'object',
        firstValueType: 'object',
        schema: schemaOf(value, 0, maxDepth),
        complete: true,
      }
    } catch {
      return { rootType: 'object', firstValueType: 'object', schema: null, complete: false }
    }
  }

  return { rootType: 'primitive', firstValueType: null, schema: null, complete: false }
}
