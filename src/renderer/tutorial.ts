// Tutorial guiado: passa pelos ecrãs na ordem de construção de um teste de ponta a ponta, realçando o
// elemento de que fala cada passo. Pode ser saltado a qualquer momento (botão ou Esc) e retomado em
// Configurações (no passo onde ficou, ou do início). O progresso fica guardado neste PC.
import { h } from './dom.js';

interface PassoTutorial {
  /** Ecrã a abrir antes do passo (o id do menu). */
  ecra?: string;
  /** Elemento a realçar (se não existir, a explicação aparece ao centro). */
  alvo?: string;
  titulo: string;
  texto: string;
}

const PASSOS: PassoTutorial[] = [
  {
    titulo: 'Bem-vindo ao UAT Studio',
    texto: 'Em poucos passos, este tutorial mostra como se constrói um teste de ponta a ponta: registar a aplicação, gravar, montar o cenário, escrever os casos, correr e analisar. Pode saltá-lo e retomá-lo quando quiser em Configurações.',
  },
  { ecra: 'inicio', alvo: '#btn-novo-teste', titulo: 'O caminho mais rápido: Novo teste', texto: 'O assistente cria um teste em 4 passos: o que vai testar, gravar no Edge, o que varia de caso para caso e correr. Os passos seguintes do tutorial mostram cada peça em pormenor.' },
  { ecra: 'inicio', alvo: '#inicio-resumo', titulo: 'Início: o ponto da situação', texto: 'Quantos cenários e casos de teste há e como correu a última execução: ✓ Passou, ✗ Falhou (um valor diferente do esperado) ou ! Bloqueado (não chegou ao fim).' },
  { ecra: 'inicio', alvo: '#faixa-ambiente', titulo: 'O ambiente está sempre à vista', texto: 'A faixa diz onde se está a testar: verde DEV, azul QA, vermelho PRODUÇÃO. Muda-se de ambiente no canto inferior esquerdo.' },
  { ecra: 'jornadas', alvo: '#cartao-aplicacoes', titulo: '1. Registar a aplicação', texto: 'Cada aplicação a testar tem um endereço por ambiente. Os testes usam sempre o endereço do ambiente ativo, por isso o mesmo teste corre em DEV e em QA.' },
  { ecra: 'gravar', alvo: '#gravar-aplicacao', titulo: '2. Gravar os passos', texto: 'Escolha a aplicação, dê um nome ao bloco (por exemplo "Login" ou "Criar empresa") e carregue em Gravar. O Edge abre a aplicação.' },
  { ecra: 'gravar', alvo: '#btn-gravar', titulo: 'O popup do gravador', texto: 'Clique num campo ou botão da aplicação: abre-se um popup para escolher o que fazer (escrever, escolher, clicar, verificar) e de onde vem o valor (fixo, coluna do Excel, fórmula). Cada passo é executado logo.' },
  { ecra: 'gravar', alvo: '#cartao-blocos-gravados', titulo: 'Gravou com valores fixos?', texto: 'Abra o bloco e use "Transformar valores fixos em colunas": escolhe o que deve variar e passa a vir dos casos de teste (e do Excel). As passwords guardam-se em Dados de teste › Segredos de teste.' },
  { ecra: 'jornadas', alvo: '#btn-novo-epico', titulo: '3. Montar o cenário de teste', texto: 'Um épico agrupa cenários (por exemplo "Crédito Pessoal"). Dentro dele, "Novo cenário" cria o percurso que vai juntar os blocos pela ordem certa.' },
  { ecra: 'editor', alvo: '.separadores-editor', titulo: 'O editor do cenário', texto: 'Resumo (o objetivo e o requisito), Passos (os blocos por ordem, com parâmetros e "Mais opções") e Casos de teste (os dados de cada caso).' },
  { ecra: 'editor', alvo: '#lista-biblioteca', titulo: 'Acrescentar blocos', texto: 'Na biblioteca, "Acrescentar" põe o bloco no fim do percurso; as setas mudam a ordem. Um bloco gravado uma vez serve muitos cenários.' },
  { ecra: 'editor', alvo: '.separador[data-painel="casos"]', titulo: '4. Escrever os casos de teste', texto: 'Uma linha por caso, com os dados de entrada e os valores esperados. "Exportar Excel" e "Importar Excel" permitem criar centenas de casos numa folha.' },
  { ecra: 'runs', alvo: '#btn-verificar', titulo: '5. Verificar e correr', texto: '"Verificar" mostra o que falta (colunas, segredos, endereços) sem correr nada. "Correr" verifica primeiro e depois executa, em paralelo se quiser.' },
  { ecra: 'mapa', alvo: '.mapa-cartao', titulo: 'Execução ao vivo', texto: 'Enquanto corre, vê cada bloco a mudar de cor e o browser de cada worker em miniatura. Pode pausar entre passos ou parar.' },
  { ecra: 'runs', alvo: '#historico', titulo: '6. Analisar e reportar', texto: 'Abra um caso para ver os passos, os prints e o porquê de cada falha. "Criar defeito" prepara o texto e as evidências; há relatórios em Excel, HTML e PDF para assinatura.' },
  {
    titulo: 'Pronto!',
    texto: 'Dica: Ctrl+K procura qualquer cenário, bloco ou ecrã. O "Projeto de exemplo" e a "Wiki de componentes" (na lista Projeto) têm tudo isto já feito. O tutorial pode ser retomado em Configurações.',
  },
];

