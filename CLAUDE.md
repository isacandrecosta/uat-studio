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
  - Próximo passo: Fase 1, passo 2 do `docs/ROADMAP.md` (mini .exe de diagnóstico com electron-builder).
