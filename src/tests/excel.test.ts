import ExcelJS from 'exceljs';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { exportarCasos, importarCasos } from '../main/excel/casosExcel';
import { planear } from '../main/executor/execucao';
import { criarExemplo } from '../main/projeto/exemplo';
import * as repo from '../main/projeto/repositorio';

const pastaTemporaria = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-excel-'));

test('importar um Excel: colunas especiais, números, fórmulas e Executar = N', async () => {
  const pasta = pastaTemporaria();
  const ficheiro = path.join(pasta, 'casos.xlsx');
  const livro = new ExcelJS.Workbook();
  const folha = livro.addWorksheet('Casos');
  folha.addRow(['ID', 'Descrição', 'Variante', 'Valor', 'PrestacaoEsperada', 'Etiquetas', 'Executar']);
  folha.addRow(['TC0001', 'Mínimo', 'CP12', 500, 43.38, 'CP, aprovado', 'S']);
  folha.addRow(['TC0002', 'Ignorado', 'CP12', 1000, 86.76, '', 'N']);
  folha.addRow(['TC0003', 'Com fórmula', 'ZERO', 863.61, { formula: 'D4/10', result: 86.361 }, '', '']);
  await livro.xlsx.writeFile(ficheiro);

  const { conjunto, ignorados } = await importarCasos(ficheiro, 'simular');
  assert.equal(ignorados, 1);
  assert.deepEqual(conjunto.colunas, ['Variante', 'Valor', 'PrestacaoEsperada']);
  assert.deepEqual(conjunto.casos.map((c) => c.id), ['TC0001', 'TC0003']);
  assert.deepEqual(conjunto.casos[0], {
    id: 'TC0001',
    nome: 'Mínimo',
    etiquetas: ['CP', 'aprovado'],
    dados: { Variante: 'CP12', Valor: '500', PrestacaoEsperada: '43.38' },
  });
  assert.equal(conjunto.casos[1].dados.PrestacaoEsperada, '86.361');

  // Exportar e voltar a importar dá os mesmos casos.
  const copia = path.join(pasta, 'copia.xlsx');
  await exportarCasos(copia, conjunto);
  assert.deepEqual((await importarCasos(copia, 'simular')).conjunto, conjunto);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('planear escolhe os casos por jornada, ids e etiquetas', () => {
  const pasta = pastaTemporaria();
  repo.criarProjeto(pasta, 'P');
  criarExemplo(pasta);
  assert.equal(planear(pasta, {}).itens.length, 8);
  assert.equal(planear(pasta, {}).nome, 'Tudo');
  assert.equal(planear(pasta, { jornadaIds: ['simular-credito'] }).nome, 'Simular crédito');
  assert.equal(planear(pasta, { epicoIds: ['outro'] }).itens.length, 0);
  assert.deepEqual(
    planear(pasta, { chavesCasos: ['simular-credito/TC0002', 'simular-credito/TC0005'] }).itens.map((i) => i.caso.id),
    ['TC0002', 'TC0005'],
  );
  assert.deepEqual(planear(pasta, { etiquetas: ['Rejeitado'] }).itens.map((i) => i.caso.id), ['TC0003', 'TC0006']);
  fs.rmSync(pasta, { recursive: true, force: true });
});
