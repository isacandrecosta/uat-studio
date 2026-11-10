// O que o preload expõe à interface (ver src/main/preload.ts).
import type { Colecoes, EstadoProjeto, NomeColecao, ProjetoRecente } from '../shared/modelo';

declare global {
  interface ResultadoAbrirBrowser {
    ok: boolean;
    mensagem: string;
  }

  interface Window {
    uatStudio: {
      abrirAppPoc(): Promise<ResultadoAbrirBrowser>;
      projeto: {
        atual(): Promise<EstadoProjeto | null>;
        recentes(): Promise<ProjetoRecente[]>;
        escolherPasta(): Promise<string | null>;
        criar(pasta: string, nome: string, comExemplo: boolean): Promise<EstadoProjeto>;
        abrir(pasta: string): Promise<EstadoProjeto>;
        fechar(): Promise<void>;
        definirAmbiente(ambienteId: string): Promise<EstadoProjeto>;
      };
      dados: {
        listar<C extends NomeColecao>(colecao: C): Promise<Colecoes[C][]>;
        guardar<C extends NomeColecao>(
          colecao: C,
          item: Omit<Colecoes[C], 'id'> & { id?: string },
        ): Promise<Colecoes[C]>;
        apagar(colecao: NomeColecao, id: string): Promise<void>;
      };
    };
  }
}
