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
  /** Projeto de exemplo da ferramenta: pode ser apagado pela interface. */
  exemplo?: boolean;
  /** A Wiki de componentes OutSystems (também é um projeto de exemplo, que se pode apagar). */
  wiki?: boolean;
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
  /**
   * "Encontrar linha na tabela": o elemento está na linha que tem este texto numa das células
   * (por exemplo, o número do pedido). Os localizadores são então relativos a essa linha.
   */
  linha?: { valor: Valor };
  /** O elemento está dentro de um iframe: seletor do iframe na página (por exemplo [data-testid="ifrPagamento"]). */
  iframe?: string;
}

export type AcaoPasso =
  | 'navegar'
  | 'escrever'
  | 'escolher'
  | 'marcar'
  | 'clicar'
  | 'verificar'
  | 'guardar'
  | 'esperar'
  /** Simular a resposta de uma API externa (a partir daqui, nesta sessão do browser). */
  | 'simular'
  /** Intercetar o pedido que a app enviou (por exemplo, ao clicar em Pagar) e verificar os dados. */
  | 'intercetar'
  /** Carregar um ficheiro num campo de upload (o valor é o caminho do ficheiro). */
  | 'carregar'
  /** Clicar num botão/link que descarrega um ficheiro e guardá-lo (o valor, se houver, é um texto que o ficheiro tem de conter). */
  | 'descarregar'
  /** Passar a trabalhar noutro separador do browser (valor: "novo" ou "principal"). */
  | 'separador'
  /** Responder à próxima pergunta do browser (alert/confirm/prompt): valor "aceitar" ou "recusar". */
  | 'dialogo';

/** Passos de rede: que pedidos apanhar e o que fazer com eles. */
export interface PassoRede {
  /** Parte do endereço do pedido (por exemplo "easypay.pt/api/pagamentos"), ou um padrão com * . */
  url: string;
  /** Só pedidos com este método (vazio = qualquer). */
  metodo?: string;
  /** Simular: responder (com código e corpo), falhar (sem ligação) ou demorar (e depois falhar por tempo). */
  modo?: 'responder' | 'falhar' | 'demorar';
  estado?: number;
  /** Corpo da resposta simulada (pode ter {variáveis}). */
  corpo?: string;
  tipoConteudo?: string;
  demoraSeg?: number;
  /** Intercetar: campos do pedido enviado a verificar ("*" = o corpo todo contém o valor). */
  verificacoes?: Array<{ caminho: string; esperado: string }>;
  /** Intercetar: guardar um campo do pedido numa variável. */
  guardar?: { variavel: string; caminho: string };
}

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
    /** "Esperar até": quantos segundos esperar que o valor apareça (por omissão, poucos segundos). */
    esperaSeg?: number;
  };
  /** Passo condicional: fórmula que tem de ser verdadeira para o passo correr (por exemplo `{Produto} = "CP12"`). */
  condicao?: string;
  /** Para `guardar`: nome da variável onde fica o valor lido. */
  variavel?: string;
  /** Para `simular` e `intercetar`: o pedido de rede a apanhar. */
  rede?: PassoRede;
  /** O valor é um segredo (por exemplo, uma password): nunca aparece em logs nem relatórios. */
  secreto?: boolean;
}

/** Modo print: um elemento do ecrã capturado (posição em píxeis da captura). */
export interface ElementoDoPrint {
  x: number;
  y: number;
  largura: number;
  altura: number;
  especie: 'texto' | 'lista' | 'marca' | 'botao' | 'outro';
  descricao: string;
  /** Texto ou valor atual (serve de sugestão para verificar). */
  texto: string;
  opcoes?: string[];
}

/** Modo print: a captura do ecrã e a estrutura da página por baixo. */
export interface PrintDoEcra {
  /** Imagem "data:" da parte visível da página. */
  imagem: string;
  largura: number;
  altura: number;
  elementos: ElementoDoPrint[];
}

