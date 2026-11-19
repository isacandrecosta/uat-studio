// Passos de um bloco à vista e alteráveis, usado no editor do cenário: descrição, de onde vem o valor (fixo,
// coluna, fórmula), passar para coluna do Excel, tipo de verificação, guardar numa variável, condição "só se",
// mudar a ordem, duplicar e apagar. Os blocos são partilhados: mudar um passo aqui muda-o em todos os cenários
// que usam o bloco.
import type { Bloco, Passo, TipoVerificacao, Valor } from '../shared/modelo.js';
import { validarFormula } from '../shared/formulas.js';
import { colunaValida, nomeDeColuna } from '../shared/parametrizar.js';
import { confirmar, h, info, pedirTexto } from './dom.js';

export const NOMES_ACAO: Record<Passo['acao'], string> = {
  navegar: 'Abrir',
  escrever: 'Escrever',
  escolher: 'Escolher',
  marcar: 'Marcar',
  clicar: 'Clicar',
  verificar: 'Verificar',
  guardar: 'Guardar',
  esperar: 'Esperar',
  simular: 'Simular API',
  intercetar: 'Intercetar',
  carregar: 'Carregar ficheiro',
  descarregar: 'Descarregar',
  separador: 'Separador',
  dialogo: 'Pergunta do browser',
};

/** Ações cujo valor faz sentido mudar (o que se escreve, escolhe, verifica, carrega...). */
const COM_VALOR = new Set<Passo['acao']>(['navegar', 'escrever', 'escolher', 'marcar', 'verificar', 'carregar', 'descarregar', 'separador', 'dialogo']);
/** Ações cujo valor pode passar a vir de uma coluna dos casos (e do Excel). */
const PARA_COLUNA = new Set<Passo['acao']>(['escrever', 'escolher', 'marcar', 'verificar', 'carregar']);
/** Ações em que se pode guardar o valor usado numa variável (além de "Guardar"). */
const GUARDA_VALOR = new Set<Passo['acao']>(['escrever', 'escolher']);

const NOME_SIMPLES = /^[\p{L}_][\p{L}\p{N}_]*$/u;

type Origem = 'fixo' | 'variavel' | 'formula' | 'gerador';

export interface OpcoesPassos {
  /** Passa o valor fixo do passo para uma coluna dos casos (os casos ficam com o valor gravado). */
  paraColuna?: (passo: Passo, coluna: string) => Promise<void>;
  /** "Gravar aqui": abre o gravador e os passos novos entram a seguir ao passo nesta posição (1 = a seguir ao 1.º). */
  gravarDepois?: (posicao: number) => void;
}

/** O texto que se mostra/edita para um valor. */
function textoDoValor(valor: Valor | undefined): string {
  if (!valor) return '';
  if (valor.tipo === 'fixo') return valor.valor;
  if (valor.tipo === 'variavel') return valor.nome;
  if (valor.tipo === 'formula') return valor.expressao;
  return valor.gerador;
}

/** Id novo para um passo do bloco (p1, p2, ...). */
function idNovo(bloco: Bloco): string {
  let maior = 0;
  for (const p of bloco.passos) {
    const n = Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0);
    if (n > maior) maior = n;
  }
  return `p${maior + 1}`;
}

