# UAT Studio: manual do utilizador

Para quem cria e corre testes. Não é preciso saber programar.
Para a parte técnica (como funciona por dentro, segurança, manutenção), ver o [manual técnico](MANUAL-TECNICO.md).

> Este manual é atualizado sempre que a ferramenta ganha uma funcionalidade nova. Última atualização: 18/11/2026 (passos alteráveis no editor do cenário, fórmulas nos casos e no Excel, EMAIL com base própria, sem Gmail).

---

## 1. O que é

O UAT Studio cria e corre **testes de aceitação (UAT) e de regressão** de aplicações OutSystems (e das suas APIs) **com cliques**: grava-se o que se faz no browser uma vez e depois corre-se com muitos dados diferentes.

- Funciona **neste PC**, sem internet para a ferramenta e **sem inteligência artificial**.
- Usa o **Microsoft Edge** que já está instalado.
- Guarda tudo numa **pasta de projeto** (ficheiros simples, bons para partilhar ou guardar em Git).

## 2. As ideias principais (em 1 minuto)

| Palavra | O que é | Exemplo |
|---|---|---|
| **Projeto** | Tudo o que se testa de um sistema. | "Portal de Crédito" |
| **Ambiente** | Onde se testa: DEV, QA ou PRD (produção). | QA |
| **Aplicação** | Um sistema a testar, com o endereço em cada ambiente. | Front Office, Backoffice, API |
| **Épico** | Uma pasta de cenários sobre o mesmo tema. | "Crédito Pessoal" |
| **Cenário de teste** | Um percurso do princípio ao fim. | "Pedir crédito e aprovar no backoffice" |
| **Bloco** | Uma peça reutilizável do percurso. Grava-se **uma vez** e usa-se em muitos cenários. | "Login", "Simular", "Aprovar" |
| **Caso de teste** | Uma linha de dados: o cenário corre uma vez por caso. | TC0001: 5 000 € a 24 meses |

Cada caso dá um de três resultados:

| | Significa |
|---|---|
| **✓ Passou** (OK) | Chegou ao fim e todos os valores coincidem com o esperado. |
| **✗ Falhou** (KO) | Chegou ao fim, mas pelo menos um valor é diferente do esperado. **É aqui que aparecem os defeitos.** |
| **! Bloqueado** (ERRO) | Não chegou ao fim (um campo não apareceu, a página deu erro, a rede falhou...). |

## 3. O ecrã

- **Barra lateral**: o menu, **Procurar (Ctrl+K)**, **Configurações**, a lista **Projeto** e a lista **Ambiente**.
- **Faixa colorida no topo**: diz sempre onde se está a testar. **Verde DEV, azul QA, vermelho PRODUÇÃO.**
- **Caminho por baixo da faixa** (por exemplo "Projeto › Épico › Cenário"): o nome do projeto leva de volta ao Início.

O menu está pela ordem do trabalho:

| Ecrã | Para quê |
|---|---|
| **1. Início** | Ponto da situação: quantos cenários e casos, como correu a última execução, o que precisa de atenção, atalhos. Num projeto vazio, os primeiros passos por ordem. |
| **2. Cenários** | Épicos e cenários, blocos partilhados (cada um com "Como usar"), aplicações e os seus endereços. |
| **3. Editor do cenário** | Três separadores: **Resumo** (nome, etiquetas, requisito, descrição), **Passos** (os blocos por ordem) e **Casos de teste** (a tabela de dados, Excel). |
| **4. Gravar** | Gravar blocos no browser com cliques. |
| **5. Blocos de API** | Pedidos às APIs (GET, POST...), perfis de autenticação e botão **Testar**. |
| **6. Dados de teste** | Fórmulas, geradores (NIF, IBAN, emails), caixa de email de testes, segredos de teste e contadores. |
| **7. Execuções** | Correr testes, ver resultados, evidências, defeitos, relatórios e histórico. |
| **8. Execução ao vivo** | Acompanhar uma execução em curso, com o browser de cada caso em miniatura. |

## 4. Primeira vez

