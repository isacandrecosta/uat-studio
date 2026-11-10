// Ecrã Blocos de API: construir pedidos, perfis de autenticação (com segredos no cofre) e teste individual.
import {
  SEGREDOS_DO_PERFIL,
  type Bloco,
  type MetodoHttp,
  type OperadorApi,
  type ParNomeValor,
  type PedidoApi,
  type PerfilAutenticacao,
  type ResultadoApi,
  type TipoCorpo,
  type TipoPerfil,
  type VerificacaoApi,
} from '../../shared/modelo.js';
import type { Contexto } from '../app.js';
import { codigoDoBloco } from '../../shared/codigo.js';
import { confirmar, h, mensagemDeErro, mostrarCodigo, pedirFormulario, pedirTexto, type CampoFormulario } from '../dom.js';

const NOMES_PERFIL: Record<TipoPerfil, string> = {
  'oauth2-cliente': 'OAuth 2.0 (client credentials)',
  'oauth2-password': 'OAuth 2.0 (utilizador e password)',
  apikey: 'API Key',
  basic: 'Basic',
  bearer: 'Token fixo (Bearer)',
};
const METODOS: MetodoHttp[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const TIPOS_CORPO: Array<[TipoCorpo, string]> = [
  ['nenhum', 'Sem corpo'],
  ['json', 'JSON'],
  ['xml', 'XML'],
  ['texto', 'Texto'],
  ['formulario', 'Formulário (a=1&b=2)'],
];
const ALVOS: Array<[VerificacaoApi['alvo'], string]> = [
  ['estado', 'Código HTTP'],
  ['corpo', 'Campo da resposta'],
  ['cabecalho', 'Cabeçalho'],
  ['tempo', 'Tempo (ms)'],
];
const OPERADORES: Array<[OperadorApi, string]> = [
  ['igual', 'igual a'],
  ['diferente', 'diferente de'],
  ['contem', 'contém'],
  ['maior', 'maior que'],
  ['menor', 'menor que'],
  ['regex', 'expressão regular'],
  ['existe', 'existe'],
];

/** Bloco que está aberto no editor (mantém-se ao mudar de ecrã). */
let blocoAbertoId: string | null = null;
let casoDeExemplo = '';

function pedidoVazio(): PedidoApi {
  return {
    metodo: 'GET',
    url: '',
    parametros: [],
    cabecalhos: [],
    tipoCorpo: 'nenhum',
    corpo: '',
    verificacoes: [{ id: 'v1', alvo: 'estado', operador: 'igual', esperado: '200' }],
    guardar: [],
  };
}

/** "nome=valor" por linha ↔ lista de pares. */
function paraTexto(pares: ParNomeValor[], separador: string): string {
  return pares.map((p) => `${p.nome}${separador}${p.valor}`).join('\n');
}
function paraPares(texto: string, separador: RegExp): ParNomeValor[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      const corte = linha.search(separador);
      return corte < 0 ? { nome: linha, valor: '' } : { nome: linha.slice(0, corte).trim(), valor: linha.slice(corte + 1).trim() };
    });
}

