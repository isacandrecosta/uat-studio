// Motor de fórmulas com sintaxe parecida com a do Excel em português:
//   "empresa_" & {TESTE} & "_" & {DATA:yyyyMMdd} & "_" & {CONTADOR:empresa}
//   ARRED.PAR({Valor} * {Taxa} / 100; 2)
// Regras: os argumentos separam-se com ";", os textos ficam entre aspas, as variáveis entre chavetas.
// Todos os cálculos são decimais exatos (ver decimal.ts).
import { codigoTotp } from './totp.js';
import {
  absoluto,
  arredondar,
  comparar,
  Decimal,
  deInteiro,
  dividir,
  formatar,
  formatarComPonto,
  lerNumero,
  ModoArredondamento,
  multiplicar,
  potencia,
  simetrico,
  somar,
  subtrair,
} from './decimal.js';

/** Erro com uma mensagem pensada para o utilizador. */
export class ErroFormula extends Error {}

/** O que a fórmula precisa de saber sobre o caso que está a correr. */
export interface ContextoFormula {
  /** Valor de uma variável ({Nome}), ou undefined se não existir. */
  variavel(nome: string): string | undefined;
  /** ID do caso ({TESTE}). */
  teste: string;
  /** ID da execução ({RUN}). */
  run: string;
  agora: Date;
  /** Próximo valor de um contador ({CONTADOR:nome}); fica guardado entre execuções. */
  contador(nome: string): number;
  /** Número ao acaso entre 0 (incluído) e 1 (excluído). */
  aleatorio(): number;
}

type Resultado = { t: 'n'; v: Decimal } | { t: 's'; v: string } | { t: 'b'; v: boolean };

// ---------- Leitura da fórmula (tokens) ----------
type Token =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'numero'; valor: Decimal }
  | { tipo: 'marcador'; valor: string }
  | { tipo: 'nome'; valor: string }
  | { tipo: 'simbolo'; valor: string };

function separar(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const c = formula[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === '"') {
      let texto = '';
      i += 1;
      for (;;) {
        if (i >= formula.length) throw new ErroFormula('Falta fechar as aspas de um texto.');
        if (formula[i] === '"') {
          if (formula[i + 1] === '"') {
            texto += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        texto += formula[i];
        i += 1;
      }
      tokens.push({ tipo: 'texto', valor: texto });
    } else if (c === '{') {
      const fim = formula.indexOf('}', i);
      if (fim < 0) throw new ErroFormula('Falta fechar a chaveta } de uma variável.');
      tokens.push({ tipo: 'marcador', valor: formula.slice(i + 1, fim).trim() });
      i = fim + 1;
    } else if (/\d/.test(c)) {
      const numero = /^\d+([.,]\d+)?/.exec(formula.slice(i))?.[0] ?? c;
      tokens.push({ tipo: 'numero', valor: lerNumero(numero.replace('.', ',')) ?? deInteiro(0) });
      i += numero.length;
    } else if (/[\p{L}_]/u.test(c)) {
      const nome = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(formula.slice(i))?.[0] ?? c;
      tokens.push({ tipo: 'nome', valor: nome });
      i += nome.length;
    } else {
      const dois = formula.slice(i, i + 2);
      if (dois === '<>' || dois === '<=' || dois === '>=') {
        tokens.push({ tipo: 'simbolo', valor: dois });
        i += 2;
      } else if ('&+-*/();=<>'.includes(c)) {
        tokens.push({ tipo: 'simbolo', valor: c });
        i += 1;
      } else {
        throw new ErroFormula(`Carácter inesperado na fórmula: "${c}".`);
      }
    }
  }
  return tokens;
}

// ---------- Conversões ----------
function comoTexto(r: Resultado): string {
  if (r.t === 's') return r.v;
  if (r.t === 'n') return formatar(r.v);
  return r.v ? 'VERDADEIRO' : 'FALSO';
}

function comoNumero(r: Resultado, onde: string): Decimal {
  if (r.t === 'n') return r.v;
  if (r.t === 's') {
    const numero = lerNumero(r.v);
    if (numero && /^[\s\d.,€%+\-−() ]+$/.test(r.v)) return numero;
    throw new ErroFormula(`${onde}: "${r.v}" não é um número.`);
  }
  throw new ErroFormula(`${onde}: esperava um número.`);
}

function comoInteiro(r: Resultado, onde: string): number {
  const numero = arredondar(comoNumero(r, onde), 0, 'baixo');
  return Number(numero.inteiro);
}

function comoBooleano(r: Resultado): boolean {
  if (r.t === 'b') return r.v;
  if (r.t === 'n') return r.v.inteiro !== 0n;
  return /^(s|sim|verdadeiro|true|x|1)$/i.test(r.v.trim());
}

const num = (v: Decimal): Resultado => ({ t: 'n', v });
const txt = (v: string): Resultado => ({ t: 's', v });

// ---------- Marcadores e geradores ----------
function formatarData(data: Date, formato: string): string {
  const d2 = (n: number): string => String(n).padStart(2, '0');
  const partes: Record<string, string> = {
    yyyy: String(data.getFullYear()),
    yy: String(data.getFullYear()).slice(-2),
    MM: d2(data.getMonth() + 1),
    dd: d2(data.getDate()),
    HH: d2(data.getHours()),
    mm: d2(data.getMinutes()),
    ss: d2(data.getSeconds()),
  };
  return formato.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (p) => partes[p]);
}