/** Modo print: o passo a gravar sobre um elemento da captura (não é executado na página). */
export interface PassoSobrePrint {
  elemento: number;
  acao: AcaoPasso;
  valor?: Valor;
  verificacao?: Passo['verificacao'];
  variavel?: string;
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
  /** A regravar o elemento deste passo (descrição), à espera que o testador aponte. */
  regravar?: string;
  /** O elemento já foi regravado (e o bloco guardado). */
  regravado?: boolean;
}

/**
 * Variável calculada por fórmula, disponível em todas as jornadas como {nome}.
 * É calculada uma vez por caso (na primeira vez que é usada) e mantém o valor até ao fim do caso.
 * Ficam todas em `variaveis.json`, na pasta do projeto.
 */
export interface VariavelCalculada {
  nome: string;
  formula: string;
  descricao?: string;
}

// ---------- Execuções (runs) ----------

/** OK: tudo coincide. KO: chegou ao fim mas há valores diferentes. ERRO: não chegou ao fim. */
export type EstadoCaso = 'por-correr' | 'a-correr' | 'OK' | 'KO' | 'ERRO' | 'PARADO' | 'SALTADO';

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
    /** Ids do bloco e do passo onde parou (para "Regravar este elemento"). */
    blocoId?: string;
    passoId?: string;
  };
  passos: RegistoPasso[];
  /** Variáveis guardadas durante a jornada. */
  variaveis: Record<string, string>;
  duracaoMs: number;
  /** Pasta com as evidências deste caso (relativa à pasta da execução). */
  pasta?: string;
  /** Ficheiros de evidência (prints, trace), relativos à pasta do caso. */
  evidencias?: string[];
  /** Estado de cada bloco da jornada neste caso (pela ordem do percurso), para o mapa de execução. */
  blocos?: EstadoBlocoCaso[];
  /** Sugestões geradas por regras quando o caso dá KO ou ERRO. */
  sugestoes?: string[];
  /** Passo manual à espera do testador (enquanto não responde, o caso fica parado). */
  aguardaManual?: PedidoManual;
  /** Número do worker (1, 2, ...) que correu este caso. */
  worker?: number;
  /** Passos onde o localizador preferido falhou e uma alternativa funcionou (para reparar com um clique). */
  reparos?: SugestaoReparo[];
}

/** nao-corrido: ficou por correr (depois de um erro, ou o caso foi parado/saltado). */
export type EstadoBlocoCaso = 'por-correr' | 'a-correr' | 'ok' | 'ko' | 'erro' | 'ignorado' | 'nao-corrido';

/** "Fotografia" de uma jornada no início da execução (o mapa e o histórico não dependem de alterações posteriores). */
export interface JornadaDoRun {
  id: string;
  nome: string;
  epicoId: string;
  epicoNome: string;
  /** ID do requisito (para o relatório de assinatura). */
  requisitoId?: string;
  blocos: Array<{ nome: string; tipo: TipoBloco; aplicacaoNome?: string; cor?: string; condicional?: boolean; limpeza?: boolean }>;
}

/** O localizador preferido de um passo falhou, mas outro encontrou o elemento. */
export interface SugestaoReparo {
  blocoId: string;
  blocoNome: string;
  passoId: string;
  passoDescricao: string;
  falhou: Localizador;
  usado: Localizador;
}

export interface OpcoesRun {
  canal: 'msedge' | 'chrome';
  /** true: vê-se o browser; false: corre em background. */
  visivel: boolean;
  /** Quantos casos correm ao mesmo tempo (1, 2, 4 ou 8). */
  paralelo: number;
  /** normal; lenta: 1 segundo entre passos; passo: pára antes de cada passo, à espera de "Continuar". */
  velocidade?: 'normal' | 'lenta' | 'passo';
  /** Pôr a execução em pausa quando um caso der ERRO (para se poder ver o que se passou). */
  pausarNoErro?: boolean;
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
  /** Retomar a meio: corre só este caso, a partir deste bloco (posição, 0 = primeiro), com estas variáveis já guardadas. */
  retomar?: { chave: string; desdeBloco: number; variaveis: Record<string, string> };
}

