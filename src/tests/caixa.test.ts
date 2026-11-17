// Caixa de email de testes: endereços por papel, fórmulas {EMAIL:papel}, login com código (device code) e
// verificações do email (assunto, valores, anexos, link, "não deve chegar") contra o servidor de teste,
// que vive FORA do projeto. Sem a pasta do servidor, os testes com rede são saltados.
import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, test } from 'node:test';
import { enderecoDeTeste, mesmaCaixa } from '../shared/caixa';
import { avaliarFormula, contextoDeExemplo, preencherTexto } from '../shared/formulas';
import type { AmbienteApi } from '../main/api/pedidos';
import { apiDaCaixa, perfilDaCaixa, problemasDaCaixa, SESSAO_CAIXA } from '../main/email/caixaTestes';
import { lerEmail, linksDoEmail, valorDepoisDe } from '../main/email/email';
import type { Bloco, CaixaTestes } from '../shared/modelo';

const SERVIDOR = process.env.UAT_SERVIDOR_TESTE ?? path.resolve(__dirname, '..', '..', '..', 'uat-servidor-teste', 'servidor.mjs');
const PORTA = 4357;
const BASE = `http://localhost:${PORTA}`;
const haServidor = fs.existsSync(SERVIDOR);
let processo: ChildProcess | null = null;

