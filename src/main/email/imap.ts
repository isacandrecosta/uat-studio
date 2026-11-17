// Ler a caixa de email de testes por IMAP (Gmail com palavra-passe de aplicação, ou outro servidor IMAP).
// Sem Electron (testável). A ligação é feita diretamente pelo Node (TLS na porta 993): NÃO usa o proxy do
// Windows. A palavra-passe vem do cofre e nunca é registada; os erros são explicados em português.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { EmailRecebido, FonteEmail } from './email';
import { htmlParaTexto } from './email';

export interface LigacaoImap {
  servidor: string;
  porta: number;
  utilizador: string;
  password: string;
}

/** Quantos emails (os mais recentes de cada pasta) se olham em cada consulta. */
const MAXIMO = 25;

/** Um erro do IMAP explicado para quem não é técnico (sem a palavra-passe). */
export function explicarErroImap(erro: unknown, ligacao: Pick<LigacaoImap, 'servidor' | 'porta' | 'utilizador'>): Error {
  const e = (erro ?? {}) as { authenticationFailed?: boolean; code?: string; message?: string; responseText?: string };
  const onde = `${ligacao.servidor}:${ligacao.porta}`;
  if (e.authenticationFailed) {
    return new Error(
      `O servidor de email recusou a entrada de ${ligacao.utilizador}. No Gmail, use uma palavra-passe de aplicação (16 letras, criada em myaccount.google.com/apppasswords), não a password normal da conta.`,
    );
  }
  switch (e.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return new Error(`Não encontrei o servidor de email ${ligacao.servidor} (sem internet, ou o nome está errado).`);
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'ECONNRESET':
    case 'ENETUNREACH':
    case 'EHOSTUNREACH':
    case 'NoConnection':
      return new Error(`Não foi possível ligar a ${onde}. A rede (firewall ou proxy da empresa) pode estar a bloquear o IMAP; esta ligação não usa o proxy do Windows.`);
    case 'CERT_HAS_EXPIRED':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      return new Error(`O certificado do servidor de email ${onde} não é de confiança (${e.code}).`);
    default:
      return new Error(`Erro ao ler a caixa por IMAP (${onde}): ${e.responseText || e.message || String(erro)}`);
  }
}

/** Abre a ligação à caixa (dá erro já se a palavra-passe ou o servidor estiverem mal). */
export async function abrirImap(ligacao: LigacaoImap): Promise<FonteEmail> {
  const cliente = new ImapFlow({
    host: ligacao.servidor,
    port: ligacao.porta,
    secure: true,
    auth: { user: ligacao.utilizador, pass: ligacao.password },
    logger: false,
    // Sem isto, o imapflow diz quem é ao servidor (nome e versão da biblioteca); não é preciso.
    clientInfo: { name: 'UAT Studio' },
  });
  // Um erro da ligação depois de aberta não pode derrubar a aplicação.
  cliente.on('error', () => undefined);
  try {
    await cliente.connect();
  } catch (erro) {
    throw explicarErroImap(erro, ligacao);
  }
  // Pastas a olhar: a caixa de entrada e o spam (os emails de teste vão muitas vezes parar ao spam).
  const pastas = ['INBOX'];
  try {
    const spam = (await cliente.list()).find((p) => p.specialUse === '\\Junk');
    if (spam) pastas.push(spam.path);
  } catch {
    // Sem lista de pastas, fica só a caixa de entrada.
  }
  const fontes = new Map<string, { pasta: string; uid: number }>();

  const comPasta = async <T>(pasta: string, fazer: () => Promise<T>): Promise<T> => {
    const tranca = await cliente.getMailboxLock(pasta, { readOnly: true });
    try {
      return await fazer();
    } finally {
      tranca.release();
    }
  };

  return {
    descricao: `${ligacao.utilizador} (IMAP)`,
    async listar(): Promise<EmailRecebido[]> {
      const todos: EmailRecebido[] = [];
      try {
        for (const pasta of pastas) {
          await comPasta(pasta, async () => {
            // SINCE só tem o dia: o filtro fino (minutos) é feito em lerEmail.
            const ontem = new Date(Date.now() - 24 * 3600_000);
            const uids = (await cliente.search({ since: ontem }, { uid: true })) || [];
            const ultimos = uids.slice(-MAXIMO);
            if (!ultimos.length) return;
            for await (const m of cliente.fetch(ultimos.join(','), { uid: true, envelope: true, internalDate: true }, { uid: true })) {
              const id = `${pasta}:${m.uid}`;
              fontes.set(id, { pasta, uid: m.uid });
              const data = m.internalDate ?? m.envelope?.date;
              todos.push({
                id,
                de: m.envelope?.from?.[0]?.address ?? '',
                para: [...(m.envelope?.to ?? []), ...(m.envelope?.cc ?? [])].map((a) => a.address ?? '').filter(Boolean),
                assunto: m.envelope?.subject ?? '',
                recebido: data ? new Date(data).toISOString() : '',
                texto: '',
                html: '',
                ...(pasta !== 'INBOX' ? { pasta } : {}),
              });
            }
          });
        }
      } catch (erro) {
        throw explicarErroImap(erro, ligacao);
      }
      return todos.sort((a, b) => Date.parse(b.recebido || '0') - Date.parse(a.recebido || '0'));
    },
    async completar(email: EmailRecebido): Promise<EmailRecebido> {
      const onde = email.id ? fontes.get(email.id) : undefined;
      if (!onde) return email;
      let fonte: Buffer | undefined;
      try {
        fonte = await comPasta(onde.pasta, async () => {
          const m = await cliente.fetchOne(String(onde.uid), { source: true }, { uid: true });
          return m ? m.source : undefined;
        });
      } catch (erro) {
        throw explicarErroImap(erro, ligacao);
      }
      if (!fonte) return email;
      const lido = await simpleParser(fonte);
      const html = typeof lido.html === 'string' ? lido.html : '';
      const anexos = lido.attachments.filter((a) => a.contentDisposition !== 'inline' || a.filename).map((a) => a.filename ?? '').filter(Boolean);
      return {
        ...email,
        temAnexos: anexos.length > 0,
        anexos,
        texto: (lido.text ?? '').trim() || htmlParaTexto(html),
        html: html || `<pre>${(lido.text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
      };
    },
    async fechar(): Promise<void> {
      try {
        await cliente.logout();
      } catch {
        cliente.close();
      }
    },
  };
}
