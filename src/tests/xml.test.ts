import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AmbienteApi, executarBlocoApi } from '../main/api/pedidos';
import { escaparXml, lerXml, lerXPath, paraXPath, semNamespaces, XML_EM_FALTA } from '../main/api/xml';
import { contextoDeExemplo, preencherTexto } from '../shared/formulas';
import type { Bloco } from '../shared/modelo';

const RESPOSTA_SOAP = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns2="http://exemplo.pt/servico">
  <soap:Body>
    <ns2:ConsultarResposta>
      <ns2:Cliente id="C7">
        <ns2:Nome>Ana &amp; Filhos</ns2:Nome>
        <ns2:Saldo>1234.50</ns2:Saldo>
        <ns2:Estado>Ativo</ns2:Estado>
      </ns2:Cliente>
    </ns2:ConsultarResposta>
  </soap:Body>
</soap:Envelope>`;

test('XPath em XML com namespaces (os prefixos são ignorados)', () => {
  assert.equal(semNamespaces('<a:b xmlns:a="x" a:c="1"/>'), '<b c="1"/>');
  const doc = lerXml(RESPOSTA_SOAP);
  assert.ok(doc);
  assert.equal(lerXPath(doc, 'Estado'), 'Ativo');
  assert.equal(lerXPath(doc, 'Cliente.Nome'), 'Ana & Filhos');
  assert.equal(lerXPath(doc, '//Cliente/@id'), 'C7');
  assert.equal(lerXPath(doc, '/Envelope/Body/ConsultarResposta/Cliente/Saldo'), '1234.50');
  assert.equal(lerXPath(doc, 'count(//Cliente)'), 1);
  assert.equal(lerXPath(doc, 'NaoExiste'), XML_EM_FALTA);
  assert.throws(() => lerXPath(doc, '//[['), /XPath/);
  assert.equal(paraXPath('a.b'), '//a/b');
  assert.equal(lerXml('{"a":1}'), null);
  assert.equal(lerXml('<a><b></a>'), null);
});

test('bloco SOAP: corpo com valores protegidos, Content-Type, verificar e guardar por XPath', async () => {
  const enviado: { corpo?: string; tipo?: string } = {};
  const amb: AmbienteApi = {
    fetch: (async (_url: string, opcoes: RequestInit) => {
      enviado.corpo = String(opcoes.body);
      enviado.tipo = (opcoes.headers as Record<string, string>)['Content-Type'];
      return new Response(RESPOSTA_SOAP, { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }) as unknown as typeof fetch,
    segredo: () => undefined,
    tokens: new Map(),
  };
  const bloco: Bloco = {
    id: 'soap',
    nome: 'Consultar (SOAP)',
    tipo: 'API',
    passos: [],
    pedido: {
      metodo: 'POST',
      url: 'http://servico.local/ws',
      parametros: [],
      cabecalhos: [{ nome: 'SOAPAction', valor: 'Consultar' }],
      tipoCorpo: 'soap',
      corpo: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><Nome>{Nome}</Nome></soap:Body></soap:Envelope>',
      verificacoes: [
        { id: 'v1', alvo: 'corpo', caminho: 'Estado', operador: 'igual', esperado: 'Ativo' },
        { id: 'v2', alvo: 'corpo', caminho: 'Saldo', operador: 'igual', esperado: '1.234,50' },
        { id: 'v3', alvo: 'corpo', caminho: 'Morada', operador: 'existe', esperado: '' },
      ],
      guardar: [{ variavel: 'IdCliente', caminho: '//Cliente/@id' }],
    },
  };
  const valores: Record<string, string> = { Nome: 'Rui <&> Sá' };
  const ctx = contextoDeExemplo(valores);
  const r = await executarBlocoApi({ bloco, urlBase: undefined, preencher: (t, proteger) => preencherTexto(t, ctx, proteger) }, amb);
  assert.ok(String(enviado.corpo).includes('<Nome>Rui &lt;&amp;&gt; Sá</Nome>'), String(enviado.corpo));
  assert.equal(enviado.tipo, 'text/xml; charset=utf-8');
  assert.deepEqual(r.verificacoes.map((v) => v.ok), [true, true, false]);
  assert.equal(r.verificacoes[2].obtido, '(campo em falta)');
  assert.deepEqual(r.guardadas, { IdCliente: 'C7' });
  assert.equal(escaparXml(`a"b'`), 'a&quot;b&apos;');
});