1. Ao abrir um projeto pela primeira vez aparece o **tutorial guiado**, que mostra, passo a passo, como se constrói um teste de ponta a ponta. Pode saltá-lo (botão ou tecla Esc) e retomá-lo em **Configurações › Tutorial**.
2. Na lista **Projeto** há dois projetos prontos para aprender:
   - **Projeto de exemplo**: casos de uso completos (simulador, dois portais com aprovação, serviços externos, APIs, passo manual). Abra um cenário no editor para ver como está montado e corra-o em Execuções.
   - **Wiki de componentes OutSystems**: uma "receita" para cada componente (campos, listas, calendários, sliders, tabelas, popups...) com uma prova que confirma que funciona.

   Ambos se apagam na mesma lista quando já não forem precisos.
3. **Num PC novo (por exemplo, o da empresa)**: copie o `UAT-Studio.exe` e a pasta do projeto; os segredos (passwords, sessões) têm de ser preenchidos outra vez nesse PC. O passo a passo está no guia de instalação ("Levar para o PC da empresa").

## 5. Construir um teste, passo a passo

### 5.0 O caminho mais rápido: "Novo teste"
No **Início**, o botão **+ Novo teste** abre um assistente que faz tudo numa só janela, em 4 passos:
1. **O que testar**: o nome do teste, a aplicação (ou uma nova, com o endereço) e o épico.
2. **Gravar**: o Edge abre a aplicação. Faça o teste como faria à mão (no popup: "Escrever" nos campos, "Clicar" nos botões, "Verificar" nos resultados). A janela mostra quantos passos já gravou. No fim, **Terminar e guardar**.
3. **O que varia**: marque o que muda de caso para caso (por exemplo o valor ou o produto). Cada valor marcado passa a ser uma coluna dos casos de teste (e do Excel).
4. **Correr**: **Correr agora** confirma que o teste passa, ou **Abrir no editor** para acrescentar casos.

Depois, para criar muitos casos: Editor do cenário › Casos de teste › **Exportar Excel**.

As secções seguintes explicam cada peça em pormenor, para quem quiser fazer passo a passo ou afinar um teste.

### 5.1 Registar a aplicação
Ecrã **Cenários › Aplicações › Nova aplicação**: nome, tipo (Front Office, Backoffice, API, Email) e o **endereço no ambiente ativo**. Mude de ambiente e preencha o endereço de cada um: o mesmo teste corre em DEV e em QA.

### 5.2 Gravar os passos
1. Ecrã **Gravar**: escolha a aplicação, dê um nome ao bloco ("Login", "Criar empresa") e carregue em **Gravar**. O Edge abre a aplicação.
2. Clique num campo, lista ou botão. Abre-se um **popup**:
   - **o que fazer**: Escrever, Escolher, Marcar, Clicar, Verificar ou Guardar variável;
   - **de onde vem o valor**: **valor fixo**, **coluna dos dados** (vem do Excel) ou **fórmula**.
3. O passo é **executado logo**, para confirmar que funciona, e só depois fica gravado.
4. Para valores de resultados (por exemplo a prestação), use **Verificar**: o popup sugere o valor que está no ecrã. Para euros, escolha "Número": as contas são exatas e aceita "86,40" ou "86.40".
5. Carregue em **Guardar o bloco**.

Casos especiais no popup e no editor de passos:
- **Tabelas**: "Tabela: agir na linha que contém um texto" (por exemplo, a linha do pedido {PedidoId}).
- **"Acrescentar outro passo"**: carregar um ficheiro, descarregar e verificar um ficheiro, responder a uma pergunta do browser ("Tem a certeza?"), mudar de separador.
- **"Acrescentar passo de rede"**: simular a resposta de uma API externa ou verificar o que a aplicação envia.
- **Modo print**: gravar sobre uma captura do ecrã, quando a página muda enquanto se tenta clicar.

**Componentes do OutSystems UI que a ferramenta trata sozinha** (basta clicar no componente):

| Componente | Como preencher |
|---|---|
| Calendários (data, intervalo, hora, mês) | Escrever `15/03/2026`, `01/03/2026 a 15/03/2026`, `14:30` ou `03/2026` |
| Listas com pesquisa e de várias escolhas | Escolher pelo texto; várias opções com `;` (`Português; Inglês`) |
| Slider | Escrever `60`; slider de intervalo: `20-80` |
| Grupo de opções, grupo de botões, estrelas | Escolher pelo texto ou pelo número de estrelas |

