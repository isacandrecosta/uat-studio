// Corre UM caso (uma jornada com uma linha de dados) num contexto de browser limpo.
// Resultado: OK (tudo coincide), KO (chegou ao fim mas há diferenças) ou ERRO (não chegou ao fim).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Browser, BrowserContext, errors, Page, Request } from 'playwright-core';
import {
  Ambiente,
  Aplicacao,
  Bloco,
  BlocoDaJornada,
  Caso,
  Diferenca,
  EstadoPasso,
  Jornada,
  Passo,
  RegistoPasso,
  ResultadoCaso,
  Valor,
} from '../../shared/modelo';
import { construirUrl, ErroAcao, executarAcao, lerElemento } from '../motor/acoes';
import { descreverLocalizador, ErroElemento } from '../motor/localizar';
import { criarSlug } from '../projeto/repositorio';
import { compararComTolerancia, formatar, lerNumero } from './numeros';

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
  /** Chamado sempre que há novidades, para a interface acompanhar. */
  aoProgredir(resultado: ResultadoCaso): void;
  devePararAgora(): boolean;
}

/** Erro nos dados ou na definição do teste (não na aplicação). */
class ErroDados extends Error {}
class Parado extends Error {}

const hora = (): string => new Date().toLocaleTimeString('pt-PT', { hour12: false });
const segundos = (ms: number): string => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const compactar = (texto: string): string => texto.replace(/\s+/g, ' ').trim();

