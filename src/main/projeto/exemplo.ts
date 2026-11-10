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
}
