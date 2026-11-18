import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arredondar, dividir, formatar, lerNumero, potencia } from '../shared/decimal';
import { avaliarFormula, contextoDeExemplo, ContextoFormula, eFormulaDoCaso, ErroFormula, variaveisDaFormula } from '../shared/formulas';

function contexto(variaveis: Record<string, string> = {}): ContextoFormula {
  const contadores: Record<string, number> = {};
  let semente = 0;
  return {
    variavel: (nome) => variaveis[nome],
    teste: 'TC0007',
    run: 'run12',
    agora: new Date(2026, 10, 10, 13, 56, 2), // 10/11/2026 13:56:02
    contador: (nome) => (contadores[nome] = (contadores[nome] ?? 0) + 1),
    // Sequência fixa, para os testes darem sempre o mesmo resultado.
    aleatorio: () => ((semente = (semente * 7 + 3) % 10) + 0.5) / 10,
  };
}
const f = (formula: string, variaveis: Record<string, string> = {}): string => avaliarFormula(formula, contexto(variaveis));
const n = (texto: string) => lerNumero(texto)!;

test('decimal: arredondar ao par e meio para cima', () => {
  assert.equal(formatar(arredondar(n('86,405'), 2, 'par')), '86,4'); // o achado real do OutSystems
  assert.equal(formatar(arredondar(n('86,405'), 2, 'cima')), '86,41');
  assert.equal(formatar(arredondar(n('86,415'), 2, 'par')), '86,42');
  assert.equal(formatar(arredondar(n('-86,405'), 2, 'cima')), '-86,41');
  assert.equal(formatar(arredondar(n('86,409'), 2, 'baixo')), '86,4');
  assert.equal(formatar(arredondar(n('2,5'), 0, 'par')), '2');
  assert.equal(formatar(arredondar(n('3,5'), 0, 'par')), '4');
  assert.equal(formatar(n('86,4'), 2), '86,40');
  assert.equal(formatar(arredondar(dividir(n('1'), n('3')), 6)), '0,333333');
  assert.equal(formatar(potencia(n('1,1'), 2)), '1,21');
  assert.equal(formatar(arredondar(potencia(n('2'), -2), 4)), '0,25');
});

test('fórmulas: textos, marcadores e contadores', () => {
  assert.equal(f('"empresa_" & {TESTE} & "_" & {DATA:yyyyMMdd} & "_" & {CONTADOR:empresa}'), 'empresa_TC0007_20261110_1');
  assert.equal(f('{RUN} & "-" & {DATA:dd/MM/yyyy HH:mm:ss}'), 'run12-10/11/2026 13:56:02');
  assert.equal(f('{HOJE+30:dd/MM/yyyy}'), '10/12/2026');
  assert.equal(f('{HOJE-10}'), '31/10/2026');
  assert.equal(f('{HOJE:yy-MM-dd}'), '26-11-10');
  const ctx = contexto();
  assert.equal(avaliarFormula('{CONTADOR:a} & {CONTADOR:a} & {CONTADOR:b}', ctx), '121');
  assert.match(f('{ALEATORIO:6}'), /^\d{6}$/);
  assert.equal(f('"diz ""olá"""'), 'diz "olá"');
  assert.equal(f('="A" & {Nome}', { Nome: 'na' }), 'Ana');
  assert.equal(f('MAIUSCULAS(ESQUERDA({Nome}; 3)) & COMPR({Nome})', { Nome: 'joaquim' }), 'JOA7');
});

test('fórmulas: contas exatas e arredondamento selecionável', () => {
  assert.equal(f('0,1 + 0,2'), '0,3');
  assert.equal(f('1 + 2 * 3'), '7');
  assert.equal(f('(1 + 2) * 3'), '9');
  assert.equal(f('-{Valor} / 4', { Valor: '10' }), '-2,5');
  assert.equal(f('ARRED({Valor} * 3 / 100; 2)', { Valor: '863.61' }), '25,91');
  assert.equal(f('ARRED.PAR(86,405; 2)'), '86,4');
  assert.equal(f('ARRED(86,405; 2)'), '86,41');
  assert.equal(f('TEXTO(ARRED.PAR(86,405; 2); 2)'), '86,40');
  assert.equal(f('PONTO(1234,5)'), '1234.5');
  assert.equal(f('TRUNCAR({Valor} / 100) * 2', { Valor: '32500' }), '650');
  assert.equal(f('{Valor} + 1', { Valor: '1.234,56 €' }), '1235,56');
  assert.equal(f('MIN(3; 1,5; 2) & "/" & MAX(3; 1,5; 2) & "/" & ABS(-4)'), '1,5/3/4');
  assert.equal(f('POTENCIA(2; 10)'), '1024');
});

