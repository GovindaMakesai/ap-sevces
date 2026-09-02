const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhoneInput, maskPhone } = require('../lib/phoneNormalize');

test('normalizePhoneInput converts Indian 10-digit to E.164', () => {
  const r = normalizePhoneInput('9876543210', 'IN');
  assert.equal(r.ok, true);
  assert.equal(r.e164, '+919876543210');
  assert.ok(r.lookupVariants.includes('9876543210'));
});

test('normalizePhoneInput accepts E.164 input', () => {
  const r = normalizePhoneInput('+919876543210', 'IN');
  assert.equal(r.ok, true);
  assert.equal(r.e164, '+919876543210');
});

test('normalizePhoneInput rejects invalid numbers', () => {
  const r = normalizePhoneInput('123', 'IN');
  assert.equal(r.ok, false);
});

test('maskPhone hides middle digits', () => {
  const masked = maskPhone('+919876543210');
  assert.match(masked, /3210$/);
  assert.ok(masked.includes('•'));
});
