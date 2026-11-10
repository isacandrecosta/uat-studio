# UAT Studio: contexto para o Claude

Lê este ficheiro no início de cada sessão. Detalhes em `docs/ESPECIFICACAO.md` (o quê) e `docs/ROADMAP.md` (por onde vamos).
**No fim de cada sessão, atualiza a secção "Estado atual" abaixo.**

## Quem é o utilizador
- Escreve em **português europeu**: responde sempre em pt-PT.
- É **principiante** em programação: explica de forma simples e **faz as coisas autonomamente no PC** (instalar, configurar, correr), em vez de lhe dar comandos para executar.
- Trabalha em QA/UAT num projeto financeiro grande em **OutSystems** (~150 variantes, ~50 ecrãs, Front Office + Backoffice, integrações SAP, Easypay, Loyalty Fujitsu, SAP BO, Integration Suite, Flex Gateway; OAuth 2.0 na maioria das APIs; MFA por email/SMS; SSO em alguns casos).
- Desenvolve no **PC pessoal** (Windows 11). A app real só é acessível na rede da empresa. **Nunca usar dados, URLs ou credenciais da empresa neste projeto.**
- Plano Claude **Pro**: sessões curtas e focadas, uma tarefa por sessão, sem reler ficheiros sem necessidade.

## O que estamos a construir
**UAT Studio**: uma aplicação desktop **portátil para Windows (.exe), 100% offline e sem IA**, para a equipa (que não programa) criar e correr testes UAT e de regressão de apps OutSystems com cliques:
- grava ações no browser (aponta para um campo, abre-se um popup para definir o valor: fixo, coluna do Excel, fórmula, gerador);
- organiza tudo em **Épicos → Jornadas → Blocos reutilizáveis → Casos**;
- os **blocos** podem ser de UI (passos gravados), de **API** (GET/POST/PUT/PATCH/DELETE com OAuth 2.0) ou de Email, e são todos alimentados pelos dados do caso;
- corre casos, jornadas ou épicos (visível ou em background, Edge ou Chrome, em paralelo), com mapa ao vivo, pausa/paragem, evidências e logs detalhados numa pasta por execução;
- tem sempre um botão "ver código" que mostra o Playwright `.ts` equivalente.

Protótipo visual (7 ecrãs, privado do utilizador): https://claude.ai/artifact/KJFWCkZ7jRBZEqLqASm3nT

## Decisões técnicas (já tomadas, não voltar a discutir sem motivo)
- **Electron + TypeScript + Playwright** (`playwright-core`), com interface em HTML/CSS. Empacotamento portátil com electron-builder.
- **Browser: Microsoft Edge instalado** (`channel: 'msedge'`) por defeito, Chrome opcional (`channel: 'chrome'`). **Não depender do download do Chromium do Playwright**: neste PC a extração bloqueia (provavelmente o antivírus). O vídeo fica desligado, porque precisa de ffmpeg; usar trace e screenshots.
- **Sem IA na ferramenta.** Encontrar elementos com **vários localizadores por elemento** (data-testid → etiqueta → texto/role → id → posição) e usar o seguinte quando um falha (reportado no log). Reconhecimento dos widgets OutSystems por regras (por exemplo, o `data-testid` do Dropdown está no DIV e o `<select>` está dentro).
- Sucesso e erro detetados por **regras** (mensagens de feedback OutSystems, textos configuráveis).
- **Dados do projeto em ficheiros JSON** legíveis (bons para Git) numa pasta escolhida pelo utilizador. Excel apenas para importar e exportar casos e resultados (`exceljs`).
- Segredos (client secrets, passwords de teste) num **cofre local encriptado** (Electron `safeStorage`). Nunca em JSON, logs ou relatórios: mascarar sempre.
- O trace do Playwright grava tudo: **desligá-lo ou limpá-lo nos passos de login e nos pedidos de token**.
- Os UAT correm em **QA com dados fictícios**: regras de dados leves (sem mascarar prints, sem auditoria detalhada). Mantém-se o **tipo de ambiente** (DEV/QA/PRD) com produção bloqueada ou sujeita a confirmação.
- **Valores financeiros**: cálculo decimal exato, formato pt-PT, tolerância configurável, arredondamento selecionável; verificar todos os valores antes de dar KO.
- **PC da empresa**: validar cedo com um mini .exe de diagnóstico. Se for bloqueado, pedir a IT um ambiente aprovado (VM ou máquina de testes deles). **Nunca contornar os controlos** (por exemplo, com uma VM por conta própria).
- **Pausa entre passos**, nunca a meio de uma ação.
- Resultados: **OK** (tudo coincide), **KO** (chegou ao fim mas um valor difere), **ERRO** (não chegou ao fim).

