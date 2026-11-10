// Encontrar elementos na página. Cada elemento tem vários localizadores, por ordem de
// preferência: se o primeiro falhar, usa-se o seguinte (e isso fica registado no log).
import { Locator, Page } from 'playwright-core';
import { Alvo, Localizador } from '../../shared/modelo';

export function paraLocator(pagina: Page, loc: Localizador): Locator {
  switch (loc.tipo) {
    case 'testid':
      return pagina.getByTestId(loc.valor);
    case 'etiqueta':
      return pagina.getByLabel(loc.valor, { exact: true });
    case 'role':
      return pagina.getByRole(loc.valor as Parameters<Page['getByRole']>[0], {
        name: loc.nome,
        exact: true,
      });
    case 'placeholder':
      return pagina.getByPlaceholder(loc.valor, { exact: true });
    case 'texto':
      return pagina.getByText(loc.valor, { exact: true });
    case 'id':
      return pagina.locator(`[id="${loc.valor.replace(/["\\]/g, '\\$&')}"]`);
    case 'css':
      return pagina.locator(loc.valor);
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

async function contar(locator: Locator): Promise<number> {
  try {
    return await locator.count();
  } catch {
    return 0;
  }
}

/**
 * Espera até encontrar o elemento. O localizador preferido tem prioridade: uma alternativa
 * só é aceite depois de um tempo de tolerância, para dar tempo ao ecrã de carregar.
 */
export async function encontrar(
  pagina: Page,
  alvo: Alvo,
  opcoes: { limiteMs?: number; toleranciaMs?: number } = {},
): Promise<Encontrado> {
  const limite = opcoes.limiteMs ?? 15_000;
  const tolerancia = Math.min(opcoes.toleranciaMs ?? 3_000, limite);
  const inicio = Date.now();
  if (alvo.localizadores.length === 0) {
    throw new ErroElemento(`O elemento "${alvo.descricao}" não tem localizadores gravados.`);
  }
  for (;;) {
    const decorrido = Date.now() - inicio;
    const candidatos = decorrido >= tolerancia ? alvo.localizadores : alvo.localizadores.slice(0, 1);
    for (const loc of candidatos) {
      const locator = paraLocator(pagina, loc);
      if ((await contar(locator)) === 1) {
        return { locator, usado: loc, alternativa: loc !== alvo.localizadores[0] };
      }
    }
    if (decorrido >= limite) break;
    await pagina.waitForTimeout(150);
  }
  const quantos = await contar(paraLocator(pagina, alvo.localizadores[0]));
  throw new ErroElemento(
    quantos > 1
      ? `Há ${quantos} elementos que correspondem a "${alvo.descricao}" (${descreverLocalizador(alvo.localizadores[0])}) e nenhuma alternativa serviu.`
      : `Não encontrei o elemento "${alvo.descricao}" (${descreverLocalizador(alvo.localizadores[0])}) nem pelas alternativas.`,
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
