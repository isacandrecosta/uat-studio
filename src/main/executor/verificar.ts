// Verificação antes de correr: procura o que vai impedir (ou atrapalhar) uma execução,
// para o utilizador saber antes de esperar por ela. Não abre o browser.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validarFormula } from '../../shared/formulas';
import {
  AmbitoRun,
  Aplicacao,
  Bloco,
  PerfilAutenticacao,
  Problema,
  ResultadoVerificacao,
  SEGREDOS_DO_PERFIL,
  Valor,
} from '../../shared/modelo';
import { variaveisDaJornada } from '../../shared/variaveis';
import * as repo from '../projeto/repositorio';
import { planear } from './execucao';

export interface OpcoesVerificar {
  /** Diz que segredos estão preenchidos no cofre. */
  segredosPreenchidos(nomes: string[]): Record<string, boolean>;
  /** Para testar se os endereços respondem. Sem isto, esse teste não é feito. */
  fetch?: typeof fetch;
}

const formulaDe = (valor: Valor | undefined): string | null => (valor?.tipo === 'formula' ? valor.expressao : valor?.tipo === 'gerador' ? valor.gerador : null);

/** Problemas de um bloco que não dependem da jornada (fórmulas mal escritas, passos sem elemento...). */
function problemasDoBloco(bloco: Bloco, perfis: Map<string, PerfilAutenticacao>): string[] {
  const problemas: string[] = [];
  if (bloco.tipo === 'UI') {
    if (bloco.passos.length === 0) problemas.push('não tem passos gravados');
    for (const passo of bloco.passos) {
      const formulas = [formulaDe(passo.valor), passo.condicao?.trim() || null, formulaDe(passo.alvo?.linha?.valor)];
      for (const formula of formulas) {
        const erro = formula ? validarFormula(formula) : null;
        if (erro) problemas.push(`o passo "${passo.descricao}" tem uma fórmula com erro: ${erro}`);
      }
      if ((passo.acao === 'simular' || passo.acao === 'intercetar') && !passo.rede?.url.trim()) problemas.push(`o passo "${passo.descricao}" não diz que pedidos apanhar`);
      if (!['navegar', 'esperar', 'simular', 'intercetar'].includes(passo.acao) && (passo.alvo?.localizadores.length ?? 0) === 0) {
        problemas.push(`o passo "${passo.descricao}" não tem elemento gravado`);
      }
      if (passo.acao === 'guardar' && !passo.variavel) problemas.push(`o passo "${passo.descricao}" não diz em que variável guardar`);
    }
  } else if (bloco.tipo === 'API') {
    const pedido = bloco.pedido;
    if (!pedido) problemas.push('não tem um pedido definido');
    else {
      if (pedido.perfilId && !perfis.has(pedido.perfilId)) problemas.push(`usa o perfil de autenticação "${pedido.perfilId}", que já não existe`);
      if (pedido.verificacoes.length === 0 && pedido.guardar.length === 0) problemas.push('não verifica nem guarda nada da resposta');
      for (const g of pedido.guardar) if (!g.variavel.trim() || !g.caminho.trim()) problemas.push('tem uma linha de "guardar da resposta" incompleta');
    }
  } else if (bloco.tipo === 'EMAIL') {
    if (!bloco.email?.caixa.trim()) problemas.push('não diz que caixa de correio ler');
    if (bloco.email?.perfilId && !perfis.has(bloco.email.perfilId)) problemas.push(`usa o perfil de autenticação "${bloco.email.perfilId}", que já não existe`);
    for (const e of bloco.email?.extrair ?? []) {
      try {
        new RegExp(e.padrao);
      } catch {
        problemas.push(`a expressão para guardar {${e.variavel}} não é válida`);
      }
    }
  } else if (bloco.tipo === 'MANUAL') {
    if (!bloco.manual?.instrucao.trim()) problemas.push('não tem instrução para o testador');
  } else {
    problemas.push(`é do tipo ${bloco.tipo}, que ainda não é suportado`);
  }
  return problemas;
}

