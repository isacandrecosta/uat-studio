// Ecrã Jornadas: épicos com as suas jornadas, blocos partilhados e aplicações.
import type { Contexto } from '../app.js';
import { codigoDoBloco } from '../../shared/codigo.js';
import { confirmar, h, mostrarCodigo, pedirTexto, plural } from '../dom.js';

const NOMES_TIPO_BLOCO: Record<string, string> = { UI: 'UI', API: 'API', EMAIL: 'Email', VERIFICACAO: 'Verificação' };

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

  // Blocos partilhados
  corpo.append(
    h(
      'section',
      { class: 'cartao' },
      h('header', { class: 'cartao-topo' }, h('h2', {}, 'Blocos partilhados')),
      blocos.length === 0
        ? h('p', { class: 'suave' }, 'Ainda não há blocos. Os blocos de UI são criados no ecrã Gravar.')
        : h(
            'ul',
            { class: 'lista-itens' },
            blocos.map((bloco) => {
              const aplicacao = bloco.aplicacaoId ? aplicacaoPorId.get(bloco.aplicacaoId) : undefined;
              return h(
                'li',
                { class: 'item' },
                h('span', { class: 'tipo-bloco', 'data-tipo': bloco.tipo }, NOMES_TIPO_BLOCO[bloco.tipo] ?? bloco.tipo),
                h('span', { class: 'item-nome' }, bloco.nome),
                h(
                  'span',
                  { class: 'item-meta' },
                  aplicacao && h('span', {}, aplicacao.nome),
                  h('span', {}, plural(bloco.passos.length, 'passo')),
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
  corpo.append(
    h(
      'section',
      { class: 'cartao' },
      h('header', { class: 'cartao-topo' }, h('h2', {}, 'Aplicações')),
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
                h('span', { class: 'item-nome' }, a.nome),
                h('span', { class: 'item-meta item-url' }, a.urls[ambiente] ?? 'Sem endereço neste ambiente'),
              ),
            ),
          ),
    ),
  );
}