export interface EstadoRun {
  id: string;
  /** Descrição curta do âmbito (por exemplo, o nome da jornada). */
  nome: string;
  ativo: boolean;
  /** Foi pedido para parar. */
  aParar: boolean;
  /** Em pausa (os casos param entre passos, nunca a meio de uma ação). */
  emPausa: boolean;
  /** Workers postos em pausa sozinhos (os outros continuam). */
  workersEmPausa?: number[];
  /** Retomar a meio: o caso recomeçou neste bloco (posição). */
  retomadoDesde?: number;
  inicio: string;
  fim?: string;
  ambiente: string;
  tipoAmbiente: TipoAmbiente;
  opcoes: OpcoesRun;
  casos: ResultadoCaso[];
  /** Pasta da execução (dentro de `execucoes/`). */
  pasta?: string;
  /** Utilizador do Windows que correu a execução (registo básico de quem correu). */
  utilizador?: string;
  /** As jornadas envolvidas, como estavam no início (para o mapa de execução). */
  jornadas?: JornadaDoRun[];
  /** Quanto do PC a execução usou (medido de 5 em 5 segundos). */
  desempenho?: {
    memLivreMinMB: number;
    memUsadaMaxPct: number;
    cpuMedioPct: number;
    cpuMaxPct: number;
    duracaoMediaCasoMs?: number;
  };
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
  /**
   * "Regravar este elemento": repete os passos do bloco antes deste passo (com estes valores,
   * por exemplo os dados e as variáveis do caso que falhou) e substitui só o elemento do passo.
   */
  regravar?: { passoId: string; valores: Record<string, string> };
}

export type TipoBloco = 'UI' | 'API' | 'EMAIL' | 'VERIFICACAO' | 'MANUAL';

// ---------- Blocos de API ----------
export interface ParNomeValor {
  nome: string;
  /** Pode ter {variáveis}. */
  valor: string;
}

export type MetodoHttp = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type TipoCorpo = 'nenhum' | 'json' | 'xml' | 'soap' | 'texto' | 'formulario';
export type OperadorApi = 'igual' | 'diferente' | 'contem' | 'maior' | 'menor' | 'regex' | 'existe';

/** Uma verificação sobre a resposta. */
export interface VerificacaoApi {
  id: string;
  /** estado: código HTTP; corpo: um campo da resposta; cabecalho: um cabeçalho; tempo: milissegundos. */
  alvo: 'estado' | 'corpo' | 'cabecalho' | 'tempo';
  /** Para `corpo`: caminho do campo (por exemplo `cliente.id` ou `itens[0].valor`); vazio = a resposta toda. Para `cabecalho`: o nome. */
  caminho?: string;
  operador: OperadorApi;
  /** Valor esperado; pode ter {variáveis}. */
  esperado: string;
}

export interface GuardarApi {
  variavel: string;
  /** Caminho do campo na resposta JSON (por exemplo `id`). */
  caminho: string;
}

export interface PedidoApi {
  metodo: MetodoHttp;
  /** Caminho a juntar ao endereço da aplicação, ou um endereço completo. Pode ter {variáveis}. */
  url: string;
  parametros: ParNomeValor[];
  cabecalhos: ParNomeValor[];
  tipoCorpo: TipoCorpo;
  corpo: string;
  /** Perfil de autenticação a usar (vazio = sem autenticação). */
  perfilId?: string;
  /** Tempo limite em milissegundos (por omissão, 30 segundos). */
  limiteMs?: number;
  /** "Esperar até": repete o pedido de X em X segundos até todas as verificações passarem ou acabar o tempo. */
  repetir?: { intervaloSeg: number; limiteSeg: number };
  verificacoes: VerificacaoApi[];
  guardar: GuardarApi[];
}

