// Encontrar elementos na página. Cada elemento tem vários localizadores, por ordem de
// preferência: se o primeiro falhar, usa-se o seguinte (e isso fica registado no log).
import { Locator, Page } from 'playwright-core';
import { Alvo, Localizador } from '../../shared/modelo';

/** Onde procurar: a página inteira, ou dentro de outro elemento (por exemplo, a linha de uma tabela). */
type Raiz = Page | Locator;

export function paraLocator(raiz: Raiz, loc: Localizador): Locator {
  switch (loc.tipo) {
    case 'testid':
      return raiz.getByTestId(loc.valor);
    case 'etiqueta':
      return raiz.getByLabel(loc.valor, { exact: true });
    case 'role':
      return raiz.getByRole(loc.valor as Parameters<Page['getByRole']>[0], {
        name: loc.nome,
        exact: true,
      });
    case 'placeholder':
      return raiz.getByPlaceholder(loc.valor, { exact: true });
    case 'texto':
      return raiz.getByText(loc.valor, { exact: true });
    case 'id':
      return raiz.locator(`[id="${loc.valor.replace(/["\\]/g, '\\$&')}"]`);
    case 'css':
      return raiz.locator(loc.valor);
  }
}

/** Texto curto para logs: testid "inpValor". */
export function descreverLocalizador(loc: Localizador): string {
  const nomes: Record<Localizador['tipo'], string> = {
    testid: 'data-testid',
    etiqueta: 'etiqueta',
    role: 'tipo e nome',
    placeholder: 'texto de ajuda',
    texto: 'texto',
    id: 'id',
    css: 'posição na página',
  };
  return `${nomes[loc.tipo]} "${loc.tipo === 'role' ? `${loc.valor}: ${loc.nome ?? ''}` : loc.valor}"`;
}

export class ErroElemento extends Error {}

export interface Encontrado {
  locator: Locator;
  usado: Localizador;
  /** true quando o localizador preferido falhou e foi usada uma alternativa. */
  alternativa: boolean;
}

export interface OpcoesEncontrar {
  limiteMs?: number;
  toleranciaMs?: number;
  /** Para alvos "na linha da tabela que contém...": o texto que identifica a linha, já resolvido. */
  linha?: string;
}

async function contar(locator: Locator): Promise<number> {
  try {
    return await locator.count();
  } catch {
    return 0;
  }
}

/** Seletor das linhas de uma tabela (HTML normal ou grelhas com role="row"). */
const LINHAS = 'tr, [role="row"]';

/**
 * As linhas da tabela que contêm exatamente o texto pedido numa das suas células.
 * Procura-se a linha mais "de dentro" (uma tabela dentro de outra não conta duas vezes).
 */
export function linhasCom(pagina: Page, texto: string): Locator {
  const comTexto = pagina.locator(LINHAS).filter({ has: pagina.getByText(texto.trim(), { exact: true }) });
  return comTexto.filter({ hasNot: pagina.locator(LINHAS).filter({ has: pagina.getByText(texto.trim(), { exact: true }) }) });
}

/**
 * Espera até encontrar o elemento. O localizador preferido tem prioridade: uma alternativa
 * só é aceite depois de um tempo de tolerância, para dar tempo ao ecrã de carregar.
 */
export async function encontrar(pagina: Page, alvo: Alvo, opcoes: OpcoesEncontrar = {}): Promise<Encontrado> {
  const limite = opcoes.limiteMs ?? 15_000;
  const tolerancia = Math.min(opcoes.toleranciaMs ?? 3_000, limite);
  const inicio = Date.now();
  if (alvo.localizadores.length === 0) {
    throw new ErroElemento(`O elemento "${alvo.descricao}" não tem localizadores gravados.`);
  }
  const naLinha = Boolean(alvo.linha);
  const textoLinha = (opcoes.linha ?? '').trim();
  if (naLinha && !textoLinha) {
    throw new ErroElemento(`Para encontrar "${alvo.descricao}" é preciso o texto que identifica a linha da tabela, e está vazio.`);
  }
  let numeroDeLinhas = 0;
  for (;;) {
    const decorrido = Date.now() - inicio;
    let raiz: Raiz | null = pagina;
    if (naLinha) {
      const linhas = linhasCom(pagina, textoLinha);
      numeroDeLinhas = await contar(linhas);
      raiz = numeroDeLinhas === 1 ? linhas : null;
    }
    if (raiz) {
      const candidatos = decorrido >= tolerancia ? alvo.localizadores : alvo.localizadores.slice(0, 1);
      for (const loc of candidatos) {
        const locator = paraLocator(raiz, loc);
        if ((await contar(locator)) === 1) {
          return { locator, usado: loc, alternativa: loc !== alvo.localizadores[0] };
        }
      }
    }
    if (decorrido >= limite) break;
    await pagina.waitForTimeout(150);
  }
  if (naLinha && numeroDeLinhas !== 1) {
    throw new ErroElemento(
      numeroDeLinhas === 0
        ? `Não encontrei nenhuma linha de tabela com o texto "${textoLinha}" (para chegar a "${alvo.descricao}").`
        : `Há ${numeroDeLinhas} linhas de tabela com o texto "${textoLinha}": não sei em qual agir (para chegar a "${alvo.descricao}").`,
    );
  }
  const ondeProcurar = naLinha ? linhasCom(pagina, textoLinha) : pagina;
  const quantos = await contar(paraLocator(ondeProcurar, alvo.localizadores[0]));
  const naLinhaTexto = naLinha ? ` na linha "${textoLinha}"` : '';
  throw new ErroElemento(
    quantos > 1
      ? `Há ${quantos} elementos que correspondem a "${alvo.descricao}"${naLinhaTexto} (${descreverLocalizador(alvo.localizadores[0])}) e nenhuma alternativa serviu.`
      : `Não encontrei o elemento "${alvo.descricao}"${naLinhaTexto} (${descreverLocalizador(alvo.localizadores[0])}) nem pelas alternativas.`,
  );
}

/**
 * Nos widgets OutSystems o data-testid fica muitas vezes no DIV à volta e o controlo
 * verdadeiro (<select>, <input>) está lá dentro. Devolve o controlo certo.
 */
export async function controloDe(locator: Locator, seletor: string): Promise<Locator> {
  const eOProprio = await locator.evaluate((el, s) => el.matches(s), seletor);
  if (eOProprio) return locator;
  const dentro = locator.locator(seletor);
  return (await contar(dentro)) > 0 ? dentro.first() : locator;
}