function digitosAoAcaso(quantos: number, ctx: ContextoFormula): string {
  let texto = '';
  for (let i = 0; i < quantos; i++) texto += String(Math.floor(ctx.aleatorio() * 10));
  return texto;
}

/** NIF português válido (começa por 2: pessoa singular). */
export function gerarNif(ctx: ContextoFormula): string {
  const base = `2${digitosAoAcaso(7, ctx)}`;
  let soma = 0;
  for (let i = 0; i < 8; i++) soma += Number(base[i]) * (9 - i);
  const resto = 11 - (soma % 11);
  return `${base}${resto >= 10 ? 0 : resto}`;
}

/** IBAN português de teste, com dígitos de controlo válidos (banco fictício 0002). */
export function gerarIban(ctx: ContextoFormula): string {
  const nib19 = `00020123${digitosAoAcaso(11, ctx)}`;
  const controlo = 98n - ((BigInt(nib19) * 100n) % 97n);
  return `PT50${nib19}${String(controlo).padStart(2, '0')}`;
}

function resolverMarcador(conteudo: string, ctx: ContextoFormula): Resultado {
  const [cabeca, ...resto] = conteudo.split(':');
  const argumento = resto.join(':').trim();
  const nome = cabeca.trim();
  const maiusculas = nome.toUpperCase();
  // Uma coluna dos dados com o mesmo nome tem prioridade sobre o marcador.
  const direto = ctx.variavel(conteudo);
  if (direto !== undefined) return txt(direto);
  if (maiusculas === 'TESTE') return txt(ctx.teste);
  if (maiusculas === 'RUN') return txt(ctx.run);
  if (maiusculas === 'DATA') return txt(formatarData(ctx.agora, argumento || 'dd/MM/yyyy'));
  const hoje = /^HOJE\s*([+-]\s*\d+)?$/.exec(maiusculas);
  if (hoje) {
    const data = new Date(ctx.agora);
    data.setDate(data.getDate() + Number((hoje[1] ?? '0').replace(/\s/g, '')));
    return txt(formatarData(data, argumento || 'dd/MM/yyyy'));
  }
  if (maiusculas === 'CONTADOR') {
    if (!argumento) throw new ErroFormula('O contador precisa de um nome: {CONTADOR:nome}.');
    return txt(String(ctx.contador(argumento)));
  }
  if (maiusculas === 'ALEATORIO') {
    const quantos = Number(argumento);
    if (!Number.isInteger(quantos) || quantos < 1 || quantos > 30) throw new ErroFormula('Usa {ALEATORIO:n} com n entre 1 e 30.');
    return txt(digitosAoAcaso(quantos, ctx));
  }
  throw new ErroFormula(`Falta a variável {${conteudo}} (não existe nos dados do caso).`);
}

// ---------- Funções ----------
const semAcentos = (texto: string): string => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

type Funcao = (args: Resultado[], ctx: ContextoFormula) => Resultado;

function exigir(nome: string, args: Resultado[], minimo: number, maximo = minimo): void {
  if (args.length < minimo || args.length > maximo) {
    const quantos = minimo === maximo ? `${minimo}` : `${minimo} a ${maximo}`;
    throw new ErroFormula(`A função ${nome} precisa de ${quantos} argumento(s) e recebeu ${args.length}.`);
  }
}

