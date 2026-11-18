// Leitura dos emails através de uma "fonte" falsa (a mesma interface que o Microsoft Graph usa): filtro pelo
// endereço do papel, completar só o email escolhido, anexos, valores, link e extração; e uma caixa antiga
// definida como Gmail/IMAP (retirado) dá um aviso claro.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AmbienteApi } from '../main/api/pedidos';
import { problemasDaCaixa } from '../main/email/caixaTestes';
import { EmailRecebido, FonteEmail, lerEmail } from '../main/email/email';
import { contextoDeExemplo, preencherTexto } from '../shared/formulas';
import type { Bloco, CaixaTestes } from '../shared/modelo';

const CAIXA: CaixaTestes = { emailBase: 'caixateste@empresa.pt', ligacao: 'microsoft', conta: 'empresa', clientId: 'id-de-teste', modoLogin: 'janela' };
const semRede: AmbienteApi = { fetch: (() => Promise.reject(new Error('sem rede'))) as unknown as typeof fetch, segredo: () => undefined, tokens: new Map() };

test('Caixa de testes: uma caixa antiga definida como Gmail/IMAP pede para ser definida outra vez', () => {
  const antiga = { emailBase: 'x@gmail.com', ligacao: 'gmail', modoLogin: 'janela' } as unknown as CaixaTestes;
  assert.match(problemasDaCaixa(antiga).join(), /Gmail\/IMAP já não é suportado/);
  assert.deepEqual(problemasDaCaixa(CAIXA), []);
});

test('Fonte de email: só o email do papel certo é completado, com anexos, valores, link e extração', async () => {
  const ctx = contextoDeExemplo({ TESTE: 'TC0001' }, {}, CAIXA);
  const gestor = preencherTexto('{EMAIL:gestor}', ctx);
  const agora = new Date().toISOString();
  const lista: EmailRecebido[] = [
    { id: 'a', de: 'x@y.pt', para: [gestor.replace('tc0001', 'tc0002')], assunto: 'Pedido aprovado', recebido: agora, texto: '', html: '' },
    { id: 'b', de: 'banco@y.pt', para: [gestor], assunto: 'Pedido aprovado', recebido: agora, texto: '', html: '', pasta: 'UAT' },
    { id: 'c', de: 'banco@y.pt', para: [gestor], assunto: 'Pedido aprovado', recebido: '2020-01-01T00:00:00Z', texto: '', html: '' },
  ];
  const completados: string[] = [];
  let fechada = false;
  const fonte: FonteEmail = {
    descricao: 'falsa',
    listar: async () => lista,
    completar: async (e) => {
      completados.push(e.id ?? '');
      return { ...e, texto: 'Montante: 1.234,56 €\nCódigo 482913', html: '<a href="https://app/ver?id=1">ver</a>', anexos: ['contrato.pdf'] };
    },
    fechar: async () => {
      fechada = true;
    },
  };
  const bloco: Bloco = {
    id: 'e',
    nome: 'Email',
    tipo: 'EMAIL',
    passos: [],
    email: {
      caixa: '',
      papel: 'gestor',
      esperaSeg: 2,
      assuntoIgual: 'Pedido aprovado',
      valores: [{ rotulo: 'Montante', esperado: '1234.56' }],
      anexos: ['contrato'],
      extrair: [{ variavel: 'Codigo', padrao: '(\\d{6})', de: 'corpo' }],
      link: { variavel: 'Link', contem: 'ver' },
    },
  };
  const r = await lerEmail({ bloco, preencher: (t) => preencherTexto(t, ctx), desde: Date.now(), caixaTestes: CAIXA, fonte, intervaloMs: 50 }, semRede);
  assert.deepEqual(completados, ['b'], 'só o email certo é completado');
  assert.equal(r.email?.pasta, 'UAT');
  assert.ok(r.verificacoes.every((v) => v.ok), JSON.stringify(r.verificacoes));
  assert.equal(r.guardadas.Codigo, '482913');
  assert.equal(r.guardadas.Link, 'https://app/ver?id=1');
  assert.equal(fechada, true, 'a fonte fecha no fim');
});
