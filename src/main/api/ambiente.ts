// Liga o motor de API ao Electron: pedidos pela rede do Windows (proxy e certificados) e segredos do cofre.
import { avaliarFormula, contextoDeExemplo, ErroFormula, preencherTexto } from '../../shared/formulas';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Bloco, PerfilAutenticacao, ResultadoApi, SEGREDO_CERTIFICADO } from '../../shared/modelo';
import { criarFetchComCertificado } from './certificado';
import { definirSegredo, lerSegredo } from '../cofre';
import { loginNoBrowser } from './login';

import * as repo from '../projeto/repositorio';
import { AmbienteApi, ErroApi, executarBlocoApi } from './pedidos';

export function criarAmbienteApi(pasta: string): AmbienteApi {
  /** mTLS: um "fetch" por perfil, reutilizado só durante esta execução (lê a password do cofre uma vez). */
  const certificados = new Map<string, typeof fetch>();
  return {
    // O Electron só é carregado aqui, para este módulo poder ser importado em testes sem Electron.
    fetch: ((entrada: Parameters<typeof fetch>[0], opcoes?: Parameters<typeof fetch>[1]) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { net } = require('electron') as typeof import('electron');
      return net.fetch(entrada as string, opcoes as RequestInit);
    }) as typeof fetch,
    segredo: (nome) => lerSegredo(pasta, nome),
    // Sessão do login PKCE (refresh token): encriptada no cofre, nunca na pasta do projeto.
    guardarSegredo: (nome, valor) => definirSegredo(pasta, nome, valor ?? ''),
    // Login numa janela da própria ferramenta (página do fornecedor) ou no Edge. O Electron só é carregado aqui.
    loginInterativo: (pedido) => {
      if (pedido.modo !== 'janela') return loginNoBrowser(pedido);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { loginNaJanela } = require('./loginJanela') as typeof import('./loginJanela');
      return loginNaJanela(pedido);
    },
    mostrarCodigo: (aviso) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { mostrarCodigo } = require('./avisoCodigo') as typeof import('./avisoCodigo');
      return mostrarCodigo(aviso);
    },
    fetchComCertificado: (perfil) => fetchComCertificadoDoPerfil(pasta, perfil, certificados),
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
  const base = contextoDeExemplo(dados, repo.lerContadores(pasta), repo.lerProjeto(pasta).caixaTestes);
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

/** Caminho de um ficheiro do perfil: absoluto, ou relativo à pasta do projeto (para viajar com o projeto). */
export function caminhoDoProjeto(pasta: string, ficheiro: string): string {
  return path.isAbsolute(ficheiro) ? ficheiro : path.join(pasta, ficheiro);
}

/** mTLS: lê o certificado (e a autoridade, se houver) e a password do cofre. */
function fetchComCertificadoDoPerfil(pasta: string, perfil: PerfilAutenticacao, cache: Map<string, typeof fetch>): typeof fetch {
  const certificado = perfil.certificado;
  if (!certificado?.ficheiro) throw new ErroApi(`O perfil "${perfil.nome}" não tem certificado de cliente.`);
  const chave = `${perfil.id}|${certificado.ficheiro}|${certificado.ca ?? ''}`;
  const existente = cache.get(chave);
  if (existente) return existente;
  const ler = (ficheiro: string, oQue: string): Buffer => {
    const caminho = caminhoDoProjeto(pasta, ficheiro);
    if (!fs.existsSync(caminho)) throw new ErroApi(`O ${oQue} do perfil "${perfil.nome}" não existe: ${caminho}`);
    return fs.readFileSync(caminho);
  };
  const novo = criarFetchComCertificado({
    pfx: ler(certificado.ficheiro, 'certificado de cliente'),
    passphrase: lerSegredo(pasta, `${perfil.id}.${SEGREDO_CERTIFICADO.campo}`),
    ...(certificado.ca ? { ca: ler(certificado.ca, 'ficheiro da autoridade (CA)') } : {}),
  });
  cache.set(chave, novo);
  return novo;
}
