import test from 'node:test';
import assert from 'node:assert/strict';
import { pixReceiverName } from '../public/shared/pix.js';
const field = (tag, value) => tag + String(value.length).padStart(2, '0') + value;
test('reads top-level receiver, skipping nested fields and amounts', () => {
  const code = '000201' + field('26', field('59', 'NESTED NAME')) + field('54', '59.00') + field('59', 'RECEBEDOR TESTE') + field('60', 'SAO PAULO');
  assert.equal(pixReceiverName(code), 'RECEBEDOR TESTE');
});
test('missing, malformed and truncated codes do not invent receiver names', () => {
  for (const code of ['', null, 'not pix', '0002015909ABC', '00020159XXABC', '0002015903ABCXX', '0002015802BR']) assert.equal(pixReceiverName(code), '');
});
