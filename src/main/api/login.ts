// Login no browser para os perfis "OAuth 2.0 com login" (Authorization Code + PKCE).
// Abre o Edge na página de login; se o perfil tiver utilizador e password, tenta preencher sozinho
// (com MFA ou outro passo, o testador completa à mão). O regresso ao redirect_uri é apanhado antes
// de sair do browser, por isso não é preciso nenhum servidor local. Este browser não tem trace.
import { chromium, Page } from 'playwright-core';
import { ErroApi, LoginInterativo } from './pedidos';

const LIMITE_MS = 5 * 60_000;

const CAMPO_UTILIZADOR = [
  'input[autocomplete="username"]',
  'input[type="email"]',
  'input[name*="user" i]',
  'input[id*="user" i]',
  'input[name*="utilizador" i]',
  'input[id*="utilizador" i]',
  'input[name*="login" i]',
  'input[name*="email" i]',
].join(', ');

/** Tenta preencher o formulário de login (também em 2 passos: primeiro o utilizador, depois a password). */
async function preencherLogin(pagina: Page, utilizador: string | undefined, password: string | undefined): Promise<void> {
  const visivel = async (seletor: string, ms: number) => {
    const campo = pagina.locator(seletor).filter({ visible: true }).first();
    return (await campo.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)) ? campo : null;
  };
  const campoPassword = 'input[type="password"]';
  if (utilizador) {
    const campo = await visivel(CAMPO_UTILIZADOR, 10_000);
    if (campo) {
      await campo.fill(utilizador);
      // Login em 2 passos (por exemplo, Microsoft): sem password à vista, avança com Enter.
      if (!(await visivel(campoPassword, 500))) await campo.press('Enter');
    }
  }
  if (password) {
    const campo = await visivel(campoPassword, 10_000);
    if (campo) {
      await campo.fill(password);
      await campo.press('Enter');
    }
  }
}

/** Abre o login no browser e devolve o endereço de regresso (com o código). */
export async function loginNoBrowser(pedido: LoginInterativo, canal: 'msedge' | 'chrome' = 'msedge'): Promise<string> {
  const browser = await chromium.launch({ channel: canal, headless: false }).catch((erro: unknown) => {
    throw new ErroApi(`Não foi possível abrir o browser para o login do perfil "${pedido.perfilNome}": ${erro instanceof Error ? erro.message.split('\n')[0] : String(erro)}`);
  });
  try {
    const contexto = await browser.newContext();
    const regresso = pedido.redirectUri.split(/[?#]/)[0];
    let final: string | null = null;
    // O regresso nunca chega à rede: é apanhado aqui e mostra uma página simples.
    await contexto.route(
      (url) => url.href.startsWith(regresso),
      async (rota) => {
        final = rota.request().url();
        await rota.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif">Login feito. O UAT Studio continua sozinho.</p>' });
      },
    );
    const pagina = await contexto.newPage();
    await pagina.goto(pedido.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (pedido.utilizador || pedido.password) void preencherLogin(pagina, pedido.utilizador, pedido.password).catch(() => undefined);
    const fim = Date.now() + LIMITE_MS;
    while (!final && Date.now() < fim && browser.isConnected()) await new Promise((r) => setTimeout(r, 200));
    if (!final) {
      throw new ErroApi(
        browser.isConnected()
          ? `O login do perfil "${pedido.perfilNome}" não terminou em ${LIMITE_MS / 60_000} minutos.`
          : `O browser do login do perfil "${pedido.perfilNome}" foi fechado antes de terminar.`,
      );
    }
    return final;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