## Ambiente deste PC (importante)
- O PowerShell bloqueia scripts `.ps1`: usar **`npm.cmd` / `npx.cmd`** (ou o utilizador muda a ExecutionPolicy; não a alterar por ele).
- Já instalados: Node.js LTS, Git, GitHub CLI (`gh`, conta `isacandrecosta`), VS Code com a extensão Playwright.
- O PATH pode não estar atualizado na shell: recarregar com `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`.

## Repositórios relacionados (GitHub, privados)
- `isacandrecosta/framework-testes-uat`: o POC que funciona (Excel → Playwright → app + API → relatório Excel/HTML; dados únicos `{ID}-{RUN}`; reporter OK/KO/ERRO). **Reaproveitar código e lições daqui.** Pasta local: `C:\Claude_Projects\poc-uat`.
- `isacandrecosta/outsystems-simulador-poc`: especificação da app alvo de testes (ODC). A app está em https://personal-e5m9c9gh-dev.outsystems.app/SimuladorFinanceiroPOC (REST: `/rest/PedidosAPI`). Usá-la como "cobaia". A app pode ser alterada com o conector OutSystems (Mentor), por exemplo para acrescentar um mini-backoffice de aprovação que simula um 2.º portal.

## Lições do POC
- Esperar que os dados do OutSystems carreguem antes de ler (por exemplo, as opções do dropdown).
- A API REST do OutSystems omite campos com valor por defeito (0): tratar um campo em falta como 0.
- A 1.ª execução pode ser lenta (ambiente ODC a "acordar").
- Achado real: `Round()` do OutSystems arredonda "ao par" (86,405 → 86,40).

## Estado atual
- 2026-11-10: Repositório criado com documentação (CLAUDE.md, docs/). Especificação alargada (secções 8 a 12) e roadmap reordenado (novo passo 2: mini .exe de diagnóstico).
- 2026-11-10: **Fase 1, passo 1 feito.** Esqueleto Electron 45 + TypeScript 7 + `playwright-core`: janela com menu lateral dos 7 ecrãs (vazios) e botão "Abrir Edge na app POC" (testado: abre o Edge e carrega a app POC).
  - Estrutura: `src/main/` (`main.ts` janela e IPC, `preload.ts` ponte segura, `browser.ts` Playwright) e `src/renderer/` (`index.html`, `styles.css`, `renderer.ts`, `global.d.ts`). O `tsc` compila para `dist/`; o HTML carrega `dist/renderer/renderer.js`.
  - Comandos: `npm.cmd start` (compila e abre a app) e `npm.cmd run smoke` (teste automático: abre a janela, clica no botão, confirma o Edge e fecha; print em `out/smoke-janela.png`).
  - Armadilhas: o npm 11 não corre o script de instalação do Electron sem aprovação (já aprovado em `allowScripts` no `package.json`; se faltar `node_modules\electron\dist\electron.exe`, correr `node node_modules\electron\install.js`). O `renderer.ts` tem de ficar sem `import`/`export` (é carregado como script simples; por isso `moduleDetection: legacy` no `tsconfig.json`).
