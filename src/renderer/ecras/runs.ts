// Ecrã Runs e resultados: escolher o que correr, acompanhar ao vivo e ver o histórico e os detalhes.
import { descreverLocalizador, estadoDoReparo, juntarReparos } from '../../shared/blocos.js';
import type { AmbitoRun, Bloco, EstadoRun, OpcoesRun, ResultadoCaso } from '../../shared/modelo.js';
import type { Contexto } from '../app.js';
import { confirmar, h, mensagemDeErro, plural } from '../dom.js';

const NOMES_ESTADO: Record<ResultadoCaso['estado'], string> = {
  'por-correr': 'Por correr',
  'a-correr': 'A correr',
  OK: 'OK',
  KO: 'KO',
  ERRO: 'ERRO',
  PARADO: 'Parado',
  SALTADO: 'Saltado',
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

  const [epicos, jornadas, conjuntos, atual, historico, listaBlocos] = await Promise.all([
    api.dados.listar('epicos'),
    api.dados.listar('jornadas'),
    api.dados.listar('casos'),
    api.runs.estado(),
    api.runs.historico(),
    api.dados.listar('blocos'),
  ]);
  /** Blocos do projeto (para saber se um localizador já foi reparado). */
  const blocos = new Map<string, Bloco>(listaBlocos.map((b) => [b.id, b]));
  const ambiente = estado.projeto.ambientes.find((a) => a.id === estado.projeto.ambienteAtivo);
  const zonaFormulario = h('div', {});
  /** Há uma execução a correr neste momento (mesmo que se esteja a ver uma antiga)? */
  let execucaoAtiva = Boolean(atual?.ativo);
  /** Começa uma execução (usado pelo formulário e por "Repetir só KO/ERRO"). */
  const iniciar = async (pedido: AmbitoRun, opcoes: OpcoesRun): Promise<void> => {
    historicoAberto = null;
    casoAberto = null;
    runMostrado = await api.runs.iniciar(pedido, opcoes);
    execucaoAtiva = true;
    desenharFormulario(true);
    desenharRun();
  };
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
    execucaoAtiva = novo.ativo;
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
    const velocidade = h(
      'select',
      { id: 'run-velocidade', class: 'campo' },
      h('option', { value: 'normal' }, 'Normal'),
      h('option', { value: 'lenta' }, 'Lenta (1 segundo entre passos)'),
      h('option', { value: 'passo' }, 'Passo a passo (pára antes de cada passo)'),
    );
    const pausarNoErro = h('input', { id: 'run-pausar-erro', type: 'checkbox' });
    const botao = h('button', { id: 'btn-correr', type: 'submit', class: 'botao botao-primario', disabled: aCorrer }, aCorrer ? 'A correr…' : 'Correr');
    const botaoVerificar = h('button', { id: 'btn-verificar', type: 'button', class: 'botao', disabled: aCorrer }, 'Verificar');
    const zonaVerificacao = h('div', { id: 'zona-verificacao', class: 'zona-verificacao' });
    const grupo = (id: string, rotulo: string, campo: HTMLElement): HTMLElement => h('div', { class: 'campo-grupo' }, h('label', { for: id }, rotulo), campo);

    /** O que foi escolhido para correr. */
    const lerAmbito = (): AmbitoRun => {
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
      return pedido;
    };

    /** Mostra o resultado da verificação. Devolve true se não houver erros. */
    const verificar = async (aoCorrerNaMesma?: () => void): Promise<boolean> => {
      zonaVerificacao.replaceChildren(h('p', { class: 'suave', role: 'status' }, 'A verificar…'));
      const resultado = await api.runs.verificar(lerAmbito());
      const erros = resultado.problemas.filter((p) => p.gravidade === 'erro');
      const avisos = resultado.problemas.filter((p) => p.gravidade === 'aviso');
      const titulo =
        erros.length > 0
          ? `Há ${plural(erros.length, 'problema')} que ${erros.length === 1 ? 'impede' : 'impedem'} casos de correr`
          : avisos.length > 0
            ? `Pode correr (${plural(resultado.casos, 'caso')}), com ${plural(avisos.length, 'aviso')}`
            : `Está tudo pronto para correr ${plural(resultado.casos, 'caso')}`;
      zonaVerificacao.replaceChildren(
        h(
          'div',
          { id: 'resultado-verificacao', class: 'verificacao', 'data-estado': erros.length > 0 ? 'erro' : avisos.length > 0 ? 'aviso' : 'ok', role: 'status' },
          h('p', { class: 'verificacao-titulo' }, titulo),
          resultado.problemas.length > 0 &&
            h(
              'ul',
              { class: 'lista-problemas' },
              resultado.problemas.map((p) => h('li', { 'data-gravidade': p.gravidade }, h('strong', {}, `${p.onde}: `), p.mensagem)),
            ),
          erros.length > 0 &&
            aoCorrerNaMesma &&
            h('button', { id: 'btn-correr-na-mesma', type: 'button', class: 'botao', onclick: aoCorrerNaMesma }, 'Correr mesmo assim'),
        ),
      );
      return erros.length === 0;
    };
    botaoVerificar.addEventListener('click', () => {
      void verificar().catch((e) => zonaVerificacao.replaceChildren(h('p', { class: 'aviso-erro', role: 'alert' }, mensagemDeErro(e))));
    });

    zonaFormulario.replaceChildren(
      h(
        'form',
        {
          class: 'cartao',
          onsubmit: async (evento: Event) => {
            evento.preventDefault();
            erro.hidden = true;
            const pedido = lerAmbito();
            const correr = async (): Promise<void> => {
              let confirmouProducao = false;
              if (ambiente?.tipo === 'PRD') {
                confirmouProducao = await confirmar('Ambiente de PRODUÇÃO', `O ambiente ativo (${ambiente.nome}) é de produção. Tens a certeza de que queres correr testes aqui?`, 'Correr em produção');
                if (!confirmouProducao) return;
              }
              botao.disabled = true;
              try {
                await iniciar(pedido, {
                  canal: browser.value === 'chrome' ? 'chrome' : 'msedge',
                  visivel: modo.value === 'visivel',
                  paralelo: Number(paralelo.value),
                  velocidade: velocidade.value === 'lenta' ? 'lenta' : velocidade.value === 'passo' ? 'passo' : 'normal',
                  pausarNoErro: pausarNoErro.checked,
                  confirmouProducao,
                });
              } catch (e) {
                erro.textContent = mensagemDeErro(e);
                erro.hidden = false;
                botao.disabled = false;
              }
            };
            // Antes de correr, verifica: se houver problemas que impedem casos de correr, mostra-os e deixa decidir.
            try {
              if (await verificar(() => void correr())) await correr();
            } catch (e) {
              erro.textContent = mensagemDeErro(e);
              erro.hidden = false;
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
          grupo('run-velocidade', 'Velocidade', velocidade),
          h('label', { class: 'opcao opcao-run' }, pausarNoErro, 'Pausar quando um caso der ERRO'),
        ),
        h('div', { class: 'acoes' }, botao, botaoVerificar),
        zonaVerificacao,
      ),
    );
  }

  function atualAtiva(): boolean {
    return execucaoAtiva;
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
        run.emPausa
          ? h('button', { id: 'btn-continuar', type: 'button', class: 'botao botao-primario', onclick: () => void api.runs.continuar() }, 'Continuar')
          : h('button', { id: 'btn-pausar', type: 'button', class: 'botao', disabled: run.aParar, title: 'Pára entre passos, nunca a meio de uma ação.', onclick: () => void api.runs.pausar() }, 'Pausar'),
        h('button', { id: 'btn-parar', type: 'button', class: 'botao botao-perigo', disabled: run.aParar, onclick: () => void api.runs.parar() }, run.aParar ? 'A parar…' : 'Parar'),
      );
    } else if (pasta) {
      const falhados = run.casos.filter((c) => c.estado === 'KO' || c.estado === 'ERRO');
      const haOutraACorrer = atualAtiva();
      if (falhados.length > 0) {
        acoes.append(
          h(
            'button',
            {
              id: 'btn-repetir-falhados',
              type: 'button',
              class: 'botao botao-primario',
              disabled: haOutraACorrer,
              title: 'Corre outra vez só os casos que deram KO ou ERRO, com as mesmas opções.',
              onclick: async () => {
                try {
                  await iniciar({ chavesCasos: falhados.map((c) => c.chave) }, { ...run.opcoes, confirmouProducao: false });
                } catch (e) {
                  await confirmar('Não foi possível repetir', mensagemDeErro(e), 'Fechar');
                }
              },
            },
            `Repetir só KO/ERRO (${falhados.length})`,
          ),
        );
      }
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
          h('span', { class: 'etiqueta', id: 'run-progresso', 'data-pausa': String(run.ativo && run.emPausa) }, run.ativo ? `${run.emPausa ? 'Em pausa · ' : ''}${feitos} de ${run.casos.length}` : 'Terminada'),
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
          (totais.SALTADO ?? 0) > 0 && total('saltados', totais.SALTADO, ''),
        ),
        cartaoReparos(run),
        h(
          'ul',
          { class: 'lista-casos' },
          run.casos.map((caso) => linhaCaso(run, caso)),
        ),
      ),
    );
  }

  /**
   * "Localizadores a reparar": passos onde o localizador preferido falhou e uma alternativa funcionou.
   * Reparar com um clique põe a alternativa em primeiro lugar no bloco (vale para todas as jornadas).
   */
  function cartaoReparos(run: EstadoRun): HTMLElement | false {
    if (run.ativo) return false;
    const sugestoes = juntarReparos(run.casos.map((c) => c.reparos));
    if (sugestoes.length === 0) return false;
    const linhas = sugestoes.map((s, i) => {
      const estadoAtual = estadoDoReparo(blocos.get(s.blocoId), s);
      const botao = h(
        'button',
        {
          type: 'button',
          class: 'botao botao-pequeno-livre botao-reparar',
          disabled: estadoAtual !== 'por-reparar',
          'data-reparo': i,
          onclick: async () => {
            botao.setAttribute('disabled', '');
            try {
              const resultado = await api.blocos.reparar(s);
              botao.textContent = resultado === 'nao-encontrado' ? 'Passo já não existe' : 'Reparado';
              const atualizados = await api.dados.listar('blocos');
              blocos.clear();
              for (const b of atualizados) blocos.set(b.id, b);
            } catch (e) {
              botao.removeAttribute('disabled');
              await confirmar('Não foi possível reparar', mensagemDeErro(e), 'Fechar');
            }
          },
        },
        estadoAtual === 'ja-reparado' ? 'Reparado' : estadoAtual === 'nao-encontrado' ? 'Passo já não existe' : 'Reparar',
      );
      return h(
        'li',
        { class: 'item item-reparo' },
        h(
          'div',
          { class: 'item-nome' },
          h('strong', {}, `${s.blocoNome} › ${s.passoDescricao}`),
          h(
            'p',
            { class: 'suave' },
            `Falhou: ${descreverLocalizador(s.falhou)}. Funcionou: ${descreverLocalizador(s.usado)} (${plural(s.casos, 'caso')}).`,
          ),
        ),
        botao,
      );
    });
    return h(
      'div',
      { class: 'caixa-reparos', id: 'reparos' },
      h('h3', {}, `Localizadores a reparar (${sugestoes.length})`),
      h(
        'p',
        { class: 'suave' },
        'Nestes passos o localizador preferido já não encontrou o elemento (o ecrã mudou?) e foi usada uma alternativa. "Reparar" passa a usar a alternativa em primeiro lugar; o antigo fica como último recurso. A alteração vale para todas as jornadas que usam o bloco.',
      ),
      h('ul', { class: 'lista-itens' }, linhas),
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
    const podeSaltar = run.ativo && (caso.estado === 'por-correr' || caso.estado === 'a-correr');
    return h(
      'li',
      { class: 'caso', 'data-estado': caso.estado, 'data-chave': caso.chave },
      podeSaltar &&
        h(
          'button',
          {
            type: 'button',
            class: 'botao botao-pequeno-livre botao-saltar',
            'aria-label': `Saltar o caso ${caso.casoId}`,
            title: 'Este caso não corre (ou pára no próximo passo) e a execução segue para o seguinte.',
            onclick: () => void api.runs.saltar(caso.chave),
          },
          'Saltar',
        ),
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