/** Editor do valor de um passo: de onde vem (fixo, coluna dos casos, fórmula) e o valor. */
function editorDoValor(passo: Passo, indice: number, aoMudar: () => Promise<void>, opcoes: OpcoesPassos): HTMLElement {
  const atual = passo.valor;
  const origemAtual: Origem = atual?.tipo ?? 'fixo';
  const erro = h('p', { class: 'erro-campo', role: 'alert', hidden: true });
  const escolha = h(
    'select',
    { class: 'campo', 'aria-label': `De onde vem o valor do passo ${indice + 1}`, disabled: Boolean(passo.secreto) },
    !passo.secreto && h('option', { value: 'fixo', selected: origemAtual === 'fixo' }, 'Valor fixo'),
    h('option', { value: 'variavel', selected: origemAtual === 'variavel' || Boolean(passo.secreto) }, 'Coluna dos casos'),
    !passo.secreto && h('option', { value: 'formula', selected: origemAtual === 'formula' }, 'Fórmula'),
    origemAtual === 'gerador' && h('option', { value: 'gerador', selected: true }, 'Gerador'),
  );
  const ajudas: Record<Origem, string> = { fixo: 'Valor', variavel: 'Nome da coluna, por exemplo Valor', formula: 'Por exemplo ARRED({Valor} * 0,015; 2) ou NIF()', gerador: '' };
  const campo = h('input', {
    type: 'text',
    class: `campo${origemAtual === 'formula' ? ' campo-formula' : ''}`,
    value: textoDoValor(atual),
    placeholder: ajudas[origemAtual],
    spellcheck: 'false',
    'aria-label': `Valor do passo ${indice + 1}`,
    readonly: origemAtual === 'gerador',
  });
  const aplicar = async (): Promise<void> => {
    const origem = escolha.value as Origem;
    const texto = campo.value;
    erro.hidden = true;
    if (origem === 'gerador') return;
    if (origem === 'formula') {
      const problema = texto.trim() ? validarFormula(texto.trim()) : 'Escreva a fórmula.';
      if (problema) {
        erro.textContent = problema;
        erro.hidden = false;
        return;
      }
      passo.valor = { tipo: 'formula', expressao: texto.trim() };
    } else if (origem === 'variavel') {
      const nome = texto.trim().replace(/^\{|\}$/g, '');
      if (!NOME_SIMPLES.test(nome)) {
        erro.textContent = 'O nome da coluna só pode ter letras, números e _ (sem espaços), por exemplo NomeEmpresa.';
        erro.hidden = false;
        return;
      }
      passo.valor = { tipo: 'variavel', nome };
    } else {
      passo.valor = { tipo: 'fixo', valor: texto };
    }
    await aoMudar();
  };
  escolha.addEventListener('change', () => {
    campo.placeholder = ajudas[escolha.value as Origem];
    campo.classList.toggle('campo-formula', escolha.value === 'formula');
    campo.focus();
  });
  campo.addEventListener('change', () => void aplicar());

  // "Passar para coluna": o valor fixo vai para uma coluna dos casos (e para o Excel), com o valor gravado.
  const podeColuna =
    opcoes.paraColuna && PARA_COLUNA.has(passo.acao) && !passo.secreto && atual?.tipo === 'fixo' && passo.verificacao?.tipo !== 'visivel';
  const botaoColuna =
    podeColuna &&
    h(
      'button',
      {
        type: 'button',
        class: 'botao-pequeno-livre botao-para-coluna',
        title: 'O valor passa a vir de uma coluna dos casos de teste (e do Excel). Os casos que já existem ficam com o valor gravado.',
        onclick: async () => {
          const sugestao = nomeDeColuna(passo.alvo?.descricao || passo.descricao, passo.acao);
          const coluna = await pedirTexto('Passar para uma coluna dos casos', 'Nome da coluna (letras e números, sem espaços)', sugestao);
          if (!coluna) return;
          if (!colunaValida(coluna.trim())) {
            erro.textContent = `O nome "${coluna}" não serve: use letras e números, sem espaços (por exemplo NomeEmpresa).`;
            erro.hidden = false;
            return;
          }
          await opcoes.paraColuna?.(passo, coluna.trim());
        },
      },
      '→ Coluna do Excel',
    );
  return h('div', { class: 'passo-valor' }, escolha, h('div', { class: 'passo-valor-campo' }, campo, botaoColuna), erro);
}

/** Tipo de verificação, tolerância e "esperar até". */
function editorDaVerificacao(passo: Passo, indice: number, aoMudar: () => Promise<void>): HTMLElement {
  const v = (passo.verificacao ??= { tipo: 'texto' });
  const erro = h('p', { class: 'erro-campo', role: 'alert', hidden: true });
  const tipo = h(
    'select',
    { class: 'campo', 'aria-label': `O que verifica o passo ${indice + 1}` },
    h('option', { value: 'texto', selected: v.tipo === 'texto' || v.tipo === 'valor' }, 'O texto é igual a'),
    h('option', { value: 'numero', selected: v.tipo === 'numero' }, 'O número é igual a'),
    h('option', { value: 'visivel', selected: v.tipo === 'visivel' }, 'O elemento está visível'),
  );
  const tolerancia = h('input', { type: 'text', class: 'campo campo-curto', value: v.tolerancia ?? '0', 'aria-label': `Tolerância do passo ${indice + 1}`, hidden: v.tipo !== 'numero' });
  const espera = h('input', { type: 'number', min: '0', max: '600', class: 'campo campo-curto', value: v.esperaSeg ? String(v.esperaSeg) : '', placeholder: '—', 'aria-label': `Esperar até (segundos) no passo ${indice + 1}` });
  tipo.addEventListener('change', () => {
    v.tipo = tipo.value as TipoVerificacao;
    if (v.tipo !== 'numero') delete v.tolerancia;
    void aoMudar();
  });
  tolerancia.addEventListener('change', () => {
    v.tolerancia = tolerancia.value.trim() || '0';
    void aoMudar();
  });
  espera.addEventListener('change', () => {
    const n = Number(espera.value);
    erro.hidden = true;
    if (espera.value && (!Number.isFinite(n) || n < 0)) {
      erro.textContent = 'Escreva um número de segundos (ou deixe vazio).';
      erro.hidden = false;
      return;
    }
    if (n > 0) v.esperaSeg = n;
    else delete v.esperaSeg;
    void aoMudar();
  });
  return h(
    'div',
    { class: 'passo-verificacao' },
    tipo,
    v.tipo === 'numero' && h('label', { class: 'passo-linha' }, h('span', {}, 'Diferença máxima'), tolerancia),
    h('label', { class: 'passo-linha' }, h('span', {}, 'Esperar até (s)', info('Quantos segundos esperar que o valor apareça no ecrã. Vazio: poucos segundos.')), espera),
    erro,
  );
}

