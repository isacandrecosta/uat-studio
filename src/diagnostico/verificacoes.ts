// Verificações do diagnóstico: cada uma devolve verde (ok), vermelho (falha),
// amarelo (aviso) ou cinzento (saltado), com uma explicação simples.
import { app, net } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chromium, Browser, Page } from 'playwright-core';

export type Estado = 'pendente' | 'a-correr' | 'ok' | 'falha' | 'aviso' | 'saltado';

export interface Verificacao {
  id: string;
  nome: string;
  /** Para que serve, em linguagem simples. */
  descricao: string;
}

export interface Resultado {
  id: string;
  estado: Estado;
  detalhe: string;
}

export const URL_TESTE_PADRAO = 'https://www.microsoft.com';

export const VERIFICACOES: Verificacao[] = [
  { id: 'arranque', nome: 'A aplicação arranca', descricao: 'O Windows deixa correr o .exe.' },
  { id: 'escrita', nome: 'Gravar ficheiros', descricao: 'É preciso para guardar evidências e logs.' },
  { id: 'edge-instalado', nome: 'Edge instalado', descricao: 'O browser usado para os testes.' },
  { id: 'edge-controlo', nome: 'Controlar o Edge', descricao: 'Abrir o Edge e escrever e clicar numa página.' },
  { id: 'edge-print', nome: 'Tirar prints', descricao: 'Capturas de ecrã para as evidências.' },
  { id: 'edge-navegar', nome: 'Abrir um site no Edge', descricao: 'Proxy e certificados no browser.' },
  { id: 'edge-background', nome: 'Edge em background', descricao: 'Correr testes sem janela visível.' },
  { id: 'api', nome: 'Pedidos de API', descricao: 'Proxy e certificados do Windows fora do browser.' },
  { id: 'chrome', nome: 'Chrome instalado (opcional)', descricao: 'Browser alternativo.' },
];

type Notificar = (resultado: Resultado) => void;

function primeiraLinha(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro);
  return texto.split('\n')[0].trim();
}

/** Traduz os erros de rede mais comuns do browser para uma frase simples. */
function explicarErroRede(erro: unknown): string {
  const texto = primeiraLinha(erro);
  const codigo = /ERR_[A-Z_]+/.exec(texto)?.[0] ?? '';
  if (codigo.startsWith('ERR_CERT') || codigo.startsWith('ERR_SSL')) {
    return `Problema de certificados (${codigo}).`;
  }
  if (codigo.includes('PROXY') || codigo.includes('TUNNEL')) {
    return `Problema de proxy (${codigo}).`;
  }
  if (codigo === 'ERR_NAME_NOT_RESOLVED' || codigo === 'ERR_INTERNET_DISCONNECTED') {
    return `O endereço não foi encontrado ou não há rede (${codigo}).`;
  }
  if (codigo.includes('TIMED_OUT') || /Timeout/i.test(texto)) {
    return 'O site não respondeu a tempo.';
  }
  if (codigo) return `Não foi possível abrir o site (${codigo}).`;
  return texto;
}

function procurarExe(relativo: string): string | null {
  const bases = [
    process.env['ProgramFiles(x86)'],
    process.env['ProgramFiles'],
    process.env['LOCALAPPDATA'],
  ];
  for (const base of bases) {
    if (!base) continue;
    const caminho = path.join(base, relativo);
    if (fs.existsSync(caminho)) return caminho;
  }
  return null;
}

function verificarEscrita(): Resultado {
  const id = 'escrita';
  const pastas: Array<{ nome: string; caminho: string | undefined }> = [
    { nome: 'pasta temporária', caminho: app.getPath('temp') },
    // Pasta onde está o .exe portátil (só existe quando corre empacotado).
    { nome: 'pasta do .exe', caminho: process.env.PORTABLE_EXECUTABLE_DIR },
  ];
  const ok: string[] = [];
  const falhas: string[] = [];
  for (const pasta of pastas) {
    if (!pasta.caminho) continue;
    const ficheiro = path.join(pasta.caminho, `uat-diagnostico-${process.pid}.tmp`);
    try {
      fs.writeFileSync(ficheiro, 'teste');
      fs.unlinkSync(ficheiro);
      ok.push(pasta.nome);
    } catch (erro) {
      falhas.push(`${pasta.nome} (${primeiraLinha(erro)})`);
    }
  }
  if (ok.length === 0) {
    return { id, estado: 'falha', detalhe: `Não consegue gravar: ${falhas.join('; ')}.` };
  }
  if (falhas.length > 0) {
    return {
      id,
      estado: 'aviso',
      detalhe: `Grava na ${ok.join(' e na ')}, mas não na ${falhas.join('; ')}.`,
    };
  }
  return { id, estado: 'ok', detalhe: `Grava na ${ok.join(' e na ')}.` };
}

const PAGINA_TESTE = `<!doctype html><html><head><title>Teste UAT</title></head><body>
  <input id="campo"><button id="botao" onclick="document.getElementById('saida').textContent = document.getElementById('campo').value">Copiar</button>
  <p id="saida"></p></body></html>`;

/** Escreve num campo, clica num botão e lê o resultado: prova que o browser é controlável. */
async function experimentarPagina(pagina: Page): Promise<void> {
  await pagina.setContent(PAGINA_TESTE);
  await pagina.fill('#campo', 'olá');
  await pagina.click('#botao');
  const saida = await pagina.textContent('#saida');
  if (saida !== 'olá') throw new Error(`A página devolveu "${saida}" em vez de "olá".`);
}

