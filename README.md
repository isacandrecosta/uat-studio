# UAT Studio

Aplicação desktop portátil para Windows, **offline e sem IA**, para criar e correr testes UAT e de regressão de aplicações OutSystems sem programar.

- Grava ações no browser e define os valores com cliques (fixo, Excel, fórmula, gerador).
- Organiza os testes em Épicos → Jornadas → Blocos reutilizáveis (UI, API com OAuth 2.0, Email) → Casos.
- Corre casos, jornadas ou épicos no Edge ou no Chrome, visível ou em background, com mapa ao vivo, evidências e logs por execução.

Estado: **em construção** (Fase 1). Ver [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md) e [docs/ROADMAP.md](docs/ROADMAP.md).

## Como abrir (em desenvolvimento)

Precisa do Node.js e do Microsoft Edge instalados. Na pasta do projeto:

```
npm.cmd install
npm.cmd start
```

Construído sobre Electron, TypeScript e Playwright.
