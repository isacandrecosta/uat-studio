// Mini app de diagnóstico: para levar ao PC da empresa e ver, a verde/vermelho,
// se o UAT Studio vai conseguir funcionar lá (ver ESPECIFICACAO, secção 12).
import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  executarTudo,
  gerarRelatorio,
  Resultado,
  URL_TESTE_PADRAO,
  VERIFICACOES,
} from './verificacoes';

const RAIZ = path.join(__dirname, '..', '..');
const MODO_SMOKE = process.argv.includes('--smoke');
// No modo de teste, o relatório também pode ser gravado num ficheiro: --relatorio=caminho
const FICHEIRO_RELATORIO = process.argv.find((a) => a.startsWith('--relatorio='))?.slice('--relatorio='.length);
// E pode testar outro site: --url=endereço
const URL_SMOKE = process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length) ?? '';

let ultimosResultados: Resultado[] = [];
let aCorrer = false;

function validarUrl(texto: string): string {
  const limpo = texto.trim() || URL_TESTE_PADRAO;
  const url = new URL(/^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('O endereço tem de começar por http:// ou https://');
  }
  return url.toString();
}

function criarJanela(): BrowserWindow {
  const janela = new BrowserWindow({
    width: 760,
    height: 780,
    minWidth: 600,
    minHeight: 560,
    title: 'UAT Studio: diagnóstico',
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  janela.setMenuBarVisibility(false);
  void janela.loadFile(path.join(RAIZ, 'src', 'diagnostico', 'ui', 'index.html'));
  return janela;
}

async function correr(janela: BrowserWindow | null, urlTexto: string): Promise<Resultado[]> {
  if (aCorrer) throw new Error('O diagnóstico já está a correr.');
  const url = validarUrl(urlTexto);
  aCorrer = true;
  try {
    ultimosResultados = await executarTudo(url, (resultado) => {
      if (janela && !janela.isDestroyed()) janela.webContents.send('diag:resultado', resultado);
    });
    return ultimosResultados;
  } finally {
    aCorrer = false;
  }
}

void app.whenReady().then(async () => {
  const janela = criarJanela();

  ipcMain.handle('diag:info', () => ({ verificacoes: VERIFICACOES, urlPadrao: URL_TESTE_PADRAO }));
  ipcMain.handle('diag:correr', (_evento, url: unknown) => correr(janela, String(url ?? '')));
  ipcMain.handle('diag:copiar', () => {
    clipboard.writeText(gerarRelatorio(ultimosResultados));
    return true;
  });

  if (MODO_SMOKE) {
    let codigo = 1;
    try {
      await new Promise<void>((resolve) => janela.webContents.once('did-finish-load', () => resolve()));
      // Usa a janela como um utilizador: escreve o endereço, clica e espera pelo resumo.
      await janela.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const espera = setInterval(() => {
            if (document.body.dataset.pronto !== 'sim') return;
            clearInterval(espera);
            document.getElementById('campo-url').value = ${JSON.stringify(URL_SMOKE)};
            document.getElementById('btn-correr').click();
            const fim = setInterval(() => {
              const estado = document.getElementById('resumo').dataset.estado;
              if (estado !== 'a-correr' && estado !== 'pendente') { clearInterval(fim); resolve(estado); }
            }, 250);
          }, 100);
        })
      `);
      const resultados = ultimosResultados;
      if (resultados.length === 0) throw new Error('O diagnóstico não devolveu resultados.');
      const relatorio = gerarRelatorio(resultados);
      console.log(relatorio);
      if (FICHEIRO_RELATORIO) {
        fs.writeFileSync(FICHEIRO_RELATORIO, relatorio, 'utf8');
        // Print da janela ao lado do relatório (só uma ajuda: se falhar, continua).
        await new Promise((resolve) => setTimeout(resolve, 500));
        const print = await janela.webContents.capturePage().catch(() => null);
        if (print) fs.writeFileSync(`${FICHEIRO_RELATORIO}.png`, print.toPNG());
      }
      codigo = resultados.some((r) => r.estado === 'falha' || r.estado === 'saltado') ? 1 : 0;
    } catch (erro) {
      console.log(`[smoke] ERRO: ${String(erro)}`);
    } finally {
      app.exit(codigo);
    }
  }
});

app.on('window-all-closed', () => app.quit());
