import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlParaAssinatura } from '../main/executor/assinatura';
import type { EstadoRun } from '../shared/modelo';

test('relatório para assinatura: requisito, totais, observações dos KO/ERRO e linhas de assinatura', () => {
  const run: EstadoRun = {
    id: 'run7',
    nome: 'Simular <crédito>',
    ativo: false,
    aParar: false,
    emPausa: false,
    inicio: '2026-11-11T10:00:00Z',
    fim: '2026-11-11T10:05:00Z',
    ambiente: 'QA',
    tipoAmbiente: 'QA',
    utilizador: 'qa.ana',
    opcoes: { canal: 'msedge', visivel: false, paralelo: 1 },
    jornadas: [{ id: 'j1', nome: 'Simular', epicoId: 'e', epicoNome: 'E', requisitoId: 'REQ-101', blocos: [] }],
    casos: [
      { chave: 'j1/A', jornadaId: 'j1', jornadaNome: 'Simular', casoId: 'A', estado: 'OK', diferencas: [], passos: [], variaveis: {}, duracaoMs: 1 },
      { chave: 'j1/B', jornadaId: 'j1', jornadaNome: 'Simular', casoId: 'B', estado: 'KO', diferencas: [{ bloco: 'X', passo: 'Prestação', esperado: '86,41', obtido: '86,40' }], passos: [], variaveis: {}, duracaoMs: 1 },
      { chave: 'j2/C', jornadaId: 'j2', jornadaNome: 'Validar', casoId: 'C', estado: 'ERRO', erro: { mensagem: 'Não encontrei o elemento', bloco: 'BO', passo: 'Validar', porExecutar: [] }, diferencas: [], passos: [], variaveis: {}, duracaoMs: 1 },
    ],
  };
  const html = htmlParaAssinatura(run, { projeto: 'Projeto X', jornadas: [{ id: 'j2', nome: 'Validar', requisitoId: 'REQ-202' }] });
  assert.match(html, /REQ-101/);
  assert.match(html, /REQ-202/, 'o requisito vem das jornadas atuais quando a fotografia não o tem');
  assert.match(html, /qa\.ana/);
  assert.match(html, /Com falhas/);
  assert.match(html, /Prestação: esperado &quot;86,41&quot;, obtido &quot;86,40&quot;/);
  assert.match(html, /BO › Validar: Não encontrei o elemento/);
  assert.match(html, /Simular &lt;crédito&gt;/, 'o texto é sempre escapado');
  assert.match(html, /Responsável de negócio/);
  assert.match(html, /Aceite com reservas/);
});
