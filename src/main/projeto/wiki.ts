// Wiki de componentes OutSystems: um bloco-receita por componente ou situação típica, cada um com a sua
// jornada de prova contra apps de teste publicadas. Correr a Wiki inteira mostra, na matriz de cobertura,
// o que a ferramenta já testa. Os testadores copiam as receitas para os seus projetos com os pacotes de
// blocos ("Exportar blocos" / "Importar pacote") e só trocam os data-testid.
// A descrição de cada bloco explica a receita: o que fazer, o localizador que funciona e as armadilhas.
import { Bloco, BlocoDaJornada, Passo, Valor } from '../../shared/modelo';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { definirAmbienteAtivo, guardar } from './repositorio';
import { receitasDoCatalogo, URL_CATALOGO } from './wikiCatalogo';

const URL_SIMULADOR = 'https://personal-e5m9c9gh-dev.outsystems.app/SimuladorFinanceiroPOC';
const URL_PORTAL = 'https://personal-e5m9c9gh-dev.outsystems.app/PortalCreditoPOC';

const alvo = (testId: string, descricao: string, extra: Partial<NonNullable<Passo['alvo']>> = {}): Passo['alvo'] => ({ descricao, localizadores: [{ tipo: 'testid', valor: testId }], ...extra });
const fixo = (valor: string): Valor => ({ tipo: 'fixo', valor });
const variavel = (nome: string): Valor => ({ tipo: 'variavel', nome });

interface Receita {
  bloco: Bloco;
  /** Jornada de prova: blocos antes e depois da receita (por exemplo, abrir a app ou entrar). */
  antes?: string[];
  depois?: string[];
  epicoId: string;
  dados: Record<string, string>;
}

