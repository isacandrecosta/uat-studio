// O que o preload expõe à interface (ver src/main/preload.ts).
import type {
  AmbitoRun,
  EstadoRun,
  OpcoesRun,
  Bloco,
  Colecoes,
  EstadoGravador,
  EstadoProjeto,
  NomeColecao,
  PedidoGravacao,
  ProjetoRecente,
  ResultadoApi,
  VariavelCalculada,
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
      runs: {
        /** A execução em curso ou a última desta sessão. */
        estado(): Promise<EstadoRun | null>;
        iniciar(ambito: AmbitoRun, opcoes: OpcoesRun): Promise<EstadoRun>;
        parar(): Promise<EstadoRun | null>;
        historico(): Promise<EstadoRun[]>;
        /** Abre no Windows uma pasta ou ficheiro dentro de `execucoes/`. */
        abrir(...partes: string[]): Promise<void>;
        lerTexto(...partes: string[]): Promise<string>;
        /** Um print em formato "data:", ou null se não existir. */
        imagem(...partes: string[]): Promise<string | null>;
        aoAtualizar(callback: (estado: EstadoRun) => void): () => void;
      };
      variaveis: {
        ler(): Promise<VariavelCalculada[]>;
        /** Substitui a lista toda. Dá erro se algum nome ou fórmula estiver mal. */
        gravar(variaveis: VariavelCalculada[]): Promise<VariavelCalculada[]>;
      };
      contadores: {
        ler(): Promise<Record<string, number>>;
        /** `null` apaga o contador. */
        definir(nome: string, valor: number | null): Promise<Record<string, number>>;
      };
      api: {
        /** Executa um bloco de API sozinho, com os dados de um caso de exemplo (`idDaJornada/idDoCaso`). */
        testar(bloco: Bloco, chaveCaso?: string): Promise<ResultadoApi>;
      };
      /** Cofre de segredos: dá para guardar e saber se está preenchido, mas nunca para ler. */
      cofre: {
        /** Um valor vazio apaga o segredo. */
        definir(nome: string, valor: string): Promise<void>;
        preenchidos(nomes: string[]): Promise<Record<string, boolean>>;
        apagarPerfil(perfilId: string): Promise<void>;
      };
      casos: {
        /** Pede um Excel e substitui os casos da jornada. null se o utilizador cancelar. */
        importar(jornadaId: string): Promise<{ casos: number; ignorados: number } | null>;
        /** Devolve o caminho do ficheiro gravado, ou null se o utilizador cancelar. */
        exportar(jornadaId: string): Promise<string | null>;
      };
    };
  }
}
