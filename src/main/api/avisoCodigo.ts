// Login com código noutro dispositivo: mostra o código na janela da ferramenta (a interface desenha o aviso)
// e guarda o endereço onde o escrever, para o botão "Abrir a página" (só endereços https).
import { BrowserWindow, ipcMain, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import type { AvisoCodigo } from './pedidos';

interface Pendente {
  url: string;
  cancelado: boolean;
}
const pendentes = new Map<string, Pendente>();
let janelaPrincipal: BrowserWindow | null = null;
/** Último aviso mostrado (para o smoke saber o código sem ler o ecrã). */
let ultimo: (AvisoCodigo & { id: string }) | null = null;

export function ultimoAvisoDeCodigo(): (AvisoCodigo & { id: string }) | null {
  return ultimo;
}

export function registarAvisoCodigo(janela: BrowserWindow): void {
  janelaPrincipal = janela;
  ipcMain.handle('login:codigo-cancelar', (_e, id: string) => {
    const p = pendentes.get(id);
    if (p) p.cancelado = true;
  });
  ipcMain.handle('login:codigo-abrir', async (_e, id: string) => {
    const p = pendentes.get(id);
    if (p && /^https:\/\//i.test(p.url)) await shell.openExternal(p.url);
  });
}

export function mostrarCodigo(aviso: AvisoCodigo): { fechar(): void; cancelado(): boolean } {
  const id = randomBytes(6).toString('hex');
  const pendente: Pendente = { url: aviso.url, cancelado: false };
  pendentes.set(id, pendente);
  ultimo = { ...aviso, id };
  const enviar = (canal: string, dados: unknown): void => {
    if (janelaPrincipal && !janelaPrincipal.isDestroyed()) janelaPrincipal.webContents.send(canal, dados);
  };
  enviar('login:codigo', { id, ...aviso });
  return {
    fechar: () => {
      pendentes.delete(id);
      if (ultimo?.id === id) ultimo = null;
      enviar('login:codigo-fechar', id);
    },
    cancelado: () => pendente.cancelado,
  };
}
