// Motor dos blocos de API: monta o pedido HTTP com os dados do caso, trata da autenticação
// (OAuth 2.0, API Key, Basic, Bearer), verifica a resposta e guarda valores em variáveis.
// Não depende do Electron: recebe de fora o "fetch" e a forma de ler segredos, para poder ser testado.
import { Bloco, OperadorApi, PedidoApi, PerfilAutenticacao, ResultadoApi, VerificacaoApi } from '../../shared/modelo';
import { comparar, Decimal, lerNumero } from '../../shared/decimal';

/** Erro com uma mensagem pensada para o utilizador. */
export class ErroApi extends Error {}

interface TokenGuardado {
  token: string;
  /** Momento (ms) em que deixa de valer. */
  expira: number;
  renovacao?: string;
}

export interface AmbienteApi {
  fetch: typeof fetch;
  /** Lê um segredo do cofre (por exemplo `meu-perfil.clientSecret`). */
  segredo(nome: string): string | undefined;
  /** Tokens já pedidos nesta execução (por perfil), para não pedir um novo em cada bloco. */
  tokens: Map<string, TokenGuardado>;
}

export interface PedidoBloco {
  bloco: Bloco;
  /** Endereço da aplicação no ambiente ativo (pode faltar se o bloco tiver um endereço completo). */
  urlBase?: string;
  perfil?: PerfilAutenticacao;
  /** Troca as {variáveis} de um texto. `paraJson` protege aspas e barras. */
  preencher(texto: string, paraJson?: boolean): string;
}

const MASCARA = '***';

function exigirSegredo(amb: AmbienteApi, perfil: PerfilAutenticacao, campo: string, rotulo: string): string {
  const valor = amb.segredo(`${perfil.id}.${campo}`);
  if (!valor) throw new ErroApi(`Falta preencher "${rotulo}" no perfil de autenticação "${perfil.nome}" (ecrã Blocos de API).`);
  return valor;
}

function explicarRede(erro: unknown, limiteMs: number, oQue: string): ErroApi {
  const texto = erro instanceof Error ? `${erro.name} ${erro.message} ${String((erro as { cause?: unknown }).cause ?? '')}` : String(erro);
  if (/TimeoutError|AbortError|timed out|aborted/i.test(texto)) return new ErroApi(`${oQue}: o servidor não respondeu em ${Math.round(limiteMs / 1000)} segundos.`);
  if (/ERR_CERT|ERR_SSL|certificate|CERT_/i.test(texto)) return new ErroApi(`${oQue}: problema de certificados.`);
  if (/ERR_PROXY|ERR_TUNNEL/i.test(texto)) return new ErroApi(`${oQue}: problema de proxy.`);
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(texto)) return new ErroApi(`${oQue}: o servidor recusou a ligação (está ligado? o endereço e a porta estão certos?).`);
  if (/ENOTFOUND|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/i.test(texto)) return new ErroApi(`${oQue}: o endereço não foi encontrado ou não há rede.`);
  if (/Invalid URL|ERR_INVALID_URL/i.test(texto)) return new ErroApi(`${oQue}: o endereço não é válido.`);
  return new ErroApi(`${oQue}: não foi possível fazer o pedido (${erro instanceof Error ? erro.message : texto}).`);
}

