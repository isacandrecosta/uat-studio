// "Criar defeito": a partir de um caso KO ou ERRO, um texto pronto a colar na ferramenta de defeitos da
// equipa (Jira, Azure DevOps, ALM...) e a lista das evidências a anexar. Tudo por regras, sem IA e sem
// enviar nada: o texto é copiado e gravado em defeito.txt na pasta do caso.
import type { EstadoRun, ResultadoCaso } from './modelo.js';

export interface Defeito {
  titulo: string;
  texto: string;
  /** Evidências sugeridas, relativas à pasta do caso. */
  evidencias: string[];
}

export interface ContextoDefeito {
  projeto: string;
  descricaoJornada?: string;
  requisitoId?: string;
  /** Dados de entrada do caso (os segredos já vêm mascarados). */
  dados?: Record<string, string>;
  /** Endereço da aplicação no ambiente (se conhecido). */
  enderecos?: string[];
}

/** Colunas que nunca aparecem em claro num defeito (além das usadas em passos secretos). */
export const COLUNA_SENSIVEL = /pass|senha|secret|segredo|token|pin\b|chave|key/i;

const curto = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Escolhe as evidências mais úteis: o print do erro, os últimos prints, o trace, o log e os pedidos de API. */
export function evidenciasSugeridas(caso: ResultadoCaso): string[] {
  const todas = caso.evidencias ?? [];
  const prints = todas.filter((f) => /^\d+_.*\.png$/i.test(f) && !f.includes('_anexo')).sort();
  const lista = [
    ...todas.filter((f) => /^erro\.png$/i.test(f)),
    ...prints.slice(-3),
    ...todas.filter((f) => f.endsWith('.zip')),
    'caso.log',
    ...todas.filter((f) => f.startsWith('api/')).slice(-4),
    ...todas.filter((f) => f.startsWith('email/') || f.startsWith('downloads/') || f.includes('_anexo')),
  ];
  return [...new Set(lista)];
}

export function criarDefeito(run: EstadoRun, caso: ResultadoCaso, contexto: ContextoDefeito): Defeito {
  const primeira = caso.diferencas[0];
  const resumo =
    caso.estado === 'ERRO' && caso.erro
      ? `não chega ao fim em "${caso.erro.passo}": ${curto(caso.erro.mensagem, 90)}`
      : primeira
        ? `${primeira.passo}: esperado "${curto(primeira.esperado, 40)}", obtido "${curto(primeira.obtido, 40)}"${caso.diferencas.length > 1 ? ` (+${caso.diferencas.length - 1})` : ''}`
        : `resultado ${caso.estado}`;
  const titulo = `[${run.ambiente.toUpperCase()}] ${caso.jornadaNome} › ${caso.casoId}: ${resumo}`;

  const linhas: string[] = [];
  const secao = (nome: string): void => {
    linhas.push('', nome.toUpperCase(), '-'.repeat(nome.length));
  };
  linhas.push(`Resumo: ${caso.jornadaNome}, caso ${caso.casoId}${caso.casoNome ? ` (${caso.casoNome})` : ''} ${caso.estado === 'ERRO' ? 'deu ERRO (o teste não chegou ao fim)' : 'deu KO (chegou ao fim, mas há valores diferentes do esperado)'}.`);
  linhas.push(`Gravidade sugerida: ${caso.estado === 'ERRO' ? 'Alta (o fluxo fica bloqueado)' : 'Média (a confirmar pela equipa, conforme o impacto no negócio)'}.`);

  secao('Ambiente');
  linhas.push(`Projeto: ${contexto.projeto}`);
  linhas.push(`Ambiente: ${run.ambiente} (${run.tipoAmbiente})`);
  for (const e of contexto.enderecos ?? []) linhas.push(`Aplicação: ${e}`);
  linhas.push(`Browser: ${run.opcoes.canal === 'chrome' ? 'Google Chrome' : 'Microsoft Edge'}${run.opcoes.visivel ? '' : ' (em background)'}`);
  linhas.push(`Execução: ${run.nome} (${run.id}), ${new Date(run.inicio).toLocaleString('pt-PT')}${run.utilizador ? `, por ${run.utilizador}` : ''}`);
  if (contexto.requisitoId) linhas.push(`Requisito: ${contexto.requisitoId}`);

  if (contexto.descricaoJornada) {
    secao('Objetivo do teste');
    linhas.push(contexto.descricaoJornada);
  }

  const dados = Object.entries(contexto.dados ?? {}).filter(([, v]) => v !== '');
  if (dados.length) {
    secao('Dados de teste');
    for (const [k, v] of dados) linhas.push(`${k}: ${v}`);
  }

  secao('Passos para reproduzir');
  let n = 0;
  for (const p of caso.passos) {
    if (p.estado === 'ignorado') continue;
    n++;
    const marca = p.estado === 'erro' ? '  <-- ERRO' : p.estado === 'ko' ? '  <-- KO' : '';
    linhas.push(`${n}. [${p.bloco}] ${p.descricao}${p.detalhe && p.estado !== 'ok' ? ` (${curto(p.detalhe, 160)})` : ''}${marca}`);
  }

  if (caso.diferencas.length) {
    secao('Resultado esperado vs obtido');
    for (const d of caso.diferencas) linhas.push(`- ${d.passo} [${d.bloco}]: esperado "${d.esperado}", obtido "${d.obtido}"${d.diferenca ? ` (diferença ${d.diferenca})` : ''}`);
  }
  if (caso.erro) {
    secao('Erro');
    linhas.push(`${caso.erro.mensagem}`);
    linhas.push(`Onde: ${caso.erro.bloco} › ${caso.erro.passo}`);
    if (caso.erro.porExecutar.length) linhas.push(`Ficou por executar: ${caso.erro.porExecutar.join(', ')}`);
  }
  if (caso.sugestoes?.length) {
    secao('Análise (sugestões automáticas, confirmar antes de enviar)');
    for (const s of caso.sugestoes) linhas.push(`- ${s}`);
  }

  const evidencias = evidenciasSugeridas(caso);
  secao('Evidências (pasta do caso)');
  if (run.pasta && caso.pasta) linhas.push(`execucoes/${run.pasta}/${caso.pasta}/`);
  for (const e of evidencias) linhas.push(`- ${e}`);

  return { titulo, texto: linhas.join('\n').trim(), evidencias };
}
