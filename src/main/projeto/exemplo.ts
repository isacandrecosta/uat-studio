// Projeto de exemplo sobre a app "cobaia" (Simulador Financeiro POC), para experimentar
// a ferramenta sem ter de gravar nada primeiro.
import { Bloco, Caso, Passo } from '../../shared/modelo';
import { definirAmbienteAtivo, guardar } from './repositorio';

const URL_SIMULADOR = 'https://personal-e5m9c9gh-dev.outsystems.app/SimuladorFinanceiroPOC';

interface Variante {
  codigo: string;
  taxa: number;
  prazo: number;
  comissao: number;
  pontos: number;
  min: number;
  max: number;
}

const VARIANTES: Variante[] = [
  { codigo: 'CP12', taxa: 7.5, prazo: 12, comissao: 1.0, pontos: 1, min: 500, max: 20000 },
  { codigo: 'CA48', taxa: 6.0, prazo: 48, comissao: 2.0, pontos: 2, min: 5000, max: 60000 },
  { codigo: 'ZERO', taxa: 0.0, prazo: 10, comissao: 3.0, pontos: 0, min: 200, max: 3000 },
];

const arredondar = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;
const ptPT = (x: number): string => x.toFixed(2).replace('.', ',');

/** Calcula o resultado esperado com as regras de negócio da app (o "oráculo" do POC). */
function criarCaso(id: string, v: Variante, valor: number, descricao: string): Caso {
  const dentro = valor >= v.min && valor <= v.max;
  const r = v.taxa / 100 / 12;
  const prestacao = dentro ? arredondar(r === 0 ? valor / v.prazo : (valor * r) / (1 - Math.pow(1 + r, -v.prazo))) : 0;
  const comissao = dentro ? arredondar((valor * v.comissao) / 100) : 0;
  const total = dentro ? arredondar(prestacao * v.prazo + comissao) : 0;
  const pontos = dentro ? Math.floor(valor / 100) * v.pontos : 0;
  return {
    id,
    nome: descricao,
    etiquetas: [v.codigo.slice(0, 2), dentro ? 'aprovado' : 'rejeitado'],
    dados: {
      Variante: v.codigo,
      Valor: String(valor),
      EstadoEsperado: dentro ? 'Aprovado' : 'Rejeitado',
      MensagemEsperada: dentro ? 'Pedido aprovado' : 'Valor fora dos limites',
      PrestacaoEsperada: ptPT(prestacao),
      ComissaoEsperada: ptPT(comissao),
      TotalEsperado: ptPT(total),
      PontosEsperados: String(pontos),
    },
  };
}

function testid(id: string, descricao: string, widget?: string): Passo['alvo'] {
  return { descricao, localizadores: [{ tipo: 'testid', valor: id }], ...(widget ? { widget } : {}) };
}

function verificarNumero(id: string, testId: string, nome: string, coluna: string): Passo {
  return {
    id,
    acao: 'verificar',
    descricao: `Verificar ${nome}`,
    alvo: testid(testId, nome),
    valor: { tipo: 'variavel', nome: coluna },
    verificacao: { tipo: 'numero', tolerancia: '0' },
  };
}

