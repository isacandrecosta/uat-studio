// Gravador: abre o browser na aplicação, recebe os passos escolhidos no popup da página,
// executa-os a sério (para a página avançar) e junta-os num bloco.
import { Browser, BrowserContext, chromium, Page } from 'playwright-core';
import {
  Alvo,
  Bloco,
  ElementoDoPrint,
  EstadoGravador,
  PassoSobrePrint,
  PrintDoEcra,
  Localizador,
  Passo,
  PedidoGravacao,
  Valor,
} from '../../shared/modelo';
import { avaliarCondicao, avaliarFormula, validarFormula } from '../../shared/formulas';
import { resolverSegredosDeTeste } from '../cofre';
import { construirUrl, executarAcao, lerElemento } from '../motor/acoes';
import { descreverLocalizador, linhasCom, paraLocator } from '../motor/localizar';
import * as repo from '../projeto/repositorio';
import { scriptGravador } from './injetado';
import { contextoDosValores, definirCaixaDoProjeto, repetirPassosAte, resolverValor } from './regravar';

interface Sessao {
  pasta: string;
  browser: Browser;
  contexto: BrowserContext;
  pagina: Page;
  bloco: Bloco;
  /** O bloco já existia? (ao guardar, mantém o id) */
  existente: boolean;
  aplicacaoNome: string;
  urlBase: string;
  modo: 'gravar' | 'livre';
  colunas: string[];
  mensagem?: string;
  /** "Regravar este elemento": o passo a corrigir e os valores do caso. */
  regravar?: { passoId: string; valores: Record<string, string>; feito: boolean };
  /** Modo print: os elementos da última captura (com os localizadores, que não vão para a interface). */
  print?: Array<ElementoDoPrint & { localizadores: Localizador[]; widget?: string }>;
  /** Valores de exemplo já usados nesta gravação (colunas e variáveis guardadas), para calcular fórmulas ao vivo. */
  exemplos: Record<string, string>;
  /** "Gravar aqui": os passos novos entram nesta posição do bloco (sem valor: no fim). */
  posicao?: number;
  /** "Gravar aqui": os dados do caso usado na repetição (e as variáveis guardadas pelo caminho). */
  valoresCaso?: Record<string, string>;
  /** "Gravar aqui" de um bloco novo: o cenário onde entra ao guardar. */
  cenario?: { id: string; nome: string; posicao: number; sessao?: string };
}

/** Os valores do caso com os parâmetros do bloco neste cenário (fixo, coluna ou fórmula). */
function comParametros(valores: Record<string, string>, parametros: Record<string, Valor> | undefined): Record<string, string> {
  const resultado = { ...valores };
  for (const [nome, valor] of Object.entries(parametros ?? {})) {
    try {
      resultado[nome] = resolverValor(valor, valores);
    } catch {
      // Sem o valor (por exemplo uma variável de um bloco de API que não é repetido): fica o que houver.
    }
  }
  return resultado;
}

/** Junta ao caso as variáveis guardadas na repetição de um bloco (sem os parâmetros, que são do bloco). */
function juntarGuardadas(valores: Record<string, string>, doBloco: Record<string, string>, parametros: Record<string, Valor> | undefined): void {
  for (const [nome, valor] of Object.entries(doBloco)) if (!(nome in (parametros ?? {}))) valores[nome] = valor;
}

/** Acrescenta um passo gravado: no fim do bloco ou, com "Gravar aqui", na posição escolhida. */
function inserirPasso(s: Sessao, passo: Passo): void {
  if (s.posicao === undefined || s.posicao >= s.bloco.passos.length) {
    s.bloco.passos.push(passo);
    if (s.posicao !== undefined) s.posicao = s.bloco.passos.length;
  } else {
    s.bloco.passos.splice(s.posicao, 0, passo);
    s.posicao += 1;
  }
}

