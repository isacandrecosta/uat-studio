// Cofre local de segredos (client secrets, passwords de teste, chaves de API).
// Os segredos são encriptados pelo Windows (Electron safeStorage) e ficam FORA da pasta do projeto,
// na área do utilizador deste PC. Nunca vão para os ficheiros JSON, para os logs nem para a interface.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ErroProjeto } from './projeto/repositorio';

type Guardados = Record<string, string>;

/** O Electron só é carregado quando é preciso (este módulo também é importado em testes sem Electron). */
function electron(): typeof import('electron') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('electron') as typeof import('electron');
}

function ficheiroDoCofre(pastaProjeto: string): string {
  const chave = createHash('sha256').update(path.resolve(pastaProjeto).toLowerCase()).digest('hex').slice(0, 24);
  return path.join(electron().app.getPath('userData'), 'cofre', `${chave}.json`);
}

function ler(pastaProjeto: string): Guardados {
  try {
    const dados = JSON.parse(fs.readFileSync(ficheiroDoCofre(pastaProjeto), 'utf8')) as Guardados;
    return dados && typeof dados === 'object' ? dados : {};
  } catch {
    return {};
  }
}

function gravar(pastaProjeto: string, dados: Guardados): void {
  const ficheiro = ficheiroDoCofre(pastaProjeto);
  fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
  fs.writeFileSync(ficheiro, JSON.stringify(dados, null, 2), 'utf8');
}

function exigirEncriptacao(): void {
  if (!electron().safeStorage.isEncryptionAvailable()) {
    throw new ErroProjeto('Este PC não permite guardar segredos de forma segura (a encriptação do Windows não está disponível).');
  }
}

/** Guarda um segredo. Um valor vazio apaga-o. */
export function definirSegredo(pastaProjeto: string, nome: string, valor: string): void {
  const dados = ler(pastaProjeto);
  if (!valor) {
    delete dados[nome];
  } else {
    exigirEncriptacao();
    dados[nome] = electron().safeStorage.encryptString(valor).toString('base64');
  }
  gravar(pastaProjeto, dados);
}

/** Lê um segredo. Só para uso interno do processo principal (nunca enviar à interface). */
export function lerSegredo(pastaProjeto: string, nome: string): string | undefined {
  const guardado = ler(pastaProjeto)[nome];
  if (!guardado) return undefined;
  try {
    return electron().safeStorage.decryptString(Buffer.from(guardado, 'base64'));
  } catch {
    // Guardado noutro PC ou por outro utilizador do Windows: não dá para abrir aqui.
    return undefined;
  }
}

/** Diz que segredos estão preenchidos (sem revelar os valores). */
export function segredosPreenchidos(pastaProjeto: string, nomes: string[]): Record<string, boolean> {
  const dados = ler(pastaProjeto);
  const resultado: Record<string, boolean> = {};
  for (const nome of nomes) resultado[nome] = Boolean(dados[nome]);
  return resultado;
}

/** Apaga todos os segredos de um perfil (quando o perfil é apagado). */
export function apagarSegredosDoPerfil(pastaProjeto: string, perfilId: string): void {
  const dados = ler(pastaProjeto);
  let mudou = false;
  for (const nome of Object.keys(dados)) {
    if (nome.startsWith(`${perfilId}.`)) {
      delete dados[nome];
      mudou = true;
    }
  }
  if (mudou) gravar(pastaProjeto, dados);
}

// ---------------------------------------------------------------- segredos de teste (passwords dos ecrãs)
// Nos casos fica só a referência {SEGREDO:nome}; o valor fica aqui, encriptado, e é trocado na execução.

const PREFIXO_TESTE = 'teste.';

/** Nomes de segredos de teste: letras, números, ponto, hífen, _ e @ (por exemplo ana.silva ou gestor@qa). */
export function nomeDeSegredoValido(nome: string): boolean {
  return /^[A-Za-z0-9._@-]{1,80}$/.test(nome);
}

export function listarSegredosDeTeste(pastaProjeto: string): string[] {
  return Object.keys(ler(pastaProjeto))
    .filter((n) => n.startsWith(PREFIXO_TESTE))
    .map((n) => n.slice(PREFIXO_TESTE.length))
    .sort((a, b) => a.localeCompare(b, 'pt'));
}

/** Guarda (ou, com valor vazio, apaga) um segredo de teste. */
export function definirSegredoDeTeste(pastaProjeto: string, nome: string, valor: string): void {
  if (!nomeDeSegredoValido(nome)) throw new ErroProjeto('O nome do segredo só pode ter letras, números, ponto, hífen, _ e @ (por exemplo ana.silva).');
  definirSegredo(pastaProjeto, `${PREFIXO_TESTE}${nome}`, valor);
}

/** Só para o processo principal (execução): nunca enviar à interface. */
export function lerSegredoDeTeste(pastaProjeto: string, nome: string): string | undefined {
  return lerSegredo(pastaProjeto, `${PREFIXO_TESTE}${nome}`);
}

/** Troca as referências {SEGREDO:nome} pelos valores do cofre (os que faltam ficam vazios). Só no processo principal. */
export function resolverSegredosDeTeste(pastaProjeto: string, valores: Record<string, string>): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const [k, v] of Object.entries(valores)) {
    const m = /^\{SEGREDO:([^{}]+)\}$/.exec(String(v ?? '').trim());
    resultado[k] = m ? lerSegredoDeTeste(pastaProjeto, m[1].trim()) ?? '' : v;
  }
  return resultado;
}
