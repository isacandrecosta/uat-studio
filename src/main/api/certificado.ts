// mTLS: pedidos HTTPS com certificado de cliente (.pfx/.p12). O net.fetch do Electron não aceita
// certificados de cliente, por isso estes pedidos usam o HTTPS do Node (sem o proxy do Windows).
// Os certificados de servidor são verificados com as autoridades do Node, as do Windows e a do perfil.
import * as http from 'node:http';
import * as https from 'node:https';
import * as tls from 'node:tls';

export interface OpcoesCertificado {
  pfx: Buffer;
  passphrase?: string;
  /** Autoridade extra em que confiar (por exemplo, a de um ambiente de testes). */
  ca?: Buffer;
}

/** As autoridades do Node mais as do Windows (quando a versão do Node as sabe ler). */
function autoridades(extra?: Buffer): Array<string | Buffer> {
  const lista: Array<string | Buffer> = [...tls.rootCertificates];
  try {
    const doSistema = (tls as unknown as { getCACertificates?: (tipo: string) => string[] }).getCACertificates?.('system');
    if (doSistema) lista.push(...doSistema);
  } catch {
    // Versão do Node sem acesso às autoridades do Windows: ficam as do Node.
  }
  if (extra) lista.push(extra);
  return lista;
}

/** Um "fetch" que apresenta o certificado de cliente. Só aceita corpos em texto (como os blocos de API). */
export function criarFetchComCertificado(opcoes: OpcoesCertificado): typeof fetch {
  const agente = new https.Agent({ pfx: opcoes.pfx, passphrase: opcoes.passphrase, ca: autoridades(opcoes.ca), keepAlive: false });
  return ((entrada: Parameters<typeof fetch>[0], init: RequestInit = {}) =>
    new Promise<Response>((resolver, rejeitar) => {
      const url = new URL(String(entrada));
      if (url.protocol !== 'https:') {
        rejeitar(new Error(`Um certificado de cliente só funciona com https (o endereço é ${url.protocol}).`));
        return;
      }
      const cabecalhos: Record<string, string> = {};
      new Headers(init.headers).forEach((valor, nome) => (cabecalhos[nome] = valor));
      const corpo = init.body === undefined || init.body === null ? undefined : String(init.body);
      if (corpo !== undefined) cabecalhos['content-length'] = String(Buffer.byteLength(corpo));
      const aoResponder = (resposta: http.IncomingMessage): void => {
        const partes: Buffer[] = [];
        resposta.on('data', (parte: Buffer) => partes.push(parte));
        resposta.on('end', () => {
          const headers = new Headers();
          for (const [nome, valor] of Object.entries(resposta.headers)) {
            if (Array.isArray(valor)) valor.forEach((v) => headers.append(nome, v));
            else if (valor !== undefined) headers.set(nome, valor);
          }
          const estado = resposta.statusCode ?? 0;
          // Response não aceita corpo nos códigos 204/304.
          resolver(new Response(estado === 204 || estado === 304 ? null : Buffer.concat(partes), { status: estado, headers }));
        });
        resposta.on('error', rejeitar);
      };
      // Um certificado que não abre (password errada) dá erro logo aqui, antes de haver ligação.
      let pedido: http.ClientRequest;
      try {
        pedido = https.request(url, { method: init.method ?? 'GET', headers: cabecalhos, agent: agente }, aoResponder);
      } catch (erro) {
        rejeitar(explicarTls(erro as Error & { code?: string }));
        return;
      }
      pedido.on('error', (erro: Error & { code?: string }) => rejeitar(explicarTls(erro)));
      const sinal = init.signal;
      if (sinal) {
        if (sinal.aborted) pedido.destroy(new Error('aborted'));
        sinal.addEventListener('abort', () => pedido.destroy(Object.assign(new Error('The operation was aborted (TimeoutError)'), { name: 'TimeoutError' })), { once: true });
      }
      if (corpo !== undefined) pedido.write(corpo);
      pedido.end();
    })) as typeof fetch;
}

/** Erros de TLS em frases simples (a password do certificado nunca aparece). */
function explicarTls(erro: Error & { code?: string }): Error {
  const texto = `${erro.code ?? ''} ${erro.message}`;
  if (/mac verify failure|bad decrypt|PKCS12|Unsupported PKCS12/i.test(texto)) return new Error('certificate: não foi possível abrir o certificado de cliente (a password está errada ou o ficheiro não é um .pfx/.p12 válido)');
  if (/SELF_SIGNED|UNABLE_TO_VERIFY|unable to get local issuer|CERT_/i.test(texto)) return new Error(`certificate: o certificado do servidor não é de confiança (${erro.code ?? erro.message}); indique a autoridade (CA) no perfil`);
  return erro;
}
