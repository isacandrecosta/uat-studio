// Liga a interface ao projeto aberto: escolher/criar/abrir projeto e ler/gravar os dados.
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EstadoReparo, repararLocalizador } from '../../shared/blocos';
import { validarFormula } from '../../shared/formulas';
import { Escolha, parametrizar } from '../../shared/parametrizar';
import { EstadoProjeto, Localizador, NomeColecao, ProjetoRecente, SugestaoReparo, VariavelCalculada } from '../../shared/modelo';
import { criarExemplo } from './exemplo';
import { criarExemploPortais } from './exemploPortais';
import { criarWiki } from './wiki';
import * as repo from './repositorio';

let pastaAtual: string | null = null;

/** Pasta do projeto aberto. Dá erro (com mensagem simples) se não houver nenhum. */
export function pastaDoProjeto(): string {
  if (!pastaAtual) throw new repo.ErroProjeto('Não há nenhum projeto aberto.');
  return pastaAtual;
}

function ficheiroRecentes(): string {
  return path.join(app.getPath('userData'), 'recentes.json');
}

function lerRecentes(): ProjetoRecente[] {
  try {
    const lista = JSON.parse(fs.readFileSync(ficheiroRecentes(), 'utf8')) as ProjetoRecente[];
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((r) => repo.existeProjeto(r.pasta))
      .map((r) => {
        try {
          const p = repo.lerProjeto(r.pasta);
          return { ...r, ...(p.exemplo ? { exemplo: true } : {}), ...(p.wiki ? { wiki: true } : {}) };
        } catch {
          return r;
        }
      });
  } catch {
    return [];
  }
}

/** Pasta do projeto de exemplo da ferramenta (dentro da pasta da app, não nos documentos do utilizador). */
function pastaDoExemplo(): string {
  return path.join(app.getPath('userData'), 'exemplos', 'projeto-de-exemplo');
}

/** Abre o projeto de exemplo, criando-o na 1.ª vez (ou depois de ter sido apagado). */
export function abrirExemplo(): EstadoProjeto {
  const pasta = pastaDoExemplo();
  if (!repo.existeProjeto(pasta)) {
    repo.criarProjeto(pasta, 'Projeto de exemplo');
    criarExemplo(pasta);
    criarExemploPortais(pasta);
    repo.gravarProjeto(pasta, { ...repo.lerProjeto(pasta), exemplo: true });
  }
  return abrirProjeto(pasta);
}

/** Abre a Wiki de componentes OutSystems, criando-a na 1.ª vez (ou depois de ter sido apagada). */
export function abrirWiki(): EstadoProjeto {
  const pasta = path.join(app.getPath('userData'), 'exemplos', 'wiki-componentes');
  if (!repo.existeProjeto(pasta)) {
    repo.criarProjeto(pasta, 'Wiki de componentes OutSystems');
    criarWiki(pasta);
    repo.gravarProjeto(pasta, { ...repo.lerProjeto(pasta), exemplo: true, wiki: true });
  }
  return abrirProjeto(pasta);
}

/** Apaga o projeto de exemplo aberto (só projetos marcados como exemplo; os outros nunca se apagam por aqui). */
export function apagarExemplo(): void {
  const pasta = pastaDoProjeto();
  if (!repo.lerProjeto(pasta).exemplo) throw new repo.ErroProjeto('Só é possível apagar o projeto de exemplo da ferramenta.');
  pastaAtual = null;
  const outros = lerRecentes().filter((r) => r.pasta !== pasta);
  try {
    fs.writeFileSync(ficheiroRecentes(), JSON.stringify(outros, null, 2), 'utf8');
  } catch {
    // A lista de recentes é só uma comodidade.
  }
  fs.rmSync(pasta, { recursive: true, force: true });
}

function registarRecente(estado: EstadoProjeto): void {
  const outros = lerRecentes().filter((r) => r.pasta !== estado.pasta);
  const lista = [
    { pasta: estado.pasta, nome: estado.projeto.nome, abertoEm: new Date().toISOString() },
    ...outros,
  ].slice(0, 8);
  try {
    fs.mkdirSync(path.dirname(ficheiroRecentes()), { recursive: true });
    fs.writeFileSync(ficheiroRecentes(), JSON.stringify(lista, null, 2), 'utf8');
  } catch {
    // A lista de recentes é só uma comodidade: se não der para gravar, segue.
  }
}

export function abrirProjeto(pasta: string): EstadoProjeto {
  const estado = repo.obterEstado(path.resolve(pasta));
  pastaAtual = estado.pasta;
  registarRecente(estado);
  return estado;
}

/** Cria um projeto. Com "comPortais", o exemplo inclui também os casos de uso com os dois portais de crédito. */
export function criarProjeto(pasta: string, nome: string, comExemplo: boolean, comPortais = false): EstadoProjeto {
  const destino = path.resolve(pasta);
  repo.criarProjeto(destino, nome);
  if (comExemplo) criarExemplo(destino);
  if (comExemplo && comPortais) criarExemploPortais(destino);
  return abrirProjeto(destino);
}

