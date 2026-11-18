// Verificações do diagnóstico: cada uma devolve verde (ok), vermelho (falha),
// amarelo (aviso) ou cinzento (saltado), com uma explicação simples.
import { app, BrowserWindow, net, safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
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
  { id: 'edge-ficheiros', nome: 'Ficheiros e separadores no Edge', descricao: 'Carregar um ficheiro, descarregar um ficheiro e abrir um novo separador.' },
  { id: 'cofre', nome: 'Cofre de segredos', descricao: 'Encriptação do Windows para guardar passwords e sessões neste PC.' },
  { id: 'servidor-local', nome: 'Servidor local', descricao: 'Abrir uma porta só no próprio PC (127.0.0.1), usada para ver os traces.' },
  { id: 'janela', nome: 'Janelas da ferramenta', descricao: 'Janela de login e visualizador de traces dentro da ferramenta.' },
  { id: 'pdf', nome: 'Relatório em PDF', descricao: 'Gerar o PDF para assinatura.' },
  { id: 'microsoft', nome: 'Login e email da Microsoft (opcional)', descricao: 'Chegar a login.microsoftonline.com e graph.microsoft.com (caixa de email Microsoft 365).' },
  { id: 'direto', nome: 'Ligação direta sem proxy (opcional)', descricao: 'Usada pelo email por IMAP (Gmail) e pelos certificados de cliente (mTLS).' },
  { id: 'apps-demo', nome: 'Apps de demonstração (opcional)', descricao: 'As apps de teste OutSystems do projeto de exemplo (fora da empresa).' },
  { id: 'chrome', nome: 'Chrome instalado (opcional)', descricao: 'Browser alternativo.' },
];

/** App de demonstração usada no projeto de exemplo (OutSystems, só dados fictícios). */
export const URL_APPS_DEMO = 'https://personal-e5m9c9gh-dev.outsystems.app/SimuladorFinanceiroPOC';

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

/** Carregar e descarregar um ficheiro e abrir um novo separador, como os passos do UAT Studio. */
async function verificarFicheiros(pagina: Page): Promise<Resultado> {
  const id = 'edge-ficheiros';
  const pasta = fs.mkdtempSync(path.join(app.getPath('temp'), 'uat-diag-'));
  const feitos: string[] = [];
  try {
    const ficheiro = path.join(pasta, 'carregar.txt');
    fs.writeFileSync(ficheiro, 'teste');
    await pagina.setContent(`<input type="file" id="f"><a id="d" download="descarga.txt" href="data:text/plain,uat">Descarregar</a><a id="n" href="about:blank" target="_blank">Novo</a>`);
    await pagina.setInputFiles('#f', ficheiro);
    const nome = await pagina.$eval('#f', (el) => (el as HTMLInputElement).files?.[0]?.name ?? '');
    if (nome !== 'carregar.txt') throw new Error('o ficheiro não ficou no campo de carregar');
    feitos.push('carregar');
    const [descarga] = await Promise.all([pagina.waitForEvent('download', { timeout: 15_000 }), pagina.click('#d')]);
    const destino = path.join(pasta, 'descarga.txt');
    await descarga.saveAs(destino);
    if (fs.readFileSync(destino, 'utf8') !== 'uat') throw new Error('o ficheiro descarregado veio diferente');
    feitos.push('descarregar');
    const [novo] = await Promise.all([pagina.context().waitForEvent('page', { timeout: 15_000 }), pagina.click('#n')]);
    await novo.close();
    feitos.push('novo separador');
    return { id, estado: 'ok', detalhe: 'Carregar, descarregar e novo separador funcionam.' };
  } catch (erro) {
    const parte = feitos.length ? ` (funcionou: ${feitos.join(', ')})` : '';
    return { id, estado: 'falha', detalhe: `${primeiraLinha(erro)}${parte}.` };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

/** O cofre do UAT Studio usa a encriptação do Windows (DPAPI) através do safeStorage do Electron. */
function verificarCofre(): Resultado {
  const id = 'cofre';
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { id, estado: 'falha', detalhe: 'A encriptação do Windows não está disponível: a ferramenta não conseguirá guardar passwords nem sessões.' };
    }
    const cifrado = safeStorage.encryptString('teste-do-cofre');
    if (safeStorage.decryptString(cifrado) !== 'teste-do-cofre') throw new Error('o valor desencriptado veio diferente');
    return { id, estado: 'ok', detalhe: 'Encripta e desencripta neste PC.' };
  } catch (erro) {
    return { id, estado: 'falha', detalhe: primeiraLinha(erro) };
  }
}

/** Abre um servidor só em 127.0.0.1 (como o visualizador de traces) e pede-lhe uma página. */
async function abrirServidorLocal(): Promise<{ servidor: http.Server; url: string }> {
  const servidor = http.createServer((_pedido, resposta) => {
    resposta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    resposta.end('<!doctype html><title>UAT local</title><p id="ok">servidor local</p>');
  });
  await new Promise<void>((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => resolve());
  });
  const endereco = servidor.address();
  const porta = typeof endereco === 'object' && endereco ? endereco.port : 0;
  return { servidor, url: `http://127.0.0.1:${porta}/` };
}

function pedirLocal(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pedido = http.get(url, { timeout: 10_000 }, (resposta) => {
      let corpo = '';
      resposta.on('data', (bocado) => (corpo += bocado));
      resposta.on('end', () => resolve(corpo));
    });
    pedido.on('timeout', () => pedido.destroy(new Error('o servidor local não respondeu')));
    pedido.on('error', reject);
  });
}

