import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criarDefeito, evidenciasSugeridas } from '../shared/defeito';
import type { Bloco, ConjuntoCasos, EstadoRun, Jornada, ResultadoCaso } from '../shared/modelo';
import { colunaValida, nomeDeColuna, parametrizar, valoresFixos } from '../shared/parametrizar';

const bloco: Bloco = {
  id: 'criar-empresa',
  nome: 'Criar empresa',
  tipo: 'UI',
  passos: [
    { id: 'p1', acao: 'navegar', descricao: 'Abrir', valor: { tipo: 'fixo', valor: '' } },
    { id: 'p2', acao: 'escrever', descricao: 'Nome', alvo: { descricao: 'Campo "Nome da empresa"', localizadores: [] }, valor: { tipo: 'fixo', valor: 'Empresa Teste' } },
    { id: 'p3', acao: 'escrever', descricao: 'Password', alvo: { descricao: 'Campo "Password"', localizadores: [] }, valor: { tipo: 'fixo', valor: 'segredo' }, secreto: true },
    { id: 'p4', acao: 'escolher', descricao: 'Duração', alvo: { descricao: 'Lista "Duração (meses)"', localizadores: [] }, valor: { tipo: 'fixo', valor: '12' } },
    { id: 'p5', acao: 'marcar', descricao: 'Seguro', alvo: { descricao: 'Opção "Com seguro"', localizadores: [] }, valor: { tipo: 'fixo', valor: 'S' } },
    { id: 'p6', acao: 'clicar', descricao: 'Guardar', alvo: { descricao: 'Botão "Guardar"', localizadores: [] } },
    { id: 'p7', acao: 'verificar', descricao: 'Estado', alvo: { descricao: 'Estado', localizadores: [] }, valor: { tipo: 'fixo', valor: 'Ativo' }, verificacao: { tipo: 'texto' } },
    { id: 'p8', acao: 'verificar', descricao: 'Mensagem visível', alvo: { descricao: 'Mensagem', localizadores: [] }, verificacao: { tipo: 'visivel' } },
    { id: 'p9', acao: 'escrever', descricao: 'Nome outra vez', alvo: { descricao: 'Campo "Nome da empresa"', localizadores: [] }, valor: { tipo: 'fixo', valor: 'Outra' } },
  ],
};

test('nomes de coluna a partir do nome do campo', () => {
  assert.equal(nomeDeColuna('Campo "Nome da empresa"', 'escrever'), 'NomeDaEmpresa');
  assert.equal(nomeDeColuna('Lista "Duração (meses)"', 'escolher'), 'DuracaoMeses');
  assert.equal(nomeDeColuna('Estado', 'verificar'), 'EstadoEsperado');
  assert.equal(nomeDeColuna('123', 'escrever'), 'Valor123');
  // Sem os prefixos técnicos dos identificadores.
  assert.equal(nomeDeColuna('resEstado', 'verificar'), 'EstadoEsperado');
  assert.equal(nomeDeColuna('Campo inpValor', 'escrever'), 'Valor');
  assert.equal(nomeDeColuna('cc_resTotal', 'verificar'), 'TotalEsperado');
  assert.equal(nomeDeColuna('Resultado', 'verificar'), 'ResultadoEsperado');
  assert.ok(colunaValida('NomeEmpresa') && !colunaValida('Nome Empresa') && !colunaValida('1Nome'));
});

test('valores fixos que podem passar a coluna (sem segredos, cliques nem "visível")', () => {
  const fixos = valoresFixos(bloco);
  assert.deepEqual(
    fixos.map((f) => `${f.passoId}:${f.coluna}=${f.valor}`),
    ['p2:NomeDaEmpresa=Empresa Teste', 'p4:DuracaoMeses=12', 'p5:ComSeguro=S', 'p7:EstadoEsperado=Ativo', 'p9:NomeDaEmpresa2=Outra'],
  );
});

