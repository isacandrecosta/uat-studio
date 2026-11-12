// Pequenas ajudas para construir a interface sem bibliotecas.
import type { UsoDoBloco } from '../shared/blocos.js';

type Filho = Node | string | number | null | undefined | false;
type Atributos = Record<string, string | number | boolean | null | undefined | ((evento: Event) => void)>;

/**
 * Cria um elemento: h('button', { class: 'botao', onclick: () => ... }, 'Texto').
 * O texto é sempre inserido como texto (nunca como HTML).
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Atributos = {},
  ...filhos: Array<Filho | Filho[]>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (typeof valor === 'function') el.addEventListener(nome.replace(/^on/, ''), valor);
    else if (valor === true) el.setAttribute(nome, '');
    else el.setAttribute(nome, String(valor));
  }
  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined || filho === false) continue;
    el.append(filho instanceof Node ? filho : String(filho));
  }
  return el;
}

export function obter<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento em falta: #${id}`);
  return el as T;
}

/** Tira o prefixo técnico que o Electron põe nos erros vindos do processo principal. */
export function mensagemDeErro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro);
  return texto.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
}

/** "1 caso" / "3 casos" */
export function plural(n: number, singular: string, pluralTexto = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/** Janela pequena a pedir um texto. Devolve null se o utilizador cancelar. */
export function pedirTexto(titulo: string, rotulo: string, inicial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const campo = h('input', { type: 'text', class: 'campo', value: inicial, required: true, maxlength: 80 });
    // Nota: não se usa o evento "close" do <dialog>, que só dispara com a janela visível.
    const terminar = (texto: string | null): void => {
      dialogo.close();
      dialogo.remove();
      resolve(texto);
    };
    const dialogo = h(
      'dialog',
      { class: 'dialogo', oncancel: () => terminar(null) },
      h(
        'form',
        {
          onsubmit: (evento: Event) => {
            evento.preventDefault();
            const texto = campo.value.trim();
            if (texto) terminar(texto);
          },
        },
        h('h2', {}, titulo),
        h('label', {}, rotulo, campo),
        h(
          'div',
          { class: 'dialogo-botoes' },
          h('button', { type: 'button', class: 'botao', onclick: () => terminar(null) }, 'Cancelar'),
          h('button', { type: 'submit', class: 'botao botao-primario' }, 'Guardar'),
        ),
      ),
    );
    document.body.append(dialogo);
    dialogo.showModal();
    campo.select();
  });
}

export interface CampoFormulario {
  id: string;
  rotulo: string;
  /** `segredo` mostra pontos em vez do texto e nunca vem preenchido. */
  tipo?: 'texto' | 'escolha' | 'segredo' | 'area';
  opcoes?: Array<{ valor: string; texto: string }>;
  valor?: string;
  ajuda?: string;
  obrigatorio?: boolean;
}

/** Janela com vários campos. Devolve os valores por id, ou null se o utilizador cancelar. */
export function pedirFormulario(titulo: string, campos: CampoFormulario[], botao = 'Guardar'): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const entradas = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
    const linhas = campos.map((campo) => {
      const id = `form-${campo.id}`;
      const entrada =
        campo.tipo === 'area'
          ? h('textarea', { id, class: 'campo campo-area', rows: 5, required: campo.obrigatorio, spellcheck: 'true' }, campo.valor ?? '')
          : campo.tipo === 'escolha'
          ? h('select', { id, class: 'campo' }, (campo.opcoes ?? []).map((o) => h('option', { value: o.valor, selected: o.valor === campo.valor }, o.texto)))
          : h('input', {
              id,
              class: 'campo',
              type: campo.tipo === 'segredo' ? 'password' : 'text',
              value: campo.tipo === 'segredo' ? '' : (campo.valor ?? ''),
              required: campo.obrigatorio,
              autocomplete: 'off',
              spellcheck: 'false',
            });
      entradas.set(campo.id, entrada);
      return h('div', { class: 'campo-grupo' }, h('label', { for: id }, campo.rotulo), entrada, campo.ajuda && h('p', { class: 'ajuda-campo' }, campo.ajuda));
    });
    const terminar = (valores: Record<string, string> | null): void => {
      dialogo.close();
      dialogo.remove();
      resolve(valores);
    };
    const dialogo = h(
      'dialog',
      { class: 'dialogo dialogo-formulario', oncancel: () => terminar(null) },
      h(
        'form',
        {
          onsubmit: (evento: Event) => {
            evento.preventDefault();
            const valores: Record<string, string> = {};
            for (const [id, entrada] of entradas) valores[id] = entrada.value;
            terminar(valores);
          },
        },
        h('h2', {}, titulo),
        linhas,
        h(
          'div',
          { class: 'dialogo-botoes' },
          h('button', { type: 'button', class: 'botao', onclick: () => terminar(null) }, 'Cancelar'),
          h('button', { type: 'submit', class: 'botao botao-primario' }, botao),
        ),
      ),
    );
    document.body.append(dialogo);
    dialogo.showModal();
  });
}

