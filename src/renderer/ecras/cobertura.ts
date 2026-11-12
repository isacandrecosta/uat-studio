// Partes do ecrã Runs: matriz de cobertura e comparação com as execuções anteriores.
import { compararComAnterior, matrizCobertura, ultimosResultados, type Agrupamento, type EstadoCelula, type Mudanca } from '../../shared/cobertura.js';
import type { ConjuntoCasos, EstadoRun, Jornada } from '../../shared/modelo.js';
import { h, plural } from '../dom.js';

const NOMES_CELULA: Record<EstadoCelula, string> = { OK: '✓ Passou', KO: '✗ Falhou', ERRO: '! Bloqueado', nunca: 'Nunca corrido', vazio: 'Sem casos' };

/** Agrupamento escolhido (mantém-se entre redesenhos): "caso", "etiqueta" ou "coluna:<nome>". */
let agrupamentoEscolhido: string | null = null;

/** Comparação de uma execução terminada com o último resultado de cada caso nas execuções anteriores. */
export function cartaoComparacao(run: EstadoRun, historico: EstadoRun[]): HTMLElement | false {
  if (run.ativo) return false;
  const comparacao = compararComAnterior(run, historico);
  if (comparacao.length === 0) return false;
  const conta = (m: Mudanca): number => comparacao.filter((c) => c.mudanca === m).length;
  const comAntes = comparacao.filter((c) => c.mudanca !== 'novo').length;
  if (comAntes === 0) return h('p', { class: 'suave comparacao-vazia', id: 'comparacao' }, 'Comparação: é a primeira vez que estes casos correm (não há resultados anteriores).');
  const mudaram = comparacao.filter((c) => c.mudanca === 'piorou' || c.mudanca === 'melhorou' || c.mudanca === 'mudou');
  const nomes: Record<Mudanca, string> = { piorou: 'Piorou', melhorou: 'Melhorou', mudou: 'Mudou', igual: 'Igual', novo: 'Novo' };
  return h(
    'div',
    { class: 'caixa-comparacao', id: 'comparacao' },
    h('h3', {}, 'Comparação com as execuções anteriores'),
    h(
      'div',
      { class: 'totais' },
      (['piorou', 'melhorou', 'mudou', 'igual', 'novo'] as Mudanca[]).map((m) =>
        h('div', { class: 'total', 'data-mudanca': m }, h('strong', {}, conta(m)), m === 'piorou' ? 'pioraram' : m === 'melhorou' ? 'melhoraram' : m === 'mudou' ? 'mudaram' : m === 'igual' ? 'iguais' : 'novos'),
      ),
    ),
    mudaram.length === 0
      ? h('p', { class: 'suave' }, 'Nenhum caso mudou de resultado.')
      : h(
          'table',
          { class: 'tabela tabela-comparacao' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Caso'), h('th', {}, 'Antes'), h('th', {}, 'Agora'), h('th', {}, ''))),
          h(
            'tbody',
            {},
            mudaram.map((c) =>
              h(
                'tr',
                { 'data-mudanca': c.mudanca, 'data-caso': c.chave },
                h('td', {}, `${c.jornadaNome} › ${c.casoId}`),
                h('td', {}, h('span', { class: 'celula-cobertura', 'data-estado': c.antes?.estado }, c.antes?.estado ?? ''), h('span', { class: 'suave' }, ` ${c.antes?.runId ?? ''}`)),
                h('td', {}, h('span', { class: 'celula-cobertura', 'data-estado': c.agora }, c.agora)),
                h('td', {}, h('span', { class: 'mudanca', 'data-mudanca': c.mudanca }, nomes[c.mudanca])),
              ),
            ),
          ),
        ),
  );
}

/** Matriz de cobertura: variantes (linhas) × jornadas (colunas), com o último resultado de cada caso. */
export function cartaoCobertura(jornadas: Jornada[], conjuntos: ConjuntoCasos[], historico: EstadoRun[]): HTMLElement {
  const colunas = [...new Set(conjuntos.flatMap((c) => c.colunas))].sort((a, b) => a.localeCompare(b, 'pt'));
  if (!agrupamentoEscolhido) agrupamentoEscolhido = colunas.includes('Variante') ? 'coluna:Variante' : 'caso';
  const zona = h('div', { class: 'cobertura-zona' });
  const escolha = h(
    'select',
    {
      id: 'cobertura-linhas',
      class: 'campo',
      onchange: () => {
        agrupamentoEscolhido = escolha.value;
        desenhar();
      },
    },
    h('option', { value: 'caso', selected: agrupamentoEscolhido === 'caso' }, 'ID do caso'),
    h('option', { value: 'etiqueta', selected: agrupamentoEscolhido === 'etiqueta' }, 'Etiquetas dos casos'),
    colunas.map((c) => h('option', { value: `coluna:${c}`, selected: agrupamentoEscolhido === `coluna:${c}` }, `Coluna "${c}"`)),
  );
  const ultimos = ultimosResultados(historico);

  function desenhar(): void {
    const valor = agrupamentoEscolhido ?? 'caso';
    const agrupar: Agrupamento = valor.startsWith('coluna:') ? { tipo: 'coluna', coluna: valor.slice(7) } : valor === 'etiqueta' ? { tipo: 'etiqueta' } : { tipo: 'caso' };
    const matriz = matrizCobertura(jornadas, conjuntos, ultimos, agrupar);
    if (matriz.jornadas.length === 0) {
      zona.replaceChildren(h('p', { class: 'suave' }, 'Ainda não há cenários com casos.'));
      return;
    }
    const celulasComCasos = matriz.totais.OK + matriz.totais.KO + matriz.totais.ERRO + matriz.totais.nunca;
    zona.replaceChildren(
      h(
        'p',
        { class: 'suave', id: 'cobertura-resumo' },
        `${plural(matriz.linhas.length, 'variante')} × ${plural(matriz.jornadas.length, 'cenário')} · ${matriz.totais.OK} OK · ${matriz.totais.KO} KO · ${matriz.totais.ERRO} ERRO · ${matriz.totais.nunca} nunca corridas` +
          (celulasComCasos > 0 ? ` · cobertura ${Math.round(((celulasComCasos - matriz.totais.nunca) / celulasComCasos) * 100)}%` : ''),
      ),
      h(
        'div',
        { class: 'mapa-matriz-zona' },
        h(
          'table',
          { class: 'tabela matriz-cobertura', id: 'matriz-cobertura' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Variante'), matriz.jornadas.map((j) => h('th', { title: j.nome, class: 'coluna-bloco' }, h('span', {}, j.nome))))),
          h(
            'tbody',
            {},
            matriz.linhas.map((linha) =>
              h(
                'tr',
                { 'data-variante': linha.variante },
                h('th', { scope: 'row' }, linha.variante),
                linha.celulas.map((celula, i) => {
                  const detalhe = celula.casos.map((c) => `${c.casoId}: ${c.ultimo ? `${c.ultimo.estado} (${c.ultimo.runId}, ${new Date(c.ultimo.inicio).toLocaleString('pt-PT')})` : 'nunca corrido'}`).join('\n');
                  return h(
                    'td',
                    { 'data-jornada': matriz.jornadas[i].id },
                    celula.estado === 'vazio'
                      ? h('span', { class: 'suave', 'aria-label': 'Sem casos' }, '—')
                      : h('span', { class: 'celula-cobertura', 'data-estado': celula.estado, title: detalhe }, celula.casos.length > 1 ? `${NOMES_CELULA[celula.estado]} (${celula.casos.length})` : NOMES_CELULA[celula.estado]),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }
  desenhar();
  return h(
    'section',
    { class: 'cartao', id: 'cobertura' },
    h(
      'header',
      { class: 'cartao-topo' },
      h('div', {}, h('h2', {}, 'Matriz de cobertura'), h('p', { class: 'suave' }, 'O último resultado de cada caso, em todas as execuções. Passa o rato numa célula para ver os casos.')),
      h('label', { class: 'campo-grupo cobertura-escolha' }, 'Linhas', escolha),
    ),
    zona,
  );
}
