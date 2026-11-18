// Caixa de email de testes: guardar a definição no projeto, "Ligar e testar" (login + ler a caixa) e esquecer
// a sessão. A password da caixa nunca passa pela ferramenta: o login é feito na página do fornecedor.
import { ipcMain } from 'electron';
import { emailValido, FORMATO_POR_OMISSAO } from '../../shared/caixa';
import type { Bloco, CaixaTestes, ModoLogin } from '../../shared/modelo';
import { criarAmbienteApi } from '../api/ambiente';
import { executarBlocoApi } from '../api/pedidos';
import { definirSegredo, segredosPreenchidos } from '../cofre';
import { pastaDoProjeto } from '../projeto/ipc';
import * as repo from '../projeto/repositorio';
import { apiDaCaixa, ID_PERFIL_CAIXA, perfilDaCaixa, problemasDaCaixa, SESSAO_CAIXA } from './caixaTestes';

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Limpa o que vem da interface: só os campos conhecidos, sem segredos. */
export function limparCaixa(dados: unknown): CaixaTestes {
  const d = (dados ?? {}) as Record<string, unknown>;
  const emailBase = texto(d.emailBase);
  if (!emailValido(emailBase)) throw new repo.ErroProjeto('O email base não é um endereço válido (por exemplo emailteste@outlook.com).');
  const ligacao: CaixaTestes['ligacao'] = d.ligacao === 'simulada' ? 'simulada' : 'microsoft';
  const modoLogin: ModoLogin = d.modoLogin === 'edge' || d.modoLogin === 'codigo' ? d.modoLogin : 'janela';
  const caixa: CaixaTestes = { emailBase, ligacao, modoLogin };
  const formato = texto(d.formato);
  if (formato && formato !== FORMATO_POR_OMISSAO) caixa.formato = formato;
  if (ligacao === 'microsoft') {
    caixa.conta = d.conta === 'empresa' ? 'empresa' : 'pessoal';
    if (texto(d.clientId)) caixa.clientId = texto(d.clientId);
    if (caixa.conta === 'empresa' && texto(d.tenant)) caixa.tenant = texto(d.tenant);
  } else if (ligacao === 'simulada') {
    for (const campo of ['clientId', 'urlApi', 'urlAutorizacao', 'urlToken', 'urlDispositivo'] as const) if (texto(d[campo])) caixa[campo] = texto(d[campo]);
  }
  return caixa;
}

export function registarIpcCaixa(): void {
  ipcMain.handle('caixa:gravar', (_e, dados: unknown) => {
    const pasta = pastaDoProjeto();
    const projeto = repo.lerProjeto(pasta);
    if (dados === null) delete projeto.caixaTestes;
    else {
      const nova = limparCaixa(dados);
      // Mudar a conta ou o login invalida a sessão guardada.
      const antiga = projeto.caixaTestes;
      if (antiga && (antiga.emailBase !== nova.emailBase || antiga.ligacao !== nova.ligacao || antiga.clientId !== nova.clientId || antiga.tenant !== nova.tenant)) definirSegredo(pasta, SESSAO_CAIXA, '');
      projeto.caixaTestes = nova;
    }
    repo.gravarProjeto(pasta, projeto);
    return repo.obterEstado(pasta);
  });

  /** Há sessão guardada neste PC? */
  ipcMain.handle('caixa:sessao', () => segredosPreenchidos(pastaDoProjeto(), [SESSAO_CAIXA])[SESSAO_CAIXA] === true);

  ipcMain.handle('caixa:esquecer', () => {
    const pasta = pastaDoProjeto();
    definirSegredo(pasta, SESSAO_CAIXA, '');
    // Palavra-passe IMAP de versões de desenvolvimento antigas (o Gmail por IMAP foi retirado).
    definirSegredo(pasta, `${ID_PERFIL_CAIXA}.password`, '');
  });

  /** Entra na caixa (com o login escolhido, se ainda não houver sessão) e lê os emails mais recentes. */
  ipcMain.handle('caixa:testar', async () => {
    const pasta = pastaDoProjeto();
    const caixa = repo.lerProjeto(pasta).caixaTestes;
    const falta = problemasDaCaixa(caixa);
    if (falta.length || !caixa) throw new repo.ErroProjeto(`A caixa ainda não está pronta: ${falta.join('; ')}.`);
    const api = apiDaCaixa(caixa);
    const consulta: Bloco = {
      id: 'caixa-de-testes-ligar',
      nome: 'Caixa de email de testes',
      tipo: 'API',
      passos: [],
      pedido: { metodo: 'GET', url: api.caminho, parametros: [{ nome: '$top', valor: '5' }, { nome: '$orderby', valor: 'receivedDateTime desc' }], cabecalhos: [], tipoCorpo: 'nenhum', corpo: '', verificacoes: [], guardar: [] },
    };
    const r = await executarBlocoApi({ bloco: consulta, urlBase: api.urlBase, perfil: perfilDaCaixa(caixa), preencher: (t) => t }, criarAmbienteApi(pasta));
    if (r.resposta.estado !== 200) throw new repo.ErroProjeto(`A caixa respondeu HTTP ${r.resposta.estado}. Confirme que a conta tem acesso de leitura ao correio (Mail.Read).`);
    let mensagens: Array<{ subject?: string; receivedDateTime?: string }> = [];
    try {
      mensagens = (JSON.parse(r.resposta.corpo) as { value?: typeof mensagens }).value ?? [];
    } catch {
      throw new repo.ErroProjeto('A caixa não respondeu em JSON.');
    }
    return { emails: mensagens.length, ultimo: mensagens[0]?.subject ?? '' };
  });
}
