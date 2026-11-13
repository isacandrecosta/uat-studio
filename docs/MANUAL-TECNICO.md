# UAT Studio: manual técnico

Para quem mantém a ferramenta, para a equipa de segurança e para quem a aprova. Escrito de forma simples; os pormenores estão no código, com comentários em português.
Para o uso do dia a dia, ver o [manual do utilizador](MANUAL-UTILIZADOR.md). Documentos de apoio: [auditoria de compliance](AUDITORIA-COMPLIANCE.md), [ficha de segurança](FICHA-SEGURANCA.md), [guia de instalação](GUIA-INSTALACAO.md), [licenças](LICENCAS.md), [especificação](ESPECIFICACAO.md), [roadmap](ROADMAP.md).

> Este manual é atualizado sempre que a ferramenta ganha uma funcionalidade nova (ver "Novidades" no fim). Última atualização: 13/11/2026.

---

## 1. Visão geral

| | |
|---|---|
| O que é | Aplicação desktop **portátil** para Windows (`UAT-Studio.exe`, não instala nada) que grava e corre testes UAT e de regressão de aplicações web OutSystems e das suas APIs. |
| Tecnologia | **Electron 45** (Chromium + Node.js), **TypeScript**, **Playwright** (`playwright-core`) a controlar o **Microsoft Edge instalado**, ExcelJS, @xmldom/xmldom + xpath. |
| Princípios | **Offline e sem IA** (tudo por regras escritas no código); dados em **ficheiros JSON legíveis**; **segredos num cofre encriptado** do Windows; evidência completa de cada execução. |
| Resultados | OK (tudo coincide) · KO (chegou ao fim, mas um valor difere) · ERRO (não chegou ao fim). Na interface: ✓ Passou, ✗ Falhou, ! Bloqueado. |

## 2. Como está organizada (arquitetura)

```
┌──────────────────────────── UAT-Studio.exe (Electron) ────────────────────────────┐
│ Interface (sandbox, sem ficheiros nem rede)     Processo principal (Node.js)        │
│  src/renderer/                                   src/main/                           │
│   app.ts (menu, faixa, pesquisa)   ── IPC ──►     projeto/   ficheiros do projeto     │
│   ecras/*.ts (os 8 ecrãs)                         gravador/  gravar no browser        │
│   tutorial.ts, configuracoes.ts    ◄── eventos ── executor/  correr, relatórios, PDF  │
│   pesquisa.ts, dom.ts                             api/       HTTP, OAuth, mTLS, XML   │
│                                                   email/     caixa de testes (Graph)  │
│  src/shared/ (código puro, usado                  motor/     encontrar e agir         │
│   pelos dois lados: fórmulas, decimal,            cofre.ts   segredos (DPAPI)         │
│   estados, mapa, defeitos, parametrizar…)         desempenho.ts  medir o PC           │
└──────────────────────────────────┬────────────────────────────────────────────────────┘
                                   │ Playwright (ligação local por "pipe", sem rede)
                         Microsoft Edge instalado (perfil temporário)
```

- **A interface não tem acesso direto a nada**: corre isolada (`sandbox`, `contextIsolation`, sem `nodeIntegration`) e só pede coisas ao processo principal através de uma lista fixa de pedidos (IPC) definida em `src/main/preload.ts`.
- **Um só motor** (`src/main/motor/`) serve para gravar e para correr: o que se grava é exatamente o que se executa.
- **`src/shared/`** é código puro (sem Electron), compilado para os dois lados e testado com testes automáticos.

### Pastas do código

| Pasta | O que tem |
|---|---|
| `src/main/main.ts` | Arranque, janela, endurecimento de segurança, pedidos gerais (modo, desempenho). |
| `src/main/projeto/` | Ler e gravar o projeto (`repositorio.ts`), projetos recentes, exemplos e Wiki, pacotes de blocos. |
| `src/main/gravador/` | Sessão de gravação (`gravador.ts`), código injetado na página (`injetado.ts`), regravar um elemento. |
| `src/main/motor/` | Encontrar elementos com vários localizadores (`localizar.ts`) e agir (`acoes.ts`, incluindo os widgets do OutSystems UI). |
| `src/main/executor/` | Planear e correr (`execucao.ts`, `correrCaso.ts`), verificar antes de correr, relatórios, PDF, trace, defeitos. |
| `src/main/api/` | Pedidos HTTP, OAuth 2.0 (incluindo PKCE), certificados de cliente, XML/SOAP. |
| `src/main/desempenho.ts` | Medir o processador e a memória do PC e sugerir quantos casos em paralelo. |
| `src/main/demo/` | Modo demo: vídeos com legendas e guia ilustrado (só para desenvolvimento). |
| `src/renderer/` | A interface: menu, ecrãs, assistente "Novo teste" (`assistente.ts`), tutorial, configurações (modo, tema, desempenho), pesquisa rápida, estilos (tema claro e escuro, modo simples). |
| `src/shared/` | Modelo de dados, fórmulas, decimal exato, estados, mapa, cobertura, sugestões, defeitos, parametrizar, aceitar resultados. |
| `src/tests/` | Testes unitários (`npm.cmd test`). |

