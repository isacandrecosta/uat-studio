// Teste rápido automático (npm run smoke): usa a janela como um utilizador,
// escreve o resultado na consola e fecha tudo. Os prints ficam em out/.
import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fecharBrowser } from './browser';
import { criarProjeto } from './projeto/ipc';

type Passo = (janela: BrowserWindow) => Promise<void>;

/** Corre código na página e devolve o resultado. */
export function naPagina<T>(janela: BrowserWindow, codigo: string): Promise<T> {
  return janela.webContents.executeJavaScript(codigo) as Promise<T>;
}

/** Espera até uma expressão da página ser verdadeira. */
export async function esperar(janela: BrowserWindow, expressao: string, limiteMs = 30_000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (await naPagina<boolean>(janela, `Boolean(${expressao})`).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Esperei demasiado por: ${expressao}`);
}

function confirmar(condicao: unknown, mensagem: string): void {
  if (!condicao) throw new Error(mensagem);
}

async function tirarPrint(janela: BrowserWindow, raiz: string, nome: string): Promise<void> {
  try {
    await new Promise((r) => setTimeout(r, 300));
    const print = await janela.webContents.capturePage();
    const pasta = path.join(raiz, 'out');
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, `smoke-${nome}.png`), print.toPNG());
  } catch (erro) {
    console.log(`[smoke] aviso: sem print "${nome}" (${String(erro)})`);
  }
}

export async function correrSmoke(janela: BrowserWindow, raiz: string): Promise<void> {
  let codigo = 1;
  const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-smoke-'));
  const passos: Array<[string, Passo]> = [
    [
      'ecrã de boas-vindas',
      async (j) => {
        await esperar(j, "document.body.dataset.vista === 'boas-vindas'");
        await tirarPrint(j, raiz, 'boas-vindas');
      },
    ],
    [
      'projeto de exemplo aberto',
      async (j) => {
        criarProjeto(path.join(pastaProjeto, 'exemplo'), 'Projeto de exemplo', true);
        j.reload();
        await esperar(j, "document.body.dataset.vista === 'app' && document.querySelector('.cartao-epico')");
        const itens = await naPagina<number>(j, "document.querySelectorAll('.menu-item').length");
        confirmar(itens === 7, `O menu lateral tem ${itens} itens em vez de 7.`);
        const texto = await naPagina<string>(j, "document.querySelector('.conteudo').innerText");
        confirmar(texto.includes('Simulações de crédito'), 'O épico de exemplo não aparece.');
        confirmar(texto.includes('Simular crédito'), 'A jornada de exemplo não aparece.');
        await tirarPrint(j, raiz, 'jornadas');
      },
    ],
    [
      'criar um épico pela interface',
      async (j) => {
        await naPagina(j, "document.getElementById('btn-novo-epico').click()");
        await esperar(j, "document.querySelector('dialog[open] input')");
        await naPagina(
          j,
          `(() => { const d = document.querySelector('dialog[open]'); d.querySelector('input').value = 'Cartões'; d.querySelector('button[type=submit]').click(); })()`,
        );
        await esperar(j, "document.querySelectorAll('.cartao-epico').length === 2");
        confirmar(
          fs.existsSync(path.join(pastaProjeto, 'exemplo', 'epicos', 'cartoes.json')),
          'O ficheiro epicos/cartoes.json não foi criado.',
        );
      },
    ],
    [
      'abrir o Edge na app POC',
      async (j) => {
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"gravar\"]').click()");
        await esperar(j, "document.getElementById('btn-abrir-poc')");
        await naPagina(j, "document.getElementById('btn-abrir-poc').click()");
        await esperar(j, "/\\b(ok|erro)\\b/.test(document.getElementById('estado-browser').className)", 120_000);
        const estado = await naPagina<{ ok: boolean; texto: string }>(
          j,
          "(() => { const e = document.getElementById('estado-browser'); return { ok: e.classList.contains('ok'), texto: e.textContent }; })()",
        );
        confirmar(estado.ok, estado.texto);
      },
    ],
  ];

  try {
    await new Promise<void>((resolve) => janela.webContents.once('did-finish-load', () => resolve()));
    for (const [nome, passo] of passos) {
      await passo(janela);
      console.log(`[smoke] OK: ${nome}`);
    }
    codigo = 0;
  } catch (erro) {
    console.log(`[smoke] ERRO: ${erro instanceof Error ? erro.message : String(erro)}`);
    await tirarPrint(janela, raiz, 'erro');
  } finally {
    await fecharBrowser();
    fs.rmSync(pastaProjeto, { recursive: true, force: true });
    app.exit(codigo);
  }
}
