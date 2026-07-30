// Camada de criptografia do cliente.
//
// Espelha o esquema de tools/crypto.mjs:
//   PBKDF2-SHA256 (iterações do crypto-config.json) -> chave AES-GCM-256
//   cada documento é um blob { iv, ct } em base64.
//
// A criptografia cobre APENAS os dados (data/*.enc.json). O frontend — este
// arquivo incluído — é servido em claro, assim como crypto-config.json e
// data/index.json. A senha libera o conteúdo, não a interface.

const subtle = crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

const CHAVE_LOCAL = 'rs.chave';
const VERIFICADOR = 'rotina-saude-ok';

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(str) {
  const s = atob(str);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

export class Cofre {
  constructor() {
    this.config = null;
    this.chave = null;
  }

  get aberto() {
    return this.chave !== null;
  }

  async carregarConfig() {
    const r = await fetch('crypto-config.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('não foi possível carregar crypto-config.json');
    this.config = await r.json();
    return this.config;
  }

  async #derivar(senha) {
    const base = await subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: unb64(this.config.salt), iterations: this.config.iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async #validar(chave) {
    const texto = await this.decifrar(this.config.verificador || this.config.verifier, chave);
    if (texto !== VERIFICADOR) throw new Error('verificador inválido');
    return chave;
  }

  /** Abre o cofre com a senha digitada e guarda a chave no dispositivo. */
  async abrirComSenha(senha, lembrar = true) {
    const chave = await this.#derivar(senha);
    await this.#validar(chave);
    this.chave = chave;
    if (lembrar) {
      try {
        const raw = await subtle.exportKey('raw', chave);
        localStorage.setItem(CHAVE_LOCAL, b64(raw));
      } catch { /* modo privado / cota: segue apenas na sessão */ }
    }
    return true;
  }

  /** Tenta reabrir com a chave já salva neste dispositivo. */
  async abrirComChaveSalva() {
    let raw = null;
    try { raw = localStorage.getItem(CHAVE_LOCAL); } catch { /* sem storage */ }
    if (!raw) return false;
    try {
      const chave = await subtle.importKey('raw', unb64(raw), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      await this.#validar(chave);
      this.chave = chave;
      return true;
    } catch {
      this.esquecer();
      return false;
    }
  }

  esquecer() {
    this.chave = null;
    try { localStorage.removeItem(CHAVE_LOCAL); } catch { /* ignora */ }
  }

  async decifrar(blob, chave = this.chave) {
    if (!chave) throw new Error('cofre fechado');
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, chave, unb64(blob.ct));
    return dec.decode(pt);
  }

  async cifrar(texto) {
    if (!this.chave) throw new Error('cofre fechado');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, this.chave, enc.encode(texto));
    return { iv: b64(iv), ct: b64(ct) };
  }
}