- 2026-11-10: **Fase 1, passo 2 feito.** Mini app de diagnóstico em `src/diagnostico/` (`main.ts`, `preload.ts`, `verificacoes.ts`, `ui/`), empacotada como .exe portátil com electron-builder 26 (`electron-builder.diagnostico.json`).
  - 9 verificações a verde/vermelho: arranque, gravar ficheiros, Edge instalado, controlar o Edge, prints, abrir um site (proxy e certificados no browser), Edge em background, pedidos de API fora do browser (`net.fetch`, usa proxy e certificados do Windows), Chrome (opcional). O site a testar é escrito na janela (por defeito microsoft.com) e **não é guardado nem entra no resultado copiado**.
  - Comandos: `npm.cmd run diagnostico` (abre em desenvolvimento), `npm.cmd run diagnostico:smoke` (teste automático) e `npm.cmd run diagnostico:exe` (gera `out/diagnostico/UAT-Studio-Diagnostico.exe`, ~107 MB, fora do Git). O .exe aceita `--smoke --relatorio=ficheiro --url=site` para testes.
  - Testado neste PC: tudo verde em desenvolvimento e com o .exe copiado para outra pasta; um site com certificado inválido dá vermelho com a explicação certa.
  - Notas: o .exe não está assinado (`signAndEditExecutable: false`, que também evita o download do winCodeSign); o SmartScreen pode avisar. Os scripts do renderer do diagnóstico estão dentro de uma função (IIFE) para não chocarem com os nomes globais de `src/renderer/renderer.ts`.
  - **Pendente do utilizador:** correr o .exe no PC da empresa (respeitando as regras de lá; se for bloqueado, pedir a IT um ambiente aprovado) e trazer o resultado copiado.
- 2026-11-10: **Fase 1, passo 3 feito.** Modelo de dados em JSON e ecrã "escolher/criar projeto".
  - Tipos em `src/shared/modelo.ts` (só tipos, usados pelos dois lados). Pasta do projeto: `projeto.json` (nome, ambientes DEV/QA/PRD, ambiente ativo) + `aplicacoes/`, `epicos/`, `jornadas/`, `blocos/`, `casos/` (um ficheiro por item; os casos de uma jornada ficam em `casos/<idDaJornada>.json`). Ids = slug do nome.
  - `src/main/projeto/`: `repositorio.ts` (ler/gravar, sem Electron, testável), `ipc.ts` (projeto aberto, recentes em userData), `exemplo.ts` (projeto de exemplo do Simulador POC: 1 bloco de UI com 11 passos, 1 jornada, 6 casos com valores esperados calculados).
  - Interface agora em **módulos ES** (`<script type="module">`, imports com `.js`): `src/renderer/app.ts` (vistas e menu), `dom.ts` (ajudas `h()`, diálogos), `ecras/*.ts`. Dois tsconfig: `tsconfig.json` (main, CommonJS → `dist/`) e `tsconfig.renderer.json` (interface, ES → `dist/web/`).
  - Testes: `npm.cmd test` (node:test sobre `dist/tests`) e `npm.cmd run smoke` (usa a janela como um utilizador; passos em `src/main/smoke.ts`).
