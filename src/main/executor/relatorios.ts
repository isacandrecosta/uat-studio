// Relatórios de uma execução: relatorio.xlsx (1 linha por caso) e relatorio.html (visual).
import ExcelJS from 'exceljs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EstadoRun, ResultadoCaso } from '../../shared/modelo';

const CORES: Record<string, string> = { OK: 'FF1A8F4C', KO: 'FFC0392B', ERRO: 'FFE0A100', PARADO: 'FF98A2B3' };

function duracao(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function resumoDoCaso(caso: ResultadoCaso): string {
  if (caso.estado === 'ERRO' && caso.erro) {
    const onde = [caso.erro.bloco, caso.erro.passo].filter(Boolean).join(' › ');
    return `${onde ? `${onde}: ` : ''}${caso.erro.mensagem}`;
  }
  return caso.diferencas
    .map((d) => `${d.passo}: esperado "${d.esperado}", obtido "${d.obtido}"${d.diferenca ? ` (diferença ${d.diferenca})` : ''}`)
    .join('\n');
}

function contar(run: EstadoRun): Record<string, number> {
  const totais: Record<string, number> = { OK: 0, KO: 0, ERRO: 0, PARADO: 0 };
  for (const caso of run.casos) if (caso.estado in totais) totais[caso.estado] += 1;
  return totais;
}

async function escreverExcel(pastaRun: string, run: EstadoRun): Promise<void> {
  const livro = new ExcelJS.Workbook();
  const cabecalho = (folha: ExcelJS.Worksheet): void => {
    const linha = folha.getRow(1);
    linha.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    linha.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    folha.views = [{ state: 'frozen', ySplit: 1 }];
    folha.autoFilter = { from: 'A1', to: { row: 1, column: folha.columnCount } };
  };

  const resultados = livro.addWorksheet('Resultados');
  resultados.columns = [
    { header: 'Jornada', key: 'jornada', width: 28 },
    { header: 'Caso', key: 'caso', width: 12 },
    { header: 'Descrição', key: 'descricao', width: 40 },
    { header: 'Resultado', key: 'resultado', width: 12 },
    { header: 'Duração (s)', key: 'duracao', width: 12 },
    { header: 'Diferenças', key: 'diferencas', width: 12 },
    { header: 'Detalhe', key: 'detalhe', width: 90 },
    { header: 'Evidências', key: 'pasta', width: 40 },
  ];
  for (const caso of run.casos) {
    const linha = resultados.addRow({
      jornada: caso.jornadaNome,
      caso: caso.casoId,
      descricao: caso.casoNome ?? '',
      resultado: caso.estado === 'por-correr' ? 'Não correu' : caso.estado,
      duracao: Math.round(caso.duracaoMs / 100) / 10,
      diferencas: caso.diferencas.length,
      detalhe: resumoDoCaso(caso),
      pasta: caso.pasta ?? '',
    });
    const cor = CORES[caso.estado];
    if (cor) {
      const celula = linha.getCell('resultado');
      celula.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } };
    }
    linha.getCell('detalhe').alignment = { wrapText: true, vertical: 'top' };
  }
  cabecalho(resultados);

  const diferencas = livro.addWorksheet('Diferenças');
  diferencas.columns = [
    { header: 'Jornada', key: 'jornada', width: 28 },
    { header: 'Caso', key: 'caso', width: 12 },
    { header: 'Bloco', key: 'bloco', width: 26 },
    { header: 'Passo', key: 'passo', width: 44 },
    { header: 'Esperado', key: 'esperado', width: 22 },
    { header: 'Obtido', key: 'obtido', width: 22 },
    { header: 'Diferença', key: 'diferenca', width: 14 },
  ];
  for (const caso of run.casos) {
    for (const d of caso.diferencas) {
      diferencas.addRow({ jornada: caso.jornadaNome, caso: caso.casoId, bloco: d.bloco, passo: d.passo, esperado: d.esperado, obtido: d.obtido, diferenca: d.diferenca ?? '' });
    }
  }
  cabecalho(diferencas);

  const totais = contar(run);
  const resumo = livro.addWorksheet('Resumo');
  resumo.columns = [{ width: 22 }, { width: 50 }];
  resumo.addRows([
    ['Execução', `${run.id}: ${run.nome}`],
    ['Ambiente', `${run.ambiente} (${run.tipoAmbiente})`],
    ['Início', new Date(run.inicio).toLocaleString('pt-PT')],
    ['Fim', run.fim ? new Date(run.fim).toLocaleString('pt-PT') : ''],
    ['Browser', `${run.opcoes.canal === 'msedge' ? 'Edge' : 'Chrome'}, ${run.opcoes.visivel ? 'visível' : 'em background'}, ${run.opcoes.paralelo} em paralelo`],
    ['Casos', run.casos.length],
    ['OK', totais.OK],
    ['KO', totais.KO],
    ['ERRO', totais.ERRO],
    ['Parados / não correram', run.casos.length - totais.OK - totais.KO - totais.ERRO],
  ]);
  resumo.getColumn(1).font = { bold: true };

  await livro.xlsx.writeFile(path.join(pastaRun, 'relatorio.xlsx'));
}

