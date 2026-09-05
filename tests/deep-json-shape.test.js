import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeFirstValueSchema } from '../src/import/deepJsonShape.js'

const sample = `[
  {
    "id": "conv-secret-123",
    "title": "Private conversation title",
    "mapping": {
      "123e4567-e89b-12d3-a456-426614174000": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "message": {
          "author": {"role": "user", "name": null, "metadata": {}},
          "content": {"content_type": "text", "parts": ["very private prompt"]},
          "metadata": {"model_slug": "gpt-secret", "attachments": [{"id": "file-secret", "name": "private.pdf"}]}
        },
        "parent": null,
        "children": ["child-secret"]
      }
    },
    "is_archived": false,
    "is_starred": true,
    "pinned_time": 12345
  },
  {"id": "second-conversation"}
] trailing truncated bytes that make the overall prefix invalid`

test('summarizes the first array object deeply without retaining values', () => {
  const summary = summarizeFirstValueSchema(sample, { maxDepth: 8 })

  assert.equal(summary.rootType, 'array')
  assert.equal(summary.firstValueType, 'object')
  assert.deepEqual(summary.schema.keys, [
    'id',
    'is_archived',
    'is_starred',
    'mapping',
    'pinned_time',
    'title',
  ])

  const mapping = summary.schema.properties.mapping
  assert.equal(mapping.type, 'object')
  assert.equal(mapping.dynamicMap, true)
  assert.equal(mapping.keys, undefined)
  assert.equal(mapping.valueSchema.type, 'object')
  assert.deepEqual(mapping.valueSchema.keys, ['children', 'id', 'message', 'parent'])

  const message = mapping.valueSchema.properties.message
  assert.deepEqual(message.keys, ['author', 'content', 'metadata'])
  assert.equal(message.properties.content.properties.parts.type, 'array')
  assert.equal(message.properties.content.properties.parts.itemSchema.type, 'string')

  const serialized = JSON.stringify(summary)
  for (const secret of [
    'conv-secret-123',
    'Private conversation title',
    'very private prompt',
    'gpt-secret',
    'file-secret',
    'private.pdf',
    '123e4567-e89b-12d3-a456-426614174000',
    'child-secret',
  ]) {
    assert.equal(serialized.includes(secret), false, `leaked value: ${secret}`)
  }
})

test('masks file-id keyed objects as dynamic maps', () => {
  const summary = summarizeFirstValueSchema(
    '{"file-ABC123.dat":"original-name.pdf","file_0000000.dat":"other.docx"}',
    { maxDepth: 4 },
  )

  assert.equal(summary.rootType, 'object')
  assert.equal(summary.schema.dynamicMap, true)
  assert.equal(summary.schema.valueSchema.type, 'string')
  assert.equal(JSON.stringify(summary).includes('original-name.pdf'), false)
  assert.equal(JSON.stringify(summary).includes('file-ABC123.dat'), false)
})