## 3. Onde ficam os dados

### Pasta do projeto (escolhida pelo utilizador)
```
<projeto>/
  projeto.json            nome, ambientes (DEV/QA/PRD), ambiente ativo
  aplicacoes/*.json       sistemas a testar e endereço por ambiente
  epicos/*.json           épicos
  jornadas/*.json         cenários de teste (percurso de blocos, descrição, requisito)
  blocos/*.json           blocos: ecrã (passos), API, email, passo manual
  casos/<cenário>.json    casos de teste (uma linha de dados por caso)
  perfis/*.json           perfis de autenticação, SEM segredos
  variaveis.json          variáveis calculadas por fórmula
  contadores.json         contadores
  ficheiros/              ficheiros de teste (por exemplo, para carregar)
  execucoes/              resultados (excluídos do Git)
```
Um ficheiro por item, legível e bom para Git. Internamente, os cenários continuam a chamar-se `jornadas` (nomes de ficheiros e campos), para os projetos antigos abrirem sem alterações.

### Pasta de cada execução
`execucoes/<data>_<hora>_runN_<nome>/`:
- `run.json` (tudo, incluindo o resumo de desempenho), `run.log`;
- `relatorio.xlsx`, `relatorio.html`, `relatorio-assinatura.pdf` (a pedido);
- por caso, em `casos/<cenário>/<caso>/`: `caso.log`, `eventos.jsonl`, um print por bloco, `erro.png`, `trace-N.zip` (gravação do Playwright), pedidos e respostas de API, emails, downloads e `defeito.txt` (quando se cria um defeito).