function funcaoArredondar(nome: string, modo: ModoArredondamento): Funcao {
  return (args) => {
    exigir(nome, args, 1, 2);
    const casas = args[1] ? comoInteiro(args[1], nome) : 0;
    if (casas < 0 || casas > 20) throw new ErroFormula(`${nome}: as casas decimais têm de estar entre 0 e 20.`);
    return num(arredondar(comoNumero(args[0], nome), casas, modo));
  };
}

const FUNCOES: Record<string, Funcao> = {
  ARRED: funcaoArredondar('ARRED', 'cima'),
  'ARRED.PAR': funcaoArredondar('ARRED.PAR', 'par'),
  TRUNCAR: funcaoArredondar('TRUNCAR', 'baixo'),
  ABS: (a) => (exigir('ABS', a, 1), num(absoluto(comoNumero(a[0], 'ABS')))),
  MIN: (a) => (exigir('MIN', a, 1, 50), num(a.map((x) => comoNumero(x, 'MIN')).reduce((m, x) => (comparar(x, m) < 0 ? x : m)))),
  MAX: (a) => (exigir('MAX', a, 1, 50), num(a.map((x) => comoNumero(x, 'MAX')).reduce((m, x) => (comparar(x, m) > 0 ? x : m)))),
  POTENCIA: (a) => (exigir('POTENCIA', a, 2), num(potencia(comoNumero(a[0], 'POTENCIA'), comoInteiro(a[1], 'POTENCIA')))),
  /** Prestação mensal constante: PRESTACAO(capital; taxa anual em %; meses). Sem arredondar: usa ARRED ou ARRED.PAR à volta. */
  PRESTACAO: (a) => {
    exigir('PRESTACAO', a, 3);
    const capital = comoNumero(a[0], 'PRESTACAO');
    const meses = comoInteiro(a[2], 'PRESTACAO');
    if (meses < 1) throw new ErroFormula('PRESTACAO: o número de meses tem de ser pelo menos 1.');
    const taxaMensal = dividir(comoNumero(a[1], 'PRESTACAO'), deInteiro(1200));
    if (taxaMensal.inteiro === 0n) return num(dividir(capital, deInteiro(meses)));
    const fator = subtrair(deInteiro(1), potencia(somar(deInteiro(1), taxaMensal), -meses));
    return num(dividir(multiplicar(capital, taxaMensal), fator));
  },
  SE: (a) => (exigir('SE', a, 2, 3), comoBooleano(a[0]) ? a[1] : (a[2] ?? txt(''))),
  /** Número como texto com casas fixas: TEXTO(86,4; 2) → "86,40" */
  TEXTO: (a) => (exigir('TEXTO', a, 1, 2), txt(a[1] ? formatar(comoNumero(a[0], 'TEXTO'), comoInteiro(a[1], 'TEXTO')) : comoTexto(a[0]))),
  /** Número com ponto decimal (para campos que não aceitam vírgula): PONTO(86,4) → "86.4" */
  PONTO: (a) => (exigir('PONTO', a, 1), txt(formatarComPonto(comoNumero(a[0], 'PONTO')))),
  MAIUSCULAS: (a) => (exigir('MAIUSCULAS', a, 1), txt(comoTexto(a[0]).toUpperCase())),
  MINUSCULAS: (a) => (exigir('MINUSCULAS', a, 1), txt(comoTexto(a[0]).toLowerCase())),
  COMPR: (a) => (exigir('COMPR', a, 1), num(deInteiro(comoTexto(a[0]).length))),
  ESQUERDA: (a) => (exigir('ESQUERDA', a, 2), txt(comoTexto(a[0]).slice(0, Math.max(0, comoInteiro(a[1], 'ESQUERDA'))))),
  DIREITA: (a) => {
    exigir('DIREITA', a, 2);
    const n = Math.max(0, comoInteiro(a[1], 'DIREITA'));
    return txt(n === 0 ? '' : comoTexto(a[0]).slice(-n));
  },
  // Geradores
  NIF: (a, ctx) => (exigir('NIF', a, 0), txt(gerarNif(ctx))),
  IBAN: (a, ctx) => (exigir('IBAN', a, 0), txt(gerarIban(ctx))),
  ALEATORIOENTRE: (a, ctx) => {
    exigir('ALEATORIOENTRE', a, 2);
    const minimo = comoInteiro(a[0], 'ALEATORIOENTRE');
    const maximo = comoInteiro(a[1], 'ALEATORIOENTRE');
    if (maximo < minimo) throw new ErroFormula('ALEATORIOENTRE: o máximo tem de ser maior ou igual ao mínimo.');
    return num(deInteiro(minimo + Math.floor(ctx.aleatorio() * (maximo - minimo + 1))));
  },
  /** MFA: código TOTP (app autenticadora) a partir da chave em base32. TOTP({ChaveMfa}) → "123456" */
  TOTP: (a, ctx) => {
    if (a.length < 1 || a.length > 2) throw new ErroFormula('TOTP precisa da chave (e, opcionalmente, do número de algarismos).');
    try {
      return txt(codigoTotp(comoTexto(a[0]), ctx.agora, a.length === 2 ? comoInteiro(a[1], 'TOTP') : 6));
    } catch (erro) {
      throw new ErroFormula(erro instanceof Error ? erro.message : String(erro));
    }
  },
  /** Email único por caso e execução: EMAIL("cliente"; "exemplo.pt") → qa+cliente.TC0001.run12@exemplo.pt */
  EMAIL: (a, ctx) => {
    exigir('EMAIL', a, 2);
    const limpo = (t: string): string => t.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    return txt(`qa+${limpo(comoTexto(a[0]))}.${limpo(ctx.teste)}.${limpo(ctx.run)}@${comoTexto(a[1]).trim()}`);
  },
};