/** Janela escondida, isolada e sem memória (como a janela de login), a carregar uma página. */
async function verificarJanela(url: string): Promise<Resultado> {
  const id = 'janela';
  const janela = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, partition: `diag-${Date.now()}` } });
  try {
    await janela.loadURL(url);
    const texto = await janela.webContents.executeJavaScript(`document.getElementById('ok')?.textContent ?? ''`);
    if (texto !== 'servidor local') throw new Error('a página abriu vazia');
    return { id, estado: 'ok', detalhe: 'A janela abriu e mostrou a página.' };
  } catch (erro) {
    return { id, estado: 'falha', detalhe: primeiraLinha(erro) };
  } finally {
    janela.destroy();
  }
}

async function verificarPdf(): Promise<Resultado> {
  const id = 'pdf';
  const janela = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await janela.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<h1>Relatório de teste</h1><p>UAT Studio</p>')}`);
    const pdf = await janela.webContents.printToPDF({ pageSize: 'A4' });
    if (pdf.subarray(0, 4).toString() !== '%PDF') throw new Error('o ficheiro gerado não é um PDF');
    return { id, estado: 'ok', detalhe: `PDF gerado (${Math.round(pdf.length / 1024)} KB).` };
  } catch (erro) {
    return { id, estado: 'falha', detalhe: primeiraLinha(erro) };
  } finally {
    janela.destroy();
  }
}

/** Qualquer resposta HTTP conta (por exemplo 401 sem login): o que interessa é chegar lá. */
async function chegaA(url: string): Promise<string> {
  const resposta = await net.fetch(url, { method: 'GET', signal: AbortSignal.timeout(20_000) });
  return `HTTP ${resposta.status}`;
}

async function verificarMicrosoft(): Promise<Resultado> {
  const id = 'microsoft';
  const partes: string[] = [];
  try {
    partes.push(`login ${await chegaA('https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration')}`);
    partes.push(`Graph ${await chegaA('https://graph.microsoft.com/v1.0/')}`);
    return { id, estado: 'ok', detalhe: `Responderam (${partes.join(', ')}).` };
  } catch (erro) {
    const parte = partes.length ? ` (${partes.join(', ')})` : '';
    return { id, estado: 'aviso', detalhe: `${explicarErroRede(erro)}${parte} Só é preciso para a caixa de email Microsoft 365; fale com a IT.` };
  }
}

/** HTTPS pelo Node, sem o proxy do Windows: é assim que ligam o IMAP e os certificados de cliente. */
function verificarDireto(url: string): Promise<Resultado> {
  const id = 'direto';
  return new Promise((resolve) => {
    // Alguns sites (por exemplo microsoft.com) não respondem a pedidos sem User-Agent.
    const cabecalhos = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) UAT-Studio-Diagnostico', Accept: 'text/html' };
    const pedido = https.get(url, { timeout: 15_000, headers: cabecalhos }, (resposta) => {
      resposta.resume();
      resolve({ id, estado: 'ok', detalhe: `Liga diretamente (HTTP ${resposta.statusCode}).` });
    });
    const falhar = (texto: string): void =>
      resolve({ id, estado: 'aviso', detalhe: `${texto} Na rede da empresa é normal: o email por IMAP e os certificados de cliente (mTLS) não vão funcionar aqui; use uma caixa Microsoft 365.` });
    pedido.on('timeout', () => {
      pedido.destroy();
      falhar('Sem resposta (a rede provavelmente só deixa sair pelo proxy).');
    });
    pedido.on('error', (erro) => falhar(`Não liga (${primeiraLinha(erro)}).`));
  });
}

async function verificarAppsDemo(): Promise<Resultado> {
  const id = 'apps-demo';
  try {
    return { id, estado: 'ok', detalhe: `Responderam (${await chegaA(URL_APPS_DEMO)}): o projeto de exemplo pode correr neste PC.` };
  } catch (erro) {
    return { id, estado: 'aviso', detalhe: `${explicarErroRede(erro)} O projeto de exemplo não vai correr aqui; não é preciso para testar as apps da empresa.` };
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

    aCorrer('edge-ficheiros');
    registar(await verificarFicheiros(pagina));
  } else {
    const detalhe = 'Não foi testado porque o Edge não abriu.';
    registar({ id: 'edge-print', estado: 'saltado', detalhe });
    registar({ id: 'edge-navegar', estado: 'saltado', detalhe });
    registar({ id: 'edge-ficheiros', estado: 'saltado', detalhe });
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

  // 9. Cofre de segredos
  aCorrer('cofre');
  registar(verificarCofre());

  // 10 e 11. Servidor local e janelas da ferramenta (a janela abre a página do servidor local)
  aCorrer('servidor-local');
  let local: { servidor: http.Server; url: string } | null = null;
  try {
    local = await abrirServidorLocal();
    const corpo = await pedirLocal(local.url);
    if (!corpo.includes('servidor local')) throw new Error('o servidor local respondeu outra coisa');
    registar({ id: 'servidor-local', estado: 'ok', detalhe: 'Abre uma porta em 127.0.0.1 e responde.' });
  } catch (erro) {
    registar({ id: 'servidor-local', estado: 'falha', detalhe: `${primeiraLinha(erro)}. Sem isto, os traces abrem só como pasta.` });
  }
  aCorrer('janela');
  registar(local ? await verificarJanela(local.url) : { id: 'janela', estado: 'saltado', detalhe: 'Não foi testado porque o servidor local não abriu.' });
  local?.servidor.close();

  // 12. PDF
  aCorrer('pdf');
  registar(await verificarPdf());

  // 13 a 15. Opcionais: Microsoft, ligação direta, apps de demonstração
  aCorrer('microsoft');
  registar(await verificarMicrosoft());
  aCorrer('direto');
  registar(await verificarDireto(url));
  aCorrer('apps-demo');
  registar(await verificarAppsDemo());

  // 16. Chrome (opcional)
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