export function criarExemplo(pasta: string): void {
  definirAmbienteAtivo(pasta, 'dev');

  guardar(pasta, 'aplicacoes', {
    id: 'simulador',
    nome: 'Simulador (Front Office)',
    tipo: 'FO',
    cor: '#2f6bed',
    urls: { dev: URL_SIMULADOR },
  });
  guardar(pasta, 'aplicacoes', {
    id: 'api-pedidos',
    nome: 'API de Pedidos',
    tipo: 'API',
    cor: '#1a8f4c',
    urls: { dev: `${URL_SIMULADOR}/rest/PedidosAPI` },
  });

  guardar(pasta, 'epicos', {
    id: 'simulacoes',
    nome: 'Simulações de crédito',
    descricao: 'Exemplo sobre a app Simulador Financeiro POC.',
  });

  const bloco: Bloco = {
    id: 'simular-credito',
    nome: 'Simular crédito',
    tipo: 'UI',
    aplicacaoId: 'simulador',
    descricao: 'Escolhe a variante, preenche o valor, submete e verifica o resultado.',
    passos: [
      { id: 'p1', acao: 'navegar', descricao: 'Abrir o ecrã de Simulação', valor: { tipo: 'fixo', valor: '' } },
      {
        id: 'p2',
        acao: 'escolher',
        descricao: 'Escolher a variante',
        alvo: testid('ddVariante', 'Lista Variante', 'dropdown'),
        valor: { tipo: 'variavel', nome: 'Variante' },
      },
      {
        id: 'p3',
        acao: 'escrever',
        descricao: 'Preencher o valor',
        alvo: testid('inpValor', 'Campo Valor'),
        valor: { tipo: 'variavel', nome: 'Valor' },
      },
      { id: 'p4', acao: 'clicar', descricao: 'Submeter', alvo: testid('btnSubmeter', 'Botão Submeter') },
      {
        id: 'p5',
        acao: 'verificar',
        descricao: 'Verificar Estado',
        alvo: testid('resEstado', 'Estado'),
        valor: { tipo: 'variavel', nome: 'EstadoEsperado' },
        verificacao: { tipo: 'texto' },
      },
      {
        id: 'p6',
        acao: 'verificar',
        descricao: 'Verificar Mensagem',
        alvo: testid('resMensagem', 'Mensagem'),
        valor: { tipo: 'variavel', nome: 'MensagemEsperada' },
        verificacao: { tipo: 'texto' },
      },
      verificarNumero('p7', 'resPrestacao', 'Prestação', 'PrestacaoEsperada'),
      verificarNumero('p8', 'resComissao', 'Comissão', 'ComissaoEsperada'),
      verificarNumero('p9', 'resTotal', 'Total a pagar', 'TotalEsperado'),
      verificarNumero('p10', 'resPontos', 'Pontos', 'PontosEsperados'),
      {
        id: 'p11',
        acao: 'guardar',
        descricao: 'Guardar o número do pedido',
        alvo: testid('resPedidoId', 'Número do pedido'),
        variavel: 'PedidoId',
      },
    ],
  };
  guardar(pasta, 'blocos', bloco);

  guardar(pasta, 'jornadas', {
    id: 'simular-credito',
    nome: 'Simular crédito',
    epicoId: 'simulacoes',
    etiquetas: ['exemplo'],
    blocos: [{ id: 'b1', blocoId: 'simular-credito' }],
  });

  const [cp12, ca48, zero] = VARIANTES;
  const casos: Caso[] = [
    criarCaso('TC0001', cp12, 500, 'CP12: valor mínimo'),
    criarCaso('TC0002', cp12, 10250, 'CP12: valor intermédio'),
    criarCaso('TC0003', cp12, 20001, 'CP12: acima do máximo (deve rejeitar)'),
    criarCaso('TC0004', ca48, 32500, 'CA48: valor intermédio'),
    criarCaso('TC0005', zero, 863.61, 'ZERO: valor com casas decimais'),
    criarCaso('TC0006', zero, 199.99, 'ZERO: abaixo do mínimo (deve rejeitar)'),
  ];
  guardar(pasta, 'casos', {
    id: 'simular-credito',
    colunas: Object.keys(casos[0].dados),
    casos,
  });

  criarExemploDoisPortais(pasta, [cp12, ca48]);
}

/**
 * Jornada que atravessa 3 aplicações: simular no Front Office → validar no Backoffice → confirmar pela API.
 * O número do pedido é guardado no 1.º bloco ({PedidoId}) e usado nos seguintes.
 */
