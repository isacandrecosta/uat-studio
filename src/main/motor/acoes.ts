// Executar uma ação num elemento (escrever, escolher, marcar, clicar) e ler valores do ecrã.
// É usado pelo gravador (para a página avançar enquanto se grava) e pelo executor.
import { Locator, Page } from 'playwright-core';
import { Passo } from '../../shared/modelo';
import { formatarComPonto, lerNumero } from '../executor/numeros';
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

// ---------------------------------------------------------------- widgets do OutSystems UI (por regras)

/** Widgets que não são campos simples: cada um tem a sua forma de ser preenchido e lido. */
export type Widget = 'data' | 'slider' | 'pesquisa' | 'classificacao' | 'opcoes' | 'botoes';

/** Reconhece o widget do OutSystems UI no elemento (ou à volta dele). */
export async function widgetDe(locator: Locator): Promise<Widget | null> {
  return locator.evaluate((el): Widget | null => {
    const dentro = (s: string): Element | null => (el.matches(s) ? el : el.querySelector(s));
    // Os campos ao lado só contam quando o próprio elemento é um campo (a cópia visível do calendário).
    const entradas = [el, ...Array.from(el.querySelectorAll('input')), ...(el.matches('input') ? Array.from(el.parentElement?.querySelectorAll('input') ?? []) : [])];
    if (entradas.some((i) => (i as unknown as { _flatpickr?: unknown })._flatpickr)) return 'data';
    if (dentro('.noUi-target')) return 'slider';
    if (dentro('.vscomp-ele')) return 'pesquisa';
    if (dentro('input.rating-input')) return 'classificacao';
    if (dentro('input[type="radio"]') && !el.matches('input')) return 'opcoes';
    if (dentro('[role="radio"]') && !el.matches('[role="radio"]')) return 'botoes';
    return null;
  });
}

const igualTexto = (a: string, b: string): boolean => a.trim().localeCompare(b.trim(), 'pt', { sensitivity: 'accent' }) === 0;

/** "15/03/2026", "2026-03-15", "15-03-2026", "03/2026", "2026-03" ou "14:30" → formato ISO (ou hora). */
export function dataIso(texto: string): string | null {
  const t = texto.trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
  m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return null;
}

