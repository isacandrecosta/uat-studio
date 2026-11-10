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
