import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compararComAnterior, matrizCobertura, ultimosResultados } from '../shared/cobertura';
import type { ConjuntoCasos, EstadoCaso, EstadoRun, Jornada } from '../shared/modelo';

function run(id: string, inicio: string, casos: Array<[string, EstadoCaso]>): EstadoRun {
  return {
    id,
    nome: id,
    ativo: false,
    aParar: false,
    emPausa: false,
    inicio,
    ambiente: 'QA',
    tipoAmbiente: 'QA',
    opcoes: { canal: 'msedge', visivel: false, paralelo: 1 },
    pasta: id,
    casos: casos.map(([chave, estado]) => {
      const [jornadaId, casoId] = chave.split('/');
      return { chave, jornadaId, jornadaNome: jornadaId.toUpperCase(), casoId, estado, diferencas: [], passos: [], variaveis: {}, duracaoMs: 0 };
    }),
  };
}

const historico = [
  run('run1', '2026-11-01T10:00:00Z', [['j1/A', 'OK'], ['j1/B', 'KO'], ['j2/C', 'OK']]),
  run('run2', '2026-11-02T10:00:00Z', [['j1/A', 'KO'], ['j1/B', 'PARADO']]),
  run('run3', '2026-11-03T10:00:00Z', [['j1/A', 'ERRO'], ['j1/B', 'OK'], ['j2/C', 'OK'], ['j2/D', 'KO']]),
];

test('último resultado de cada caso (parados e saltados não contam)', () => {
  const ultimos = ultimosResultados(historico.slice(0, 2));
  assert.equal(ultimos.get('j1/A')?.estado, 'KO');
  assert.equal(ultimos.get('j1/A')?.runId, 'run2');
  assert.equal(ultimos.get('j1/B')?.estado, 'KO');
  assert.equal(ultimos.get('j1/B')?.runId, 'run1');
});

test('comparar com as execuções anteriores', () => {
  const comparacao = compararComAnterior(historico[2], historico);
  assert.deepEqual(
    comparacao.map((c) => [c.chave, c.antes?.estado, c.agora, c.mudanca]),
    [
      ['j1/A', 'KO', 'ERRO', 'mudou'],
      ['j1/B', 'KO', 'OK', 'melhorou'],
      ['j2/C', 'OK', 'OK', 'igual'],
      ['j2/D', undefined, 'KO', 'novo'],
    ],
  );
  assert.equal(compararComAnterior(historico[1], historico)[0].mudanca, 'piorou');
});

test('matriz de cobertura por coluna, por caso e por etiqueta', () => {
  const jornadas: Jornada[] = [
    { id: 'j1', nome: 'J1', epicoId: 'e', etiquetas: [], blocos: [] },
    { id: 'j2', nome: 'J2', epicoId: 'e', etiquetas: [], blocos: [] },
    { id: 'j3', nome: 'Sem casos', epicoId: 'e', etiquetas: [], blocos: [] },
  ];
  const conjuntos: ConjuntoCasos[] = [
    { id: 'j1', colunas: ['Variante'], casos: [{ id: 'A', etiquetas: ['cp'], dados: { Variante: 'CP12' } }, { id: 'B', etiquetas: [], dados: { Variante: 'CP24' } }] },
    { id: 'j2', colunas: ['Variante'], casos: [{ id: 'C', etiquetas: ['cp'], dados: { Variante: 'CP12' } }, { id: 'E', etiquetas: [], dados: { Variante: 'CP12' } }] },
  ];
  const ultimos = ultimosResultados(historico);
  const porVariante = matrizCobertura(jornadas, conjuntos, ultimos, { tipo: 'coluna', coluna: 'Variante' });
  assert.deepEqual(porVariante.jornadas.map((j) => j.id), ['j1', 'j2']);
  assert.deepEqual(
    porVariante.linhas.map((l) => [l.variante, l.celulas.map((c) => c.estado)]),
    [
      ['CP12', ['ERRO', 'nunca']],
      ['CP24', ['OK', 'vazio']],
    ],
  );
  assert.deepEqual(porVariante.totais, { OK: 1, KO: 0, ERRO: 1, nunca: 1, vazio: 1 });

  const porCaso = matrizCobertura(jornadas, conjuntos, ultimos, { tipo: 'caso' });
  assert.deepEqual(porCaso.linhas.map((l) => l.variante), ['A', 'B', 'C', 'E']);
  const porEtiqueta = matrizCobertura(jornadas, conjuntos, ultimos, { tipo: 'etiqueta' });
  assert.deepEqual(porEtiqueta.linhas.map((l) => [l.variante, l.celulas.map((c) => c.estado)]), [
    ['(sem etiqueta)', ['OK', 'nunca']],
    ['cp', ['ERRO', 'OK']],
  ]);
});
