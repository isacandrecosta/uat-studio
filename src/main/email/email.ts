// Blocos de email: esperar que chegue um email à caixa de testes (Microsoft Graph ou compatível),
// verificar o conteúdo e extrair valores (por exemplo, o código de MFA ou um link) para variáveis.
// Usa o motor dos blocos de API (autenticação, rede do Windows, segredos mascarados). Sem Electron.
import type { Bloco, CaixaTestes, PerfilAutenticacao } from '../../shared/modelo';
import { compararComTolerancia, deInteiro, formatar, lerNumero } from '../../shared/decimal';
import { AmbienteApi, ErroApi, executarBlocoApi } from '../api/pedidos';
import { apiDaCaixa, caixaPorImap, imapDaCaixa, perfilDaCaixa, problemasDaCaixa, SENHA_CAIXA } from './caixaTestes';
import { abrirImap } from './imap';

export interface EmailRecebido {
  id?: string;
  temAnexos?: boolean;
  /** Nomes dos anexos (só lidos quando o bloco verifica anexos). */
  anexos?: string[];
  de: string;
  para: string[];
  assunto: string;
  recebido: string;
  /** Corpo sem etiquetas HTML (para verificar e extrair). */
  texto: string;
  html: string;
  /** Pasta onde estava, quando não é a caixa de entrada (por exemplo o spam, no IMAP). */
  pasta?: string;
}

/**
 * De onde vêm os emails: a API ao estilo do Microsoft Graph ou uma caixa IMAP. `listar` devolve os mais
 * recentes primeiro; no IMAP vêm sem corpo e `completar` descarrega o email escolhido (com os anexos).
 */
export interface FonteEmail {
  descricao: string;
  listar(): Promise<EmailRecebido[]>;
  completar?(email: EmailRecebido): Promise<EmailRecebido>;
  anexos?(email: EmailRecebido): Promise<string[]>;
  fechar?(): Promise<void>;
}

export interface ResultadoEmail {
  /** Vazio quando o bloco espera que NÃO chegue nenhum email (e não chegou). */
  email?: EmailRecebido;
  /** O endereço para onde o email devia ir (papel na caixa de testes), se houver. */
  endereco?: string;
  /** Link guardado e se é para o abrir no browser do caso. */
  link?: { variavel: string; url: string; abrir: boolean };
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
  /** A caixa de email de testes do projeto (usada quando o bloco tem um papel ou não diz que caixa ler). */
  caixaTestes?: CaixaTestes;
  /** Testes: uma fonte de emails já pronta (em vez de a abrir pela caixa). */
  fonte?: FonteEmail;
}

/** O bloco lê a caixa de testes do projeto? (tem um papel, ou não indica nenhuma caixa). */
export function usaCaixaDeTestes(bloco: Bloco): boolean {
  return Boolean(bloco.email?.papel?.trim() || !bloco.email?.caixa?.trim());
}

