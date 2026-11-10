// Que variáveis um bloco ou uma jornada usam e produzem.
// Usado pela interface (para mostrar o que falta) e pelo executor (para verificar antes de correr).
import type { Bloco, Jornada, Valor } from './modelo';

export interface VariaveisDoBloco {
  /** Variáveis que o bloco precisa de receber (por ordem de aparecimento). */
  usa: string[];
  /** Variáveis que o bloco guarda para os blocos seguintes. */
  produz: string[];
}

function juntar(lista: string[], nome: string): void {
  if (nome && !lista.includes(nome)) lista.push(nome);
}

export function variaveisDoBloco(bloco: Bloco): VariaveisDoBloco {
  const usa: string[] = [];
  const produz: string[] = [];
  for (const passo of bloco.passos) {
    // Uma variável guardada num passo anterior do mesmo bloco não precisa de vir de fora.
    if (passo.valor?.tipo === 'variavel' && !produz.includes(passo.valor.nome)) juntar(usa, passo.valor.nome);
    if (passo.acao === 'guardar' && passo.variavel) juntar(produz, passo.variavel);
  }
  return { usa, produz };
}

export interface VariaveisDaJornada {
  /** Colunas que os casos têm de ter. */
  necessarias: string[];
  /** Variáveis guardadas ao longo da jornada. */
  produzidas: string[];
  /** Ids de blocos usados na jornada que já não existem. */
  blocosEmFalta: string[];
}

export function variaveisDaJornada(jornada: Jornada, blocos: Bloco[]): VariaveisDaJornada {
  const porId = new Map(blocos.map((b) => [b.id, b]));
  const necessarias: string[] = [];
  const produzidas: string[] = [];
  const blocosEmFalta: string[] = [];
  for (const item of jornada.blocos) {
    const bloco = porId.get(item.blocoId);
    if (!bloco) {
      juntar(blocosEmFalta, item.blocoId);
      continue;
    }
    const { usa, produz } = variaveisDoBloco(bloco);
    for (const nome of usa) {
      const troca: Valor | undefined = item.parametros?.[nome];
      if (troca?.tipo === 'fixo') continue;
      const origem = troca?.tipo === 'variavel' ? troca.nome : nome;
      if (!produzidas.includes(origem)) juntar(necessarias, origem);
    }
    for (const nome of produz) juntar(produzidas, nome);
  }
  return { necessarias, produzidas, blocosEmFalta };
}
