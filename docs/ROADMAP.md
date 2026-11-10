# Roadmap

Regra: cada passo é pequeno, testável e cabe numa sessão. No fim de cada sessão, atualizar "Estado atual" no `CLAUDE.md` e assinalar aqui o que ficou feito.

## Fase 1: núcleo (gravar, compor, correr)
- [ ] 1. Esqueleto Electron + TypeScript (janela com o menu lateral dos 7 ecrãs, vazios) e um botão que abre o Edge com Playwright na app POC.
- [ ] 2. Modelo de dados em JSON na pasta do projeto: aplicações, épicos, jornadas, blocos, casos. Ecrã "escolher/criar projeto".
- [ ] 3. Gravador v1: realçar o elemento sob o rato, popup de ação (escrever, escolher, marcar, clicar, verificar, guardar variável), vários localizadores, passos gravados num bloco.
- [ ] 4. Editor de jornada v1: compor uma jornada com blocos da biblioteca (reutilizáveis), com parâmetros.
- [ ] 5. Executor v1: correr um caso, uma jornada ou um épico com dados do Excel; visível ou em background; Edge ou Chrome; paralelo.
- [ ] 6. Pasta da execução com prints, trace, logs (`run.log`, `caso.log`) e relatório Excel/HTML (reaproveitar o reporter do POC).
- [ ] 7. "Ver código (.ts)" de um bloco ou jornada.
- [ ] 8. Na app POC (via Mentor): mini-backoffice de aprovação de pedidos, para testar jornadas entre 2 portais.

## Fase 2: dados e API
- [ ] Motor de fórmulas, marcadores, contadores persistentes e geradores.
- [ ] Blocos de API: construtor de pedidos, perfis OAuth 2.0 / API Key / Basic / mTLS, verificações, guardar da resposta, teste individual, importar cURL/OpenAPI.
- [ ] Cofre local de segredos.

## Fase 3: execuções a sério
- [ ] Ecrã Runs: opções, progresso ao vivo, histórico, detalhes com logs e evidências.
- [ ] Controlo: pausar, continuar, parar, saltar (por run, jornada, caso ou worker).
- [ ] Mapa de execução ao vivo (grafo, cores, miniaturas de workers).
- [ ] Log de erro com explicação por regras e sugestões.

## Fase 4: avançado
- [ ] Login com sessão reutilizada e MFA (modo de teste / email / TOTP).
- [ ] Blocos de Email (IMAP / Microsoft Graph).
- [ ] Intercetar e simular respostas de APIs externas.
- [ ] Modo print híbrido.
- [ ] Relatório PDF para assinatura do UAT.
- [ ] Executável portátil assinado e guia de instalação para o PC da empresa.
