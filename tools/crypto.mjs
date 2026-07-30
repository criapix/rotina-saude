#!/usr/bin/env node
// Ferramenta de cifragem do app "Rotina de Saúde".
//
// Usa apenas a Web Crypto API embutida no Node (globalThis.crypto.subtle),
// sem dependências externas. O MESMO esquema é reimplementado em app/crypto.js
// para que o navegador consiga decifrar o que este script cifra.
//
// Esquema:
//   - KDF:   PBKDF2-SHA256, ITERATIONS iterações, salt global de 16 bytes
//   - Cifra: AES-GCM-256, IV aleatório de 12 bytes por blob
//   - Blob:  { "iv": base64, "ct": base64(ciphertext+tag) }
//
// O que é cifrado e o que não é:
//   - CIFRADO:     data/<slug>.enc.json — o conteúdo dos documentos.
//   - NÃO CIFRADO: crypto-config.json (salt/iterações/verificador), data/index.json
//                  (lista de slugs) e todo o frontend em app/. O shell do app
//                  carrega sem senha; a senha libera apenas os dados.
//
// Comandos:
//   node tools/crypto.mjs build <senha> [dirFonte]
//       Cifra todos os <slug>.json de dirFonte (padrão: ./content) para
//       data/<slug>.enc.json e regrava data/index.json. Reaproveita o salt do
//       crypto-config.json quando ele existe (a senha continua a mesma);
//       gera um novo salt se não existir.
//
//   node tools/crypto.mjs dump <senha> [dirDestino]
//       Decifra data/*.enc.json de volta para dirDestino/<slug>.json (padrão:
//       ./content) para edição local. dirDestino é ignorado pelo git.
//
//   node tools/crypto.mjs encrypt <senha>    Cifra stdin -> blob JSON no stdout
//   node tools/crypto.mjs decrypt <senha>    Decifra blob JSON do stdin -> stdout
//   node tools/crypto.mjs verify <senha>     Decifra tudo em memória e valida o JSON
//   node tools/crypto.mjs selftest           Round-trip de sanidade
//
// IMPORTANTE: `build` e `dump` leem/escrevem texto puro no diretório de conteúdo.
// Esse diretório está no .gitignore — nunca faça commit dele.

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_FILE = path.join(ROOT, 'crypto-config.json');
const DEFAULT_CONTENT_DIR = path.join(ROOT, 'content');
const ITERATIONS = 310000;
const VERIFIER_TEXT = 'rotina-saude-ok';
const subtle = globalThis.crypto.subtle;

// Ordem de navegação dos documentos. Um slug fora desta lista ainda é cifrado,
// só entra no fim do índice.
const DOC_ORDER = [
  'perfil',
  'treinos',
  'nutricao',
  'pedal',
  'saude',
  'bioimpedancia',
  'exames',
  'laudos',
  'dermatologia',
  'historico',
  'pareceres'
];

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

async function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  return JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
}

// Deriva a chave a partir do crypto-config.json e confirma a senha no verificador.
async function loadConfigKey(password) {
  if (!password) throw new Error('senha obrigatória');
  const config = await loadConfig();
  if (!config) throw new Error('crypto-config.json não encontrado — rode `build` primeiro');
  const key = await deriveKey(password, unb64(config.salt));
  try {
    if ((await decryptBlob(key, config.verifier)) !== VERIFIER_TEXT) throw new Error();
  } catch {
    throw new Error('senha incorreta (verificador não bate)');
  }
  return key;
}

