// Abre e controla o browser de testes com o Playwright.
// Usa o Edge (ou o Chrome) já instalado no PC: não depende do Chromium do Playwright.
import { chromium, Browser } from 'playwright-core';

export type CanalBrowser = 'msedge' | 'chrome';

export interface ResultadoAbrir {
  ok: boolean;
  /** Mensagem simples para mostrar na interface. */
  mensagem: string;
  /** Título da página aberta (quando correu bem). */
  titulo?: string;
}

/** App "cobaia" (POC em OutSystems ODC). */
export const URL_APP_POC =
  'https://personal-e5m9c9gh-dev.outsystems.app/SimuladorFinanceiroPOC';

let browserAtual: Browser | null = null;

export async function abrirBrowser(
  url: string = URL_APP_POC,
  canal: CanalBrowser = 'msedge',
): Promise<ResultadoAbrir> {
  const nome = canal === 'msedge' ? 'Edge' : 'Chrome';
  try {
    await fecharBrowser();

    const browser = await chromium.launch({ channel: canal, headless: false });
    browserAtual = browser;
    browser.on('disconnected', () => {
      if (browserAtual === browser) browserAtual = null;
    });

    const pagina = await browser.newPage();
    // A 1.ª abertura pode ser lenta (o ambiente ODC "acorda"): dar tempo.
    await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    // O OutSystems só põe o título depois de carregar o ecrã: esperar um pouco por ele.
    await pagina
      .waitForFunction(() => document.title.trim() !== '', undefined, { timeout: 15_000 })
      .catch(() => undefined);
    const titulo = await pagina.title();

    return { ok: true, mensagem: `${nome} aberto em "${titulo || url}".`, titulo };
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
    return { ok: false, mensagem: `Não foi possível abrir o ${nome}: ${detalhe}` };
  }
}

export async function fecharBrowser(): Promise<void> {
  const browser = browserAtual;
  browserAtual = null;
  if (browser) {
    await browser.close().catch(() => undefined);
  }
}
