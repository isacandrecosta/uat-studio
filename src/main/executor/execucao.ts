// Gere uma execução (run): decide que casos correm, lança o browser, distribui os casos
// por "workers" em paralelo e escreve a pasta da execução (logs, evidências, relatórios).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Browser, chromium } from 'playwright-core';
import {
  AmbitoRun,
  Bloco,
  Caso,
  EstadoRun,
  Jornada,
  OpcoesRun,
  ResultadoCaso,
} from '../../shared/modelo';
import { criarAmbienteApi } from '../api/ambiente';
import * as repo from '../projeto/repositorio';
import { correrCaso } from './correrCaso';
import { escreverRelatorios } from './relatorios';

const PASTA_EXECUCOES = 'execucoes';

interface ItemPlano {
  jornada: Jornada;
  caso: Caso;
}

let runAtual: EstadoRun | null = null;
let pararPedido = false;
/** Em pausa: os casos esperam entre passos até alguém carregar em "Continuar". */
let pausado = false;
/** Casos (idDaJornada/idDoCaso) que o utilizador mandou saltar. */
const saltar = new Set<string>();
let notificar: (estado: EstadoRun) => void = () => undefined;
let ultimaNotificacao = 0;

export function aoMudarRun(callback: (estado: EstadoRun) => void): void {
  notificar = callback;
}

export function estadoRun(): EstadoRun | null {
  return runAtual;
}

function avisar(forcar = false): void {
  if (!runAtual) return;
  // No máximo ~10 atualizações por segundo, para não inundar a interface.
  const agora = Date.now();
  if (!forcar && agora - ultimaNotificacao < 100) return;
  ultimaNotificacao = agora;
  notificar(runAtual);
}

/** Lista de casos a correr, pela ordem das jornadas e dos casos. */
export function planear(pasta: string, ambito: AmbitoRun): { itens: ItemPlano[]; nome: string } {
  const jornadas = repo.listar(pasta, 'jornadas');
  const conjuntos = new Map(repo.listar(pasta, 'casos').map((c) => [c.id, c]));
  const etiquetas = (ambito.etiquetas ?? []).map((e) => e.toLowerCase());
  const temEtiqueta = (lista: string[]): boolean => lista.some((e) => etiquetas.includes(e.toLowerCase()));
  const chaves = ambito.chavesCasos ? new Set(ambito.chavesCasos) : null;

  const itens: ItemPlano[] = [];
  const nomesJornadas = new Set<string>();
  for (const jornada of jornadas) {
    if (ambito.epicoIds && !ambito.epicoIds.includes(jornada.epicoId)) continue;
    if (ambito.jornadaIds && !ambito.jornadaIds.includes(jornada.id)) continue;
    for (const caso of conjuntos.get(jornada.id)?.casos ?? []) {
      if (chaves && !chaves.has(`${jornada.id}/${caso.id}`)) continue;
      if (etiquetas.length > 0 && !temEtiqueta(jornada.etiquetas) && !temEtiqueta(caso.etiquetas)) continue;
      itens.push({ jornada, caso });
      nomesJornadas.add(jornada.nome);
    }
  }
  let nome = 'Seleção';
  if (nomesJornadas.size === 1) nome = [...nomesJornadas][0];
  else if (ambito.epicoIds?.length === 1) {
    nome = repo.existe(pasta, 'epicos', ambito.epicoIds[0]) ? repo.ler(pasta, 'epicos', ambito.epicoIds[0]).nome : nome;
  } else if (!ambito.epicoIds && !ambito.jornadaIds && !chaves) nome = 'Tudo';
  return { itens, nome };
}

function proximoNumero(pastaExecucoes: string): number {
  if (!fs.existsSync(pastaExecucoes)) return 1;
  const numeros = fs.readdirSync(pastaExecucoes).map((n) => Number(/_run(\d+)/.exec(n)?.[1] ?? 0));
  return Math.max(0, ...numeros) + 1;
}

/** Nome de pasta seguro para o Windows: sem acentos nem símbolos. */
function nomeDePasta(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('')
      .slice(0, 40) || 'Run'
  );
}

