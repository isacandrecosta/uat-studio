// "Regravar este elemento": repete os passos do bloco que vêm antes do passo a regravar
// (com os dados do caso que falhou), para o testador chegar ao ecrã certo e apontar para o elemento.
import { Page } from 'playwright-core';
import { avaliarCondicao, avaliarFormula, contextoDeExemplo, type ContextoFormula } from '../../shared/formulas';
import type { Bloco, CaixaTestes, Valor } from '../../shared/modelo';
import { construirUrl, executarAcao, lerElemento } from '../motor/acoes';

/** Contexto das fórmulas durante a repetição (sem gastar contadores). */
/** Caixa de email de testes do projeto que está a ser gravado ({EMAIL:papel} nas fórmulas). */
let caixaDoProjeto: CaixaTestes | undefined;
export function definirCaixaDoProjeto(caixa: CaixaTestes | undefined): void {
  caixaDoProjeto = caixa;
}

export function contextoDosValores(valores: Record<string, string>): ContextoFormula {
  // As células com "=" (fórmulas dos casos) são calculadas como na execução.
  return contextoDeExemplo({ TESTE: 'REGRAVAR', RUN: 'regravar', ...valores }, {}, caixaDoProjeto);
}

/** O valor de um passo com os dados do caso. Dá erro se faltar uma variável. */
export function resolverValor(valor: Valor | undefined, valores: Record<string, string>): string {
  if (!valor) return '';
  switch (valor.tipo) {
    case 'fixo':
      return valor.valor;
    case 'variavel': {
      const v = contextoDosValores(valores).variavel(valor.nome);
      if (v === undefined) throw new Error(`falta o valor de {${valor.nome}}`);
      return v;
    }
    case 'formula':
      return avaliarFormula(valor.expressao, contextoDosValores(valores));
    case 'gerador':
      return avaliarFormula(valor.gerador, contextoDosValores(valores));
  }
}

/**
 * Repete os passos do bloco antes da posição `ate`. Devolve null se chegou ao fim,
 * ou a explicação do passo onde parou (o testador continua à mão a partir daí).
 */
export async function repetirPassosAte(pagina: Page, bloco: Bloco, ate: number, valores: Record<string, string>, urlBase: string): Promise<string | null> {
  for (const passo of bloco.passos.slice(0, ate)) {
    try {
      if (passo.condicao?.trim() && !avaliarCondicao(passo.condicao, contextoDosValores(valores))) continue;
      const linha = passo.alvo?.linha ? resolverValor(passo.alvo.linha.valor, valores) : undefined;
      switch (passo.acao) {
        case 'navegar':
          await pagina.goto(construirUrl(urlBase, resolverValor(passo.valor, valores)), { waitUntil: 'domcontentloaded', timeout: 90_000 });
          break;
        case 'escrever':
        case 'escolher':
        case 'marcar':
        case 'clicar':
          await executarAcao(pagina, passo, resolverValor(passo.valor, valores), { limiteMs: 15_000, linha });
          break;
        case 'guardar':
          if (passo.variavel) valores[passo.variavel] = (await lerElemento(pagina, passo, { limiteMs: 15_000, linha })).texto;
          break;
        case 'verificar':
        case 'esperar':
          // Só serve para esperar que o ecrã chegue lá; o valor não é comparado.
          if (passo.alvo) await lerElemento(pagina, passo, { limiteMs: 15_000, linha }).catch(() => undefined);
          break;
      }
      await pagina.waitForLoadState('domcontentloaded').catch(() => undefined);
    } catch (erro) {
      const texto = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
      return `A repetição parou no passo "${passo.descricao}" (${texto}). Continua à mão até ao ecrã certo.`;
    }
  }
  return null;
}
