import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, normalizeCode } from './phone-auth-verify.js';

test('normalizePhone edge cases', () => {
  assert.equal(normalizePhone('+1 555 123 4567'), '+15551234567');
  assert.equal(normalizePhone('001 555 123 4567'), '+15551234567');
  assert.equal(normalizePhone('+44 (0) 20 7123 4567'), '+4402071234567');
  assert.equal(normalizePhone('invalid'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
});

test('normalizeCode edge cases', () => {
  assert.equal(normalizeCode('123456'), '123456');
  assert.equal(normalizeCode('12 34 56'), '123456');
  assert.equal(normalizeCode('abc'), null);
  assert.equal(normalizeCode(''), null);
});
