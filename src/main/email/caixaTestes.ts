// A caixa de email de testes do projeto vista como um "perfil" OAuth 2.0 interno: a ferramenta entra com o
// login escolhido (janela, Edge ou código) e lê a caixa pelo Microsoft Graph (ou por uma caixa simulada
// compatível). Sem Electron (testável). A sessão (refresh token) fica no cofre como `caixa-de-testes.refreshToken`.
import { MICROSOFT } from '../../shared/caixa';
import type { CaixaTestes, PerfilAutenticacao } from '../../shared/modelo';

export const ID_PERFIL_CAIXA = 'caixa-de-testes';
export const SESSAO_CAIXA = `${ID_PERFIL_CAIXA}.refreshToken`;
/** IMAP (Gmail): a palavra-passe de aplicação, no cofre deste PC. */
export const SENHA_CAIXA = `${ID_PERFIL_CAIXA}.password`;

/** O Gmail por IMAP (com palavra-passe de aplicação). */
export const GMAIL_IMAP = { servidor: 'imap.gmail.com', porta: 993 };

/** A caixa lê-se por IMAP (Gmail ou outro servidor)? */
export function caixaPorImap(caixa: CaixaTestes): boolean {
  return caixa.ligacao === 'gmail' || caixa.ligacao === 'imap';
}

/** Servidor, porta e utilizador IMAP da caixa (sem a palavra-passe, que vem do cofre). */
export function imapDaCaixa(caixa: CaixaTestes): { servidor: string; porta: number; utilizador: string } {
  const utilizador = caixa.utilizadorImap?.trim() || caixa.emailBase.trim();
  if (caixa.ligacao === 'gmail') return { ...GMAIL_IMAP, utilizador: caixa.emailBase.trim() };
  return { servidor: caixa.servidorImap?.trim() ?? '', porta: caixa.portaImap || 993, utilizador };
}

/** O tenant da Microsoft: contas pessoais → consumers; empresa → o tenant indicado ou "organizations". */
export function tenantDaCaixa(caixa: CaixaTestes): string {
  if (caixa.conta === 'pessoal') return 'consumers';
  return caixa.tenant?.trim() || 'organizations';
}

/** O perfil de autenticação usado para ler a caixa (nunca é gravado na pasta do projeto). */
export function perfilDaCaixa(caixa: CaixaTestes): PerfilAutenticacao {
  const base = { id: ID_PERFIL_CAIXA, nome: 'Caixa de email de testes', tipo: 'oauth2-pkce' as const, modoLogin: caixa.modoLogin, clientId: caixa.clientId?.trim() ?? '' };
  if (caixa.ligacao === 'microsoft') {
    const urls = MICROSOFT.urls(tenantDaCaixa(caixa));
    return { ...base, urlAutorizacao: urls.autorizacao, urlToken: urls.token, urlDispositivo: urls.dispositivo, redirectUri: MICROSOFT.redirectUri, ambito: MICROSOFT.ambito };
  }
  return {
    ...base,
    clientId: base.clientId || 'uat-publico',
    urlAutorizacao: caixa.urlAutorizacao?.trim() ?? '',
    urlToken: caixa.urlToken?.trim() ?? '',
    urlDispositivo: caixa.urlDispositivo?.trim() ?? '',
    ambito: 'Mail.Read',
  };
}

/** Endereço base da API de email e caminho das mensagens. */
export function apiDaCaixa(caixa: CaixaTestes): { urlBase: string; caminho: string } {
  if (caixa.ligacao === 'microsoft') return { urlBase: MICROSOFT.api, caminho: '/me/messages' };
  return { urlBase: (caixa.urlApi ?? '').replace(/\/+$/, ''), caminho: `/users/${encodeURIComponent(caixa.emailBase.trim())}/messages` };
}

/** O que falta preencher para a caixa funcionar (vazio = está completa). */
export function problemasDaCaixa(caixa: CaixaTestes | undefined): string[] {
  if (!caixa) return ['falta definir a caixa de email de testes'];
  const falta: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(caixa.emailBase?.trim() ?? '')) falta.push('o email base não é um endereço válido');
  if (caixa.ligacao === 'microsoft' && !caixa.clientId?.trim()) falta.push('falta o Client ID da aplicação registada na Microsoft (pedir à IT)');
  if (caixa.ligacao === 'imap' && !caixa.servidorImap?.trim()) falta.push('falta o endereço do servidor IMAP');
  if (caixa.ligacao === 'simulada') {
    if (!caixa.urlApi?.trim()) falta.push('falta o endereço da API da caixa simulada');
    if (caixa.modoLogin === 'codigo' ? !caixa.urlDispositivo?.trim() : !caixa.urlAutorizacao?.trim()) falta.push('falta o endereço do login da caixa simulada');
    if (!caixa.urlToken?.trim()) falta.push('falta o endereço do token da caixa simulada');
  }
  return falta;
}
