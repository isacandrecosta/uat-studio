// Passos de um bloco à vista e alteráveis (descrição, de onde vem o valor, condição), usado no editor do
// cenário. Os blocos são partilhados: mudar um passo aqui muda-o em todos os cenários que usam o bloco.
import type { Bloco, Passo, Valor } from '../shared/modelo.js';
import { validarFormula } from '../shared/formulas.js';
import { h, info } from './dom.js';

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

type Origem = 'fixo' | 'variavel' | 'formula' | 'gerador';

/** O texto que se mostra/edita para um valor. */
function textoDoValor(valor: Valor | undefined): string {
  if (!valor) return '';
  if (valor.tipo === 'fixo') return valor.valor;
  if (valor.tipo === 'variavel') return valor.nome;
  if (valor.tipo === 'formula') return valor.expressao;
  return valor.gerador;
}

/** Editor do valor de um passo: de onde vem (fixo, coluna dos casos, fórmula) e o valor. */
function editorDoValor(passo: Passo, indice: number, aoMudar: () => Promise<void>): HTMLElement {
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
  const ajudas: Record<Origem, string> = { fixo: 'Valor', variavel: 'Nome da coluna, por exemplo Valor', formula: 'Por exemplo ARRED({Valor} * 0,015; 2)', gerador: '' };
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
      if (!/^[A-Za-zÀ-ÿ_][\wÀ-ÿ]*$/.test(nome)) {
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
  return h('div', { class: 'passo-valor' }, escolha, campo, erro);
}

/**
 * Os passos de um bloco, alteráveis: descrição, valor (fixo, coluna ou fórmula) e condição "só se".
 * `guardar` grava o bloco (e redesenha o que depender dele).
 */
export function passosEditaveis(bloco: Bloco, usadoEm: number, guardar: () => Promise<void>): HTMLElement {
  const aviso =
    usadoEm > 1
      ? h('p', { class: 'aviso-partilhado' }, `Este bloco é usado em ${usadoEm} cenários: mudar um passo aqui muda-o em todos. Para mudar só neste cenário, use os Parâmetros.`)
      : null;
  if (bloco.passos.length === 0) return h('div', {}, h('p', { class: 'suave' }, 'Este bloco não tem passos.'));
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
        const extra =
          passo.acao === 'guardar' && passo.variavel
            ? h('span', { class: 'suave' }, 'Guarda em ', h('code', {}, `{${passo.variavel}}`))
            : passo.rede
              ? h('span', { class: 'suave' }, passo.rede.url)
              : null;
        return h(
          'li',
          { class: 'passo-editavel', 'data-acao': passo.acao, 'data-passo': passo.id },
          h('span', { class: 'passo-numero' }, indice + 1),
          h('span', { class: 'passo-acao' }, NOMES_ACAO[passo.acao]),
          h(
            'div',
            { class: 'passo-campos' },
            descricao,
            passo.alvo && h('span', { class: 'suave passo-alvo' }, `Elemento: ${passo.alvo.descricao}${passo.alvo.linha ? ' (numa linha da tabela)' : ''}`),
            COM_VALOR.has(passo.acao) && editorDoValor(passo, indice, guardar),
            passo.secreto && h('span', { class: 'suave' }, 'Password: vem sempre de uma coluna (com {SEGREDO:nome} nos casos).'),
            extra,
            h('label', { class: 'passo-condicao' }, h('span', {}, 'Só se', info('O passo só corre quando a condição se cumpre para o caso. Vazio: corre sempre.')), condicao),
            erroCondicao,
          ),
        );
      }),
    ),
  );
}