/** Para a ajuda na interface. */
export const AJUDA_FORMULAS: Array<{ exemplo: string; descricao: string }> = [
  { exemplo: '"cliente_" & {TESTE} & "_" & {RUN}', descricao: 'Juntar textos com &. {TESTE} é o ID do caso e {RUN} o da execução.' },
  { exemplo: '{DATA:yyyyMMdd}   {HOJE+30:dd/MM/yyyy}', descricao: 'Data de hoje, ou daqui a N dias, no formato pedido.' },
  { exemplo: '{CONTADOR:empresa}', descricao: 'Número que aumenta 1 de cada vez e fica guardado entre execuções.' },
  { exemplo: '{ALEATORIO:6}', descricao: '6 algarismos ao acaso.' },
  { exemplo: 'ARRED({Valor} * {Comissao} / 100; 2)', descricao: 'Contas exatas. ARRED arredonda meio para cima.' },
  { exemplo: 'ARRED.PAR(PRESTACAO({Valor}; {Taxa}; {Prazo}); 2)', descricao: 'ARRED.PAR arredonda ao par, como o Round() do OutSystems. PRESTACAO(capital; taxa anual %; meses).' },
  { exemplo: 'TRUNCAR({Valor} / 100) * {Pontos}', descricao: 'TRUNCAR corta as casas decimais.' },
  { exemplo: 'SE({Valor} > 1000; "Alto"; "Baixo")', descricao: 'Condições com =, <>, <, >, <=, >=.' },
  { exemplo: 'TEXTO({Total}; 2)   PONTO({Total})', descricao: 'TEXTO fixa as casas decimais ("86,40"); PONTO usa ponto decimal ("86.4").' },
  { exemplo: 'NIF()   IBAN()   ALEATORIOENTRE(1; 100)', descricao: 'Geradores: NIF e IBAN de teste válidos, número entre mínimo e máximo.' },
  { exemplo: 'TOTP({ChaveMfa})', descricao: 'MFA: o código de 6 algarismos da app autenticadora, a partir da chave secreta (base32) da conta de teste.' },
  { exemplo: 'EMAIL("cliente"; "exemplo.pt")', descricao: 'Email único: qa+cliente.<caso>.<run>@exemplo.pt' },
  { exemplo: 'MAIUSCULAS  MINUSCULAS  ESQUERDA  DIREITA  COMPR  ABS  MIN  MAX  POTENCIA', descricao: 'Outras funções.' },
];