### 5.3 Gravou com valores fixos? Transforme-os em colunas
É normal gravar "a direito", com os valores que usaria à mão. Depois, no ecrã **Gravar**, abra o bloco e carregue em **Transformar valores fixos em colunas**:
- escolha o que deve variar (o nome de cada coluna já vem sugerido);
- os cenários que usam o bloco ganham essas colunas, com o valor que foi gravado.

### 5.4 Montar o cenário
1. Ecrã **Cenários**: **Novo épico** (se ainda não houver) e, dentro dele, **Novo cenário**.
2. **Editor do cenário › Passos**: na biblioteca à direita, **Acrescentar** os blocos pela ordem certa (as setas mudam a ordem).
3. Cada bloco tem **Parâmetros** (de onde vem cada {valor}) e **Mais opções**:
   - **Só se**: o bloco só corre quando uma condição se cumpre (por exemplo `{Decisao} = "Aprovar"`);
   - **Sessão**: pessoas diferentes no mesmo teste (por exemplo "cliente" e "gestor"), cada uma no seu browser;
   - **Limpeza**: corre sempre, mesmo que um bloco anterior tenha falhado.
4. **Resumo**: descreva o objetivo do teste e preencha o **ID do requisito** (aparece no PDF para assinatura).
5. **Ver e mudar as ações de cada bloco**: abra **Passos (N)** no bloco. Aparecem todas as ações, pela ordem, e pode mudar:
   - a **descrição** de cada passo;
   - **de onde vem o valor**: valor fixo, coluna dos casos ou fórmula (as passwords vêm sempre de uma coluna);
   - o **"Só se"** de cada passo.

   **Atenção:** os blocos são partilhados. Se o bloco for usado noutros cenários, aparece um aviso: mudar um passo aqui muda-o em **todos**. Para mudar um valor **só neste cenário**, use os **Parâmetros** do bloco.

### 5.5 Escrever os casos de teste (e usar o Excel)
**Editor do cenário › Casos de teste**: uma linha por caso, com os dados de entrada e os valores esperados.
- **Exportar Excel** → crie as linhas que quiser (centenas, se for preciso) → **Importar Excel**.
- Colunas especiais: `ID`, `Descricao`, `Etiquetas` (para correr só alguns) e `Executar` (`N` = não importar a linha).
- Uma célula de valor esperado **vazia** quer dizer "não verificar isto neste caso".
- **Fórmulas numa célula**: comece por `=` e a ferramenta calcula o valor **para esse caso**, por exemplo `=EMAIL("cliente")`, `=ARRED({Valor} * 0,015; 2)` ou `="cliente_" & {TESTE}`. Funciona na tabela e no Excel (no Excel aparece `#NOME?` nessas células, porque o Excel não conhece as funções do UAT Studio: é normal, e a importação guarda a fórmula).
- **Na exportação para Excel** vem também a folha **"Fórmulas do cenário"**, só para consulta: as fórmulas que o cenário usa fora dos casos (parâmetros, passos, condições e variáveis calculadas). Essas mudam-se no UAT Studio; a importação lê só a folha dos casos.

### 5.5.1 Duplicar
- **Duplicar um cenário** (botão "Duplicar" na lista de cenários): uma cópia com os mesmos blocos e os mesmos casos, para fazer uma variação.
- **Duplicar um caso** (botão "Duplicar" em cada linha da tabela de casos): a cópia fica logo a seguir, com um ID novo; muda-se só o que for diferente.

### 5.6 Passwords: nunca nos casos
Em **Dados de teste › Segredos de teste**, crie o segredo (fica **encriptado neste PC**). Na célula do Excel, escreva apenas `{SEGREDO:nome}`, por exemplo `{SEGREDO:ana.silva}`.
- O valor nunca aparece nos ficheiros, nos logs nem nos relatórios.
- Noutro PC é preciso voltar a preenchê-lo.
- A verificação antes de correr avisa se encontrar uma password escrita nos casos.

### 5.7 Dados que não podem repetir
Use fórmulas em vez de valores escritos à mão:
- `NIF()` e `IBAN()` dão valores válidos e diferentes em cada execução;
- `"Empresa " & {TESTE} & "-" & {RUN}` dá um nome único;
- `{HOJE+30:dd/MM/yyyy}` dá a data de daqui a 30 dias;
- `{CONTADOR:clientes}` dá um número novo de cada vez.

O ecrã **Dados de teste** mostra o resultado de cada fórmula enquanto se escreve. Há muito mais que dá para fazer com fórmulas: veja o **capítulo 11 (Fórmulas: guia com exemplos)**.