const CHAVE_ESTADO = 'uat.tutorial';
const CHAVE_PASSO = 'uat.tutorial.passo';

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento local: o tutorial volta a aparecer, não é grave.
  }
}

/** Já foi visto ou saltado? (decide se aparece sozinho ao abrir um projeto) */
export function tutorialJaVisto(): boolean {
  return ler(CHAVE_ESTADO) !== null;
}

/** O passo onde ficou (para "Retomar"). */
export function passoGuardado(): number {
  const n = Number(ler(CHAVE_PASSO) ?? 0);
  return Number.isInteger(n) && n >= 0 && n < PASSOS.length ? n : 0;
}

export const NUMERO_DE_PASSOS = PASSOS.length;

/** Começa (ou retoma) o tutorial no passo dado. `irPara` muda de ecrã. */
export function iniciarTutorial(irPara: (ecra: string) => void, inicio = 0): void {
  document.getElementById('tutorial')?.remove();
  let atual = Math.max(0, Math.min(inicio, PASSOS.length - 1));
  const realce = h('div', { class: 'tutorial-realce', 'aria-hidden': 'true' });
  const titulo = h('h2', { class: 'tutorial-titulo', id: 'tutorial-titulo' });
  const texto = h('p', { class: 'tutorial-texto' });
  const contador = h('span', { class: 'tutorial-contador' });
  const anterior = h('button', { type: 'button', class: 'botao', id: 'tutorial-anterior' }, 'Anterior');
  const seguinte = h('button', { type: 'button', class: 'botao botao-primario', id: 'tutorial-seguinte' }, 'Seguinte');
  const saltar = h('button', { type: 'button', class: 'botao botao-discreto-claro', id: 'tutorial-saltar' }, 'Saltar tutorial');
  const balao = h(
    'div',
    { class: 'tutorial-balao', role: 'dialog', 'aria-labelledby': 'tutorial-titulo', 'aria-modal': 'false' },
    contador,
    titulo,
    texto,
    h('div', { class: 'tutorial-acoes' }, saltar, h('span', { class: 'tutorial-espaco' }), anterior, seguinte),
  );
  const camada = h('div', { id: 'tutorial', class: 'tutorial' }, realce, balao);
  document.body.append(camada);

  const terminar = (estado: 'feito' | 'saltado'): void => {
    gravar(CHAVE_ESTADO, estado);
    gravar(CHAVE_PASSO, estado === 'feito' ? '0' : String(atual));
    camada.remove();
    document.removeEventListener('keydown', teclas);
    window.removeEventListener('resize', posicionar);
  };
  const teclas = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') terminar('saltado');
    else if (e.key === 'ArrowRight') void ir(atual + 1);
    else if (e.key === 'ArrowLeft') void ir(atual - 1);
  };

  /** Põe o realce à volta do alvo e o balão ao lado (ou ao centro, se não houver alvo). */
  function posicionar(): void {
    const passo = PASSOS[atual];
    const el = passo.alvo ? document.querySelector<HTMLElement>(passo.alvo) : null;
    const r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
    if (!r || r.width === 0) {
      realce.hidden = true;
      balao.dataset.posicao = 'centro';
      balao.style.removeProperty('left');
      balao.style.removeProperty('top');
      return;
    }
    realce.hidden = false;
    const m = 6;
    realce.style.setProperty('left', `${r.left - m}px`);
    realce.style.setProperty('top', `${r.top - m}px`);
    realce.style.setProperty('width', `${r.width + 2 * m}px`);
    realce.style.setProperty('height', `${r.height + 2 * m}px`);
    balao.dataset.posicao = 'alvo';
    const larguraBalao = Math.min(380, window.innerWidth - 32);
    const alturaBalao = balao.offsetHeight || 200;
    let left = r.left;
    let top = r.bottom + 14;
    if (top + alturaBalao > window.innerHeight - 16) top = Math.max(16, r.top - alturaBalao - 14);
    if (top < 16) top = 16;
    left = Math.max(16, Math.min(left, window.innerWidth - larguraBalao - 16));
    balao.style.setProperty('left', `${left}px`);
    balao.style.setProperty('top', `${top}px`);
  }

  async function ir(n: number): Promise<void> {
    if (n >= PASSOS.length) return terminar('feito');
    if (n < 0) return;
    atual = n;
    gravar(CHAVE_PASSO, String(atual));
    const passo = PASSOS[atual];
    if (passo.ecra) {
      irPara(passo.ecra);
      // Espera que o ecrã desenhe o alvo (até 3 s).
      const fim = Date.now() + 3000;
      while (passo.alvo && !document.querySelector(passo.alvo) && Date.now() < fim) await new Promise((r) => setTimeout(r, 80));
      document.querySelector<HTMLElement>(passo.alvo ?? '')?.scrollIntoView({ block: 'center' });
    }
    contador.textContent = `Passo ${atual + 1} de ${PASSOS.length}`;
    titulo.textContent = passo.titulo;
    texto.textContent = passo.texto;
    anterior.disabled = atual === 0;
    seguinte.textContent = atual === PASSOS.length - 1 ? 'Terminar' : 'Seguinte';
    camada.dataset.passo = String(atual);
    requestAnimationFrame(posicionar);
    seguinte.focus();
  }

  anterior.addEventListener('click', () => void ir(atual - 1));
  seguinte.addEventListener('click', () => void ir(atual + 1));
  saltar.addEventListener('click', () => terminar('saltado'));
  document.addEventListener('keydown', teclas);
  window.addEventListener('resize', posicionar);
  void ir(atual);
}