/** Texto para a interface: onde entram os passos novos. */
function ondeEntram(s: Sessao): string {
  if (s.posicao === undefined || s.posicao >= s.bloco.passos.length) return 'no fim do bloco';
  if (s.posicao === 0) return 'no início do bloco';
  return `a seguir ao passo ${s.posicao} ("${s.bloco.passos[s.posicao - 1].descricao}")`;
}

/** Calcula uma fórmula com os valores de exemplo da gravação (para o "valor de exemplo" do popup). */
function calcularNaGravacao(s: Sessao, expressao: string): { ok: boolean; texto: string } {
  if (!expressao.trim()) return { ok: false, texto: '' };
  const problema = validarFormula(expressao);
  if (problema) return { ok: false, texto: problema };
  try {
    const valores = { ...(s.regravar?.valores ?? s.valoresCaso ?? {}), ...s.exemplos, TESTE: 'GRAVACAO', RUN: 'gravacao' };
    return { ok: true, texto: avaliarFormula(expressao, contextoDosValores(valores)) };
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, texto: /\{[^}]+\}/.test(texto) ? `${texto} Esta coluna ainda não teve um valor de exemplo nesta gravação: escreva o valor de exemplo à mão.` : texto };
  }
}

/** O que a página envia quando o utilizador confirma o popup. */
interface MensagemPasso {
  tipo: 'passo';
  marcador: number;
  acao: Passo['acao'];
  alvo: Alvo;
  valor?: Valor;
  exemplo?: string;
  /** Para alvos "na linha da tabela que contém...": o texto que a linha tem agora. */
  linhaExemplo?: string;
  verificacao?: Passo['verificacao'];
  variavel?: string;
  secreto?: boolean;
}

let sessao: Sessao | null = null;
let notificar: (estado: EstadoGravador) => void = () => undefined;

export function aoMudarGravador(callback: (estado: EstadoGravador) => void): void {
  notificar = callback;
}

export function estadoGravador(): EstadoGravador {
  if (!sessao) return { ativo: false, browserAberto: false, aplicacaoNome: '', bloco: null };
  return {
    ativo: true,
    browserAberto: sessao.browser.isConnected(),
    aplicacaoNome: sessao.aplicacaoNome,
    bloco: sessao.bloco,
    mensagem: sessao.mensagem,
    ...(sessao.regravar ? { regravar: sessao.bloco.passos.find((p) => p.id === sessao?.regravar?.passoId)?.alvo?.descricao ?? '', regravado: sessao.regravar.feito } : {}),
    ...(sessao.posicao !== undefined || sessao.cenario
      ? { inserir: { onde: ondeEntram(sessao), posicao: sessao.posicao ?? null, ...(sessao.cenario ? { cenario: sessao.cenario.nome } : {}) } }
      : {}),
  };
}

/** Só para os testes automáticos. */
export function paginaDoGravador(): Page | null {
  return sessao?.pagina ?? null;
}

function avisar(mensagem?: string): void {
  if (sessao) sessao.mensagem = mensagem;
  notificar(estadoGravador());
}

function proximoId(bloco: Bloco): string {
  const numeros = bloco.passos.map((p) => Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0));
  return `p${Math.max(0, ...numeros) + 1}`;
}

function descreverValor(valor: Valor | undefined): string {
  if (!valor) return '';
  if (valor.tipo === 'fixo') return `"${valor.valor}"`;
  if (valor.tipo === 'variavel') return `{${valor.nome}}`;
  return valor.tipo === 'formula' ? valor.expressao : valor.gerador;
}

