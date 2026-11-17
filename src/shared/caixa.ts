// Caixa de email de testes do projeto: um email base (por exemplo emailteste@outlook.com) e endereços
// automáticos por papel, caso e data (emailteste+supervisor_tc0001_13112026@outlook.com). Cada caso fica
// com o seu endereço, por isso os emails de casos diferentes (ou de execuções antigas) nunca se misturam.
import type { CaixaTestes } from './modelo.js';

export const FORMATO_POR_OMISSAO = '{nome}+{papel}_{caso}_{data}@{dominio}';

/** Ligações à Microsoft (Outlook pessoal e Microsoft 365). */
export const MICROSOFT = {
  api: 'https://graph.microsoft.com/v1.0',
  ambito: 'offline_access Mail.Read',
  /** Endereço de regresso dos clientes "nativos" registados no Microsoft Entra (é apanhado pela ferramenta). */
  redirectUri: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
  urls(tenant: string): { autorizacao: string; token: string; dispositivo: string } {
    const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant || 'common')}/oauth2/v2.0`;
    return { autorizacao: `${base}/authorize`, token: `${base}/token`, dispositivo: `${base}/devicecode` };
  },
};

const limpar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');

/** O email base é um endereço válido? */
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * O endereço de teste de um papel neste caso: aplica o formato ({nome}, {dominio}, {papel}, {caso},
 * {run}, {data} = ddMMyyyy) e deixa só caracteres válidos num endereço.
 */
export function enderecoDeTeste(caixa: Pick<CaixaTestes, 'emailBase' | 'formato'>, papel: string, contexto: { caso: string; run: string; agora: Date }): string {
  const base = caixa.emailBase.trim();
  if (!emailValido(base)) throw new Error(`O email base da caixa de testes ("${base}") não é um endereço válido.`);
  const [nome, dominio] = base.split('@');
  const d = contexto.agora;
  const data = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
  const valores: Record<string, string> = { nome, dominio, papel: limpar(papel) || 'teste', caso: limpar(contexto.caso), run: limpar(contexto.run), data };
  const formato = caixa.formato?.trim() || FORMATO_POR_OMISSAO;
  const endereco = formato.replace(/\{(nome|dominio|papel|caso|run|data)\}/g, (_, k: string) => valores[k]);
  const [local, dom] = endereco.split('@');
  // O domínio vem sempre do email base (o formato só decide a parte antes do @, se não tiver {dominio}).
  const limpo = `${(local ?? '').replace(/[^A-Za-z0-9._+-]/g, '')}@${(dom || dominio).trim().toLowerCase()}`;
  if (!emailValido(limpo)) throw new Error(`O formato "${formato}" não dá um endereço válido (deu "${limpo}").`);
  return limpo;
}

/** Os endereços são "da mesma caixa" se a parte antes do + e o domínio forem iguais. */
export function mesmaCaixa(endereco: string, base: string): boolean {
  const [a, da] = endereco.toLowerCase().split('@');
  const [b, db] = base.toLowerCase().split('@');
  return da === db && a.split('+')[0] === b.split('+')[0];
}
