// Ecrã Runs e resultados: escolher o que correr, acompanhar ao vivo e ver o histórico e os detalhes.
import { descreverLocalizador, estadoDoReparo, juntarReparos } from '../../shared/blocos.js';
import type { AmbitoRun, Bloco, EstadoRun, OpcoesRun, ResultadoCaso } from '../../shared/modelo.js';
import type { Contexto } from '../app.js';
import { EXPLICACAO_RESULTADO, rotuloComSimbolo, SIMBOLO_RESULTADO } from '../../shared/estados.js';
import { confirmar, h, info, maisOpcoes, mensagemDeErro, normalizarPesquisa, pedirFormulario, plural } from '../dom.js';
import { cartaoCobertura, cartaoComparacao } from './cobertura.js';

const NOMES_ESTADO: Record<ResultadoCaso['estado'], string> = {
  'por-correr': 'Por correr',
  'a-correr': 'A correr',
  OK: rotuloComSimbolo('OK'),
  KO: rotuloComSimbolo('KO'),
  ERRO: rotuloComSimbolo('ERRO'),
  PARADO: 'Parado',
  SALTADO: 'Saltado',
};

let deixarDeOuvir: (() => void) | null = null;
/** Caso com os detalhes abertos (mantém-se entre atualizações ao vivo). */
let casoAberto: string | null = null;
/** Filtro da lista de casos (mantém-se nas atualizações ao vivo e ao mudar de ecrã). */
type FiltroCasos = 'todos' | 'OK' | 'KO' | 'ERRO' | 'outros';
let filtroCasos: FiltroCasos = 'todos';
let pesquisaCasos = '';
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