### 5.8 Emails: a caixa de testes
Muitas aplicações enviam emails (aprovação ao gestor, código de acesso, confirmação de registo). A ferramenta consegue **verificar esses emails sozinha**.

**1. Defina a caixa (uma vez por projeto)**, em **Dados de teste › Caixa de email de testes › Definir caixa**:
- **Email base**: uma caixa **só para testes**, aprovada pela IT, por exemplo `emailteste@outlook.com`. Nunca uma caixa pessoal ou com dados reais.
- **Que caixa é**: Outlook/Hotmail (conta pessoal), Microsoft 365 (conta da empresa) ou caixa simulada (só para experimentar no PC, com o servidor de teste). O Gmail não é suportado (precisaria de uma ligação que a rede da empresa bloqueia).
- **Como entrar na caixa** (em todos, a password é escrita na página da **Microsoft**, nunca num campo da ferramenta):

| Modo | Como é | Quando usar |
|---|---|---|
| **Numa janela da ferramenta** (recomendado) | Abre-se uma janela do UAT Studio com a página de login da Microsoft. Entra-se com MFA, se houver, e a janela fecha sozinha. | Quase sempre. |
| **No Microsoft Edge** | O login abre no Edge, como numa página normal. | Se a janela da ferramenta não servir (por exemplo, uma regra da empresa). |
| **Com um código noutro dispositivo** | A ferramenta mostra um código (por exemplo `ABCD-1234`) e um endereço. Abre-se esse endereço no telemóvel ou noutro PC, escreve-se o código e entra-se lá. | Quando o login no PC está bloqueado, ou quando a conta de testes tem o MFA noutro aparelho. |

- **Client ID**: o identificador da "aplicação" que a Microsoft autoriza a ler a caixa (permissão `Mail.Read`). Numa conta da empresa, é a **IT** que o dá.
- Carregue em **Ligar e testar**: na 1.ª vez é pedido o login; depois a sessão fica **encriptada neste PC** e as execuções seguintes já não pedem login. **Esquecer a sessão** apaga-a.

**2. Use um endereço diferente por papel e por caso.** Nos dados do caso, onde a aplicação pede um email, escreva `{EMAIL:gestor}` (ou `{EMAIL:cliente}`, `{EMAIL:supervisor}`...). A ferramenta troca por um endereço próprio desse caso, por exemplo:

`emailteste+gestor_tc0001_13112026@outlook.com`

Todos estes endereços chegam à mesma caixa (é uma regra do Outlook: tudo o que vem depois do `+` é ignorado na entrega; no Microsoft 365 da empresa está ligado por omissão, mas a IT pode tê-lo desligado: confirme com um email de teste), mas como cada caso tem o seu, **os emails de casos diferentes (ou de outros dias) nunca se misturam**. O formato pode mudar-se na definição da caixa.

**3. Acrescente um bloco "Verificar email"** ao cenário (**Cenários › Criar ▾ › Novo bloco de email**, escolha "Caixa de testes do projeto"):
- **Para quem (papel)**: por exemplo `gestor`. O email tem de chegar ao endereço do gestor **deste caso**.
- **O que se espera**: "tem de chegar um email" ou "**NÃO deve chegar** nenhum email" (por exemplo, uma recusa que não notifica ninguém).
- **Assunto**: "contém" (para encontrar o email) e "tem de ser exatamente" (dá ✗ Falhou se for diferente). Pode ter `{variáveis}`: `Pedido {PedidoId} aprovado`.
- **O corpo tem de conter**: um texto por linha.
- **Valores no corpo**: `Montante:={Valor}` compara o número que aparece a seguir a "Montante:" com o esperado, em decimal exato. Com tolerância: `Prestação:={Prestacao};0,01`.
- **Anexos**: o nome que o anexo tem de ter (por exemplo `contrato`).
- **Guardar o link**: `LinkConfirmar=/confirmar` guarda o 1.º link que contém "/confirmar" em `{LinkConfirmar}`. Com **Abrir o link no browser do caso**, a ferramenta abre-o a seguir (útil para "confirme o seu registo").
- **Guardar outros valores**: por exemplo o código de MFA, `CodigoMfa=(\d{6})`.
- **Aceitar emails chegados até N minutos antes do caso**: por omissão 2. Aumente quando o email é enviado antes de o caso começar (por exemplo, à mão, ou por um processo da noite anterior).

