// Receitas da Wiki sobre a app de teste "Catálogo de Componentes" (CatalogoComponentesPOC): um ecrã por
// família de componentes do OutSystems UI. Cada receita é um bloco com a descrição COMO/ARMADILHAS e uma
// jornada de prova (criadas em wiki.ts). Todos os dados são fictícios.
import { Bloco, Passo, Valor } from '../../shared/modelo';

export const URL_CATALOGO = 'https://personal-e5m9c9gh-dev.outsystems.app/CatalogoComponentesPOC';

export interface ReceitaCatalogo {
  epicoId: string;
  dados: Record<string, string>;
  bloco: Bloco;
}

const fixo = (valor: string): Valor => ({ tipo: 'fixo', valor });
const variavel = (nome: string): Valor => ({ tipo: 'variavel', nome });
const t = (testId: string, descricao: string, extra: Partial<NonNullable<Passo['alvo']>> = {}): NonNullable<Passo['alvo']> => ({ descricao, localizadores: [{ tipo: 'testid', valor: testId }], ...extra });

let n = 0;
const id = (): string => `p${++n}`;
const abrir = (ecra: string): Passo => ({ id: id(), acao: 'navegar', descricao: `Abrir o ecrã ${ecra}`, valor: fixo(ecra) });
const escrever = (testId: string, descricao: string, valor: Valor, secreto = false): Passo => ({ id: id(), acao: 'escrever', descricao, alvo: t(testId, descricao), valor, ...(secreto ? { secreto: true } : {}) });
const escolher = (testId: string, descricao: string, valor: Valor): Passo => ({ id: id(), acao: 'escolher', descricao, alvo: t(testId, descricao), valor });
const marcar = (testId: string, descricao: string, valor: string): Passo => ({ id: id(), acao: 'marcar', descricao, alvo: t(testId, descricao), valor: fixo(valor) });
const clicar = (testId: string, descricao: string): Passo => ({ id: id(), acao: 'clicar', descricao, alvo: t(testId, descricao) });
const verificar = (testId: string, descricao: string, valor: Valor, esperaSeg = 10, tipo: 'texto' | 'numero' = 'texto'): Passo => ({
  id: id(),
  acao: 'verificar',
  descricao,
  alvo: t(testId, descricao),
  valor,
  verificacao: { tipo, esperaSeg, ...(tipo === 'numero' ? { tolerancia: '0' } : {}) },
});
const visivel = (testId: string, descricao: string, esperaSeg = 30, extra: Partial<NonNullable<Passo['alvo']>> = {}): Passo => ({ id: id(), acao: 'verificar', descricao, alvo: t(testId, descricao, extra), verificacao: { tipo: 'visivel', esperaSeg } });