/** Um intervalo: "01/03/2026 a 15/03/2026", "01/03/2026 - 15/03/2026" ou "01/03/2026; 15/03/2026". */
export function partesDoIntervalo(texto: string): string[] {
  return texto
    .split(/\s+(?:a|até|ate|to|-)\s+|\s*;\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** "60" → [60]; "20-80", "20 a 80" ou "20;80" → [20, 80]; aceita vírgula decimal. */
export function numerosDoSlider(texto: string): number[] {
  return texto
    .split(/\s*;\s*|\s+a\s+|(?<=\d)\s*-\s*(?=\d)/)
    .map((p) => Number(p.trim().replace(/\s/g, '').replace(',', '.')))
    .filter((n) => !Number.isNaN(n));
}

async function preencherData(locator: Locator, valor: string): Promise<string> {
  const partes = partesDoIntervalo(valor);
  const isos = partes.map(dataIso);
  if (partes.length === 0 || isos.some((d) => !d)) {
    throw new ErroAcao(`Não percebi a data "${valor}". Escreva por exemplo 15/03/2026, 2026-03-15, 01/03/2026 a 15/03/2026, 03/2026 ou 14:30.`);
  }
  return locator.evaluate((el, datas) => {
    type Fp = { config: { mode: string; noCalendar: boolean }; setDate(d: string | string[], evento: boolean, formato: string): void; input: HTMLInputElement; altInput?: HTMLInputElement };
    const entradas = [el, ...Array.from(el.querySelectorAll('input')), ...(el.matches('input') ? Array.from(el.parentElement?.querySelectorAll('input') ?? []) : [])];
    const fp = (entradas.find((i) => (i as unknown as { _flatpickr?: Fp })._flatpickr) as unknown as { _flatpickr: Fp })._flatpickr;
    if (fp.config.noCalendar) fp.setDate(datas[0], true, 'H:i');
    else fp.setDate(fp.config.mode === 'range' ? datas : datas[0], true, 'Y-m-d');
    return fp.altInput?.value || fp.input.value;
  }, isos as string[]);
}

async function alvoDoSlider(locator: Locator): Promise<Locator> {
  return (await locator.evaluate((el) => el.matches('.noUi-target'))) ? locator : locator.locator('.noUi-target').first();
}

async function preencherSlider(locator: Locator, valor: string, limiteMs: number): Promise<string> {
  const numeros = numerosDoSlider(valor);
  if (numeros.length === 0) throw new ErroAcao(`O valor do slider tem de ser um número (por exemplo 60) ou um intervalo (20-80): "${valor}".`);
  const alvo = await alvoDoSlider(locator);
  const ordens = await alvo.evaluate((el, v) => {
    type Ns = { set(v: number | number[]): void; get(): string | string[]; options: { range: { min: number; max: number } } };
    const s = (el as unknown as { noUiSlider: Ns }).noUiSlider;
    s.set(v.length === 1 ? v[0] : v);
    // O OutSystems só reage a uma mexida do utilizador: as setas no puxador (para cá e para lá) fazem-no.
    const max = s.options.range.max;
    const atuais = ([] as string[]).concat(s.get()).map(Number);
    return atuais.map((a) => (a >= max ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']));
  }, numeros);
  const puxadores = alvo.locator('.noUi-handle');
  for (const [i, teclas] of ordens.entries()) {
    const p = puxadores.nth(i);
    await p.focus({ timeout: limiteMs });
    for (const t of teclas) await p.press(t);
  }
  return lerSlider(alvo);
}

async function lerSlider(locator: Locator): Promise<string> {
  const alvo = await alvoDoSlider(locator);
  return alvo.evaluate((el) => {
    const v = ([] as string[]).concat((el as unknown as { noUiSlider: { get(): string | string[] } }).noUiSlider.get());
    return v.map((x) => String(Number(x))).join('-');
  });
}

async function escolherNaPesquisa(locator: Locator, valor: string, limiteMs: number): Promise<string> {
  const pedidos = valor.split(';').map((v) => v.trim()).filter(Boolean);
  const alvo = (await locator.evaluate((el) => el.matches('.vscomp-ele'))) ? locator : locator.locator('.vscomp-ele').first();
  const inicio = Date.now();
  for (;;) {
    const opcoes = await alvo.evaluate((el) =>
      ((el as unknown as { virtualSelect?: { options?: Array<{ label: string; value: string }> } }).virtualSelect?.options ?? []).map((o) => ({ texto: String(o.label), valor: String(o.value) })),
    );
    const escolhidas = pedidos.map((p) => opcoes.find((o) => igualTexto(o.texto, p)) ?? opcoes.find((o) => o.valor === p) ?? opcoes.find((o) => o.texto.toLowerCase().startsWith(`${p.toLowerCase()} `)));
    if (pedidos.length > 0 && escolhidas.every(Boolean)) {
      const multipla = await alvo.evaluate((el) => (el as unknown as { virtualSelect?: { multiple?: boolean } }).virtualSelect?.multiple === true);
      const valores = escolhidas.map((o) => o!.valor);
      await alvo.evaluate((el, a) => (el as unknown as { setValue(v: string | string[]): void }).setValue(a.multipla ? a.valores : a.valores[0]), { multipla, valores });
      return escolhidas.map((o) => o!.texto).join(', ');
    }
    if (Date.now() - inicio >= limiteMs) {
      const falta = pedidos.filter((_, i) => !escolhidas[i]);
      throw new ErroAcao(`A opção "${falta.join('; ')}" não existe na lista. Opções disponíveis: ${opcoes.length ? opcoes.slice(0, 15).map((o) => o.texto).join(' | ') : '(lista vazia)'}.`);
    }
    await alvo.page().waitForTimeout(200);
  }
}

async function escolherOpcaoMarcada(locator: Locator, valor: string, widget: 'classificacao' | 'opcoes' | 'botoes', limiteMs: number): Promise<string> {
  if (widget === 'botoes') {
    const botoes = locator.locator('[role="radio"]');
    const textos = (await botoes.allInnerTexts()).map((t) => t.trim());
    const i = textos.findIndex((t) => igualTexto(t, valor));
    if (i < 0) throw new ErroAcao(`A opção "${valor}" não existe. Opções: ${textos.join(' | ')}.`);
    await botoes.nth(i).click({ timeout: limiteMs });
    return textos[i];
  }
  const radios = locator.locator(widget === 'classificacao' ? 'input.rating-input' : 'input[type="radio"]');
  const opcoes = await radios.evaluateAll((els) =>
    els.map((e) => {
      const i = e as HTMLInputElement;
      const etiqueta = (i.labels?.[0]?.innerText ?? i.parentElement?.innerText ?? '').replace(/\s+/g, ' ').trim();
      return { valor: i.value, texto: etiqueta, id: i.id };
    }),
  );
  const i = opcoes.findIndex((o) => igualTexto(o.texto, valor) || o.valor === valor.trim());
  if (i < 0) throw new ErroAcao(`A opção "${valor}" não existe. Opções: ${opcoes.map((o) => (widget === 'classificacao' ? o.valor : o.texto || o.valor)).join(' | ')}.`);
  const o = opcoes[i];
  // Na classificação, o botão escondido só reage ao clique na etiqueta (a estrela).
  const etiqueta = o.id ? locator.page().locator(`label[for="${o.id.replace(/"/g, '\\"')}"]`) : null;
  if (etiqueta && (await etiqueta.count()) > 0) await etiqueta.first().click({ timeout: limiteMs });
  else await radios.nth(i).check({ force: true, timeout: limiteMs });
  return widget === 'classificacao' ? o.valor : o.texto || o.valor;
}

/** Preenche um widget (data, slider, lista com pesquisa, classificação, opções, grupo de botões). */
async function preencherWidget(locator: Locator, widget: Widget, valor: string, limiteMs: number): Promise<string> {
  switch (widget) {
    case 'data':
      return `data "${await preencherData(locator, valor)}"`;
    case 'slider':
      return `slider em ${await preencherSlider(locator, valor, limiteMs)}`;
    case 'pesquisa':
      return `opção "${await escolherNaPesquisa(locator, valor, limiteMs)}"`;
    default:
      return `opção "${await escolherOpcaoMarcada(locator, valor, widget, limiteMs)}"`;
  }
}

/** Lê o valor que um widget mostra (para verificar ou guardar). */
async function lerWidget(locator: Locator, widget: Widget): Promise<string> {
  if (widget === 'slider') return lerSlider(locator);
  return locator.evaluate((el, w) => {
    const limpar = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();
    if (w === 'data') {
      const entradas = [el, ...Array.from(el.querySelectorAll('input')), ...(el.matches('input') ? Array.from(el.parentElement?.querySelectorAll('input') ?? []) : [])];
      const fp = (entradas.find((i) => (i as unknown as { _flatpickr?: unknown })._flatpickr) as unknown as { _flatpickr: { input: HTMLInputElement; altInput?: HTMLInputElement } })._flatpickr;
      return fp.altInput?.value || fp.input.value;
    }
    if (w === 'pesquisa') return limpar((el.querySelector('.vscomp-value') as HTMLElement | null)?.innerText);
    if (w === 'botoes') return limpar((el.querySelector('[role="radio"][aria-checked="true"]') as HTMLElement | null)?.innerText);
    const marcado = el.querySelector('input[type="radio"]:checked') as HTMLInputElement | null;
    if (!marcado) return '';
    if (w === 'classificacao') return marcado.value;
    return limpar(marcado.labels?.[0]?.innerText ?? marcado.parentElement?.innerText) || marcado.value;
  }, widget);
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
  opcoes: { limiteMs?: number; linha?: string } = {},
): Promise<ResultadoAcao> {
  if (!passo.alvo) throw new ErroAcao(`O passo "${passo.descricao}" não tem elemento.`);
  const limiteMs = opcoes.limiteMs ?? 15_000;
  const encontrado = await encontrar(pagina, passo.alvo, { limiteMs, linha: opcoes.linha });
  const { locator } = encontrado;

  switch (passo.acao) {
    case 'escrever': {
      const widget = await widgetDe(locator);
      if (widget) return { encontrado, detalhe: await preencherWidget(locator, widget, valor, limiteMs) };
      const campo = await controloDe(locator, CAMPO_TEXTO);
      // Um campo numérico do browser só aceita ponto decimal: "863,61" passa a "863.61".
      let texto = valor;
      if (valor.includes(',') && (await campo.evaluate((el) => el instanceof HTMLInputElement && el.type === 'number'))) {
        const numero = lerNumero(valor);
        if (numero) texto = formatarComPonto(numero);
      }
      // Campos de data/hora do browser só aceitam o formato ISO: "15/03/2026" passa a "2026-03-15".
      const tipoCampo = await campo.evaluate((el) => (el instanceof HTMLInputElement ? el.type : ''));
      if (['date', 'month', 'time'].includes(tipoCampo)) {
        const iso = dataIso(valor);
        if (iso) texto = tipoCampo === 'month' ? iso.slice(0, 7) : iso;
      }
      await campo.fill(texto, { timeout: limiteMs });
      // O OutSystems só valida e formata o campo quando se sai dele.
      await campo.blur().catch(() => undefined);
      return { encontrado };
    }
    case 'escolher': {
      const widget = await widgetDe(locator);
      if (widget) return { encontrado, detalhe: await preencherWidget(locator, widget, valor, limiteMs) };
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
export async function lerElemento(pagina: Page, passo: Passo, opcoes: { limiteMs?: number; linha?: string } = {}): Promise<Leitura> {
  if (!passo.alvo) throw new ErroAcao(`O passo "${passo.descricao}" não tem elemento.`);
  const encontrado = await encontrar(pagina, passo.alvo, { limiteMs: opcoes.limiteMs, linha: opcoes.linha });
  const widget = await widgetDe(encontrado.locator);
  if (widget) return { encontrado, texto: (await lerWidget(encontrado.locator, widget)).trim(), visivel: await encontrado.locator.isVisible() };
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
