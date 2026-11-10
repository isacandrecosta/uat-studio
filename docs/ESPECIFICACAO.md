# UAT Studio: especificação funcional

## 1. Conceitos

| Conceito | O que é |
|---|---|
| **Projeto** | Uma pasta escolhida pelo utilizador com tudo: definições, blocos, jornadas, dados, execuções. |
| **Aplicação** | Um sistema a testar: Portal Front Office, Backoffice, API, Caixa de email. Cada uma tem URL por ambiente (DEV/QA) e perfis de login ou de autenticação. Tem uma **cor** (FO azul, BO laranja, API verde, Email roxo). |
| **Épico** | Pasta temática de jornadas (por exemplo, "Crédito Pessoal"). |
| **Jornada** | Sequência de blocos que pode atravessar várias aplicações (FO → BO → API → Email). |
| **Bloco** | Unidade **reutilizável** com parâmetros. Tipos: **UI** (passos gravados), **API** (pedido HTTP), **Email** (esperar e validar email), **Verificação**. É alterado num sítio e todas as jornadas que o usam ficam atualizadas. |
| **Caso** | Jornada + uma linha de dados (uma variante). Os dados do caso alimentam **todos** os blocos (UI e API). |
| **Variável** | `{Nome}`, vinda de: coluna do Excel, fórmula, gerador, capturada durante a jornada (do ecrã ou da resposta de uma API) ou do ambiente. |
| **Execução (run)** | Correr um caso, uma jornada, um épico ou uma seleção. Gera uma pasta com evidências e logs. |

Exemplo de composição:
```
Jornada "Registar cliente"
  1. Login FO            (bloco UI, partilhado)   usa {Perfil}
  2. Registar cliente    (bloco UI)               usa {Nome}, {NIF}, {Email}
  3. Submeter cliente    (bloco API: POST /clientes) corpo com {Nome}, {NIF}, {Email}; guarda {ClienteId}
  4. Validar email       (bloco Email, partilhado) para {Email}, contém {ClienteId}
```

## 2. Blocos de API
- Métodos **GET, POST, PUT, PATCH, DELETE**; URL, parâmetros, cabeçalhos e corpo (JSON/XML) com `{variáveis}` do caso.
- **Perfis de autenticação** reutilizáveis:
  - **OAuth 2.0**: Client Credentials, Password, Authorization Code + PKCE (abre o browser), Refresh Token. O token é pedido, guardado em memória e renovado automaticamente.
  - API Key, Basic, Bearer fixo, certificado de cliente (mTLS).
- **Verificações**: código HTTP, campo da resposta (JSONPath / XPath) com igual, contém, maior, menor ou regex, esquema e tempo de resposta.
- **Guardar da resposta** → variável para os blocos seguintes.
- **Testar individualmente** no separador Blocos (como o Postman): escolher um caso de exemplo para preencher as variáveis e enviar.
- **Importar** de cURL, OpenAPI/Swagger ou coleção Postman.
- Modos extra (fase posterior), dentro de uma jornada de UI:
  - **Intercetar** o pedido que a app envia ao clicar (por exemplo, para o Easypay) e verificar os dados.
  - **Simular a resposta** de uma API externa (aprovado / recusado / timeout) e verificar o que o ecrã mostra.
- Protocolos: REST e SOAP. Outros (RFC SAP, filas) só se forem precisos.

## 3. Gravação de blocos de UI
- Abre o Edge ou o Chrome na aplicação. O utilizador passa o rato e o elemento fica realçado. Ao clicar abre-se um **popup**:
  - campo de texto → valor: **Fixo / Coluna Excel / Fórmula / Gerador**;
  - dropdown → escolher a opção (fixa ou de uma variável);
  - checkbox/switch → marcar/desmarcar (fixo ou de uma variável S/N);
  - botão/link → clicar;
  - qualquer elemento → **Verificar** (texto, valor, visível) ou **Guardar como variável**.
