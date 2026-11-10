// Modelo de dados do projeto. Cada item é guardado num ficheiro JSON próprio
// dentro da pasta do projeto (ver docs/ESPECIFICACAO.md, secção 1).
// Este ficheiro só tem tipos: é usado pelo processo principal e pela interface.

export const FORMATO_PROJETO = 1;

export type TipoAmbiente = 'DEV' | 'QA' | 'PRD';

export interface Ambiente {
  id: string;
  nome: string;
  tipo: TipoAmbiente;
}

/** Conteúdo de `projeto.json`. */
export interface Projeto {
  formato: number;
  nome: string;
  criadoEm: string;
  ambientes: Ambiente[];
  /** Id do ambiente escolhido para gravar e correr. */
  ambienteAtivo: string;
}

export type TipoAplicacao = 'FO' | 'BO' | 'API' | 'EMAIL';

/** Um sistema a testar (portal, API, caixa de email). */
export interface Aplicacao {
  id: string;
  nome: string;
  tipo: TipoAplicacao;
  cor: string;
  /** URL por ambiente: { idDoAmbiente: url }. */
  urls: Record<string, string>;
}

export interface Epico {
  id: string;
  nome: string;
  descricao?: string;
}

/** De onde vem um valor usado num passo. */
export type Valor =
  | { tipo: 'fixo'; valor: string }
  | { tipo: 'variavel'; nome: string }
  | { tipo: 'formula'; expressao: string }
  | { tipo: 'gerador'; gerador: string };

export type TipoLocalizador = 'testid' | 'etiqueta' | 'role' | 'placeholder' | 'texto' | 'id' | 'css';

/** Uma forma de encontrar um elemento. Guardam-se várias por elemento, por ordem de preferência. */
export interface Localizador {
  tipo: TipoLocalizador;
  valor: string;
  /** Só para `role`: o nome acessível do elemento. */
  nome?: string;
}

export interface Alvo {
  /** Descrição legível do elemento (por exemplo, "Campo Montante"). */
  descricao: string;
  localizadores: Localizador[];
  /** Widget OutSystems reconhecido por regras (por exemplo, "dropdown"). */
  widget?: string;
}

export type AcaoPasso =
  | 'navegar'
  | 'escrever'
  | 'escolher'
  | 'marcar'
  | 'clicar'
  | 'verificar'
  | 'guardar'
  | 'esperar';

export type TipoVerificacao = 'texto' | 'valor' | 'visivel' | 'numero';

/** Um passo gravado dentro de um bloco de UI. */
export interface Passo {
  id: string;
  acao: AcaoPasso;
  descricao: string;
  alvo?: Alvo;
  valor?: Valor;
  /** Para `verificar`. */
  verificacao?: {
    tipo: TipoVerificacao;
    /** Para `numero`: diferença máxima aceite (por exemplo "0,01"). */
    tolerancia?: string;
  };
  /** Para `guardar`: nome da variável onde fica o valor lido. */
  variavel?: string;
  /** O valor é um segredo (por exemplo, uma password): nunca aparece em logs nem relatórios. */
  secreto?: boolean;
}

/** O que a interface recebe sobre a gravação em curso. */
export interface EstadoGravador {
  ativo: boolean;
  /** O browser ainda está aberto? (o utilizador pode tê-lo fechado) */
  browserAberto: boolean;
  aplicacaoNome: string;
  bloco: Bloco | null;
  /** Último aviso (por exemplo, um passo que não foi possível gravar). */
  mensagem?: string;
}

// ---------- Execuções (runs) ----------

/** OK: tudo coincide. KO: chegou ao fim mas há valores diferentes. ERRO: não chegou ao fim. */
export type EstadoCaso = 'por-correr' | 'a-correr' | 'OK' | 'KO' | 'ERRO' | 'PARADO';

/** Um valor que não coincidiu numa verificação. */
export interface Diferenca {
  bloco: string;
  passo: string;
  esperado: string;
  obtido: string;
  /** Só para números: a diferença entre os dois. */
  diferenca?: string;
}

export type EstadoPasso = 'ok' | 'ko' | 'erro' | 'ignorado';

/** Uma linha do log de um caso. */
export interface RegistoPasso {
  bloco: string;
  descricao: string;
  estado: EstadoPasso;
  detalhe?: string;
  duracaoMs: number;
}

