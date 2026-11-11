// Modo demo (npm.cmd run demo): usa a app como um utilizador, devagar, com legendas e realces, e grava um
// vídeo .webm por capítulo em out/demo/, mais um guia em HTML com uma imagem por legenda (out/demo/guia.html).
// Só usa as apps de teste e dados fictícios. Escolher capítulos: npm.cmd run demo -- --capitulos=gravar,correr
// Para acrescentar um capítulo: escrever uma função como as de baixo e pô-la na lista CAPITULOS.
import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Page } from 'playwright-core';
import { estadoRun, iniciarRun, esperarFimDoRun } from '../executor/execucao';
import { estadoGravador, paginaDoGravador, terminarGravacao } from '../gravador/gravador';
import { criarProjeto } from '../projeto/ipc';
import * as repo from '../projeto/repositorio';
import { esperar, naPagina } from '../smoke';
import { GravadorDeVideo } from './video';

interface EntradaGuia {
  legenda: string;
  imagem: string;
}
interface CapituloGravado {
  id: string;
  titulo: string;
  resumo: string;
  video: string;
  entradas: EntradaGuia[];
}

/** O "realizador": legendas, realces, cliques visíveis, prints para o guia. */
class Realizador {
  noEdge = false;
  entradas: EntradaGuia[] = [];
  private contador = 0;

  constructor(
    readonly janela: BrowserWindow,
    readonly video: GravadorDeVideo,
    readonly pastaSaida: string,
    readonly capitulo: string,
  ) {}

  pausa(segundos: number): Promise<void> {
    return new Promise((r) => setTimeout(r, segundos * 1000));
  }

  /** Mostra uma legenda o tempo suficiente para a ler e guarda uma imagem para o guia. */
  async legenda(texto: string, segundos?: number): Promise<void> {
    // A imagem da janela chega ao vídeo com um pequeno atraso: dar tempo ao realce antes da legenda.
    await this.pausa(0.6);
    await this.video.legenda(texto);
    await this.printParaGuia(texto);
    await this.pausa(segundos ?? Math.max(3, Math.min(9, texto.length / 15)));
  }

  private async printParaGuia(texto: string): Promise<void> {
    this.contador++;
    const nome = `${this.capitulo}-${String(this.contador).padStart(2, '0')}.png`;
    const ficheiro = path.join(this.pastaSaida, 'guia', nome);
    fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
    try {
      const pagina = this.noEdge ? paginaDoGravador() : null;
      if (pagina) await pagina.screenshot({ path: ficheiro });
      else fs.writeFileSync(ficheiro, (await this.janela.webContents.capturePage()).toPNG());
      this.entradas.push({ legenda: texto, imagem: `guia/${nome}` });
    } catch {
      this.entradas.push({ legenda: texto, imagem: '' });
    }
  }

  async semLegenda(): Promise<void> {
    await this.video.legenda('');
  }

  /** Desenha um retângulo à volta de um elemento da app (ou tira-o, com null). */
  async realcar(seletor: string | null): Promise<void> {
    await naPagina(
      this.janela,
      `(() => {
        document.getElementById('demo-realce')?.remove();
        const sel = ${JSON.stringify(seletor)};
        if (!sel) return;
        const el = document.querySelector(sel);
        if (!el) return;
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = el.getBoundingClientRect();
        const d = document.createElement('div');
        d.id = 'demo-realce';
        const s = d.style;
        s.setProperty('position', 'fixed');
        s.setProperty('left', (r.left - 6) + 'px');
        s.setProperty('top', (r.top - 6) + 'px');
        s.setProperty('width', (r.width + 12) + 'px');
        s.setProperty('height', (r.height + 12) + 'px');
        s.setProperty('border', '4px solid #ff9f1c');
        s.setProperty('border-radius', '10px');
        s.setProperty('box-shadow', '0 0 0 9999px rgba(0,0,0,0.18)');
        s.setProperty('pointer-events', 'none');
        s.setProperty('z-index', '99999');
        document.body.append(d);
      })()`,
    );
  }

