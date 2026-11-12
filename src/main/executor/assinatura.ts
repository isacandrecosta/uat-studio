// Relatório de UAT para assinatura (PDF): resumo da execução por jornada e requisito, resultado de
// cada caso e o espaço para a decisão e as assinaturas. Aqui só se monta o HTML (sem Electron);
// o PDF é feito em ipc.ts com o printToPDF do Electron.
import type { EstadoRun, JornadaDoRun } from '../../shared/modelo';
import { resumoDoCaso } from './relatorios';

const esc = (texto: string): string => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface InfoAssinatura {
  projeto: string;
  /** Jornadas atuais do projeto (para execuções antigas sem fotografia, ou sem ID do requisito). */
  jornadas?: Array<Pick<JornadaDoRun, 'id' | 'nome' | 'requisitoId'>>;
}

export function htmlParaAssinatura(run: EstadoRun, info: InfoAssinatura): string {
  const data = (iso?: string): string => (iso ? new Date(iso).toLocaleString('pt-PT') : '');
  const conta = (estado: string, casos = run.casos): number => casos.filter((c) => c.estado === estado).length;
  const requisito = (jornadaId: string): string =>
    run.jornadas?.find((j) => j.id === jornadaId)?.requisitoId ?? info.jornadas?.find((j) => j.id === jornadaId)?.requisitoId ?? '';
  const jornadas = [...new Map(run.casos.map((c) => [c.jornadaId, c.jornadaNome])).entries()];
  const total = run.casos.length;
  const resultadoGeral = conta('ERRO') > 0 || conta('KO') > 0 ? 'Com falhas' : conta('OK') === total ? 'Tudo OK' : 'Incompleto';

  const linhasJornadas = jornadas
    .map(([id, nome]) => {
      const casos = run.casos.filter((c) => c.jornadaId === id);
      return `<tr><td>${esc(requisito(id)) || '—'}</td><td>${esc(nome)}</td><td class="n">${casos.length}</td><td class="n ok">${conta('OK', casos)}</td><td class="n ko">${conta('KO', casos)}</td><td class="n erro">${conta('ERRO', casos)}</td><td class="n">${casos.length - conta('OK', casos) - conta('KO', casos) - conta('ERRO', casos)}</td></tr>`;
    })
    .join('');

  const detalhe = jornadas
    .map(([id, nome]) => {
      const casos = run.casos.filter((c) => c.jornadaId === id);
      const linhas = casos
        .map((c) => {
          const nota = c.estado === 'OK' ? '' : resumoDoCaso(c).split('\n')[0] || (c.estado === 'SALTADO' ? 'Saltado' : c.estado === 'PARADO' ? 'Parado' : '');
          return `<tr><td>${esc(c.casoId)}</td><td>${esc(c.casoNome ?? '')}</td><td><span class="estado e-${esc(c.estado)}">${esc(c.estado)}</span></td><td>${esc(nota)}</td></tr>`;
        })
        .join('');
      const req = requisito(id);
      return `<h3>${esc(nome)}${req ? ` <span class="req">${esc(req)}</span>` : ''}</h3><table><thead><tr><th>Caso</th><th>Descrição</th><th>Resultado</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table>`;
    })
    .join('');

  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Relatório de UAT ${esc(run.id)}</title>
<style>
@page { size: A4; margin: 16mm 14mm; }
body { font-family: "Segoe UI", Arial, sans-serif; color: #1c2230; font-size: 10.5pt; }
h1 { font-size: 18pt; margin: 0 0 4px; } h2 { font-size: 13pt; margin: 18px 0 6px; border-bottom: 1px solid #ccd; padding-bottom: 3px; }
h3 { font-size: 11pt; margin: 14px 0 4px; } .req { font-size: 9pt; font-weight: 600; color: #2457c8; border: 1px solid #c9daf8; border-radius: 8px; padding: 0 6px; }
.suave { color: #667085; } table { width: 100%; border-collapse: collapse; margin-top: 4px; page-break-inside: auto; }
th, td { border: 1px solid #d5d9e0; padding: 4px 6px; text-align: left; vertical-align: top; } th { background: #f1f3f7; font-size: 9.5pt; }
tr { page-break-inside: avoid; } td.n { text-align: right; width: 44px; } .ok { color: #1a8f4c; } .ko { color: #c0392b; } .erro { color: #a86a00; }
.dados td:first-child { width: 32%; font-weight: 600; background: #fafbfc; }
.estado { font-weight: 700; font-size: 9pt; } .e-OK { color: #1a8f4c; } .e-KO { color: #c0392b; } .e-ERRO { color: #a86a00; }
.geral { font-size: 12pt; font-weight: 700; }
.decisao { margin-top: 10px; } .decisao span { display: inline-block; margin-right: 26px; } .caixa { display: inline-block; width: 12px; height: 12px; border: 1.5px solid #1c2230; margin-right: 6px; vertical-align: -2px; }
.observacoes { border: 1px solid #d5d9e0; height: 70px; margin-top: 6px; }
.assinaturas { display: flex; gap: 24px; margin-top: 28px; page-break-inside: avoid; } .assinaturas div { flex: 1; }
.linha { border-bottom: 1px solid #1c2230; height: 40px; } .legenda { font-size: 9pt; color: #667085; margin-top: 3px; }
</style></head><body>
<h1>Relatório de UAT</h1>
<p class="suave">Gerado pelo UAT Studio em ${esc(new Date().toLocaleString('pt-PT'))}</p>
<h2>Execução</h2>
<table class="dados"><tbody>
<tr><td>Projeto</td><td>${esc(info.projeto)}</td></tr>
<tr><td>Execução</td><td>${esc(run.id)} · ${esc(run.nome)}</td></tr>
<tr><td>Ambiente</td><td>${esc(run.ambiente)} (${esc(run.tipoAmbiente)})</td></tr>
<tr><td>Início e fim</td><td>${esc(data(run.inicio))}${run.fim ? ` — ${esc(data(run.fim))}` : ''}</td></tr>
<tr><td>Executado por</td><td>${esc(run.utilizador ?? '—')}</td></tr>
<tr><td>Resultado</td><td><span class="geral">${resultadoGeral}</span> · ${total} casos: <span class="ok">${conta('OK')} OK</span>, <span class="ko">${conta('KO')} KO</span>, <span class="erro">${conta('ERRO')} ERRO</span>${total - conta('OK') - conta('KO') - conta('ERRO') > 0 ? `, ${total - conta('OK') - conta('KO') - conta('ERRO')} não corridos` : ''}</td></tr>
</tbody></table>
<h2>Resumo por requisito e cenário</h2>
<table><thead><tr><th>Requisito</th><th>Cenário</th><th>Casos</th><th>OK</th><th>KO</th><th>ERRO</th><th>Outros</th></tr></thead><tbody>${linhasJornadas}</tbody></table>
<h2>Resultado dos casos</h2>
<p class="suave">OK: tudo coincide. KO: chegou ao fim mas um valor difere. ERRO: não chegou ao fim. As evidências (prints, logs e trace) estão na pasta da execução.</p>
${detalhe}
<h2>Decisão</h2>
<div class="decisao"><span><span class="caixa"></span>Aceite</span><span><span class="caixa"></span>Aceite com reservas</span><span><span class="caixa"></span>Recusado</span></div>
<p class="legenda">Observações</p><div class="observacoes"></div>
<div class="assinaturas">
<div><div class="linha"></div><div class="legenda">Testador (nome e assinatura)</div></div>
<div><div class="linha"></div><div class="legenda">Responsável de negócio (nome e assinatura)</div></div>
<div><div class="linha"></div><div class="legenda">Data</div></div>
</div>
</body></html>`;
}
