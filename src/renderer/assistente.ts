// Assistente "Novo teste": do zero a um teste a correr, numa só janela e em 4 passos:
//   1. o que vai testar (nome, aplicação, épico);  2. gravar no Edge;
//   3. o que varia de caso para caso (passa a colunas, para o Excel);  4. correr agora ou abrir no editor.
// Usa as mesmas peças do resto da ferramenta (gravador, parametrizar, execuções).
import type { EstadoGravador, EstadoProjeto } from '../shared/modelo.js';
import { valoresFixos, colunaValida } from '../shared/parametrizar.js';
import { confirmar, h, info, mensagemDeErro, plural } from './dom.js';

export interface ContextoAssistente {
  estado: EstadoProjeto;
  irPara(ecra: string): void;
  abrirCenario(jornadaId: string): void;
}

export async function abrirAssistente(ctx: ContextoAssistente): Promise<void> {
  if (document.getElementById('assistente')) return;
  const api = window.uatStudio;
  const [aplicacoes, epicos] = await Promise.all([api.dados.listar('aplicacoes'), api.dados.listar('epicos')]);
  const ambiente = ctx.estado.projeto.ambientes.find((a) => a.id === ctx.estado.projeto.ambienteAtivo);
  const deEcra = aplicacoes.filter((a) => a.tipo === 'FO' || a.tipo === 'BO');

  const corpo = h('div', { class: 'assistente-corpo' });
  const indicador = h('ol', { class: 'assistente-passos', 'aria-label': 'Passos do assistente' });
  const janela = h('dialog', { id: 'assistente', class: 'dialogo assistente' }, h('h2', {}, 'Novo teste'), indicador, corpo);
  let deixarDeOuvir: (() => void) | null = null;
  const fechar = (): void => {
    deixarDeOuvir?.();
    janela.close();
    janela.remove();
  };
  janela.addEventListener('cancel', (e) => {
    // Durante a gravação, Esc não fecha (para não deixar o Edge aberto sem querer).
    if (janela.dataset.passo === '2') e.preventDefault();
    else fechar();
  });
  const mostrarPasso = (n: number): void => {
    janela.dataset.passo = String(n);
    indicador.replaceChildren(
      ...['O que testar', 'Gravar', 'O que varia', 'Correr'].map((nome, i) => h('li', { 'data-estado': i + 1 < n ? 'feito' : i + 1 === n ? 'atual' : 'por-fazer' }, nome)),
    );
  };
  const erro = (texto: string): HTMLElement => h('p', { class: 'aviso-erro', role: 'alert' }, texto);
  document.body.append(janela);
  janela.showModal();

  // ---------------------------------------------------------------- passo 1: o que vai testar
  const passo1 = (): void => {
    mostrarPasso(1);
    const nome = h('input', { type: 'text', id: 'assistente-nome', class: 'campo', placeholder: 'Por exemplo: Criar empresa com contrato de 12 meses', maxlength: 120 });
    const aplicacao = h(
      'select',
      { id: 'assistente-aplicacao', class: 'campo' },
      ...deEcra.map((a) => h('option', { value: a.id }, a.nome)),
      h('option', { value: '__nova', selected: deEcra.length === 0 }, 'Nova aplicação…'),
    );
    const novaNome = h('input', { type: 'text', id: 'assistente-app-nome', class: 'campo', placeholder: 'Por exemplo: Portal do Cliente' });
    const novaUrl = h('input', { type: 'url', id: 'assistente-app-url', class: 'campo', placeholder: 'https://...' });
    const zonaNova = h(
      'div',
      { class: 'assistente-nova-app' },
      h('label', { for: 'assistente-app-nome' }, 'Nome da aplicação'),
      novaNome,
      h('label', { for: 'assistente-app-url' }, `Endereço no ambiente ${ambiente?.nome ?? ''}`, info('O endereço da página inicial da aplicação neste ambiente. Noutros ambientes preenche-se depois, no ecrã Cenários › Aplicações.')),
      novaUrl,
    );
    const atualizarNova = (): void => {
      zonaNova.hidden = aplicacao.value !== '__nova';
    };
    aplicacao.addEventListener('change', atualizarNova);
    const epico = h(
      'select',
      { id: 'assistente-epico', class: 'campo' },
      ...epicos.map((e) => h('option', { value: e.id }, e.nome)),
      h('option', { value: '__novo', selected: epicos.length === 0 }, 'Novo épico: "Os meus testes"'),
    );
    const zonaErro = h('div', {});
    const seguinte = h('button', { type: 'button', class: 'botao botao-primario', id: 'assistente-gravar' }, 'Começar a gravar');
    seguinte.addEventListener('click', async () => {
      zonaErro.replaceChildren();
      if (!nome.value.trim()) return zonaErro.replaceChildren(erro('Dê um nome ao teste.'));
      let aplicacaoId = aplicacao.value;
      try {
        if (aplicacaoId === '__nova') {
          if (!novaNome.value.trim() || !/^https?:\/\//i.test(novaUrl.value.trim())) return zonaErro.replaceChildren(erro('Indique o nome da aplicação e um endereço começado por http:// ou https://.'));
          const nova = await api.dados.guardar('aplicacoes', { nome: novaNome.value.trim(), tipo: 'FO', cor: '#2f6bed', urls: { [ctx.estado.projeto.ambienteAtivo]: novaUrl.value.trim() } });
          aplicacaoId = nova.id;
        }
        let confirmouProducao = false;
        if (ambiente?.tipo === 'PRD') {
          confirmouProducao = await confirmar('Ambiente de PRODUÇÃO', `O ambiente ativo (${ambiente.nome}) é de produção. Quer mesmo gravar aqui?`, 'Gravar em produção');
          if (!confirmouProducao) return;
        }
        seguinte.disabled = true;
        seguinte.textContent = 'A abrir o Edge…';
        await api.gravador.iniciar({ aplicacaoId, nomeNovo: nome.value.trim(), abrirAplicacao: true, canal: 'msedge', confirmouProducao });
        passo2(nome.value.trim(), epico.value);
      } catch (e) {
        seguinte.disabled = false;
        seguinte.textContent = 'Começar a gravar';
        zonaErro.replaceChildren(erro(mensagemDeErro(e)));
      }
    });
    atualizarNova();
    corpo.replaceChildren(
      h('p', { class: 'suave' }, 'Em 4 passos fica com um teste pronto a correr. Pode sempre afinar depois no Editor do cenário.'),
      h('label', { for: 'assistente-nome' }, 'Nome do teste'),
      nome,
      h('label', { for: 'assistente-aplicacao' }, 'Aplicação a testar'),
      aplicacao,
      zonaNova,
      h('label', { for: 'assistente-epico' }, 'Épico (pasta onde fica o teste)'),
      epico,
      zonaErro,
      h('div', { class: 'dialogo-botoes' }, h('button', { type: 'button', class: 'botao', onclick: fechar }, 'Cancelar'), seguinte),
    );
    nome.focus();
  };

  // ---------------------------------------------------------------- passo 2: gravar
  const passo2 = (nomeTeste: string, epicoEscolhido: string): void => {
    mostrarPasso(2);
    const contagem = h('p', { class: 'assistente-contagem', id: 'assistente-contagem' }, 'Ainda sem passos.');
    const ultimos = h('ol', { class: 'assistente-ultimos' });
    const aviso = h('div', {});
    const desenharEstado = (estado: EstadoGravador): void => {
      const passos = estado.bloco?.passos ?? [];
      // O 1.º passo é "abrir a aplicação": não conta como passo gravado pelo testador.
      const gravados = passos.length > 0 && passos[0].acao === 'navegar' ? passos.length - 1 : passos.length;
      contagem.textContent = gravados === 0 ? 'Ainda sem passos: clique num campo ou botão no Edge.' : `${plural(gravados, 'passo gravado', 'passos gravados')}.`;
      ultimos.replaceChildren(...passos.slice(-5).map((p) => h('li', {}, p.descricao)));
      aviso.replaceChildren(estado.browserAberto === false ? erro('O Edge foi fechado. Carregue em "Terminar e guardar" para continuar com o que gravou.') : '');
    };
    deixarDeOuvir = api.gravador.aoAtualizar(desenharEstado);
    void api.gravador.estado().then(desenharEstado);
    const terminar = h('button', { type: 'button', class: 'botao botao-primario', id: 'assistente-terminar' }, 'Terminar e guardar');
    terminar.addEventListener('click', async () => {
      terminar.disabled = true;
      try {
        const bloco = await api.gravador.terminar(true);
        deixarDeOuvir?.();
        deixarDeOuvir = null;
        if (!bloco) throw new Error('A gravação já tinha terminado.');
        // Épico, cenário com o bloco gravado.
        const epicoId = epicoEscolhido === '__novo' ? (await api.dados.guardar('epicos', { nome: 'Os meus testes' })).id : epicoEscolhido;
        const cenario = await api.dados.guardar('jornadas', { nome: nomeTeste, epicoId, etiquetas: [], blocos: [{ id: 'b1', blocoId: bloco.id }] });
        passo3(cenario.id, bloco);
      } catch (e) {
        terminar.disabled = false;
        aviso.replaceChildren(erro(mensagemDeErro(e)));
      }
    });
    const cancelar = h('button', { type: 'button', class: 'botao' }, 'Cancelar');
    cancelar.addEventListener('click', async () => {
      if (!(await confirmar('Cancelar a gravação', 'Fechar o Edge e deitar fora os passos gravados?', 'Deitar fora'))) return;
      await api.gravador.terminar(false).catch(() => null);
      fechar();
    });
    corpo.replaceChildren(
      h(
        'div',
        { class: 'assistente-dica' },
        h('p', {}, h('strong', {}, 'O Edge abriu a aplicação.'), ' Faça o teste como faria à mão: clique em cada campo ou botão e escolha no popup o que fazer.'),
        h(
          'ul',
          {},
          h('li', {}, 'Campos: "Escrever" (o valor que quiser; depois decide o que varia).'),
          h('li', {}, 'Botões: "Clicar".'),
          h('li', {}, 'Resultados (estado, montante, mensagem): "Verificar". Para euros, escolha "Número".'),
        ),
      ),
      contagem,
      ultimos,
      aviso,
      h('div', { class: 'dialogo-botoes' }, cancelar, terminar),
    );
  };

  // ---------------------------------------------------------------- passo 3: o que varia
  const passo3 = (cenarioId: string, bloco: Parameters<typeof valoresFixos>[0]): void => {
    mostrarPasso(3);
    const fixos = valoresFixos(bloco);
    const linhas = fixos.map((v) => {
      const marcar = h('input', { type: 'checkbox', checked: true, 'aria-label': `Varia: ${v.descricao}` });
      const coluna = h('input', { type: 'text', class: 'campo assistente-coluna', value: v.coluna, 'aria-label': `Nome da coluna para ${v.descricao}` });
      marcar.addEventListener('change', () => {
        coluna.disabled = !marcar.checked;
      });
      return {
        v,
        marcar,
        coluna,
        no: h('li', { class: 'assistente-variavel' }, h('label', { class: 'opcao' }, marcar, h('span', {}, h('strong', {}, v.descricao), h('span', { class: 'suave' }, ` "${v.valor.length > 30 ? `${v.valor.slice(0, 30)}…` : v.valor}"`))), coluna),
      };
    });
    const zonaErro = h('div', {});
    const continuar = h('button', { type: 'button', class: 'botao botao-primario', id: 'assistente-continuar' }, 'Continuar');
    continuar.addEventListener('click', async () => {
      zonaErro.replaceChildren();
      const escolhas = linhas.filter((l) => l.marcar.checked).map((l) => ({ passoId: l.v.passoId, coluna: l.coluna.value.trim() }));
      const invalida = escolhas.find((e) => !colunaValida(e.coluna));
      if (invalida) return zonaErro.replaceChildren(erro(`"${invalida.coluna}" não serve como nome de coluna: use letras e números, sem espaços (por exemplo NomeEmpresa).`));
      if (new Set(escolhas.map((e) => e.coluna)).size !== escolhas.length) return zonaErro.replaceChildren(erro('Há duas colunas com o mesmo nome.'));
      continuar.disabled = true;
      try {
        let colunas: string[] = [];
        if (escolhas.length > 0) colunas = (await api.blocos.parametrizar(bloco.id, escolhas)).colunas;
        else await api.dados.guardar('casos', { id: cenarioId, colunas: [], casos: [{ id: 'TC0001', nome: 'Valores da gravação', etiquetas: [], dados: {} }] });
        passo4(cenarioId, colunas);
      } catch (e) {
        continuar.disabled = false;
        zonaErro.replaceChildren(erro(mensagemDeErro(e)));
      }
    });
    corpo.replaceChildren(
      fixos.length === 0
        ? h('p', {}, 'Este teste não tem valores para variar (só cliques ou valores que já vêm de colunas). Pode continuar.')
        : h(
            'div',
            {},
            h('p', {}, 'Marque o que deve mudar de caso para caso: passa a ser uma coluna dos casos de teste (e do Excel). O que não marcar fica sempre igual.', info('Os valores gravados ficam como primeiro caso de teste (TC0001). Depois, no Editor do cenário › Casos de teste, acrescente linhas ou exporte para Excel para criar muitos casos.')),
            h('ul', { class: 'assistente-variaveis' }, linhas.map((l) => l.no)),
          ),
      zonaErro,
      h('div', { class: 'dialogo-botoes' }, continuar),
    );
  };

  // ---------------------------------------------------------------- passo 4: correr
  const passo4 = (cenarioId: string, colunas: string[]): void => {
    mostrarPasso(4);
    const correr = h('button', { type: 'button', class: 'botao botao-primario', id: 'assistente-correr' }, 'Correr agora');
    correr.addEventListener('click', async () => {
      correr.disabled = true;
      try {
        await api.runs.iniciar({ jornadaIds: [cenarioId] }, { canal: 'msedge', visivel: false, paralelo: 1 });
        fechar();
        ctx.abrirCenario(cenarioId);
        ctx.irPara('runs');
      } catch (e) {
        correr.disabled = false;
        corpo.append(erro(mensagemDeErro(e)));
      }
    });
    corpo.replaceChildren(
      h('p', { class: 'assistente-pronto' }, '✓ O teste está pronto.'),
      h('p', {}, colunas.length ? `Tem 1 caso de teste (TC0001) com as colunas: ${colunas.join(', ')}.` : 'Tem 1 caso de teste (TC0001) com os valores gravados.'),
      h(
        'ul',
        {},
        h('li', {}, 'Correr agora: confirma que o teste passa com os valores gravados.'),
        h('li', {}, 'Depois de correr, se o ecrã estiver certo, "Aceitar os resultados como esperados" preenche os valores esperados.'),
        h('li', {}, 'No Editor do cenário › Casos de teste: acrescente casos ou use o Excel para criar muitos.'),
      ),
      h(
        'div',
        { class: 'dialogo-botoes' },
        h('button', { type: 'button', class: 'botao', onclick: fechar }, 'Fechar'),
        h(
          'button',
          {
            type: 'button',
            class: 'botao',
            id: 'assistente-editor',
            onclick: () => {
              fechar();
              ctx.abrirCenario(cenarioId);
              ctx.irPara('editor');
            },
          },
          'Abrir no editor',
        ),
        correr,
      ),
    );
  };

  passo1();
}