function criarExemploDoisPortais(pasta: string, variantes: Variante[]): void {
  guardar(pasta, 'aplicacoes', {
    id: 'backoffice',
    nome: 'Backoffice de Pedidos',
    tipo: 'BO',
    cor: '#e07b00',
    urls: { dev: `${URL_SIMULADOR}/Backoffice` },
  });

  const fixo = (valor: string): Passo['valor'] => ({ tipo: 'fixo', valor });
  const verificarTexto = (id: string, testId: string, nome: string, esperado: Passo['valor']): Passo => ({
    id,
    acao: 'verificar',
    descricao: `Verificar ${nome}`,
    alvo: testid(testId, nome),
    valor: esperado,
    verificacao: { tipo: 'texto' },
  });
  guardar(pasta, 'blocos', {
    id: 'validar-no-backoffice',
    nome: 'Validar pedido no Backoffice',
    tipo: 'UI',
    aplicacaoId: 'backoffice',
    descricao: 'Procura o pedido pelo número, confirma que está aprovado e valida-o.',
    passos: [
      { id: 'p1', acao: 'navegar', descricao: 'Abrir o Backoffice', valor: fixo('') },
      { id: 'p2', acao: 'escrever', descricao: 'Preencher o número do pedido', alvo: testid('inpPedidoId', 'Campo Número do pedido'), valor: { tipo: 'variavel', nome: 'PedidoId' } },
      { id: 'p3', acao: 'clicar', descricao: 'Procurar', alvo: testid('btnProcurar', 'Botão Procurar') },
      verificarTexto('p4', 'boEstado', 'Estado no Backoffice', fixo('Aprovado')),
      verificarTexto('p5', 'boDecisao', 'Decisão antes de validar', fixo('Pendente')),
      { id: 'p6', acao: 'escrever', descricao: 'Preencher o motivo', alvo: testid('inpMotivo', 'Campo Motivo'), valor: { tipo: 'variavel', nome: 'MotivoBO' } },
      { id: 'p7', acao: 'clicar', descricao: 'Validar', alvo: testid('btnValidar', 'Botão Validar') },
      verificarTexto('p8', 'boMensagem', 'Mensagem do Backoffice', fixo('Pedido validado')),
      verificarTexto('p9', 'boDecisao', 'Decisão depois de validar', fixo('Validado')),
    ],
  });

  guardar(pasta, 'blocos', {
    id: 'consultar-pedido-api',
    nome: 'Consultar pedido pela API',
    tipo: 'API',
    aplicacaoId: 'api-pedidos',
    descricao: 'Confirma pela API REST que o pedido ficou com os valores e a decisão certos.',
    passos: [],
    pedido: {
      metodo: 'GET',
      url: '/pedidos/{PedidoId}',
      parametros: [],
      cabecalhos: [],
      tipoCorpo: 'nenhum',
      corpo: '',
      verificacoes: [
        { id: 'v1', alvo: 'estado', operador: 'igual', esperado: '200' },
        { id: 'v2', alvo: 'corpo', caminho: 'Estado', operador: 'igual', esperado: '{EstadoEsperado}' },
        { id: 'v3', alvo: 'corpo', caminho: 'Prestacao', operador: 'igual', esperado: '{PrestacaoEsperada}' },
        { id: 'v4', alvo: 'corpo', caminho: 'TotalPagar', operador: 'igual', esperado: '{TotalEsperado}' },
        { id: 'v5', alvo: 'corpo', caminho: 'DecisaoBO', operador: 'igual', esperado: 'Validado' },
        { id: 'v6', alvo: 'corpo', caminho: 'MotivoBO', operador: 'igual', esperado: '{MotivoBO}' },
      ],
      guardar: [],
    },
  });

  guardar(pasta, 'jornadas', {
    id: 'simular-e-validar',
    nome: 'Simular e validar no Backoffice',
    epicoId: 'simulacoes',
    etiquetas: ['exemplo', '2 portais'],
    blocos: [
      { id: 'b1', blocoId: 'simular-credito' },
      { id: 'b2', blocoId: 'validar-no-backoffice' },
      { id: 'b3', blocoId: 'consultar-pedido-api' },
    ],
  });

  const [cp12, ca48] = variantes;
  const casos: Caso[] = [criarCaso('BO0001', cp12, 1000, 'CP12: simular, validar e confirmar'), criarCaso('BO0002', ca48, 32500, 'CA48: simular, validar e confirmar')];
  for (const caso of casos) caso.dados.MotivoBO = `Validado no teste ${caso.id}`;
  guardar(pasta, 'casos', { id: 'simular-e-validar', colunas: Object.keys(casos[0].dados), casos });
}