function descreverPasso(m: MensagemPasso): string {
  const nome = m.alvo.linha ? `${m.alvo.descricao} da linha ${descreverValor(m.alvo.linha.valor)}` : m.alvo.descricao;
  switch (m.acao) {
    case 'escrever':
      return `Escrever ${m.secreto ? '(segredo)' : descreverValor(m.valor)} em ${nome}${m.variavel ? ` e guardar em {${m.variavel}}` : ''}`;
    case 'escolher':
      return `Escolher ${descreverValor(m.valor)} em ${nome}${m.variavel ? ` e guardar em {${m.variavel}}` : ''}`;
    case 'marcar':
      return m.valor?.tipo === 'fixo'
        ? `${m.valor.valor === 'S' ? 'Marcar' : 'Desmarcar'} ${nome}`
        : `Marcar ou desmarcar ${nome} conforme ${descreverValor(m.valor)}`;
    case 'clicar':
      return `Clicar em ${nome}`;
    case 'verificar':
      if (m.verificacao?.tipo === 'visivel') return `Verificar que ${nome} está visível`;
      return `Verificar que ${nome} ${m.verificacao?.tipo === 'numero' ? 'tem o número' : 'tem o texto'} ${descreverValor(m.valor)}`;
    case 'guardar':
      return `Guardar ${nome} como {${m.variavel}}`;
    default:
      return nome;
  }
}

/** Fica só com os localizadores que encontram exatamente o elemento clicado. */
async function filtrarLocalizadores(pagina: Page, m: MensagemPasso): Promise<Localizador[]> {
  const marca = String(m.marcador);
  const bons: Localizador[] = [];
  // Com "linha da tabela", os localizadores são relativos à linha que tem o texto de exemplo.
  const raiz = m.alvo.linha ? linhasCom(pagina, m.linhaExemplo ?? '') : pagina;
  const linhaUnica = !m.alvo.linha || (await linhasCom(pagina, m.linhaExemplo ?? '').count().catch(() => 0)) === 1;
  for (const loc of linhaUnica ? m.alvo.localizadores : []) {
    try {
      const locator = paraLocator(raiz, loc);
      if ((await locator.count()) !== 1) continue;
      const serve = await locator.evaluate(
        (el, [marcaEl, aceitaDentro]) =>
          el.getAttribute('data-uat-alvo') === marcaEl ||
          (aceitaDentro === 's' && el.querySelector(`[data-uat-alvo="${marcaEl}"]`) !== null),
        [marca, loc.tipo === 'testid' ? 's' : 'n'],
      );
      if (serve) bons.push(loc);
    } catch {
      // Localizador inválido nesta página: fica de fora.
    }
  }
  await pagina
    .locator(`[data-uat-alvo="${marca}"]`)
    .evaluateAll((els) => els.forEach((el) => el.removeAttribute('data-uat-alvo')))
    .catch(() => undefined);
  return bons;
}

/**
 * "Regravar este elemento": só o elemento do passo muda (a ação, o valor e o resto ficam).
 * O passo é executado com o elemento novo antes de ser aceite, e o bloco fica logo guardado.
 */
async function regravarElemento(s: Sessao, m: MensagemPasso): Promise<{ ok: boolean; mensagem: string }> {
  const r = s.regravar;
  const passo = s.bloco.passos.find((p) => p.id === r?.passoId);
  if (!r || !passo) return { ok: false, mensagem: 'O passo a regravar já não existe.' };
  if (r.feito) return { ok: false, mensagem: 'O elemento já foi regravado. Fecha o browser ou termina a gravação.' };
  const localizadores = await filtrarLocalizadores(s.pagina, m);
  if (localizadores.length === 0) return { ok: false, mensagem: 'Não encontrei uma forma fiável de localizar este elemento.' };
  const alvo = {
    descricao: passo.alvo?.descricao ?? m.alvo.descricao,
    localizadores,
    ...(m.alvo.widget ? { widget: m.alvo.widget } : {}),
    ...(m.alvo.linha ? { linha: m.alvo.linha } : passo.alvo?.linha ? { linha: passo.alvo.linha } : {}),
  };
  const experimentado = { ...passo, alvo };
  try {
    const linha = alvo.linha ? (m.linhaExemplo ?? resolverValor(alvo.linha.valor, r.valores)) : undefined;
    if (['escrever', 'escolher', 'marcar', 'clicar'].includes(passo.acao)) {
      await executarAcao(s.pagina, experimentado, resolverValor(passo.valor, r.valores), { limiteMs: 10_000, linha });
    } else {
      await lerElemento(s.pagina, experimentado, { limiteMs: 5_000, linha });
    }
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message.split(/\r?\n/)[0] : String(erro);
    return { ok: false, mensagem: `Não consegui executar o passo com este elemento, por isso não foi trocado: ${texto}` };
  }
  passo.alvo = alvo;
  repo.guardar(s.pasta, 'blocos', s.bloco);
  r.feito = true;
  s.modo = 'livre';
  await s.pagina.evaluate(() => (window as unknown as { __uatPagina?: { definirModo(m: string): void } }).__uatPagina?.definirModo('livre')).catch(() => undefined);
  avisar(`Elemento de "${passo.descricao}" regravado e bloco guardado.`);
  return { ok: true, mensagem: `Elemento regravado (${descreverLocalizador(localizadores[0])}). O bloco já foi guardado: podes fechar o browser.` };
}

