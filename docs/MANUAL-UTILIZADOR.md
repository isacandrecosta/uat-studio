# UAT Studio: manual do utilizador

Para quem cria e corre testes. Não é preciso saber programar.
Para a parte técnica (como funciona por dentro, segurança, manutenção), ver o [manual técnico](MANUAL-TECNICO.md).

> Este manual é atualizado sempre que a ferramenta ganha uma funcionalidade nova. Última atualização: 13/11/2026 (assistente "Novo teste", aceitar resultados, duplicar, modo simples).

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
| **6. Dados de teste** | Fórmulas, geradores (NIF, IBAN, emails), segredos de teste e contadores. |
| **7. Execuções** | Correr testes, ver resultados, evidências, defeitos, relatórios e histórico. |
| **8. Execução ao vivo** | Acompanhar uma execução em curso, com o browser de cada caso em miniatura. |

## 4. Primeira vez

1. Ao abrir um projeto pela primeira vez aparece o **tutorial guiado**, que mostra, passo a passo, como se constrói um teste de ponta a ponta. Pode saltá-lo (botão ou tecla Esc) e retomá-lo em **Configurações › Tutorial**.
2. Na lista **Projeto** há dois projetos prontos para aprender:
   - **Projeto de exemplo**: casos de uso completos (simulador, dois portais com aprovação, serviços externos, APIs, passo manual). Abra um cenário no editor para ver como está montado e corra-o em Execuções.
   - **Wiki de componentes OutSystems**: uma "receita" para cada componente (campos, listas, calendários, sliders, tabelas, popups...) com uma prova que confirma que funciona.

   Ambos se apagam na mesma lista quando já não forem precisos.

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

### 5.5 Escrever os casos de teste (e usar o Excel)
**Editor do cenário › Casos de teste**: uma linha por caso, com os dados de entrada e os valores esperados.
- **Exportar Excel** → crie as linhas que quiser (centenas, se for preciso) → **Importar Excel**.
- Colunas especiais: `ID`, `Descricao`, `Etiquetas` (para correr só alguns) e `Executar` (`N` = não importar a linha).
- Uma célula de valor esperado **vazia** quer dizer "não verificar isto neste caso".

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

O ecrã **Dados de teste** mostra o resultado de cada fórmula enquanto se escreve.

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
