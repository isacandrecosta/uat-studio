# UAT Studio: documentação técnica e de compliance

Para quem mantém a ferramenta, para a equipa de segurança e para quem a aprova num projeto. Complementa a [especificação](ESPECIFICACAO.md) (o quê), a [ficha de segurança](FICHA-SEGURANCA.md) (resumo para aprovação) e o [guia de instalação](GUIA-INSTALACAO.md).

---

## 1. Visão geral

| | |
|---|---|
| O que é | Aplicação desktop **portátil** para Windows que grava e corre testes de aceitação (UAT) e de regressão de aplicações web (OutSystems) e das suas APIs. |
| Para quem | Equipas de QA/UAT que não programam. |
| Tecnologia | Electron 45 (Chromium + Node.js), TypeScript, Playwright (`playwright-core`) a controlar o **Microsoft Edge instalado**, ExcelJS, @xmldom/xmldom + xpath. |
| Princípios | **Offline e sem IA** (regras explícitas); dados do projeto em **ficheiros JSON legíveis**; **segredos num cofre local encriptado**; evidência completa de cada execução. |
| Resultados | **OK** (tudo coincide) · **KO** (chegou ao fim, mas um valor difere) · **ERRO** (não chegou ao fim). |

## 2. Arquitetura

```
┌────────────────────────── UAT-Studio.exe (Electron) ──────────────────────────┐
│ Interface (renderer, sandbox)        Processo principal (Node.js)              │
│  src/renderer/                        src/main/                                │
│   app.ts, ecras/*.ts  ── IPC ──►      projeto/ (repositório JSON, pacotes)     │
│   (sem acesso a ficheiros              gravador/ (gravação no browser)          │
│    nem à rede)         ◄── eventos ── executor/ (execuções, relatórios, PDF)   │
│                                        api/ (pedidos HTTP, OAuth, mTLS, XML)    │
│  src/shared/ (lógica pura usada        email/ (Microsoft Graph)                 │
│   pelos dois lados: fórmulas,          cofre.ts (safeStorage / DPAPI)           │
│   decimal exato, mapa, cobertura…)     motor/ (localizar e agir em elementos)   │
└───────────────────────────────┬────────────────────────────────────────────────┘
                                │ Playwright (pipe local, sem rede)
                      Microsoft Edge instalado (perfil temporário)
```

- **Separação de privilégios**: a interface corre em sandbox (`contextIsolation`, sem `nodeIntegration`) e só chama o que o `preload.ts` expõe (IPC com nomes fixos). Política de segurança do conteúdo: `default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:`.
- **Lógica partilhada** (`src/shared/`) é código puro, sem Electron: compilado para os dois lados e testado com `node:test`.
- **Um só motor** para gravar e para correr (`src/main/motor/`): o que se grava é o que se executa.

## 3. Modelo de dados (pasta do projeto)

```
<projeto>/
  projeto.json            nome, ambientes (DEV/QA/PRD), ambiente ativo
  aplicacoes/*.json       sistemas a testar: tipo (FO/BO/API/EMAIL) e endereço por ambiente
  epicos/*.json           pastas de jornadas
  jornadas/*.json         percurso de blocos (com parâmetros, "só se", limpeza, sessão)
  blocos/*.json           blocos reutilizáveis: UI (passos), API (pedido), EMAIL, MANUAL
  casos/<jornada>.json    variantes (uma linha de dados por caso)
  perfis/*.json           perfis de autenticação SEM segredos
  variaveis.json          variáveis calculadas por fórmula
  contadores.json         contadores persistentes
  execucoes/              resultados (fora do Git por omissão: .gitignore)
```

Um ficheiro por item (bom para Git e pastas partilhadas, menos conflitos). Ids = "slug" do nome.

**Execução** (`execucoes/<data>_<hora>_runN_<nome>/`): `run.json` (estado completo), `run.log`, `relatorio.xlsx`, `relatorio.html`, `relatorio-assinatura.pdf` (a pedido) e, por caso, `casos/<jornada>/<caso>/`: `caso.log`, `eventos.jsonl`, prints por bloco, `erro.png`, `trace-N.zip` (Playwright), `api/*.request.json|response.json`, `email/*.json|html`, anexos de passos manuais.

## 4. Fluxos principais

### 4.1 Gravar
O gravador abre o Edge na aplicação e injeta um script (shadow DOM, sem `innerHTML`, compatível com CSP) que realça o elemento e abre um popup. Para cada elemento recolhe **vários localizadores** por ordem de preferência: `data-testid` (incluindo o do DIV à volta nos widgets OutSystems) → etiqueta → papel + nome → placeholder → texto → id → caminho CSS. Ao confirmar, guarda só os localizadores que encontram **exatamente** aquele elemento e **executa o passo a sério** antes de o gravar. Alternativas: **modo print** (gravar sobre uma captura do ecrã, sem executar) e **regravar um elemento** (repete os passos anteriores com os dados de um caso).