export function criarWiki(pasta: string): void {
  guardar(pasta, 'aplicacoes', { id: 'simulador', nome: 'Simulador Financeiro (app de teste)', tipo: 'FO', cor: '#2f6bed', urls: { dev: URL_SIMULADOR } });
  guardar(pasta, 'aplicacoes', { id: 'portal-fo', nome: 'Portal de Crédito: Front Office (app de teste)', tipo: 'FO', cor: '#2f6bed', urls: { dev: URL_PORTAL } });
  definirAmbienteAtivo(pasta, 'dev');
  guardar(pasta, 'aplicacoes', { id: 'simulador-bo', nome: 'Simulador: Backoffice (app de teste)', tipo: 'BO', cor: '#e07b00', urls: { dev: `${URL_SIMULADOR}/Backoffice` } });
  guardar(pasta, 'aplicacoes', { id: 'portal-bo', nome: 'Portal de Crédito: Backoffice (app de teste)', tipo: 'BO', cor: '#e07b00', urls: { dev: `${URL_PORTAL}/BOLogin` } });
  // As receitas usam o ambiente "dev" (onde as apps de teste estão publicadas).
  guardar(pasta, 'aplicacoes', { id: 'catalogo', nome: 'Catálogo de Componentes (app de teste)', tipo: 'FO', cor: '#7b4bd1', urls: { dev: URL_CATALOGO } });
  // Ficheiro para a receita do Upload (os ficheiros de teste ficam dentro da pasta do projeto).
  fs.mkdirSync(path.join(pasta, 'ficheiros'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'ficheiros', 'exemplo.txt'), 'Ficheiro de exemplo.');
  guardar(pasta, 'epicos', { id: 'wiki-a-campos', nome: 'A. Campos de formulário', descricao: 'Texto, números, password, listas (normal, com pesquisa, várias escolhas), checkbox, interruptor, opções, slider e classificação.' });
  guardar(pasta, 'epicos', { id: 'wiki-b-acoes', nome: 'B. Botões, resultados e tabelas', descricao: 'Clicar, verificar resultados (números e textos) e agir numa linha de tabela.' });
  guardar(pasta, 'epicos', { id: 'wiki-c-situacoes', nome: 'C. Situações típicas do OutSystems', descricao: 'Dados que chegam depois do ecrã, carregamentos lentos, mensagens temporárias, MFA de teste, login reutilizado.' });
  guardar(pasta, 'epicos', { id: 'wiki-d-datas', nome: 'D. Datas e ficheiros', descricao: 'Date Picker, intervalo de datas, hora, mês, data do browser e Upload.' });
  guardar(pasta, 'epicos', { id: 'wiki-e-navegacao', nome: 'E. Navegação e janelas', descricao: 'Separadores, acordeão, assistente, popup, painel lateral, pergunta do browser, descarregar, iframe e novo separador.' });

  // ---------- Blocos de apoio (abrir as apps, preparar dados) ----------
  const apoio: Bloco[] = [
    { id: 'abrir-simulador', nome: 'Apoio: abrir o Simulador', tipo: 'UI', aplicacaoId: 'simulador', passos: [{ id: 'p1', acao: 'navegar', descricao: 'Abrir o Simulador', valor: fixo('') }] },
    {
      id: 'abrir-portal-fo',
      nome: 'Apoio: abrir o Portal do Cliente',
      tipo: 'UI',
      aplicacaoId: 'portal-fo',
      passos: [
        { id: 'p1', acao: 'navegar', descricao: 'Abrir o Portal do Cliente', valor: fixo('') },
        { id: 'p2', acao: 'verificar', descricao: 'Esperar pelo ecrã de login (o ambiente pode estar a acordar)', alvo: alvo('fo_inpUtilizador', 'Utilizador'), verificacao: { tipo: 'visivel', esperaSeg: 30 } },
      ],
    },
    {
      id: 'simular-e-guardar',
      nome: 'Apoio: simular e guardar o número do pedido',
      tipo: 'UI',
      aplicacaoId: 'simulador',
      passos: [
        { id: 'p1', acao: 'escolher', descricao: 'Escolher a variante', alvo: alvo('ddVariante', 'Lista Variante', { widget: 'dropdown' }), valor: fixo('CP12') },
        { id: 'p2', acao: 'escrever', descricao: 'Valor', alvo: alvo('inpValor', 'Campo Valor'), valor: fixo('1000') },
        { id: 'p3', acao: 'clicar', descricao: 'Submeter', alvo: alvo('btnSubmeter', 'Botão Submeter') },
        { id: 'p4', acao: 'guardar', descricao: 'Guardar o número do pedido', alvo: alvo('resPedidoId', 'Número do pedido'), variavel: 'PedidoId' },
      ],
    },
  ];
  for (const b of apoio) guardar(pasta, 'blocos', b);

  // ---------- Receitas ----------
  const receitas: Receita[] = [
    {
      epicoId: 'wiki-a-campos',
      antes: ['abrir-portal-fo'],
      dados: { Utilizador: 'ana.silva', PasswordErrada: 'errada' },
      bloco: {
        id: 'receita-campo-texto-password',
        nome: 'Campo de texto, password e mensagem de erro',
        tipo: 'UI',
        aplicacaoId: 'portal-fo',
        descricao:
          'COMO: "Escrever" no campo (valor fixo, coluna ou fórmula). Passwords vêm sempre de uma coluna e o passo fica "secreto" (não aparece em logs nem no trace). ' +
          'Mensagens de validação: "Verificar" o texto do elemento da mensagem. ARMADILHAS: o OutSystems só valida quando se sai do campo (o UAT Studio sai do campo depois de escrever); as mensagens podem aparecer com atraso: use "esperar até".',
        passos: [
          { id: 'p1', acao: 'escrever', descricao: 'Escrever o utilizador (campo de texto)', alvo: alvo('fo_inpUtilizador', 'Utilizador'), valor: variavel('Utilizador') },
          { id: 'p2', acao: 'escrever', descricao: 'Escrever a password (campo password, secreto)', alvo: alvo('fo_inpPassword', 'Password'), valor: variavel('PasswordErrada'), secreto: true },
          { id: 'p3', acao: 'clicar', descricao: 'Entrar', alvo: alvo('fo_btnEntrar', 'Entrar') },
          { id: 'p4', acao: 'verificar', descricao: 'Verificar a mensagem de erro', alvo: alvo('fo_msgErro', 'Mensagem de erro'), valor: fixo('Utilizador ou password errados'), verificacao: { tipo: 'texto', esperaSeg: 15 } },
        ],
      },
    },
    {
      epicoId: 'wiki-a-campos',
      antes: ['abrir-simulador'],
      dados: { Variante: 'CP12', Valor: '20000,50', EstadoEsperado: 'Rejeitado', MensagemEsperada: 'Valor fora dos limites' },
      bloco: {
        id: 'receita-lista-e-numero',
        nome: 'Lista (Dropdown), campo numérico e regra de validação',
        tipo: 'UI',
        aplicacaoId: 'simulador',
        descricao:
          'COMO: "Escolher" pelo texto da opção, pelo valor ou pelo código no início do texto. Num campo numérico, "20000,50" é escrito como "20000.50" (o browser só aceita ponto). ' +
          'ARMADILHAS: no Dropdown do OutSystems o data-testid fica no DIV à volta e o <select> está lá dentro (o UAT Studio desce sozinho); as opções chegam depois do ecrã (o UAT Studio espera por elas); listas que usam índices como valores: escolha pelo texto.',
        passos: [
          { id: 'p1', acao: 'escolher', descricao: 'Escolher a variante pelo código', alvo: alvo('ddVariante', 'Lista Variante', { widget: 'dropdown' }), valor: variavel('Variante') },
          { id: 'p2', acao: 'escrever', descricao: 'Escrever um valor com vírgula num campo numérico', alvo: alvo('inpValor', 'Campo Valor'), valor: variavel('Valor') },
          { id: 'p3', acao: 'clicar', descricao: 'Submeter', alvo: alvo('btnSubmeter', 'Botão Submeter') },
          { id: 'p4', acao: 'verificar', descricao: 'Verificar que foi rejeitado', alvo: alvo('resEstado', 'Estado'), valor: variavel('EstadoEsperado'), verificacao: { tipo: 'texto', esperaSeg: 15 } },
          { id: 'p5', acao: 'verificar', descricao: 'Verificar a mensagem da regra', alvo: alvo('resMensagem', 'Mensagem'), valor: variavel('MensagemEsperada'), verificacao: { tipo: 'texto' } },
        ],
      },
    },
    {
      epicoId: 'wiki-b-acoes',
      antes: ['abrir-simulador'],
      dados: { Variante: 'CP12', Valor: '500', PrestacaoEsperada: '43,38', EstadoEsperado: 'Aprovado' },
      bloco: {
        id: 'receita-botao-e-resultados',
        nome: 'Botão e resultados (número e texto)',
        tipo: 'UI',
        aplicacaoId: 'simulador',
        descricao:
          'COMO: "Clicar" no botão e "Verificar" os resultados: tipo "número" compara em decimal exato e aceita "86.40", "86,40" ou "1.234,56 €" (com tolerância opcional); tipo "texto" compara o texto sem espaços a mais. ' +
          'ARMADILHAS: o resultado aparece depois de o servidor responder: o UAT Studio espera que a página acalme antes de cada passo; para resultados lentos use "esperar até". O Round() do OutSystems arredonda ao par: use ARRED.PAR nas fórmulas.',
        passos: [
          { id: 'p1', acao: 'escolher', descricao: 'Escolher a variante', alvo: alvo('ddVariante', 'Lista Variante', { widget: 'dropdown' }), valor: variavel('Variante') },
          { id: 'p2', acao: 'escrever', descricao: 'Valor', alvo: alvo('inpValor', 'Campo Valor'), valor: variavel('Valor') },
          { id: 'p3', acao: 'clicar', descricao: 'Clicar em Submeter', alvo: alvo('btnSubmeter', 'Botão Submeter') },
          { id: 'p4', acao: 'verificar', descricao: 'Verificar o estado (texto)', alvo: alvo('resEstado', 'Estado'), valor: variavel('EstadoEsperado'), verificacao: { tipo: 'texto', esperaSeg: 15 } },
          { id: 'p5', acao: 'verificar', descricao: 'Verificar a prestação (número)', alvo: alvo('resPrestacao', 'Prestação'), valor: variavel('PrestacaoEsperada'), verificacao: { tipo: 'numero', tolerancia: '0' } },
        ],
      },
    },
    {
      epicoId: 'wiki-b-acoes',
      antes: ['abrir-simulador', 'simular-e-guardar'],
      dados: {},
      bloco: {
        id: 'receita-tabela-linha',
        nome: 'Tabela: verificar ou agir na linha de um registo',
        tipo: 'UI',
        aplicacaoId: 'simulador-bo',
        descricao:
          'COMO: no gravador, ao apontar para uma célula, botão ou link de uma tabela, escolha "Tabela: agir na linha que contém um texto" e diga que texto identifica a linha (fixo ou de uma coluna, por exemplo {PedidoId} guardado num passo anterior). ' +
          'O passo procura a linha (tr ou role=row) com esse texto exato numa célula e age dentro dela (aqui: a 5.ª coluna). ARMADILHAS: o texto tem de existir numa só linha; se a tabela é paginada ou filtrada, pesquise primeiro; células sem data-testid são encontradas pela posição dentro da linha.',
        passos: [
          { id: 'p1', acao: 'navegar', descricao: 'Abrir o Backoffice do Simulador', valor: fixo('') },
          {
            id: 'p2',
            acao: 'verificar',
            descricao: 'Verificar a decisão na linha do pedido',
            alvo: { descricao: 'Coluna "Decisão"', localizadores: [{ tipo: 'css', valor: ':scope > td:nth-child(5)' }], linha: { valor: variavel('PedidoId') } },
            valor: fixo('Pendente'),
            verificacao: { tipo: 'texto', esperaSeg: 15 },
          },
        ],
      },
    },
    {
      epicoId: 'wiki-c-situacoes',
      antes: ['abrir-portal-fo'],
      dados: { Utilizador: 'ana.silva', Password: 'Teste#2026', CodigoMfa: '123456', BemVindo: 'Olá, Ana Silva' },
      bloco: {
        id: 'receita-mfa-e-dados-depois',
        nome: 'MFA em modo de teste e dados que chegam depois do ecrã',
        tipo: 'UI',
        aplicacaoId: 'portal-fo',
        descricao:
          'COMO: em QA, o MFA tem um "modo de teste" (código fixo): é um passo "Escrever" normal com o código vindo de uma coluna. Alternativas: TOTP({Chave}) para apps autenticadoras, ou um bloco de email que extrai o código. ' +
          'Dados que chegam depois: num ecrã OutSystems os textos aparecem vazios e só depois se preenchem (aggregates). Use "Verificar" com "esperar até" (por exemplo 15 s). ARMADILHA: ler logo um texto dá vazio. Marque o bloco de login como "Bloco de login" para os casos seguintes não repetirem o login.',
        login: true,
        passos: [
          { id: 'p1', acao: 'escrever', descricao: 'Utilizador', alvo: alvo('fo_inpUtilizador', 'Utilizador'), valor: variavel('Utilizador') },
          { id: 'p2', acao: 'escrever', descricao: 'Password', alvo: alvo('fo_inpPassword', 'Password'), valor: variavel('Password'), secreto: true },
          { id: 'p3', acao: 'clicar', descricao: 'Entrar', alvo: alvo('fo_btnEntrar', 'Entrar') },
          { id: 'p4', acao: 'verificar', descricao: 'Esperar pelo ecrã do código', alvo: alvo('fo_inpCodigo', 'Código'), verificacao: { tipo: 'visivel', esperaSeg: 30 } },
          { id: 'p5', acao: 'escrever', descricao: 'Código MFA (modo de teste)', alvo: alvo('fo_inpCodigo', 'Código'), valor: variavel('CodigoMfa') },
          { id: 'p6', acao: 'clicar', descricao: 'Confirmar', alvo: alvo('fo_btnConfirmar', 'Confirmar') },
          { id: 'p7', acao: 'verificar', descricao: 'Verificar o nome (chega depois do ecrã)', alvo: alvo('fo_resBemVindo', 'Boas-vindas'), valor: variavel('BemVindo'), verificacao: { tipo: 'texto', esperaSeg: 15 } },
        ],
      },
    },
  ];

  receitas.push(...receitasDoCatalogo());

  for (const r of receitas) {
    // As armadilhas num parágrafo à parte (a interface mostra as quebras de linha).
    guardar(pasta, 'blocos', { ...r.bloco, nome: `Receita: ${r.bloco.nome}`, descricao: r.bloco.descricao?.replace(/\s*(ARMADILHAS?:)/, '\n\n$1') });
    const blocos: BlocoDaJornada[] = [...(r.antes ?? []), r.bloco.id, ...(r.depois ?? [])].map((blocoId, i) => ({ id: `b${i + 1}`, blocoId }));
    const id = `prova-${r.bloco.id.replace(/^receita-/, '')}`;
    guardar(pasta, 'jornadas', { id, nome: `Prova: ${r.bloco.nome}`, epicoId: r.epicoId, etiquetas: ['wiki'], blocos });
    guardar(pasta, 'casos', { id, colunas: Object.keys(r.dados), casos: [{ id: 'PROVA', nome: r.bloco.nome, etiquetas: ['wiki'], dados: r.dados }] });
  }
}
