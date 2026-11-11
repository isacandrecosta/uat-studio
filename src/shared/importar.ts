// Importar pedidos de API de outras ferramentas: cURL, OpenAPI (JSON) e coleções do Postman (v2.1).
// Cada pedido importado vira um bloco de API. Sem dependências: corre nos dois lados.
import type { MetodoHttp, ParNomeValor, PedidoApi, TipoCorpo } from './modelo';

export interface PedidoImportado {
  nome: string;
  pedido: PedidoApi;
  /** Avisos (por exemplo, uma password que não foi importada e tem de ir para um perfil). */
  avisos: string[];
}

export class ErroImportar extends Error {}

const METODOS: MetodoHttp[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function metodoValido(texto: string | undefined, porOmissao: MetodoHttp): MetodoHttp {
  const m = (texto ?? '').toUpperCase() as MetodoHttp;
  return METODOS.includes(m) ? m : porOmissao;
}

function pedidoBase(): PedidoApi {
  return { metodo: 'GET', url: '', parametros: [], cabecalhos: [], tipoCorpo: 'nenhum', corpo: '', verificacoes: [{ id: 'v1', alvo: 'estado', operador: 'igual', esperado: '200' }], guardar: [] };
}

/** Tipo do corpo a partir do Content-Type (ou do próprio texto). */
function tipoDoCorpo(contentType: string | undefined, corpo: string): TipoCorpo {
  const ct = (contentType ?? '').toLowerCase();
  if (!corpo.trim()) return 'nenhum';
  if (ct.includes('json')) return 'json';
  if (ct.includes('xml')) return 'xml';
  if (ct.includes('x-www-form-urlencoded')) return 'formulario';
  const t = corpo.trim();
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  if (t.startsWith('<')) return 'xml';
  return 'texto';
}

/** Separa o endereço dos parâmetros da query (que ficam numa lista própria, editável). */
function separarQuery(url: string): { url: string; parametros: ParNomeValor[] } {
  const i = url.indexOf('?');
  if (i < 0) return { url, parametros: [] };
  const parametros = url
    .slice(i + 1)
    .split('&')
    .filter(Boolean)
    .map((par) => {
      const [nome, ...resto] = par.split('=');
      const decodificar = (t: string): string => {
        try {
          return decodeURIComponent(t.replace(/\+/g, ' '));
        } catch {
          return t;
        }
      };
      return { nome: decodificar(nome), valor: decodificar(resto.join('=')) };
    });
  return { url: url.slice(0, i), parametros };
}

/** Partes de uma linha de comandos (aspas simples, duplas, "\" de continuação e ^ do Windows). */
export function partirComando(texto: string): string[] {
  let limpo = texto.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ').replace(/`\r?\n/g, ' ');
  // "Copy as cURL (cmd)" do Chrome/Edge: ^" é uma aspa e ^X é o carácter X.
  if (limpo.includes('^"')) limpo = limpo.replace(/\^(.)/g, '$1');
  const partes: string[] = [];
  let atual = '';
  let temAtual = false;
  let aspa: '"' | "'" | null = null;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspa) {
      if (c === aspa) aspa = null;
      else if (c === '\\' && aspa === '"' && (limpo[i + 1] === '"' || limpo[i + 1] === '\\')) atual += limpo[++i];
      else atual += c;
    } else if (c === '"' || c === "'") {
      aspa = c;
      temAtual = true;
    } else if (/\s/.test(c)) {
      if (temAtual || atual) partes.push(atual);
      atual = '';
      temAtual = false;
    } else {
      atual += c;
    }
  }
  if (temAtual || atual) partes.push(atual);
  return partes;
}

