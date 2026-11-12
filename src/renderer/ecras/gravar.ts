// Ecrã Gravar: escolher a aplicação e o bloco, abrir o browser e acompanhar os passos gravados.
import type { Bloco, EstadoGravador, Passo, PrintDoEcra, Valor } from '../../shared/modelo.js';
import type { Contexto } from '../app.js';
import { validarFormula } from '../../shared/formulas.js';
import { colunaValida, valoresFixos } from '../../shared/parametrizar.js';
import { confirmar, h, info, mensagemDeErro, pedirFormulario, plural } from '../dom.js';

const NOMES_ACAO: Record<Passo['acao'], string> = {
  navegar: 'Abrir',
  escrever: 'Escrever',
  escolher: 'Escolher',
  marcar: 'Marcar',
  clicar: 'Clicar',
  verificar: 'Verificar',
  guardar: 'Guardar',
  esperar: 'Esperar',
  simular: 'Simular API',
  intercetar: 'Intercetar',
  carregar: 'Carregar ficheiro',
  descarregar: 'Descarregar',
  separador: 'Separador',
  dialogo: 'Pergunta do browser',
};

let deixarDeOuvir: (() => void) | null = null;
/** Modo print: a última captura do ecrã (mantém-se entre redesenhos da gravação). */
let printAtual: PrintDoEcra | null = null;
/** Bloco aberto no editor de passos (mantém-se ao mudar de ecrã). */
let blocoEmEdicao: string | null = null;

/** Lista de passos de um bloco (também usada noutros ecrãs). */
export function listaDePassos(bloco: Bloco, aoRemover?: (passo: Passo) => void): HTMLElement {
  if (bloco.passos.length === 0) {
    return h('p', { class: 'suave' }, 'Ainda não há passos. Clica num elemento da página, no browser que se abriu.');
  }
  return h(
    'ol',
    { class: 'lista-passos' },
    bloco.passos.map((passo, indice) =>
      h(
        'li',
        { class: 'passo', 'data-acao': passo.acao },
        h('span', { class: 'passo-numero' }, indice + 1),
        h('span', { class: 'passo-acao' }, NOMES_ACAO[passo.acao]),
        h(
          'span',
          { class: 'passo-texto' },
          passo.descricao,
          passo.alvo && h('span', { class: 'passo-meta' }, plural(passo.alvo.localizadores.length, 'localizador', 'localizadores')),
        ),
        aoRemover &&
          h(
            'button',
            { type: 'button', class: 'botao botao-discreto-claro', 'aria-label': `Remover o passo ${indice + 1}`, onclick: () => aoRemover(passo) },
            'Remover',
          ),
      ),
    ),
  );
}

