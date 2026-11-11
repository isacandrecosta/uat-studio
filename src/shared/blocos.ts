// Ajudas sobre blocos usadas pelos dois lados: "onde é usado" e reparar localizadores.
import type { Bloco, ConjuntoCasos, Epico, Jornada, Localizador, SugestaoReparo } from './modelo';

/** Uma jornada onde o bloco aparece. */
export interface UsoDoBloco {
  jornadaId: string;
  jornadaNome: string;
  epicoNome: string;
  /** Posições do bloco no percurso (1 = primeiro). Um bloco pode aparecer mais do que uma vez. */
  posicoes: number[];
  /** Em alguma das posições o bloco só corre "se..." */
  condicional: boolean;
  /** Em alguma das posições o bloco é de limpeza ("corre sempre"). */
  limpeza: boolean;
  /** Quantos casos tem a jornada (quantas vezes o bloco corre numa execução completa). */
  casos: number;
}

/** "Onde é usado": as jornadas que usam o bloco, por ordem de épico e nome. */
export function ondeEUsado(blocoId: string, jornadas: Jornada[], epicos: Epico[] = [], conjuntos: ConjuntoCasos[] = []): UsoDoBloco[] {
  const nomeEpico = new Map(epicos.map((e) => [e.id, e.nome]));
  const usos: UsoDoBloco[] = [];
  for (const jornada of jornadas) {
    const aqui = jornada.blocos.map((b, i) => ({ b, i })).filter(({ b }) => b.blocoId === blocoId);
    if (aqui.length === 0) continue;
    usos.push({
      jornadaId: jornada.id,
      jornadaNome: jornada.nome,
      epicoNome: nomeEpico.get(jornada.epicoId) ?? '',
      posicoes: aqui.map(({ i }) => i + 1),
      condicional: aqui.some(({ b }) => Boolean(b.condicao?.trim())),
      limpeza: aqui.some(({ b }) => Boolean(b.sempre)),
      casos: conjuntos.find((c) => c.id === jornada.id)?.casos.length ?? 0,
    });
  }
  return usos.sort((a, b) => a.epicoNome.localeCompare(b.epicoNome, 'pt') || a.jornadaNome.localeCompare(b.jornadaNome, 'pt'));
}

/** Texto curto para logs: testid "inpValor". */
export function descreverLocalizador(loc: Localizador): string {
  const nomes: Record<Localizador['tipo'], string> = {
    testid: 'data-testid',
    etiqueta: 'etiqueta',
    role: 'tipo e nome',
    placeholder: 'texto de ajuda',
    texto: 'texto',
    id: 'id',
    css: 'posição na página',
  };
  return `${nomes[loc.tipo]} "${loc.tipo === 'role' ? `${loc.valor}: ${loc.nome ?? ''}` : loc.valor}"`;
}

export function mesmoLocalizador(a: Localizador, b: Localizador): boolean {
  return a.tipo === b.tipo && a.valor === b.valor && (a.nome ?? '') === (b.nome ?? '');
}

export type EstadoReparo = 'reparado' | 'ja-reparado' | 'nao-encontrado';

/** O reparo já está feito? (o localizador que funcionou já é o preferido) */
export function estadoDoReparo(bloco: Bloco | undefined, s: Pick<SugestaoReparo, 'passoId' | 'usado'>): 'por-reparar' | 'ja-reparado' | 'nao-encontrado' {
  const passo = bloco?.passos.find((p) => p.id === s.passoId);
  const lista = passo?.alvo?.localizadores ?? [];
  if (!lista.some((l) => mesmoLocalizador(l, s.usado))) return 'nao-encontrado';
  return mesmoLocalizador(lista[0], s.usado) ? 'ja-reparado' : 'por-reparar';
}

/**
 * Reparar com um clique: o localizador que funcionou passa a ser o preferido e o que falhou
 * vai para o fim (fica como último recurso, caso o ecrã volte ao que era). Altera o bloco.
 */
export function repararLocalizador(bloco: Bloco, s: Pick<SugestaoReparo, 'passoId' | 'usado' | 'falhou'>): EstadoReparo {
  const estado = estadoDoReparo(bloco, s);
  if (estado !== 'por-reparar') return estado;
  const alvo = bloco.passos.find((p) => p.id === s.passoId)?.alvo;
  if (!alvo) return 'nao-encontrado';
  const usado = alvo.localizadores.find((l) => mesmoLocalizador(l, s.usado)) as Localizador;
  const falhou = alvo.localizadores.find((l) => mesmoLocalizador(l, s.falhou));
  const resto = alvo.localizadores.filter((l) => l !== usado && l !== falhou);
  alvo.localizadores = [usado, ...resto, ...(falhou ? [falhou] : [])];
  return 'reparado';
}

/** Junta as sugestões de vários casos: uma por passo e localizador, com o número de casos onde aconteceu. */
export function juntarReparos(listas: Array<SugestaoReparo[] | undefined>): Array<SugestaoReparo & { casos: number }> {
  const porChave = new Map<string, SugestaoReparo & { casos: number }>();
  for (const lista of listas) {
    for (const s of lista ?? []) {
      const chave = JSON.stringify([s.blocoId, s.passoId, s.usado.tipo, s.usado.valor, s.usado.nome ?? '']);
      const existente = porChave.get(chave);
      if (existente) existente.casos++;
      else porChave.set(chave, { ...s, casos: 1 });
    }
  }
  return [...porChave.values()];
}