/** Janela "Ver código (.ts)": mostra o código só para leitura, com botão para copiar. */
export function mostrarCodigo(titulo: string, codigo: string): void {
  const fechar = (): void => {
    dialogo.close();
    dialogo.remove();
  };
  const copiar = h(
    'button',
    {
      type: 'button',
      class: 'botao',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(codigo);
          copiar.textContent = 'Copiado';
        } catch {
          copiar.textContent = 'Não foi possível copiar';
        }
        setTimeout(() => (copiar.textContent = 'Copiar'), 2000);
      },
    },
    'Copiar',
  );
  const dialogo = h(
    'dialog',
    { class: 'dialogo dialogo-codigo', oncancel: fechar },
    h(
      'div',
      { class: 'dialogo-corpo' },
      h('h2', {}, titulo),
      h('p', { class: 'suave' }, 'Playwright (TypeScript) equivalente. É só para consulta: a ferramenta não precisa deste código para correr.'),
      h('pre', { class: 'codigo', tabindex: 0 }, h('code', {}, codigo)),
      h('div', { class: 'dialogo-botoes' }, copiar, h('button', { type: 'button', class: 'botao botao-primario', autofocus: true, onclick: fechar }, 'Fechar')),
    ),
  );
  document.body.append(dialogo);
  dialogo.showModal();
}

/** Janela pequena de confirmação (por exemplo, antes de apagar). */
export function confirmar(titulo: string, texto: string, botao = 'Apagar'): Promise<boolean> {
  return new Promise((resolve) => {
    const terminar = (sim: boolean): void => {
      dialogo.close();
      dialogo.remove();
      resolve(sim);
    };
    const dialogo = h(
      'dialog',
      { class: 'dialogo', oncancel: () => terminar(false) },
      h(
        'div',
        { class: 'dialogo-corpo' },
        h('h2', {}, titulo),
        h('p', {}, texto),
        h(
          'div',
          { class: 'dialogo-botoes' },
          h('button', { type: 'button', class: 'botao', autofocus: true, onclick: () => terminar(false) }, 'Cancelar'),
          h('button', { type: 'button', class: 'botao botao-perigo', onclick: () => terminar(true) }, botao),
        ),
      ),
    );
    document.body.append(dialogo);
    dialogo.showModal();
  });
}

/**
 * Janela "Onde é usado": as jornadas que usam um bloco. Carregar numa jornada abre-a no editor
 * (através de `abrirJornada`).
 */
export function mostrarUsos(nomeBloco: string, usos: UsoDoBloco[], abrirJornada: (jornadaId: string) => void): void {
  const fechar = (): void => {
    dialogo.close();
    dialogo.remove();
  };
  const totalCasos = usos.reduce((soma, u) => soma + u.casos * u.posicoes.length, 0);
  const dialogo = h(
    'dialog',
    { class: 'dialogo dialogo-usos', oncancel: fechar },
    h(
      'div',
      { class: 'dialogo-corpo' },
      h('h2', {}, `Onde é usado: "${nomeBloco}"`),
      usos.length === 0
        ? h('p', {}, 'Este bloco ainda não é usado em nenhum cenário. Pode ser apagado sem afetar nada.')
        : h(
            'p',
            { class: 'suave' },
            `Usado em ${plural(usos.length, 'cenário')} (corre ${plural(totalCasos, 'vez', 'vezes')} numa execução completa). Uma alteração ao bloco vale para todos.`,
          ),
      usos.length > 0 &&
        h(
          'ul',
          { class: 'lista-itens lista-usos' },
          usos.map((u) =>
            h(
              'li',
              { class: 'item', 'data-uso': u.jornadaId },
              h(
                'button',
                {
                  type: 'button',
                  class: 'ligacao item-nome',
                  title: 'Abrir o cenário no editor',
                  onclick: () => {
                    fechar();
                    abrirJornada(u.jornadaId);
                  },
                },
                u.jornadaNome,
              ),
              h(
                'span',
                { class: 'item-meta' },
                u.epicoNome && h('span', {}, u.epicoNome),
                h('span', {}, `${u.posicoes.length > 1 ? 'posições' : 'posição'} ${u.posicoes.join(', ')}`),
                u.condicional && h('span', { class: 'etiqueta' }, 'só se…'),
                u.limpeza && h('span', { class: 'etiqueta' }, 'limpeza'),
                h('span', {}, plural(u.casos, 'caso')),
              ),
            ),
          ),
        ),
      h('div', { class: 'dialogo-botoes' }, h('button', { type: 'button', class: 'botao botao-primario', autofocus: true, onclick: fechar }, 'Fechar')),
    ),
  );
  document.body.append(dialogo);
  dialogo.showModal();
}
