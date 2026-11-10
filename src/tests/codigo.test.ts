import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { criarExemplo } from '../main/projeto/exemplo';
import * as repo from '../main/projeto/repositorio';
import { codigoDaJornada, codigoDoBloco } from '../shared/codigo';

test('o código gerado para o exemplo tem os passos certos', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-codigo-'));
  repo.criarProjeto(pasta, 'P');
  criarExemplo(pasta);
  const blocos = repo.listar(pasta, 'blocos');
  const aplicacoes = repo.listar(pasta, 'aplicacoes');
  const jornada = repo.ler(pasta, 'jornadas', 'simular-credito');
  jornada.blocos[0].parametros = { Valor: { tipo: 'fixo', valor: "1'000" }, EstadoEsperado: { tipo: 'variavel', nome: 'Estado final' } };
  const codigo = codigoDaJornada(jornada, blocos, aplicacoes, repo.ler(pasta, 'casos', jornada.id), 'dev');

  assert.match(codigo, /import \{ test, expect \} from '@playwright\/test';/);
  assert.match(codigo, /await page\.goto\('https:\/\/personal-e5m9c9gh-dev\.outsystems\.app\/SimuladorFinanceiroPOC'\);/);
  assert.match(codigo, /await page\.getByTestId\('ddVariante'\)\.locator\('select'\)\.selectOption\(\{ label: v\.Variante \}\);/);
  // Parâmetros: valor fixo (com a plica protegida) e outra coluna (com espaço no nome).
  assert.ok(codigo.includes("await page.getByTestId('inpValor').fill('1\\'000');"));
  assert.ok(codigo.includes("await expect.soft(page.getByTestId('resEstado')).toHaveText(v['Estado final']);"));
  assert.match(codigo, /numero\(await page\.getByTestId\('resPrestacao'\)\.innerText\(\)\) - numero\(v\.PrestacaoEsperada\)/);
  assert.match(codigo, /v\.PedidoId = \(await page\.getByTestId\('resPedidoId'\)\.innerText\(\)\)\.trim\(\);/);
  assert.match(codigo, /"ID":"TC0001"/);
  assert.match(codigo, /function numero\(texto: string\): number/);

  const doBloco = codigoDoBloco(blocos.find((b) => b.id === 'simular-credito')!, aplicacoes, 'dev');
  assert.match(doBloco, /test\('Simular crédito', async \(\{ page \}\) => \{/);
  assert.match(doBloco, /const v: Record<string, string> = \{ Variante: '', Valor: ''/);

  // Jornada com um bloco de API: usa o "request" do Playwright.
  const comApi = codigoDaJornada(repo.ler(pasta, 'jornadas', 'simular-e-validar'), blocos, aplicacoes, repo.ler(pasta, 'casos', 'simular-e-validar'), 'dev');
  assert.match(comApi, /async \(\{ page, request \}\) => \{/);
  assert.ok(comApi.includes("await request.fetch(`https://personal-e5m9c9gh-dev.outsystems.app/SimuladorFinanceiroPOC/rest/PedidosAPI/pedidos/${v.PedidoId}`, { method: 'GET' });"));
  assert.ok(comApi.includes("expect.soft(String(resposta.status()), 'Código HTTP').toBe(`200`);"));
  assert.ok(comApi.includes("expect.soft(String(corpo?.DecisaoBO ?? ''), 'DecisaoBO').toBe(`Validado`);"));
  assert.ok(comApi.includes("await page.getByTestId('btnValidar').click();"));
  fs.rmSync(pasta, { recursive: true, force: true });
});
