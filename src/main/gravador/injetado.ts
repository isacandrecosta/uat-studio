// Código que corre DENTRO da página a gravar (é injetado pelo Playwright).
// Realça o elemento sob o rato e, ao clicar, abre o popup para escolher a ação.
// ATENÇÃO: esta função é enviada para o browser como texto, por isso não pode usar
// nada de fora dela (nem imports, nem funções deste ficheiro).

export function scriptGravador(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__uatGravadorInstalado || window.top !== window) return;
  w.__uatGravadorInstalado = true;

  type Origem = 'fixo' | 'variavel';
  interface Loc {
    tipo: string;
    valor: string;
    nome?: string;
  }

  const estado = { modo: 'gravar' as 'gravar' | 'livre', suspenso: false, colunas: [] as string[] };
  let marcador = 0;
  let popupAberto = false;

  const enviar = (mensagem: unknown): Promise<any> =>
    typeof w.__uatGravador === 'function' ? w.__uatGravador(mensagem) : Promise.resolve(null);

  // ---------- Ajudas para criar elementos (sem innerHTML) ----------
  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Record<string, unknown> = {},
    ...filhos: Array<Node | string | null | false | undefined>
  ): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (typeof v === 'function') e.addEventListener(k.replace(/^on/, ''), v as EventListener);
      else if (k === 'class') e.className = String(v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
    for (const f of filhos) if (f !== null && f !== false && f !== undefined) e.append(f);
    return e;
  }

  // ---------- Interface própria, isolada da página (shadow DOM) ----------
  const hospedeiro = document.createElement('div');
  hospedeiro.id = '__uat-gravador';
  hospedeiro.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const raiz = hospedeiro.attachShadow({ mode: 'open' });
  const folha = new CSSStyleSheet();
  folha.replaceSync(`
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Segoe UI", system-ui, sans-serif; }
    .realce { position: fixed; pointer-events: none; border: 2px solid #2f6bed; background: rgba(47,107,237,.12); border-radius: 3px; display: none; }
    .rotulo { position: fixed; pointer-events: none; display: none; max-width: 320px; padding: 2px 8px; border-radius: 4px; background: #2f6bed; color: #fff; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .barra { position: fixed; top: 8px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 12px; border-radius: 999px; background: #1b2130; color: #fff; font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,.3); }
    .ponto { width: 10px; height: 10px; border-radius: 50%; background: #e5484d; }
    .barra[data-modo="livre"] .ponto { background: #98a2b3; }
    button { font: inherit; cursor: pointer; }
    .barra button { padding: 4px 12px; border: 1px solid rgba(255,255,255,.3); border-radius: 999px; background: transparent; color: #fff; font-size: 12px; }
    .barra button:hover { background: rgba(255,255,255,.12); }
    .popup { position: fixed; width: 340px; max-height: calc(100vh - 16px); overflow-y: auto; padding: 14px; border: 1px solid #d5d9e2; border-radius: 10px; background: #fff; color: #1c2230; font-size: 13px; box-shadow: 0 12px 40px rgba(0,0,0,.28); }
    .popup h2 { margin: 0 0 2px; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
    .popup .sub { margin: 0 0 10px; color: #667085; font-size: 12px; }
    .acoes { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .acoes button { padding: 5px 10px; border: 1px solid #d5d9e2; border-radius: 6px; background: #fff; color: #1c2230; }
    .acoes button[aria-pressed="true"] { border-color: #2f6bed; background: #e7efff; color: #2457c8; font-weight: 600; }
    label { display: block; margin: 8px 0 4px; font-weight: 600; }
    .escolha { display: flex; gap: 14px; margin: 4px 0; }
    .escolha label { display: flex; align-items: center; gap: 5px; margin: 0; font-weight: 400; }
    input[type="text"], select { width: 100%; padding: 6px 8px; border: 1px solid #d5d9e2; border-radius: 6px; background: #fff; color: #1c2230; font: inherit; }
    input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid #2f6bed; outline-offset: 1px; }
    .nota { margin: 6px 0 0; color: #667085; font-size: 12px; }
    .erro { margin: 8px 0 0; color: #c0392b; font-size: 12px; font-weight: 600; }
    .botoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    .botoes button { padding: 6px 12px; border: 1px solid #d5d9e2; border-radius: 6px; background: #fff; color: #1c2230; font-weight: 600; }
    .botoes .primario { border-color: #2f6bed; background: #2f6bed; color: #fff; }
    .aviso { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); max-width: 80vw; padding: 8px 14px; border-radius: 8px; background: #1b2130; color: #fff; font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,.3); display: none; }
    .aviso[data-tipo="ok"] { background: #1a8f4c; }
    .aviso[data-tipo="erro"] { background: #c0392b; }
  `);
  raiz.adoptedStyleSheets = [folha];

  const realce = el('div', { class: 'realce' });
  const rotulo = el('div', { class: 'rotulo' });
  const textoBarra = el('span', {});
  const botaoModo = el('button', { type: 'button', onclick: () => definirModo(estado.modo === 'gravar' ? 'livre' : 'gravar', true) });
  const barra = el('div', { class: 'barra' }, el('span', { class: 'ponto' }), textoBarra, botaoModo);
  const aviso = el('div', { class: 'aviso', role: 'status' });
  raiz.append(realce, rotulo, barra, aviso);

  // As teclas escritas no popup não devem chegar à página.
  for (const tipo of ['keydown', 'keyup', 'keypress', 'input', 'change']) {
    hospedeiro.addEventListener(tipo, (e) => e.stopPropagation());
  }

  function montar(): void {
    if (!hospedeiro.isConnected) document.documentElement.append(hospedeiro);
  }
  if (document.documentElement) montar();
  document.addEventListener('DOMContentLoaded', montar);

  function esconderRealce(): void {
    realce.style.display = 'none';
    rotulo.style.display = 'none';
  }

  function definirModo(modo: 'gravar' | 'livre', avisarPrincipal: boolean): void {
    estado.modo = modo;
    barra.dataset.modo = modo;
    textoBarra.textContent = modo === 'gravar' ? 'A gravar: clica num elemento' : 'Em pausa: a página funciona normalmente';
    botaoModo.textContent = modo === 'gravar' ? 'Pausar' : 'Retomar gravação';
    if (modo === 'livre') esconderRealce();
    if (avisarPrincipal) void enviar({ tipo: 'modo', modo });
  }

  let temporizadorAviso = 0;
  function mostrarAviso(texto: string, tipo: 'ok' | 'erro' | 'info' = 'info'): void {
    aviso.textContent = texto;
    aviso.dataset.tipo = tipo;
    aviso.style.display = 'block';
    window.clearTimeout(temporizadorAviso);
    temporizadorAviso = window.setTimeout(() => (aviso.style.display = 'none'), tipo === 'erro' ? 8000 : 3000);
  }

  // ---------- Perceber que elemento é ----------
  const CONTROLOS =
    'input, select, textarea, button, a[href], [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="menuitem"], [contenteditable="true"]';

  function normalizar(origem: Element): Element {
    const controlo = origem.closest(CONTROLOS);
    if (controlo) return controlo;
    const etiqueta = origem.closest('label') as HTMLLabelElement | null;
    if (etiqueta?.control) return etiqueta.control;
    return origem;
  }

  type Especie = 'texto' | 'lista' | 'marca' | 'botao' | 'outro';
  function especieDe(e: Element): Especie {
    const tag = e.tagName;
    const role = e.getAttribute('role') ?? '';
    if (tag === 'SELECT') return 'lista';
    if (tag === 'TEXTAREA' || (e as HTMLElement).isContentEditable) return 'texto';
    if (tag === 'INPUT') {
      const tipo = (e as HTMLInputElement).type;
      if (tipo === 'checkbox' || tipo === 'radio') return 'marca';
      if (['button', 'submit', 'reset', 'image'].includes(tipo)) return 'botao';
      if (tipo === 'file' || tipo === 'range' || tipo === 'color') return 'outro';
      return 'texto';
    }
    if (role === 'checkbox' || role === 'switch' || role === 'radio') return 'marca';
    if (tag === 'BUTTON' || tag === 'A' || ['button', 'link', 'tab', 'menuitem'].includes(role)) return 'botao';
    return 'outro';
  }

  const limpar = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();

  function etiquetaDe(e: Element): string {
    const aria = limpar(e.getAttribute('aria-label'));
    if (aria) return aria;
    const ids = limpar(e.getAttribute('aria-labelledby'));
    if (ids) {
      const texto = limpar(ids.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
      if (texto) return texto;
    }
    const etiquetas = (e as HTMLInputElement).labels;
    if (etiquetas && etiquetas.length > 0) return limpar(etiquetas[0].textContent);
    return '';
  }

  function textoDe(e: Element): string {
    if (e.tagName === 'INPUT') return limpar((e as HTMLInputElement).value);
    return limpar((e as HTMLElement).innerText ?? e.textContent);
  }

  function valorAtual(e: Element): string {
    if (e instanceof HTMLSelectElement) return limpar(e.selectedOptions[0]?.text);
    if (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) return e.value;
    return textoDe(e);
  }

  function caminhoCss(e: Element): string {
    const partes: string[] = [];
    let atual: Element | null = e;
    while (atual && atual !== document.documentElement) {
      if (atual.id && document.querySelectorAll(`#${CSS.escape(atual.id)}`).length === 1) {
        partes.unshift(`#${CSS.escape(atual.id)}`);
        return partes.join(' > ');
      }
      const tag = atual.tagName.toLowerCase();
      const pai: Element | null = atual.parentElement;
      if (!pai) break;
      const irmaos = Array.from(pai.children).filter((c) => c.tagName === atual!.tagName);
      partes.unshift(irmaos.length > 1 ? `${tag}:nth-of-type(${irmaos.indexOf(atual) + 1})` : tag);
      atual = pai;
    }
    return `html > ${partes.join(' > ')}`;
  }

  /** Recolhe todas as formas de encontrar o elemento, da mais fiável para a menos fiável. */
  function recolher(e: Element, especie: Especie): { descricao: string; localizadores: Loc[]; widget?: string } {
    const locs: Loc[] = [];
    let widget: string | undefined;

    const testid = e.getAttribute('data-testid');
    if (testid) {
      locs.push({ tipo: 'testid', valor: testid });
    } else {
      // OutSystems: o data-testid fica no DIV à volta do controlo (por exemplo, no Dropdown).
      const volta = e.parentElement?.closest('[data-testid]');
      if (volta && volta.querySelectorAll('input, select, textarea').length === 1 && especie !== 'botao' && especie !== 'outro') {
        locs.push({ tipo: 'testid', valor: volta.getAttribute('data-testid') ?? '' });
        widget = especie === 'lista' ? 'dropdown' : 'envolvido';
      }
    }

    const etiqueta = etiquetaDe(e);
    const texto = textoDe(e);
    if (etiqueta && especie !== 'botao' && especie !== 'outro') locs.push({ tipo: 'etiqueta', valor: etiqueta });

    const role =
      e.getAttribute('role') ??
      (especie === 'texto' ? 'textbox' : especie === 'lista' ? 'combobox' : especie === 'marca' ? ((e as HTMLInputElement).type === 'radio' ? 'radio' : 'checkbox') : e.tagName === 'A' ? 'link' : especie === 'botao' ? 'button' : '');
    const nomeAcessivel = especie === 'botao' ? etiqueta || texto : etiqueta;
    if (role && nomeAcessivel && nomeAcessivel.length <= 80) locs.push({ tipo: 'role', valor: role, nome: nomeAcessivel });

    const ajuda = limpar(e.getAttribute('placeholder'));
    if (ajuda) locs.push({ tipo: 'placeholder', valor: ajuda });

    if ((especie === 'botao' || especie === 'outro') && e.tagName !== 'INPUT' && texto && texto.length <= 80 && e.children.length <= 2) {
      locs.push({ tipo: 'texto', valor: texto });
    }
    if (e.id) locs.push({ tipo: 'id', valor: e.id });
    locs.push({ tipo: 'css', valor: caminhoCss(e) });

    const nome = etiqueta || ajuda || (especie === 'botao' ? texto : '') || testid || locs[0].valor || e.tagName.toLowerCase();
    const prefixo = { texto: 'Campo', lista: 'Lista', marca: 'Opção', botao: 'Botão', outro: 'Elemento' }[especie];
    return { descricao: `${prefixo} "${nome.slice(0, 60)}"`, localizadores: locs, widget };
  }

  // ---------- Popup ----------
  type Acao = 'escrever' | 'escolher' | 'marcar' | 'clicar' | 'verificar' | 'guardar';
  const NOMES_ACAO: Record<Acao, string> = {
    escrever: 'Escrever',
    escolher: 'Escolher',
    marcar: 'Marcar',
    clicar: 'Clicar',
    verificar: 'Verificar',
    guardar: 'Guardar variável',
  };

  function abrirPopup(alvo: Element): void {
    const especie = especieDe(alvo);
    const info = recolher(alvo, especie);
    const secreto = alvo instanceof HTMLInputElement && alvo.type === 'password';
    const acoes: Acao[] = [];
    if (especie === 'texto') acoes.push('escrever');
    if (especie === 'lista') acoes.push('escolher');
    if (especie === 'marca') acoes.push('marcar');
    acoes.push('clicar');
    if (!secreto) acoes.push('verificar', 'guardar');
    let acao: Acao = acoes[0];

    const opcoes = alvo instanceof HTMLSelectElement ? Array.from(alvo.options).map((o) => limpar(o.text)).filter(Boolean) : [];
    const atual = secreto ? '' : valorAtual(alvo);

    const idLista = '__uat-colunas';
    const listaColunas = el('datalist', { id: idLista }, ...estado.colunas.map((c) => el('option', { value: c })));
    const corpo = el('div', {});
    const erro = el('p', { class: 'erro', role: 'alert' });
    erro.style.display = 'none';
    const botoesAcao = el('div', { class: 'acoes', role: 'group', 'aria-label': 'Ação' });

    // Devolve os dados do passo, ou uma mensagem de erro.
    let ler: () => Record<string, unknown> | string = () => ({});

    /** Campos "valor fixo" ou "coluna dos dados" (com um valor de exemplo para usar já). */
    function origemDoValor(campoFixo: HTMLElement, lerFixo: () => string, campoExemplo: HTMLElement, lerExemplo: () => string, soVariavel: boolean) {
      let origem: Origem = soVariavel ? 'variavel' : 'fixo';
      const nomeColuna = el('input', { type: 'text', list: idLista, placeholder: 'Por exemplo: Valor', 'aria-label': 'Nome da coluna' });
      const zonaFixo = el('div', {}, campoFixo);
      const zonaVariavel = el(
        'div',
        {},
        el('label', {}, 'Nome da coluna'),
        nomeColuna,
        el('label', {}, 'Valor de exemplo (usado agora, na gravação)'),
        campoExemplo,
      );
      const radio = (valor: Origem, texto: string) => {
        const r = el('input', { type: 'radio', name: 'origem', value: valor, checked: origem === valor, onchange: () => { origem = valor; atualizar(); } });
        return el('label', {}, r, texto);
      };
      const atualizar = (): void => {
        zonaFixo.style.display = origem === 'fixo' ? 'block' : 'none';
        zonaVariavel.style.display = origem === 'variavel' ? 'block' : 'none';
      };
      atualizar();
      const no = el(
        'div',
        {},
        !soVariavel && el('div', { class: 'escolha', role: 'radiogroup', 'aria-label': 'Origem do valor' }, radio('fixo', 'Valor fixo'), radio('variavel', 'Coluna dos dados')),
        zonaFixo,
        zonaVariavel,
        soVariavel && el('p', { class: 'nota' }, 'É uma password: o valor nunca fica gravado no bloco, vem sempre dos dados do caso.'),
      );
      const obter = (): { valor: unknown; exemplo: string } | string => {
        if (origem === 'fixo') return { valor: { tipo: 'fixo', valor: lerFixo() }, exemplo: lerFixo() };
        const nome = nomeColuna.value.trim().replace(/^\{|\}$/g, '');
        if (!nome) return 'Escreve o nome da coluna.';
        return { valor: { tipo: 'variavel', nome }, exemplo: lerExemplo() };
      };
      return { no, obter, nomeColuna };
    }

    function desenhar(): void {
      erro.style.display = 'none';
      for (const b of Array.from(botoesAcao.children)) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.acao === acao));
      corpo.replaceChildren();

      if (acao === 'escrever') {
        const fixo = el('input', { type: 'text', value: atual, 'aria-label': 'Texto a escrever' });
        const exemplo = el('input', { type: secreto ? 'password' : 'text', value: atual, 'aria-label': 'Valor de exemplo' });
        if (secreto) exemplo.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #d5d9e2;border-radius:6px;font:inherit;';
        const origem = origemDoValor(el('div', {}, el('label', {}, 'Texto a escrever'), fixo), () => fixo.value, exemplo, () => exemplo.value, secreto);
        corpo.append(origem.no);
        ler = () => origem.obter();
      } else if (acao === 'escolher') {
        const criarLista = (rotuloAria: string) =>
          el('select', { 'aria-label': rotuloAria }, ...opcoes.map((o) => el('option', { value: o, selected: o === atual }, o)));
        const fixo = criarLista('Opção a escolher');
        const exemplo = criarLista('Opção de exemplo');
        const origem = origemDoValor(el('div', {}, el('label', {}, 'Opção a escolher'), fixo), () => fixo.value, exemplo, () => exemplo.value, false);
        corpo.append(origem.no);
        if (opcoes.length === 0) corpo.append(el('p', { class: 'nota' }, 'A lista ainda não tem opções. Espera que carregue e clica outra vez.'));
        ler = () => (opcoes.length === 0 ? 'A lista não tem opções.' : origem.obter());
      } else if (acao === 'marcar') {
        const criarLista = (rotuloAria: string) =>
          el('select', { 'aria-label': rotuloAria }, el('option', { value: 'S' }, 'Marcar'), el('option', { value: 'N' }, 'Desmarcar'));
        const fixo = criarLista('O que fazer');
        const exemplo = criarLista('Exemplo');
        const origem = origemDoValor(el('div', {}, el('label', {}, 'O que fazer'), fixo), () => fixo.value, exemplo, () => exemplo.value, false);
        corpo.append(origem.no, el('p', { class: 'nota' }, 'Com uma coluna: S marca, N desmarca.'));
        ler = () => origem.obter();
      } else if (acao === 'clicar') {
        corpo.append(el('p', { class: 'nota' }, 'O clique é feito agora e fica gravado.'));
        ler = () => ({});
      } else if (acao === 'verificar') {
        const tipo = el(
          'select',
          { 'aria-label': 'O que verificar' },
          el('option', { value: 'texto' }, 'O texto é igual a'),
          el('option', { value: 'numero' }, 'O número é igual a (aceita 1.234,56 €)'),
          el('option', { value: 'visivel' }, 'O elemento está visível'),
        );
        const fixo = el('input', { type: 'text', value: atual, 'aria-label': 'Valor esperado' });
        const tolerancia = el('input', { type: 'text', value: '0', 'aria-label': 'Tolerância' });
        const zonaTolerancia = el('div', {}, el('label', {}, 'Diferença máxima aceite'), tolerancia);
        const origem = origemDoValor(el('div', {}, el('label', {}, 'Valor esperado'), fixo), () => fixo.value, el('span', { class: 'nota' }, `No ecrã está agora: "${atual}"`), () => atual, false);
        const zonaValor = el('div', {}, origem.no, zonaTolerancia);
        const atualizar = (): void => {
          zonaValor.style.display = tipo.value === 'visivel' ? 'none' : 'block';
          zonaTolerancia.style.display = tipo.value === 'numero' ? 'block' : 'none';
        };
        tipo.addEventListener('change', atualizar);
        atualizar();
        corpo.append(el('label', {}, 'O que verificar'), tipo, zonaValor);
        ler = () => {
          if (tipo.value === 'visivel') return { verificacao: { tipo: 'visivel' } };
          const dados = origem.obter();
          if (typeof dados === 'string') return dados;
          const verificacao = tipo.value === 'numero' ? { tipo: 'numero', tolerancia: tolerancia.value.trim() || '0' } : { tipo: 'texto' };
          return { valor: dados.valor, verificacao };
        };
      } else {
        const nome = el('input', { type: 'text', placeholder: 'Por exemplo: PedidoId', 'aria-label': 'Nome da variável' });
        corpo.append(
          el('label', {}, 'Nome da variável'),
          nome,
          el('p', { class: 'nota' }, `Guarda o que o ecrã mostra (agora: "${atual}") para usar nos passos e blocos seguintes como {nome}.`),
        );
        ler = () => {
          const n = nome.value.trim().replace(/^\{|\}$/g, '');
          if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(n)) return 'Dá um nome simples à variável (letras, números e _; sem espaços).';
          return { variavel: n };
        };
      }
    }

    for (const a of acoes) {
      botoesAcao.append(el('button', { type: 'button', 'data-acao': a, onclick: () => { acao = a; desenhar(); } }, NOMES_ACAO[a]));
    }

    const fechar = (): void => {
      popup.remove();
      popupAberto = false;
    };

    const confirmar = async (): Promise<void> => {
      const dados = ler();
      if (typeof dados === 'string') {
        erro.textContent = dados;
        erro.style.display = 'block';
        return;
      }
      marcador += 1;
      alvo.setAttribute('data-uat-alvo', String(marcador));
      fechar();
      esconderRealce();
      estado.suspenso = true;
      mostrarAviso('A gravar o passo…');
      try {
        const resposta = await enviar({
          tipo: 'passo',
          marcador,
          acao,
          alvo: info,
          secreto,
          ...dados,
        });
        if (resposta?.ok) mostrarAviso(resposta.mensagem ?? 'Passo gravado.', 'ok');
        else mostrarAviso(resposta?.mensagem ?? 'Não foi possível gravar o passo.', 'erro');
      } catch (e) {
        mostrarAviso(`Não foi possível gravar o passo: ${String(e)}`, 'erro');
      } finally {
        estado.suspenso = false;
      }
    };

    const popup = el(
      'form',
      {
        class: 'popup',
        role: 'dialog',
        'aria-label': 'Gravar passo',
        onsubmit: (e: Event) => {
          e.preventDefault();
          void confirmar();
        },
        onkeydown: (e: Event) => {
          if ((e as KeyboardEvent).key === 'Escape') fechar();
        },
      },
      el('h2', {}, info.descricao),
      el('p', { class: 'sub' }, `${info.localizadores.length} forma${info.localizadores.length === 1 ? '' : 's'} de o encontrar`),
      botoesAcao,
      listaColunas,
      corpo,
      erro,
      el(
        'div',
        { class: 'botoes' },
        el('button', { type: 'button', onclick: fechar }, 'Cancelar'),
        el('button', { type: 'submit', class: 'primario' }, 'Gravar passo'),
      ),
    );
    desenhar();
    raiz.append(popup);
    popupAberto = true;

    // Posicionar junto ao elemento, sem sair do ecrã.
    const r = alvo.getBoundingClientRect();
    const p = popup.getBoundingClientRect();
    let topo = r.bottom + 8;
    if (topo + p.height > window.innerHeight - 8) topo = Math.max(8, r.top - p.height - 8);
    const esquerda = Math.min(Math.max(8, r.left), window.innerWidth - p.width - 8);
    popup.style.top = `${Math.max(8, Math.min(topo, window.innerHeight - p.height - 8))}px`;
    popup.style.left = `${esquerda}px`;
    (popup.querySelector('input[type="text"], select') as HTMLElement | null)?.focus();
  }

  // ---------- Rato ----------
  const ativo = (): boolean => estado.modo === 'gravar' && !estado.suspenso;
  const eNosso = (e: Event): boolean => e.composedPath().includes(hospedeiro);

  document.addEventListener(
    'mousemove',
    (e) => {
      if (!ativo() || popupAberto || eNosso(e)) return;
      const origem = document.elementFromPoint(e.clientX, e.clientY);
      if (!origem || origem === hospedeiro) return esconderRealce();
      const alvo = normalizar(origem);
      const r = alvo.getBoundingClientRect();
      realce.style.cssText = `display:block;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;`;
      rotulo.textContent = recolher(alvo, especieDe(alvo)).descricao;
      rotulo.style.cssText = `display:block;left:${Math.max(0, r.left)}px;top:${r.top >= 22 ? r.top - 22 : r.bottom + 2}px;`;
    },
    true,
  );

  for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu']) {
    document.addEventListener(
      tipo,
      (e) => {
        if (!ativo() || eNosso(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (tipo !== 'click' || popupAberto) return;
        const origem = e.target instanceof Element ? e.target : null;
        if (origem) abrirPopup(normalizar(origem));
      },
      true,
    );
  }

  // ---------- Ligação ao UAT Studio ----------
  w.__uatPagina = { definirModo: (m: 'gravar' | 'livre') => definirModo(m, false), mostrarAviso };
  definirModo('gravar', false);
  void enviar({ tipo: 'estado' }).then((resposta) => {
    if (!resposta) return;
    estado.colunas = resposta.colunas ?? [];
    definirModo(resposta.modo ?? 'gravar', false);
  });
}
