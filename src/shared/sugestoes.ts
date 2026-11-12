// Sugestões para um caso que correu mal, geradas por regras (sem IA) a partir do erro e das diferenças.
// Usado pelo executor (escreve no caso.log e no relatório) e pela interface.
import { absoluto, comparar, deInteiro, lerNumero, subtrair } from './decimal.js';
import type { Diferenca, ResultadoCaso } from './modelo';

interface Regra {
  padrao: RegExp;
  sugestoes: string[];
}

/** Regras para a mensagem de erro (a primeira que encaixa ganha; a ordem importa). */
const REGRAS_ERRO: Regra[] = [
  {
    padrao: /Há \d+ elementos que correspondem/,
    sugestoes: [
      'Há vários elementos iguais no ecrã: regrave o passo apontando para o elemento certo ("Regravar este elemento").',
      'Se a app for vossa, peçam um data-testid único para este elemento: é o localizador mais estável.',
    ],
  },
  {
    padrao: /linhas? de tabela com o texto|nenhuma linha de tabela/,
    sugestoes: [
      'Confirme no print que a tabela já mostrava a linha (pode precisar de pesquisar ou filtrar antes).',
      'Confirme o valor usado para encontrar a linha nos dados do caso.',
    ],
  },
  {
    padrao: /Não encontrei o elemento|não tem localizadores gravados/,
    sugestoes: [
      'O ecrã pode ter mudado: regrave o elemento ("Regravar este elemento") ou veja no print erro.png o que estava aberto.',
      'Se o ecrã anterior ainda não tinha acabado (mensagem de erro, popup, página errada), corrija o passo anterior ou acrescente uma verificação "esperar até".',
    ],
  },
  {
    padrao: /demorou mais do que o tempo limite|não respondeu em/,
    sugestoes: [
      'A aplicação esteve lenta: repita só este caso. Na 1.ª execução do dia o ambiente pode estar a "acordar".',
      'Se demora sempre, acrescente uma verificação com "esperar até" antes deste passo.',
      'Abra o trace para ver o momento exato em que parou.',
    ],
  },
  {
    padrao: /HTTP 401\b|\b401\b.*(token|autoriz)/i,
    sugestoes: [
      'Credenciais recusadas (401): confirme o perfil de autenticação e volte a preencher o segredo no cofre (ecrã Blocos de API).',
      'Os segredos não viajam com a pasta do projeto: noutro PC é preciso preenchê-los outra vez.',
    ],
  },
  { padrao: /HTTP 403\b/, sugestoes: ['Acesso negado (403): o utilizador ou o client ID não tem permissão para este pedido; confirme o âmbito (scope) e os roles.'] },
  { padrao: /HTTP 404\b/, sugestoes: ['Não encontrado (404): confirme o endereço do pedido, o endereço da aplicação neste ambiente e o identificador usado (por exemplo {PedidoId}).'] },
  {
    padrao: /HTTP 5\d\d\b/,
    sugestoes: ['Erro do servidor (5xx): a falha é da aplicação ou de uma integração. Repita mais tarde e, se continuar, leve o pedido e a resposta (pasta api/) à equipa de desenvolvimento.'],
  },
  { padrao: /certificados?/i, sugestoes: ['Problema de certificados: confirme que está na rede da empresa (ou VPN) e fale com a IT se o certificado do site não for reconhecido.'] },
  { padrao: /proxy/i, sugestoes: ['Problema de proxy: confirme a ligação à rede da empresa (ou VPN).'] },
  {
    padrao: /endereço não foi encontrado|não há rede|recusou a ligação/,
    sugestoes: ['Confirme a rede (ou a VPN) e o endereço da aplicação neste ambiente (ecrã Cenários → Aplicações).'],
  },
  { padrao: /não tem endereço no ambiente|não tem endereço no ambiente ativo/, sugestoes: ['Preencha o endereço da aplicação para este ambiente no ecrã Cenários → Aplicações.'] },
  { padrao: /Falta preencher .* no perfil/, sugestoes: ['Preencha o segredo em falta no ecrã Blocos de API → Perfis de autenticação.'] },
  {
    padrao: /O email não chegou/,
    sugestoes: [
      'Confirme que a aplicação enviou mesmo o email (e para que endereço) e os filtros do bloco (para, assunto).',
      'Se o email demora, aumente o tempo de espera do bloco de email.',
    ],
  },
  { padrao: /não tem o campo/, sugestoes: ['A resposta não tinha o campo esperado: veja a resposta guardada na pasta api/ do caso e confirme o caminho do campo em "guardar da resposta".'] },
  {
    padrao: /fórmula|variável|\{[^}]+\}|não é um número/i,
    sugestoes: ['Confirme os dados do caso (colunas do Excel) e as fórmulas usadas: corra "Verificar" no ecrã Runs antes de correr.'],
  },
  { padrao: /browser foi fechado/, sugestoes: ['O browser foi fechado a meio: repita só este caso.'] },
];

/** Diferença de um número dentro de ±0,01 (possível arredondamento). */
function eDeUmCentimo(d: Diferenca): boolean {
  const esperado = lerNumero(d.esperado);
  const obtido = lerNumero(d.obtido);
  const centimo = lerNumero('0,01');
  if (!esperado || !obtido || !centimo) return false;
  const diferenca = absoluto(subtrair(esperado, obtido));
  return comparar(diferenca, deInteiro(0)) > 0 && comparar(diferenca, centimo) <= 0;
}

/** Sugestões para o caso (vazio quando correu bem). */
export function sugerirParaCaso(caso: Pick<ResultadoCaso, 'estado' | 'erro' | 'diferencas'>): string[] {
  const sugestoes: string[] = [];
  const juntar = (lista: string[]): void => {
    for (const s of lista) if (!sugestoes.includes(s)) sugestoes.push(s);
  };
  if (caso.estado === 'ERRO' && caso.erro) {
    const regra = REGRAS_ERRO.find((r) => r.padrao.test(caso.erro?.mensagem ?? ''));
    juntar(regra ? regra.sugestoes : ['Veja o print erro.png e abra o trace para perceber o que estava no ecrã quando parou.']);
  }
  for (const d of caso.diferencas) {
    if (d.passo === 'Confirmação manual') {
      juntar(['O testador marcou KO no passo manual: veja a observação e o anexo, se houver.']);
    } else if (/^Verificar: Código HTTP/i.test(d.passo) || /^\d{3}$/.test(d.obtido.trim())) {
      const codigo = Number(d.obtido.trim());
      const regra = REGRAS_ERRO.find((r) => r.padrao.test(`HTTP ${codigo}`));
      if (regra) juntar(regra.sugestoes);
    } else if (eDeUmCentimo(d)) {
      juntar([
        `"${d.passo}" difere só num cêntimo (${d.esperado} vs ${d.obtido}): pode ser arredondamento. O Round() do OutSystems arredonda ao par (use ARRED.PAR na fórmula do valor esperado) ou aceite uma tolerância de 0,01.`,
      ]);
    } else if (d.obtido === '(elemento não encontrado)') {
      juntar(['Um valor a verificar não apareceu no ecrã: confirme no print se o resultado foi mostrado, ou regrave o elemento.']);
    }
  }
  if (caso.estado === 'KO' && sugestoes.length === 0) {
    juntar(['Compare o esperado com o obtido: o valor esperado nos dados do caso pode estar errado, ou a aplicação calcula de outra forma (nesse caso, é um defeito a reportar).']);
  }
  return sugestoes;
}