/** Corre todas as verificações para o que foi escolhido. */
export async function verificarAntesDeCorrer(pasta: string, ambito: AmbitoRun, opcoes: OpcoesVerificar): Promise<ResultadoVerificacao> {
  const problemas: Problema[] = [];
  const juntar = (gravidade: Problema['gravidade'], onde: string, mensagem: string): void => {
    if (!problemas.some((p) => p.onde === onde && p.mensagem === mensagem)) problemas.push({ gravidade, onde, mensagem });
  };

  const projeto = repo.lerProjeto(pasta);
  const ambiente = projeto.ambientes.find((a) => a.id === projeto.ambienteAtivo);
  const { itens } = planear(pasta, ambito);
  if (!ambiente) {
    juntar('erro', 'Projeto', 'Não há um ambiente ativo.');
    return { casos: itens.length, problemas };
  }
  if (ambiente.tipo === 'PRD') juntar('aviso', 'Ambiente', `O ambiente ativo (${ambiente.nome}) é de PRODUÇÃO: vai ser pedida uma confirmação antes de correr.`);
  if (itens.length === 0) juntar('erro', 'Escolha', 'Não há casos para correr com esta escolha.');

  const blocos = new Map(repo.listar(pasta, 'blocos').map((b) => [b.id, b]));
  const aplicacoes = new Map<string, Aplicacao>(repo.listar(pasta, 'aplicacoes').map((a) => [a.id, a]));
  const perfis = new Map(repo.listar(pasta, 'perfis').map((p) => [p.id, p]));
  const conjuntos = new Map(repo.listar(pasta, 'casos').map((c) => [c.id, c]));
  const calculadas = repo.lerVariaveis(pasta);

  for (const variavel of calculadas) {
    const erro = validarFormula(variavel.formula);
    if (erro) juntar('erro', `Variável calculada {${variavel.nome}}`, `A fórmula tem um erro: ${erro}`);
  }

  const jornadas = new Map(itens.map((i) => [i.jornada.id, i.jornada]));
  const blocosUsados = new Map<string, Bloco>();
  for (const jornada of jornadas.values()) {
    const onde = `Jornada "${jornada.nome}"`;
    if (jornada.blocos.length === 0) juntar('erro', onde, 'Não tem blocos.');
    const variaveis = variaveisDaJornada(jornada, [...blocos.values()], calculadas);
    for (const id of variaveis.blocosEmFalta) juntar('erro', onde, `Usa o bloco "${id}", que já não existe.`);
    const colunas = new Set(conjuntos.get(jornada.id)?.colunas ?? []);
    const emFalta = variaveis.necessarias.filter((nome) => !colunas.has(nome) && nome !== 'TESTE' && nome !== 'RUN');
    if (emFalta.length > 0) {
      juntar('erro', onde, `${emFalta.length === 1 ? 'Falta a coluna' : 'Faltam as colunas'} ${emFalta.map((n) => `"${n}"`).join(', ')} nos casos.`);
    }
    for (const item of jornada.blocos) {
      const bloco = blocos.get(item.blocoId);
      if (!bloco) continue;
      blocosUsados.set(bloco.id, bloco);
      const erroCondicao = item.condicao?.trim() ? validarFormula(item.condicao) : null;
      if (erroCondicao) juntar('erro', onde, `A condição do bloco "${bloco.nome}" tem um erro: ${erroCondicao}`);
      for (const troca of Object.values(item.parametros ?? {})) {
        const formula = formulaDe(troca);
        const erro = formula ? validarFormula(formula) : null;
        if (erro) juntar('erro', onde, `Um parâmetro do bloco "${bloco.nome}" tem uma fórmula com erro: ${erro}`);
      }
    }
    // Dois casos com o mesmo ID baralham as evidências.
    const ids = (conjuntos.get(jornada.id)?.casos ?? []).map((c) => c.id);
    const repetidos = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (repetidos.length > 0) juntar('erro', onde, `Há casos com o mesmo ID: ${repetidos.join(', ')}.`);
  }

  const perfisUsados = new Map<string, PerfilAutenticacao>();
  const aplicacoesUsadas = new Map<string, Aplicacao>();
  for (const bloco of blocosUsados.values()) {
    const onde = `Bloco "${bloco.nome}"`;
    for (const texto of problemasDoBloco(bloco, perfis)) {
      juntar(texto.startsWith('não verifica') ? 'aviso' : 'erro', onde, `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`);
    }
    const idPerfil = bloco.pedido?.perfilId ?? bloco.email?.perfilId;
    const perfil = idPerfil ? perfis.get(idPerfil) : undefined;
    if (perfil) perfisUsados.set(perfil.id, perfil);
    const enderecoCompleto = bloco.tipo === 'API' && /^https?:\/\//i.test(bloco.pedido?.url.trim() ?? '');
    const precisaDeEndereco = bloco.tipo === 'API' ? !enderecoCompleto : bloco.tipo === 'EMAIL' ? true : bloco.passos.some((p) => p.acao === 'navegar');
    const aplicacao = bloco.aplicacaoId ? aplicacoes.get(bloco.aplicacaoId) : undefined;
    if (!aplicacao) {
      if (precisaDeEndereco) juntar('erro', onde, 'Não está ligado a nenhuma aplicação (ou a aplicação foi apagada).');
    } else if (!aplicacao.urls[ambiente.id]?.trim()) {
      if (precisaDeEndereco) juntar('erro', `Aplicação "${aplicacao.nome}"`, `Não tem endereço no ambiente ${ambiente.nome}.`);
    } else {
      aplicacoesUsadas.set(aplicacao.id, aplicacao);
    }
  }

  // Segredos por preencher no cofre deste PC.
  for (const perfil of perfisUsados.values()) {
    const campos = SEGREDOS_DO_PERFIL[perfil.tipo];
    const preenchidos = opcoes.segredosPreenchidos(campos.map((c) => `${perfil.id}.${c.campo}`));
    const emFalta = campos.filter((c) => !c.opcional && !preenchidos[`${perfil.id}.${c.campo}`]);
    if (emFalta.length > 0) {
      juntar('erro', `Perfil de autenticação "${perfil.nome}"`, `Falta preencher neste PC: ${emFalta.map((c) => c.rotulo).join(', ')} (ecrã Blocos de API).`);
    }
    const eOAuth = perfil.tipo === 'oauth2-cliente' || perfil.tipo === 'oauth2-password' || perfil.tipo === 'oauth2-pkce';
    if (eOAuth && (!perfil.urlToken?.trim() || !perfil.clientId?.trim())) {
      juntar('erro', `Perfil de autenticação "${perfil.nome}"`, 'Falta o endereço do token ou o client ID.');
    }
    // mTLS: os ficheiros do certificado têm de existir neste PC.
    for (const [ficheiro, oQue] of [
      [perfil.certificado?.ficheiro, 'o certificado de cliente'],
      [perfil.certificado?.ca, 'o ficheiro da autoridade (CA)'],
    ] as const) {
      if (!ficheiro?.trim()) continue;
      const caminho = path.isAbsolute(ficheiro) ? ficheiro : path.join(pasta, ficheiro);
      if (!fs.existsSync(caminho)) juntar('erro', `Perfil de autenticação "${perfil.nome}"`, `Não encontro ${oQue}: ${caminho}`);
    }
    if (perfil.tipo === 'mtls' && !perfil.certificado?.ficheiro?.trim()) juntar('erro', `Perfil de autenticação "${perfil.nome}"`, 'Falta escolher o certificado de cliente.');
    if (perfil.tipo === 'oauth2-pkce') {
      if (!perfil.urlAutorizacao?.trim()) juntar('erro', `Perfil de autenticação "${perfil.nome}"`, 'Falta o endereço da página de login (autorização).');
      else juntar('aviso', `Perfil de autenticação "${perfil.nome}"`, 'Usa login no browser: se não houver sessão guardada neste PC, abre-se o Edge para entrar (uma vez por execução).');
    }
  }

  // Os endereços respondem? (qualquer resposta do servidor conta, mesmo um erro 401 ou 404.)
  const buscar = opcoes.fetch;
  if (buscar) {
    await Promise.all(
      [...aplicacoesUsadas.values()].map(async (aplicacao) => {
        const url = aplicacao.urls[ambiente.id];
        try {
          await buscar(url, { method: 'GET', signal: AbortSignal.timeout(10_000) });
        } catch (erro) {
          const texto = erro instanceof Error ? `${erro.name} ${erro.message} ${String((erro as { cause?: unknown }).cause ?? '')}` : String(erro);
          const motivo = /Timeout|aborted/i.test(texto)
            ? 'não respondeu em 10 segundos'
            : /CERT|SSL/i.test(texto)
              ? 'tem um problema de certificados'
              : /REFUSED/i.test(texto)
                ? 'recusou a ligação'
                : /NOT_RESOLVED|ENOTFOUND|DISCONNECTED/i.test(texto)
                  ? 'não foi encontrado (o endereço está certo? há rede?)'
                  : 'não está acessível';
          juntar('erro', `Aplicação "${aplicacao.nome}"`, `O endereço ${url} ${motivo}.`);
        }
      }),
    );
  }

  problemas.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === 'erro' ? -1 : 1));
  return { casos: itens.length, problemas };
}
