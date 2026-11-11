import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { criarExemplo } from '../main/projeto/exemplo';
import { exportarPacote, importarPacote } from '../main/projeto/pacotes';
import * as repo from '../main/projeto/repositorio';
import { ErroPacote, lerPacote, planearImportacao } from '../shared/pacotes';

test('exportar blocos de um projeto e importá-los noutro (com aplicações, perfis e conflitos)', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-pacotes-'));
  try {
    const origem = path.join(raiz, 'origem');
    const destino = path.join(raiz, 'destino');
    repo.criarProjeto(origem, 'Origem');
    criarExemplo(origem);
    repo.guardar(origem, 'perfis', { id: 'oauth-qa', nome: 'OAuth QA', tipo: 'oauth2-cliente', urlToken: 'http://x/token', clientId: 'c' });
    const api = repo.ler(origem, 'blocos', 'consultar-pedido-api');
    repo.guardar(origem, 'blocos', { ...api, pedido: { ...api.pedido!, perfilId: 'oauth-qa' } });
    repo.criarProjeto(destino, 'Destino');

    const ficheiro = path.join(raiz, 'blocos.uatpack');
    const pacote = exportarPacote(origem, ['simular-credito', 'consultar-pedido-api'], ficheiro);
    assert.deepEqual(pacote.blocos.map((b) => b.id).sort(), ['consultar-pedido-api', 'simular-credito']);
    assert.deepEqual(pacote.aplicacoes.map((a) => a.id).sort(), ['api-pedidos', 'simulador']);
    assert.deepEqual(pacote.perfis.map((p) => p.id), ['oauth-qa']);
    assert.equal(pacote.origem, 'Origem');

    // 1.ª importação: tudo novo.
    const lido = lerPacote(fs.readFileSync(ficheiro, 'utf8'));
    const primeira = importarPacote(destino, lido, 'copia');
    assert.deepEqual(primeira, { blocos: 2, aplicacoes: 2, perfis: 1, saltados: 0 });
    assert.equal(repo.ler(destino, 'blocos', 'simular-credito').passos.length, repo.ler(origem, 'blocos', 'simular-credito').passos.length);

    // 2.ª importação, igual: nada muda.
    assert.deepEqual(importarPacote(destino, lido, 'copia'), { blocos: 0, aplicacoes: 0, perfis: 0, saltados: 2 });

    // Um bloco alterado no destino: "cópia" cria outro; "substituir" repõe o do pacote; "saltar" não mexe.
    const alterado = repo.ler(destino, 'blocos', 'simular-credito');
    repo.guardar(destino, 'blocos', { ...alterado, descricao: 'mudado no destino' });
    const estados = new Map(planearImportacao(lido, repo.listar(destino, 'blocos')).map((i) => [i.bloco.id, i.estado]));
    assert.equal(estados.get('simular-credito'), 'diferente');
    assert.equal(estados.get('consultar-pedido-api'), 'igual');
    assert.deepEqual(importarPacote(destino, lido, 'saltar'), { blocos: 0, aplicacoes: 0, perfis: 0, saltados: 2 });
    assert.deepEqual(importarPacote(destino, lido, 'copia'), { blocos: 1, aplicacoes: 0, perfis: 0, saltados: 1 });
    assert.ok(repo.listar(destino, 'blocos').some((b) => b.nome === 'Simular crédito (importado)'));
    importarPacote(destino, lido, 'substituir');
    assert.equal(repo.ler(destino, 'blocos', 'simular-credito').descricao, repo.ler(origem, 'blocos', 'simular-credito').descricao);

    // Uma aplicação que já existe no destino fica como está (por exemplo, com o endereço de lá).
    const app = repo.ler(destino, 'aplicacoes', 'simulador');
    repo.guardar(destino, 'aplicacoes', { ...app, urls: { qa: 'https://endereco-do-destino' } });
    importarPacote(destino, lido, 'substituir');
    assert.deepEqual(repo.ler(destino, 'aplicacoes', 'simulador').urls, { qa: 'https://endereco-do-destino' });
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('ficheiros que não são pacotes são recusados com uma frase simples', () => {
  assert.throws(() => lerPacote('olá'), ErroPacote);
  assert.throws(() => lerPacote('{"formato":"outro","blocos":[]}'), /não é um pacote/);
  assert.throws(() => lerPacote('{"formato":"uat-studio-pacote","versao":2,"blocos":[]}'), /versão mais recente/);
  assert.throws(() => lerPacote('{"formato":"uat-studio-pacote","versao":1,"blocos":[{"id":"x"}]}'), /incompletos/);
});