// ---------- Autenticação ----------
async function pedirToken(amb: AmbienteApi, perfil: PerfilAutenticacao, renovacao?: string): Promise<TokenGuardado> {
  if (!perfil.urlToken) throw new ErroApi(`O perfil "${perfil.nome}" não tem o endereço do token.`);
  if (!perfil.clientId) throw new ErroApi(`O perfil "${perfil.nome}" não tem o client ID.`);
  const segredoCliente = exigirSegredo(amb, perfil, 'clientSecret', 'Client secret');
  const corpo = new URLSearchParams();
  if (renovacao) {
    corpo.set('grant_type', 'refresh_token');
    corpo.set('refresh_token', renovacao);
  } else if (perfil.tipo === 'oauth2-password') {
    corpo.set('grant_type', 'password');
    corpo.set('username', perfil.utilizador ?? '');
    corpo.set('password', exigirSegredo(amb, perfil, 'password', 'Password do utilizador'));
  } else {
    corpo.set('grant_type', 'client_credentials');
  }
  if (perfil.ambito) corpo.set('scope', perfil.ambito);
  const cabecalhos: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (perfil.envioCliente === 'corpo') {
    corpo.set('client_id', perfil.clientId);
    corpo.set('client_secret', segredoCliente);
  } else {
    cabecalhos.Authorization = `Basic ${Buffer.from(`${perfil.clientId}:${segredoCliente}`, 'utf8').toString('base64')}`;
  }

  let resposta: Response;
  try {
    resposta = await amb.fetch(perfil.urlToken, { method: 'POST', headers: cabecalhos, body: corpo.toString(), signal: AbortSignal.timeout(30_000) });
  } catch (erro) {
    throw explicarRede(erro, 30_000, `Pedido de token (perfil "${perfil.nome}")`);
  }
  const texto = await resposta.text();
  let dados: { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown; error?: unknown; error_description?: unknown } = {};
  try {
    dados = JSON.parse(texto) as typeof dados;
  } catch {
    // Resposta que não é JSON: tratada abaixo.
  }
  if (!resposta.ok || typeof dados.access_token !== 'string') {
    // De propósito, não se mostra o corpo da resposta nem o pedido: podem ter segredos.
    const motivo = [dados.error, dados.error_description].filter((p) => typeof p === 'string').join(': ');
    throw new ErroApi(
      `O pedido de token do perfil "${perfil.nome}" falhou (HTTP ${resposta.status}${motivo ? `, ${motivo}` : ''}). Confirma o client ID, os segredos e o endereço do token.`,
    );
  }
  const segundos = Number(dados.expires_in);
  const duracaoMs = (Number.isFinite(segundos) && segundos > 0 ? segundos : 300) * 1000;
  return {
    token: dados.access_token,
    // Margem de segurança (10 s, ou 20% em tokens muito curtos), para não expirar a meio de um pedido.
    expira: Date.now() + duracaoMs - Math.min(10_000, duracaoMs * 0.2),
    ...(typeof dados.refresh_token === 'string' ? { renovacao: dados.refresh_token } : {}),
  };
}

async function obterToken(amb: AmbienteApi, perfil: PerfilAutenticacao, forcarNovo: boolean): Promise<string> {
  const guardado = amb.tokens.get(perfil.id);
  if (guardado && !forcarNovo && guardado.expira > Date.now()) return guardado.token;
  let novo: TokenGuardado | null = null;
  if (guardado?.renovacao) novo = await pedirToken(amb, perfil, guardado.renovacao).catch(() => null);
  novo ??= await pedirToken(amb, perfil);
  amb.tokens.set(perfil.id, novo);
  return novo.token;
}

/** Devolve os cabeçalhos de autenticação e os valores secretos a mascarar nos registos. */
async function autenticar(amb: AmbienteApi, perfil: PerfilAutenticacao | undefined, forcarNovo: boolean): Promise<{ cabecalhos: Record<string, string>; secretos: string[] }> {
  if (!perfil) return { cabecalhos: {}, secretos: [] };
  switch (perfil.tipo) {
    case 'oauth2-cliente':
    case 'oauth2-password': {
      const token = await obterToken(amb, perfil, forcarNovo);
      return { cabecalhos: { Authorization: `Bearer ${token}` }, secretos: [token] };
    }
    case 'bearer': {
      const token = exigirSegredo(amb, perfil, 'token', 'Token');
      return { cabecalhos: { Authorization: `Bearer ${token}` }, secretos: [token] };
    }
    case 'basic': {
      const password = exigirSegredo(amb, perfil, 'password', 'Password');
      const codificado = Buffer.from(`${perfil.utilizador ?? ''}:${password}`, 'utf8').toString('base64');
      return { cabecalhos: { Authorization: `Basic ${codificado}` }, secretos: [codificado, password] };
    }
    case 'apikey': {
      const chave = exigirSegredo(amb, perfil, 'chave', 'Chave da API');
      return { cabecalhos: { [perfil.cabecalho?.trim() || 'X-API-Key']: chave }, secretos: [chave] };
    }
  }
}

// ---------- Ler campos da resposta ----------
const EM_FALTA = Symbol('em falta');

