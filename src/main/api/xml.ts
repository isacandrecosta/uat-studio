// Respostas em XML (incluindo SOAP): ler campos por XPath para verificar e guardar.
// Os prefixos de namespace (soap:, ns2:...) são ignorados, para "//Estado" funcionar sem declarar namespaces.
import { DOMParser } from '@xmldom/xmldom';
import * as xpath from 'xpath';

/** Marca "campo em falta" (a mesma ideia do JSON). */
export const XML_EM_FALTA = Symbol('em-falta');

/** O texto parece XML? */
export function pareceXml(texto: string): boolean {
  return /^﻿?\s*</.test(texto);
}

/** Tira os prefixos e as declarações de namespace: <soap:Body xmlns:soap="..."> → <Body>. */
export function semNamespaces(texto: string): string {
  return texto
    .replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1')
    .replace(/\s+xmlns(:[\w.-]+)?\s*=\s*("[^"]*"|'[^']*')/g, '')
    .replace(/(\s)[A-Za-z_][\w.-]*:([A-Za-z_][\w.-]*\s*=)/g, '$1$2');
}

type Documento = ReturnType<DOMParser['parseFromString']>;

/** Lê o XML (sem namespaces). Devolve null se não for XML válido. */
export function lerXml(texto: string): Documento | null {
  if (!pareceXml(texto)) return null;
  let invalido = false;
  try {
    const doc = new DOMParser({
      onError: (nivel) => {
        if (nivel !== 'warning') invalido = true;
      },
    }).parseFromString(semNamespaces(texto.replace(/^﻿/, '')), 'text/xml');
    return invalido || !doc.documentElement ? null : doc;
  } catch {
    return null;
  }
}

/**
 * O caminho do campo para XPath: "//Cliente/Estado" ou "/a/b" ficam como estão; "Cliente.Estado" → "//Cliente/Estado";
 * "Estado" → "//Estado"; "@id" → "//@id".
 */
export function paraXPath(caminho: string): string {
  const c = caminho.trim();
  if (c.startsWith('/') || c.startsWith('(') || /^[a-z-]+\(/.test(c)) return c;
  return `//${c.replace(/\./g, '/')}`;
}

/** Valor de um campo por XPath: texto do 1.º nó (ou o número/texto/sim-não da expressão), ou XML_EM_FALTA. */
export function lerXPath(doc: Documento, caminho: string): string | number | boolean | typeof XML_EM_FALTA {
  let resultado: unknown;
  try {
    resultado = xpath.select(paraXPath(caminho), doc as unknown as Node);
  } catch (erro) {
    throw new Error(`O caminho XPath "${caminho}" não é válido (${erro instanceof Error ? erro.message : String(erro)}).`);
  }
  if (Array.isArray(resultado)) {
    if (resultado.length === 0) return XML_EM_FALTA;
    const no = resultado[0] as { nodeValue?: string | null; textContent?: string | null };
    return (no.textContent ?? no.nodeValue ?? '').trim();
  }
  if (typeof resultado === 'string' || typeof resultado === 'number' || typeof resultado === 'boolean') return resultado;
  return XML_EM_FALTA;
}

/** Protege um valor para ficar dentro de um texto XML (&, <, >, aspas). */
export function escaparXml(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Envelope SOAP 1.1 de exemplo (para começar um bloco SOAP). */
export const ENVELOPE_SOAP = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Operacao xmlns="http://exemplo.pt/servico">
      <Campo>{Valor}</Campo>
    </Operacao>
  </soap:Body>
</soap:Envelope>`;
