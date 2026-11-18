// Corre UM caso (uma jornada com uma linha de dados) num contexto de browser limpo.
// Resultado: OK (tudo coincide), KO (chegou ao fim mas há diferenças) ou ERRO (não chegou ao fim).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Browser, BrowserContext, errors, Page, Request } from 'playwright-core';
import {
  Ambiente,
  Aplicacao,
  Bloco,
  CaixaTestes,
  BlocoDaJornada,
  Caso,
  Diferenca,
  EstadoBlocoCaso,
  EstadoPasso,
  Jornada,
  Localizador,
  Passo,
  PedidoManual,
  RegistoPasso,
  RespostaManual,
  SESSAO_PRINCIPAL,
  ResultadoCaso,
  PerfilAutenticacao,
  ResultadoApi,
  Valor,
  VariavelCalculada,
} from '../../shared/modelo';
import { createHash } from 'node:crypto';
import { mesmoLocalizador } from '../../shared/blocos';
import { variaveisDoBloco } from '../../shared/variaveis';
import { sugerirParaCaso } from '../../shared/sugestoes';
import { avaliarCondicao, avaliarFormula, eFormulaDoCaso, ErroFormula, preencherTexto } from '../../shared/formulas';
import { AmbienteApi, ErroApi, executarBlocoApi, lerCaminho } from '../api/pedidos';
import { lerEmail } from '../email/email';
import { construirUrl, ErroAcao, executarAcao, lerElemento } from '../motor/acoes';
import { controloDe, descreverLocalizador, encontrar, ErroElemento } from '../motor/localizar';
import { criarSlug } from '../projeto/repositorio';
import { compararComTolerancia, formatar, lerNumero } from './numeros';

/** Referência a uma password de teste guardada no cofre: {SEGREDO:nome}. */
export const REFERENCIA_SEGREDO = /^\{SEGREDO:([^{}]+)\}$/;

export interface PedidoCaso {
  browser: Browser;
  ambiente: Ambiente;
  aplicacoes: Map<string, Aplicacao>;
  blocos: Map<string, Bloco>;
  jornada: Jornada;
  caso: Caso;
  runId: string;
  /** Pasta (absoluta) onde ficam as evidências deste caso. */
  pasta: string;
  /** Tempo máximo de cada passo. */
  limiteMs: number;
  trace: boolean;
  /** Perfis de autenticação dos blocos de API. */
  perfis: Map<string, PerfilAutenticacao>;
  /** Como fazer pedidos HTTP e ler segredos (partilhado por todos os casos da execução, para reutilizar tokens). */
  api: AmbienteApi;
  /** Variáveis calculadas por fórmula (do projeto). */
  calculadas: VariavelCalculada[];
  /** Próximo valor de um contador persistente ({CONTADOR:nome}). */
  proximoContador(nome: string): number;
  /** Chamado sempre que há novidades, para a interface acompanhar. */
  aoProgredir(resultado: ResultadoCaso): void;
  /** Passwords de teste guardadas no cofre deste PC ({SEGREDO:nome} nos casos). Nunca vão para logs. */
  lerSegredoDeTeste?(nome: string): string | undefined;
  devePararAgora(): boolean;
  /** O utilizador mandou saltar este caso? */
  deveSaltar(): boolean;
  /** Chamado antes de cada passo: é aqui que a execução espera se estiver em pausa (ou em modo lento). */
  entrePassos(): Promise<void>;
  /** Retomar a meio: os blocos antes desta posição não correm. */
  desdeBloco?: number;
  /** Retomar a meio: variáveis guardadas na execução anterior (por exemplo, {PedidoId}). */
  variaveisIniciais?: Record<string, string>;
  /** Pasta do projeto (os ficheiros a carregar podem ter caminhos relativos a ela). */
  pastaProjeto?: string;
  /** Caixa de email de testes do projeto ({EMAIL:papel} e blocos de email com papel). */
  caixaTestes?: CaixaTestes;
  /** Passo manual: mostra a instrução ao testador e espera pela resposta (OK/KO). */
  passoManual?(pedido: PedidoManual): Promise<RespostaManual>;
  /**
   * Sessões de login guardadas nesta execução (partilhadas entre casos e workers), por bloco de login e
   * dados de entrada. Só em memória: os cookies nunca vão para o disco.
   */
  sessoesGuardadas?: Map<string, SessaoGuardada>;
  /** A página do browser deste caso (para as miniaturas ao vivo); null quando fecha. */
  aoAbrirPagina?(pagina: Page | null): void;
}

/** Uma sessão de login guardada: o estado do browser (cookies, localStorage) e onde o login terminou. */
export interface SessaoGuardada {
  estado: Awaited<ReturnType<BrowserContext['storageState']>>;
  url: string;
  /** Caso onde o login foi feito (para o log). */
  caso: string;
}

/** Erro nos dados ou na definição do teste (não na aplicação). */
class ErroDados extends Error {}
class Parado extends Error {}

/**
 * Evidência do email: desenha o HTML num separador à parte, sem JavaScript e sem rede (as imagens remotas
 * não são pedidas, para o email não "avisar" ninguém de que foi aberto), e grava a imagem.
 */
