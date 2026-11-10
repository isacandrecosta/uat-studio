// Processo principal do Electron: cria a janela e liga a interface ao Playwright.
import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { abrirBrowser, fecharBrowser } from './browser';

const RAIZ = path.join(__dirname, '..', '..');
const MODO_SMOKE = process.argv.includes('--smoke');

function criarJanela(): BrowserWindow {
  const janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'UAT Studio',
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  janela.setMenuBarVisibility(false);
  void janela.loadFile(path.join(RAIZ, 'src', 'renderer', 'index.html'));
  return janela;
}

ipcMain.handle('browser:abrir-poc', () => abrirBrowser());

// Teste rápido automático (npm run smoke): abre a janela, tira um print,
// abre o Edge na app POC, escreve o resultado na consola e fecha tudo.
async function correrSmoke(janela: BrowserWindow): Promise<void> {
  let codigo = 1;
  try {
    await new Promise<void>((resolve) => janela.webContents.once('did-finish-load', () => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      // O print é só uma ajuda: se falhar, o teste continua.
      const print = await janela.webContents.capturePage();
      const pasta = path.join(RAIZ, 'out');
      fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(path.join(pasta, 'smoke-janela.png'), print.toPNG());
    } catch (erro) {
      console.log(`[smoke] aviso: sem print da janela (${String(erro)})`);
    }
    const itens = await janela.webContents.executeJavaScript(
      "document.querySelectorAll('.menu-item').length",
    );
    console.log(`[smoke] itens no menu lateral: ${itens}`);

    // Clica no botão como um utilizador e espera pela mensagem de estado.
    const estado: { ok: boolean; texto: string } = await janela.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const estado = document.getElementById('estado-browser');
        document.getElementById('btn-abrir-poc').click();
        const espera = setInterval(() => {
          const ok = estado.classList.contains('ok');
          if (ok || estado.classList.contains('erro')) {
            clearInterval(espera);
            resolve({ ok, texto: estado.textContent });
          }
        }, 250);
      })
    `);
    console.log(`[smoke] ${estado.ok ? 'OK' : 'ERRO'}: ${estado.texto}`);
    codigo = estado.ok ? 0 : 1;
  } catch (erro) {
    console.log(`[smoke] ERRO: ${String(erro)}`);
  } finally {
    await fecharBrowser();
    app.exit(codigo);
  }
}

void app.whenReady().then(() => {
  const janela = criarJanela();
  if (MODO_SMOKE) void correrSmoke(janela);
});

app.on('window-all-closed', () => {
  void fecharBrowser().finally(() => app.quit());
});