// ---------- Avaliação ----------
function calcular(tokens: Token[], ctx: ContextoFormula): Resultado {
  let posicao = 0;
  const ver = (): Token | undefined => tokens[posicao];
  const eSimbolo = (...valores: string[]): boolean => {
    const t = ver();
    return t?.tipo === 'simbolo' && valores.includes(t.valor);
  };
  const consumir = (valor: string): void => {
    if (!eSimbolo(valor)) throw new ErroFormula(`Esperava "${valor}" na fórmula.`);
    posicao += 1;
  };

  function comparacao(): Resultado {
    let esquerda = juncao();
    while (eSimbolo('=', '<>', '<', '>', '<=', '>=')) {
      const operador = (tokens[posicao++] as { valor: string }).valor;
      const direita = juncao();
      // Compara como números se os dois o forem; senão, como texto.
      const numeros = [esquerda, direita].map((r) => (r.t === 'n' ? r.v : r.t === 's' && /^[\s\d.,+\-]+$/.test(r.v) ? lerNumero(r.v) : null));
      const ordem =
        numeros[0] && numeros[1]
          ? comparar(numeros[0], numeros[1])
          : comoTexto(esquerda).localeCompare(comoTexto(direita), 'pt', { sensitivity: 'accent' });
      const resultado: Record<string, boolean> = { '=': ordem === 0, '<>': ordem !== 0, '<': ordem < 0, '>': ordem > 0, '<=': ordem <= 0, '>=': ordem >= 0 };
      esquerda = { t: 'b', v: resultado[operador] };
    }
    return esquerda;
  }
  function juncao(): Resultado {
    let esquerda = soma();
    while (eSimbolo('&')) {
      posicao += 1;
      esquerda = txt(comoTexto(esquerda) + comoTexto(soma()));
    }
    return esquerda;
  }
  function soma(): Resultado {
    let esquerda = produto();
    while (eSimbolo('+', '-')) {
      const operador = (tokens[posicao++] as { valor: string }).valor;
      const a = comoNumero(esquerda, `Conta com ${operador}`);
      const b = comoNumero(produto(), `Conta com ${operador}`);
      esquerda = num(operador === '+' ? somar(a, b) : subtrair(a, b));
    }
    return esquerda;
  }
  function produto(): Resultado {
    let esquerda = unario();
    while (eSimbolo('*', '/')) {
      const operador = (tokens[posicao++] as { valor: string }).valor;
      const a = comoNumero(esquerda, `Conta com ${operador}`);
      const b = comoNumero(unario(), `Conta com ${operador}`);
      try {
        esquerda = num(operador === '*' ? multiplicar(a, b) : dividir(a, b));
      } catch (erro) {
        throw new ErroFormula(erro instanceof Error ? erro.message : String(erro));
      }
    }
    return esquerda;
  }
  function unario(): Resultado {
    if (eSimbolo('-')) {
      posicao += 1;
      return num(simetrico(comoNumero(unario(), 'Sinal de menos')));
    }
    if (eSimbolo('+')) {
      posicao += 1;
      return unario();
    }
    return primario();
  }
  function primario(): Resultado {
    const t = ver();
    if (!t) throw new ErroFormula('A fórmula está incompleta.');
    posicao += 1;
    if (t.tipo === 'texto') return txt(t.valor);
    if (t.tipo === 'numero') return num(t.valor);
    if (t.tipo === 'marcador') return resolverMarcador(t.valor, ctx);
    if (t.tipo === 'nome') {
      const nome = semAcentos(t.valor);
      if (nome === 'VERDADEIRO') return { t: 'b', v: true };
      if (nome === 'FALSO') return { t: 'b', v: false };
      const funcao = FUNCOES[nome];
      if (!funcao) throw new ErroFormula(`Não conheço "${t.valor}". Os textos ficam entre aspas e as variáveis entre chavetas: {${t.valor}}.`);
      consumir('(');
      const args: Resultado[] = [];
      if (!eSimbolo(')')) {
        args.push(comparacao());
        while (eSimbolo(';')) {
          posicao += 1;
          args.push(comparacao());
        }
      }
      consumir(')');
      try {
        return funcao(args, ctx);
      } catch (erro) {
        if (erro instanceof ErroFormula) throw erro;
        throw new ErroFormula(`${nome}: ${erro instanceof Error ? erro.message : String(erro)}`);
      }
    }
    if (t.valor === '(') {
      const dentro = comparacao();
      consumir(')');
      return dentro;
    }
    throw new ErroFormula(`"${t.valor}" não devia estar aqui.`);
  }

  const resultado = comparacao();
  if (posicao < tokens.length) {
    const t = tokens[posicao];
    throw new ErroFormula(`Há texto a mais na fórmula, a partir de "${'valor' in t && typeof t.valor === 'string' ? t.valor : '...'}". Falta um & ou um ; ?`);
  }
  return resultado;
}

