// Ponto de entrada da interface: decide entre "escolher projeto" e a aplicação,
// e troca de ecrã no menu lateral.
import type { EstadoProjeto } from '../shared/modelo.js';
import { confirmar, h, mensagemDeErro, obter } from './dom.js';
import { mostrarBoasVindas } from './ecras/boasVindas.js';
import { ecraApi } from './ecras/api.js';
import { ecraDados } from './ecras/dados.js';
import { ecraEditor } from './ecras/editor.js';
import { ecraGravar } from './ecras/gravar.js';
import { ecraJornadas } from './ecras/jornadas.js';
import { ecraRuns } from './ecras/runs.js';
import { ecraMapa } from './ecras/mapa.js';

/** O que cada ecrã recebe para se desenhar. */
export interface Contexto {
  estado: EstadoProjeto;
  /** Zona principal do ecrã. */
  corpo: HTMLElement;
  /** Zona dos botões, no cabeçalho. */
  acoes: HTMLElement;
  /** Volta a ler o projeto e a desenhar o ecrã atual. */
  atualizar(): Promise<void>;
  /** O que está escolhido (mantém-se ao mudar de ecrã). */
  selecao: Selecao;
  /** Muda para outro ecrã. */
  irPara(ecraId: string): void;
}

export interface Selecao {
  jornadaId?: string;
}

interface Ecra {
  id: string;
  nome: string;
  descricao: string;
  desenhar?: (contexto: Contexto) => void | Promise<void>;
}

const ECRAS: Ecra[] = [
  { id: 'jornadas', nome: 'Jornadas', descricao: 'Épicos, jornadas e blocos partilhados.', desenhar: ecraJornadas },
  { id: 'editor', nome: 'Editor de jornada', descricao: 'Compor uma jornada com blocos, variáveis e casos.', desenhar: ecraEditor },
  { id: 'api', nome: 'Blocos de API', descricao: 'Construir pedidos, perfis de autenticação e teste individual.', desenhar: ecraApi },
  { id: 'gravar', nome: 'Gravar', descricao: 'Gravar ações no browser para criar blocos de UI.', desenhar: ecraGravar },
  { id: 'dados', nome: 'Dados de teste', descricao: 'Variáveis, fórmulas, geradores e contadores.', desenhar: ecraDados },
  { id: 'runs', nome: 'Runs e resultados', descricao: 'Correr testes e ver o histórico, os logs e as evidências.', desenhar: ecraRuns },
  { id: 'mapa', nome: 'Mapa de execução', descricao: 'Grafo ao vivo da execução, workers e controlos.', desenhar: ecraMapa },
];

const vistaBoasVindas = obter<HTMLElement>('vista-boas-vindas');
const vistaApp = obter<HTMLElement>('vista-app');
const menu = obter<HTMLElement>('menu');
const corpo = obter<HTMLElement>('corpo-ecra');
const acoes = obter<HTMLElement>('acoes-ecra');
const escolhaAmbiente = obter<HTMLSelectElement>('escolha-ambiente');
const escolhaProjeto = obter<HTMLSelectElement>('escolha-projeto');
const tipoAmbiente = obter<HTMLElement>('tipo-ambiente');

let estado: EstadoProjeto | null = null;
let ecraAtual = ECRAS[0].id;
let selecao: Selecao = {};

function irPara(ecraId: string): void {
  ecraAtual = ecraId;
  void desenharEcra();
}

function mostrarVista(vista: 'boas-vindas' | 'app'): void {
  vistaBoasVindas.hidden = vista !== 'boas-vindas';
  vistaApp.hidden = vista !== 'app';
  document.body.dataset.vista = vista;
}

function desenharAmbiente(atual: EstadoProjeto): void {
  escolhaAmbiente.replaceChildren(
    ...atual.projeto.ambientes.map((a) =>
      h('option', { value: a.id, selected: a.id === atual.projeto.ambienteAtivo }, a.nome),
    ),
  );
  const ativo = atual.projeto.ambientes.find((a) => a.id === atual.projeto.ambienteAtivo);
  tipoAmbiente.textContent = ativo?.tipo ?? '';
  tipoAmbiente.dataset.tipo = ativo?.tipo ?? '';
}

