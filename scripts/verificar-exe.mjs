// Verifica o .exe portátil (out/app/UAT-Studio.exe): copia-o para uma pasta temporária, arranca-o com
// --verificar-arranque e mostra o resultado (a janela abriu? controla o Edge?). Uso: npm.cmd run exe:verificar
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = join('out', 'app', 'UAT-Studio.exe');
if (!existsSync(exe)) {
  console.error(`Não encontro ${exe}. Gere-o primeiro com: npm.cmd run exe`);
  process.exit(1);
}
const pasta = mkdtempSync(join(tmpdir(), 'uat-studio-exe-'));
const copia = join(pasta, 'UAT-Studio.exe');
copyFileSync(exe, copia);
const resultado = join(pasta, 'arranque.json');
const inicio = Date.now();
const processo = spawn(copia, [`--verificar-arranque=${resultado}`], { stdio: 'ignore' });
const limite = setTimeout(() => processo.kill(), 180_000);
processo.on('exit', (codigo) => {
  clearTimeout(limite);
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  if (!existsSync(resultado)) {
    console.error(`O .exe terminou (código ${codigo}) em ${segundos} s sem escrever o resultado.`);
    process.exit(1);
  }
  const dados = JSON.parse(readFileSync(resultado, 'utf8'));
  console.log(JSON.stringify({ ...dados, codigo, segundos: Number(segundos) }, null, 2));
  rmSync(pasta, { recursive: true, force: true });
  process.exit(codigo === 0 ? 0 : 1);
});
