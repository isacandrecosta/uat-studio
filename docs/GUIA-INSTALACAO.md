# UAT Studio: guia de instalação e primeiros passos

## 1. Antes de começar
- Windows 10 ou 11 com o **Microsoft Edge** instalado (já vem com o Windows). O Chrome é opcional.
- **Não precisa de instalar nada** nem de permissões de administrador.
- No PC da empresa: confirmar primeiro com o `UAT-Studio-Diagnostico.exe` (ver o ponto 5) e respeitar as regras de lá. Se algo for bloqueado, pedir à IT um ambiente aprovado; **nunca contornar os controlos**.

## 2. "Instalar"
1. Copiar o ficheiro `UAT-Studio.exe` para uma pasta sua (por exemplo, `Documentos\UAT Studio`).
2. Fazer duplo clique. A 1.ª abertura demora uns segundos (o executável portátil prepara-se numa pasta temporária).
3. Se o Windows SmartScreen avisar ("O Windows protegeu o seu PC"), é porque o executável não está assinado: confirme com quem lho entregou antes de escolher "Executar mesmo assim" (ou peça à IT a versão assinada).

## 3. Primeiro projeto
1. No ecrã de boas-vindas, **criar um projeto** numa pasta (de preferência uma pasta só para ele; pode ser partilhada ou estar no Git). Para experimentar, marque "com o exemplo".
2. Escolher o **ambiente** no canto inferior esquerdo (DEV, QA ou PRD). Correr em PRD pede sempre confirmação.
3. No ecrã **Cenários**, cartão **Aplicações**: indicar o endereço de cada aplicação neste ambiente.
4. Se houver APIs com autenticação: ecrã **Blocos de API** → **Perfis de autenticação** → preencher os segredos (ficam no cofre encriptado deste PC, nunca na pasta do projeto).

## 4. Onde fica cada coisa
| O quê | Onde |
|---|---|
| Projeto (cenários, blocos, casos) | A pasta do projeto que escolheu (ficheiros JSON). |
| Resultados (relatórios, prints, logs, traces) | `<pasta do projeto>\execucoes\`. |
| Segredos, projetos recentes | `%APPDATA%\UAT Studio\` (os segredos estão encriptados e só funcionam neste utilizador do Windows). |
| Certificados de cliente (mTLS) | Onde indicar no perfil; de preferência dentro da pasta do projeto (`certificados\`), para viajarem com ele. A password fica no cofre. |

## 5. Verificar o PC (diagnóstico)
1. Correr `UAT-Studio-Diagnostico.exe`.
2. Escrever o endereço de um site interno de testes (fica só na janela, não é guardado) e carregar em **Verificar**.
3. Tudo verde: pode usar o UAT Studio. Algo vermelho: a explicação diz o que falta; copie o resultado e fale com a IT.
4. Os amarelos (opcionais) não impedem o uso: "Login e email da Microsoft" só é preciso para a caixa de email Microsoft 365; "Ligação direta sem proxy" só para o email por IMAP (Gmail) e para certificados de cliente; "Apps de demonstração" só para correr o projeto de exemplo.

O que é verificado (17 linhas): arranque, gravar ficheiros, Edge instalado, controlar o Edge, prints, abrir o site no Edge (proxy e certificados), Edge em background, pedidos de API fora do browser, ficheiros e separadores no Edge (carregar, descarregar, novo separador), cofre de segredos, servidor local (traces), janelas da ferramenta (login e traces), PDF para assinatura e os opcionais (Microsoft, ligação direta, apps de demonstração, Chrome).

## 6. Levar para o PC da empresa
1. **Diagnóstico primeiro**: corra o `UAT-Studio-Diagnostico.exe` (ponto 5) dentro das regras da empresa e guarde o resultado copiado. Se algo vermelho for bloqueado pela empresa, peça à IT um ambiente aprovado.
2. **Leve o executável, não o código**: copie o `UAT-Studio.exe` portátil (não é preciso clonar o Git, nem instalar o Node.js, nem fazer `npm install`). Se a empresa exigir, peça à IT que o aprove ou assine.
3. **Experimente com o projeto de exemplo**: na lista **Projeto**, escolha "Projeto de exemplo (casos de uso)" e corra os cenários do Simulador e do Portal de Crédito. Usam apps de teste na internet (linha "Apps de demonstração" do diagnóstico); se a rede da empresa as bloquear, passe ao ponto seguinte. O épico 5 (emails) precisa de uma caixa de email de testes: deixe-o de fora ou use a da empresa.
4. **Leve os seus projetos**: copie a pasta do projeto (os ficheiros JSON), por exemplo num .zip ou pelo Git se a empresa o permitir. A pasta `execucoes` não é precisa.
5. **Volte a preencher os segredos**: as passwords dos perfis de API, os `{SEGREDO:...}`, a palavra-passe da caixa IMAP e a sessão da caixa Microsoft estão encriptados para o utilizador do Windows do PC onde foram guardados e **não viajam** com a pasta. O resto (cenários, blocos, casos, definição da caixa de testes) viaja.
6. **Não é preciso o ODC Studio**: o UAT Studio testa as aplicações como um utilizador (Edge e APIs). O ODC Studio só serve para alterar as aplicações.
7. **Email na empresa**: use uma **caixa de testes Microsoft 365 da empresa** (de preferência partilhada, por exemplo `uat-testes@empresa.pt`), com uma aplicação registada pela IT no Microsoft Entra (permissão `Mail.Read`). Não use uma conta Gmail pessoal no PC da empresa: o IMAP liga sem o proxy e normalmente está bloqueado, e pôr a palavra-passe de uma conta pessoal num PC da empresa pode ir contra as regras de lá.

## 7. Problemas comuns
| Sintoma | O que fazer |
|---|---|
| A 1.ª execução de um caso falha por tempo | O ambiente pode estar a "acordar": repita só esse caso (botão "Repetir só este caso"). |
| "Não encontrei o elemento" | O ecrã mudou: use **"Regravar este elemento"** no detalhe do caso, ou **"Reparar"** se o UAT Studio já encontrou uma alternativa. |
| "Falta preencher ... no perfil" | Os segredos não viajam com o projeto: preencha-os neste PC (ecrã Blocos de API). |
| Problemas de certificados ou proxy | Confirme que está na rede da empresa (ou VPN). Pedidos com certificado de cliente não usam o proxy do Windows. |
| O login com browser (PKCE) pede login em cada execução | A sessão expirou ou foi esquecida ("Esquecer a sessão" na lista de perfis): faça o login uma vez e as execuções seguintes reutilizam-na. |

## 8. Para quem gera o executável
- `npm.cmd run exe` gera `out\app\UAT-Studio.exe`; `npm.cmd run exe:verificar` arranca-o numa pasta temporária e confirma que abre a janela e controla o Edge.
- `npm.cmd run diagnostico:exe` gera o executável de diagnóstico.
- `npm.cmd run licencas` atualiza `docs\LICENCAS.md` (componentes e licenças, para a equipa de segurança).