export async function ecraGravar({ estado, corpo, acoes, atualizar }: Contexto): Promise<void> {
  const api = window.uatStudio;
  deixarDeOuvir?.();
  deixarDeOuvir = null;

  const gravacao = await api.gravador.estado();
  if (gravacao.ativo) {
    desenharGravacao(gravacao);
    deixarDeOuvir = api.gravador.aoAtualizar((novo) => {
      // Só redesenha se este ecrã ainda estiver à vista.
      if (corpo.isConnected && corpo.querySelector('#gravacao-ativa')) desenharGravacao(novo);
    });
    return;
  }
  await desenharFormulario();

  function desenharGravacao(g: EstadoGravador): void {
    const bloco = g.bloco;
    if (!g.ativo || !bloco) {
      void atualizar();
      return;
    }
    const terminar = async (guardar: boolean): Promise<void> => {
      if (!guardar && bloco.passos.length > 0) {
        const sim = await confirmar('Cancelar gravação', 'Os passos gravados nesta sessão perdem-se.', 'Cancelar gravação');
        if (!sim) return;
      }
      printAtual = null;
      await api.gravador.terminar(guardar);
      await atualizar();
    };
    // "Regravar este elemento": o bloco é guardado logo que o elemento é trocado; aqui só se fecha.
    if (g.regravar !== undefined) {
      acoes.replaceChildren(
        h(
          'button',
          {
            id: 'btn-terminar-regravar',
            type: 'button',
            class: g.regravado ? 'botao botao-primario' : 'botao',
            onclick: async () => {
              await api.gravador.terminar(false);
              await atualizar();
            },
          },
          g.regravado ? 'Terminar' : 'Cancelar',
        ),
      );
      corpo.replaceChildren(
        h(
          'section',
          { id: 'gravacao-ativa', class: 'cartao', 'data-regravar': g.regravado ? 'feito' : 'a-espera' },
          h('h2', {}, `Regravar o elemento "${g.regravar}"`),
          h('p', { class: 'suave' }, `Bloco "${bloco.nome}" (${g.aplicacaoNome}). Só o elemento deste passo muda; a ação e o valor ficam como estavam.`),
          g.mensagem && h('p', { class: 'caixa-sugestoes', id: 'mensagem-regravar', role: 'status' }, g.mensagem),
        ),
      );
      return;
    }
    acoes.replaceChildren(
      h('button', { type: 'button', class: 'botao', onclick: () => void terminar(false) }, 'Cancelar'),
      h(
        'button',
        { id: 'btn-guardar-bloco', type: 'button', class: 'botao botao-primario', disabled: bloco.passos.length === 0, onclick: () => void terminar(true) },
        'Terminar e guardar bloco',
      ),
    );
    corpo.replaceChildren(
      h(
        'section',
        { id: 'gravacao-ativa', class: 'cartao' },
        h(
          'header',
          { class: 'cartao-topo' },
          h(
            'div',
            {},
            h('h2', {}, `A gravar o bloco "${bloco.nome}"`),
            h(
              'p',
              { class: 'suave' },
              g.browserAberto
                ? `Aplicação: ${g.aplicacaoNome}. Vai ao browser, clica num elemento e escolhe a ação no popup.`
                : 'O browser foi fechado. Podes guardar o bloco ou cancelar.',
            ),
          ),
          h('span', { class: 'etiqueta', id: 'contagem-passos' }, plural(bloco.passos.length, 'passo')),
        ),
        g.mensagem && h('p', { class: 'aviso-erro', role: 'alert' }, g.mensagem),
        h(
          'div',
          { class: 'acoes' },
          !printAtual &&
            h(
              'button',
              {
                id: 'btn-modo-print',
                type: 'button',
                class: 'botao',
                disabled: !g.browserAberto,
                title: 'Tirar um print do browser e gravar passos por cima dele (sem os executar).',
                onclick: async () => {
                  try {
                    printAtual = await api.gravador.capturar();
                  } catch (e) {
                    await confirmar('Não foi possível tirar o print', mensagemDeErro(e), 'Fechar');
                  }
                  desenharGravacao(await api.gravador.estado());
                },
              },
              'Modo print',
            ),
        ),
        listaDePassos(bloco, (passo) => void api.gravador.removerPasso(passo.id)),
      ),
      ...[painelPrint(g)].filter((p): p is HTMLElement => p !== false),
    );
  }

  /**
   * Modo print: a captura do ecrã do browser com os elementos por cima (botões transparentes).
   * Clicar num elemento abre um formulário e o passo é gravado sem ser executado na página.
   */
  function painelPrint(g: EstadoGravador): HTMLElement | false {
    if (!printAtual) return false;
    const print = printAtual;
    const atualizar = async (): Promise<void> => {
      try {
        printAtual = await api.gravador.capturar();
      } catch (e) {
        printAtual = null;
        await confirmar('Não foi possível tirar o print', mensagemDeErro(e), 'Fechar');
      }
      desenharGravacao(await api.gravador.estado());
    };
    const gravarSobre = async (indice: number): Promise<void> => {
      const e = print.elementos[indice];
      const acoesPossiveis: Array<[Passo['acao'], string]> =
        e.especie === 'texto'
          ? [['escrever', 'Escrever'], ['verificar', 'Verificar'], ['guardar', 'Guardar numa variável']]
          : e.especie === 'lista'
            ? [['escolher', 'Escolher uma opção'], ['verificar', 'Verificar'], ['guardar', 'Guardar numa variável']]
            : e.especie === 'marca'
              ? [['marcar', 'Marcar ou desmarcar'], ['verificar', 'Verificar']]
              : e.especie === 'botao'
                ? [['clicar', 'Clicar'], ['verificar', 'Verificar']]
                : [['verificar', 'Verificar'], ['guardar', 'Guardar numa variável'], ['clicar', 'Clicar']];
      const valores = await pedirFormulario(`Passo sobre "${e.descricao}"`, [
        { id: 'acao', rotulo: 'O que fazer', tipo: 'escolha', valor: acoesPossiveis[0][0], opcoes: acoesPossiveis.map(([valor, texto]) => ({ valor, texto })) },
        {
          id: 'origem',
          rotulo: 'De onde vem o valor',
          tipo: 'escolha',
          valor: 'fixo',
          opcoes: [
            { valor: 'fixo', texto: 'Valor fixo' },
            { valor: 'variavel', texto: 'Coluna dos dados (nome da coluna)' },
            { valor: 'formula', texto: 'Fórmula' },
          ],
        },
        {
          id: 'valor',
          rotulo: 'Valor (para escrever, escolher, marcar S/N ou verificar)',
          valor: e.especie === 'marca' ? 'S' : e.texto,
          ajuda: e.opcoes?.length ? `Opções: ${e.opcoes.slice(0, 8).join(' · ')}${e.opcoes.length > 8 ? ' …' : ''}` : undefined,
        },
        {
          id: 'tipoVerificacao',
          rotulo: 'Verificar como',
          tipo: 'escolha',
          valor: 'texto',
          opcoes: [
            { valor: 'texto', texto: 'Texto igual' },
            { valor: 'numero', texto: 'Número (decimal exato)' },
            { valor: 'visivel', texto: 'Só que está visível' },
          ],
        },
        { id: 'variavel', rotulo: 'Guardar: nome da variável' },
      ], 'Gravar passo');
      if (!valores) return;
      const acao = valores.acao as Passo['acao'];
      const precisaValor = ['escrever', 'escolher', 'marcar'].includes(acao) || (acao === 'verificar' && valores.tipoVerificacao !== 'visivel');
      const valor: Valor | undefined = !precisaValor
        ? undefined
        : valores.origem === 'variavel'
          ? { tipo: 'variavel', nome: valores.valor.trim() }
          : valores.origem === 'formula'
            ? { tipo: 'formula', expressao: valores.valor }
            : { tipo: 'fixo', valor: valores.valor };
      try {
        await api.gravador.gravarSobrePrint({
          elemento: indice,
          acao,
          ...(valor ? { valor } : {}),
          ...(acao === 'verificar' ? { verificacao: { tipo: valores.tipoVerificacao as 'texto' | 'numero' | 'visivel' } } : {}),
          ...(acao === 'guardar' ? { variavel: valores.variavel.trim() } : {}),
        });
      } catch (erro) {
        await confirmar('Não foi possível gravar o passo', mensagemDeErro(erro), 'Fechar');
      }
    };
    const caixas = print.elementos.map((e, i) => {
      const caixa = h('button', { type: 'button', class: 'print-elemento', 'data-elemento': i, 'data-especie': e.especie, title: `${e.descricao}${e.texto ? ` · "${e.texto}"` : ''}`, 'aria-label': e.descricao, onclick: () => void gravarSobre(i) });
      // Posição em percentagem da captura (definida por código: a política de segurança não aceita style="...").
      caixa.style.setProperty('left', `${(e.x / print.largura) * 100}%`);
      caixa.style.setProperty('top', `${(e.y / print.altura) * 100}%`);
      caixa.style.setProperty('width', `${(e.largura / print.largura) * 100}%`);
      caixa.style.setProperty('height', `${(e.altura / print.altura) * 100}%`);
      return caixa;
    });
    return h(
      'section',
      { class: 'cartao', id: 'modo-print' },
      h(
        'header',
        { class: 'cartao-topo' },
        h('div', {}, h('h2', {}, 'Modo print', info("Grava passos sobre uma captura do ecrã: útil quando a página muda enquanto se tenta clicar (menus, popups).")), h('p', { class: 'suave' }, `Clica num elemento destacado (${print.elementos.length}) para gravar um passo sobre o print. Os passos não são executados na página: confirma-os numa execução.${g.browserAberto ? '' : ' O browser foi fechado.'}`)),
        h(
          'div',
          { class: 'acoes' },
          h('button', { id: 'btn-atualizar-print', type: 'button', class: 'botao', disabled: !g.browserAberto, onclick: () => void atualizar() }, 'Tirar outro print'),
          h(
            'button',
            {
              type: 'button',
              class: 'botao',
              onclick: async () => {
                printAtual = null;
                desenharGravacao(await api.gravador.estado());
              },
            },
            'Fechar o modo print',
          ),
        ),
      ),
      h('div', { class: 'print-zona' }, h('img', { src: print.imagem, alt: 'Captura do ecrã do browser', class: 'print-imagem' }), caixas),
    );
  }


  async function desenharFormulario(): Promise<void> {
    const [aplicacoes, blocos] = await Promise.all([api.dados.listar('aplicacoes'), api.dados.listar('blocos')]);
    const ambiente = estado.projeto.ambientes.find((a) => a.id === estado.projeto.ambienteAtivo);
    const comBrowser = aplicacoes.filter((a) => a.tipo === 'FO' || a.tipo === 'BO');
    const blocosUi = blocos.filter((b) => b.tipo === 'UI');

    if (comBrowser.length === 0) {
      corpo.append(
        h(
          'div',
          { class: 'vazio' },
          h('p', { class: 'vazio-titulo' }, 'Falta uma aplicação para gravar'),
          h('p', {}, 'O projeto ainda não tem nenhuma aplicação de Front Office ou Backoffice.'),
        ),
      );
      return;
    }

    const erro = h('p', { class: 'aviso-erro', role: 'alert', hidden: true });
    const escolhaAplicacao = h(
      'select',
      { id: 'gravar-aplicacao', class: 'campo' },
      comBrowser.map((a) => h('option', { value: a.id }, `${a.nome}${ambiente && a.urls[ambiente.id] ? '' : ' (sem endereço neste ambiente)'}`)),
    );
    const escolhaBloco = h(
      'select',
      { id: 'gravar-bloco', class: 'campo' },
      h('option', { value: '' }, 'Criar um bloco novo'),
      blocosUi.map((b) => h('option', { value: b.id }, `Acrescentar passos a "${b.nome}"`)),
    );
    const nomeNovo = h('input', { id: 'gravar-nome', type: 'text', class: 'campo', maxlength: 80, placeholder: 'Por exemplo: Login Front Office' });
    const zonaNome = h('div', { class: 'campo-grupo' }, h('label', { for: 'gravar-nome' }, 'Nome do bloco novo'), nomeNovo);
    const abrirAplicacao = h('input', { id: 'gravar-abrir', type: 'checkbox', checked: true });
    const zonaAbrir = h('label', { class: 'opcao' }, abrirAplicacao, 'O bloco começa por abrir a aplicação (desliga se o bloco continua num ecrã já aberto)');
    const escolhaBrowser = h(
      'select',
      { id: 'gravar-browser', class: 'campo' },
      h('option', { value: 'msedge' }, 'Microsoft Edge'),
      h('option', { value: 'chrome' }, 'Google Chrome'),
    );
    escolhaBloco.addEventListener('change', () => {
      zonaNome.hidden = escolhaBloco.value !== '';
      zonaAbrir.hidden = escolhaBloco.value !== '';
    });

    const botao = h('button', { id: 'btn-gravar', type: 'submit', class: 'botao botao-primario' }, 'Começar a gravar');
    corpo.append(
      h(
        'form',
        {
          class: 'cartao formulario',
          onsubmit: async (evento: Event) => {
            evento.preventDefault();
            erro.hidden = true;
            let confirmouProducao = false;
            if (ambiente?.tipo === 'PRD') {
              confirmouProducao = await confirmar(
                'Ambiente de PRODUÇÃO',
                `O ambiente ativo (${ambiente.nome}) é de produção. Tens a certeza de que queres gravar aqui?`,
                'Gravar em produção',
              );
              if (!confirmouProducao) return;
            }
            botao.disabled = true;
            botao.textContent = 'A abrir o browser…';
            try {
              await api.gravador.iniciar({
                aplicacaoId: escolhaAplicacao.value,
                blocoId: escolhaBloco.value || undefined,
                nomeNovo: nomeNovo.value,
                abrirAplicacao: abrirAplicacao.checked,
                canal: escolhaBrowser.value === 'chrome' ? 'chrome' : 'msedge',
                confirmouProducao,
              });
              await atualizar();
            } catch (e) {
              erro.textContent = mensagemDeErro(e);
              erro.hidden = false;
              botao.disabled = false;
              botao.textContent = 'Começar a gravar';
            }
          },
        },
        h('h2', {}, 'Gravar um bloco de UI', info("Abre a aplicação no Edge. Clique num campo ou botão e escolha no popup o que fazer e de onde vem o valor. Cada passo é executado logo, para confirmar que funciona.")),
        h(
          'p',
          { class: 'suave' },
          'Abre-se o browser na aplicação. Passa o rato para realçar um elemento, clica e escolhe o que fazer: escrever, escolher, marcar, clicar, verificar ou guardar numa variável.',
        ),
        erro,
        h('div', { class: 'campo-grupo' }, h('label', { for: 'gravar-aplicacao' }, `Aplicação (ambiente ${ambiente?.nome ?? '?'})`), escolhaAplicacao),
        h('div', { class: 'campo-grupo' }, h('label', { for: 'gravar-bloco' }, 'Bloco'), escolhaBloco),
        zonaNome,
        zonaAbrir,
        h('div', { class: 'campo-grupo' }, h('label', { for: 'gravar-browser' }, 'Browser'), escolhaBrowser),
        botao,
      ),
    );

    // Blocos já gravados: rever e afinar os passos.
    const jornadas = await api.dados.listar('jornadas');
    const zonaBlocos = h('div', { id: 'blocos-gravados' });
    corpo.append(zonaBlocos);
    const desenharBlocos = (): void => {
      zonaBlocos.replaceChildren(
        h(
          'section',
          { class: 'cartao cartao-bloco', id: 'cartao-blocos-gravados' },
          h('header', { class: 'cartao-topo' }, h('div', {}, h('h2', {}, 'Blocos gravados'), h('p', { class: 'suave' }, 'Abre um bloco para rever os passos: mudar a descrição, pôr uma condição ("só se..."), esperar mais tempo numa verificação, trocar a ordem ou remover.'))),
          blocosUi.length === 0
            ? h('p', { class: 'suave' }, 'Ainda não há blocos gravados.')
            : h(
                'ul',
                { class: 'lista-itens' },
                blocosUi.map((bloco) =>
                  h(
                    'li',
                    { class: 'item' },
                    h(
                      'button',
                      {
                        type: 'button',
                        class: `ligacao item-nome${bloco.id === blocoEmEdicao ? ' atual' : ''}`,
                        'data-editar-bloco': bloco.id,
                        'aria-expanded': String(bloco.id === blocoEmEdicao),
                        onclick: () => {
                          blocoEmEdicao = bloco.id === blocoEmEdicao ? null : bloco.id;
                          desenharBlocos();
                        },
                      },
                      bloco.nome,
                    ),
                    h('span', { class: 'item-meta' }, plural(bloco.passos.length, 'passo')),
                  ),
                ),
              ),
        ),
      );
      const aberto = blocosUi.find((b) => b.id === blocoEmEdicao);
      if (aberto) zonaBlocos.append(editorDePassos(aberto));
    };

    const editorDePassos = (bloco: Bloco): HTMLElement => {
      const aviso = h('span', { class: 'estado', role: 'status' });
      const guardar = async (redesenhar: boolean): Promise<void> => {
        try {
          await api.dados.guardar('blocos', bloco);
          aviso.textContent = 'Guardado.';
          aviso.className = 'estado ok';
        } catch (e) {
          aviso.textContent = mensagemDeErro(e);
          aviso.className = 'estado erro';
        }
        if (redesenhar) desenharBlocos();
      };
      /** Passos de rede (não se gravam no browser): simular a resposta de uma API externa ou intercetar o pedido enviado. */
      const acrescentarPassoDeRede = async (): Promise<void> => {
        const valores = await pedirFormulario(
          'Passo de rede',
          [
            {
              id: 'acao',
              rotulo: 'O que fazer',
              tipo: 'escolha',
              valor: 'intercetar',
              opcoes: [
                { valor: 'intercetar', texto: 'Intercetar: verificar o pedido que a app enviou (põe-se depois do clique)' },
                { valor: 'simular', texto: 'Simular: responder no lugar de uma API externa (põe-se antes do clique)' },
              ],
            },
            { id: 'url', rotulo: 'Endereço do pedido (ou parte dele)', obrigatorio: true, ajuda: 'Por exemplo: easypay.pt/api/pagamentos, ou um padrão com * (https://*/api/*).' },
            { id: 'metodo', rotulo: 'Método (opcional)', ajuda: 'Por exemplo POST. Vazio = qualquer.' },
            { id: 'descricao', rotulo: 'Descrição (opcional)' },
            {
              id: 'verificacoes',
              rotulo: 'Intercetar: campos a verificar (um por linha: campo=valor)',
              tipo: 'area',
              ajuda: 'O campo é um caminho no corpo JSON (inputParameters.Valor), num formulário ou no endereço. Use * para "o corpo contém o valor". O valor pode ter {variáveis}.',
            },
            { id: 'guardar', rotulo: 'Intercetar: guardar um campo (Variavel=caminho), opcional' },
            {
              id: 'modo',
              rotulo: 'Simular: resposta',
              tipo: 'escolha',
              valor: 'responder',
              opcoes: [
                { valor: 'responder', texto: 'Responder com o código e o corpo abaixo' },
                { valor: 'falhar', texto: 'Falhar (sem ligação)' },
                { valor: 'demorar', texto: 'Demorar e falhar por tempo' },
              ],
            },
            { id: 'estado', rotulo: 'Simular: código HTTP', valor: '200' },
            { id: 'corpo', rotulo: 'Simular: corpo da resposta (pode ter {variáveis})', tipo: 'area' },
            { id: 'demora', rotulo: 'Simular: segundos a demorar', valor: '30' },
          ],
          'Acrescentar',
        );
        if (!valores?.url.trim()) return;
        const acao = valores.acao === 'simular' ? 'simular' : 'intercetar';
        const paraPares = (texto: string): Array<{ caminho: string; esperado: string }> =>
          texto
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.includes('='))
            .map((l) => ({ caminho: l.slice(0, l.indexOf('=')).trim(), esperado: l.slice(l.indexOf('=') + 1).trim() }));
        const [variavelGuardar, caminhoGuardar] = valores.guardar.includes('=') ? [valores.guardar.slice(0, valores.guardar.indexOf('=')).trim(), valores.guardar.slice(valores.guardar.indexOf('=') + 1).trim()] : ['', ''];
        const numeros = bloco.passos.map((p) => Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0));
        const url = valores.url.trim();
        bloco.passos.push({
          id: `p${Math.max(0, ...numeros) + 1}`,
          acao,
          descricao: valores.descricao.trim() || (acao === 'simular' ? `Simular a resposta de ${url}` : `Intercetar o pedido a ${url}`),
          rede:
            acao === 'simular'
              ? {
                  url,
                  ...(valores.metodo.trim() ? { metodo: valores.metodo.trim().toUpperCase() } : {}),
                  modo: valores.modo === 'falhar' || valores.modo === 'demorar' ? valores.modo : 'responder',
                  estado: Number(valores.estado) || 200,
                  corpo: valores.corpo,
                  demoraSeg: Number(valores.demora) || 30,
                }
              : {
                  url,
                  ...(valores.metodo.trim() ? { metodo: valores.metodo.trim().toUpperCase() } : {}),
                  verificacoes: paraPares(valores.verificacoes),
                  ...(variavelGuardar && caminhoGuardar ? { guardar: { variavel: variavelGuardar, caminho: caminhoGuardar } } : {}),
                },
        });
        await guardar(true);
      };
      /** Passos que não se gravam com um clique: carregar e descarregar ficheiros, mudar de separador, perguntas do browser. */
      const acrescentarPassoEspecial = async (): Promise<void> => {
        const valores = await pedirFormulario(
          'Outro passo',
          [
            {
              id: 'acao',
              rotulo: 'O que fazer',
              tipo: 'escolha',
              valor: 'carregar',
              opcoes: [
                { valor: 'carregar', texto: 'Carregar um ficheiro (upload)' },
                { valor: 'descarregar', texto: 'Descarregar um ficheiro (clica e guarda)' },
                { valor: 'separador', texto: 'Passar para outro separador do browser' },
                { valor: 'dialogo', texto: 'Responder à próxima pergunta do browser (confirmar)' },
              ],
            },
            { id: 'testid', rotulo: 'Elemento: data-testid (para carregar e descarregar)', ajuda: 'O data-testid do campo de upload ou do botão de download, por exemplo uplDocumento.' },
            {
              id: 'valor',
              rotulo: 'Valor',
              ajuda: 'Carregar: caminho do ficheiro (relativo à pasta do projeto, por exemplo ficheiros/cc.pdf). Descarregar: texto que o ficheiro tem de conter (opcional). Separador: novo ou principal. Pergunta: aceitar ou recusar.',
            },
            { id: 'variavel', rotulo: 'Descarregar: guardar o nome do ficheiro na variável (opcional)' },
            { id: 'descricao', rotulo: 'Descrição (opcional)' },
          ],
          'Acrescentar',
        );
        if (!valores) return;
        const acao = valores.acao as Passo['acao'];
        const precisaElemento = acao === 'carregar' || acao === 'descarregar';
        if (precisaElemento && !valores.testid.trim()) {
          await confirmar('Falta o elemento', 'Para carregar ou descarregar, indique o data-testid do campo ou do botão.', 'Fechar');
          return;
        }
        const valorTexto = valores.valor.trim() || (acao === 'separador' ? 'novo' : acao === 'dialogo' ? 'aceitar' : '');
        const descricoes: Record<string, string> = {
          carregar: `Carregar o ficheiro ${valorTexto}`,
          descarregar: 'Descarregar o ficheiro',
          separador: `Passar para o separador ${valorTexto}`,
          dialogo: `Responder "${valorTexto}" à próxima pergunta do browser`,
        };
        const numeros = bloco.passos.map((p) => Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0));
        bloco.passos.push({
          id: `p${Math.max(0, ...numeros) + 1}`,
          acao,
          descricao: valores.descricao.trim() || descricoes[acao],
          ...(precisaElemento ? { alvo: { descricao: valores.testid.trim(), localizadores: [{ tipo: 'testid' as const, valor: valores.testid.trim() }] } } : {}),
          ...(valorTexto ? { valor: { tipo: 'fixo' as const, valor: valorTexto } } : {}),
          ...(acao === 'descarregar' && valores.variavel.trim() ? { variavel: valores.variavel.trim() } : {}),
        });
        await guardar(true);
      };
      const mover = (indice: number, delta: number): void => {
        const destino = indice + delta;
        if (destino < 0 || destino >= bloco.passos.length) return;
        const [passo] = bloco.passos.splice(indice, 1);
        bloco.passos.splice(destino, 0, passo);
        void guardar(true);
      };
      const nome = h('input', { type: 'text', class: 'campo', value: bloco.nome, maxlength: 80, 'aria-label': 'Nome do bloco' });
      nome.addEventListener('change', () => {
        if (!nome.value.trim()) return;
        bloco.nome = nome.value.trim();
        void guardar(true);
      });
      // Bloco de login: depois do 1.º caso, os seguintes com os mesmos dados reutilizam a sessão.
      const login = h('input', { type: 'checkbox', id: 'bloco-login', checked: Boolean(bloco.login) });
      login.addEventListener('change', () => {
        bloco.login = login.checked || undefined;
        void guardar(false);
      });
      const opcaoLogin = h(
        'label',
        { class: 'opcao', title: 'A sessão (cookies) fica guardada só em memória durante a execução; os casos seguintes com o mesmo utilizador não repetem o login.' },
        login,
        'Bloco de login: reutilizar a sessão entre casos',
      );
      // Descrição em texto corrido: para que serve o bloco, pré-condições, cuidados.
      const descricaoBloco = h(
        'textarea',
        { id: 'bloco-descricao', class: 'campo campo-area', rows: 3, maxlength: 2000, placeholder: 'Para que serve este bloco, de que precisa antes (por exemplo, estar autenticado) e cuidados a ter.', 'aria-label': 'Descrição do bloco' },
        bloco.descricao ?? '',
      );
      descricaoBloco.addEventListener('change', () => {
        bloco.descricao = descricaoBloco.value.trim() || undefined;
        void guardar(false);
      });
      // "Transformar valores fixos em colunas": escolher o que passa a vir dos casos (e do Excel).
      const parametrizarBloco = async (): Promise<void> => {
        const fixos = valoresFixos(bloco);
        if (fixos.length === 0) {
          await confirmar('Valores fixos', 'Este bloco não tem valores fixos para transformar: os valores já vêm de colunas, fórmulas ou geradores.', 'Fechar');
          return;
        }
        const valores = await pedirFormulario(
          'Transformar valores fixos em colunas',
          fixos.map((v) => ({
            id: v.passoId,
            rotulo: `${v.descricao}: "${v.valor.length > 40 ? `${v.valor.slice(0, 40)}…` : v.valor}"`,
            valor: v.coluna,
            ajuda: 'Nome da coluna nos casos. Deixe vazio para manter o valor fixo.',
          })),
          'Transformar',
        );
        if (!valores) return;
        const escolhas = fixos.map((v) => ({ passoId: v.passoId, coluna: (valores[v.passoId] ?? '').trim() })).filter((e) => e.coluna);
        const invalida = escolhas.find((e) => !colunaValida(e.coluna));
        if (invalida) {
          await confirmar('Nome de coluna', `"${invalida.coluna}" não serve como nome de coluna: use letras e números, sem espaços (por exemplo NomeEmpresa).`, 'Fechar');
          return;
        }
        if (escolhas.length === 0) return;
        try {
          const feito = await api.blocos.parametrizar(bloco.id, escolhas);
          const ondeFicou = feito.jornadas.length
            ? `Os casos de ${feito.jornadas.join(', ')} ganharam as colunas, com os valores gravados. Exporte para Excel no editor de cenário para criar mais casos.`
            : 'O bloco ainda não é usado em nenhum cenário: quando o acrescentar a um, os casos precisam destas colunas.';
          await confirmar('Valores transformados', `${plural(feito.colunas.length, 'coluna')}: ${feito.colunas.join(', ')}. ${ondeFicou}`, 'Fechar');
        } catch (e) {
          await confirmar('Não foi possível transformar', mensagemDeErro(e), 'Fechar');
        }
        await atualizar();
      };
      const linhas = bloco.passos.map((passo, indice) => {
        const erro = h('p', { class: 'erro-campo', role: 'alert', hidden: true });
        const descricao = h('input', { type: 'text', class: 'campo', value: passo.descricao, 'aria-label': `Descrição do passo ${indice + 1}` });
        descricao.addEventListener('change', () => {
          if (!descricao.value.trim()) return;
          passo.descricao = descricao.value.trim();
          void guardar(false);
        });
        const condicao = h('input', {
          type: 'text',
          class: 'campo campo-formula',
          value: passo.condicao ?? '',
          placeholder: 'Sempre',
          'aria-label': `Condição do passo ${indice + 1} (só se)`,
          spellcheck: 'false',
        });
        condicao.addEventListener('change', () => {
          const texto = condicao.value.trim();
          const problema = texto ? validarFormula(texto) : null;
          erro.hidden = !problema;
          erro.textContent = problema ?? '';
          if (problema) return;
          passo.condicao = texto || undefined;
          void guardar(false);
        });
        const espera = h('input', {
          type: 'number',
          min: 0,
          max: 3600,
          step: 1,
          class: 'campo campo-numero',
          value: passo.verificacao?.esperaSeg ?? '',
          placeholder: 'normal',
          'aria-label': `Esperar até, em segundos, no passo ${indice + 1}`,
          hidden: passo.acao !== 'verificar',
        });
        espera.addEventListener('change', () => {
          if (!passo.verificacao) return;
          const segundos = Math.floor(Number(espera.value) || 0);
          if (segundos > 0) passo.verificacao.esperaSeg = segundos;
          else delete passo.verificacao.esperaSeg;
          void guardar(false);
        });
        return h(
          'li',
          { class: 'passo-edicao', 'data-acao': passo.acao },
          h('span', { class: 'passo-numero' }, indice + 1),
          h('span', { class: 'passo-acao' }, NOMES_ACAO[passo.acao]),
          descricao,
          condicao,
          passo.acao === 'verificar' ? espera : h('span', {}),
          h(
            'div',
            { class: 'acoes' },
            h('button', { type: 'button', class: 'botao botao-icone', disabled: indice === 0, 'aria-label': `Mover o passo ${indice + 1} para cima`, onclick: () => mover(indice, -1) }, '↑'),
            h('button', { type: 'button', class: 'botao botao-icone', disabled: indice === bloco.passos.length - 1, 'aria-label': `Mover o passo ${indice + 1} para baixo`, onclick: () => mover(indice, 1) }, '↓'),
            h(
              'button',
              {
                type: 'button',
                class: 'botao botao-discreto-claro',
                'aria-label': `Remover o passo ${indice + 1}`,
                onclick: async () => {
                  if (!(await confirmar('Remover passo', `Remover o passo "${passo.descricao}"?`, 'Remover'))) return;
                  bloco.passos.splice(indice, 1);
                  await guardar(true);
                },
              },
              'Remover',
            ),
          ),
          erro,
        );
      });
      const usos = jornadas.filter((j) => j.blocos.some((b) => b.blocoId === bloco.id)).map((j) => j.nome);
      return h(
        'section',
        { class: 'cartao cartao-bloco', id: 'editor-passos' },
        h(
          'header',
          { class: 'cartao-topo' },
          h('div', { class: 'campo-grupo' }, h('h2', {}, 'Passos do bloco'), nome, descricaoBloco, opcaoLogin, h('p', { class: 'ajuda-campo' }, usos.length > 0 ? `Usado em: ${usos.join(', ')}. As alterações valem para todas.` : 'Ainda não é usado em nenhum cenário.')),
          h(
            'div',
            { class: 'acoes' },
            aviso,
            h(
              'button',
              {
                type: 'button',
                class: 'botao botao-discreto-claro',
                onclick: async () => {
                  const avisoUso = usos.length > 0 ? ` É usado em: ${usos.join(', ')}.` : '';
                  if (!(await confirmar('Apagar bloco', `Apagar o bloco "${bloco.nome}"?${avisoUso}`))) return;
                  await api.dados.apagar('blocos', bloco.id);
                  blocoEmEdicao = null;
                  await atualizar();
                },
              },
              'Apagar bloco',
            ),
          ),
        ),
        h(
          'div',
          { class: 'passo-edicao passo-cabecalho', 'aria-hidden': 'true' },
          h('span', {}),
          h('span', {}),
          h('span', {}, 'O que faz'),
          h('span', {}, 'Só se (condição)'),
          h('span', {}, 'Esperar até (s)'),
          h('span', {}),
        ),
        h('ol', { class: 'lista-passos' }, linhas),
        h('div', { class: 'acoes' }, h('button', { id: 'btn-passo-rede', type: 'button', class: 'botao botao-pequeno-livre', title: 'Simular a resposta de uma API externa ou intercetar o pedido que a app envia.', onclick: () => void acrescentarPassoDeRede() }, 'Acrescentar passo de rede'), h('button', { id: 'btn-passo-especial', type: 'button', class: 'botao botao-pequeno-livre', title: 'Carregar ou descarregar ficheiros, mudar de separador, responder a perguntas do browser.', onclick: () => void acrescentarPassoEspecial() }, 'Acrescentar outro passo'), h('button', { id: 'btn-parametrizar', type: 'button', class: 'botao botao-pequeno-livre', title: 'Escolher que valores gravados passam a vir de uma coluna dos casos (para criar muitos casos no Excel).', onclick: () => void parametrizarBloco() }, 'Transformar valores fixos em colunas')),
      );
    };
    desenharBlocos();
  }
}
