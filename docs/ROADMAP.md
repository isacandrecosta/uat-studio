# Roadmap

Regra: cada passo é pequeno, testável e cabe numa sessão. No fim de cada sessão, atualizar "Estado atual" no `CLAUDE.md` e assinalar aqui o que ficou feito.

## Fase 1: núcleo (gravar, compor, correr)
- [x] 1. Esqueleto Electron + TypeScript (janela com o menu lateral dos 7 ecrãs, vazios) e um botão que abre o Edge com Playwright na app POC.
- [ ] 2. **Mini .exe de diagnóstico** para levar ao PC da empresa: abre o Edge e mostra verificações a verde/vermelho (arranque do .exe, controlo do Edge, proxy, certificados). Se bloquear, pedir a IT um ambiente aprovado (ver ESPECIFICACAO, secção 12).
- [ ] 3. Modelo de dados em JSON na pasta do projeto: aplicações, épicos, jornadas, blocos, casos. Um ficheiro por item, etiquetas nos casos e tipo de ambiente (DEV/QA/PRD). Ecrã "escolher/criar projeto".
- [ ] 4. Gravador v1: realçar o elemento sob o rato, popup de ação (escrever, escolher, marcar, clicar, verificar, guardar variável), vários localizadores, passos gravados num bloco.
- [ ] 5. Editor de jornada v1: compor uma jornada com blocos da biblioteca (reutilizáveis), com parâmetros.
- [ ] 6. Executor v1: correr um caso, uma jornada ou um épico com dados do Excel; visível ou em background; Edge ou Chrome; paralelo. Inclui esperar pelo carregamento do OutSystems, comparação financeira (formato pt-PT, tolerância) e verificar todos os valores antes de dar KO.
- [ ] 7. Pasta da execução com prints, trace, logs (`run.log`, `caso.log`) e relatório Excel/HTML (reaproveitar o reporter do POC).
- [ ] 8. "Ver código (.ts)" de um bloco ou jornada.
- [ ] 9. Na app POC (via Mentor): mini-backoffice de aprovação de pedidos, para testar jornadas entre 2 portais.

## Fase 2: dados e API
- [ ] Motor de fórmulas (decimal exato, arredondamento selecionável), marcadores, contadores persistentes e geradores.
- [ ] Blocos de API: construtor de pedidos, perfis OAuth 2.0 / API Key / Basic / mTLS, verificações, guardar da resposta, teste individual, importar cURL/OpenAPI.
- [ ] Cofre local de segredos; segredos fora do trace (desligado ou limpo no login e nos pedidos de token).
- [ ] Passos e blocos condicionais ("só se `{Produto}` = X").
- [ ] Bloco "esperar até" e ação "encontrar linha na tabela".
- [ ] Blocos de preparação e limpeza por API.

## Fase 3: execuções a sério
- [ ] Ecrã Runs: opções, filtros por etiqueta, progresso ao vivo, histórico, detalhes com logs e evidências.
- [ ] Verificação antes de correr (variáveis, segredos, ambiente).
- [ ] Controlo: pausar, continuar, parar, saltar (por run, jornada, caso ou worker); retomar a meio.
- [ ] Mapa de execução ao vivo (grafo, cores, miniaturas de workers).
- [ ] Log de erro com explicação por regras e sugestões; reparar localizadores com um clique.
- [ ] Matriz de cobertura e comparação com a execução anterior.
- [ ] Bloco "passo manual".
- [ ] "Onde é usado" de cada bloco.

## Fase 4: avançado
- [ ] Login com sessão reutilizada e MFA (modo de teste / email / TOTP); várias sessões na mesma jornada.
- [ ] Blocos de Email (IMAP / Microsoft Graph).
- [ ] Intercetar e simular respostas de APIs externas.
- [ ] Modo print híbrido.
- [ ] Relatório PDF para assinatura do UAT, com ID do requisito.
- [ ] Exportar/importar pacotes de blocos.
- [ ] Executável portátil assinado, ficha da ferramenta para a equipa de segurança e guia de instalação para o PC da empresa.
- [ ] Só se for pedido: mascarar dados nos prints, limpeza automática de execuções, auditoria detalhada.