async function desenharEmail(browser: Browser, email: { de: string; para: string[]; assunto: string; recebido: string; html: string; texto: string; anexos?: string[] }, ficheiro: string): Promise<boolean> {
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 900, height: 700 } }).catch(() => null);
  if (!ctx) return false;
  try {
    await ctx.route('**/*', (rota) => (rota.request().url().startsWith('data:') ? rota.continue() : rota.abort()));
    const escapar = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
    const corpo = email.html.trim() ? email.html : `<pre style="white-space:pre-wrap">${escapar(email.texto)}</pre>`;
    const cabecalho = `<div style="font:13px Segoe UI,sans-serif;background:#f3f4f6;border-bottom:1px solid #ccc;padding:10px 14px;margin:-8px -8px 12px">
      <b>${escapar(email.assunto)}</b><br>De: ${escapar(email.de)} · Para: ${escapar(email.para.join(', '))} · ${escapar(email.recebido)}${email.anexos?.length ? `<br>Anexos: ${escapar(email.anexos.join(', '))}` : ''}</div>`;
    const pag = await ctx.newPage();
    await pag.setContent(`<!doctype html><meta charset="utf-8">${cabecalho}${corpo}`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
    await pag.screenshot({ path: ficheiro, fullPage: true });
    return true;
  } catch {
    return false;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
class Saltado extends Error {}

const hora = (): string => new Date().toLocaleTimeString('pt-PT', { hour12: false });
const segundos = (ms: number): string => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const compactar = (texto: string): string => texto.replace(/\s+/g, ' ').trim();

/** Espera que os pedidos da página ao servidor terminem (os ecrãs OutSystems carregam os dados depois de aparecerem). */
class MonitorDePedidos {
  private pendentes = new Set<Request>();
  /** Pedidos enviados pela página (para "intercetar"): os mais recentes no fim. */
  readonly historico: Array<{ url: string; metodo: string; corpo: string; quando: number }> = [];
  constructor(pagina: Page) {
    pagina.on('request', (pedido) => {
      const tipo = pedido.resourceType();
      if (tipo === 'xhr' || tipo === 'fetch') this.pendentes.add(pedido);
      if (tipo === 'xhr' || tipo === 'fetch' || tipo === 'document' || pedido.method() !== 'GET') {
        this.historico.push({ url: pedido.url(), metodo: pedido.method(), corpo: pedido.postData() ?? '', quando: Date.now() });
        if (this.historico.length > 300) this.historico.shift();
      }
    });
    const terminar = (pedido: Request): void => void this.pendentes.delete(pedido);
    pagina.on('requestfinished', terminar);
    pagina.on('requestfailed', terminar);
  }
  /** Devolve false se desistiu de esperar. */
  async esperarCalma(pagina: Page, limiteMs: number, calmaMs = 200): Promise<boolean> {
    const fim = Date.now() + limiteMs;
    let calmaDesde = this.pendentes.size === 0 ? Date.now() : 0;
    while (Date.now() < fim) {
      if (this.pendentes.size > 0) calmaDesde = 0;
      else if (calmaDesde === 0) calmaDesde = Date.now();
      else if (Date.now() - calmaDesde >= calmaMs) return true;
      await pagina.waitForTimeout(50);
    }
    this.pendentes.clear();
    return false;
  }
}

/** O endereço corresponde ao padrão? Sem "*", basta conter o texto; com "*", o padrão inteiro (o * vale qualquer coisa). */
export function coincideUrl(padrao: string, url: string): boolean {
  const p = padrao.trim();
  if (!p.includes('*')) return url.includes(p);
  const expressao = p.split('*').map((parte) => parte.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${expressao}$`).test(url);
}

/**
 * Lê um campo de um pedido enviado pela app: no corpo JSON (caminho tipo `inputParameters.Valor`),
 * num formulário (a=1&b=2) ou nos parâmetros do endereço (?a=1). undefined = campo em falta.
 */
export function lerCampoDoPedido(enviado: { url: string; corpo: string }): (caminho: string) => string | undefined {
  let json: unknown;
  let temJson = false;
  try {
    json = JSON.parse(enviado.corpo);
    temJson = true;
  } catch {
    // Não é JSON: formulário ou texto.
  }
  const formulario = !temJson && enviado.corpo.includes('=') ? new URLSearchParams(enviado.corpo) : null;
  let query: URLSearchParams | null = null;
  try {
    query = new URL(enviado.url).searchParams;
  } catch {
    query = null;
  }
  return (caminho) => {
    const c = caminho.trim();
    if (c === '*') return enviado.corpo;
    if (temJson) {
      const valor = lerCaminho(json, c);
      if (typeof valor !== 'symbol') return valor !== null && typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
    }
    if (formulario?.has(c)) return formulario.get(c) ?? '';
    if (query?.has(c)) return query.get(c) ?? '';
    return undefined;
  };
}

/** Transforma um erro técnico numa frase simples. */
export function explicarErro(erro: unknown, limiteMs: number): string {
  if (erro instanceof ErroElemento || erro instanceof ErroAcao || erro instanceof ErroDados || erro instanceof ErroApi) return erro.message;
  const texto = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
  const rede = /net::(ERR_[A-Z_]+)/.exec(texto)?.[1];
  if (rede) {
    if (rede.startsWith('ERR_CERT') || rede.startsWith('ERR_SSL')) return `Problema de certificados ao abrir a página (${rede}).`;
    if (rede === 'ERR_NAME_NOT_RESOLVED' || rede === 'ERR_INTERNET_DISCONNECTED') return `O endereço não foi encontrado ou não há rede (${rede}).`;
    return `Não foi possível abrir a página (${rede}).`;
  }
  if (erro instanceof errors.TimeoutError || /Timeout \d+ms exceeded/.test(texto)) {
    return `O passo demorou mais do que o tempo limite (${segundos(limiteMs)}): o elemento pode estar tapado, desativado ou o ecrã não acabou de carregar.`;
  }
  if (/Target (page, context or browser has been )?closed|browser has been closed/i.test(texto)) return 'O browser foi fechado a meio do caso.';
  return texto;
}

export async function correrCaso(pedido: PedidoCaso): Promise<ResultadoCaso> {
  const { jornada, caso, limiteMs } = pedido;
  const inicio = Date.now();
  const resultado: ResultadoCaso = {
    chave: `${jornada.id}/${caso.id}`,
    jornadaId: jornada.id,
    jornadaNome: jornada.nome,
    casoId: caso.id,
    casoNome: caso.nome,
    estado: 'a-correr',
    diferencas: [],
    passos: [],
    variaveis: {},
    duracaoMs: 0,
    evidencias: [],
    blocos: jornada.blocos.map(() => 'por-correr'),
  };
  const estadosBlocos = resultado.blocos as EstadoBlocoCaso[];
  const variaveis: Record<string, string> = { ...caso.dados, TESTE: caso.id, RUN: pedido.runId };
  // Retomar a meio: as variáveis guardadas antes ficam disponíveis (e aparecem no resultado).
  for (const [nome, valor] of Object.entries(pedido.variaveisIniciais ?? {})) {
    variaveis[nome] = valor;
    resultado.variaveis[nome] = valor;
  }

  // Variáveis usadas em passos secretos (passwords): nunca aparecem em logs.
  const segredos = new Set<string>();
  for (const item of jornada.blocos) {
    for (const passo of pedido.blocos.get(item.blocoId)?.passos ?? []) {
      if (passo.secreto && passo.valor?.tipo === 'variavel') {
        const troca = item.parametros?.[passo.valor.nome];
        segredos.add(troca?.tipo === 'variavel' ? troca.nome : passo.valor.nome);
      }
    }
  }

  // Passwords de teste no cofre: nos casos fica só {SEGREDO:nome}; o valor é trocado aqui e a coluna é
  // sempre mascarada. Um segredo que não esteja preenchido neste PC dá ERRO no 1.º bloco, com a explicação.
  const segredosEmFalta: string[] = [];
  for (const [coluna, valor] of Object.entries(variaveis)) {
    const m = REFERENCIA_SEGREDO.exec(String(valor ?? '').trim());
    if (!m) continue;
    segredos.add(coluna);
    const guardado = pedido.lerSegredoDeTeste?.(m[1].trim());
    if (guardado === undefined) {
      segredosEmFalta.push(`"${m[1].trim()}" (coluna ${coluna})`);
      variaveis[coluna] = '';
    } else {
      variaveis[coluna] = guardado;
    }
  }

  /** Um passo é secreto se estiver marcado, ou se o valor vier de uma coluna com segredo ({SEGREDO:nome}). */
  const passoSecreto = (passo: Passo, item: BlocoDaJornada): boolean => {
    if (passo.secreto) return true;
    if (passo.valor?.tipo !== 'variavel') return false;
    const troca = item.parametros?.[passo.valor.nome];
    return segredos.has(troca?.tipo === 'variavel' ? troca.nome : passo.valor.nome);
  };

  fs.mkdirSync(pedido.pasta, { recursive: true });
  const ficheiroLog = path.join(pedido.pasta, 'caso.log');
  const ficheiroEventos = path.join(pedido.pasta, 'eventos.jsonl');
  const escrever = (linha: string): void => fs.appendFileSync(ficheiroLog, `[${hora()}] ${linha}\n`, 'utf8');
  const evento = (dados: Record<string, unknown>): void =>
    fs.appendFileSync(ficheiroEventos, `${JSON.stringify({ quando: new Date().toISOString(), ...dados })}\n`, 'utf8');

  const dadosVisiveis = Object.entries(caso.dados)
    .map(([nome, valor]) => `${nome}=${segredos.has(nome) ? '***' : valor}`)
    .join('; ');
  escrever(`Caso ${caso.id}${caso.nome ? ` (${caso.nome})` : ''} | Cenário: ${jornada.nome} | Ambiente: ${pedido.ambiente.nome}`);
  escrever(`Dados: ${dadosVisiveis || '(sem dados)'}`);
  evento({ tipo: 'caso-inicio', caso: caso.id, jornada: jornada.id, ambiente: pedido.ambiente.id });

  const ETIQUETAS: Record<EstadoPasso, string> = { ok: 'OK   ', ko: 'KO   ', erro: 'ERRO ', ignorado: '--   ' };
  const registar = (bloco: string, descricao: string, estado: EstadoPasso, duracaoMs: number, detalhe?: string): void => {
    const registo: RegistoPasso = { bloco, descricao, estado, duracaoMs, ...(detalhe ? { detalhe } : {}) };
    resultado.passos.push(registo);
    escrever(`  ${ETIQUETAS[estado]} ${descricao}${detalhe ? `: ${detalhe}` : ''} (${segundos(duracaoMs)})`);
    evento({ tipo: 'passo', ...registo });
  };

  const formulas = new Map(pedido.calculadas.map((v) => [v.nome, v.formula]));
  // Fórmulas nos próprios casos (também vindas do Excel): uma célula que começa por "=" é calculada para
  // este caso, como uma variável calculada (por exemplo =EMAIL("cliente") ou =ARRED({Valor} * 0,015; 2)).
  for (const [coluna, valor] of Object.entries(caso.dados)) {
    if (!eFormulaDoCaso(valor) || pedido.variaveisIniciais?.[coluna] !== undefined) continue;
    formulas.set(coluna, valor.trim().slice(1));
    delete variaveis[coluna];
  }
  const emCalculo: string[] = [];

  /** Valor de uma variável do caso; as variáveis calculadas são avaliadas na 1.ª vez e ficam guardadas. */
  const procurar = (nome: string): string | undefined => {
    if (nome in variaveis) return variaveis[nome];
    const formula = formulas.get(nome);
    if (formula === undefined) return undefined;
    if (emCalculo.includes(nome)) throw new ErroDados(`A variável calculada {${nome}} depende de si própria.`);
    emCalculo.push(nome);
    try {
      variaveis[nome] = calcular(formula, procurar, `variável {${nome}}`);
    } finally {
      emCalculo.pop();
    }
    resultado.variaveis[nome] = variaveis[nome];
    return variaveis[nome];
  };

  const calcular = (formula: string, variavel: (nome: string) => string | undefined, onde: string): string => {
    try {
      return avaliarFormula(formula, {
        variavel,
        teste: caso.id,
        run: pedido.runId,
        agora: new Date(),
        contador: pedido.proximoContador,
        aleatorio: Math.random, caixaTestes: pedido.caixaTestes,
      });
    } catch (erro) {
      if (erro instanceof ErroFormula) throw new ErroDados(`Erro na fórmula (${onde}): ${erro.message}`);
      throw erro;
    }
  };

  /** Dentro de um bloco, cada variável pode ter sido trocada por um parâmetro da jornada. */
  const procurarNoBloco =
    (item: BlocoDaJornada) =>
    (nome: string): string | undefined => {
      const troca = item.parametros?.[nome];
      if (!troca) return procurar(nome);
      if (troca.tipo === 'variavel') return procurar(troca.nome);
      return resolver(troca, { ...item, parametros: undefined }, `parâmetro {${nome}}`).texto;
    };

  /** Troca as {variáveis} de um texto (endereços, cabeçalhos e corpos dos pedidos de API). */
  const preencherNoBloco =
    (item: BlocoDaJornada) =>
    (texto: string, proteger?: (valor: string) => string): string => {
      try {
        return preencherTexto(
          texto,
          { variavel: procurarNoBloco(item), teste: caso.id, run: pedido.runId, agora: new Date(), contador: pedido.proximoContador, aleatorio: Math.random, caixaTestes: pedido.caixaTestes },
          proteger,
        );
      } catch (erro) {
        if (erro instanceof ErroFormula) throw new ErroDados(erro.message);
        throw erro;
      }
    };

  /** Avalia uma condição ("só se...") com os dados do caso. */
  const cumpre = (condicao: string, variavel: (nome: string) => string | undefined, onde: string): boolean => {
    try {
      return avaliarCondicao(condicao, { variavel, teste: caso.id, run: pedido.runId, agora: new Date(), contador: pedido.proximoContador, aleatorio: Math.random, caixaTestes: pedido.caixaTestes });
    } catch (erro) {
      if (erro instanceof ErroFormula) throw new ErroDados(`Erro na ${onde}: ${erro.message}`);
      throw erro;
    }
  };

  /** Resolve o valor de um passo, tendo em conta os parâmetros do bloco nesta jornada. */
  /** A coluna dos casos de onde vem o valor de um passo (tendo em conta os parâmetros do cenário), ou null. */
  const colunaDoValor = (valor: Valor | undefined, item: BlocoDaJornada): string | null => {
    if (valor?.tipo !== 'variavel') return null;
    const troca = item.parametros?.[valor.nome];
    if (!troca) return valor.nome;
    return troca.tipo === 'variavel' ? troca.nome : null;
  };
  /** Regista o valor lido para "aceitar os resultados como esperados" (nunca colunas com segredos). */
  const registarLido = (coluna: string | null, valor: string): void => {
    if (!coluna || segredos.has(coluna) || coluna === 'TESTE' || coluna === 'RUN') return;
    resultado.valoresLidos = { ...(resultado.valoresLidos ?? {}), [coluna]: valor };
  };

  const resolver = (valor: Valor | undefined, item: BlocoDaJornada, onde = 'passo'): { texto: string; deVariavel: boolean } => {
    if (!valor) return { texto: '', deVariavel: false };
    if (valor.tipo === 'fixo') return { texto: valor.valor, deVariavel: false };
    const noBloco = procurarNoBloco(item);
    if (valor.tipo === 'variavel') {
      const troca = item.parametros?.[valor.nome];
      const texto = noBloco(valor.nome);
      if (texto === undefined) {
        const nome = troca?.tipo === 'variavel' ? troca.nome : valor.nome;
        throw new ErroDados(`Falta a coluna "${nome}" nos dados do caso.`);
      }
      return { texto, deVariavel: !troca || troca.tipo === 'variavel' };
    }
    const formula = valor.tipo === 'formula' ? valor.expressao : valor.gerador;
    return { texto: calcular(formula, noBloco, onde), deVariavel: false };
  };

  // A sessão do browser em uso (contexto, página e monitor); as outras ficam em `sessoes`.
  let contexto: BrowserContext | null = null;
  let pagina: Page | null = null;
  let monitor: MonitorDePedidos | null = null;
  let sessaoAtual = '';
  const sessoes = new Map<string, { contexto: BrowserContext; pagina: Page; monitor: MonitorDePedidos }>();
  let traceLigado = false;
  let numeroTrace = 0;
  let blocoAtual = '';
  let passoAtual = '';
  let blocoIdAtual = '';
  let passoIdAtual = '';
  let indiceBloco = -1;
  /** Quando começou o bloco atual (o "intercetar" só olha para os pedidos enviados desde então). */
  let inicioBloco = Date.now();

  const guardarTrace = async (): Promise<void> => {
    if (!contexto || !traceLigado) return;
    numeroTrace += 1;
    const nome = `trace-${numeroTrace}.zip`;
    await contexto.tracing.stopChunk({ path: path.join(pedido.pasta, nome) }).catch(() => undefined);
    resultado.evidencias?.push(nome);
    traceLigado = false;
  };
  const tirarPrint = async (nome: string): Promise<void> => {
    if (!pagina || pagina.isClosed()) return;
    try {
      await pagina.screenshot({ path: path.join(pedido.pasta, nome), fullPage: true, timeout: 10_000 });
      resultado.evidencias?.push(nome);
    } catch {
      // Sem print: o caso continua.
    }
  };

  /** Entre passos: espera se a execução estiver em pausa e pára se foi pedido para parar ou saltar o caso. */
  const pontoDeControlo = async (): Promise<void> => {
    await pedido.entrePassos();
    if (pedido.devePararAgora()) throw new Parado();
    if (pedido.deveSaltar()) throw new Saltado();
  };

  /** Marca o caso como ERRO (não chegou ao fim) e guarda a explicação e o print do momento. */
  const registarErro = async (erro: unknown): Promise<void> => {
    resultado.estado = 'ERRO';
    const mensagem = explicarErro(erro, limiteMs);
    const porExecutar = jornada.blocos
      .slice(indiceBloco + 1)
      .filter((b) => !b.sempre)
      .map((b) => pedido.blocos.get(b.blocoId)?.nome ?? b.blocoId);
    resultado.erro = { mensagem, bloco: blocoAtual, passo: passoAtual, porExecutar, ...(blocoIdAtual ? { blocoId: blocoIdAtual } : {}), ...(passoIdAtual ? { passoId: passoIdAtual } : {}) };
    registar(blocoAtual, passoAtual || 'Preparar o caso', 'erro', 0, mensagem);
    if (porExecutar.length > 0) escrever(`Blocos por executar: ${porExecutar.join(', ')}`);
    if (!(erro instanceof ErroElemento || erro instanceof ErroAcao || erro instanceof ErroDados || erro instanceof ErroApi)) {
      const tecnico = erro instanceof Error ? erro.message : String(erro);
      fs.appendFileSync(ficheiroLog, `  Detalhe técnico: ${tecnico.replace(/\n/g, '\n    ')}\n`, 'utf8');
    }
    await tirarPrint('erro.png');
  };

  /**
   * Passa para a sessão do browser `nome` (cria-a na 1.ª vez; com `estado`, cria-a já com o login feito).
   * Cada sessão é um contexto limpo e separado: pessoas diferentes na mesma jornada.
   */
  /** Próxima resposta a uma pergunta do browser (passo "dialogo"); sem esse passo, as perguntas são recusadas. */
  let respostaDialogo: 'aceitar' | 'recusar' | null = null;
  const monitores = new Map<Page, MonitorDePedidos>();
  /** Prepara uma página (também os separadores que a app abre): monitor de pedidos e perguntas do browser. */
  const prepararPagina = (p: Page): MonitorDePedidos => {
    const existente = monitores.get(p);
    if (existente) return existente;
    p.on('dialog', (d) => {
      const resposta = respostaDialogo ?? 'recusar';
      respostaDialogo = null;
      escrever(`  Pergunta do browser (${d.type()}): "${d.message()}" → ${resposta === 'aceitar' ? 'aceite' : 'recusada'}`);
      void (resposta === 'aceitar' ? d.accept() : d.dismiss()).catch(() => undefined);
    });
    const m = new MonitorDePedidos(p);
    monitores.set(p, m);
    return m;
  };

  const usarSessao = async (nome: string, estado?: SessaoGuardada['estado']): Promise<void> => {
    if (sessaoAtual === nome && contexto && !estado) return;
    // O trace é por sessão: fecha-se o pedaço da sessão que se deixa.
    await guardarTrace();
    if (estado) {
      const antiga = sessoes.get(nome);
      if (antiga) {
        if (pedido.trace) await antiga.contexto.tracing.stop().catch(() => undefined);
        await antiga.contexto.close().catch(() => undefined);
        sessoes.delete(nome);
      }
    }
    let sessao = sessoes.get(nome);
    if (!sessao) {
      const novo = await pedido.browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-PT', ...(estado ? { storageState: estado } : {}) });
      if (pedido.trace) await novo.tracing.start({ screenshots: true, snapshots: true });
      const novaPagina = await novo.newPage();
      novo.on('page', (aberta) => void prepararPagina(aberta));
      sessao = { contexto: novo, pagina: novaPagina, monitor: prepararPagina(novaPagina) };
      sessoes.set(nome, sessao);
      if (sessoes.size > 1 || nome !== SESSAO_PRINCIPAL) escrever(`  Sessão do browser "${nome}"${estado ? ' (com o login guardado)' : ''}`);
    }
    contexto = sessao.contexto;
    pagina = sessao.pagina;
    monitor = sessao.monitor;
    sessaoAtual = nome;
    pedido.aoAbrirPagina?.(pagina);
  };

  try {
    // Depois de uma verificação, o ecrã já assentou: as seguintes não precisam de esperar tanto.
    let ecraAssente = false;

    const correrBloco = async (indice: number, item: BlocoDaJornada): Promise<void> => {
      indiceBloco = indice;
      const bloco = pedido.blocos.get(item.blocoId);
      if (!bloco) throw new ErroDados(`O bloco "${item.blocoId}" já não existe.`);
      blocoAtual = bloco.nome;
      if (segredosEmFalta.length > 0) {
        throw new ErroDados(`Segredo de teste por preencher neste PC: ${segredosEmFalta.join(', ')}. Preencha-o em Dados de teste › Segredos de teste.`);
      }
      inicioBloco = Date.now();
      passoAtual = '';
      blocoIdAtual = bloco.id;
      passoIdAtual = '';
      if (bloco.tipo !== 'UI' && bloco.tipo !== 'API' && bloco.tipo !== 'MANUAL' && bloco.tipo !== 'EMAIL') throw new ErroDados(`Os blocos de ${bloco.tipo} ainda não são suportados.`);
      const aplicacao = bloco.aplicacaoId ? pedido.aplicacoes.get(bloco.aplicacaoId) : undefined;
      // Bloco condicional: só corre se a condição se cumprir para este caso.
      if (item.condicao?.trim() && !cumpre(item.condicao, procurar, `condição do bloco "${bloco.nome}"`)) {
        escrever(`Bloco ${indice + 1}: ${bloco.nome} (não executado)`);
        registar(bloco.nome, 'Bloco não executado', 'ignorado', 0, `a condição não se cumpre: ${item.condicao.trim()}`);
        estadosBlocos[indice] = 'ignorado';
        return;
      }
      estadosBlocos[indice] = 'a-correr';
      pedido.aoProgredir(resultado);
      escrever(`Bloco ${indice + 1}: ${bloco.nome}${item.sempre ? ' (limpeza: corre sempre)' : ''}`);
      evento({ tipo: 'bloco-inicio', bloco: bloco.nome });

      if (bloco.tipo === 'MANUAL') {
        await pontoDeControlo();
        const instrucao = preencherNoBloco(item)(bloco.manual?.instrucao ?? '').trim();
        if (!instrucao) throw new ErroDados(`O passo manual "${bloco.nome}" não tem instrução.`);
        if (!pedido.passoManual) throw new ErroDados('Esta execução não aceita passos manuais.');
        passoAtual = 'À espera do testador';
        resultado.passoAtual = `${bloco.nome}: à espera do testador`;
        resultado.aguardaManual = { bloco: bloco.nome, instrucao, desde: new Date().toISOString() };
        pedido.aoProgredir(resultado);
        escrever(`  Passo manual: ${instrucao.replace(/s+/g, ' ')}`);
        const t0 = Date.now();
        let resposta: RespostaManual;
        try {
          resposta = await pedido.passoManual(resultado.aguardaManual);
        } finally {
          resultado.aguardaManual = undefined;
        }
        if (pedido.devePararAgora()) throw new Parado();
        if (pedido.deveSaltar()) throw new Saltado();
        const nota = resposta.nota?.trim();
        const base = `${String(indice + 1).padStart(2, '0')}_${criarSlug(bloco.nome)}`;
        if (resposta.anexo) {
          const destino = `${base}_anexo${path.extname(resposta.anexo).toLowerCase() || '.png'}`;
          try {
            fs.copyFileSync(resposta.anexo, path.join(pedido.pasta, destino));
            resultado.evidencias?.push(destino);
          } catch {
            escrever(`  Não foi possível juntar o anexo ${path.basename(resposta.anexo)}.`);
          }
        }
        if (!resposta.ok) resultado.diferencas.push({ bloco: bloco.nome, passo: 'Confirmação manual', esperado: 'OK', obtido: nota ? `KO: ${nota}` : 'KO' });
        registar(bloco.nome, 'Confirmação manual', resposta.ok ? 'ok' : 'ko', Date.now() - t0, [resposta.ok ? 'o testador confirmou' : 'o testador marcou KO', nota && `"${nota}"`, resposta.anexo && 'com anexo'].filter(Boolean).join('; '));
        if (pagina && pagina.url() !== 'about:blank') await tirarPrint(`${base}.png`);
        return;
      }

      if (bloco.tipo === 'EMAIL') {
        // Espera pelo email na caixa de testes, verifica o corpo e guarda valores (por exemplo, o código de MFA).
        await pontoDeControlo();
        const def = bloco.email;
        passoAtual = 'À espera do email';
        resultado.passoAtual = `${bloco.nome}: à espera do email`;
        pedido.aoProgredir(resultado);
        const t0 = Date.now();
        const lido = await lerEmail(
          {
            bloco,
            urlBase: aplicacao?.urls[pedido.ambiente.id],
            perfil: def?.perfilId ? pedido.perfis.get(def.perfilId) : undefined,
            preencher: (texto) => preencherNoBloco(item)(texto),
            desde: inicio,
            devePararAgora: () => pedido.devePararAgora() || pedido.deveSaltar(),
            caixaTestes: pedido.caixaTestes,
          },
          pedido.api,
        );
        if (pedido.devePararAgora()) throw new Parado();
        if (pedido.deveSaltar()) throw new Saltado();
        const base = `${String(indice + 1).padStart(2, '0')}_${criarSlug(bloco.nome)}`;
        if (lido.endereco) registar(bloco.nome, 'Endereço de teste', 'ok', 0, lido.endereco);
        if (lido.email) {
          // Evidências: o email recebido (JSON com o texto e o HTML) e uma imagem do email desenhado.
          fs.mkdirSync(path.join(pedido.pasta, 'email'), { recursive: true });
          fs.writeFileSync(path.join(pedido.pasta, 'email', `${base}.json`), `${JSON.stringify(lido.email, null, 2)}\n`, 'utf8');
          fs.writeFileSync(path.join(pedido.pasta, 'email', `${base}.html`), lido.email.html, 'utf8');
          resultado.evidencias?.push(`email/${base}.json`, `email/${base}.html`);
          if (await desenharEmail(pedido.browser, lido.email, path.join(pedido.pasta, 'email', `${base}.png`))) resultado.evidencias?.push(`email/${base}.png`);
          registar(
            bloco.nome,
            `Email recebido: "${lido.email.assunto}"`,
            def?.naoDeveChegar ? 'ko' : 'ok',
            Date.now() - t0,
            `de ${lido.email.de}${lido.email.pasta ? ` (estava na pasta ${lido.email.pasta})` : ''}${lido.tentativas > 1 ? ` (à ${lido.tentativas}.ª consulta)` : ''}`,
          );
        } else {
          registar(bloco.nome, 'Nenhum email chegou', 'ok', Date.now() - t0, `esperou ${def?.esperaSeg ?? 60} s`);
        }
        for (const v of lido.verificacoes) {
          if (!v.ok) resultado.diferencas.push({ bloco: bloco.nome, passo: v.descricao, esperado: v.esperado, obtido: v.obtido });
          registar(bloco.nome, v.descricao, v.ok ? 'ok' : 'ko', 0, v.ok ? undefined : v.obtido.slice(0, 120));
        }
        for (const [nome, valor] of Object.entries(lido.guardadas)) {
          variaveis[nome] = valor;
          resultado.variaveis[nome] = valor;
          registar(bloco.nome, `Guardar {${nome}}`, 'ok', 0, `"${valor}"`);
        }
        if (lido.link?.abrir) {
          // Abre o link do email no browser do caso (na sessão deste bloco), por exemplo para confirmar um registo.
          await usarSessao(item.sessao?.trim() || SESSAO_PRINCIPAL);
          await (pagina as Page).goto(lido.link.url, { waitUntil: 'domcontentloaded', timeout: Math.max(limiteMs, 60_000) });
          registar(bloco.nome, 'Abrir o link do email', 'ok', 0, lido.link.url);
          await tirarPrint(`${base}_link.png`);
        }
        return;
      }

      if (bloco.tipo === 'API') {
        await pontoDeControlo();
        const definicao = bloco.pedido;
        if (!definicao) throw new ErroDados(`O bloco "${bloco.nome}" não tem um pedido definido.`);
        passoAtual = `${definicao.metodo} ${definicao.url}`;
        resultado.passoAtual = `${bloco.nome}: ${passoAtual}`;
        pedido.aoProgredir(resultado);
        const t0 = Date.now();
        // "Esperar até": repete o pedido até todas as verificações passarem, ou até acabar o tempo.
        const repetir = definicao.repetir;
        const fimRepetir = t0 + Math.max(0, repetir?.limiteSeg ?? 0) * 1000;
        let tentativas = 0;
        let feito!: ResultadoApi;
        for (;;) {
          tentativas += 1;
          const ultima = !repetir || Date.now() >= fimRepetir;
          try {
            feito = await executarBlocoApi(
              {
                bloco,
                urlBase: aplicacao?.urls[pedido.ambiente.id],
                perfil: definicao.perfilId ? pedido.perfis.get(definicao.perfilId) : undefined,
                preencher: preencherNoBloco(item),
              },
              pedido.api,
            );
            if (ultima || feito.verificacoes.every((v) => v.ok)) break;
          } catch (erro) {
            // Enquanto se espera, um erro (por exemplo, o registo ainda não existe) conta como "ainda não".
            if (ultima || !(erro instanceof ErroApi)) throw erro;
          }
          if (pedido.devePararAgora()) throw new Parado();
          await new Promise((r) => setTimeout(r, Math.max(1, repetir?.intervaloSeg ?? 1) * 1000));
        }
        // Evidências do pedido e da resposta (com os segredos já mascarados).
        const base = `${String(indice + 1).padStart(2, '0')}_${criarSlug(bloco.nome)}`;
        fs.mkdirSync(path.join(pedido.pasta, 'api'), { recursive: true });
        fs.writeFileSync(path.join(pedido.pasta, 'api', `${base}.request.json`), `${JSON.stringify(feito.pedido, null, 2)}\n`, 'utf8');
        fs.writeFileSync(path.join(pedido.pasta, 'api', `${base}.response.json`), `${JSON.stringify(feito.resposta, null, 2)}\n`, 'utf8');
        resultado.evidencias?.push(`api/${base}.request.json`, `api/${base}.response.json`);
        registar(bloco.nome, `${feito.pedido.metodo} ${feito.pedido.url}`, 'ok', Date.now() - t0, `HTTP ${feito.resposta.estado} em ${feito.resposta.tempoMs} ms${tentativas > 1 ? ` (à ${tentativas}.ª tentativa)` : ''}`);
        for (const v of feito.verificacoes) {
          if (!v.ok) resultado.diferencas.push({ bloco: bloco.nome, passo: `Verificar: ${v.descricao}`, esperado: v.esperado, obtido: v.obtido });
          registar(bloco.nome, `Verificar: ${v.descricao}`, v.ok ? 'ok' : 'ko', 0, v.ok ? undefined : `obtido "${v.obtido}"`);
        }
        for (const [nome, valor] of Object.entries(feito.guardadas)) {
          variaveis[nome] = valor;
          resultado.variaveis[nome] = valor;
          registar(bloco.nome, `Guardar {${nome}}`, 'ok', 0, `"${valor}"`);
        }
        return;
      }

      // Sessão do browser deste bloco. Num bloco de login, uma sessão já guardada (mesmos dados) evita repetir o login.
      const nomeSessao = item.sessao?.trim() || SESSAO_PRINCIPAL;
      let chaveLogin = '';
      if (bloco.login && pedido.sessoesGuardadas) {
        const procurar = procurarNoBloco(item);
        const entradas = variaveisDoBloco(bloco).usa.map((nome) => [nome, procurar(nome) ?? '']);
        // A chave é um resumo (hash): as passwords usadas no login não ficam guardadas em lado nenhum.
        chaveLogin = createHash('sha256').update(JSON.stringify([bloco.id, entradas])).digest('hex');
        const guardada = pedido.sessoesGuardadas.get(chaveLogin);
        if (guardada) {
          await pontoDeControlo();
          await usarSessao(nomeSessao, guardada.estado);
          if (guardada.url && guardada.url !== 'about:blank') {
            await (pagina as Page).goto(guardada.url, { waitUntil: 'domcontentloaded', timeout: Math.max(limiteMs, 90_000) });
          }
          registar(bloco.nome, 'Login', 'ok', 0, `sessão reutilizada (o login foi feito no caso ${guardada.caso})`);
          return;
        }
      }
      await usarSessao(nomeSessao);
      const pag = pagina as Page;
      const ctx = contexto as BrowserContext;
      const mon = monitor as MonitorDePedidos;

      // Blocos com segredos (por exemplo, login) correm sem trace, para a password não ficar gravada.
      const temSegredos = bloco.passos.some((p) => passoSecreto(p, item));
      if (pedido.trace) {
        if (temSegredos) await guardarTrace();
        else if (!traceLigado) {
          await ctx.tracing.startChunk();
          traceLigado = true;
        }
      }

      for (const passo of bloco.passos) {
        await pontoDeControlo();
        passoAtual = passo.descricao;
        passoIdAtual = passo.id;
        resultado.passoAtual = `${bloco.nome}: ${passo.descricao}`;
        pedido.aoProgredir(resultado);
        // Passo condicional: só corre se a condição se cumprir para este caso.
        if (passo.condicao?.trim() && !cumpre(passo.condicao, procurarNoBloco(item), `condição do passo "${passo.descricao}"`)) {
          registar(bloco.nome, passo.descricao, 'ignorado', 0, `a condição não se cumpre: ${passo.condicao.trim()}`);
          continue;
        }
        const t0 = Date.now();
        // A página em uso pode mudar a meio do bloco (passo "separador").
        await (monitor ?? mon).esperarCalma(pagina ?? pag, 10_000);
        const nota = await executarPasso(passo, item, aplicacao, bloco.nome);
        if (nota.estado === 'ko' && nota.diferenca) resultado.diferencas.push(nota.diferenca);
        registar(bloco.nome, passo.descricao, nota.estado, Date.now() - t0, nota.detalhe);
      }

      await (monitor ?? mon).esperarCalma(pagina ?? pag, 5_000);
      // Login feito sem diferenças: a sessão fica guardada (só em memória) para os casos seguintes.
      if (chaveLogin && !resultado.diferencas.some((d) => d.bloco === bloco.nome)) {
        pedido.sessoesGuardadas?.set(chaveLogin, { estado: await ctx.storageState(), url: pag.url(), caso: caso.id });
        escrever(`  Sessão de login guardada para os casos seguintes`);
      }
      await tirarPrint(`${String(indice + 1).padStart(2, '0')}_${criarSlug(bloco.nome)}.png`);
    };

    // Corre os blocos por ordem. Depois de um erro, só correm os blocos de limpeza ("corre sempre").
    let houveErro = false;
    for (const [indice, item] of jornada.blocos.entries()) {
      if (houveErro && !item.sempre) continue;
      if (indice < (pedido.desdeBloco ?? 0)) {
        const nome = pedido.blocos.get(item.blocoId)?.nome ?? item.blocoId;
        registar(nome, 'Bloco não executado', 'ignorado', 0, `retomado a partir do bloco ${(pedido.desdeBloco ?? 0) + 1}`);
        estadosBlocos[indice] = 'ignorado';
        continue;
      }
      const diferencasAntes = resultado.diferencas.length;
      try {
        await correrBloco(indice, item);
        if (estadosBlocos[indice] === 'a-correr') estadosBlocos[indice] = resultado.diferencas.length > diferencasAntes ? 'ko' : 'ok';
      } catch (erro) {
        if (erro instanceof Parado || erro instanceof Saltado) throw erro;
        estadosBlocos[indice] = 'erro';
        if (houveErro) {
          // Uma limpeza que falha não muda o resultado do caso, mas fica registada.
          registar(blocoAtual, passoAtual || 'Limpeza', 'erro', 0, `A limpeza falhou: ${explicarErro(erro, limiteMs)}`);
        } else {
          houveErro = true;
          await registarErro(erro);
        }
      }
    }
    if (!houveErro) resultado.estado = resultado.diferencas.length > 0 ? 'KO' : 'OK';

    /** Executa um passo e devolve o que escrever no log. */
    async function executarPasso(
      passo: Passo,
      item: BlocoDaJornada,
      aplicacao: Aplicacao | undefined,
      nomeBloco: string,
    ): Promise<{ estado: EstadoPasso; detalhe?: string; diferenca?: Diferenca }> {
      const p = pagina as Page;
      const alternativa = (enc?: { alternativa: boolean; usado: Localizador }): string => {
        const falhou = passo.alvo?.localizadores[0];
        if (!enc?.alternativa || !falhou) return '';
        // Fica como sugestão "reparar com um clique" (uma por passo e localizador).
        const reparos = (resultado.reparos ??= []);
        if (!reparos.some((r) => r.blocoId === item.blocoId && r.passoId === passo.id && mesmoLocalizador(r.usado, enc.usado))) {
          reparos.push({ blocoId: item.blocoId, blocoNome: nomeBloco, passoId: passo.id, passoDescricao: passo.descricao, falhou, usado: enc.usado });
        }
        return `encontrado por uma alternativa (${descreverLocalizador(enc.usado)}): o localizador preferido (${descreverLocalizador(falhou)}) falhou`;
      };
      const juntar = (...partes: Array<string | undefined>): string | undefined => partes.filter(Boolean).join('; ') || undefined;
      // "Encontrar linha na tabela": o texto que identifica a linha, com os dados deste caso.
      const linha = passo.alvo?.linha ? resolver(passo.alvo.linha.valor, item, 'linha da tabela').texto : undefined;
      const notaLinha = linha !== undefined ? `na linha "${linha}"` : undefined;

      switch (passo.acao) {
        case 'navegar': {
          const base = aplicacao?.urls[pedido.ambiente.id];
          const caminho = resolver(passo.valor, item).texto;
          if (!base && !/^https?:\/\//i.test(caminho)) {
            throw new ErroDados(`A aplicação "${aplicacao?.nome ?? '?'}" não tem endereço no ambiente ${pedido.ambiente.nome}.`);
          }
          await p.goto(construirUrl(base ?? '', caminho), { waitUntil: 'domcontentloaded', timeout: Math.max(limiteMs, 90_000) });
          ecraAssente = false;
          return { estado: 'ok' };
        }
        case 'escrever':
        case 'escolher':
        case 'marcar':
        case 'clicar': {
          const valor = resolver(passo.valor, item).texto;
          const feito = await executarAcao(p, passo, valor, { limiteMs, linha });
          ecraAssente = false;
          const mostrado = passo.acao === 'clicar' ? undefined : passoSecreto(passo, item) ? 'valor: ***' : feito.detalhe ?? `valor: "${valor}"`;
          return { estado: 'ok', detalhe: juntar(mostrado, notaLinha, alternativa(feito.encontrado)) };
        }
        case 'guardar': {
          if (!passo.variavel) throw new ErroDados(`O passo "${passo.descricao}" não diz em que variável guardar.`);
          const fim = Date.now() + limiteMs;
          let leitura = await lerElemento(p, passo, { limiteMs, linha });
          while (!leitura.texto && Date.now() < fim) {
            await p.waitForTimeout(200);
            leitura = await lerElemento(p, passo, { limiteMs: 2_000, linha });
          }
          variaveis[passo.variavel] = leitura.texto;
          resultado.variaveis[passo.variavel] = leitura.texto;
          return { estado: 'ok', detalhe: juntar(`{${passo.variavel}} = "${leitura.texto}"`, alternativa(leitura.encontrado)) };
        }
        case 'esperar': {
          if (passo.alvo) {
            const leitura = await lerElemento(p, passo, { limiteMs, linha });
            await leitura.encontrado.locator.waitFor({ state: 'visible', timeout: limiteMs });
          } else {
            const numero = Number(resolver(passo.valor, item).texto.replace(',', '.'));
            await p.waitForTimeout(Number.isFinite(numero) ? Math.min(numero, 300) * 1000 : 1000);
          }
          return { estado: 'ok' };
        }
        case 'carregar': {
          // Upload: escolhe o ficheiro no campo (ou na janela de escolha que o botão abre).
          const caminho = resolver(passo.valor, item).texto.trim();
          const completo = path.isAbsolute(caminho) ? caminho : path.join(pedido.pastaProjeto ?? '', caminho);
          if (!caminho || !fs.existsSync(completo)) throw new ErroDados(`O ficheiro a carregar não existe: ${completo || '(sem caminho)'}`);
          if (!passo.alvo) throw new ErroDados(`O passo "${passo.descricao}" não tem elemento.`);
          const enc = await encontrar(p, passo.alvo, { limiteMs, linha });
          const campo = await controloDe(enc.locator, 'input[type="file"]');
          if (await campo.evaluate((el) => el instanceof HTMLInputElement && el.type === 'file')) {
            await campo.setInputFiles(completo, { timeout: limiteMs });
          } else {
            const [escolha] = await Promise.all([p.waitForEvent('filechooser', { timeout: limiteMs }), enc.locator.click({ timeout: limiteMs })]);
            await escolha.setFiles(completo);
          }
          ecraAssente = false;
          return { estado: 'ok', detalhe: juntar(`ficheiro "${path.basename(completo)}"`, alternativa(enc)) };
        }
        case 'descarregar': {
          // Clica e espera pelo download; o ficheiro fica nas evidências do caso.
          if (!passo.alvo) throw new ErroDados(`O passo "${passo.descricao}" não tem elemento.`);
          const enc = await encontrar(p, passo.alvo, { limiteMs, linha });
          const [download] = await Promise.all([p.waitForEvent('download', { timeout: limiteMs }), enc.locator.click({ timeout: limiteMs })]);
          const nome = download.suggestedFilename().replace(/[\\/:*?"<>|]/g, '_') || 'ficheiro';
          fs.mkdirSync(path.join(pedido.pasta, 'downloads'), { recursive: true });
          const destino = path.join(pedido.pasta, 'downloads', nome);
          await download.saveAs(destino);
          resultado.evidencias?.push(`downloads/${nome}`);
          if (passo.variavel) {
            variaveis[passo.variavel] = nome;
            resultado.variaveis[passo.variavel] = nome;
          }
          const tamanho = fs.statSync(destino).size;
          const esperado = passo.valor ? resolver(passo.valor, item).texto : '';
          if (esperado.trim()) {
            const conteudo = fs.readFileSync(destino, 'utf8');
            if (!conteudo.includes(esperado)) {
              return {
                estado: 'ko',
                detalhe: `o ficheiro "${nome}" não contém "${esperado}"`,
                diferenca: { bloco: nomeBloco, passo: passo.descricao, esperado: `contém "${esperado}"`, obtido: compactar(conteudo).slice(0, 200) },
              };
            }
          }
          return { estado: 'ok', detalhe: juntar(`ficheiro "${nome}" (${tamanho} bytes)`, esperado.trim() ? `contém "${esperado}"` : undefined, alternativa(enc)) };
        }
        case 'separador': {
          // "novo": o separador que a app acabou de abrir; "principal": o primeiro.
          const qual = (resolver(passo.valor, item).texto.trim() || 'novo').toLowerCase();
          const ctx = contexto as BrowserContext;
          let destino: Page | undefined;
          // Páginas internas do browser (por exemplo edge://downloads-hub, que o Edge abre sozinho depois de um
          // download) não são separadores da aplicação.
          const daAplicacao = (): Page[] => ctx.pages().filter((pg) => !/^(edge|chrome|about|devtools):/i.test(pg.url()) || pg.url() === 'about:blank');
          if (qual === 'principal') destino = daAplicacao()[0];
          else {
            const fim = Date.now() + limiteMs;
            while (!destino && Date.now() < fim) {
              const paginas = daAplicacao();
              const ultima = paginas[paginas.length - 1];
              if (paginas.length > 1 && ultima !== pagina) destino = ultima;
              else await p.waitForTimeout(200);
            }
          }
          if (!destino) throw new ErroDados(qual === 'principal' ? 'Não há separador principal.' : 'A aplicação não abriu nenhum separador novo.');
          await destino.waitForLoadState('domcontentloaded').catch(() => undefined);
          await destino.bringToFront().catch(() => undefined);
          pagina = destino;
          monitor = prepararPagina(destino);
          sessoes.set(sessaoAtual, { contexto: ctx, pagina: destino, monitor });
          pedido.aoAbrirPagina?.(destino);
          ecraAssente = false;
          return { estado: 'ok', detalhe: `agora no separador ${qual} (${destino.url()})` };
        }
        case 'dialogo': {
          const resposta = resolver(passo.valor, item).texto.trim().toLowerCase();
          respostaDialogo = /^(recusar|nao|não|cancelar|n)$/.test(resposta) ? 'recusar' : 'aceitar';
          return { estado: 'ok', detalhe: `a próxima pergunta do browser vai ser ${respostaDialogo === 'aceitar' ? 'aceite' : 'recusada'}` };
        }
        case 'simular': {
          // A partir daqui, nesta sessão do browser, os pedidos a este endereço recebem a resposta simulada.
          const rede = passo.rede;
          if (!rede?.url.trim()) throw new ErroDados(`O passo "${passo.descricao}" não diz que pedidos simular.`);
          const modo = rede.modo ?? 'responder';
          const corpo = modo === 'responder' ? preencherNoBloco(item)(rede.corpo ?? '') : '';
          const estado = rede.estado ?? 200;
          const tipoConteudo =
            rede.tipoConteudo?.trim() || (/^\s*[[{]/.test(corpo) ? 'application/json; charset=utf-8' : /^\s*</.test(corpo) ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
          const metodo = rede.metodo?.trim().toUpperCase();
          await (contexto as BrowserContext).route(
            (url) => coincideUrl(rede.url, url.href),
            async (rota) => {
              if (metodo && rota.request().method() !== metodo) return rota.fallback();
              if (modo === 'falhar') return rota.abort('failed');
              if (modo === 'demorar') {
                await new Promise((r) => setTimeout(r, Math.max(0, rede.demoraSeg ?? 30) * 1000));
                return rota.abort('timedout').catch(() => undefined);
              }
              return rota.fulfill({ status: estado, body: corpo, contentType: tipoConteudo });
            },
          );
          const efeito = modo === 'falhar' ? 'falham (sem ligação)' : modo === 'demorar' ? `demoram ${rede.demoraSeg ?? 30} s e falham` : `recebem HTTP ${estado}`;
          return { estado: 'ok', detalhe: `a partir daqui, os pedidos${metodo ? ` ${metodo}` : ''} a "${rede.url}" ${efeito}` };
        }
        case 'intercetar': {
          // O pedido que a app enviou desde o início do bloco (espera um pouco se ainda não saiu).
          const rede = passo.rede;
          if (!rede?.url.trim()) throw new ErroDados(`O passo "${passo.descricao}" não diz que pedido intercetar.`);
          const mon = monitor as MonitorDePedidos;
          const metodo = rede.metodo?.trim().toUpperCase();
          const fimEspera = Date.now() + Math.max(1, passo.verificacao?.esperaSeg ?? 10) * 1000;
          const procurar = () => [...mon.historico].reverse().find((r) => r.quando >= inicioBloco && coincideUrl(rede.url, r.url) && (!metodo || r.metodo === metodo));
          let enviado = procurar();
          while (!enviado && Date.now() < fimEspera) {
            await p.waitForTimeout(200);
            enviado = procurar();
          }
          if (!enviado) {
            return {
              estado: 'ko',
              detalhe: `a app não enviou nenhum pedido${metodo ? ` ${metodo}` : ''} a "${rede.url}"`,
              diferenca: { bloco: nomeBloco, passo: passo.descricao, esperado: `pedido a ${rede.url}`, obtido: '(pedido não enviado)' },
            };
          }
          const ler = lerCampoDoPedido(enviado);
          const falhas: string[] = [];
          for (const v of rede.verificacoes ?? []) {
            const esperado = preencherNoBloco(item)(v.esperado);
            const obtido = ler(v.caminho);
            const ok =
              v.caminho.trim() === '*'
                ? enviado.corpo.includes(esperado)
                : obtido !== undefined && (obtido === esperado || ((): boolean => {
                    const a = lerNumero(obtido);
                    const b = lerNumero(esperado);
                    return Boolean(a && b && compararComTolerancia(b, a, { inteiro: 0n, casas: 0 }).igual);
                  })());
            if (!ok) {
              const mostrado = v.caminho.trim() === '*' ? '(o corpo não contém o valor)' : obtido === undefined ? '(campo em falta)' : obtido;
              falhas.push(`${v.caminho}: esperado "${esperado}", obtido "${mostrado}"`);
              resultado.diferencas.push({ bloco: nomeBloco, passo: `${passo.descricao} › ${v.caminho}`, esperado, obtido: mostrado });
            }
          }
          if (rede.guardar?.variavel.trim()) {
            const valor = ler(rede.guardar.caminho) ?? '';
            variaveis[rede.guardar.variavel.trim()] = valor;
            resultado.variaveis[rede.guardar.variavel.trim()] = valor;
          }
          const resumo = `${enviado.metodo} ${enviado.url.replace(/^https?:\/\/[^/]+/, '')}`;
          const verificados = (rede.verificacoes ?? []).length;
          if (falhas.length > 0) return { estado: 'ko', detalhe: `${resumo}; ${falhas.join('; ')}` };
          return { estado: 'ok', detalhe: verificados > 0 ? `${resumo}; ${verificados} campo(s) verificado(s)` : resumo };
        }
        case 'verificar': {
          const tipo = passo.verificacao?.tipo ?? 'texto';
          // "Esperar até": o passo pode ter o seu próprio tempo de espera (por exemplo, um estado que demora a mudar).
          const esperaPropria = passo.verificacao?.esperaSeg;
          const espera = esperaPropria && esperaPropria > 0 ? esperaPropria * 1000 : ecraAssente ? 1_000 : Math.min(limiteMs, 8_000);
          const fim = Date.now() + espera;
          let esperado = '';
          if (tipo !== 'visivel') {
            const valor = resolver(passo.valor, item);
            esperado = valor.texto;
            // Coluna vazia no Excel = "não verificar este valor neste caso". Mesmo assim, lê o ecrã (sem falhar),
            // para depois se poder "aceitar os resultados como esperados" e preencher a coluna.
            if (valor.deVariavel && esperado.trim() === '') {
              let lido = '';
              try {
                const leitura = await lerElemento(p, passo, { limiteMs: Math.max(500, fim - Date.now()), linha });
                const numero = tipo === 'numero' ? lerNumero(leitura.texto) : null;
                lido = numero ? formatar(numero) : compactar(leitura.texto);
                registarLido(colunaDoValor(passo.valor, item), lido);
              } catch {
                // Elemento não encontrado: fica só "ignorado".
              }
              return { estado: 'ignorado', detalhe: lido ? `sem valor esperado nos dados do caso (lido: "${lido}")` : 'sem valor esperado nos dados do caso' };
            }
          }
          const tolerancia = lerNumero(passo.verificacao?.tolerancia ?? '0') ?? { inteiro: 0n, casas: 0 };
          const numeroEsperado = tipo === 'numero' ? lerNumero(esperado) : null;
          if (tipo === 'numero' && !numeroEsperado) throw new ErroDados(`O valor esperado "${esperado}" não é um número.`);

          let obtido = '';
          let diferenca: string | undefined;
          let nota = '';
          for (;;) {
            let coincide = false;
            try {
              const leitura = await lerElemento(p, passo, { limiteMs: Math.max(500, fim - Date.now()), linha });
              nota = alternativa(leitura.encontrado);
              if (tipo === 'visivel') {
                obtido = leitura.visivel ? 'visível' : 'não visível';
                coincide = leitura.visivel;
              } else if (tipo === 'numero' && numeroEsperado) {
                obtido = leitura.texto;
                const numeroObtido = lerNumero(leitura.texto);
                if (numeroObtido) {
                  const comparacao = compararComTolerancia(numeroEsperado, numeroObtido, tolerancia);
                  coincide = comparacao.igual;
                  diferenca = comparacao.diferenca;
                  obtido = formatar(numeroObtido);
                } else {
                  diferenca = undefined;
                }
              } else {
                obtido = compactar(leitura.texto);
                coincide = obtido === compactar(esperado);
              }
            } catch (erro) {
              if (!(erro instanceof ErroElemento)) throw erro;
              obtido = '(elemento não encontrado)';
              diferenca = undefined;
            }
            if (coincide) {
              ecraAssente = true;
              if (tipo !== 'visivel') registarLido(colunaDoValor(passo.valor, item), obtido);
              return { estado: 'ok', detalhe: juntar(tipo === 'visivel' ? undefined : `"${obtido}"`, notaLinha, nota) };
            }
            if (Date.now() >= fim) break;
            await p.waitForTimeout(200);
          }
          ecraAssente = true;
          if (tipo !== 'visivel' && obtido !== '(elemento não encontrado)') registarLido(colunaDoValor(passo.valor, item), obtido);
          const esperadoMostrado = tipo === 'visivel' ? 'visível' : numeroEsperado ? formatar(numeroEsperado) : compactar(esperado);
          return {
            estado: 'ko',
            detalhe: juntar(`esperado "${esperadoMostrado}", obtido "${obtido}"${diferenca ? ` (diferença ${diferenca})` : ''}`, notaLinha, nota),
            diferenca: { bloco: nomeBloco, passo: passo.descricao, esperado: esperadoMostrado, obtido, ...(diferenca ? { diferenca } : {}) },
          };
        }
        default:
          throw new ErroDados(`Ação desconhecida: "${String(passo.acao)}".`);
      }
    }
  } catch (erro) {
    if (erro instanceof Parado) {
      resultado.estado = 'PARADO';
      escrever('Parado a pedido do utilizador.');
    } else if (erro instanceof Saltado) {
      resultado.estado = 'SALTADO';
      escrever('Caso saltado a pedido do utilizador.');
    } else if (resultado.estado !== 'ERRO') {
      await registarErro(erro);
    }
  } finally {
    // O que não chegou a correr (depois de um erro, ou caso parado/saltado).
    for (const [i, e] of estadosBlocos.entries()) if (e === 'por-correr' || e === 'a-correr') estadosBlocos[i] = 'nao-corrido';
    pedido.aoAbrirPagina?.(null);
    await guardarTrace();
    // Fecha todas as sessões do browser deste caso.
    for (const sessao of sessoes.values()) {
      if (pedido.trace) await sessao.contexto.tracing.stop().catch(() => undefined);
      await sessao.contexto.close().catch(() => undefined);
    }
    resultado.duracaoMs = Date.now() - inicio;
    resultado.passoAtual = undefined;
    const resumo =
      resultado.estado === 'KO'
        ? `KO (${resultado.diferencas.length} diferença${resultado.diferencas.length === 1 ? '' : 's'})`
        : resultado.estado;
    escrever(`Resultado: ${resumo} em ${segundos(resultado.duracaoMs)}`);
    const sugestoes = sugerirParaCaso(resultado);
    if (sugestoes.length > 0) {
      resultado.sugestoes = sugestoes;
      for (const s of sugestoes) escrever(`Sugestão: ${s}`);
    }
    evento({ tipo: 'caso-fim', estado: resultado.estado, duracaoMs: resultado.duracaoMs, diferencas: resultado.diferencas, erro: resultado.erro });
  }
  return resultado;
}
