// Ecrã Dados de teste: variáveis calculadas por fórmula (com pré-visualização), contadores e ajuda.
import { AJUDA_FORMULAS, avaliarFormula, contextoDeExemplo, validarFormula } from '../../shared/formulas.js';
import type { VariavelCalculada } from '../../shared/modelo.js';
import type { Contexto } from '../app.js';
import { confirmar, h, mensagemDeErro, pedirFormulario, pedirTexto } from '../dom.js';

export async function ecraDados({ corpo, selecao }: Contexto): Promise<void> {
  const api = window.uatStudio;
  const [variaveis, jornadas, conjuntos] = await Promise.all([api.variaveis.ler(), api.dados.listar('jornadas'), api.dados.listar('casos')]);
  let contadores = await api.contadores.ler();
  let segredosTeste = await api.cofre.segredosDeTeste();

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
    const base = contextoDeExemplo(dados, contadores);
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
    zona.replaceChildren(cartaoVariaveis(), cartaoExperimentar(), cartaoSegredos(), cartaoContadores(), cartaoAjuda());
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
          h('h2', {}, 'Variáveis calculadas'),
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
          h('h2', {}, 'Segredos de teste'),
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
          h('h2', {}, 'Contadores'),
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