export function registarIpcProjeto(): void {
  ipcMain.handle('projeto:atual', () => (pastaAtual ? repo.obterEstado(pastaAtual) : null));
  ipcMain.handle('projeto:recentes', () => lerRecentes());
  ipcMain.handle('projeto:escolher-pasta', async (evento) => {
    const janela = BrowserWindow.fromWebContents(evento.sender);
    const opcoes: Electron.OpenDialogOptions = {
      title: 'Escolher a pasta do projeto',
      properties: ['openDirectory', 'createDirectory'],
    };
    const resultado = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);
    return resultado.canceled ? null : resultado.filePaths[0];
  });
  ipcMain.handle('projeto:criar', (_e, pasta: string, nome: string, comExemplo: boolean) =>
    criarProjeto(String(pasta), String(nome), Boolean(comExemplo), true),
  );
  ipcMain.handle('projeto:abrir', (_e, pasta: string) => abrirProjeto(String(pasta)));
  ipcMain.handle('projeto:abrir-exemplo', () => abrirExemplo());
  ipcMain.handle('projeto:apagar-exemplo', () => apagarExemplo());
  ipcMain.handle('projeto:abrir-wiki', () => abrirWiki());
  ipcMain.handle('projeto:fechar', () => {
    pastaAtual = null;
  });
  ipcMain.handle('projeto:definir-ambiente', (_e, ambienteId: string) => {
    repo.definirAmbienteAtivo(pastaDoProjeto(), String(ambienteId));
    return repo.obterEstado(pastaDoProjeto());
  });

  ipcMain.handle('variaveis:ler', () => repo.lerVariaveis(pastaDoProjeto()));
  ipcMain.handle('variaveis:gravar', (_e, variaveis: unknown) => {
    if (!Array.isArray(variaveis)) throw new repo.ErroProjeto('Dados inválidos.');
    for (const v of variaveis as VariavelCalculada[]) {
      const erro = validarFormula(String(v?.formula ?? ''));
      if (erro) throw new repo.ErroProjeto(`A fórmula de {${String(v?.nome ?? '')}} tem um erro: ${erro}`);
    }
    return repo.gravarVariaveis(pastaDoProjeto(), variaveis as VariavelCalculada[]);
  });
  ipcMain.handle('contadores:ler', () => repo.lerContadores(pastaDoProjeto()));
  ipcMain.handle('contadores:definir', (_e, nome: string, valor: number | null) =>
    repo.definirContador(pastaDoProjeto(), String(nome), valor === null ? null : Number(valor)),
  );

  ipcMain.handle('dados:listar', (_e, colecao: NomeColecao) => repo.listar(pastaDoProjeto(), colecao));
  ipcMain.handle('dados:guardar', (_e, colecao: NomeColecao, item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new repo.ErroProjeto('Dados inválidos.');
    return repo.guardar(pastaDoProjeto(), colecao, item as never);
  });
  ipcMain.handle('dados:apagar', (_e, colecao: NomeColecao, id: string) =>
    repo.apagar(pastaDoProjeto(), colecao, String(id)),
  );
  // Reparar com um clique: o localizador que funcionou passa a ser o preferido do passo.
  ipcMain.handle('blocos:reparar', (_e, sugestao: SugestaoReparo): EstadoReparo => {
    const ehLocalizador = (l: unknown): l is Localizador =>
      typeof l === 'object' && l !== null && typeof (l as Localizador).tipo === 'string' && typeof (l as Localizador).valor === 'string';
    if (!sugestao || !ehLocalizador(sugestao.usado) || !ehLocalizador(sugestao.falhou)) throw new repo.ErroProjeto('Dados inválidos.');
    const pasta = pastaDoProjeto();
    if (!repo.existe(pasta, 'blocos', String(sugestao.blocoId))) return 'nao-encontrado';
    const bloco = repo.ler(pasta, 'blocos', String(sugestao.blocoId));
    const estado = repararLocalizador(bloco, { passoId: String(sugestao.passoId), usado: sugestao.usado, falhou: sugestao.falhou });
    if (estado === 'reparado') repo.guardar(pasta, 'blocos', bloco);
    return estado;
  });
  // "Transformar valores fixos em colunas": os passos escolhidos passam a usar {Coluna} e os casos das
  // jornadas que usam o bloco ganham a coluna com o valor gravado.
  ipcMain.handle('blocos:parametrizar', (_e, blocoId: string, escolhas: Escolha[]): { colunas: string[]; jornadas: string[] } => {
    const pasta = pastaDoProjeto();
    if (!repo.existe(pasta, 'blocos', String(blocoId))) throw new repo.ErroProjeto('O bloco já não existe.');
    const lista = (Array.isArray(escolhas) ? escolhas : []).map((e) => ({ passoId: String(e?.passoId ?? ''), coluna: String(e?.coluna ?? '') }));
    const jornadas = repo.listar(pasta, 'jornadas');
    const conjuntos = repo.listar(pasta, 'casos');
    let resultado;
    try {
      resultado = parametrizar(repo.ler(pasta, 'blocos', String(blocoId)), jornadas, conjuntos, lista);
    } catch (erro) {
      throw new repo.ErroProjeto(erro instanceof Error ? erro.message : String(erro));
    }
    repo.guardar(pasta, 'blocos', resultado.bloco);
    for (const c of resultado.conjuntos) repo.guardar(pasta, 'casos', c);
    return { colunas: resultado.colunas, jornadas: resultado.conjuntos.map((c) => jornadas.find((j) => j.id === c.id)?.nome ?? c.id) };
  });
}