### Pasta da app no PC (`%APPDATA%\UAT Studio\`)
Projetos recentes, o **cofre de segredos** (`cofre\`, encriptado), os projetos de exemplo e da Wiki, e as preferências da interface (tema, tutorial).

## 4. Como funciona

### 4.1 Gravar
- O gravador abre o Edge e injeta um script na página, que realça o elemento e abre um popup (num "shadow DOM", compatível com as políticas de segurança das páginas).
- Para cada elemento guarda **vários localizadores**, do mais fiável para o menos fiável: `data-testid` → etiqueta → papel + nome → placeholder → texto → id → caminho CSS. Fica só com os que encontram exatamente aquele elemento.
- O passo é **executado a sério** antes de ser gravado.
- Widgets do OutSystems UI são reconhecidos por regras:

| Widget | Biblioteca | Técnica |
|---|---|---|
| Calendários | Flatpickr | `setDate` |
| Listas com pesquisa | VirtualSelect | `setValue` pelo texto da opção |
| Sliders | noUiSlider | `set` e depois as setas do teclado, porque o OutSystems só reage a uma mexida |
| Estrelas, opções, grupos de botões | — | Clique pela etiqueta |

### 4.2 Correr
1. **Verificação antes de correr** (sem browser): blocos, colunas, fórmulas, endereços, segredos, certificados, produção.
2. **Workers em paralelo** (1, 2, 4 ou 8); cada caso corre num contexto de browser limpo (um por "sessão" do cenário).
3. Antes de cada passo espera que a página acalme (os ecrãs OutSystems carregam dados depois de aparecerem). **Pausas só entre passos.**
4. Verifica **todos** os valores antes de dar KO. Números em **decimal exato**, com tolerância e arredondamento ao par como o `Round()` do OutSystems.
5. Depois de um erro, só correm os blocos de limpeza.
6. No fim: relatórios, comparação com a execução anterior, sugestões por regras, localizadores a reparar e **resumo de desempenho**.

### 4.3 APIs, email e serviços externos
- **Pedidos HTTP**: pelo `net.fetch` do Electron, que usa o **proxy e os certificados do Windows**. Com certificado de cliente (mTLS), pelo HTTPS do Node (sem proxy).
- **OAuth 2.0**: client credentials, password, refresh token e Authorization Code + PKCE. Os tokens são reutilizados durante a execução.
- **Respostas**: JSON por caminho (um campo em falta conta como 0, regra das APIs do OutSystems) e XML/SOAP por XPath.
- **Email**: uma API ao estilo do Microsoft Graph, para esperar, verificar e extrair valores (por exemplo, um código de MFA).
- **No browser**: intercetar o que a aplicação envia e simular respostas de APIs externas.

### 4.4 Simplificações para quem não é técnico
- **Assistente "Novo teste"** (`src/renderer/assistente.ts`): uma janela com 4 passos que junta peças que já existem:
  - aplicação nova (`dados.guardar`);
  - gravação (`gravador.iniciar`/`terminar`, com a contagem de passos ao vivo);
  - épico e cenário com o bloco gravado;
  - "o que varia" (`valoresFixos` + `blocos.parametrizar`, que cria as colunas e o caso TC0001);
  - "Correr agora" (`runs.iniciar`).
- **Aceitar os resultados como esperados**:
  - em cada verificação cujo esperado vem de uma coluna, o executor guarda o valor lido em `ResultadoCaso.valoresLidos` (coluna → valor). Também quando a coluna está vazia: lê o ecrã e o passo fica "ignorado". Nunca guarda colunas com segredos;
  - `src/shared/aceitar.ts` calcula as mudanças (números iguais em formatos diferentes não contam) e aplica-as;
  - IPC `run:aceitar-esperados`, com uma simulação primeiro para a confirmação.
- **Duplicar**: cenário (com os casos) no ecrã Cenários; caso na tabela do editor (ID seguinte livre).
- **Modo simples/avançado**: `localStorage` "uat.modo" (por omissão "simples") → `data-modo` no `<html>`. O CSS esconde no modo simples os ecrãs API e Execução ao vivo, "Ver código", passos de rede, modo print, "Mais opções" do percurso, os blocos de email/manuais e as variáveis calculadas e contadores. Os elementos continuam na página. O smoke e a demo correm sempre em modo avançado (`forcarModo`, IPC `app:modo`); uma escolha explícita em Configurações vale mais.

## 5. Segurança (resumo)

O detalhe e o resultado da revisão do código estão na [auditoria de compliance](AUDITORIA-COMPLIANCE.md).

| Tema | Como está garantido |
|---|---|
| Sem IA, sem telemetria, sem atualizações automáticas | Não há bibliotecas nem chamadas desse tipo (verificado no código e nas dependências). |
| Comunicações | Só com os endereços configurados pelo testador (as aplicações e as APIs). O visualizador de traces usa `127.0.0.1`. |
| Segredos | No **cofre do Windows** (DPAPI), nunca em ficheiros, logs ou relatórios. A interface só grava segredos, nunca os lê. Nos casos fica `{SEGREDO:nome}`. Os blocos com segredos correm sem trace. |
| Janela da app | Isolada; não abre janelas novas, não navega para fora da app, recusa permissões do browser (exceto copiar texto). |
| Produção | O ambiente PRD exige confirmação para gravar e correr. |
| Programas do sistema | A app não executa programas do sistema no uso normal. A medição de desempenho só lê o que o Node já sabe sobre o PC. |
| Dependências | `npm audit`: 0 vulnerabilidades. Licenças em [LICENCAS.md](LICENCAS.md). |

## 5.1 Atenções de compliance (antes de usar num projeto)

> Os UAT devem correr em **ambientes de testes com dados fictícios**. As regras de dados da ferramenta são leves por esse motivo. Usar a ferramenta com dados reais muda as obrigações abaixo.

### 5.1.1 Proteção de dados (RGPD)
- **Dados de teste**: usar sempre dados fictícios (a ferramenta gera NIF, IBAN e emails de teste válidos: `NIF()`, `IBAN()`, `EMAIL()`). Não carregar listagens reais de clientes nos casos.
- **Evidências**: prints, traces e respostas de API guardam o que aparece no ecrã e nas respostas. Com dados reais, passam a ser dados pessoais: a pasta `execucoes/` tem de seguir a política de retenção e de acesso da empresa. A ferramenta **não apaga execuções automaticamente** nem mascara prints (fica para mais tarde, só se for pedido).
- **Onde guardar o projeto**: numa pasta com acesso controlado (pasta de equipa ou repositório Git interno). O `.gitignore` criado exclui `execucoes/`.
- **Caixas de email de teste**: usar caixas dedicadas a testes; o bloco de email lê apenas emails chegados depois do início do caso.

### 5.1.2 Segurança da informação
- **Contas de teste**: usar contas próprias para testes, com os mínimos privilégios; nunca credenciais pessoais ou de produção.
- **Segredos**: só no cofre; não escrever passwords em colunas de Excel nem em valores fixos (o gravador obriga as passwords a virem de uma coluna e marca o passo como secreto). Os segredos não viajam com o projeto (é preciso preenchê-los em cada PC).
- **Chaves TOTP**: a chave da app autenticadora de uma conta de teste é um segredo; guardar só em contas de teste e restringir o acesso aos dados do caso.
- **Certificados de cliente (mTLS)**: guardar o `.pfx` numa pasta controlada; a password fica no cofre. Atenção: estes pedidos não passam pelo proxy do Windows.
- **Produção**: por regra, não correr em PRD. Se for mesmo necessário, só com autorização e sabendo que as execuções criam dados (pedidos, pagamentos simulados, etc.).

### 5.1.3 Rastreabilidade e auditoria
- Cada execução regista **quem** (utilizador do Windows), **quando**, **em que ambiente** e **o quê** (`run.log`, `run.json`), com evidências por caso.
- O **PDF para assinatura** reúne execução, ambiente, executor, resultado por requisito (ID do requisito no cenário) e espaço para a decisão (Aceite / Aceite com reservas / Recusado) e assinaturas.
- Os ficheiros JSON do projeto são legíveis e versionáveis (Git): as alterações aos testes ficam auditáveis pelo histórico do repositório.
- Fica por fazer, só se for pedido: auditoria detalhada de quem altera cada bloco dentro da ferramenta.

### 5.1.4 Software e licenças
- 165 componentes de código aberto, quase todos MIT, ISC, Apache-2.0 ou BSD ([lista](LICENCAS.md), gerada por `npm.cmd run licencas`). `jszip` tem licença dupla (MIT ou GPL-3.0): aplica-se a MIT.
- **Sem IA**, sem telemetria, sem atualizações automáticas.
- O executável não está assinado: a IT pode assiná-lo com o certificado interno antes de o distribuir.

### 5.1.5 Uso no PC da empresa
- Validar primeiro com o `UAT-Studio-Diagnostico.exe`.
- Se for bloqueado, pedir à IT um ambiente aprovado (VM ou máquina de testes). **Nunca contornar os controlos** (por exemplo, com uma VM por conta própria).

### 5.1.6 Checklist antes de usar num projeto
- [ ] Ambiente de testes com dados fictícios confirmado.
- [ ] Contas de teste dedicadas (FO, BO, APIs, caixa de email) com privilégios mínimos.
- [ ] Segredos preenchidos no cofre deste PC (nunca no Excel).
- [ ] Pasta do projeto com acesso controlado; política de retenção definida para `execucoes/`.
- [ ] Ambiente PRD marcado como tal (correr em PRD exige confirmação).
- [ ] Ficha de segurança e licenças entregues à equipa de segurança; `.exe` assinado pela IT (se exigido).
- [ ] IDs de requisito preenchidos nos cenários (para o PDF de assinatura).

## 6. Desempenho

### O que pesa
Medido num Ryzen 7 com 16 núcleos e 15 GB de memória, a correr os 6 casos do exemplo "Simular crédito" em background (a app e todos os Edge que ela abre):

| | Tempo (6 casos) | Memória | Processador (média / pico) |
|---|---|---|---|
| Parada | — | ~330 MB | 0% |
| 1 de cada vez | 67 s | ~0,9 GB | 3% / 8% |
| 2 em paralelo | 41 s | ~1,0 a 1,2 GB | 5% / 13% |
| 4 em paralelo | 27 s | ~1,3 a 1,6 GB | 8% / 22% |

- **A memória é o recurso que conta**: cada caso em paralelo é um Edge à parte (~150 a 250 MB).
- **O processador é pouco usado**: os testes passam a maior parte do tempo à espera da aplicação.
- Em background não há janelas, por isso o PC continua utilizável.

### O que a ferramenta mede (`src/main/desempenho.ts`)
- **Processador do PC**: pela diferença entre duas leituras dos tempos dos núcleos (`os.cpus()`).
- **Memória do PC**: total e livre (`os.totalmem()`, `os.freemem()`). A memória dos Edge dos testes conta na memória usada do PC.
- **Memória da própria app**: `app.getAppMetrics()` do Electron (sem os browsers).
- **Durante cada execução**: uma amostra de 5 em 5 segundos. O resumo (memória livre mínima, % de memória em uso no pico, processador médio e máximo, duração média de um caso) fica em `run.json` (`desempenho`), no `run.log` e nos relatórios.
- **Sugestão de paralelo** (`sugerirParalelo`): o maior número entre 1, 2, 4 e 8 que cabe na memória livre, contando ~250 MB por caso e deixando sempre 1 GB livre para o Windows. Se o pedido passar disso, o ecrã Execuções avisa antes de correr e propõe o número seguro.
- **Painel** em Configurações › Desempenho do PC: os valores atuais (atualizados de 2 em 2 segundos enquanto está aberto), a sugestão e as últimas execuções.
- A medição **não executa programas do sistema**, para manter o que diz a auditoria.

## 7. Testes

| Comando | O que faz |
|---|---|
| `npm.cmd test` | Testes unitários: fórmulas, decimal, importadores, cobertura, sugestões, pacotes, TOTP, XML, OAuth/PKCE, mTLS, email, widgets, parametrizar, defeitos, desempenho. |
| `npm.cmd run smoke` | Usa a app como um utilizador: janela real, Edge real, apps de teste OutSystems e servidor de teste local. Cerca de 15 a 20 minutos. |
| `npm.cmd run exemplo:testar` | Corre o projeto de exemplo contra as apps de teste. |
| `npm.cmd run wiki:testar` | Corre as 16 provas da Wiki de componentes. |
| `npm.cmd run exe:verificar` | Confirma que o `.exe` portátil abre e controla o Edge. |

As apps de teste (Simulador, Portal de Crédito e Catálogo de Componentes) estão num ambiente OutSystems de desenvolvimento só com dados fictícios. A especificação delas está no repositório `outsystems-simulador-poc`.

## 8. Comandos e manutenção

| Comando | O que faz |
|---|---|
| `npm.cmd start` | Compila e abre a app. |
| `npm.cmd run exe` | Gera o `UAT-Studio.exe` portátil (`out/app/`). |
| `npm.cmd run diagnostico:exe` | Gera o `.exe` de diagnóstico para o PC da empresa. |
| `npm.cmd run demo` | Grava os vídeos da demo e o guia ilustrado (`out/demo/`). |
| `npm.cmd run licencas` | Atualiza a lista de componentes e licenças. |

Cuidados:
- Neste PC, o PowerShell não corre scripts `.ps1`: usar `npm.cmd` e `npx.cmd`, sem mudar a política de execução.
- Ao mudar de versão do `playwright-core`, confirmar o "Abrir trace", que usa um servidor interno do Playwright.
- Ao acrescentar uma dependência: `npm.cmd run licencas`, `npm audit` e rever a ficha de segurança.
- **Sempre que houver uma funcionalidade nova: atualizar este manual e o manual do utilizador** (e "Novidades" abaixo).

## 9. Limites conhecidos

- Um número só com ponto e 3 casas ("1.234") é lido como milhares (formato pt-PT).
- A primeira execução depois de um ambiente OutSystems estar parado pode falhar por lentidão: repetir.
- O email por IMAP (Gmail) não está implementado; só a API ao estilo do Microsoft Graph.
- "Abrir o browser de um worker" não existe (em background não há janela); há miniaturas ao vivo.
- O executável não está assinado: a IT pode assiná-lo com o certificado da empresa.

## 10. Novidades

| Data | O que mudou |
|---|---|
| 13/11/2026 | **Simplificar**: assistente "Novo teste" (4 passos, do zero a um teste a correr), aceitar os resultados como esperados (linha de base, também para colunas vazias), duplicar cenários e casos, modo simples/avançado. |
| 13/11/2026 | **Desempenho**: medição do PC durante cada execução (resumo no detalhe, no `run.log` e nos relatórios), aviso antes de correr quando o paralelo não cabe na memória livre, painel em Configurações › Desempenho do PC. Manuais do utilizador e técnico. |
| 12/11/2026 | Interface: linguagem de QA (cenários de teste, execuções), ecrã Início, faixa do ambiente, estados com símbolos, separadores no editor, "Mais opções", filtros, detalhe do caso ao lado, pesquisa rápida (Ctrl+K), ajudas "i", modo escuro, tutorial guiado. |
| 12/11/2026 | Transformar valores fixos em colunas, descrições de cenários e blocos, "Criar defeito", segredos de teste no cofre, endurecimento da janela, auditoria de compliance. |
| 12/11/2026 | Widgets do OutSystems UI (calendários, listas com pesquisa, sliders, estrelas, grupos), Catálogo de Componentes e 11 receitas novas na Wiki. |
| 11/11/2026 | Wiki de componentes, ações do browser (carregar, descarregar, separadores, perguntas, iframes), modo demo com vídeos. |
| 10–11/11/2026 | Fases 1 a 4: gravador, editor, executor, relatórios, fórmulas, APIs (OAuth, PKCE, mTLS, XML), email, mapa ao vivo, cobertura, passo manual, pacotes, PDF para assinatura, executável portátil. |