const esc = (texto: string): string =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const caminhoUrl = (...partes: string[]): string => partes.join('/').split('/').map(encodeURIComponent).join('/');

function htmlDoCaso(caso: ResultadoCaso): string {
  const pasta = caso.pasta ?? '';
  const prints = (caso.evidencias ?? []).filter((f) => f.endsWith('.png'));
  const outros = (caso.evidencias ?? []).filter((f) => !f.endsWith('.png'));
  const partes: string[] = [];
  if (caso.erro) {
    partes.push(
      `<div class="erro"><strong>O que aconteceu:</strong> ${esc(caso.erro.mensagem)}<br><strong>Onde:</strong> ${esc(
        [caso.jornadaNome, caso.erro.bloco, caso.erro.passo].filter(Boolean).join(' › '),
      )}${caso.erro.porExecutar.length ? `<br><strong>Ficou por executar:</strong> ${esc(caso.erro.porExecutar.join(', '))}` : ''}</div>`,
    );
  }
  if (caso.sugestoes?.length) {
    partes.push(`<div class="sugestoes"><strong>Sugestão:</strong><ul>${caso.sugestoes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>`);
  }
  if (caso.diferencas.length > 0) {
    partes.push(
      `<table class="dif"><thead><tr><th>Passo</th><th>Esperado</th><th>Obtido</th><th>Diferença</th></tr></thead><tbody>${caso.diferencas
        .map((d) => `<tr><td>${esc(d.passo)}</td><td>${esc(d.esperado)}</td><td>${esc(d.obtido)}</td><td>${esc(d.diferenca ?? '')}</td></tr>`)
        .join('')}</tbody></table>`,
    );
  }
  partes.push(
    `<ol class="passos">${caso.passos
      .map((p) => `<li class="p-${p.estado}"><span class="marca">${p.estado.toUpperCase()}</span> ${esc(p.descricao)}${p.detalhe ? ` <span class="suave">${esc(p.detalhe)}</span>` : ''}</li>`)
      .join('')}</ol>`,
  );
  const variaveis = Object.entries(caso.variaveis);
  if (variaveis.length > 0) partes.push(`<p class="suave">Variáveis guardadas: ${variaveis.map(([n, v]) => `{${esc(n)}} = ${esc(v)}`).join('; ')}</p>`);
  if (prints.length > 0) {
    partes.push(
      `<div class="prints">${prints
        .map((f) => `<a href="${caminhoUrl(pasta, f)}"><img loading="lazy" src="${caminhoUrl(pasta, f)}" alt="Print ${esc(f)} do caso ${esc(caso.casoId)}"><span>${esc(f)}</span></a>`)
        .join('')}</div>`,
    );
  }
  const ligacoes = [`<a href="${caminhoUrl(pasta, 'caso.log')}">caso.log</a>`, ...outros.map((f) => `<a href="${caminhoUrl(pasta, f)}">${esc(f)}</a>`)];
  partes.push(`<p class="suave">Ficheiros: ${ligacoes.join(' · ')}</p>`);
  return partes.join('\n');
}

