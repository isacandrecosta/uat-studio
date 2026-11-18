# UAT Studio: auditoria de compliance ao código

Revisão técnica do código-fonte da **1.ª versão** do UAT Studio (feita durante o desenvolvimento, a 12/11/2026, e atualizada a 18/11/2026), para apoiar a avaliação da equipa de segurança de uma entidade financeira ou de uma grande empresa portuguesa. **Não substitui** a avaliação formal da empresa (riscos de TIC, RGPD, regras internas). O documento diz o que foi verificado, como, o que a revisão encontrou e foi resolvido antes da 1.ª versão, e o que depende da empresa.

Complementa a [ficha para a equipa de segurança](FICHA-SEGURANCA.md) e a [manual técnico](MANUAL-TECNICO.md).

## Resumo

| Pergunta | Resposta | Como foi verificado |
|---|---|---|
| Usa IA ou envia dados a serviços de IA? | **Não.** Não há bibliotecas, chaves ou chamadas a serviços de IA. Tudo é feito por regras escritas no código (localizadores, widgets, sugestões de erro, texto dos defeitos). | Pesquisa no código e nas dependências por nomes de serviços e bibliotecas de IA: sem resultados. |
| Envia telemetria, estatísticas ou relatórios de erros? | **Não.** Não há telemetria, *crash reporter*, analytics nem atualizações automáticas. | Pesquisa por `telemetry`, `analytics`, `crashReporter`, `autoUpdater`, `electron-updater`, Sentry e semelhantes: sem resultados. |
| Com quem comunica? | Só com os endereços que o testador configura: as aplicações a testar (pelo Edge) e as APIs dos blocos de API (incluindo o endereço do token OAuth). O executável de diagnóstico contacta o site escrito na janela e, só para ver se respondem (sem enviar dados), `login.microsoftonline.com`, `graph.microsoft.com` e a app de demonstração `personal-e5m9c9gh-dev.outsystems.app`. | Todas as chamadas de rede do código foram listadas (ver "Comunicações"). |
| Guarda passwords? | **Só no cofre do Windows (DPAPI), nunca em ficheiros, logs ou relatórios.** Inclui as passwords de teste dos ecrãs, que nos casos e no Excel aparecem só como referência (`{SEGREDO:nome}`); ver "Encontrado e resolvido antes da 1.ª versão". | Revisão do cofre, do executor, dos relatórios, dos pacotes e dos testes automáticos que procuram o segredo nos ficheiros. |
| Executa programas ou comandos do sistema? | **Não**, no uso normal. Abre ficheiros da pasta da execução com o programa associado do Windows (relatório no Excel ou no browser), só dentro de `execucoes/`. | Pesquisa por `child_process`, `spawn`, `exec`, `eval`, `new Function`: só o teste automático de desenvolvimento (`--smoke`) arranca um servidor de teste local. |
| Altera o sistema, o registo ou o perfil do utilizador? | **Não.** É portátil (não instala), usa um perfil temporário do Edge e escreve só na pasta do projeto e em `%APPDATA%\UAT Studio\`. | Revisão dos caminhos de escrita. |
| Contorna controlos da empresa? | **Não.** Usa o proxy e os certificados do Windows; não desliga verificações de certificados; não tem modos escondidos. | Revisão das opções de rede (`net.fetch`, HTTPS do Node só para certificados de cliente). |

## Comunicações (lista completa do código)

| Onde | O quê | Destino |
|---|---|---|
| Executor e gravador | O Edge instalado, controlado pelo Playwright | As aplicações configuradas (e o que essas páginas carregarem) |
| `src/main/api/ambiente.ts` | Blocos de API (`net.fetch` do Electron: proxy e certificados do Windows) | Os endereços dos blocos e dos perfis de autenticação |
| `src/main/api/certificado.ts` | Pedidos com certificado de cliente (mTLS), HTTPS do Node | Os endereços desses perfis |
| `src/main/email/`, `src/main/api/loginJanela.ts` | Caixa de email de testes: login (janela da ferramenta, Edge ou código noutro dispositivo) e leitura do correio pelo Microsoft Graph (permissão delegada `Mail.Read`, só leitura) | `login.microsoftonline.com` e `graph.microsoft.com` (ou a caixa simulada indicada) |
| `src/main/executor/verificar.ts` | "Verificar antes de correr": confirma que os endereços respondem | As aplicações configuradas |
| `src/main/executor/trace.ts` | Visualizador de traces | Servidor local em `127.0.0.1` (porta aleatória), só lê dentro de `execucoes/` |
| `src/diagnostico/` | Executável de diagnóstico: só pedidos para ver se respondem, sem enviar dados | O site escrito na janela (não é guardado), `login.microsoftonline.com`, `graph.microsoft.com`, a app de demonstração `personal-e5m9c9gh-dev.outsystems.app` e um servidor local em `127.0.0.1` |
| `src/main/smoke.ts`, `src/main/demo/` | Só em desenvolvimento (`--smoke`, `--demo`) | As apps de teste fictícias e um servidor de teste local |

## Segredos

- **Cofre**: `safeStorage` do Electron, que no Windows usa a **DPAPI** (ligada ao utilizador do Windows), em `%APPDATA%\UAT Studio\cofre\`. Um ficheiro por projeto; os nomes não revelam valores.
- **A interface nunca lê um segredo**: só grava, lista nomes e sabe se está preenchido. Os valores ficam no processo principal.
- **Segredos das APIs**: client secret, password OAuth, API key, password do certificado e sessão (refresh token).
- **Passwords de teste dos ecrãs**: nos casos e no Excel escreve-se `{SEGREDO:nome}`; o valor é trocado só na execução.
- **Mascaramento**: valores secretos aparecem como `***` no `caso.log`, nos eventos, nas evidências de API, no relatório e no texto dos defeitos.
- **Sem trace nos blocos com segredos**: o trace do Playwright grava tudo o que acontece no ecrã e na rede; esses blocos correm sem ele. O browser do login OAuth com PKCE também não tem trace.
- **Sessões de login reutilizadas**: o `storageState` fica só em memória, durante a execução.
- **Caixa de email de testes**: a ferramenta **não tem nenhum campo para a password da caixa**. O login é feito na página da Microsoft (numa janela da ferramenta com sessão só em memória, no Edge, ou noutro dispositivo com um código). Fica só a sessão (refresh token), encriptada no cofre como `caixa-de-testes.refreshToken`; "Esquecer a sessão" apaga-a. Só se pede leitura (`Mail.Read`), nunca envio.
- **Imagem dos emails** (evidência): desenhada sem JavaScript e sem rede, para não carregar imagens remotas nem avisar o remetente de que o email foi aberto.
- **Pacotes de blocos** (`.uatpack`) e **exportação de casos**: nunca levam segredos.

## Segurança da aplicação (Electron)

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` em todas as janelas.
- Política de segurança de conteúdo (CSP) estrita: só ficheiros da própria app, sem `eval`, sem estilos em linha.
- A interface não carrega conteúdo remoto.
- A janela principal recusa abrir janelas novas e navegar para fora da app, e as permissões do browser (câmara, microfone, localização, notificações) são recusadas, exceto copiar texto.
- A interface mostra textos com `textContent` (nunca `innerHTML`), o que evita injeção de código a partir de dados dos projetos.
- Abrir ficheiros só dentro de `execucoes/`, com verificação contra caminhos do tipo `..\` (*path traversal*).
- O ambiente de produção (tipo PRD) exige confirmação explícita antes de correr.
- **Janela de login da caixa de testes** (`loginJanela.ts`): mostra a página do fornecedor com `sandbox`, sem Node, sem preload, sem DevTools, numa partição só em memória (apagada no fim), com permissões e janelas novas recusadas; o regresso com o código é apanhado antes de chegar à rede. O botão "Abrir a página" do login com código só abre endereços `https`.

## Encontrado e resolvido antes da 1.ª versão

A revisão foi feita durante o desenvolvimento. Estes pontos foram encontrados nela e resolvidos antes de a ferramenta ser distribuída; ficam registados para a equipa de segurança saber o que foi analisado.

1. **Passwords de teste dos ecrãs em claro.** Quando o login de um ecrã usava uma coluna dos casos, a password ficava escrita no JSON dos casos e no Excel.
   - Solução: **Segredos de teste** no cofre (ecrã Dados de teste) e a referência `{SEGREDO:nome}` nos casos.
   - A verificação antes de correr **avisa** quando encontra uma password em claro e dá **erro** quando o segredo não está preenchido neste PC.
2. **Segredo usado num passo não marcado como secreto.** O valor podia aparecer no log desse passo e no trace. Solução: qualquer passo que use uma coluna com `{SEGREDO:...}` conta como secreto: valor mascarado e bloco sem trace.
3. **Endurecimento da janela principal**: navegação, janelas novas e permissões do browser (ver acima).
4. **Dependência com alerta de segurança** (`uuid`): resolvida (ver "Dependências").

Todos estão cobertos por testes automáticos (unitários e o teste de ponta a ponta `npm.cmd run smoke`, que confirma que o valor do segredo não aparece no `caso.log` e que o bloco correu sem trace).

## Dependências

- Lista e licenças em [LICENCAS.md](LICENCAS.md) (gerada por `npm.cmd run licencas`). Quase todas MIT/ISC/Apache/BSD; `jszip` tem licença dupla MIT ou GPL (usa-se a MIT); `buffers` não declara licença.
- `npm audit` (dependências usadas pela app): **0 vulnerabilidades**. Durante o desenvolvimento houve 2 alertas moderados na biblioteca `uuid` (usada pelo `exceljs`); a versão foi fixada em 11.1.1 (`overrides` no `package.json`) e a importação/exportação de Excel foi testada.

## O que depende da empresa (fora do código)

- **Assinatura do executável** com o certificado de assinatura de código da empresa (o `.exe` não está assinado).
- **Avaliação de riscos de TIC**: por exemplo, o regulamento DORA (UE 2022/2554), as orientações da EBA sobre riscos de TIC e de segurança (EBA/GL/2019/04) e as regras internas. A ferramenta corre localmente, sem fornecedor externo nem serviço na nuvem, o que simplifica essa avaliação, mas a decisão é da empresa.
- **RGPD**: a ferramenta foi pensada para dados fictícios em QA. Se for usada com dados reais, os prints, os traces e os logs das execuções podem conter dados pessoais: definir onde ficam as pastas dos projetos, quem lhes acede e quanto tempo se guardam (hoje a limpeza é manual).
- **Caixa de email de testes**: usar uma caixa **dedicada a testes**, sem dados reais, aprovada pela IT; a aplicação registada no Microsoft Entra (Client ID) com a permissão delegada `Mail.Read` é decisão e configuração da IT. Os emails de teste recebidos ficam como evidência nas pastas das execuções.
- **Produção**: recomendamos não correr testes em produção. Se for preciso, o tipo de ambiente PRD exige confirmação.
- **Contas de teste**: usar contas próprias de teste, com o mínimo de permissões; nunca credenciais pessoais.
- **Registo de quem correu**: cada execução guarda o utilizador do Windows. Uma auditoria mais detalhada fica para quando for pedida.
- **Antivírus e políticas do Windows**: correr primeiro o executável de diagnóstico no PC da empresa e, se for bloqueado, pedir à IT um ambiente aprovado (nunca contornar os controlos).
