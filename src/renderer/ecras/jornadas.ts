// Ecrã Jornadas: épicos com as suas jornadas, blocos partilhados e aplicações.
import type { Contexto } from '../app.js';
import { codigoDoBloco } from '../../shared/codigo.js';
import { ondeEUsado } from '../../shared/blocos.js';
import { confirmar, h, mostrarCodigo, mostrarUsos, pedirFormulario, pedirTexto, plural } from '../dom.js';

const NOMES_TIPO_BLOCO: Record<string, string> = { UI: 'UI', API: 'API', EMAIL: 'Email', VERIFICACAO: 'Verificação', MANUAL: 'Manual' };

export async function ecraJornadas({ estado, corpo, acoes, atualizar, selecao, irPara }: Contexto): Promise<void> {
  const dados = window.uatStudio.dados;
  const [epicos, jornadas, blocos, aplicacoes, conjuntos] = await Promise.all([
    dados.listar('epicos'),
    dados.listar('jornadas'),
    dados.listar('blocos'),
    dados.listar('aplicacoes'),
    dados.listar('casos'),
  ]);
  const numeroDeCasos = (jornadaId: string): number => conjuntos.find((c) => c.id === jornadaId)?.casos.length ?? 0;
  const aplicacaoPorId = new Map(aplicacoes.map((a) => [a.id, a]));

  acoes.append(
    h(
      'button',
      {
        id: 'btn-novo-epico',
        type: 'button',
        class: 'botao botao-primario',
        onclick: async () => {
          const nome = await pedirTexto('Novo épico', 'Nome do épico');
          if (!nome) return;
          await dados.guardar('epicos', { nome });
          await atualizar();
        },
      },
      'Novo épico',
    ),
  );

  // Épicos e jornadas
  if (epicos.length === 0) {
    corpo.append(
      h(
        'div',
        { class: 'vazio' },
        h('p', { class: 'vazio-titulo' }, 'Ainda não há épicos'),
        h('p', {}, 'Um épico é uma pasta de jornadas (por exemplo, "Crédito Pessoal"). Cria o primeiro com "Novo épico".'),
      ),
    );
  }
  for (const epico of epicos) {
    const doEpico = jornadas.filter((j) => j.epicoId === epico.id);
    corpo.append(
      h(
        'section',
        { class: 'cartao cartao-epico' },
        h(
          'header',
          { class: 'cartao-topo' },
          h('div', {}, h('h2', {}, epico.nome), epico.descricao && h('p', { class: 'suave' }, epico.descricao)),
          h(
            'div',
            { class: 'acoes' },
            h(
              'button',
              {
                type: 'button',
                class: 'botao',
                onclick: async () => {
                  const nome = await pedirTexto('Nova jornada', `Nome da jornada em "${epico.nome}"`);
                  if (!nome) return;
                  const nova = await dados.guardar('jornadas', { nome, epicoId: epico.id, etiquetas: [], blocos: [] });
                  selecao.jornadaId = nova.id;
                  irPara('editor');
                },
              },
              'Nova jornada',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'botao botao-discreto-claro',
                disabled: doEpico.length > 0,
                title: doEpico.length > 0 ? 'Só é possível apagar um épico sem jornadas.' : '',
                onclick: async () => {
                  if (!(await confirmar('Apagar épico', `Apagar o épico "${epico.nome}"?`))) return;
                  await dados.apagar('epicos', epico.id);
                  await atualizar();
                },
              },
              'Apagar',
            ),
          ),
        ),
        doEpico.length === 0
          ? h('p', { class: 'suave' }, 'Sem jornadas.')
          : h(
              'ul',
              { class: 'lista-itens' },
              doEpico.map((jornada) =>
                h(
                  'li',
                  { class: 'item' },
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'ligacao item-nome',
                      'data-jornada': jornada.id,
                      title: 'Abrir no editor de jornada',
                      onclick: () => {
                        selecao.jornadaId = jornada.id;
                        irPara('editor');
                      },
                    },
                    jornada.nome,
                  ),
                  h(
                    'span',
                    { class: 'item-meta' },
                    jornada.etiquetas.map((e) => h('span', { class: 'etiqueta' }, e)),
                    h('span', {}, plural(jornada.blocos.length, 'bloco')),
                    h('span', {}, plural(numeroDeCasos(jornada.id), 'caso')),
                  ),
                ),
              ),
            ),
      ),
    );
  }

  /** Criar ou alterar um bloco "passo manual" (a execução pára e o testador confirma OK/KO). */
  const editarManual = async (existente?: (typeof blocos)[number]): Promise<void> => {
    const valores = await pedirFormulario(existente ? `Passo manual "${existente.nome}"` : 'Novo passo manual', [
      { id: 'nome', rotulo: 'Nome', valor: existente?.nome, obrigatorio: true, ajuda: 'Por exemplo: Confirmar o PDF do contrato' },
      {
        id: 'instrucao',
        rotulo: 'Instrução para o testador',
        tipo: 'area',
        valor: existente?.manual?.instrucao,
        obrigatorio: true,
        ajuda: 'Pode ter {variáveis} do caso, por exemplo: Confirme que o pedido {PedidoId} chegou ao email do cliente.',
      },
    ]);
    if (!valores?.nome.trim() || !valores.instrucao.trim()) return;
    await dados.guardar('blocos', { ...(existente ?? { passos: [] }), nome: valores.nome.trim(), tipo: 'MANUAL', manual: { instrucao: valores.instrucao.trim() } });
    await atualizar();
  };

  // Blocos partilhados
  corpo.append(
    h(
      'section',
      { class: 'cartao' },
      h(
        'header',
        { class: 'cartao-topo' },
        h('h2', {}, 'Blocos partilhados'),
        h('button', { id: 'btn-novo-manual', type: 'button', class: 'botao', title: 'A execução pára neste bloco e o testador confirma OK ou KO.', onclick: () => void editarManual() }, 'Novo passo manual'),
      ),
      blocos.length === 0
        ? h('p', { class: 'suave' }, 'Ainda não há blocos. Os blocos de UI são criados no ecrã Gravar.')
        : h(
            'ul',
            { class: 'lista-itens' },
            blocos.map((bloco) => {
              const aplicacao = bloco.aplicacaoId ? aplicacaoPorId.get(bloco.aplicacaoId) : undefined;
              const usos = ondeEUsado(bloco.id, jornadas, epicos, conjuntos);
              return h(
                'li',
                { class: 'item' },
                h('span', { class: 'tipo-bloco', 'data-tipo': bloco.tipo }, NOMES_TIPO_BLOCO[bloco.tipo] ?? bloco.tipo),
                bloco.tipo === 'MANUAL'
                  ? h('button', { type: 'button', class: 'ligacao item-nome', 'data-manual': bloco.id, title: 'Alterar o passo manual', onclick: () => void editarManual(bloco) }, bloco.nome)
                  : h('span', { class: 'item-nome' }, bloco.nome),
                h(
                  'span',
                  { class: 'item-meta' },
                  aplicacao && h('span', {}, aplicacao.nome),
                  (bloco.tipo === 'UI' || bloco.tipo === 'VERIFICACAO') && h('span', {}, plural(bloco.passos.length, 'passo')),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'botao botao-pequeno-livre',
                      'data-usos': bloco.id,
                      'data-sem-uso': String(usos.length === 0),
                      title: 'Ver as jornadas que usam este bloco',
                      onclick: () =>
                        mostrarUsos(bloco.nome, usos, (jornadaId) => {
                          selecao.jornadaId = jornadaId;
                          irPara('editor');
                        }),
                    },
                    usos.length === 0 ? 'Não usado' : `Usado em ${plural(usos.length, 'jornada')}`,
                  ),
                  bloco.tipo === 'UI' &&
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'botao botao-pequeno-livre',
                        'data-codigo': bloco.id,
                        'aria-label': `Ver código do bloco ${bloco.nome}`,
                        onclick: () => mostrarCodigo(`Código do bloco "${bloco.nome}"`, codigoDoBloco(bloco, aplicacoes, estado.projeto.ambienteAtivo)),
                      },
                      'Ver código (.ts)',
                    ),
                ),
              );
            }),
          ),
    ),
  );

  // Aplicações
  const ambiente = estado.projeto.ambienteAtivo;
  const nomeAmbiente = estado.projeto.ambientes.find((a) => a.id === ambiente)?.nome ?? ambiente;
  const CORES: Record<string, string> = { FO: '#2f6bed', BO: '#e07b00', API: '#1a8f4c', EMAIL: '#7b4bd1' };
  /** Criar ou alterar uma aplicação (o endereço é o do ambiente ativo). */
  const editarAplicacao = async (existente?: (typeof aplicacoes)[number]): Promise<void> => {
    const valores = await pedirFormulario(existente ? `Aplicação "${existente.nome}"` : 'Nova aplicação', [
      { id: 'nome', rotulo: 'Nome', valor: existente?.nome, obrigatorio: true, ajuda: 'Por exemplo: Portal Front Office' },
      {
        id: 'tipo',
        rotulo: 'Tipo',
        tipo: 'escolha',
        valor: existente?.tipo ?? 'FO',
        opcoes: [
          { valor: 'FO', texto: 'Front Office (browser)' },
          { valor: 'BO', texto: 'Backoffice (browser)' },
          { valor: 'API', texto: 'API' },
          { valor: 'EMAIL', texto: 'Caixa de email' },
        ],
      },
      { id: 'url', rotulo: `Endereço no ambiente ${nomeAmbiente}`, valor: existente?.urls[ambiente], ajuda: 'Por exemplo: https://qa.exemplo.pt/Portal. Cada ambiente tem o seu endereço.' },
    ]);
    if (!valores?.nome.trim()) return;
    const tipo = valores.tipo as (typeof aplicacoes)[number]['tipo'];
    const urls = { ...(existente?.urls ?? {}) };
    if (valores.url.trim()) urls[ambiente] = valores.url.trim();
    else delete urls[ambiente];
    await dados.guardar('aplicacoes', { ...(existente ? { id: existente.id } : {}), nome: valores.nome.trim(), tipo, cor: CORES[tipo], urls });
    await atualizar();
  };
  corpo.append(
    h(
      'section',
      { class: 'cartao' },
      h(
        'header',
        { class: 'cartao-topo' },
        h('h2', {}, 'Aplicações'),
        h('button', { id: 'btn-nova-aplicacao', type: 'button', class: 'botao', onclick: () => void editarAplicacao() }, 'Nova aplicação'),
      ),
      aplicacoes.length === 0
        ? h('p', { class: 'suave' }, 'Ainda não há aplicações (os sistemas a testar).')
        : h(
            'ul',
            { class: 'lista-itens' },
            aplicacoes.map((a) =>
              h(
                'li',
                { class: 'item' },
                h('span', { class: 'tipo-bloco', 'data-tipo': a.tipo }, a.tipo),
                h('button', { type: 'button', class: 'ligacao item-nome', title: 'Alterar a aplicação', onclick: () => void editarAplicacao(a) }, a.nome),
                h('span', { class: 'item-meta item-url' }, a.urls[ambiente] ?? 'Sem endereço neste ambiente'),
              ),
            ),
          ),
    ),
  );
}
