// Gravação dos vídeos da demo: uma janela escondida (gravador.html) recebe a imagem de uma janela do Windows
// (a da app ou a do Edge), desenha por cima o título do capítulo e as legendas, e grava tudo em .webm.
// Só é usada pelo modo demo (npm.cmd run demo); a app normal nunca grava o ecrã.
import { BrowserWindow, desktopCapturer } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class GravadorDeVideo {
  private constructor(private readonly janela: BrowserWindow) {}

  static async criar(raiz: string): Promise<GravadorDeVideo> {
    const janela = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    await janela.loadFile(path.join(raiz, 'src', 'main', 'demo', 'gravador.html'));
    return new GravadorDeVideo(janela);
  }

  private correr<T>(codigo: string): Promise<T> {
    return this.janela.webContents.executeJavaScript(codigo) as Promise<T>;
  }

  /** Passa a mostrar a janela da app. */
  async mostrarJanela(janela: BrowserWindow): Promise<void> {
    await this.correr(`window.demo.fonte(${JSON.stringify(janela.getMediaSourceId())})`);
  }

  /** Passa a mostrar a janela do Edge cujo título contém o texto (devolve falso se não a encontrar). */
  async mostrarEdge(titulo = 'Edge'): Promise<boolean> {
    for (let tentativa = 0; tentativa < 20; tentativa++) {
      const fontes = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
      const edge = fontes.find((f) => f.name.includes(titulo) && f.name.includes('Edge'));
      if (edge) {
        await this.correr(`window.demo.fonte(${JSON.stringify(edge.id)})`);
        return true;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  legenda(texto: string): Promise<void> {
    return this.correr(`window.demo.legenda(${JSON.stringify(texto)})`);
  }

  titulo(texto: string, sub = ''): Promise<void> {
    return this.correr(`window.demo.titulo(${JSON.stringify(texto)}, ${JSON.stringify(sub)})`);
  }

  iniciar(): Promise<void> {
    return this.correr('window.demo.iniciar()');
  }

  async parar(ficheiro: string): Promise<number> {
    const base64 = await this.correr<string>('window.demo.parar()');
    const bytes = Buffer.from(base64, 'base64');
    fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
    fs.writeFileSync(ficheiro, bytes);
    return bytes.length;
  }

  fechar(): void {
    if (!this.janela.isDestroyed()) this.janela.destroy();
  }
}
