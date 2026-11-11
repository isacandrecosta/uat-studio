import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deCurl, deOpenApi, dePostman, ErroImportar, importarPedidos, partirComando } from '../shared/importar';

test('partir um comando com aspas e continuação de linha', () => {
  assert.deepEqual(partirComando(`curl -H 'A: b c' \\\n  "https://x/y?a=1"`), ['curl', '-H', 'A: b c', 'https://x/y?a=1']);
  assert.deepEqual(partirComando('curl ^"https://x/y^" -H ^"X: 1^"'), ['curl', 'https://x/y', '-H', 'X: 1']);
});

test('importar cURL (POST com JSON, query, Authorization e Basic)', () => {
  const r = deCurl(`curl -X POST 'https://api.exemplo.pt/clientes?origem=uat&x=a%20b' -H 'Content-Type: application/json' -H 'Authorization: Bearer abc' -H 'X-Canal: web' -u ana:segredo --data-raw '{"nome":"Ana","idade":30}'`);
  assert.equal(r.pedido.metodo, 'POST');
  assert.equal(r.pedido.url, 'https://api.exemplo.pt/clientes');
  assert.deepEqual(r.pedido.parametros, [{ nome: 'origem', valor: 'uat' }, { nome: 'x', valor: 'a b' }]);
  assert.equal(r.pedido.tipoCorpo, 'json');
  assert.deepEqual(JSON.parse(r.pedido.corpo), { nome: 'Ana', idade: 30 });
  assert.deepEqual(r.pedido.cabecalhos, [{ nome: 'Authorization', valor: '{Autorizacao}' }, { nome: 'X-Canal', valor: 'web' }]);
  assert.equal(r.avisos.length, 2);
  assert.ok(!JSON.stringify(r).includes('ana:segredo') && !JSON.stringify(r).includes('Bearer abc'), 'passwords e tokens não podem ficar no bloco');
  assert.equal(r.nome, 'POST /clientes');
  assert.equal(deCurl('curl https://x.pt/a').pedido.metodo, 'GET');
  assert.equal(deCurl('curl -d "a=1&b=2" https://x.pt/a').pedido.tipoCorpo, 'texto');
  assert.deepEqual(deCurl('curl -G -d "a=1" https://x.pt/a').pedido.parametros, [{ nome: 'a', valor: '1' }]);
  assert.throws(() => deCurl('wget x'), ErroImportar);
});

test('importar OpenAPI 3 (parâmetros, corpo de exemplo, código esperado)', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/clientes/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true }],
        get: { summary: 'Consultar cliente', parameters: [{ name: 'detalhe', in: 'query' }], responses: { '200': {} } },
        delete: { operationId: 'apagarCliente', responses: { '204': {} }, security: [{ oauth: [] }] },
      },
      '/clientes': {
        post: {
          summary: 'Criar cliente',
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Cliente' } } } },
          responses: { '400': {}, '201': {} },
        },
      },
    },
    components: { schemas: { Cliente: { type: 'object', properties: { nome: { type: 'string', example: 'Ana' }, nif: { type: 'string' }, ativo: { type: 'boolean' } } } } },
  };
  const r = deOpenApi(JSON.stringify(spec));
  assert.deepEqual(r.map((p) => [p.nome, p.pedido.metodo, p.pedido.url, p.pedido.verificacoes[0].esperado]), [
    ['Consultar cliente', 'GET', '/clientes/{id}', '200'],
    ['apagarCliente', 'DELETE', '/clientes/{id}', '204'],
    ['Criar cliente', 'POST', '/clientes', '201'],
  ]);
  assert.deepEqual(r[0].pedido.parametros, [{ nome: 'detalhe', valor: '{detalhe}' }]);
  assert.equal(r[1].avisos.length, 1);
  assert.deepEqual(JSON.parse(r[2].pedido.corpo), { nome: 'Ana', nif: '', ativo: false });
  assert.throws(() => deOpenApi('{"a":1}'), ErroImportar);
  assert.throws(() => deOpenApi('openapi: 3.0.0'), /YAML/);
});

test('importar coleção do Postman (pastas, {{variáveis}}, corpo e cabeçalhos)', () => {
  const colecao = {
    info: { name: 'API' },
    item: [
      {
        name: 'Clientes',
        item: [
          {
            name: 'Criar',
            request: {
              method: 'POST',
              url: { raw: '{{base}}/clientes?canal={{canal}}' },
              header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'X-Id', value: '{{id}}' }, { key: 'Velho', value: '1', disabled: true }],
              body: { mode: 'raw', raw: '{"nome":"{{nome}}"}', options: { raw: { language: 'json' } } },
              auth: { type: 'bearer' },
            },
          },
        ],
      },
      { name: 'Saúde', request: 'https://x.pt/saude' },
    ],
  };
  const r = dePostman(JSON.stringify(colecao));
  assert.deepEqual(r.map((p) => [p.nome, p.pedido.metodo, p.pedido.url]), [
    ['Clientes / Criar', 'POST', '{base}/clientes'],
    ['Saúde', 'GET', 'https://x.pt/saude'],
  ]);
  assert.deepEqual(r[0].pedido.parametros, [{ nome: 'canal', valor: '{canal}' }]);
  assert.deepEqual(r[0].pedido.cabecalhos, [{ nome: 'X-Id', valor: '{id}' }]);
  assert.equal(r[0].pedido.tipoCorpo, 'json');
  assert.equal(r[0].pedido.corpo, '{"nome":"{nome}"}');
  assert.equal(r[0].avisos.length, 1);
});

test('importar descobre o formato sozinho', () => {
  assert.equal(importarPedidos('curl https://x.pt').length, 1);
  assert.equal(importarPedidos(JSON.stringify({ swagger: '2.0', basePath: '/v1', paths: { '/a': { get: { responses: { '200': {} } } } } }))[0].pedido.url, '/v1/a');
  assert.throws(() => importarPedidos('olá'), ErroImportar);
});
