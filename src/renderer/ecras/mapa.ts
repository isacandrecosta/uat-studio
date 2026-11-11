// Ecrã Mapa de execução: grafo ao vivo (Épicos → Jornadas → Blocos), matriz por caso,
// miniaturas ao vivo do browser de cada worker e os controlos da execução.
import { contar, estadoDoBlocoNoCaso, estadoDoCasoNoMapa, juntarEstados, resumoContagem, type EstadoNo } from '../../shared/mapa.js';
import type { EstadoRun, JornadaDoRun, ResultadoCaso } from '../../shared/modelo.js';
import type { Contexto } from '../app.js';
import { h, plural } from '../dom.js';

type Vista = 'epicos' | 'jornadas' | 'casos';

const NOMES_ESTADO: Record<EstadoNo, string> = {
  'a-correr': 'A correr',
  ok: 'OK',
  ko: 'KO',
  erro: 'ERRO',
  parcial: 'OK até agora (falta correr)',
  ignorado: 'Saltado (só se…)',
  'nao-corrido': 'Não corrido',
  'por-correr': 'Por correr',
};

let vista: Vista = 'jornadas';
/** Execução mostrada (pasta), ou null para a atual / última. */
let runEscolhido: string | null = null;
let deixarDeOuvir: (() => void) | null = null;
let temporizador: ReturnType<typeof setInterval> | null = null;
/** Última miniatura de cada worker (imagem "data:"). */
const miniaturas = new Map<number, { chave: string; imagem: string | null }>();

