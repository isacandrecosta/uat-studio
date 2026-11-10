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
    `test(${lit(bloco.nome)}, async ({ page }) => {`,
    '  // Dados do caso (na ferramenta vêm da tabela de casos ou do Excel).',
    `  const v: Record<string, string> = {${usa.length ? ` ${usa.map((n) => `${/^[A-Za-z_$][\w$]*$/.test(n) ? n : lit(n)}: ''`).join(', ')} ` : ''}};`,
    '',
    ...indentar(corpoDoBloco(bloco, undefined, urlDe(bloco, aplicacoes, ambienteId)), 2),
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
    `  test(\`${jornada.nome.replace(/[`\\$]/g, '')} | \${caso.ID} \${caso.Descricao ?? ''}\`, async ({ page }) => {`,
    '    const v: Record<string, string> = { ...caso };',
  ];
  jornada.blocos.forEach((item, indice) => {
    const bloco = porId.get(item.blocoId);
    linhas.push('', `    // ===== Bloco ${indice + 1}: ${bloco?.nome ?? `${item.blocoId} (já não existe)`} =====`);
    if (!bloco) return;
    if (bloco.tipo !== 'UI') {
      linhas.push(`    // Bloco de ${bloco.tipo}: ainda sem código equivalente.`);
      return;
    }
    linhas.push(...indentar(corpoDoBloco(bloco, item.parametros, urlDe(bloco, aplicacoes, ambienteId)), 4));
  });
  linhas.push('  });', '}', '');
  return linhas.join('\n');
}