/** Nome da variável onde se guarda o valor (obrigatório em "Guardar", opcional em escrever/escolher). */
function editorDaVariavel(passo: Passo, indice: number, aoMudar: () => Promise<void>): HTMLElement {
  const obrigatoria = passo.acao === 'guardar';
  const erro = h('p', { class: 'erro-campo', role: 'alert', hidden: true });
  const campo = h('input', {
    type: 'text',
    class: 'campo campo-medio',
    value: passo.variavel ?? '',
    placeholder: obrigatoria ? 'Por exemplo PedidoId' : 'Não guarda',
    spellcheck: 'false',
    'aria-label': `Variável do passo ${indice + 1}`,
  });
  campo.addEventListener('change', () => {
    const nome = campo.value.trim().replace(/^\{|\}$/g, '');
    erro.hidden = true;
    if (!nome && !obrigatoria) {
      delete passo.variavel;
      void aoMudar();
      return;
    }
    if (!NOME_SIMPLES.test(nome)) {
      erro.textContent = 'Dê um nome simples à variável (letras, números e _; sem espaços).';
      erro.hidden = false;
      return;
    }
    passo.variavel = nome;
    void aoMudar();
  });
  const rotulo = obrigatoria ? 'Guarda em' : 'Guardar o valor em';
  const ajuda = obrigatoria
    ? 'O que o ecrã mostra fica nesta variável, para usar nos passos e blocos seguintes como {nome}.'
    : 'Opcional: o valor escrito (por exemplo o NIF gerado por NIF()) fica nesta variável, para usar nos passos e blocos seguintes como {nome}.';
  return h('div', {}, h('label', { class: 'passo-linha' }, h('span', {}, rotulo, info(ajuda)), campo), erro);
}

/**
 * Os passos de um bloco, alteráveis. `guardar` grava o bloco (e redesenha o que depender dele).
 */
