// Pequenas ajudas para construir a interface sem bibliotecas.

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
    const dialogo = h(
      'dialog',
      { class: 'dialogo' },
      h(
        'form',
        { method: 'dialog' },
        h('h2', {}, titulo),
        h('label', {}, rotulo, campo),
        h(
          'div',
          { class: 'dialogo-botoes' },
          h('button', { type: 'button', class: 'botao', onclick: () => dialogo.close('cancelar') }, 'Cancelar'),
          h('button', { type: 'submit', class: 'botao botao-primario', value: 'ok' }, 'Guardar'),
        ),
      ),
    );
    dialogo.addEventListener('close', () => {
      const texto = campo.value.trim();
      dialogo.remove();
      resolve(dialogo.returnValue === 'ok' && texto ? texto : null);
    });
    document.body.append(dialogo);
    dialogo.showModal();
    campo.select();
  });
}

/** Janela pequena de confirmação (por exemplo, antes de apagar). */
export function confirmar(titulo: string, texto: string, botao = 'Apagar'): Promise<boolean> {
  return new Promise((resolve) => {
    const dialogo = h(
      'dialog',
      { class: 'dialogo' },
      h(
        'form',
        { method: 'dialog' },
        h('h2', {}, titulo),
        h('p', {}, texto),
        h(
          'div',
          { class: 'dialogo-botoes' },
          h('button', { type: 'submit', class: 'botao', value: 'cancelar' }, 'Cancelar'),
          h('button', { type: 'submit', class: 'botao botao-perigo', value: 'ok' }, botao),
        ),
      ),
    );
    dialogo.addEventListener('close', () => {
      dialogo.remove();
      resolve(dialogo.returnValue === 'ok');
    });
    document.body.append(dialogo);
    dialogo.showModal();
  });
}
