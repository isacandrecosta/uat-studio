// Interface: menu lateral com os 7 ecrãs (ainda vazios) e o botão que abre o Edge.

interface Ecra {
  id: string;
  nome: string;
  descricao: string;
}

const ECRAS: Ecra[] = [
  { id: 'jornadas', nome: 'Jornadas', descricao: 'Épicos, lista de jornadas e blocos partilhados.' },
  { id: 'editor', nome: 'Editor de jornada', descricao: 'Compor uma jornada com blocos, variáveis e casos.' },
  { id: 'api', nome: 'Blocos de API', descricao: 'Construir pedidos, perfis de autenticação e teste individual.' },
  { id: 'gravar', nome: 'Gravar', descricao: 'Gravar ações no browser para criar blocos de UI.' },
  { id: 'dados', nome: 'Dados de teste', descricao: 'Variáveis, fórmulas, geradores e contadores.' },
  { id: 'runs', nome: 'Runs e resultados', descricao: 'Correr testes e ver o histórico, os logs e as evidências.' },
  { id: 'mapa', nome: 'Mapa de execução', descricao: 'Grafo ao vivo da execução e controlos.' },
];

function elemento<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento em falta: #${id}`);
  return el as T;
}

const menu = elemento<HTMLElement>('menu');
const tituloEcra = elemento<HTMLElement>('titulo-ecra');
const descricaoEcra = elemento<HTMLElement>('descricao-ecra');
const vazioTexto = elemento<HTMLElement>('vazio-texto');
const botaoAbrir = elemento<HTMLButtonElement>('btn-abrir-poc');
const estadoBrowser = elemento<HTMLElement>('estado-browser');

function mostrarEcra(id: string): void {
  const ecra = ECRAS.find((e) => e.id === id) ?? ECRAS[0];
  tituloEcra.textContent = ecra.nome;
  descricaoEcra.textContent = ecra.descricao;
  vazioTexto.textContent = `O ecrã "${ecra.nome}" será construído nos próximos passos.`;
  for (const item of Array.from(menu.querySelectorAll<HTMLButtonElement>('.menu-item'))) {
    const ativo = item.dataset.ecra === ecra.id;
    item.classList.toggle('ativo', ativo);
    if (ativo) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
}

ECRAS.forEach((ecra, indice) => {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'menu-item';
  item.dataset.ecra = ecra.id;

  const numero = document.createElement('span');
  numero.className = 'menu-numero';
  numero.textContent = String(indice + 1);

  const nome = document.createElement('span');
  nome.textContent = ecra.nome;

  item.append(numero, nome);
  item.addEventListener('click', () => mostrarEcra(ecra.id));
  menu.append(item);
});

botaoAbrir.addEventListener('click', async () => {
  botaoAbrir.disabled = true;
  estadoBrowser.className = 'estado';
  estadoBrowser.textContent = 'A abrir o Edge… (a 1.ª vez pode demorar)';
  try {
    const resultado = await window.uatStudio.abrirAppPoc();
    estadoBrowser.textContent = resultado.mensagem;
    estadoBrowser.classList.add(resultado.ok ? 'ok' : 'erro');
  } catch (erro) {
    estadoBrowser.textContent = `Erro inesperado: ${String(erro)}`;
    estadoBrowser.classList.add('erro');
  } finally {
    botaoAbrir.disabled = false;
  }
});

mostrarEcra(ECRAS[0].id);
