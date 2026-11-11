// Teste rápido automático (npm run smoke): usa a janela como um utilizador,
// escreve o resultado na consola e fecha tudo. Os prints ficam em out/.
import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChildProcess, spawn } from 'node:child_process';
import { Bloco, ConjuntoCasos, Jornada } from '../shared/modelo';
import { apagarSegredosDoPerfil, segredosPreenchidos } from './cofre';
import * as repo from './projeto/repositorio';
import { continuarRun, esperarFimDoRun, estadoRun, iniciarRun } from './executor/execucao';
import { estadoGravador, paginaDoGravador, terminarGravacao } from './gravador/gravador';
import { criarProjeto } from './projeto/ipc';

type Passo = (janela: BrowserWindow) => Promise<void>;

/** Servidor de teste (OAuth 2.0 + API), que vive FORA do projeto. Sem ele, o passo de API é saltado. */
const SERVIDOR_TESTE = process.env.UAT_SERVIDOR_TESTE ?? path.resolve(__dirname, '..', '..', '..', 'uat-servidor-teste', 'servidor.mjs');
let servidor: ChildProcess | null = null;
const URL_APP_POC = 'https://personal-e5m9c9gh-dev.outsystems.app/SimuladorFinanceiroPOC';

/** Corre código na página e devolve o resultado. */
export function naPagina<T>(janela: BrowserWindow, codigo: string): Promise<T> {
  return janela.webContents.executeJavaScript(codigo) as Promise<T>;
}

