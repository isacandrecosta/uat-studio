import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aplicarMudancas, mudancasDosResultados } from '../shared/aceitar';
import type { ConjuntoCasos, EstadoRun, ResultadoCaso } from '../shared/modelo';

const caso = (casoId: string, valoresLidos: Record<string, string>): ResultadoCaso =>
  ({ chave: `j/${casoId}`, jornadaId: 'j', jornadaNome: 'J', casoId, estado: 'KO', diferencas: [], passos: [], variaveis: {}, duracaoMs: 1, valoresLidos }) as ResultadoCaso;

const conjuntos: ConjuntoCasos[] = [
  {
    id: 'j',
    colunas: ['Estado', 'Prestacao'],
    casos: [
      { id: 'TC1', etiquetas: [], dados: { Estado: 'Errado', Prestacao: '43,38' } },
      { id: 'TC2', etiquetas: [], dados: { Estado: 'Aprovado', Prestacao: '' } },
    ],
  },
];

test('aceitar: só muda onde o valor lido é diferente (números iguais em formatos diferentes não contam)', () => {
  const run = { casos: [caso('TC1', { Estado: 'Aprovado', Prestacao: '43.38' }), caso('TC2', { Estado: 'Aprovado', Prestacao: '86,40', Nova: 'x' })] } as unknown as EstadoRun;
  const mudancas = mudancasDosResultados(run, conjuntos);
  assert.deepEqual(
    mudancas.map((m) => `${m.casoId}.${m.coluna}: ${m.antes || '(vazio)'} → ${m.depois}`),
    ['TC1.Estado: Errado → Aprovado', 'TC2.Prestacao: (vazio) → 86,40', 'TC2.Nova: (vazio) → x'],
  );
  // Só alguns casos.
  assert.equal(mudancasDosResultados(run, conjuntos, ['j/TC1']).length, 1);
  const alterados = aplicarMudancas(conjuntos, mudancas);
  assert.equal(alterados.length, 1);
  assert.equal(alterados[0].casos[0].dados.Estado, 'Aprovado');
  assert.equal(alterados[0].casos[1].dados.Prestacao, '86,40');
  assert.ok(alterados[0].colunas.includes('Nova'));
  // O original não muda.
  assert.equal(conjuntos[0].casos[0].dados.Estado, 'Errado');
});