export function receitasDoCatalogo(): ReceitaCatalogo[] {
  n = 0;
  const lista: ReceitaCatalogo[] = [];
  const bloco = (b: Omit<Bloco, 'tipo' | 'aplicacaoId'>): Bloco => {
    n = 0;
    return { tipo: 'UI', aplicacaoId: 'catalogo', ...b };
  };

  lista.push({
    epicoId: 'wiki-a-campos',
    dados: { Texto: 'Olá UAT', Password: 'Teste123' },
    bloco: bloco({
      id: 'receita-catalogo-campos',
      nome: 'Todos os campos de texto (texto, número, decimal, email, password, área de texto, telefone)',
      descricao:
        'COMO: "Escrever" serve para todos os campos de texto. Os números aceitam vírgula ("12,5"). A password vem de uma coluna e o passo fica secreto. Um campo só de leitura verifica-se com "Verificar" (lê o valor). ' +
        'ARMADILHAS: cada campo só atualiza o ecrã quando se sai dele (o UAT Studio sai sozinho); o botão "Desativado" não se clica: verifique só que está visível; "Guardar" com o texto vazio mostra "Campo obrigatório".',
      passos: [
        abrir('Formularios'),
        visivel('cc_inpTexto', 'Esperar pelo ecrã (o ambiente pode estar a acordar)'),
        escrever('cc_inpTexto', 'Texto', variavel('Texto')),
        verificar('cc_resTexto', 'O texto aparece no resultado', variavel('Texto')),
        escrever('cc_inpNumero', 'Número inteiro', fixo('42')),
        verificar('cc_resNumero', 'Resultado do número', fixo('42'), 10, 'numero'),
        escrever('cc_inpDecimal', 'Número decimal (com vírgula)', fixo('12,5')),
        verificar('cc_resDecimal', 'Resultado do decimal', fixo('12,5'), 10, 'numero'),
        escrever('cc_inpEmail', 'Email', fixo('ana.silva@exemplo.pt')),
        verificar('cc_resEmail', 'O email é válido', fixo('válido')),
        escrever('cc_inpPassword', 'Password (secreta)', variavel('Password'), true),
        verificar('cc_resPassword', 'Número de caracteres da password', fixo('8')),
        escrever('cc_txtObservacoes', 'Área de texto', fixo('Observação de teste')),
        verificar('cc_resObservacoes', 'Resultado da área de texto', fixo('Observação de teste')),
        escrever('cc_inpTelefone', 'Telefone', fixo('912345678')),
        verificar('cc_resTelefone', 'Resultado do telefone', fixo('912345678')),
        verificar('cc_inpSoLeitura', 'Campo só de leitura', fixo('Não editável')),
        visivel('cc_btnDesativado', 'O botão desativado está visível', 5),
        clicar('cc_btnGuardar', 'Guardar'),
        verificar('cc_resGuardar', 'Guardado', fixo('guardado')),
      ],
    }),
  });

  lista.push({
    epicoId: 'wiki-a-campos',
    dados: { Pais: 'Espanha', Idiomas: 'Português; Inglês' },
    bloco: bloco({
      id: 'receita-catalogo-listas',
      nome: 'Listas: Dropdown, Dropdown Search e Dropdown Tags (várias escolhas)',
      descricao:
        'COMO: "Escolher" pelo texto da opção, em todas as listas. Nas listas com pesquisa (Dropdown Search) e de várias escolhas (Dropdown Tags) do OutSystems UI o UAT Studio escolhe pela própria lista, sem escrever na pesquisa. Várias opções separam-se com ";" (por exemplo "Português; Inglês"). ' +
        'ARMADILHAS: as opções chegam depois do ecrã (o UAT Studio espera por elas); nas Tags o resultado segue a ordem em que se escolheu; o data-testid está no DIV à volta da lista.',
      passos: [
        abrir('Selecao'),
        visivel('cc_ddCor', 'Esperar pelo ecrã'),
        escolher('cc_ddCor', 'Dropdown (lista normal)', fixo('Verde')),
        verificar('cc_resCor', 'Cor escolhida', fixo('Verde')),
        escolher('cc_ddsPais', 'Dropdown Search (lista com pesquisa)', variavel('Pais')),
        verificar('cc_resPais', 'País escolhido', variavel('Pais')),
        verificar('cc_ddsPais', 'A lista mostra o país (ler o widget)', variavel('Pais')),
        escolher('cc_ddtIdiomas', 'Dropdown Tags (várias escolhas)', variavel('Idiomas')),
        verificar('cc_resIdiomas', 'Idiomas escolhidos', fixo('Português, Inglês')),
      ],
    }),
  });

  lista.push({
    epicoId: 'wiki-a-campos',
    dados: { Plano: 'Standard', Frequencia: 'Trimestral' },
    bloco: bloco({
      id: 'receita-catalogo-opcoes',
      nome: 'Checkbox, interruptor, grupo de opções e grupo de botões',
      descricao:
        'COMO: checkbox e interruptor (Switch): "Marcar" com S ou N (ou uma coluna com S/N). Grupo de opções (Radio Group) e grupo de botões (Button Group): "Escolher" pelo texto da opção, apontando para o grupo inteiro. ' +
        'ARMADILHAS: no interruptor a caixa verdadeira está escondida atrás do desenho (o UAT Studio trata disso); no gravador, clique no grupo e não numa opção solta, para a coluna poder escolher qualquer opção.',
      passos: [
        abrir('Selecao'),
        visivel('cc_chkAceito', 'Esperar pelo ecrã'),
        marcar('cc_chkAceito', 'Checkbox "Aceito os termos"', 'S'),
        verificar('cc_resAceito', 'Checkbox marcada', fixo('sim')),
        marcar('cc_swtNotificacoes', 'Interruptor "Receber notificações"', 'S'),
        verificar('cc_resNotificacoes', 'Interruptor ligado', fixo('ligado')),
        escolher('cc_rdgPlano', 'Grupo de opções (plano)', variavel('Plano')),
        verificar('cc_resPlano', 'Plano escolhido', variavel('Plano')),
        escolher('cc_bgFrequencia', 'Grupo de botões (frequência)', variavel('Frequencia')),
        verificar('cc_resFrequencia', 'Frequência escolhida', variavel('Frequencia')),
      ],
    }),
  });

  lista.push({
    epicoId: 'wiki-a-campos',
    dados: { Montante: '60', Intervalo: '20-80', Estrelas: '4' },
    bloco: bloco({
      id: 'receita-catalogo-slider-classificacao',
      nome: 'Slider, slider de intervalo e classificação (estrelas)',
      descricao:
        'COMO: slider (Range Slider): "Escrever" o número (60); slider de intervalo: "Escrever" o início e o fim ("20-80" ou "20;80"). Classificação (Rating): "Escolher" o número de estrelas. ' +
        'ARMADILHAS: o OutSystems só reage a uma mexida do utilizador no slider: o UAT Studio põe o valor e mexe no puxador com as setas do teclado; o valor tem de respeitar o passo e os limites do slider.',
      passos: [
        abrir('Selecao'),
        visivel('cc_sldMontante', 'Esperar pelo ecrã'),
        escrever('cc_sldMontante', 'Slider', variavel('Montante')),
        verificar('cc_resMontante', 'Valor do slider', variavel('Montante'), 10, 'numero'),
        verificar('cc_sldMontante', 'O slider mostra o valor (ler o widget)', variavel('Montante')),
        escrever('cc_sldIntervalo', 'Slider de intervalo', variavel('Intervalo')),
        verificar('cc_resIntervalo', 'Intervalo escolhido', variavel('Intervalo')),
        escolher('cc_ratAvaliacao', 'Classificação (estrelas)', variavel('Estrelas')),
        verificar('cc_resAvaliacao', 'Estrelas escolhidas', variavel('Estrelas')),
      ],
    }),
  });

  lista.push({
    epicoId: 'wiki-d-datas',
    dados: { Data: '15/03/2026', Periodo: '01/03/2026 a 15/03/2026' },
    bloco: bloco({
      id: 'receita-catalogo-datas',
      nome: 'Calendários: data, intervalo de datas, hora, mês e data do browser',
      descricao:
        'COMO: "Escrever" a data como em Portugal (15/03/2026) ou em ISO (2026-03-15); um intervalo com " a " (01/03/2026 a 15/03/2026); uma hora (14:30); um mês (03/2026). Também serve com fórmulas, por exemplo {HOJE+30:dd/MM/yyyy}. ' +
        'ARMADILHAS: os calendários do OutSystems UI (Flatpickr) têm um campo visível que é só uma cópia: escrever lá não muda nada. O UAT Studio usa o próprio calendário. A data aparece no formato da app (aqui yyyy-MM-dd).',
      passos: [
        abrir('Datas'),
        visivel('cc_dpData', 'Esperar pelo ecrã'),
        escrever('cc_dpData', 'Date Picker', variavel('Data')),
        verificar('cc_resData', 'Data escolhida', fixo('2026-03-15')),
        escrever('cc_dprPeriodo', 'Date Picker de intervalo', variavel('Periodo')),
        verificar('cc_resPeriodo', 'Intervalo escolhido', fixo('2026-03-01 a 2026-03-15')),
        escrever('cc_tpHora', 'Time Picker', fixo('14:30')),
        verificar('cc_resHora', 'Hora escolhida', fixo('14:30')),
        escrever('cc_mpMes', 'Month Picker', fixo('03/2026')),
        verificar('cc_resMes', 'Mês escolhido', fixo('2026-03')),
        escrever('cc_inpDataNativa', 'Data do browser (campo de data)', variavel('Data')),
        verificar('cc_resDataNativa', 'Data do browser escolhida', fixo('2026-03-15')),
      ],
    }),
  });

  lista.push({
    epicoId: 'wiki-d-datas',
    dados: {},
    bloco: bloco({
      id: 'receita-catalogo-ficheiro',
      nome: 'Carregar um ficheiro (Upload)',
      descricao:
        'COMO: passo "Carregar ficheiro" (no editor de passos, "Acrescentar outro passo") com o caminho do ficheiro, relativo à pasta do projeto (aqui ficheiros/exemplo.txt). ' +
        'ARMADILHAS: o widget Upload tem o mesmo data-testid na etiqueta e no campo escondido: aponte para o campo (input[type=file]); os ficheiros de teste devem ficar dentro da pasta do projeto, para viajarem com ele.',
      passos: [
        abrir('Datas'),
        visivel('cc_dpData', 'Esperar pelo ecrã'),
        { id: id(), acao: 'carregar', descricao: 'Carregar o ficheiro', alvo: { descricao: 'Upload', localizadores: [{ tipo: 'css', valor: 'input[type="file"][data-testid="cc_uplFicheiro"]' }] }, valor: fixo('ficheiros/exemplo.txt') },
        verificar('cc_resFicheiro', 'Nome e tamanho do ficheiro', fixo('exemplo.txt (20 bytes)')),
      ],
    }),
  });

  lista.push({
    epicoId: 'wiki-e-navegacao',
    dados: {},
    bloco: bloco({
      id: 'receita-catalogo-separadores',
      nome: 'Separadores (Tabs), acordeão e assistente (Wizard)',
      descricao:
        'COMO: "Clicar" no título do separador ou da pergunta do acordeão e "Verificar" o conteúdo que aparece. No assistente, "Clicar" em Seguinte/Anterior e verificar o passo. ' +
        'ARMADILHAS: o conteúdo de um separador escondido existe na página mas não se vê: verifique-o só depois de clicar no separador (com "esperar até", por causa da animação); os títulos são DIVs, não botões, por isso o data-testid é o melhor localizador.',
      passos: [
        abrir('Navegacao'),
        visivel('cc_tabDetalhes', 'Esperar pelo ecrã'),
        clicar('cc_tabDetalhes', 'Separador "Detalhes"'),
        verificar('cc_resTabDetalhes', 'Conteúdo do separador', fixo('Conteúdo Detalhes'), 5),
        clicar('cc_accPergunta2', 'Abrir a pergunta 2 do acordeão'),
        verificar('cc_resResposta2', 'Resposta 2', fixo('Resposta 2'), 5),
        clicar('cc_btnWizardSeguinte', 'Assistente: Seguinte'),
        verificar('cc_resPasso', 'Passo 2', fixo('2')),
        clicar('cc_btnWizardSeguinte', 'Assistente: Seguinte'),
        verificar('cc_resPasso', 'Passo 3', fixo('3')),
        clicar('cc_btnWizardAnterior', 'Assistente: Anterior'),
        verificar('cc_resPasso', 'De volta ao passo 2', fixo('2')),
      ],
    }),
  });

  lista.push({
    epicoId: 'wiki-e-navegacao',
    dados: {},
    bloco: bloco({
      id: 'receita-catalogo-popup',
      nome: 'Popup, painel lateral (Sidebar) e mensagem de feedback',
      descricao:
        'COMO: "Clicar" no botão que abre o popup ou o painel e depois nos botões lá de dentro, como em qualquer ecrã. Para mensagens de feedback, verifique o efeito no ecrã (ou a mensagem, logo a seguir: desaparece). ' +
        'ARMADILHAS: o popup só existe na página depois de aberto: use "esperar até" no primeiro passo dentro dele; enquanto o popup está aberto, o resto do ecrã não aceita cliques.',
      passos: [
        abrir('Navegacao'),
        visivel('cc_btnAbrirPopup', 'Esperar pelo ecrã'),
        clicar('cc_btnAbrirPopup', 'Abrir o popup'),
        verificar('cc_resPopupTexto', 'Texto do popup', fixo('Deseja continuar?'), 10),
        clicar('cc_btnPopupSim', 'Responder "Sim"'),
        verificar('cc_resPopup', 'Resposta do popup', fixo('sim')),
        clicar('cc_btnFeedback', 'Mostrar a mensagem de feedback'),
        verificar('cc_resFeedback', 'Mensagem mostrada', fixo('mostrado')),
        clicar('cc_btnAbrirSidebar', 'Abrir o painel lateral'),
        verificar('cc_resSidebar', 'Painel lateral aberto', fixo('Painel lateral'), 5),
        clicar('cc_btnFecharSidebar', 'Fechar o painel lateral'),
      ],
    }),
  });

  const ifr = '[data-testid="cc_ifrInterno"]';
  lista.push({
    epicoId: 'wiki-e-navegacao',
    dados: {},
    bloco: bloco({
      id: 'receita-catalogo-janelas',
      nome: 'Pergunta do browser, descarregar, iframe e novo separador',
      descricao:
        'COMO: pergunta do browser (confirm): passo "Pergunta do browser" ANTES do clique (aceitar ou recusar); sem ele, a ferramenta recusa e regista no log. Descarregar: passo "Descarregar" no botão (o ficheiro fica nas evidências; o valor é um texto que o ficheiro tem de conter). Iframe: em "Dentro de um iframe" indique o iframe. Novo separador: clicar no link e depois o passo "Separador" (novo / principal). ' +
        'ARMADILHAS: a resposta à pergunta tem de estar preparada antes do clique; num iframe, os localizadores são procurados dentro dele; depois de um separador novo, volte ao principal para continuar.',
      passos: [
        abrir('Situacoes'),
        visivel('cc_btnConfirmarJs', 'Esperar pelo ecrã'),
        { id: id(), acao: 'dialogo', descricao: 'Aceitar a próxima pergunta do browser', valor: fixo('aceitar') },
        clicar('cc_btnConfirmarJs', 'Botão que pergunta "Tem a certeza?"'),
        verificar('cc_resConfirmarJs', 'Aceitou', fixo('sim')),
        clicar('cc_btnConfirmarJs', 'Outra vez, sem preparar a resposta (recusa)'),
        verificar('cc_resConfirmarJs', 'Recusou', fixo('não')),
        { id: id(), acao: 'descarregar', descricao: 'Descarregar o relatório', alvo: t('cc_btnDownload', 'Descarregar relatório'), valor: fixo('Ana;Lisboa'), variavel: 'Ficheiro' },
        verificar('cc_resDownload', 'Descarregado', fixo('descarregado')),
        visivel('cc_inpTexto', 'Campo de texto dentro do iframe', 20, { iframe: ifr }),
        { id: id(), acao: 'escrever', descricao: 'Escrever no campo do iframe', alvo: t('cc_inpTexto', 'Campo de texto no iframe', { iframe: ifr }), valor: fixo('dentro do iframe') },
        { id: id(), acao: 'verificar', descricao: 'Resultado dentro do iframe', alvo: t('cc_resTexto', 'Resultado no iframe', { iframe: ifr }), valor: fixo('dentro do iframe'), verificacao: { tipo: 'texto', esperaSeg: 10 } },
        clicar('cc_lnkNovoSeparador', 'Link que abre um separador novo'),
        { id: id(), acao: 'separador', descricao: 'Passar para o separador novo', valor: fixo('novo') },
        visivel('cc_inpTexto', 'No separador novo está o ecrã Formulários'),
        { id: id(), acao: 'separador', descricao: 'Voltar ao separador principal', valor: fixo('principal') },
        visivel('cc_btnConfirmarJs', 'De volta ao ecrã Situações', 10),
      ],
    }),
  });

  lista.push({
    epicoId: 'wiki-b-acoes',
    dados: { Nome: 'Ana Silva', Cidade: 'Porto' },
    bloco: bloco({
      id: 'receita-catalogo-tabela',
      nome: 'Tabela com pesquisa, linha, checkbox, paginação, ordenação e lista',
      descricao:
        'COMO: pesquise primeiro (para a linha ficar à vista) e use "Tabela: agir na linha que contém um texto" para o botão ou a checkbox dessa linha. Paginação e ordenação: "Clicar" no botão da página ou no título da coluna. Lista: "Clicar" no item pelo texto. ' +
        'ARMADILHAS: os botões de cada linha têm todos o mesmo data-testid: sem "agir na linha" o UAT Studio diz que há vários; a tabela atualiza depois da pesquisa: use "esperar até" no total; numa tabela paginada a linha pode estar noutra página.',
      passos: [
        abrir('Dados'),
        visivel('cc_tblPessoas', 'Esperar pela tabela'),
        verificar('cc_resTotal', 'Total sem filtro', fixo('25'), 15),
        escrever('cc_inpFiltro', 'Pesquisar pelo nome', variavel('Nome')),
        verificar('cc_resTotal', 'Só uma pessoa', fixo('1'), 10),
        { id: id(), acao: 'clicar', descricao: 'Selecionar na linha da pessoa', alvo: { descricao: 'Selecionar', localizadores: [{ tipo: 'testid', valor: 'cc_btnSelecionar' }], linha: { valor: variavel('Nome') } } },
        verificar('cc_resSelecionado', 'Pessoa selecionada', variavel('Nome')),
        { id: id(), acao: 'marcar', descricao: 'Marcar a linha da pessoa', alvo: { descricao: 'Marcar', localizadores: [{ tipo: 'testid', valor: 'cc_chkMarcar' }], linha: { valor: variavel('Nome') } }, valor: fixo('S') },
        verificar('cc_resMarcados', 'Uma linha marcada', fixo('1')),
        escrever('cc_inpFiltro', 'Limpar a pesquisa', fixo('')),
        verificar('cc_resTotal', 'Total outra vez', fixo('25'), 10),
        { id: id(), acao: 'clicar', descricao: 'Ir para a página 2', alvo: { descricao: 'Página 2', localizadores: [{ tipo: 'css', valor: '[data-testid="cc_pagPessoas"] button[aria-label="go to page 2"]' }] } },
        clicar('cc_thNome', 'Ordenar pelo nome'),
        { id: id(), acao: 'clicar', descricao: 'Escolher a cidade na lista', alvo: { descricao: 'Cidade', localizadores: [{ tipo: 'role', valor: 'link', nome: 'Porto' }] } },
        verificar('cc_resCidade', 'Cidade escolhida', variavel('Cidade')),
      ],
    }),
  });

  lista.push({
    epicoId: 'wiki-c-situacoes',
    dados: {},
    bloco: bloco({
      id: 'receita-catalogo-lento',
      nome: 'Carregamento lento, mensagem temporária e dados que chegam depois',
      descricao:
        'COMO: para tudo o que demora, use "Verificar" com "esperar até" (por exemplo 10 s): o passo espera pelo valor e só dá KO se não chegar a tempo. Mensagens temporárias: verifique-as logo a seguir à ação, ou verifique o efeito que fica. ' +
        'ARMADILHAS: "A carregar..." não é o resultado: espere pelo valor final; uma mensagem que desaparece em 3 s pode já ter desaparecido se houver passos pelo meio.',
      passos: [
        abrir('Situacoes'),
        verificar('cc_resAparecePorDentro', 'Dados que chegam depois do ecrã', fixo('Dados carregados'), 30),
        clicar('cc_btnCarregarLento', 'Carregar dados lentos (3 segundos)'),
        verificar('cc_resLento', 'Esperar pelo resultado', fixo('carregado'), 10),
        clicar('cc_btnMensagemTemporaria', 'Mostrar a mensagem temporária'),
        verificar('cc_resMensagem', 'Mensagem mostrada', fixo('mostrada')),
      ],
    }),
  });

  return lista;
}
