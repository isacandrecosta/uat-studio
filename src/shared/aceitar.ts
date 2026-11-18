// "Aceitar os resultados como esperados": os valores lidos no ecrã numa execução passam a ser os valores
// esperados dos casos (nas colunas de onde vinham). É a forma rápida de criar a linha de base de um teste
// de regressão: grava-se, corre-se uma vez, confirma-se que o ecrã está certo e aceita-se.
import { comparar, lerNumero } from './decimal.js';
import type { ConjuntoCasos, EstadoRun } from './modelo.js';

export interface MudancaEsperado {
  chave: string;
  jornadaId: string;
  casoId: string;
  coluna: string;
  antes: string;
  depois: string;
}

/** Iguais como texto (sem espaços a mais) ou como número ("43,38" = "43.38"). */
function mesmoValor(a: string, b: string): boolean {
  const x = a.replace(/\s+/g, ' ').trim();
  const y = b.replace(/\s+/g, ' ').trim();
  if (x === y) return true;
  const nx = lerNumero(x);
  const ny = lerNumero(y);
  return Boolean(nx && ny && comparar(nx, ny) === 0);
}

/** As mudanças que "aceitar" faria nos casos (só onde o valor lido é diferente do que lá está). */
export function mudancasDosResultados(run: EstadoRun, conjuntos: ConjuntoCasos[], chaves?: string[]): MudancaEsperado[] {
  const mudancas: MudancaEsperado[] = [];
  for (const caso of run.casos) {
    if (chaves && !chaves.includes(caso.chave)) continue;
    const conjunto = conjuntos.find((c) => c.id === caso.jornadaId);
    const atual = conjunto?.casos.find((c) => c.id === caso.casoId);
    if (!atual) continue;
    for (const [coluna, depois] of Object.entries(caso.valoresLidos ?? {})) {
      const antes = atual.dados[coluna] ?? '';
      // Uma célula com fórmula (=...) calcula o esperado sozinha: não é trocada pelo valor lido.
      if (depois === '' || /^\s*=/.test(antes) || mesmoValor(antes, depois)) continue;
      mudancas.push({ chave: caso.chave, jornadaId: caso.jornadaId, casoId: caso.casoId, coluna, antes, depois });
    }
  }
  return mudancas;
}

/** Aplica as mudanças; devolve só os conjuntos alterados (para gravar). */
export function aplicarMudancas(conjuntos: ConjuntoCasos[], mudancas: MudancaEsperado[]): ConjuntoCasos[] {
  const alterados = new Map<string, ConjuntoCasos>();
  for (const m of mudancas) {
    const original = alterados.get(m.jornadaId) ?? conjuntos.find((c) => c.id === m.jornadaId);
    if (!original) continue;
    const conjunto = alterados.get(m.jornadaId) ?? structuredClone(original);
    const caso = conjunto.casos.find((c) => c.id === m.casoId);
    if (!caso) continue;
    caso.dados[m.coluna] = m.depois;
    if (!conjunto.colunas.includes(m.coluna)) conjunto.colunas.push(m.coluna);
    alterados.set(m.jornadaId, conjunto);
  }
  return [...alterados.values()];
}