/** Calcula uma fórmula e devolve o resultado como texto. Dá ErroFormula com uma explicação simples. */
export function avaliarFormula(formula: string, ctx: ContextoFormula): string {
  const limpa = formula.trim().replace(/^=/, '');
  if (!limpa) return '';
  return comoTexto(calcular(separar(limpa), ctx));
}

/** Avalia uma condição ("só se..."), por exemplo `{Produto} = "CP12"`. Uma condição vazia é verdadeira. */
export function avaliarCondicao(formula: string, ctx: ContextoFormula): boolean {
  const limpa = formula.trim().replace(/^=/, '');
  if (!limpa) return true;
  return comoBooleano(calcular(separar(limpa), ctx));
}

/** Variáveis ({Nome}) usadas numa fórmula, sem contar com os marcadores (TESTE, DATA, ...). */
export function variaveisDaFormula(formula: string): string[] {
  const nomes: string[] = [];
  let tokens: Token[];
  try {
    tokens = separar(formula.trim().replace(/^=/, ''));
  } catch {
    return nomes;
  }
  for (const t of tokens) {
    if (t.tipo !== 'marcador') continue;
    const cabeca = t.valor.split(':')[0].trim().toUpperCase();
    if (['TESTE', 'RUN', 'DATA', 'CONTADOR', 'ALEATORIO'].includes(cabeca) || /^HOJE\s*([+-]\s*\d+)?$/.test(cabeca)) continue;
    if (!nomes.includes(t.valor)) nomes.push(t.valor);
  }
  return nomes;
}

// ---------- Textos com {variáveis} (endereços, cabeçalhos e corpos dos pedidos de API) ----------

/** {Nome}, {TESTE}, {DATA:yyyyMMdd}... O interior não pode ter aspas, chavetas nem mudanças de linha (para não apanhar JSON). */
const MARCADOR_NO_TEXTO = /\{([^{}"'\s][^{}"'\n]*)\}/g;
const E_MARCADOR = (conteudo: string): boolean => {
  const cabeca = conteudo.split(':')[0].trim().toUpperCase();
  return ['TESTE', 'RUN', 'DATA', 'CONTADOR', 'ALEATORIO'].includes(cabeca) || /^HOJE\s*([+-]\s*\d+)?$/.test(cabeca);
};

/**
 * Troca cada {variável} ou {marcador} de um texto pelo seu valor.
 * `transformar` permite proteger o valor (por exemplo, dentro de um JSON).
 */
export function preencherTexto(texto: string, ctx: ContextoFormula, transformar: (valor: string) => string = (v) => v): string {
  return texto.replace(MARCADOR_NO_TEXTO, (_tudo, conteudo: string) => transformar(comoTexto(resolverMarcador(conteudo.trim(), ctx))));
}

/** Variáveis usadas num texto com {variáveis}, sem contar com os marcadores. */
export function variaveisDoTexto(texto: string): string[] {
  const nomes: string[] = [];
  for (const [, conteudo] of texto.matchAll(MARCADOR_NO_TEXTO)) {
    const nome = conteudo.trim();
    if (!E_MARCADOR(nome) && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}

/**
 * Verifica se a fórmula está bem escrita, sem precisar dos dados de um caso
 * (as variáveis contam como "1"). Devolve a mensagem de erro, ou null se estiver bem.
 */
export function validarFormula(formula: string): string | null {
  try {
    avaliarFormula(formula, { ...contextoDeExemplo({}), variavel: () => '1' });
    return null;
  } catch (erro) {
    // Com valores inventados, as contas podem falhar (por exemplo, dividir por zero): isso não é erro de escrita.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const deEscrita =
      /Falta fechar|Carácter inesperado|Esperava "|incompleta|Não conheço|texto a mais|não devia estar aqui|precisa de .* argumento|contador precisa|\{ALEATORIO:n\}/;
    return deEscrita.test(mensagem) ? mensagem : null;
  }
}

/** Contexto para pré-visualizar uma fórmula sem gastar contadores. */
export function contextoDeExemplo(variaveis: Record<string, string>, contadores: Record<string, number> = {}): ContextoFormula {
  return {
    variavel: (nome) => variaveis[nome],
    teste: variaveis.TESTE ?? 'TC0001',
    run: variaveis.RUN ?? 'run1',
    agora: new Date(),
    contador: (nome) => (contadores[nome] ?? 0) + 1,
    aleatorio: Math.random,
  };
}
