import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeJsonPrefix } from '../src/import/jsonShape.js'

test('summarizes keys from the first object in an array without returning values', () => {
  const result = summarizeJsonPrefix('[{"id":"secret-id","title":"private title","mapping":{},"create_time":0}, {"id":"second"}]')
  assert.deepEqual(result, {
    topLevelType: 'array',
    topLevelKeys: [],
    firstArrayItemKeys: ['create_time', 'id', 'mapping', 'title'],
    complete: true,
  })
  assert.equal(JSON.stringify(result).includes('private title'), false)
  assert.equal(JSON.stringify(result).includes('secret-id'), false)
})

test('summarizes top-level object keys from incomplete JSON', () => {
  const result = summarizeJsonPrefix('{"conversations":[{"id":"secret"}],"user":{"name":"private"},"more":')
  assert.deepEqual(result, {
    topLevelType: 'object',
    topLevelKeys: ['conversations', 'more', 'user'],
    firstArrayItemKeys: [],
    complete: false,
  })
})

test('handles escaped strings and colons inside values', () => {
  const result = summarizeJsonPrefix('[{"title":"value: with colon and \\"quote\\"","mapping":{}}]')
  assert.deepEqual(result.firstArrayItemKeys, ['mapping', 'title'])
})

test('marks non-JSON prefixes as invalid-json', () => {
  assert.deepEqual(summarizeJsonPrefix('not json'), {
    topLevelType: 'invalid-json',
    topLevelKeys: [],
    firstArrayItemKeys: [],
    complete: false,
  })
})