export async function ecraRuns({ estado, corpo, acoes, selecao, irPara }: Contexto): Promise<void> {
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
  /** Passos manuais à espera (zona própria: só é redesenhada quando a lista muda, para não apagar o que se está a escrever). */
  const zonaManual = h('div', { id: 'zona-manual' });
  let manuaisDesenhados = '';
  const zonaHistorico = h('div', {});
  const zonaCobertura = h('div', {});
  /** Histórico mais recente (para a comparação e a matriz de cobertura). */
  let historicoAtual = historico;
  corpo.append(zonaFormulario, zonaManual, zonaRun, zonaHistorico, zonaCobertura);

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
      h('option', { value: 'tudo' }, 'Tudo (todos os cenários)'),
      epicos.map((e) => h('option', { value: `epico:${e.id}` }, `Épico: ${e.nome}`)),
      jornadas.map((j) =>
        h('option', { value: `jornada:${j.id}`, selected: j.id === selecao.jornadaId }, `Cenário: ${j.nome} (${plural(numeroDeCasos(j.id), 'caso')})`),
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
    const grupo = (id: string, rotulo: string, campo: HTMLElement, ajuda = ''): HTMLElement => h('div', { class: 'campo-grupo' }, h('label', { for: id }, rotulo, ajuda && info(ajuda)), campo);

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
        h('h2', {}, 'Nova execução', info("\"Verificar\" mostra o que falta (colunas, segredos, endereços) sem correr nada. \"Correr\" verifica primeiro e só depois executa.")),
        erro,
        h(
          'div',
          { class: 'grelha-run' },
          grupo('run-ambito', `O que correr (ambiente ${ambiente?.nome ?? '?'})`, ambito, 'Tudo, um épico inteiro ou um cenário. Em "Mais opções" pode escolher só alguns casos ou etiquetas.'),
          grupo('run-paralelo', 'Em paralelo', paralelo, 'Quantos casos correm ao mesmo tempo, cada um no seu browser. Mais rápido, mas usa mais memória; com 1 é mais fácil acompanhar.'),
        ),
        maisOpcoes(
          [],
          h(
            'div',
            { class: 'grelha-run' },
            grupo('run-casos', 'Só estes casos (IDs)', casos, 'IDs separados por vírgulas, por exemplo TC0001, TC0005. Vazio: todos.'),
            grupo('run-etiquetas', 'Só com estas etiquetas', etiquetas, 'Corre só os casos com pelo menos uma destas etiquetas (por exemplo aprovado, CP). Vazio: todos.'),
            grupo('run-browser', 'Browser', browser, 'O browser já instalado no PC. O Edge é o que vem com o Windows.'),
            grupo('run-modo', 'Modo', modo, 'Em background não abre janelas (pode continuar a trabalhar); visível mostra o browser, útil para acompanhar ou aprender.'),
            grupo('run-velocidade', 'Velocidade', velocidade, 'Lenta e passo a passo servem para ver o que cada passo faz. Pausa sempre entre passos, nunca a meio de uma ação.'),
            h('label', { class: 'opcao opcao-run' }, pausarNoErro, 'Pausar quando um caso ficar bloqueado (ERRO)', info('A execução pára no primeiro caso bloqueado, para poder ver o browser nesse momento antes de continuar.')),
          ),
        ),
        h('div', { class: 'acoes' }, botao, botaoVerificar),
        zonaVerificacao,
      ),
    );
  }

  function atualAtiva(): boolean {
    return execucaoAtiva;
  }

  function desenharManuais(run: EstadoRun | null): void {
    const pendentes = run?.ativo ? run.casos.filter((c) => c.aguardaManual) : [];
    const chave = pendentes.map((c) => `${c.chave}|${c.aguardaManual?.desde}`).join(',');
    if (chave === manuaisDesenhados) return;
    manuaisDesenhados = chave;
    zonaManual.replaceChildren(
      ...pendentes.map((caso) => {
        const pedido = caso.aguardaManual;
        if (!pedido) return h('span', {});
        const nota = h('textarea', { class: 'campo campo-area manual-nota', rows: 2, placeholder: 'Observação (opcional; obrigatória para KO)', 'aria-label': 'Observação' });
        const anexar = h('input', { type: 'checkbox', class: 'manual-anexar' });
        const erro = h('p', { class: 'aviso-erro', role: 'alert', hidden: true });
        const responder = async (ok: boolean): Promise<void> => {
          if (!ok && !nota.value.trim()) {
            erro.textContent = 'Para marcar KO, escreve o que viste de errado.';
            erro.hidden = false;
            nota.focus();
            return;
          }
          try {
            const resultado = await api.runs.responderManual(caso.chave, ok, nota.value, anexar.checked);
            if (resultado === null) return; // cancelou a escolha do ficheiro
            manuaisDesenhados = '';
            desenharManuais(resultado);
          } catch (e) {
            erro.textContent = mensagemDeErro(e);
            erro.hidden = false;
          }
        };
        return h(
          'section',
          { class: 'cartao caixa-manual', 'data-chave': caso.chave, role: 'alert' },
          h('h2', {}, `Passo manual: ${pedido.bloco}`),
          h('p', { class: 'suave' }, `${caso.jornadaNome} › ${caso.casoId}${caso.worker ? ` · worker ${caso.worker}` : ''} · à espera desde ${new Date(pedido.desde).toLocaleTimeString('pt-PT')}`),
          h('p', { class: 'manual-instrucao' }, pedido.instrucao),
          nota,
          h('label', { class: 'opcao' }, anexar, 'Anexar um print (escolher uma imagem do disco)'),
          erro,
          h(
            'div',
            { class: 'acoes' },
            h('button', { type: 'button', class: 'botao botao-primario botao-manual-ok', onclick: () => void responder(true) }, 'Confirmar OK'),
            h('button', { type: 'button', class: 'botao botao-perigo botao-manual-ko', onclick: () => void responder(false) }, 'Marcar KO'),
          ),
        );
      }),
    );
  }

  function desenharRun(): void {
    acoes.replaceChildren();
    const run = runMostrado;
    desenharManuais(run);
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
        h(
          'button',
          {
            id: 'btn-pdf',
            type: 'button',
            class: 'botao',
            title: 'Relatório de UAT em PDF, com o ID do requisito, a decisão e as linhas para assinar.',
            onclick: async (evento: Event) => {
              const botao = evento.currentTarget as HTMLButtonElement;
              botao.disabled = true;
              try {
                await api.runs.pdf(pasta);
                botao.dataset.feito = 'sim';
              } catch (e) {
                await confirmar('Não foi possível fazer o PDF', mensagemDeErro(e), 'Fechar');
              } finally {
                botao.disabled = false;
              }
            },
          },
          'PDF para assinatura',
        ),
      );
    }
    const total = (rotulo: string, valor: number, tipo: string, explicacao = ''): HTMLElement => h('div', { class: 'total', 'data-tipo': tipo, title: explicacao }, h('strong', {}, valor), rotulo);
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
          total(rotuloComSimbolo('OK'), totais.OK, 'OK', EXPLICACAO_RESULTADO.OK),
          total(rotuloComSimbolo('KO'), totais.KO, 'KO', EXPLICACAO_RESULTADO.KO),
          total(rotuloComSimbolo('ERRO'), totais.ERRO, 'ERRO', EXPLICACAO_RESULTADO.ERRO),
          totais.PARADO > 0 && total('parados', totais.PARADO, ''),
          (totais.SALTADO ?? 0) > 0 && total('saltados', totais.SALTADO, ''),
        ),
        cartaoComparacao(run, historicoAtual),
        cartaoReparos(run),
        cartaoDefeitos(run),
        zonaCasos(run),
      ),
    );
  }

  /** Defeitos criados nesta execução (com "Criar defeito"): título e botão para abrir o texto. */
  function cartaoDefeitos(run: EstadoRun): HTMLElement | false {
    if (run.ativo || !run.pasta) return false;
    const pasta = run.pasta;
    const zona = h('div', { class: 'caixa-defeitos', id: 'defeitos-da-execucao', hidden: true });
    void api.runs.defeitos(pasta).then((lista) => {
      if (lista.length === 0) return;
      zona.hidden = false;
      zona.replaceChildren(
        h('h3', {}, `Defeitos criados (${lista.length})`),
        h(
          'ul',
          { class: 'lista-itens' },
          lista.map((d) =>
            h(
              'li',
              { class: 'item' },
              h('span', { class: 'item-nome' }, d.titulo || d.casoId),
              h('button', { type: 'button', class: 'botao botao-pequeno-livre', onclick: () => void api.runs.abrir(pasta, d.pastaCaso, 'defeito.txt') }, 'Abrir texto'),
              h('button', { type: 'button', class: 'botao botao-pequeno-livre', onclick: () => void api.runs.abrir(pasta, d.pastaCaso) }, 'Evidências'),
            ),
          ),
        ),
      );
    });
    return zona;
  }

  /** Lista de casos com filtros (estado e texto) e o detalhe do caso aberto num painel ao lado. */
  function zonaCasos(run: EstadoRun): HTMLElement {
    const grupoDe = (estado: ResultadoCaso['estado']): FiltroCasos => (estado === 'OK' || estado === 'KO' || estado === 'ERRO' ? estado : 'outros');
    const conta = (fx: FiltroCasos): number => (fx === 'todos' ? run.casos.length : run.casos.filter((c) => grupoDe(c.estado) === fx).length);
    const termos = normalizarPesquisa(pesquisaCasos).split(/\s+/).filter(Boolean);
    const visiveis = run.casos.filter((c) => {
      if (filtroCasos !== 'todos' && grupoDe(c.estado) !== filtroCasos) return false;
      const texto = normalizarPesquisa(`${c.casoId} ${c.casoNome ?? ''} ${c.jornadaNome}`);
      return termos.every((t) => texto.includes(t));
    });
    const opcao = (fx: FiltroCasos, nome: string): HTMLElement | false =>
      (fx === 'todos' || conta(fx) > 0) &&
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'separador',
          'data-filtro': fx,
          'aria-selected': String(filtroCasos === fx),
          onclick: () => {
            filtroCasos = fx;
            desenharRun();
          },
        },
        `${nome} (${conta(fx)})`,
      );
    const pesquisa = h('input', { type: 'search', id: 'filtro-casos', class: 'campo campo-filtro', placeholder: 'Procurar caso (ID, descrição, cenário)', 'aria-label': 'Procurar caso', value: pesquisaCasos });
    pesquisa.addEventListener('change', () => {
      pesquisaCasos = pesquisa.value;
      desenharRun();
    });
    const filtros =
      run.casos.length > 3 &&
      h(
        'div',
        { class: 'barra-filtros' },
        h(
          'div',
          { class: 'separadores', role: 'tablist', 'aria-label': 'Filtrar casos pelo resultado' },
          opcao('todos', 'Todos'),
          opcao('OK', rotuloComSimbolo('OK')),
          opcao('KO', rotuloComSimbolo('KO')),
          opcao('ERRO', rotuloComSimbolo('ERRO')),
          opcao('outros', 'Outros'),
        ),
        pesquisa,
      );
    const aberto = run.casos.find((c) => c.chave === casoAberto);
    const painel =
      aberto &&
      h(
        'aside',
        { class: 'painel-caso', 'aria-label': `Detalhe do caso ${aberto.casoId}` },
        h(
          'header',
          { class: 'painel-caso-topo' },
          h('span', { class: 'estado-caso', 'data-estado': aberto.estado }, NOMES_ESTADO[aberto.estado]),
          h('strong', {}, aberto.casoId),
          h('span', { class: 'suave' }, aberto.casoNome ?? aberto.jornadaNome),
          h('button', { type: 'button', class: 'botao botao-icone botao-fechar-painel', 'aria-label': 'Fechar o detalhe', title: 'Fechar', onclick: () => { casoAberto = null; desenharRun(); } }, '×'),
        ),
        (() => {
          const zona = h('div', { class: 'caso-detalhe' });
          desenharDetalhe(run, aberto, zona);
          return zona;
        })(),
      );
    return h(
      'div',
      { class: painel ? 'casos-zona com-painel' : 'casos-zona' },
      h(
        'div',
        { class: 'casos-lista' },
        filtros,
        visiveis.length === 0 ? h('p', { class: 'suave' }, 'Nenhum caso corresponde ao filtro.') : h('ul', { class: 'lista-casos' }, visiveis.map((caso) => linhaCaso(run, caso))),
      ),
      painel,
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
        'Nestes passos o localizador preferido já não encontrou o elemento (o ecrã mudou?) e foi usada uma alternativa. "Reparar" passa a usar a alternativa em primeiro lugar; o antigo fica como último recurso. A alteração vale para todos os cenários que usam o bloco.',
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
    const podeSaltar = run.ativo && (caso.estado === 'por-correr' || caso.estado === 'a-correr');
    return h(
      'li',
      { class: 'caso', 'data-estado': caso.estado, 'data-chave': caso.chave, 'data-aberto': String(aberto) },
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
        h('span', { class: 'estado-caso', title: caso.estado === 'OK' || caso.estado === 'KO' || caso.estado === 'ERRO' ? EXPLICACAO_RESULTADO[caso.estado] : '' }, NOMES_ESTADO[caso.estado]),
        h('strong', {}, caso.casoId),
        h('span', { class: 'caso-nome' }, caso.casoNome ?? ''),
        h('span', { class: 'caso-resumo suave' }, resumo),
        h('span', { class: 'suave' }, `${caso.jornadaNome}${caso.duracaoMs ? ` · ${duracao(caso.duracaoMs)}` : ''}`),
      ),
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
    if (caso.sugestoes?.length) {
      zona.append(h('div', { class: 'caixa-sugestoes' }, h('strong', {}, 'Sugestão'), h('ul', {}, caso.sugestoes.map((s) => h('li', {}, s)))));
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
          h(
            'button',
            {
              type: 'button',
              class: 'botao botao-pequeno-livre botao-copiar-log',
              onclick: async (evento: Event) => {
                const botao = evento.currentTarget as HTMLButtonElement;
                try {
                  await navigator.clipboard.writeText(await api.runs.lerTexto(pasta, pastaCaso, 'caso.log'));
                  botao.textContent = 'Log copiado';
                } catch {
                  botao.textContent = 'Não foi possível copiar';
                }
                setTimeout(() => (botao.textContent = 'Copiar log'), 2000);
              },
            },
            'Copiar log',
          ),
          (caso.estado === 'KO' || caso.estado === 'ERRO') &&
            h(
              'button',
              {
                type: 'button',
                class: 'botao botao-pequeno-livre botao-defeito',
                title: 'Texto pronto a colar na ferramenta de defeitos (Jira, Azure DevOps...) e as evidências a anexar.',
                onclick: () => void criarDefeito(pasta, caso.chave),
              },
              'Criar defeito',
            ),
          traces.map((t) =>
            h(
              'button',
              {
                type: 'button',
                class: 'botao botao-pequeno-livre botao-trace',
                'data-trace': t,
                title: 'Gravação passo a passo do Playwright (ações, prints e pedidos de rede)',
                onclick: () => void api.runs.abrirTrace(pasta, pastaCaso, t).catch((e) => confirmar('Não foi possível abrir o trace', mensagemDeErro(e), 'Fechar')),
              },
              traces.length > 1 ? `Abrir trace ${t.replace(/D/g, '')}` : 'Abrir trace',
            ),
          ),
          !run.ativo &&
            h(
              'button',
              {
                type: 'button',
                class: 'botao botao-pequeno-livre botao-repetir-caso',
                disabled: atualAtiva(),
                onclick: async () => {
                  try {
                    await iniciar({ chavesCasos: [caso.chave] }, { ...run.opcoes, paralelo: 1, confirmouProducao: false });
                  } catch (e) {
                    await confirmar('Não foi possível repetir', mensagemDeErro(e), 'Fechar');
                  }
                },
              },
              'Repetir só este caso',
            ),
        ),
      );
    }
    const retomar = caixaRetomar(run, caso);
    if (retomar) zona.append(retomar);
    const regravar = botaoRegravar(run, caso);
    if (regravar) zona.querySelector('.caixa-sugestoes')?.append(regravar);
  }

  /**
   * "Regravar este elemento": quando o caso parou porque um elemento não foi encontrado (ou há vários iguais),
   * abre o gravador, repete os passos anteriores do bloco com os dados deste caso e pede para apontar o elemento.
   */
  /** "Criar defeito": mostra o texto sugerido (editável), copia-o e grava-o em defeito.txt; abre a pasta das evidências. */
  async function criarDefeito(pastaRun: string, chave: string): Promise<void> {
    try {
      const d = await api.runs.defeito(pastaRun, chave);
      const valores = await pedirFormulario(
        'Criar defeito',
        [
          { id: 'titulo', rotulo: 'Título', valor: d.titulo, obrigatorio: true },
          {
            id: 'texto',
            rotulo: 'Descrição (reveja antes de enviar)',
            tipo: 'area',
            valor: d.texto,
            ajuda: `Ao confirmar, o texto é copiado (para colar na ferramenta de defeitos), gravado em defeito.txt e abre-se a pasta do caso com as evidências: ${d.evidencias.join(', ')}.`,
          },
        ],
        'Copiar e abrir as evidências',
      );
      if (!valores) return;
      await api.runs.guardarDefeito(pastaRun, chave, valores.titulo, valores.texto);
      await navigator.clipboard.writeText(`${valores.titulo}\n\n${valores.texto}`).catch(() => undefined);
    } catch (e) {
      await confirmar('Não foi possível criar o defeito', mensagemDeErro(e), 'Fechar');
    }
  }

  function botaoRegravar(run: EstadoRun, caso: ResultadoCaso): HTMLElement | null {
    const erro = caso.erro;
    if (run.ativo || !erro?.blocoId || !erro.passoId || !/Não encontrei o elemento|Há d+ elementos que correspondem/.test(erro.mensagem)) return null;
    const bloco = blocos.get(erro.blocoId);
    if (bloco?.tipo !== 'UI' || !bloco.aplicacaoId || !bloco.passos.some((p) => p.id === erro.passoId && p.alvo)) return null;
    return h(
      'button',
      {
        type: 'button',
        class: 'botao botao-pequeno-livre botao-regravar',
        onclick: async () => {
          // Os valores do caso: os dados do Excel, as variáveis guardadas e os parâmetros do bloco nesta jornada.
          const valores: Record<string, string> = { ...(conjuntos.find((c) => c.id === caso.jornadaId)?.casos.find((c) => c.id === caso.casoId)?.dados ?? {}), ...caso.variaveis, TESTE: caso.casoId };
          const item = jornadas.find((j) => j.id === caso.jornadaId)?.blocos.find((b) => b.blocoId === bloco.id);
          for (const [nome, valor] of Object.entries(item?.parametros ?? {})) {
            if (valor.tipo === 'fixo') valores[nome] = valor.valor;
            else if (valor.tipo === 'variavel' && valores[valor.nome] !== undefined) valores[nome] = valores[valor.nome];
          }
          try {
            await api.gravador.iniciar({ aplicacaoId: bloco.aplicacaoId ?? '', blocoId: bloco.id, abrirAplicacao: false, canal: run.opcoes.canal, regravar: { passoId: erro.passoId ?? '', valores } });
            irPara('gravar');
          } catch (e) {
            await confirmar('Não foi possível regravar', mensagemDeErro(e), 'Fechar');
          }
        },
      },
      'Regravar este elemento',
    );
  }

  /**
   * Retomar a meio: corre outra vez este caso a partir de um bloco, com as variáveis guardadas
   * (por exemplo, o número do pedido criado no bloco 1). O browser começa vazio.
   */
  function caixaRetomar(run: EstadoRun, caso: ResultadoCaso): HTMLElement | null {
    if (run.ativo || !['KO', 'ERRO', 'PARADO', 'SALTADO'].includes(caso.estado)) return null;
    const jornada = jornadas.find((j) => j.id === caso.jornadaId);
    if (!jornada || jornada.blocos.length < 2) return null;
    // Por omissão, o bloco onde correu mal (o primeiro com erro/KO, ou o primeiro que não chegou a correr).
    const estados = caso.blocos ?? [];
    let sugerido = estados.findIndex((e) => e === 'erro' || e === 'ko');
    if (sugerido < 0) sugerido = estados.findIndex((e) => e === 'nao-corrido');
    const abreAplicacao = (i: number): boolean => {
      const b = blocos.get(jornada.blocos[i].blocoId);
      return b?.tipo === 'API' || b?.passos[0]?.acao === 'navegar';
    };
    const escolha = h(
      'select',
      { class: 'campo retomar-bloco', 'aria-label': 'Bloco onde recomeçar' },
      jornada.blocos.map((item, i) =>
        h('option', { value: i, selected: i === Math.max(0, sugerido) }, `${i + 1}. ${blocos.get(item.blocoId)?.nome ?? item.blocoId}${abreAplicacao(i) ? '' : ' (não abre a aplicação)'}`),
      ),
    );
    const variaveis = Object.keys(caso.variaveis);
    return h(
      'div',
      { class: 'caixa-retomar' },
      h('strong', {}, 'Retomar a partir do bloco'),
      escolha,
      h(
        'button',
        {
          type: 'button',
          class: 'botao botao-pequeno-livre botao-retomar',
          disabled: atualAtiva(),
          onclick: async () => {
            try {
              await iniciar({ retomar: { chave: caso.chave, desdeBloco: Number(escolha.value), variaveis: { ...caso.variaveis } } }, { ...run.opcoes, confirmouProducao: false });
            } catch (e) {
              await confirmar('Não foi possível retomar', mensagemDeErro(e), 'Fechar');
            }
          },
        },
        'Retomar',
      ),
      h(
        'p',
        { class: 'ajuda-campo' },
        `Os blocos anteriores não correm${variaveis.length > 0 ? ` e as variáveis guardadas são reutilizadas (${variaveis.map((v) => `{${v}}`).join(', ')})` : ''}. O browser começa vazio: escolhe um bloco que abra a aplicação.`,
      ),
    );
  }

  function desenharHistorico(runs: EstadoRun[]): void {
    historicoAtual = runs;
    zonaCobertura.replaceChildren(cartaoCobertura(jornadas, conjuntos, runs));
    if (runMostrado && !runMostrado.ativo) desenharRun();
    if (runs.length === 0) {
      zonaHistorico.replaceChildren();
      return;
    }
    zonaHistorico.replaceChildren(
      h(
        'section',
        { class: 'cartao' },
        h('header', { class: 'cartao-topo' }, h('h2', {}, 'Histórico', info("Todas as execuções deste projeto, a mais recente primeiro. Cada uma tem a sua pasta com logs, prints, traces e relatórios.")), h('span', { class: 'etiqueta' }, plural(runs.length, 'execução', 'execuções'))),
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
                h('span', { class: 'mini-total', 'data-tipo': 'OK', title: 'Passou' }, `${SIMBOLO_RESULTADO.OK} ${totais.OK}`),
                h('span', { class: 'mini-total', 'data-tipo': 'KO', title: 'Falhou' }, `${SIMBOLO_RESULTADO.KO} ${totais.KO}`),
                h('span', { class: 'mini-total', 'data-tipo': 'ERRO', title: 'Bloqueado' }, `${SIMBOLO_RESULTADO.ERRO} ${totais.ERRO}`),
              ),
            );
          }),
        ),
      ),
    );
  }
}
