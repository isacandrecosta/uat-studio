// Configurações: tema (claro, escuro ou igual ao Windows) e tutorial (retomar ou recomeçar).
// As escolhas ficam neste PC (armazenamento local da app), não no projeto.
import { formatarMB, h, info } from './dom.js';
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
    painelDesempenho(),
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

/**
 * Painel "Desempenho" (fechado por omissão): o PC agora, a memória da app e o que as últimas execuções
 * usaram. Enquanto está aberto, atualiza de 2 em 2 segundos.
 */
function painelDesempenho(): HTMLElement {
  const corpo = h('div', { class: 'desempenho-corpo', id: 'painel-desempenho' }, h('p', { class: 'suave' }, 'A medir…'));
  const barra = (pct: number, rotulo: string): HTMLElement => {
    const preenchida = h('span', { class: 'barra-uso-preenchida' });
    preenchida.style.setProperty('width', `${Math.max(0, Math.min(100, pct))}%`);
    const nivel = pct >= 90 ? 'alto' : pct >= 70 ? 'medio' : 'baixo';
    return h('span', { class: 'barra-uso', 'data-nivel': nivel, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct), 'aria-label': rotulo }, preenchida);
  };
  const desenhar = async (): Promise<void> => {
    const d = await window.uatStudio.app.desempenho();
    const usadaMB = d.sistema.memTotalMB - d.sistema.memLivreMB;
    const usadaPct = d.sistema.memTotalMB > 0 ? (100 * usadaMB) / d.sistema.memTotalMB : 0;
    corpo.replaceChildren(
      h('p', { class: 'suave' }, `${d.sistema.modelo} · ${d.sistema.nucleos} núcleos · ${formatarMB(d.sistema.memTotalMB)} de memória`),
      h(
        'div',
        { class: 'desempenho-linhas' },
        h('span', {}, 'Processador do PC'),
        barra(d.sistema.cpuPct, 'Processador do PC'),
        h('strong', { id: 'desempenho-cpu' }, `${d.sistema.cpuPct}%`),
        h('span', {}, 'Memória do PC'),
        barra(usadaPct, 'Memória do PC em uso'),
        h('strong', { id: 'desempenho-memoria' }, `${formatarMB(usadaMB)} em uso · ${formatarMB(d.sistema.memLivreMB)} livres`),
        h('span', {}, 'UAT Studio (sem os browsers)'),
        h('span', {}),
        h('strong', {}, `${formatarMB(d.app.memMB)} · ${d.app.processos} processos`),
        h('span', {}, 'Casos a correr agora'),
        h('span', {}),
        h('strong', {}, String(d.workersAtivos)),
      ),
      h(
        'p',
        { class: 'desempenho-sugestao' },
        `Com a memória livre agora, até ${d.sugestao} em paralelo é seguro`,
        info(`Cada caso em paralelo é um browser Edge à parte (cerca de ${d.mbPorWorker} MB). Fica sempre 1 GB livre para o Windows e os outros programas. O processador quase não conta: a maior parte do tempo os testes estão à espera da aplicação.`),
      ),
      d.execucoes.length === 0
        ? h('p', { class: 'suave' }, 'As execuções deste projeto ainda não têm medições (aparecem a partir da próxima).')
        : h(
            'table',
            { class: 'tabela tabela-desempenho' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Execução'), h('th', {}, 'Paralelo'), h('th', {}, 'Por caso'), h('th', {}, 'Memória livre mín.'), h('th', {}, 'Processador méd./máx.'))),
            h(
              'tbody',
              {},
              d.execucoes.map((e) =>
                h(
                  'tr',
                  {},
                  h('td', {}, `${e.nome} (${new Date(e.inicio).toLocaleDateString('pt-PT')})`),
                  h('td', {}, String(e.paralelo)),
                  h('td', {}, e.duracaoMediaCasoMs ? `${(e.duracaoMediaCasoMs / 1000).toFixed(1).replace('.', ',')} s` : '—'),
                  h('td', {}, e.memLivreMinMB !== undefined ? formatarMB(e.memLivreMinMB) : '—'),
                  h('td', {}, e.cpuMedioPct !== undefined ? `${e.cpuMedioPct}% / ${e.cpuMaxPct}%` : '—'),
                ),
              ),
            ),
          ),
    );
  };
  let relogio: number | undefined;
  const detalhes = h(
    'details',
    { class: 'grupo-config desempenho', id: 'config-desempenho' },
    h('summary', {}, 'Desempenho do PC'),
    corpo,
  );
  detalhes.addEventListener('toggle', () => {
    if (detalhes.open) {
      void desenhar();
      relogio = window.setInterval(() => {
        // Pára sozinho quando a janela das Configurações fecha.
        if (!document.body.contains(detalhes)) return window.clearInterval(relogio);
        if (detalhes.open) void desenhar();
      }, 2000);
    } else if (relogio) {
      window.clearInterval(relogio);
    }
  });
  return detalhes;
}
