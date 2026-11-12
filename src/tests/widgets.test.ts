import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dataIso, numerosDoSlider, partesDoIntervalo } from '../main/motor/acoes';

test('datas dos calendários: formatos pt-PT, ISO, mês e hora', () => {
  assert.equal(dataIso('15/03/2026'), '2026-03-15');
  assert.equal(dataIso('5/3/2026'), '2026-03-05');
  assert.equal(dataIso('15-03-2026'), '2026-03-15');
  assert.equal(dataIso('2026-03-15'), '2026-03-15');
  assert.equal(dataIso('2026-03-15 00:00:00'), '2026-03-15');
  assert.equal(dataIso('03/2026'), '2026-03-01');
  assert.equal(dataIso('2026-03'), '2026-03-01');
  assert.equal(dataIso('9:05'), '09:05');
  assert.equal(dataIso('14:30:00'), '14:30');
  assert.equal(dataIso('amanhã'), null);
});

test('intervalos de datas', () => {
  assert.deepEqual(partesDoIntervalo('01/03/2026 a 15/03/2026'), ['01/03/2026', '15/03/2026']);
  assert.deepEqual(partesDoIntervalo('2026-03-01 to 2026-03-15'), ['2026-03-01', '2026-03-15']);
  assert.deepEqual(partesDoIntervalo('01/03/2026 - 15/03/2026'), ['01/03/2026', '15/03/2026']);
  assert.deepEqual(partesDoIntervalo('01/03/2026;15/03/2026'), ['01/03/2026', '15/03/2026']);
  // Uma data com hífenes não é um intervalo.
  assert.deepEqual(partesDoIntervalo('2026-03-15'), ['2026-03-15']);
});

test('valores dos sliders', () => {
  assert.deepEqual(numerosDoSlider('60'), [60]);
  assert.deepEqual(numerosDoSlider('20-80'), [20, 80]);
  assert.deepEqual(numerosDoSlider('20 - 80'), [20, 80]);
  assert.deepEqual(numerosDoSlider('20 a 80'), [20, 80]);
  assert.deepEqual(numerosDoSlider('12,5;40'), [12.5, 40]);
  assert.deepEqual(numerosDoSlider('abc'), []);
});
