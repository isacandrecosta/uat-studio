import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatarMB, MedidorCpu, resumir, sugerirParalelo } from '../main/desempenho';

test('sugestão de casos em paralelo pela memória livre (reserva de 1 GB, 250 MB por caso)', () => {
  // 1024 de reserva + 250 por caso: com 1600 MB livres cabem 2.
  assert.deepEqual(sugerirParalelo(4, 1600), { seguro: 2, memLivreMB: 1600, excede: true });
  assert.equal(sugerirParalelo(2, 1600).excede, false);
  assert.equal(sugerirParalelo(8, 16000).seguro, 8);
  assert.equal(sugerirParalelo(8, 2100).seguro, 4);
  // Com pouca memória, sugere sempre pelo menos 1.
  assert.equal(sugerirParalelo(2, 500).seguro, 1);
  assert.equal(sugerirParalelo(1, 500).excede, false);
});

test('resumo das medições de uma execução', () => {
  assert.equal(resumir([], 8000), null);
  assert.deepEqual(
    resumir(
      [
        { memLivreMB: 4000, cpuPct: 10 },
        { memLivreMB: 3000, cpuPct: 30 },
        { memLivreMB: 3500, cpuPct: 20 },
      ],
      8000,
    ),
    { memLivreMinMB: 3000, memUsadaMaxPct: 63, cpuMedioPct: 20, cpuMaxPct: 30 },
  );
});

test('formato da memória e leitura do processador', () => {
  assert.equal(formatarMB(850), '850 MB');
  assert.equal(formatarMB(6348), '6,2 GB');
  const pct = new MedidorCpu().amostrar();
  assert.ok(pct >= 0 && pct <= 100);
});