export async function ecraApi(contexto: Contexto): Promise<void> {
  const { corpo, acoes, estado, irPara } = contexto;
  const api = window.uatStudio;
  const [blocos, aplicacoes, perfis, jornadas, conjuntos] = await Promise.all([
    api.dados.listar('blocos'),
    api.dados.listar('aplicacoes'),
    api.dados.listar('perfis'),
    api.dados.listar('jornadas'),
    api.dados.listar('casos'),
  ]);
  const blocosApi = blocos.filter((b) => b.tipo === 'API');
  const aplicacoesApi = aplicacoes.filter((a) => a.tipo === 'API');
  const ambiente = estado.projeto.ambientes.find((a) => a.id === estado.projeto.ambienteAtivo);
  const exemplos = jornadas.flatMap((j) => (conjuntos.find((c) => c.id === j.id)?.casos ?? []).map((c) => ({ chave: `${j.id}/${c.id}`, texto: `${j.nome} › ${c.id}` })));
  const nomesSegredos = perfis.flatMap((p) => SEGREDOS_DO_PERFIL[p.tipo].map((s) => `${p.id}.${s.campo}`));
  const preenchidos = await api.cofre.preenchidos(nomesSegredos);

  const redesenhar = (): void => irPara('api');

  // ---------- Perfis de autenticação ----------
  async function editarPerfil(existente?: PerfilAutenticacao): Promise<void> {
    let tipo = existente?.tipo;
    let nome = existente?.nome ?? '';
    if (!existente) {
      const inicio = await pedirFormulario(
        'Novo perfil de autenticação',
        [
          { id: 'nome', rotulo: 'Nome do perfil', obrigatorio: true, ajuda: 'Por exemplo: API de Clientes (QA)' },
          { id: 'tipo', rotulo: 'Tipo', tipo: 'escolha', opcoes: Object.entries(NOMES_PERFIL).map(([valor, texto]) => ({ valor, texto })) },
        ],
        'Continuar',
      );
      if (!inicio?.nome.trim()) return;
      nome = inicio.nome.trim();
      tipo = inicio.tipo as TipoPerfil;
    }
    if (!tipo) return;
    const eOAuth = tipo === 'oauth2-cliente' || tipo === 'oauth2-password';
    const campos: CampoFormulario[] = [{ id: 'nome', rotulo: 'Nome do perfil', valor: nome, obrigatorio: true }];
    if (eOAuth) {
      campos.push(
        { id: 'urlToken', rotulo: 'Endereço do token', valor: existente?.urlToken, obrigatorio: true, ajuda: 'Por exemplo: http://localhost:4010/oauth/token' },
        { id: 'clientId', rotulo: 'Client ID', valor: existente?.clientId, obrigatorio: true },
        { id: 'ambito', rotulo: 'Âmbito (scope), opcional', valor: existente?.ambito },
        {
          id: 'envioCliente',
          rotulo: 'Como enviar o client secret',
          tipo: 'escolha',
          valor: existente?.envioCliente ?? 'basic',
          opcoes: [
            { valor: 'basic', texto: 'No cabeçalho (Basic), o mais comum' },
            { valor: 'corpo', texto: 'No corpo do pedido' },
          ],
        },
      );
    }
    if (tipo === 'oauth2-password' || tipo === 'basic') campos.push({ id: 'utilizador', rotulo: 'Utilizador', valor: existente?.utilizador, obrigatorio: true });
    if (tipo === 'apikey') campos.push({ id: 'cabecalho', rotulo: 'Nome do cabeçalho', valor: existente?.cabecalho ?? 'X-API-Key', obrigatorio: true });
    for (const segredo of SEGREDOS_DO_PERFIL[tipo]) {
      const guardado = existente ? preenchidos[`${existente.id}.${segredo.campo}`] : false;
      campos.push({
        id: `segredo:${segredo.campo}`,
        rotulo: segredo.rotulo,
        tipo: 'segredo',
        ajuda: guardado ? 'Já está guardado no cofre. Deixa vazio para manter.' : 'Fica guardado no cofre encriptado deste PC, fora da pasta do projeto.',
      });
    }
    const valores = await pedirFormulario(`${NOMES_PERFIL[tipo]}`, campos);
    if (!valores) return;
    try {
      const perfil = await api.dados.guardar('perfis', {
        ...(existente ? { id: existente.id } : {}),
        nome: valores.nome.trim() || nome,
        tipo,
        ...(eOAuth
          ? {
              urlToken: valores.urlToken.trim(),
              clientId: valores.clientId.trim(),
              ...(valores.ambito.trim() ? { ambito: valores.ambito.trim() } : {}),
              envioCliente: valores.envioCliente === 'corpo' ? ('corpo' as const) : ('basic' as const),
            }
          : {}),
        ...(valores.utilizador !== undefined ? { utilizador: valores.utilizador.trim() } : {}),
        ...(valores.cabecalho !== undefined ? { cabecalho: valores.cabecalho.trim() } : {}),
      });
      for (const segredo of SEGREDOS_DO_PERFIL[tipo]) {
        const valor = valores[`segredo:${segredo.campo}`];
        if (valor) await api.cofre.definir(`${perfil.id}.${segredo.campo}`, valor);
      }
    } catch (erro) {
      await confirmar('Não foi possível guardar o perfil', mensagemDeErro(erro), 'Fechar');
    }
    redesenhar();
  }

  function cartaoPerfis(): HTMLElement {
    return h(
      'section',
      { class: 'cartao' },
      h(
        'header',
        { class: 'cartao-topo' },
        h('h2', {}, 'Perfis de autenticação'),
        h('button', { id: 'btn-novo-perfil', type: 'button', class: 'botao botao-pequeno-livre', onclick: () => void editarPerfil() }, 'Novo'),
      ),
      perfis.length === 0
        ? h('p', { class: 'suave' }, 'Um perfil guarda a forma de entrar numa API (OAuth 2.0, API Key...) e pode ser usado por vários blocos.')
        : h(
            'ul',
            { class: 'lista-itens' },
            perfis.map((perfil) => {
              const emFalta = SEGREDOS_DO_PERFIL[perfil.tipo].filter((s) => !preenchidos[`${perfil.id}.${s.campo}`]);
              return h(
                'li',
                { class: 'item item-perfil' },
                h(
                  'div',
                  { class: 'bloco-nome' },
                  h('button', { type: 'button', class: 'ligacao', onclick: () => void editarPerfil(perfil) }, perfil.nome),
                  h('span', { class: 'suave' }, NOMES_PERFIL[perfil.tipo]),
                  emFalta.length > 0 && h('span', { class: 'aviso-pequeno' }, `Falta: ${emFalta.map((s) => s.rotulo).join(', ')}`),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'botao botao-discreto-claro',
                    'aria-label': `Apagar o perfil ${perfil.nome}`,
                    onclick: async () => {
                      const usados = blocosApi.filter((b) => b.pedido?.perfilId === perfil.id).length;
                      const aviso = usados > 0 ? ` É usado por ${usados} bloco(s), que deixam de conseguir autenticar-se.` : '';
                      if (!(await confirmar('Apagar perfil', `Apagar "${perfil.nome}" e os segredos guardados?${aviso}`))) return;
                      await api.cofre.apagarPerfil(perfil.id);
                      await api.dados.apagar('perfis', perfil.id);
                      redesenhar();
                    },
                  },
                  'Apagar',
                ),
              );
            }),
          ),
    );
  }

  // ---------- Lista de blocos ----------
  async function novoBloco(): Promise<void> {
    if (aplicacoesApi.length === 0) {
      await confirmar('Falta uma aplicação de API', 'Cria primeiro uma aplicação do tipo API (ecrã Jornadas, cartão Aplicações), com o endereço da API neste ambiente.', 'Fechar');
      return;
    }
    const nome = await pedirTexto('Novo bloco de API', 'Nome do bloco (por exemplo: Criar cliente)');
    if (!nome) return;
    const novo = await api.dados.guardar('blocos', { nome, tipo: 'API', aplicacaoId: aplicacoesApi[0].id, passos: [], pedido: pedidoVazio() });
    blocoAbertoId = novo.id;
    redesenhar();
  }

  function cartaoBlocos(): HTMLElement {
    return h(
      'section',
      { class: 'cartao' },
      h('header', { class: 'cartao-topo' }, h('h2', {}, 'Blocos de API')),
      blocosApi.length === 0
        ? h('p', { class: 'suave' }, 'Ainda não há blocos de API.')
        : h(
            'ul',
            { class: 'lista-itens', id: 'lista-blocos-api' },
            blocosApi.map((b) =>
              h(
                'li',
                { class: 'item' },
                h('span', { class: 'metodo', 'data-metodo': b.pedido?.metodo ?? 'GET' }, b.pedido?.metodo ?? 'GET'),
                h(
                  'button',
                  {
                    type: 'button',
                    class: `ligacao${b.id === blocoAbertoId ? ' atual' : ''}`,
                    'data-bloco': b.id,
                    onclick: () => {
                      blocoAbertoId = b.id;
                      redesenhar();
                    },
                  },
                  b.nome,
                ),
              ),
            ),
          ),
    );
  }

  // ---------- Editor do bloco ----------
  function editor(original: Bloco): HTMLElement {
    // Cópia de trabalho: só vai para o disco ao carregar em "Guardar".
    const bloco: Bloco = JSON.parse(JSON.stringify(original)) as Bloco;
    const pedido: PedidoApi = (bloco.pedido ??= pedidoVazio());
    const aviso = h('p', { class: 'estado', role: 'status' });
    const zonaResultado = h('div', { id: 'resultado-api' });

    const texto = (id: string, valor: string, aoMudar: (v: string) => void, ajuda = ''): HTMLInputElement => {
      const campo = h('input', { id, type: 'text', class: 'campo', value: valor, placeholder: ajuda, spellcheck: 'false' });
      campo.addEventListener('input', () => aoMudar(campo.value));
      return campo;
    };
    const escolha = <T extends string>(id: string, opcoes: Array<[T, string]>, valor: T | '', aoMudar: (v: T) => void, rotulo?: string): HTMLSelectElement => {
      const campo = h('select', { id, class: 'campo', 'aria-label': rotulo }, opcoes.map(([v, t]) => h('option', { value: v, selected: v === valor }, t)));
      campo.addEventListener('change', () => aoMudar(campo.value as T));
      return campo;
    };
    const area = (id: string, valor: string, aoMudar: (v: string) => void, ajuda: string, linhas = 3): HTMLTextAreaElement => {
      const campo = h('textarea', { id, class: 'campo campo-codigo', rows: linhas, placeholder: ajuda, spellcheck: 'false' }, valor);
      campo.addEventListener('input', () => aoMudar(campo.value));
      return campo;
    };
    const grupo = (id: string, rotulo: string, campo: HTMLElement, ajuda?: string): HTMLElement =>
      h('div', { class: 'campo-grupo' }, h('label', { for: id }, rotulo), campo, ajuda && h('p', { class: 'ajuda-campo' }, ajuda));

    // Verificações
    const listaVerificacoes = h('div', { class: 'linhas-api', id: 'verificacoes-api' });
    const desenharVerificacoes = (): void => {
      listaVerificacoes.replaceChildren(
        ...pedido.verificacoes.map((v, indice) => {
          const caminho = texto(`v-caminho-${indice}`, v.caminho ?? '', (valor) => (v.caminho = valor), v.alvo === 'cabecalho' ? 'Nome do cabeçalho' : 'Campo, por exemplo: cliente.id');
          caminho.setAttribute('aria-label', 'Campo ou cabeçalho');
          caminho.hidden = v.alvo === 'estado' || v.alvo === 'tempo';
          const esperado = texto(`v-esperado-${indice}`, v.esperado, (valor) => (v.esperado = valor), 'Valor esperado (pode ter {variáveis})');
          esperado.setAttribute('aria-label', 'Valor esperado');
          esperado.hidden = v.operador === 'existe';
          return h(
            'div',
            { class: 'linha-api' },
            escolha(`v-alvo-${indice}`, ALVOS, v.alvo, (valor) => {
              v.alvo = valor;
              desenharVerificacoes();
            }, 'O que verificar'),
            caminho,
            escolha(`v-operador-${indice}`, OPERADORES, v.operador, (valor) => {
              v.operador = valor;
              desenharVerificacoes();
            }, 'Comparação'),
            esperado,
            h(
              'button',
              {
                type: 'button',
                class: 'botao botao-discreto-claro',
                'aria-label': `Remover a verificação ${indice + 1}`,
                onclick: () => {
                  pedido.verificacoes.splice(indice, 1);
                  desenharVerificacoes();
                },
              },
              'Remover',
            ),
          );
        }),
      );
    };
    desenharVerificacoes();

    // Guardar da resposta
    const listaGuardar = h('div', { class: 'linhas-api', id: 'guardar-api' });
    const desenharGuardar = (): void => {
      listaGuardar.replaceChildren(
        ...pedido.guardar.map((g, indice) => {
          const variavel = texto(`g-variavel-${indice}`, g.variavel, (valor) => (g.variavel = valor.trim().replace(/^\{|\}$/g, '')), 'Nome da variável, por exemplo: ClienteId');
          variavel.setAttribute('aria-label', 'Nome da variável');
          const caminho = texto(`g-caminho-${indice}`, g.caminho, (valor) => (g.caminho = valor), 'Campo da resposta, por exemplo: id');
          caminho.setAttribute('aria-label', 'Campo da resposta');
          return h(
            'div',
            { class: 'linha-api linha-guardar' },
            variavel,
            caminho,
            h(
              'button',
              {
                type: 'button',
                class: 'botao botao-discreto-claro',
                'aria-label': `Remover o guardar ${indice + 1}`,
                onclick: () => {
                  pedido.guardar.splice(indice, 1);
                  desenharGuardar();
                },
              },
              'Remover',
            ),
          );
        }),
      );
    };
    desenharGuardar();

    const guardar = async (): Promise<boolean> => {
      if (!bloco.nome.trim()) {
        aviso.textContent = 'Dá um nome ao bloco.';
        aviso.className = 'estado erro';
        return false;
      }
      try {
        await api.dados.guardar('blocos', bloco);
        aviso.textContent = 'Guardado.';
        aviso.className = 'estado ok';
        return true;
      } catch (erro) {
        aviso.textContent = mensagemDeErro(erro);
        aviso.className = 'estado erro';
        return false;
      }
    };

    const escolhaExemplo = h(
      'select',
      { id: 'api-exemplo', class: 'campo', 'aria-label': 'Caso de exemplo para preencher as variáveis' },
      h('option', { value: '' }, 'Sem caso de exemplo'),
      exemplos.map((e) => h('option', { value: e.chave, selected: e.chave === casoDeExemplo }, `Dados de: ${e.texto}`)),
    );
    escolhaExemplo.addEventListener('change', () => (casoDeExemplo = escolhaExemplo.value));

    const botaoTestar = h(
      'button',
      {
        id: 'btn-testar-api',
        type: 'button',
        class: 'botao',
        onclick: async () => {
          botaoTestar.disabled = true;
          botaoTestar.textContent = 'A enviar…';
          zonaResultado.replaceChildren();
          try {
            desenharResultado(zonaResultado, await api.api.testar(bloco, escolhaExemplo.value || undefined));
          } catch (erro) {
            zonaResultado.replaceChildren(h('p', { class: 'aviso-erro', role: 'alert', id: 'erro-api' }, mensagemDeErro(erro)));
          } finally {
            botaoTestar.disabled = false;
            botaoTestar.textContent = 'Testar';
          }
        },
      },
      'Testar',
    );

    const aplicacao = aplicacoes.find((a) => a.id === bloco.aplicacaoId);
    const urlBase = aplicacao && ambiente ? aplicacao.urls[ambiente.id] : undefined;

    return h(
      'section',
      { class: 'cartao editor-api', id: 'editor-api' },
      h(
        'header',
        { class: 'cartao-topo' },
        h('h2', {}, 'Pedido'),
        h(
          'div',
          { class: 'acoes' },
          h(
            'button',
            {
              type: 'button',
              class: 'botao botao-discreto-claro',
              onclick: async () => {
                const usos = jornadas.filter((j) => j.blocos.some((b) => b.blocoId === original.id)).map((j) => j.nome);
                const avisoUso = usos.length > 0 ? ` É usado em: ${usos.join(', ')}.` : '';
                if (!(await confirmar('Apagar bloco', `Apagar o bloco "${original.nome}"?${avisoUso}`))) return;
                await api.dados.apagar('blocos', original.id);
                blocoAbertoId = null;
                redesenhar();
              },
            },
            'Apagar bloco',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'botao',
              id: 'btn-codigo-api',
              onclick: () => mostrarCodigo(`Código do bloco "${bloco.nome}"`, codigoDoBloco(bloco, aplicacoes, estado.projeto.ambienteAtivo)),
            },
            'Ver código (.ts)',
          ),
          h(
            'button',
            {
              id: 'btn-guardar-api',
              type: 'button',
              class: 'botao botao-primario',
              onclick: async () => {
                if (await guardar()) redesenhar();
              },
            },
            'Guardar',
          ),
        ),
      ),
      aviso,
      h(
        'div',
        { class: 'grelha-api' },
        grupo('api-nome', 'Nome do bloco', texto('api-nome', bloco.nome, (v) => (bloco.nome = v))),
        grupo(
          'api-aplicacao',
          `Aplicação (ambiente ${ambiente?.nome ?? '?'})`,
          escolha('api-aplicacao', aplicacoesApi.map((a) => [a.id, a.nome] as [string, string]), bloco.aplicacaoId ?? '', (v) => (bloco.aplicacaoId = v)),
          urlBase ? `Endereço: ${urlBase}` : 'Esta aplicação não tem endereço neste ambiente.',
        ),
        grupo(
          'api-perfil',
          'Autenticação',
          escolha('api-perfil', [['', 'Sem autenticação'], ...perfis.map((p) => [p.id, p.nome] as [string, string])], pedido.perfilId ?? '', (v) => (pedido.perfilId = v || undefined)),
        ),
      ),
      h(
        'div',
        { class: 'linha-pedido' },
        escolha('api-metodo', METODOS.map((m) => [m, m] as [MetodoHttp, string]), pedido.metodo, (v) => (pedido.metodo = v), 'Método'),
        (() => {
          const campo = texto('api-url', pedido.url, (v) => (pedido.url = v), 'Caminho, por exemplo: /api/clientes/{ClienteId}');
          campo.setAttribute('aria-label', 'Caminho ou endereço');
          return campo;
        })(),
      ),
      h(
        'div',
        { class: 'grelha-api duas' },
        grupo('api-parametros', 'Parâmetros (um por linha: nome=valor)', area('api-parametros', paraTexto(pedido.parametros, '='), (v) => (pedido.parametros = paraPares(v, /=/)), 'nif={NIF}')),
        grupo('api-cabecalhos', 'Cabeçalhos (um por linha: Nome: valor)', area('api-cabecalhos', paraTexto(pedido.cabecalhos, ': '), (v) => (pedido.cabecalhos = paraPares(v, /:/)), 'Accept: application/json')),
      ),
      h(
        'div',
        { class: 'campo-grupo' },
        h('label', { for: 'api-corpo' }, 'Corpo do pedido'),
        escolha('api-tipo-corpo', TIPOS_CORPO, pedido.tipoCorpo, (v) => (pedido.tipoCorpo = v), 'Tipo de corpo'),
        area('api-corpo', pedido.corpo, (v) => (pedido.corpo = v), '{ "nome": "{Nome}", "nif": "{NIF}" }', 6),
        h('p', { class: 'ajuda-campo' }, 'Podes usar {variáveis} dos casos, {TESTE}, {RUN}, {DATA:yyyyMMdd} e variáveis calculadas em qualquer campo.'),
      ),
      h(
        'div',
        { class: 'campo-grupo' },
        h(
          'div',
          { class: 'titulo-linhas' },
          h('h3', {}, 'Verificações da resposta'),
          h(
            'button',
            {
              type: 'button',
              class: 'botao botao-pequeno-livre',
              id: 'btn-nova-verificacao',
              onclick: () => {
                const numeros = pedido.verificacoes.map((v) => Number(/^v(\d+)$/.exec(v.id)?.[1] ?? 0));
                pedido.verificacoes.push({ id: `v${Math.max(0, ...numeros) + 1}`, alvo: 'corpo', caminho: '', operador: 'igual', esperado: '' });
                desenharVerificacoes();
              },
            },
            'Acrescentar',
          ),
        ),
        listaVerificacoes,
      ),
      h(
        'div',
        { class: 'campo-grupo' },
        h(
          'div',
          { class: 'titulo-linhas' },
          h('h3', {}, 'Guardar da resposta em variáveis'),
          h(
            'button',
            {
              type: 'button',
              class: 'botao botao-pequeno-livre',
              id: 'btn-novo-guardar',
              onclick: () => {
                pedido.guardar.push({ variavel: '', caminho: '' });
                desenharGuardar();
              },
            },
            'Acrescentar',
          ),
        ),
        listaGuardar,
      ),
      h('div', { class: 'linha-testar' }, escolhaExemplo, botaoTestar),
      zonaResultado,
    );
  }

  function desenharResultado(zona: HTMLElement, r: ResultadoApi): void {
    const falhas = r.verificacoes.filter((v) => !v.ok).length;
    let bonito = r.resposta.corpo;
    try {
      bonito = JSON.stringify(JSON.parse(r.resposta.corpo), null, 2);
    } catch {
      // Não é JSON: mostra como veio.
    }
    zona.replaceChildren(
      h(
        'div',
        { class: 'resultado-api', 'data-estado': falhas > 0 ? 'ko' : 'ok' },
        h(
          'p',
          { class: 'resumo-api' },
          h('strong', { id: 'estado-http' }, `HTTP ${r.resposta.estado}`),
          ` em ${r.resposta.tempoMs} ms · `,
          r.verificacoes.length === 0 ? 'sem verificações' : falhas === 0 ? 'todas as verificações OK' : `${falhas} verificação(ões) falharam`,
        ),
        r.verificacoes.length > 0 &&
          h(
            'ul',
            { class: 'log-passos sem-numeros' },
            r.verificacoes.map((v) => h('li', { 'data-estado': v.ok ? 'ok' : 'ko' }, h('span', { class: 'marca-passo' }, v.ok ? 'OK' : 'KO'), v.descricao, !v.ok && h('span', { class: 'suave' }, ` obtido "${v.obtido}"`))),
          ),
        Object.keys(r.guardadas).length > 0 && h('p', { id: 'guardadas-api' }, 'Guardado: ', Object.entries(r.guardadas).map(([n, v]) => h('code', {}, `{${n}} = ${v}`))),
        h('h3', {}, 'Resposta'),
        h('pre', { class: 'codigo', tabindex: 0 }, h('code', {}, bonito || '(sem corpo)')),
        h(
          'details',
          {},
          h('summary', {}, 'Pedido enviado (segredos escondidos)'),
          h('pre', { class: 'codigo', tabindex: 0 }, h('code', {}, `${r.pedido.metodo} ${r.pedido.url}\n${Object.entries(r.pedido.cabecalhos).map(([n, v]) => `${n}: ${v}`).join('\n')}${r.pedido.corpo ? `\n\n${r.pedido.corpo}` : ''}`)),
        ),
      ),
    );
  }

  // ---------- Montagem ----------
  acoes.append(h('button', { id: 'btn-novo-bloco-api', type: 'button', class: 'botao botao-primario', onclick: () => void novoBloco() }, 'Novo bloco de API'));
  const aberto = blocosApi.find((b) => b.id === blocoAbertoId) ?? blocosApi[0];
  blocoAbertoId = aberto?.id ?? null;
  corpo.append(
    h(
      'div',
      { class: 'editor' },
      h(
        'div',
        { class: 'editor-principal' },
        aberto
          ? editor(aberto)
          : h(
              'div',
              { class: 'vazio' },
              h('p', { class: 'vazio-titulo' }, 'Ainda não há blocos de API'),
              h('p', {}, 'Um bloco de API faz um pedido (GET, POST, PUT, PATCH, DELETE) com os dados do caso, verifica a resposta e pode guardar valores para os blocos seguintes.'),
            ),
      ),
      h('aside', { class: 'editor-lateral' }, cartaoBlocos(), cartaoPerfis()),
    ),
  );
}
