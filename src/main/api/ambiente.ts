// Liga o motor de API ao Electron: pedidos pela rede do Windows (proxy e certificados) e segredos do cofre.
import { avaliarFormula, contextoDeExemplo, ErroFormula, preencherTexto } from '../../shared/formulas';
import { Bloco, ResultadoApi } from '../../shared/modelo';
import { lerSegredo } from '../cofre';
import * as repo from '../projeto/repositorio';
import { AmbienteApi, ErroApi, executarBlocoApi } from './pedidos';

export function criarAmbienteApi(pasta: string): AmbienteApi {
  return {
    // O Electron só é carregado aqui, para este módulo poder ser importado em testes sem Electron.
    fetch: ((entrada: Parameters<typeof fetch>[0], opcoes?: Parameters<typeof fetch>[1]) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { net } = require('electron') as typeof import('electron');
      return net.fetch(entrada as string, opcoes as RequestInit);
    }) as typeof fetch,
    segredo: (nome) => lerSegredo(pasta, nome),
    tokens: new Map(),
  };
}

/**
 * "Testar" no ecrã Blocos de API: executa o bloco sozinho, com os dados de um caso de exemplo.
 * Não gasta contadores. O bloco pode ainda não estar guardado.
 */
export async function testarBloco(pasta: string, bloco: Bloco, chaveCaso: string | undefined): Promise<ResultadoApi> {
  const projeto = repo.lerProjeto(pasta);
  const ambiente = projeto.ambientes.find((a) => a.id === projeto.ambienteAtivo);
  if (!ambiente) throw new ErroApi('O projeto não tem um ambiente ativo.');
  if (ambiente.tipo === 'PRD') throw new ErroApi('O ambiente ativo é de PRODUÇÃO: o teste individual está bloqueado.');
  const pedido = bloco.pedido;
  if (!pedido) throw new ErroApi('O bloco não tem um pedido definido.');

  const [jornadaId, casoId] = (chaveCaso ?? '').split('/');
  const caso = jornadaId && repo.existe(pasta, 'casos', jornadaId) ? repo.ler(pasta, 'casos', jornadaId).casos.find((c) => c.id === casoId) : undefined;
  const dados: Record<string, string> = { ...(caso?.dados ?? {}), TESTE: caso?.id ?? 'TESTE', RUN: 'teste' };
  const calculadas = repo.lerVariaveis(pasta);
  const base = contextoDeExemplo(dados, repo.lerContadores(pasta));
  const emCurso: string[] = [];
  const procurar = (nome: string): string | undefined => {
    if (nome in dados) return dados[nome];
    const formula = calculadas.find((v) => v.nome === nome)?.formula;
    if (formula === undefined || emCurso.includes(nome)) return undefined;
    emCurso.push(nome);
    try {
      dados[nome] = avaliarFormula(formula, { ...base, variavel: procurar });
      return dados[nome];
    } finally {
      emCurso.pop();
    }
  };

  const aplicacao = bloco.aplicacaoId && repo.existe(pasta, 'aplicacoes', bloco.aplicacaoId) ? repo.ler(pasta, 'aplicacoes', bloco.aplicacaoId) : undefined;
  const perfil = pedido.perfilId && repo.existe(pasta, 'perfis', pedido.perfilId) ? repo.ler(pasta, 'perfis', pedido.perfilId) : undefined;
  return executarBlocoApi(
    {
      bloco,
      urlBase: aplicacao?.urls[ambiente.id],
      perfil,
      preencher: (texto, proteger) => {
        try {
          return preencherTexto(texto, { ...base, variavel: procurar }, proteger);
        } catch (erro) {
          if (erro instanceof ErroFormula) throw new ErroApi(erro.message);
          throw erro;
        }
      },
    },
    criarAmbienteApi(pasta),
  );
}