export interface ResultadoCaso {
  /** `idDaJornada/idDoCaso` */
  chave: string;
  jornadaId: string;
  jornadaNome: string;
  casoId: string;
  casoNome?: string;
  estado: EstadoCaso;
  /** Enquanto corre: o que está a fazer. */
  passoAtual?: string;
  diferencas: Diferenca[];
  erro?: {
    /** Frase simples sobre o que aconteceu. */
    mensagem: string;
    bloco: string;
    passo: string;
    /** Blocos que ficaram por executar. */
    porExecutar: string[];
  };
  passos: RegistoPasso[];
  /** Variáveis guardadas durante a jornada. */
  variaveis: Record<string, string>;
  duracaoMs: number;
  /** Pasta com as evidências deste caso (relativa à pasta da execução). */
  pasta?: string;
  /** Ficheiros de evidência (prints, trace), relativos à pasta do caso. */
  evidencias?: string[];
}

export interface OpcoesRun {
  canal: 'msedge' | 'chrome';
  /** true: vê-se o browser; false: corre em background. */
  visivel: boolean;
  /** Quantos casos correm ao mesmo tempo (1, 2, 4 ou 8). */
  paralelo: number;
  /** O utilizador confirmou que quer mesmo correr num ambiente de produção. */
  confirmouProducao?: boolean;
}

/** O que correr: tudo, épicos, jornadas ou casos escolhidos (`idDaJornada/idDoCaso`). */
export interface AmbitoRun {
  epicoIds?: string[];
  jornadaIds?: string[];
  chavesCasos?: string[];
  /** Só os casos (ou jornadas) com alguma destas etiquetas. */
  etiquetas?: string[];
}

export interface EstadoRun {
  id: string;
  /** Descrição curta do âmbito (por exemplo, o nome da jornada). */
  nome: string;
  ativo: boolean;
  /** Foi pedido para parar. */
  aParar: boolean;
  inicio: string;
  fim?: string;
  ambiente: string;
  tipoAmbiente: TipoAmbiente;
  opcoes: OpcoesRun;
  casos: ResultadoCaso[];
  /** Pasta da execução (dentro de `execucoes/`). */
  pasta?: string;
}

export interface PedidoGravacao {
  aplicacaoId: string;
  /** Acrescentar passos a um bloco existente... */
  blocoId?: string;
  /** ...ou criar um bloco novo com este nome. */
  nomeNovo?: string;
  /** O bloco começa por abrir a aplicação. */
  abrirAplicacao: boolean;
  canal: 'msedge' | 'chrome';
  /** O utilizador confirmou que quer mesmo gravar num ambiente de produção. */
  confirmouProducao?: boolean;
}

export type TipoBloco = 'UI' | 'API' | 'EMAIL' | 'VERIFICACAO';

/** Unidade reutilizável: alterada num sítio, atualiza todas as jornadas que a usam. */
export interface Bloco {
  id: string;
  nome: string;
  tipo: TipoBloco;
  aplicacaoId?: string;
  descricao?: string;
  passos: Passo[];
}

/** Um bloco colocado numa jornada. */
export interface BlocoDaJornada {
  id: string;
  blocoId: string;
  /** Troca variáveis do bloco por outros valores só nesta jornada: { NomeNoBloco: valor }. */
  parametros?: Record<string, Valor>;
}

export interface Jornada {
  id: string;
  nome: string;
  epicoId: string;
  requisitoId?: string;
  etiquetas: string[];
  blocos: BlocoDaJornada[];
}

/** Uma variante: uma linha de dados para a jornada. */
export interface Caso {
  id: string;
  nome?: string;
  etiquetas: string[];
  dados: Record<string, string>;
}

/** Os casos de uma jornada ficam juntos num ficheiro (`casos/<idDaJornada>.json`). */
export interface ConjuntoCasos {
  id: string;
  colunas: string[];
  casos: Caso[];
}

export interface Colecoes {
  aplicacoes: Aplicacao;
  epicos: Epico;
  jornadas: Jornada;
  blocos: Bloco;
  casos: ConjuntoCasos;
}

export type NomeColecao = keyof Colecoes;

export const NOMES_COLECOES: NomeColecao[] = ['aplicacoes', 'epicos', 'jornadas', 'blocos', 'casos'];

/** O que a interface recebe sobre o projeto aberto. */
export interface EstadoProjeto {
  pasta: string;
  projeto: Projeto;
  contagens: Record<NomeColecao, number>;
}

export interface ProjetoRecente {
  pasta: string;
  nome: string;
  abertoEm: string;
}