**Evidências**: cada email recebido fica na pasta do caso (`email/`) como **imagem** (`.png`), como página (`.html`) e com os dados (`.json`). A imagem é desenhada sem carregar imagens da internet (para o email não "avisar" ninguém de que foi aberto).

> Dica: um cenário típico é "o cliente submete → verificar email do gestor (papel gestor) → o gestor aprova no Backoffice → verificar email do cliente (papel cliente)".

**Pastas e regras da caixa**: pode criar uma regra que mova os emails de teste para uma pasta (por exemplo, assunto com "UAT" → pasta UAT), para não encherem a caixa de entrada.
A ferramenta procura em **todas as pastas** da caixa, por isso a regra não atrapalha. Prefira regras do Outlook na web ou do Outlook novo (correm no servidor); mesmo uma regra do Outlook clássico não impede a ferramenta de encontrar o email, só o põe noutra pasta.
**Que caixa usar na empresa**: uma caixa **só para testes**, de preferência partilhada pela equipa (por exemplo `uat-testes@empresa.pt`), e não o seu email de trabalho. A ferramenta só lê, e só os emails do endereço exato do caso, mas ligar a sua caixa de trabalho a uma ferramenta de testes pode precisar de autorização da IT.

**Exemplo pronto**: no projeto de exemplo, o épico **"5. Emails que a app envia"** tem o cenário "Emails da app: aprovado, recusado e documentos em falta". O cliente pede o crédito com o seu **endereço de teste** (o campo Email é preenchido com a fórmula `{EMAIL:cliente}`), o gestor decide no Backoffice e o teste espera o email que a **própria app** envia (assunto, montante, prestação, motivo, link) ou confirma que **não** chega nenhum (o analista acima do limite). Para correr este cenário é preciso definir a caixa de email de testes do projeto (acima). A app de testes envia os emails pelo Gmail de testes (SMTP configurado no ODC); na app real da empresa, isto depende do servidor de email que a app usa em QA.

## 6. Correr e analisar

### 6.1 Correr
Ecrã **Execuções › Nova execução**:
1. **O que correr**: tudo, um épico ou um cenário.
2. **Em paralelo**: quantos casos ao mesmo tempo (ver "Quantos em paralelo?" abaixo).
3. **Mais opções**: só alguns casos ou etiquetas, browser (Edge ou Chrome), modo (em background ou visível), velocidade (lenta ou passo a passo, para aprender) e "pausar quando um caso ficar bloqueado".
4. **Verificar** mostra o que falta (colunas, segredos, endereços) sem correr nada. **Correr** verifica primeiro e depois executa.

Durante a execução:
- **Pausar** pára entre passos (nunca a meio de uma ação), **Parar** termina e **Saltar** passa um caso à frente;
- a **Execução ao vivo** mostra cada bloco a mudar de cor e o browser de cada caso em miniatura.

### 6.2 Ler os resultados
- **Filtros** por resultado (✓ Passou, ✗ Falhou, ! Bloqueado) e pesquisa por ID ou descrição.
- Clicar num caso abre o **detalhe ao lado**:
  - o que aconteceu, com uma **sugestão** do que pode ser;
  - os passos, os prints, o esperado e o obtido;
  - os botões **Abrir trace** (a gravação passo a passo), **Copiar log** e **Repetir só este caso**.
- **Localizadores a reparar**: se um elemento mudou mas foi encontrado por outra via, **Reparar** corrige o bloco com um clique.
- **Regravar este elemento**: se um campo deixou de ser encontrado, o gravador repete os passos anteriores e pede que se aponte o campo certo.
- **Retomar a partir do bloco**: recomeça um caso a meio, sem repetir o que já correu bem.

### 6.2.1 Aceitar os resultados como esperados (linha de base)
A forma mais rápida de ter os valores esperados certos, sobretudo em testes de regressão:
1. Grave o teste e corra-o uma vez (as colunas de valores esperados podem até estar vazias: a ferramenta lê o ecrã na mesma).
2. Confirme, nos prints, que o que apareceu no ecrã está certo.
3. Na execução, carregue em **Aceitar os resultados como esperados** (ou, no detalhe de um caso, **Aceitar este resultado**). A ferramenta mostra primeiro o que vai mudar e pede confirmação.