async function pedidoApi(url: string): Promise<Resultado> {
  const id = 'api';
  try {
    const resposta = await net.fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(30_000),
    });
    return {
      id,
      estado: 'ok',
      detalhe: `O servidor respondeu (HTTP ${resposta.status}).`,
    };
  } catch (erro) {
    return { id, estado: 'falha', detalhe: explicarErroRede(erro) };
  }
}

export async function executarTudo(url: string, notificar: Notificar): Promise<Resultado[]> {
  const resultados: Resultado[] = [];
  const registar = (resultado: Resultado): void => {
    resultados.push(resultado);
    notificar(resultado);
  };
  const aCorrer = (id: string): void => notificar({ id, estado: 'a-correr', detalhe: '' });

  // 1. Arranque
  registar({
    id: 'arranque',
    estado: 'ok',
    detalhe: `Windows ${os.release()}, Electron ${process.versions.electron}.`,
  });

  // 2. Gravar ficheiros
  aCorrer('escrita');
  registar(verificarEscrita());

  // 3. Edge instalado
  aCorrer('edge-instalado');
  const edge = procurarExe(path.join('Microsoft', 'Edge', 'Application', 'msedge.exe'));
  registar(
    edge
      ? { id: 'edge-instalado', estado: 'ok', detalhe: edge }
      : { id: 'edge-instalado', estado: 'falha', detalhe: 'Não foi encontrado o msedge.exe.' },
  );

  // 4 a 6. Edge visível: controlar, tirar print e abrir um site
  let browser: Browser | null = null;
  let pagina: Page | null = null;
  aCorrer('edge-controlo');
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: false, timeout: 60_000 });
    pagina = await browser.newPage();
    await experimentarPagina(pagina);
    registar({
      id: 'edge-controlo',
      estado: 'ok',
      detalhe: `Edge ${browser.version()} aberto e controlado.`,
    });
  } catch (erro) {
    pagina = null;
    registar({
      id: 'edge-controlo',
      estado: 'falha',
      detalhe: `O Edge não se deixou controlar: ${primeiraLinha(erro)}`,
    });
  }

  if (pagina) {
    aCorrer('edge-print');
    try {
      const print = await pagina.screenshot();
      registar({
        id: 'edge-print',
        estado: print.length > 0 ? 'ok' : 'falha',
        detalhe: print.length > 0 ? `Print tirado (${Math.round(print.length / 1024)} KB).` : 'O print veio vazio.',
      });
    } catch (erro) {
      registar({ id: 'edge-print', estado: 'falha', detalhe: primeiraLinha(erro) });
    }

    aCorrer('edge-navegar');
    try {
      const resposta = await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const estadoHttp = resposta ? ` (HTTP ${resposta.status()})` : '';
      registar({ id: 'edge-navegar', estado: 'ok', detalhe: `O site abriu${estadoHttp}.` });
    } catch (erro) {
      registar({ id: 'edge-navegar', estado: 'falha', detalhe: explicarErroRede(erro) });
    }
  } else {
    const detalhe = 'Não foi testado porque o Edge não abriu.';
    registar({ id: 'edge-print', estado: 'saltado', detalhe });
    registar({ id: 'edge-navegar', estado: 'saltado', detalhe });
  }
  await browser?.close().catch(() => undefined);

  // 7. Edge em background (sem janela)
  aCorrer('edge-background');
  let invisivel: Browser | null = null;
  try {
    invisivel = await chromium.launch({ channel: 'msedge', headless: true, timeout: 60_000 });
    await experimentarPagina(await invisivel.newPage());
    registar({ id: 'edge-background', estado: 'ok', detalhe: 'Funciona sem janela visível.' });
  } catch (erro) {
    registar({ id: 'edge-background', estado: 'falha', detalhe: primeiraLinha(erro) });
  }
  await invisivel?.close().catch(() => undefined);

  // 8. Pedidos de API fora do browser
  aCorrer('api');
  registar(await pedidoApi(url));

  // 9. Chrome (opcional)
  aCorrer('chrome');
  const chrome = procurarExe(path.join('Google', 'Chrome', 'Application', 'chrome.exe'));
  registar(
    chrome
      ? { id: 'chrome', estado: 'ok', detalhe: chrome }
      : { id: 'chrome', estado: 'aviso', detalhe: 'Não está instalado. Não é obrigatório: o Edge chega.' },
  );

  return resultados;
}

const SIMBOLOS: Record<Estado, string> = {
  ok: '[OK]   ',
  falha: '[FALHA]',
  aviso: '[AVISO]',
  saltado: '[--]   ',
  pendente: '[..]   ',
  'a-correr': '[..]   ',
};

/**
 * Texto para copiar e trazer de volta. De propósito, NÃO inclui o endereço testado,
 * o nome do utilizador nem o nome do PC.
 */
export function gerarRelatorio(resultados: Resultado[]): string {
  const linhas = [
    'UAT Studio: diagnóstico',
    `Data: ${new Date().toLocaleString('pt-PT')}`,
    `Versão: ${app.getVersion()} (Electron ${process.versions.electron}, Windows ${os.release()})`,
    '',
  ];
  for (const verificacao of VERIFICACOES) {
    const resultado = resultados.find((r) => r.id === verificacao.id);
    const estado = resultado?.estado ?? 'pendente';
    // Os caminhos de instalação podem ter o nome do utilizador: ficam de fora.
    const semCaminho = verificacao.id === 'edge-instalado' || verificacao.id === 'chrome';
    const detalhe = resultado && !(semCaminho && estado === 'ok') ? resultado.detalhe : '';
    linhas.push(`${SIMBOLOS[estado]} ${verificacao.nome}${detalhe ? `: ${detalhe}` : ''}`);
  }
  return linhas.join('\r\n');
}
