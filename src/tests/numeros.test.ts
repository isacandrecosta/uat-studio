import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compararComTolerancia, formatar, formatarComPonto, lerNumero } from '../main/executor/numeros';

const n = (texto: string) => {
  const numero = lerNumero(texto);
  assert.ok(numero, `"${texto}" devia ser um número`);
  return numero;
};
const ler = (texto: string): string => formatar(n(texto));

test('lerNumero entende os formatos pt-PT e com ponto decimal', () => {
  assert.equal(ler('1.234,56 €'), '1234,56');
  assert.equal(ler('86.76'), '86,76');
  assert.equal(ler('1051.12'), '1051,12');
  assert.equal(ler('86,36'), '86,36');
  assert.equal(ler('1,234.56'), '1234,56');
  assert.equal(ler('12.345.678'), '12345678');
  assert.equal(ler('1.234'), '1234'); // milhares pt-PT
  assert.equal(ler('0.125'), '0,125'); // começa por 0: é decimal
  assert.equal(ler('12,5 %'), '12,5');
  assert.equal(ler('-0,01'), '-0,01');
  assert.equal(ler('−3,50'), '-3,5');
  assert.equal(ler('1 234,50'), '1234,5');
  assert.equal(ler('10.00'), '10');
  assert.equal(ler('166'), '166');
  assert.equal(lerNumero('Aprovado'), null);
  assert.equal(lerNumero(''), null);
});

test('a comparação é exata (sem erros de vírgula flutuante)', () => {
  // Em vírgula flutuante, 0.1 + 0.2 !== 0.3; aqui tem de ser igual.
  const zero = n('0');
  assert.equal(compararComTolerancia(n('0,3'), n('0.30'), zero).igual, true);
  assert.equal(compararComTolerancia(n('86,40'), n('86.41'), zero).igual, false);
  assert.equal(compararComTolerancia(n('86,40'), n('86.41'), zero).diferenca, '0,01');
  assert.equal(compararComTolerancia(n('86,40'), n('86.41'), n('0,01')).igual, true);
  assert.equal(compararComTolerancia(n('86,40'), n('86.39'), n('0,01')).igual, true);
  assert.equal(compararComTolerancia(n('86,40'), n('86,385'), n('0,01')).igual, false);
  assert.equal(compararComTolerancia(n('86,40'), n('86,385'), n('0,01')).diferenca, '-0,015');
  assert.equal(compararComTolerancia(n('123456789012345678,01'), n('123456789012345678,02'), zero).igual, false);
});

test('formatarComPonto serve para campos numéricos', () => {
  assert.equal(formatarComPonto(n('863,61')), '863.61');
  assert.equal(formatarComPonto(n('1.000,00')), '1000');
});
