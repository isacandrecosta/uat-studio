// Caixa de testes por IMAP (Gmail): servidor e utilizador, o que falta preencher, erros explicados e a leitura
// dos emails através de uma "fonte" falsa que se comporta como a IMAP (lista sem corpo, completar descarrega).
// A ligação real ao Gmail é testada à mão com `npm.cmd run caixa:testar` (precisa da palavra-passe no cofre).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AmbienteApi } from '../main/api/pedidos';
import { caixaPorImap, imapDaCaixa, problemasDaCaixa } from '../main/email/caixaTestes';
import { EmailRecebido, FonteEmail, lerEmail } from '../main/email/email';
import { explicarErroImap } from '../main/email/imap';
import { contextoDeExemplo, preencherTexto } from '../shared/formulas';
import type { Bloco, CaixaTestes } from '../shared/modelo';

const GMAIL: CaixaTestes = { emailBase: 'caixateste@gmail.com', ligacao: 'gmail', modoLogin: 'janela' };
const semRede: AmbienteApi = { fetch: (() => Promise.reject(new Error('sem rede'))) as unknown as typeof fetch, segredo: () => undefined, tokens: new Map() };

test('IMAP: servidor do Gmail, outro servidor e o que falta preencher', () => {
  assert.equal(caixaPorImap(GMAIL), true);
  assert.equal(caixaPorImap({ ...GMAIL, ligacao: 'microsoft' }), false);
  assert.deepEqual(imapDaCaixa(GMAIL), { servidor: 'imap.gmail.com', porta: 993, utilizador: 'caixateste@gmail.com' });
  const outro: CaixaTestes = { emailBase: 'qa@empresa.pt', ligacao: 'imap', modoLogin: 'janela', servidorImap: 'imap.empresa.pt', portaImap: 1993, utilizadorImap: 'qa' };
  assert.deepEqual(imapDaCaixa(outro), { servidor: 'imap.empresa.pt', porta: 1993, utilizador: 'qa' });
  assert.deepEqual(problemasDaCaixa(GMAIL), []);
  assert.deepEqual(problemasDaCaixa({ ...outro, servidorImap: '' }), ['falta o endereço do servidor IMAP']);
});

test('IMAP: erros explicados sem a palavra-passe', () => {
  const ligacao = { servidor: 'imap.gmail.com', porta: 993, utilizador: 'caixateste@gmail.com' };
  assert.match(explicarErroImap({ authenticationFailed: true }, ligacao).message, /palavra-passe de aplicação/);
  assert.match(explicarErroImap({ code: 'ENOTFOUND' }, ligacao).message, /Não encontrei o servidor/);
  assert.match(explicarErroImap({ code: 'ETIMEDOUT' }, ligacao).message, /proxy/);
  assert.match(explicarErroImap(new Error('outra coisa'), ligacao).message, /outra coisa/);
});

test('IMAP: sem palavra-passe no cofre dá um erro claro', async () => {
  const bloco: Bloco = { id: 'e', nome: 'Email', tipo: 'EMAIL', passos: [], email: { caixa: '', papel: 'gestor', esperaSeg: 1 } };
  await assert.rejects(lerEmail({ bloco, preencher: (t) => t, desde: Date.now(), caixaTestes: GMAIL }, semRede), /Falta a palavra-passe da caixa/);
});

test('IMAP: lê pela fonte (lista sem corpo, completa só o escolhido), com anexos e pasta do spam', async () => {
  const ctx = contextoDeExemplo({ TESTE: 'TC0001' }, {}, GMAIL);
  const gestor = preencherTexto('{EMAIL:gestor}', ctx);
  const agora = new Date().toISOString();
  const lista: EmailRecebido[] = [
    { id: 'INBOX:9', de: 'x@y.pt', para: [gestor.replace('tc0001', 'tc0002')], assunto: 'Pedido aprovado', recebido: agora, texto: '', html: '' },
    { id: '[Gmail]/Spam:4', de: 'banco@y.pt', para: [gestor], assunto: 'Pedido aprovado', recebido: agora, texto: '', html: '', pasta: '[Gmail]/Spam' },
    { id: 'INBOX:1', de: 'banco@y.pt', para: [gestor], assunto: 'Pedido aprovado', recebido: '2020-01-01T00:00:00Z', texto: '', html: '' },
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
  const r = await lerEmail({ bloco, preencher: (t) => preencherTexto(t, ctx), desde: Date.now(), caixaTestes: GMAIL, fonte, intervaloMs: 50 }, semRede);
  assert.deepEqual(completados, ['[Gmail]/Spam:4'], 'só o email certo é descarregado');
  assert.equal(r.email?.pasta, '[Gmail]/Spam');
  assert.ok(r.verificacoes.every((v) => v.ok), JSON.stringify(r.verificacoes));
  assert.equal(r.guardadas.Codigo, '482913');
  assert.equal(r.guardadas.Link, 'https://app/ver?id=1');
  assert.equal(fechada, true, 'a ligação fecha no fim');
});
