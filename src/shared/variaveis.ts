// Que variáveis um bloco ou uma jornada usam e produzem.
// Usado pela interface (para mostrar o que falta) e pelo executor (para verificar antes de correr).
// Nota: dentro de src/shared, os imports de código têm de acabar em ".js" (a interface corre no browser).
import { variaveisDaFormula, variaveisDoTexto } from './formulas.js';
import type { Bloco, Jornada, Valor, VariavelCalculada } from './modelo';

export interface VariaveisDoBloco {
  /** Variáveis que o bloco precisa de receber (por ordem de aparecimento). */
  usa: string[];
  /** Variáveis que o bloco guarda para os blocos seguintes. */
  produz: string[];
}

function juntar(lista: string[], nome: string): void {
  if (nome && !lista.includes(nome)) lista.push(nome);
}

/** Variáveis de que um valor precisa (uma coluna, ou as variáveis dentro de uma fórmula). */
export function variaveisDoValor(valor: Valor | undefined): string[] {
  if (!valor) return [];
  if (valor.tipo === 'variavel') return [valor.nome];
  if (valor.tipo === 'formula') return variaveisDaFormula(valor.expressao);
  if (valor.tipo === 'gerador') return variaveisDaFormula(valor.gerador);
  return [];
}

export function variaveisDoBloco(bloco: Bloco): VariaveisDoBloco {
  const usa: string[] = [];
  const produz: string[] = [];
  for (const passo of bloco.passos) {
    // Uma variável guardada num passo anterior do mesmo bloco não precisa de vir de fora.
    const doPasso = [...variaveisDoValor(passo.alvo?.linha?.valor), ...variaveisDoValor(passo.valor), ...variaveisDaFormula(passo.condicao ?? '')];
    for (const nome of doPasso) if (!produz.includes(nome)) juntar(usa, nome);
    if (passo.acao === 'guardar' && passo.variavel) juntar(produz, passo.variavel);
  }
  // Blocos de API: as {variáveis} do endereço, parâmetros, cabeçalhos, corpo e valores esperados.
  const pedido = bloco.pedido;
  if (pedido) {
    const textos = [
      pedido.url,
      ...pedido.parametros.flatMap((p) => [p.nome, p.valor]),
      ...pedido.cabecalhos.map((c) => c.valor),
      pedido.corpo,
      ...pedido.verificacoes.map((v) => v.esperado),
    ];
    for (const texto of textos) for (const nome of variaveisDoTexto(texto ?? '')) juntar(usa, nome);
    for (const guardar of pedido.guardar) juntar(produz, guardar.variavel);
  }
  // Passo manual: as {variáveis} da instrução.
  for (const nome of variaveisDoTexto(bloco.manual?.instrucao ?? '')) juntar(usa, nome);
  return { usa, produz };
}

export interface VariaveisDaJornada {
  /** Colunas que os casos têm de ter. */
  necessarias: string[];
  /** Variáveis guardadas ao longo da jornada. */
  produzidas: string[];
  /** Variáveis calculadas por fórmula (do ecrã Dados de teste) que a jornada usa. */
  calculadas: string[];
  /** Ids de blocos usados na jornada que já não existem. */
  blocosEmFalta: string[];
}

export function variaveisDaJornada(jornada: Jornada, blocos: Bloco[], calculadas: VariavelCalculada[] = []): VariaveisDaJornada {
  const porId = new Map(blocos.map((b) => [b.id, b]));
  const formulas = new Map(calculadas.map((v) => [v.nome, v.formula]));
  const necessarias: string[] = [];
  const produzidas: string[] = [];
  const usadasCalculadas: string[] = [];
  const blocosEmFalta: string[] = [];

  /** Regista que a jornada precisa de `nome`: de uma coluna, ou do que a sua fórmula precisar. */
  const precisar = (nome: string, emCurso: string[] = []): void => {
    if (produzidas.includes(nome)) return;
    const formula = formulas.get(nome);
    if (formula === undefined || emCurso.includes(nome)) {
      juntar(necessarias, nome);
      return;
    }
    juntar(usadasCalculadas, nome);
    for (const dentro of variaveisDaFormula(formula)) precisar(dentro, [...emCurso, nome]);
  };

  for (const item of jornada.blocos) {
    const bloco = porId.get(item.blocoId);
    if (!bloco) {
      juntar(blocosEmFalta, item.blocoId);
      continue;
    }
    const { usa, produz } = variaveisDoBloco(bloco);
    for (const nome of variaveisDaFormula(item.condicao ?? '')) precisar(nome);
    for (const nome of usa) {
      const troca: Valor | undefined = item.parametros?.[nome];
      if (!troca) precisar(nome);
      else for (const origem of variaveisDoValor(troca)) precisar(origem);
    }
    for (const nome of produz) juntar(produzidas, nome);
  }
  return { necessarias, produzidas, calculadas: usadasCalculadas, blocosEmFalta };
}
