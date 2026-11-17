// Ecrã Jornadas: épicos com as suas jornadas, blocos partilhados e aplicações.
import type { Contexto } from '../app.js';
import { codigoDoBloco } from '../../shared/codigo.js';
import { ondeEUsado } from '../../shared/blocos.js';
import { confirmar, escolherOpcao, h, info, menuAcoes, mostrarCodigo, mostrarUsos, normalizarPesquisa, pedirFormulario, pedirTexto, plural } from '../dom.js';

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
        h('p', {}, 'Um épico é uma pasta de cenários (por exemplo, "Crédito Pessoal"). Cria o primeiro com "Novo épico".'),
      ),
    );
  }
  // Procurar cenários: por nome do cenário, do épico, etiquetas ou descrição. Um épico que corresponda
  // mostra todos os seus cenários; senão, só os que correspondem (e os épicos sem nenhum ficam escondidos).
  if (jornadas.length > 3) {
    const procurar = h('input', { type: 'search', id: 'filtro-cenarios', class: 'campo campo-filtro', placeholder: 'Procurar cenário, épico ou etiqueta', 'aria-label': 'Procurar cenário, épico ou etiqueta' });
    procurar.addEventListener('input', () => {
      const termos = normalizarPesquisa(procurar.value).split(/\s+/).filter(Boolean);
      const serve = (texto: string): boolean => termos.every((t) => normalizarPesquisa(texto).includes(t));
      for (const cartao of Array.from(corpo.querySelectorAll<HTMLElement>('.cartao-epico'))) {
        const epicoServe = termos.length === 0 || serve(cartao.dataset.pesquisa ?? '');
        let algum = false;
        for (const li of Array.from(cartao.querySelectorAll<HTMLElement>('li[data-pesquisa]'))) {
          li.hidden = !epicoServe && !serve(li.dataset.pesquisa ?? '');
          algum ||= !li.hidden;
        }
        cartao.hidden = !epicoServe && !algum;
      }
    });
    corpo.append(h('div', { class: 'barra-filtros' }, procurar, info('Procura no nome do cenário, no nome do épico, nas etiquetas e na descrição. Vários termos: todos têm de aparecer.')));
  }
  // Por nome, com números por ordem natural ("2. ..." antes de "10. ...").
  epicos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { numeric: true }));
  for (const epico of epicos) {
    const doEpico = jornadas.filter((j) => j.epicoId === epico.id);
    corpo.append(
      h(
        'section',
        { class: 'cartao cartao-epico', 'data-pesquisa': `${epico.nome} ${epico.descricao ?? ''}` },
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
                  const nome = await pedirTexto('Novo cenário', `Nome do cenário em "${epico.nome}"`);
                  if (!nome) return;
                  const nova = await dados.guardar('jornadas', { nome, epicoId: epico.id, etiquetas: [], blocos: [] });
                  selecao.jornadaId = nova.id;
                  irPara('editor');
                },
              },
              'Novo cenário',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'botao botao-discreto-claro',
                disabled: doEpico.length > 0,
                title: doEpico.length > 0 ? 'Só é possível apagar um épico sem cenários.' : '',
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
          ? h('p', { class: 'suave' }, 'Sem cenários.')
          : h(
              'ul',
              { class: 'lista-itens' },
              doEpico.map((jornada) =>
                h(
                  'li',
                  { class: 'item', 'data-pesquisa': `${jornada.nome} ${jornada.etiquetas.join(' ')} ${jornada.descricao ?? ''} ${jornada.requisitoId ?? ''}` },
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'ligacao item-nome',
                      'data-jornada': jornada.id,
                      title: 'Abrir no editor de cenário',
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
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'botao botao-pequeno-livre botao-duplicar-cenario',
                        'data-duplicar': jornada.id,
                        title: 'Criar uma cópia deste cenário, com os mesmos blocos e os mesmos casos de teste, para fazer uma variação.',
                        onclick: async () => {
                          const { id, ...resto } = jornada;
                          void id;
                          const nova = await dados.guardar('jornadas', { ...resto, nome: `${jornada.nome} (cópia)` });
                          const casos = conjuntos.find((c) => c.id === jornada.id);
                          if (casos) await dados.guardar('casos', { ...structuredClone(casos), id: nova.id });
                          selecao.jornadaId = nova.id;
                          irPara('editor');
                        },
                      },
                      'Duplicar',
                    ),
                  ),
                ),
              ),
            ),
      ),
    );
  }

  /**
   * Criar ou alterar um bloco de email: esperar que chegue, verificar (assunto, corpo, valores, anexos) e
   * guardar valores (código, link). Lê a caixa de testes do projeto (por papel) ou outra caixa (aplicação).
   */
  const editarEmail = async (existente?: (typeof blocos)[number]): Promise<void> => {
    const caixas = aplicacoes.filter((a) => a.tipo === 'EMAIL');
    const temCaixaTestes = Boolean(estado.projeto.caixaTestes);
    let daCaixa: boolean;
    if (existente) daCaixa = Boolean(existente.email?.papel?.trim() || !existente.email?.caixa?.trim());
    else if (temCaixaTestes && caixas.length > 0) {
      const escolha = await escolherOpcao('Que caixa ler?', 'O bloco pode ler a caixa de testes do projeto (pelo papel) ou outra caixa ligada a uma aplicação.', [
        { valor: 'caixa', texto: 'Caixa de testes do projeto', primario: true },
        { valor: 'outra', texto: 'Outra caixa (aplicação)' },
      ]);
      if (!escolha) return;
      daCaixa = escolha === 'caixa';
    } else daCaixa = temCaixaTestes || caixas.length === 0;
    if (daCaixa && !temCaixaTestes) {
      await confirmar(
        'Falta a caixa de email de testes',
        'Defina primeiro a caixa de email de testes do projeto no ecrã Dados de teste (cartão "Caixa de email de testes"). Em alternativa, crie uma aplicação do tipo "Caixa de email" no cartão Aplicações.',
        'Fechar',
      );
      return;
    }
    const def = existente?.email;
    const linhas = (lista: string[] | undefined): string => (lista ?? []).join('\n');
    const campoDe = daCaixa
      ? [
          {
            id: 'papel',
            rotulo: 'Para quem (papel)',
            valor: def?.papel ?? '',
            obrigatorio: true,
            ajuda: 'Por exemplo gestor, cliente, supervisor. O email tem de chegar ao endereço de teste desse papel neste caso (o mesmo que {EMAIL:gestor} dá nos dados).',
          },
        ]
      : [
          { id: 'aplicacao', rotulo: 'Caixa de email (aplicação)', tipo: 'escolha' as const, valor: existente?.aplicacaoId ?? caixas[0]?.id, opcoes: caixas.map((a) => ({ valor: a.id, texto: a.nome })) },
          { id: 'perfil', rotulo: 'Perfil de autenticação', tipo: 'escolha' as const, valor: def?.perfilId ?? '', opcoes: [{ valor: '', texto: '(sem autenticação)' }, ...perfis.map((p) => ({ valor: p.id, texto: p.nome }))] },
          { id: 'caixa', rotulo: 'Endereço da caixa', valor: def?.caixa, obrigatorio: true, ajuda: 'Por exemplo qa.uat@empresa.pt. Pode ter {variáveis}.' },
          { id: 'para', rotulo: 'Só emails para (contém), opcional', valor: def?.para, ajuda: 'Por exemplo {EmailCliente}' },
        ];
    const valores = await pedirFormulario(existente ? `Bloco de email "${existente.nome}"` : 'Novo bloco de email', [
      { id: 'nome', rotulo: 'Nome', valor: existente?.nome, obrigatorio: true, ajuda: 'Por exemplo: Email de aprovação ao gestor' },
      ...campoDe,
      {
        id: 'chegar',
        rotulo: 'O que se espera',
        tipo: 'escolha',
        valor: def?.naoDeveChegar ? 'nao' : 'sim',
        opcoes: [
          { valor: 'sim', texto: 'Tem de chegar um email' },
          { valor: 'nao', texto: 'NÃO deve chegar nenhum email (espera o tempo todo)' },
        ],
      },
      { id: 'assunto', rotulo: 'Só emails com o assunto (contém), opcional', valor: def?.assunto },
      { id: 'assuntoIgual', rotulo: 'O assunto tem de ser exatamente, opcional', valor: def?.assuntoIgual, ajuda: 'Dá KO se for diferente. Pode ter {variáveis}: Pedido {PedidoId} aprovado' },
      { id: 'espera', rotulo: 'Esperar até (segundos)', valor: String(def?.esperaSeg ?? 60) },
      { id: 'contem', rotulo: 'O corpo tem de conter (um texto por linha), opcional', tipo: 'area', valor: linhas(def?.corpoContem), ajuda: 'Por exemplo: Pedido {PedidoId}. Cada texto em falta dá KO.' },
      {
        id: 'valores',
        rotulo: 'Valores no corpo (um por linha: Rótulo=valor esperado; tolerância opcional), opcional',
        tipo: 'area',
        valor: linhas(def?.valores?.map((v) => `${v.rotulo}=${v.esperado}${v.tolerancia ? `;${v.tolerancia}` : ''}`)),
        ajuda: 'O número a seguir ao rótulo, comparado em decimal exato. Exemplos: Montante:={Valor}   Prestação:={PrestacaoEsperada};0,01',
      },
      { id: 'anexos', rotulo: 'Anexos que têm de existir (nome contém, um por linha), opcional', tipo: 'area', valor: linhas(def?.anexos), ajuda: 'Por exemplo: contrato.pdf' },
      { id: 'link', rotulo: 'Guardar o link do email (Variavel=texto que o link contém), opcional', valor: def?.link ? `${def.link.variavel}=${def.link.contem ?? ''}` : '', ajuda: 'Exemplo: LinkConfirmacao=/confirmar. Sem texto, fica o 1.º link.' },
      {
        id: 'abrir',
        rotulo: 'Abrir o link no browser do caso?',
        tipo: 'escolha',
        valor: def?.link?.abrir ? 'sim' : 'nao',
        opcoes: [
          { valor: 'nao', texto: 'Não, só guardar' },
          { valor: 'sim', texto: 'Sim, abrir a seguir (por exemplo, para confirmar um registo)' },
        ],
      },
      {
        id: 'extrair',
        rotulo: 'Guardar outros valores (um por linha: Variavel=expressão), opcional',
        tipo: 'area',
        valor: linhas(def?.extrair?.map((e) => `${e.variavel}${e.de === 'assunto' ? '@assunto' : ''}=${e.padrao}`)),
        ajuda: 'Expressão regular; fica o 1.º grupo entre parênteses. Exemplos: CodigoMfa=(\\d{6})   Pedido@assunto=pedido (\\d+)',
      },
    ]);
    if (!valores?.nome.trim()) return;
    if (!daCaixa && !valores.caixa?.trim()) return;
    const porLinha = (texto: string): string[] => texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const extrair = porLinha(valores.extrair)
      .filter((l) => l.includes('='))
      .map((l) => {
        const igual = l.indexOf('=');
        const nome = l.slice(0, igual).trim();
        const doAssunto = nome.endsWith('@assunto');
        return { variavel: doAssunto ? nome.slice(0, -'@assunto'.length) : nome, de: doAssunto ? ('assunto' as const) : ('corpo' as const), padrao: l.slice(igual + 1).trim() };
      });
    const valoresNumericos = porLinha(valores.valores)
      .filter((l) => l.includes('='))
      .map((l) => {
        const igual = l.indexOf('=');
        const [esperado, tolerancia] = l.slice(igual + 1).split(';').map((p) => p.trim());
        return { rotulo: l.slice(0, igual).trim(), esperado, ...(tolerancia ? { tolerancia } : {}) };
      });
    const textoLink = valores.link.trim();
    const link = textoLink
      ? {
          variavel: (textoLink.includes('=') ? textoLink.slice(0, textoLink.indexOf('=')) : textoLink).trim(),
          ...(textoLink.includes('=') && textoLink.slice(textoLink.indexOf('=') + 1).trim() ? { contem: textoLink.slice(textoLink.indexOf('=') + 1).trim() } : {}),
          ...(valores.abrir === 'sim' ? { abrir: true } : {}),
        }
      : undefined;
    const novo = { ...(existente ?? { passos: [] }) } as (typeof blocos)[number];
    if (daCaixa) delete novo.aplicacaoId;
    await dados.guardar('blocos', {
      ...novo,
      nome: valores.nome.trim(),
      tipo: 'EMAIL',
      ...(daCaixa ? {} : { aplicacaoId: valores.aplicacao }),
      email: {
        caixa: daCaixa ? '' : valores.caixa.trim(),
        ...(daCaixa ? { papel: valores.papel.trim() } : {}),
        ...(!daCaixa && valores.perfil ? { perfilId: valores.perfil } : {}),
        ...(!daCaixa && valores.para?.trim() ? { para: valores.para.trim() } : {}),
        ...(valores.assunto.trim() ? { assunto: valores.assunto.trim() } : {}),
        ...(valores.assuntoIgual.trim() ? { assuntoIgual: valores.assuntoIgual.trim() } : {}),
        esperaSeg: Math.max(1, Number(valores.espera) || 60),
        corpoContem: porLinha(valores.contem),
        ...(valoresNumericos.length ? { valores: valoresNumericos } : {}),
        ...(porLinha(valores.anexos).length ? { anexos: porLinha(valores.anexos) } : {}),
        ...(link?.variavel ? { link } : {}),
        ...(valores.chegar === 'nao' ? { naoDeveChegar: true } : {}),
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
        h('h2', {}, 'Blocos partilhados', info('Peças reutilizáveis dos cenários. Os blocos de ecrã criam-se no ecrã Gravar e os de API no ecrã Blocos de API. Uma alteração num bloco vale para todos os cenários que o usam.')),
        h(
          'div',
          { class: 'acoes' },
          menuAcoes(
            'Criar',
            h('button', { id: 'btn-novo-email', type: 'button', class: 'botao', title: 'Esperar que chegue um email à caixa de testes, verificá-lo e guardar valores (por exemplo o código de MFA).', onclick: () => void editarEmail() }, 'Novo bloco de email'),
            h('button', { id: 'btn-novo-manual', type: 'button', class: 'botao', title: 'A execução pára neste bloco e o testador confirma que passou ou falhou.', onclick: () => void editarManual() }, 'Novo passo manual'),
          ),
          menuAcoes(
            'Partilhar',
            h('button', { id: 'btn-importar-pacote', type: 'button', class: 'botao', title: 'Trazer blocos de outro projeto (ficheiro .uatpack).', onclick: () => void importarPacote() }, 'Importar pacote'),
            blocos.length > 0 && h('button', { id: 'btn-exportar-pacote', type: 'button', class: 'botao', title: 'Levar blocos para outro projeto ou partilhar com a equipa.', onclick: () => void exportarPacote() }, 'Exportar blocos'),
          ),
        ),
      ),
      blocos.length > 5 && filtroBlocos(),
      blocos.length === 0
        ? h('p', { class: 'suave' }, 'Ainda não há blocos. Os blocos de UI são criados no ecrã Gravar.')
        : h(
            'ul',
            { class: 'lista-itens', id: 'lista-blocos' },
            blocos.map((bloco) => {
              const aplicacao = bloco.aplicacaoId ? aplicacaoPorId.get(bloco.aplicacaoId) : undefined;
              const usos = ondeEUsado(bloco.id, jornadas, epicos, conjuntos);
              return h(
                'li',
                { class: bloco.descricao ? 'item item-com-descricao' : 'item', 'data-pesquisa': `${bloco.nome} ${aplicacao?.nome ?? ''} ${bloco.descricao ?? ''}`, 'data-tipo': bloco.tipo, 'data-sem-uso': String(usos.length === 0) },
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
                      title: 'Ver os cenários que usam este bloco',
                      onclick: () =>
                        mostrarUsos(bloco.nome, usos, (jornadaId) => {
                          selecao.jornadaId = jornadaId;
                          irPara('editor');
                        }),
                    },
                    usos.length === 0 ? 'Não usado' : `Usado em ${plural(usos.length, 'cenário')}`,
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
                // A descrição do bloco (nas receitas da Wiki: COMO se faz e as ARMADILHAS).
                bloco.descricao && h('details', { class: 'item-descricao', 'data-descricao': bloco.id }, h('summary', {}, 'Como usar'), h('p', {}, bloco.descricao)),
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
      { class: 'cartao', id: 'cartao-aplicacoes' },
      h(
        'header',
        { class: 'cartao-topo' },
        h('h2', {}, 'Aplicações', info("Os sistemas a testar, com o endereço em cada ambiente (DEV, QA, PRD). Os blocos usam o endereço do ambiente ativo.")),
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

/** Filtro dos blocos partilhados: texto (nome, aplicação, descrição), tipo e "só os não usados". */
function filtroBlocos(): HTMLElement {
  const texto = h('input', { type: 'search', id: 'filtro-blocos', class: 'campo campo-filtro', placeholder: 'Procurar bloco', 'aria-label': 'Procurar bloco' });
  const tipo = h(
    'select',
    { id: 'filtro-tipo-bloco', class: 'campo campo-filtro-curto', 'aria-label': 'Tipo de bloco' },
    h('option', { value: '' }, 'Todos os tipos'),
    h('option', { value: 'UI' }, 'Ecrã (UI)'),
    h('option', { value: 'API' }, 'API'),
    h('option', { value: 'EMAIL' }, 'Email'),
    h('option', { value: 'MANUAL' }, 'Passo manual'),
  );
  const semUso = h('input', { type: 'checkbox', id: 'filtro-sem-uso' });
  const aplicar = (): void => {
    const termos = normalizarPesquisa(texto.value).split(/\s+/).filter(Boolean);
    for (const li of Array.from(document.querySelectorAll<HTMLElement>('#lista-blocos > li'))) {
      const procura = normalizarPesquisa(li.dataset.pesquisa ?? '');
      li.hidden = !termos.every((t) => procura.includes(t)) || (tipo.value !== '' && li.dataset.tipo !== tipo.value) || (semUso.checked && li.dataset.semUso !== 'true');
    }
  };
  texto.addEventListener('input', aplicar);
  tipo.addEventListener('change', aplicar);
  semUso.addEventListener('change', aplicar);
  return h('div', { class: 'barra-filtros' }, texto, tipo, h('label', { class: 'opcao' }, semUso, 'Só os não usados'));
}