A partir daí, qualquer valor diferente aparece como **✗ Falhou**. Atenção: só aceite se o ecrã estiver certo; aceitar um erro faz dele o "esperado".

### 6.3 Criar o defeito
No detalhe de um caso que falhou ou ficou bloqueado, **Criar defeito** prepara:
- o título;
- a descrição: ambiente, objetivo, dados (passwords como `***`), **passos para reproduzir**, esperado e obtido, erro, sugestões;
- a lista de **evidências** a anexar.

Reveja e confirme. O texto fica **copiado** (cole-o no Jira ou no Azure DevOps), é guardado em `defeito.txt` e abre-se a pasta com as evidências. Os defeitos criados aparecem no cartão **Defeitos criados** da execução.

### 6.4 Relatórios
- **Relatório Excel** e **Relatório HTML**: para a equipa.
- **PDF para assinatura**: para o fecho do UAT, com o resumo por requisito, a decisão (Aceite / Aceite com reservas / Recusado) e linhas de assinatura.
- **Matriz de cobertura** (no fundo de Execuções): que variantes já passaram em que cenários.
- **Comparação**: o que piorou ou melhorou em relação à execução anterior.

## 7. Quantos casos em paralelo? (desempenho)

Correr testes **não bloqueia o PC**. Medido num portátil com 16 GB de memória, em background:

| | 6 casos demoram | Memória usada | Processador |
|---|---|---|---|
| 1 de cada vez | ~67 s | ~0,9 GB | ~3% (pico 8%) |
| 2 em paralelo | ~41 s | ~1,0 a 1,2 GB | ~5% (pico 13%) |
| 4 em paralelo | ~27 s | ~1,3 a 1,6 GB | ~8% (pico 22%) |

- **O que pesa é a memória**: cada caso em paralelo é um browser à parte (cerca de 250 MB). O processador quase não conta, porque a maior parte do tempo os testes estão à espera da aplicação.
- **Regra prática**: num PC de 8 GB com o Teams, o Outlook e o browser abertos, use **2** em paralelo. Com 16 GB, 4 é tranquilo.
- **Antes de correr**, se a memória livre não chegar para o número escolhido, a ferramenta avisa e sugere um número seguro ("Este PC tem 1,6 GB livres... sugerimos 2").
- **Configurações › Desempenho do PC**: o processador e a memória neste momento, quantos casos é seguro correr agora e o que as últimas execuções usaram.
- Cada execução mostra no detalhe (e no relatório) a duração média por caso e o pico de memória e de processador.
- Mais casos em paralelo também carregam mais a aplicação de QA: combine com a equipa de desenvolvimento se for correr muitos.

## 8. Ajudas da própria ferramenta

- **"i"** ao lado dos títulos e opções: passe o rato (ou use a tecla Tab) para uma explicação curta.
- **Procurar (Ctrl+K)**: escreva parte do nome de um cenário, bloco, épico, aplicação ou ecrã e carregue em Enter.
- **Filtros**: nos Cenários (nome, épico, etiqueta), nos blocos (texto, tipo, "só os não usados") e nas Execuções.
- **"Mais opções"**: as opções pouco usadas ficam escondidas; fechado, mostra um resumo do que está definido.
- **Configurações**: **modo simples ou avançado**, tema **claro, escuro ou igual ao Windows**, tutorial e desempenho.
- **Modo simples** (por omissão): mostra só o essencial para gravar, montar, correr e analisar testes. O **modo avançado** mostra também os blocos de API, a execução ao vivo, as condições "só se", as sessões, os passos de rede, o modo print, as variáveis calculadas e o código Playwright. Na barra lateral, "Modo simples · ver tudo" leva às Configurações.
- **Vídeos e guia ilustrado**: há vídeos curtos (um por tema, com legendas) e um guia com imagens; peça a pasta `out/demo` a quem mantém a ferramenta.

## 9. Regras de ouro

1. **Teste em QA com dados fictícios.** Produção pede sempre confirmação.
2. **Passwords só no cofre** (`{SEGREDO:nome}`), nunca no Excel.
3. **Grave uma vez, reutilize muito**: um bloco por ecrã ou ação, usado em vários cenários.
4. **Verifique o que importa**: os valores de negócio (montantes, estados, mensagens), não tudo o que aparece.
5. **Descreva os cenários** (Resumo) e preencha o **ID do requisito**.
6. **Leia a sugestão** antes de criar um defeito: às vezes é o teste que precisa de ajuste (por exemplo o arredondamento ao par do OutSystems).

