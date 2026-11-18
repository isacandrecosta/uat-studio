// Janela à parte com a lista de fórmulas (para ter ao lado enquanto se definem fórmulas): grupos com exemplos,
// pesquisa sem acentos, "Copiar" em cada exemplo e "Manter por cima".
import { AJUDA_FORMULAS } from '../shared/formulas.js';
import { aplicarTema } from './configuracoes.js';
import { h, normalizarPesquisa } from './dom.js';

interface Exemplo {
  formula: string;
  da: string;
}
interface Grupo {
  titulo: string;
  exemplos: Exemplo[];
}

/** Os exemplos do guia de fórmulas do manual (capítulo 11), por tema. */
const GRUPOS: Grupo[] = [
  {
    titulo: 'O básico',
    exemplos: [
      { formula: '{Valor}', da: 'o valor da coluna Valor do caso' },
      { formula: '"Cliente " & {Nome}', da: 'juntar textos com &' },
      { formula: '{Valor} * 1,1', da: 'contas (+ - * /) com decimais exatos' },
      { formula: '{TESTE}   {RUN}', da: 'o ID do caso / da execução' },
      { formula: 'SE({Valor} > 1000; "Alto"; "Baixo")', da: 'escolher conforme uma condição (= <> < > <= >=)' },
      { formula: '=ARRED({Valor} * 0,015; 2)', da: 'numa célula de um caso (ou no Excel), começa por =' },
    ],
  },
  {
    titulo: 'Datas',
    exemplos: [
      { formula: '{DATA:dd/MM/yyyy}', da: 'a data de hoje' },
      { formula: '{HOJE+30:dd/MM/yyyy}', da: 'daqui a 30 dias' },
      { formula: '{HOJE-1:yyyy-MM-dd}', da: 'ontem, em formato ISO' },
      { formula: '{DATA:yyyyMMddHHmmss}', da: 'data e hora juntas (bom para dados únicos)' },
    ],
  },
  {
    titulo: 'Dados únicos e geradores',
    exemplos: [
      { formula: '"cliente_" & {TESTE} & "_" & {RUN}', da: 'um nome diferente em cada caso e execução' },
      { formula: '{CONTADOR:empresa}', da: 'número que aumenta 1 de cada vez (guardado entre execuções)' },
      { formula: '{ALEATORIO:6}', da: '6 algarismos ao acaso' },
      { formula: 'ALEATORIOENTRE(1; 100)', da: 'número entre 1 e 100' },
      { formula: 'NIF()', da: 'NIF português válido' },
      { formula: 'IBAN()', da: 'IBAN português de teste válido' },
      { formula: 'TELEFONE()', da: 'telemóvel português: 91, 92, 93 ou 96 + 7 algarismos' },
      { formula: 'TELEFONE("fixo")', da: 'telefone fixo português (21, 22, 2xx)' },
      { formula: 'TELEFONE("movel"; "+351")', da: 'telemóvel com o indicativo do país' },
    ],
  },
  {
    titulo: 'Contas de dinheiro',
    exemplos: [
      { formula: 'ARRED({Valor} * 1,5 / 100; 2)', da: 'arredondar meio para cima (86,405 → 86,41)' },
      { formula: 'ARRED.PAR({Valor} * 1,5 / 100; 2)', da: 'arredondar ao par, como o Round() do OutSystems (86,405 → 86,40)' },
      { formula: 'TRUNCAR({Valor} / 100) * {Pontos}', da: 'cortar as casas decimais' },
      { formula: 'PRESTACAO({Valor}; {Taxa}; {Prazo})', da: 'prestação mensal (capital; taxa anual %; meses)' },
      { formula: 'TEXTO({Total}; 2)', da: 'fixar as casas decimais ("86,40")' },
      { formula: 'PONTO({Total})', da: 'com ponto decimal ("86.4"), para campos que o pedem' },
      { formula: 'MIN({A}; {B})   MAX({A}; {B})   ABS({A})   POTENCIA({A}; 2)', da: 'outras contas' },
    ],
  },
  {
    titulo: 'Emails e MFA',
    exemplos: [
      { formula: '{EMAIL:gestor}', da: 'endereço de teste do papel "gestor" na caixa de testes do projeto' },
      { formula: 'EMAIL("cliente")', da: 'o mesmo, como função' },
      { formula: 'EMAIL("cliente"; "exemplo.pt")', da: 'sem caixa de testes: qa+cliente.<caso>.<run>@exemplo.pt' },
      { formula: 'EMAIL("ana.silva"; "cliente"; "exemplo.pt")', da: 'com a base que escolher: ana.silva+cliente.<caso>.<run>@exemplo.pt' },
      { formula: 'TOTP({ChaveMfa})', da: 'código MFA de 6 algarismos da app autenticadora' },
    ],
  },
  {
    titulo: 'Textos',
    exemplos: [
      { formula: 'MAIUSCULAS({Nome})   MINUSCULAS({Nome})', da: 'mudar maiúsculas/minúsculas' },
      { formula: 'ESQUERDA({NIF}; 3)   DIREITA({IBAN}; 4)', da: 'os primeiros / últimos caracteres' },
      { formula: 'COMPR({Nome})', da: 'quantos caracteres tem' },
    ],
  },
  {
    titulo: 'Condições "só se"',
    exemplos: [
      { formula: '{Decisao} = "Aprovar"', da: 'o bloco ou passo só corre quando se cumpre' },
      { formula: '{Valor} > 20000', da: 'comparar números' },
      { formula: '{Estado} <> "Recusado"', da: 'diferente de' },
    ],
  },
];

