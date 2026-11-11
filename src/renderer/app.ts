// Ponto de entrada da interface: decide entre "escolher projeto" e a aplicação,
// e troca de ecrã no menu lateral.
import type { EstadoProjeto } from '../shared/modelo.js';
import { h, mensagemDeErro, obter } from './dom.js';
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

escolhaAmbiente.addEventListener('change', async () => {
  await window.uatStudio.projeto.definirAmbiente(escolhaAmbiente.value);
  await atualizar();
});

obter('btn-fechar-projeto').addEventListener('click', async () => {
  await window.uatStudio.projeto.fechar();
  await atualizar();
});

void atualizar();
