import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coincideUrl, lerCampoDoPedido } from '../main/executor/correrCaso';

test('o endereço do pedido corresponde ao padrão (texto ou com *)', () => {
  assert.ok(coincideUrl('easypay.pt/api/pagamentos', 'https://sandbox.easypay.pt/api/pagamentos?x=1'));
  assert.ok(!coincideUrl('easypay.pt/api/pagamentos', 'https://easypay.pt/api/reembolsos'));
  assert.ok(coincideUrl('https://*/api/*', 'https://qa.exemplo.pt/api/clientes/7'));
  assert.ok(!coincideUrl('https://*/api/*', 'http://qa.exemplo.pt/api/clientes'));
  assert.ok(coincideUrl('*Action(1)*', 'https://x/Action(1)/y'), 'os outros caracteres especiais contam como texto');
});

test('ler campos do pedido enviado: JSON, formulário e endereço', () => {
  const json = lerCampoDoPedido({ url: 'https://x/a?canal=web', corpo: '{"inputParameters":{"Valor":"1234","Itens":[{"id":7}]},"zero":0}' });
  assert.equal(json('inputParameters.Valor'), '1234');
  assert.equal(json('inputParameters.Itens[0].id'), '7');
  assert.equal(json('zero'), '0');
  assert.equal(json('inputParameters'), '{"Valor":"1234","Itens":[{"id":7}]}');
  assert.equal(json('canal'), 'web', 'se não estiver no corpo, procura no endereço');
  assert.equal(json('naoExiste'), undefined);
  assert.equal(json('*')?.includes('"Valor":"1234"'), true);
  const formulario = lerCampoDoPedido({ url: 'https://x/pagar', corpo: 'montante=12.50&ref=ABC%20123' });
  assert.equal(formulario('montante'), '12.50');
  assert.equal(formulario('ref'), 'ABC 123');
});