function sortSlugs(slugs) {
  return [...slugs].sort((a, b) => {
    const ia = DOC_ORDER.indexOf(a), ib = DOC_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

async function encFiles() {
  if (!existsSync(DATA_DIR)) return [];
  const names = await readdir(DATA_DIR);
  return names.filter((n) => n.endsWith('.enc.json')).map((n) => n.slice(0, -'.enc.json'.length));
}

async function build(password, contentDirArg) {
  if (!password) throw new Error('uso: node tools/crypto.mjs build <senha> [dirFonte]');
  const contentDir = contentDirArg ? path.resolve(contentDirArg) : DEFAULT_CONTENT_DIR;
  if (!existsSync(contentDir)) {
    throw new Error(`diretório de conteúdo não encontrado: ${contentDir}\n` +
      'Rode `node tools/crypto.mjs dump <senha>` para extrair os documentos atuais e editá-los.');
  }

  const sources = (await readdir(contentDir))
    .filter((n) => n.endsWith('.json') && !n.endsWith('.enc.json'))
    .map((n) => n.slice(0, -'.json'.length));
  if (!sources.length) throw new Error(`nenhum .json em ${contentDir}`);

  // Reaproveita o salt existente para não invalidar a senha em uso.
  const existing = await loadConfig();
  let salt, reused = false;
  if (existing && existing.salt && existing.iterations === ITERATIONS) {
    salt = unb64(existing.salt);
    const probe = await deriveKey(password, salt);
    try {
      if ((await decryptBlob(probe, existing.verifier)) === VERIFIER_TEXT) reused = true;
    } catch { /* senha diferente da anterior: gera salt novo */ }
  }
  if (!reused) salt = globalThis.crypto.getRandomValues(new Uint8Array(16));

  const key = await deriveKey(password, salt);
  await mkdir(DATA_DIR, { recursive: true });

  const docs = [];
  for (const slug of sortSlugs(sources)) {
    const raw = await readFile(path.join(contentDir, slug + '.json'), 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`${slug}.json não é JSON válido: ${e.message}`);
    }
    // Reserializa compacto: o blob cifrado fica menor e o formato normalizado.
    const text = JSON.stringify(parsed);
    const blob = await encryptText(key, text);
    await writeFile(path.join(DATA_DIR, slug + '.enc.json'), JSON.stringify(blob));
    docs.push({ slug, bytes: text.length });
    console.log(`  cifrado: ${slug}.json -> data/${slug}.enc.json (${text.length} B em claro)`);
  }

  // Índice NÃO cifrado: só a lista de slugs, para o app saber o que buscar
  // e para o Service Worker pré-cachear. Sem títulos nem metadados sensíveis.
  const index = {
    versao: 2,
    geradoEm: new Date().toISOString().slice(0, 10),
    documentos: docs.map((d) => d.slug)
  };
  await writeFile(path.join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  console.log(`  índice:  data/index.json (${docs.length} documentos, sem cifra)`);

  // Remove blobs órfãos de builds anteriores.
  for (const slug of await encFiles()) {
    if (!docs.some((d) => d.slug === slug)) {
      await unlink(path.join(DATA_DIR, slug + '.enc.json'));
      console.log(`  removido órfão: data/${slug}.enc.json`);
    }
  }

  const verifier = await encryptText(key, VERIFIER_TEXT);
  await writeFile(CONFIG_FILE, JSON.stringify({ salt: b64(salt), iterations: ITERATIONS, verifier }, null, 2) + '\n');
  console.log(`  config:  crypto-config.json (salt ${reused ? 'reaproveitado' : 'novo'})`);
}

async function dump(password, outDirArg) {
  const key = await loadConfigKey(password);
  const outDir = outDirArg ? path.resolve(outDirArg) : DEFAULT_CONTENT_DIR;
  await mkdir(outDir, { recursive: true });
  const slugs = sortSlugs(await encFiles());
  if (!slugs.length) throw new Error('nenhum data/*.enc.json encontrado');
  for (const slug of slugs) {
    const blob = JSON.parse(await readFile(path.join(DATA_DIR, slug + '.enc.json'), 'utf8'));
    const text = await decryptBlob(key, blob);
    const pretty = JSON.stringify(JSON.parse(text), null, 1) + '\n';
    await writeFile(path.join(outDir, slug + '.json'), pretty);
    console.log(`  decifrado: data/${slug}.enc.json -> ${path.relative(ROOT, path.join(outDir, slug + '.json'))}`);
  }
  console.log(`\n${slugs.length} documentos em ${outDir} — NÃO faça commit deste diretório.`);
}

async function verify(password) {
  const key = await loadConfigKey(password);
  const slugs = sortSlugs(await encFiles());
  let total = 0;
  for (const slug of slugs) {
    const blob = JSON.parse(await readFile(path.join(DATA_DIR, slug + '.enc.json'), 'utf8'));
    const text = await decryptBlob(key, blob);
    JSON.parse(text); // valida
    total += text.length;
    console.log(`  ok: ${slug} (${text.length} B)`);
  }
  const index = JSON.parse(await readFile(path.join(DATA_DIR, 'index.json'), 'utf8'));
  const faltando = index.documentos.filter((s) => !slugs.includes(s));
  const sobrando = slugs.filter((s) => !index.documentos.includes(s));
  if (faltando.length) throw new Error('no índice mas sem blob: ' + faltando.join(', '));
  if (sobrando.length) throw new Error('com blob mas fora do índice: ' + sobrando.join(', '));
  console.log(`\n${slugs.length} documentos, ${total} B em claro, índice consistente.`);
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function selftest() {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey('capone', salt);
  const sample = JSON.stringify({ titulo: 'Teste', itens: [1, 2, 3], acentos: 'ação · 45° · ⚠️' });
  const blob = await encryptText(key, sample);
  const back = await decryptBlob(key, blob);
  if (back !== sample) throw new Error('FALHOU: round-trip diferente');
  let failed = false;
  try { await decryptBlob(await deriveKey('errada', salt), blob); } catch { failed = true; }
  if (!failed) throw new Error('FALHOU: senha errada decifrou');
  console.log('selftest OK: round-trip bate e senha errada é rejeitada');
}

const [cmd, password, arg3] = process.argv.slice(2);
try {
  if (cmd === 'build') { await build(password, arg3); console.log('Build concluído.'); }
  else if (cmd === 'dump') { await dump(password, arg3); }
  else if (cmd === 'verify') { await verify(password); }
  else if (cmd === 'encrypt') { process.stdout.write(JSON.stringify(await encryptText(await loadConfigKey(password), await readStdin()))); }
  else if (cmd === 'decrypt') { process.stdout.write(await decryptBlob(await loadConfigKey(password), JSON.parse(await readStdin()))); }
  else if (cmd === 'selftest') { await selftest(); }
  else {
    console.error('uso: build <senha> [dirFonte] | dump <senha> [dirDestino] | verify <senha> | encrypt <senha> | decrypt <senha> | selftest');
    process.exit(1);
  }
} catch (e) {
  console.error('Erro: ' + e.message);
  process.exit(1);
}
