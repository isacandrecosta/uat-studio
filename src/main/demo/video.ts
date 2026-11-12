// Gravação dos vídeos da demo: uma janela escondida (gravador.html) recebe imagens da janela da app
// (capturePage) ou da página do Edge (screenshot do Playwright), cerca de 10 por segundo, desenha por cima
// o título do capítulo e as legendas, e grava tudo em .webm com o MediaRecorder (sem ffmpeg).
// Pedir as imagens à app (em vez de capturar o ecrã do Windows) funciona com a janela tapada ou o ecrã
// bloqueado. Só é usada pelo modo demo (npm.cmd run demo); a app normal nunca grava o ecrã.
import { BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright-core';

const INTERVALO_MS = 100;

export class GravadorDeVideo {
  private laco: NodeJS.Timeout | null = null;
  private ocupado = false;

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

  private pararLaco(): void {
    if (this.laco) clearInterval(this.laco);
    this.laco = null;
  }

  /** Vai buscando imagens (JPEG) e entregando-as à tela do gravador. */
  private iniciarLaco(capturar: () => Promise<Buffer>): void {
    this.pararLaco();
    const passo = async (): Promise<void> => {
      if (this.ocupado || this.janela.isDestroyed()) return;
      this.ocupado = true;
      try {
        const jpg = await capturar();
        await this.correr(`window.demo.imagem(${JSON.stringify(`data:image/jpeg;base64,${jpg.toString('base64')}`)})`);
      } catch {
        // Uma imagem que falha (página a mudar) não interrompe o vídeo.
      } finally {
        this.ocupado = false;
      }
    };
    void passo();
    this.laco = setInterval(() => void passo(), INTERVALO_MS);
  }

  /** Passa a mostrar a janela da app. */
  async mostrarJanela(janela: BrowserWindow): Promise<void> {
    this.iniciarLaco(async () => (await janela.webContents.capturePage()).toJPEG(85));
  }

  /** Passa a mostrar uma página do Edge (o browser do gravador). */
  async mostrarPagina(pagina: Page): Promise<boolean> {
    this.iniciarLaco(() => pagina.screenshot({ type: 'jpeg', quality: 80 }));
    return true;
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
    this.pararLaco();
    if (!this.janela.isDestroyed()) this.janela.destroy();
  }
}