/** Os links (href) de um email, pela ordem em que aparecem; sem HTML, os endereços http(s) do texto. */
export function linksDoEmail(email: Pick<EmailRecebido, 'html' | 'texto'>): string[] {
  const links: string[] = [];
  for (const m of email.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) links.push(m[1].replace(/&amp;/g, '&'));
  for (const m of email.texto.matchAll(/https?:\/\/[^\s"'<>]+/g)) links.push(m[0]);
  return [...new Set(links.filter((l) => /^https?:\/\//i.test(l)))];
}

/** O número que aparece a seguir a um rótulo (por exemplo "Montante:" → "1.234,56 €"). */
export function valorDepoisDe(texto: string, rotulo: string): string | null {
  const i = texto.toLowerCase().indexOf(rotulo.toLowerCase());
  if (i < 0) return null;
  const m = /[-−]?\d[\d.,\s]*\d|[-−]?\d/.exec(texto.slice(i + rotulo.length, i + rotulo.length + 80));
  return m ? m[0].trim() : null;
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
  id?: string;
  hasAttachments?: boolean;
  subject?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  body?: { contentType?: string; content?: string };
}

function paraEmail(m: MensagemGraph): EmailRecebido {
  const html = m.body?.content ?? '';
  return {
    ...(m.id ? { id: m.id } : {}),
    ...(m.hasAttachments !== undefined ? { temAnexos: m.hasAttachments } : {}),
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
  if (!def) throw new ErroApi(`O bloco de email "${pedido.bloco.nome}" não tem definição.`);
  const daCaixaDeTestes = usaCaixaDeTestes(pedido.bloco);
  if (daCaixaDeTestes && !pedido.fonte) {
    const falta = problemasDaCaixa(pedido.caixaTestes);
    if (falta.length || !pedido.caixaTestes) throw new ErroApi(`A caixa de email de testes do projeto não está pronta: ${falta.join('; ')}.`);
  }
  const caixa = daCaixaDeTestes ? (pedido.caixaTestes?.emailBase.trim() ?? '') : pedido.preencher(def.caixa).trim();
  const fonte = pedido.fonte ?? (await abrirFonte(pedido, daCaixaDeTestes, amb));
  try {
    return await lerDaFonte(pedido, def, fonte, caixa);
  } finally {
    await fonte.fechar?.();
  }
}

/** A fonte dos emails do bloco: a caixa de testes (Graph ou IMAP) ou a caixa da aplicação do bloco. */
async function abrirFonte(pedido: PedidoEmail, daCaixaDeTestes: boolean, amb: AmbienteApi): Promise<FonteEmail> {
  const def = pedido.bloco.email!;
  if (daCaixaDeTestes && pedido.caixaTestes && caixaPorImap(pedido.caixaTestes)) {
    const ligacao = imapDaCaixa(pedido.caixaTestes);
    const password = amb.segredo(SENHA_CAIXA);
    if (!password) throw new ErroApi('Falta a palavra-passe da caixa de email de testes neste PC (Dados de teste › Caixa de email de testes › Palavra-passe).');
    try {
      return await abrirImap({ ...ligacao, password });
    } catch (erro) {
      throw new ErroApi(erro instanceof Error ? erro.message : String(erro));
    }
  }
  let urlBase = pedido.urlBase;
  let perfil = pedido.perfil;
  let caminho: string;
  let caixa: string;
  if (daCaixaDeTestes && pedido.caixaTestes) {
    const api = apiDaCaixa(pedido.caixaTestes);
    urlBase = api.urlBase;
    caminho = api.caminho;
    perfil = perfilDaCaixa(pedido.caixaTestes);
    caixa = pedido.caixaTestes.emailBase.trim();
  } else {
    caixa = pedido.preencher(def.caixa).trim();
    caminho = `/users/${encodeURIComponent(caixa)}/messages`;
  }
  // O pedido à caixa é um bloco de API "invisível": a mesma autenticação, rede e mascaramento de segredos.
  const consulta: Bloco = {
    id: `${pedido.bloco.id}-caixa`,
    nome: pedido.bloco.nome,
    tipo: 'API',
    passos: [],
    pedido: {
      metodo: 'GET',
      url: caminho,
      parametros: [
        { nome: '$top', valor: '25' },
        { nome: '$orderby', valor: 'receivedDateTime desc' },
      ],
      cabecalhos: [],
      tipoCorpo: 'nenhum',
      corpo: '',
      ...(daCaixaDeTestes ? {} : def.perfilId ? { perfilId: def.perfilId } : {}),
      verificacoes: [],
      guardar: [],
    },
  };
  return {
    descricao: caixa,
    async listar() {
      const resposta = await executarBlocoApi({ bloco: consulta, urlBase, perfil, preencher: (t) => t }, amb);
      if (resposta.resposta.estado !== 200) throw new ErroApi(`A caixa de correio ${caixa} respondeu HTTP ${resposta.resposta.estado}.`);
      try {
        return ((JSON.parse(resposta.resposta.corpo) as { value?: MensagemGraph[] }).value ?? []).map(paraEmail);
      } catch {
        throw new ErroApi(`A caixa de correio ${caixa} não respondeu em JSON (é uma API ao estilo do Microsoft Graph?).`);
      }
    },
    async anexos(email) {
      if (!email.id) return [];
      const url = `${caminho}/${encodeURIComponent(email.id)}/attachments`;
      const pedidoAnexos: Bloco = { ...consulta, id: `${consulta.id}-anexos`, pedido: { ...consulta.pedido!, url, parametros: [] } };
      const r = await executarBlocoApi({ bloco: pedidoAnexos, urlBase, perfil, preencher: (t) => t }, amb);
      if (r.resposta.estado !== 200) throw new ErroApi(`Não foi possível ler os anexos do email (HTTP ${r.resposta.estado}).`);
      try {
        return ((JSON.parse(r.resposta.corpo) as { value?: Array<{ name?: string }> }).value ?? []).map((a) => a.name ?? '').filter(Boolean);
      } catch {
        throw new ErroApi('A lista de anexos do email não veio em JSON.');
      }
    },
  };
}

async function lerDaFonte(pedido: PedidoEmail, def: NonNullable<Bloco['email']>, fonte: FonteEmail, caixa: string): Promise<ResultadoEmail> {
  // Com papel, o endereço de teste é exato (emailteste+gestor_tc0001_13112026@...): nunca apanha outro caso.
  const endereco = def.papel?.trim() ? pedido.preencher(`{EMAIL:${def.papel.trim()}}`).trim().toLowerCase() : '';
  const para = pedido.preencher(def.para ?? '').trim().toLowerCase();
  const assuntoIgual = pedido.preencher(def.assuntoIgual ?? '').trim();
  const assunto = pedido.preencher(def.assunto ?? '').trim().toLowerCase();
  const esperaMs = Math.max(1, def.esperaSeg ?? 60) * 1000;
  // Contam os emails chegados depois do início do caso, com uma margem (por omissão 2 minutos, para relógios
  // desacertados; mais, quando o email é enviado antes do caso começar, por exemplo à mão ou por outro sistema).
  const desde = pedido.desde - Math.max(0, def.antesMin ?? 2) * 60_000;
  const fim = Date.now() + esperaMs;
  let tentativas = 0;
  let encontrado: EmailRecebido | undefined;
  for (;;) {
    tentativas += 1;
    const mensagens = await fonte.listar();
    encontrado = mensagens
      .filter((m) => !m.recebido || Date.parse(m.recebido) >= desde)
      .find(
        (m) =>
          (!endereco || m.para.some((p) => p.toLowerCase() === endereco)) &&
          (!para || m.para.some((p) => p.toLowerCase().includes(para))) &&
          (!assunto || m.assunto.toLowerCase().includes(assunto)),
      );
    if (encontrado || Date.now() >= fim || pedido.devePararAgora?.()) break;
    await new Promise((r) => setTimeout(r, pedido.intervaloMs ?? 3_000));
  }
  if (encontrado && fonte.completar) encontrado = await fonte.completar(encontrado);
  const filtros = [endereco && `para ${endereco}`, para && `para "${para}"`, assunto && `com o assunto "${assunto}"`].filter(Boolean).join(' e ');
  if (def.naoDeveChegar) {
    // Aqui esperou o tempo todo: chegar é que é a diferença.
    const verificacoes = [
      {
        descricao: 'Não deve chegar nenhum email',
        ok: !encontrado,
        esperado: 'nenhum email',
        obtido: encontrado ? `chegou "${encontrado.assunto}" de ${encontrado.de}` : 'nenhum email',
      },
    ];
    return { ...(encontrado ? { email: encontrado } : {}), ...(endereco ? { endereco } : {}), tentativas, verificacoes, guardadas: {} };
  }
  if (!encontrado) {
    throw new ErroApi(`O email não chegou em ${Math.round(esperaMs / 1000)} s à caixa ${caixa}${filtros ? ` (${filtros})` : ''}.`);
  }

  const verificacoes: ResultadoEmail['verificacoes'] = [];
  if (assuntoIgual) {
    const ok = encontrado.assunto.trim() === assuntoIgual;
    verificacoes.push({ descricao: `O assunto é "${assuntoIgual}"`, ok, esperado: assuntoIgual, obtido: encontrado.assunto });
  }
  verificacoes.push(...(def.corpoContem ?? [])
    .map((t) => pedido.preencher(t).trim())
    .filter(Boolean)
    .map((t) => {
      const ok = encontrado.texto.includes(t) || encontrado.html.includes(t);
      return { descricao: `O corpo contém "${t}"`, ok, esperado: `contém "${t}"`, obtido: ok ? `contém "${t}"` : encontrado.texto.slice(0, 200) };
    }));

  // Valores: o número a seguir ao rótulo, comparado em decimal exato (com tolerância, se houver).
  for (const v of def.valores ?? []) {
    const rotulo = pedido.preencher(v.rotulo).trim();
    const esperadoTexto = pedido.preencher(v.esperado).trim();
    if (!rotulo || !esperadoTexto) continue;
    const descricao = `Valor "${rotulo}"`;
    const lido = valorDepoisDe(encontrado.texto, rotulo);
    const esperado = lerNumero(esperadoTexto);
    const obtido = lido === null ? null : lerNumero(lido);
    if (!esperado) throw new ErroApi(`O valor esperado "${esperadoTexto}" para "${rotulo}" não é um número.`);
    if (!obtido) {
      verificacoes.push({ descricao, ok: false, esperado: esperadoTexto, obtido: '(não encontrei o número a seguir ao rótulo)' });
      continue;
    }
    const tolerancia = lerNumero(pedido.preencher(v.tolerancia ?? '').trim() || '0') ?? deInteiro(0);
    const c = compararComTolerancia(esperado, obtido, tolerancia);
    verificacoes.push({ descricao, ok: c.igual, esperado: formatar(esperado), obtido: c.igual ? formatar(obtido) : `${formatar(obtido)} (diferença ${c.diferenca})` });
  }

  // Anexos: lidos só se o bloco os verificar.
  const anexosPedidos = (def.anexos ?? []).map((a) => pedido.preencher(a).trim()).filter(Boolean);
  if (anexosPedidos.length) {
    const nomes = encontrado.anexos ?? (fonte.anexos ? await fonte.anexos(encontrado) : []);
    encontrado.anexos = nomes;
    for (const a of anexosPedidos) {
      const ok = nomes.some((n) => n.toLowerCase().includes(a.toLowerCase()));
      verificacoes.push({ descricao: `Tem o anexo "${a}"`, ok, esperado: a, obtido: ok ? a : nomes.length ? nomes.join(', ') : '(sem anexos)' });
    }
  }

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
  let link: ResultadoEmail['link'];
  if (def.link?.variavel.trim()) {
    const contem = pedido.preencher(def.link.contem ?? '').trim();
    const url = linksDoEmail(encontrado).find((l) => !contem || l.includes(contem));
    if (!url) throw new ErroApi(`Não encontrei nenhum link no email${contem ? ` que contenha "${contem}"` : ''}, para guardar {${def.link.variavel.trim()}}.`);
    guardadas[def.link.variavel.trim()] = url;
    link = { variavel: def.link.variavel.trim(), url, abrir: Boolean(def.link.abrir) };
  }
  return { email: encontrado, ...(endereco ? { endereco } : {}), ...(link ? { link } : {}), tentativas, verificacoes, guardadas };
}
