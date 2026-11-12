// "Criar defeito" no lado principal: junta o caso (do histórico), os dados de entrada (com os segredos
// mascarados), a descrição e o requisito da jornada e os endereços da aplicação, e grava defeito.txt.
import * as fs from 'node:fs';
import { COLUNA_SENSIVEL, criarDefeito, Defeito } from '../../shared/defeito';
import * as repo from '../projeto/repositorio';
import { caminhoNaExecucao, listarHistorico } from './execucao';

/** Colunas que alimentam passos secretos (passwords) nesta jornada: nunca saem em claro. */
function colunasSecretas(pasta: string, jornadaId: string): Set<string> {
  const secretas = new Set<string>();
  if (!repo.existe(pasta, 'jornadas', jornadaId)) return secretas;
  const jornada = repo.ler(pasta, 'jornadas', jornadaId);
  for (const item of jornada.blocos) {
    if (!repo.existe(pasta, 'blocos', item.blocoId)) continue;
    const bloco = repo.ler(pasta, 'blocos', item.blocoId);
    for (const passo of bloco.passos) {
      if (!passo.secreto || passo.valor?.tipo !== 'variavel') continue;
      const nome = passo.valor.nome;
      const mapeado = item.parametros?.[nome];
      secretas.add(mapeado?.tipo === 'variavel' ? mapeado.nome : nome);
    }
  }
  return secretas;
}

export function defeitoDoCaso(pasta: string, pastaRun: string, chave: string): Defeito & { ficheiro: string } {
  const run = listarHistorico(pasta).find((r) => r.pasta === pastaRun);
  const caso = run?.casos.find((c) => c.chave === chave);
  if (!run || !caso) throw new repo.ErroProjeto('Esse caso já não está no histórico.');
  if (caso.estado !== 'KO' && caso.estado !== 'ERRO') throw new repo.ErroProjeto('Só se cria um defeito a partir de um caso KO ou ERRO.');
  const jornada = repo.existe(pasta, 'jornadas', caso.jornadaId) ? repo.ler(pasta, 'jornadas', caso.jornadaId) : undefined;
  const conjunto = repo.existe(pasta, 'casos', caso.jornadaId) ? repo.ler(pasta, 'casos', caso.jornadaId) : undefined;
  const secretas = colunasSecretas(pasta, caso.jornadaId);
  const dadosOriginais = conjunto?.casos.find((c) => c.id === caso.casoId)?.dados ?? {};
  const dados = Object.fromEntries(Object.entries(dadosOriginais).map(([k, v]) => [k, secretas.has(k) || COLUNA_SENSIVEL.test(k) ? '***' : v]));
  const enderecos = [
    ...new Set(
      (jornada?.blocos ?? [])
        .map((b) => (repo.existe(pasta, 'blocos', b.blocoId) ? repo.ler(pasta, 'blocos', b.blocoId).aplicacaoId : undefined))
        .filter((id): id is string => Boolean(id) && repo.existe(pasta, 'aplicacoes', id as string))
        .map((id) => repo.ler(pasta, 'aplicacoes', id).urls[run.ambiente])
        .filter((u): u is string => Boolean(u)),
    ),
  ];
  const defeito = criarDefeito(run, caso, {
    projeto: repo.lerProjeto(pasta).nome,
    descricaoJornada: jornada?.descricao,
    requisitoId: jornada?.requisitoId,
    dados,
    enderecos,
  });
  const ficheiro = caminhoNaExecucao(pasta, pastaRun, caso.pasta ?? '', 'defeito.txt');
  return { ...defeito, ficheiro };
}

/** Grava o texto do defeito (já revisto pelo testador) na pasta do caso. */
export function guardarDefeito(pasta: string, pastaRun: string, chave: string, titulo: string, texto: string): string {
  const { ficheiro } = defeitoDoCaso(pasta, pastaRun, chave);
  fs.writeFileSync(ficheiro, `${titulo.trim()}\n\n${texto.trim()}\n`, 'utf8');
  return ficheiro;
}

/** Os defeitos criados numa execução (os casos com defeito.txt): chave do caso e título. */
export function defeitosDaExecucao(pasta: string, pastaRun: string): Array<{ chave: string; casoId: string; titulo: string; pastaCaso: string }> {
  const run = listarHistorico(pasta).find((r) => r.pasta === pastaRun);
  if (!run) return [];
  const lista: Array<{ chave: string; casoId: string; titulo: string; pastaCaso: string }> = [];
  for (const caso of run.casos) {
    if (!caso.pasta) continue;
    const ficheiro = caminhoNaExecucao(pasta, pastaRun, caso.pasta, 'defeito.txt');
    if (!fs.existsSync(ficheiro)) continue;
    const titulo = fs.readFileSync(ficheiro, 'utf8').split(/\r?\n/)[0]?.trim() ?? '';
    lista.push({ chave: caso.chave, casoId: caso.casoId, titulo, pastaCaso: caso.pasta });
  }
  return lista;
}