test('parametrizar: passos com {Coluna} e casos das jornadas com o valor gravado', () => {
  const jornadas: Jornada[] = [
    { id: 'j1', nome: 'Com casos', epicoId: 'e', etiquetas: [], blocos: [{ id: 'b1', blocoId: 'criar-empresa' }] },
    { id: 'j2', nome: 'Sem casos', epicoId: 'e', etiquetas: [], blocos: [{ id: 'b1', blocoId: 'criar-empresa' }] },
    { id: 'j3', nome: 'Não usa', epicoId: 'e', etiquetas: [], blocos: [{ id: 'b1', blocoId: 'outro' }] },
  ];
  const conjuntos: ConjuntoCasos[] = [{ id: 'j1', colunas: ['X'], casos: [{ id: 'A', etiquetas: [], dados: { X: '1' } }, { id: 'B', etiquetas: [], dados: { X: '2', DuracaoMeses: '24' } }] }];
  const r = parametrizar(bloco, jornadas, conjuntos, [
    { passoId: 'p2', coluna: 'NomeEmpresa' },
    { passoId: 'p4', coluna: 'DuracaoMeses' },
    { passoId: 'p5', coluna: '' },
  ]);
  assert.deepEqual(r.colunas, ['NomeEmpresa', 'DuracaoMeses']);
  assert.deepEqual(r.bloco.passos[1].valor, { tipo: 'variavel', nome: 'NomeEmpresa' });
  assert.deepEqual(r.bloco.passos[3].valor, { tipo: 'variavel', nome: 'DuracaoMeses' });
  assert.deepEqual(r.bloco.passos[4].valor, { tipo: 'fixo', valor: 'S' });
  // O bloco original não é alterado.
  assert.equal(bloco.passos[1].valor?.tipo, 'fixo');
  assert.deepEqual(r.conjuntos.map((c) => c.id), ['j1', 'j2']);
  const j1 = r.conjuntos[0];
  assert.deepEqual(j1.colunas, ['X', 'NomeEmpresa', 'DuracaoMeses']);
  assert.equal(j1.casos[0].dados.NomeEmpresa, 'Empresa Teste');
  // Um valor que já existia num caso fica como estava.
  assert.equal(j1.casos[1].dados.DuracaoMeses, '24');
  const j2 = r.conjuntos[1];
  assert.equal(j2.casos.length, 1);
  assert.deepEqual(j2.casos[0].dados, { NomeEmpresa: 'Empresa Teste', DuracaoMeses: '12' });
  assert.throws(() => parametrizar(bloco, jornadas, conjuntos, [{ passoId: 'p2', coluna: 'Nome Empresa' }]), /não serve/);
});

test('defeito: título, passos para reproduzir, diferenças e evidências', () => {
  const caso: ResultadoCaso = {
    chave: 'j1/TC0001',
    jornadaId: 'j1',
    jornadaNome: 'Criar empresa',
    casoId: 'TC0001',
    casoNome: 'Contrato de 12 meses',
    estado: 'KO',
    diferencas: [{ bloco: 'Criar empresa', passo: 'Estado', esperado: 'Ativo', obtido: 'Pendente' }],
    passos: [
      { bloco: 'Criar empresa', descricao: 'Abrir', estado: 'ok', duracaoMs: 1 },
      { bloco: 'Criar empresa', descricao: 'Passo saltado', estado: 'ignorado', duracaoMs: 0 },
      { bloco: 'Criar empresa', descricao: 'Estado', estado: 'ko', detalhe: 'esperado "Ativo", obtido "Pendente"', duracaoMs: 1 },
    ],
    variaveis: {},
    duracaoMs: 5,
    pasta: 'casos/j1/TC0001',
    evidencias: ['01_criar-empresa.png', '02_criar-empresa.png', 'trace-1.zip', 'api/03_x.request.json'],
    sugestoes: ['Confirme o valor esperado.'],
  };
  const run = { id: 'run3', nome: 'Criar empresa', ambiente: 'qa', tipoAmbiente: 'QA', inicio: '2026-11-12T10:00:00Z', opcoes: { canal: 'msedge', visivel: false }, casos: [caso], pasta: '2026-11-12_run3', utilizador: 'tester' } as unknown as EstadoRun;
  const d = criarDefeito(run, caso, { projeto: 'P', descricaoJornada: 'Criar uma empresa com contrato.', requisitoId: 'REQ-7', dados: { Nome: 'Empresa Teste', Password: '***' } });
  assert.equal(d.titulo, '[QA] Criar empresa › TC0001: Estado: esperado "Ativo", obtido "Pendente"');
  assert.match(d.texto, /Requisito: REQ-7/);
  assert.match(d.texto, /OBJETIVO DO TESTE[\s\S]*Criar uma empresa com contrato\./);
  assert.match(d.texto, /Password: \*\*\*/);
  assert.match(d.texto, /1\. \[Criar empresa\] Abrir\n2\. \[Criar empresa\] Estado .*<-- KO/);
  assert.doesNotMatch(d.texto, /Passo saltado/);
  assert.match(d.texto, /esperado "Ativo", obtido "Pendente"/);
  assert.deepEqual(evidenciasSugeridas(caso), ['01_criar-empresa.png', '02_criar-empresa.png', 'trace-1.zip', 'caso.log', 'api/03_x.request.json']);
});
