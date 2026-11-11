// "Abrir trace": mostra o trace do Playwright (trace-N.zip) numa janela da própria app, com o
// visualizador que vem dentro do playwright-core (sem browser externo e sem internet).
import { BrowserWindow, shell } from 'electron';
import * as path from 'node:path';

interface ServidorTrace {
  urlPrefix(tipo: 'precise' | 'human-readable'): string;
}
interface ApiInterna {
  startTraceViewerServer(opcoes: { allowedFileRoots: () => string[]; host: string; port: number }): Promise<ServidorTrace>;
  traceViewerPath(traceUrl: string, opcoes: Record<string, unknown>): string;
}

/** Um servidor por pasta de execuções (só serve ficheiros dentro dela). */
const servidores = new Map<string, Promise<ServidorTrace>>();

/** API interna do playwright-core (pode mudar numa versão nova: nesse caso, abre-se a pasta). */
function apiInterna(): ApiInterna | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nucleo = require('playwright-core/lib/coreBundle') as { server?: Partial<ApiInterna> };
    const api = nucleo.server;
    return api?.startTraceViewerServer && api.traceViewerPath ? (api as ApiInterna) : null;
  } catch {
    return null;
  }
}

/** Abre o trace numa janela. `pastaExecucoes` limita o que o servidor pode ler. */
export async function abrirTrace(pastaExecucoes: string, ficheiro: string): Promise<'janela' | 'pasta'> {
  const api = apiInterna();
  if (!api) {
    shell.showItemInFolder(ficheiro);
    return 'pasta';
  }
  const raiz = path.resolve(pastaExecucoes);
  let servidor = servidores.get(raiz);
  if (!servidor) {
    servidor = api.startTraceViewerServer({ allowedFileRoots: () => [raiz], host: '127.0.0.1', port: 0 });
    servidores.set(raiz, servidor);
  }
  const url = (await servidor).urlPrefix('precise') + api.traceViewerPath(`file?path=${encodeURIComponent(ficheiro)}`, {});
  const janela = new BrowserWindow({
    width: 1300,
    height: 860,
    title: `Trace: ${path.basename(path.dirname(ficheiro))} / ${path.basename(ficheiro)}`,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Só se navega dentro do visualizador; ligações externas abrem no browser do Windows.
  janela.webContents.setWindowOpenHandler(({ url: destino }) => {
    if (/^https?:\/\//i.test(destino) && !destino.startsWith('http://127.0.0.1')) void shell.openExternal(destino);
    return { action: 'deny' };
  });
  await janela.loadURL(url);
  return 'janela';
}
