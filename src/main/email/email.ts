// Blocos de email: esperar que chegue um email à caixa de testes (Microsoft Graph ou compatível),
// verificar o conteúdo e extrair valores (por exemplo, o código de MFA ou um link) para variáveis.
// Usa o motor dos blocos de API (autenticação, rede do Windows, segredos mascarados). Sem Electron.
import type { Bloco, PerfilAutenticacao } from '../../shared/modelo';
import { AmbienteApi, ErroApi, executarBlocoApi } from '../api/pedidos';

export interface EmailRecebido {
  de: string;
  para: string[];
  assunto: string;
  recebido: string;
  /** Corpo sem etiquetas HTML (para verificar e extrair). */
  texto: string;
  html: string;
}

export interface ResultadoEmail {
  email: EmailRecebido;
  /** Quantas vezes se consultou a caixa até o email aparecer. */
  tentativas: number;
  verificacoes: Array<{ descricao: string; ok: boolean; esperado: string; obtido: string }>;
  guardadas: Record<string, string>;
}

export interface PedidoEmail {
  bloco: Bloco;
  /** Endereço base da API de email (o da aplicação do bloco no ambiente ativo). */
  urlBase?: string;
  perfil?: PerfilAutenticacao;
  /** Troca as {variáveis} pelos dados do caso. */
  preencher(texto: string): string;
  /** Só contam emails chegados depois deste momento (o início do caso). */
  desde: number;
  devePararAgora?(): boolean;
  /** Intervalo entre consultas à caixa (por omissão, 3 segundos). */
  intervaloMs?: number;
}

/** HTML → texto simples (etiquetas fora, entidades básicas traduzidas, espaços compactados). */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

interface MensagemGraph {
  subject?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  body?: { contentType?: string; content?: string };
}

function paraEmail(m: MensagemGraph): EmailRecebido {
  const html = m.body?.content ?? '';
  return {
    de: m.from?.emailAddress?.address ?? '',
    para: (m.toRecipients ?? []).map((r) => r.emailAddress?.address ?? '').filter(Boolean),
    assunto: m.subject ?? '',
    recebido: m.receivedDateTime ?? '',
    texto: m.body?.contentType === 'text' ? html : htmlParaTexto(html),
    html,
  };
}

/** Espera pelo email, verifica-o e extrai os valores pedidos. */
export async function lerEmail(pedido: PedidoEmail, amb: AmbienteApi): Promise<ResultadoEmail> {
  const def = pedido.bloco.email;
  if (!def?.caixa.trim()) throw new ErroApi(`O bloco de email "${pedido.bloco.nome}" não diz que caixa de correio ler.`);
  const caixa = pedido.preencher(def.caixa).trim();
  const para = pedido.preencher(def.para ?? '').trim().toLowerCase();
  const assunto = pedido.preencher(def.assunto ?? '').trim().toLowerCase();
  const esperaMs = Math.max(1, def.esperaSeg ?? 60) * 1000;
  // Tolerância de 2 minutos para relógios desacertados entre o PC e o servidor de email.
  const desde = pedido.desde - 120_000;
  // O pedido à caixa é um bloco de API "invisível": a mesma autenticação, rede e mascaramento de segredos.
  const consulta: Bloco = {
    id: `${pedido.bloco.id}-caixa`,
    nome: pedido.bloco.nome,
    tipo: 'API',
    passos: [],
    pedido: {
      metodo: 'GET',
      url: `/users/${encodeURIComponent(caixa)}/messages`,
      parametros: [
        { nome: '$top', valor: '25' },
        { nome: '$orderby', valor: 'receivedDateTime desc' },
      ],
      cabecalhos: [],
      tipoCorpo: 'nenhum',
      corpo: '',
      ...(def.perfilId ? { perfilId: def.perfilId } : {}),
      verificacoes: [],
      guardar: [],
    },
  };
  const fim = Date.now() + esperaMs;
  let tentativas = 0;
  let encontrado: EmailRecebido | undefined;
  for (;;) {
    tentativas += 1;
    const resposta = await executarBlocoApi({ bloco: consulta, urlBase: pedido.urlBase, perfil: pedido.perfil, preencher: (t) => t }, amb);
    if (resposta.resposta.estado !== 200) throw new ErroApi(`A caixa de correio ${caixa} respondeu HTTP ${resposta.resposta.estado}.`);
    let mensagens: MensagemGraph[] = [];
    try {
      mensagens = (JSON.parse(resposta.resposta.corpo) as { value?: MensagemGraph[] }).value ?? [];
    } catch {
      throw new ErroApi(`A caixa de correio ${caixa} não respondeu em JSON (é uma API ao estilo do Microsoft Graph?).`);
    }
    encontrado = mensagens
      .map(paraEmail)
      .filter((m) => !m.recebido || Date.parse(m.recebido) >= desde)
      .find((m) => (!para || m.para.some((p) => p.toLowerCase().includes(para))) && (!assunto || m.assunto.toLowerCase().includes(assunto)));
    if (encontrado || Date.now() >= fim || pedido.devePararAgora?.()) break;
    await new Promise((r) => setTimeout(r, pedido.intervaloMs ?? 3_000));
  }
  if (!encontrado) {
    const filtros = [para && `para "${para}"`, assunto && `com o assunto "${assunto}"`].filter(Boolean).join(' e ');
    throw new ErroApi(`O email não chegou em ${Math.round(esperaMs / 1000)} s à caixa ${caixa}${filtros ? ` (${filtros})` : ''}.`);
  }

  const verificacoes = (def.corpoContem ?? [])
    .map((t) => pedido.preencher(t).trim())
    .filter(Boolean)
    .map((t) => {
      const ok = encontrado.texto.includes(t) || encontrado.html.includes(t);
      return { descricao: `O corpo contém "${t}"`, ok, esperado: `contém "${t}"`, obtido: ok ? `contém "${t}"` : encontrado.texto.slice(0, 200) };
    });

  const guardadas: Record<string, string> = {};
  for (const e of def.extrair ?? []) {
    if (!e.variavel.trim() || !e.padrao.trim()) continue;
    let expressao: RegExp;
    try {
      // A expressão não leva {variáveis}: as chavetas são dela (por exemplo \d{6}).
      expressao = new RegExp(e.padrao);
    } catch {
      throw new ErroApi(`A expressão "${e.padrao}" para guardar {${e.variavel}} não é válida.`);
    }
    const m = expressao.exec(e.de === 'assunto' ? encontrado.assunto : encontrado.texto);
    if (!m) throw new ErroApi(`Não encontrei "${e.padrao}" no ${e.de === 'assunto' ? 'assunto' : 'corpo'} do email, para guardar {${e.variavel}}.`);
    guardadas[e.variavel.trim()] = (m[1] ?? m[0]).trim();
  }
  return { email: encontrado, tentativas, verificacoes, guardadas };
}