async function tratarPasso(s: Sessao, m: MensagemPasso): Promise<{ ok: boolean; mensagem: string }> {
  if (s.regravar) return regravarElemento(s, m);
  const localizadores = await filtrarLocalizadores(s.pagina, m);
  if (localizadores.length === 0) {
    return {
      ok: false,
      mensagem: m.alvo.linha
        ? `Não consegui identificar a linha pelo texto "${m.linhaExemplo ?? ''}": tem de existir exatamente uma linha com esse texto numa célula.`
        : 'Não encontrei uma forma fiável de localizar este elemento.',
    };
  }
  const passo: Passo = {
    id: proximoId(s.bloco),
    acao: m.acao,
    descricao: descreverPasso(m),
    alvo: {
      descricao: m.alvo.descricao,
      localizadores,
      ...(m.alvo.widget ? { widget: m.alvo.widget } : {}),
      ...(m.alvo.linha ? { linha: m.alvo.linha } : {}),
    },
    ...(m.valor ? { valor: m.valor } : {}),
    ...(m.verificacao ? { verificacao: m.verificacao } : {}),
    ...(m.variavel ? { variavel: m.variavel } : {}),
    ...(m.secreto ? { secreto: true } : {}),
  };
  if (passo.valor?.tipo === 'formula') {
    const erroFormula = validarFormula(passo.valor.expressao);
    if (erroFormula) return { ok: false, mensagem: `A fórmula tem um erro: ${erroFormula}` };
  }
  // Um segredo nunca pode ficar escrito no bloco.
  if (passo.secreto && passo.valor?.tipo !== 'variavel') {
    return { ok: false, mensagem: 'Uma password tem de vir de uma coluna dos dados.' };
  }

  let resumo = 'Passo gravado.';
  try {
    if (m.acao === 'escrever' || m.acao === 'escolher' || m.acao === 'marcar' || m.acao === 'clicar') {
      await executarAcao(s.pagina, passo, m.exemplo ?? '', { limiteMs: 10_000, linha: m.linhaExemplo });
      // "Guardar o valor em": o valor de exemplo escrito fica como exemplo dessa variável nas fórmulas seguintes.
      if (m.variavel && !passo.secreto && (m.acao === 'escrever' || m.acao === 'escolher')) s.exemplos[m.variavel] = m.exemplo ?? '';
    } else {
      const leitura = await lerElemento(s.pagina, passo, { limiteMs: 5_000, linha: m.linhaExemplo });
      resumo = `Passo gravado (agora o ecrã mostra "${leitura.texto.slice(0, 60)}").`;
      // "Guardar variável": o que o ecrã mostra agora fica como exemplo dessa variável nas fórmulas seguintes.
      if (m.variavel) s.exemplos[m.variavel] = leitura.texto;
    }
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
    return { ok: false, mensagem: `Não consegui executar o passo, por isso não foi gravado: ${texto}` };
  }

  inserirPasso(s, passo);
  // O valor de exemplo de uma coluna serve às fórmulas seguintes (nunca o de uma password).
  if (m.valor?.tipo === 'variavel' && !passo.secreto && m.exemplo !== undefined) s.exemplos[m.valor.nome] = m.exemplo;
  if (m.valor?.tipo === 'variavel' && !s.colunas.includes(m.valor.nome)) s.colunas.push(m.valor.nome);
  if (m.variavel && !s.colunas.includes(m.variavel)) s.colunas.push(m.variavel);
  const daLinha = m.alvo.linha?.valor;
  if (daLinha?.tipo === 'variavel' && !s.colunas.includes(daLinha.nome)) s.colunas.push(daLinha.nome);
  avisar(undefined);
  return { ok: true, mensagem: `${resumo} Encontrado por ${descreverLocalizador(localizadores[0])}.` };
}

