# UAT Studio: guia rápido para a equipa

Uma página para começar. Não é preciso saber programar.

## As ideias em 30 segundos
- Um **projeto** guarda tudo de um sistema a testar. Muda-se de projeto na lista **Projeto**, no canto inferior esquerdo, junto ao **Ambiente** (DEV, QA, PRD).
- Os testes organizam-se assim: **Épico** (um tema, por exemplo "Crédito") → **Jornada** (um percurso, por exemplo "Pedir crédito e aprovar no backoffice") → **Blocos** (peças reutilizáveis: "Login", "Simular", "Aprovar") → **Casos** (as linhas de dados: uma por variante).
- Um bloco grava-se **uma vez** e usa-se em muitas jornadas. Se o ecrã mudar, corrige-se num sítio.
- Cada caso dá **OK** (tudo certo), **KO** (chegou ao fim, mas um valor está diferente) ou **ERRO** (não chegou ao fim).

## O menu (7 ecrãs)

| Ecrã | Para quê |
|---|---|
| 1. Jornadas | Ver épicos e jornadas, blocos partilhados, aplicações (endereços por ambiente), passos manuais, blocos de email, pacotes de blocos. |
| 2. Editor de jornada | Montar o percurso com blocos, dizer de onde vem cada valor, "só se", sessão do browser, e editar os casos (ou importar do Excel). |
| 3. Blocos de API | Criar pedidos às APIs (ou importar de cURL/Postman/OpenAPI), perfis de autenticação e botão **Testar**. |
| 4. Gravar | Gravar blocos no browser: clica num elemento e escolhe o que fazer no popup. Também há o **Modo print**. |
| 5. Dados de teste | Fórmulas (prestações, datas, NIF/IBAN de teste, TOTP), variáveis calculadas e contadores. |
| 6. Runs e resultados | Correr, acompanhar, ver resultados, evidências, relatórios (Excel, HTML, **PDF para assinatura**) e histórico. |
| 7. Mapa de execução | Ver ao vivo o que está a correr: jornadas, blocos, casos e o ecrã de cada worker. |

## Primeira vez: experimentar o projeto de exemplo
1. Na lista **Projeto**, escolher **"Projeto de exemplo (casos de uso)"**.
2. Em **Jornadas**, cada épico mostra um tipo de teste (simulador, entre portais FO→BO, APIs e serviços externos, passos manuais...). Abra uma jornada no editor para ver como está montada.
3. Em **Runs**, escolher uma jornada e carregar em **Correr**. Abrir um caso para ver os passos, os prints e o porquê de um KO.
4. Quando já não precisar dele: na lista **Projeto**, **"Apagar este projeto de exemplo…"**. Pode voltar a criá-lo quando quiser.

## A Wiki de componentes: "como é que testo isto?"
1. Na lista **Projeto**, escolher **"Wiki de componentes OutSystems"**.
2. Cada bloco **"Receita: ..."** mostra como se testa um componente ou uma situação típica (campos, password, listas, números, botões e resultados, linha de tabela, MFA de teste, dados que chegam depois do ecrã). A descrição diz **COMO** se faz e as **ARMADILHAS**.
3. Cada receita tem uma jornada **"Prova: ..."** que corre contra as apps de teste: se der OK, a ferramenta sabe testar aquele componente.
4. Para usar uma receita no seu projeto: **Exportar blocos** (na Wiki) e **Importar pacote** (no seu projeto); depois troque os data-testid pelos da sua app.
5. Ações para situações especiais (no editor de passos, **"Acrescentar outro passo"**): carregar um ficheiro, descarregar e verificar um ficheiro, responder a uma pergunta do browser (confirm/alert), mudar de separador; e, em qualquer passo, um campo dentro de um iframe.

## Tarefas do dia a dia

**Criar um teste novo**
1. **Jornadas** → "Nova jornada" no épico certo.
2. **Gravar** → escolher a aplicação, dar nome ao bloco → "Gravar". No browser que abre, clicar nos campos e botões e escolher no popup: valor **fixo**, **coluna dos dados** (do Excel) ou **fórmula**. Para conferir um resultado, escolher **Verificar**; para levar um valor para mais tarde (por exemplo o nº do pedido), **Guardar como variável**.
3. "Terminar e guardar bloco".
4. **Editor de jornada** → acrescentar os blocos pela ordem certa → preencher os casos (ou **Importar Excel**).

**Correr**
1. **Runs** → escolher o que correr (tudo, um épico, uma jornada, alguns casos ou etiquetas) → **Verificar** (mostra o que falta antes de perder tempo) → **Correr**.
2. Pode **Pausar** (para entre passos), **Parar**, **Saltar** um caso, ou correr **passo a passo**.

**Perceber um KO ou ERRO**
- Abrir o caso: **O que aconteceu**, **Onde**, **Sugestão**, prints e o **trace** (gravação passo a passo).
- Botões úteis: **Repetir só este caso**, **Regravar este elemento** (o ecrã mudou), **Retomar a partir do bloco** (não repete o que já correu bem), **Copiar log**.
- Se aparecer **"Localizadores a reparar"**: um clique em **Reparar** e o bloco fica atualizado para todas as jornadas.

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
- **Relatório Excel/HTML** para a equipa; **PDF para assinatura** para o fecho do UAT (preencha o **ID do requisito** nas jornadas).
- **Matriz de cobertura** (no fundo de Runs): que variantes já passaram em que jornadas.

## Regras de ouro
- Testar só em **QA com dados fictícios**. Em **PRD** a ferramenta pede sempre confirmação.
- Passwords e segredos só no **cofre** (perfis de autenticação), nunca no Excel. Não viajam com o projeto: cada pessoa preenche-os no seu PC.
- Um bloco por tarefa ("Login", "Simular", "Aprovar"): mais fácil de reutilizar e de reparar.
- Antes de correr muitos casos, **Verificar**.
