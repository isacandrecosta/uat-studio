# UAT Studio: ficha para a equipa de segurança

> Ver também a [auditoria de compliance ao código](AUDITORIA-COMPLIANCE.md).

Resumo para quem tem de aprovar a ferramenta no PC da empresa. Pormenores técnicos em `ESPECIFICACAO.md`; lista completa de componentes em `LICENCAS.md`.

## O que é
Aplicação desktop **portátil** para Windows (`UAT-Studio.exe`, não precisa de instalação nem de permissões de administrador) para a equipa de QA/UAT gravar e correr testes de aceitação de aplicações web (OutSystems) e das suas APIs, sobre **dados fictícios em ambientes de testes** (QA).

## Garantias
| Tema | Como é |
|---|---|
| Inteligência artificial | **Não usa IA** de nenhum tipo. Encontra os elementos do ecrã por regras (vários localizadores) e explica os erros por regras escritas no código. |
| Telemetria | **Nenhuma.** A ferramenta não envia dados de utilização, erros ou estatísticas para lado nenhum. |
| Atualizações automáticas | **Nenhuma.** Não procura nem descarrega versões novas (sem servidor de atualizações). Uma versão nova é um `.exe` novo, entregue pela equipa. |
| Com quem comunica | Só com os endereços **configurados pelos testadores no projeto**: as aplicações testadas, as suas APIs, os servidores de token OAuth 2.0 e, se usados, a caixa de email de testes (Microsoft Graph, pelo proxy do Windows). Nada mais. |
| Browser | Usa o **Microsoft Edge já instalado** (ou o Chrome), controlado localmente pelo Playwright, com um **perfil temporário** e limpo (não toca no perfil, nos cookies nem nas passwords do utilizador). **Não descarrega browsers.** |
| Proxy e certificados | Os pedidos às APIs usam a rede do Windows (proxy e certificados do sistema, através do Electron). Exceção: pedidos com **certificado de cliente (mTLS)** usam o HTTPS do Node e **não passam pelo proxy** (confiam nas autoridades do Windows e na autoridade indicada no perfil). |
| Portas locais | Só abre uma porta local (`127.0.0.1`, porta ao acaso, nunca na rede) quando o testador abre um **trace** de uma execução, para o visualizador incluído no Playwright. Fecha-se com a aplicação. |
| Produção | Cada ambiente tem um tipo (DEV/QA/PRD). Gravar ou correr em **PRD exige confirmação explícita**; o "testar" individual de APIs está **bloqueado em PRD**. |

## Dados e segredos
| O quê | Onde fica |
|---|---|
| Projeto de testes (jornadas, blocos, casos, perfis sem segredos) | Ficheiros **JSON legíveis** numa pasta escolhida pelo testador (boa para Git ou pasta partilhada). |
| Resultados das execuções | Na pasta do projeto, em `execucoes/`: logs, relatórios (Excel, HTML, PDF), prints, traces do Playwright e evidências de API/email. |
| Segredos (client secrets, passwords de contas de teste, tokens, password do certificado, sessão de login) | **Cofre local encriptado** com o `safeStorage` do Electron (no Windows: **DPAPI**, ligado ao utilizador do Windows), em `%APPDATA%\UAT Studio\cofre\`. **Nunca** vão para os ficheiros do projeto, logs, relatórios ou pacotes exportados. A interface só consegue gravar um segredo ou saber se está preenchido; nunca o lê de volta. Noutro PC é preciso voltar a preenchê-los. |
| Sessões de login reutilizadas entre casos | **Só em memória**, durante uma execução (nunca em disco). |
| Passwords de teste dos ecrãs (login) | Também no cofre (**Segredos de teste**, ecrã Dados de teste). Nos casos e no Excel fica só a referência `{SEGREDO:nome}`; o valor é trocado na execução. A verificação antes de correr avisa se encontrar uma password escrita nos casos. |
| Logs e relatórios | Os valores secretos aparecem como `***`. Os blocos com passwords correm **sem trace** (o trace do Playwright grava tudo o que acontece no ecrã). |
| Registo de quem correu | Cada execução regista o utilizador do Windows, a data e o ambiente (`run.log`, `run.json` e o PDF para assinatura). |
| Prints | Não são mascarados (os testes correm sobre dados fictícios em QA). Mascarar prints fica para mais tarde, só se for pedido. |

## Componentes
- **Electron** (MIT): base da aplicação desktop (inclui Chromium e Node.js).
- **Playwright** (`playwright-core`, Apache-2.0): controlo do Edge; inclui o visualizador de traces.
- **ExcelJS** (MIT): importar e exportar casos e relatórios em Excel.
- **@xmldom/xmldom** (MIT) e **xpath** (MIT): ler respostas XML/SOAP.
- Lista completa (165 componentes, quase todos MIT/ISC/Apache-2.0/BSD): `LICENCAS.md`. Notas: `jszip` tem licença dupla (MIT ou GPL-3.0) e aplica-se a MIT; `buffers` não declara a licença no pacote, mas é publicado pelo autor como MIT/X11.

## Assinatura do executável
O `.exe` gerado neste projeto **não está assinado** (não há certificado de assinatura de código; o Windows SmartScreen pode avisar na 1.ª execução). Se a empresa quiser, a equipa de IT pode assiná-lo com o certificado interno (por exemplo, `signtool sign /fd SHA256 /a UAT-Studio.exe`) antes de o distribuir.

## Diagnóstico prévio
Há um `.exe` pequeno de diagnóstico (`UAT-Studio-Diagnostico.exe`) que mostra, a verde/vermelho, se o PC permite o que a ferramenta precisa, sem guardar nada: arrancar, gravar ficheiros, controlar o Edge (também carregar e descarregar ficheiros e abrir separadores), proxy e certificados, cofre de segredos (encriptação do Windows), servidor local em 127.0.0.1 (visualizador de traces), janelas da ferramenta, PDF e, como opcionais (aviso amarelo), o login e o Graph da Microsoft, a ligação direta sem proxy (certificados de cliente, mTLS) e a app de demonstração do projeto de exemplo. Para isso, além do site escrito na janela, faz um pedido a `login.microsoftonline.com`, a `graph.microsoft.com` e a `personal-e5m9c9gh-dev.outsystems.app` (app de demonstração com dados fictícios), só para ver se respondem; não envia dados. Se algo estiver bloqueado, o caminho é pedir à IT um ambiente aprovado (por exemplo, uma máquina de testes), **nunca contornar os controlos**.
