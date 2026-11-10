// Teste rápido automático (npm run smoke): usa a janela como um utilizador,
// escreve o resultado na consola e fecha tudo. Os prints ficam em out/.
import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Bloco, ConjuntoCasos, Jornada } from '../shared/modelo';
import { estadoRun } from './executor/execucao';
import { estadoGravador, paginaDoGravador, terminarGravacao } from './gravador/gravador';
import { criarProjeto } from './projeto/ipc';

type Passo = (janela: BrowserWindow) => Promise<void>;

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
          "(() => { document.getElementById('gravar-nome').value = 'Simulação gravada'; document.getElementById('btn-gravar').click(); })()",
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
  ];

  try {
    await new Promise<void>((resolve) => janela.webContents.once('did-finish-load', () => resolve()));
    for (const [nome, passo] of passos) {
      await passo(janela);
      console.log(`[smoke] OK: ${nome}`);
    }
    codigo = 0;
  } catch (erro) {
    console.log(`[smoke] ERRO: ${erro instanceof Error ? erro.message : String(erro)}`);
    await tirarPrint(janela, raiz, 'erro');
  } finally {
    await terminarGravacao(false);
    fs.rmSync(pastaProjeto, { recursive: true, force: true });
    app.exit(codigo);
  }
}
