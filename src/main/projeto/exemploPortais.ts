// Exemplo de casos de uso com os dois portais da app "PortalCreditoPOC" (Front Office do cliente e
// Backoffice de gestão) e os seus serviços externos simulados. Mostra, num projeto pronto a correr:
// login com MFA de teste reutilizado entre casos, duas sessões na mesma jornada (cliente e gestor),
// dependências entre portais (o FO só avança depois de o BO aprovar), linha de tabela, passos e blocos
// condicionais, verificações numéricas, API como preparação e como confirmação, intercetar e simular
// serviços externos, limpeza e passo manual. Todos os dados são fictícios.
import { Bloco, BlocoDaJornada, Caso, Passo, Valor } from '../../shared/modelo';
import { existe, guardar, ler } from './repositorio';

export const URL_PORTAL = 'https://personal-e5m9c9gh-dev.outsystems.app/PortalCreditoPOC';

interface Produto {
  codigo: string;
  /** Texto da opção na lista do FO (a lista do OutSystems usa índices como valores). */
  nome: string;
  taxa: number;
  comissao: number;
}
const PRODUTOS: Record<string, Produto> = {
  CP: { codigo: 'CP', nome: 'Crédito Pessoal', taxa: 7.5, comissao: 1.5 },
  CA: { codigo: 'CA', nome: 'Crédito Automóvel', taxa: 6.9, comissao: 1.0 },
  CH: { codigo: 'CH', nome: 'Crédito Habitação', taxa: 3.9, comissao: 0.5 },
};

/** Arredondamento "ao par" a 2 casas, como o Round() do OutSystems. */
function arredondarPar(x: number): number {
  const v = x * 100;
  const base = Math.floor(v);
  const resto = v - base;
  const r = Math.abs(resto - 0.5) < 1e-9 ? (base % 2 === 0 ? base : base + 1) : Math.round(v);
  return r / 100;
}
const ptPT = (x: number): string => x.toFixed(2).replace('.', ',');

/** O "oráculo": prestação, comissão e total esperados, com as regras da app. */
function calcular(produto: string, montante: number, prazo: number): { prestacao: number; comissao: number; total: number } {
  const p = PRODUTOS[produto];
  const r = p.taxa / 100 / 12;
  const prestacao = arredondarPar((montante * r) / (1 - Math.pow(1 + r, -prazo)));
  const comissao = arredondarPar((montante * p.comissao) / 100);
  return { prestacao, comissao, total: arredondarPar(prestacao * prazo + comissao) };
}

const alvo = (testId: string, descricao: string, widget?: string): Passo['alvo'] => ({ descricao, localizadores: [{ tipo: 'testid', valor: testId }], ...(widget ? { widget } : {}) });
const variavel = (nome: string): Valor => ({ tipo: 'variavel', nome });
const fixo = (valor: string): Valor => ({ tipo: 'fixo', valor });
const clicar = (id: string, testId: string, descricao: string, condicao?: string): Passo => ({ id, acao: 'clicar', descricao, alvo: alvo(testId, descricao), ...(condicao ? { condicao } : {}) });
const escrever = (id: string, testId: string, descricao: string, valor: Passo['valor'], secreto = false): Passo => ({ id, acao: 'escrever', descricao, alvo: alvo(testId, descricao), valor, ...(secreto ? { secreto: true } : {}) });
const verificarTexto = (id: string, testId: string, descricao: string, valor: Passo['valor'], condicao?: string): Passo => ({
  id,
  acao: 'verificar',
  descricao,
  alvo: alvo(testId, descricao),
  valor,
  verificacao: { tipo: 'texto', esperaSeg: 10 },
  ...(condicao ? { condicao } : {}),
});
const verificarNumero = (id: string, testId: string, descricao: string, coluna: string): Passo => ({
  id,
  acao: 'verificar',
  descricao,
  alvo: alvo(testId, descricao),
  valor: variavel(coluna),
  verificacao: { tipo: 'numero', tolerancia: '0,01' },
});

