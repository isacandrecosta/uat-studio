// Login com código noutro dispositivo: quando o processo principal pede, mostra o código e o endereço onde o
// escrever (por exemplo, no telemóvel). Fecha sozinho quando o login termina; "Cancelar" desiste.
import { h } from './dom.js';

const abertos = new Map<string, HTMLDialogElement>();

export function ouvirLoginComCodigo(): void {
  const api = window.uatStudio.login;
  api.aoCodigo((aviso) => {
    const fechar = (): void => {
      abertos.delete(aviso.id);
      if (dialogo.open) dialogo.close();
      dialogo.remove();
    };
    const dialogo = h(
      'dialog',
      {
        class: 'dialogo',
        id: 'dialogo-login-codigo',
        oncancel: (e: Event) => {
          e.preventDefault();
        },
      },
      h(
        'div',
        { class: 'dialogo-corpo' },
        h('h2', {}, `Login: ${aviso.perfilNome}`),
        h('p', {}, 'Noutro dispositivo (telemóvel, tablet ou outro PC), abra este endereço e escreva o código. Depois entre com a conta da caixa de testes.'),
        h('p', {}, h('code', { id: 'login-codigo-url' }, aviso.url)),
        h('div', { class: 'codigo-login', id: 'login-codigo' }, aviso.codigo),
        h('p', { class: 'suave' }, `O código vale ${Math.max(1, Math.round(aviso.expiraSeg / 60))} minutos. Esta janela fecha sozinha quando o login terminar.`),
        h(
          'div',
          { class: 'dialogo-botoes' },
          h(
            'button',
            {
              type: 'button',
              class: 'botao',
              onclick: () => {
                void api.cancelarCodigo(aviso.id);
                fechar();
              },
            },
            'Cancelar',
          ),
          h('button', { type: 'button', class: 'botao', onclick: () => void navigator.clipboard.writeText(aviso.codigo).catch(() => undefined) }, 'Copiar o código'),
          h('button', { type: 'button', class: 'botao botao-primario', onclick: () => void api.abrirCodigo(aviso.id) }, 'Abrir a página neste PC'),
        ),
      ),
    );
    abertos.set(aviso.id, dialogo);
    document.body.append(dialogo);
    dialogo.showModal();
  });
  api.aoFecharCodigo((id) => {
    const dialogo = abertos.get(id);
    abertos.delete(id);
    if (dialogo?.open) dialogo.close();
    dialogo?.remove();
  });
}