- 2026-11-10: **Fase 1, passo 4 feito.** Gravador v1.
  - `src/main/gravador/injetado.ts`: código que corre dentro da página (enviado como texto pelo Playwright, por isso **não pode usar nada de fora da função**). Realça o elemento, abre o popup (em shadow DOM, sem innerHTML, estilos por `CSSStyleSheet` para não bater no CSP) e recolhe os localizadores (data-testid, incluindo o do DIV à volta nos widgets OutSystems → etiqueta → role+nome → placeholder → texto → id → caminho CSS). Barra no topo para pausar a gravação e usar a página normalmente.
  - `src/main/gravador/gravador.ts`: sessão de gravação. Ao confirmar o popup, fica só com os localizadores que encontram exatamente aquele elemento, **executa o passo a sério** (com o valor fixo ou o "valor de exemplo" da coluna) e só então o grava. Passwords: só aceitam "coluna dos dados" e ficam com `secreto: true`. Produção exige confirmação.
  - `src/main/motor/`: `localizar.ts` (vários localizadores com alternativa após 3 s; `controloDe` desce do DIV com testid para o `<select>`/`<input>`) e `acoes.ts` (escrever, escolher, marcar, clicar, ler). **É o mesmo motor que o executor vai usar.**
  - Lição: o evento `close` do `<dialog>` só dispara com a janela visível; os diálogos da interface não dependem dele. No smoke, a oclusão de janelas está desligada.
  - A app POC mostra números com ponto decimal ("86.76"), não em pt-PT: o leitor de números do executor tem de aceitar os dois formatos.
- 2026-11-10: **Fase 1, passo 5 feito.** Editor de jornada v1 (`src/renderer/ecras/editor.ts`): percurso de blocos (acrescentar da biblioteca, mover, retirar), parâmetros por bloco (cada `{variável}` vem da coluna com o mesmo nome, de outra coluna ou de um valor fixo), propriedades (nome, etiquetas, ID do requisito), painel de variáveis e tabela de casos editável (grava ao sair da célula). Lógica partilhada em `src/shared/variaveis.ts` (o que cada bloco/jornada usa e produz). `src/shared/` pode ter código a sério: é compilado para os dois lados.
- 2026-11-10: **Fase 1, passos 6 e 7 feitos.** Executor v1, pasta da execução e relatórios.
  - `src/main/executor/`: `numeros.ts` (decimal exato com `bigint`; lê "1.234,56 €" e "86.76"; tolerância), `correrCaso.ts` (um caso num contexto limpo; espera que os pedidos fetch/xhr da página acalmem antes de cada passo; verifica todos os valores antes de dar KO; coluna esperada vazia = verificação ignorada; elemento em falta numa verificação = KO, noutro passo = ERRO), `execucao.ts` (plano por épico/jornada/casos/etiquetas, workers em paralelo 1/2/4/8, parar entre passos, histórico), `relatorios.ts` (xlsx + html), `ipc.ts`.
  - Pasta: `<projeto>/execucoes/<data>_<hora>_runN_<Nome>/` com `run.json`, `run.log`, `relatorio.xlsx`, `relatorio.html` e `casos/<jornada>/<caso>/` (`caso.log`, `eventos.jsonl`, `NN_<bloco>.png`, `erro.png`, `trace-N.zip`). **Blocos com passos secretos correm sem trace** e os valores secretos aparecem como `***`.
  - Excel (`src/main/excel/casosExcel.ts`, `exceljs`): importar/exportar casos no editor. Colunas especiais: ID, Descricao, Etiquetas, Executar (N = não importa). Os números ficam como texto com ponto ("863.61"); ao escrever num `<input type="number">` a vírgula é convertida em ponto.
  - Ecrã Runs (`src/renderer/ecras/runs.ts`): nova execução, progresso ao vivo, detalhes do caso (diferenças, erro explicado, passos, prints), botões para abrir pasta/relatórios, histórico.
  - Testado: os 6 casos do exemplo dão OK (~5 s cada, 2 em paralelo, em background). A 1.ª execução depois de a app POC estar parada pode falhar por lentidão (o ODC "acorda"): repetir.
  - Ambiguidade conhecida: um número só com ponto e 3 casas ("1.234") é lido como milhares pt-PT.