### 4.2 Correr
1. **Verificação antes de correr** (sem browser): blocos, colunas, fórmulas, endereços, perfis e segredos, certificados, aviso de produção.
2. Workers em paralelo (1/2/4/8); cada caso corre num **contexto de browser limpo** (um por "sessão" da jornada).
3. Antes de cada passo espera que os pedidos da página acalmem (os ecrãs OutSystems carregam dados depois de aparecerem). Pausas só **entre passos**.
4. Verifica **todos** os valores antes de dar KO; números em **decimal exato** (formato pt-PT ou com ponto; tolerância configurável; arredondamento ao par como o `Round()` do OutSystems).
5. Depois de um erro, só correm os blocos marcados "limpeza: corre sempre".
6. No fim: relatórios, comparação com execuções anteriores, sugestões por regras e localizadores a reparar.

### 4.3 APIs, email e serviços externos
- Pedidos HTTP pelo `net.fetch` do Electron (**proxy e certificados do Windows**); com certificado de cliente (mTLS) pelo HTTPS do Node (sem proxy).
- OAuth 2.0: client credentials, password, refresh token, **Authorization Code + PKCE** (login num Edge visível; sessão = refresh token no cofre). Tokens reutilizados por execução, renovados ao expirar ou após um 401.
- Respostas JSON (caminhos; **campo em falta = 0**, regra da API REST do OutSystems) e XML/SOAP (XPath, sem prefixos).
- Email: API ao estilo do Microsoft Graph (esperar, verificar, extrair, por exemplo um código de MFA).
- No browser: **intercetar** pedidos enviados pela aplicação e **simular** respostas de APIs externas (`context.route`).

## 5. Segurança e proteção de dados

| Controlo | Implementação | Onde ver |
|---|---|---|
| Segredos fora dos ficheiros | Client secrets, passwords, tokens, chaves, password do certificado e sessões PKCE ficam no **cofre** (`safeStorage` → **DPAPI** do Windows, por utilizador), em `%APPDATA%\UAT Studio\cofre\<hash da pasta do projeto>.json`. A interface só grava e pergunta "está preenchido?"; nunca lê. | `src/main/cofre.ts` |
| Segredos mascarados | Tudo o que é registado (logs, evidências de API, relatórios) passa por um mascaramento (`***`) dos valores secretos e dos tokens; `Set-Cookie` nunca é guardado. | `src/main/api/pedidos.ts` |
| Trace sem passwords | Blocos com passos secretos correm **sem trace**; o browser do login PKCE não tem trace. | `src/main/executor/correrCaso.ts`, `src/main/api/login.ts` |
| Sessões de login | `storageState` reutilizado entre casos **só em memória**; chave = hash dos dados de entrada (sem passwords em claro). | `correrCaso.ts` |
| Produção | Tipo de ambiente DEV/QA/PRD; gravar e correr em PRD pedem confirmação; o "testar" individual de API está bloqueado em PRD. | `gravador.ts`, `execucao.ts`, `api/ambiente.ts` |
| Pacotes exportados | Levam blocos, aplicações e perfis, **nunca segredos**; importar não altera aplicações/perfis existentes. | `src/shared/pacotes.ts` |
| Importações | cURL/Postman: cabeçalhos `Authorization` e passwords **não são importados** (aviso para usar um perfil). | `src/shared/importar.ts` |
| Rede | Sem telemetria, sem atualizações automáticas; só os endereços configurados. Porta local `127.0.0.1` apenas para o visualizador de traces. | ficha de segurança |
| Browser | Edge instalado, **perfil temporário**; não toca no perfil do utilizador. | `playwright-core` |
| Interface | Sandbox, `contextIsolation`, CSP restritiva, sem HTML injetado (texto sempre como texto). | `src/main/main.ts`, `src/renderer/dom.ts` |

## 6. Atenções de compliance

> Os UAT devem correr em **ambientes de testes com dados fictícios**. As regras de dados da ferramenta são leves por esse motivo. Usar a ferramenta com dados reais muda as obrigações abaixo.

### 6.1 Proteção de dados (RGPD)
- **Dados de teste**: usar sempre dados fictícios (a ferramenta gera NIF, IBAN e emails de teste válidos: `NIF()`, `IBAN()`, `EMAIL()`). Não carregar listagens reais de clientes nos casos.
- **Evidências**: prints, traces e respostas de API guardam o que aparece no ecrã e nas respostas. Com dados reais, passam a ser dados pessoais: a pasta `execucoes/` tem de seguir a política de retenção e de acesso da empresa. A ferramenta **não apaga execuções automaticamente** nem mascara prints (fica para mais tarde, só se for pedido).
- **Onde guardar o projeto**: numa pasta com acesso controlado (pasta de equipa ou repositório Git interno). O `.gitignore` criado exclui `execucoes/`.
- **Caixas de email de teste**: usar caixas dedicadas a testes; o bloco de email lê apenas emails chegados depois do início do caso.

