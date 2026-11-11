// Corre as jornadas automáticas do exemplo dos portais (PortalCreditoPOC) com o executor do UAT Studio,
// dentro do Electron (para os blocos de API usarem a rede do Windows). Uso: npm.cmd run exemplo:testar (ou wiki:testar, para a Wiki de componentes)
const path = require('path'), fs = require('fs'), os = require('os');
const raiz = path.resolve(__dirname, '..');
const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.js'));
const wiki = process.argv.includes('--wiki');
let jornadas = pedidas.length ? pedidas : ['pc-pedido-entre-portais', 'pc-pagamento-simulado', 'pc-apis'];
const repo = require(raiz + '/dist/main/projeto/repositorio');
const { criarExemplo } = require(raiz + '/dist/main/projeto/exemplo');
const { criarExemploPortais } = require(raiz + '/dist/main/projeto/exemploPortais');
const { iniciarRun, esperarFimDoRun } = require(raiz + '/dist/main/executor/execucao');
(async () => {
  if (process.versions.electron) await require('electron').app.whenReady();
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-portais-'));
  repo.criarProjeto(pasta, 'P');
  if (wiki) {
    require(raiz + '/dist/main/projeto/wiki').criarWiki(pasta);
    if (!pedidas.length) jornadas = repo.listar(pasta, 'jornadas').map((j) => j.id);
  } else { criarExemplo(pasta); criarExemploPortais(pasta); }
  let todosOk = true;
  for (const j of jornadas) {
    await iniciarRun(pasta, { jornadaIds: [j] }, { canal: 'msedge', visivel: false, paralelo: 1 });
    const run = await esperarFimDoRun(900000);
    console.log(`=== ${j}: ${run.casos.map((c) => `${c.casoId}=${c.estado}`).join(', ')}`);
    for (const c of run.casos) {
      if (c.estado === 'OK') continue;
      todosOk = false;
      console.log(`--- ${c.casoId} ${c.estado} ${c.erro ? `${c.erro.bloco} › ${c.erro.passo}: ${c.erro.mensagem}` : ''}`);
      for (const p of c.passos) if (p.estado !== 'ok') console.log(`    ${p.estado} | ${p.bloco} | ${p.descricao} | ${p.detalhe ?? ''}`);
    }
  }
  fs.rmSync(pasta, { recursive: true, force: true });
  console.log(todosOk ? 'Todos os casos deram OK.' : 'Há casos que não deram OK.');
  process.exit(todosOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