export async function iniciarGravacao(pasta: string, pedido: PedidoGravacao): Promise<EstadoGravador> {
  if (sessao) throw new repo.ErroProjeto('Já há uma gravação em curso. Termina-a primeiro.');

  const projeto = repo.lerProjeto(pasta);
  definirCaixaDoProjeto(projeto.caixaTestes);
  const ambiente = projeto.ambientes.find((a) => a.id === projeto.ambienteAtivo);
  if (!ambiente) throw new repo.ErroProjeto('O projeto não tem um ambiente ativo.');
  if (ambiente.tipo === 'PRD' && !pedido.confirmouProducao) {
    throw new repo.ErroProjeto('O ambiente ativo é de PRODUÇÃO. É preciso confirmar antes de gravar.');
  }
  const aplicacao = repo.ler(pasta, 'aplicacoes', pedido.aplicacaoId);
  const urlBase = aplicacao.urls[ambiente.id];
  if (!urlBase) {
    throw new repo.ErroProjeto(`A aplicação "${aplicacao.nome}" não tem endereço no ambiente ${ambiente.nome}.`);
  }

  let bloco: Bloco;
  let existente = false;
  if (pedido.blocoId) {
    bloco = repo.ler(pasta, 'blocos', pedido.blocoId);
    if (bloco.tipo !== 'UI') throw new repo.ErroProjeto('Só é possível gravar em blocos de UI.');
    existente = true;
  } else {
    const nome = (pedido.nomeNovo ?? '').trim();
    if (!nome) throw new repo.ErroProjeto('Dá um nome ao bloco.');
    bloco = { id: '', nome, tipo: 'UI', aplicacaoId: aplicacao.id, passos: [] };
  }
  const indiceRegravar = pedido.regravar ? bloco.passos.findIndex((p) => p.id === pedido.regravar?.passoId) : -1;
  if (pedido.regravar && (indiceRegravar < 0 || !bloco.passos[indiceRegravar].alvo)) {
    throw new repo.ErroProjeto('Esse passo já não existe no bloco (ou não tem elemento).');
  }
  const inserir = pedido.inserir;
  if (inserir && (inserir.posicao < 0 || inserir.posicao > bloco.passos.length)) throw new repo.ErroProjeto('Essa posição já não existe no bloco.');
  let cenario: Sessao['cenario'];
  if (inserir?.cenario) {
    const jornada = repo.ler(pasta, 'jornadas', inserir.cenario.id);
    cenario = { id: jornada.id, nome: jornada.nome, posicao: inserir.cenario.posicao, ...(inserir.cenario.sessao ? { sessao: inserir.cenario.sessao } : {}) };
  }
  if (pedido.abrirAplicacao && bloco.passos.length === 0) {
    bloco.passos.push({
      id: 'p1',
      acao: 'navegar',
      descricao: `Abrir ${aplicacao.nome}`,
      valor: { tipo: 'fixo', valor: '' },
    });
  }

  // Nomes de colunas já usados no projeto, para sugerir no popup.
  const colunas = new Set<string>();
  for (const conjunto of repo.listar(pasta, 'casos')) conjunto.colunas.forEach((c) => colunas.add(c));

  const browser = await chromium.launch({ channel: pedido.canal, headless: false });
  try {
    const contexto = await browser.newContext({ viewport: null });
    const nova: Sessao = {
      pasta,
      browser,
      contexto,
      pagina: await contexto.newPage(),
      bloco,
      existente,
      aplicacaoNome: aplicacao.nome,
      urlBase,
      modo: 'gravar',
      colunas: [...colunas],
      exemplos: {},
      // Num bloco que já existe, os passos novos entram na posição escolhida (num bloco novo, no fim).
      ...(inserir && existente ? { posicao: inserir.posicao } : {}),
      ...(cenario ? { cenario } : {}),
      ...(pedido.regravar ? { regravar: { passoId: pedido.regravar.passoId, valores: resolverSegredosDeTeste(pasta, { ...pedido.regravar.valores }), feito: false } } : {}),
    };
    await contexto.exposeBinding('__uatGravador', async (_origem, mensagem: { tipo: string; modo?: 'gravar' | 'livre' }) => {
      if (sessao !== nova) return null;
      if (mensagem.tipo === 'estado') {
        const regravar = nova.regravar && !nova.regravar.feito ? nova.bloco.passos.find((p) => p.id === nova.regravar?.passoId)?.alvo?.descricao : undefined;
        return { modo: nova.modo, colunas: nova.colunas, ...(regravar ? { regravar } : {}) };
      }
      if (mensagem.tipo === 'modo' && mensagem.modo) {
        nova.modo = mensagem.modo;
        return null;
      }
      if (mensagem.tipo === 'passo') return tratarPasso(nova, mensagem as unknown as MensagemPasso);
      if (mensagem.tipo === 'formula') return calcularNaGravacao(nova, String((mensagem as { expressao?: unknown }).expressao ?? ''));
      return null;
    });
    await contexto.addInitScript(scriptGravador);
    browser.on('disconnected', () => {
      if (sessao === nova) avisar('O browser foi fechado. Podes guardar o bloco ou cancelar.');
    });
    sessao = nova;
    await nova.pagina.goto(construirUrl(urlBase, ''), { waitUntil: 'domcontentloaded', timeout: 90_000 });
    if (nova.regravar) {
      // Pausa a gravação enquanto repete os passos anteriores (os cliques não abrem o popup).
      await nova.pagina.evaluate(() => (window as unknown as { __uatPagina?: { definirModo(m: string): void } }).__uatPagina?.definirModo('livre')).catch(() => undefined);
      nova.modo = 'livre';
      avisar('A repetir os passos anteriores...');
      const parou = await repetirPassosAte(nova.pagina, bloco, indiceRegravar, nova.regravar.valores, urlBase);
      nova.modo = 'gravar';
      await nova.pagina.evaluate(() => (window as unknown as { __uatPagina?: { definirModo(m: string): void } }).__uatPagina?.definirModo('gravar')).catch(() => undefined);
      const alvo = bloco.passos[indiceRegravar].alvo?.descricao ?? '';
      nova.mensagem = parou ?? `Pronto: aponta para "${alvo}" no browser e confirma o popup (a ação e o valor do passo ficam como estavam).`;
    } else if (inserir) {
      // "Gravar aqui": repete o que vem antes (blocos de UI anteriores do cenário e os passos do bloco até à
      // posição), com os dados do caso, para o testador começar a gravar no ecrã certo.
      const definirModo = (m: 'gravar' | 'livre'): Promise<unknown> =>
        nova.pagina.evaluate((x) => (window as unknown as { __uatPagina?: { definirModo(m: string): void } }).__uatPagina?.definirModo(x), m).catch(() => undefined);
      await definirModo('livre');
      nova.modo = 'livre';
      avisar('A repetir o que vem antes...');
      const valores = resolverSegredosDeTeste(pasta, { ...inserir.valores });
      const naoRepetidos: string[] = [];
      let parou: string | null = null;
      for (const item of inserir.antes ?? []) {
        if (item.condicao?.trim()) {
          let corre = true;
          try {
            corre = avaliarCondicao(item.condicao, contextoDosValores(valores));
          } catch {
            // Condição que não se consegue avaliar com estes dados: o bloco é repetido.
          }
          if (!corre) continue;
        }
        let anterior: Bloco;
        try {
          anterior = repo.ler(pasta, 'blocos', item.blocoId);
        } catch {
          continue;
        }
        if (anterior.tipo !== 'UI') {
          naoRepetidos.push(anterior.nome);
          continue;
        }
        let url = urlBase;
        if (anterior.aplicacaoId && anterior.aplicacaoId !== aplicacao.id) {
          try {
            url = repo.ler(pasta, 'aplicacoes', anterior.aplicacaoId).urls[ambiente.id] ?? urlBase;
          } catch {
            // Aplicação apagada: fica o endereço desta.
          }
        }
        const doBloco = comParametros(valores, item.parametros);
        parou = await repetirPassosAte(nova.pagina, anterior, anterior.passos.length, doBloco, url);
        juntarGuardadas(valores, doBloco, item.parametros);
        if (parou) {
          parou = `${parou.replace(/\.$/, '')} (bloco "${anterior.nome}").`;
          break;
        }
      }
      if (!parou && existente && inserir.posicao > 0) {
        const doBloco = comParametros(valores, inserir.parametros);
        parou = await repetirPassosAte(nova.pagina, bloco, inserir.posicao, doBloco, urlBase);
        juntarGuardadas(valores, doBloco, inserir.parametros);
      }
      nova.valoresCaso = comParametros(valores, inserir.parametros);
      nova.modo = 'gravar';
      await definirModo('gravar');
      const nota = naoRepetidos.length > 0 ? ` Não repeti os blocos que não são de ecrã (${naoRepetidos.join(', ')}): se forem precisos, faça esses passos à mão.` : '';
      nova.mensagem = (parou ?? `Pronto: grava os passos novos no browser (entram ${ondeEntram(nova)}).`) + nota;
    }
  } catch (erro) {
    sessao = null;
    await browser.close().catch(() => undefined);
    const texto = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
    throw new repo.ErroProjeto(`Não foi possível abrir a aplicação: ${texto}`);
  }
  if (!sessao?.regravar && !inserir) avisar(undefined);
  else notificar(estadoGravador());
  return estadoGravador();
}

