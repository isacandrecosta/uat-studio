// Matriz de cobertura (variantes × jornadas, com o estado da última execução de cada caso)
// e comparação de uma execução com as anteriores (o que passou de OK para KO, e o contrário).
import type { ConjuntoCasos, EstadoCaso, EstadoRun, Jornada } from './modelo';

/** Estados que contam como resultado (um caso parado ou saltado não diz nada sobre a aplicação). */
const FINAIS: EstadoCaso[] = ['OK', 'KO', 'ERRO'];

export interface UltimoResultado {
  estado: 'OK' | 'KO' | 'ERRO';
  runId: string;
  /** Pasta da execução (para abrir). */
  pasta?: string;
  inicio: string;
}

/** O último resultado de cada caso (`idDaJornada/idDoCaso`), procurando nas execuções da mais recente para a mais antiga. */
export function ultimosResultados(historico: EstadoRun[]): Map<string, UltimoResultado> {
  const ordenado = [...historico].sort((a, b) => b.inicio.localeCompare(a.inicio));
  const ultimos = new Map<string, UltimoResultado>();
  for (const run of ordenado) {
    for (const caso of run.casos) {
      if (ultimos.has(caso.chave) || !FINAIS.includes(caso.estado)) continue;
      ultimos.set(caso.chave, { estado: caso.estado as UltimoResultado['estado'], runId: run.id, pasta: run.pasta, inicio: run.inicio });
    }
  }
  return ultimos;
}

/** Como agrupar os casos nas linhas da matriz: pelo ID, por uma coluna dos dados (por exemplo "Variante") ou pelas etiquetas. */
export type Agrupamento = { tipo: 'caso' } | { tipo: 'coluna'; coluna: string } | { tipo: 'etiqueta' };

export type EstadoCelula = 'OK' | 'KO' | 'ERRO' | 'nunca' | 'vazio';

export interface CelulaCobertura {
  estado: EstadoCelula;
  /** Casos desta variante nesta jornada, com o último resultado de cada um. */
  casos: Array<{ chave: string; casoId: string; ultimo?: UltimoResultado }>;
}

export interface MatrizCobertura {
  jornadas: Array<{ id: string; nome: string }>;
  linhas: Array<{ variante: string; celulas: CelulaCobertura[] }>;
  totais: Record<EstadoCelula, number>;
}

/** Junta os casos de uma célula: ERRO > KO > nunca corrido > OK. */
function estadoDaCelula(casos: CelulaCobertura['casos']): EstadoCelula {
  if (casos.length === 0) return 'vazio';
  const estados = casos.map((c) => c.ultimo?.estado ?? 'nunca');
  if (estados.includes('ERRO')) return 'ERRO';
  if (estados.includes('KO')) return 'KO';
  if (estados.includes('nunca')) return 'nunca';
  return 'OK';
}

export function matrizCobertura(jornadas: Jornada[], conjuntos: ConjuntoCasos[], ultimos: Map<string, UltimoResultado>, agrupar: Agrupamento): MatrizCobertura {
  const comCasos = jornadas.filter((j) => (conjuntos.find((c) => c.id === j.id)?.casos.length ?? 0) > 0);
  const porVariante = new Map<string, Map<string, CelulaCobertura['casos']>>();
  for (const jornada of comCasos) {
    for (const caso of conjuntos.find((c) => c.id === jornada.id)?.casos ?? []) {
      const variantes =
        agrupar.tipo === 'caso'
          ? [caso.id]
          : agrupar.tipo === 'coluna'
            ? [caso.dados[agrupar.coluna]?.trim() || '(sem valor)']
            : caso.etiquetas.length > 0
              ? caso.etiquetas
              : ['(sem etiqueta)'];
      const chave = `${jornada.id}/${caso.id}`;
      for (const variante of variantes) {
        const linha = porVariante.get(variante) ?? new Map<string, CelulaCobertura['casos']>();
        const lista = linha.get(jornada.id) ?? [];
        lista.push({ chave, casoId: caso.id, ultimo: ultimos.get(chave) });
        linha.set(jornada.id, lista);
        porVariante.set(variante, linha);
      }
    }
  }
  const totais: Record<EstadoCelula, number> = { OK: 0, KO: 0, ERRO: 0, nunca: 0, vazio: 0 };
  const linhas = [...porVariante.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt', { numeric: true }))
    .map(([variante, linha]) => ({
      variante,
      celulas: comCasos.map((j) => {
        const casos = linha.get(j.id) ?? [];
        const estado = estadoDaCelula(casos);
        totais[estado]++;
        return { estado, casos };
      }),
    }));
  return { jornadas: comCasos.map((j) => ({ id: j.id, nome: j.nome })), linhas, totais };
}

export type Mudanca = 'piorou' | 'melhorou' | 'mudou' | 'igual' | 'novo';

export interface ComparacaoCaso {
  chave: string;
  jornadaNome: string;
  casoId: string;
  agora: EstadoCaso;
  antes?: UltimoResultado;
  mudanca: Mudanca;
}

/**
 * Compara cada caso de uma execução com o último resultado do mesmo caso nas execuções anteriores.
 * piorou: OK → KO/ERRO; melhorou: KO/ERRO → OK; mudou: KO ↔ ERRO; novo: sem resultado anterior.
 */
export function compararComAnterior(run: EstadoRun, historico: EstadoRun[]): ComparacaoCaso[] {
  const anteriores = ultimosResultados(historico.filter((r) => r.inicio < run.inicio && r.pasta !== run.pasta));
  return run.casos
    .filter((c) => FINAIS.includes(c.estado))
    .map((c) => {
      const antes = anteriores.get(c.chave);
      let mudanca: Mudanca = 'novo';
      if (antes) {
        if (antes.estado === c.estado) mudanca = 'igual';
        else if (antes.estado === 'OK') mudanca = 'piorou';
        else if (c.estado === 'OK') mudanca = 'melhorou';
        else mudanca = 'mudou';
      }
      return { chave: c.chave, jornadaNome: c.jornadaNome, casoId: c.casoId, agora: c.estado, ...(antes ? { antes } : {}), mudanca };
    });
}
