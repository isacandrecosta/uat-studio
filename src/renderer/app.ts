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
import { ecraInicio } from './ecras/inicio.js';
import { abrirPesquisa, type DestinoPesquisa } from './pesquisa.js';
import { abrirAssistente } from './assistente.js';
import { abrirConfiguracoes, aplicarModo, aplicarTema, forcarModo } from './configuracoes.js';
import { iniciarTutorial, tutorialJaVisto } from './tutorial.js';
import { ouvirLoginComCodigo } from './loginCodigo.js';

// O tema (claro/escuro) e o modo (simples/avançado) aplicam-se logo, antes de desenhar.
aplicarTema();
aplicarModo();
ouvirLoginComCodigo();
void window.uatStudio.app.modo().then((m) => {
  if (m !== 'normal') forcarModo('avancado');
});
/** O tutorial aparece sozinho só uma vez por sessão e nunca nos testes automáticos nem na demo. */
let tutorialMostrado = false;

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
  /** Caminho no topo ("Projeto › Épico › Cenário"); por omissão, "Projeto › Ecrã". */
  definirCaminho(partes: string[]): void;
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

// Menu pela ordem do trabalho de uma equipa de QA: ponto da situação, preparar, construir, dados, executar.
// (Os ids ficam iguais aos de antes: são usados pelos testes automáticos e pela demo.)
const ECRAS: Ecra[] = [
  { id: 'inicio', nome: 'Início', descricao: 'Ponto da situação do projeto, o que precisa de atenção e atalhos.', desenhar: ecraInicio },
  { id: 'jornadas', nome: 'Cenários', descricao: 'Épicos, cenários de teste, blocos partilhados e aplicações.', desenhar: ecraJornadas },
  { id: 'editor', nome: 'Editor do cenário', descricao: 'Compor um cenário com blocos, variáveis e casos de teste.', desenhar: ecraEditor },
  { id: 'gravar', nome: 'Gravar', descricao: 'Gravar ações no browser para criar blocos de ecrã.', desenhar: ecraGravar },
  { id: 'api', nome: 'Blocos de API', descricao: 'Construir pedidos, perfis de autenticação e teste individual.', desenhar: ecraApi },
  { id: 'dados', nome: 'Dados de teste', descricao: 'Variáveis, fórmulas, geradores, segredos e contadores.', desenhar: ecraDados },
  { id: 'runs', nome: 'Execuções', descricao: 'Correr testes e ver os resultados, as evidências, os relatórios e os defeitos.', desenhar: ecraRuns },
  { id: 'mapa', nome: 'Execução ao vivo', descricao: 'A execução em curso: cenários, blocos, workers e controlos.', desenhar: ecraMapa },
];

const vistaBoasVindas = obter<HTMLElement>('vista-boas-vindas');
const vistaApp = obter<HTMLElement>('vista-app');
const menu = obter<HTMLElement>('menu');
const corpo = obter<HTMLElement>('corpo-ecra');
const acoes = obter<HTMLElement>('acoes-ecra');
const escolhaAmbiente = obter<HTMLSelectElement>('escolha-ambiente');
const escolhaProjeto = obter<HTMLSelectElement>('escolha-projeto');
const tipoAmbiente = obter<HTMLElement>('tipo-ambiente');
const faixaAmbiente = obter<HTMLElement>('faixa-ambiente');

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
  // Faixa sempre visível com a cor do ambiente: DEV verde, QA azul, PRD vermelho (com aviso).
  const explicacao: Record<string, string> = { DEV: 'desenvolvimento', QA: 'testes de aceitação', PRD: 'PRODUÇÃO: dados reais, cada execução pede confirmação' };
  faixaAmbiente.dataset.tipo = ativo?.tipo ?? '';
  faixaAmbiente.textContent = ativo ? `Ambiente ${ativo.nome} · ${explicacao[ativo.tipo] ?? ativo.tipo} · Projeto: ${atual.projeto.nome}` : '';
}

/** Caminho no topo: o projeto (abre o Início) e as partes do ecrã atual. */
function definirCaminho(partes: string[]): void {
  const nav = obter<HTMLElement>('caminho');
  const projeto = estado?.projeto.nome ?? '';
  nav.replaceChildren(
    h('button', { type: 'button', class: 'caminho-parte ligacao', title: 'Ir para o Início', onclick: () => irPara('inicio') }, projeto),
    ...partes.flatMap((p) => [h('span', { class: 'caminho-separador', 'aria-hidden': 'true' }, '›'), h('span', { class: 'caminho-parte' }, p)]),
  );
}

