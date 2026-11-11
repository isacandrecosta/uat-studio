# Roadmap

Regra: cada passo é pequeno, testável e cabe numa sessão. No fim de cada sessão, atualizar "Estado atual" no `CLAUDE.md` e assinalar aqui o que ficou feito.

## Fase 1: núcleo (gravar, compor, correr)
- [x] 1. Esqueleto Electron + TypeScript (janela com o menu lateral dos 7 ecrãs, vazios) e um botão que abre o Edge com Playwright na app POC.
- [x] 2. **Mini .exe de diagnóstico** para levar ao PC da empresa: abre o Edge e mostra verificações a verde/vermelho (arranque do .exe, controlo do Edge, proxy, certificados). Se bloquear, pedir a IT um ambiente aprovado (ver ESPECIFICACAO, secção 12). *Feito e testado no PC pessoal; falta corrê-lo no PC da empresa.*
- [x] 3. Modelo de dados em JSON na pasta do projeto: aplicações, épicos, jornadas, blocos, casos. Um ficheiro por item, etiquetas nos casos e tipo de ambiente (DEV/QA/PRD). Ecrã "escolher/criar projeto".
- [x] 4. Gravador v1: realçar o elemento sob o rato, popup de ação (escrever, escolher, marcar, clicar, verificar, guardar variável), vários localizadores, passos gravados num bloco.
- [x] 5. Editor de jornada v1: compor uma jornada com blocos da biblioteca (reutilizáveis), com parâmetros.
- [x] 6. Executor v1: correr um caso, uma jornada ou um épico com dados do Excel; visível ou em background; Edge ou Chrome; paralelo. Inclui esperar pelo carregamento do OutSystems, comparação financeira (formato pt-PT, tolerância) e verificar todos os valores antes de dar KO.
- [x] 7. Pasta da execução com prints, trace, logs (`run.log`, `caso.log`) e relatório Excel/HTML (reaproveitar o reporter do POC).
- [x] 8. "Ver código (.ts)" de um bloco ou jornada.
- [x] 9. Na app POC (via Mentor): mini-backoffice de aprovação de pedidos, para testar jornadas entre 2 portais.

## Fase 2: dados e API
- [x] Motor de fórmulas (decimal exato, arredondamento selecionável), marcadores, contadores persistentes e geradores.
- [x] Blocos de API: construtor de pedidos, perfis OAuth 2.0 (client credentials, password, renovação) / API Key / Basic / Bearer, verificações, guardar da resposta, teste individual.
- [x] Blocos de API: verificações e "guardar" em XML (XPath), SOAP, importar cURL/OpenAPI (JSON)/Postman.
- [x] Blocos de API: OAuth Authorization Code + PKCE (login no browser, sessão guardada no cofre) e certificado de cliente (mTLS).
- [x] Cofre local de segredos; segredos fora do trace (desligado ou limpo no login e nos pedidos de token).
- [x] Passos e blocos condicionais ("só se `{Produto}` = X").
- [x] Bloco "esperar até" e ação "encontrar linha na tabela".
- [x] Blocos de preparação e limpeza por API (qualquer bloco pode ser marcado "limpeza: corre sempre").

## Fase 3: execuções a sério
- [x] Ecrã Runs: opções, filtros por etiqueta, progresso ao vivo, histórico, detalhes com logs e evidências.
- [x] Verificação antes de correr (variáveis, segredos, ambiente).
- [x] Controlo: pausar, continuar, parar, saltar um caso, velocidade (lenta, passo a passo), pausar no erro, repetir só KO/ERRO.
- [x] Controlo por jornada ("saltar o resto da jornada") e por worker (pausar só um); retomar a meio (recomeçar um caso a partir de um bloco, com as variáveis guardadas).
- [x] Mapa de execução ao vivo (grafo, cores, miniaturas de workers). *Fica de fora "abrir o browser de um worker" (em background não há janela para mostrar).*
- [x] Reparar localizadores com um clique (quando o preferido falha e uma alternativa funciona).
- [x] Log de erro com explicação por regras e sugestões; ações "copiar log", "abrir trace" (dentro da app), "repetir só este caso" e "regravar este elemento".
- [x] Matriz de cobertura e comparação com a execução anterior.
- [x] Bloco "passo manual".
- [x] "Onde é usado" de cada bloco.

## Fase 4: avançado
- [x] Login com sessão reutilizada e MFA (modo de teste / email / TOTP); várias sessões na mesma jornada.
- [x] Blocos de Email (Microsoft Graph ou compatível).
- [ ] Blocos de Email por IMAP (Gmail): por fazer, falta uma caixa de testes para o testar.
- [x] Intercetar e simular respostas de APIs externas.
- [x] Modo print híbrido (gravar passos sobre uma captura do ecrã, com a estrutura da página por baixo).
- [x] Relatório PDF para assinatura do UAT, com ID do requisito.
- [x] Exportar/importar pacotes de blocos.
- [x] Executável portátil (`npm.cmd run exe`, verificado com `npm.cmd run exe:verificar`), ficha da ferramenta para a equipa de segurança (`docs/FICHA-SEGURANCA.md`, `docs/LICENCAS.md`) e guia de instalação (`docs/GUIA-INSTALACAO.md`).
- [x] Wiki de componentes OutSystems (projeto apagável na lista Projeto): receitas com jornadas de prova (`npm.cmd run wiki:testar`) e ações novas: carregar e descarregar ficheiros, perguntas do browser, separadores e iframes.
- [ ] Wiki: receitas dos widgets do OutSystems UI (Date Picker, Dropdown Search/Tags, Range Slider, Rating, Tabs, Accordion, Popup, Wizard, Paginação) sobre a app de teste `CatalogoComponentesPOC` (por publicar: o Mentor ficou sem créditos) e suporte da ferramenta para os que precisarem.
- [x] Modo demo (`npm.cmd run demo`): vídeos por capítulo com legendas e realces (`out/demo/*.webm`) e um guia em HTML com uma imagem por legenda (`out/demo/guia.html`). Capítulos: primeiros passos, gravar, montar uma jornada, correr e resultados, entre dois portais, dados de teste e APIs.
- [x] Demo: capítulo "Perceber o projeto de exemplo" (os épicos 1 a 4 e o que cada um ensina).
- [x] Demo: capítulo "Usar a Wiki de componentes" (abrir a Wiki, ler uma receita em "Como usar", correr as provas, exportar blocos). Voltar a gravar quando houver as receitas do catálogo.
- [x] Demo: capítulo "Quando algo falha" (erro explicado, sugestões, regravar um elemento, repetir o caso).
- [ ] Assinatura do executável: falta um certificado de assinatura de código (da empresa); o processo está descrito na ficha.
- [ ] Só se for pedido: mascarar dados nos prints, limpeza automática de execuções, auditoria detalhada.