## 10. Problemas comuns

| Problema | O que fazer |
|---|---|
| A primeira execução do dia falha por lentidão | O ambiente OutSystems estava "a dormir": repita. |
| "Não encontrei o elemento" | O ecrã mudou: use **Regravar este elemento** ou veja o print `erro.png`. |
| Diferença de 1 cêntimo | Provável arredondamento ao par do OutSystems: use `ARRED.PAR` na fórmula ou uma tolerância. |
| "Segredo de teste por preencher neste PC" | Preencha-o em **Dados de teste › Segredos de teste**. |
| O PC ficou lento durante uma execução | Use menos casos em paralelo (ver capítulo 7). |
| Um endereço não responde | Confirme a VPN e o endereço da aplicação no ambiente ativo (Cenários › Aplicações). |
| "O email não chegou em N s" | Confirme que a aplicação enviou para o endereço certo (o papel e o caso estão no log, linha "Endereço de teste") e aumente o "esperar até". |
| "Falta definir a caixa de email de testes" | Defina-a em **Dados de teste › Caixa de email de testes**. |
| O login da caixa de testes falha | Experimente outro modo (Edge ou código noutro dispositivo) e confirme com a IT o Client ID e a permissão `Mail.Read`. |

## 11. Fórmulas: guia com exemplos

Uma **fórmula** calcula um valor na altura em que o caso corre. Escreve-se como no Excel, com **`;`** a separar argumentos e **`{Coluna}`** para usar um valor dos dados do caso. Pode usar fórmulas:
- no **popup do gravador** (origem do valor: "fórmula");
- nos **parâmetros dos blocos** no editor do cenário;
- nas **variáveis calculadas** (Dados de teste, modo avançado): um nome + uma fórmula, calculada uma vez por caso e usada como se fosse uma coluna;
- nos textos com `{...}` (assuntos de email, corpos de API, condições "só se").

O ecrã **Dados de teste** tem a caixa **Experimentar**: escreva a fórmula e vê logo o resultado com os dados de um caso de exemplo (sem gastar contadores).

### 11.1 O básico

| Escrever | Dá | Para quê |
|---|---|---|
| `{Valor}` | o valor da coluna Valor | usar os dados do caso |
| `"Cliente " & {Nome}` | `Cliente Ana` | juntar textos (`&`) |
| `{Valor} * 1,1` | o valor com mais 10% | contas (`+ - * /`), sempre com decimais exatos |
| `{TESTE}` / `{RUN}` | `TC0001` / `run12` | o ID do caso / da execução |
| `SE({Valor} > 1000; "Alto"; "Baixo")` | `Alto` | escolher conforme uma condição (`= <> < > <= >=`) |

**Onde se escrevem fórmulas**: nos valores dos passos e nos Parâmetros (editor do cenário), nas variáveis calculadas (Dados de teste) e **nas células dos casos**, começando por `=` (por exemplo `=ARRED({Valor} * 0,015; 2)`), também no Excel.

### 11.2 Datas

| Escrever | Dá (a 13/11/2026) |
|---|---|
| `{DATA:dd/MM/yyyy}` | `13/11/2026` |
| `{DATA:yyyyMMdd}` | `20261113` |
| `{HOJE+30:dd/MM/yyyy}` | `13/12/2026` |
| `{HOJE-1:dd/MM/yyyy}` | `12/11/2026` (ontem) |

**Casos de uso**: data de início de um contrato daqui a 30 dias; uma data passada para testar "a data não pode ser anterior a hoje"; um nome com a data para saber de quando é cada registo.

### 11.3 Dados únicos (para não repetir entre execuções)

| Escrever | Dá |
|---|---|
| `NIF()` | um NIF válido diferente em cada execução |
| `IBAN()` | um IBAN português válido |
| `{CONTADOR:clientes}` | 1, 2, 3... (fica guardado entre execuções) |
| `{ALEATORIO:6}` | 6 algarismos ao acaso |
| `ALEATORIOENTRE(500; 5000)` | um número entre 500 e 5000 |
| `"Empresa " & {TESTE} & "-" & {RUN}` | `Empresa TC0001-run12` |