/** Um comando cURL (copiado do browser, do Postman ou da documentação) → pedido. */
export function deCurl(texto: string): PedidoImportado {
  const partes = partirComando(texto.trim());
  if (!/^curl(\.exe)?$/i.test(partes[0] ?? '')) throw new ErroImportar('O texto tem de começar por "curl".');
  const pedido = pedidoBase();
  const avisos: string[] = [];
  let metodo: string | undefined;
  let url = '';
  const corpos: string[] = [];
  let contentType: string | undefined;
  let comoGet = false;
  for (let i = 1; i < partes.length; i++) {
    const p = partes[i];
    const seguinte = (): string => partes[++i] ?? '';
    if (p === '-X' || p === '--request') metodo = seguinte();
    else if (p === '-H' || p === '--header') {
      const linha = seguinte();
      const dois = linha.indexOf(':');
      if (dois < 0) continue;
      const nome = linha.slice(0, dois).trim();
      const valor = linha.slice(dois + 1).trim();
      if (/^content-type$/i.test(nome)) contentType = valor;
      if (/^authorization$/i.test(nome)) {
        avisos.push(`O cabeçalho Authorization foi importado como {Autorizacao}: use um perfil de autenticação (os segredos não ficam nos blocos).`);
        pedido.cabecalhos.push({ nome, valor: '{Autorizacao}' });
        continue;
      }
      if (/^(cookie|content-length|host|accept-encoding|connection)$/i.test(nome) || /^sec-/i.test(nome)) continue;
      pedido.cabecalhos.push({ nome, valor });
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode', '--json'].includes(p)) {
      const valor = seguinte();
      corpos.push(valor.startsWith('@') ? '' : valor);
      if (valor.startsWith('@')) avisos.push(`O corpo vinha do ficheiro ${valor.slice(1)}: cole o conteúdo no bloco.`);
      if (p === '--json') contentType = contentType ?? 'application/json';
      if (p === '--data-urlencode') contentType = contentType ?? 'application/x-www-form-urlencoded';
    } else if (p === '-u' || p === '--user') {
      const [utilizador] = seguinte().split(':');
      avisos.push(`A autenticação Basic (utilizador "${utilizador}") não foi importada: crie um perfil Basic e escolha-o no bloco.`);
    } else if (p === '-G' || p === '--get') comoGet = true;
    else if (p === '--url') url = seguinte();
    else if (['-A', '--user-agent', '-e', '--referer', '-b', '--cookie', '-o', '--output', '-m', '--max-time', '--connect-timeout', '-w', '--write-out', '--cert', '--key', '--cacert', '-E'].includes(p)) {
      seguinte();
    } else if (!p.startsWith('-') && !url) url = p;
  }
  if (!url) throw new ErroImportar('Não encontrei o endereço no comando cURL.');
  const corpo = corpos.join('&');
  const separado = separarQuery(url);
  pedido.url = separado.url;
  pedido.parametros = separado.parametros;
  if (comoGet && corpo) {
    pedido.parametros.push(...separarQuery(`?${corpo}`).parametros);
  } else if (corpo) {
    pedido.corpo = corpo;
    pedido.tipoCorpo = tipoDoCorpo(contentType, corpo);
    if (pedido.tipoCorpo === 'json') {
      try {
        pedido.corpo = JSON.stringify(JSON.parse(corpo), null, 2);
      } catch {
        // JSON com {variáveis} ou inválido: fica como veio.
      }
    }
  }
  pedido.metodo = metodoValido(metodo, comoGet ? 'GET' : corpo ? 'POST' : 'GET');
  // O Content-Type é posto pelo UAT Studio a partir do tipo do corpo.
  if (pedido.tipoCorpo !== 'nenhum' && pedido.tipoCorpo !== 'texto') pedido.cabecalhos = pedido.cabecalhos.filter((c) => !/^content-type$/i.test(c.nome));
  const caminho = pedido.url.replace(/^https?:\/\/[^/]+/i, '') || '/';
  return { nome: `${pedido.metodo} ${caminho}`.slice(0, 80), pedido, avisos };
}

// ---------- OpenAPI ----------

type Objeto = Record<string, unknown>;
const eObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Exemplo de corpo a partir do esquema (só o essencial: exemplos, tipos e propriedades). */
function exemploDoEsquema(esquema: unknown, raiz: Objeto, profundidade = 0): unknown {
  if (!eObjeto(esquema) || profundidade > 6) return null;
  if (typeof esquema.$ref === 'string') return exemploDoEsquema(resolverRef(esquema.$ref, raiz), raiz, profundidade + 1);
  if (esquema.example !== undefined) return esquema.example;
  if (Array.isArray(esquema.enum) && esquema.enum.length > 0) return esquema.enum[0];
  if (esquema.default !== undefined) return esquema.default;
  const tipo = esquema.type ?? (eObjeto(esquema.properties) ? 'object' : undefined);
  if (tipo === 'object' || eObjeto(esquema.properties)) {
    const resultado: Objeto = {};
    for (const [nome, prop] of Object.entries(eObjeto(esquema.properties) ? esquema.properties : {})) resultado[nome] = exemploDoEsquema(prop, raiz, profundidade + 1);
    return resultado;
  }
  if (tipo === 'array') return [exemploDoEsquema(esquema.items, raiz, profundidade + 1)];
  if (tipo === 'integer' || tipo === 'number') return 0;
  if (tipo === 'boolean') return false;
  if (tipo === 'string') return esquema.format === 'date' ? '2026-01-01' : esquema.format === 'date-time' ? '2026-01-01T00:00:00Z' : '';
  return null;
}

