// Importar e exportar os casos de uma jornada em Excel.
// Formato: 1.ª folha, 1.ª linha com os nomes das colunas. Colunas especiais (opcionais):
// ID, Descricao (ou Descrição), Etiquetas (separadas por vírgulas) e Executar (N = não importar).
import ExcelJS from 'exceljs';
import { Bloco, Caso, ConjuntoCasos, Jornada, VariavelCalculada } from '../../shared/modelo';
import { ErroProjeto } from '../projeto/repositorio';

const semAcentos = (texto: string): string => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Converte o conteúdo de uma célula em texto, sem perder casas decimais. */
function textoDaCelula(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'boolean') return valor ? 'S' : 'N';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    if ('formula' in valor || 'sharedFormula' in valor) {
      // Fórmula do Excel: fica o resultado; se o Excel não a souber calcular (#NOME?, por ser uma função do
      // UAT Studio como EMAIL ou ARRED.PAR), fica a própria fórmula, para o UAT Studio a calcular por caso.
      const resultado = (valor as { result?: unknown }).result;
      const formula = (valor as { formula?: string }).formula;
      const semResultado = resultado === undefined || resultado === null || (typeof resultado === 'object' && 'error' in (resultado as object));
      if (semResultado && formula) return `=${formula}`;
      return textoDaCelula(resultado as ExcelJS.CellValue);
    }
    if ('richText' in valor) return valor.richText.map((p) => p.text).join('');
    if ('text' in valor) return String(valor.text); // hiperligação
    if ('error' in valor) return '';
  }
  return String(valor).trim();
}

export interface ResultadoImportacao {
  conjunto: ConjuntoCasos;
  /** Linhas com Executar = N, que ficaram de fora. */
  ignorados: number;
}

export async function importarCasos(ficheiro: string, jornadaId: string): Promise<ResultadoImportacao> {
  const livro = new ExcelJS.Workbook();
  try {
    await livro.xlsx.readFile(ficheiro);
  } catch {
    throw new ErroProjeto('Não foi possível ler o ficheiro. Tem de ser um Excel (.xlsx) e não pode estar aberto noutro programa.');
  }
  const folha = livro.worksheets[0];
  if (!folha) throw new ErroProjeto('O ficheiro Excel não tem folhas.');

  const nomes: Array<{ coluna: number; nome: string }> = [];
  folha.getRow(1).eachCell((celula, coluna) => {
    const nome = textoDaCelula(celula.value).trim();
    if (nome) nomes.push({ coluna, nome });
  });
  if (nomes.length === 0) throw new ErroProjeto('A 1.ª linha do Excel tem de ter os nomes das colunas.');

  const especial = (...candidatos: string[]): number | undefined => nomes.find((n) => candidatos.includes(semAcentos(n.nome)))?.coluna;
  const colunaId = especial('id');
  const colunaDescricao = especial('descricao');
  const colunaEtiquetas = especial('etiquetas');
  const colunaExecutar = especial('executar');
  const especiais = new Set([colunaId, colunaDescricao, colunaEtiquetas, colunaExecutar]);
  const colunasDeDados = nomes.filter((n) => !especiais.has(n.coluna));

  const casos: Caso[] = [];
  const ids = new Set<string>();
  let ignorados = 0;
  folha.eachRow((linha, numero) => {
    if (numero === 1) return;
    const ler = (coluna: number | undefined): string => (coluna ? textoDaCelula(linha.getCell(coluna).value) : '');
    const dados: Record<string, string> = {};
    for (const { coluna, nome } of colunasDeDados) dados[nome] = ler(coluna);
    const temConteudo = ler(colunaId) !== '' || Object.values(dados).some((v) => v !== '');
    if (!temConteudo) return;
    if (/^(n|nao|não|false|0)$/i.test(ler(colunaExecutar).trim())) {
      ignorados += 1;
      return;
    }
    let id = ler(colunaId).trim() || `TC${String(casos.length + 1).padStart(4, '0')}`;
    if (ids.has(id)) throw new ErroProjeto(`O ID "${id}" aparece mais de uma vez no Excel (linha ${numero}).`);
    ids.add(id);
    id = id.slice(0, 60);
    const descricao = ler(colunaDescricao).trim();
    casos.push({
      id,
      ...(descricao ? { nome: descricao } : {}),
      etiquetas: ler(colunaEtiquetas).split(',').map((e) => e.trim()).filter(Boolean),
      dados,
    });
  });
  if (casos.length === 0) throw new ErroProjeto('O Excel não tem nenhum caso para importar.');
  return { conjunto: { id: jornadaId, colunas: colunasDeDados.map((n) => n.nome), casos }, ignorados };
}

