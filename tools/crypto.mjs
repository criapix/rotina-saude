#!/usr/bin/env node
// Ferramenta de cifragem do app "Rotina de Saúde".
//
// Usa apenas a Web Crypto API embutida no Node (globalThis.crypto.subtle),
// sem dependências externas. O MESMO esquema é reimplementado no index.html
// para que o navegador consiga decifrar o que este script cifra.
//
// Esquema:
//   - KDF:   PBKDF2-SHA256, ITERATIONS iterações, salt global de 16 bytes
//   - Cifra: AES-GCM-256, IV aleatório de 12 bytes por blob
//   - Blob:  { "iv": base64, "ct": base64(ciphertext+tag) }
//
// Comandos:
//   node tools/crypto.mjs build <senha>     Cifra todas as fontes -> data/*.enc.json,
//                                            gera data/manifest.enc.json e crypto-config.json
//   node tools/crypto.mjs encrypt <senha>   Cifra stdin -> blob JSON no stdout
//   node tools/crypto.mjs decrypt <senha>   Decifra blob JSON do stdin -> texto no stdout
//   node tools/crypto.mjs selftest          Round-trip de sanidade
//
// IMPORTANTE: este script lê arquivos em texto puro durante o `build` (cifragem
// inicial). Os comandos encrypt/decrypt operam só via stdin/stdout, sem gravar
// texto puro em disco.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ITERATIONS = 310000;
const subtle = globalThis.crypto.subtle;

const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (str) => new Uint8Array(Buffer.from(str, 'base64'));
const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(password, salt) {
  const baseKey = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptText(key, text) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { iv: b64(iv), ct: b64(ct) };
}

async function decryptBlob(key, blob) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));
  return dec.decode(pt);
}

// --- Inventário de fontes a cifrar -------------------------------------------
// type: como o cliente deve renderizar (markdown | json | text)
// O home e a Academia são views construídas no SPA, não documentos aqui.
const SOURCES = [
  { slug: 'serie-academia',  file: 'serie-academia.md',                              title: 'Série de Musculação', group: 'Treino',       icon: 'gym',       type: 'markdown' },
  { slug: 'plano-nutricional', file: 'Recomendação nutricional/Plano nutricional.md', title: 'Plano Nutricional',  group: 'Nutrição',     icon: 'nutrition', type: 'markdown' },
  { slug: 'rotina-pedaladas', file: 'Pedal/Rotina de pedaladas.md',                  title: 'Rotina de Pedaladas', group: 'Ciclismo',     icon: 'cycling',   type: 'markdown' },
  { slug: 'dados-saude',      file: 'dados-saude.md',                                 title: 'Consolidação Clínica', group: 'Saúde',       icon: 'health',    type: 'markdown' },
  { slug: 'parecer-multidisciplinar', file: 'parecer-multidisciplinar-08-02-2026.md', title: 'Parecer Multidisciplinar', group: 'Saúde',  icon: 'health',    type: 'markdown' },
  { slug: 'laudos-medicos',   file: 'Laudos/laudos_medicos_documentos_markdown.md',   title: 'Laudos Médicos',     group: 'Saúde',        icon: 'health',    type: 'markdown' },
  { slug: 'laudo-ultra-tireoide', file: 'Laudos/ultra_tireoide_03-03-2026.txt',       title: 'USG Tireoide (03/03/2026)', group: 'Saúde', icon: 'health',    type: 'text' },
  { slug: 'laudo-paaf-tireoide', file: 'Laudos/citopatologico_tireoide_paaf_09-06-2026.txt', title: 'PAAF Tireoide (09/06/2026)', group: 'Saúde', icon: 'health', type: 'text' },
  { slug: 'dermatologia',     file: 'dermatologia.md',                                title: 'Dermatologia',       group: 'Dermatologia', icon: 'derma',     type: 'markdown' },
  { slug: 'changelog',        file: 'changelog.md',                                   title: 'Changelog',          group: 'Geral',        icon: 'home',      type: 'markdown' },
  { slug: 'bio-2025-08-24',   file: 'Bioimpedância/2025-08-24.json',                  title: 'Bioimpedância 24/08/2025', group: 'Bioimpedância', icon: 'health', type: 'json' },
  { slug: 'bio-2026-02-08',   file: 'Bioimpedância/2026-02-08.json',                  title: 'Bioimpedância 08/02/2026', group: 'Bioimpedância', icon: 'health', type: 'json' },
  { slug: 'bio-2026-02-22',   file: 'Bioimpedância/2026-02-22.json',                  title: 'Bioimpedância 22/02/2026', group: 'Bioimpedância', icon: 'health', type: 'json' },
  { slug: 'bio-2026-03-08',   file: 'Bioimpedância/2026-03-08.json',                  title: 'Bioimpedância 08/03/2026', group: 'Bioimpedância', icon: 'health', type: 'json' },
  { slug: 'bio-2026-04-04',   file: 'Bioimpedância/2026-04-04.json',                  title: 'Bioimpedância 04/04/2026', group: 'Bioimpedância', icon: 'health', type: 'json' },
];