/** Espera até uma expressão da página ser verdadeira. */
export async function esperar(janela: BrowserWindow, expressao: string, limiteMs = 30_000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (await naPagina<boolean>(janela, `Boolean(${expressao})`).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Esperei demasiado por: ${expressao}`);
}

function confirmar(condicao: unknown, mensagem: string): void {
  if (!condicao) throw new Error(mensagem);
}

async function tirarPrint(janela: BrowserWindow, raiz: string, nome: string): Promise<void> {
  try {
    await new Promise((r) => setTimeout(r, 300));
    const print = await janela.webContents.capturePage();
    const pasta = path.join(raiz, 'out');
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, `smoke-${nome}.png`), print.toPNG());
  } catch (erro) {
    console.log(`[smoke] aviso: sem print "${nome}" (${String(erro)})`);
  }
}

export async function correrSmoke(janela: BrowserWindow, raiz: string): Promise<void> {
  let codigo = 1;
  const pastaProjeto = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-studio-smoke-'));
  const passos: Array<[string, Passo]> = [
    [
      'ecrã de boas-vindas',
      async (j) => {
        await esperar(j, "document.body.dataset.vista === 'boas-vindas'");
        await tirarPrint(j, raiz, 'boas-vindas');
      },
    ],
    [
      'projeto de exemplo aberto',
      async (j) => {
        criarProjeto(path.join(pastaProjeto, 'exemplo'), 'Projeto de exemplo', true);
        j.reload();
        await esperar(j, "document.body.dataset.vista === 'app' && document.querySelector('.cartao-epico')");
        const itens = await naPagina<number>(j, "document.querySelectorAll('.menu-item').length");
        confirmar(itens === 7, `O menu lateral tem ${itens} itens em vez de 7.`);
        const texto = await naPagina<string>(j, "document.querySelector('.conteudo').innerText");
        confirmar(texto.includes('Simulações de crédito'), 'O épico de exemplo não aparece.');
        confirmar(texto.includes('Simular crédito'), 'A jornada de exemplo não aparece.');
        await tirarPrint(j, raiz, 'jornadas');
      },
    ],
    [
      'criar um épico pela interface',
      async (j) => {
        await naPagina(j, "document.getElementById('btn-novo-epico').click()");
        await esperar(j, "document.querySelector('dialog[open] input')");
        await naPagina(
          j,
          `(() => { const d = document.querySelector('dialog[open]'); d.querySelector('input').value = 'Cartões'; d.querySelector('button[type=submit]').click(); })()`,
        );
        await esperar(j, "document.querySelectorAll('.cartao-epico').length === 2");
        confirmar(
          fs.existsSync(path.join(pastaProjeto, 'exemplo', 'epicos', 'cartoes.json')),
          'O ficheiro epicos/cartoes.json não foi criado.',
        );
      },
    ],
    [
      'gravar um bloco no Edge (popup, 6 ações) e guardá-lo',
      async (j) => {
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"gravar\"]').click()");
        await esperar(j, "document.getElementById('btn-gravar')");
        await naPagina(
          j,
          "(() => { document.getElementById('gravar-aplicacao').value = 'simulador'; document.getElementById('gravar-nome').value = 'Simulação gravada'; document.getElementById('btn-gravar').click(); })()",
        );
        await esperar(j, "document.getElementById('gravacao-ativa')", 120_000);
        const p = paginaDoGravador();
        if (!p) throw new Error('O gravador não tem página.');
        const popup = p.locator('#__uat-gravador .popup');
        const numeroDePassos = (): number => estadoGravador().bloco?.passos.length ?? 0;
        /** Confirma o popup e espera que o passo apareça no bloco. */
        const gravar = async (): Promise<void> => {
          const antes = numeroDePassos();
          await popup.getByRole('button', { name: 'Gravar passo' }).click();
          const fim = Date.now() + 20_000;
          while (numeroDePassos() === antes) {
            if (Date.now() > fim) {
              const aviso = await p.locator('#__uat-gravador .aviso').textContent();
              throw new Error(`O passo não foi gravado: ${aviso}`);
            }
            await p.waitForTimeout(100);
          }
          await popup.waitFor({ state: 'detached' });
        };
        const tid = (id: string) => p.locator(`[data-testid="${id}"]`);

        await p.locator('#__uat-gravador .barra').waitFor();
        confirmar(numeroDePassos() === 1, 'O bloco devia começar com o passo "Abrir".');

        // 1. Escolher na lista (dropdown OutSystems), com o valor a vir de uma coluna.
        const lista = tid('ddVariante').locator('select');
        await lista.locator('option').nth(1).waitFor({ state: 'attached', timeout: 60_000 });
        await lista.click();
        await popup.waitFor();
        await popup.locator('input[value="variavel"]').check();
        await popup.getByLabel('Nome da coluna').fill('Variante');
        const opcoes = await popup.getByLabel('Opção de exemplo').locator('option').allTextContents();
        const cp12 = opcoes.find((o) => o.startsWith('CP12'));
        confirmar(cp12, `A lista não tem a variante CP12: ${opcoes.join(' | ')}`);
        await popup.getByLabel('Opção de exemplo').selectOption({ label: cp12 });
        await p.screenshot({ path: path.join(raiz, 'out', 'smoke-gravar-popup.png') }).catch(() => undefined);
        await gravar();
        const escolhida = await lista.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.text ?? '');
        confirmar(escolhida.startsWith('CP12'), `A lista ficou em "${escolhida}".`);

        // 2. Escrever um valor fixo.
        await tid('inpValor').click();
        await popup.waitFor();
        await popup.getByLabel('Texto a escrever').fill('1000');
        await gravar();

        // 3. Clicar no botão.
        await tid('btnSubmeter').click();
        await popup.waitFor();
        await gravar();
        await p.waitForFunction(() => (document.querySelector('[data-testid="resEstado"]')?.textContent ?? '').trim() !== '', undefined, { timeout: 30_000 });

        // 4. Verificar um texto.
        await tid('resEstado').click();
        await popup.waitFor();
        await popup.getByRole('button', { name: 'Verificar' }).click();
        confirmar((await popup.getByLabel('Valor esperado').inputValue()) === 'Aprovado', 'O popup devia sugerir "Aprovado".');
        await gravar();

        // 5. Verificar um número.
        await tid('resPrestacao').click();
        await popup.waitFor();
        await popup.getByRole('button', { name: 'Verificar' }).click();
        await popup.getByLabel('O que verificar').selectOption('numero');
        await gravar();

        // 6. Guardar numa variável.
        await tid('resPedidoId').click();
        await popup.waitFor();
        await popup.getByRole('button', { name: 'Guardar variável' }).click();
        await popup.getByLabel('Nome da variável').fill('PedidoId');
        await gravar();

        await esperar(j, "document.getElementById('contagem-passos')?.textContent === '7 passos'");
        await tirarPrint(j, raiz, 'gravar');
        await p.screenshot({ path: path.join(raiz, 'out', 'smoke-gravar-browser.png') }).catch(() => undefined);

        await naPagina(j, "document.getElementById('btn-guardar-bloco').click()");
        await esperar(j, "document.getElementById('btn-gravar')");
        const ficheiro = path.join(pastaProjeto, 'exemplo', 'blocos', 'simulacao-gravada.json');
        confirmar(fs.existsSync(ficheiro), 'O bloco gravado não foi guardado.');
        const bloco = JSON.parse(fs.readFileSync(ficheiro, 'utf8')) as Bloco;
        confirmar(bloco.passos.length === 7, `O bloco tem ${bloco.passos.length} passos em vez de 7.`);
        const escolher = bloco.passos[1];
        confirmar(
          escolher.acao === 'escolher' && escolher.alvo?.localizadores[0].tipo === 'testid' && escolher.alvo.widget === 'dropdown',
          `O passo da lista não ficou como esperado: ${JSON.stringify(escolher)}`,
        );
        confirmar((bloco.passos[2].alvo?.localizadores.length ?? 0) >= 2, 'O campo Valor devia ter vários localizadores.');
      },
    ],
    [
      'editor de jornada: acrescentar bloco, parâmetro fixo, editar casos',
      async (j) => {
        const lerJornada = (): Jornada =>
          JSON.parse(fs.readFileSync(path.join(pastaProjeto, 'exemplo', 'jornadas', 'simular-credito.json'), 'utf8')) as Jornada;
        const lerCasos = (): ConjuntoCasos =>
          JSON.parse(fs.readFileSync(path.join(pastaProjeto, 'exemplo', 'casos', 'simular-credito.json'), 'utf8')) as ConjuntoCasos;
        /** Muda o valor de um campo como se fosse o utilizador (dispara o evento "change"). */
        const mudar = (seletor: string, valor: string): Promise<void> =>
          naPagina(
            j,
            `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); e.value = ${JSON.stringify(valor)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`,
          );

        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"jornadas\"]').click()");
        await esperar(j, "document.querySelector('[data-jornada=\"simular-credito\"]')");
        await naPagina(j, "document.querySelector('[data-jornada=\"simular-credito\"]').click()");
        await esperar(j, "document.querySelectorAll('#percurso > li').length === 1");

        await naPagina(j, "document.querySelector('[data-adicionar=\"simulacao-gravada\"]').click()");
        await esperar(j, "document.querySelectorAll('#percurso > li').length === 2");
        confirmar(lerJornada().blocos[1]?.blocoId === 'simulacao-gravada', 'O bloco não foi acrescentado à jornada.');

        // Parâmetro: no 2.º bloco, {Variante} passa a ser um valor fixo.
        await mudar('#percurso > li:nth-child(2) .parametro select', 'fixo');
        await mudar('#percurso > li:nth-child(2) .parametro input', 'CP24');
        await esperar(j, "document.querySelector('#percurso > li:nth-child(2) .parametro input')?.value === 'CP24'");
        const parametro = lerJornada().blocos[1]?.parametros?.Variante;
        confirmar(parametro?.tipo === 'fixo' && parametro.valor === 'CP24', `Parâmetro mal gravado: ${JSON.stringify(parametro)}`);

        // Casos: editar uma célula e criar um caso novo.
        await mudar('#tabela-casos tbody tr:first-child td:nth-child(2) input', 'Descrição alterada');
        await naPagina(j, "document.getElementById('btn-novo-caso').click()");
        await esperar(j, "document.querySelectorAll('#tabela-casos tbody tr').length === 7");
        const casos = lerCasos();
        confirmar(casos.casos[0].nome === 'Descrição alterada', 'A descrição do caso não foi gravada.');
        confirmar(casos.casos[6].id === 'TC0007', `O caso novo ficou com o id ${casos.casos[6]?.id}.`);
        await tirarPrint(j, raiz, 'editor');

        // Ver código (.ts) da jornada.
        await naPagina(j, "document.getElementById('btn-ver-codigo').click()");
        await esperar(j, "document.querySelector('dialog[open] pre.codigo')");
        const codigo = await naPagina<string>(j, "document.querySelector('dialog[open] pre.codigo').textContent");
        confirmar(codigo.includes("page.getByTestId('ddVariante').locator('select').selectOption({ label: 'CP24' })"), 'O código não reflete o parâmetro fixo do 2.º bloco.');
        confirmar(codigo.includes('"ID":"TC0001"'), 'O código não inclui os casos.');
        await tirarPrint(j, raiz, 'codigo');
        await naPagina(j, "document.querySelector('dialog[open] .botao-primario').click()");
        await esperar(j, "!document.querySelector('dialog[open]')");
        const larguras = await naPagina<{ conteudo: number; visivel: number }>(
          j,
          "(() => { const c = document.querySelector('.corpo'); return { conteudo: c.scrollWidth, visivel: c.clientWidth }; })()",
        );
        confirmar(larguras.conteudo <= larguras.visivel, `O editor tem deslocamento horizontal (${larguras.conteudo} > ${larguras.visivel}).`);

        // Repor: apagar o caso novo e retirar o 2.º bloco (o exemplo fica como estava para os passos seguintes).
        await naPagina(j, "document.querySelector('#tabela-casos tbody tr:last-child button').click()");
        await esperar(j, "document.querySelectorAll('#tabela-casos tbody tr').length === 6");
        await naPagina(j, "document.querySelector('#percurso > li:nth-child(2) .acoes button:last-child').click()");
        await esperar(j, "document.querySelectorAll('#percurso > li').length === 1");
        confirmar(lerJornada().blocos.length === 1 && lerCasos().casos.length === 6, 'O exemplo não voltou ao estado inicial.');
      },
    ],
    [
      'dados de teste: variável calculada por fórmula, usada como parâmetro da jornada',
      async (j) => {
        const mudar = (seletor: string, valor: string, evento = 'change'): Promise<void> =>
          naPagina(
            j,
            `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); e.value = ${JSON.stringify(valor)}; e.dispatchEvent(new Event('input', { bubbles: true })); if (${JSON.stringify(evento)} === 'change') e.dispatchEvent(new Event('change', { bubbles: true })); })()`,
          );
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"dados\"]').click()");
        await esperar(j, "document.getElementById('btn-nova-variavel')");

        // Experimentar: arredondamento ao par (o achado real do OutSystems) e um erro explicado.
        await mudar('#formula-experimentar', 'TEXTO(ARRED.PAR(86,405; 2); 2) & " / " & ARRED(86,405; 2)', 'input');
        await esperar(j, "document.getElementById('resultado-experimentar').textContent === '= 86,40 / 86,41'");
        await mudar('#formula-experimentar', '{NaoExiste} + 1', 'input');
        await esperar(j, "document.getElementById('resultado-experimentar').dataset.estado === 'erro'");

        // Nova variável calculada.
        await naPagina(j, "document.getElementById('btn-nova-variavel').click()");
        await esperar(j, "document.querySelector('dialog[open] input')");
        await naPagina(j, "(() => { const d = document.querySelector('dialog[open]'); d.querySelector('input').value = 'ComissaoCalculada'; d.querySelector('button[type=submit]').click(); })()");
        await esperar(j, "document.querySelector('[data-variavel=\"ComissaoCalculada\"] input')");
        const formula = 'SE({EstadoEsperado} = "Rejeitado"; 0; ARRED({Valor} * SE({Variante} = "CP12"; 1; SE({Variante} = "CA48"; 2; 3)) / 100; 2))';
        await mudar('[data-variavel="ComissaoCalculada"] input', formula);
        await esperar(j, "document.querySelector('[data-variavel=\"ComissaoCalculada\"] .previsao').textContent === '= 5'");
        await tirarPrint(j, raiz, 'dados');
        const ficheiro = path.join(pastaProjeto, 'exemplo', 'variaveis.json');
        const fim = Date.now() + 5_000;
        while (!(fs.existsSync(ficheiro) && fs.readFileSync(ficheiro, 'utf8').includes('ARRED')) && Date.now() < fim) await new Promise((r) => setTimeout(r, 100));
        confirmar(fs.readFileSync(ficheiro, 'utf8').includes('ARRED'), 'A fórmula não foi guardada em variaveis.json.');

        // No editor: {ComissaoEsperada} passa a vir da variável calculada.
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"editor\"]').click()");
        await esperar(j, "document.querySelectorAll('#percurso > li').length === 1");
        const indice = await naPagina<number>(
          j,
          "[...document.querySelectorAll('#percurso > li:first-child .parametro')].findIndex((p) => p.querySelector('code').textContent === '{ComissaoEsperada}')",
        );
        confirmar(indice >= 0, 'Não encontrei o parâmetro {ComissaoEsperada}.');
        const linha = `#percurso > li:first-child .parametro:nth-of-type(${indice + 1})`;
        await mudar(`${linha} select`, 'coluna');
        await mudar(`${linha} input`, 'ComissaoCalculada');
        await esperar(j, "[...document.querySelectorAll('.editor-lateral code')].some((c) => c.textContent === '{ComissaoCalculada}')");
      },
    ],
    [
      'correr a jornada de exemplo (6 casos, 2 em paralelo, em background) com evidências e relatórios',
      async (j) => {
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"runs\"]').click()");
        await esperar(j, "document.getElementById('btn-correr')");
        await naPagina(j, "(() => { document.getElementById('run-paralelo').value = '2'; document.getElementById('btn-correr').click(); })()");
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"true\"]')", 60_000);
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"false\"]')", 400_000);
        const run = estadoRun();
        if (!run?.pasta) throw new Error('Não há execução.');
        for (const caso of run.casos) {
          const detalhe =
            caso.estado === 'ERRO'
              ? caso.erro?.mensagem
              : caso.diferencas.map((d) => `${d.passo}: esperado ${d.esperado}, obtido ${d.obtido}`).join(' | ');
          console.log(`[smoke]   ${caso.casoId} ${caso.estado} (${(caso.duracaoMs / 1000).toFixed(1)} s) ${detalhe ?? ''}`);
        }
        confirmar(run.casos.length === 6, `A execução tem ${run.casos.length} casos em vez de 6.`);
        const erros = run.casos.filter((c) => c.estado !== 'OK' && c.estado !== 'KO');
        confirmar(erros.length === 0, `Há casos que não chegaram ao fim: ${erros.map((c) => `${c.casoId} ${c.estado}`).join(', ')}`);
        confirmar(run.casos.filter((c) => c.estado === 'OK').length >= 4, 'Esperava pelo menos 4 casos OK.');
        confirmar(run.casos.every((c) => c.variaveis.PedidoId), 'Todos os casos deviam ter guardado {PedidoId}.');
        const calculadas = run.casos.map((c) => c.variaveis.ComissaoCalculada).join(' | ');
        confirmar(calculadas === '5 | 102,5 | 0 | 650 | 25,91 | 0', `As comissões calculadas por fórmula não são as esperadas: ${calculadas}`);

        const pastaRun = path.join(pastaProjeto, 'exemplo', 'execucoes', run.pasta);
        for (const ficheiro of ['run.json', 'run.log', 'relatorio.xlsx', 'relatorio.html']) {
          confirmar(fs.existsSync(path.join(pastaRun, ficheiro)), `Falta ${ficheiro} na pasta da execução.`);
        }
        const pastaCaso = path.join(pastaRun, 'casos', 'simular-credito', 'TC0001');
        const ficheiros = fs.readdirSync(pastaCaso);
        for (const esperado of ['caso.log', 'eventos.jsonl', '01_simular-credito.png', 'trace-1.zip']) {
          confirmar(ficheiros.includes(esperado), `Falta ${esperado} no caso TC0001 (há: ${ficheiros.join(', ')}).`);
        }

        // Abrir os detalhes de um caso e ver o histórico.
        await naPagina(j, "document.querySelector('.caso[data-chave=\"simular-credito/TC0001\"] .caso-topo').click()");
        await esperar(j, "document.querySelector('.caso-detalhe .log-passos li') && document.querySelector('.galeria img')?.src.startsWith('data:image/png')");
        await esperar(j, "document.querySelectorAll('#historico li').length === 1");
        await tirarPrint(j, raiz, 'runs');
        fs.copyFileSync(path.join(pastaCaso, 'caso.log'), path.join(raiz, 'out', 'smoke-caso.log'));
        fs.copyFileSync(path.join(pastaRun, 'relatorio.html'), path.join(raiz, 'out', 'smoke-relatorio.html'));
      },
    ],
    [
      'jornada entre 2 portais: simular no Front Office, validar no Backoffice e confirmar pela API',
      async (j) => {
        const pasta = path.join(pastaProjeto, 'exemplo');
        const mudar = (seletor: string, valor: string): Promise<void> =>
          naPagina(
            j,
            `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); e.value = ${JSON.stringify(valor)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`,
          );
        // Um 3.º caso, rejeitado: o Backoffice e a API só fazem sentido para pedidos aprovados.
        const conjunto = repo.ler(pasta, 'casos', 'simular-e-validar');
        conjunto.casos.push({
          id: 'BO0003',
          nome: 'CP12: acima do máximo (rejeitado, não vai ao Backoffice)',
          etiquetas: ['rejeitado'],
          dados: { Variante: 'CP12', Valor: '20001', EstadoEsperado: 'Rejeitado', MensagemEsperada: 'Valor fora dos limites', PrestacaoEsperada: '0,00', ComissaoEsperada: '0,00', TotalEsperado: '0,00', PontosEsperados: '0', MotivoBO: '' },
        });
        repo.guardar(pasta, 'casos', conjunto);

        // Blocos condicionais, definidos no editor de jornada ("Só se").
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"jornadas\"]').click()");
        await esperar(j, "document.querySelector('[data-jornada=\"simular-e-validar\"]')");
        await naPagina(j, "document.querySelector('[data-jornada=\"simular-e-validar\"]').click()");
        await esperar(j, "document.querySelectorAll('#percurso > li').length === 3");
        await mudar('#percurso > li:nth-child(2) .opcao-condicao input', '{EstadoEsperado} = "Aprovado" e');
        await esperar(j, "!document.querySelector('#percurso > li:nth-child(2) .opcoes-bloco .erro-campo').hidden");
        confirmar(!repo.ler(pasta, 'jornadas', 'simular-e-validar').blocos[1].condicao, 'Uma condição mal escrita não devia ser guardada.');
        await mudar('#percurso > li:nth-child(2) .opcao-condicao input', '{EstadoEsperado} = "Aprovado"');
        await esperar(j, "document.querySelector('#percurso > li:nth-child(2) .opcao-condicao input')?.value === '{EstadoEsperado} = \"Aprovado\"' && document.querySelector('#percurso > li:nth-child(2) .opcoes-bloco .erro-campo').hidden");
        await mudar('#percurso > li:nth-child(3) .opcao-condicao input', '{EstadoEsperado} = "Aprovado"');
        const fimCondicao = Date.now() + 5_000;
        while (!repo.ler(pasta, 'jornadas', 'simular-e-validar').blocos[2].condicao && Date.now() < fimCondicao) await new Promise((r) => setTimeout(r, 100));
        const comCondicoes = repo.ler(pasta, 'jornadas', 'simular-e-validar');
        confirmar(comCondicoes.blocos[1].condicao === '{EstadoEsperado} = "Aprovado"' && Boolean(comCondicoes.blocos[2].condicao), 'As condições dos blocos não foram guardadas.');

        // Editor de passos: condição num passo e "esperar até" numa verificação.
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"gravar\"]').click()");
        await esperar(j, "document.querySelector('[data-editar-bloco=\"validar-no-backoffice\"]')");
        await naPagina(j, "document.querySelector('[data-editar-bloco=\"validar-no-backoffice\"]').click()");
        await esperar(j, "document.querySelectorAll('#editor-passos .lista-passos > li').length === 9");
        await mudar('#editor-passos .lista-passos > li:nth-child(6) input[aria-label^="Condição"]', '{MotivoBO} <> ""');
        await mudar('#editor-passos .lista-passos > li:nth-child(8) input[type="number"]', '12');
        const fimPassos = Date.now() + 5_000;
        while (repo.ler(pasta, 'blocos', 'validar-no-backoffice').passos[7].verificacao?.esperaSeg !== 12 && Date.now() < fimPassos) await new Promise((r) => setTimeout(r, 100));
        const editado = repo.ler(pasta, 'blocos', 'validar-no-backoffice');
        confirmar(editado.passos[5].condicao === '{MotivoBO} <> ""' && editado.passos[7].verificacao?.esperaSeg === 12, 'As alterações aos passos não foram guardadas.');
        await tirarPrint(j, raiz, 'passos');

        // "Encontrar linha na tabela": gravar, no Backoffice, uma verificação na linha escolhida pelo número do pedido.
        await naPagina(
          j,
          "(() => { document.getElementById('gravar-aplicacao').value = 'backoffice'; document.getElementById('gravar-nome').value = 'Verificar na tabela'; document.getElementById('btn-gravar').click(); })()",
        );
        await esperar(j, "document.getElementById('gravacao-ativa')", 120_000);
        const p = paginaDoGravador();
        if (!p) throw new Error('O gravador não tem página.');
        const popup = p.locator('#__uat-gravador .popup');
        const primeiraLinha = p.locator('[data-testid="tblPedidos"] tbody tr').first();
        await primeiraLinha.waitFor({ timeout: 60_000 });
        const idDaLinha = ((await primeiraLinha.locator('td').first().textContent()) ?? '').trim();
        await primeiraLinha.locator('td').nth(4).click();
        await popup.waitFor();
        await popup.getByLabel('Escolher a linha pelo conteúdo').check();
        await popup.getByLabel('De onde vem o texto da linha').selectOption('variavel');
        await popup.getByLabel('Nome da coluna da linha').fill('PedidoId');
        confirmar((await popup.getByLabel('Texto da linha neste momento').inputValue()) === idDaLinha, 'O popup devia sugerir o número do pedido como texto da linha.');
        await popup.getByRole('button', { name: 'Verificar' }).click();
        await popup.getByLabel('Valor esperado').fill('Validado');
        await p.screenshot({ path: path.join(raiz, 'out', 'smoke-gravar-tabela.png') }).catch(() => undefined);
        await popup.getByRole('button', { name: 'Gravar passo' }).click();
        const fimTabela = Date.now() + 20_000;
        while ((estadoGravador().bloco?.passos.length ?? 0) < 2) {
          if (Date.now() > fimTabela) throw new Error(`O passo da tabela não foi gravado: ${await p.locator('#__uat-gravador .aviso').textContent()}`);
          await p.waitForTimeout(100);
        }
        await naPagina(j, "document.getElementById('btn-guardar-bloco').click()");
        await esperar(j, "document.getElementById('btn-gravar')");
        const naTabela = repo.ler(pasta, 'blocos', 'verificar-na-tabela').passos[1];
        confirmar(
          naTabela.alvo?.linha?.valor.tipo === 'variavel' && naTabela.alvo.linha.valor.nome === 'PedidoId' && (naTabela.alvo.localizadores[0]?.valor ?? '').startsWith(':scope > td:nth-child(5)') && naTabela.alvo.descricao === 'Coluna "Decisão"',
          `O passo da tabela não ficou como esperado: ${JSON.stringify(naTabela)}`,
        );
        const comTabela = repo.ler(pasta, 'jornadas', 'simular-e-validar');
        comTabela.blocos.push({ id: 'b4', blocoId: 'verificar-na-tabela', condicao: '{EstadoEsperado} = "Aprovado"' });
        repo.guardar(pasta, 'jornadas', comTabela);

        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"runs\"]').click()");
        await esperar(j, "document.getElementById('btn-correr') && document.querySelector('#run-ambito option[value=\"jornada:simular-e-validar\"]')");
        await naPagina(
          j,
          "(() => { const a = document.getElementById('run-ambito'); a.value = 'jornada:simular-e-validar'; a.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('run-paralelo').value = '2'; document.getElementById('btn-correr').click(); })()",
        );
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"true\"]')", 60_000);
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"false\"]')", 300_000);
        const run = estadoRun();
        if (!run?.pasta) throw new Error('Não há execução.');
        for (const caso of run.casos) {
          const detalhe = caso.erro
            ? `${caso.erro.bloco} › ${caso.erro.passo}: ${caso.erro.mensagem}`
            : caso.diferencas.map((d) => `${d.bloco} › ${d.passo}: esperado ${d.esperado}, obtido ${d.obtido}`).join(' | ');
          console.log(`[smoke]   ${caso.casoId} ${caso.estado} (${(caso.duracaoMs / 1000).toFixed(1)} s) ${detalhe}`);
        }
        confirmar(run.casos.length === 3 && run.casos.every((c) => c.estado === 'OK'), 'Os 3 casos da jornada entre portais deviam dar OK.');
        const saltados = run.casos[2].passos.filter((p) => p.estado === 'ignorado' && p.descricao === 'Bloco não executado').map((p) => p.bloco);
        confirmar(saltados.join(',') === 'Validar pedido no Backoffice,Consultar pedido pela API,Verificar na tabela', `No caso rejeitado, os blocos condicionais deviam ser saltados: ${saltados.join(',')}`);
        const linhaDaTabela = run.casos[0].passos.find((p) => p.bloco === 'Verificar na tabela' && p.descricao.startsWith('Verificar'));
        confirmar(
          linhaDaTabela?.estado === 'ok' && (linhaDaTabela.detalhe ?? '').includes(`na linha "${run.casos[0].variaveis.PedidoId}"`),
          `A verificação na linha da tabela não correu como esperado: ${JSON.stringify(linhaDaTabela)}`,
        );
        confirmar(!run.casos[0].passos.some((p) => p.estado === 'ignorado'), 'No caso aprovado não devia haver nada saltado.');
        const pastaCaso = path.join(pastaProjeto, 'exemplo', 'execucoes', run.pasta, 'casos', 'simular-e-validar', 'BO0001');
        for (const esperado of ['01_simular-credito.png', '02_validar-pedido-no-backoffice.png', path.join('api', '03_consultar-pedido-pela-api.response.json')]) {
          confirmar(fs.existsSync(path.join(pastaCaso, esperado)), `Falta a evidência ${esperado}.`);
        }
        fs.copyFileSync(path.join(pastaCaso, '02_validar-pedido-no-backoffice.png'), path.join(raiz, 'out', 'smoke-backoffice.png'));
        fs.copyFileSync(path.join(pastaCaso, 'caso.log'), path.join(raiz, 'out', 'smoke-caso-2-portais.log'));
      },
    ],
    [
      'verificação antes de correr e controlo da execução (passo a passo, continuar, saltar um caso)',
      async (j) => {
        const pasta = path.join(pastaProjeto, 'exemplo');
        const definir = (seletor: string, valor: string): Promise<void> =>
          naPagina(
            j,
            `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); e.value = ${JSON.stringify(valor)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`,
          );
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"runs\"]').click()");
        await esperar(j, "document.getElementById('btn-verificar') && !document.getElementById('btn-correr').disabled");
        await definir('#run-ambito', 'jornada:simular-credito');

        // Com uma coluna em falta nos casos, a verificação avisa e "Correr" não arranca sozinho.
        const casos = repo.ler(pasta, 'casos', 'simular-credito');
        repo.guardar(pasta, 'casos', { ...casos, colunas: casos.colunas.filter((c) => c !== 'Valor') });
        await naPagina(j, "document.getElementById('btn-verificar').click()");
        await esperar(j, "document.querySelector('#resultado-verificacao[data-estado=\"erro\"]')", 40_000);
        const problemas = await naPagina<string>(j, "document.getElementById('resultado-verificacao').innerText");
        confirmar(problemas.includes('Falta a coluna "Valor" nos casos'), `A verificação devia apontar a coluna em falta: ${problemas}`);
        await naPagina(j, "document.getElementById('btn-correr').click()");
        await esperar(j, "document.getElementById('btn-correr-na-mesma')", 40_000);
        confirmar(!estadoRun()?.ativo, 'Com problemas, a execução não devia arrancar sozinha.');
        await tirarPrint(j, raiz, 'verificacao');
        repo.guardar(pasta, 'casos', casos);
        await naPagina(j, "document.getElementById('btn-verificar').click()");
        await esperar(j, "document.querySelector('#resultado-verificacao[data-estado=\"ok\"]')", 40_000);

        // Passo a passo: a execução pára antes de cada passo e só avança com "Continuar".
        await naPagina(j, "(() => { document.getElementById('run-casos').value = 'TC0001, TC0002, TC0003'; document.getElementById('run-velocidade').value = 'passo'; document.getElementById('btn-correr').click(); })()");
        await esperar(j, "document.querySelector('#run-progresso[data-pausa=\"true\"]') && document.getElementById('btn-continuar')", 90_000);
        const passosFeitos = (): number => estadoRun()?.casos[0].passos.length ?? 0;
        confirmar(passosFeitos() === 0, 'Em passo a passo, nada devia correr antes do primeiro "Continuar".');
        await naPagina(j, "document.getElementById('btn-continuar').click()");
        const fimPasso = Date.now() + 60_000;
        while (!(estadoRun()?.emPausa && passosFeitos() === 1)) {
          if (Date.now() > fimPasso) throw new Error(`Depois de "Continuar" devia correr 1 passo e voltar a parar (passos: ${passosFeitos()}, em pausa: ${estadoRun()?.emPausa}).`);
          await new Promise((r) => setTimeout(r, 100));
        }
        await new Promise((r) => setTimeout(r, 600));
        confirmar(passosFeitos() === 1, 'Em pausa, não devia avançar sozinho.');

        // Saltar o 2.º caso (ainda por correr) pela interface.
        await esperar(j, "document.querySelector('.caso[data-chave=\"simular-credito/TC0002\"] .botao-saltar')");
        await tirarPrint(j, raiz, 'controlo');
        await naPagina(j, "document.querySelector('.caso[data-chave=\"simular-credito/TC0002\"] .botao-saltar').click()");

        // O resto dos passos: "Continuar" sempre que parar.
        const fimRun = Date.now() + 240_000;
        while (estadoRun()?.ativo) {
          if (Date.now() > fimRun) throw new Error('A execução passo a passo não terminou.');
          if (estadoRun()?.emPausa) continuarRun();
          await new Promise((r) => setTimeout(r, 100));
        }
        const estados = (estadoRun()?.casos ?? []).map((c) => `${c.casoId}=${c.estado}`).join(', ');
        console.log(`[smoke]   ${estados}`);
        confirmar(estados === 'TC0001=OK, TC0002=SALTADO, TC0003=OK', `Resultado inesperado da execução passo a passo: ${estados}`);
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"false\"]') && document.querySelector('.caso[data-estado=\"SALTADO\"]')");
      },
    ],
    [
      '"onde é usado" de um bloco e reparar um localizador com um clique',
      async (j) => {
        const pasta = path.join(pastaProjeto, 'exemplo');
        // "Onde é usado" na lista de blocos do ecrã Jornadas, com ligação para o editor.
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"jornadas\"]').click()");
        await esperar(j, "document.querySelector('[data-usos=\"simular-credito\"]')");
        await naPagina(j, "document.querySelector('[data-usos=\"simular-credito\"]').click()");
        await esperar(j, "document.querySelector('dialog[open] .lista-usos')");
        const usos = await naPagina<string>(j, "document.querySelector('dialog[open]').innerText");
        confirmar(usos.includes('Simular crédito') && usos.includes('Simular e validar no Backoffice'), `"Onde é usado" devia mostrar as 2 jornadas: ${usos}`);
        await tirarPrint(j, raiz, 'onde-e-usado');
        await naPagina(j, "document.querySelector('dialog[open] [data-uso=\"simular-e-validar\"] .item-nome').click()");
        await esperar(j, "document.getElementById('editor-jornada')?.value === 'simular-e-validar'");

        // O localizador preferido do campo Valor "deixa de funcionar" (como se o ecrã tivesse mudado).
        const bloco = repo.ler(pasta, 'blocos', 'simular-credito');
        const alvo = bloco.passos.find((p) => p.id === 'p3')?.alvo;
        if (!alvo) throw new Error('O passo p3 do exemplo não tem alvo.');
        alvo.localizadores = [{ tipo: 'testid', valor: 'inpValorAntigo' }, ...alvo.localizadores];
        repo.guardar(pasta, 'blocos', bloco);

        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"runs\"]').click()");
        await esperar(j, "document.getElementById('btn-correr') && !document.getElementById('btn-correr').disabled");
        await naPagina(
          j,
          "(() => { const a = document.getElementById('run-ambito'); a.value = 'jornada:simular-credito'; a.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('run-casos').value = 'TC0001'; document.getElementById('run-velocidade').value = 'normal'; document.getElementById('btn-correr').click(); })()",
        );
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"true\"]')", 60_000);
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"false\"]')", 180_000);
        const caso = estadoRun()?.casos[0];
        console.log(`[smoke]   ${caso?.casoId} ${caso?.estado} ${caso?.erro?.mensagem ?? ''}`);
        confirmar(caso?.estado === 'OK', 'Com o localizador preferido estragado, a alternativa devia ter funcionado (OK).');
        confirmar(caso?.reparos?.length === 1 && caso.reparos[0].usado.valor === 'inpValor', `Devia haver 1 sugestão de reparo: ${JSON.stringify(caso?.reparos)}`);

        // Reparar com um clique.
        await esperar(j, "document.querySelector('#reparos .botao-reparar:not([disabled])')");
        await tirarPrint(j, raiz, 'reparar');
        await naPagina(j, "document.querySelector('#reparos .botao-reparar').click()");
        await esperar(j, "document.querySelector('#reparos .botao-reparar').textContent === 'Reparado'");
        const reparado = repo.ler(pasta, 'blocos', 'simular-credito').passos.find((p) => p.id === 'p3')?.alvo?.localizadores.map((l) => l.valor);
        confirmar(reparado?.join(',') === 'inpValor,inpValorAntigo', `O localizador não foi reparado: ${reparado?.join(',')}`);
      },
    ],
    [
      'mapa de execução ao vivo: miniaturas dos workers, cores por bloco e as 3 vistas',
      async (j) => {
        const pasta = path.join(pastaProjeto, 'exemplo');
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"mapa\"]').click()");
        await esperar(j, "document.getElementById('mapa-run') && document.querySelector('#mapa[data-vista=\"jornadas\"]')");
        // A execução começa com o mapa já aberto: o mapa tem de a apanhar sozinho.
        await iniciarRun(pasta, { jornadaIds: ['simular-e-validar'] }, { canal: 'msedge', visivel: false, paralelo: 2 });
        await esperar(j, "document.querySelector('.mapa-jornada[data-jornada=\"simular-e-validar\"] .no[data-estado=\"a-correr\"]')", 60_000);
        await esperar(j, "document.querySelector('#workers .worker img')", 60_000);
        const workers = await naPagina<number>(j, "document.querySelectorAll('#workers .worker').length");
        confirmar(workers === 2, `Deviam aparecer 2 workers (apareceram ${workers}).`);
        confirmar(await naPagina<boolean>(j, "Boolean(document.getElementById('mapa-pausar'))"), 'O mapa devia ter o botão Pausar durante a execução.');
        const escolhida = await naPagina<string>(j, "document.getElementById('mapa-run').selectedOptions[0]?.textContent ?? ''");
        confirmar(escolhida.startsWith(estadoRun()?.id + ' '), `A lista devia mostrar a execução nova (${estadoRun()?.id}): ${escolhida}`);
        await new Promise((r) => setTimeout(r, 4_000));
        await tirarPrint(j, raiz, 'mapa-ao-vivo');
        const miniatura = await naPagina<string>(j, "document.querySelector('#workers .worker img')?.src ?? ''");
        if (miniatura.startsWith('data:image/jpeg;base64,')) fs.writeFileSync(path.join(raiz, 'out', 'smoke-miniatura.jpg'), Buffer.from(miniatura.split(',')[1], 'base64'));

        const run = await esperarFimDoRun(300_000);
        if (!run || run.ativo) throw new Error('A execução do mapa não terminou.');
        console.log(`[smoke]   ${run.casos.map((c) => `${c.casoId}=${c.estado} [${(c.blocos ?? []).join(',')}] w${c.worker}`).join('; ')}`);
        confirmar(run.casos.every((c) => c.estado === 'OK'), 'Os 3 casos deviam dar OK.');
        confirmar(run.casos[2].blocos?.join(',') === 'ok,ignorado,ignorado,ignorado', `Estados dos blocos do caso rejeitado errados: ${run.casos[2].blocos?.join(',')}`);
        confirmar(run.jornadas?.[0]?.blocos.length === 4, 'A execução devia guardar a fotografia da jornada (4 blocos).');
        await esperar(j, "document.querySelector('#mapa-resumo[data-ativo=\"false\"]') && !document.querySelector('#workers .worker')");
        const cores = await naPagina<string>(j, "[...document.querySelectorAll('.mapa-jornada[data-jornada=\"simular-e-validar\"] .no')].map((n) => n.dataset.estado).join(',')");
        confirmar(cores === 'ok,ok,ok,ok', `As cores dos blocos no fim deviam ser todas OK: ${cores}`);

        await naPagina(j, "document.querySelector('.separador[data-vista=\"casos\"]').click()");
        await esperar(j, "document.querySelector('.mapa-matriz[data-jornada=\"simular-e-validar\"]')");
        const celulas = await naPagina<string>(j, "[...document.querySelectorAll('tr[data-caso=\"simular-e-validar/BO0003\"] .celula')].map((c) => c.dataset.estado).join(',')");
        confirmar(celulas === 'ok,ignorado,ignorado,ignorado', `Matriz do caso rejeitado errada: ${celulas}`);
        await tirarPrint(j, raiz, 'mapa-casos');
        await naPagina(j, "document.querySelector('.separador[data-vista=\"epicos\"]').click()");
        await esperar(j, "document.querySelector('.no[data-epico=\"Simulações de crédito\"][data-estado=\"ok\"]') && document.querySelector('.no[data-no-jornada=\"simular-e-validar\"]')");
        await naPagina(j, "document.querySelector('.separador[data-vista=\"jornadas\"]').click()");
        await esperar(j, "document.querySelector('.mapa-jornada .no[data-bloco=\"0\"]')");
        const faixa = await naPagina<string>(j, "getComputedStyle(document.querySelector('.mapa-jornada .no[data-bloco=\"0\"]'), '::after').backgroundColor");
        confirmar(faixa === 'rgb(47, 107, 237)', `O bloco devia ter a faixa com a cor da aplicação (obtido ${faixa}).`);
        await tirarPrint(j, raiz, 'mapa');
      },
    ],
    [
      'blocos de API: aplicação, perfil OAuth 2.0 com segredo no cofre, testar um bloco e correr uma jornada só de API',
      async (j) => {
        if (!fs.existsSync(SERVIDOR_TESTE)) {
          console.log('[smoke]   (saltado: o servidor de teste não está em ' + SERVIDOR_TESTE + ')');
          return;
        }
        const porta = 4318;
        const base = `http://localhost:${porta}`;
        // O servidor de teste vive fora do projeto; aqui só é arrancado (o Electron também sabe correr scripts Node).
        servidor = spawn(process.execPath, [SERVIDOR_TESTE, String(porta)], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'ignore' });
        for (let i = 0; ; i++) {
          if (await fetch(base).then((r) => r.ok, () => false)) break;
          if (i > 60) throw new Error('O servidor de teste não arrancou.');
          await new Promise((r) => setTimeout(r, 100));
        }
        const pasta = path.join(pastaProjeto, 'exemplo');
        const dialogo = (valores: Record<string, string>): Promise<void> =>
          naPagina(
            j,
            `(() => { const d = document.querySelector('dialog[open]'); for (const [id, v] of Object.entries(${JSON.stringify(valores)})) d.querySelector('#form-' + CSS.escape(id)).value = v; d.querySelector('button[type=submit]').click(); })()`,
          );
        const escrever = (seletor: string, valor: string, evento = 'input'): Promise<void> =>
          naPagina(
            j,
            `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); e.value = ${JSON.stringify(valor)}; e.dispatchEvent(new Event(${JSON.stringify(evento)}, { bubbles: true })); })()`,
          );

        // 1. Aplicação do tipo API.
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"jornadas\"]').click()");
        await esperar(j, "document.getElementById('btn-nova-aplicacao')");
        await naPagina(j, "document.getElementById('btn-nova-aplicacao').click()");
        await esperar(j, "document.querySelector('dialog[open] #form-url')");
        await dialogo({ nome: 'API de teste', tipo: 'API', url: base });
        await esperar(j, "!document.querySelector('dialog[open]')");
        confirmar(repo.existe(pasta, 'aplicacoes', 'api-de-teste'), 'A aplicação de API não foi criada.');

        // 2. Perfil OAuth 2.0: o segredo vai para o cofre, nunca para o JSON do projeto.
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"api\"]').click()");
        await esperar(j, "document.getElementById('btn-novo-perfil')");
        await naPagina(j, "document.getElementById('btn-novo-perfil').click()");
        await esperar(j, "document.querySelector('dialog[open] #form-tipo')");
        await dialogo({ nome: 'OAuth de teste', tipo: 'oauth2-cliente' });
        await esperar(j, "document.querySelector('dialog[open] #form-urlToken')");
        await dialogo({ urlToken: `${base}/oauth/token`, clientId: 'uat-cliente', 'segredo:clientSecret': 'segredo-de-teste' });
        await esperar(j, "!document.querySelector('dialog[open]') && document.querySelector('.item-perfil')");
        const perfilJson = fs.readFileSync(path.join(pasta, 'perfis', 'oauth-de-teste.json'), 'utf8');
        confirmar(!perfilJson.includes('segredo-de-teste'), 'O segredo ficou escrito no JSON do perfil!');
        confirmar(segredosPreenchidos(pasta, ['oauth-de-teste.clientSecret'])['oauth-de-teste.clientSecret'], 'O segredo não ficou no cofre.');
        await esperar(j, "!document.querySelector('.item-perfil .aviso-pequeno')");

        // 3. Bloco "Criar cliente": construir, testar e guardar.
        repo.gravarVariaveis(pasta, [...repo.lerVariaveis(pasta), { nome: 'NifCliente', formula: 'NIF()' }]);
        await naPagina(j, "document.getElementById('btn-novo-bloco-api').click()");
        await esperar(j, "document.querySelector('dialog[open] input')");
        await naPagina(j, "(() => { const d = document.querySelector('dialog[open]'); d.querySelector('input').value = 'Criar cliente'; d.querySelector('button[type=submit]').click(); })()");
        await esperar(j, "document.getElementById('api-nome')?.value === 'Criar cliente'");
        await escrever('#api-metodo', 'POST', 'change');
        await escrever('#api-url', '/api/clientes');
        await escrever('#api-perfil', 'oauth-de-teste', 'change');
        await escrever('#api-tipo-corpo', 'json', 'change');
        await escrever('#api-corpo', '{ "nome": "Cliente {TESTE}", "nif": "{NifCliente}", "email": "qa+{TESTE}@exemplo.pt" }');
        await escrever('#v-esperado-0', '201');
        await naPagina(j, "document.getElementById('btn-novo-guardar').click()");
        await escrever('#g-variavel-0', 'ClienteId');
        await escrever('#g-caminho-0', 'id');
        await naPagina(j, "document.getElementById('btn-testar-api').click()");
        await esperar(j, "document.getElementById('estado-http') || document.getElementById('erro-api')", 40_000);
        const teste = await naPagina<string>(j, "document.getElementById('resultado-api').innerText");
        confirmar(teste.includes('HTTP 201') && teste.includes('todas as verificações OK') && /\{ClienteId\} = \d+/.test(teste), `O teste do bloco não correu bem: ${teste.slice(0, 300)}`);
        confirmar(teste.includes('Bearer ***') || !teste.includes('Bearer '), 'O token aparece no ecrã!');
        await tirarPrint(j, raiz, 'api');
        await naPagina(j, "document.getElementById('btn-guardar-api').click()");
        const fimGuardar = Date.now() + 5_000;
        while (repo.ler(pasta, 'blocos', 'criar-cliente').pedido?.metodo !== 'POST' && Date.now() < fimGuardar) await new Promise((r) => setTimeout(r, 100));
        const guardado = repo.ler(pasta, 'blocos', 'criar-cliente');
        confirmar(guardado.pedido?.metodo === 'POST' && guardado.pedido.guardar[0]?.variavel === 'ClienteId', 'O bloco de API não foi guardado como esperado.');

        // 4. Jornada só de API (criar + consultar), com 2 casos; o 2.º tem um valor esperado errado de propósito.
        repo.guardar(pasta, 'blocos', {
          id: 'consultar-cliente',
          nome: 'Consultar cliente',
          tipo: 'API',
          aplicacaoId: 'api-de-teste',
          passos: [],
          pedido: {
            metodo: 'GET',
            url: '/api/clientes/{ClienteId}',
            parametros: [],
            cabecalhos: [],
            tipoCorpo: 'nenhum',
            corpo: '',
            perfilId: 'oauth-de-teste',
            verificacoes: [
              { id: 'v1', alvo: 'estado', operador: 'igual', esperado: '200' },
              { id: 'v2', alvo: 'corpo', caminho: 'nif', operador: 'igual', esperado: '{NifCliente}' },
              { id: 'v3', alvo: 'corpo', caminho: 'estado', operador: 'igual', esperado: '{EstadoEsperado}' },
              { id: 'v4', alvo: 'corpo', caminho: 'saldo', operador: 'igual', esperado: '0,00' },
            ],
            guardar: [],
          },
        });
        repo.guardar(pasta, 'jornadas', {
          id: 'clientes-por-api',
          nome: 'Clientes por API',
          epicoId: 'simulacoes',
          etiquetas: ['api'],
          blocos: [
            { id: 'b1', blocoId: 'criar-cliente' },
            { id: 'b2', blocoId: 'consultar-cliente' },
          ],
        });
        repo.guardar(pasta, 'casos', {
          id: 'clientes-por-api',
          colunas: ['EstadoEsperado'],
          casos: [
            { id: 'API001', nome: 'Cliente novo fica ativo', etiquetas: [], dados: { EstadoEsperado: 'Ativo' } },
            { id: 'API002', nome: 'Valor esperado errado (tem de dar KO)', etiquetas: [], dados: { EstadoEsperado: 'Suspenso' } },
          ],
        });
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"runs\"]').click()");
        await esperar(j, "document.getElementById('btn-correr') && document.querySelector('#run-ambito option[value=\"jornada:clientes-por-api\"]')");
        await escrever('#run-ambito', 'jornada:clientes-por-api', 'change');
        await naPagina(j, "document.getElementById('btn-correr').click()");
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"true\"]')", 60_000);
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"false\"]')", 120_000);
        const run = estadoRun();
        if (!run?.pasta) throw new Error('Não há execução.');
        for (const caso of run.casos) {
          console.log(`[smoke]   ${caso.casoId} ${caso.estado} ${caso.erro?.mensagem ?? caso.diferencas.map((d) => `${d.passo}: obtido ${d.obtido}`).join(' | ')}`);
        }
        confirmar(run.casos.map((c) => c.estado).join(',') === 'OK,KO', `Esperava OK,KO e obtive ${run.casos.map((c) => c.estado).join(',')}.`);
        confirmar(run.casos[1].diferencas.length === 1 && run.casos[1].diferencas[0].obtido === 'Ativo', 'A diferença do caso API002 não é a esperada.');
        const pastaApi = path.join(pasta, 'execucoes', run.pasta, 'casos', 'clientes-por-api', 'API001', 'api');
        const pedidoGravado = fs.readFileSync(path.join(pastaApi, '01_criar-cliente.request.json'), 'utf8');
        confirmar(pedidoGravado.includes('"Authorization": "Bearer ***"'), 'O pedido gravado devia ter o token mascarado.');
        confirmar(fs.existsSync(path.join(pastaApi, '02_consultar-cliente.response.json')), 'Falta a resposta gravada do 2.º bloco.');
        const tudo = fs.readdirSync(path.join(pasta, 'execucoes', run.pasta), { recursive: true, encoding: 'utf8' })
          .filter((f) => /\.(json|log|jsonl|html)$/.test(f))
          .map((f) => fs.readFileSync(path.join(pasta, 'execucoes', run.pasta ?? '', f), 'utf8'))
          .join('\n');
        confirmar(!tudo.includes('segredo-de-teste'), 'O client secret aparece nos ficheiros da execução!');

        // "Repetir só KO/ERRO": corre outra vez só o caso que falhou.
        await esperar(j, "document.getElementById('btn-repetir-falhados')");
        await naPagina(j, "document.getElementById('btn-repetir-falhados').click()");
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"true\"]')", 60_000);
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"false\"]')", 120_000);
        const repetida = estadoRun();
        confirmar(
          repetida?.id !== run.id && repetida?.casos.length === 1 && repetida.casos[0].casoId === 'API002' && repetida.casos[0].estado === 'KO',
          `"Repetir só KO/ERRO" devia correr só o API002: ${repetida?.casos.map((c) => `${c.casoId}=${c.estado}`).join(', ')}`,
        );

        // 5. "Esperar até" e limpeza: um bloco repete o pedido até desistir (KO), outro dá erro,
        //    e o bloco de limpeza (apagar o cliente) corre na mesma.
        const pedidoBase = { parametros: [], cabecalhos: [], tipoCorpo: 'nenhum' as const, corpo: '', perfilId: 'oauth-de-teste', guardar: [] };
        repo.guardar(pasta, 'blocos', {
          id: 'esperar-estado',
          nome: 'Esperar que o cliente fique suspenso',
          tipo: 'API',
          aplicacaoId: 'api-de-teste',
          passos: [],
          pedido: {
            ...pedidoBase,
            metodo: 'GET',
            url: '/api/clientes/{ClienteId}',
            repetir: { intervaloSeg: 1, limiteSeg: 3 },
            verificacoes: [{ id: 'v1', alvo: 'corpo', caminho: 'estado', operador: 'igual', esperado: 'Suspenso' }],
          },
        });
        repo.guardar(pasta, 'blocos', {
          id: 'pedido-com-erro',
          nome: 'Pedido que falha',
          tipo: 'API',
          aplicacaoId: 'api-de-teste',
          passos: [],
          pedido: { ...pedidoBase, metodo: 'GET', url: '/api/erro/500', verificacoes: [], guardar: [{ variavel: 'NaoVaiExistir', caminho: 'id' }] },
        });
        repo.guardar(pasta, 'blocos', {
          id: 'apagar-cliente',
          nome: 'Apagar cliente',
          tipo: 'API',
          aplicacaoId: 'api-de-teste',
          passos: [],
          pedido: { ...pedidoBase, metodo: 'DELETE', url: '/api/clientes/{ClienteId}', verificacoes: [{ id: 'v1', alvo: 'estado', operador: 'igual', esperado: '204' }] },
        });
        repo.guardar(pasta, 'jornadas', {
          id: 'limpeza-por-api',
          nome: 'Limpeza por API',
          epicoId: 'simulacoes',
          etiquetas: ['api'],
          blocos: [
            { id: 'b1', blocoId: 'criar-cliente' },
            { id: 'b2', blocoId: 'esperar-estado' },
            { id: 'b3', blocoId: 'consultar-cliente', condicao: '{Saltar} <> "S"' },
            { id: 'b4', blocoId: 'pedido-com-erro' },
            { id: 'b5', blocoId: 'consultar-cliente' },
            { id: 'b6', blocoId: 'apagar-cliente', sempre: true },
          ],
        });
        repo.guardar(pasta, 'casos', { id: 'limpeza-por-api', colunas: ['Saltar', 'EstadoEsperado'], casos: [{ id: 'LIMP01', etiquetas: [], dados: { Saltar: 'S', EstadoEsperado: 'Ativo' } }] });
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"jornadas\"]').click()");
        await esperar(j, "document.querySelector('[data-jornada=\"limpeza-por-api\"]')");
        await naPagina(j, "document.querySelector('.menu-item[data-ecra=\"runs\"]').click()");
        await esperar(j, "document.getElementById('btn-correr') && document.querySelector('#run-ambito option[value=\"jornada:limpeza-por-api\"]')");
        await escrever('#run-ambito', 'jornada:limpeza-por-api', 'change');
        await naPagina(j, "document.getElementById('btn-correr').click()");
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"true\"]')", 60_000);
        await esperar(j, "document.querySelector('#run-atual[data-ativo=\"false\"]')", 120_000);
        const limpeza = estadoRun()?.casos[0];
        if (!limpeza) throw new Error('Não há execução da jornada de limpeza.');
        const linhas = limpeza.passos.map((p) => `${p.estado} | ${p.bloco} | ${p.descricao} | ${p.detalhe ?? ''}`);
        console.log(`[smoke]   ${limpeza.casoId} ${limpeza.estado}: ${limpeza.erro?.mensagem ?? ''}`);
        const tem = (padrao: RegExp): boolean => linhas.some((l) => padrao.test(l));
        confirmar(limpeza.estado === 'ERRO' && limpeza.erro?.bloco === 'Pedido que falha', `Esperava ERRO no bloco "Pedido que falha": ${limpeza.estado} ${limpeza.erro?.bloco}`);
        confirmar(tem(/^ok \| Esperar que o cliente fique suspenso \| GET .* \(à [3-5]\.ª tentativa\)/), `O "esperar até" não repetiu o pedido como esperado:\n${linhas.join('\n')}`);
        confirmar(tem(/^ko \| Esperar que o cliente fique suspenso \| Verificar: Campo estado igual a Suspenso/), 'O "esperar até" devia acabar em KO.');
        confirmar(tem(/^ignorado \| Consultar cliente \| Bloco não executado \| a condição não se cumpre/), 'O bloco condicional devia ter sido saltado.');
        confirmar(tem(/^ok \| Apagar cliente \| DELETE .*HTTP 204/), `O bloco de limpeza devia ter corrido depois do erro:\n${linhas.join('\n')}`);
        confirmar(linhas.filter((l) => l.includes('| Consultar cliente |')).length === 1, 'O bloco depois do erro (sem "corre sempre") não devia ter corrido.');
        confirmar(limpeza.erro?.porExecutar.join(',') === 'Consultar cliente', `Blocos por executar errados: ${limpeza.erro?.porExecutar.join(',')}`);

        // Não deixar o segredo de teste no cofre deste PC.
        apagarSegredosDoPerfil(pasta, 'oauth-de-teste');
      },
    ],
  ];

  try {
    await new Promise<void>((resolve) => janela.webContents.once('did-finish-load', () => resolve()));
    // A app POC "adormece" quando não é usada e a 1.ª resposta pode ser um erro: acordá-la antes de começar.
    for (let tentativa = 1; tentativa <= 6; tentativa++) {
      const acordada = await fetch(`${URL_APP_POC}/rest/PedidosAPI/variantes`, { signal: AbortSignal.timeout(60_000) }).then((r) => r.ok, () => false);
      if (acordada) break;
      console.log(`[smoke] a app POC ainda não responde (tentativa ${tentativa})`);
      await new Promise((r) => setTimeout(r, 5_000));
    }
    for (const [nome, passo] of passos) {
      await passo(janela);
      console.log(`[smoke] OK: ${nome}`);
    }
    codigo = 0;
  } catch (erro) {
    console.log(`[smoke] ERRO: ${erro instanceof Error ? erro.message : String(erro)}`);
    await tirarPrint(janela, raiz, 'erro');
    // Se o erro foi durante a gravação, guarda também o que o browser estava a mostrar.
    const pagina = paginaDoGravador();
    if (pagina) {
      await pagina.screenshot({ path: path.join(raiz, 'out', 'smoke-erro-browser.png') }).catch(() => undefined);
      const texto = await pagina.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '');
      console.log(`[smoke] O browser mostrava (${pagina.url()}): ${texto.replace(/\s+/g, ' ')}`);
    }
  } finally {
    await terminarGravacao(false);
    servidor?.kill();
    fs.rmSync(pastaProjeto, { recursive: true, force: true });
    app.exit(codigo);
  }
}
