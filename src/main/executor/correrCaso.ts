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
  EstadoBlocoCaso,
  EstadoPasso,
  Jornada,
  Localizador,
  Passo,
  PedidoManual,
  RegistoPasso,
  RespostaManual,
  ResultadoCaso,
  PerfilAutenticacao,
  ResultadoApi,
  Valor,
  VariavelCalculada,
} from '../../shared/modelo';
import { mesmoLocalizador } from '../../shared/blocos';
import { avaliarCondicao, avaliarFormula, ErroFormula, preencherTexto } from '../../shared/formulas';
import { AmbienteApi, ErroApi, escaparJson, executarBlocoApi } from '../api/pedidos';
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
  devePararAgora(): boolean;
  /** O utilizador mandou saltar este caso? */
  deveSaltar(): boolean;
  /** Chamado antes de cada passo: é aqui que a execução espera se estiver em pausa (ou em modo lento). */
  entrePassos(): Promise<void>;
  /** Passo manual: mostra a instrução ao testador e espera pela resposta (OK/KO). */
  passoManual?(pedido: PedidoManual): Promise<RespostaManual>;
  /** A página do browser deste caso (para as miniaturas ao vivo); null quando fecha. */
  aoAbrirPagina?(pagina: Page | null): void;
}

/** Erro nos dados ou na definição do teste (não na aplicação). */
class ErroDados extends Error {}
class Parado extends Error {}
class Saltado extends Error {}

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

  const formulas = new Map(pedido.calculadas.map((v) => [v.nome, v.formula]));
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
        aleatorio: Math.random,
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
    (texto: string, paraJson?: boolean): string => {
      try {
        return preencherTexto(
          texto,
          { variavel: procurarNoBloco(item), teste: caso.id, run: pedido.runId, agora: new Date(), contador: pedido.proximoContador, aleatorio: Math.random },
          paraJson ? escaparJson : undefined,
        );
      } catch (erro) {
        if (erro instanceof ErroFormula) throw new ErroDados(erro.message);
        throw erro;
      }
    };

  /** Avalia uma condição ("só se...") com os dados do caso. */
  const cumpre = (condicao: string, variavel: (nome: string) => string | undefined, onde: string): boolean => {
    try {
      return avaliarCondicao(condicao, { variavel, teste: caso.id, run: pedido.runId, agora: new Date(), contador: pedido.proximoContador, aleatorio: Math.random });
    } catch (erro) {
      if (erro instanceof ErroFormula) throw new ErroDados(`Erro na ${onde}: ${erro.message}`);
      throw erro;
    }
  };

  /** Resolve o valor de um passo, tendo em conta os parâmetros do bloco nesta jornada. */
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
    resultado.erro = { mensagem, bloco: blocoAtual, passo: passoAtual, porExecutar };
    registar(blocoAtual, passoAtual || 'Preparar o caso', 'erro', 0, mensagem);
    if (porExecutar.length > 0) escrever(`Blocos por executar: ${porExecutar.join(', ')}`);
    if (!(erro instanceof ErroElemento || erro instanceof ErroAcao || erro instanceof ErroDados || erro instanceof ErroApi)) {
      const tecnico = erro instanceof Error ? erro.message : String(erro);
      fs.appendFileSync(ficheiroLog, `  Detalhe técnico: ${tecnico.replace(/\n/g, '\n    ')}\n`, 'utf8');
    }
    await tirarPrint('erro.png');
  };

  try {
    contexto = await pedido.browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-PT' });
    if (pedido.trace) await contexto.tracing.start({ screenshots: true, snapshots: true });
    pagina = await contexto.newPage();
    pedido.aoAbrirPagina?.(pagina);
    const monitor = new MonitorDePedidos(pagina);
    // Depois de uma verificação, o ecrã já assentou: as seguintes não precisam de esperar tanto.
    let ecraAssente = false;

    const correrBloco = async (indice: number, item: BlocoDaJornada): Promise<void> => {
      const pag = pagina as Page;
      const ctx = contexto as BrowserContext;
      indiceBloco = indice;
      const bloco = pedido.blocos.get(item.blocoId);
      if (!bloco) throw new ErroDados(`O bloco "${item.blocoId}" já não existe.`);
      blocoAtual = bloco.nome;
      passoAtual = '';
      if (bloco.tipo !== 'UI' && bloco.tipo !== 'API' && bloco.tipo !== 'MANUAL') throw new ErroDados(`Os blocos de ${bloco.tipo} ainda não são suportados.`);
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

      // Blocos com segredos (por exemplo, login) correm sem trace, para a password não ficar gravada.
      const temSegredos = bloco.passos.some((p) => p.secreto);
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
        resultado.passoAtual = `${bloco.nome}: ${passo.descricao}`;
        pedido.aoProgredir(resultado);
        // Passo condicional: só corre se a condição se cumprir para este caso.
        if (passo.condicao?.trim() && !cumpre(passo.condicao, procurarNoBloco(item), `condição do passo "${passo.descricao}"`)) {
          registar(bloco.nome, passo.descricao, 'ignorado', 0, `a condição não se cumpre: ${passo.condicao.trim()}`);
          continue;
        }
        const t0 = Date.now();
        await monitor.esperarCalma(pag, 10_000);
        const nota = await executarPasso(passo, item, aplicacao, bloco.nome);
        if (nota.estado === 'ko' && nota.diferenca) resultado.diferencas.push(nota.diferenca);
        registar(bloco.nome, passo.descricao, nota.estado, Date.now() - t0, nota.detalhe);
      }

      await monitor.esperarCalma(pag, 5_000);
      await tirarPrint(`${String(indice + 1).padStart(2, '0')}_${criarSlug(bloco.nome)}.png`);
    };

    // Corre os blocos por ordem. Depois de um erro, só correm os blocos de limpeza ("corre sempre").
    let houveErro = false;
    for (const [indice, item] of jornada.blocos.entries()) {
      if (houveErro && !item.sempre) continue;
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
          const mostrado = passo.acao === 'clicar' ? undefined : passo.secreto ? 'valor: ***' : feito.detalhe ?? `valor: "${valor}"`;
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
              return { estado: 'ok', detalhe: juntar(tipo === 'visivel' ? undefined : `"${obtido}"`, notaLinha, nota) };
            }
            if (Date.now() >= fim) break;
            await p.waitForTimeout(200);
          }
          ecraAssente = true;
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
