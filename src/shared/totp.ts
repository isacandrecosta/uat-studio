// TOTP (RFC 6238): o código de 6 dígitos das apps autenticadoras (Microsoft/Google Authenticator),
// calculado a partir da chave secreta da conta de teste. Sem dependências (corre nos dois lados).

/** Lê uma chave em base32 (a que aparece por baixo do QR code), ignorando espaços e hífenes. */
export function deBase32(texto: string): Uint8Array {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const limpo = texto.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!limpo || /[^A-Z2-7]/.test(limpo)) throw new Error('A chave do TOTP tem de estar em base32 (letras A-Z e algarismos 2-7).');
  const bytes: number[] = [];
  let acumulado = 0;
  let bits = 0;
  for (const c of limpo) {
    acumulado = (acumulado << 5) | alfabeto.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((acumulado >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** SHA-1 (só para o HMAC do TOTP). */
function sha1(dados: Uint8Array): Uint8Array {
  const comprimento = dados.length;
  const total = ((comprimento + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(total);
  m.set(dados);
  m[comprimento] = 0x80;
  const vista = new DataView(m.buffer);
  vista.setUint32(total - 4, comprimento * 8);
  vista.setUint32(total - 8, Math.floor((comprimento * 8) / 2 ** 32));
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const rodar = (x: number, n: number): number => (x << n) | (x >>> (32 - n));
  for (let bloco = 0; bloco < total; bloco += 64) {
    for (let i = 0; i < 16; i++) w[i] = vista.getUint32(bloco + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rodar(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const t = (rodar(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rodar(b, 30) >>> 0;
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const saida = new Uint8Array(20);
  const vs = new DataView(saida.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => vs.setUint32(i * 4, h));
  return saida;
}

function hmacSha1(chave: Uint8Array, mensagem: Uint8Array): Uint8Array {
  const k = chave.length > 64 ? sha1(chave) : chave;
  const bloco = new Uint8Array(64);
  bloco.set(k);
  const interno = new Uint8Array(64 + mensagem.length);
  const externo = new Uint8Array(64 + 20);
  for (let i = 0; i < 64; i++) {
    interno[i] = bloco[i] ^ 0x36;
    externo[i] = bloco[i] ^ 0x5c;
  }
  interno.set(mensagem, 64);
  externo.set(sha1(interno), 64);
  return sha1(externo);
}

/** Código TOTP para o momento `agora` (por omissão: 6 dígitos, períodos de 30 segundos). */
export function codigoTotp(chaveBase32: string, agora: Date, digitos = 6, periodoSeg = 30): string {
  const chave = deBase32(chaveBase32);
  const contador = Math.floor(agora.getTime() / 1000 / periodoSeg);
  const mensagem = new Uint8Array(8);
  const vista = new DataView(mensagem.buffer);
  vista.setUint32(0, Math.floor(contador / 2 ** 32));
  vista.setUint32(4, contador >>> 0);
  const h = hmacSha1(chave, mensagem);
  const deslocamento = h[19] & 0x0f;
  const numero = (((h[deslocamento] & 0x7f) << 24) | (h[deslocamento + 1] << 16) | (h[deslocamento + 2] << 8) | h[deslocamento + 3]) % 10 ** digitos;
  return String(numero).padStart(digitos, '0');
}