async function desenharEcra(): Promise<void> {
  if (!estado) return;
  const ecra = ECRAS.find((e) => e.id === ecraAtual) ?? ECRAS[0];
  obter('titulo-ecra').textContent = ecra.nome;
  definirCaminho([ecra.nome]);
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
    await ecra.desenhar({ estado, corpo, acoes, atualizar, selecao, irPara, definirCaminho });
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
  if (!tutorialMostrado && !tutorialJaVisto()) {
    tutorialMostrado = true;
    void window.uatStudio.app.modo().then((modo) => {
      if (modo === 'normal') setTimeout(() => iniciarTutorial(irPara), 600);
    });
  }
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

// ---------------------------------------------------------------- pesquisa rápida (Ctrl+K)

/** Depois de mudar de ecrã, escreve um texto numa caixa de filtro (quando ela aparecer). */
function preencherFiltro(id: string, texto: string): void {
  const inicio = Date.now();
  const tentar = (): void => {
    const campo = document.getElementById(id) as HTMLInputElement | null;
    if (campo) {
      campo.value = texto;
      campo.dispatchEvent(new Event('input', { bubbles: true }));
      campo.focus();
    } else if (Date.now() - inicio < 3000) {
      setTimeout(tentar, 100);
    }
  };
  tentar();
}

async function destinosDaPesquisa(): Promise<DestinoPesquisa[]> {
  const api = window.uatStudio;
  const [jornadas, epicos, blocos, aplicacoes] = await Promise.all([api.dados.listar('jornadas'), api.dados.listar('epicos'), api.dados.listar('blocos'), api.dados.listar('aplicacoes')]);
  const ambiente = estado?.projeto.ambienteAtivo ?? '';
  const nomesTipo: Record<string, string> = { UI: 'Bloco de ecrã', API: 'Bloco de API', EMAIL: 'Bloco de email', MANUAL: 'Passo manual' };
  return [
    { tipo: 'Assistente', nome: 'Novo teste', detalhe: 'Criar um teste em 4 passos: gravar, escolher o que varia, correr', abrir: () => void abrirAssistente({ estado: estado as EstadoProjeto, irPara, abrirCenario: (id) => { selecao.jornadaId = id; } }) },
    ...jornadas.map((j) => ({
      tipo: 'Cenário',
      nome: j.nome,
      detalhe: epicos.find((e) => e.id === j.epicoId)?.nome,
      abrir: () => {
        selecao.jornadaId = j.id;
        irPara('editor');
      },
    })),
    ...blocos.map((b) => ({
      tipo: nomesTipo[b.tipo] ?? 'Bloco',
      nome: b.nome,
      detalhe: aplicacoes.find((a) => a.id === b.aplicacaoId)?.nome,
      abrir: () => {
        irPara(b.tipo === 'API' ? 'api' : 'jornadas');
        if (b.tipo !== 'API') preencherFiltro('filtro-blocos', b.nome);
      },
    })),
    ...epicos.map((e) => ({
      tipo: 'Épico',
      nome: e.nome,
      abrir: () => {
        irPara('jornadas');
        preencherFiltro('filtro-cenarios', e.nome);
      },
    })),
    ...aplicacoes.map((a) => ({ tipo: 'Aplicação', nome: a.nome, detalhe: a.urls[ambiente], abrir: () => irPara('jornadas') })),
    ...ECRAS.map((e) => ({ tipo: 'Ecrã', nome: e.nome, detalhe: e.descricao, abrir: () => irPara(e.id) })),
  ];
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && document.body.dataset.vista === 'app') {
    e.preventDefault();
    void abrirPesquisa(destinosDaPesquisa);
  }
});
obter<HTMLButtonElement>('btn-pesquisa').addEventListener('click', () => void abrirPesquisa(destinosDaPesquisa));
obter<HTMLButtonElement>('btn-configuracoes').addEventListener('click', () => abrirConfiguracoes(irPara));
obter<HTMLButtonElement>('btn-formulas').addEventListener('click', () => void window.uatStudio.app.janelaFormulas());
obter<HTMLButtonElement>('indicador-modo').addEventListener('click', () => abrirConfiguracoes(irPara));

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
