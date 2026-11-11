// Ecrã Jornadas: épicos com as suas jornadas, blocos partilhados e aplicações.
import type { Contexto } from '../app.js';
import { codigoDoBloco } from '../../shared/codigo.js';
import { ondeEUsado } from '../../shared/blocos.js';
import { confirmar, h, mostrarCodigo, mostrarUsos, pedirFormulario, pedirTexto, plural } from '../dom.js';

const NOMES_TIPO_BLOCO: Record<string, string> = { UI: 'UI', API: 'API', EMAIL: 'Email', VERIFICACAO: 'Verificação', MANUAL: 'Manual' };

export async function ecraJornadas({ estado, corpo, acoes, atualizar, selecao, irPara }: Contexto): Promise<void> {
  const dados = window.uatStudio.dados;
  const [epicos, jornadas, blocos, aplicacoes, conjuntos, perfis] = await Promise.all([
    dados.listar('epicos'),
    dados.listar('jornadas'),
    dados.listar('blocos'),
    dados.listar('aplicacoes'),
    dados.listar('casos'),
    dados.listar('perfis'),
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
  // Por nome, com números por ordem natural ("2. ..." antes de "10. ...").
  epicos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { numeric: true }));
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

  /** Criar ou alterar um bloco de email (Microsoft Graph ou compatível): esperar, verificar e extrair valores. */
  const editarEmail = async (existente?: (typeof blocos)[number]): Promise<void> => {
    const caixas = aplicacoes.filter((a) => a.tipo === 'EMAIL');
    if (caixas.length === 0) {
      await confirmar(
        'Falta uma aplicação de email',
        'Cria primeiro uma aplicação do tipo "Caixa de email" (cartão Aplicações, mais abaixo) com o endereço da API de email neste ambiente, por exemplo https://graph.microsoft.com/v1.0.',
        'Fechar',
      );
      return;
    }
    const def = existente?.email;
    const linhas = (lista: string[] | undefined): string => (lista ?? []).join('\n');
    const valores = await pedirFormulario(existente ? `Bloco de email "${existente.nome}"` : 'Novo bloco de email', [
      { id: 'nome', rotulo: 'Nome', valor: existente?.nome, obrigatorio: true, ajuda: 'Por exemplo: Código de MFA por email' },
      { id: 'aplicacao', rotulo: 'Caixa de email (aplicação)', tipo: 'escolha', valor: existente?.aplicacaoId ?? caixas[0].id, opcoes: caixas.map((a) => ({ valor: a.id, texto: a.nome })) },
      { id: 'perfil', rotulo: 'Perfil de autenticação', tipo: 'escolha', valor: def?.perfilId ?? '', opcoes: [{ valor: '', texto: '(sem autenticação)' }, ...perfis.map((p) => ({ valor: p.id, texto: p.nome }))] },
      { id: 'caixa', rotulo: 'Endereço da caixa de testes', valor: def?.caixa, obrigatorio: true, ajuda: 'Por exemplo qa.uat@empresa.pt. Pode ter {variáveis}.' },
      { id: 'para', rotulo: 'Só emails para (contém), opcional', valor: def?.para, ajuda: 'Por exemplo {EmailCliente}, ou qa+{TESTE}' },
      { id: 'assunto', rotulo: 'Só emails com o assunto (contém), opcional', valor: def?.assunto },
      { id: 'espera', rotulo: 'Esperar até (segundos)', valor: String(def?.esperaSeg ?? 60) },
      { id: 'contem', rotulo: 'O corpo tem de conter (um texto por linha), opcional', tipo: 'area', valor: linhas(def?.corpoContem), ajuda: 'Por exemplo: Pedido {PedidoId}. Cada texto em falta dá KO.' },
      {
        id: 'extrair',
        rotulo: 'Guardar em variáveis (um por linha: Variavel=expressão), opcional',
        tipo: 'area',
        valor: linhas(def?.extrair?.map((e) => `${e.variavel}${e.de === 'assunto' ? '@assunto' : ''}=${e.padrao}`)),
        ajuda: 'Expressão regular; fica o 1.º grupo entre parênteses. Exemplos: CodigoMfa=(\\d{6})   Link=(https://\\S+)   Pedido@assunto=pedido (\\d+)',
      },
    ]);
    if (!valores?.nome.trim() || !valores.caixa.trim()) return;
    const extrair = valores.extrair
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.includes('='))
      .map((l) => {
        const igual = l.indexOf('=');
        const nome = l.slice(0, igual).trim();
        const doAssunto = nome.endsWith('@assunto');
        return { variavel: doAssunto ? nome.slice(0, -'@assunto'.length) : nome, de: doAssunto ? ('assunto' as const) : ('corpo' as const), padrao: l.slice(igual + 1).trim() };
      });
    await dados.guardar('blocos', {
      ...(existente ?? { passos: [] }),
      nome: valores.nome.trim(),
      tipo: 'EMAIL',
      aplicacaoId: valores.aplicacao,
      email: {
        caixa: valores.caixa.trim(),
        ...(valores.perfil ? { perfilId: valores.perfil } : {}),
        ...(valores.para.trim() ? { para: valores.para.trim() } : {}),
        ...(valores.assunto.trim() ? { assunto: valores.assunto.trim() } : {}),
        esperaSeg: Math.max(1, Number(valores.espera) || 60),
        corpoContem: valores.contem.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
        extrair,
      },
    });
    await atualizar();
  };

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

  /** Exportar: escolher os blocos e gravar um pacote (.uatpack) com eles, as aplicações e os perfis que usam (sem segredos). */
  const exportarPacote = async (): Promise<void> => {
    const caixas = blocos.map((b) => h('input', { type: 'checkbox', checked: true, 'data-exportar': b.id }) as HTMLInputElement);
    const escolhidos = await new Promise<string[] | null>((resolve) => {
      const terminar = (ids: string[] | null): void => {
        dialogo.close();
        dialogo.remove();
        resolve(ids);
      };
      const dialogo = h(
        'dialog',
        { class: 'dialogo dialogo-pacote', oncancel: () => terminar(null) },
        h(
          'div',
          { class: 'dialogo-corpo' },
          h('h2', {}, 'Exportar blocos'),
          h('p', { class: 'suave' }, 'O pacote leva os blocos escolhidos e as aplicações e perfis de autenticação que eles usam. Os segredos nunca vão no pacote: no outro PC é preciso preenchê-los.'),
          h('ul', { class: 'lista-itens lista-pacote' }, blocos.map((b, i) => h('li', { class: 'item' }, h('label', { class: 'opcao' }, caixas[i], h('span', { class: 'tipo-bloco', 'data-tipo': b.tipo }, NOMES_TIPO_BLOCO[b.tipo] ?? b.tipo), ` ${b.nome}`)))),
          h(
            'div',
            { class: 'dialogo-botoes' },
            h('button', { type: 'button', class: 'botao', onclick: () => terminar(null) }, 'Cancelar'),
            h('button', { id: 'exportar-confirmar', type: 'button', class: 'botao botao-primario', onclick: () => terminar(caixas.filter((c) => c.checked).map((c) => c.dataset.exportar ?? '')) }, 'Exportar'),
          ),
        ),
      );
      document.body.append(dialogo);
      dialogo.showModal();
    });
    if (!escolhidos) return;
    try {
      const ficheiro = await window.uatStudio.pacotes.exportar(escolhidos);
      if (ficheiro) await confirmar('Pacote exportado', `${plural(escolhidos.length, 'bloco')} em ${ficheiro}.`, 'Fechar');
    } catch (e) {
      await confirmar('Não foi possível exportar', e instanceof Error ? e.message : String(e), 'Fechar');
    }
  };

  /** Importar: escolher o pacote, ver o que é novo/igual/diferente e decidir o que fazer aos diferentes. */
  const importarPacote = async (): Promise<void> => {
    let lido: Awaited<ReturnType<typeof window.uatStudio.pacotes.abrir>>;
    try {
      lido = await window.uatStudio.pacotes.abrir();
    } catch (e) {
      await confirmar('Não foi possível ler o pacote', e instanceof Error ? e.message : String(e), 'Fechar');
      return;
    }
    if (!lido) return;
    const { pacote, plano } = lido;
    const nomesEstado = { novo: 'novo', igual: 'já existe, igual', diferente: 'já existe, diferente' } as const;
    const diferentes = plano.filter((p) => p.estado === 'diferente').length;
    const conflito = h(
      'select',
      { id: 'importar-conflito', class: 'campo' },
      h('option', { value: 'copia' }, 'Criar uma cópia "(importado)"'),
      h('option', { value: 'substituir' }, 'Substituir o bloco do projeto'),
      h('option', { value: 'saltar' }, 'Não importar'),
    );
    const resposta = await new Promise<string | null>((resolve) => {
      const terminar = (valor: string | null): void => {
        dialogo.close();
        dialogo.remove();
        resolve(valor);
      };
      const dialogo = h(
        'dialog',
        { class: 'dialogo dialogo-pacote', oncancel: () => terminar(null) },
        h(
          'div',
          { class: 'dialogo-corpo' },
          h('h2', {}, 'Importar pacote'),
          h('p', { class: 'suave' }, `${plural(plano.length, 'bloco')}${pacote.origem ? ` do projeto "${pacote.origem}"` : ''}. Aplicações e perfis que já existam ficam como estão.`),
          h(
            'ul',
            { class: 'lista-itens lista-pacote' },
            plano.map((p) =>
              h('li', { class: 'item', 'data-estado-pacote': p.estado }, h('span', { class: 'tipo-bloco', 'data-tipo': p.tipo }, NOMES_TIPO_BLOCO[p.tipo] ?? p.tipo), h('span', { class: 'item-nome' }, p.nome), h('span', { class: 'item-meta' }, nomesEstado[p.estado])),
            ),
          ),
          diferentes > 0 && h('label', { class: 'campo-grupo' }, `O que fazer aos blocos diferentes (${diferentes})?`, conflito),
          h(
            'div',
            { class: 'dialogo-botoes' },
            h('button', { type: 'button', class: 'botao', onclick: () => terminar(null) }, 'Cancelar'),
            h('button', { id: 'importar-pacote-confirmar', type: 'button', class: 'botao botao-primario', onclick: () => terminar(conflito.value) }, 'Importar'),
          ),
        ),
      );
      document.body.append(dialogo);
      dialogo.showModal();
    });
    if (!resposta) return;
    const feito = await window.uatStudio.pacotes.importar(pacote, resposta as 'copia' | 'substituir' | 'saltar');
    const partes = [plural(feito.blocos, 'bloco importado', 'blocos importados')];
    if (feito.saltados) partes.push(`${feito.saltados} sem alterações`);
    if (feito.aplicacoes) partes.push(plural(feito.aplicacoes, 'aplicação nova', 'aplicações novas'));
    if (feito.perfis) partes.push(`${plural(feito.perfis, 'perfil novo', 'perfis novos')} (preencha os segredos no ecrã Blocos de API)`);
    await confirmar('Pacote importado', `${partes.join(', ')}.`, 'Fechar');
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
        h(
          'div',
          { class: 'acoes' },
          h('button', { id: 'btn-importar-pacote', type: 'button', class: 'botao', title: 'Trazer blocos de outro projeto (ficheiro .uatpack).', onclick: () => void importarPacote() }, 'Importar pacote'),
          blocos.length > 0 && h('button', { id: 'btn-exportar-pacote', type: 'button', class: 'botao', title: 'Levar blocos para outro projeto ou partilhar com a equipa.', onclick: () => void exportarPacote() }, 'Exportar blocos'),
          h('button', { id: 'btn-novo-email', type: 'button', class: 'botao', title: 'Esperar que chegue um email à caixa de testes, verificá-lo e guardar valores (por exemplo o código de MFA).', onclick: () => void editarEmail() }, 'Novo bloco de email'),
          h('button', { id: 'btn-novo-manual', type: 'button', class: 'botao', title: 'A execução pára neste bloco e o testador confirma OK ou KO.', onclick: () => void editarManual() }, 'Novo passo manual'),
        ),
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
                bloco.tipo === 'EMAIL'
                  ? h('button', { type: 'button', class: 'ligacao item-nome', 'data-email': bloco.id, title: 'Alterar o bloco de email', onclick: () => void editarEmail(bloco) }, bloco.nome)
                  : bloco.tipo === 'MANUAL'
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
