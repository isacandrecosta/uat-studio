// Liga a interface às execuções (correr, parar, histórico, evidências) e ao Excel dos casos.
import { BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AmbitoRun, Bloco, OpcoesRun } from '../../shared/modelo';
import { testarBloco } from '../api/ambiente';
import { apagarSegredosDoPerfil, definirSegredo, segredosPreenchidos } from '../cofre';
import { exportarCasos, importarCasos } from '../excel/casosExcel';
import { pastaDoProjeto } from '../projeto/ipc';
import * as repo from '../projeto/repositorio';
import { criarAmbienteApi } from '../api/ambiente';
import { caminhoNaExecucao, pausarWorker, responderManual, saltarJornada, continuarRun, estadoRun, iniciarRun, listarHistorico, miniaturasDosWorkers, pararRun, pausarRun, saltarCaso } from './execucao';
import { verificarAntesDeCorrer } from './verificar';

const FILTRO_EXCEL = [{ name: 'Excel', extensions: ['xlsx'] }];

export function registarIpcExecucoes(): void {
  ipcMain.handle('run:estado', () => estadoRun());
  ipcMain.handle('run:iniciar', (_e, ambito: AmbitoRun, opcoes: OpcoesRun) => iniciarRun(pastaDoProjeto(), ambito ?? {}, opcoes));
  ipcMain.handle('run:parar', () => pararRun());
  ipcMain.handle('run:pausar', () => pausarRun());
  ipcMain.handle('run:continuar', () => continuarRun());
  // Miniaturas ao vivo dos workers (reduzidas, para não pesar na interface).
  ipcMain.handle('run:miniaturas', async () =>
    (await miniaturasDosWorkers()).map(({ worker, chave, imagem }) => ({
      worker,
      chave,
      imagem: imagem ? `data:image/jpeg;base64,${nativeImage.createFromBuffer(imagem).resize({ width: 400, quality: 'good' }).toJPEG(70).toString('base64')}` : null,
    })),
  );
  // Passo manual: OK/KO do testador, com uma imagem opcional escolhida no disco.
  ipcMain.handle('run:responder-manual', async (evento, chave: string, ok: boolean, nota: string, anexar: boolean) => {
    let anexo: string | undefined;
    if (anexar) {
      const janela = BrowserWindow.fromWebContents(evento.sender);
      const opcoes: Electron.OpenDialogOptions = { title: 'Escolher o print a anexar', properties: ['openFile'], filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg'] }] };
      const escolha = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);
      if (escolha.canceled) return null;
      anexo = escolha.filePaths[0];
    }
    return responderManual(String(chave), { ok: Boolean(ok), nota: String(nota ?? ''), ...(anexo ? { anexo } : {}) });
  });
  ipcMain.handle('run:pausar-worker', (_e, numero: number, pausar: boolean) => pausarWorker(Number(numero), Boolean(pausar)));
  ipcMain.handle('run:saltar-jornada', (_e, jornadaId: string) => saltarJornada(String(jornadaId)));
  ipcMain.handle('run:saltar', (_e, chave: string) => saltarCaso(String(chave)));
  // Verificação antes de correr: o que falta ou está mal, sem abrir o browser.
  ipcMain.handle('run:verificar', (_e, ambito: AmbitoRun) => {
    const pasta = pastaDoProjeto();
    return verificarAntesDeCorrer(pasta, ambito ?? {}, {
      segredosPreenchidos: (nomes) => segredosPreenchidos(pasta, nomes),
      fetch: criarAmbienteApi(pasta).fetch,
    });
  });
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

  // Blocos de API: teste individual e cofre de segredos (os valores nunca voltam para a interface).
  ipcMain.handle('api:testar', (_e, bloco: Bloco, chaveCaso?: string) => testarBloco(pastaDoProjeto(), bloco, chaveCaso));
  ipcMain.handle('cofre:definir', (_e, nome: string, valor: string) => definirSegredo(pastaDoProjeto(), String(nome), String(valor ?? '')));
  ipcMain.handle('cofre:preenchidos', (_e, nomes: string[]) => segredosPreenchidos(pastaDoProjeto(), (nomes ?? []).map(String)));
  ipcMain.handle('cofre:apagar-perfil', (_e, perfilId: string) => apagarSegredosDoPerfil(pastaDoProjeto(), String(perfilId)));

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