export function criarExemploPortais(pasta: string): void {
  // O épico do simulador (criado por criarExemplo) passa a ser o 1.º da sequência de aprendizagem.
  if (existe(pasta, 'epicos', 'simulacoes')) {
    guardar(pasta, 'epicos', { ...ler(pasta, 'epicos', 'simulacoes'), nome: '1. Básico: simulador (gravar, Excel, fórmulas, verificações)' });
  }
  guardar(pasta, 'aplicacoes', { id: 'portal-fo', nome: 'Portal de Crédito: Front Office', tipo: 'FO', cor: '#2f6bed', urls: { dev: URL_PORTAL } });
  guardar(pasta, 'aplicacoes', { id: 'portal-bo', nome: 'Portal de Crédito: Backoffice', tipo: 'BO', cor: '#e07b00', urls: { dev: `${URL_PORTAL}/BOLogin` } });
  guardar(pasta, 'aplicacoes', { id: 'portal-api', nome: 'Portal de Crédito: APIs', tipo: 'API', cor: '#1a8f4c', urls: { dev: `${URL_PORTAL}/rest` } });

  guardar(pasta, 'epicos', { id: 'portal-entre-portais', nome: '2. Entre portais: o FO pede, o BO aprova', descricao: 'Duas sessões (cliente e gestor), login com MFA reutilizado, dependência entre portais, linha de tabela, condições e confirmação por API.' });
  guardar(pasta, 'epicos', { id: 'portal-servicos-externos', nome: '3. Serviços externos: intercetar e simular', descricao: 'Aprovação preparada por API, o pedido de pagamento intercetado e respostas do prestador simuladas (aprovado, recusado, indisponível).' });
  guardar(pasta, 'epicos', { id: 'portal-apis', nome: '4. APIs e passo manual', descricao: 'Blocos só de API (verificações e regras de negócio) e um passo manual para o que só uma pessoa pode confirmar.' });

  // ---------- Blocos de UI ----------
  const blocos: Bloco[] = [
    {
      id: 'pc-fo-entrar',
      nome: 'FO: entrar com MFA de teste',
      tipo: 'UI',
      aplicacaoId: 'portal-fo',
      login: true,
      descricao: 'Bloco de login: o 1.º caso entra a sério; os seguintes com o mesmo utilizador reutilizam a sessão.',
      passos: [
        { id: 'p1', acao: 'navegar', descricao: 'Abrir o Portal do Cliente', valor: fixo('') },
        escrever('p2', 'fo_inpUtilizador', 'Utilizador', variavel('Utilizador')),
        escrever('p3', 'fo_inpPassword', 'Password', variavel('Password'), true),
        clicar('p4', 'fo_btnEntrar', 'Entrar'),
        // "Esperar até": na 1.ª vez do dia o ambiente ODC pode demorar a responder.
        { id: 'p4b', acao: 'verificar', descricao: 'Esperar pelo ecrã do código', alvo: alvo('fo_inpCodigo', 'Campo Código'), verificacao: { tipo: 'visivel', esperaSeg: 30 } },
        escrever('p5', 'fo_inpCodigo', 'Código MFA (modo de teste)', variavel('CodigoMfa')),
        clicar('p6', 'fo_btnConfirmar', 'Confirmar o código'),
        { id: 'p7', acao: 'verificar', descricao: 'Ver o botão Novo pedido', alvo: alvo('fo_btnNovoPedido', 'Botão Novo pedido'), verificacao: { tipo: 'visivel', esperaSeg: 15 } },
      ],
    },
    {
      id: 'pc-fo-pedir',
      nome: 'FO: pedir crédito (dados e proposta)',
      tipo: 'UI',
      aplicacaoId: 'portal-fo',
      passos: [
        clicar('p1', 'fo_btnNovoPedido', 'Novo pedido'),
        clicar('p2', 'fo_btnSeguinte', 'Seguinte (dados pessoais já preenchidos)'),
        { id: 'p3', acao: 'escolher', descricao: 'Escolher o produto', alvo: alvo('fo_ddProduto', 'Lista Produto', 'dropdown'), valor: variavel('Produto') },
        escrever('p4', 'fo_inpMontante', 'Montante', variavel('Montante')),
        escrever('p5', 'fo_inpPrazo', 'Prazo (meses)', variavel('Prazo')),
        clicar('p6', 'fo_btnSimular', 'Simular'),
        verificarNumero('p7', 'fo_resPrestacao', 'Verificar a prestação', 'PrestacaoEsperada'),
        verificarNumero('p8', 'fo_resComissao', 'Verificar a comissão', 'ComissaoEsperada'),
        verificarNumero('p9', 'fo_resTotal', 'Verificar o total', 'TotalEsperado'),
        clicar('p10', 'fo_btnPedirAprovacao', 'Pedir aprovação'),
        verificarTexto('p11', 'fo_resEstado', 'Verificar que fica pendente', fixo('Pendente aprovação')),
        { id: 'p12', acao: 'guardar', descricao: 'Guardar o número do pedido', alvo: alvo('fo_resPedidoId', 'Número do pedido'), variavel: 'PedidoId' },
      ],
    },
    {
      id: 'pc-bo-entrar',
      nome: 'BO: entrar como gestor',
      tipo: 'UI',
      aplicacaoId: 'portal-bo',
      login: true,
      passos: [
        { id: 'p1', acao: 'navegar', descricao: 'Abrir o Backoffice', valor: fixo('') },
        escrever('p2', 'bo_inpUtilizador', 'Utilizador do gestor', variavel('Gestor')),
        escrever('p3', 'bo_inpPassword', 'Password do gestor', variavel('PasswordGestor'), true),
        clicar('p4', 'bo_btnEntrar', 'Entrar'),
        { id: 'p5', acao: 'verificar', descricao: 'Ver a lista de pedidos', alvo: alvo('bo_tblPedidos', 'Tabela de pedidos'), verificacao: { tipo: 'visivel', esperaSeg: 15 } },
      ],
    },
    {
      id: 'pc-bo-decidir',
      nome: 'BO: decidir o pedido',
      tipo: 'UI',
      aplicacaoId: 'portal-bo',
      descricao: 'Procura o pedido, abre-o pela linha da tabela e aprova, recusa ou pede documentos conforme a coluna Decisao.',
      passos: [
        escrever('p1', 'bo_inpPesquisa', 'Pesquisar o pedido', variavel('PedidoId')),
        clicar('p2', 'bo_btnPesquisar', 'Pesquisar'),
        {
          id: 'p3',
          acao: 'clicar',
          descricao: 'Abrir o pedido na linha da tabela',
          alvo: { descricao: 'Abrir', localizadores: [{ tipo: 'role', valor: 'link', nome: 'Abrir' }], linha: { valor: variavel('PedidoId') } },
        },
        escrever('p4', 'bo_inpMotivo', 'Motivo', variavel('Motivo')),
        clicar('p5', 'bo_btnAprovar', 'Aprovar', '{Decisao} = "Aprovar"'),
        clicar('p6', 'bo_btnRecusar', 'Recusar', '{Decisao} = "Recusar"'),
        clicar('p7', 'bo_btnPedirDocumentos', 'Pedir documentos', '{Decisao} = "PedirDocumentos"'),
        verificarTexto('p8', 'bo_msg', 'Verificar a mensagem do backoffice', variavel('MensagemBO')),
      ],
    },
    {
      id: 'pc-fo-continuar',
      nome: 'FO: continuar depois da decisão',
      tipo: 'UI',
      aplicacaoId: 'portal-fo',
      descricao: 'O cliente atualiza o estado; só passa ao contrato se o pedido estiver aprovado.',
      passos: [
        clicar('p1', 'fo_btnAtualizar', 'Atualizar o estado'),
        verificarTexto('p2', 'fo_resEstado', 'Verificar o estado no FO', variavel('EstadoDepoisBO')),
        // Tenta sempre avançar: com o pedido aprovado vai para o contrato; senão, o FO tem de recusar.
        clicar('p3', 'fo_btnSeguinte', 'Tentar avançar (contrato)'),
        verificarTexto('p4', 'fo_msgErro', 'Verificar que não deixa avançar', fixo('O pedido ainda não foi aprovado pelo backoffice'), '{EstadoDepoisBO} = "Pendente aprovação"'),
      ],
    },
    {
      id: 'pc-fo-contrato',
      nome: 'FO: assinar o contrato',
      tipo: 'UI',
      aplicacaoId: 'portal-fo',
      descricao: 'Validar o IBAN (chama o serviço externo a partir do browser) e aceitar as condições.',
      passos: [
        escrever('p1', 'fo_inpIban', 'IBAN', variavel('Iban')),
        clicar('p2', 'fo_btnValidarIban', 'Validar o IBAN'),
        { id: 'p3', acao: 'intercetar', descricao: 'Intercetar a validação do IBAN', rede: { url: 'ServicosExternos/iban/', metodo: 'GET', verificacoes: [] } },
        verificarTexto('p4', 'fo_resIban', 'Verificar o resultado do IBAN', variavel('ResultadoIban')),
        { id: 'p5', acao: 'marcar', descricao: 'Aceitar as condições', alvo: alvo('fo_chkTermos', 'Aceito as condições'), valor: fixo('S') },
        clicar('p6', 'fo_btnAssinar', 'Assinar'),
        verificarNumero('p7', 'fo_resComissao', 'Verificar a comissão a pagar', 'ComissaoEsperada'),
      ],
    },
    {
      id: 'pc-fo-pagar',
      nome: 'FO: pagar a comissão',
      tipo: 'UI',
      aplicacaoId: 'portal-fo',
      descricao: 'Paga a comissão (o browser chama o serviço externo de pagamentos) e confirma o pedido enviado.',
      passos: [
        clicar('p1', 'fo_btnPagar', 'Pagar'),
        {
          id: 'p2',
          acao: 'intercetar',
          descricao: 'Intercetar o pedido de pagamento',
          rede: {
            url: 'ServicosExternos/pagamentos',
            metodo: 'POST',
            verificacoes: [
              { caminho: 'pedidoId', esperado: '{PedidoId}' },
              { caminho: 'montante', esperado: '{ComissaoEsperada}' },
            ],
          },
        },
        { id: 'p3', acao: 'guardar', descricao: 'Guardar a mensagem do pagamento', alvo: alvo('fo_resPagamento', 'Resultado do pagamento'), variavel: 'MensagemPagamento' },
      ],
    },
    {
      id: 'pc-fo-pagar-simulado',
      nome: 'FO: pagar com o prestador simulado',
      tipo: 'UI',
      aplicacaoId: 'portal-fo',
      descricao: 'Simula a resposta do prestador de pagamentos conforme a coluna Cenario e verifica o que o ecrã mostra.',
      passos: [
        { id: 'p1', acao: 'simular', descricao: 'Simular pagamento recusado', condicao: '{Cenario} = "recusado"', rede: { url: 'ServicosExternos/pagamentos', metodo: 'POST', modo: 'responder', estado: 200, corpo: '{"estado":"recusado","referencia":""}' } },
        { id: 'p2', acao: 'simular', descricao: 'Simular prestador indisponível', condicao: '{Cenario} = "indisponivel"', rede: { url: 'ServicosExternos/pagamentos', metodo: 'POST', modo: 'falhar' } },
        { id: 'p3', acao: 'simular', descricao: 'Simular pagamento aprovado', condicao: '{Cenario} = "aprovado"', rede: { url: 'ServicosExternos/pagamentos', metodo: 'POST', modo: 'responder', estado: 200, corpo: '{"estado":"aprovado","referencia":"{TESTE}9999"}' } },
        clicar('p4', 'fo_btnPagar', 'Pagar'),
        verificarTexto('p5', 'fo_resPagamento', 'Verificar o que o ecrã mostra', variavel('MensagemPagamento')),
      ],
    },
    // ---------- Blocos de API ----------
    {
      id: 'pc-api-confirmar',
      nome: 'API: confirmar o pedido',
      tipo: 'API',
      aplicacaoId: 'portal-api',
      passos: [],
      pedido: {
        metodo: 'GET',
        url: '/CreditoAPI/pedidos/{PedidoId}',
        parametros: [],
        cabecalhos: [],
        tipoCorpo: 'nenhum',
        corpo: '',
        verificacoes: [
          { id: 'v1', alvo: 'estado', operador: 'igual', esperado: '200' },
          { id: 'v2', alvo: 'corpo', caminho: 'Estado', operador: 'igual', esperado: '{EstadoFinal}' },
          { id: 'v3', alvo: 'corpo', caminho: 'Prestacao', operador: 'igual', esperado: '{PrestacaoEsperada}' },
          { id: 'v4', alvo: 'corpo', caminho: 'Comissao', operador: 'igual', esperado: '{ComissaoEsperada}' },
        ],
        guardar: [],
      },
    },
    {
      id: 'pc-api-aprovar',
      nome: 'API: aprovar o pedido (preparação)',
      tipo: 'API',
      aplicacaoId: 'portal-api',
      descricao: 'Em vez de abrir o Backoffice, aprova pelo serviço: útil quando o objetivo do teste é outra parte do percurso.',
      passos: [],
      pedido: {
        metodo: 'POST',
        url: '/CreditoAPI/pedidos/{PedidoId}/decisao',
        parametros: [],
        cabecalhos: [],
        tipoCorpo: 'json',
        corpo: '{ "decisao": "Aprovar", "motivo": "Aprovado por API no teste {TESTE}", "gestor": "aprovador" }',
        verificacoes: [{ id: 'v1', alvo: 'estado', operador: 'igual', esperado: '200' }],
        guardar: [],
      },
    },
    {
      id: 'pc-api-produtos',
      nome: 'API: consultar os produtos',
      tipo: 'API',
      aplicacaoId: 'portal-api',
      passos: [],
      pedido: {
        metodo: 'GET',
        url: '/CreditoAPI/produtos',
        parametros: [],
        cabecalhos: [],
        tipoCorpo: 'nenhum',
        corpo: '',
        verificacoes: [
          { id: 'v1', alvo: 'estado', operador: 'igual', esperado: '200' },
          { id: 'v2', alvo: 'corpo', caminho: '[0].Codigo', operador: 'existe', esperado: '' },
        ],
        guardar: [],
      },
    },
    {
      id: 'pc-api-decisao-invalida',
      nome: 'API: decisão sem motivo (regra de negócio)',
      tipo: 'API',
      aplicacaoId: 'portal-api',
      descricao: 'Recusar sem motivo tem de devolver a mensagem da regra no campo "erro" (a API responde 200 com {"erro": ...}).',
      passos: [],
      pedido: {
        metodo: 'POST',
        url: '/CreditoAPI/pedidos/{PedidoId}/decisao',
        parametros: [],
        cabecalhos: [],
        tipoCorpo: 'json',
        corpo: '{ "decisao": "Recusar", "motivo": "", "gestor": "aprovador" }',
        verificacoes: [
          { id: 'v1', alvo: 'estado', operador: 'igual', esperado: '200' },
          { id: 'v2', alvo: 'corpo', caminho: 'erro', operador: 'contem', esperado: 'motivo' },
        ],
        guardar: [],
      },
    },
    {
      id: 'pc-manual-comprovativo',
      nome: 'Manual: confirmar o comprovativo',
      tipo: 'MANUAL',
      passos: [],
      manual: { instrucao: 'Abra o Backoffice > Pagamentos e confirme que o pedido {PedidoId} aparece como "Pago" com uma referência. Se não aparecer, marque KO e escreva o que viu.' },
    },
  ];
  for (const bloco of blocos) guardar(pasta, 'blocos', bloco);

  // ---------- Jornadas e casos ----------
  const caso = (id: string, nome: string, etiquetas: string[], dados: Record<string, string>): Caso => ({ id, nome, etiquetas, dados });
  /** Dados comuns de um pedido: utilizador, produto e os valores esperados calculados pelo oráculo. */
  const pedido = (produto: string, montante: number, prazo: number): Record<string, string> => {
    const c = calcular(produto, montante, prazo);
    return {
      Utilizador: 'ana.silva',
      Password: 'Teste#2026',
      CodigoMfa: '123456',
      Produto: PRODUTOS[produto].nome,
      Montante: String(montante),
      Prazo: String(prazo),
      PrestacaoEsperada: ptPT(c.prestacao),
      ComissaoEsperada: ptPT(c.comissao),
      TotalEsperado: ptPT(c.total),
    };
  };
  const passoJornada = (id: string, blocoId: string, extra: Partial<BlocoDaJornada> = {}): BlocoDaJornada => ({ id, blocoId, ...extra });

  // 2. Entre portais
  guardar(pasta, 'jornadas', {
    id: 'pc-pedido-entre-portais',
    nome: 'Pedido de crédito: FO pede, BO decide, FO continua',
    epicoId: 'portal-entre-portais',
    requisitoId: 'REQ-CRED-010',
    etiquetas: ['exemplo', '2 portais'],
    blocos: [
      passoJornada('b1', 'pc-fo-entrar', { sessao: 'cliente' }),
      passoJornada('b2', 'pc-fo-pedir', { sessao: 'cliente' }),
      passoJornada('b3', 'pc-bo-entrar', { sessao: 'gestor' }),
      passoJornada('b4', 'pc-bo-decidir', { sessao: 'gestor' }),
      passoJornada('b5', 'pc-fo-continuar', { sessao: 'cliente' }),
      passoJornada('b6', 'pc-fo-contrato', { sessao: 'cliente', condicao: '{EstadoDepoisBO} = "Aprovado"' }),
      passoJornada('b7', 'pc-fo-pagar', { sessao: 'cliente', condicao: '{EstadoDepoisBO} = "Aprovado"' }),
      passoJornada('b8', 'pc-api-confirmar'),
    ],
  });
  const aprovador = { Gestor: 'aprovador', PasswordGestor: 'BO#2026' };
  const analista = { Gestor: 'analista', PasswordGestor: 'BO#2026' };
  const ibanValido = { Iban: 'PT50003500000000000000001', ResultadoIban: 'IBAN válido - Caixa Geral de Depósitos' };
  guardar(pasta, 'casos', {
    id: 'pc-pedido-entre-portais',
    colunas: ['Utilizador', 'Password', 'CodigoMfa', 'Produto', 'Montante', 'Prazo', 'PrestacaoEsperada', 'ComissaoEsperada', 'TotalEsperado', 'Gestor', 'PasswordGestor', 'Decisao', 'Motivo', 'MensagemBO', 'EstadoDepoisBO', 'Iban', 'ResultadoIban', 'EstadoFinal'],
    casos: [
      caso('PC01', 'Crédito pessoal aprovado pelo aprovador, contratado e pago', ['CP', 'aprovado'], {
        ...pedido('CP', 10000, 24),
        ...aprovador,
        Decisao: 'Aprovar',
        Motivo: 'Cliente cumpre os critérios',
        MensagemBO: 'Pedido aprovado',
        EstadoDepoisBO: 'Aprovado',
        ...ibanValido,
        EstadoFinal: 'Pago',
      }),
      caso('PC02', 'Analista não pode aprovar acima de 20 000 (fica pendente)', ['CP', 'limite'], {
        ...pedido('CP', 30000, 36),
        ...analista,
        Decisao: 'Aprovar',
        Motivo: 'Tentativa do analista',
        MensagemBO: 'Montante acima do limite do analista: precisa de um aprovador',
        EstadoDepoisBO: 'Pendente aprovação',
        Iban: '',
        ResultadoIban: '',
        EstadoFinal: 'Pendente aprovação',
      }),
      caso('PC03', 'Crédito automóvel recusado com motivo', ['CA', 'recusado'], {
        ...pedido('CA', 15000, 48),
        ...aprovador,
        Decisao: 'Recusar',
        Motivo: 'Taxa de esforço elevada',
        MensagemBO: 'Pedido recusado',
        EstadoDepoisBO: 'Recusado',
        Iban: '',
        ResultadoIban: '',
        EstadoFinal: 'Recusado',
      }),
      caso('PC04', 'Crédito habitação: comissão acima de 2000 é recusada pelo prestador', ['CH', 'aprovado', 'pagamento-recusado'], {
        ...pedido('CH', 450000, 360),
        ...aprovador,
        Decisao: 'Aprovar',
        Motivo: 'Garantia hipotecária',
        MensagemBO: 'Pedido aprovado',
        EstadoDepoisBO: 'Aprovado',
        Iban: 'PT50003300000000000000002',
        ResultadoIban: 'IBAN válido - Millennium BCP',
        EstadoFinal: 'Contratado',
      }),
    ],
  });

  // 3. Serviços externos (aprovação preparada por API; pagamento simulado)
  guardar(pasta, 'jornadas', {
    id: 'pc-pagamento-simulado',
    nome: 'Pagamento com o prestador simulado',
    epicoId: 'portal-servicos-externos',
    requisitoId: 'REQ-CRED-020',
    etiquetas: ['exemplo', 'serviços externos'],
    blocos: [
      passoJornada('b1', 'pc-fo-entrar', { sessao: 'cliente' }),
      passoJornada('b2', 'pc-fo-pedir', { sessao: 'cliente' }),
      passoJornada('b3', 'pc-api-aprovar'),
      passoJornada('b4', 'pc-fo-continuar', { sessao: 'cliente' }),
      passoJornada('b5', 'pc-fo-contrato', { sessao: 'cliente' }),
      passoJornada('b6', 'pc-fo-pagar-simulado', { sessao: 'cliente' }),
    ],
  });
  const base = { ...pedido('CP', 5000, 12), EstadoDepoisBO: 'Aprovado', ...ibanValido };
  guardar(pasta, 'casos', {
    id: 'pc-pagamento-simulado',
    colunas: ['Utilizador', 'Password', 'CodigoMfa', 'Produto', 'Montante', 'Prazo', 'PrestacaoEsperada', 'ComissaoEsperada', 'TotalEsperado', 'EstadoDepoisBO', 'Iban', 'ResultadoIban', 'Cenario', 'MensagemPagamento'],
    casos: [
      caso('SE01', 'Prestador responde "aprovado" (simulado)', ['simulado'], { ...base, Cenario: 'aprovado', MensagemPagamento: 'Pagamento aprovado. Referência SE019999' }),
      caso('SE02', 'Prestador responde "recusado" (simulado)', ['simulado'], { ...base, Cenario: 'recusado', MensagemPagamento: 'Pagamento recusado' }),
      caso('SE03', 'Prestador indisponível (simulado)', ['simulado'], { ...base, Cenario: 'indisponivel', MensagemPagamento: 'Serviço de pagamentos indisponível. Tente mais tarde.' }),
    ],
  });

  // 4. APIs e passo manual
  guardar(pasta, 'jornadas', {
    id: 'pc-apis',
    nome: 'Regras de negócio pela API',
    epicoId: 'portal-apis',
    etiquetas: ['exemplo', 'api'],
    blocos: [passoJornada('b1', 'pc-api-produtos'), passoJornada('b2', 'pc-api-decisao-invalida')],
  });
  guardar(pasta, 'casos', { id: 'pc-apis', colunas: ['PedidoId'], casos: [caso('API01', 'Produtos e decisão sem motivo', ['api'], { PedidoId: '1' })] });
  guardar(pasta, 'jornadas', {
    id: 'pc-com-passo-manual',
    nome: 'Pedido pago e confirmado por uma pessoa (passo manual)',
    epicoId: 'portal-apis',
    etiquetas: ['exemplo', 'manual'],
    blocos: [
      passoJornada('b1', 'pc-fo-entrar', { sessao: 'cliente' }),
      passoJornada('b2', 'pc-fo-pedir', { sessao: 'cliente' }),
      passoJornada('b3', 'pc-api-aprovar'),
      passoJornada('b4', 'pc-fo-continuar', { sessao: 'cliente' }),
      passoJornada('b5', 'pc-fo-contrato', { sessao: 'cliente' }),
      passoJornada('b6', 'pc-fo-pagar', { sessao: 'cliente' }),
      passoJornada('b7', 'pc-manual-comprovativo'),
    ],
  });
  guardar(pasta, 'casos', {
    id: 'pc-com-passo-manual',
    colunas: ['Utilizador', 'Password', 'CodigoMfa', 'Produto', 'Montante', 'Prazo', 'PrestacaoEsperada', 'ComissaoEsperada', 'TotalEsperado', 'EstadoDepoisBO', 'Iban', 'ResultadoIban'],
    casos: [caso('MAN01', 'Pagamento confirmado à mão no Backoffice', ['manual'], { ...pedido('CP', 2000, 12), EstadoDepoisBO: 'Aprovado', ...ibanValido })],
  });
}
