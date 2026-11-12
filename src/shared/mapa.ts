// Mapa de execução: "fotografia" das jornadas no início da execução e a cor de cada nó do grafo.
// Sem Electron: usado pelo executor (fotografia) e pela interface (cores e contagens).
import type { Aplicacao, Bloco, EstadoBlocoCaso, EstadoCaso, Epico, Jornada, JornadaDoRun, ResultadoCaso } from './modelo';

/** As jornadas como estão agora, com o que o mapa precisa (nomes, aplicação e cor de cada bloco). */
export function fotografarJornadas(jornadas: Jornada[], epicos: Epico[], blocos: Bloco[], aplicacoes: Aplicacao[]): JornadaDoRun[] {
  const epicoPorId = new Map(epicos.map((e) => [e.id, e]));
  const blocoPorId = new Map(blocos.map((b) => [b.id, b]));
  const aplicacaoPorId = new Map(aplicacoes.map((a) => [a.id, a]));
  return jornadas.map((j) => ({
    id: j.id,
    nome: j.nome,
    epicoId: j.epicoId,
    epicoNome: epicoPorId.get(j.epicoId)?.nome ?? j.epicoId,
    ...(j.requisitoId?.trim() ? { requisitoId: j.requisitoId.trim() } : {}),
    blocos: j.blocos.map((item) => {
      const bloco = blocoPorId.get(item.blocoId);
      const aplicacao = bloco?.aplicacaoId ? aplicacaoPorId.get(bloco.aplicacaoId) : undefined;
      return {
        nome: bloco?.nome ?? `${item.blocoId} (apagado)`,
        tipo: bloco?.tipo ?? 'UI',
        ...(aplicacao ? { aplicacaoNome: aplicacao.nome, cor: aplicacao.cor } : {}),
        ...(item.condicao?.trim() ? { condicional: true } : {}),
        ...(item.sempre ? { limpeza: true } : {}),
      };
    }),
  }));
}

/** Cor de um nó: os estados dos blocos, mais "parcial" (já há resultados bons, mas ainda falta correr). */
export type EstadoNo = EstadoBlocoCaso | 'parcial';

/** O estado de um caso visto como o de um bloco (para juntar tudo na mesma escala). */
export function estadoDoCasoNoMapa(estado: EstadoCaso): EstadoBlocoCaso {
  switch (estado) {
    case 'OK':
      return 'ok';
    case 'KO':
      return 'ko';
    case 'ERRO':
      return 'erro';
    case 'a-correr':
    case 'por-correr':
      return estado;
    default:
      return 'nao-corrido';
  }
}

/**
 * Junta vários estados num só, pela gravidade: a correr > erro > KO > (OK, ou parcial se ainda falta)
 * > não corrido > ignorado > por correr.
 */
export function juntarEstados(estados: EstadoBlocoCaso[]): EstadoNo {
  const tem = (e: EstadoBlocoCaso): boolean => estados.includes(e);
  if (tem('a-correr')) return 'a-correr';
  if (tem('erro')) return 'erro';
  if (tem('ko')) return 'ko';
  if (tem('ok')) return tem('por-correr') ? 'parcial' : 'ok';
  if (tem('nao-corrido')) return 'nao-corrido';
  if (estados.length > 0 && estados.every((e) => e === 'ignorado')) return 'ignorado';
  return 'por-correr';
}

export type Contagem = Partial<Record<EstadoBlocoCaso, number>>;

export function contar(estados: EstadoBlocoCaso[]): Contagem {
  const c: Contagem = {};
  for (const e of estados) c[e] = (c[e] ?? 0) + 1;
  return c;
}

/** Estado de um bloco (pela posição) num caso. Os casos de execuções antigas não têm `blocos`: usa-se o do caso. */
export function estadoDoBlocoNoCaso(caso: ResultadoCaso, posicao: number): EstadoBlocoCaso {
  return caso.blocos?.[posicao] ?? estadoDoCasoNoMapa(caso.estado);
}

/** Texto curto para as contagens: "3 OK · 1 KO · 2 por correr". */
export function resumoContagem(c: Contagem): string {
  const nomes: Array<[EstadoBlocoCaso, string]> = [
    ['a-correr', 'a correr'],
    ['ok', '✓'],
    ['ko', '✗'],
    ['erro', '!'],
    ['ignorado', 'saltado (só se)'],
    ['nao-corrido', 'não corrido'],
    ['por-correr', 'por correr'],
  ];
  return nomes
    .filter(([e]) => (c[e] ?? 0) > 0)
    // Os resultados levam o símbolo antes do número (✓ 2 · ✗ 1); os outros estados, o nome depois.
    .map(([e, n]) => (e === 'ok' || e === 'ko' || e === 'erro' ? `${n} ${c[e]}` : `${c[e]} ${n}`))
    .join(' · ');
}
