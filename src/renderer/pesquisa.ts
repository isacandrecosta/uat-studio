// Pesquisa rápida (Ctrl+K): encontrar e abrir um ecrã, um cenário, um épico, um bloco ou uma aplicação
// escrevendo parte do nome. Setas para escolher, Enter para abrir, Esc para fechar.
import { h, normalizarPesquisa } from './dom.js';

export interface DestinoPesquisa {
  tipo: string;
  nome: string;
  detalhe?: string;
  abrir: () => void;
}

/** Abre a janela da pesquisa com os destinos dados (pedidos só quando a janela abre). */
export async function abrirPesquisa(destinos: () => Promise<DestinoPesquisa[]>): Promise<void> {
  if (document.getElementById('pesquisa-rapida')) return;
  const todos = await destinos();
  const campo = h('input', { type: 'search', class: 'campo pesquisa-campo', placeholder: 'Procurar cenário, bloco, épico, aplicação ou ecrã…', 'aria-label': 'Procurar', autocomplete: 'off', spellcheck: 'false' });
  const lista = h('ul', { class: 'pesquisa-lista', role: 'listbox', id: 'pesquisa-resultados' });
  const janela = h(
    'dialog',
    { id: 'pesquisa-rapida', class: 'pesquisa', 'aria-label': 'Pesquisa rápida' },
    campo,
    lista,
    h('p', { class: 'pesquisa-ajuda suave' }, '↑ ↓ para escolher · Enter para abrir · Esc para fechar'),
  );
  let resultados: DestinoPesquisa[] = [];
  let escolhido = 0;
  const fechar = (): void => {
    janela.close();
    janela.remove();
  };
  const desenhar = (): void => {
    const termos = normalizarPesquisa(campo.value).split(/\s+/).filter(Boolean);
    resultados = todos.filter((d) => {
      const texto = normalizarPesquisa(`${d.tipo} ${d.nome} ${d.detalhe ?? ''}`);
      return termos.every((t) => texto.includes(t));
    }).slice(0, 12);
    escolhido = Math.min(escolhido, Math.max(0, resultados.length - 1));
    lista.replaceChildren(
      ...(resultados.length === 0
        ? [h('li', { class: 'pesquisa-vazio suave' }, 'Nada encontrado.')]
        : resultados.map((d, i) =>
            h(
              'li',
              {
                role: 'option',
                class: 'pesquisa-item',
                'aria-selected': String(i === escolhido),
                onclick: () => {
                  fechar();
                  d.abrir();
                },
              },
              h('span', { class: 'pesquisa-tipo' }, d.tipo),
              h('span', { class: 'pesquisa-nome' }, d.nome),
              d.detalhe && h('span', { class: 'suave' }, d.detalhe),
            ),
          )),
    );
  };
  campo.addEventListener('input', () => {
    escolhido = 0;
    desenhar();
  });
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      escolhido = (escolhido + (e.key === 'ArrowDown' ? 1 : -1) + resultados.length) % Math.max(1, resultados.length);
      desenhar();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const d = resultados[escolhido];
      if (d) {
        fechar();
        d.abrir();
      }
    }
  });
  janela.addEventListener('cancel', () => janela.remove());
  janela.addEventListener('click', (e) => {
    if (e.target === janela) fechar();
  });
  document.body.append(janela);
  janela.showModal();
  desenhar();
  campo.focus();
}