- Ações extra: mudar de aplicação ou portal (outro separador ou sessão), esperar por mensagem de sucesso ou erro, upload, download e validação do ficheiro, escolher datas.
- Para cada elemento guarda **vários localizadores** e uma miniatura (print do elemento).
- Modo "print" (fase posterior): trabalhar sobre a captura do ecrã, guardando também a estrutura da página por baixo.

## 4. Dados de teste
- Fórmulas com sintaxe de Excel: `"empresa_" & {TESTE} & "_" & {DATA:yyyyMMdd} & "_" & {CONTADOR:empresa}`.
- Marcadores: `{TESTE}` (ID do caso), `{RUN}`, `{DATA:formato}`, `{HOJE+N:formato}`, `{CONTADOR:nome}` (persistente entre execuções), `{ALEATORIO:n}`.
- Geradores: NIF válido, IBAN de teste, número entre mínimo e máximo, email `qa+{perfil}.{TESTE}.{RUN}@dominio`.
- Importar e exportar casos em Excel.

## 5. Execuções
- **Âmbito**: caso, jornada, épico, seleção, "repetir só KO/ERRO".
- **Opções**: browser (Edge/Chrome), **visível ou em background**, paralelo (1/2/4/8), velocidade (normal / lenta / passo a passo), nível de evidências, pausar no 1.º ERRO, ambiente.
- **Controlo** (por run, jornada, caso ou worker): pausar (entre passos), continuar, parar, saltar caso.
- **Mapa ao vivo**: grafo Épico → Jornadas → Blocos, com cor por estado (OK verde, KO vermelho, ERRO amarelo, a correr azul a pulsar, por correr cinzento) e cor por aplicação. Vistas por Épico, Jornada e Caso. Miniatura ao vivo de cada worker, e "abrir browser" de um worker.

### Pasta de cada execução
```
<projeto>/execucoes/2026-11-10_1356_run128_CreditoPessoal/
  run.json               resumo: âmbito, opções, totais, duração
  run.log                log legível de toda a execução
  relatorio.xlsx         1 linha por caso (esperado vs obtido, OK/KO/ERRO)
  relatorio.html         relatório visual
  casos/
    TC0211/
      caso.log           log detalhado do caso (cada passo, tempos, valores usados)
      eventos.jsonl      o mesmo log em formato estruturado
      01_login-fo.png ... 07_email.png   print por bloco
      trace.zip          gravação passo a passo (Playwright trace)
      api/06_consultar-pagamento.request.json / .response.json  (segredos mascarados)
      email/07_notificacao.eml
```
Os logs e as evidências são mostrados na interface ao abrir os detalhes de uma execução ou de um caso.

### Log de erro (formato)
- **O que aconteceu** (frase simples, gerada por regras para os erros conhecidos: 401/403/404/5xx, timeout, elemento não encontrado, valor diferente, email não recebido).
- **Onde**: jornada → bloco → passo, e que blocos ficaram por executar.
- **Detalhe**: esperado vs obtido; pedido e resposta HTTP; localizador tentado e alternativa usada; print do momento.
- **Sugestão** e ações: copiar log, abrir trace, repetir só este caso.

## 6. Login, MFA e email
- Login uma vez por execução e perfil, com sessão reutilizada (`storageState`).
- MFA: preferir o "modo de teste" em QA (código fixo / endpoint). Alternativas: ler o código da caixa de email de testes; TOTP a partir da chave secreta.
- Caixa de email dedicada com endereços `+perfil.caso.run`. Leitura por IMAP (POC com Gmail dedicado) ou Microsoft Graph (empresa).

## 7. Ecrãs
1. Jornadas (épicos, lista de jornadas, blocos partilhados, correr épico ou seleção)
2. Editor de jornada (percurso de blocos por aplicação, biblioteca de blocos para arrastar, variáveis, casos)
3. Blocos de API (construtor de pedidos, perfis de autenticação, teste individual, log)
4. Gravar
5. Dados de teste (variáveis, fórmulas com pré-visualização, contadores)
6. Runs e resultados (opções, progresso, casos, histórico, detalhes e logs)
7. Mapa de execução (grafo ao vivo e controlos)

Cada ecrã de bloco ou jornada tem "Ver código (.ts)".
