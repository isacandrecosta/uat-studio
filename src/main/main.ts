// Processo principal do Electron: cria a janela e liga a interface ao resto.
import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  aoMudarGravador,
  estadoGravador,
  iniciarGravacao,
  removerPasso,
  terminarGravacao,
  capturarEcra,
  gravarSobrePrint,
} from './gravador/gravador';
import { aoMudarRun, pararRun } from './executor/execucao';
import { registarIpcExecucoes } from './executor/ipc';
import { pastaDoProjeto, registarIpcProjeto } from './projeto/ipc';
import { registarIpcPacotes } from './projeto/pacotes';
import { correrSmoke } from './smoke';
import { ficheiroDeVerificacao, verificarArranque } from './arranque';
import { PassoSobrePrint, PedidoGravacao } from '../shared/modelo';

const RAIZ = path.join(__dirname, '..', '..');
const MODO_SMOKE = process.argv.includes('--smoke');

if (MODO_SMOKE) {
  // O teste automático não mexe nos projetos recentes nem no cofre do utilizador: usa uma pasta própria.
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-smoke-dados-')));
  // Nos testes automáticos a janela pode estar tapada ou o ecrã bloqueado:
  // sem isto, o Chromium deixa de desenhar e os testes ficam à espera.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

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

registarIpcProjeto();
registarIpcExecucoes();
registarIpcPacotes();

ipcMain.handle('gravador:estado', () => estadoGravador());
ipcMain.handle('gravador:iniciar', (_e, pedido: PedidoGravacao) => iniciarGravacao(pastaDoProjeto(), pedido));
ipcMain.handle('gravador:remover-passo', (_e, passoId: string) => removerPasso(String(passoId)));
ipcMain.handle('gravador:capturar', () => capturarEcra());
ipcMain.handle('gravador:sobre-print', (_e, pedido: PassoSobrePrint) => gravarSobrePrint(pedido));
ipcMain.handle('gravador:terminar', (_e, guardar: boolean) => terminarGravacao(Boolean(guardar)));

void app.whenReady().then(() => {
  const janela = criarJanela();
  aoMudarGravador((estado) => {
    if (!janela.isDestroyed()) janela.webContents.send('gravador:atualizado', estado);
  });
  aoMudarRun((estado) => {
    if (!janela.isDestroyed()) janela.webContents.send('run:atualizado', estado);
  });
  if (MODO_SMOKE) void correrSmoke(janela, RAIZ);
  const verificacao = ficheiroDeVerificacao();
  if (verificacao) janela.webContents.once('did-finish-load', () => void verificarArranque(janela, verificacao));
});

app.on('window-all-closed', () => {
  pararRun();
  void terminarGravacao(false).finally(() => app.quit());
});