- 2026-11-10: **Fase 1, passo 8 feito.** "Ver código (.ts)": `src/shared/codigo.ts` gera o teste Playwright equivalente a um bloco (botão na lista de blocos do ecrã Jornadas) ou a uma jornada (botão no editor), com os parâmetros aplicados e os casos incluídos. Janela só de leitura com "Copiar". **Dentro de `src/shared/`, os imports de código têm de acabar em `.js`** (a interface corre no browser).
- **Notas que substituem as dos passos 1 e 2:** `browser.ts`, `renderer.ts` e `moduleDetection: legacy` já não existem; o botão "Abrir Edge na app POC" foi substituído pelo gravador.
- (O passo 9 esteve bloqueado até o conector OutSystems ser autorizado; ver a entrada "Fase 1, passo 9" mais abaixo.)
- 2026-11-10: **Fase 2, 1.º item feito.** Motor de fórmulas, marcadores, contadores e geradores.
  - `src/shared/decimal.ts` (decimal exato: somar, multiplicar, dividir com 20 casas, potência inteira, arredondar `cima`/`par`/`baixo`; `src/main/executor/numeros.ts` só reexporta) e `src/shared/formulas.ts` (sintaxe tipo Excel pt-PT: textos entre aspas, `{variáveis}`, argumentos com `;`, operadores `& + - * /` e comparações).
  - Funções: ARRED, ARRED.PAR (como o `Round()` do OutSystems), TRUNCAR, PRESTACAO(capital; taxa anual %; meses), POTENCIA, ABS, MIN, MAX, SE, TEXTO, PONTO, MAIUSCULAS, MINUSCULAS, ESQUERDA, DIREITA, COMPR. Geradores: NIF(), IBAN(), ALEATORIOENTRE(min; max), EMAIL(perfil; domínio). Marcadores: `{TESTE}`, `{RUN}`, `{DATA:fmt}`, `{HOJE+N:fmt}`, `{CONTADOR:nome}`, `{ALEATORIO:n}`.
  - **Variáveis calculadas** (`variaveis.json` na pasta do projeto): nome + fórmula, calculadas uma vez por caso na 1.ª utilização. **Contadores** em `contadores.json` (persistentes). Ecrã Dados de teste (`src/renderer/ecras/dados.ts`) com pré-visualização ao vivo sobre um caso de exemplo (não gasta contadores), contadores e ajuda.
  - Fórmulas também no popup do gravador (3.ª origem do valor, com valor de exemplo) e nos parâmetros dos blocos no editor. `validarFormula` distingue erros de escrita de erros de contas.
  - Testado: 21 testes unitários e o smoke completo (uma variável calculada com SE/ARRED alimenta a verificação da comissão nos 6 casos, todos OK).
- 2026-11-10: **Fase 2: blocos de API e cofre de segredos feitos.**
  - **Servidor de teste fora do projeto** (decisão do utilizador, para não pôr coisas desnecessárias no UAT Studio): `C:\Claude_Projects\uat-servidor-teste\servidor.mjs` (Node puro, sem dependências, só `localhost`; OAuth 2.0 + API de clientes + API Key + Basic; credenciais inventadas no README de lá). Arranca com `node servidor.mjs` (porta 4010). Os testes do projeto arrancam-no sozinhos noutra porta e são **saltados se a pasta não existir** (variável `UAT_SERVIDOR_TESTE` para outro caminho).
  - Modelo: `Bloco.pedido` (`PedidoApi`: método, url, parâmetros, cabeçalhos, corpo, perfil, verificações, guardar) e nova coleção `perfis/` (`PerfilAutenticacao`, **sem segredos**).
  - `src/main/api/pedidos.ts` (motor, sem Electron: `fetch` e leitura de segredos vêm de fora): OAuth 2.0 client credentials e password, token reutilizado por execução, renovado ao expirar ou após um 401; API Key, Basic, Bearer; verificações (código HTTP, campo por caminho tipo `cliente.id`, cabeçalho, tempo; igual/diferente/contém/maior/menor/regex/existe; números comparados com decimal exato; **campo em falta = 0**, regra do OutSystems); guardar em variáveis; segredos mascarados (`***`) em tudo o que fica registado; erros de rede explicados. `ambiente.ts` liga ao `net.fetch` do Electron (proxy e certificados do Windows) e ao cofre, e faz o "Testar" (bloqueado em PRD, não gasta contadores).
  - `src/main/cofre.ts`: segredos encriptados com `safeStorage`, em `userData/cofre/<hash da pasta do projeto>.json`, nome `<idDoPerfil>.<campo>`. A interface só consegue guardar e saber se está preenchido; nunca ler. **Consequência: os segredos não viajam com a pasta do projeto**; noutro PC é preciso voltar a preenchê-los.
  - Textos com `{variáveis}` (`preencherTexto` em `formulas.ts`): o interior não pode ter aspas nem espaços no início, para não apanhar JSON; em corpos JSON os valores são protegidos.
  - Executor: blocos de API dentro de qualquer jornada; evidências em `casos/.../api/NN_<bloco>.request.json` e `.response.json`. Ecrã Blocos de API (`src/renderer/ecras/api.ts`) e criar/alterar aplicações no ecrã Jornadas (`pedirFormulario` em `dom.ts`).
  - Testado: 26 testes unitários e smoke completo (jornada só de API com 2 casos: OK e KO de propósito; o client secret não aparece em nenhum ficheiro).
