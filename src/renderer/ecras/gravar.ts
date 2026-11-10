// Ecrã Gravar: escolher a aplicação e o bloco, abrir o browser e acompanhar os passos gravados.
import type { Bloco, EstadoGravador, Passo } from '../../shared/modelo.js';
import type { Contexto } from '../app.js';
import { confirmar, h, mensagemDeErro, plural } from '../dom.js';

const NOMES_ACAO: Record<Passo['acao'], string> = {
  navegar: 'Abrir',
  escrever: 'Escrever',
  escolher: 'Escolher',
  marcar: 'Marcar',
  clicar: 'Clicar',
  verificar: 'Verificar',
  guardar: 'Guardar',
  esperar: 'Esperar',
};

let deixarDeOuvir: (() => void) | null = null;

/** Lista de passos de um bloco (também usada noutros ecrãs). */
export function listaDePassos(bloco: Bloco, aoRemover?: (passo: Passo) => void): HTMLElement {
  if (bloco.passos.length === 0) {
    return h('p', { class: 'suave' }, 'Ainda não há passos. Clica num elemento da página, no browser que se abriu.');
  }
  return h(
    'ol',
    { class: 'lista-passos' },
    bloco.passos.map((passo, indice) =>
      h(
        'li',
        { class: 'passo', 'data-acao': passo.acao },
        h('span', { class: 'passo-numero' }, indice + 1),
        h('span', { class: 'passo-acao' }, NOMES_ACAO[passo.acao]),
        h(
          'span',
          { class: 'passo-texto' },
          passo.descricao,
          passo.alvo && h('span', { class: 'passo-meta' }, plural(passo.alvo.localizadores.length, 'localizador', 'localizadores')),
        ),
        aoRemover &&
          h(
            'button',
            { type: 'button', class: 'botao botao-discreto-claro', 'aria-label': `Remover o passo ${indice + 1}`, onclick: () => aoRemover(passo) },
            'Remover',
          ),
      ),
    ),
  );
}

