import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { criarExemplo } from '../main/projeto/exemplo';
import * as repo from '../main/projeto/repositorio';
import { estadoDoReparo, juntarReparos, ondeEUsado, repararLocalizador } from '../shared/blocos';
import type { Bloco, Localizador, SugestaoReparo } from '../shared/modelo';

test('"onde é usado" lista as jornadas do exemplo que usam cada bloco', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-blocos-'));
  try {
    repo.criarProjeto(pasta, 'P');
    criarExemplo(pasta);
    const jornadas = repo.listar(pasta, 'jornadas');
    const epicos = repo.listar(pasta, 'epicos');
    const conjuntos = repo.listar(pasta, 'casos');

    const simular = ondeEUsado('simular-credito', jornadas, epicos, conjuntos);
    assert.deepEqual(
      simular.map((u) => [u.jornadaNome, u.posicoes]),
      [
        ['Simular crédito', [1]],
        ['Simular e validar no Backoffice', [1]],
      ],
    );
    assert.equal(simular[0].casos, 6);
    assert.equal(simular[0].epicoNome, 'Simulações de crédito');

    const api = ondeEUsado('consultar-pedido-api', jornadas, epicos, conjuntos);
    assert.deepEqual(api.map((u) => [u.jornadaId, u.posicoes]), [['simular-e-validar', [3]]]);
    assert.deepEqual(ondeEUsado('nao-existe', jornadas), []);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('"onde é usado" vê repetições, condições e limpezas', () => {
  const usos = ondeEUsado('b', [
    { id: 'j', nome: 'J', epicoId: 'e', etiquetas: [], blocos: [{ id: '1', blocoId: 'b' }, { id: '2', blocoId: 'x' }, { id: '3', blocoId: 'b', condicao: '{A} = 1', sempre: true }] },
  ]);
  assert.deepEqual(usos[0].posicoes, [1, 3]);
  assert.equal(usos[0].condicional, true);
  assert.equal(usos[0].limpeza, true);
  assert.equal(usos[0].casos, 0);
});

const velho: Localizador = { tipo: 'testid', valor: 'inpAntigo' };
const etiqueta: Localizador = { tipo: 'etiqueta', valor: 'Valor' };
const id: Localizador = { tipo: 'id', valor: 'b1-Input' };

function blocoDeTeste(): Bloco {
  return {
    id: 'b',
    nome: 'Bloco',
    tipo: 'UI',
    passos: [{ id: 'p1', acao: 'escrever', descricao: 'Valor', alvo: { descricao: 'Campo', localizadores: [velho, etiqueta, id] } }],
  };
}

test('reparar põe a alternativa em primeiro e o localizador que falhou no fim', () => {
  const bloco = blocoDeTeste();
  const sugestao = { passoId: 'p1', usado: { ...id }, falhou: { ...velho } };
  assert.equal(estadoDoReparo(bloco, sugestao), 'por-reparar');
  assert.equal(repararLocalizador(bloco, sugestao), 'reparado');
  assert.deepEqual(bloco.passos[0].alvo?.localizadores, [id, etiqueta, velho]);
  // Repetir não muda nada.
  assert.equal(repararLocalizador(bloco, sugestao), 'ja-reparado');
  assert.deepEqual(bloco.passos[0].alvo?.localizadores, [id, etiqueta, velho]);
  // Passo apagado ou localizador que já não existe.
  assert.equal(repararLocalizador(bloco, { ...sugestao, passoId: 'p9' }), 'nao-encontrado');
  assert.equal(repararLocalizador(bloco, { ...sugestao, usado: { tipo: 'css', valor: 'div' } }), 'nao-encontrado');
  assert.equal(estadoDoReparo(undefined, sugestao), 'nao-encontrado');
});

test('as sugestões de vários casos são juntadas por passo', () => {
  const s = (blocoId: string, usado: Localizador): SugestaoReparo => ({ blocoId, blocoNome: blocoId, passoId: 'p1', passoDescricao: 'Valor', falhou: velho, usado });
  const juntas = juntarReparos([[s('b', id)], undefined, [s('b', id), s('c', etiqueta)], [s('b', etiqueta)]]);
  assert.deepEqual(
    juntas.map((j) => [j.blocoId, j.usado.tipo, j.casos]),
    [
      ['b', 'id', 2],
      ['c', 'etiqueta', 1],
      ['b', 'etiqueta', 1],
    ],
  );
});