function pararTudo(): void {
  deixarDeOuvir?.();
  deixarDeOuvir = null;
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

/** As jornadas da execução; as execuções antigas (sem fotografia) ficam com blocos genéricos. */
function jornadasDoRun(run: EstadoRun): JornadaDoRun[] {
  if (run.jornadas?.length) return run.jornadas;
  const vistas = new Map<string, JornadaDoRun>();
  for (const caso of run.casos) {
    if (!vistas.has(caso.jornadaId)) vistas.set(caso.jornadaId, { id: caso.jornadaId, nome: caso.jornadaNome, epicoId: '', epicoNome: '', blocos: [] });
  }
  return [...vistas.values()];
}

function estadoDaJornada(run: EstadoRun, jornadaId: string): { estado: EstadoNo; resumo: string } {
  const estados = run.casos.filter((c) => c.jornadaId === jornadaId).map((c) => estadoDoCasoNoMapa(c.estado));
  return { estado: juntarEstados(estados), resumo: resumoContagem(contar(estados)) };
}

export async function ecraMapa({ corpo, acoes, irPara }: Contexto): Promise<void> {
  const api = window.uatStudio.runs;
  pararTudo();
  const [atual, historico] = await Promise.all([api.estado(), api.historico()]);
  const escolher = (): EstadoRun | null =>
    (runEscolhido && (atual?.pasta === runEscolhido ? atual : historico.find((r) => r.pasta === runEscolhido))) || atual || historico[0] || null;
  let run = escolher();
  /** A execução desta sessão (a que pode estar a correr); muda se começar outra com o mapa aberto. */
  let vivo = atual;

  if (!run) {
    corpo.append(
      h(
        'div',
        { class: 'vazio' },
        h('p', { class: 'vazio-titulo' }, 'Ainda não há execuções'),
        h('p', {}, 'O mapa mostra ao vivo o que está a correr. Começa uma execução no ecrã Runs.'),
        h('button', { type: 'button', class: 'botao botao-primario', onclick: () => irPara('runs') }, 'Ir para Runs'),
      ),
    );
    return;
  }

  // Escolher a execução (a atual ou uma do histórico).
  const opcoesRun = [...(atual && !historico.some((r) => r.pasta === atual.pasta) ? [atual] : []), ...historico];
  const escolhaRun = h(
    'select',
    {
      id: 'mapa-run',
      class: 'campo',
      'aria-label': 'Execução',
      onchange: () => {
        runEscolhido = escolhaRun.value || null;
        run = escolher();
        miniaturas.clear();
        desenhar();
      },
    },
    opcoesRun.map((r) =>
      h('option', { value: r.pasta ?? '', selected: r.pasta === run?.pasta }, `${r.id} · ${r.nome} · ${new Date(r.inicio).toLocaleString('pt-PT')}${r.ativo ? ' (a correr)' : ''}`),
    ),
  );
  const separadores = h(
    'div',
    { class: 'separadores', role: 'tablist', 'aria-label': 'Vista do mapa' },
    (
      [
        ['epicos', 'Épicos'],
        ['jornadas', 'Jornadas e blocos'],
        ['casos', 'Casos'],
      ] as Array<[Vista, string]>
    ).map(([id, nome]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'separador',
          'data-vista': id,
          'aria-selected': String(vista === id),
          onclick: () => {
            vista = id;
            desenhar();
          },
        },
        nome,
      ),
    ),
  );
  const legenda = h(
    'div',
    { class: 'mapa-legenda', 'aria-label': 'Legenda' },
    (['a-correr', 'ok', 'ko', 'erro', 'parcial', 'por-correr', 'ignorado', 'nao-corrido'] as EstadoNo[]).map((e) =>
      h('span', { class: 'legenda-item' }, h('span', { class: 'legenda-cor', 'data-estado': e }), NOMES_ESTADO[e]),
    ),
  );
  const zonaTopo = h('div', { class: 'mapa-topo' });
  const zonaWorkers = h('div', {});
  const zonaMapa = h('div', { id: 'mapa', class: 'mapa' });
  corpo.append(h('section', { class: 'cartao mapa-cartao' }, h('div', { class: 'mapa-barra' }, escolhaRun, separadores), legenda, zonaTopo), zonaWorkers, zonaMapa);

  function desenhar(): void {
    if (!run) return;
    for (const s of Array.from(separadores.children)) s.setAttribute('aria-selected', String((s as HTMLElement).dataset.vista === vista));
    desenharControlos(run);
    desenharTopo(run);
    desenharWorkers(run);
    zonaMapa.dataset.vista = vista;
    zonaMapa.replaceChildren(vista === 'epicos' ? vistaEpicos(run) : vista === 'jornadas' ? vistaJornadas(run) : vistaCasos(run));
  }

  function desenharControlos(r: EstadoRun): void {
    acoes.replaceChildren();
    if (!r.ativo || r.pasta !== vivo?.pasta) {
      acoes.append(h('button', { type: 'button', class: 'botao', onclick: () => irPara('runs') }, 'Ver resultados'));
      return;
    }
    acoes.append(
      r.emPausa
        ? h('button', { id: 'mapa-continuar', type: 'button', class: 'botao botao-primario', onclick: () => void api.continuar() }, 'Continuar')
        : h('button', { id: 'mapa-pausar', type: 'button', class: 'botao', disabled: r.aParar, title: 'Pára entre passos, nunca a meio de uma ação.', onclick: () => void api.pausar() }, 'Pausar'),
      h('button', { id: 'mapa-parar', type: 'button', class: 'botao botao-perigo', disabled: r.aParar, onclick: () => void api.parar() }, r.aParar ? 'A parar…' : 'Parar'),
    );
  }

  function desenharTopo(r: EstadoRun): void {
    const estados = r.casos.map((c) => estadoDoCasoNoMapa(c.estado));
    const feitos = r.casos.filter((c) => c.estado !== 'por-correr' && c.estado !== 'a-correr').length;
    const manuais = r.ativo ? r.casos.filter((c) => c.aguardaManual) : [];
    zonaTopo.replaceChildren(
      ...(manuais.length === 0 ? [] : [h(
          'div',
          { class: 'aviso-manual', id: 'mapa-manual', role: 'alert' },
          h('span', {}, `${plural(manuais.length, 'passo manual', 'passos manuais')} à espera do testador (${manuais.map((c) => c.casoId).join(', ')}).`),
          h('button', { type: 'button', class: 'botao botao-primario', onclick: () => irPara('runs') }, 'Responder'),
        )]),
      h('progress', { class: 'barra-progresso', max: r.casos.length, value: feitos, 'aria-label': 'Progresso da execução' }),
      h(
        'p',
        { class: 'suave', id: 'mapa-resumo', 'data-ativo': String(r.ativo) },
        `${r.ativo ? (r.emPausa ? 'Em pausa' : 'A correr') : 'Terminada'} · ${feitos} de ${plural(r.casos.length, 'caso')} · ${resumoContagem(contar(estados))} · Ambiente ${r.ambiente}`,
      ),
    );
  }

  /** Miniaturas ao vivo: uma por worker, enquanto a execução corre. */
  function desenharWorkers(r: EstadoRun): void {
    if (!r.ativo || r.pasta !== vivo?.pasta) {
      zonaWorkers.replaceChildren();
      return;
    }
    const numero = Math.min(r.opcoes.paralelo, r.casos.length);
    zonaWorkers.replaceChildren(
      h(
        'section',
        { class: 'cartao' },
        h('header', { class: 'cartao-topo' }, h('h2', {}, 'Workers ao vivo'), h('span', { class: 'suave' }, r.opcoes.visivel ? 'Browser visível' : 'Em background (o browser desenha a página mesmo sem janela)')),
        h(
          'div',
          { class: 'workers', id: 'workers' },
          Array.from({ length: numero }, (_, i) => {
            const n = i + 1;
            const caso = r.casos.find((c) => c.estado === 'a-correr' && c.worker === n);
            const mini = miniaturas.get(n);
            const imagem = caso && mini?.chave === caso.chave ? mini.imagem : null;
            return h(
              'figure',
              { class: 'worker', 'data-worker': n, 'data-ocupado': String(Boolean(caso)) },
              imagem
                ? h('img', { src: imagem, alt: `Ecrã do worker ${n}`, title: 'Ver maior', onclick: () => ampliar(n, imagem) })
                : h('div', { class: 'worker-vazio' }, caso ? 'A preparar o ecrã…' : 'À espera'),
              h(
                'figcaption',
                {},
                h('strong', {}, `Worker ${n}`),
                caso && h('span', {}, `${caso.jornadaNome} › ${caso.casoId}`),
                caso?.passoAtual && h('span', { class: 'suave worker-passo' }, caso.passoAtual),
              ),
            );
          }),
        ),
      ),
    );
  }

  function ampliar(n: number, imagem: string): void {
    const fechar = (): void => {
      dialogo.close();
      dialogo.remove();
    };
    const dialogo = h(
      'dialog',
      { class: 'dialogo dialogo-miniatura', oncancel: fechar, onclick: fechar },
      h('div', { class: 'dialogo-corpo' }, h('h2', {}, `Worker ${n}`), h('img', { src: imagem, alt: `Ecrã do worker ${n}` }), h('p', { class: 'suave' }, 'Clica em qualquer lado para fechar.')),
    );
    document.body.append(dialogo);
    dialogo.showModal();
  }

  /** Um nó do grafo. */
  function no(nome: string, estado: EstadoNo, detalhe: string, extra: { cor?: string; sub?: string; marcas?: string[]; atributos?: Record<string, string> } = {}): HTMLElement {
    const elemento = h(
      'div',
      { class: 'no', 'data-estado': estado, title: `${nome}: ${NOMES_ESTADO[estado]}${detalhe ? ` (${detalhe})` : ''}`, ...(extra.atributos ?? {}) },
      h('span', { class: 'no-nome' }, nome),
      extra.sub && h('span', { class: 'no-sub' }, extra.sub),
      h('span', { class: 'no-estado' }, detalhe || NOMES_ESTADO[estado]),
      (extra.marcas ?? []).length > 0 && h('span', { class: 'no-marcas' }, (extra.marcas ?? []).map((m) => h('span', { class: 'etiqueta' }, m))),
    );
    // Cor da aplicação (faixa à esquerda). Por código, porque a política de segurança da interface não aceita style="...".
    if (extra.cor) elemento.style.setProperty('--cor-app', extra.cor);
    return elemento;
  }

  function porEpico(r: EstadoRun): Array<[string, JornadaDoRun[]]> {
    const grupos = new Map<string, JornadaDoRun[]>();
    for (const j of jornadasDoRun(r)) {
      const lista = grupos.get(j.epicoNome) ?? [];
      lista.push(j);
      grupos.set(j.epicoNome, lista);
    }
    return [...grupos.entries()];
  }

  /** Vista Épicos: cada épico ligado às suas jornadas. */
  function vistaEpicos(r: EstadoRun): HTMLElement {
    return h(
      'div',
      { class: 'mapa-epicos' },
      porEpico(r).map(([epicoNome, jornadas]) => {
        const casos = r.casos.filter((c) => jornadas.some((j) => j.id === c.jornadaId));
        const estados = casos.map((c) => estadoDoCasoNoMapa(c.estado));
        return h(
          'section',
          { class: 'cartao mapa-linha' },
          no(epicoNome || 'Sem épico', juntarEstados(estados), resumoContagem(contar(estados)), { sub: plural(jornadas.length, 'jornada'), atributos: { 'data-epico': epicoNome } }),
          h(
            'div',
            { class: 'mapa-ramos' },
            jornadas.map((j) => {
              const { estado, resumo } = estadoDaJornada(r, j.id);
              return no(j.nome, estado, resumo, { sub: plural(r.casos.filter((c) => c.jornadaId === j.id).length, 'caso'), atributos: { 'data-no-jornada': j.id } });
            }),
          ),
        );
      }),
    );
  }

  /** Vista Jornadas: o percurso de blocos de cada jornada, com a cor de cada bloco somando todos os casos. */
  function vistaJornadas(r: EstadoRun): HTMLElement {
    return h(
      'div',
      { class: 'mapa-jornadas' },
      porEpico(r).map(([epicoNome, jornadas]) =>
        h(
          'div',
          { class: 'mapa-grupo' },
          epicoNome && h('h2', { class: 'mapa-epico' }, epicoNome),
          jornadas.map((j) => {
            const casos = r.casos.filter((c) => c.jornadaId === j.id);
            const { estado, resumo } = estadoDaJornada(r, j.id);
            return h(
              'section',
              { class: 'cartao mapa-jornada', 'data-jornada': j.id, 'data-estado': estado },
              h('header', { class: 'cartao-topo' }, h('h3', {}, j.nome), h('span', { class: 'suave' }, `${plural(casos.length, 'caso')} · ${resumo}`)),
              j.blocos.length === 0
                ? h('p', { class: 'suave' }, 'Esta execução é antiga e não guardou o percurso dos blocos. Vê a vista "Casos".')
                : h(
                    'div',
                    { class: 'mapa-percurso' },
                    j.blocos.map((b, posicao) => {
                      const estados = casos.map((c) => estadoDoBlocoNoCaso(c, posicao));
                      const marcas = [b.condicional ? 'só se…' : '', b.limpeza ? 'limpeza' : ''].filter(Boolean);
                      return no(b.nome, juntarEstados(estados), resumoContagem(contar(estados)), {
                        cor: b.cor,
                        sub: [b.tipo === 'API' ? 'API' : '', b.aplicacaoNome ?? ''].filter(Boolean).join(' · '),
                        marcas,
                        atributos: { 'data-bloco': String(posicao) },
                      });
                    }),
                  ),
            );
          }),
        ),
      ),
    );
  }

  /** Vista Casos: uma linha por caso, uma coluna por bloco. */
  function vistaCasos(r: EstadoRun): HTMLElement {
    return h(
      'div',
      { class: 'mapa-casos' },
      jornadasDoRun(r).map((j) => {
        const casos = r.casos.filter((c) => c.jornadaId === j.id);
        const colunas = j.blocos.length > 0 ? j.blocos.map((b) => b.nome) : Array.from({ length: Math.max(0, ...casos.map((c) => c.blocos?.length ?? 0)) }, (_, i) => `Bloco ${i + 1}`);
        return h(
          'section',
          { class: 'cartao' },
          h('h3', {}, j.nome),
          h(
            'div',
            { class: 'mapa-matriz-zona' },
            h(
              'table',
              { class: 'tabela mapa-matriz', 'data-jornada': j.id },
              h(
                'thead',
                {},
                h(
                  'tr',
                  {},
                  h('th', {}, 'Caso'),
                  h('th', {}, 'Resultado'),
                  colunas.map((nome, i) => h('th', { title: nome, class: 'coluna-bloco' }, h('span', {}, `${i + 1}. ${nome}`))),
                ),
              ),
              h('tbody', {}, casos.map((c) => linhaCaso(c, colunas.length))),
            ),
          ),
        );
      }),
    );
  }

  function linhaCaso(c: ResultadoCaso, colunas: number): HTMLElement {
    const estadoCaso = estadoDoCasoNoMapa(c.estado);
    return h(
      'tr',
      { 'data-caso': c.chave },
      h('th', { scope: 'row' }, c.casoId, c.worker && c.estado === 'a-correr' ? h('span', { class: 'suave' }, ` · worker ${c.worker}`) : ''),
      h('td', {}, h('span', { class: 'celula-estado', 'data-estado': estadoCaso }, c.estado === 'a-correr' ? 'A correr' : c.estado === 'por-correr' ? 'Por correr' : c.estado)),
      Array.from({ length: colunas }, (_, i) => {
        const e = estadoDoBlocoNoCaso(c, i);
        return h('td', {}, h('span', { class: 'celula', 'data-estado': e, title: NOMES_ESTADO[e], 'aria-label': NOMES_ESTADO[e] }));
      }),
    );
  }

  desenhar();

  // Ao vivo: redesenha quando a execução muda (no máximo uma vez por fotograma).
  let pedido = 0;
  deixarDeOuvir = api.aoAtualizar((novo) => {
    if (!zonaMapa.isConnected) return pararTudo();
    const aMostrarAtual = !runEscolhido || runEscolhido === novo.pasta || run?.pasta === novo.pasta;
    if (!aMostrarAtual) return;
    if (run?.pasta !== novo.pasta) miniaturas.clear();
    run = novo;
    vivo = novo;
    // Uma execução nova (começada com o mapa aberto) entra na lista e fica escolhida.
    if (novo.pasta && !Array.from(escolhaRun.options).some((o) => o.value === novo.pasta)) {
      escolhaRun.prepend(h('option', { value: novo.pasta }, `${novo.id} · ${novo.nome} · ${new Date(novo.inicio).toLocaleString('pt-PT')}`));
    }
    if (novo.pasta) escolhaRun.value = novo.pasta;
    if (!pedido) {
      pedido = requestAnimationFrame(() => {
        pedido = 0;
        desenhar();
      });
    }
  });

  // Miniaturas: pede um print a cada worker de 1,5 em 1,5 s, só enquanto a execução corre e o ecrã está aberto.
  let aPedir = false;
  temporizador = setInterval(async () => {
    if (!zonaMapa.isConnected) return pararTudo();
    if (!run?.ativo || run.pasta !== vivo?.pasta || aPedir) return;
    aPedir = true;
    try {
      for (const m of await api.miniaturas()) miniaturas.set(m.worker, { chave: m.chave, imagem: m.imagem });
      if (run) desenharWorkers(run);
    } catch {
      // Sem miniaturas desta vez: tenta-se na próxima.
    } finally {
      aPedir = false;
    }
  }, 1500);
}
