import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ResultadoCaso } from '../shared/modelo';
import { sugerirParaCaso } from '../shared/sugestoes';

const erro = (mensagem: string): Pick<ResultadoCaso, 'estado' | 'erro' | 'diferencas'> => ({ estado: 'ERRO', erro: { mensagem, bloco: 'B', passo: 'P', porExecutar: [] }, diferencas: [] });
const ko = (passo: string, esperado: string, obtido: string): Pick<ResultadoCaso, 'estado' | 'erro' | 'diferencas'> => ({ estado: 'KO', diferencas: [{ bloco: 'B', passo, esperado, obtido }] });

test('sugestões para erros conhecidos', () => {
  assert.match(sugerirParaCaso(erro('Não encontrei o elemento "Campo Valor" (data-testid "inpValor") nem pelas alternativas.'))[0], /Regravar este elemento/);
  assert.match(sugerirParaCaso(erro('Há 3 elementos que correspondem a "Botão" (texto "OK") e nenhuma alternativa serviu.'))[0], /vários elementos iguais/);
  assert.match(sugerirParaCaso(erro('O passo demorou mais do que o tempo limite (15,0 s): o elemento pode estar tapado.'))[0], /lenta/);
  assert.match(sugerirParaCaso(erro('O pedido do token falhou (HTTP 401): invalid_client'))[0], /cofre/);
  assert.match(sugerirParaCaso(erro('GET /x: HTTP 503'))[0], /servidor \(5xx\)/);
  assert.match(sugerirParaCaso(erro('A aplicação "FO" não tem endereço no ambiente QA.'))[0], /Aplicações/);
  assert.match(sugerirParaCaso(erro('Algo estranho aconteceu'))[0], /erro\.png/);
});

test('sugestões para diferenças (KO)', () => {
  assert.match(sugerirParaCaso(ko('Verificar Prestação', '86,41', '86,40'))[0], /um cêntimo.*ARRED\.PAR/);
  assert.match(sugerirParaCaso(ko('Verificar: Código HTTP igual a 200', '200', '404'))[0], /404/);
  assert.match(sugerirParaCaso(ko('Confirmação manual', 'OK', 'KO: não aparece'))[0], /passo manual/);
  assert.match(sugerirParaCaso(ko('Verificar Estado', 'Aprovado', 'Rejeitado'))[0], /valor esperado/);
  assert.match(sugerirParaCaso(ko('Verificar Total', '100,00', '100,50'))[0], /valor esperado/);
  assert.deepEqual(sugerirParaCaso({ estado: 'OK', diferencas: [] }), []);
});
