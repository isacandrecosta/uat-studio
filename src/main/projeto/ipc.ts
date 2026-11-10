// Liga a interface ao projeto aberto: escolher/criar/abrir projeto e ler/gravar os dados.
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EstadoProjeto, NomeColecao, ProjetoRecente } from '../../shared/modelo';
import { criarExemplo } from './exemplo';
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
    return Array.isArray(lista) ? lista.filter((r) => repo.existeProjeto(r.pasta)) : [];
  } catch {
    return [];
  }
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

export function criarProjeto(pasta: string, nome: string, comExemplo: boolean): EstadoProjeto {
  const destino = path.resolve(pasta);
  repo.criarProjeto(destino, nome);
  if (comExemplo) criarExemplo(destino);
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
    criarProjeto(String(pasta), String(nome), Boolean(comExemplo)),
  );
  ipcMain.handle('projeto:abrir', (_e, pasta: string) => abrirProjeto(String(pasta)));
  ipcMain.handle('projeto:fechar', () => {
    pastaAtual = null;
  });
  ipcMain.handle('projeto:definir-ambiente', (_e, ambienteId: string) => {
    repo.definirAmbienteAtivo(pastaDoProjeto(), String(ambienteId));
    return repo.obterEstado(pastaDoProjeto());
  });

  ipcMain.handle('dados:listar', (_e, colecao: NomeColecao) => repo.listar(pastaDoProjeto(), colecao));
  ipcMain.handle('dados:guardar', (_e, colecao: NomeColecao, item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new repo.ErroProjeto('Dados inválidos.');
    return repo.guardar(pastaDoProjeto(), colecao, item as never);
  });
  ipcMain.handle('dados:apagar', (_e, colecao: NomeColecao, id: string) =>
    repo.apagar(pastaDoProjeto(), colecao, String(id)),
  );
}
