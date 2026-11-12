# UAT Studio: guia rápido para a equipa

Uma página para começar. Não é preciso saber programar.

## As ideias em 30 segundos
- Um **projeto** guarda tudo de um sistema a testar. Muda-se de projeto na lista **Projeto**, no canto inferior esquerdo, junto ao **Ambiente** (DEV, QA, PRD). A **faixa no topo** mostra sempre o ambiente: verde DEV, azul QA, **vermelho PRODUÇÃO**.
- Os testes organizam-se assim: **Épico** (um tema, por exemplo "Crédito") → **Cenário de teste** (um percurso, por exemplo "Pedir crédito e aprovar no backoffice") → **Blocos** (peças reutilizáveis: "Login", "Simular", "Aprovar") → **Casos de teste** (as linhas de dados: uma por variante).
- Um bloco grava-se **uma vez** e usa-se em muitos cenários. Se o ecrã mudar, corrige-se num sítio.
- Cada caso de teste dá **✓ Passou** (OK: tudo certo), **✗ Falhou** (KO: chegou ao fim, mas um valor está diferente) ou **! Bloqueado** (ERRO: não chegou ao fim).

## O menu (8 ecrãs, pela ordem do trabalho)

| Ecrã | Para quê |
|---|---|
| 1. Início | O ponto da situação: cenários, casos, resultado da última execução, o que precisa de atenção e atalhos. Num projeto vazio, os primeiros passos por ordem. |
| 2. Cenários | Ver épicos e cenários, blocos partilhados (com "Como usar"), aplicações (endereços por ambiente), passos manuais, blocos de email, pacotes de blocos. |
| 3. Editor do cenário | Três separadores: **Resumo** (nome, etiquetas, requisito, descrição), **Passos** (o percurso de blocos, de onde vem cada valor, "só se", sessão) e **Casos de teste** (a tabela, importar e exportar Excel). |
| 4. Gravar | Gravar blocos no browser: clica num elemento e escolhe o que fazer no popup. Também há o **Modo print** e "Transformar valores fixos em colunas". |
| 5. Blocos de API | Criar pedidos às APIs (ou importar de cURL/Postman/OpenAPI), perfis de autenticação e botão **Testar**. |
| 6. Dados de teste | Fórmulas (prestações, datas, NIF/IBAN de teste, TOTP), variáveis calculadas, **segredos de teste** e contadores. |
| 7. Execuções | Correr, acompanhar, ver resultados, evidências, **Criar defeito**, relatórios (Excel, HTML, **PDF para assinatura**) e histórico. |
| 8. Execução ao vivo | Ver ao vivo o que está a correr: cenários, blocos, casos e o ecrã de cada worker. |

## Primeira vez: experimentar o projeto de exemplo
1. Na lista **Projeto**, escolher **"Projeto de exemplo (casos de uso)"**.
2. Em **Cenários**, cada épico mostra um tipo de teste (simulador, entre portais FO→BO, APIs e serviços externos, passos manuais...). Abra um cenário no editor para ver como está montado.
3. Em **Execuções**, escolher um cenário e carregar em **Correr**. Abrir um caso para ver os passos, os prints e o porquê de uma falha.
4. Quando já não precisar dele: na lista **Projeto**, **"Apagar este projeto de exemplo…"**. Pode voltar a criá-lo quando quiser.

## Vídeos e guia ilustrado
Há vídeos curtos (um por tema, com legendas) e um guia com imagens, gerados pela própria ferramenta com as apps de teste: pedir a quem mantém a ferramenta a pasta `out/demo` (ou gerá-la com `npm.cmd run demo`). Abrir `guia.html` no Edge; os vídeos `.webm` abrem no Edge, no VLC ou no Teams.

## A Wiki de componentes: "como é que testo isto?"
1. Na lista **Projeto**, escolher **"Wiki de componentes OutSystems"**.
2. Cada bloco **"Receita: ..."** mostra como se testa um componente ou uma situação típica (campos, password, listas, números, botões e resultados, linha de tabela, MFA de teste, dados que chegam depois do ecrã). A descrição diz **COMO** se faz e as **ARMADILHAS**.
3. Cada receita tem um cenário **"Prova: ..."** que corre contra as apps de teste: se der OK, a ferramenta sabe testar aquele componente.
4. Para usar uma receita no seu projeto: **Exportar blocos** (na Wiki) e **Importar pacote** (no seu projeto); depois troque os data-testid pelos da sua app.
5. Componentes do OutSystems UI que a ferramenta trata sozinha (no gravador basta clicar no componente):
   - **Calendários** (data, intervalo, hora, mês): "Escrever" 15/03/2026, 01/03/2026 a 15/03/2026, 14:30 ou 03/2026.
   - **Listas com pesquisa e de várias escolhas**: "Escolher" pelo texto; várias opções com ";" (Português; Inglês).
   - **Slider**: "Escrever" 60; slider de intervalo: 20-80.
   - **Grupo de opções, grupo de botões e classificação (estrelas)**: "Escolher" pelo texto ou pelo número de estrelas.
