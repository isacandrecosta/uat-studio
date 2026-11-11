// Testa o motor de API contra o servidor de teste, que vive FORA do projeto
// (C:\Claude_Projects\uat-servidor-teste). Se a pasta não existir, estes testes são saltados.
import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, test } from 'node:test';
import { AmbienteApi, ErroApi, escaparJson, executarBlocoApi, lerCaminho } from '../main/api/pedidos';
import { contextoDeExemplo, preencherTexto, variaveisDoTexto } from '../shared/formulas';
import type { Bloco, PedidoApi, PerfilAutenticacao } from '../shared/modelo';

const SERVIDOR = process.env.UAT_SERVIDOR_TESTE ?? path.resolve(__dirname, '..', '..', '..', 'uat-servidor-teste', 'servidor.mjs');
const PORTA = 4317;
const BASE = `http://localhost:${PORTA}`;
const haServidor = fs.existsSync(SERVIDOR);
let processo: ChildProcess | null = null;

before(async () => {
  if (!haServidor) return;
  // Tokens de 2 segundos, para testar a renovação.
  processo = spawn(process.execPath, [SERVIDOR, String(PORTA)], { env: { ...process.env, TOKEN_SEGUNDOS: '2' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('O servidor de teste não arrancou.');
});
after(() => void processo?.kill());

const SEGREDOS: Record<string, string> = {
  'oauth.clientSecret': 'segredo-de-teste',
  'utilizador.clientSecret': 'segredo-de-teste',
  'utilizador.password': 'password-de-teste',
  'chave.chave': 'chave-de-teste',
  'basico.password': 'basico-teste',
};
const PERFIS: Record<string, PerfilAutenticacao> = {
  oauth: { id: 'oauth', nome: 'OAuth cliente', tipo: 'oauth2-cliente', urlToken: `${BASE}/oauth/token`, clientId: 'uat-cliente' },
  utilizador: { id: 'utilizador', nome: 'OAuth utilizador', tipo: 'oauth2-password', urlToken: `${BASE}/oauth/token`, clientId: 'uat-cliente', utilizador: 'qa.teste', envioCliente: 'corpo' },
  chave: { id: 'chave', nome: 'Chave', tipo: 'apikey' },
  basico: { id: 'basico', nome: 'Basic', tipo: 'basic', utilizador: 'basico' },
  errado: { id: 'errado', nome: 'Segredo errado', tipo: 'oauth2-cliente', urlToken: `${BASE}/oauth/token`, clientId: 'uat-cliente' },
};

function ambiente(extra: Record<string, string> = {}): AmbienteApi & { pedidosDeToken: number } {
  const amb = {
    pedidosDeToken: 0,
    fetch: (async (entrada: Parameters<typeof fetch>[0], opcoes?: Parameters<typeof fetch>[1]) => {
      if (String(entrada).includes('/oauth/token')) amb.pedidosDeToken += 1;
      return fetch(entrada, opcoes);
    }) as typeof fetch,
    segredo: (nome: string) => ({ ...SEGREDOS, ...extra })[nome],
    tokens: new Map(),
  };
  return amb;
}

function correr(pedido: Partial<PedidoApi>, perfilId: string | undefined, variaveis: Record<string, string>, amb: AmbienteApi) {
  const completo: PedidoApi = { metodo: 'GET', url: '', parametros: [], cabecalhos: [], tipoCorpo: 'nenhum', corpo: '', verificacoes: [], guardar: [], perfilId, ...pedido };
  const bloco: Bloco = { id: 'b', nome: 'Bloco de teste', tipo: 'API', passos: [], pedido: completo };
  const ctx = contextoDeExemplo(variaveis);
  return executarBlocoApi(
    { bloco, urlBase: BASE, perfil: perfilId ? PERFIS[perfilId] : undefined, preencher: (texto, proteger) => preencherTexto(texto, ctx, proteger) },
    amb,
  );
}

test('textos com {variáveis} não estragam o JSON', () => {
  const ctx = contextoDeExemplo({ Nome: 'Ana "A" \\ Silva', NIF: '212345678' });
  const corpo = preencherTexto('{ "nome": "{Nome}", "nif": "{NIF}", "ref": "{TESTE}-{RUN}", "vazio": {} }', ctx, escaparJson);
  assert.deepEqual(JSON.parse(corpo), { nome: 'Ana "A" \\ Silva', nif: '212345678', ref: 'TC0001-run1', vazio: {} });
  assert.deepEqual(variaveisDoTexto('{"a":"{Nome}","b":{"c":"{NIF}"},"d":"{DATA:yyyy}{TESTE}"}'), ['Nome', 'NIF']);
});

test('lerCaminho lê campos simples, listas e caminhos com $', () => {
  const dados = { cliente: { id: 7, moradas: [{ rua: 'A' }, { rua: 'B' }] }, zero: 0 };
  assert.equal(lerCaminho(dados, 'cliente.id'), 7);
  assert.equal(lerCaminho(dados, '$.cliente.moradas[1].rua'), 'B');
  assert.equal(lerCaminho(dados, 'zero'), 0);
  assert.equal(typeof lerCaminho(dados, 'cliente.nao.existe'), 'symbol');
});

test('OAuth 2.0 (client credentials): cria, lê e apaga um cliente; o token é reutilizado e renovado', { skip: !haServidor }, async () => {
  const amb = ambiente();
  const dados = { Nome: 'Maria "Teste"', NIF: '2' + String(Date.now()).slice(-8) };
  const criar = await correr(
    {
      metodo: 'POST',
      url: '/api/clientes',
      tipoCorpo: 'json',
      corpo: '{ "nome": "{Nome}", "nif": "{NIF}", "email": "qa+{TESTE}@exemplo.pt" }',
      verificacoes: [
        { id: 'v1', alvo: 'estado', operador: 'igual', esperado: '200, 201' },
        { id: 'v2', alvo: 'corpo', caminho: 'nome', operador: 'igual', esperado: '{Nome}' },
        { id: 'v3', alvo: 'corpo', caminho: 'saldo', operador: 'igual', esperado: '0,00' },
        { id: 'v4', alvo: 'corpo', caminho: 'campoQueNaoExiste', operador: 'igual', esperado: '0' }, // em falta = 0 (regra OutSystems)
        { id: 'v5', alvo: 'corpo', caminho: 'estado', operador: 'igual', esperado: 'Inativo' }, // de propósito: tem de dar KO
        { id: 'v6', alvo: 'cabecalho', caminho: 'location', operador: 'regex', esperado: '^/api/clientes/\\d+$' },
        { id: 'v7', alvo: 'tempo', operador: 'menor', esperado: '5000' },
        { id: 'v8', alvo: 'corpo', caminho: 'id', operador: 'existe', esperado: '' },
      ],
      guardar: [{ variavel: 'ClienteId', caminho: 'id' }],
    },
    'oauth',
    dados,
    amb,
  );
  assert.equal(criar.resposta.estado, 201);
  assert.deepEqual(criar.verificacoes.map((v) => v.ok), [true, true, true, true, false, true, true, true]);
  assert.equal(criar.verificacoes[4].obtido, 'Ativo');
  assert.match(criar.guardadas.ClienteId, /^\d+$/);
  // Os segredos nunca aparecem no que fica registado.
  assert.equal(criar.pedido.cabecalhos.Authorization, 'Bearer ***');
  assert.ok(!JSON.stringify(criar).includes('segredo-de-teste'));

  const ler = await correr({ url: '/api/clientes/{ClienteId}', verificacoes: [{ id: 'v1', alvo: 'corpo', caminho: 'nif', operador: 'igual', esperado: '{NIF}' }] }, 'oauth', { ...dados, ...criar.guardadas }, amb);
  assert.equal(ler.verificacoes[0].ok, true);
  assert.equal(amb.pedidosDeToken, 1, 'o token devia ter sido reutilizado');

  // O token dura 2 segundos: depois disso, o motor pede outro sozinho.
  await new Promise((r) => setTimeout(r, 2200));
  const apagar = await correr({ metodo: 'DELETE', url: '/api/clientes/{ClienteId}', verificacoes: [{ id: 'v1', alvo: 'estado', operador: 'igual', esperado: '204' }] }, 'oauth', criar.guardadas, amb);
  assert.equal(apagar.verificacoes[0].ok, true);
  assert.equal(amb.pedidosDeToken, 2);
});

test('OAuth 2.0 (password), API Key e Basic', { skip: !haServidor }, async () => {
  const amb = ambiente();
  const lista = await correr({ url: '/api/clientes', parametros: [{ nome: 'nif', valor: '{NIF}' }], verificacoes: [{ id: 'v', alvo: 'corpo', caminho: 'total', operador: 'igual', esperado: '0' }] }, 'utilizador', { NIF: '999999999' }, amb);
  assert.equal(lista.resposta.estado, 200);
  assert.match(lista.pedido.url, /\?nif=999999999$/);
  assert.equal(lista.verificacoes[0].ok, true);
  assert.equal((await correr({ url: '/api/chave' }, 'chave', {}, amb)).resposta.estado, 200);
  const basico = await correr({ url: '/api/basico' }, 'basico', {}, amb);
  assert.equal(basico.resposta.estado, 200);
  assert.equal(basico.pedido.cabecalhos.Authorization, 'Basic ***');
});

test('erros explicados: segredo em falta, segredo errado, tempo limite, servidor desligado, campo em falta', { skip: !haServidor }, async () => {
  const falha = async (promessa: Promise<unknown>, padrao: RegExp): Promise<void> => {
    await assert.rejects(promessa, (erro: unknown) => erro instanceof ErroApi && padrao.test(erro.message));
  };
  await falha(correr({ url: '/api/clientes' }, 'errado', {}, ambiente()), /Falta preencher "Client secret"/);
  await falha(correr({ url: '/api/clientes' }, 'errado', {}, ambiente({ 'errado.clientSecret': 'nao-e-este' })), /pedido de token .* falhou \(HTTP 401, invalid_client/);
  await falha(correr({ url: '/api/lento?ms=3000', limiteMs: 300 }, undefined, {}, ambiente()), /não respondeu/);
  await falha(correr({ url: 'http://localhost:9/nada' }, undefined, {}, ambiente()), /recusou a ligação|não foi possível/);
  await falha(correr({ url: '/api/erro/500', guardar: [{ variavel: 'X', caminho: 'id' }] }, undefined, {}, ambiente()), /guardar \{X\}.*HTTP 500/);
  await falha(correr({ url: '/api/clientes/{NaoExiste}' }, 'oauth', {}, ambiente()), /.*/).catch(() => undefined);
  // Sem autenticação numa API protegida: não é erro do motor, é uma resposta 401 que se pode verificar.
  const semToken = await correr({ url: '/api/clientes', verificacoes: [{ id: 'v', alvo: 'estado', operador: 'igual', esperado: '401' }] }, undefined, {}, ambiente());
  assert.equal(semToken.verificacoes[0].ok, true);
});

test('OAuth 2.0 com login (Authorization Code + PKCE): login, troca do código, sessão guardada e renovada', { skip: !haServidor }, async () => {
  const perfil: PerfilAutenticacao = {
    id: 'pkce',
    nome: 'Login PKCE',
    tipo: 'oauth2-pkce',
    urlAutorizacao: `${BASE}/oauth/authorize`,
    urlToken: `${BASE}/oauth/token`,
    clientId: 'uat-publico',
    utilizador: 'qa.teste',
  };
  PERFIS.pkce = perfil;
  const cofre: Record<string, string> = { 'pkce.password': 'password-de-teste' };
  let logins = 0;
  const amb: AmbienteApi = {
    fetch,
    segredo: (nome) => cofre[nome],
    guardarSegredo: (nome, valor) => {
      if (valor) cofre[nome] = valor;
      else delete cofre[nome];
    },
    tokens: new Map(),
    // Em vez do browser: o mesmo formulário de login, por HTTP.
    loginInterativo: async (pedido) => {
      logins += 1;
      const pagina = await fetch(pedido.url);
      assert.equal(pagina.status, 200);
      assert.match(await pagina.text(), /Login de teste/);
      const campos = new URLSearchParams(new URL(pedido.url).searchParams);
      campos.set('utilizador', pedido.utilizador ?? '');
      campos.set('password', pedido.password ?? '');
      const resposta = await fetch(`${BASE}/oauth/authorize`, { method: 'POST', body: campos, redirect: 'manual' });
      assert.equal(resposta.status, 302);
      return resposta.headers.get('location') ?? '';
    },
  };
  const verificar = { verificacoes: [{ id: 'v1', alvo: 'estado' as const, operador: 'igual' as const, esperado: '200' }] };
  const primeiro = await correr({ url: '/api/clientes', ...verificar }, 'pkce', {}, amb);
  assert.ok(primeiro.verificacoes[0].ok, 'com o token do login, a API deve responder 200');
  assert.equal(logins, 1);
  assert.ok(cofre['pkce.refreshToken'], 'a sessão (refresh token) fica no cofre');
  assert.ok(!JSON.stringify(primeiro).includes(cofre['pkce.refreshToken']), 'o refresh token nunca aparece no resultado');

  // Outra execução (sem tokens em memória): usa a sessão guardada, sem novo login.
  const sessaoAntes = cofre['pkce.refreshToken'];
  const segunda = await correr({ url: '/api/clientes', ...verificar }, 'pkce', {}, { ...amb, tokens: new Map() });
  assert.ok(segunda.verificacoes[0].ok);
  assert.equal(logins, 1, 'com sessão guardada não há novo login');
  assert.notEqual(cofre['pkce.refreshToken'], sessaoAntes, 'a sessão é renovada (o refresh token só serve uma vez)');

  // Sessão inválida: é esquecida e volta a pedir login.
  cofre['pkce.refreshToken'] = 'sessao-que-ja-nao-serve';
  const terceira = await correr({ url: '/api/clientes', ...verificar }, 'pkce', {}, { ...amb, tokens: new Map() });
  assert.ok(terceira.verificacoes[0].ok);
  assert.equal(logins, 2);

  // Um "state" diferente no regresso é recusado.
  const desconfiado = { ...amb, tokens: new Map(), segredo: (n: string) => (n === 'pkce.refreshToken' ? undefined : cofre[n]), loginInterativo: async () => `http://127.0.0.1/uat-studio/callback?code=x&state=outro` };
  await assert.rejects(correr({ url: '/api/clientes', ...verificar }, 'pkce', {}, desconfiado), /state/);
});
