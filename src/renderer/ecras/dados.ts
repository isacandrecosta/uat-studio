// Ecrã Dados de teste: variáveis calculadas por fórmula (com pré-visualização), contadores e ajuda.
import { AJUDA_FORMULAS, avaliarFormula, contextoDeExemplo, validarFormula } from '../../shared/formulas.js';
import { enderecoDeTeste, FORMATO_POR_OMISSAO } from '../../shared/caixa.js';
import type { CaixaTestes, ModoLogin, VariavelCalculada } from '../../shared/modelo.js';
import type { Contexto } from '../app.js';
import { confirmar, h, info, mensagemDeErro, pedirFormulario, pedirTexto } from '../dom.js';

export async function ecraDados({ corpo, selecao, estado, atualizar }: Contexto): Promise<void> {
  const api = window.uatStudio;
  const [variaveis, jornadas, conjuntos] = await Promise.all([api.variaveis.ler(), api.dados.listar('jornadas'), api.dados.listar('casos')]);
  let contadores = await api.contadores.ler();
  let segredosTeste = await api.cofre.segredosDeTeste();
  let sessao = estado.projeto.caixaTestes ? await api.caixa.sessao() : false;

  // Caso de exemplo para a pré-visualização: o 1.º caso da jornada escolhida.
  const opcoesExemplo = jornadas.flatMap((j) => (conjuntos.find((c) => c.id === j.id)?.casos ?? []).map((caso) => ({ chave: `${j.id}/${caso.id}`, texto: `${j.nome} › ${caso.id}`, caso })));
  let exemplo = opcoesExemplo.find((o) => o.chave.startsWith(`${selecao.jornadaId ?? ''}/`)) ?? opcoesExemplo[0];

  const zona = h('div', { class: 'dados-teste' });
  corpo.append(zona);
  desenhar();

  /** Calcula a fórmula com o caso de exemplo, sem gastar contadores. */
  function previsualizar(formula: string): { ok: boolean; texto: string } {
    if (!formula.trim()) return { ok: true, texto: '' };
    const dados: Record<string, string> = { ...(exemplo?.caso.dados ?? {}), TESTE: exemplo?.caso.id ?? 'TC0001', RUN: 'run1' };
    const base = contextoDeExemplo(dados, contadores, estado.projeto.caixaTestes);
    const emCurso: string[] = [];
    const procurar = (nome: string): string | undefined => {
      if (nome in dados) return dados[nome];
      const outra = variaveis.find((v) => v.nome === nome);
      if (!outra || emCurso.includes(nome)) return undefined;
      emCurso.push(nome);
      try {
        return avaliarFormula(outra.formula, { ...base, variavel: procurar });
      } finally {
        emCurso.pop();
      }
    };
    try {
      return { ok: true, texto: avaliarFormula(formula, { ...base, variavel: procurar }) };
    } catch (erro) {
      return { ok: false, texto: erro instanceof Error ? erro.message : String(erro) };
    }
  }

  async function gravar(): Promise<boolean> {
    try {
      await api.variaveis.gravar(variaveis);
      return true;
    } catch (erro) {
      await confirmar('Não foi possível guardar', mensagemDeErro(erro), 'Fechar');
      return false;
    }
  }

  function campoComPrevisao(formulaInicial: string, rotulo: string, aoMudar: (formula: string) => void): { campo: HTMLInputElement; resultado: HTMLElement } {
    const campo = h('input', { type: 'text', class: 'campo campo-formula', value: formulaInicial, 'aria-label': rotulo, spellcheck: 'false' });
    const resultado = h('span', { class: 'previsao', role: 'status' });
    const atualizar = (): void => {
      const { ok, texto } = previsualizar(campo.value);
      resultado.textContent = campo.value.trim() ? (ok ? `= ${texto}` : texto) : '';
      resultado.dataset.estado = ok ? 'ok' : 'erro';
    };
    campo.addEventListener('input', atualizar);
    campo.addEventListener('change', () => aoMudar(campo.value));
    atualizar();
    return { campo, resultado };
  }

  function desenhar(): void {
    zona.replaceChildren(cartaoVariaveis(), cartaoExperimentar(), cartaoCaixa(), cartaoSegredos(), cartaoContadores(), cartaoAjuda());
  }

  function cartaoVariaveis(): HTMLElement {
    const escolhaExemplo = h(
      'select',
      { id: 'dados-exemplo', class: 'campo', 'aria-label': 'Caso de exemplo para a pré-visualização' },
      opcoesExemplo.length === 0 && h('option', { value: '' }, 'Sem casos (as variáveis dos casos ficam em falta)'),
      opcoesExemplo.map((o) => h('option', { value: o.chave, selected: o.chave === exemplo?.chave }, `Exemplo: ${o.texto}`)),
    );
    escolhaExemplo.addEventListener('change', () => {
      exemplo = opcoesExemplo.find((o) => o.chave === escolhaExemplo.value) ?? exemplo;
      desenhar();
    });
    const linhas = variaveis.map((variavel, indice) => {
      const { campo, resultado } = campoComPrevisao(variavel.formula, `Fórmula de ${variavel.nome}`, (formula) => {
        if (validarFormula(formula)) return; // com erro de escrita: mostra o erro e não guarda
        variavel.formula = formula;
        void gravar();
      });
      return h(
        'li',
        { class: 'linha-variavel', 'data-variavel': variavel.nome },
        h('code', { class: 'nome-variavel' }, `{${variavel.nome}}`),
        h('div', { class: 'formula-caixa' }, campo, resultado),
        h(
          'button',
          {
            type: 'button',
            class: 'botao botao-discreto-claro',
            'aria-label': `Apagar a variável ${variavel.nome}`,
            onclick: async () => {
              if (!(await confirmar('Apagar variável', `Apagar {${variavel.nome}}? Os passos que a usam deixam de funcionar.`))) return;
              variaveis.splice(indice, 1);
              if (await gravar()) desenhar();
            },
          },
          'Apagar',
        ),
      );
    });
    return h(
      'section',
      { class: 'cartao' },
      h(
        'header',
        { class: 'cartao-topo' },
        h(
          'div',
          {},
          h('h2', {}, 'Variáveis calculadas', info("Valores calculados por fórmula uma vez por caso (por exemplo a comissão esperada). Usam-se como qualquer coluna: {Nome}.")),
          h('p', { class: 'suave' }, 'Cada uma é calculada por uma fórmula, uma vez por caso, e pode ser usada em qualquer passo como {nome}.'),
        ),
        h(
          'div',
          { class: 'acoes' },
          escolhaExemplo,
          h(
            'button',
            {
              id: 'btn-nova-variavel',
              type: 'button',
              class: 'botao botao-primario',
              onclick: async () => {
                const nome = (await pedirTexto('Nova variável', 'Nome (letras, números e _; sem espaços)'))?.replace(/^\{|\}$/g, '');
                if (!nome) return;
                variaveis.push({ nome, formula: '' } satisfies VariavelCalculada);
                if (await gravar()) desenhar();
                else variaveis.pop();
              },
            },
            'Nova variável',
          ),
        ),
      ),
      variaveis.length === 0
        ? h('p', { class: 'suave' }, 'Ainda não há variáveis calculadas. Por exemplo: Referencia = "cliente_" & {TESTE} & "_" & {RUN}')
        : h('ul', { id: 'lista-variaveis', class: 'lista-variaveis' }, linhas),
    );
  }

  function cartaoExperimentar(): HTMLElement {
    const { campo, resultado } = campoComPrevisao('', 'Fórmula para experimentar', () => undefined);
    campo.id = 'formula-experimentar';
    campo.placeholder = 'Escreve uma fórmula para ver o resultado, por exemplo: ARRED.PAR(86,405; 2)';
    resultado.id = 'resultado-experimentar';
    return h(
      'section',
      { class: 'cartao' },
      h('header', { class: 'cartao-topo' }, h('div', {}, h('h2', {}, 'Experimentar uma fórmula'), h('p', { class: 'suave' }, 'Não guarda nada nem gasta contadores.'))),
      h('div', { class: 'formula-caixa' }, campo, resultado),
    );
  }

  /** Passwords de teste no cofre do Windows: nos casos escreve-se {SEGREDO:nome}. Os valores nunca voltam à interface. */
  function cartaoCaixa(): HTMLElement {
    const caixa = estado.projeto.caixaTestes;
    const resultado = h('p', { class: 'suave', id: 'caixa-resultado', role: 'status' });
    const TIPOS = [
      { valor: 'pessoal', texto: 'Outlook / Hotmail (conta Microsoft pessoal)' },
      { valor: 'empresa', texto: 'Microsoft 365 (conta da empresa)' },
      { valor: 'simulada', texto: 'Caixa simulada (servidor de teste local)' },
    ];
    const MODOS = [
      { valor: 'janela', texto: 'Numa janela da ferramenta (recomendado)' },
      { valor: 'edge', texto: 'No Microsoft Edge' },
      { valor: 'codigo', texto: 'Com um código noutro dispositivo (telemóvel ou outro PC)' },
    ];
    const SEM_SESSAO = 'sem sessão (o login é pedido na 1.ª utilização)';
    const COM_SESSAO = 'sessão guardada neste PC (encriptada)';
    const definir = async (): Promise<void> => {
      const atual = caixa;
      const passo1 = await pedirFormulario(
        'Caixa de email de testes',
        [
          {
            id: 'emailBase',
            rotulo: 'Email base',
            valor: atual?.emailBase ?? '',
            obrigatorio: true,
            ajuda: 'Uma caixa só para testes, aprovada pela IT (por exemplo emailteste@outlook.com). Os endereços de cada caso são variações: emailteste+gestor_tc0001_13112026@outlook.com.',
          },
          { id: 'tipo', rotulo: 'Que caixa é', tipo: 'escolha', opcoes: TIPOS, valor: atual?.ligacao === 'simulada' ? 'simulada' : (atual?.conta ?? 'pessoal') },
          {
            id: 'modoLogin',
            rotulo: 'Como entrar na caixa',
            tipo: 'escolha',
            opcoes: MODOS,
            valor: atual?.modoLogin ?? 'janela',
            ajuda: 'Em todos os modos, a password é escrita na página da Microsoft (ou do fornecedor), nunca num campo da ferramenta. A sessão fica encriptada neste PC.',
          },
          { id: 'formato', rotulo: 'Formato dos endereços (opcional)', valor: atual?.formato ?? FORMATO_POR_OMISSAO, ajuda: 'Pode usar {nome}, {dominio}, {papel}, {caso}, {run} e {data}.' },
        ],
        'Seguinte',
      );
      if (!passo1) return;
      const simulada = passo1.tipo === 'simulada';
      const passo2 = await pedirFormulario(
        simulada ? 'Caixa simulada: endereços' : 'Ligação à Microsoft',
        simulada
          ? [
              { id: 'urlApi', rotulo: 'Endereço da API (ao estilo do Microsoft Graph)', valor: atual?.urlApi ?? 'http://localhost:4010/graph/v1.0', obrigatorio: true },
              { id: 'urlAutorizacao', rotulo: 'Página de login', valor: atual?.urlAutorizacao ?? 'http://localhost:4010/oauth/authorize' },
              { id: 'urlToken', rotulo: 'Endereço do token', valor: atual?.urlToken ?? 'http://localhost:4010/oauth/token', obrigatorio: true },
              { id: 'urlDispositivo', rotulo: 'Endereço do código (login com código)', valor: atual?.urlDispositivo ?? 'http://localhost:4010/oauth/devicecode' },
              { id: 'clientId', rotulo: 'Client ID', valor: atual?.clientId ?? 'uat-publico' },
            ]
          : [
              {
                id: 'clientId',
                rotulo: 'Client ID',
                valor: atual?.clientId ?? '',
                obrigatorio: true,
                ajuda: 'O identificador da aplicação registada no Microsoft Entra com a permissão Mail.Read (delegada). Numa conta da empresa, é a IT que o dá.',
              },
              ...(passo1.tipo === 'empresa'
                ? [{ id: 'tenant', rotulo: 'Tenant (opcional)', valor: atual?.tenant ?? '', ajuda: 'O domínio ou o ID do diretório da empresa (por exemplo empresa.onmicrosoft.com). Vazio = qualquer organização.' }]
                : []),
            ],
      );
      if (!passo2) return;
      const nova: CaixaTestes = {
        emailBase: passo1.emailBase,
        formato: passo1.formato,
        modoLogin: passo1.modoLogin as ModoLogin,
        ligacao: simulada ? 'simulada' : 'microsoft',
        ...(simulada ? {} : { conta: passo1.tipo as 'pessoal' | 'empresa' }),
        ...passo2,
      };
      try {
        await api.caixa.gravar(nova);
        await atualizar();
      } catch (erro) {
        await confirmar('Não foi possível guardar', mensagemDeErro(erro), 'Fechar');
      }
    };
    const estadoSessao = h('span', { class: 'item-meta', id: 'caixa-sessao' }, sessao ? COM_SESSAO : SEM_SESSAO);
    const testar = async (botao: HTMLButtonElement): Promise<void> => {
      botao.disabled = true;
      resultado.className = 'suave';
      resultado.textContent = 'A ligar... (se for preciso, faça o login na janela que abrir)';
      try {
        const r = await api.caixa.testar();
        resultado.className = 'texto-ok';
        resultado.textContent = `Ligado. ${r.emails === 0 ? 'A caixa está vazia.' : `Último email: "${r.ultimo}".`}`;
        sessao = true;
        estadoSessao.textContent = COM_SESSAO;
      } catch (erro) {
        resultado.className = 'texto-erro';
        resultado.textContent = mensagemDeErro(erro);
      } finally {
        botao.disabled = false;
      }
    };
    let exemploEmail = '';
    try {
      exemploEmail = caixa ? enderecoDeTeste(caixa, 'gestor', { caso: exemplo?.caso.id ?? 'TC0001', run: 'run1', agora: new Date() }) : '';
    } catch (erro) {
      exemploEmail = mensagemDeErro(erro);
    }
    const tipoTexto = caixa ? (caixa.ligacao === 'simulada' ? TIPOS[2].texto : (TIPOS.find((t) => t.valor === caixa.conta)?.texto ?? TIPOS[0].texto)) : '';
    return h(
      'section',
      { class: 'cartao', id: 'cartao-caixa-testes' },
      h(
        'header',
        { class: 'cartao-topo' },
        h(
          'div',
          {},
          h('h2', {}, 'Caixa de email de testes', info('Um email base e endereços automáticos por papel e caso. Os blocos de email com um papel leem esta caixa sozinhos.')),
          h('p', { class: 'suave' }, 'Defina uma caixa só para testes. Nos casos use {EMAIL:gestor} como email do gestor: cada caso fica com o seu endereço e os blocos de email verificam o que lá chega.'),
        ),
        h('button', { id: 'btn-caixa-definir', type: 'button', class: caixa ? 'botao' : 'botao botao-primario', onclick: () => void definir() }, caixa ? 'Alterar' : 'Definir caixa'),
      ),
      caixa
        ? h(
            'div',
            {},
            h(
              'ul',
              { class: 'lista-itens' },
              h('li', { class: 'item' }, h('strong', {}, caixa.emailBase), h('span', { class: 'item-meta' }, tipoTexto)),
              h('li', { class: 'item' }, h('span', {}, `Login: ${MODOS.find((m) => m.valor === caixa.modoLogin)?.texto ?? ''}`), estadoSessao),
              h('li', { class: 'item' }, h('span', {}, 'Exemplo: {EMAIL:gestor} ='), h('code', { id: 'caixa-exemplo' }, exemploEmail)),
            ),
            h(
              'div',
              { class: 'caixa-acoes' },
              h('button', { id: 'btn-caixa-testar', type: 'button', class: 'botao botao-primario', onclick: (e: Event) => void testar(e.currentTarget as HTMLButtonElement) }, 'Ligar e testar'),
              h(
                'button',
                {
                  id: 'btn-caixa-esquecer',
                  type: 'button',
                  class: 'botao',
                  onclick: async () => {
                    await api.caixa.esquecer();
                    sessao = false;
                    estadoSessao.textContent = SEM_SESSAO;
                    resultado.className = 'suave';
                    resultado.textContent = 'Sessão esquecida neste PC.';
                  },
                },
                'Esquecer a sessão',
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'botao',
                  onclick: async () => {
                    if (!(await confirmar('Retirar a caixa de testes?', 'Os blocos de email com papel deixam de funcionar até definir outra caixa.', 'Retirar'))) return;
                    await api.caixa.esquecer();
                    await api.caixa.gravar(null);
                    await atualizar();
                  },
                },
                'Retirar',
              ),
            ),
            resultado,
          )
        : h('p', { class: 'suave' }, 'Ainda não há caixa de testes. Peça à IT uma caixa dedicada (sem dados reais) e, para Microsoft, o Client ID de uma aplicação com a permissão Mail.Read.'),
    );
  }

  function cartaoSegredos(): HTMLElement {
    const definir = async (nomeAtual?: string): Promise<void> => {
      const valores = await pedirFormulario(nomeAtual ? `Segredo "${nomeAtual}"` : 'Novo segredo de teste', [
        ...(nomeAtual ? [] : [{ id: 'nome', rotulo: 'Nome', obrigatorio: true, ajuda: 'Por exemplo ana.silva. Nos casos escreve-se {SEGREDO:ana.silva}.' }]),
        { id: 'valor', rotulo: nomeAtual ? 'Novo valor' : 'Valor (a password de teste)', tipo: 'segredo' as const, obrigatorio: true, ajuda: 'Fica encriptado neste PC (Windows). Nunca vai para os ficheiros do projeto, os logs ou os relatórios.' },
      ]);
      if (!valores) return;
      const nome = nomeAtual ?? valores.nome.trim();
      try {
        await api.cofre.definirSegredoDeTeste(nome, valores.valor);
        segredosTeste = await api.cofre.segredosDeTeste();
        desenhar();
      } catch (erro) {
        await confirmar('Não foi possível guardar', mensagemDeErro(erro), 'Fechar');
      }
    };
    return h(
      'section',
      { class: 'cartao', id: 'cartao-segredos' },
      h(
        'header',
        { class: 'cartao-topo' },
        h(
          'div',
          {},
          h('h2', {}, 'Segredos de teste', info("Passwords de teste guardadas encriptadas neste PC. Nos casos e no Excel escreve-se {SEGREDO:nome}.")),
          h('p', { class: 'suave' }, 'Passwords de teste (por exemplo, do login): ficam encriptadas no cofre deste PC. Nos casos e no Excel escreva só {SEGREDO:nome}. Noutro PC é preciso voltar a preenchê-las.'),
        ),
        h('button', { id: 'btn-novo-segredo', type: 'button', class: 'botao', onclick: () => void definir() }, 'Novo segredo'),
      ),
      segredosTeste.length === 0
        ? h('p', { class: 'suave' }, 'Ainda não há segredos de teste neste PC.')
        : h(
            'ul',
            { class: 'lista-itens', id: 'lista-segredos' },
            segredosTeste.map((nome) =>
              h(
                'li',
                { class: 'item' },
                h('code', {}, `{SEGREDO:${nome}}`),
                h('span', { class: 'item-meta' }, 'guardado (encriptado)'),
                h('button', { type: 'button', class: 'botao botao-pequeno-livre', onclick: () => void definir(nome) }, 'Mudar'),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'botao botao-discreto-claro',
                    'aria-label': `Apagar o segredo ${nome}`,
                    onclick: async () => {
                      if (!(await confirmar('Apagar segredo', `Apagar o segredo "${nome}" deste PC? Os casos que usam {SEGREDO:${nome}} deixam de correr até voltar a ser preenchido.`))) return;
                      await api.cofre.definirSegredoDeTeste(nome, '');
                      segredosTeste = await api.cofre.segredosDeTeste();
                      desenhar();
                    },
                  },
                  'Apagar',
                ),
              ),
            ),
          ),
    );
  }

  function cartaoContadores(): HTMLElement {
    const nomes = Object.keys(contadores).sort();
    const definir = async (nome: string, valor: number | null): Promise<void> => {
      try {
        contadores = await api.contadores.definir(nome, valor);
        desenhar();
      } catch (erro) {
        await confirmar('Não foi possível guardar', mensagemDeErro(erro), 'Fechar');
      }
    };
    return h(
      'section',
      { class: 'cartao' },
      h(
        'header',
        { class: 'cartao-topo' },
        h(
          'div',
          {},
          h('h2', {}, 'Contadores', info("Números que aumentam a cada utilização e ficam guardados entre execuções, para criar dados únicos (por exemplo um número de cliente).")),
          h('p', { class: 'suave' }, '{CONTADOR:nome} dá um número novo de cada vez (o valor atual + 1) e fica guardado entre execuções.'),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'botao',
            onclick: async () => {
              const nome = await pedirTexto('Novo contador', 'Nome do contador');
              if (nome) await definir(nome, contadores[nome] ?? 0);
            },
          },
          'Novo contador',
        ),
      ),
      nomes.length === 0
        ? h('p', { class: 'suave' }, 'Ainda não há contadores. São criados sozinhos na primeira vez que uma fórmula os usa.')
        : h(
            'ul',
            { class: 'lista-itens', id: 'lista-contadores' },
            nomes.map((nome) => {
              const valor = h('input', { type: 'number', min: 0, step: 1, class: 'campo campo-numero', value: contadores[nome], 'aria-label': `Valor atual do contador ${nome}` });
              valor.addEventListener('change', () => void definir(nome, Number(valor.value)));
              return h(
                'li',
                { class: 'item' },
                h('code', {}, `{CONTADOR:${nome}}`),
                h('span', { class: 'item-meta' }, 'Valor atual', valor, h('span', {}, `próximo: ${contadores[nome] + 1}`)),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'botao botao-discreto-claro',
                    'aria-label': `Apagar o contador ${nome}`,
                    onclick: async () => {
                      if (await confirmar('Apagar contador', `Apagar o contador "${nome}"? Volta a começar em 1.`)) await definir(nome, null);
                    },
                  },
                  'Apagar',
                ),
              );
            }),
          ),
    );
  }

  function cartaoAjuda(): HTMLElement {
    return h(
      'section',
      { class: 'cartao' },
      h(
        'header',
        { class: 'cartao-topo' },
        h('div', {}, h('h2', {}, 'Como escrever fórmulas'), h('p', { class: 'suave' }, 'Textos entre aspas, variáveis entre chavetas, argumentos separados por ponto e vírgula. As contas são sempre exatas.')),
      ),
      h(
        'dl',
        { class: 'ajuda-formulas' },
        AJUDA_FORMULAS.flatMap((a) => [h('dt', {}, h('code', {}, a.exemplo)), h('dd', {}, a.descricao)]),
      ),
    );
  }
}
