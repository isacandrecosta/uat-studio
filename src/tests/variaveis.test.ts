import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Bloco, Jornada, Passo } from '../shared/modelo';
import { variaveisDaJornada, variaveisDoBloco } from '../shared/variaveis';

const usar = (id: string, nome: string): Passo => ({ id, acao: 'escrever', descricao: '', valor: { tipo: 'variavel', nome } });
const guardar = (id: string, nome: string): Passo => ({ id, acao: 'guardar', descricao: '', variavel: nome });
const bloco = (id: string, passos: Passo[]): Bloco => ({ id, nome: id, tipo: 'UI', passos });

test('variaveisDoBloco separa o que usa do que produz', () => {
  const b = bloco('b', [usar('p1', 'Nome'), guardar('p2', 'Id'), usar('p3', 'Id'), usar('p4', 'Nome'), usar('p5', 'NIF')]);
  assert.deepEqual(variaveisDoBloco(b), { usa: ['Nome', 'NIF'], produz: ['Id'] });
});

test('variaveisDaJornada respeita a ordem, os parâmetros e os blocos em falta', () => {
  const blocos = [
    bloco('registar', [usar('p1', 'Nome'), guardar('p2', 'ClienteId')]),
    bloco('consultar', [usar('p1', 'ClienteId'), usar('p2', 'Perfil'), usar('p3', 'Canal')]),
  ];
  const jornada: Jornada = {
    id: 'j',
    nome: 'J',
    epicoId: 'e',
    etiquetas: [],
    blocos: [
      { id: 'b1', blocoId: 'registar' },
      {
        id: 'b2',
        blocoId: 'consultar',
        parametros: { Perfil: { tipo: 'variavel', nome: 'PerfilBO' }, Canal: { tipo: 'fixo', valor: 'Web' } },
      },
      { id: 'b3', blocoId: 'apagado' },
    ],
  };
  assert.deepEqual(variaveisDaJornada(jornada, blocos), {
    necessarias: ['Nome', 'PerfilBO'],
    produzidas: ['ClienteId'],
    calculadas: [],
    blocosEmFalta: ['apagado'],
  });
});

test('variáveis calculadas e fórmulas contam para o que a jornada precisa', () => {
  const blocos = [
    bloco('b', [
      usar('p1', 'Referencia'),
      { id: 'p2', acao: 'escrever', descricao: '', valor: { tipo: 'formula', expressao: '{Valor} * 2 & {TESTE} & {DATA:yyyy}' } },
    ]),
  ];
  const jornada: Jornada = { id: 'j', nome: 'J', epicoId: 'e', etiquetas: [], blocos: [{ id: 'b1', blocoId: 'b' }] };
  const calculadas = [
    { nome: 'Referencia', formula: '"x_" & {Nome} & {Sufixo}' },
    { nome: 'Sufixo', formula: '{CONTADOR:s}' },
  ];
  assert.deepEqual(variaveisDaJornada(jornada, blocos, calculadas), {
    necessarias: ['Nome', 'Valor'],
    produzidas: [],
    calculadas: ['Referencia', 'Sufixo'],
    blocosEmFalta: [],
  });
});
