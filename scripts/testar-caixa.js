// Testes de integração com uma caixa de email de testes REAL (por exemplo Outlook), dentro do Electron, com a
// sessão guardada no cofre do UAT Studio (nunca a password). Se a sessão já não servir, abre a janela de login.
//   npm.cmd run caixa:testar -- --projeto=C:/caminho/do/projeto            (ligar e listar os emails recentes)
//   npm.cmd run caixa:testar -- --projeto=... --cenario=<id da jornada>    (corre um cenário do projeto)
const path = require('path'), os = require('os');
const raiz = path.resolve(__dirname, '..');
const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const pasta = path.resolve(arg('projeto') ?? 'C:/Claude_Projects/uat-projeto-email');
const cenario = arg('cenario');
const { app } = require('electron');
// O mesmo sítio dos dados do UAT Studio em desenvolvimento (o cofre com a sessão está lá).
app.setPath('userData', path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'uat-studio'));
app.on('window-all-closed', () => undefined);
(async () => {
  await app.whenReady();
  const repo = require(raiz + '/dist/main/projeto/repositorio');
  const { criarAmbienteApi } = require(raiz + '/dist/main/api/ambiente');
  const { executarBlocoApi } = require(raiz + '/dist/main/api/pedidos');
  const { apiDaCaixa, perfilDaCaixa, problemasDaCaixa } = require(raiz + '/dist/main/email/caixaTestes');
  const caixa = repo.lerProjeto(pasta).caixaTestes;
  const falta = problemasDaCaixa(caixa);
  if (falta.length) throw new Error(`A caixa não está pronta: ${falta.join('; ')}`);
  if (!cenario) {
    const api = apiDaCaixa(caixa);
    const consulta = { id: 'ligar', nome: 'Caixa', tipo: 'API', passos: [], pedido: { metodo: 'GET', url: api.caminho, parametros: [{ nome: '$top', valor: '10' }, { nome: '$orderby', valor: 'receivedDateTime desc' }, { nome: '$select', valor: 'subject,receivedDateTime,from,toRecipients,hasAttachments' }], cabecalhos: [], tipoCorpo: 'nenhum', corpo: '', verificacoes: [], guardar: [] } };
    const t0 = Date.now();
    const r = await executarBlocoApi({ bloco: consulta, urlBase: api.urlBase, perfil: perfilDaCaixa(caixa), preencher: (t) => t }, criarAmbienteApi(pasta));
    console.log(`HTTP ${r.resposta.estado} em ${Date.now() - t0} ms`);
    if (r.resposta.estado !== 200) {
      console.log(r.resposta.corpo.slice(0, 500));
      app.exit(1);
      return;
    }
    const msgs = JSON.parse(r.resposta.corpo).value ?? [];
    console.log(`${msgs.length} emails recentes:`);
    for (const m of msgs) console.log(`  ${m.receivedDateTime} | de ${m.from?.emailAddress?.address} | para ${(m.toRecipients ?? []).map((t) => t.emailAddress?.address).join(', ')} | ${m.hasAttachments ? '[anexo] ' : ''}${m.subject}`);
    app.exit(0);
    return;
  }
  const { iniciarRun, esperarFimDoRun } = require(raiz + '/dist/main/executor/execucao');
  await iniciarRun(pasta, { jornadaIds: [cenario] }, { canal: 'msedge', visivel: false, paralelo: 1 });
  const run = await esperarFimDoRun(15 * 60_000);
  console.log(`=== ${cenario}: ${run.casos.map((c) => `${c.casoId}=${c.estado}`).join(', ')}  (pasta: ${run.pasta ?? ''})`);
  for (const c of run.casos) {
    for (const p of c.passos) console.log(`  ${c.casoId} | ${p.estado} | ${p.bloco} | ${p.descricao} | ${p.detalhe ?? ''}`);
    for (const d of c.diferencas) console.log(`  ${c.casoId} | DIFERENÇA | ${d.passo}: esperado ${d.esperado}, obtido ${d.obtido}`);
    if (c.erro) console.log(`  ${c.casoId} | ERRO | ${c.erro.mensagem}`);
    console.log(`  ${c.casoId} | evidências: ${(c.evidencias ?? []).join(', ')}`);
  }
  app.exit(run.casos.every((c) => c.estado === 'OK') ? 0 : 1);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  app.exit(1);
});
