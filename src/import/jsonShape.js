function skipWhitespace(text, index) {
  while (index < text.length && /\s/.test(text[index])) index += 1
  return index
}

function readJsonString(text, start) {
  let i = start + 1
  let escaped = false
  while (i < text.length) {
    const ch = text[i]
    if (escaped) {
      escaped = false
      i += 1
      continue
    }
    if (ch === '\\') {
      escaped = true
      i += 1
      continue
    }
    if (ch === '"') {
      const raw = text.slice(start, i + 1)
      try {
        return { value: JSON.parse(raw), end: i + 1 }
      } catch {
        return null
      }
    }
    i += 1
  }
  return null
}

function stackEquals(stack, expected) {
  if (stack.length !== expected.length) return false
  return expected.every((value, index) => stack[index] === value)
}

export function summarizeJsonPrefix(input) {
  const text = String(input ?? '')
  let i = skipWhitespace(text, 0)
  const first = text[i]

  if (first !== '{' && first !== '[') {
    if (first === '"' || first === '-' || /[0-9tfn]/.test(first ?? '')) {
      try {
        JSON.parse(text)
        return {
          topLevelType: 'primitive',
          topLevelKeys: [],
          firstArrayItemKeys: [],
          complete: true,
        }
      } catch {
        return {
          topLevelType: 'invalid-json',
          topLevelKeys: [],
          firstArrayItemKeys: [],
          complete: false,
        }
      }
    }
    return {
      topLevelType: 'invalid-json',
      topLevelKeys: [],
      firstArrayItemKeys: [],
      complete: false,
    }
  }

  const topLevelType = first === '{' ? 'object' : 'array'
  const topLevelKeys = new Set()
  const firstArrayItemKeys = new Set()
  const stack = []
  let rootClosedAt = -1
  let firstArrayObjectDone = false

  while (i < text.length) {
    const ch = text[i]

    if (ch === '"') {
      const token = readJsonString(text, i)
      if (!token) break
      const after = skipWhitespace(text, token.end)
      const isKey = text[after] === ':'

      if (isKey && topLevelType === 'object' && stackEquals(stack, ['{'])) {
        topLevelKeys.add(token.value)
      }
      if (
        isKey &&
        topLevelType === 'array' &&
        !firstArrayObjectDone &&
        stackEquals(stack, ['[', '{'])
      ) {
        firstArrayItemKeys.add(token.value)
      }

      i = token.end
      continue
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch)
      i += 1
      continue
    }

    if (ch === '}' || ch === ']') {
      const expected = ch === '}' ? '{' : '['
      if (stack.at(-1) !== expected) {
        return {
          topLevelType: 'invalid-json',
          topLevelKeys: [],
          firstArrayItemKeys: [],
          complete: false,
        }
      }

      if (topLevelType === 'array' && ch === '}' && stackEquals(stack, ['[', '{'])) {
        firstArrayObjectDone = true
      }

      stack.pop()
      if (stack.length === 0) {
        rootClosedAt = i
        break
      }
      i += 1
      continue
    }

    i += 1
  }

  const complete =
    rootClosedAt >= 0 && skipWhitespace(text, rootClosedAt + 1) === text.length

  return {
    topLevelType,
    topLevelKeys: [...topLevelKeys].sort(),
    firstArrayItemKeys: [...firstArrayItemKeys].sort(),
    complete,
  }
}
