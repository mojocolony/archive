import { visibleMessages } from '../import/conversationParser.js'

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
}

function wordTokens(value) {
  return normalize(value).match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) ?? []
}

function levenshteinDistance(a, b, maxDistance = Infinity) {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let rowMinimum = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      )
      current[j] = value
      rowMinimum = Math.min(rowMinimum, value)
    }
    if (rowMinimum > maxDistance) return maxDistance + 1
    previous = current
  }
  return previous[b.length]
}

function fuzzyLimit(term) {
  if (term.length >= 9) return 2
  if (term.length >= 5) return 1
  return 0
}

function tokenMatchesTerm(token, term) {
  if (!term) return true
  if (token.includes(term)) return true
  const limit = fuzzyLimit(term)
  return limit > 0 && levenshteinDistance(token, term, limit) <= limit
}

function textMatchesTerm(text, term) {
  const normalizedText = normalize(text)
  if (normalizedText.includes(term)) return true
  return wordTokens(normalizedText).some(token => tokenMatchesTerm(token, term))
}

function textMatchesPhrase(text, phrase) {
  return normalize(text).includes(phrase)
}

function scoreField(text, query, weight) {
  let score = 0
  const normalizedText = normalize(text)
  for (const phrase of query.phrases) {
    if (normalizedText.includes(phrase)) score += weight * 3
  }
  for (const term of query.terms) {
    if (normalizedText.includes(term)) score += weight * 2
    else if (wordTokens(normalizedText).some(token => tokenMatchesTerm(token, term))) score += weight
  }
  return score
}

function unitMatchesDocument(document, unit, kind) {
  if (kind === 'phrase') {
    if (textMatchesPhrase(document.title, unit)) return true
    return document.messages.some(message => textMatchesPhrase(message.text, unit))
  }
  if (textMatchesTerm(document.title, unit)) return true
  return document.messages.some(message => textMatchesTerm(message.text, unit))
}

function matchingExcerpts(document, query) {
  const candidates = []
  for (const message of document.messages) {
    let score = 0
    for (const phrase of query.phrases) {
      if (textMatchesPhrase(message.text, phrase)) score += message.role === 'user' ? 60 : 40
    }
    for (const term of query.terms) {
      if (textMatchesTerm(message.text, term)) score += message.role === 'user' ? 25 : 15
    }
    if (score > 0) candidates.push({ ...message, score })
  }
  return candidates
    .sort((a, b) => b.score - a.score || (b.createTime ?? 0) - (a.createTime ?? 0))
    .slice(0, 2)
    .map(({ score: _score, ...message }) => message)
}

export function buildSearchDocument(indexEntry, source) {
  const title = String(indexEntry?.title ?? source?.title ?? 'Untitled conversation').trim() || 'Untitled conversation'
  const messages = visibleMessages(source).map(message => ({
    messageId: message.id,
    nodeId: message.nodeId,
    role: message.role,
    text: message.text,
    createTime: message.createTime,
  }))
  const searchableText = [title, ...messages.map(message => message.text)].join('\n')

  return {
    conversationId: String(indexEntry?.conversationId ?? source?.conversation_id ?? source?.id ?? ''),
    title,
    createTime: indexEntry?.createTime ?? source?.create_time ?? null,
    updateTime: indexEntry?.updateTime ?? source?.update_time ?? null,
    isArchived: Boolean(indexEntry?.isArchived),
    isStarred: Boolean(indexEntry?.isStarred),
    pinnedTime: indexEntry?.pinnedTime ?? null,
    presentInLatestExport: indexEntry?.presentInLatestExport !== false,
    sourcePath: indexEntry?.sourcePath ?? null,
    messages,
    searchableText,
    normalizedTitle: normalize(title),
    normalizedSearchText: normalize(searchableText),
  }
}

export function parseSearchQuery(value) {
  const raw = String(value ?? '').trim()
  const phrases = []
  const remainder = raw.replace(/"([^"]+)"/g, (_match, phrase) => {
    const normalized = normalize(phrase).trim()
    if (normalized) phrases.push(normalized)
    return ' '
  })
  const terms = wordTokens(remainder)
  return { raw, phrases, terms }
}

export function searchDocuments(documents, value, { limit = 100 } = {}) {
  const query = parseSearchQuery(value)
  if (!query.raw || (query.phrases.length === 0 && query.terms.length === 0)) return []

  const results = []
  for (const document of documents ?? []) {
    const allPhrasesMatch = query.phrases.every(phrase => unitMatchesDocument(document, phrase, 'phrase'))
    const allTermsMatch = query.terms.every(term => unitMatchesDocument(document, term, 'term'))
    if (!allPhrasesMatch || !allTermsMatch) continue

    let score = scoreField(document.title, query, 100)
    for (const message of document.messages) {
      score += scoreField(message.text, query, message.role === 'user' ? 30 : 20)
    }

    results.push({
      conversationId: document.conversationId,
      title: document.title,
      createTime: document.createTime,
      updateTime: document.updateTime,
      isArchived: document.isArchived,
      isStarred: document.isStarred,
      presentInLatestExport: document.presentInLatestExport,
      score,
      excerpts: matchingExcerpts(document, query),
    })
  }

  return results
    .sort((a, b) => b.score - a.score || Number(b.updateTime ?? 0) - Number(a.updateTime ?? 0) || a.title.localeCompare(b.title))
    .slice(0, limit)
}
