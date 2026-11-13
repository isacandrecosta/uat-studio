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

## 6. Problemas comuns
| Sintoma | O que fazer |
|---|---|
| A 1.ª execução de um caso falha por tempo | O ambiente pode estar a "acordar": repita só esse caso (botão "Repetir só este caso"). |
| "Não encontrei o elemento" | O ecrã mudou: use **"Regravar este elemento"** no detalhe do caso, ou **"Reparar"** se o UAT Studio já encontrou uma alternativa. |
| "Falta preencher ... no perfil" | Os segredos não viajam com o projeto: preencha-os neste PC (ecrã Blocos de API). |
| Problemas de certificados ou proxy | Confirme que está na rede da empresa (ou VPN). Pedidos com certificado de cliente não usam o proxy do Windows. |
| O login com browser (PKCE) pede login em cada execução | A sessão expirou ou foi esquecida ("Esquecer a sessão" na lista de perfis): faça o login uma vez e as execuções seguintes reutilizam-na. |

## 7. Para quem gera o executável
- `npm.cmd run exe` gera `out\app\UAT-Studio.exe`; `npm.cmd run exe:verificar` arranca-o numa pasta temporária e confirma que abre a janela e controla o Edge.
- `npm.cmd run diagnostico:exe` gera o executável de diagnóstico.
- `npm.cmd run licencas` atualiza `docs\LICENCAS.md` (componentes e licenças, para a equipa de segurança).
