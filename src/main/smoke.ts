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
import { estadoRun } from './executor/execucao';
import { estadoGravador, paginaDoGravador, terminarGravacao } from './gravador/gravador';
import { criarProjeto } from './projeto/ipc';

type Passo = (janela: BrowserWindow) => Promise<void>;

/** Servidor de teste (OAuth 2.0 + API), que vive FORA do projeto. Sem ele, o passo de API é saltado. */
const SERVIDOR_TESTE = process.env.UAT_SERVIDOR_TESTE ?? path.resolve(__dirname, '..', '..', '..', 'uat-servidor-teste', 'servidor.mjs');
let servidor: ChildProcess | null = null;

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
        confirmar(saltados.join(',') === 'Validar pedido no Backoffice,Consultar pedido pela API', `No caso rejeitado, os blocos condicionais deviam ser saltados: ${saltados.join(',')}`);
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