/** Uma especificação OpenAPI 3 ou Swagger 2 em JSON → um pedido por operação. */
export function deOpenApi(texto: string): PedidoImportado[] {
  let doc: unknown;
  try {
    doc = JSON.parse(texto);
  } catch {
    throw new ErroImportar('O ficheiro OpenAPI tem de estar em JSON (se estiver em YAML, converta-o para JSON primeiro).');
  }
  if (!eObjeto(doc) || !eObjeto(doc.paths) || (!doc.openapi && !doc.swagger)) throw new ErroImportar('Isto não parece uma especificação OpenAPI (falta "openapi"/"swagger" ou "paths").');
  const raiz = doc;
  const prefixo = typeof doc.basePath === 'string' ? doc.basePath.replace(/\/$/, '') : '';
  const resultado: PedidoImportado[] = [];
  for (const [caminho, operacoes] of Object.entries(doc.paths)) {
    if (!eObjeto(operacoes)) continue;
    const parametrosComuns = Array.isArray(operacoes.parameters) ? operacoes.parameters : [];
    for (const [metodoTexto, op] of Object.entries(operacoes)) {
      const metodo = metodoTexto.toUpperCase() as MetodoHttp;
      if (!METODOS.includes(metodo) || !eObjeto(op)) continue;
      const pedido = pedidoBase();
      pedido.metodo = metodo;
      // {id} no caminho já é uma {variável} do UAT Studio: vem da coluna com o mesmo nome.
      pedido.url = `${prefixo}${caminho}`;
      const avisos: string[] = [];
      const parametros = [...parametrosComuns, ...(Array.isArray(op.parameters) ? op.parameters : [])].map((p) => {
        if (eObjeto(p) && typeof p.$ref === 'string') return resolverRef(p.$ref, raiz);
        return p;
      });
      for (const p of parametros) {
        if (!eObjeto(p) || typeof p.name !== 'string') continue;
        if (p.in === 'query') pedido.parametros.push({ nome: p.name, valor: `{${p.name}}` });
        else if (p.in === 'header' && !/^authorization$/i.test(p.name)) pedido.cabecalhos.push({ nome: p.name, valor: `{${p.name}}` });
        else if (p.in === 'body' && eObjeto(p.schema)) {
          pedido.tipoCorpo = 'json';
          pedido.corpo = JSON.stringify(exemploDoEsquema(p.schema, raiz), null, 2);
        }
      }
      const corpoPedido = eObjeto(op.requestBody) && eObjeto(op.requestBody.content) ? op.requestBody.content : null;
      if (corpoPedido) {
        const [tipo, conteudo] = Object.entries(corpoPedido).find(([t]) => t.includes('json')) ?? Object.entries(corpoPedido)[0] ?? [];
        if (tipo && eObjeto(conteudo)) {
          pedido.tipoCorpo = tipo.includes('json') ? 'json' : tipo.includes('xml') ? 'xml' : tipo.includes('form') ? 'formulario' : 'texto';
          const exemplo = conteudo.example ?? exemploDoEsquema(conteudo.schema, raiz);
          pedido.corpo = typeof exemplo === 'string' ? exemplo : JSON.stringify(exemplo ?? {}, null, 2);
        }
      }
      // Código esperado: a primeira resposta 2xx documentada.
      const respostas = eObjeto(op.responses) ? Object.keys(op.responses) : [];
      const sucesso = respostas.find((c) => /^2\d\d$/.test(c));
      if (sucesso) pedido.verificacoes = [{ id: 'v1', alvo: 'estado', operador: 'igual', esperado: sucesso }];
      if (Array.isArray(op.security) ? op.security.length > 0 : Array.isArray(doc.security) && doc.security.length > 0) {
        avisos.push('Esta operação precisa de autenticação: escolha um perfil no bloco.');
      }
      const nome = (typeof op.summary === 'string' && op.summary.trim()) || (typeof op.operationId === 'string' && op.operationId) || `${metodo} ${caminho}`;
      resultado.push({ nome: nome.slice(0, 80), pedido, avisos });
    }
  }
  if (resultado.length === 0) throw new ErroImportar('A especificação não tem operações.');
  return resultado;
}

/** "#/components/schemas/Cliente" → o objeto apontado. */
function resolverRef(ref: string, raiz: Objeto): unknown {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<unknown>((o, k) => (eObjeto(o) ? o[k.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined), raiz);
}

// ---------- Postman ----------

/** {{variavel}} do Postman → {variavel} do UAT Studio. */
const variaveisPostman = (texto: string): string => texto.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, '{$1}');