/**
 * Modo print: captura a parte visível da página e a estrutura por baixo (os elementos com que se pode
 * fazer alguma coisa, com posição e localizadores). Os passos gravam-se depois por cima da captura.
 */
export async function capturarEcra(): Promise<PrintDoEcra> {
  const s = sessao;
  if (!s || !s.browser.isConnected()) throw new repo.ErroProjeto('Não há uma gravação com o browser aberto.');
  const elementos = (await s.pagina.evaluate(() => (window as unknown as { __uatPagina?: { mapaDoEcra(): unknown } }).__uatPagina?.mapaDoEcra() ?? [])) as NonNullable<Sessao['print']>;
  const tamanho = await s.pagina.evaluate(() => ({ largura: window.innerWidth, altura: window.innerHeight }));
  // A barra e o realce do gravador não entram no print.
  await s.pagina.evaluate(() => (window as unknown as { __uatPagina?: { definirModo(m: string): void } }).__uatPagina?.definirModo('livre')).catch(() => undefined);
  const png = await s.pagina.screenshot({ type: 'png', animations: 'disabled', mask: [s.pagina.locator('#__uat-gravador')], maskColor: '#00000000' });
  await s.pagina.evaluate((m) => (window as unknown as { __uatPagina?: { definirModo(m: string): void } }).__uatPagina?.definirModo(m), s.modo).catch(() => undefined);
  s.print = elementos;
  return {
    imagem: `data:image/png;base64,${png.toString('base64')}`,
    largura: tamanho.largura,
    altura: tamanho.altura,
    elementos: elementos.map(({ localizadores: _l, widget: _w, ...resto }) => resto),
  };
}

