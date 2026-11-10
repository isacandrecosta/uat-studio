import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { criarExemplo } from '../main/projeto/exemplo';
import * as repo from '../main/projeto/repositorio';

function pastaTemporaria(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-teste-'));
}

test('criarSlug tira acentos, espaços e símbolos', () => {
  assert.equal(repo.criarSlug('Crédito Pessoal 2'), 'credito-pessoal-2');
  assert.equal(repo.criarSlug('  Login FO!  '), 'login-fo');
  assert.equal(repo.criarSlug('???'), 'item');
});

test('criar projeto, guardar, listar e apagar itens', () => {
  const pasta = pastaTemporaria();
  const projeto = repo.criarProjeto(pasta, 'Projeto de teste');
  assert.equal(projeto.ambienteAtivo, 'qa');
  assert.ok(fs.existsSync(path.join(pasta, 'projeto.json')));

  const epico = repo.guardar(pasta, 'epicos', { nome: 'Crédito Pessoal' });
  assert.equal(epico.id, 'credito-pessoal');
  // Um segundo item com o mesmo nome recebe outro id (não substitui o primeiro).
  assert.equal(repo.guardar(pasta, 'epicos', { nome: 'Crédito Pessoal' }).id, 'credito-pessoal-2');
  // Guardar com id altera o item existente.
  repo.guardar(pasta, 'epicos', { id: epico.id, nome: 'Crédito ao consumo' });
  assert.equal(repo.ler(pasta, 'epicos', epico.id).nome, 'Crédito ao consumo');

  assert.deepEqual(repo.listar(pasta, 'epicos').map((e) => e.id), ['credito-pessoal', 'credito-pessoal-2']);
  assert.equal(repo.obterEstado(pasta).contagens.epicos, 2);

  repo.apagar(pasta, 'epicos', 'credito-pessoal-2');
  assert.equal(repo.listar(pasta, 'epicos').length, 1);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('recusa ids e pastas perigosos', () => {
  const pasta = pastaTemporaria();
  repo.criarProjeto(pasta, 'P');
  assert.throws(() => repo.ler(pasta, 'epicos', '../projeto'), repo.ErroProjeto);
  assert.throws(() => repo.guardar(pasta, 'epicos', { id: '..\\x', nome: 'x' }), repo.ErroProjeto);
  assert.throws(() => repo.listar(pasta, '../fora' as never), repo.ErroProjeto);
  assert.throws(() => repo.criarProjeto(pasta, 'Outra vez'), /já tem um projeto/);
  assert.throws(() => repo.lerProjeto(path.join(pasta, 'nao-existe')), /não tem um projeto/);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('projeto de exemplo fica completo e coerente', () => {
  const pasta = pastaTemporaria();
  repo.criarProjeto(pasta, 'Exemplo');
  criarExemplo(pasta);
  const estado = repo.obterEstado(pasta);
  assert.equal(estado.projeto.ambienteAtivo, 'dev');
  assert.deepEqual(estado.contagens, { aplicacoes: 2, epicos: 1, jornadas: 1, blocos: 1, casos: 1, perfis: 0 });

  const jornada = repo.ler(pasta, 'jornadas', 'simular-credito');
  assert.ok(repo.existe(pasta, 'epicos', jornada.epicoId));
  for (const b of jornada.blocos) assert.ok(repo.existe(pasta, 'blocos', b.blocoId));

  const casos = repo.ler(pasta, 'casos', jornada.id);
  assert.equal(casos.casos.length, 6);
  // ZERO, 10 meses sem juros: 863,61 / 10 = 86,361 → 86,36; comissão 3% = 25,9083 → 25,91
  const tc5 = casos.casos.find((c) => c.id === 'TC0005');
  assert.equal(tc5?.dados.PrestacaoEsperada, '86,36');
  assert.equal(tc5?.dados.ComissaoEsperada, '25,91');
  fs.rmSync(pasta, { recursive: true, force: true });
});
