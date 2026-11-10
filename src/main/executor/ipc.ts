// Liga a interface às execuções (correr, parar, histórico, evidências) e ao Excel dos casos.
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AmbitoRun, OpcoesRun } from '../../shared/modelo';
import { exportarCasos, importarCasos } from '../excel/casosExcel';
import { pastaDoProjeto } from '../projeto/ipc';
import * as repo from '../projeto/repositorio';
import { caminhoNaExecucao, estadoRun, iniciarRun, listarHistorico, pararRun } from './execucao';

const FILTRO_EXCEL = [{ name: 'Excel', extensions: ['xlsx'] }];

export function registarIpcExecucoes(): void {
  ipcMain.handle('run:estado', () => estadoRun());
  ipcMain.handle('run:iniciar', (_e, ambito: AmbitoRun, opcoes: OpcoesRun) => iniciarRun(pastaDoProjeto(), ambito ?? {}, opcoes));
  ipcMain.handle('run:parar', () => pararRun());
  ipcMain.handle('run:historico', () => listarHistorico(pastaDoProjeto()));

  // Abre a pasta ou um ficheiro da execução no Windows (Explorador, Excel, browser...).
  ipcMain.handle('run:abrir', async (_e, ...partes: string[]) => {
    const destino = caminhoNaExecucao(pastaDoProjeto(), ...partes.map(String));
    if (!fs.existsSync(destino)) throw new repo.ErroProjeto('Esse ficheiro já não existe.');
    const erro = await shell.openPath(destino);
    if (erro) throw new repo.ErroProjeto(`Não foi possível abrir: ${erro}`);
  });
  ipcMain.handle('run:ler-texto', (_e, ...partes: string[]) => {
    const destino = caminhoNaExecucao(pastaDoProjeto(), ...partes.map(String));
    return fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : '';
  });
  // Devolve um print como "data:" para a interface o mostrar.
  ipcMain.handle('run:imagem', (_e, ...partes: string[]) => {
    const destino = caminhoNaExecucao(pastaDoProjeto(), ...partes.map(String));
    if (!destino.toLowerCase().endsWith('.png') || !fs.existsSync(destino)) return null;
    return `data:image/png;base64,${fs.readFileSync(destino).toString('base64')}`;
  });

  ipcMain.handle('casos:importar', async (evento, jornadaId: string) => {
    const pasta = pastaDoProjeto();
    const jornada = repo.ler(pasta, 'jornadas', String(jornadaId));
    const janela = BrowserWindow.fromWebContents(evento.sender);
    const opcoes: Electron.OpenDialogOptions = { title: 'Importar casos de um Excel', filters: FILTRO_EXCEL, properties: ['openFile'] };
    const escolha = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);
    if (escolha.canceled || !escolha.filePaths[0]) return null;
    const { conjunto, ignorados } = await importarCasos(escolha.filePaths[0], jornada.id);
    repo.guardar(pasta, 'casos', conjunto);
    return { casos: conjunto.casos.length, ignorados };
  });
  ipcMain.handle('casos:exportar', async (evento, jornadaId: string) => {
    const pasta = pastaDoProjeto();
    const jornada = repo.ler(pasta, 'jornadas', String(jornadaId));
    const conjunto = repo.existe(pasta, 'casos', jornada.id)
      ? repo.ler(pasta, 'casos', jornada.id)
      : { id: jornada.id, colunas: [], casos: [] };
    const janela = BrowserWindow.fromWebContents(evento.sender);
    const opcoes: Electron.SaveDialogOptions = {
      title: 'Exportar casos para Excel',
      filters: FILTRO_EXCEL,
      defaultPath: path.join(pasta, `casos_${jornada.id}.xlsx`),
    };
    const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
    if (escolha.canceled || !escolha.filePath) return null;
    await exportarCasos(escolha.filePath, conjunto);
    return escolha.filePath;
  });
}