/** Uma fórmula do cenário que não vive nos casos (passos, parâmetros, condições, variáveis calculadas). */
export interface FormulaDoCenario {
  onde: string;
  oQue: string;
  formula: string;
}

/** As fórmulas que o cenário usa fora dos casos, para a folha "Fórmulas do cenário" (só para consulta). */
export function formulasDoCenario(jornada: Jornada, blocos: Bloco[], calculadas: VariavelCalculada[]): FormulaDoCenario[] {
  const linhas: FormulaDoCenario[] = [];
  const porId = new Map(blocos.map((b) => [b.id, b]));
  const usadas = new Set<string>();
  jornada.blocos.forEach((item, i) => {
    const bloco = porId.get(item.blocoId);
    if (!bloco) return;
    const onde = `${i + 1}. ${bloco.nome}`;
    if (item.condicao?.trim()) linhas.push({ onde, oQue: 'Só se (neste cenário)', formula: item.condicao });
    for (const [nome, valor] of Object.entries(item.parametros ?? {})) {
      if (valor.tipo === 'formula') linhas.push({ onde, oQue: `Parâmetro {${nome}} (neste cenário)`, formula: valor.expressao });
    }
    for (const passo of bloco.passos) {
      if (passo.valor?.tipo === 'formula') linhas.push({ onde, oQue: `Passo: ${passo.descricao}`, formula: passo.valor.expressao });
      if (passo.condicao?.trim()) linhas.push({ onde, oQue: `Passo "${passo.descricao}": só se`, formula: passo.condicao });
    }
    for (const nome of JSON.stringify(bloco).match(/\{([A-Za-zÀ-ÿ_][\wÀ-ÿ.]*)\}/g) ?? []) usadas.add(nome.slice(1, -1));
  });
  for (const v of calculadas) if (usadas.has(v.nome)) linhas.push({ onde: 'Dados de teste', oQue: `Variável calculada {${v.nome}}`, formula: v.formula });
  return linhas;
}

export async function exportarCasos(ficheiro: string, conjunto: ConjuntoCasos, formulas: FormulaDoCenario[] = []): Promise<void> {
  const livro = new ExcelJS.Workbook();
  const folha = livro.addWorksheet('Casos');
  folha.columns = [
    { header: 'ID', key: '__id', width: 12 },
    { header: 'Descricao', key: '__descricao', width: 42 },
    ...conjunto.colunas.map((c) => ({ header: c, key: `d_${c}`, width: 18 })),
    { header: 'Etiquetas', key: '__etiquetas', width: 24 },
    { header: 'Executar', key: '__executar', width: 10 },
  ];
  for (const caso of conjunto.casos) {
    const linha: Record<string, string> = {
      __id: caso.id,
      __descricao: caso.nome ?? '',
      __etiquetas: caso.etiquetas.join(', '),
      __executar: 'S',
    };
    for (const coluna of conjunto.colunas) linha[`d_${coluna}`] = caso.dados[coluna] ?? '';
    folha.addRow(linha);
  }
  // Tudo como texto, para o Excel não mudar "86,36" nem "007".
  folha.eachRow((linha) => linha.eachCell((celula) => (celula.numFmt = '@')));
  const topo = folha.getRow(1);
  topo.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  topo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  folha.views = [{ state: 'frozen', ySplit: 1 }];
  // Segunda folha, só para consulta: o que o cenário calcula fora dos casos. A importação lê só a 1.ª folha.
  if (formulas.length > 0) {
    const folhaFormulas = livro.addWorksheet('Fórmulas do cenário');
    folhaFormulas.columns = [
      { header: 'Bloco', key: 'onde', width: 36 },
      { header: 'O quê', key: 'oQue', width: 48 },
      { header: 'Fórmula', key: 'formula', width: 60 },
    ];
    for (const linha of formulas) folhaFormulas.addRow(linha);
    folhaFormulas.addRow({});
    folhaFormulas.addRow({ onde: 'Só para consulta: estas fórmulas mudam-se no UAT Studio. Na folha Casos, uma célula que começa por = (por exemplo =EMAIL("cliente")) é calculada para esse caso.' });
    folhaFormulas.eachRow((linha) => linha.eachCell((celula) => (celula.numFmt = '@')));
    const topoFormulas = folhaFormulas.getRow(1);
    topoFormulas.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    topoFormulas.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  }
  try {
    await livro.xlsx.writeFile(ficheiro);
  } catch {
    throw new ErroProjeto('Não foi possível gravar o ficheiro. Se estiver aberto no Excel, fecha-o e tenta outra vez.');
  }
}