### 6.2 Segurança da informação
- **Contas de teste**: usar contas próprias para testes, com os mínimos privilégios; nunca credenciais pessoais ou de produção.
- **Segredos**: só no cofre; não escrever passwords em colunas de Excel nem em valores fixos (o gravador obriga as passwords a virem de uma coluna e marca o passo como secreto). Os segredos não viajam com o projeto (é preciso preenchê-los em cada PC).
- **Chaves TOTP**: a chave da app autenticadora de uma conta de teste é um segredo; guardar só em contas de teste e restringir o acesso aos dados do caso.
- **Certificados de cliente (mTLS)**: guardar o `.pfx` numa pasta controlada; a password fica no cofre. Atenção: estes pedidos não passam pelo proxy do Windows.
- **Produção**: por regra, não correr em PRD. Se for mesmo necessário, só com autorização e sabendo que as execuções criam dados (pedidos, pagamentos simulados, etc.).

### 6.3 Rastreabilidade e auditoria
- Cada execução regista **quem** (utilizador do Windows), **quando**, **em que ambiente** e **o quê** (`run.log`, `run.json`), com evidências por caso.
- O **PDF para assinatura** reúne execução, ambiente, executor, resultado por requisito (ID do requisito na jornada) e espaço para a decisão (Aceite / Aceite com reservas / Recusado) e assinaturas.
- Os ficheiros JSON do projeto são legíveis e versionáveis (Git): as alterações aos testes ficam auditáveis pelo histórico do repositório.
- Fica por fazer, só se for pedido: auditoria detalhada de quem altera cada bloco dentro da ferramenta.

### 6.4 Software e licenças
- 165 componentes de código aberto, quase todos MIT, ISC, Apache-2.0 ou BSD ([lista](LICENCAS.md), gerada por `npm.cmd run licencas`). `jszip` tem licença dupla (MIT ou GPL-3.0): aplica-se a MIT.
- **Sem IA**, sem telemetria, sem atualizações automáticas.
- O executável não está assinado: a IT pode assiná-lo com o certificado interno antes de o distribuir.

### 6.5 Uso no PC da empresa
- Validar primeiro com o `UAT-Studio-Diagnostico.exe`.
- Se for bloqueado, pedir à IT um ambiente aprovado (VM ou máquina de testes). **Nunca contornar os controlos** (por exemplo, com uma VM por conta própria).

### 6.6 Checklist antes de usar num projeto
- [ ] Ambiente de testes com dados fictícios confirmado.
- [ ] Contas de teste dedicadas (FO, BO, APIs, caixa de email) com privilégios mínimos.
- [ ] Segredos preenchidos no cofre deste PC (nunca no Excel).
- [ ] Pasta do projeto com acesso controlado; política de retenção definida para `execucoes/`.
- [ ] Ambiente PRD marcado como tal (correr em PRD exige confirmação).
- [ ] Ficha de segurança e licenças entregues à equipa de segurança; `.exe` assinado pela IT (se exigido).
- [ ] IDs de requisito preenchidos nas jornadas (para o PDF de assinatura).

## 7. Robustez e limites conhecidos
- Localizadores: com o preferido a falhar, usa uma alternativa ao fim de 3 s e regista-a; "Reparar" põe a alternativa em 1.º lugar.
- Um número só com ponto e 3 casas ("1.234") é lido como milhares (formato pt-PT).
- A 1.ª execução depois de um ambiente ODC estar parado pode falhar por lentidão: repetir.
- O IMAP (Gmail) não está implementado (só a API ao estilo do Microsoft Graph).
- "Abrir o browser de um worker" não existe (em background não há janela); há miniaturas ao vivo no mapa.

## 8. Testes e qualidade
- `npm.cmd test`: testes unitários (fórmulas, decimal, importadores, cobertura, sugestões, pacotes, TOTP com os valores da RFC 6238, XML/SOAP, PKCE, mTLS e email contra o servidor de teste local).
- `npm.cmd run smoke`: usa a app como um utilizador (janela real, Edge real, app POC em OutSystems e servidor de teste local) e confirma resultados e evidências.
- `npm.cmd run exe:verificar`: confirma que o `.exe` portátil abre e controla o Edge.

## 9. Manutenção
- Comandos em `README.md`. Estado e decisões em `CLAUDE.md`; plano em `ROADMAP.md`.
- Ao mudar de versão do `playwright-core`, confirmar o "Abrir trace" (usa um servidor interno do Playwright; se mudar, a app abre a pasta em vez da janela).
- Ao acrescentar uma dependência: correr `npm.cmd run licencas` e rever a ficha de segurança.