test('fórmulas: prestação igual ao oráculo do POC', () => {
  const dados = { Valor: '500', Taxa: '7,5', Prazo: '12' };
  assert.equal(f('ARRED(PRESTACAO({Valor}; {Taxa}; {Prazo}); 2)', dados), '43,38');
  assert.equal(f('ARRED(PRESTACAO(32500; 6; 48); 2)'), '763,26');
  assert.equal(f('ARRED(PRESTACAO(863,61; 0; 10); 2)'), '86,36');
  // Total = prestação arredondada * meses + comissão
  assert.equal(f('ARRED(PRESTACAO({Valor}; {Taxa}; {Prazo}); 2) * {Prazo} + ARRED({Valor} * 1 / 100; 2)', dados), '525,56');
});

test('fórmulas: condições', () => {
  assert.equal(f('SE({Valor} > 1000; "Alto"; "Baixo")', { Valor: '1.500,00' }), 'Alto');
  assert.equal(f('SE({Valor} <= 1000; "Baixo"; "Alto")', { Valor: '999,99' }), 'Baixo');
  assert.equal(f('SE({Produto} = "CP12"; 1; 2)', { Produto: 'CP12' }), '1');
  assert.equal(f('SE({Produto} <> "CP12"; "outro")', { Produto: 'CP12' }), '');
  assert.equal(f('SE(2 = 2,0; "igual"; "diferente")'), 'igual');
});

test('fórmulas: geradores válidos', () => {
  const nif = f('NIF()');
  assert.match(nif, /^2\d{8}$/);
  let soma = 0;
  for (let i = 0; i < 8; i++) soma += Number(nif[i]) * (9 - i);
  const controlo = 11 - (soma % 11);
  assert.equal(Number(nif[8]), controlo >= 10 ? 0 : controlo);

  const iban = f('IBAN()');
  assert.match(iban, /^PT50\d{21}$/);
  // Regra do IBAN: mover os 4 primeiros caracteres para o fim, trocar letras por números; o resto por 97 tem de ser 1.
  assert.equal(BigInt(`${iban.slice(4)}252950`) % 97n, 1n);

  const entre = Number(f('ALEATORIOENTRE(5; 8)'));
  assert.ok(entre >= 5 && entre <= 8);
  assert.equal(f('EMAIL("Cliente FO"; "exemplo.pt")'), 'qa+clientefo.tc0007.run12@exemplo.pt');
  assert.equal(f('EMAIL("Ana.Silva"; "cliente"; "exemplo.pt")'), 'ana.silva+cliente.tc0007.run12@exemplo.pt');
});

test('fórmulas: erros explicados', () => {
  const erro = (formula: string, padrao: RegExp): void => {
    assert.throws(() => f(formula), (e: unknown) => e instanceof ErroFormula && padrao.test(e.message), formula);
  };
  erro('{NaoExiste} & "x"', /Falta a variável \{NaoExiste\}/);
  erro('"abc" + 1', /"abc" não é um número/);
  erro('1 / 0', /Divisão por zero/);
  erro('"sem fim', /fechar as aspas/);
  erro('ARRED(1; 2; 3)', /precisa de 1 a 2 argumento/);
  erro('empresa & 1', /Não conheço "empresa"/);
  erro('1 2', /texto a mais/);
  erro('(1 + 2', /Esperava "\)"/);
  assert.equal(f(''), '');
});

test('variaveisDaFormula ignora os marcadores', () => {
  assert.deepEqual(variaveisDaFormula('{Valor} * {Taxa} & {TESTE} & {DATA:yyyy} & {HOJE+3} & {CONTADOR:x} & {Valor}'), ['Valor', 'Taxa']);
});

test('fórmulas nas células dos casos: "=..." é calculado (também dentro de outras fórmulas)', () => {
  const ctx = contextoDeExemplo({ TESTE: 'TC0003', Valor: '=500 * 2', Comissao: '=ARRED({Valor} * 0,015; 2)', Texto: '= não é fórmula?' });
  assert.equal(avaliarFormula('{Valor}', ctx), '1000');
  assert.equal(avaliarFormula('{Comissao}', ctx), '15');
  assert.equal(eFormulaDoCaso('=1'), true);
  assert.equal(eFormulaDoCaso('1=1'), false);
  assert.equal(eFormulaDoCaso('='), false);
});

test('TELEFONE(): telemóvel 91/92/93/96 ou fixo 2xx, sempre 9 algarismos, e +351', () => {
  const ctx = contextoDeExemplo({});
  for (let i = 0; i < 200; i++) {
    const movel = avaliarFormula('TELEFONE()', ctx);
    assert.match(movel, /^9[1236]\d{7}$/, movel);
    const fixo = avaliarFormula('TELEFONE("fixo")', ctx);
    assert.match(fixo, /^2\d{8}$/, fixo);
  }
  assert.match(avaliarFormula('TELEFONE("telemóvel"; "+351")', ctx), /^\+3519[1236]\d{7}$/);
  assert.throws(() => avaliarFormula('TELEFONE("satelite")', ctx), /movel/);
});