export type TipoPerfil = 'oauth2-cliente' | 'oauth2-password' | 'oauth2-pkce' | 'apikey' | 'basic' | 'bearer' | 'mtls';

/**
 * Forma de autenticação reutilizável. Os segredos (client secret, password, chave, token)
 * NUNCA ficam aqui: ficam no cofre local encriptado, com o nome `<idDoPerfil>.<campo>`.
 */
export interface PerfilAutenticacao {
  id: string;
  nome: string;
  tipo: TipoPerfil;
  /** OAuth 2.0: endereço onde se pede o token. */
  urlToken?: string;
  /** OAuth 2.0 com login (Authorization Code + PKCE): página de login. */
  urlAutorizacao?: string;
  /** OAuth 2.0 com login: endereço de regresso registado na aplicação (é apanhado pelo UAT Studio; não precisa de existir). */
  redirectUri?: string;
  clientId?: string;
  ambito?: string;
  /** OAuth 2.0: como enviar o client secret (por omissão, cabeçalho Basic). */
  envioCliente?: 'basic' | 'corpo';
  /** OAuth 2.0 (password) e Basic: nome do utilizador. */
  utilizador?: string;
  /** API Key: nome do cabeçalho (por omissão, X-API-Key). */
  cabecalho?: string;
  /**
   * mTLS (opcional, em qualquer tipo de perfil): certificado de cliente .pfx/.p12 e, se for preciso,
   * a autoridade (CA) do servidor. Caminhos absolutos ou relativos à pasta do projeto.
   * A password do certificado fica no cofre (`<perfil>.certificadoPassword`).
   */
  certificado?: { ficheiro: string; ca?: string };
}

/** Campos secretos de cada tipo de perfil (os nomes usados no cofre). */
export const SEGREDOS_DO_PERFIL: Record<TipoPerfil, Array<{ campo: string; rotulo: string; opcional?: boolean }>> = {
  'oauth2-cliente': [{ campo: 'clientSecret', rotulo: 'Client secret' }],
  'oauth2-password': [
    { campo: 'clientSecret', rotulo: 'Client secret' },
    { campo: 'password', rotulo: 'Password do utilizador' },
  ],
  // Sem segredo de cliente (cliente público). A password é opcional: serve para preencher o login sozinho.
  'oauth2-pkce': [{ campo: 'password', rotulo: 'Password do utilizador (opcional: preenche o login sozinho)', opcional: true }],
  apikey: [{ campo: 'chave', rotulo: 'Chave da API' }],
  basic: [{ campo: 'password', rotulo: 'Password' }],
  bearer: [{ campo: 'token', rotulo: 'Token' }],
  mtls: [],
};

/** Segredo da password do certificado de cliente (mTLS), em qualquer tipo de perfil. */
export const SEGREDO_CERTIFICADO = { campo: 'certificadoPassword', rotulo: 'Password do certificado de cliente', opcional: true };

/** O que aconteceu ao executar um bloco de API (segredos já mascarados). */
export interface ResultadoApi {
  pedido: { metodo: string; url: string; cabecalhos: Record<string, string>; corpo?: string };
  resposta: { estado: number; cabecalhos: Record<string, string>; corpo: string; tempoMs: number };
  verificacoes: Array<{ descricao: string; ok: boolean; esperado: string; obtido: string }>;
  guardadas: Record<string, string>;
}

/** Unidade reutilizável: alterada num sítio, atualiza todas as jornadas que a usam. */
export interface Bloco {
  id: string;
  nome: string;
  tipo: TipoBloco;
  aplicacaoId?: string;
  descricao?: string;
  /** Blocos de UI: os passos gravados. */
  passos: Passo[];
  /** Blocos de API: o pedido HTTP. */
  pedido?: PedidoApi;
  /** Passo manual: a execução pára, mostra a instrução e o testador confirma OK ou KO. */
  manual?: { instrucao: string };
  /** Bloco de email: esperar que chegue um email à caixa de testes, verificá-lo e extrair valores. */
  email?: DefinicaoEmail;
  /**
   * Bloco de login (UI): depois de correr bem, a sessão (cookies) fica guardada em memória durante a
   * execução e os casos seguintes com os mesmos dados de entrada não repetem o login.
   */
  login?: boolean;
}

