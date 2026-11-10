// Lê e grava o projeto em ficheiros JSON (um ficheiro por item, bons para Git).
// Não depende do Electron, para poder ser testado só com o Node.
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Colecoes,
  EstadoProjeto,
  FORMATO_PROJETO,
  NomeColecao,
  NOMES_COLECOES,
  Projeto,
} from '../../shared/modelo';

const FICHEIRO_PROJETO = 'projeto.json';
const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** Erro com uma mensagem pensada para ser mostrada ao utilizador. */
export class ErroProjeto extends Error {}

/** "Crédito Pessoal 2" → "credito-pessoal-2" */
export function criarSlug(nome: string): string {
  const slug = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'item';
}

function lerJson<T>(ficheiro: string): T {
  let texto: string;
  try {
    texto = fs.readFileSync(ficheiro, 'utf8');
  } catch {
    throw new ErroProjeto(`Não foi possível ler o ficheiro ${ficheiro}.`);
  }
  try {
    return JSON.parse(texto.replace(/^﻿/, '')) as T;
  } catch {
    throw new ErroProjeto(`O ficheiro ${ficheiro} não é um JSON válido.`);
  }
}

/** Grava primeiro num ficheiro temporário e só depois troca: nunca fica um ficheiro a meio. */
function gravarJson(ficheiro: string, dados: unknown): void {
  fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
  const temporario = `${ficheiro}.tmp`;
  fs.writeFileSync(temporario, `${JSON.stringify(dados, null, 2)}\n`, 'utf8');
  fs.renameSync(temporario, ficheiro);
}

function validarId(id: string): string {
  if (!ID_VALIDO.test(id)) throw new ErroProjeto(`Identificador inválido: "${id}".`);
  return id;
}

function validarColecao(colecao: string): NomeColecao {
  if (!NOMES_COLECOES.includes(colecao as NomeColecao)) {
    throw new ErroProjeto(`Tipo de dados desconhecido: "${colecao}".`);
  }
  return colecao as NomeColecao;
}

function caminhoItem(pasta: string, colecao: NomeColecao, id: string): string {
  return path.join(pasta, validarColecao(colecao), `${validarId(id)}.json`);
}

export function existeProjeto(pasta: string): boolean {
  return fs.existsSync(path.join(pasta, FICHEIRO_PROJETO));
}

export function criarProjeto(pasta: string, nome: string): Projeto {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) throw new ErroProjeto('Dá um nome ao projeto.');
  if (existeProjeto(pasta)) {
    throw new ErroProjeto('Essa pasta já tem um projeto UAT Studio. Usa "Abrir projeto".');
  }
  fs.mkdirSync(pasta, { recursive: true });
  const projeto: Projeto = {
    formato: FORMATO_PROJETO,
    nome: nomeLimpo,
    criadoEm: new Date().toISOString(),
    ambientes: [
      { id: 'dev', nome: 'DEV', tipo: 'DEV' },
      { id: 'qa', nome: 'QA', tipo: 'QA' },
    ],
    ambienteAtivo: 'qa',
  };
  gravarJson(path.join(pasta, FICHEIRO_PROJETO), projeto);
  for (const colecao of NOMES_COLECOES) fs.mkdirSync(path.join(pasta, colecao), { recursive: true });
  // As execuções (prints, logs) não devem ir para o Git.
  const gitignore = path.join(pasta, '.gitignore');
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, 'execucoes/\n', 'utf8');
  return projeto;
}

export function lerProjeto(pasta: string): Projeto {
  if (!existeProjeto(pasta)) {
    throw new ErroProjeto('Essa pasta não tem um projeto UAT Studio (falta o ficheiro projeto.json).');
  }
  const projeto = lerJson<Projeto>(path.join(pasta, FICHEIRO_PROJETO));
  if (typeof projeto.formato !== 'number' || typeof projeto.nome !== 'string' || !Array.isArray(projeto.ambientes)) {
    throw new ErroProjeto('O ficheiro projeto.json não tem o formato esperado.');
  }
  if (projeto.formato > FORMATO_PROJETO) {
    throw new ErroProjeto('Este projeto foi criado com uma versão mais recente do UAT Studio.');
  }
  return projeto;
}

export function gravarProjeto(pasta: string, projeto: Projeto): void {
  gravarJson(path.join(pasta, FICHEIRO_PROJETO), projeto);
}

export function definirAmbienteAtivo(pasta: string, ambienteId: string): Projeto {
  const projeto = lerProjeto(pasta);
  if (!projeto.ambientes.some((a) => a.id === ambienteId)) {
    throw new ErroProjeto(`O ambiente "${ambienteId}" não existe neste projeto.`);
  }
  projeto.ambienteAtivo = ambienteId;
  gravarProjeto(pasta, projeto);
  return projeto;
}

function listarIds(pasta: string, colecao: NomeColecao): string[] {
  const dir = path.join(pasta, validarColecao(colecao));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .filter((id) => ID_VALIDO.test(id))
    .sort();
}

export function listar<C extends NomeColecao>(pasta: string, colecao: C): Colecoes[C][] {
  return listarIds(pasta, colecao).map((id) => ler(pasta, colecao, id));
}

export function ler<C extends NomeColecao>(pasta: string, colecao: C, id: string): Colecoes[C] {
  const item = lerJson<Colecoes[C]>(caminhoItem(pasta, colecao, id));
  // O nome do ficheiro manda: evita ids trocados depois de copiar ficheiros à mão.
  return { ...item, id };
}

export function existe(pasta: string, colecao: NomeColecao, id: string): boolean {
  return fs.existsSync(caminhoItem(pasta, colecao, id));
}

/** Devolve um id livre a partir de um nome ("login-fo", "login-fo-2", ...). */
export function gerarId(pasta: string, colecao: NomeColecao, nome: string): string {
  const base = criarSlug(nome);
  let id = base;
  for (let n = 2; existe(pasta, colecao, id); n++) id = `${base}-${n}`;
  return id;
}

/** Grava um item. Se não tiver id, é criado a partir do nome. */
export function guardar<C extends NomeColecao>(
  pasta: string,
  colecao: C,
  item: Omit<Colecoes[C], 'id'> & { id?: string },
): Colecoes[C] {
  const nome = (item as { nome?: unknown }).nome;
  const id = item.id ? validarId(item.id) : gerarId(pasta, colecao, typeof nome === 'string' ? nome : colecao);
  const completo = { ...item, id } as Colecoes[C];
  gravarJson(caminhoItem(pasta, colecao, id), completo);
  return completo;
}

export function apagar(pasta: string, colecao: NomeColecao, id: string): void {
  fs.rmSync(caminhoItem(pasta, colecao, id), { force: true });
}

export function obterEstado(pasta: string): EstadoProjeto {
  const projeto = lerProjeto(pasta);
  const contagens = {} as Record<NomeColecao, number>;
  for (const colecao of NOMES_COLECOES) contagens[colecao] = listarIds(pasta, colecao).length;
  return { pasta, projeto, contagens };
}