- 2026-11-10: **Fase 1, passo 9 feito (a Fase 1 está completa).** Mini-backoffice na app POC, feito com o Mentor pelo conector OutSystems e publicado em Development (revisão 2 da app `SimuladorFinanceiroPOC`, chave `bae9d725-65d0-46d1-97d4-85c68b1de057`).
  - Ecrã novo `/Backoffice` (acesso anónimo): `inpPedidoId` + `btnProcurar`; detalhe com `boPedidoId`, `boVariante`, `boValor`, `boEstado`, `boDecisao`, `boMotivo`; `inpMotivo`, `btnValidar`, `btnRecusar`; mensagem em `boMensagem`; tabela `tblPedidos` com os 20 pedidos mais recentes. Menu com `lnkBackoffice`.
  - Regras (server action `DecidirPedido`): só se decide um pedido com Estado "Aprovado" ("Só é possível decidir pedidos aprovados"); só uma vez ("O pedido já tem decisão"); recusar exige motivo ("Indique o motivo da recusa"); mensagens "Pedido validado" / "Pedido recusado"; pesquisa sem resultado dá "Pedido não encontrado".
  - Entidade `Pedido`: novos `DecisaoBO` ("Pendente" / "Validado" / "Recusado"; vazio nos pedidos antigos, mostrado como "Pendente"), `MotivoBO`, `DataDecisaoBO`. O ecrã Pedidos ganhou a coluna "Decisão" e a API `GET /rest/PedidosAPI/pedidos/{id}` devolve `DecisaoBO` e `MotivoBO`. O Simulador ficou igual (os 6 casos antigos continuam OK).
  - **Falta refletir isto na especificação do repositório `outsystems-simulador-poc`** (não foi alterado).
  - No projeto de exemplo (`exemplo.ts`): aplicação "Backoffice de Pedidos", blocos "Validar pedido no Backoffice" (UI) e "Consultar pedido pela API" (API) e a jornada "Simular e validar no Backoffice" (FO → BO → API, 2 casos), que usa o `{PedidoId}` guardado no 1.º bloco. Testada no smoke: 2 casos OK (~10 s cada).
  - "Ver código (.ts)" passou a cobrir os blocos de API (com `request.fetch`), incluindo um botão no ecrã Blocos de API.
  - Lições: uma chamada ao Mentor demora 2 a 4 minutos e a publicação mais 2 a 3; a seguir a publicar, confirmar com `env_app` que a revisão é a nova. No ecrã Gravar, a aplicação escolhida por omissão é a primeira por ordem alfabética do id (agora o Backoffice).
- **Próximo passo:** Fase 2: passos e blocos condicionais ("só se `{Produto}` = X"), bloco "esperar até", ação "encontrar linha na tabela" (a tabela `tblPedidos` do Backoffice serve para testar), blocos de preparação e limpeza por API.