  /** Realça, mostra a legenda (opcional) e clica. */
  async clicar(seletor: string, legenda?: string): Promise<void> {
    await esperar(this.janela, `document.querySelector(${JSON.stringify(seletor)})`, 120_000);
    await this.realcar(seletor);
    if (legenda) await this.legenda(legenda);
    else await this.pausa(1.2);
    await this.realcar(null);
    await naPagina(this.janela, `document.querySelector(${JSON.stringify(seletor)}).click()`);
    await this.pausa(0.8);
  }

  /** Escreve letra a letra num campo da app. */
  async escrever(seletor: string, texto: string): Promise<void> {
    await this.realcar(seletor);
    for (let i = 1; i <= texto.length; i++) {
      await naPagina(this.janela, `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); e.value = ${JSON.stringify(texto.slice(0, i))}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await this.pausa(0.06);
    }
    await naPagina(this.janela, `document.querySelector(${JSON.stringify(seletor)}).dispatchEvent(new Event('change', { bubbles: true }))`);
    await this.realcar(null);
  }

  /** Muda o valor de uma lista da app (dispara "change"). */
  async escolher(seletor: string, valor: string): Promise<void> {
    await this.realcar(seletor);
    await this.pausa(1);
    await naPagina(this.janela, `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); e.value = ${JSON.stringify(valor)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await this.pausa(0.8);
    await this.realcar(null);
  }

  async irPara(ecra: string, legenda?: string): Promise<void> {
    await this.clicar(`.menu-item[data-ecra="${ecra}"]`, legenda);
  }

  /** Realça um elemento na página do Edge (o browser do gravador). */
  async realcarNoEdge(pagina: Page, seletor: string | null): Promise<void> {
    await pagina
      .evaluate((sel) => {
        document.getElementById('demo-realce')?.remove();
        if (!sel) return;
        const el = document.querySelector(sel);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d = document.createElement('div');
        d.id = 'demo-realce';
        const s = d.style;
        s.setProperty('position', 'fixed');
        s.setProperty('left', `${r.left - 6}px`);
        s.setProperty('top', `${r.top - 6}px`);
        s.setProperty('width', `${r.width + 12}px`);
        s.setProperty('height', `${r.height + 12}px`);
        s.setProperty('border', '4px solid #ff9f1c');
        s.setProperty('border-radius', '10px');
        s.setProperty('pointer-events', 'none');
        s.setProperty('z-index', '2147483646');
        document.body.append(d);
      }, seletor)
      .catch(() => undefined);
  }
}

type FuncaoCapitulo = (r: Realizador, pasta: string) => Promise<void>;
interface Capitulo {
  id: string;
  titulo: string;
  resumo: string;
  correr: FuncaoCapitulo;
}

// ---------------------------------------------------------------- capítulos

const primeirosPassos: FuncaoCapitulo = async (r, pasta) => {
  await esperar(r.janela, "document.body.dataset.vista === 'boas-vindas'");
  await r.legenda('O UAT Studio cria e corre testes de aceitação (UAT) e de regressão de apps OutSystems, sem programar. Tudo corre neste PC, sem internet para a ferramenta e sem IA.');
  await r.legenda('Os testes ficam numa pasta de projeto, em ficheiros simples. Aqui vamos usar um projeto já com exemplos.');
  criarProjeto(pasta, 'Projeto da demo', true, true);
  r.janela.reload();
  await esperar(r.janela, "document.body.dataset.vista === 'app' && document.querySelector('.cartao-epico')", 30_000);
  await r.legenda('As ideias principais: um ÉPICO junta JORNADAS; uma jornada é um percurso de BLOCOS reutilizáveis; e cada jornada corre com vários CASOS (as linhas de dados, como num Excel).');
  await r.realcar('.cartao-epico');
  await r.legenda('Este é um épico com as suas jornadas. Cada cartão mostra quantos casos tem e o resultado da última execução.');
  await r.realcar(null);
  const menu: Array<[string, string]> = [
    ['jornadas', 'Jornadas: os épicos, as jornadas e os blocos partilhados por todas.'],
    ['editor', 'Editor de jornada: montar o percurso de blocos e escrever os casos.'],
    ['api', 'Blocos de API: pedidos GET/POST/PUT/DELETE com OAuth 2.0 e outras autenticações.'],
    ['gravar', 'Gravar: abrir a app no Edge e gravar os passos clicando nos campos.'],
    ['dados', 'Dados de teste: fórmulas, geradores (NIF, IBAN, emails) e contadores.'],
    ['runs', 'Runs e resultados: correr, ver OK/KO/ERRO, evidências, relatórios e PDF para assinatura.'],
    ['mapa', 'Mapa de execução: a execução ao vivo, com o browser de cada worker em miniatura.'],
  ];
  for (const [ecra, texto] of menu) {
    await r.realcar(`.menu-item[data-ecra="${ecra}"]`);
    await r.legenda(texto, 3.5);
  }
  await r.realcar('#escolha-projeto');
  await r.legenda('No canto escolhe-se o projeto (incluindo o Projeto de exemplo e a Wiki de componentes) e, ao lado, o ambiente: DEV, QA ou PRD. Produção está protegida.');
  await r.realcar(null);
};

const gravarBloco: FuncaoCapitulo = async (r) => {
  await r.irPara('gravar', 'Para criar um bloco de ecrã, vamos a Gravar.');
  await r.escolher('#gravar-aplicacao', 'simulador');
  await r.escrever('#gravar-nome', 'Simular crédito (demo)');
  await r.clicar('#btn-gravar', 'Escolhe-se a aplicação e o nome do bloco, e carrega-se em Gravar. O Edge abre na app.');
  await esperar(r.janela, "document.getElementById('gravacao-ativa')", 120_000);
  const p = paginaDoGravador();
  if (!p) throw new Error('O gravador não tem página.');
  await p.bringToFront().catch(() => undefined);
  r.noEdge = await r.video.mostrarEdge();
  const popup = p.locator('#__uat-gravador .popup');
  const tid = (id: string) => p.locator(`[data-testid="${id}"]`);
  const numeroDePassos = (): number => estadoGravador().bloco?.passos.length ?? 0;
  const gravarPasso = async (): Promise<void> => {
    const antes = numeroDePassos();
    await r.pausa(1.2);
    await popup.getByRole('button', { name: 'Gravar passo' }).click();
    const fim = Date.now() + 20_000;
    while (numeroDePassos() === antes && Date.now() < fim) await p.waitForTimeout(100);
    await popup.waitFor({ state: 'detached' }).catch(() => undefined);
  };
  await p.locator('#__uat-gravador .barra').waitFor();
  const lista = tid('ddVariante').locator('select');
  // Se a app estava parada, a 1.ª carga pode falhar ("There was a problem"): recarregar e esperar outra vez.
  for (let tentativa = 1; ; tentativa++) {
    const ok = await lista.locator('option').nth(1).waitFor({ state: 'attached', timeout: 20_000 }).then(() => true, () => false);
    if (ok) break;
    if (tentativa === 4) throw new Error('A lista de variantes do Simulador não carregou.');
    await p.reload();
  }
  await p.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);
  await r.legenda('Esta é a app de teste "Simulador Financeiro", feita em OutSystems. A barra no topo é do UAT Studio: mostra que está a gravar.');

  await r.realcarNoEdge(p, '[data-testid="ddVariante"]');
  await r.legenda('Basta clicar num campo. Começamos pela lista de variantes.', 3);
  await r.realcarNoEdge(p, null);
  await lista.click();
  await popup.waitFor();
  await r.legenda('Abre-se um popup: o que fazer e de onde vem o valor. Pode ser fixo, vir de uma coluna dos casos (como no Excel), de uma fórmula ou de um gerador.');
  await popup.locator('input[value="variavel"]').check();
  await popup.getByLabel('Nome da coluna').fill('Variante');
  const opcoes = await popup.getByLabel('Opção de exemplo').locator('option').allTextContents();
  const cp12 = opcoes.find((o) => o.startsWith('CP12'));
  if (cp12) await popup.getByLabel('Opção de exemplo').selectOption({ label: cp12 });
  await r.legenda('Aqui o valor vem da coluna "Variante": cada caso pode escolher uma variante diferente. O passo é executado logo, para confirmar que funciona.');
  await gravarPasso();

  await tid('inpValor').click();
  await popup.waitFor();
  await popup.getByLabel('Texto a escrever').fill('1000');
  await r.legenda('No campo Valor, um valor fixo: 1000.', 3);
  await gravarPasso();

  await tid('btnSubmeter').click();
  await popup.waitFor();
  await r.legenda('Num botão, a ação é clicar.', 3);
  await gravarPasso();
  await p.waitForFunction(() => (document.querySelector('[data-testid="resEstado"]')?.textContent ?? '').trim() !== '', undefined, { timeout: 30_000 }).catch(() => undefined);

  await tid('resEstado').click();
  await popup.waitFor();
  await popup.getByRole('button', { name: 'Verificar' }).click();
  await r.legenda('Num resultado, escolhe-se Verificar: o popup sugere o valor que está no ecrã. Se no teste der outro valor, o caso fica KO.');
  await gravarPasso();

  await tid('resPrestacao').click();
  await popup.waitFor();
  await popup.getByRole('button', { name: 'Verificar' }).click();
  await popup.getByLabel('O que verificar').selectOption('numero');
  await r.legenda('Para valores em euros, a verificação é numérica: conta exata em decimal, aceita "86,40" ou "86.40", com tolerância se for preciso.');
  await gravarPasso();

  r.noEdge = false;
  await r.video.mostrarJanela(r.janela);
  r.janela.focus();
  await esperar(r.janela, "document.getElementById('contagem-passos')");
  await r.realcar('#contagem-passos');
  await r.legenda('De volta ao UAT Studio: os passos gravados aparecem aqui. Para cada elemento a ferramenta guarda várias formas de o encontrar (data-testid, etiqueta, texto, posição): se uma falhar, usa outra.');
  await r.realcar(null);
  await r.clicar('#btn-guardar-bloco', 'Guardar o bloco: fica na biblioteca e pode ser usado em várias jornadas.');
  await esperar(r.janela, "document.getElementById('btn-gravar')");
  if (estadoGravador().ativo) await terminarGravacao(false);
};

const montarJornada: FuncaoCapitulo = async (r) => {
  await r.irPara('jornadas');
  await r.clicar('[data-jornada="simular-credito"]', 'Uma jornada abre-se com um clique. Vamos abrir "Simular crédito".');
  await esperar(r.janela, "document.querySelector('#percurso > li')");
  await r.realcar('#percurso');
  await r.legenda('O percurso: os blocos por ordem. Acrescentam-se da biblioteca, mudam de ordem, e cada bloco pode ter uma condição ("só se...") ou correr sempre, como limpeza.');
  await naPagina(r.janela, "document.querySelector('#percurso > li details')?.setAttribute('open', '')");
  await r.pausa(0.5);
  await r.realcar('#percurso > li details');
  await r.legenda('Cada {variável} de um bloco vem da coluna com o mesmo nome, de outra coluna ou de um valor fixo. Assim o mesmo bloco serve muitos testes.');
  await r.realcar('#tabela-casos');
  await r.legenda('Os casos: uma linha por teste, com os dados de entrada e os valores esperados. Editam-se aqui ou importam-se e exportam-se em Excel.');
  await r.realcar('#btn-ver-codigo');
  await r.legenda('"Ver código" mostra o teste Playwright equivalente, para quem quiser ver o que é executado.');
  await r.realcar(null);
};

const correrResultados: FuncaoCapitulo = async (r, pasta) => {
  await r.irPara('runs', 'Para correr, vamos a Runs e resultados.');
  await esperar(r.janela, "document.querySelector('#run-ambito option[value=\"jornada:simular-credito\"]')");
  await r.escolher('#run-ambito', 'jornada:simular-credito');
  await r.realcar('#run-paralelo');
  await r.legenda('Escolhe-se o que correr (um épico, uma jornada, alguns casos ou etiquetas), o browser (Edge ou Chrome), visível ou em background, e quantos casos em paralelo.');
  await r.escolher('#run-paralelo', '2');
  await r.clicar('#btn-correr', 'Antes de correr, a ferramenta verifica se falta alguma coisa: colunas, fórmulas, endereços, segredos.');
  await esperar(r.janela, "document.querySelector('#run-atual[data-ativo=\"true\"]')", 60_000);
  await r.irPara('mapa', 'Durante a execução, o Mapa mostra tudo ao vivo.');
  await esperar(r.janela, "document.querySelector('#workers .worker img')", 90_000).catch(() => undefined);
  await r.realcar('#workers');
  await r.legenda('Cada worker é um browser em background. As miniaturas mostram o que está a fazer. Pode-se pausar um worker ou a execução toda (sempre entre passos).');
  await r.realcar('#mapa');
  await r.legenda('Os blocos ganham cor: azul a correr, verde OK, laranja KO, vermelho ERRO.');
  await r.realcar(null);
  await esperarFimDoRun(600_000);
  await r.clicar('.separador[data-vista="casos"]', 'A vista Casos mostra cada caso e cada bloco, numa matriz.');
  await r.pausa(2);
  await r.irPara('runs');
  await esperar(r.janela, "document.querySelector('.caso .caso-topo')");
  await r.legenda('OK: tudo coincide. KO: chegou ao fim mas algum valor é diferente. ERRO: não chegou ao fim.');
  const ko = estadoRun()?.casos.find((c) => c.estado === 'KO');
  const alvo = ko ? `.caso[data-chave="${ko.chave}"] .caso-topo` : '.caso .caso-topo';
  await r.clicar(alvo, 'Abrindo um caso vemos os passos, os prints de cada bloco e, num KO, o valor esperado e o obtido.');
  await r.pausa(1);
  await r.realcar('.caso-detalhe');
  await r.legenda('Tudo fica numa pasta por execução: logs, prints, trace do Playwright, relatório Excel e HTML. E há o PDF para assinatura do UAT.');
  await r.realcar(null);
  void pasta;
};

const entrePortais: FuncaoCapitulo = async (r, pasta) => {
  await r.irPara('jornadas');
  await r.legenda('A segunda app de teste, "Portal de Crédito", tem dois portais: o cliente pede crédito no Front Office e o gestor aprova no Backoffice. O cliente só avança depois da aprovação.');
  await r.clicar('[data-jornada="pc-pedido-entre-portais"]', 'A jornada "entre portais" usa duas sessões do browser: uma do cliente e outra do gestor, no mesmo teste.');
  await esperar(r.janela, "document.querySelector('#percurso > li')");
  await r.realcar('#percurso');
  await r.legenda('O login com MFA é feito no 1.º caso e reutilizado nos seguintes. O número do pedido é guardado no FO e usado no BO para encontrar a linha certa da tabela.');
  await r.realcar(null);
  await r.irPara('mapa');
  await esperar(r.janela, "document.getElementById('mapa-run')");
  await iniciarRun(pasta, { jornadaIds: ['pc-pedido-entre-portais'] }, { canal: 'msedge', visivel: false, paralelo: 2 });
  await esperar(r.janela, "document.querySelector('#workers .worker img')", 120_000).catch(() => undefined);
  await r.irPara('mapa');
  await r.clicar('.separador[data-vista="jornadas"]');
  await r.pausa(8); // as primeiras miniaturas ainda estão em branco (a app a carregar)
  await r.realcar('#workers');
  await r.legenda('Dois casos em paralelo, em background. Nas miniaturas vê-se o FO e o BO a alternar.', 8);
  await r.realcar(null);
  await r.pausa(8);
  await r.legenda('Casos diferentes testam aprovação, recusa, limite do analista e um pagamento recusado. Os valores esperados usam o arredondamento do OutSystems.', 8);
  await esperarFimDoRun(900_000);
  await r.clicar('.separador[data-vista="casos"]', 'No fim, a matriz mostra que blocos correram em cada caso: os condicionais ficam "ignorados" quando não se aplicam.');
  await r.pausa(3);
};

const dadosEApis: FuncaoCapitulo = async (r, pasta) => {
  if (!repo.lerVariaveis(pasta).some((v) => v.nome === 'ComissaoCalculada')) {
    repo.gravarVariaveis(pasta, [...repo.lerVariaveis(pasta), { nome: 'ComissaoCalculada', formula: 'SE({EstadoEsperado} = "Aprovado"; ARRED({Valor} * 1 / 100; 2); 0)', descricao: 'Comissão de 1% só nos pedidos aprovados' }]);
  }
  await r.irPara('dados', 'Dados de teste: variáveis calculadas por fórmula, ao estilo do Excel em português.');
  await esperar(r.janela, "document.getElementById('lista-variaveis')");
  await r.realcar('#lista-variaveis');
  await r.legenda('Por exemplo, a comissão esperada calcula-se com SE e ARRED. Há também ARRED.PAR (como o Round do OutSystems), PRESTACAO, datas, NIF(), IBAN(), EMAIL() e contadores.');
  await r.realcar(null);
  await r.irPara('api', 'Blocos de API: chamar as APIs da app ou de serviços externos, com os dados do caso.');
  await esperar(r.janela, "document.getElementById('lista-blocos-api')");
  await r.realcar('#lista-blocos-api');
  await r.legenda('Cada bloco tem o método, o endereço com {variáveis}, o corpo, as verificações (código HTTP, campos, tempo) e o que guardar. A autenticação vem de um perfil: OAuth 2.0, API Key, Basic, certificado.');
  await r.realcar('#btn-importar-api');
  await r.legenda('Também se importam pedidos de cURL, OpenAPI/Swagger e Postman. Os segredos ficam num cofre encriptado neste PC, nunca nos ficheiros nem nos relatórios.');
  await r.realcar(null);
};

const CAPITULOS: Capitulo[] = [
  { id: 'primeiros-passos', titulo: '1. Primeiros passos', resumo: 'O que é o UAT Studio, as ideias principais e o menu.', correr: primeirosPassos },
  { id: 'gravar', titulo: '2. Gravar um bloco', resumo: 'Abrir a app no Edge e gravar passos com cliques.', correr: gravarBloco },
  { id: 'jornada', titulo: '3. Montar uma jornada', resumo: 'Percurso de blocos, parâmetros e casos.', correr: montarJornada },
  { id: 'correr', titulo: '4. Correr e ver os resultados', resumo: 'Execução em paralelo, mapa ao vivo, OK/KO/ERRO e evidências.', correr: correrResultados },
  { id: 'entre-portais', titulo: '5. Testar entre dois portais', resumo: 'Front Office e Backoffice na mesma jornada, com aprovação.', correr: entrePortais },
  { id: 'dados-apis', titulo: '6. Dados de teste e APIs', resumo: 'Fórmulas, geradores e blocos de API.', correr: dadosEApis },
  // Por fazer (ver ROADMAP): "Perceber o projeto de exemplo", "Usar a Wiki de componentes" e "Quando algo falha".
];

/** As apps ODC "adormecem": acordá-las antes de gravar, para a 1.ª carga não falhar no vídeo. */
async function acordarApps(): Promise<void> {
  const enderecos = [
    'https://personal-e5m9c9gh-dev.outsystems.app/SimuladorFinanceiroPOC/rest/PedidosAPI/variantes',
    'https://personal-e5m9c9gh-dev.outsystems.app/PortalCreditoPOC/rest/CreditoAPI/produtos',
  ];
  for (const url of enderecos) {
    for (let tentativa = 1; tentativa <= 6; tentativa++) {
      const ok = await fetch(url, { signal: AbortSignal.timeout(60_000) }).then((r) => r.ok, () => false);
      if (ok) break;
      console.log(`[demo] a app ainda não responde (${url}, tentativa ${tentativa})`);
    }
  }
}

// ---------------------------------------------------------------- guia em HTML

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escreverGuia(pastaSaida: string, capitulos: CapituloGravado[]): void {
  const partes = capitulos.map(
    (c) => `<section id="${c.id}"><h2>${escapar(c.titulo)}</h2><p class="resumo">${escapar(c.resumo)} <a href="${c.video}">Ver o vídeo</a></p>
${c.entradas.map((e) => `<figure>${e.imagem ? `<img src="${e.imagem}" alt="">` : ''}<figcaption>${escapar(e.legenda)}</figcaption></figure>`).join('\n')}</section>`,
  );
  const html = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Guia do UAT Studio</title>
<style>body{font-family:"Segoe UI",sans-serif;max-width:1000px;margin:0 auto;padding:24px;color:#1d2330;background:#f4f5f7}
h1{margin-bottom:4px}nav a{margin-right:14px}section{margin-top:40px}figure{margin:18px 0;background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
img{width:100%;border-radius:6px}figcaption{margin-top:8px;font-size:17px}.resumo{color:#555}</style></head><body>
<h1>Guia do UAT Studio</h1><p>Gerado automaticamente pelo modo demo, com as apps de teste e dados fictícios.</p>
<nav>${capitulos.map((c) => `<a href="#${c.id}">${escapar(c.titulo)}</a>`).join('')}</nav>
${partes.join('\n')}</body></html>`;
  fs.writeFileSync(path.join(pastaSaida, 'guia.html'), html, 'utf8');
}

// ---------------------------------------------------------------- arranque

export async function correrDemo(janela: BrowserWindow, raiz: string): Promise<void> {
  let codigo = 0;
  const pedidos = process.argv.find((a) => a.startsWith('--capitulos='))?.split('=')[1]?.split(',').filter(Boolean);
  const escolhidos = pedidos?.length ? CAPITULOS.filter((c) => pedidos.includes(c.id)) : CAPITULOS;
  const pastaSaida = path.join(raiz, 'out', 'demo');
  fs.mkdirSync(pastaSaida, { recursive: true });
  const pastaProjeto = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-demo-')), 'Projeto da demo');
  // Registar já a espera pelo carregamento da janela (pode acabar enquanto o gravador de vídeo se prepara).
  const carregada = janela.webContents.isLoading() ? new Promise<void>((resolve) => janela.webContents.once('did-finish-load', () => resolve())) : Promise.resolve();
  const video = await GravadorDeVideo.criar(raiz);
  const gravados: CapituloGravado[] = [];
  try {
    await carregada;
    await acordarApps();
    // A demo precisa do projeto: se o 1.º capítulo não for pedido, cria-o já.
    if (escolhidos[0]?.id !== 'primeiros-passos') {
      criarProjeto(pastaProjeto, 'Projeto da demo', true, true);
      janela.reload();
      await esperar(janela, "document.body.dataset.vista === 'app' && document.querySelector('.cartao-epico')", 30_000);
    }
    for (const [indice, c] of escolhidos.entries()) {
      const numero = String(CAPITULOS.indexOf(c) + 1).padStart(2, '0');
      console.log(`[demo] ${c.titulo}`);
      const r = new Realizador(janela, video, pastaSaida, numero);
      await video.mostrarJanela(janela);
      await video.titulo(c.titulo, c.resumo);
      await video.iniciar();
      await r.pausa(3.5);
      await video.titulo('');
      try {
        await c.correr(r, pastaProjeto);
        await r.semLegenda();
        await r.pausa(1);
      } catch (erro) {
        codigo = 1;
        console.log(`[demo] ERRO no capítulo "${c.titulo}": ${erro instanceof Error ? erro.message : String(erro)}`);
      }
      const ficheiro = `${numero}-${c.id}.webm`;
      const bytes = await video.parar(path.join(pastaSaida, ficheiro));
      console.log(`[demo]   ${ficheiro} (${(bytes / 1e6).toFixed(1)} MB, ${r.entradas.length} legendas)`);
      gravados.push({ id: c.id, titulo: c.titulo, resumo: c.resumo, video: ficheiro, entradas: r.entradas });
      void indice;
    }
    // Junta aos capítulos gravados antes (correr só alguns capítulos não apaga os outros do guia).
    const ficheiroCapitulos = path.join(pastaSaida, 'capitulos.json');
    let anteriores: CapituloGravado[] = [];
    try {
      anteriores = JSON.parse(fs.readFileSync(ficheiroCapitulos, 'utf8')) as CapituloGravado[];
    } catch {
      // Primeira vez.
    }
    const todos = CAPITULOS.map((c) => gravados.find((g) => g.id === c.id) ?? anteriores.find((a) => a.id === c.id)).filter((c): c is CapituloGravado => Boolean(c));
    fs.writeFileSync(ficheiroCapitulos, JSON.stringify(todos, null, 2), 'utf8');
    escreverGuia(pastaSaida, todos);
    console.log(`[demo] guia: ${path.join(pastaSaida, 'guia.html')}`);
  } catch (erro) {
    codigo = 1;
    console.log(`[demo] ERRO: ${erro instanceof Error ? erro.stack : String(erro)}`);
  } finally {
    video.fechar();
    await terminarGravacao(false).catch(() => undefined);
    app.exit(codigo);
  }
}
