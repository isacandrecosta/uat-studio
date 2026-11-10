// Ecrã Runs e resultados: escolher o que correr, acompanhar ao vivo e ver o histórico e os detalhes.
import type { AmbitoRun, EstadoRun, ResultadoCaso } from '../../shared/modelo.js';
import type { Contexto } from '../app.js';
import { confirmar, h, mensagemDeErro, plural } from '../dom.js';

const NOMES_ESTADO: Record<ResultadoCaso['estado'], string> = {
  'por-correr': 'Por correr',
  'a-correr': 'A correr',
  OK: 'OK',
  KO: 'KO',
  ERRO: 'ERRO',
  PARADO: 'Parado',
};

let deixarDeOuvir: (() => void) | null = null;
/** Caso com os detalhes abertos (mantém-se entre atualizações ao vivo). */
let casoAberto: string | null = null;
/** Execução do histórico que está a ser mostrada (pasta), ou null para a atual. */
let historicoAberto: string | null = null;

function duracao(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function contar(run: EstadoRun): Record<string, number> {
  const totais: Record<string, number> = { OK: 0, KO: 0, ERRO: 0, PARADO: 0, 'a-correr': 0, 'por-correr': 0 };
  for (const caso of run.casos) totais[caso.estado] = (totais[caso.estado] ?? 0) + 1;
  return totais;
}

export async function ecraRuns({ estado, corpo, acoes, selecao }: Contexto): Promise<void> {
  const api = window.uatStudio;
  deixarDeOuvir?.();
  deixarDeOuvir = null;

  const [epicos, jornadas, conjuntos, atual, historico] = await Promise.all([
    api.dados.listar('epicos'),
    api.dados.listar('jornadas'),
    api.dados.listar('casos'),
    api.runs.estado(),
    api.runs.historico(),
  ]);
  const ambiente = estado.projeto.ambientes.find((a) => a.id === estado.projeto.ambienteAtivo);
  const zonaFormulario = h('div', {});
  const zonaRun = h('div', { id: 'zona-run' });
  const zonaHistorico = h('div', {});
  corpo.append(zonaFormulario, zonaRun, zonaHistorico);

  let runMostrado: EstadoRun | null = (historicoAberto && historico.find((r) => r.pasta === historicoAberto)) || atual || historico[0] || null;
  if (atual?.ativo) runMostrado = atual;

  desenharFormulario(Boolean(atual?.ativo));
  desenharRun();
  desenharHistorico(historico);

  deixarDeOuvir = api.runs.aoAtualizar((novo) => {
    if (!zonaRun.isConnected) return;
    const terminou = runMostrado?.ativo && !novo.ativo;
    // Só acompanha ao vivo se não estiver a ver uma execução antiga.
    if (!historicoAberto || historicoAberto === novo.pasta) {
      runMostrado = novo;
      desenharRun();
    }
    if (terminou) {
      desenharFormulario(false);
      void api.runs.historico().then(desenharHistorico);
    }
  });

  function desenharFormulario(aCorrer: boolean): void {
    const erro = h('p', { class: 'aviso-erro', role: 'alert', hidden: true });
    const numeroDeCasos = (jornadaId: string): number => conjuntos.find((c) => c.id === jornadaId)?.casos.length ?? 0;
    const ambito = h(
      'select',
      { id: 'run-ambito', class: 'campo' },
      h('option', { value: 'tudo' }, 'Tudo (todas as jornadas)'),
      epicos.map((e) => h('option', { value: `epico:${e.id}` }, `Épico: ${e.nome}`)),
      jornadas.map((j) =>
        h('option', { value: `jornada:${j.id}`, selected: j.id === selecao.jornadaId }, `Jornada: ${j.nome} (${plural(numeroDeCasos(j.id), 'caso')})`),
      ),
    );
    const casos = h('input', { id: 'run-casos', type: 'text', class: 'campo', placeholder: 'Todos. Ou, por exemplo: TC0001, TC0005' });
    const etiquetas = h('input', { id: 'run-etiquetas', type: 'text', class: 'campo', placeholder: 'Todas. Ou, por exemplo: aprovado, CP' });
    const browser = h('select', { id: 'run-browser', class: 'campo' }, h('option', { value: 'msedge' }, 'Microsoft Edge'), h('option', { value: 'chrome' }, 'Google Chrome'));
    const modo = h('select', { id: 'run-modo', class: 'campo' }, h('option', { value: 'background' }, 'Em background (sem janela)'), h('option', { value: 'visivel' }, 'Visível'));
    const paralelo = h('select', { id: 'run-paralelo', class: 'campo' }, [1, 2, 4, 8].map((n) => h('option', { value: n }, n === 1 ? '1 de cada vez' : `${n} em paralelo`)));
    const botao = h('button', { id: 'btn-correr', type: 'submit', class: 'botao botao-primario', disabled: aCorrer }, aCorrer ? 'A correr…' : 'Correr');
    const grupo = (id: string, rotulo: string, campo: HTMLElement): HTMLElement => h('div', { class: 'campo-grupo' }, h('label', { for: id }, rotulo), campo);

    zonaFormulario.replaceChildren(
      h(
        'form',
        {
          class: 'cartao',
          onsubmit: async (evento: Event) => {
            evento.preventDefault();
            erro.hidden = true;
            const pedido: AmbitoRun = {};
            const [tipo, id] = ambito.value.split(':');
            if (tipo === 'epico') pedido.epicoIds = [id];
            if (tipo === 'jornada') pedido.jornadaIds = [id];
            const ids = casos.value.split(',').map((c) => c.trim()).filter(Boolean);
            if (ids.length > 0) {
              pedido.chavesCasos = jornadas.filter((j) => tipo !== 'jornada' || j.id === id).flatMap((j) => ids.map((c) => `${j.id}/${c}`));
            }
            const filtro = etiquetas.value.split(',').map((e) => e.trim()).filter(Boolean);
            if (filtro.length > 0) pedido.etiquetas = filtro;
            let confirmouProducao = false;
            if (ambiente?.tipo === 'PRD') {
              confirmouProducao = await confirmar('Ambiente de PRODUÇÃO', `O ambiente ativo (${ambiente.nome}) é de produção. Tens a certeza de que queres correr testes aqui?`, 'Correr em produção');
              if (!confirmouProducao) return;
            }
            botao.disabled = true;
            try {
              historicoAberto = null;
              casoAberto = null;
              runMostrado = await api.runs.iniciar(pedido, {
                canal: browser.value === 'chrome' ? 'chrome' : 'msedge',
                visivel: modo.value === 'visivel',
                paralelo: Number(paralelo.value),
                confirmouProducao,
              });
              botao.textContent = 'A correr…';
              desenharRun();
            } catch (e) {
              erro.textContent = mensagemDeErro(e);
              erro.hidden = false;
              botao.disabled = false;
            }
          },
        },
        h('h2', {}, 'Nova execução'),
        erro,
        h(
          'div',
          { class: 'grelha-run' },
          grupo('run-ambito', `O que correr (ambiente ${ambiente?.nome ?? '?'})`, ambito),
          grupo('run-casos', 'Só estes casos (IDs)', casos),
          grupo('run-etiquetas', 'Só com estas etiquetas', etiquetas),
          grupo('run-browser', 'Browser', browser),
          grupo('run-modo', 'Modo', modo),
          grupo('run-paralelo', 'Em paralelo', paralelo),
        ),
        botao,
      ),
    );
  }

  function desenharRun(): void {
    acoes.replaceChildren();
    const run = runMostrado;
    if (!run) {
      zonaRun.replaceChildren(
        h('div', { class: 'vazio' }, h('p', { class: 'vazio-titulo' }, 'Ainda não há execuções'), h('p', {}, 'Escolhe o que correr e carrega em "Correr".')),
      );
      return;
    }
    const pasta = run.pasta ?? '';
    const totais = contar(run);
    const feitos = run.casos.length - totais['por-correr'] - totais['a-correr'];
    if (run.ativo) {
      acoes.append(
        h('button', { id: 'btn-parar', type: 'button', class: 'botao botao-perigo', disabled: run.aParar, onclick: () => void api.runs.parar() }, run.aParar ? 'A parar…' : 'Parar'),
      );
    } else if (pasta) {
      acoes.append(
        h('button', { type: 'button', class: 'botao', onclick: () => void api.runs.abrir(pasta) }, 'Abrir pasta'),
        h('button', { type: 'button', class: 'botao', onclick: () => void api.runs.abrir(pasta, 'relatorio.xlsx') }, 'Relatório Excel'),
        h('button', { type: 'button', class: 'botao', onclick: () => void api.runs.abrir(pasta, 'relatorio.html') }, 'Relatório HTML'),
      );
    }
    const total = (rotulo: string, valor: number, tipo: string): HTMLElement => h('div', { class: 'total', 'data-tipo': tipo }, h('strong', {}, valor), rotulo);
    zonaRun.replaceChildren(
      h(
        'section',
        { class: 'cartao', id: 'run-atual', 'data-ativo': String(run.ativo) },
        h(
          'header',
          { class: 'cartao-topo' },
          h(
            'div',
            {},
            h('h2', {}, `${run.nome} (${run.id})`),
            h(
              'p',
              { class: 'suave' },
              `${new Date(run.inicio).toLocaleString('pt-PT')} · Ambiente ${run.ambiente} · ${run.opcoes.canal === 'msedge' ? 'Edge' : 'Chrome'}, ${run.opcoes.visivel ? 'visível' : 'em background'}, ${run.opcoes.paralelo} em paralelo`,
            ),
          ),
          h('span', { class: 'etiqueta', id: 'run-progresso' }, run.ativo ? `${feitos} de ${run.casos.length}` : 'Terminada'),
        ),
        h('progress', { class: 'barra-progresso', max: run.casos.length, value: feitos, 'aria-label': 'Progresso da execução' }),
        h(
          'div',
          { class: 'totais' },
          total('casos', run.casos.length, ''),
          total('OK', totais.OK, 'OK'),
          total('KO', totais.KO, 'KO'),
          total('ERRO', totais.ERRO, 'ERRO'),
          totais.PARADO > 0 && total('parados', totais.PARADO, ''),
        ),
        h(
          'ul',
          { class: 'lista-casos' },
          run.casos.map((caso) => linhaCaso(run, caso)),
        ),
      ),
    );
  }

  function linhaCaso(run: EstadoRun, caso: ResultadoCaso): HTMLElement {
    const aberto = casoAberto === caso.chave;
    const resumo =
      caso.estado === 'a-correr'
        ? (caso.passoAtual ?? '')
        : caso.estado === 'ERRO'
          ? (caso.erro?.mensagem ?? '')
          : caso.estado === 'KO'
            ? plural(caso.diferencas.length, 'diferença')
            : '';
    const detalhe = h('div', { class: 'caso-detalhe' });
    if (aberto) desenharDetalhe(run, caso, detalhe);
    return h(
      'li',
      { class: 'caso', 'data-estado': caso.estado, 'data-chave': caso.chave },
      h(
        'button',
        {
          type: 'button',
          class: 'caso-topo',
          'aria-expanded': String(aberto),
          onclick: () => {
            casoAberto = aberto ? null : caso.chave;
            desenharRun();
          },
        },
        h('span', { class: 'estado-caso' }, NOMES_ESTADO[caso.estado]),
        h('strong', {}, caso.casoId),
        h('span', { class: 'caso-nome' }, caso.casoNome ?? ''),
        h('span', { class: 'caso-resumo suave' }, resumo),
        h('span', { class: 'suave' }, `${caso.jornadaNome}${caso.duracaoMs ? ` · ${duracao(caso.duracaoMs)}` : ''}`),
      ),
      aberto && detalhe,
    );
  }

  function desenharDetalhe(run: EstadoRun, caso: ResultadoCaso, zona: HTMLElement): void {
    const pasta = run.pasta ?? '';
    const pastaCaso = caso.pasta ?? '';
    if (caso.erro) {
      zona.append(
        h(
          'div',
          { class: 'caixa-erro' },
          h('p', {}, h('strong', {}, 'O que aconteceu: '), caso.erro.mensagem),
          h('p', {}, h('strong', {}, 'Onde: '), [caso.jornadaNome, caso.erro.bloco, caso.erro.passo].filter(Boolean).join(' › ')),
          caso.erro.porExecutar.length > 0 && h('p', {}, h('strong', {}, 'Ficou por executar: '), caso.erro.porExecutar.join(', ')),
        ),
      );
    }
    if (caso.diferencas.length > 0) {
      zona.append(
        h(
          'table',
          { class: 'tabela tabela-diferencas' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Passo'), h('th', {}, 'Esperado'), h('th', {}, 'Obtido'), h('th', {}, 'Diferença'))),
          h('tbody', {}, caso.diferencas.map((d) => h('tr', {}, h('td', {}, d.passo), h('td', {}, d.esperado), h('td', {}, d.obtido), h('td', {}, d.diferenca ?? '')))),
        ),
      );
    }
    if (caso.passos.length > 0) {
      zona.append(
        h(
          'ol',
          { class: 'log-passos' },
          caso.passos.map((p) =>
            h('li', { 'data-estado': p.estado }, h('span', { class: 'marca-passo' }, p.estado.toUpperCase()), p.descricao, p.detalhe && h('span', { class: 'suave' }, ` ${p.detalhe}`)),
          ),
        ),
      );
    }
    const variaveis = Object.entries(caso.variaveis);
    if (variaveis.length > 0) zona.append(h('p', { class: 'suave' }, 'Variáveis guardadas: ', variaveis.map(([n, v]) => `{${n}} = ${v}`).join('; ')));

    const prints = (caso.evidencias ?? []).filter((f) => f.endsWith('.png'));
    if (pasta && prints.length > 0) {
      const galeria = h('div', { class: 'galeria' });
      zona.append(galeria);
      for (const ficheiro of prints) {
        const imagem = h('img', { alt: `Print ${ficheiro} do caso ${caso.casoId}` });
        galeria.append(
          h('button', { type: 'button', class: 'print', title: 'Abrir o print', onclick: () => void api.runs.abrir(pasta, pastaCaso, ficheiro) }, imagem, h('span', {}, ficheiro)),
        );
        void api.runs.imagem(pasta, pastaCaso, ficheiro).then((dados) => {
          if (dados) imagem.src = dados;
        });
      }
    }
    if (pasta && caso.estado !== 'por-correr' && caso.estado !== 'a-correr') {
      const traces = (caso.evidencias ?? []).filter((f) => f.endsWith('.zip'));
      zona.append(
        h(
          'div',
          { class: 'acoes' },
          h('button', { type: 'button', class: 'botao botao-pequeno-livre', onclick: () => void api.runs.abrir(pasta, pastaCaso) }, 'Abrir pasta do caso'),
          h('button', { type: 'button', class: 'botao botao-pequeno-livre', onclick: () => void api.runs.abrir(pasta, pastaCaso, 'caso.log') }, 'Abrir caso.log'),
          traces.length > 0 && h('span', { class: 'suave' }, `Trace: ${traces.join(', ')} (abre-se em trace.playwright.dev ou com "npx playwright show-trace")`),
        ),
      );
    }
  }

  function desenharHistorico(runs: EstadoRun[]): void {
    if (runs.length === 0) {
      zonaHistorico.replaceChildren();
      return;
    }
    zonaHistorico.replaceChildren(
      h(
        'section',
        { class: 'cartao' },
        h('header', { class: 'cartao-topo' }, h('h2', {}, 'Histórico'), h('span', { class: 'etiqueta' }, plural(runs.length, 'execução', 'execuções'))),
        h(
          'ul',
          { class: 'lista-itens', id: 'historico' },
          runs.map((run) => {
            const totais = contar(run);
            return h(
              'li',
              { class: 'item' },
              h(
                'button',
                {
                  type: 'button',
                  class: 'ligacao',
                  onclick: () => {
                    historicoAberto = run.pasta ?? null;
                    casoAberto = null;
                    runMostrado = run;
                    desenharRun();
                    zonaRun.scrollIntoView({ block: 'start' });
                  },
                },
                `${run.nome} (${run.id})`,
              ),
              h(
                'span',
                { class: 'item-meta' },
                h('span', {}, new Date(run.inicio).toLocaleString('pt-PT')),
                h('span', { class: 'mini-total', 'data-tipo': 'OK' }, `${totais.OK} OK`),
                h('span', { class: 'mini-total', 'data-tipo': 'KO' }, `${totais.KO} KO`),
                h('span', { class: 'mini-total', 'data-tipo': 'ERRO' }, `${totais.ERRO} ERRO`),
              ),
            );
          }),
        ),
      ),
    );
  }
}
