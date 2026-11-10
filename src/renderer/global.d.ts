// O que o preload expõe à interface (ver src/main/preload.ts).
export {};

declare global {
  interface ResultadoAbrirBrowser {
    ok: boolean;
    mensagem: string;
  }

  interface Window {
    uatStudio: {
      abrirAppPoc(): Promise<ResultadoAbrirBrowser>;
    };
  }
}
