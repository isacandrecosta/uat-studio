// Configurações: tema (claro, escuro ou igual ao Windows) e tutorial (retomar ou recomeçar).
// As escolhas ficam neste PC (armazenamento local da app), não no projeto.
import { h } from './dom.js';
import { iniciarTutorial, NUMERO_DE_PASSOS, passoGuardado, tutorialJaVisto } from './tutorial.js';

export type Tema = 'claro' | 'escuro' | 'sistema';
const CHAVE_TEMA = 'uat.tema';

export function temaEscolhido(): Tema {
  try {
    const t = localStorage.getItem(CHAVE_TEMA);
    return t === 'escuro' || t === 'sistema' ? t : 'claro';
  } catch {
    return 'claro';
  }
}

const escuroNoWindows = window.matchMedia('(prefers-color-scheme: dark)');

/** Aplica o tema guardado (e segue o Windows se for "sistema"). */
export function aplicarTema(): void {
  const t = temaEscolhido();
  const escuro = t === 'escuro' || (t === 'sistema' && escuroNoWindows.matches);
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
}
escuroNoWindows.addEventListener('change', () => {
  if (temaEscolhido() === 'sistema') aplicarTema();
});

export function definirTema(t: Tema): void {
  try {
    localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    // Sem armazenamento local: o tema vale só até fechar a app.
  }
  aplicarTema();
}

export function abrirConfiguracoes(irPara: (ecra: string) => void): void {
  document.getElementById('configuracoes')?.remove();
  const opcaoTema = (valor: Tema, nome: string, ajuda: string): HTMLElement => {
    const radio = h('input', { type: 'radio', name: 'tema', value: valor, checked: temaEscolhido() === valor });
    radio.addEventListener('change', () => definirTema(valor));
    return h('label', { class: 'opcao opcao-tema' }, radio, h('span', {}, h('strong', {}, nome), h('span', { class: 'suave' }, ` ${ajuda}`)));
  };
  const passo = passoGuardado();
  const janela = h(
    'dialog',
    { id: 'configuracoes', class: 'dialogo' },
    h('h2', {}, 'Configurações'),
    h(
      'fieldset',
      { class: 'grupo-config' },
      h('legend', {}, 'Tema'),
      opcaoTema('claro', 'Claro', ''),
      opcaoTema('escuro', 'Escuro', 'menos cansativo para a vista'),
      opcaoTema('sistema', 'Igual ao Windows', 'muda sozinho com o tema do Windows'),
    ),
    h(
      'fieldset',
      { class: 'grupo-config' },
      h('legend', {}, 'Tutorial'),
      h('p', { class: 'suave' }, tutorialJaVisto() ? `O tutorial mostra, em ${NUMERO_DE_PASSOS} passos, como construir um teste de ponta a ponta.` : 'Ainda não viu o tutorial.'),
      h(
        'div',
        { class: 'acoes' },
        passo > 0 &&
          h(
            'button',
            {
              type: 'button',
              class: 'botao botao-primario',
              id: 'btn-retomar-tutorial',
              onclick: () => {
                janela.close();
                janela.remove();
                iniciarTutorial(irPara, passo);
              },
            },
            `Retomar no passo ${passo + 1}`,
          ),
        h(
          'button',
          {
            type: 'button',
            class: passo > 0 ? 'botao' : 'botao botao-primario',
            id: 'btn-recomecar-tutorial',
            onclick: () => {
              janela.close();
              janela.remove();
              iniciarTutorial(irPara, 0);
            },
          },
          'Começar do início',
        ),
      ),
    ),
    h(
      'div',
      { class: 'acoes acoes-fim' },
      h(
        'button',
        {
          type: 'button',
          class: 'botao',
          onclick: () => {
            janela.close();
            janela.remove();
          },
        },
        'Fechar',
      ),
    ),
  );
  janela.addEventListener('cancel', () => janela.remove());
  document.body.append(janela);
  janela.showModal();
}
