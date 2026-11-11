// Pacotes de blocos: levar blocos de um projeto para outro (ou partilhar com a equipa) num só ficheiro.
// O pacote leva os blocos escolhidos e as aplicações e perfis de autenticação que eles usam.
// Nunca leva segredos (esses nunca estão nos perfis: ficam no cofre de cada PC).
import type { Aplicacao, Bloco, PerfilAutenticacao } from './modelo';

export const FORMATO_PACOTE = 'uat-studio-pacote';

export interface Pacote {
  formato: typeof FORMATO_PACOTE;
  versao: 1;
  criadoEm: string;
  /** Nome do projeto de onde veio (só para informação). */
  origem?: string;
  blocos: Bloco[];
  aplicacoes: Aplicacao[];
  perfis: PerfilAutenticacao[];
}

export class ErroPacote extends Error {}

/** Junta os blocos escolhidos e o que eles usam (aplicações e perfis). */
export function criarPacote(blocoIds: string[], blocos: Bloco[], aplicacoes: Aplicacao[], perfis: PerfilAutenticacao[], origem?: string): Pacote {
  const escolhidos = blocos.filter((b) => blocoIds.includes(b.id));
  if (escolhidos.length === 0) throw new ErroPacote('Escolhe pelo menos um bloco.');
  const idsAplicacoes = new Set(escolhidos.map((b) => b.aplicacaoId).filter((id): id is string => Boolean(id)));
  const idsPerfis = new Set(escolhidos.map((b) => b.pedido?.perfilId).filter((id): id is string => Boolean(id)));
  return {
    formato: FORMATO_PACOTE,
    versao: 1,
    criadoEm: new Date().toISOString(),
    ...(origem ? { origem } : {}),
    blocos: escolhidos,
    aplicacoes: aplicacoes.filter((a) => idsAplicacoes.has(a.id)),
    perfis: perfis.filter((p) => idsPerfis.has(p.id)),
  };
}

/** Lê e valida o conteúdo de um ficheiro de pacote. */
export function lerPacote(texto: string): Pacote {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new ErroPacote('O ficheiro não é um pacote do UAT Studio (não é JSON).');
  }
  const p = dados as Partial<Pacote>;
  if (p?.formato !== FORMATO_PACOTE || !Array.isArray(p.blocos)) throw new ErroPacote('O ficheiro não é um pacote de blocos do UAT Studio.');
  if (p.versao !== 1) throw new ErroPacote(`Este pacote é de uma versão mais recente do UAT Studio (versão ${String(p.versao)}).`);
  const valido = (b: Partial<Bloco>): boolean => typeof b?.id === 'string' && typeof b.nome === 'string' && typeof b.tipo === 'string' && Array.isArray(b.passos);
  if (!p.blocos.every(valido)) throw new ErroPacote('O pacote tem blocos incompletos.');
  return { formato: FORMATO_PACOTE, versao: 1, criadoEm: String(p.criadoEm ?? ''), ...(p.origem ? { origem: String(p.origem) } : {}), blocos: p.blocos, aplicacoes: Array.isArray(p.aplicacoes) ? p.aplicacoes : [], perfis: Array.isArray(p.perfis) ? p.perfis : [] };
}

/** O que fazer com um bloco que já existe no projeto (mesmo id). */
export type Conflito = 'substituir' | 'copia' | 'saltar';

export interface ItemImportacao {
  bloco: Bloco;
  /** Já existe um bloco com o mesmo id? E é igual? */
  estado: 'novo' | 'igual' | 'diferente';
}

/** O que acontece a cada bloco do pacote neste projeto. */
export function planearImportacao(pacote: Pacote, existentes: Bloco[]): ItemImportacao[] {
  const porId = new Map(existentes.map((b) => [b.id, b]));
  return pacote.blocos.map((bloco) => {
    const atual = porId.get(bloco.id);
    return { bloco, estado: !atual ? 'novo' : JSON.stringify(atual) === JSON.stringify(bloco) ? 'igual' : 'diferente' };
  });
}

export interface ResultadoImportacao {
  /** Blocos a gravar (sem id = criar um novo, com nome de cópia). */
  blocos: Array<Bloco | Omit<Bloco, 'id'>>;
  /** Aplicações e perfis que ainda não existem no projeto (os que existem ficam como estão). */
  aplicacoes: Aplicacao[];
  perfis: PerfilAutenticacao[];
  saltados: number;
}

/**
 * Decide o que gravar: blocos novos entram; iguais não mudam; diferentes seguem a escolha
 * (substituir, criar uma cópia "(importado)" ou saltar). Aplicações e perfis só entram se faltarem.
 */
export function aplicarImportacao(pacote: Pacote, existentes: { blocos: Bloco[]; aplicacoes: Aplicacao[]; perfis: PerfilAutenticacao[] }, conflito: Conflito): ResultadoImportacao {
  const resultado: ResultadoImportacao = { blocos: [], aplicacoes: [], perfis: [], saltados: 0 };
  for (const item of planearImportacao(pacote, existentes.blocos)) {
    if (item.estado === 'novo') resultado.blocos.push(item.bloco);
    else if (item.estado === 'igual' || conflito === 'saltar') resultado.saltados++;
    else if (conflito === 'substituir') resultado.blocos.push(item.bloco);
    else {
      const { id: _id, ...resto } = item.bloco;
      void _id;
      resultado.blocos.push({ ...resto, nome: `${item.bloco.nome} (importado)` });
    }
  }
  const temAplicacao = new Set(existentes.aplicacoes.map((a) => a.id));
  const temPerfil = new Set(existentes.perfis.map((p) => p.id));
  resultado.aplicacoes = pacote.aplicacoes.filter((a) => !temAplicacao.has(a.id));
  resultado.perfis = pacote.perfis.filter((p) => !temPerfil.has(p.id));
  return resultado;
}