/** Modo print: grava um passo sobre um elemento da última captura (sem o executar na página). */
export function gravarSobrePrint(pedido: PassoSobrePrint): EstadoGravador {
  const s = sessao;
  const elemento = s?.print?.[pedido.elemento];
  if (!s || !elemento) throw new repo.ErroProjeto('Esse elemento já não está na captura: tire o print outra vez.');
  if (pedido.valor?.tipo === 'formula') {
    const erro = validarFormula(pedido.valor.expressao);
    if (erro) throw new repo.ErroProjeto(`A fórmula tem um erro: ${erro}`);
  }
  if (pedido.acao === 'guardar' && !pedido.variavel?.trim()) throw new repo.ErroProjeto('Diga em que variável guardar.');
  const alvo: Alvo = { descricao: elemento.descricao, localizadores: elemento.localizadores, ...(elemento.widget ? { widget: elemento.widget } : {}) };
  const mensagem: MensagemPasso = {
    tipo: 'passo',
    marcador: 0,
    acao: pedido.acao,
    alvo,
    ...(pedido.valor ? { valor: pedido.valor } : {}),
    ...(pedido.verificacao ? { verificacao: pedido.verificacao } : {}),
    ...(pedido.variavel ? { variavel: pedido.variavel.trim() } : {}),
  };
  inserirPasso(s, {
    id: proximoId(s.bloco),
    acao: pedido.acao,
    descricao: `${descreverPasso(mensagem)} (gravado sobre o print)`,
    alvo,
    ...(pedido.valor ? { valor: pedido.valor } : {}),
    ...(pedido.verificacao ? { verificacao: pedido.verificacao } : {}),
    ...(pedido.variavel ? { variavel: pedido.variavel.trim() } : {}),
  });
  if (pedido.valor?.tipo === 'variavel' && !s.colunas.includes(pedido.valor.nome)) s.colunas.push(pedido.valor.nome);
  if (pedido.variavel && !s.colunas.includes(pedido.variavel.trim())) s.colunas.push(pedido.variavel.trim());
  avisar('Passo gravado sobre o print (não foi executado na página: confirme-o numa execução).');
  return estadoGravador();
}

