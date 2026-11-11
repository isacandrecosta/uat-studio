// Verificação de arranque (--verificar-arranque=ficheiro): prova que a app (por exemplo, o .exe portátil)
// abre a janela e consegue controlar o Edge. Escreve o resultado num ficheiro JSON e fecha a app.
import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import { chromium } from 'playwright-core';

export function ficheiroDeVerificacao(): string | null {
  const arg = process.argv.find((a) => a.startsWith('--verificar-arranque='));
  return arg ? arg.slice('--verificar-arranque='.length) : null;
}

export async function verificarArranque(janela: BrowserWindow, ficheiro: string): Promise<void> {
  const resultado: Record<string, unknown> = { versao: app.getVersion(), electron: process.versions.electron, empacotada: app.isPackaged };
  try {
    // A interface abriu e mostrou o ecrã inicial?
    const fim = Date.now() + 20_000;
    let vista = '';
    while (Date.now() < fim && !vista) {
      vista = await janela.webContents.executeJavaScript('document.body.dataset.vista || ""').catch(() => '');
      if (!vista) await new Promise((r) => setTimeout(r, 200));
    }
    resultado.janela = vista;
    // Consegue controlar o Edge instalado (em background)?
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const pagina = await browser.newPage();
    await pagina.setContent('<p id="ok">ok</p>');
    resultado.edge = (await pagina.textContent('#ok')) === 'ok';
    resultado.versaoEdge = browser.version();
    await browser.close();
  } catch (erro) {
    resultado.erro = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
  }
  fs.writeFileSync(ficheiro, `${JSON.stringify(resultado, null, 2)}\n`, 'utf8');
  app.exit(resultado.janela && resultado.edge ? 0 : 1);
}