/** Lê um campo de um JSON por um caminho simples: `cliente.id`, `$.itens[0].valor`, `clientes[0].nif`. */
export function lerCaminho(dados: unknown, caminho: string): unknown {
  const partes = caminho
    .trim()
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[["']([^"']+)["']\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let atual: unknown = dados;
  for (const parte of partes) {
    if (atual === null || typeof atual !== 'object') return EM_FALTA;
    const seguinte = Array.isArray(atual) ? atual[Number(parte)] : (atual as Record<string, unknown>)[parte];
    if (seguinte === undefined) return EM_FALTA;
    atual = seguinte;
  }
  return atual;
}

function comoTexto(valor: unknown): string {
  if (valor === null) return '';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return JSON.stringify(valor);
}

/** Converte em número exato. Um número vindo do JSON usa sempre ponto decimal (1.234 é um vírgula duzentos e trinta e quatro). */
function comoNumero(valor: unknown): Decimal | null {
  if (typeof valor === 'number') return Number.isFinite(valor) && !/e/i.test(String(valor)) ? lerNumero(String(valor).replace('.', ',')) : null;
  if (typeof valor === 'string' && /^[\s\d.,+\-−€% ]+$/.test(valor)) return lerNumero(valor);
  return null;
}

const NOMES_OPERADOR: Record<OperadorApi, string> = {
  igual: 'igual a',
  diferente: 'diferente de',
  contem: 'contém',
  maior: 'maior que',
  menor: 'menor que',
  regex: 'corresponde a',
  existe: 'existe',
};

function avaliar(operador: OperadorApi, obtido: unknown, esperado: string): boolean {
  if (operador === 'existe') return obtido !== EM_FALTA;
  const numeroEsperado = comoNumero(esperado);
  if (obtido === EM_FALTA) {
    // A API REST do OutSystems omite os campos com o valor por defeito (0): campo em falta conta como 0.
    if (numeroEsperado && (operador === 'igual' || operador === 'diferente')) {
      const eZero = numeroEsperado.inteiro === 0n;
      return operador === 'igual' ? eZero : !eZero;
    }
    return operador === 'diferente';
  }
  const numeroObtido = comoNumero(obtido);
  const texto = comoTexto(obtido);
  switch (operador) {
    case 'igual':
    case 'diferente': {
      const iguais = numeroObtido && numeroEsperado ? comparar(numeroObtido, numeroEsperado) === 0 : texto.trim() === esperado.trim();
      return operador === 'igual' ? iguais : !iguais;
    }
    case 'contem':
      return texto.includes(esperado);
    case 'maior':
    case 'menor': {
      if (!numeroObtido || !numeroEsperado) return false;
      const ordem = comparar(numeroObtido, numeroEsperado);
      return operador === 'maior' ? ordem > 0 : ordem < 0;
    }
    case 'regex':
      try {
        return new RegExp(esperado).test(texto);
      } catch {
        throw new ErroApi(`A expressão regular "${esperado}" não é válida.`);
      }
  }
}

function descreverVerificacao(v: VerificacaoApi, esperado: string): string {
  const onde =
    v.alvo === 'estado' ? 'Código HTTP' : v.alvo === 'tempo' ? 'Tempo de resposta (ms)' : v.alvo === 'cabecalho' ? `Cabeçalho ${v.caminho ?? ''}` : v.caminho ? `Campo ${v.caminho}` : 'Resposta';
  return v.operador === 'existe' ? `${onde} existe` : `${onde} ${NOMES_OPERADOR[v.operador]} ${esperado}`;
}

// ---------- Executar ----------
function montarUrl(pedido: PedidoApi, urlBase: string | undefined, preencher: PedidoBloco['preencher']): string {
  const caminho = preencher(pedido.url).trim();
  let completo: string;
  if (/^https?:\/\//i.test(caminho)) completo = caminho;
  else if (!urlBase) throw new ErroApi('A aplicação deste bloco não tem endereço no ambiente ativo.');
  else completo = caminho ? `${urlBase.replace(/\/+$/, '')}/${caminho.replace(/^\/+/, '')}` : urlBase;
  let url: URL;
  try {
    url = new URL(completo);
  } catch {
    throw new ErroApi(`O endereço "${completo}" não é válido.`);
  }
  for (const p of pedido.parametros) if (p.nome.trim()) url.searchParams.append(preencher(p.nome).trim(), preencher(p.valor));
  return url.toString();
}

const TIPOS_DE_CONTEUDO: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  texto: 'text/plain; charset=utf-8',
  formulario: 'application/x-www-form-urlencoded',
};

const escaparJson = (valor: string): string => JSON.stringify(valor).slice(1, -1);

export async function executarBlocoApi(pedidoBloco: PedidoBloco, amb: AmbienteApi): Promise<ResultadoApi> {
  const { bloco, perfil, preencher } = pedidoBloco;
  const pedido = bloco.pedido;
  if (!pedido) throw new ErroApi(`O bloco "${bloco.nome}" não tem um pedido definido.`);
  if (pedido.perfilId && !perfil) throw new ErroApi(`O perfil de autenticação "${pedido.perfilId}" já não existe.`);
  const limiteMs = pedido.limiteMs && pedido.limiteMs > 0 ? pedido.limiteMs : 30_000;
  const url = montarUrl(pedido, pedidoBloco.urlBase, preencher);

  const cabecalhosBase: Record<string, string> = {};
  const temCorpo = pedido.tipoCorpo !== 'nenhum' && pedido.metodo !== 'GET';
  const corpo = temCorpo ? preencher(pedido.corpo, pedido.tipoCorpo === 'json') : undefined;
  if (temCorpo) cabecalhosBase['Content-Type'] = TIPOS_DE_CONTEUDO[pedido.tipoCorpo];
  if (pedido.tipoCorpo === 'json' && corpo?.trim()) {
    try {
      JSON.parse(corpo);
    } catch {
      throw new ErroApi('O corpo do pedido não é um JSON válido depois de trocar as variáveis.');
    }
  }
  for (const c of pedido.cabecalhos) if (c.nome.trim()) cabecalhosBase[c.nome.trim()] = preencher(c.valor);

  let secretos: string[] = [];
  let cabecalhos: Record<string, string> = {};
  let resposta: Response | null = null;
  let texto = '';
  let tempoMs = 0;
  // Se o servidor disser que o token não serve (401), pede-se um novo e tenta-se mais uma vez.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const autenticacao = await autenticar(amb, perfil, tentativa > 0);
    secretos = autenticacao.secretos;
    cabecalhos = { ...cabecalhosBase, ...autenticacao.cabecalhos };
    const inicio = Date.now();
    try {
      resposta = await amb.fetch(url, { method: pedido.metodo, headers: cabecalhos, body: corpo, signal: AbortSignal.timeout(limiteMs) });
      texto = await resposta.text();
    } catch (erro) {
      throw explicarRede(erro, limiteMs, `${pedido.metodo} ${url}`);
    }
    tempoMs = Date.now() - inicio;
    const eOAuth = perfil?.tipo === 'oauth2-cliente' || perfil?.tipo === 'oauth2-password';
    if (!(resposta.status === 401 && eOAuth)) break;
  }
  if (!resposta) throw new ErroApi('O pedido não chegou a ser feito.');

  const mascarar = (valor: string): string => secretos.reduce((t, s) => (s ? t.split(s).join(MASCARA) : t), valor);
  const cabecalhosResposta: Record<string, string> = {};
  resposta.headers.forEach((valor, nome) => {
    cabecalhosResposta[nome] = /^set-cookie$/i.test(nome) ? MASCARA : mascarar(valor);
  });
  const cabecalhosPedido: Record<string, string> = {};
  for (const [nome, valor] of Object.entries(cabecalhos)) cabecalhosPedido[nome] = mascarar(valor);

  let json: unknown = EM_FALTA;
  try {
    json = JSON.parse(texto);
  } catch {
    // A resposta não é JSON (pode ser XML ou texto): só dá para verificar a resposta toda.
  }

  const resultado: ResultadoApi = {
    pedido: { metodo: pedido.metodo, url: mascarar(url), cabecalhos: cabecalhosPedido, ...(corpo !== undefined ? { corpo: mascarar(corpo) } : {}) },
    resposta: { estado: resposta.status, cabecalhos: cabecalhosResposta, corpo: mascarar(texto), tempoMs },
    verificacoes: [],
    guardadas: {},
  };

  for (const v of pedido.verificacoes) {
    const esperado = preencher(v.esperado ?? '');
    let obtido: unknown;
    if (v.alvo === 'estado') obtido = resposta.status;
    else if (v.alvo === 'tempo') obtido = tempoMs;
    else if (v.alvo === 'cabecalho') obtido = resposta.headers.get(v.caminho ?? '') ?? EM_FALTA;
    else if (!v.caminho?.trim()) obtido = texto;
    else if (json === EM_FALTA) obtido = EM_FALTA;
    else obtido = lerCaminho(json, v.caminho);

    let ok: boolean;
    if (v.alvo === 'estado' && v.operador === 'igual' && esperado.includes(',')) {
      // "200, 201": aceita qualquer um dos códigos.
      ok = esperado.split(',').some((codigo) => Number(codigo.trim()) === resposta?.status);
    } else {
      ok = avaliar(v.operador, obtido, esperado);
    }
    resultado.verificacoes.push({
      descricao: descreverVerificacao(v, esperado),
      ok,
      esperado: v.operador === 'existe' ? 'existe' : `${NOMES_OPERADOR[v.operador]} ${esperado}`,
      obtido: obtido === EM_FALTA ? '(campo em falta)' : mascarar(comoTexto(obtido)).slice(0, 500),
    });
  }

  for (const g of pedido.guardar) {
    if (!g.variavel.trim()) continue;
    const valor = json === EM_FALTA ? EM_FALTA : lerCaminho(json, g.caminho);
    if (valor === EM_FALTA) {
      throw new ErroApi(`Não foi possível guardar {${g.variavel}}: a resposta (HTTP ${resposta.status}) não tem o campo "${g.caminho}".`);
    }
    resultado.guardadas[g.variavel.trim()] = comoTexto(valor);
  }
  return resultado;
}

/** Protege um valor para caber dentro de um texto JSON (aspas, barras, mudanças de linha). */
export { escaparJson };
