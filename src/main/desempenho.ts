// Desempenho: quanto do PC a ferramenta está a usar e quantos casos em paralelo são seguros.
// Só lê o que o Node já sabe sobre o PC (processador e memória do Windows); não executa nenhum
// programa do sistema. A memória dos browsers Edge dos testes entra na memória usada do PC.
import * as os from 'node:os';

/** Memória que cada caso em paralelo (um browser Edge) costuma gastar, medida neste projeto. */
export const MB_POR_WORKER = 250;
/** Memória que fica sempre livre para o Windows e para os outros programas. */
export const RESERVA_MB = 1024;
const OPCOES_PARALELO = [1, 2, 4, 8];

export interface LeituraSistema {
  /** Processador do PC inteiro, em % (0 a 100). */
  cpuPct: number;
  memTotalMB: number;
  memLivreMB: number;
  nucleos: number;
  modelo: string;
}

/** Mede o processador pela diferença entre duas leituras dos tempos dos núcleos. */
export class MedidorCpu {
  private anterior = this.tempos();

  private tempos(): { ocupado: number; total: number } {
    let ocupado = 0;
    let total = 0;
    for (const c of os.cpus()) {
      const t = c.times;
      const soma = t.user + t.nice + t.sys + t.idle + t.irq;
      total += soma;
      ocupado += soma - t.idle;
    }
    return { ocupado, total };
  }

  /** % de processador usado desde a última leitura. */
  amostrar(): number {
    const agora = this.tempos();
    const total = agora.total - this.anterior.total;
    const ocupado = agora.ocupado - this.anterior.ocupado;
    this.anterior = agora;
    return total > 0 ? Math.max(0, Math.min(100, (100 * ocupado) / total)) : 0;
  }
}

const medidorGeral = new MedidorCpu();

export function leituraSistema(): LeituraSistema {
  const cpus = os.cpus();
  return {
    cpuPct: Math.round(medidorGeral.amostrar()),
    memTotalMB: Math.round(os.totalmem() / 1048576),
    memLivreMB: Math.round(os.freemem() / 1048576),
    nucleos: cpus.length,
    modelo: (cpus[0]?.model ?? '').trim(),
  };
}

export interface SugestaoParalelo {
  /** O maior número de casos em paralelo (1, 2, 4 ou 8) que cabe na memória livre. */
  seguro: number;
  memLivreMB: number;
  /** O pedido passa do que é seguro neste momento. */
  excede: boolean;
}

/** Quantos casos em paralelo cabem na memória livre, deixando sempre uma reserva para o Windows. */
export function sugerirParalelo(pedido: number, memLivreMB: number): SugestaoParalelo {
  const cabem = Math.floor((memLivreMB - RESERVA_MB) / MB_POR_WORKER);
  const seguro = OPCOES_PARALELO.filter((n) => n <= cabem).pop() ?? 1;
  return { seguro, memLivreMB, excede: pedido > seguro };
}

export interface ResumoDesempenho {
  /** Menor memória livre do PC durante a execução (MB). */
  memLivreMinMB: number;
  /** Maior % de memória do PC em uso durante a execução. */
  memUsadaMaxPct: number;
  cpuMedioPct: number;
  cpuMaxPct: number;
  /** Duração média de um caso que chegou ao fim ou falhou (ms). */
  duracaoMediaCasoMs?: number;
}

/** Junta amostras (memória livre e processador) num resumo. */
export function resumir(amostras: Array<{ memLivreMB: number; cpuPct: number }>, memTotalMB: number): Omit<ResumoDesempenho, 'duracaoMediaCasoMs'> | null {
  if (amostras.length === 0) return null;
  const memLivreMinMB = Math.min(...amostras.map((a) => a.memLivreMB));
  const cpus = amostras.map((a) => a.cpuPct);
  return {
    memLivreMinMB: Math.round(memLivreMinMB),
    memUsadaMaxPct: memTotalMB > 0 ? Math.round((100 * (memTotalMB - memLivreMinMB)) / memTotalMB) : 0,
    cpuMedioPct: Math.round(cpus.reduce((s, c) => s + c, 0) / cpus.length),
    cpuMaxPct: Math.round(Math.max(...cpus)),
  };
}

/** Mede o PC de 5 em 5 segundos durante uma execução; `parar()` devolve o resumo. */
export function monitorizarExecucao(intervaloMs = 5000): { parar(): Omit<ResumoDesempenho, 'duracaoMediaCasoMs'> | null } {
  const medidor = new MedidorCpu();
  const amostras: Array<{ memLivreMB: number; cpuPct: number }> = [];
  const amostrar = (): void => {
    amostras.push({ memLivreMB: os.freemem() / 1048576, cpuPct: medidor.amostrar() });
  };
  const relogio = setInterval(amostrar, intervaloMs);
  relogio.unref?.();
  return {
    parar: () => {
      clearInterval(relogio);
      amostrar();
      return resumir(amostras, os.totalmem() / 1048576);
    },
  };
}

/** "6,2 GB" ou "850 MB". */
export function formatarMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${Math.round(mb)} MB`;
}
