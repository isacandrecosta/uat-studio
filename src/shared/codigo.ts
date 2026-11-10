// "Ver código (.ts)": gera o teste Playwright equivalente a um bloco ou a uma jornada.
// É só para ler, aprender ou levar para outro projeto: o UAT Studio não precisa deste código para correr.
import type { Aplicacao, Bloco, BlocoDaJornada, ConjuntoCasos, Jornada, Localizador, Passo, Valor } from './modelo';
// Nota: dentro de src/shared, os imports de código têm de acabar em ".js" (a interface corre no browser).
import { variaveisDoBloco } from './variaveis.js';

/** Texto como literal TypeScript com plicas: O'Neil → 'O\'Neil' */
function lit(texto: string): string {
  return `'${texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`;
}

function acesso(nome: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(nome) ? `v.${nome}` : `v[${lit(nome)}]`;
}

function codigoLocalizador(loc: Localizador): string {
  switch (loc.tipo) {
    case 'testid':
      return `page.getByTestId(${lit(loc.valor)})`;
    case 'etiqueta':
      return `page.getByLabel(${lit(loc.valor)}, { exact: true })`;
    case 'role':
      return `page.getByRole(${lit(loc.valor)}, { name: ${lit(loc.nome ?? '')}, exact: true })`;
    case 'placeholder':
      return `page.getByPlaceholder(${lit(loc.valor)}, { exact: true })`;
    case 'texto':
      return `page.getByText(${lit(loc.valor)}, { exact: true })`;
    case 'id':
      return `page.locator(${lit(`[id="${loc.valor}"]`)})`;
    case 'css':
      return `page.locator(${lit(loc.valor)})`;
  }
}

/** Expressão TypeScript para o valor de um passo, já com os parâmetros do bloco aplicados. */
function codigoValor(valor: Valor | undefined, parametros: BlocoDaJornada['parametros']): string {
  if (!valor) return "''";
  if (valor.tipo === 'fixo') return lit(valor.valor);
  if (valor.tipo === 'variavel') {
    const troca = parametros?.[valor.nome];
    if (troca?.tipo === 'fixo') return lit(troca.valor);
    return acesso(troca?.tipo === 'variavel' ? troca.nome : valor.nome);
  }
  // As fórmulas são calculadas pela ferramenta; no código fica a indicação do que era.
  const formula = valor.tipo === 'formula' ? valor.expressao : valor.gerador;
  return `'' /* fórmula do UAT Studio: ${formula.replace(/\*\//g, '* /')} */`;
}

function linhasDoPasso(passo: Passo, parametros: BlocoDaJornada['parametros'], urlBase: string): string[] {
  const linhas: string[] = [`// ${passo.descricao}`];
  const principal = passo.alvo?.localizadores[0];
  let alvo = principal ? codigoLocalizador(principal) : 'page.locator(\'body\')';
  // Widgets OutSystems: o data-testid está no DIV à volta; o controlo verdadeiro está lá dentro.
  if (passo.alvo?.widget === 'dropdown' || (passo.acao === 'escolher' && passo.alvo?.widget)) alvo += ".locator('select')";
  else if (passo.alvo?.widget === 'envolvido') alvo += ".locator('input, textarea').first()";
  const alternativas = passo.alvo?.localizadores.slice(1) ?? [];
  if (alternativas.length > 0) linhas.push(`//   alternativas: ${alternativas.map(codigoLocalizador).join(' | ')}`);
  const valor = codigoValor(passo.valor, parametros);

  switch (passo.acao) {
    case 'navegar': {
      const caminho = passo.valor?.tipo === 'fixo' ? passo.valor.valor.trim() : '';
      const url = /^https?:\/\//i.test(caminho) ? caminho : caminho ? `${urlBase.replace(/\/+$/, '')}/${caminho.replace(/^\/+/, '')}` : urlBase;
      linhas.push(`await page.goto(${lit(url)});`);
      break;
    }
    case 'escrever':
      linhas.push(`await ${alvo}.fill(${valor});`);
      break;
    case 'escolher':
      linhas.push(`await ${alvo}.selectOption({ label: ${valor} });`);
      break;
    case 'marcar':
      if (passo.valor?.tipo === 'fixo') linhas.push(`await ${alvo}.${passo.valor.valor === 'S' ? 'check' : 'uncheck'}();`);
      else linhas.push(`await ${alvo}.setChecked(/^(s|sim|x|1|true)$/i.test(${valor}));`);
      break;
    case 'clicar':
      linhas.push(`await ${alvo}.click();`);
      break;
    case 'verificar': {
      const tipo = passo.verificacao?.tipo ?? 'texto';
      if (tipo === 'visivel') linhas.push(`await expect.soft(${alvo}).toBeVisible();`);
      else if (tipo === 'numero') {
        const tolerancia = (passo.verificacao?.tolerancia ?? '0').replace(',', '.');
        linhas.push(
          `expect.soft(Math.abs(numero(await ${alvo}.innerText()) - numero(${valor})), ${lit(passo.descricao)}).toBeLessThanOrEqual(${Number(tolerancia) || 0} + 1e-9);`,
        );
      } else linhas.push(`await expect.soft(${alvo}).toHaveText(${valor});`);
      break;
    }
    case 'guardar':
      linhas.push(`${acesso(passo.variavel ?? 'valor')} = (await ${alvo}.innerText()).trim();`);
      break;
    case 'esperar':
      linhas.push(passo.alvo ? `await ${alvo}.waitFor();` : `await page.waitForTimeout(${(Number(passo.valor?.tipo === 'fixo' ? passo.valor.valor : '1') || 1) * 1000});`);
      break;
  }
  return linhas;
}