async function desenharEcra(): Promise<void> {
  if (!estado) return;
  const ecra = ECRAS.find((e) => e.id === ecraAtual) ?? ECRAS[0];
  obter('titulo-ecra').textContent = ecra.nome;
  obter('descricao-ecra').textContent = ecra.descricao;
  for (const item of Array.from(menu.querySelectorAll<HTMLElement>('.menu-item'))) {
    const ativo = item.dataset.ecra === ecra.id;
    item.classList.toggle('ativo', ativo);
    if (ativo) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  acoes.replaceChildren();
  corpo.replaceChildren();
  if (!ecra.desenhar) {
    corpo.append(
      h(
        'div',
        { class: 'vazio' },
        h('p', { class: 'vazio-titulo' }, 'Ainda não há nada aqui'),
        h('p', {}, `O ecrã "${ecra.nome}" será construído nos próximos passos.`),
      ),
    );
    return;
  }
  try {
    await ecra.desenhar({ estado, corpo, acoes, atualizar, selecao, irPara });
  } catch (erro) {
    corpo.replaceChildren(h('p', { class: 'aviso-erro', role: 'alert' }, mensagemDeErro(erro)));
  }
}

async function atualizar(): Promise<void> {
  estado = await window.uatStudio.projeto.atual();
  if (!estado) {
    mostrarVista('boas-vindas');
    await mostrarBoasVindas(vistaBoasVindas, entrarNoProjeto);
    return;
  }
  obter('nome-projeto').textContent = estado.projeto.nome;
  desenharAmbiente(estado);
  void desenharProjetos(estado);
  mostrarVista('app');
  await desenharEcra();
}

function entrarNoProjeto(): void {
  ecraAtual = ECRAS[0].id;
  selecao = {};
  void atualizar();
}

ECRAS.forEach((ecra, indice) => {
  menu.append(
    h(
      'button',
      {
        type: 'button',
        class: 'menu-item',
        'data-ecra': ecra.id,
        onclick: () => irPara(ecra.id),
      },
      h('span', { class: 'menu-numero' }, indice + 1),
      h('span', {}, ecra.nome),
    ),
  );
});

/** Lista "Projeto" no canto: os projetos recentes, abrir outra pasta e criar/gerir projetos. */
async function desenharProjetos(atual: EstadoProjeto): Promise<void> {
  const recentes = await window.uatStudio.projeto.recentes().catch(() => []);
  const outros = recentes.filter((r) => r.pasta !== atual.pasta);
  escolhaProjeto.replaceChildren(
    h('option', { value: atual.pasta, selected: true, title: atual.pasta }, atual.projeto.nome),
    ...outros.map((r) => h('option', { value: r.pasta, title: r.pasta }, r.nome)),
    ...((atual.projeto.exemplo && !atual.projeto.wiki) || recentes.some((r) => r.exemplo && !r.wiki) ? [] : [h('option', { value: '__exemplo' }, 'Projeto de exemplo (casos de uso)')]),
    ...(atual.projeto.wiki || recentes.some((r) => r.wiki) ? [] : [h('option', { value: '__wiki' }, 'Wiki de componentes OutSystems')]),
    h('option', { value: '__abrir' }, 'Abrir outra pasta…'),
    ...(atual.projeto.exemplo ? [h('option', { value: '__apagar-exemplo' }, atual.projeto.wiki ? 'Apagar esta Wiki…' : 'Apagar este projeto de exemplo…')] : []),
    h('option', { value: '__gerir' }, 'Criar ou gerir projetos…'),
  );
  escolhaProjeto.title = atual.pasta;
}

/** Não se muda de projeto a meio de uma execução ou de uma gravação (misturava dados de projetos diferentes). */
async function podeMudarDeProjeto(): Promise<boolean> {
  const [run, gravador] = await Promise.all([window.uatStudio.runs.estado(), window.uatStudio.gravador.estado()]);
  if (!run?.ativo && !gravador.ativo) return true;
  await confirmar('Não é possível mudar de projeto agora', run?.ativo ? 'Há uma execução a correr. Espere que termine (ou pare-a) antes de mudar de projeto.' : 'Há uma gravação em curso. Termine-a antes de mudar de projeto.', 'Fechar');
  return false;
}

escolhaProjeto.addEventListener('change', async () => {
  const escolha = escolhaProjeto.value;
  const atual = estado?.pasta ?? '';
  if (escolha === atual) return;
  if (!(await podeMudarDeProjeto())) {
    escolhaProjeto.value = atual;
    return;
  }
  try {
    if (escolha === '__gerir') {
      await window.uatStudio.projeto.fechar();
    } else if (escolha === '__wiki') {
      await window.uatStudio.projeto.abrirWiki();
    } else if (escolha === '__exemplo') {
      await window.uatStudio.projeto.abrirExemplo();
    } else if (escolha === '__apagar-exemplo') {
      const sim = await confirmar('Apagar o projeto de exemplo', 'O projeto de exemplo e as execuções dele são apagados deste PC (não pode ser desfeito). Pode voltar a criá-lo quando quiser na lista Projeto.', 'Apagar');
      if (!sim) {
        escolhaProjeto.value = atual;
        return;
      }
      await window.uatStudio.projeto.apagarExemplo();
    } else {
      const pasta = escolha === '__abrir' ? await window.uatStudio.projeto.escolherPasta() : escolha;
      if (!pasta) {
        escolhaProjeto.value = atual;
        return;
      }
      await window.uatStudio.projeto.abrir(pasta);
    }
    // Projeto novo: começa no ecrã Jornadas, sem seleções do anterior.
    ecraAtual = ECRAS[0].id;
    selecao = {};
  } catch (erro) {
    escolhaProjeto.value = atual;
    await confirmar('Não foi possível abrir o projeto', mensagemDeErro(erro), 'Fechar');
  }
  await atualizar();
});

escolhaAmbiente.addEventListener('change', async () => {
  await window.uatStudio.projeto.definirAmbiente(escolhaAmbiente.value);
  await atualizar();
});

obter('btn-fechar-projeto').addEventListener('click', async () => {
  if (!(await podeMudarDeProjeto())) return;
  await window.uatStudio.projeto.fechar();
  await atualizar();
});

void atualizar();
