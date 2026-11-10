// Ecrã Gravar. Por agora só abre o Edge na app POC (o gravador chega no passo 4).
import type { Contexto } from '../app.js';
import { h, mensagemDeErro } from '../dom.js';

export function ecraGravar({ corpo }: Contexto): void {
  const estado = h('p', { id: 'estado-browser', class: 'estado', role: 'status' });
  const botao = h(
    'button',
    {
      id: 'btn-abrir-poc',
      type: 'button',
      class: 'botao botao-primario',
      onclick: async () => {
        botao.disabled = true;
        estado.className = 'estado';
        estado.textContent = 'A abrir o Edge… (a 1.ª vez pode demorar)';
        try {
          const resultado = await window.uatStudio.abrirAppPoc();
          estado.textContent = resultado.mensagem;
          estado.classList.add(resultado.ok ? 'ok' : 'erro');
        } catch (erro) {
          estado.textContent = mensagemDeErro(erro);
          estado.classList.add('erro');
        } finally {
          botao.disabled = false;
        }
      },
    },
    'Abrir Edge na app POC',
  );
  corpo.append(
    h(
      'div',
      { class: 'cartao' },
      h('h2', {}, 'Browser de testes'),
      h('p', { class: 'suave' }, 'O gravador ainda não existe. Por agora, este botão só abre o Edge na app de exemplo.'),
      botao,
      estado,
    ),
  );
}
