// O que o preload expõe à interface (ver src/main/preload.ts).
import type {
  Bloco,
  Colecoes,
  EstadoGravador,
  EstadoProjeto,
  NomeColecao,
  PedidoGravacao,
  ProjetoRecente,
} from '../shared/modelo';

declare global {
  interface Window {
    uatStudio: {
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
      gravador: {
        estado(): Promise<EstadoGravador>;
        iniciar(pedido: PedidoGravacao): Promise<EstadoGravador>;
        removerPasso(passoId: string): Promise<EstadoGravador>;
        /** Fecha o browser; com `guardar`, grava o bloco no projeto. */
        terminar(guardar: boolean): Promise<Bloco | null>;
        /** Devolve a função para deixar de ouvir. */
        aoAtualizar(callback: (estado: EstadoGravador) => void): () => void;
      };
    };
  }
}
