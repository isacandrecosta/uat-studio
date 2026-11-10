// Gravador: abre o browser na aplicação, recebe os passos escolhidos no popup da página,
// executa-os a sério (para a página avançar) e junta-os num bloco.
import { Browser, BrowserContext, chromium, Page } from 'playwright-core';
import {
  Alvo,
  Bloco,
  EstadoGravador,
  Localizador,
  Passo,
  PedidoGravacao,
  Valor,
} from '../../shared/modelo';
import { construirUrl, executarAcao, lerElemento } from '../motor/acoes';
import { descreverLocalizador, paraLocator } from '../motor/localizar';
import * as repo from '../projeto/repositorio';
import { scriptGravador } from './injetado';

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
}

/** O que a página envia quando o utilizador confirma o popup. */
interface MensagemPasso {
  tipo: 'passo';
  marcador: number;
  acao: Passo['acao'];
  alvo: Alvo;
  valor?: Valor;
  exemplo?: string;
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
  const nome = m.alvo.descricao;
  switch (m.acao) {
    case 'escrever':
      return `Escrever ${m.secreto ? '(segredo)' : descreverValor(m.valor)} em ${nome}`;
    case 'escolher':
      return `Escolher ${descreverValor(m.valor)} em ${nome}`;
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
  for (const loc of m.alvo.localizadores) {
    try {
      const locator = paraLocator(pagina, loc);
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

async function tratarPasso(s: Sessao, m: MensagemPasso): Promise<{ ok: boolean; mensagem: string }> {
  const localizadores = await filtrarLocalizadores(s.pagina, m);
  if (localizadores.length === 0) {
    return { ok: false, mensagem: 'Não encontrei uma forma fiável de localizar este elemento.' };
  }
  const passo: Passo = {
    id: proximoId(s.bloco),
    acao: m.acao,
    descricao: descreverPasso(m),
    alvo: { descricao: m.alvo.descricao, localizadores, ...(m.alvo.widget ? { widget: m.alvo.widget } : {}) },
    ...(m.valor ? { valor: m.valor } : {}),
    ...(m.verificacao ? { verificacao: m.verificacao } : {}),
    ...(m.variavel ? { variavel: m.variavel } : {}),
    ...(m.secreto ? { secreto: true } : {}),
  };
  // Um segredo nunca pode ficar escrito no bloco.
  if (passo.secreto && passo.valor?.tipo !== 'variavel') {
    return { ok: false, mensagem: 'Uma password tem de vir de uma coluna dos dados.' };
  }

  let resumo = 'Passo gravado.';
  try {
    if (m.acao === 'escrever' || m.acao === 'escolher' || m.acao === 'marcar' || m.acao === 'clicar') {
      await executarAcao(s.pagina, passo, m.exemplo ?? '', { limiteMs: 10_000 });
    } else {
      const leitura = await lerElemento(s.pagina, passo, { limiteMs: 5_000 });
      resumo = `Passo gravado (agora o ecrã mostra "${leitura.texto.slice(0, 60)}").`;
    }
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
    return { ok: false, mensagem: `Não consegui executar o passo, por isso não foi gravado: ${texto}` };
  }

  s.bloco.passos.push(passo);
  if (m.valor?.tipo === 'variavel' && !s.colunas.includes(m.valor.nome)) s.colunas.push(m.valor.nome);
  if (m.variavel && !s.colunas.includes(m.variavel)) s.colunas.push(m.variavel);
  avisar(undefined);
  return { ok: true, mensagem: `${resumo} Encontrado por ${descreverLocalizador(localizadores[0])}.` };
}

export async function iniciarGravacao(pasta: string, pedido: PedidoGravacao): Promise<EstadoGravador> {
  if (sessao) throw new repo.ErroProjeto('Já há uma gravação em curso. Termina-a primeiro.');

  const projeto = repo.lerProjeto(pasta);
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
    };
    await contexto.exposeBinding('__uatGravador', async (_origem, mensagem: { tipo: string; modo?: 'gravar' | 'livre' }) => {
      if (sessao !== nova) return null;
      if (mensagem.tipo === 'estado') return { modo: nova.modo, colunas: nova.colunas };
      if (mensagem.tipo === 'modo' && mensagem.modo) {
        nova.modo = mensagem.modo;
        return null;
      }
      if (mensagem.tipo === 'passo') return tratarPasso(nova, mensagem as unknown as MensagemPasso);
      return null;
    });
    await contexto.addInitScript(scriptGravador);
    browser.on('disconnected', () => {
      if (sessao === nova) avisar('O browser foi fechado. Podes guardar o bloco ou cancelar.');
    });
    sessao = nova;
    await nova.pagina.goto(construirUrl(urlBase, ''), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  } catch (erro) {
    sessao = null;
    await browser.close().catch(() => undefined);
    const texto = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
    throw new repo.ErroProjeto(`Não foi possível abrir a aplicação: ${texto}`);
  }
  avisar(undefined);
  return estadoGravador();
}

export function removerPasso(passoId: string): EstadoGravador {
  if (sessao) {
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
  }
  notificar(estadoGravador());
  return guardado;
}
