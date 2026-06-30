# Rotina de Saúde — PWA criptografado

App PWA estático (GitHub Pages) com **todo o conteúdo cifrado**. O repositório guarda apenas
*ciphertext*; o navegador pede uma senha na primeira tela, decifra o conteúdo localmente e guarda
a chave no dispositivo (com botão para bloquear).

## Como funciona

- **Criptografia:** PBKDF2-SHA256 (310.000 iterações) deriva uma chave AES-GCM-256 a partir da senha.
  Cada documento é um blob `{ iv, ct }` em `data/*.enc.json`. O `crypto-config.json` guarda o `salt`
  (não secreto), o número de iterações e um verificador para validar a senha.
- **Primeira tela:** `index.html` mostra a tela de senha se não houver chave salva. Ao desbloquear,
  a chave fica no `localStorage` (`rs_key`) e o app não pede senha de novo neste dispositivo.
- **Bloquear:** o botão de cadeado no cabeçalho apaga a chave do dispositivo e volta à tela de senha.
- **Render:** o conteúdo é markdown/texto/JSON decifrado e renderizado no cliente (`marked`, embutido
  localmente em `marked.min.js`, sem CDN — funciona offline via Service Worker).

## Editar conteúdo (decifrar → ajustar → cifrar)

O texto puro **nunca** fica em disco. A edição é feita no próprio app:

1. Abra o documento, clique no ícone de **editar** (lápis) no cabeçalho.
2. Edite o markdown/texto no campo.
3. Clique em **Salvar (baixar cifrado)** — o app cifra e baixa `data/<slug>.enc.json`.
4. Substitua o arquivo correspondente em `data/` no repositório e faça `git commit`.

Para uso avançado/automação há também o `tools/crypto.mjs` (Node, sem dependências):

```bash
node tools/crypto.mjs selftest                 # teste de sanidade
cat data/dados-saude.enc.json | node tools/crypto.mjs decrypt <senha>   # decifra p/ stdout
echo "..." | node tools/crypto.mjs encrypt <senha> > data/<slug>.enc.json
node tools/crypto.mjs build <senha>            # recifra todas as fontes (uso inicial)
```

Os comandos `encrypt`/`decrypt` operam só por stdin/stdout, sem gravar texto puro em disco.

## ⚠️ Avisos de segurança

- A senha em uso é curta. Como o conteúdo cifrado é **baixável publicamente**, ela é vulnerável a
  **força bruta offline** por um atacante dedicado. Protege contra olhares casuais, buscadores e
  compartilhamento de URL — não contra um adversário determinado. Use uma frase-senha mais longa
  para proteção real (rode `node tools/crypto.mjs build <novaSenha>` e refaça os blobs).
- A chave fica no `localStorage`: quem usar este navegador vê o conteúdo sem digitar a senha.
- **Histórico do git:** apagar os arquivos em texto puro não os remove do histórico do repositório
  público. Para remoção completa é preciso reescrever o histórico (`git filter-repo`/BFG) e force-push.
