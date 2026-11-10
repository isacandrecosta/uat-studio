// Números financeiros com cálculo decimal EXATO (sem vírgula flutuante).
// Um número é guardado como inteiro grande + número de casas decimais: 86,36 = { inteiro: 8636n, casas: 2 }.

export interface Decimal {
  inteiro: bigint;
  casas: number;
}

/** Como arredondar: "cima" = meio para cima (o habitual); "par" = ao par (como o Round() do OutSystems); "baixo" = cortar. */
export type ModoArredondamento = 'cima' | 'par' | 'baixo';

/** Casas decimais guardadas numa divisão (o resultado é arredondado ao par nesta casa). */
const CASAS_DIVISAO = 20;

export const ZERO: Decimal = { inteiro: 0n, casas: 0 };

export function deInteiro(n: number | bigint): Decimal {
  return { inteiro: BigInt(n), casas: 0 };
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

/** Tira os zeros à direita: 1,500 → 1,5 */
function simplificar(a: Decimal): Decimal {
  let { inteiro, casas } = a;
  while (casas > 0 && inteiro % 10n === 0n) {
    inteiro /= 10n;
    casas -= 1;
  }
  return { inteiro, casas };
}

export function somar(a: Decimal, b: Decimal): Decimal {
  const [x, y, casas] = alinhar(a, b);
  return simplificar({ inteiro: x + y, casas });
}

/** a - b */
export function subtrair(a: Decimal, b: Decimal): Decimal {
  const [x, y, casas] = alinhar(a, b);
  return simplificar({ inteiro: x - y, casas });
}

export function multiplicar(a: Decimal, b: Decimal): Decimal {
  return simplificar({ inteiro: a.inteiro * b.inteiro, casas: a.casas + b.casas });
}

export function absoluto(a: Decimal): Decimal {
  return { inteiro: a.inteiro < 0n ? -a.inteiro : a.inteiro, casas: a.casas };
}

export function simetrico(a: Decimal): Decimal {
  return { inteiro: -a.inteiro, casas: a.casas };
}

/** -1 se a < b, 0 se iguais, 1 se a > b */
export function comparar(a: Decimal, b: Decimal): number {
  const [x, y] = alinhar(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Divide dois inteiros e arredonda o resultado (que é um inteiro). */
function dividirInteiros(numerador: bigint, divisor: bigint, modo: ModoArredondamento): bigint {
  const negativo = numerador < 0n !== divisor < 0n;
  const n = numerador < 0n ? -numerador : numerador;
  const d = divisor < 0n ? -divisor : divisor;
  let quociente = n / d;
  const resto = n % d;
  if (modo !== 'baixo' && resto !== 0n) {
    const dobro = resto * 2n;
    if (dobro > d || (dobro === d && (modo === 'cima' || quociente % 2n === 1n))) quociente += 1n;
  }
  return negativo ? -quociente : quociente;
}

/** Arredonda a um número de casas decimais. */
export function arredondar(a: Decimal, casas: number, modo: ModoArredondamento = 'cima'): Decimal {
  if (a.casas <= casas) return a;
  return { inteiro: dividirInteiros(a.inteiro, 10n ** BigInt(a.casas - casas), modo), casas };
}

/** a / b, com 20 casas decimais exatas. Dá erro se b for zero. */
export function dividir(a: Decimal, b: Decimal): Decimal {
  if (b.inteiro === 0n) throw new Error('Divisão por zero.');
  const [x, y] = alinhar(a, b);
  return simplificar({ inteiro: dividirInteiros(x * 10n ** BigInt(CASAS_DIVISAO), y, 'par'), casas: CASAS_DIVISAO });
}

/** base elevada a um expoente inteiro (positivo ou negativo). */
export function potencia(base: Decimal, expoente: number): Decimal {
  if (!Number.isInteger(expoente) || Math.abs(expoente) > 1000) throw new Error('O expoente tem de ser um número inteiro (até 1000).');
  let resultado: Decimal = { inteiro: 1n, casas: 0 };
  let fator = base;
  for (let n = Math.abs(expoente); n > 0; n = Math.floor(n / 2)) {
    if (n % 2 === 1) resultado = arredondar(multiplicar(resultado, fator), 40, 'par');
    fator = arredondar(multiplicar(fator, fator), 40, 'par');
  }
  return expoente < 0 ? dividir({ inteiro: 1n, casas: 0 }, resultado) : simplificar(resultado);
}

/** Formato pt-PT simples: 1234,5 (sem separador de milhares). Com `casasFixas`, mostra sempre essas casas: 1234,50 */
export function formatar(a: Decimal, casasFixas?: number): string {
  const numero = casasFixas === undefined ? simplificar(a) : a.casas > casasFixas ? arredondar(a, casasFixas) : a;
  const negativo = numero.inteiro < 0n;
  const digitos = (negativo ? -numero.inteiro : numero.inteiro).toString().padStart(numero.casas + 1, '0');
  const inteira = numero.casas > 0 ? digitos.slice(0, -numero.casas) : digitos;
  let decimal = numero.casas > 0 ? digitos.slice(-numero.casas) : '';
  if (casasFixas !== undefined) decimal = decimal.padEnd(casasFixas, '0');
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