function carimbo(data: Date): string {
  const d2 = (n: number): string => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${d2(data.getMonth() + 1)}-${d2(data.getDate())}_${d2(data.getHours())}${d2(data.getMinutes())}`;
}

function gravarRunJson(pastaRun: string, run: EstadoRun): void {
  fs.writeFileSync(path.join(pastaRun, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
}

/** Começa uma execução e devolve logo o estado inicial (os casos correm em segundo plano). */
export async function iniciarRun(pasta: string, ambito: AmbitoRun, opcoes: OpcoesRun): Promise<EstadoRun> {
  if (runAtual?.ativo) throw new repo.ErroProjeto('Já há uma execução a correr.');

  const projeto = repo.lerProjeto(pasta);
  const ambiente = projeto.ambientes.find((a) => a.id === projeto.ambienteAtivo);
  if (!ambiente) throw new repo.ErroProjeto('O projeto não tem um ambiente ativo.');
  if (ambiente.tipo === 'PRD' && !opcoes.confirmouProducao) {
    throw new repo.ErroProjeto('O ambiente ativo é de PRODUÇÃO. É preciso confirmar antes de correr.');
  }
  const { itens, nome } = planear(pasta, ambito);
  if (itens.length === 0) throw new repo.ErroProjeto('Não há casos para correr com essa escolha.');

  const paralelo = [1, 2, 4, 8].includes(opcoes.paralelo) ? opcoes.paralelo : 1;
  const inicio = new Date();
  const pastaExecucoes = path.join(pasta, PASTA_EXECUCOES);
  const numero = proximoNumero(pastaExecucoes);
  const nomePasta = `${carimbo(inicio)}_run${numero}_${nomeDePasta(nome)}`;
  const pastaRun = path.join(pastaExecucoes, nomePasta);
  fs.mkdirSync(path.join(pastaRun, 'casos'), { recursive: true });

  const pastaDoCaso = (item: ItemPlano): string => path.join('casos', item.jornada.id, item.caso.id.replace(/[^A-Za-z0-9_-]/g, '_'));
  const run: EstadoRun = {
    id: `run${numero}`,
    nome,
    ativo: true,
    aParar: false,
    emPausa: false,
    inicio: inicio.toISOString(),
    ambiente: ambiente.nome,
    tipoAmbiente: ambiente.tipo,
    opcoes: { canal: opcoes.canal, visivel: opcoes.visivel, paralelo, velocidade: opcoes.velocidade ?? 'normal', pausarNoErro: Boolean(opcoes.pausarNoErro) },
    casos: itens.map((item) => ({
      chave: `${item.jornada.id}/${item.caso.id}`,
      jornadaId: item.jornada.id,
      jornadaNome: item.jornada.nome,
      casoId: item.caso.id,
      casoNome: item.caso.nome,
      estado: 'por-correr',
      diferencas: [],
      passos: [],
      variaveis: {},
      duracaoMs: 0,
      pasta: pastaDoCaso(item).replace(/\\/g, '/'),
    })),
    pasta: nomePasta,
  };
  runAtual = run;
  pararPedido = false;
  pausado = false;
  saltar.clear();
  const definirPausa = (valor: boolean): void => {
    pausado = valor;
    run.emPausa = valor;
    avisar(true);
  };

  const ficheiroLog = path.join(pastaRun, 'run.log');
  const log = (linha: string): void =>
    fs.appendFileSync(ficheiroLog, `[${new Date().toLocaleTimeString('pt-PT', { hour12: false })}] ${linha}\n`, 'utf8');
  log(`Execução ${run.id}: ${nome} | ${itens.length} caso(s) | Ambiente: ${ambiente.nome} (${ambiente.tipo})`);
  log(`Browser: ${opcoes.canal === 'msedge' ? 'Edge' : 'Chrome'} | ${opcoes.visivel ? 'visível' : 'em background'} | ${paralelo} em paralelo`);
  gravarRunJson(pastaRun, run);

  const aplicacoes = new Map(repo.listar(pasta, 'aplicacoes').map((a) => [a.id, a]));
  const blocos = new Map<string, Bloco>(repo.listar(pasta, 'blocos').map((b) => [b.id, b]));
  const calculadas = repo.lerVariaveis(pasta);
  const perfis = new Map(repo.listar(pasta, 'perfis').map((p) => [p.id, p]));
  // Um só ambiente de API por execução: os tokens OAuth são pedidos uma vez e reutilizados por todos os casos.
  const api = criarAmbienteApi(pasta);

  void (async () => {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ channel: opcoes.canal, headless: !opcoes.visivel });
      const lancado = browser;
      let proximo = 0;
      const worker = async (): Promise<void> => {
        for (;;) {
          const indice = proximo++;
          if (indice >= itens.length) return;
          if (pararPedido) {
            run.casos[indice].estado = 'PARADO';
            continue;
          }
          const item = itens[indice];
          const chave = run.casos[indice].chave;
          if (saltar.has(chave)) {
            run.casos[indice].estado = 'SALTADO';
            log(`${item.jornada.nome} / ${item.caso.id}: saltado`);
            avisar(true);
            continue;
          }
          const relativa = run.casos[indice].pasta ?? pastaDoCaso(item);
          log(`A correr ${item.jornada.nome} / ${item.caso.id}`);
          run.casos[indice].estado = 'a-correr';
          avisar(true);
          const resultado = await correrCaso({
            browser: lancado,
            ambiente,
            aplicacoes,
            blocos,
            jornada: item.jornada,
            caso: item.caso,
            runId: run.id,
            pasta: path.join(pastaRun, relativa),
            limiteMs: 15_000,
            trace: true,
            calculadas,
            perfis,
            api,
            proximoContador: (nomeContador) => repo.proximoContador(pasta, nomeContador),
            aoProgredir: (parcial) => {
              run.casos[indice] = { ...parcial, pasta: relativa };
              avisar();
            },
            devePararAgora: () => pararPedido,
            deveSaltar: () => saltar.has(chave),
            entrePassos: async () => {
              // Passo a passo: pára antes de cada passo, à espera de "Continuar".
              if (opcoes.velocidade === 'passo' && !pararPedido) definirPausa(true);
              else if (opcoes.velocidade === 'lenta') await new Promise((r) => setTimeout(r, 1000));
              while (pausado && !pararPedido && !saltar.has(chave)) await new Promise((r) => setTimeout(r, 150));
            },
          });
          run.casos[indice] = { ...resultado, pasta: relativa };
          const resumo = resultado.estado === 'ERRO' ? `ERRO: ${resultado.erro?.mensagem ?? ''}` : resultado.estado;
          log(`${item.jornada.nome} / ${item.caso.id}: ${resumo} (${(resultado.duracaoMs / 1000).toFixed(1)} s)`);
          // "Pausar no 1.º ERRO": fica em pausa para se poder ver o que se passou antes de continuar.
          if (resultado.estado === 'ERRO' && opcoes.pausarNoErro && proximo < itens.length && !pararPedido) {
            log('Em pausa por causa de um ERRO (opção "pausar no erro").');
            definirPausa(true);
            while (pausado && !pararPedido) await new Promise((r) => setTimeout(r, 150));
          }
          avisar(true);
        }
      };
      await Promise.all(Array.from({ length: Math.min(paralelo, itens.length) }, () => worker()));
    } catch (erro) {
      const texto = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
      log(`A execução falhou: ${texto}`);
      for (const caso of run.casos) {
        if (caso.estado === 'por-correr' || caso.estado === 'a-correr') {
          caso.estado = 'ERRO';
          caso.erro = { mensagem: `Não foi possível abrir o browser: ${texto}`, bloco: '', passo: '', porExecutar: [] };
        }
      }
    } finally {
      await browser?.close().catch(() => undefined);
      run.ativo = false;
      run.aParar = false;
      run.emPausa = false;
      pausado = false;
      run.fim = new Date().toISOString();
      const conta = (estado: ResultadoCaso['estado']): number => run.casos.filter((c) => c.estado === estado).length;
      log(`Fim: ${conta('OK')} OK, ${conta('KO')} KO, ${conta('ERRO')} ERRO${conta('PARADO') ? `, ${conta('PARADO')} parados` : ''}`);
      try {
        gravarRunJson(pastaRun, run);
        await escreverRelatorios(pastaRun, run);
      } catch (erro) {
        log(`Não foi possível escrever os relatórios: ${String(erro)}`);
      }
      avisar(true);
    }
  })();

  return run;
}

/** Põe a execução em pausa (os casos param entre passos, nunca a meio de uma ação). */
export function pausarRun(): EstadoRun | null {
  if (runAtual?.ativo && !pararPedido) {
    pausado = true;
    runAtual.emPausa = true;
    avisar(true);
  }
  return runAtual;
}

export function continuarRun(): EstadoRun | null {
  if (runAtual?.ativo) {
    pausado = false;
    runAtual.emPausa = false;
    avisar(true);
  }
  return runAtual;
}

/** Salta um caso: se ainda não começou, não corre; se está a correr, pára no próximo passo. */
export function saltarCaso(chave: string): EstadoRun | null {
  if (runAtual?.ativo) {
    saltar.add(chave);
    avisar(true);
  }
  return runAtual;
}

export function pararRun(): EstadoRun | null {
  if (runAtual?.ativo) {
    pararPedido = true;
    pausado = false;
    runAtual.emPausa = false;
    runAtual.aParar = true;
    avisar(true);
  }
  return runAtual;
}

/** Espera pelo fim da execução em curso (para os testes automáticos). */
export async function esperarFimDoRun(limiteMs: number): Promise<EstadoRun | null> {
  const fim = Date.now() + limiteMs;
  while (runAtual?.ativo && Date.now() < fim) await new Promise((r) => setTimeout(r, 200));
  return runAtual;
}

/** Execuções anteriores (lidas das pastas), da mais recente para a mais antiga. */
export function listarHistorico(pasta: string): EstadoRun[] {
  const pastaExecucoes = path.join(pasta, PASTA_EXECUCOES);
  if (!fs.existsSync(pastaExecucoes)) return [];
  const runs: EstadoRun[] = [];
  for (const nome of fs.readdirSync(pastaExecucoes).sort().reverse()) {
    try {
      const run = JSON.parse(fs.readFileSync(path.join(pastaExecucoes, nome, 'run.json'), 'utf8')) as EstadoRun;
      // Uma execução interrompida à força (app fechada) fica marcada como terminada.
      const ativo = runAtual?.ativo === true && runAtual.pasta === nome;
      runs.push({ ...run, pasta: nome, ativo, emPausa: ativo && Boolean(runAtual?.emPausa) });
    } catch {
      // Pasta sem run.json válido: ignora.
    }
  }
  return runs;
}

/** Caminho absoluto dentro da pasta de execuções (recusa caminhos que saiam dela). */
export function caminhoNaExecucao(pasta: string, ...partes: string[]): string {
  const raiz = path.resolve(pasta, PASTA_EXECUCOES);
  const destino = path.resolve(raiz, ...partes);
  if (destino !== raiz && !destino.startsWith(raiz + path.sep)) throw new repo.ErroProjeto('Caminho inválido.');
  return destino;
}