/** Espera que os pedidos da página ao servidor terminem (os ecrãs OutSystems carregam os dados depois de aparecerem). */
class MonitorDePedidos {
  private pendentes = new Set<Request>();
  constructor(pagina: Page) {
    pagina.on('request', (pedido) => {
      const tipo = pedido.resourceType();
      if (tipo === 'xhr' || tipo === 'fetch') this.pendentes.add(pedido);
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

/** Transforma um erro técnico numa frase simples. */
export function explicarErro(erro: unknown, limiteMs: number): string {
  if (erro instanceof ErroElemento || erro instanceof ErroAcao || erro instanceof ErroDados) return erro.message;
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
  };
  const variaveis: Record<string, string> = { ...caso.dados, TESTE: caso.id, RUN: pedido.runId };

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

  fs.mkdirSync(pedido.pasta, { recursive: true });
  const ficheiroLog = path.join(pedido.pasta, 'caso.log');
  const ficheiroEventos = path.join(pedido.pasta, 'eventos.jsonl');
  const escrever = (linha: string): void => fs.appendFileSync(ficheiroLog, `[${hora()}] ${linha}\n`, 'utf8');
  const evento = (dados: Record<string, unknown>): void =>
    fs.appendFileSync(ficheiroEventos, `${JSON.stringify({ quando: new Date().toISOString(), ...dados })}\n`, 'utf8');

  const dadosVisiveis = Object.entries(caso.dados)
    .map(([nome, valor]) => `${nome}=${segredos.has(nome) ? '***' : valor}`)
    .join('; ');
  escrever(`Caso ${caso.id}${caso.nome ? ` (${caso.nome})` : ''} | Jornada: ${jornada.nome} | Ambiente: ${pedido.ambiente.nome}`);
  escrever(`Dados: ${dadosVisiveis || '(sem dados)'}`);
  evento({ tipo: 'caso-inicio', caso: caso.id, jornada: jornada.id, ambiente: pedido.ambiente.id });

  const ETIQUETAS: Record<EstadoPasso, string> = { ok: 'OK   ', ko: 'KO   ', erro: 'ERRO ', ignorado: '--   ' };
  const registar = (bloco: string, descricao: string, estado: EstadoPasso, duracaoMs: number, detalhe?: string): void => {
    const registo: RegistoPasso = { bloco, descricao, estado, duracaoMs, ...(detalhe ? { detalhe } : {}) };
    resultado.passos.push(registo);
    escrever(`  ${ETIQUETAS[estado]} ${descricao}${detalhe ? `: ${detalhe}` : ''} (${segundos(duracaoMs)})`);
    evento({ tipo: 'passo', ...registo });
  };

  /** Resolve o valor de um passo, tendo em conta os parâmetros do bloco nesta jornada. */
  const resolver = (valor: Valor | undefined, item: BlocoDaJornada): { texto: string; deVariavel: boolean } => {
    if (!valor) return { texto: '', deVariavel: false };
    if (valor.tipo === 'fixo') return { texto: valor.valor, deVariavel: false };
    if (valor.tipo === 'variavel') {
      const troca = item.parametros?.[valor.nome];
      if (troca?.tipo === 'fixo') return { texto: troca.valor, deVariavel: false };
      const nome = troca?.tipo === 'variavel' ? troca.nome : valor.nome;
      if (!(nome in variaveis)) throw new ErroDados(`Falta a coluna "${nome}" nos dados do caso.`);
      return { texto: variaveis[nome], deVariavel: true };
    }
    throw new ErroDados('As fórmulas e os geradores ainda não são suportados (chegam na Fase 2).');
  };

  let contexto: BrowserContext | null = null;
  let pagina: Page | null = null;
  let traceLigado = false;
  let numeroTrace = 0;
  let blocoAtual = '';
  let passoAtual = '';
  let indiceBloco = -1;

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

  try {
    contexto = await pedido.browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-PT' });
    if (pedido.trace) await contexto.tracing.start({ screenshots: true, snapshots: true });
    pagina = await contexto.newPage();
    const monitor = new MonitorDePedidos(pagina);
    // Depois de uma verificação, o ecrã já assentou: as seguintes não precisam de esperar tanto.
    let ecraAssente = false;

    for (const [indice, item] of jornada.blocos.entries()) {
      indiceBloco = indice;
      const bloco = pedido.blocos.get(item.blocoId);
      if (!bloco) throw new ErroDados(`O bloco "${item.blocoId}" já não existe.`);
      blocoAtual = bloco.nome;
      if (bloco.tipo !== 'UI') throw new ErroDados(`Os blocos de ${bloco.tipo} ainda não são suportados.`);
      const aplicacao = bloco.aplicacaoId ? pedido.aplicacoes.get(bloco.aplicacaoId) : undefined;
      escrever(`Bloco ${indice + 1}: ${bloco.nome}`);
      evento({ tipo: 'bloco-inicio', bloco: bloco.nome });

      // Blocos com segredos (por exemplo, login) correm sem trace, para a password não ficar gravada.
      const temSegredos = bloco.passos.some((p) => p.secreto);
      if (pedido.trace) {
        if (temSegredos) await guardarTrace();
        else if (!traceLigado) {
          await contexto.tracing.startChunk();
          traceLigado = true;
        }
      }

      for (const passo of bloco.passos) {
        if (pedido.devePararAgora()) throw new Parado();
        passoAtual = passo.descricao;
        resultado.passoAtual = `${bloco.nome}: ${passo.descricao}`;
        pedido.aoProgredir(resultado);
        const t0 = Date.now();
        await monitor.esperarCalma(pagina, 10_000);
        const nota = await executarPasso(passo, item, aplicacao, bloco.nome);
        if (nota.estado === 'ko' && nota.diferenca) resultado.diferencas.push(nota.diferenca);
        registar(bloco.nome, passo.descricao, nota.estado, Date.now() - t0, nota.detalhe);
      }

      await monitor.esperarCalma(pagina, 5_000);
      await tirarPrint(`${String(indice + 1).padStart(2, '0')}_${criarSlug(bloco.nome)}.png`);
    }

    resultado.estado = resultado.diferencas.length > 0 ? 'KO' : 'OK';

    /** Executa um passo e devolve o que escrever no log. */
    async function executarPasso(
      passo: Passo,
      item: BlocoDaJornada,
      aplicacao: Aplicacao | undefined,
      nomeBloco: string,
    ): Promise<{ estado: EstadoPasso; detalhe?: string; diferenca?: Diferenca }> {
      const p = pagina as Page;
      const alternativa = (enc?: { alternativa: boolean; usado: Parameters<typeof descreverLocalizador>[0] }): string =>
        enc?.alternativa ? `encontrado por uma alternativa (${descreverLocalizador(enc.usado)}): o localizador preferido falhou` : '';
      const juntar = (...partes: Array<string | undefined>): string | undefined => partes.filter(Boolean).join('; ') || undefined;

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
          const feito = await executarAcao(p, passo, valor, { limiteMs });
          ecraAssente = false;
          const mostrado = passo.acao === 'clicar' ? undefined : passo.secreto ? 'valor: ***' : feito.detalhe ?? `valor: "${valor}"`;
          return { estado: 'ok', detalhe: juntar(mostrado, alternativa(feito.encontrado)) };
        }
        case 'guardar': {
          if (!passo.variavel) throw new ErroDados(`O passo "${passo.descricao}" não diz em que variável guardar.`);
          const fim = Date.now() + limiteMs;
          let leitura = await lerElemento(p, passo, { limiteMs });
          while (!leitura.texto && Date.now() < fim) {
            await p.waitForTimeout(200);
            leitura = await lerElemento(p, passo, { limiteMs: 2_000 });
          }
          variaveis[passo.variavel] = leitura.texto;
          resultado.variaveis[passo.variavel] = leitura.texto;
          return { estado: 'ok', detalhe: juntar(`{${passo.variavel}} = "${leitura.texto}"`, alternativa(leitura.encontrado)) };
        }
        case 'esperar': {
          if (passo.alvo) {
            const leitura = await lerElemento(p, passo, { limiteMs });
            await leitura.encontrado.locator.waitFor({ state: 'visible', timeout: limiteMs });
          } else {
            const numero = Number(resolver(passo.valor, item).texto.replace(',', '.'));
            await p.waitForTimeout(Number.isFinite(numero) ? Math.min(numero, 300) * 1000 : 1000);
          }
          return { estado: 'ok' };
        }
        case 'verificar': {
          const tipo = passo.verificacao?.tipo ?? 'texto';
          const espera = ecraAssente ? 1_000 : Math.min(limiteMs, 8_000);
          const fim = Date.now() + espera;
          let esperado = '';
          if (tipo !== 'visivel') {
            const valor = resolver(passo.valor, item);
            esperado = valor.texto;
            // Coluna vazia no Excel = "não verificar este valor neste caso".
            if (valor.deVariavel && esperado.trim() === '') {
              return { estado: 'ignorado', detalhe: 'sem valor esperado nos dados do caso' };
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
              const leitura = await lerElemento(p, passo, { limiteMs: Math.max(500, fim - Date.now()) });
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
              return { estado: 'ok', detalhe: juntar(tipo === 'visivel' ? undefined : `"${obtido}"`, nota) };
            }
            if (Date.now() >= fim) break;
            await p.waitForTimeout(200);
          }
          ecraAssente = true;
          const esperadoMostrado = tipo === 'visivel' ? 'visível' : numeroEsperado ? formatar(numeroEsperado) : compactar(esperado);
          return {
            estado: 'ko',
            detalhe: juntar(`esperado "${esperadoMostrado}", obtido "${obtido}"${diferenca ? ` (diferença ${diferenca})` : ''}`, nota),
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
    } else {
      resultado.estado = 'ERRO';
      const mensagem = explicarErro(erro, limiteMs);
      const porExecutar = jornada.blocos
        .slice(indiceBloco + 1)
        .map((b) => pedido.blocos.get(b.blocoId)?.nome ?? b.blocoId);
      resultado.erro = { mensagem, bloco: blocoAtual, passo: passoAtual, porExecutar };
      registar(blocoAtual, passoAtual || 'Preparar o caso', 'erro', 0, mensagem);
      if (porExecutar.length > 0) escrever(`Blocos por executar: ${porExecutar.join(', ')}`);
      if (!(erro instanceof ErroElemento || erro instanceof ErroAcao || erro instanceof ErroDados)) {
        const tecnico = erro instanceof Error ? erro.message : String(erro);
        fs.appendFileSync(ficheiroLog, `  Detalhe técnico: ${tecnico.replace(/\n/g, '\n    ')}\n`, 'utf8');
      }
      await tirarPrint('erro.png');
    }
  } finally {
    await guardarTrace();
    if (contexto) {
      if (pedido.trace) await contexto.tracing.stop().catch(() => undefined);
      await contexto.close().catch(() => undefined);
    }
    resultado.duracaoMs = Date.now() - inicio;
    resultado.passoAtual = undefined;
    const resumo =
      resultado.estado === 'KO'
        ? `KO (${resultado.diferencas.length} diferença${resultado.diferencas.length === 1 ? '' : 's'})`
        : resultado.estado;
    escrever(`Resultado: ${resumo} em ${segundos(resultado.duracaoMs)}`);
    evento({ tipo: 'caso-fim', estado: resultado.estado, duracaoMs: resultado.duracaoMs, diferencas: resultado.diferencas, erro: resultado.erro });
  }
  return resultado;
}