// Remove o front-matter YAML do Jekyll (--- ... ---) do markdown.
function stripFrontMatter(text) {
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) {
      const after = text.indexOf('\n', end + 1);
      return text.slice(after + 1).replace(/^\s+/, '');
    }
  }
  return text;
}

async function build(password) {
  if (!password) throw new Error('senha obrigatória: node tools/crypto.mjs build <senha>');

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);

  await mkdir(path.join(ROOT, 'data'), { recursive: true });

  const docs = [];
  for (const src of SOURCES) {
    const abs = path.join(ROOT, src.file);
    if (!existsSync(abs)) { console.warn('  (ausente, pulando) ' + src.file); continue; }
    let content = await readFile(abs, 'utf8');
    if (src.type === 'markdown') content = stripFrontMatter(content);
    const blob = await encryptText(key, content);
    await writeFile(path.join(ROOT, 'data', src.slug + '.enc.json'), JSON.stringify(blob));
    docs.push({ slug: src.slug, title: src.title, group: src.group, icon: src.icon, type: src.type });
    console.log('  cifrado: ' + src.file + ' -> data/' + src.slug + '.enc.json');
  }

  // Manifesto cifrado (também contém só metadados de navegação, mas é sensível
  // por revelar a estrutura — cifrado por completo).
  const manifestBlob = await encryptText(key, JSON.stringify({ docs }));
  await writeFile(path.join(ROOT, 'data', 'manifest.enc.json'), JSON.stringify(manifestBlob));
  console.log('  manifesto: data/manifest.enc.json (' + docs.length + ' docs)');

  // Verificador: permite validar a senha antes de tentar renderizar conteúdo.
  const verifier = await encryptText(key, 'rotina-saude-ok');
  const config = { salt: b64(salt), iterations: ITERATIONS, verifier };
  await writeFile(path.join(ROOT, 'crypto-config.json'), JSON.stringify(config, null, 2));
  console.log('  config:  crypto-config.json');
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function loadConfigKey(password) {
  const config = JSON.parse(await readFile(path.join(ROOT, 'crypto-config.json'), 'utf8'));
  return deriveKey(password, unb64(config.salt));
}

async function selftest() {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey('capone', salt);
  const sample = '# Teste\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
  const blob = await encryptText(key, sample);
  const back = await decryptBlob(key, blob);
  if (back !== sample) throw new Error('FALHOU: round-trip diferente');
  // senha errada deve falhar
  let failed = false;
  try { await decryptBlob(await deriveKey('errada', salt), blob); } catch { failed = true; }
  if (!failed) throw new Error('FALHOU: senha errada decifrou');
  console.log('selftest OK: round-trip bate e senha errada é rejeitada');
}

const [cmd, password] = process.argv.slice(2);
try {
  if (cmd === 'build') { await build(password); console.log('Build concluído.'); }
  else if (cmd === 'encrypt') { process.stdout.write(JSON.stringify(await encryptText(await loadConfigKey(password), await readStdin()))); }
  else if (cmd === 'decrypt') { process.stdout.write(await decryptBlob(await loadConfigKey(password), JSON.parse(await readStdin()))); }
  else if (cmd === 'selftest') { await selftest(); }
  else { console.error('uso: build <senha> | encrypt <senha> | decrypt <senha> | selftest'); process.exit(1); }
} catch (e) {
  console.error('Erro: ' + e.message);
  process.exit(1);
}