**Casos de uso**: registar um cliente novo em cada execução (a aplicação recusa NIF repetidos); criar pedidos com montantes variados para testes exploratórios; nomes que se encontram depois no Backoffice.

### 11.4 Contas de dinheiro (valores esperados)

| Escrever | Para quê |
|---|---|
| `ARRED({Valor} * {Comissao} / 100; 2)` | comissão com 2 casas, arredondada "meio para cima" (como se faz à mão) |
| `ARRED.PAR({Valor} * 0,0123; 2)` | arredondamento **ao par**, igual ao `Round()` do OutSystems (86,405 → 86,40) |
| `ARRED.PAR(PRESTACAO({Valor}; {Taxa}; {Prazo}); 2)` | prestação mensal de um crédito (capital; taxa anual em %; meses) |
| `TRUNCAR({Valor} / 100) * {Pontos}` | pontos de fidelização por cada 100 € (sem decimais) |
| `MIN({Valor} * 0,02; 50)` | 2% com um máximo de 50 € |
| `MAX({Valor} * 0,01; 5)` | 1% com um mínimo de 5 € |
| `TEXTO({Total}; 2)` | `86,40` (texto com 2 casas, para comparar com o ecrã) |
| `PONTO({Total})` | `86.4` (para campos ou APIs que usam ponto) |

**Caso de uso**: em vez de calcular à mão o valor esperado de cada linha do Excel, crie uma variável calculada `PrestacaoEsperada = ARRED.PAR(PRESTACAO({Valor}; {Taxa}; {Prazo}); 2)` e use `{PrestacaoEsperada}` como valor esperado. Muda o Excel, as contas acompanham.

> Diferença de um cêntimo entre o esperado e o ecrã? Quase sempre é o arredondamento: troque `ARRED` por `ARRED.PAR` (ou o contrário).

### 11.5 Emails e MFA

| Escrever | Dá |
|---|---|
| `{EMAIL:gestor}` ou `EMAIL("gestor")` | o endereço de teste do gestor neste caso, na caixa de testes do projeto (ver 5.8) |
| `EMAIL("cliente"; "exemplo.pt")` | um email único sem caixa de testes: `qa+cliente.tc0001.run12@exemplo.pt` |
| `EMAIL("ana.silva"; "cliente"; "exemplo.pt")` | o mesmo, com a base que escolher (o que vem antes do `+`): `ana.silva+cliente.tc0001.run12@exemplo.pt` |
| `TOTP({ChaveMfa})` | o código de 6 algarismos de uma app autenticadora, a partir da chave secreta da conta de teste |

**Caso de uso**: o cliente regista-se com `{EMAIL:cliente}`, a aplicação envia um código, o bloco de email com papel `cliente` guarda-o em `{CodigoMfa}` e o passo seguinte escreve `{CodigoMfa}`.

### 11.6 Textos

| Escrever | Dá |
|---|---|
| `MAIUSCULAS({Nome})` / `MINUSCULAS({Nome})` | `ANA SILVA` / `ana silva` |
| `ESQUERDA({Iban}; 4)` / `DIREITA({Iban}; 4)` | os 4 primeiros / últimos caracteres |
| `COMPR({Nome})` | o número de caracteres |

**Casos de uso**: verificar que o ecrã mostra o IBAN mascarado (`"**** " & DIREITA({Iban}; 4)`); testar o limite de um campo com um texto do tamanho máximo.

### 11.7 Condições "só se" (modo avançado)
A condição de um bloco ou de um passo é uma fórmula que dá verdadeiro ou falso:
- `{EstadoEsperado} = "Aprovado"`: o bloco só corre nos casos aprovados;
- `{Valor} > 5000`: um passo extra (por exemplo, a aprovação do supervisor) só para montantes altos;
- `{Canal} <> "Balcão"`.

Assim, um único cenário serve para vários caminhos, cada caso segue o seu.

### 11.8 Quando a fórmula tem um erro
- A caixa mostra a mensagem logo ao escrever (por exemplo `Esperava ")" na fórmula.` ou `Falta fechar as aspas de um texto.`).
- **Verificar** (antes de correr) aponta todas as fórmulas com erro.
- Textos vão **entre aspas** (`"Alto"`); números com vírgula ou ponto (`0,5` ou `0.5`); argumentos separados por `;`.
