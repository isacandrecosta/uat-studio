# UAT Studio

Aplicação desktop portátil para Windows, **offline e sem IA**, para criar e correr testes UAT e de regressão de aplicações OutSystems sem programar.

- **Gravar** ações no browser e definir os valores com cliques (fixo, coluna do Excel, fórmula, gerador), também **sobre uma captura do ecrã** (modo print).
- Organizar os testes em **Épicos → Cenários de teste → Blocos reutilizáveis → Casos de teste**. Blocos de **UI**, de **API** (REST e SOAP, OAuth 2.0 incluindo login com PKCE, API Key, Basic, Bearer, certificado de cliente), de **Email** (Microsoft 365/Outlook pelo Microsoft Graph, ou Gmail e outros por IMAP, com uma **caixa de testes** que dá a cada caso o seu endereço: `{EMAIL:gestor}`) e **passos manuais**.
- **Correr** casos, cenários ou épicos no Edge ou no Chrome, visível ou em background, em paralelo, com **execução ao vivo**, pausa por passo/worker, retomar a meio, evidências e logs por execução, relatórios Excel/HTML e **PDF para assinatura**.
- **Manter** os testes: "onde é usado", reparar localizadores com um clique, regravar um elemento, sugestões por regras quando algo falha, matriz de cobertura e comparação com execuções anteriores, pacotes de blocos para partilhar.
- Login reutilizado entre casos, várias sessões no mesmo cenário (cliente, operador, aprovador) e MFA (modo de teste, TOTP ou código por email).
- Intercetar o pedido que a app envia (por exemplo, a um prestador de pagamentos) e simular respostas de APIs externas.
- Sempre um botão **"Ver código (.ts)"** com o Playwright equivalente.
- Fácil de usar sem programar: tutorial guiado, ajudas "i", pesquisa rápida (Ctrl+K), filtros, modo escuro, "Criar defeito" com texto e evidências, "Transformar valores fixos em colunas" e aviso de memória antes de correr.
- Wiki de componentes OutSystems: uma receita testada para cada componente do OutSystems UI.

Para experimentar: na lista **Projeto** (canto inferior esquerdo) escolha **"Projeto de exemplo (casos de uso)"**; usa duas apps OutSystems de teste (um simulador e um portal de crédito com Front Office e Backoffice, que também envia emails reais). As apps de teste estão publicadas na internet, só com dados fictícios: servem para mostrar a ferramenta e para confirmar que funciona num PC antes de passar à aplicação real.

Estado: Fases 1 a 4 e melhorias de interface feitas (ver [docs/ROADMAP.md](docs/ROADMAP.md) para o que ficou pendente). Especificação em [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md).

## Documentos
- [Manual do utilizador](docs/MANUAL-UTILIZADOR.md): como criar, correr e analisar testes
- [Guia de instalação e primeiros passos](docs/GUIA-INSTALACAO.md)
- [Manual técnico](docs/MANUAL-TECNICO.md): arquitetura, dados, segurança, compliance, desempenho, manutenção
- [Auditoria de compliance ao código](docs/AUDITORIA-COMPLIANCE.md)
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
| `npm.cmd run exemplo:testar` | Corre os cenários do projeto de exemplo contra os portais de teste (PortalCreditoPOC) e diz se deram todas OK. |
| `npm.cmd run caixa:testar -- --projeto=<pasta>` | Liga à caixa de email de testes real de um projeto e lista os emails (com `--cenario=<id>`, corre esse cenário). |
| `npm.cmd run wiki:testar` | Corre as provas da Wiki de componentes contra as apps de teste. |
| `npm.cmd run demo` | Grava os vídeos da demo (com legendas) e o guia ilustrado em `out/demo/` (`-- --capitulos=gravar,correr` para alguns). |

Construído sobre Electron, TypeScript e Playwright.