export function passosEditaveis(bloco: Bloco, usadoEm: number, guardar: () => Promise<void>, opcoes: OpcoesPassos = {}): HTMLElement {
  const aviso =
    usadoEm > 1
      ? h('p', { class: 'aviso-partilhado' }, `Este bloco é usado em ${usadoEm} cenários: mudar um passo aqui muda-o em todos. Para mudar só neste cenário, use os Parâmetros.`)
      : null;
  if (bloco.passos.length === 0) return h('div', {}, h('p', { class: 'suave' }, 'Este bloco não tem passos.'));

  const mover = async (indice: number, delta: number): Promise<void> => {
    const destino = indice + delta;
    if (destino < 0 || destino >= bloco.passos.length) return;
    const [passo] = bloco.passos.splice(indice, 1);
    bloco.passos.splice(destino, 0, passo);
    await guardar();
  };
  const duplicar = async (indice: number): Promise<void> => {
    const copia: Passo = { ...structuredClone(bloco.passos[indice]), id: idNovo(bloco) };
    bloco.passos.splice(indice + 1, 0, copia);
    await guardar();
  };
  const apagar = async (indice: number): Promise<void> => {
    const passo = bloco.passos[indice];
    const nota = passo.variavel ? ` Atenção: os passos seguintes que usam {${passo.variavel}} deixam de ter esse valor.` : '';
    const extra = usadoEm > 1 ? ` O passo sai do bloco em todos os ${usadoEm} cenários que o usam.` : '';
    if (!(await confirmar('Apagar o passo', `Apagar o passo ${indice + 1} "${passo.descricao}"?${extra}${nota}`))) return;
    bloco.passos.splice(indice, 1);
    await guardar();
  };

  const total = bloco.passos.length;
  return h(
    'div',
    { class: 'passos-editaveis' },
    aviso,
    h(
      'p',
      { class: 'passos-ajuda suave' },
      'Para escrever fórmulas: ',
      h('button', { type: 'button', class: 'botao-ligacao', onclick: () => void window.uatStudio.app.janelaFormulas() }, 'abrir a lista de fórmulas ↗'),
    ),
    h(
      'ol',
      { class: 'lista-passos-editaveis' },
      bloco.passos.map((passo, indice) => {
        const erroCondicao = h('p', { class: 'erro-campo', role: 'alert', hidden: true });
        const descricao = h('input', { type: 'text', class: 'campo', value: passo.descricao, 'aria-label': `Descrição do passo ${indice + 1}` });
        descricao.addEventListener('change', () => {
          if (!descricao.value.trim()) return;
          passo.descricao = descricao.value.trim();
          void guardar();
        });
        const condicao = h('input', {
          type: 'text',
          class: 'campo campo-formula',
          value: passo.condicao ?? '',
          placeholder: 'Sempre',
          spellcheck: 'false',
          'aria-label': `Condição do passo ${indice + 1} (só se)`,
        });
        condicao.addEventListener('change', () => {
          const texto = condicao.value.trim();
          const problema = texto ? validarFormula(texto) : null;
          erroCondicao.hidden = !problema;
          erroCondicao.textContent = problema ?? '';
          if (problema) return;
          passo.condicao = texto || undefined;
          void guardar();
        });
        const ferramentas = h(
          'div',
          { class: 'passo-ferramentas', role: 'group', 'aria-label': `Ações do passo ${indice + 1}` },
          h('button', { type: 'button', class: 'botao-icone', title: 'Subir', 'aria-label': `Subir o passo ${indice + 1}`, disabled: indice === 0, onclick: () => void mover(indice, -1) }, '↑'),
          h('button', { type: 'button', class: 'botao-icone', title: 'Descer', 'aria-label': `Descer o passo ${indice + 1}`, disabled: indice === total - 1, onclick: () => void mover(indice, 1) }, '↓'),
          h('button', { type: 'button', class: 'botao-icone', title: 'Duplicar', 'aria-label': `Duplicar o passo ${indice + 1}`, onclick: () => void duplicar(indice) }, '⧉'),
          h('button', { type: 'button', class: 'botao-icone perigo', title: 'Apagar', 'aria-label': `Apagar o passo ${indice + 1}`, onclick: () => void apagar(indice) }, '✕'),
          opcoes.gravarDepois &&
            h(
              'button',
              {
                type: 'button',
                class: 'botao-icone gravar-aqui',
                title: 'Gravar aqui: abre o browser no ecrã a que este passo leva e os passos novos entram a seguir a ele',
                'aria-label': `Gravar a seguir ao passo ${indice + 1}`,
                onclick: () => opcoes.gravarDepois?.(indice + 1),
              },
              '● Gravar a seguir',
            ),
        );
        const visivel = passo.acao === 'verificar' && passo.verificacao?.tipo === 'visivel';
        return h(
          'li',
          { class: 'passo-editavel', 'data-acao': passo.acao, 'data-passo': passo.id },
          h('span', { class: 'passo-numero' }, indice + 1),
          h('span', { class: 'passo-acao' }, NOMES_ACAO[passo.acao]),
          h(
            'div',
            { class: 'passo-campos' },
            h('div', { class: 'passo-topo' }, descricao, ferramentas),
            passo.alvo && h('span', { class: 'suave passo-alvo' }, `Elemento: ${passo.alvo.descricao}${passo.alvo.linha ? ' (numa linha da tabela)' : ''}`),
            passo.acao === 'verificar' && editorDaVerificacao(passo, indice, guardar),
            COM_VALOR.has(passo.acao) && !visivel && editorDoValor(passo, indice, guardar, opcoes),
            passo.secreto && h('span', { class: 'suave' }, 'Password: vem sempre de uma coluna (com {SEGREDO:nome} nos casos).'),
            (passo.acao === 'guardar' || (GUARDA_VALOR.has(passo.acao) && !passo.secreto)) && editorDaVariavel(passo, indice, guardar),
            passo.rede && h('span', { class: 'suave' }, passo.rede.url),
            h('label', { class: 'passo-condicao' }, h('span', {}, 'Só se', info('O passo só corre quando a condição se cumpre para o caso. Vazio: corre sempre.')), condicao),
            erroCondicao,
          ),
        );
      }),
    ),
  );
}
