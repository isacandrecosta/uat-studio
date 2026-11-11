import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { criarExemplo } from '../main/projeto/exemplo';
import * as repo from '../main/projeto/repositorio';
import { contar, estadoDoBlocoNoCaso, fotografarJornadas, juntarEstados, resumoContagem } from '../shared/mapa';
import type { ResultadoCaso } from '../shared/modelo';

test('a fotografia das jornadas tem os blocos com aplicação, cor, condição e limpeza', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-mapa-'));
  try {
    repo.criarProjeto(pasta, 'P');
    criarExemplo(pasta);
    const jornada = repo.ler(pasta, 'jornadas', 'simular-e-validar');
    jornada.blocos[1].condicao = '{EstadoEsperado} = "Aprovado"';
    jornada.blocos[2].sempre = true;
    jornada.blocos.push({ id: 'bx', blocoId: 'apagado' });
    const [foto] = fotografarJornadas([jornada], repo.listar(pasta, 'epicos'), repo.listar(pasta, 'blocos'), repo.listar(pasta, 'aplicacoes'));
    assert.equal(foto.epicoNome, 'Simulações de crédito');
    assert.deepEqual(
      foto.blocos.map((b) => [b.nome, b.tipo, b.aplicacaoNome, Boolean(b.condicional), Boolean(b.limpeza)]),
      [
        ['Simular crédito', 'UI', 'Simulador (Front Office)', false, false],
        ['Validar pedido no Backoffice', 'UI', 'Backoffice de Pedidos', true, false],
        ['Consultar pedido pela API', 'API', 'API de Pedidos', false, true],
        ['apagado (apagado)', 'UI', undefined, false, false],
      ],
    );
    assert.ok(foto.blocos[0].cor);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('a cor de um nó segue a gravidade dos estados', () => {
  assert.equal(juntarEstados(['ok', 'a-correr', 'erro']), 'a-correr');
  assert.equal(juntarEstados(['ok', 'ko', 'erro']), 'erro');
  assert.equal(juntarEstados(['ok', 'ko']), 'ko');
  assert.equal(juntarEstados(['ok', 'ok']), 'ok');
  assert.equal(juntarEstados(['ok', 'por-correr']), 'parcial');
  assert.equal(juntarEstados(['ok', 'ignorado']), 'ok');
  assert.equal(juntarEstados(['ignorado', 'ignorado']), 'ignorado');
  assert.equal(juntarEstados(['ignorado', 'nao-corrido']), 'nao-corrido');
  assert.equal(juntarEstados(['por-correr', 'ignorado']), 'por-correr');
  assert.equal(juntarEstados([]), 'por-correr');
});

test('contagens e estado de um bloco (também em execuções antigas, sem estados por bloco)', () => {
  assert.equal(resumoContagem(contar(['ok', 'ok', 'ko', 'por-correr'])), '2 OK · 1 KO · 1 por correr');
  const caso = { estado: 'KO', blocos: ['ok', 'ko'] } as unknown as ResultadoCaso;
  assert.equal(estadoDoBlocoNoCaso(caso, 1), 'ko');
  const antigo = { estado: 'PARADO' } as unknown as ResultadoCaso;
  assert.equal(estadoDoBlocoNoCaso(antigo, 0), 'nao-corrido');
});
