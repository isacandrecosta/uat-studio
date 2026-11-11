// O que o preload expõe à interface (ver src/main/preload.ts).
import type { EstadoReparo } from '../shared/blocos';
import type { Conflito, Pacote } from '../shared/pacotes';
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
  ResultadoVerificacao,
  PassoSobrePrint,
  PrintDoEcra,
  SugestaoReparo,
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
        /** Abre o projeto de exemplo (cria-o na 1.ª vez). */
        abrirExemplo(): Promise<EstadoProjeto>;
        /** Apaga o projeto de exemplo aberto (e fecha-o). */
        apagarExemplo(): Promise<void>;
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
      blocos: {
        /** Reparar com um clique: o localizador que funcionou passa a ser o preferido do passo. */
        reparar(sugestao: SugestaoReparo): Promise<EstadoReparo>;
      };
      /** Pacotes de blocos (exportar/importar para outro projeto). */
      pacotes: {
        /** Pede onde gravar; devolve o caminho, ou null se cancelar. */
        exportar(blocoIds: string[]): Promise<string | null>;
        /** Pede o ficheiro; devolve o pacote e o que é novo/igual/diferente neste projeto, ou null se cancelar. */
        abrir(): Promise<{ pacote: Pacote; plano: Array<{ id: string; nome: string; tipo: string; estado: 'novo' | 'igual' | 'diferente' }> } | null>;
        importar(pacote: Pacote, conflito: Conflito): Promise<{ blocos: number; aplicacoes: number; perfis: number; saltados: number }>;
      };
      gravador: {
        estado(): Promise<EstadoGravador>;
        iniciar(pedido: PedidoGravacao): Promise<EstadoGravador>;
        removerPasso(passoId: string): Promise<EstadoGravador>;
        /** Modo print: captura o ecrã do browser e os elementos por baixo. */
        capturar(): Promise<PrintDoEcra>;
        /** Modo print: grava um passo sobre um elemento da captura (sem o executar). */
        gravarSobrePrint(pedido: PassoSobrePrint): Promise<EstadoGravador>;
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
        /** Pausa entre passos (nunca a meio de uma ação). */
        pausar(): Promise<EstadoRun | null>;
        continuar(): Promise<EstadoRun | null>;
        /** Salta um caso (`idDaJornada/idDoCaso`), esteja por correr ou a correr. */
        saltar(chave: string): Promise<EstadoRun | null>;
        /** Miniaturas ao vivo do browser de cada worker (imagem "data:", ou null). */
        /** Pausa (ou continua) só um worker. */
        pausarWorker(numero: number, pausar: boolean): Promise<EstadoRun | null>;
        /** Salta os casos de uma jornada que ainda não terminaram. */
        saltarJornada(jornadaId: string): Promise<EstadoRun | null>;
        /** Resposta a um passo manual; com `anexar`, pede uma imagem ao testador (null se cancelar). */
        responderManual(chave: string, ok: boolean, nota: string, anexar: boolean): Promise<EstadoRun | null>;
        miniaturas(): Promise<Array<{ worker: number; chave: string; imagem: string | null }>>;
        /** Verificação antes de correr: o que falta ou está mal para esta escolha. */
        verificar(ambito: AmbitoRun): Promise<ResultadoVerificacao>;
        historico(): Promise<EstadoRun[]>;
        /** Abre no Windows uma pasta ou ficheiro dentro de `execucoes/`. */
        abrir(...partes: string[]): Promise<void>;
        lerTexto(...partes: string[]): Promise<string>;
        /** Abre um trace (.zip) numa janela com o visualizador do Playwright. */
        abrirTrace(...partes: string[]): Promise<'janela' | 'pasta'>;
        /** Faz o relatório de UAT para assinatura (PDF) de uma execução terminada e abre-o. Devolve o caminho. */
        pdf(pastaRun: string): Promise<string>;
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
