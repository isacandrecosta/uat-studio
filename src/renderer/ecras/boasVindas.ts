// Ecrã inicial: criar um projeto novo, abrir um existente ou voltar a um recente.
import { h, mensagemDeErro } from '../dom.js';

export async function mostrarBoasVindas(contentor: HTMLElement, aoEntrar: () => void): Promise<void> {
  const api = window.uatStudio.projeto;
  const recentes = await api.recentes();

  const erro = h('p', { class: 'aviso-erro', role: 'alert', hidden: true });
  const mostrarErro = (e: unknown): void => {
    erro.textContent = mensagemDeErro(e);
    erro.hidden = false;
  };
  const tentar = async (acao: () => Promise<unknown>): Promise<void> => {
    erro.hidden = true;
    try {
      await acao();
      aoEntrar();
    } catch (e) {
      mostrarErro(e);
    }
  };

  // Criar projeto
  const campoNome = h('input', { type: 'text', class: 'campo', id: 'novo-nome', required: true, maxlength: 80 });
  const campoPasta = h('input', {
    type: 'text',
    class: 'campo',
    id: 'novo-pasta',
    required: true,
    readonly: true,
    placeholder: 'Escolhe uma pasta vazia',
  });
  const comExemplo = h('input', { type: 'checkbox', id: 'novo-exemplo' });
  const formulario = h(
    'form',
    {
      class: 'cartao',
      onsubmit: (evento: Event) => {
        evento.preventDefault();
        void tentar(() => api.criar(campoPasta.value, campoNome.value, comExemplo.checked));
      },
    },
    h('h2', {}, 'Criar um projeto novo'),
    h('label', { for: 'novo-nome' }, 'Nome do projeto'),
    campoNome,
    h('label', { for: 'novo-pasta' }, 'Pasta onde fica guardado'),
    h(
      'div',
      { class: 'linha' },
      campoPasta,
      h(
        'button',
        {
          type: 'button',
          class: 'botao',
          onclick: async () => {
            const pasta = await api.escolherPasta();
            if (pasta) campoPasta.value = pasta;
          },
        },
        'Escolher…',
      ),
    ),
    h('label', { class: 'opcao' }, comExemplo, 'Incluir o exemplo do Simulador (jornada, bloco e casos prontos a correr)'),
    h('button', { type: 'submit', class: 'botao botao-primario' }, 'Criar projeto'),
  );

  // Abrir projeto
  const abrir = h(
    'div',
    { class: 'cartao' },
    h('h2', {}, 'Abrir um projeto'),
    h('p', { class: 'suave' }, 'Escolhe a pasta de um projeto que já existe (a que tem o ficheiro projeto.json).'),
    h(
      'button',
      {
        type: 'button',
        class: 'botao',
        onclick: async () => {
          const pasta = await api.escolherPasta();
          if (pasta) await tentar(() => api.abrir(pasta));
        },
      },
      'Abrir pasta…',
    ),
    recentes.length > 0 && h('h3', {}, 'Recentes'),
    recentes.length > 0 &&
      h(
        'ul',
        { class: 'lista-recentes' },
        recentes.map((r) =>
          h(
            'li',
            {},
            h(
              'button',
              { type: 'button', class: 'recente', onclick: () => void tentar(() => api.abrir(r.pasta)) },
              h('span', { class: 'recente-nome' }, r.nome),
              h('span', { class: 'recente-pasta' }, r.pasta),
            ),
          ),
        ),
      ),
  );

  contentor.replaceChildren(
    h(
      'div',
      { class: 'boas-vindas-caixa' },
      h(
        'header',
        { class: 'boas-vindas-topo' },
        h('span', { class: 'marca-logo' }, 'U'),
        h('div', {}, h('h1', {}, 'UAT Studio'), h('p', { class: 'suave' }, 'Escolhe o projeto em que queres trabalhar.')),
      ),
      erro,
      h('div', { class: 'boas-vindas-colunas' }, formulario, abrir),
    ),
  );
}
