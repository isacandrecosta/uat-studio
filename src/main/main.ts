// Processo principal do Electron: cria a janela e liga a interface ao resto.
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { abrirBrowser, fecharBrowser } from './browser';
import { registarIpcProjeto } from './projeto/ipc';
import { correrSmoke } from './smoke';

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
registarIpcProjeto();

void app.whenReady().then(() => {
  const janela = criarJanela();
  if (MODO_SMOKE) void correrSmoke(janela, RAIZ);
});

app.on('window-all-closed', () => {
  void fecharBrowser().finally(() => app.quit());
});
