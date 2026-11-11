// Gera docs/LICENCAS.md: os componentes que vão dentro do .exe (dependências de produção e o Electron)
// com a versão e a licença de cada um. Uso: npm.cmd run licencas
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arvore = JSON.parse(execSync('npm ls --omit=dev --all --json', { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] }));
const pacotes = new Map();
function percorrer(dependencias) {
  for (const [nome, info] of Object.entries(dependencias ?? {})) {
    if (!info?.version || pacotes.has(`${nome}@${info.version}`)) continue;
    let licenca = '?';
    let descricao = '';
    try {
      const pkg = JSON.parse(readFileSync(join('node_modules', nome, 'package.json'), 'utf8'));
      licenca = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? (pkg.licenses ?? []).map((l) => l.type).join(' OR ')) || '?';
      descricao = pkg.description ?? '';
    } catch {
      // Pacote aninhado noutra pasta: fica sem descrição.
    }
    pacotes.set(`${nome}@${info.version}`, { nome, versao: info.version, licenca, descricao });
    percorrer(info.dependencies);
  }
}
percorrer(arvore.dependencies);
// O Electron é dependência de desenvolvimento, mas vai dentro do .exe (com o Chromium e o Node).
const electron = JSON.parse(readFileSync(join('node_modules', 'electron', 'package.json'), 'utf8'));
pacotes.set(`electron@${electron.version}`, { nome: 'electron', versao: electron.version, licenca: electron.license, descricao: 'Base da aplicação desktop (inclui Chromium e Node.js)' });

const lista = [...pacotes.values()].sort((a, b) => a.nome.localeCompare(b.nome));
const porLicenca = lista.reduce((c, p) => ((c[p.licenca] = (c[p.licenca] ?? 0) + 1), c), {});
const linhas = [
  '# Componentes e licenças',
  '',
  `Gerado com \`npm.cmd run licencas\` em ${new Date().toISOString().slice(0, 10)}. Lista o que vai dentro do \`UAT-Studio.exe\` (dependências de produção e o Electron). As ferramentas de desenvolvimento (TypeScript, electron-builder) não vão no executável.`,
  '',
  `Resumo: ${lista.length} componentes; licenças: ${Object.entries(porLicenca).map(([l, n]) => `${l} (${n})`).join(', ')}.`,
  '',
  '| Componente | Versão | Licença | Para que serve |',
  '|---|---|---|---|',
  ...lista.map((p) => `| ${p.nome} | ${p.versao} | ${p.licenca} | ${p.descricao.replace(/\|/g, '/').slice(0, 120)} |`),
  '',
];
writeFileSync(join('docs', 'LICENCAS.md'), linhas.join('\n'), 'utf8');
console.log(`docs/LICENCAS.md: ${lista.length} componentes (${Object.entries(porLicenca).map(([l, n]) => `${l}: ${n}`).join(', ')})`);
