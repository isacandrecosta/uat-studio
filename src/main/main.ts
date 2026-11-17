// Processo principal do Electron: cria a janela e liga a interface ao resto.
import { app, BrowserWindow, ipcMain, session } from 'electron';
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
import { aoMudarRun, estadoRun, listarHistorico, pararRun } from './executor/execucao';
import { leituraSistema, MB_POR_WORKER, sugerirParalelo } from './desempenho';
import { registarIpcExecucoes } from './executor/ipc';
import { pastaDoProjeto, registarIpcProjeto } from './projeto/ipc';
import { registarIpcPacotes } from './projeto/pacotes';
import { registarIpcCaixa } from './email/ipc';
import { registarAvisoCodigo } from './api/avisoCodigo';
import { correrSmoke } from './smoke';
import { correrDemo } from './demo/demo';
import { ficheiroDeVerificacao, verificarArranque } from './arranque';
import { EstadoRun, PassoSobrePrint, PedidoGravacao } from '../shared/modelo';

const RAIZ = path.join(__dirname, '..', '..');
const MODO_SMOKE = process.argv.includes('--smoke');
/** Modo demo (npm.cmd run demo): grava os vídeos e o guia em out/demo. Usa uma pasta de dados própria, como o smoke. */
const MODO_DEMO = process.argv.includes('--demo');

if (MODO_SMOKE || MODO_DEMO) {
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
  // Endurecimento: a interface não abre janelas novas nem navega para fora dos seus próprios ficheiros.
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', (evento, destino) => {
    if (!destino.startsWith('file://')) evento.preventDefault();
  });
  void janela.loadFile(path.join(RAIZ, 'src', 'renderer', 'index.html'));
  return janela;
}

registarIpcProjeto();
registarIpcExecucoes();
registarIpcPacotes();
registarIpcCaixa();

ipcMain.handle('app:modo', () => (MODO_SMOKE ? 'smoke' : MODO_DEMO ? 'demo' : 'normal'));
// Desempenho: o PC agora, a memória da própria app e a duração média de um caso nas últimas execuções.
ipcMain.handle('app:desempenho', () => {
  const sistema = leituraSistema();
  const metricas = app.getAppMetrics();
  const appMB = Math.round(metricas.reduce((s, m) => s + (m.memory?.workingSetSize ?? 0), 0) / 1024);
  const estado = estadoRun();
  const workers = estado?.ativo ? estado.casos.filter((c) => c.estado === 'a-correr').length : 0;
  let historico: EstadoRun[] = [];
  try {
    historico = listarHistorico(pastaDoProjeto()).filter((r) => !r.ativo && r.desempenho).slice(0, 10);
  } catch {
    // Sem projeto aberto: sem histórico.
  }
  return {
    sistema,
    app: { memMB: appMB, processos: metricas.length },
    workersAtivos: workers,
    sugestao: sugerirParalelo(8, sistema.memLivreMB).seguro,
    mbPorWorker: MB_POR_WORKER,
    execucoes: historico.map((r) => ({ nome: r.nome, inicio: r.inicio, paralelo: r.opcoes.paralelo, casos: r.casos.length, ...r.desempenho })),
  };
});
// No smoke, UAT_MEMORIA_LIVRE_MB simula pouca memória livre (para testar o aviso); fora do smoke é ignorada.
ipcMain.handle('app:sugestao-paralelo', (_e, pedido: number) => {
  const simulada = MODO_SMOKE ? Number(process.env.UAT_MEMORIA_LIVRE_MB) : NaN;
  // No smoke, o aviso só aparece no passo que o testa (com a memória simulada): os outros passos não dependem da memória livre do PC.
  if (MODO_SMOKE && !(Number.isFinite(simulada) && simulada > 0)) return { seguro: Number(pedido) || 1, memLivreMB: leituraSistema().memLivreMB, excede: false };
  return sugerirParalelo(Number(pedido) || 1, Number.isFinite(simulada) && simulada > 0 ? simulada : leituraSistema().memLivreMB);
});
ipcMain.handle('gravador:estado', () => estadoGravador());
ipcMain.handle('gravador:iniciar', (_e, pedido: PedidoGravacao) => iniciarGravacao(pastaDoProjeto(), pedido));
ipcMain.handle('gravador:remover-passo', (_e, passoId: string) => removerPasso(String(passoId)));
ipcMain.handle('gravador:capturar', () => capturarEcra());
ipcMain.handle('gravador:sobre-print', (_e, pedido: PassoSobrePrint) => gravarSobrePrint(pedido));
ipcMain.handle('gravador:terminar', (_e, guardar: boolean) => terminarGravacao(Boolean(guardar)));

void app.whenReady().then(() => {
  // Permissões do browser (câmara, microfone, localização, notificações...): recusadas, exceto copiar texto
  // (botões "Copiar log", "Criar defeito"). Vale para as janelas da app, não para o Edge dos testes.
  session.defaultSession.setPermissionRequestHandler((_wc, permissao, responder) => responder(permissao === 'clipboard-sanitized-write'));
  const janela = criarJanela();
  registarAvisoCodigo(janela);
  aoMudarGravador((estado) => {
    if (!janela.isDestroyed()) janela.webContents.send('gravador:atualizado', estado);
  });
  aoMudarRun((estado) => {
    if (!janela.isDestroyed()) janela.webContents.send('run:atualizado', estado);
  });
  if (MODO_SMOKE) void correrSmoke(janela, RAIZ);
  if (MODO_DEMO) void correrDemo(janela, RAIZ);
  const verificacao = ficheiroDeVerificacao();
  if (verificacao) janela.webContents.once('did-finish-load', () => void verificarArranque(janela, verificacao));
});

app.on('window-all-closed', () => {
  pararRun();
  void terminarGravacao(false).finally(() => app.quit());
});
