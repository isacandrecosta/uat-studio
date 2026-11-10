// Números financeiros com cálculo decimal EXATO (sem vírgula flutuante).
// Um número é guardado como inteiro grande + número de casas decimais: 86,36 = { inteiro: 8636n, casas: 2 }.

export interface Decimal {
  inteiro: bigint;
  casas: number;
}

/**
 * Lê um número escrito no ecrã ou no Excel: "1.234,56 €", "86.76", "12,5 %", "-0,01", "1 234,5".
 * Regras para os separadores:
 *  - com vírgula e ponto, o último é o separador decimal ("1.234,56" e "1,234.56");
 *  - só vírgula: é decimal ("86,36"); várias vírgulas são milhares;
 *  - só ponto: é decimal ("86.76"), exceto no formato de milhares pt-PT ("1.234", "12.345.678").
 * Devolve null se o texto não for um número.
 */
export function lerNumero(texto: string): Decimal | null {
  const limpo = texto.replace(/[\s  ]/g, '');
  const negativo = /^[^\d]*[-−]/.test(limpo) || /^\(.*\)$/.test(limpo);
  const corpo = limpo.replace(/[^\d.,]/g, '');
  if (!/\d/.test(corpo)) return null;

  const virgulas = (corpo.match(/,/g) ?? []).length;
  const pontos = (corpo.match(/\./g) ?? []).length;
  let decimal = '';
  if (virgulas > 0 && pontos > 0) {
    decimal = corpo.lastIndexOf(',') > corpo.lastIndexOf('.') ? ',' : '.';
  } else if (virgulas === 1) {
    decimal = ',';
  } else if (pontos === 1) {
    const [antes, depois] = corpo.split('.');
    const milharesPt = depois.length === 3 && antes.length >= 1 && antes.length <= 3 && !antes.startsWith('0');
    decimal = milharesPt ? '' : '.';
  }

  let parteInteira = corpo;
  let parteDecimal = '';
  if (decimal) {
    const posicao = corpo.lastIndexOf(decimal);
    parteInteira = corpo.slice(0, posicao);
    parteDecimal = corpo.slice(posicao + 1);
    if (/[.,]/.test(parteDecimal)) return null;
  }
  parteInteira = parteInteira.replace(/[.,]/g, '');
  parteDecimal = parteDecimal.replace(/0+$/, '');
  const inteiro = BigInt((parteInteira || '0') + parteDecimal);
  return { inteiro: negativo ? -inteiro : inteiro, casas: parteDecimal.length };
}

function alinhar(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const casas = Math.max(a.casas, b.casas);
  return [a.inteiro * 10n ** BigInt(casas - a.casas), b.inteiro * 10n ** BigInt(casas - b.casas), casas];
}

/** a - b */
export function subtrair(a: Decimal, b: Decimal): Decimal {
  const [x, y, casas] = alinhar(a, b);
  return { inteiro: x - y, casas };
}

export function absoluto(a: Decimal): Decimal {
  return { inteiro: a.inteiro < 0n ? -a.inteiro : a.inteiro, casas: a.casas };
}

/** -1 se a < b, 0 se iguais, 1 se a > b */
export function comparar(a: Decimal, b: Decimal): number {
  const [x, y] = alinhar(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Formato pt-PT simples: 1234,5 (sem separador de milhares). */
export function formatar(a: Decimal): string {
  const negativo = a.inteiro < 0n;
  const digitos = (negativo ? -a.inteiro : a.inteiro).toString().padStart(a.casas + 1, '0');
  const inteira = a.casas > 0 ? digitos.slice(0, -a.casas) : digitos;
  const decimal = a.casas > 0 ? digitos.slice(-a.casas).replace(/0+$/, '') : '';
  return `${negativo ? '-' : ''}${inteira}${decimal ? `,${decimal}` : ''}`;
}

/** Formato com ponto decimal, para campos <input type="number">: 1234.5 */
export function formatarComPonto(a: Decimal): string {
  return formatar(a).replace(',', '.');
}

export interface ComparacaoNumeros {
  igual: boolean;
  /** obtido - esperado, em formato pt-PT. */
  diferenca: string;
}

/** Compara dois números aceitando uma diferença máxima (tolerância). */
export function compararComTolerancia(esperado: Decimal, obtido: Decimal, tolerancia: Decimal): ComparacaoNumeros {
  const diferenca = subtrair(obtido, esperado);
  return { igual: comparar(absoluto(diferenca), absoluto(tolerancia)) <= 0, diferenca: formatar(diferenca) };
}