function escreverHtml(pastaRun: string, run: EstadoRun): void {
  const totais = contar(run);
  const linhas = run.casos
    .map((caso) => {
      const estado = caso.estado === 'por-correr' ? 'Não correu' : caso.estado;
      return `<details class="caso e-${esc(caso.estado)}"${caso.estado === 'KO' || caso.estado === 'ERRO' ? ' open' : ''}>
<summary><span class="estado">${esc(estado)}</span><span class="id">${esc(caso.casoId)}</span><span class="nome">${esc(caso.casoNome ?? '')}</span><span class="suave">${esc(caso.jornadaNome)} · ${esc(duracao(caso.duracaoMs))}</span></summary>
<div class="detalhe">${htmlDoCaso(caso)}</div></details>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(run.id)}: ${esc(run.nome)}</title>
<style>
body{margin:0;padding:24px;font-family:"Segoe UI",system-ui,sans-serif;font-size:14px;color:#1c2230;background:#f4f5f7}
h1{margin:0 0 4px;font-size:22px}.suave{color:#667085}main{max-width:1100px;margin:0 auto}
.totais{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}.total{min-width:110px;padding:12px 16px;border-radius:10px;background:#fff;border:1px solid #e1e4ea}
.total b{display:block;font-size:24px}.t-OK b{color:#1a8f4c}.t-KO b{color:#c0392b}.t-ERRO b{color:#a86a00}
.caso{margin-bottom:8px;border:1px solid #e1e4ea;border-radius:8px;background:#fff}
summary{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:10px 14px;cursor:pointer}
.estado{min-width:64px;padding:2px 8px;border-radius:5px;background:#98a2b3;color:#fff;font-weight:700;font-size:12px;text-align:center}
.e-OK .estado{background:#1a8f4c}.e-KO .estado{background:#c0392b}.e-ERRO .estado{background:#e0a100}
.id{font-weight:700}.nome{flex:1;min-width:120px}.detalhe{padding:4px 14px 14px;border-top:1px solid #e1e4ea}
.sugestoes{margin:10px 0;padding:8px 12px;border-radius:8px;background:#eef4ff}.sugestoes ul{margin:4px 0 0 18px;padding:0}
.erro{margin:10px 0;padding:10px 12px;border-radius:8px;background:#fff4d9;line-height:1.6}
table.dif{width:100%;margin:10px 0;border-collapse:collapse}table.dif th,table.dif td{padding:6px 8px;border:1px solid #e1e4ea;text-align:left}
table.dif th{background:#fdecea}.passos{margin:10px 0;padding-left:28px;line-height:1.7}
.marca{display:inline-block;min-width:44px;font-size:11px;font-weight:700;color:#667085}.p-ko .marca{color:#c0392b}.p-erro .marca{color:#a86a00}.p-ok .marca{color:#1a8f4c}
.prints{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}.prints a{width:220px;color:#667085;font-size:12px;text-decoration:none}
.prints img{display:block;width:100%;height:140px;object-fit:cover;object-position:top;border:1px solid #e1e4ea;border-radius:6px}
a{color:#2457c8}
</style></head><body><main>
<h1>${esc(run.nome)}</h1>
<p class="suave">${esc(run.id)} · Ambiente ${esc(run.ambiente)} (${esc(run.tipoAmbiente)}) · ${esc(new Date(run.inicio).toLocaleString('pt-PT'))} · ${esc(
    run.opcoes.canal === 'msedge' ? 'Edge' : 'Chrome',
  )}, ${run.opcoes.visivel ? 'visível' : 'em background'}, ${run.opcoes.paralelo} em paralelo</p>
<div class="totais">
<div class="total"><b>${run.casos.length}</b>casos</div>
<div class="total t-OK"><b>${totais.OK}</b>OK</div>
<div class="total t-KO"><b>${totais.KO}</b>KO</div>
<div class="total t-ERRO"><b>${totais.ERRO}</b>ERRO</div>
</div>
${linhas}
<p class="suave">OK: tudo coincide. KO: chegou ao fim mas há valores diferentes. ERRO: não chegou ao fim.</p>
</main></body></html>
`;
  fs.writeFileSync(path.join(pastaRun, 'relatorio.html'), html, 'utf8');
}

export async function escreverRelatorios(pastaRun: string, run: EstadoRun): Promise<void> {
  escreverHtml(pastaRun, run);
  await escreverExcel(pastaRun, run);
}