aplicarTema();
const lista = document.getElementById('lista-formulas') as HTMLElement;
const filtro = document.getElementById('filtro-formulas') as HTMLInputElement;
const porCima = document.getElementById('manter-por-cima') as HTMLInputElement;

/** Os exemplos da ajuda da interface que não estejam já nos grupos (ficam num grupo "Outras"). */
const jaListadas = new Set(GRUPOS.flatMap((g) => g.exemplos.map((e) => e.formula)));
const outras = AJUDA_FORMULAS.filter((a) => !jaListadas.has(a.exemplo) && !GRUPOS.some((g) => g.exemplos.some((e) => a.exemplo.includes(e.formula))));
if (outras.length) GRUPOS.push({ titulo: 'Outras', exemplos: outras.map((a) => ({ formula: a.exemplo, da: a.descricao })) });

function copiar(texto: string, botao: HTMLButtonElement): void {
  void navigator.clipboard.writeText(texto).then(
    () => {
      botao.textContent = 'Copiado';
      setTimeout(() => (botao.textContent = 'Copiar'), 1200);
    },
    () => (botao.textContent = 'Não copiou'),
  );
}

function desenhar(): void {
  const termo = normalizarPesquisa(filtro.value);
  lista.replaceChildren();
  let mostrados = 0;
  for (const grupo of GRUPOS) {
    const exemplos = grupo.exemplos.filter((e) => !termo || normalizarPesquisa(`${grupo.titulo} ${e.formula} ${e.da}`).includes(termo));
    if (!exemplos.length) continue;
    mostrados += exemplos.length;
    lista.append(
      h(
        'section',
        { class: 'cartao grupo-formulas' },
        h('h2', {}, grupo.titulo),
        h(
          'ul',
          { class: 'lista-exemplos' },
          exemplos.map((e) => {
            const botao = h('button', { type: 'button', class: 'botao botao-pequeno-livre', 'aria-label': `Copiar ${e.formula}` }, 'Copiar');
            botao.addEventListener('click', () => copiar(e.formula.trim(), botao));
            return h('li', { class: 'exemplo-formula' }, h('code', {}, e.formula), botao, h('span', { class: 'suave' }, e.da));
          }),
        ),
      ),
    );
  }
  if (!mostrados) lista.append(h('p', { class: 'suave' }, 'Nenhuma fórmula com esse texto.'));
}

filtro.addEventListener('input', desenhar);
porCima.addEventListener('change', () => void window.uatStudio.app.formulasPorCima(porCima.checked));
desenhar();
filtro.focus();
