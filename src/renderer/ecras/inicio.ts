// Ecrã Início: o painel do projeto. Mostra o ponto da situação (cenários, casos, última execução), o que
// precisa de atenção (casos que falharam ou ficaram bloqueados) e atalhos para as tarefas do dia a dia.
// Num projeto vazio, mostra os primeiros passos por ordem.
import { EXPLICACAO_RESULTADO, rotuloComSimbolo, SIMBOLO_RESULTADO, type Resultado } from '../../shared/estados.js';
import type { EstadoRun } from '../../shared/modelo.js';
import type { Contexto } from '../app.js';
import { h, info, plural } from '../dom.js';
import { abrirAssistente } from '../assistente.js';

export async function ecraInicio({ estado, corpo, acoes, irPara, selecao }: Contexto): Promise<void> {
  const api = window.uatStudio;
  const [jornadas, conjuntos, blocos, aplicacoes, historico] = await Promise.all([
    api.dados.listar('jornadas'),
    api.dados.listar('casos'),
    api.dados.listar('blocos'),
    api.dados.listar('aplicacoes'),
    api.runs.historico(),
  ]);
  const totalCasos = jornadas.reduce((soma, j) => soma + (conjuntos.find((c) => c.id === j.id)?.casos.length ?? 0), 0);
  const terminadas = historico.filter((r) => !r.ativo);
  const ultima: EstadoRun | undefined = terminadas[0];
  const contar = (run: EstadoRun, r: Resultado): number => run.casos.filter((c) => c.estado === r).length;

  const indicador = (valor: string | number, rotulo: string, detalhe: string, tipo = ''): HTMLElement =>
    h('div', { class: 'indicador', 'data-tipo': tipo }, h('strong', {}, valor), h('span', { class: 'indicador-rotulo' }, rotulo), h('span', { class: 'indicador-detalhe' }, detalhe));

  const atalho = (id: string, titulo: string, texto: string, ecra: string): HTMLElement =>
    h('button', { type: 'button', class: 'atalho', id, onclick: () => irPara(ecra) }, h('strong', {}, titulo), h('span', {}, texto));

  // Ponto da situação.
  const resumo = h(
    'section',
    { class: 'cartao', id: 'inicio-resumo' },
    h('h2', {}, 'Ponto da situação'),
    h(
      'div',
      { class: 'indicadores' },
      indicador(jornadas.length, jornadas.length === 1 ? 'cenário de teste' : 'cenários de teste', `${plural(blocos.length, 'bloco')} reutilizáveis`),
      indicador(totalCasos, totalCasos === 1 ? 'caso de teste' : 'casos de teste', 'linhas de dados para correr'),
      ultima
        ? indicador(rotuloComSimbolo('OK'), `${contar(ultima, 'OK')} de ${ultima.casos.length}`, 'na última execução', 'OK')
        : indicador('—', 'Sem execuções', 'corra o primeiro teste em Execuções'),
      ultima && indicador(rotuloComSimbolo('KO'), String(contar(ultima, 'KO')), EXPLICACAO_RESULTADO.KO.replace(/^KO: /, ''), contar(ultima, 'KO') > 0 ? 'KO' : ''),
      ultima && indicador(rotuloComSimbolo('ERRO'), String(contar(ultima, 'ERRO')), EXPLICACAO_RESULTADO.ERRO.replace(/^ERRO: /, ''), contar(ultima, 'ERRO') > 0 ? 'ERRO' : ''),
    ),
    ultima && h('p', { class: 'suave' }, `Última execução: ${ultima.nome}, ${new Date(ultima.inicio).toLocaleString('pt-PT')}, ambiente ${ultima.ambiente}${ultima.utilizador ? `, por ${ultima.utilizador}` : ''}.`),
  );

  // O que precisa de atenção: os casos que falharam ou ficaram bloqueados na última execução.
  const problemas = (ultima?.casos ?? []).filter((c) => c.estado === 'KO' || c.estado === 'ERRO');
  const atencao = h(
    'section',
    { class: 'cartao', id: 'inicio-atencao' },
    h('h2', {}, 'Precisa de atenção'),
    problemas.length === 0
      ? h('p', { class: 'suave' }, ultima ? 'Nada a assinalar: na última execução nenhum caso falhou nem ficou bloqueado.' : 'Ainda não há resultados.')
      : h(
          'ul',
          { class: 'lista-itens' },
          problemas.slice(0, 8).map((c) =>
            h(
              'li',
              { class: 'item' },
              h('span', { class: 'estado-caso', 'data-estado': c.estado }, `${SIMBOLO_RESULTADO[c.estado as Resultado]} ${c.estado === 'KO' ? 'Falhou' : 'Bloqueado'}`),
              h('span', { class: 'item-nome' }, `${c.jornadaNome} › ${c.casoId}`),
              h('span', { class: 'item-meta' }, c.erro ? c.erro.mensagem.slice(0, 90) : c.diferencas[0] ? `${c.diferencas[0].passo}: esperado "${c.diferencas[0].esperado}", obtido "${c.diferencas[0].obtido}"` : ''),
            ),
          ),
        ),
    problemas.length > 0 && h('div', { class: 'acoes' }, h('button', { type: 'button', class: 'botao botao-primario', onclick: () => irPara('runs') }, 'Ver em Execuções (detalhe e "Criar defeito")')),
  );

  // Primeiros passos (projeto vazio) ou atalhos do dia a dia.
  const vazio = jornadas.length === 0 || blocos.length === 0;
  const passos: Array<[boolean, string, string, string]> = [
    [aplicacoes.length > 0, 'Registar a aplicação a testar', 'Ecrã Cenários, cartão Aplicações: o endereço em cada ambiente.', 'jornadas'],
    [blocos.length > 0, 'Gravar os passos', 'Ecrã Gravar: abre a app no Edge e grava com cliques.', 'gravar'],
    [jornadas.length > 0, 'Montar um cenário de teste', 'Ecrã Cenários: um épico, um cenário e os blocos por ordem.', 'jornadas'],
    [totalCasos > 0, 'Escrever os casos de teste', 'Editor do cenário: uma linha por caso (ou importar do Excel).', 'editor'],
    [terminadas.length > 0, 'Correr e ver os resultados', 'Ecrã Execuções: correr, ver o porquê de cada falha, relatórios.', 'runs'],
  ];
  const tarefas = vazio
    ? h(
        'section',
        { class: 'cartao', id: 'inicio-primeiros-passos' },
        h('h2', {}, 'Primeiros passos'),
        h('p', { class: 'suave' }, 'Por esta ordem. Para ver tudo já feito, abra o "Projeto de exemplo" na lista Projeto.'),
        h(
          'ol',
          { class: 'primeiros-passos' },
          passos.map(([feito, titulo, texto, ecra]) =>
            h('li', { 'data-feito': String(feito) }, h('button', { type: 'button', class: 'ligacao', onclick: () => irPara(ecra) }, `${feito ? '✓ ' : ''}${titulo}`), h('span', { class: 'suave' }, ` ${texto}`)),
          ),
        ),
      )
    : h(
        'section',
        { class: 'cartao', id: 'inicio-atalhos' },
        h('h2', {}, 'Atalhos'),
        h(
          'div',
          { class: 'atalhos' },
          atalho('atalho-gravar', 'Gravar', 'Novos passos no browser', 'gravar'),
          atalho('atalho-cenarios', 'Cenários', 'Épicos, cenários e blocos', 'jornadas'),
          atalho('atalho-executar', 'Executar', 'Correr cenários e ver resultados', 'runs'),
          atalho('atalho-dados', 'Dados de teste', 'Fórmulas, geradores, segredos', 'dados'),
        ),
      );

  // Execuções recentes.
  const recentes = h(
    'section',
    { class: 'cartao', id: 'inicio-recentes' },
    h('h2', {}, 'Execuções recentes'),
    terminadas.length === 0
      ? h('p', { class: 'suave' }, 'Ainda não há execuções neste projeto.')
      : h(
          'ul',
          { class: 'lista-itens' },
          terminadas.slice(0, 5).map((r) =>
            h(
              'li',
              { class: 'item' },
              h('span', { class: 'item-nome' }, r.nome),
              h(
                'span',
                { class: 'item-meta' },
                new Date(r.inicio).toLocaleString('pt-PT'),
                (['OK', 'KO', 'ERRO'] as Resultado[]).map((e) => h('span', { class: 'mini-total', 'data-tipo': e, title: rotuloComSimbolo(e) }, `${SIMBOLO_RESULTADO[e]} ${contar(r, e)}`)),
              ),
            ),
          ),
        ),
  );

  // O caminho mais curto para um teste a correr: o assistente "Novo teste".
  const abrir = (): void =>
    void abrirAssistente({
      estado,
      irPara,
      abrirCenario: (id) => {
        selecao.jornadaId = id;
      },
    });
  acoes.append(h('button', { type: 'button', class: 'botao botao-primario', id: 'btn-novo-teste', onclick: abrir }, '+ Novo teste'));
  const chamada = h(
    'section',
    { class: 'cartao chamada-novo-teste', id: 'inicio-novo-teste' },
    h('div', {}, h('h2', {}, 'Criar um teste em 4 passos', info('O assistente pergunta o que vai testar, abre o Edge para gravar, pergunta o que varia de caso para caso (fica numa coluna, para o Excel) e deixa o teste pronto a correr.')), h('p', { class: 'suave' }, 'Grave no browser e escolha o que muda de caso para caso. O assistente faz o resto: cria o cenário e o primeiro caso de teste.')),
    h('button', { type: 'button', class: 'botao botao-primario', id: 'btn-novo-teste-cartao', onclick: abrir }, 'Começar'),
  );
  corpo.append(h('div', { class: 'inicio' }, chamada, resumo, atencao, tarefas, recentes));
}