/** A resposta do testador a um passo manual. */
export interface RespostaManual {
  ok: boolean;
  /** Observação do testador (aparece no log e, se for KO, no relatório). */
  nota?: string;
  /** Caminho de uma imagem escolhida pelo testador, para juntar às evidências. */
  anexo?: string;
}

/**
 * Bloco de email (Microsoft Graph ou compatível): a aplicação do bloco (tipo EMAIL) tem o endereço base
 * da API (por exemplo https://graph.microsoft.com/v1.0) e o perfil dá o token (OAuth 2.0).
 * Todos os textos podem ter {variáveis}.
 */
export interface DefinicaoEmail {
  /** Caixa de correio de testes a ler (endereço). */
  caixa: string;
  perfilId?: string;
  /** Filtros para encontrar o email certo (contém; vazio = qualquer). Só contam emails chegados depois do início do caso. */
  para?: string;
  assunto?: string;
  /** Quanto tempo esperar que o email chegue (segundos; por omissão 60). */
  esperaSeg?: number;
  /** Textos que o corpo tem de conter (um KO por cada um que falte). */
  corpoContem?: string[];
  /** Guardar valores do email em variáveis com uma expressão regular (fica o 1.º grupo, ou tudo). */
  extrair?: Array<{ variavel: string; de: 'corpo' | 'assunto'; padrao: string }>;
}

/** Um passo manual à espera da resposta do testador. */
export interface PedidoManual {
  bloco: string;
  /** Instrução já com os dados do caso. */
  instrucao: string;
  desde: string;
}

/** Um bloco colocado numa jornada. */
export interface BlocoDaJornada {
  id: string;
  blocoId: string;
  /** Troca variáveis do bloco por outros valores só nesta jornada: { NomeNoBloco: valor }. */
  parametros?: Record<string, Valor>;
  /** Bloco condicional: fórmula que tem de ser verdadeira para o bloco correr neste caso. */
  condicao?: string;
  /** Bloco de limpeza: corre sempre, mesmo que um bloco anterior tenha dado erro. */
  sempre?: boolean;
  /**
   * Sessão do browser onde o bloco corre (por omissão, "principal"). Sessões diferentes são pessoas
   * diferentes na mesma jornada (por exemplo, "cliente" no Front Office e "aprovador" no Backoffice).
   */
  sessao?: string;
}

/** Nome da sessão do browser por omissão. */
export const SESSAO_PRINCIPAL = 'principal';

export interface Jornada {
  id: string;
  nome: string;
  epicoId: string;
  /** Descrição em texto corrido: objetivo do teste, pré-condições, dados necessários. */
  descricao?: string;
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
  perfis: PerfilAutenticacao;
}

export type NomeColecao = keyof Colecoes;

export const NOMES_COLECOES: NomeColecao[] = ['aplicacoes', 'epicos', 'jornadas', 'blocos', 'casos', 'perfis'];

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
  /** É o projeto de exemplo da ferramenta. */
  exemplo?: boolean;
  /** É a Wiki de componentes. */
  wiki?: boolean;
}

/** Um problema encontrado na verificação antes de correr. */
export interface Problema {
  /** erro: o caso não vai conseguir correr; aviso: convém ver, mas não impede. */
  gravidade: 'erro' | 'aviso';
  /** Onde está o problema (jornada, bloco, perfil...). */
  onde: string;
  mensagem: string;
}

export interface ResultadoVerificacao {
  /** Quantos casos seriam corridos com esta escolha. */
  casos: number;
  problemas: Problema[];
}