/** Uma coleção do Postman (v2.0/v2.1, exportada em JSON) → um pedido por item (as pastas são percorridas). */
export function dePostman(texto: string): PedidoImportado[] {
  let doc: unknown;
  try {
    doc = JSON.parse(texto);
  } catch {
    throw new ErroImportar('A coleção do Postman tem de estar em JSON.');
  }
  if (!eObjeto(doc) || !Array.isArray(doc.item)) throw new ErroImportar('Isto não parece uma coleção do Postman (falta "item").');
  const resultado: PedidoImportado[] = [];
  const percorrer = (itens: unknown[], pasta: string): void => {
    for (const item of itens) {
      if (!eObjeto(item)) continue;
      if (Array.isArray(item.item)) {
        percorrer(item.item, [pasta, typeof item.name === 'string' ? item.name : ''].filter(Boolean).join(' / '));
        continue;
      }
      const req = item.request;
      if (!req) continue;
      const pedido = pedidoBase();
      const avisos: string[] = [];
      const r = typeof req === 'string' ? { url: req } : eObjeto(req) ? req : {};
      pedido.metodo = metodoValido(typeof r.method === 'string' ? r.method : undefined, 'GET');
      const urlCrua = typeof r.url === 'string' ? r.url : eObjeto(r.url) && typeof r.url.raw === 'string' ? r.url.raw : '';
      const separado = separarQuery(variaveisPostman(urlCrua));
      pedido.url = separado.url;
      pedido.parametros = separado.parametros;
      for (const c of Array.isArray(r.header) ? r.header : []) {
        if (!eObjeto(c) || typeof c.key !== 'string' || c.disabled) continue;
        if (/^authorization$/i.test(c.key)) {
          avisos.push('O cabeçalho Authorization não foi importado: use um perfil de autenticação.');
          continue;
        }
        if (/^content-type$/i.test(c.key)) continue;
        pedido.cabecalhos.push({ nome: c.key, valor: variaveisPostman(String(c.value ?? '')) });
      }
      const corpo = eObjeto(r.body) ? r.body : null;
      if (corpo?.mode === 'raw' && typeof corpo.raw === 'string') {
        const linguagem = eObjeto(corpo.options) && eObjeto(corpo.options.raw) ? String(corpo.options.raw.language ?? '') : '';
        pedido.corpo = variaveisPostman(corpo.raw);
        pedido.tipoCorpo = tipoDoCorpo(linguagem === 'json' ? 'application/json' : linguagem === 'xml' ? 'application/xml' : undefined, pedido.corpo);
      } else if (corpo?.mode === 'urlencoded' && Array.isArray(corpo.urlencoded)) {
        pedido.tipoCorpo = 'formulario';
        pedido.corpo = corpo.urlencoded
          .filter((p): p is Objeto => eObjeto(p) && !p.disabled)
          .map((p) => `${String(p.key)}=${variaveisPostman(String(p.value ?? ''))}`)
          .join('&');
      }
      if (eObjeto(r.auth) && r.auth.type && r.auth.type !== 'noauth') avisos.push(`A autenticação "${String(r.auth.type)}" não foi importada: crie um perfil de autenticação e escolha-o no bloco.`);
      const nome = [pasta, typeof item.name === 'string' ? item.name : `${pedido.metodo} ${pedido.url}`].filter(Boolean).join(' / ');
      resultado.push({ nome: nome.slice(0, 80), pedido, avisos });
    }
  };
  percorrer(doc.item, '');
  if (resultado.length === 0) throw new ErroImportar('A coleção não tem pedidos.');
  return resultado;
}

/** Descobre o formato pelo conteúdo: cURL, OpenAPI ou Postman. */
export function importarPedidos(texto: string): PedidoImportado[] {
  const t = texto.trim();
  if (/^curl(\.exe)?\s/i.test(t)) return [deCurl(t)];
  if (t.startsWith('{')) {
    let doc: unknown;
    try {
      doc = JSON.parse(t);
    } catch {
      throw new ErroImportar('O JSON não é válido.');
    }
    if (eObjeto(doc) && (doc.openapi || doc.swagger)) return deOpenApi(t);
    if (eObjeto(doc) && Array.isArray(doc.item)) return dePostman(t);
  }
  throw new ErroImportar('Formato não reconhecido. Cole um comando cURL, uma especificação OpenAPI (JSON) ou uma coleção do Postman (JSON).');
}