6. Ações para situações especiais (no editor de passos, **"Acrescentar outro passo"**): carregar um ficheiro, descarregar e verificar um ficheiro, responder a uma pergunta do browser (confirm/alert), mudar de separador; e, em qualquer passo, um campo dentro de um iframe.

## Tarefas do dia a dia

**Criar um teste novo**
1. **Cenários** → "Novo cenário" no épico certo.
2. **Gravar** → escolher a aplicação, dar nome ao bloco → "Gravar". No browser que abre, clicar nos campos e botões e escolher no popup: valor **fixo**, **coluna dos dados** (do Excel) ou **fórmula**. Para conferir um resultado, escolher **Verificar**; para levar um valor para mais tarde (por exemplo o nº do pedido), **Guardar como variável**.
3. "Terminar e guardar bloco".
4. **Editor do cenário** → acrescentar os blocos pela ordem certa → preencher os casos (ou **Importar Excel**).

**Correr**
1. **Execuções** → escolher o que correr (tudo, um épico, um cenário, alguns casos ou etiquetas) → **Verificar** (mostra o que falta antes de perder tempo) → **Correr**.
2. Pode **Pausar** (para entre passos), **Parar**, **Saltar** um caso, ou correr **passo a passo**.

**Perceber um KO ou ERRO**
- Abrir o caso: **O que aconteceu**, **Onde**, **Sugestão**, prints e o **trace** (gravação passo a passo).
- Botões úteis: **Repetir só este caso**, **Regravar este elemento** (o ecrã mudou), **Retomar a partir do bloco** (não repete o que já correu bem), **Copiar log**.
- Se aparecer **"Localizadores a reparar"**: um clique em **Reparar** e o bloco fica atualizado para todos os cenários.

**Testes entre dois portais (FO e BO)**
- No editor, em cada bloco, o campo **Sessão** diz "quem" está a fazer: por exemplo `cliente` no Front Office e `aprovador` no Backoffice. Cada sessão tem o seu login.
- Marque o bloco de login como **"Bloco de login"** (no ecrã Gravar): o login é feito uma vez e os casos seguintes reutilizam-no.
- Para passar valores entre portais (por exemplo o nº do pedido), use **Guardar como variável** num bloco e `{PedidoId}` nos seguintes.

**MFA**
- Modo de teste (código fixo): um passo normal com o código.
- App autenticadora: fórmula `TOTP({ChaveMfa})`.
- Código por email: **bloco de email** que espera pelo email e guarda o código numa variável.

**Serviços externos (pagamentos, IBAN...)**
- **Intercetar**: confirmar que a aplicação enviou os dados certos (por exemplo, o montante do pagamento).
- **Simular**: responder no lugar do serviço externo (aprovado, recusado ou sem resposta) para ver o que o ecrã mostra.
- Ambos em **Gravar** → editor de passos → "Acrescentar passo de rede".

**Entregar resultados**
- **Relatório Excel/HTML** para a equipa; **PDF para assinatura** para o fecho do UAT (preencha o **ID do requisito** nos cenários).
- **Matriz de cobertura** (no fundo de Execuções): que variantes já passaram em que cenários.

## Gravar uma vez e criar muitos casos no Excel
1. Grave o teste "a direito", com os valores que usaria à mão.
2. No ecrã **Gravar**, abra o bloco e carregue em **Transformar valores fixos em colunas**: escolha o que deve variar (o nome de cada coluna já vem sugerido).
3. No **Editor do cenário**, **Exportar Excel**, crie as linhas que quiser e **Importar Excel**.
4. Passwords: nunca as escreva nos casos. Em **Dados de teste › Segredos de teste** crie o segredo (fica encriptado neste PC) e, na célula, escreva `{SEGREDO:nome}`.

## Quando um caso falha: criar o defeito
No detalhe do caso (KO ou ERRO), **Criar defeito** prepara o título e a descrição (ambiente, passos para reproduzir, esperado vs obtido, erro, evidências). Reveja, confirme: o texto fica copiado para colar no Jira/Azure DevOps e abre-se a pasta com as evidências para anexar.

## Regras de ouro
- Testar só em **QA com dados fictícios**. Em **PRD** a ferramenta pede sempre confirmação.
- Passwords e segredos só no **cofre** (perfis de autenticação), nunca no Excel. Não viajam com o projeto: cada pessoa preenche-os no seu PC.
- Um bloco por tarefa ("Login", "Simular", "Aprovar"): mais fácil de reutilizar e de reparar.
- Antes de correr muitos casos, **Verificar**.
