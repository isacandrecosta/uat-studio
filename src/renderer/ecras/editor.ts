// Editor de jornada: compor o percurso com blocos da biblioteca, definir parâmetros e editar os casos.
import type { Aplicacao, Bloco, BlocoDaJornada, Caso, ConjuntoCasos, Jornada, Valor } from '../../shared/modelo.js';
import { SESSAO_PRINCIPAL } from '../../shared/modelo.js';
import { variaveisDaJornada, variaveisDoBloco } from '../../shared/variaveis.js';
import type { Contexto } from '../app.js';
import { codigoDaJornada } from '../../shared/codigo.js';
import { validarFormula } from '../../shared/formulas.js';
import { campoFiltro, confirmar, h, info, maisOpcoes, mensagemDeErro, mostrarCodigo, pedirTexto, plural } from '../dom.js';
import { passosEditaveis } from '../passos.js';

const NOMES_TIPO: Record<string, string> = { UI: 'UI', API: 'API', EMAIL: 'Email', VERIFICACAO: 'Verificação' };

/** Separador escolhido no editor (mantém-se ao mudar de cenário ou de ecrã). */
type PainelEditor = 'resumo' | 'passos' | 'casos';
let painelEditor: PainelEditor = 'passos';

export async function ecraEditor(contexto: Contexto): Promise<void> {
  const { corpo, acoes, selecao, irPara } = contexto;
  const dados = window.uatStudio.dados;
  const [jornadas, blocos, aplicacoes, epicos] = await Promise.all([
    dados.listar('jornadas'),
    dados.listar('blocos'),
    dados.listar('aplicacoes'),
    dados.listar('epicos'),
  ]);

  if (jornadas.length === 0) {
    corpo.append(
      h(
        'div',
        { class: 'vazio' },
        h('p', { class: 'vazio-titulo' }, 'Ainda não há cenários'),
        h('p', {}, 'Cria um cenário no ecrã Cenários (botão "Novo cenário" dentro de um épico).'),
        h('button', { type: 'button', class: 'botao', onclick: () => irPara('jornadas') }, 'Ir para Cenários'),
      ),
    );
    return;
  }

  const jornada: Jornada = jornadas.find((j) => j.id === selecao.jornadaId) ?? jornadas[0];
  selecao.jornadaId = jornada.id;
  contexto.definirCaminho([epicos.find((e) => e.id === jornada.epicoId)?.nome ?? 'Sem épico', jornada.nome]);
  const conjuntos = await dados.listar('casos');
  const calculadas = await window.uatStudio.variaveis.ler();
  const conjunto: ConjuntoCasos = conjuntos.find((c) => c.id === jornada.id) ?? { id: jornada.id, colunas: [], casos: [] };
  const blocoPorId = new Map<string, Bloco>(blocos.map((b) => [b.id, b]));
  const aplicacaoPorId = new Map<string, Aplicacao>(aplicacoes.map((a) => [a.id, a]));

  /** Blocos do percurso com a lista de passos aberta (mantém-se depois de gravar um passo). */
  const passosAbertos = new Set<number>();
  const guardarJornada = async (redesenhar = true): Promise<void> => {
    await dados.guardar('jornadas', jornada);
    if (redesenhar) await desenhar();
  };
  const guardarCasos = async (redesenhar = false): Promise<void> => {
    await dados.guardar('casos', conjunto);
    if (redesenhar) await desenhar();
  };

  // Escolher a jornada (cabeçalho)
  const escolha = h(
    'select',
    { id: 'editor-jornada', class: 'campo', 'aria-label': 'Cenário' },
    jornadas.map((j) => {
      const epico = epicos.find((e) => e.id === j.epicoId);
      return h('option', { value: j.id, selected: j.id === jornada.id }, `${epico ? `${epico.nome} › ` : ''}${j.nome}`);
    }),
  );
  escolha.addEventListener('change', () => {
    selecao.jornadaId = escolha.value;
    irPara('editor');
  });
  acoes.append(
    escolha,
    h(
      'button',
      {
        id: 'btn-ver-codigo',
        type: 'button',
        class: 'botao',
        onclick: () =>
          mostrarCodigo(
            `Código do cenário "${jornada.nome}"`,
            codigoDaJornada(jornada, blocos, aplicacoes, conjunto, contexto.estado.projeto.ambienteAtivo),
          ),
      },
      'Ver código (.ts)',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'botao botao-discreto-claro',
        onclick: async () => {
          if (!(await confirmar('Apagar cenário', `Apagar o cenário "${jornada.nome}" e os seus casos? Os blocos não são apagados.`))) return;
          await dados.apagar('casos', jornada.id);
          await dados.apagar('jornadas', jornada.id);
          selecao.jornadaId = undefined;
          irPara('jornadas');
        },
      },
      'Apagar cenário',
    ),
  );

  const zona = h('div', { class: 'editor-zona' });
  corpo.append(zona);
  await desenhar();

  async function desenhar(): Promise<void> {
    const variaveis = variaveisDaJornada(jornada, blocos, calculadas);
    // Colunas dos casos: as que já existem e as que a jornada precisa.
    for (const nome of variaveis.necessarias) if (!conjunto.colunas.includes(nome)) conjunto.colunas.push(nome);
    // Separadores: Resumo (o que é o teste) · Passos (o percurso de blocos) · Casos de teste (os dados).
    // Os três painéis existem sempre na página (só os não escolhidos ficam escondidos).
    const numeroCasos = conjunto.casos.length;
    const separador = (id: PainelEditor, nome: string): HTMLElement =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'separador',
          'data-painel': id,
          'aria-selected': String(painelEditor === id),
          onclick: () => {
            painelEditor = id;
            void desenhar();
          },
        },
        nome,
      );
    zona.replaceChildren(
      h(
        'div',
        { class: 'separadores separadores-editor', role: 'tablist', 'aria-label': 'Partes do cenário' },
        separador('resumo', 'Resumo'),
        separador('passos', `Passos (${plural(jornada.blocos.length, 'bloco')})`),
        separador('casos', `Casos de teste (${numeroCasos})`),
      ),
      h('div', { class: 'editor', 'data-painel': 'resumo', hidden: painelEditor !== 'resumo' }, h('div', { class: 'editor-principal' }, cartaoPropriedades())),
      h(
        'div',
        { class: 'editor', 'data-painel': 'passos', hidden: painelEditor !== 'passos' },
        h('div', { class: 'editor-principal' }, cartaoPercurso(variaveis.blocosEmFalta)),
        h('aside', { class: 'editor-lateral' }, cartaoBiblioteca(), cartaoVariaveis(variaveis.necessarias, variaveis.produzidas, variaveis.calculadas)),
      ),
      h('div', { class: 'editor', 'data-painel': 'casos', hidden: painelEditor !== 'casos' }, h('div', { class: 'editor-principal' }, cartaoCasos(variaveis.necessarias))),
    );
  }

  function cartaoPropriedades(): HTMLElement {
    const campo = (id: string, rotulo: string, valor: string, aoMudar: (v: string) => void, ajuda = ''): HTMLElement => {
      const input = h('input', { id, type: 'text', class: 'campo', value: valor, maxlength: 120, placeholder: ajuda });
      input.addEventListener('change', () => {
        aoMudar(input.value.trim());
        void guardarJornada(false);
      });
      return h('div', { class: 'campo-grupo' }, h('label', { for: id }, rotulo), input);
    };
    return h(
      'section',
      { class: 'cartao' },
      h(
        'div',
        { class: 'grelha-campos' },
        campo('jornada-nome', 'Nome do cenário', jornada.nome, (v) => {
          if (v) jornada.nome = v;
        }),
        campo(
          'jornada-etiquetas',
          'Etiquetas (separadas por vírgulas)',
          jornada.etiquetas.join(', '),
          (v) => {
            jornada.etiquetas = v.split(',').map((e) => e.trim()).filter(Boolean);
          },
          'Por exemplo: crédito, FO',
        ),
        campo(
          'jornada-requisito',
          'ID do requisito (opcional)',
          jornada.requisitoId ?? '',
          (v) => {
            jornada.requisitoId = v || undefined;
          },
          'Por exemplo: REQ-123',
        ),
      ),
      descricaoDaJornada(),
    );
  }

  /** Descrição em texto corrido: objetivo, pré-condições e dados de que o teste precisa. */
  function descricaoDaJornada(): HTMLElement {
    const area = h(
      'textarea',
      { id: 'jornada-descricao', class: 'campo campo-area', rows: 3, maxlength: 4000, placeholder: 'Objetivo do teste, pré-condições (por exemplo, utilizador com perfil Aprovador) e dados de que precisa.' },
      jornada.descricao ?? '',
    );
    area.addEventListener('change', () => {
      jornada.descricao = area.value.trim() || undefined;
      void guardarJornada(false);
    });
    return h('div', { class: 'campo-grupo campo-largo' }, h('label', { for: 'jornada-descricao' }, 'Descrição do teste'), area);
  }

  function linhaParametro(item: BlocoDaJornada, nome: string): HTMLElement {
    const atual: Valor | undefined = item.parametros?.[nome];
    const modo = atual?.tipo === 'fixo' ? 'fixo' : atual?.tipo === 'variavel' ? 'coluna' : atual?.tipo === 'formula' ? 'formula' : 'igual';
    const ajudas: Record<string, string> = { coluna: 'Nome da coluna', fixo: 'Valor', formula: 'Por exemplo: "cliente_" & {TESTE}' };
    const escolhaModo = h(
      'select',
      { class: 'campo', 'aria-label': `De onde vem ${nome}` },
      h('option', { value: 'igual', selected: modo === 'igual' }, `Coluna "${nome}" dos casos`),
      h('option', { value: 'coluna', selected: modo === 'coluna' }, 'Outra coluna'),
      h('option', { value: 'fixo', selected: modo === 'fixo' }, 'Valor fixo'),
      h('option', { value: 'formula', selected: modo === 'formula' }, 'Fórmula'),
    );
    const valor = h('input', {
      type: 'text',
      class: 'campo',
      'aria-label': `Valor para ${nome}`,
      value: atual?.tipo === 'fixo' ? atual.valor : atual?.tipo === 'variavel' ? atual.nome : atual?.tipo === 'formula' ? atual.expressao : '',
      placeholder: ajudas[modo] ?? '',
      hidden: modo === 'igual',
    });
    const erroFormula = h('p', { class: 'erro-campo', role: 'alert', hidden: true });
    const aplicar = async (): Promise<void> => {
      const parametros = { ...(item.parametros ?? {}) };
      const texto = valor.value.trim();
      erroFormula.hidden = true;
      if (escolhaModo.value === 'formula') {
        if (!texto) return;
        const erro = validarFormula(texto);
        if (erro) {
          erroFormula.textContent = erro;
          erroFormula.hidden = false;
          return;
        }
        parametros[nome] = { tipo: 'formula', expressao: texto };
      } else if (escolhaModo.value === 'fixo') parametros[nome] = { tipo: 'fixo', valor: valor.value };
      else if (escolhaModo.value === 'coluna' && texto) parametros[nome] = { tipo: 'variavel', nome: texto.replace(/^\{|\}$/g, '') };
      else delete parametros[nome];
      item.parametros = Object.keys(parametros).length > 0 ? parametros : undefined;
      await guardarJornada(true);
    };
    escolhaModo.addEventListener('change', () => {
      valor.hidden = escolhaModo.value === 'igual';
      valor.placeholder = ajudas[escolhaModo.value] ?? '';
      if (escolhaModo.value === 'igual') void aplicar();
      else valor.focus();
    });
    valor.addEventListener('change', () => void aplicar());
    return h('div', { class: 'parametro' }, h('code', {}, `{${nome}}`), escolhaModo, valor, erroFormula);
  }

  /** Condição ("só se...") e limpeza ("corre sempre") de um bloco nesta jornada. */
  function opcoesDoBloco(item: BlocoDaJornada, indice: number): HTMLElement {
    const erro = h('p', { class: 'erro-campo', role: 'alert', hidden: true });
    const condicao = h('input', {
      type: 'text',
      class: 'campo campo-formula',
      value: item.condicao ?? '',
      placeholder: 'Sempre. Ou, por exemplo: {Variante} = "CP12"',
      'aria-label': `Condição do bloco ${indice + 1}`,
      spellcheck: 'false',
    });
    condicao.addEventListener('change', () => {
      const texto = condicao.value.trim();
      const problema = texto ? validarFormula(texto) : null;
      erro.hidden = !problema;
      erro.textContent = problema ?? '';
      if (problema) return;
      item.condicao = texto || undefined;
      void guardarJornada(true);
    });
    const sempre = h('input', { type: 'checkbox', checked: Boolean(item.sempre) });
    sempre.addEventListener('change', () => {
      item.sempre = sempre.checked || undefined;
      void guardarJornada(false);
    });
    // Sessão do browser: pessoas diferentes na mesma jornada (só para blocos de UI).
    const eUi = blocos.find((b) => b.id === item.blocoId)?.tipo === 'UI';
    const usadas = [...new Set([SESSAO_PRINCIPAL, ...jornada.blocos.map((b) => b.sessao?.trim()).filter((s): s is string => Boolean(s))])];
    const idLista = `sessoes-${indice}`;
    const sessao = h('input', {
      type: 'text',
      class: 'campo campo-sessao',
      value: item.sessao ?? '',
      placeholder: SESSAO_PRINCIPAL,
      list: idLista,
      'aria-label': `Sessão do browser do bloco ${indice + 1}`,
      spellcheck: 'false',
    });
    sessao.addEventListener('change', () => {
      const nome = sessao.value.trim();
      item.sessao = nome && nome !== SESSAO_PRINCIPAL ? nome : undefined;
      void guardarJornada(true);
    });
    // Opções pouco usadas ficam em "Mais opções"; fechado, o resumo mostra o que está definido.
    const resumo = [item.condicao ? 'só se' : '', item.sessao ? `sessão ${item.sessao}` : '', item.sempre ? 'limpeza' : ''].filter(Boolean);
    return h(
      'div',
      { class: 'opcoes-bloco' },
      maisOpcoes(
        resumo,
        h('label', { class: 'opcao-condicao' }, h('span', {}, 'Só se', info('O bloco só corre quando a condição se cumpre para o caso. Por exemplo {Decisao} = "Aprovar". Vazio: corre sempre.')), condicao),
        eUi &&
          h(
            'label',
            { class: 'opcao-condicao' },
            h('span', {}, 'Sessão', info('Blocos com sessões diferentes correm em browsers separados (por exemplo "cliente" e "aprovador"), cada um com o seu login. Vazio: a sessão principal.')),
            sessao,
            h('datalist', { id: idLista }, usadas.map((s) => h('option', { value: s }))),
          ),
        h('label', { class: 'opcao' }, sempre, 'Limpeza: corre sempre', info('Para blocos que arrumam os dados no fim: correm mesmo que um bloco anterior tenha dado erro, e uma falha deles não muda o resultado.')),
      ),
      erro,
    );
  }

  function cartaoPercurso(emFalta: string[]): HTMLElement {
    const mover = async (indice: number, delta: number): Promise<void> => {
      const destino = indice + delta;
      if (destino < 0 || destino >= jornada.blocos.length) return;
      const [item] = jornada.blocos.splice(indice, 1);
      jornada.blocos.splice(destino, 0, item);
      await guardarJornada();
    };
    const itens = jornada.blocos.map((item, indice) => {
      const bloco = blocoPorId.get(item.blocoId);
      const aplicacao = bloco?.aplicacaoId ? aplicacaoPorId.get(bloco.aplicacaoId) : undefined;
      const usa = bloco ? variaveisDoBloco(bloco).usa : [];
      const produz = bloco ? variaveisDoBloco(bloco).produz : [];
      return h(
        'li',
        { class: 'bloco-percurso', 'data-bloco': item.blocoId },
        h(
          'div',
          { class: 'bloco-topo' },
          h('span', { class: 'passo-numero' }, indice + 1),
          h('span', { class: 'tipo-bloco', 'data-tipo': aplicacao?.tipo ?? bloco?.tipo ?? '' }, bloco ? (NOMES_TIPO[bloco.tipo] ?? bloco.tipo) : '?'),
          h(
            'div',
            { class: 'bloco-nome' },
            h('strong', {}, bloco?.nome ?? `Bloco apagado (${item.blocoId})`),
            bloco && h('span', { class: 'suave' }, `${aplicacao ? `${aplicacao.nome} · ` : ''}${plural(bloco.passos.length, 'passo')}`),
          ),
          h(
            'div',
            { class: 'acoes' },
            h('button', { type: 'button', class: 'botao botao-icone', disabled: indice === 0, 'aria-label': 'Mover para cima', title: 'Mover para cima', onclick: () => void mover(indice, -1) }, '↑'),
            h('button', { type: 'button', class: 'botao botao-icone', disabled: indice === jornada.blocos.length - 1, 'aria-label': 'Mover para baixo', title: 'Mover para baixo', onclick: () => void mover(indice, 1) }, '↓'),
            h(
              'button',
              {
                type: 'button',
                class: 'botao botao-discreto-claro',
                onclick: async () => {
                  jornada.blocos.splice(indice, 1);
                  await guardarJornada();
                },
              },
              'Retirar',
            ),
          ),
        ),
        bloco &&
          bloco.passos.length > 0 &&
          h(
            'details',
            {
              class: 'passos-do-bloco',
              open: passosAbertos.has(indice),
              ontoggle: (e: Event) => {
                if ((e.currentTarget as HTMLDetailsElement).open) passosAbertos.add(indice);
                else passosAbertos.delete(indice);
              },
            },
            h('summary', {}, `Passos (${bloco.passos.length})`),
            passosEditaveis(bloco, jornadas.filter((j) => j.blocos.some((b) => b.blocoId === bloco.id)).length, async () => {
              await dados.guardar('blocos', bloco);
              passosAbertos.add(indice);
              await desenhar();
            }),
          ),
        usa.length > 0 &&
          h(
            'details',
            { class: 'parametros', open: Boolean(item.parametros) },
            h('summary', {}, `Parâmetros (${usa.length})`),
            usa.map((nome) => linhaParametro(item, nome)),
          ),
        produz.length > 0 && h('p', { class: 'suave produz' }, 'Guarda: ', produz.map((n) => h('code', {}, `{${n}}`))),
        opcoesDoBloco(item, indice),
      );
    });
    return h(
      'section',
      { class: 'cartao' },
      h('header', { class: 'cartao-topo' }, h('h2', {}, 'Percurso', info("Os blocos do cenário, pela ordem em que correm. Cada bloco pode ter parâmetros e, em \"Mais opções\", uma condição, uma sessão ou ser de limpeza.")), h('span', { class: 'etiqueta' }, plural(jornada.blocos.length, 'bloco'))),
      emFalta.length > 0 && h('p', { class: 'aviso-erro', role: 'alert' }, 'Há blocos neste cenário que já não existem. Retira-os do percurso.'),
      jornada.blocos.length === 0
        ? h('p', { class: 'suave' }, 'O cenário ainda não tem blocos. Acrescenta-os a partir da biblioteca, à direita.')
        : h('ol', { id: 'percurso', class: 'percurso' }, itens),
    );
  }

  function cartaoBiblioteca(): HTMLElement {
    return h(
      'section',
      { class: 'cartao' },
      h('header', { class: 'cartao-topo' }, h('h2', {}, 'Biblioteca de blocos', info('Os blocos de todos os cenários. "Acrescentar" põe o bloco no fim do percurso; a ordem muda-se com as setas.'))),
      blocos.length > 6 && h('div', { class: 'barra-filtros' }, campoFiltro('Procurar bloco', () => document.querySelectorAll<HTMLElement>('#lista-biblioteca > li'))),
      blocos.length === 0
        ? h('p', { class: 'suave' }, 'Ainda não há blocos. Cria-os no ecrã Gravar.')
        : h(
            'ul',
            { class: 'lista-itens', id: 'lista-biblioteca' },
            blocos.map((bloco) => {
              const aplicacao = bloco.aplicacaoId ? aplicacaoPorId.get(bloco.aplicacaoId) : undefined;
              return h(
                'li',
                { class: 'item' },
                h('span', { class: 'tipo-bloco', 'data-tipo': aplicacao?.tipo ?? bloco.tipo }, NOMES_TIPO[bloco.tipo] ?? bloco.tipo),
                h('span', { class: 'item-nome' }, bloco.nome),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'botao botao-pequeno',
                    'data-adicionar': bloco.id,
                    'aria-label': `Acrescentar "${bloco.nome}" ao cenário`,
                    onclick: async () => {
                      const numeros = jornada.blocos.map((b) => Number(/^b(\d+)$/.exec(b.id)?.[1] ?? 0));
                      jornada.blocos.push({ id: `b${Math.max(0, ...numeros) + 1}`, blocoId: bloco.id });
                      await guardarJornada();
                    },
                  },
                  'Acrescentar',
                ),
              );
            }),
          ),
    );
  }

  function cartaoVariaveis(necessarias: string[], produzidas: string[], porFormula: string[]): HTMLElement {
    return h(
      'section',
      { class: 'cartao' },
      h('header', { class: 'cartao-topo' }, h('h2', {}, 'Variáveis', info("Vêm dos casos: colunas de que os blocos precisam. Guardadas durante o cenário: valores lidos do ecrã ou de uma API (por exemplo {PedidoId})."))),
      h('h3', {}, 'Vêm dos casos'),
      necessarias.length === 0 ? h('p', { class: 'suave' }, 'Nenhuma.') : h('p', { class: 'lista-codigo' }, necessarias.map((n) => h('code', {}, `{${n}}`))),
      h('h3', {}, 'Guardadas durante o cenário'),
      produzidas.length === 0 ? h('p', { class: 'suave' }, 'Nenhuma.') : h('p', { class: 'lista-codigo' }, produzidas.map((n) => h('code', {}, `{${n}}`))),
      porFormula.length > 0 && h('h3', {}, 'Calculadas por fórmula (Dados de teste)'),
      porFormula.length > 0 && h('p', { class: 'lista-codigo' }, porFormula.map((n) => h('code', {}, `{${n}}`))),
    );
  }

  function cartaoCasos(necessarias: string[]): HTMLElement {
    const celula = (valor: string, rotulo: string, aoMudar: (v: string, input: HTMLInputElement) => void, classe = ''): HTMLElement => {
      const input = h('input', { type: 'text', class: `celula ${classe}`, value: valor, 'aria-label': rotulo });
      input.addEventListener('change', () => aoMudar(input.value, input));
      return h('td', {}, input);
    };
    const linha = (caso: Caso, indice: number): HTMLElement =>
      h(
        'tr',
        {},
        celula(caso.id, `ID do caso ${indice + 1}`, (v, input) => {
          const novo = v.trim();
          if (!novo || conjunto.casos.some((c) => c !== caso && c.id === novo)) {
            input.value = caso.id; // id vazio ou repetido: volta ao anterior
            return;
          }
          caso.id = novo;
          void guardarCasos();
        }, 'celula-id'),
        celula(caso.nome ?? '', `Descrição do caso ${caso.id}`, (v) => {
          caso.nome = v.trim() || undefined;
          void guardarCasos();
        }, 'celula-larga'),
        conjunto.colunas.map((coluna) =>
          celula(caso.dados[coluna] ?? '', `${coluna} do caso ${caso.id}`, (v) => {
            caso.dados[coluna] = v;
            void guardarCasos();
          }),
        ),
        celula(caso.etiquetas.join(', '), `Etiquetas do caso ${caso.id}`, (v) => {
          caso.etiquetas = v.split(',').map((e) => e.trim()).filter(Boolean);
          void guardarCasos();
        }),
        h(
          'td',
          { class: 'celula-acoes' },
          h(
            'button',
            {
              type: 'button',
              class: 'botao botao-pequeno-livre botao-duplicar-caso',
              'aria-label': `Duplicar o caso ${caso.id}`,
              title: 'Criar uma cópia deste caso logo a seguir (com um ID novo), para mudar só o que for diferente.',
              onclick: async () => {
                conjunto.casos.splice(indice + 1, 0, { ...structuredClone(caso), id: proximoIdCaso(), nome: caso.nome ? `${caso.nome} (cópia)` : undefined });
                await guardarCasos(true);
              },
            },
            'Duplicar',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'botao botao-discreto-claro',
              'aria-label': `Apagar o caso ${caso.id}`,
              onclick: async () => {
                conjunto.casos.splice(indice, 1);
                await guardarCasos(true);
              },
            },
            'Apagar',
          ),
        ),
      );

    /** O próximo ID livre (TC0001, TC0002, ...). */
    function proximoIdCaso(): string {
      const numeros = conjunto.casos.map((c) => Number(/(\d+)$/.exec(c.id)?.[1] ?? 0));
      return `TC${String(Math.max(0, ...numeros) + 1).padStart(4, '0')}`;
    }
    const novoCaso = async (): Promise<void> => {
      conjunto.casos.push({ id: proximoIdCaso(), etiquetas: [], dados: {} });
      await guardarCasos(true);
    };
    const novaColuna = async (): Promise<void> => {
      const nome = (await pedirTexto('Nova coluna', 'Nome da coluna (sem espaços)'))?.replace(/^\{|\}$/g, '');
      if (!nome || conjunto.colunas.includes(nome)) return;
      conjunto.colunas.push(nome);
      await guardarCasos(true);
    };
    const removerColuna = async (coluna: string): Promise<void> => {
      if (!(await confirmar('Apagar coluna', `Apagar a coluna "${coluna}" e os valores de todos os casos?`))) return;
      conjunto.colunas = conjunto.colunas.filter((c) => c !== coluna);
      for (const caso of conjunto.casos) delete caso.dados[coluna];
      await guardarCasos(true);
    };

    return h(
      'section',
      { class: 'cartao' },
      h(
        'header',
        { class: 'cartao-topo' },
        h('div', {}, h('h2', {}, 'Casos de teste'), h('p', { class: 'suave' }, 'Cada linha é um caso de teste: o cenário corre uma vez por linha, com estes dados e valores esperados.')),
        h(
          'div',
          { class: 'acoes' },
          h(
            'button',
            {
              type: 'button',
              class: 'botao',
              title: '1.ª linha com os nomes das colunas. Substitui os casos atuais.',
              onclick: async () => {
                if (conjunto.casos.length > 0 && !(await confirmar('Importar Excel', `Os ${conjunto.casos.length} casos atuais são substituídos pelos do Excel.`, 'Substituir'))) return;
                try {
                  const feito = await window.uatStudio.casos.importar(jornada.id);
                  if (!feito) return;
                  irPara('editor');
                } catch (e) {
                  await confirmar('Não foi possível importar', mensagemDeErro(e), 'Fechar');
                }
              },
            },
            'Importar Excel',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'botao',
              disabled: conjunto.casos.length === 0,
              onclick: async () => {
                try {
                  await window.uatStudio.casos.exportar(jornada.id);
                } catch (e) {
                  await confirmar('Não foi possível exportar', mensagemDeErro(e), 'Fechar');
                }
              },
            },
            'Exportar Excel',
          ),
          h('button', { type: 'button', class: 'botao', onclick: () => void novaColuna() }, 'Nova coluna'),
          h(
            'button',
            {
              id: 'btn-correr-jornada',
              type: 'button',
              class: 'botao botao-primario',
              disabled: conjunto.casos.length === 0 || jornada.blocos.length === 0,
              onclick: () => irPara('runs'),
            },
            'Correr…',
          ),
          h('button', { id: 'btn-novo-caso', type: 'button', class: 'botao', onclick: () => void novoCaso() }, 'Novo caso'),
        ),
      ),
      conjunto.casos.length === 0
        ? h('p', { class: 'suave' }, 'Ainda não há casos.')
        : h(
            'div',
            { class: 'tabela-caixa' },
            h(
              'table',
              { id: 'tabela-casos', class: 'tabela' },
              h(
                'thead',
                {},
                h(
                  'tr',
                  {},
                  h('th', {}, 'ID'),
                  h('th', {}, 'Descrição'),
                  conjunto.colunas.map((coluna) =>
                    h(
                      'th',
                      {},
                      coluna,
                      !necessarias.includes(coluna) &&
                        h('button', { type: 'button', class: 'botao-mini', 'aria-label': `Apagar a coluna ${coluna}`, title: 'Apagar coluna (o cenário não a usa)', onclick: () => void removerColuna(coluna) }, '×'),
                    ),
                  ),
                  h('th', {}, 'Etiquetas'),
                  h('th', { 'aria-label': 'Ações' }),
                ),
              ),
              h('tbody', {}, conjunto.casos.map(linha)),
            ),
          ),
    );
  }
}
