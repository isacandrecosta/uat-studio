# UAT Studio

Aplicação desktop portátil para Windows, **offline e sem IA**, para criar e correr testes UAT e de regressão de aplicações OutSystems sem programar.

- **Gravar** ações no browser e definir os valores com cliques (fixo, coluna do Excel, fórmula, gerador), também **sobre uma captura do ecrã** (modo print).
- Organizar os testes em **Épicos → Jornadas → Blocos reutilizáveis → Casos**. Blocos de **UI**, de **API** (REST e SOAP, OAuth 2.0 incluindo login com PKCE, API Key, Basic, Bearer, certificado de cliente), de **Email** (Microsoft Graph) e **passos manuais**.
- **Correr** casos, jornadas ou épicos no Edge ou no Chrome, visível ou em background, em paralelo, com **mapa ao vivo**, pausa por passo/worker, retomar a meio, evidências e logs por execução, relatórios Excel/HTML e **PDF para assinatura**.
- **Manter** os testes: "onde é usado", reparar localizadores com um clique, regravar um elemento, sugestões por regras quando algo falha, matriz de cobertura e comparação com execuções anteriores, pacotes de blocos para partilhar.
- Login reutilizado entre casos, várias sessões na mesma jornada (cliente, operador, aprovador) e MFA (modo de teste, TOTP ou código por email).
- Intercetar o pedido que a app envia (por exemplo, a um prestador de pagamentos) e simular respostas de APIs externas.
- Sempre um botão **"Ver código (.ts)"** com o Playwright equivalente.

Para experimentar: na lista **Projeto** (canto inferior esquerdo) escolha **"Projeto de exemplo (casos de uso)"**; usa duas apps OutSystems de teste (um simulador e um portal de crédito com Front Office e Backoffice).

Estado: Fases 1 a 4 feitas (ver [docs/ROADMAP.md](docs/ROADMAP.md) para o que ficou pendente). Especificação em [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md).

## Documentos
- [Guia rápido para a equipa](docs/GUIA-RAPIDO.md)
- [Guia de instalação e primeiros passos](docs/GUIA-INSTALACAO.md)
- [Documentação técnica e de compliance](docs/DOCUMENTACAO-TECNICA.md)
- [Ficha para a equipa de segurança](docs/FICHA-SEGURANCA.md) e [componentes e licenças](docs/LICENCAS.md)

## Em desenvolvimento

Precisa do Node.js e do Microsoft Edge instalados. Na pasta do projeto:

```
npm.cmd install
npm.cmd start
```

| Comando | O que faz |
|---|---|
| `npm.cmd test` | Testes unitários. |
| `npm.cmd run smoke` | Teste completo da app como um utilizador (~13 min; usa a app POC na internet e o servidor de teste local, se existir). |
| `npm.cmd run exe` / `npm.cmd run exe:verificar` | Gera o `UAT-Studio.exe` portátil e verifica-o. |
| `npm.cmd run diagnostico:exe` | Gera o `.exe` de diagnóstico para o PC da empresa. |
| `npm.cmd run licencas` | Atualiza a lista de componentes e licenças. |
| `npm.cmd run exemplo:testar` | Corre as jornadas do projeto de exemplo contra os portais de teste (PortalCreditoPOC) e diz se deram todas OK. |
| `npm.cmd run wiki:testar` | Corre as provas da Wiki de componentes contra as apps de teste. |
| `npm.cmd run demo` | Grava os vídeos da demo (com legendas) e o guia ilustrado em `out/demo/` (`-- --capitulos=gravar,correr` para alguns). |

Construído sobre Electron, TypeScript e Playwright.
