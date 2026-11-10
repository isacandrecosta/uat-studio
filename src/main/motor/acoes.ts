// Executar uma ação num elemento (escrever, escolher, marcar, clicar) e ler valores do ecrã.
// É usado pelo gravador (para a página avançar enquanto se grava) e pelo executor.
import { Locator, Page } from 'playwright-core';
import { Passo } from '../../shared/modelo';
import { controloDe, Encontrado, encontrar } from './localizar';

const CAMPO_TEXTO = 'input, textarea, [contenteditable="true"], [contenteditable=""]';
const CAMPO_MARCA = 'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="switch"]';

export class ErroAcao extends Error {}

/** "S", "Sim", "X", "1", "true", "verdadeiro" contam como marcado. */
export function querMarcado(valor: string): boolean {
  return /^(s|sim|x|1|true|verdadeiro|y|yes)$/i.test(valor.trim());
}

/** Espera que a lista tenha a opção pedida (no OutSystems as opções chegam depois do ecrã). */
async function escolherOpcao(select: Locator, valor: string, limiteMs: number): Promise<string> {
  const pedido = valor.trim();
  const inicio = Date.now();
  let opcoes: Array<{ texto: string; valor: string }> = [];
  for (;;) {
    opcoes = await select.evaluate((el) =>
      Array.from((el as HTMLSelectElement).options ?? []).map((o) => ({ texto: o.text.trim(), valor: o.value })),
    );
    const igual = (a: string, b: string): boolean => a.localeCompare(b, 'pt', { sensitivity: 'accent' }) === 0;
    const escolhida =
      opcoes.find((o) => igual(o.texto, pedido)) ??
      opcoes.find((o) => o.valor === pedido) ??
      // Listas do género "CP12 Crédito Pessoal 12M": aceita o código no início.
      opcoes.find((o) => o.texto.toLowerCase().startsWith(`${pedido.toLowerCase()} `));
    if (escolhida) {
      await select.selectOption({ value: escolhida.valor });
      return escolhida.texto;
    }
    if (Date.now() - inicio >= limiteMs) break;
    await select.page().waitForTimeout(200);
  }
  const lista = opcoes.map((o) => o.texto).filter(Boolean);
  throw new ErroAcao(
    `A opção "${pedido}" não existe na lista. Opções disponíveis: ${lista.length ? lista.slice(0, 15).join(' | ') : '(lista vazia)'}.`,
  );
}

export interface ResultadoAcao {
  encontrado?: Encontrado;
  /** Detalhe para o log (por exemplo, a opção escolhida). */
  detalhe?: string;
}

/**
 * Executa `escrever`, `escolher`, `marcar` ou `clicar` com um valor já resolvido.
 * As outras ações (navegar, verificar, guardar) são tratadas por quem chama.
 */
export async function executarAcao(
  pagina: Page,
  passo: Passo,
  valor: string,
  opcoes: { limiteMs?: number } = {},
): Promise<ResultadoAcao> {
  if (!passo.alvo) throw new ErroAcao(`O passo "${passo.descricao}" não tem elemento.`);
  const limiteMs = opcoes.limiteMs ?? 15_000;
  const encontrado = await encontrar(pagina, passo.alvo, { limiteMs });
  const { locator } = encontrado;

  switch (passo.acao) {
    case 'escrever': {
      const campo = await controloDe(locator, CAMPO_TEXTO);
      await campo.fill(valor, { timeout: limiteMs });
      // O OutSystems só valida e formata o campo quando se sai dele.
      await campo.blur().catch(() => undefined);
      return { encontrado };
    }
    case 'escolher': {
      const select = await controloDe(locator, 'select');
      const eSelect = await select.evaluate((el) => el.tagName === 'SELECT');
      if (!eSelect) throw new ErroAcao(`"${passo.alvo.descricao}" não é uma lista de opções simples.`);
      const texto = await escolherOpcao(select, valor, limiteMs);
      return { encontrado, detalhe: `opção "${texto}"` };
    }
    case 'marcar': {
      const marca = await controloDe(locator, CAMPO_MARCA);
      const marcado = querMarcado(valor);
      try {
        await marca.setChecked(marcado, { timeout: Math.min(limiteMs, 5_000) });
      } catch {
        // Interruptores OutSystems: a caixa verdadeira está escondida atrás do desenho.
        await marca.setChecked(marcado, { force: true, timeout: limiteMs });
      }
      return { encontrado, detalhe: marcado ? 'marcado' : 'desmarcado' };
    }
    case 'clicar':
      await locator.click({ timeout: limiteMs });
      return { encontrado };
    default:
      throw new ErroAcao(`A ação "${passo.acao}" não é executada aqui.`);
  }
}

export interface Leitura {
  encontrado: Encontrado;
  texto: string;
  visivel: boolean;
}

/** Lê o que o elemento mostra: o valor (se for um campo) ou o texto. */
export async function lerElemento(pagina: Page, passo: Passo, opcoes: { limiteMs?: number } = {}): Promise<Leitura> {
  if (!passo.alvo) throw new ErroAcao(`O passo "${passo.descricao}" não tem elemento.`);
  const encontrado = await encontrar(pagina, passo.alvo, { limiteMs: opcoes.limiteMs });
  const controlo = await controloDe(encontrado.locator, 'input, textarea, select');
  const texto = await controlo.evaluate((el) => {
    if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.text ?? '';
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
    return (el as HTMLElement).innerText ?? el.textContent ?? '';
  });
  return { encontrado, texto: texto.trim(), visivel: await encontrado.locator.isVisible() };
}

/** Junta o endereço base da aplicação com o caminho do passo "navegar". */
export function construirUrl(base: string, caminho: string): string {
  const c = caminho.trim();
  if (/^https?:\/\//i.test(c)) return c;
  if (!c) return base;
  return `${base.replace(/\/+$/, '')}/${c.replace(/^\/+/, '')}`;
}
