# Roadmap

Regra: cada passo é pequeno, testável e cabe numa sessão. No fim de cada sessão, atualizar "Estado atual" no `CLAUDE.md` e assinalar aqui o que ficou feito.

## Fase 1: núcleo (gravar, compor, correr)
- [x] 1. Esqueleto Electron + TypeScript (janela com o menu lateral dos 7 ecrãs, vazios) e um botão que abre o Edge com Playwright na app POC.
- [x] 2. **Mini .exe de diagnóstico** para levar ao PC da empresa: abre o Edge e mostra verificações a verde/vermelho (arranque do .exe, controlo do Edge, proxy, certificados). Se bloquear, pedir a IT um ambiente aprovado (ver ESPECIFICACAO, secção 12). *Feito e testado no PC pessoal; atualizado a 18/11/2026 com 17 verificações (ficheiros e separadores no Edge, cofre, servidor local, janelas, PDF e opcionais: Microsoft, ligação direta, apps de demonstração). Falta corrê-lo no PC da empresa.*
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
- [x] ~~Blocos de Email por IMAP (Gmail)~~: feito e testado, depois retirado a 18/11/2026 (o IMAP está bloqueado na rede da empresa).
- [x] Intercetar e simular respostas de APIs externas.
- [x] Modo print híbrido (gravar passos sobre uma captura do ecrã, com a estrutura da página por baixo).
- [x] Relatório PDF para assinatura do UAT, com ID do requisito.
- [x] Exportar/importar pacotes de blocos.
- [x] Executável portátil (`npm.cmd run exe`, verificado com `npm.cmd run exe:verificar`), ficha da ferramenta para a equipa de segurança (`docs/FICHA-SEGURANCA.md`, `docs/LICENCAS.md`) e guia de instalação (`docs/GUIA-INSTALACAO.md`).
- [x] Wiki de componentes OutSystems (projeto apagável na lista Projeto): receitas com jornadas de prova (`npm.cmd run wiki:testar`) e ações novas: carregar e descarregar ficheiros, perguntas do browser, separadores e iframes.
- [x] Wiki: receitas dos widgets do OutSystems UI sobre a app de teste `CatalogoComponentesPOC` (6 ecrãs, todos os componentes): 11 receitas novas, 16 provas OK. A ferramenta reconhece por regras calendários (Flatpickr), listas com pesquisa e de várias escolhas (VirtualSelect), sliders (noUiSlider), classificação, grupos de opções e grupos de botões, no gravador e na execução.
- [x] Modo demo (`npm.cmd run demo`): vídeos por capítulo com legendas e realces (`out/demo/*.webm`) e um guia em HTML com uma imagem por legenda (`out/demo/guia.html`). Capítulos: primeiros passos, gravar, montar uma jornada, correr e resultados, entre dois portais, dados de teste e APIs.
- [x] Demo: capítulo "Perceber o projeto de exemplo" (os épicos 1 a 4 e o que cada um ensina).
- [x] Demo: capítulo "Usar a Wiki de componentes" (abrir a Wiki, ler uma receita em "Como usar", correr as provas, exportar blocos), já com as receitas do catálogo.
- [x] Demo: capítulo "Quando algo falha" (erro explicado, sugestões, regravar um elemento, repetir o caso).
- [x] "Transformar valores fixos em colunas" (gravar a direito e decidir depois o que vem do Excel), descrições em texto corrido nas jornadas e nos blocos, e "Criar defeito" (texto e evidências sugeridos a partir de um caso KO/ERRO).
- [x] Segredos de teste no cofre (`{SEGREDO:nome}` nos casos) e auditoria de compliance ao código (`docs/AUDITORIA-COMPLIANCE.md`).
- [x] Interface, pacote 1: nomes de QA (cenário de teste, casos de teste, execuções), menu pela ordem do trabalho, ecrã Início, faixa de cor do ambiente, estados Passou/Falhou/Bloqueado com símbolos, separadores no editor do cenário.
- [x] Interface, pacote 2: "Mais opções" (percurso e nova execução), filtros (cenários, blocos, casos por resultado), detalhe do caso num painel lateral, caminho "Projeto › Épico › Cenário", pesquisa rápida (Ctrl+K), defeitos criados por execução, ajudas "i", menus "Criar ▾"/"Partilhar ▾", modo escuro e tutorial guiado (saltar e retomar em Configurações).
- [x] Desempenho: medição do PC em cada execução, aviso antes de correr quando o paralelo não cabe na memória, painel em Configurações. Manuais do utilizador e técnico (atualizados a cada funcionalidade).
- [x] Simplificar para quem não é técnico: assistente "Novo teste", aceitar os resultados como esperados, duplicar cenários e casos, modo simples/avançado.
- [x] Caixa de email de testes: email base com endereços por papel, caso e data ({EMAIL:papel}), login numa janela da ferramenta, no Edge ou com código noutro dispositivo, bloco "Verificar email" por papel (assunto exato, valores com tolerância, anexos, link, "não deve chegar"), imagem do email como evidência. Guia de fórmulas no manual do utilizador.
- [x] Caixa de email de testes testada com uma conta Outlook pessoal real (`npm.cmd run caixa:testar`).
- [x] ~~Caixa de email de testes por IMAP (Gmail)~~: retirada a 18/11/2026 (bloqueada na rede da empresa).
- [x] Editor do cenário com os passos de cada bloco à vista e alteráveis (descrição, valor fixo/coluna/fórmula, "só se"); fórmulas nos casos (células com "=") e no Excel (folha "Fórmulas do cenário"); `EMAIL(base; papel; domínio)`.
- [x] A app de testes PortalCreditoPOC envia emails reais (aprovado, recusado, documentos em falta, pagamento; SMTP do ODC pelo Gmail de testes) e o projeto de exemplo tem o épico 5 "Emails que a app envia" (4 casos OK contra o Gmail real).
- [x] "Gravar aqui" dentro do cenário (19/11).
- [ ] Simplificar, por decidir: verificações sugeridas depois de um clique, modelo de Excel com explicações.
- [ ] Assinatura do executável: falta um certificado de assinatura de código (da empresa); o processo está descrito na ficha.
- [ ] Só se for pedido: mascarar dados nos prints, limpeza automática de execuções, auditoria detalhada.
