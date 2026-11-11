// Pacotes de blocos (exportar/importar): escolher o ficheiro, ler e gravar no projeto aberto.
import { BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'node:fs';
import { aplicarImportacao, criarPacote, lerPacote, planearImportacao, type Conflito, type Pacote } from '../../shared/pacotes';
import { pastaDoProjeto } from './ipc';
import * as repo from './repositorio';

const FILTRO = [{ name: 'Pacote de blocos do UAT Studio', extensions: ['uatpack', 'json'] }];

function janelaDe(evento: Electron.IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(evento.sender) ?? undefined;
}

/** Grava um pacote num ficheiro (sem diálogo): usado pelos testes e pelo IPC. */
export function exportarPacote(pasta: string, blocoIds: string[], ficheiro: string): Pacote {
  const pacote = criarPacote(blocoIds, repo.listar(pasta, 'blocos'), repo.listar(pasta, 'aplicacoes'), repo.listar(pasta, 'perfis'), repo.lerProjeto(pasta).nome);
  fs.writeFileSync(ficheiro, `${JSON.stringify(pacote, null, 2)}\n`, 'utf8');
  return pacote;
}

/** Importa um pacote para o projeto. Devolve quantos blocos entraram e quantos foram saltados. */
export function importarPacote(pasta: string, pacote: Pacote, conflito: Conflito): { blocos: number; aplicacoes: number; perfis: number; saltados: number } {
  const plano = aplicarImportacao(pacote, { blocos: repo.listar(pasta, 'blocos'), aplicacoes: repo.listar(pasta, 'aplicacoes'), perfis: repo.listar(pasta, 'perfis') }, conflito);
  for (const aplicacao of plano.aplicacoes) repo.guardar(pasta, 'aplicacoes', aplicacao);
  for (const perfil of plano.perfis) repo.guardar(pasta, 'perfis', perfil);
  for (const bloco of plano.blocos) repo.guardar(pasta, 'blocos', bloco as never);
  return { blocos: plano.blocos.length, aplicacoes: plano.aplicacoes.length, perfis: plano.perfis.length, saltados: plano.saltados };
}

export function registarIpcPacotes(): void {
  ipcMain.handle('pacotes:exportar', async (evento, blocoIds: string[]) => {
    const pasta = pastaDoProjeto();
    const nome = `blocos-${new Date().toISOString().slice(0, 10)}.uatpack`;
    const opcoes: Electron.SaveDialogOptions = { title: 'Exportar pacote de blocos', defaultPath: nome, filters: FILTRO };
    const janela = janelaDe(evento);
    const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
    if (escolha.canceled || !escolha.filePath) return null;
    exportarPacote(pasta, (blocoIds ?? []).map(String), escolha.filePath);
    return escolha.filePath;
  });

  /** Escolhe um pacote e devolve-o com o plano (o que é novo, igual ou diferente neste projeto). */
  ipcMain.handle('pacotes:abrir', async (evento) => {
    const pasta = pastaDoProjeto();
    const opcoes: Electron.OpenDialogOptions = { title: 'Importar pacote de blocos', properties: ['openFile'], filters: FILTRO };
    const janela = janelaDe(evento);
    const escolha = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);
    if (escolha.canceled || !escolha.filePaths[0]) return null;
    const pacote = lerPacote(fs.readFileSync(escolha.filePaths[0], 'utf8'));
    return { pacote, plano: planearImportacao(pacote, repo.listar(pasta, 'blocos')).map((i) => ({ id: i.bloco.id, nome: i.bloco.nome, tipo: i.bloco.tipo, estado: i.estado })) };
  });

  ipcMain.handle('pacotes:importar', (_e, pacote: unknown, conflito: Conflito) => {
    const valido = lerPacote(JSON.stringify(pacote));
    const escolha: Conflito = conflito === 'substituir' || conflito === 'copia' ? conflito : 'saltar';
    return importarPacote(pastaDoProjeto(), valido, escolha);
  });
}
