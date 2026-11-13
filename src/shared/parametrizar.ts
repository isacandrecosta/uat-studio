// "Transformar valores fixos em colunas": depois de gravar um bloco "a direito" (com valores fixos), escolher
// quais valores passam a vir de uma coluna dos casos. Cada passo escolhido fica com {Coluna}; nas jornadas
// que usam o bloco, a coluna é acrescentada aos casos com o valor que estava gravado (os casos que já
// existiam continuam a fazer o mesmo). Depois é exportar para Excel e multiplicar as linhas.
import type { Bloco, ConjuntoCasos, Jornada } from './modelo.js';

export interface ValorFixo {
  passoId: string;
  descricao: string;
  acao: string;
  valor: string;
  /** Nome de coluna sugerido (a partir do nome do campo). */
  coluna: string;
}

/** Ações cujo valor faz sentido vir dos dados do caso. */
const ACOES_COM_DADOS = ['escrever', 'escolher', 'marcar', 'verificar', 'carregar'];

/** "Campo \"Nome da empresa\"" → "NomeDaEmpresa"; numa verificação: "NomeDaEmpresaEsperado". */
export function nomeDeColuna(descricao: string, acao: string): string {
  const limpo = descricao
    .replace(/^(campo|lista|opção|opcao|botão|botao|elemento|verificar|escrever|escolher|marcar)\s+/i, '')
    // Prefixos técnicos dos identificadores (resEstado, inpValor, ddVariante, cc_resTotal): ficam de fora.
    .replace(/(^|[\s"“”«»'])(?:cc_)?(?:res|inp|dds|ddt|dd|txt|lbl|chk|swt|rdg|rdb|sld|dpr|dp|tp|mp|bg|rat|btn|lnk|tbl|ifr|upl|bo|fo)(?=[A-Z])/g, '$1')
    .replace(/["“”«»']/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();
  const base = limpo
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  const nome = /^[A-Za-z]/.test(base) ? base : `Valor${base}`;
  return acao === 'verificar' && !/Esperad[oa]$/.test(nome) ? `${nome}Esperado` : nome;
}

/** Os valores fixos de um bloco que podem passar a coluna (os segredos ficam de fora). */
export function valoresFixos(bloco: Bloco): ValorFixo[] {
  const usados = new Set<string>();
  const lista: ValorFixo[] = [];
  for (const passo of bloco.passos) {
    if (!ACOES_COM_DADOS.includes(passo.acao) || passo.secreto) continue;
    if (passo.valor?.tipo !== 'fixo') continue;
    if (passo.acao === 'verificar' && passo.verificacao?.tipo === 'visivel') continue;
    let coluna = nomeDeColuna(passo.alvo?.descricao || passo.descricao, passo.acao);
    for (let n = 2; usados.has(coluna); n++) coluna = `${coluna.replace(/\d+$/, '')}${n}`;
    usados.add(coluna);
    lista.push({ passoId: passo.id, descricao: passo.descricao, acao: passo.acao, valor: passo.valor.valor, coluna });
  }
  return lista;
}

export interface Escolha {
  passoId: string;
  coluna: string;
}

export interface ResultadoParametrizar {
  bloco: Bloco;
  /** Conjuntos de casos alterados (um por jornada que usa o bloco). */
  conjuntos: ConjuntoCasos[];
  colunas: string[];
}

/** Nomes de coluna válidos: letras, números e _, a começar por letra. */
export function colunaValida(nome: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(nome);
}

/**
 * Aplica as escolhas: os passos passam a usar {Coluna} e os casos das jornadas que usam o bloco ganham a
 * coluna com o valor gravado. Uma jornada sem casos ganha um caso com esses valores.
 */
export function parametrizar(bloco: Bloco, jornadas: Jornada[], conjuntos: ConjuntoCasos[], escolhas: Escolha[]): ResultadoParametrizar {
  const novoBloco: Bloco = structuredClone(bloco);
  const colunas: string[] = [];
  const valores: Record<string, string> = {};
  for (const e of escolhas) {
    const coluna = e.coluna.trim();
    if (!coluna) continue;
    if (!colunaValida(coluna)) throw new Error(`O nome de coluna "${coluna}" não serve: use letras e números, sem espaços (por exemplo NomeEmpresa).`);
    const passo = novoBloco.passos.find((p) => p.id === e.passoId);
    if (!passo || passo.valor?.tipo !== 'fixo') continue;
    valores[coluna] = passo.valor.valor;
    passo.valor = { tipo: 'variavel', nome: coluna };
    if (!colunas.includes(coluna)) colunas.push(coluna);
  }
  const alterados: ConjuntoCasos[] = [];
  if (colunas.length > 0) {
    for (const jornada of jornadas.filter((j) => j.blocos.some((b) => b.blocoId === bloco.id))) {
      const atual = conjuntos.find((c) => c.id === jornada.id) ?? { id: jornada.id, colunas: [], casos: [] };
      const conjunto: ConjuntoCasos = structuredClone(atual);
      for (const coluna of colunas) if (!conjunto.colunas.includes(coluna)) conjunto.colunas.push(coluna);
      if (conjunto.casos.length === 0) conjunto.casos.push({ id: 'TC0001', nome: 'Valores da gravação', etiquetas: [], dados: {} });
      for (const caso of conjunto.casos) {
        for (const coluna of colunas) if (caso.dados[coluna] === undefined || caso.dados[coluna] === '') caso.dados[coluna] = valores[coluna];
      }
      alterados.push(conjunto);
    }
  }
  return { bloco: novoBloco, conjuntos: alterados, colunas };
}