before(async () => {
  if (!haServidor) return;
  processo = spawn(process.execPath, [SERVIDOR, String(PORTA)], { env: { ...process.env, PORTA_MTLS: '4367' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('O servidor de teste não arrancou.');
});
after(() => void processo?.kill());

const DIA = new Date(2026, 10, 13, 10, 30);

test('endereço de teste por papel, caso e data', () => {
  const caixa = { emailBase: 'emailteste@outlook.com' };
  assert.equal(enderecoDeTeste(caixa, 'Supervisor', { caso: 'CT01', run: 'run3', agora: DIA }), 'emailteste+supervisor_ct01_13112026@outlook.com');
  assert.equal(enderecoDeTeste({ ...caixa, formato: '{nome}+{papel}.{run}@{dominio}' }, 'Gestão de crédito', { caso: 'X', run: 'Run 7', agora: DIA }), 'emailteste+gestaodecredito.run7@outlook.com');
  assert.throws(() => enderecoDeTeste({ emailBase: 'sem-arroba' }, 'gestor', { caso: 'A', run: 'r', agora: DIA }), /não é um endereço válido/);
  assert.ok(mesmaCaixa('EmailTeste+gestor_x@outlook.com', 'emailteste@outlook.com'));
  assert.ok(!mesmaCaixa('outro+gestor@outlook.com', 'emailteste@outlook.com'));
});

test('fórmulas: {EMAIL:papel} e EMAIL("papel") usam a caixa de testes', () => {
  const ctx = { ...contextoDeExemplo({ TESTE: 'TC0002' }, {}, { emailBase: 'qa@exemplo.pt' }), agora: DIA };
  assert.equal(preencherTexto('{EMAIL:gestor}', ctx), 'qa+gestor_tc0002_13112026@exemplo.pt');
  assert.equal(avaliarFormula('EMAIL("cliente")', ctx), 'qa+cliente_tc0002_13112026@exemplo.pt');
  // Com 2 argumentos continua a dar o email único antigo (sem caixa de testes).
  assert.match(avaliarFormula('EMAIL("cliente"; "banco.pt")', ctx), /^qa\+cliente\.tc0002\.run1@banco\.pt$/);
  assert.throws(() => preencherTexto('{EMAIL:gestor}', contextoDeExemplo({})), /Falta definir a caixa de email de testes/);
});

test('caixa Microsoft: tenant, endereços e o que falta preencher', () => {
  const pessoal: CaixaTestes = { emailBase: 'emailteste@outlook.com', ligacao: 'microsoft', conta: 'pessoal', modoLogin: 'janela', clientId: 'abc' };
  const p = perfilDaCaixa(pessoal);
  assert.equal(p.urlAutorizacao, 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
  assert.equal(p.ambito, 'offline_access Mail.Read');
  assert.equal(p.modoLogin, 'janela');
  assert.deepEqual(apiDaCaixa(pessoal), { urlBase: 'https://graph.microsoft.com/v1.0', caminho: '/me/messages' });
  const empresa = perfilDaCaixa({ ...pessoal, conta: 'empresa', tenant: 'empresa.onmicrosoft.com' });
  assert.equal(empresa.urlDispositivo, 'https://login.microsoftonline.com/empresa.onmicrosoft.com/oauth2/v2.0/devicecode');
  assert.deepEqual(problemasDaCaixa({ ...pessoal, clientId: '' }), ['falta o Client ID da aplicação registada na Microsoft (pedir à IT)']);
  assert.deepEqual(problemasDaCaixa(undefined), ['falta definir a caixa de email de testes']);
});

test('links e valores dentro do email', () => {
  const email = { html: '<p>Montante: <b>1.234,56 €</b></p><a href="https://app.test/confirmar?id=7&amp;t=x">Confirmar</a><a href="mailto:x@y.pt">x</a>', texto: 'Montante: 1.234,56 €\nPrestação 86,40' };
  assert.deepEqual(linksDoEmail(email), ['https://app.test/confirmar?id=7&t=x']);
  assert.equal(valorDepoisDe(email.texto, 'montante:'), '1.234,56');
  assert.equal(valorDepoisDe(email.texto, 'Prestação'), '86,40');
  assert.equal(valorDepoisDe(email.texto, 'IBAN'), null);
});

/** Caixa simulada no servidor de teste, com login por código (o "telemóvel" é este teste a aprovar o código). */
const CAIXA: CaixaTestes = {
  emailBase: 'caixa.uat@exemplo.pt',
  ligacao: 'simulada',
  modoLogin: 'codigo',
  clientId: 'uat-publico',
  urlApi: `${BASE}/graph/v1.0`,
  urlToken: `${BASE}/oauth/token`,
  urlDispositivo: `${BASE}/oauth/devicecode`,
};

function ambiente(guardados: Map<string, string>, codigos: string[]): AmbienteApi {
  return {
    fetch,
    segredo: (n) => guardados.get(n),
    guardarSegredo: (n, v) => (v ? guardados.set(n, v) : guardados.delete(n)),
    tokens: new Map(),
    mostrarCodigo: (aviso) => {
      codigos.push(aviso.codigo);
      // Noutro "dispositivo": escreve o código e entra (na página do fornecedor, nunca na ferramenta).
      void fetch(aviso.url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ codigo: aviso.codigo, utilizador: 'qa.teste', password: 'password-de-teste' }).toString() });
      return { fechar: () => undefined, cancelado: () => false };
    },
  };
}

function bloco(email: Partial<NonNullable<Bloco['email']>>): Bloco {
  return { id: 'aprovacao', nome: 'Email de aprovação', tipo: 'EMAIL', passos: [], email: { caixa: '', esperaSeg: 8, ...email } };
}

test('caixa de testes: login com código, email por papel com assunto, valores, anexo e link', { skip: !haServidor }, async () => {
  const guardados = new Map<string, string>();
  const codigos: string[] = [];
  const ctx = contextoDeExemplo({ TESTE: 'TC0007', PedidoId: '557', Valor: '1234.56' }, {}, CAIXA);
  const gestor = preencherTexto('{EMAIL:gestor}', ctx);
  const desde = Date.now();
  const enviar = (dados: Record<string, unknown>) => fetch(`${BASE}/email/enviar`, { method: 'POST', body: JSON.stringify(dados) });
  // Um email para outro caso não pode ser apanhado.
  await enviar({ para: gestor.replace('tc0007', 'tc0008'), assunto: 'Pedido 557 aprovado', corpo: 'outro caso' });
  await enviar({
    para: gestor,
    de: 'app@banco.pt',
    assunto: 'Pedido 557 aprovado',
    corpo: '<p>Montante: 1.234,56 €</p><p>Prestação: 86,41</p><p><a href="http://localhost/confirmar?pedido=557">Confirmar</a></p>',
    anexos: ['contrato-557.pdf'],
    atrasoMs: 800,
  });
  const r = await lerEmail(
    {
      bloco: bloco({
        papel: 'gestor',
        assuntoIgual: 'Pedido {PedidoId} aprovado',
        valores: [
          { rotulo: 'Montante:', esperado: '{Valor}' },
          { rotulo: 'Prestação:', esperado: '86,40', tolerancia: '0,01' },
          { rotulo: 'Prestação:', esperado: '86,30' },
        ],
        anexos: ['contrato'],
        link: { variavel: 'LinkConfirmar', contem: 'confirmar' },
      }),
      preencher: (t) => preencherTexto(t, ctx),
      desde,
      intervaloMs: 200,
      caixaTestes: CAIXA,
    },
    ambiente(guardados, codigos),
  );
  assert.equal(codigos.length, 1, 'pediu um código de login');
  assert.ok(guardados.get(SESSAO_CAIXA), 'a sessão ficou guardada no cofre');
  assert.equal(r.endereco, gestor);
  assert.deepEqual(r.email?.para, [gestor]);
  assert.deepEqual(
    r.verificacoes.map((v) => [v.descricao, v.ok]),
    [
      ['O assunto é "Pedido 557 aprovado"', true],
      ['Valor "Montante:"', true],
      ['Valor "Prestação:"', true],
      ['Valor "Prestação:"', false],
      ['Tem o anexo "contrato"', true],
    ],
  );
  assert.equal(r.guardadas.LinkConfirmar, 'http://localhost/confirmar?pedido=557');

  // "Não deve chegar": nada para o supervisor deste caso → OK; e a sessão guardada evita novo login.
  const nada = await lerEmail(
    { bloco: bloco({ papel: 'supervisor', naoDeveChegar: true, esperaSeg: 1 }), preencher: (t) => preencherTexto(t, ctx), desde, intervaloMs: 200, caixaTestes: CAIXA },
    ambiente(guardados, codigos),
  );
  assert.equal(codigos.length, 1, 'reutilizou a sessão (sem novo código)');
  assert.equal(nada.email, undefined);
  assert.deepEqual(nada.verificacoes.map((v) => v.ok), [true]);
  // ...e para o gestor, que recebeu, dá KO.
  const chegou = await lerEmail(
    { bloco: bloco({ papel: 'gestor', naoDeveChegar: true, esperaSeg: 1 }), preencher: (t) => preencherTexto(t, ctx), desde, intervaloMs: 200, caixaTestes: CAIXA },
    ambiente(guardados, codigos),
  );
  assert.deepEqual(chegou.verificacoes.map((v) => v.ok), [false]);
});

test('caixa de testes: sem caixa definida, o erro diz o que falta', async () => {
  await assert.rejects(
    lerEmail({ bloco: bloco({ papel: 'gestor' }), preencher: (t) => t, desde: Date.now() }, { fetch, segredo: () => undefined, tokens: new Map() }),
    /caixa de email de testes do projeto não está pronta: falta definir/,
  );
});