export async function ecraGravar({ estado, corpo, acoes, atualizar }: Contexto): Promise<void> {
  const api = window.uatStudio;
  deixarDeOuvir?.();
  deixarDeOuvir = null;

  const gravacao = await api.gravador.estado();
  if (gravacao.ativo) {
    desenharGravacao(gravacao);
    deixarDeOuvir = api.gravador.aoAtualizar((novo) => {
      // Só redesenha se este ecrã ainda estiver à vista.
      if (corpo.isConnected && corpo.querySelector('#gravacao-ativa')) desenharGravacao(novo);
    });
    return;
  }
  await desenharFormulario();

  function desenharGravacao(g: EstadoGravador): void {
    const bloco = g.bloco;
    if (!g.ativo || !bloco) {
      void atualizar();
      return;
    }
    const terminar = async (guardar: boolean): Promise<void> => {
      if (!guardar && bloco.passos.length > 0) {
        const sim = await confirmar('Cancelar gravação', 'Os passos gravados nesta sessão perdem-se.', 'Cancelar gravação');
        if (!sim) return;
      }
      await api.gravador.terminar(guardar);
      await atualizar();
    };
    acoes.replaceChildren(
      h('button', { type: 'button', class: 'botao', onclick: () => void terminar(false) }, 'Cancelar'),
      h(
        'button',
        { id: 'btn-guardar-bloco', type: 'button', class: 'botao botao-primario', disabled: bloco.passos.length === 0, onclick: () => void terminar(true) },
        'Terminar e guardar bloco',
      ),
    );
    corpo.replaceChildren(
      h(
        'section',
        { id: 'gravacao-ativa', class: 'cartao' },
        h(
          'header',
          { class: 'cartao-topo' },
          h(
            'div',
            {},
            h('h2', {}, `A gravar o bloco "${bloco.nome}"`),
            h(
              'p',
              { class: 'suave' },
              g.browserAberto
                ? `Aplicação: ${g.aplicacaoNome}. Vai ao browser, clica num elemento e escolhe a ação no popup.`
                : 'O browser foi fechado. Podes guardar o bloco ou cancelar.',
            ),
          ),
          h('span', { class: 'etiqueta', id: 'contagem-passos' }, plural(bloco.passos.length, 'passo')),
        ),
        g.mensagem && h('p', { class: 'aviso-erro', role: 'alert' }, g.mensagem),
        listaDePassos(bloco, (passo) => void api.gravador.removerPasso(passo.id)),
      ),
    );
  }

  async function desenharFormulario(): Promise<void> {
    const [aplicacoes, blocos] = await Promise.all([api.dados.listar('aplicacoes'), api.dados.listar('blocos')]);
    const ambiente = estado.projeto.ambientes.find((a) => a.id === estado.projeto.ambienteAtivo);
    const comBrowser = aplicacoes.filter((a) => a.tipo === 'FO' || a.tipo === 'BO');
    const blocosUi = blocos.filter((b) => b.tipo === 'UI');

    if (comBrowser.length === 0) {
      corpo.append(
        h(
          'div',
          { class: 'vazio' },
          h('p', { class: 'vazio-titulo' }, 'Falta uma aplicação para gravar'),
          h('p', {}, 'O projeto ainda não tem nenhuma aplicação de Front Office ou Backoffice.'),
        ),
      );
      return;
    }

    const erro = h('p', { class: 'aviso-erro', role: 'alert', hidden: true });
    const escolhaAplicacao = h(
      'select',
      { id: 'gravar-aplicacao', class: 'campo' },
      comBrowser.map((a) => h('option', { value: a.id }, `${a.nome}${ambiente && a.urls[ambiente.id] ? '' : ' (sem endereço neste ambiente)'}`)),
    );
    const escolhaBloco = h(
      'select',
      { id: 'gravar-bloco', class: 'campo' },
      h('option', { value: '' }, 'Criar um bloco novo'),
      blocosUi.map((b) => h('option', { value: b.id }, `Acrescentar passos a "${b.nome}"`)),
    );
    const nomeNovo = h('input', { id: 'gravar-nome', type: 'text', class: 'campo', maxlength: 80, placeholder: 'Por exemplo: Login Front Office' });
    const zonaNome = h('div', { class: 'campo-grupo' }, h('label', { for: 'gravar-nome' }, 'Nome do bloco novo'), nomeNovo);
    const abrirAplicacao = h('input', { id: 'gravar-abrir', type: 'checkbox', checked: true });
    const zonaAbrir = h('label', { class: 'opcao' }, abrirAplicacao, 'O bloco começa por abrir a aplicação (desliga se o bloco continua num ecrã já aberto)');
    const escolhaBrowser = h(
      'select',
      { id: 'gravar-browser', class: 'campo' },
      h('option', { value: 'msedge' }, 'Microsoft Edge'),
      h('option', { value: 'chrome' }, 'Google Chrome'),
    );
    escolhaBloco.addEventListener('change', () => {
      zonaNome.hidden = escolhaBloco.value !== '';
      zonaAbrir.hidden = escolhaBloco.value !== '';
    });

    const botao = h('button', { id: 'btn-gravar', type: 'submit', class: 'botao botao-primario' }, 'Começar a gravar');
    corpo.append(
      h(
        'form',
        {
          class: 'cartao formulario',
          onsubmit: async (evento: Event) => {
            evento.preventDefault();
            erro.hidden = true;
            let confirmouProducao = false;
            if (ambiente?.tipo === 'PRD') {
              confirmouProducao = await confirmar(
                'Ambiente de PRODUÇÃO',
                `O ambiente ativo (${ambiente.nome}) é de produção. Tens a certeza de que queres gravar aqui?`,
                'Gravar em produção',
              );
              if (!confirmouProducao) return;
            }
            botao.disabled = true;
            botao.textContent = 'A abrir o browser…';
            try {
              await api.gravador.iniciar({
                aplicacaoId: escolhaAplicacao.value,
                blocoId: escolhaBloco.value || undefined,
                nomeNovo: nomeNovo.value,
                abrirAplicacao: abrirAplicacao.checked,
                canal: escolhaBrowser.value === 'chrome' ? 'chrome' : 'msedge',
                confirmouProducao,
              });
              await atualizar();
            } catch (e) {
              erro.textContent = mensagemDeErro(e);
              erro.hidden = false;
              botao.disabled = false;
              botao.textContent = 'Começar a gravar';
            }
          },
        },
        h('h2', {}, 'Gravar um bloco de UI'),
        h(
          'p',
          { class: 'suave' },
          'Abre-se o browser na aplicação. Passa o rato para realçar um elemento, clica e escolhe o que fazer: escrever, escolher, marcar, clicar, verificar ou guardar numa variável.',
        ),
        erro,
        h('div', { class: 'campo-grupo' }, h('label', { for: 'gravar-aplicacao' }, `Aplicação (ambiente ${ambiente?.nome ?? '?'})`), escolhaAplicacao),
        h('div', { class: 'campo-grupo' }, h('label', { for: 'gravar-bloco' }, 'Bloco'), escolhaBloco),
        zonaNome,
        zonaAbrir,
        h('div', { class: 'campo-grupo' }, h('label', { for: 'gravar-browser' }, 'Browser'), escolhaBrowser),
        botao,
      ),
    );
  }
}
