import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { verificarAntesDeCorrer } from '../main/executor/verificar';
import { criarExemplo } from '../main/projeto/exemplo';
import * as repo from '../main/projeto/repositorio';
import { criarWiki } from '../main/projeto/wiki';

function projetoDeExemplo(): string {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-verificar-'));
  repo.criarProjeto(pasta, 'P');
  criarExemplo(pasta);
  return pasta;
}
const semSegredos = { segredosPreenchidos: (nomes: string[]) => Object.fromEntries(nomes.map((n) => [n, false])) };

test('o projeto de exemplo passa na verificação', async () => {
  const pasta = projetoDeExemplo();
  const resultado = await verificarAntesDeCorrer(pasta, {}, semSegredos);
  assert.equal(resultado.casos, 8);
  assert.deepEqual(resultado.problemas, []);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('a Wiki de componentes passa na verificação e cada receita explica como se faz', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-wiki-'));
  repo.criarProjeto(pasta, 'Wiki');
  criarWiki(pasta);
  const resultado = await verificarAntesDeCorrer(pasta, {}, semSegredos);
  assert.deepEqual(resultado.problemas.filter((p) => p.gravidade === 'erro'), []);
  const receitas = repo.listar(pasta, 'blocos').filter((b) => b.id.startsWith('receita-'));
  assert.ok(receitas.length >= 5);
  for (const r of receitas) assert.match(r.descricao ?? '', /COMO:.*ARMADILHA/s, r.id);
  // Cada receita tem uma jornada de prova com um caso.
  const jornadas = repo.listar(pasta, 'jornadas');
  for (const r of receitas) assert.ok(jornadas.some((j) => j.blocos.some((b) => b.blocoId === r.id)), r.id);
  assert.equal(resultado.casos, receitas.length);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('a verificação encontra o que impede de correr', async () => {
  const pasta = projetoDeExemplo();
  // Coluna em falta nos casos.
  const casos = repo.ler(pasta, 'casos', 'simular-credito');
  casos.colunas = casos.colunas.filter((c) => c !== 'Valor');
  repo.guardar(pasta, 'casos', casos);
  // Fórmula mal escrita num passo, e bloco apagado numa jornada.
  const bloco = repo.ler(pasta, 'blocos', 'simular-credito');
  bloco.passos[2].condicao = '{Variante} = "CP12" e';
  repo.guardar(pasta, 'blocos', bloco);
  repo.apagar(pasta, 'blocos', 'validar-no-backoffice');
  // Bloco de API com um perfil sem segredo, e aplicação sem endereço neste ambiente.
  repo.guardar(pasta, 'perfis', { id: 'oauth', nome: 'OAuth QA', tipo: 'oauth2-cliente', urlToken: 'http://localhost:1/token', clientId: 'x' });
  const api = repo.ler(pasta, 'blocos', 'consultar-pedido-api');
  if (api.pedido) api.pedido.perfilId = 'oauth';
  repo.guardar(pasta, 'blocos', api);
  const aplicacao = repo.ler(pasta, 'aplicacoes', 'api-pedidos');
  aplicacao.urls = {};
  repo.guardar(pasta, 'aplicacoes', aplicacao);
  repo.gravarVariaveis(pasta, [{ nome: 'Ref', formula: '"a" &' }]);

  const { problemas } = await verificarAntesDeCorrer(pasta, {}, semSegredos);
  const tem = (onde: RegExp, mensagem: RegExp): boolean => problemas.some((p) => p.gravidade === 'erro' && onde.test(p.onde) && mensagem.test(p.mensagem));
  assert.ok(tem(/Jornada "Simular crédito"/, /Falta a coluna "Valor" nos casos/), JSON.stringify(problemas, null, 1));
  assert.ok(tem(/Bloco "Simular crédito"/, /fórmula com erro/));
  assert.ok(tem(/Jornada "Simular e validar no Backoffice"/, /bloco "validar-no-backoffice", que já não existe/));
  assert.ok(tem(/Perfil de autenticação "OAuth QA"/, /Falta preencher neste PC: Client secret/));
  assert.ok(tem(/Aplicação "API de Pedidos"/, /Não tem endereço no ambiente DEV/));
  assert.ok(tem(/Variável calculada \{Ref\}/, /fórmula tem um erro/));

  // Escolhendo só a outra jornada, os problemas da primeira deixam de aparecer.
  const soUma = await verificarAntesDeCorrer(pasta, { jornadaIds: ['simular-e-validar'] }, semSegredos);
  assert.ok(!soUma.problemas.some((p) => /Falta a coluna "Valor"/.test(p.mensagem)));
  assert.equal(soUma.casos, 2);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('a verificação avisa quando um endereço não responde', async () => {
  const pasta = projetoDeExemplo();
  const buscar = (async (entrada: Parameters<typeof fetch>[0]) => {
    if (String(entrada).includes('/Backoffice')) throw new Error('net::ERR_CONNECTION_REFUSED');
    return new Response('ok');
  }) as typeof fetch;
  const { problemas } = await verificarAntesDeCorrer(pasta, {}, { ...semSegredos, fetch: buscar });
  assert.equal(problemas.length, 1);
  assert.match(problemas[0].onde, /Aplicação "Backoffice de Pedidos"/);
  assert.match(problemas[0].mensagem, /recusou a ligação/);
  fs.rmSync(pasta, { recursive: true, force: true });
});
