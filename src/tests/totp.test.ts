import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avaliarFormula, contextoDeExemplo } from '../shared/formulas';
import { codigoTotp, deBase32 } from '../shared/totp';

// Chave da norma RFC 6238 ("12345678901234567890" em base32).
const CHAVE = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('TOTP com os valores de teste da norma RFC 6238', () => {
  assert.equal(codigoTotp(CHAVE, new Date(59_000), 8), '94287082');
  assert.equal(codigoTotp(CHAVE, new Date(1111111109_000), 8), '07081804');
  assert.equal(codigoTotp(CHAVE, new Date(1234567890_000), 8), '89005924');
  assert.equal(codigoTotp(CHAVE, new Date(20000000000_000), 8), '65353130');
  assert.equal(codigoTotp(CHAVE, new Date(59_000)), '287082');
  assert.deepEqual([...deBase32('MZXW 6YTB-OI')], [...Buffer.from('foobar')]);
  assert.throws(() => deBase32('ABC1!'), /base32/);
});

test('fórmula TOTP({Chave}) usa a hora do caso', () => {
  const ctx = { ...contextoDeExemplo({ ChaveMfa: CHAVE }), agora: new Date(59_000) };
  assert.equal(avaliarFormula('TOTP({ChaveMfa})', ctx), '287082');
  assert.equal(avaliarFormula('TOTP({ChaveMfa}; 8)', ctx), '94287082');
  assert.throws(() => avaliarFormula('TOTP("1")', ctx), /base32/);
});
