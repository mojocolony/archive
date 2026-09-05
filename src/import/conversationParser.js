function sourceId(conversation) {
  return String(conversation?.conversation_id ?? conversation?.id ?? '')
}

function nodeById(conversation, nodeId) {
  if (!nodeId) return null
  const mapping = conversation?.mapping
  if (!mapping || typeof mapping !== 'object') return null
  return mapping[nodeId] ?? null
}

export function activeNodePath(conversation) {
  const warnings = []
  const currentNode = conversation?.current_node
  if (!currentNode) {
    warnings.push(`Conversation ${sourceId(conversation) || '(unknown)'} has no current_node`)
    return { nodeIds: [], warnings }
  }

  if (!nodeById(conversation, currentNode)) {
    warnings.push(`Conversation ${sourceId(conversation) || '(unknown)'} current_node is missing from mapping`)
    return { nodeIds: [], warnings }
  }

  const reversed = []
  const seen = new Set()
  let cursor = currentNode

  while (cursor) {
    if (seen.has(cursor)) {
      warnings.push(`Conversation ${sourceId(conversation) || '(unknown)'} mapping contains a parent cycle`)
      break
    }
    seen.add(cursor)

    const node = nodeById(conversation, cursor)
    if (!node) {
      warnings.push(`Conversation ${sourceId(conversation) || '(unknown)'} active branch references missing node ${cursor}`)
      break
    }

    reversed.push(cursor)
    cursor = node.parent ?? null
  }

  reversed.reverse()
  return { nodeIds: reversed, warnings }
}

function visiblePartText(part) {
  if (typeof part === 'string') return part.trim()
  if (!part || typeof part !== 'object') return ''
  if (typeof part.text === 'string') return part.text.trim()
  return ''
}

function visibleTextFromContent(content) {
  if (!content || typeof content !== 'object') return ''
  if (content.content_type === 'thoughts') return ''
  if (!Array.isArray(content.parts)) return ''
  return content.parts
    .map(visiblePartText)
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export function visibleMessages(conversation) {
  const { nodeIds } = activeNodePath(conversation)
  const messages = []

  for (const nodeId of nodeIds) {
    const node = nodeById(conversation, nodeId)
    const message = node?.message
    if (!message || typeof message !== 'object') continue

    const role = message.author?.role
    if (role !== 'user' && role !== 'assistant') continue

    const text = visibleTextFromContent(message.content)
    if (!text) continue

    messages.push({
      id: String(message.id ?? nodeId),
      nodeId,
      role,
      text,
      createTime: typeof message.create_time === 'number' ? message.create_time : null,
    })
  }

  return messages
}

export function conversationToMarkdown(conversation) {
  const title = String(conversation?.title || 'Untitled conversation').trim()
  const lines = [`# ${title}`, '']

  for (const message of visibleMessages(conversation)) {
    lines.push(`## ${message.role === 'user' ? 'You' : 'ChatGPT'}`, '', message.text, '')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

export async function fingerprintConversation(conversation) {
  const bytes = new TextEncoder().encode(JSON.stringify(conversation))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
