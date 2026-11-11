// Blocos de email contra a caixa de correio falsa (ao estilo do Microsoft Graph) do servidor de teste,
// que vive FORA do projeto. Se a pasta não existir, estes testes são saltados.
import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, test } from 'node:test';
import type { AmbienteApi } from '../main/api/pedidos';
import { htmlParaTexto, lerEmail } from '../main/email/email';
import { contextoDeExemplo, preencherTexto } from '../shared/formulas';
import type { Bloco, PerfilAutenticacao } from '../shared/modelo';

const SERVIDOR = process.env.UAT_SERVIDOR_TESTE ?? path.resolve(__dirname, '..', '..', '..', 'uat-servidor-teste', 'servidor.mjs');
const PORTA = 4337;
const BASE = `http://localhost:${PORTA}`;
const haServidor = fs.existsSync(SERVIDOR);
let processo: ChildProcess | null = null;

before(async () => {
  if (!haServidor) return;
  processo = spawn(process.execPath, [SERVIDOR, String(PORTA)], { env: { ...process.env, PORTA_MTLS: '4347' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('O servidor de teste não arrancou.');
});
after(() => void processo?.kill());

const perfil: PerfilAutenticacao = { id: 'graph', nome: 'Graph de teste', tipo: 'oauth2-cliente', urlToken: `${BASE}/oauth/token`, clientId: 'uat-cliente' };
const amb = (): AmbienteApi => ({ fetch, segredo: (n) => (n === 'graph.clientSecret' ? 'segredo-de-teste' : undefined), tokens: new Map() });
const enviar = (dados: Record<string, unknown>) => fetch(`${BASE}/email/enviar`, { method: 'POST', body: JSON.stringify(dados) });

function blocoEmail(email: NonNullable<Bloco['email']>): Bloco {
  return { id: 'mfa', nome: 'Código por email', tipo: 'EMAIL', passos: [], email: { perfilId: 'graph', ...email } };
}

test('HTML do email em texto', () => {
  assert.equal(htmlParaTexto('<p>Olá <b>Ana</b>,</p><p>O código é&nbsp;<span>123456</span> &amp; expira.</p>'), 'Olá Ana ,\nO código é 123456 & expira.');
});

test('bloco de email: espera pelo email, verifica o corpo e extrai o código de MFA', { skip: !haServidor }, async () => {
  const desde = Date.now();
  await enviar({ para: 'qa+outro@exemplo.pt', assunto: 'Outro assunto', corpo: '<p>Não é este</p>' });
  await enviar({ para: 'qa+TC0001@exemplo.pt', de: 'app@banco.pt', assunto: 'Código de acesso', corpo: '<p>Olá Ana,</p><p>O seu código é <b>482913</b>.</p><p>Pedido 557</p>', atrasoMs: 1500 });
  const ctx = contextoDeExemplo({ Nome: 'Ana', TESTE: 'TC0001' });
  const r = await lerEmail(
    {
      bloco: blocoEmail({
        caixa: 'qa@exemplo.pt',
        para: 'qa+{TESTE}@',
        assunto: 'código',
        esperaSeg: 10,
        corpoContem: ['Olá {Nome}', 'Pedido 999'],
        extrair: [
          { variavel: 'CodigoMfa', de: 'corpo', padrao: '(\\d{6})' },
          { variavel: 'Tipo', de: 'assunto', padrao: 'Código de (\\w+)' },
        ],
      }),
      urlBase: `${BASE}/graph/v1.0`,
      perfil,
      preencher: (t) => preencherTexto(t, ctx),
      desde,
      intervaloMs: 300,
    },
    amb(),
  );
  assert.ok(r.tentativas > 1, 'o email chegou com atraso: foi preciso esperar');
  assert.equal(r.email.de, 'app@banco.pt');
  assert.deepEqual(r.guardadas, { CodigoMfa: '482913', Tipo: 'acesso' });
  assert.deepEqual(r.verificacoes.map((v) => v.ok), [true, false], '"Pedido 999" não está no corpo: KO');
});

test('bloco de email: um email que não chega dá um erro claro; emails antigos não contam', { skip: !haServidor }, async () => {
  const base = { urlBase: `${BASE}/graph/v1.0`, perfil, preencher: (t: string) => t, intervaloMs: 200 };
  await assert.rejects(lerEmail({ ...base, bloco: blocoEmail({ caixa: 'qa@exemplo.pt', assunto: 'nunca vai chegar', esperaSeg: 1 }), desde: Date.now() }, amb()), /O email não chegou em 1 s à caixa qa@exemplo\.pt \(com o assunto "nunca vai chegar"\)/);
  await enviar({ para: 'qa@exemplo.pt', assunto: 'Antigo' });
  await new Promise((r) => setTimeout(r, 100));
  // O caso "começou" daqui a 5 minutos: o email de agora é antigo para ele.
  await assert.rejects(lerEmail({ ...base, bloco: blocoEmail({ caixa: 'qa@exemplo.pt', assunto: 'Antigo', esperaSeg: 1 }), desde: Date.now() + 300_000 }, amb()), /não chegou/);
  // Sem a expressão no corpo, não dá para continuar (por exemplo, sem o código de MFA).
  await enviar({ para: 'qa@exemplo.pt', assunto: 'Sem código', corpo: 'nada aqui' });
  await assert.rejects(
    lerEmail({ ...base, bloco: blocoEmail({ caixa: 'qa@exemplo.pt', assunto: 'Sem código', esperaSeg: 5, extrair: [{ variavel: 'Codigo', de: 'corpo', padrao: '(\\d{6})' }] }), desde: Date.now() - 1000 }, amb()),
    /Não encontrei "\(\\d\{6\}\)" no corpo do email, para guardar \{Codigo\}/,
  );
});