/** Texto com {variáveis} como "template literal" de TypeScript: `/clientes/${v.ClienteId}` */
function modelo(texto: string): string {
  const protegido = texto.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  const comVariaveis = protegido.replace(/\{([^{}"'\s][^{}"'\n]*)\}/g, (tudo, conteudo: string) => {
    const nome = conteudo.trim();
    if (nome.toUpperCase() === 'TESTE') return '${v.ID}';
    // Os outros marcadores ({DATA:...}, {CONTADOR:...}) são calculados pela ferramenta: ficam como estão.
    if (/^(RUN|DATA|HOJE|CONTADOR|ALEATORIO)\b/i.test(nome)) return tudo;
    return `\${${acesso(nome)}}`;
  });
  return `\`${comVariaveis}\``;
}

/** Caminho de um campo da resposta como código: corpo.cliente.moradas[0].rua */
function codigoCaminho(caminho: string): string {
  const partes = caminho.trim().replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  return `corpo${partes.map((p) => (/^\d+$/.test(p) ? `?.[${p}]` : /^[A-Za-z_$][\w$]*$/.test(p) ? `?.${p}` : `?.[${lit(p)}]`)).join('')}`;
}

/** Código de um bloco de API, usando o `request` do Playwright. */
function corpoDoBlocoApi(bloco: Bloco, urlBase: string): string[] {
  const pedido = bloco.pedido;
  if (!pedido) return ['// Bloco de API sem pedido definido.'];
  const caminho = pedido.url.trim();
  const url = /^https?:\/\//i.test(caminho) ? caminho : caminho ? `${urlBase.replace(/\/+$/, '')}/${caminho.replace(/^\/+/, '')}` : urlBase;
  const linhas: string[] = ['{'];
  if (pedido.perfilId) {
    linhas.push(
      `  // Autenticação: perfil "${pedido.perfilId}". No UAT Studio o token é pedido e renovado sozinho, e os segredos ficam no cofre;`,
      '  // aqui tens de fornecer o token (por exemplo, numa variável de ambiente).',
    );
  }
  const opcoes: string[] = [`method: ${lit(pedido.metodo)}`];
  const cabecalhos = pedido.cabecalhos.filter((c) => c.nome.trim()).map((c) => `${lit(c.nome.trim())}: ${modelo(c.valor)}`);
  if (pedido.perfilId) cabecalhos.push("Authorization: `Bearer ${process.env.TOKEN ?? ''}`");
  if (cabecalhos.length > 0) opcoes.push(`headers: { ${cabecalhos.join(', ')} }`);
  const parametros = pedido.parametros.filter((p) => p.nome.trim()).map((p) => `${lit(p.nome.trim())}: ${modelo(p.valor)}`);
  if (parametros.length > 0) opcoes.push(`params: { ${parametros.join(', ')} }`);
  if (pedido.tipoCorpo !== 'nenhum' && pedido.metodo !== 'GET' && pedido.corpo.trim()) {
    opcoes.push(pedido.tipoCorpo === 'json' ? `data: JSON.parse(${modelo(pedido.corpo)})` : `data: ${modelo(pedido.corpo)}`);
  }
  linhas.push(`  const resposta = await request.fetch(${modelo(url)}, { ${opcoes.join(', ')} });`);
  const precisaCorpo = pedido.guardar.length > 0 || pedido.verificacoes.some((v) => v.alvo === 'corpo');
  if (precisaCorpo) linhas.push('  const texto = await resposta.text();', '  const corpo = (() => { try { return JSON.parse(texto); } catch { return undefined; } })();');
  for (const v of pedido.verificacoes) {
    const esperado = modelo(v.esperado ?? '');
    const obtido =
      v.alvo === 'estado' ? 'String(resposta.status())' : v.alvo === 'cabecalho' ? `(resposta.headers()[${lit((v.caminho ?? '').toLowerCase())}] ?? '')` : v.alvo === 'tempo' ? null : v.caminho?.trim() ? `String(${codigoCaminho(v.caminho)} ?? '')` : 'texto';
    if (obtido === null) {
      linhas.push('  // Verificação do tempo de resposta: feita pela ferramenta.');
      continue;
    }
    const nome = lit(`${v.alvo === 'estado' ? 'Código HTTP' : v.caminho || 'Resposta'}`);
    switch (v.operador) {
      case 'igual':
        linhas.push(v.alvo === 'estado' && (v.esperado ?? '').includes(',') ? `  expect.soft(${esperado}.split(',').map((c) => c.trim()), ${nome}).toContain(${obtido});` : `  expect.soft(${obtido}, ${nome}).toBe(${esperado});`);
        break;
      case 'diferente':
        linhas.push(`  expect.soft(${obtido}, ${nome}).not.toBe(${esperado});`);
        break;
      case 'contem':
        linhas.push(`  expect.soft(${obtido}, ${nome}).toContain(${esperado});`);
        break;
      case 'maior':
        linhas.push(`  expect.soft(Number(${obtido}), ${nome}).toBeGreaterThan(Number(${esperado}));`);
        break;
      case 'menor':
        linhas.push(`  expect.soft(Number(${obtido}), ${nome}).toBeLessThan(Number(${esperado}));`);
        break;
      case 'regex':
        linhas.push(`  expect.soft(${obtido}, ${nome}).toMatch(new RegExp(${esperado}));`);
        break;
      case 'existe':
        linhas.push(`  expect.soft(${v.caminho?.trim() ? codigoCaminho(v.caminho) : 'texto'}, ${nome}).toBeDefined();`);
        break;
    }
  }
  for (const g of pedido.guardar) if (g.variavel.trim()) linhas.push(`  ${acesso(g.variavel.trim())} = String(${codigoCaminho(g.caminho)});`);
  linhas.push('}');
  return linhas;
}

function usaNumeros(blocos: Bloco[]): boolean {
  return blocos.some((b) => b.passos.some((p) => p.acao === 'verificar' && p.verificacao?.tipo === 'numero'));
}

const AJUDA_NUMERO = `/** Lê números como "1.234,56 €" ou "86.76". (O UAT Studio usa cálculo decimal exato; isto é uma versão simples.) */
function numero(texto: string): number {
  const t = texto.replace(/[^\\d.,-]/g, '');
  const decimal = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  if (decimal < 0) return Number(t);
  return Number(t.slice(0, decimal).replace(/[.,]/g, '') + '.' + t.slice(decimal + 1));
}
`;

function cabecalho(titulo: string, blocos: Bloco[]): string[] {
  return [
    "import { test, expect } from '@playwright/test';",
    '',
    `// ${titulo}`,
    '// Código gerado pelo UAT Studio, equivalente ao que a ferramenta executa.',
    '// A ferramenta faz mais do que isto: usa as alternativas quando um localizador falha,',
    '// espera pelo carregamento do OutSystems e compara valores com cálculo decimal exato.',
    '',
    ...(usaNumeros(blocos) ? [AJUDA_NUMERO] : []),
  ];
}

const indentar = (linhas: string[], espacos: number): string[] => linhas.map((l) => (l ? ' '.repeat(espacos) + l : l));

function corpoDoBloco(bloco: Bloco, parametros: BlocoDaJornada['parametros'], urlBase: string): string[] {
  const linhas: string[] = [];
  for (const passo of bloco.passos) linhas.push(...linhasDoPasso(passo, parametros, urlBase), '');
  linhas.pop();
  return linhas;
}

function urlDe(bloco: Bloco, aplicacoes: Aplicacao[], ambienteId: string): string {
  return aplicacoes.find((a) => a.id === bloco.aplicacaoId)?.urls[ambienteId] ?? 'https://endereco-da-aplicacao';
}

/** Código de um bloco isolado: um teste com as variáveis por preencher. */
export function codigoDoBloco(bloco: Bloco, aplicacoes: Aplicacao[], ambienteId: string): string {
  const { usa } = variaveisDoBloco(bloco);
  const linhas = [
    ...cabecalho(`Bloco: ${bloco.nome}`, [bloco]),
    `test(${lit(bloco.nome)}, async ({ ${bloco.tipo === 'API' ? 'request' : 'page'} }) => {`,
    '  // Dados do caso (na ferramenta vêm da tabela de casos ou do Excel).',
    `  const v: Record<string, string> = {${usa.length ? ` ${[...(bloco.tipo === 'API' ? ['ID'] : []), ...usa].map((n) => `${/^[A-Za-z_$][\w$]*$/.test(n) ? n : lit(n)}: ''`).join(', ')} ` : ''}};`,
    '',
    ...indentar(bloco.tipo === 'API' ? corpoDoBlocoApi(bloco, urlDe(bloco, aplicacoes, ambienteId)) : corpoDoBloco(bloco, undefined, urlDe(bloco, aplicacoes, ambienteId)), 2),
    '});',
    '',
  ];
  return linhas.join('\n');
}

/** Código de uma jornada: um teste por caso, com os blocos pela ordem do percurso. */
export function codigoDaJornada(
  jornada: Jornada,
  blocos: Bloco[],
  aplicacoes: Aplicacao[],
  conjunto: ConjuntoCasos | undefined,
  ambienteId: string,
): string {
  const porId = new Map(blocos.map((b) => [b.id, b]));
  const usados = jornada.blocos.map((item) => porId.get(item.blocoId)).filter((b): b is Bloco => Boolean(b));
  const casos = conjunto?.casos ?? [];
  const linhas = [
    ...cabecalho(`Jornada: ${jornada.nome}${jornada.requisitoId ? ` (${jornada.requisitoId})` : ''}`, usados),
    '// Um caso por linha de dados.',
    'const casos: Array<Record<string, string>> = [',
    ...casos.map((c) => `  ${JSON.stringify({ ID: c.id, ...(c.nome ? { Descricao: c.nome } : {}), ...c.dados })},`),
    '];',
    '',
    'for (const caso of casos) {',
    `  test(\`${jornada.nome.replace(/[`\\$]/g, '')} | \${caso.ID} \${caso.Descricao ?? ''}\`, async ({ page${usados.some((b) => b.tipo === 'API') ? ', request' : ''} }) => {`,
    '    const v: Record<string, string> = { ...caso };',
  ];
  jornada.blocos.forEach((item, indice) => {
    const bloco = porId.get(item.blocoId);
    linhas.push('', `    // ===== Bloco ${indice + 1}: ${bloco?.nome ?? `${item.blocoId} (já não existe)`} =====`);
    if (!bloco) return;
    if (bloco.tipo === 'API') {
      linhas.push(...indentar(corpoDoBlocoApi(bloco, urlDe(bloco, aplicacoes, ambienteId)), 4));
      return;
    }
    if (bloco.tipo !== 'UI') {
      linhas.push(`    // Bloco de ${bloco.tipo}: ainda sem código equivalente.`);
      return;
    }
    linhas.push(...indentar(corpoDoBloco(bloco, item.parametros, urlDe(bloco, aplicacoes, ambienteId)), 4));
  });
  linhas.push('  });', '}', '');
  return linhas.join('\n');
}