export function removerPasso(passoId: string): EstadoGravador {
  if (sessao) {
    const indice = sessao.bloco.passos.findIndex((p) => p.id === passoId);
    if (sessao.posicao !== undefined && indice >= 0 && indice < sessao.posicao) sessao.posicao -= 1;
    sessao.bloco.passos = sessao.bloco.passos.filter((p) => p.id !== passoId);
    avisar(undefined);
  }
  return estadoGravador();
}

/** Fecha o browser e, se pedido, guarda o bloco no projeto. Devolve o bloco guardado. */
export async function terminarGravacao(guardar: boolean): Promise<Bloco | null> {
  const s = sessao;
  if (!s) return null;
  sessao = null;
  await s.browser.close().catch(() => undefined);
  let guardado: Bloco | null = null;
  if (guardar) {
    const { id, ...resto } = s.bloco;
    guardado = repo.guardar(s.pasta, 'blocos', s.existente ? s.bloco : resto);
    void id;
    // "Gravar um bloco novo aqui": o bloco entra no percurso do cenário na posição escolhida.
    if (s.cenario && guardado) {
      const jornada = repo.ler(s.pasta, 'jornadas', s.cenario.id);
      const numeros = jornada.blocos.map((b) => Number(/^b(\d+)$/.exec(b.id)?.[1] ?? 0));
      const item = { id: `b${Math.max(0, ...numeros) + 1}`, blocoId: guardado.id, ...(s.cenario.sessao ? { sessao: s.cenario.sessao } : {}) };
      jornada.blocos.splice(Math.min(Math.max(0, s.cenario.posicao), jornada.blocos.length), 0, item);
      repo.guardar(s.pasta, 'jornadas', jornada);
    }
  }
  notificar(estadoGravador());
  return guardado;
}
