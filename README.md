# Rotina de Saúde

PWA estático (GitHub Pages) para acompanhar treino, nutrição, ciclismo e histórico clínico.
Os **dados** ficam cifrados no repositório; o **frontend** é servido em claro.

```
index.html            shell público (cabeçalho, abas, coluna lateral)
app/                  frontend em módulos ES — nada cifrado aqui
  styles.css          design system (tema claro/escuro)
  main.js             boot, roteador, navegação, busca, desbloqueio
  crypto.js           PBKDF2 + AES-GCM no cliente
  store.js            carregamento, derivações e índice de busca
  ui.js               helpers de DOM e componentes
  charts.js           gráficos em SVG puro
  views/              uma view por seção
crypto-config.json    salt, iterações e verificador (público, não secreto)
data/index.json       lista de documentos (público)
data/*.enc.json       conteúdo cifrado
tools/crypto.mjs      build / dump / verify / encrypt / decrypt
```

## Modelo de criptografia

**Cifrado:** só o conteúdo dos documentos (`data/*.enc.json`).
**Em claro:** todo o `app/`, o `index.html`, o `crypto-config.json` e o `data/index.json`
(que lista apenas slugs — sem títulos nem metadados de conteúdo).

Na prática: o app abre, monta a interface e a navegação **sem senha**; a área de conteúdo
mostra a tela de desbloqueio. A senha decifra os dados, não a interface.

- **KDF:** PBKDF2-SHA256, 310.000 iterações, salt global de 16 bytes.
- **Cifra:** AES-GCM-256, IV aleatório de 12 bytes por documento.
- **Blob:** `{ "iv": base64, "ct": base64(ciphertext+tag) }`.
- **Verificador:** `crypto-config.json` guarda um blob conhecido para validar a senha
  antes de tentar decifrar conteúdo.
- Depois do primeiro desbloqueio a chave derivada fica no `localStorage` (`rs.chave`);
  o botão **Bloquear** apaga a chave e recarrega.

O mesmo esquema é implementado duas vezes — em `app/crypto.js` (navegador) e em
`tools/crypto.mjs` (Node) — para que os dois lados leiam os mesmos blobs.

## Documentos

Cada documento é um JSON tipado, renderizado por componentes (não é markdown).

| Slug | Conteúdo |
|---|---|
| `perfil` | dados pessoais, objetivos, agenda semanal, alertas ativos, atalhos |
| `treinos` | sessões A/B/C/D com exercícios estruturados, volume, progressão, restrições, rotação de mesociclo |
| `nutricao` | macros por tipo de dia, refeições, opções de café da manhã, suplementos, regras, metas |
| `pedal` | rotina de ciclismo, bike fit, técnica, plano de resistência ao quadríceps |
| `saude` | consolidação clínica: diagnósticos, conduta, red flags, pendências |
| `bioimpedancia` | série temporal consolidada de composição corporal (11 medições) |
| `exames` | painéis laboratoriais e investigação da tireoide |
| `laudos` | RM, US e citopatologia com achados e interpretação |
| `dermatologia` | rotina de skincare e produtos |
| `historico` | changelog do plano |
| `pareceres` | pareceres multidisciplinares |

Exercícios, refeições, suplementos, laudos e medições são **registros com campos**
(`series`, `reps`, `cues`, `alertas`, `grupos`, `status`…), o que permite ao app derivar
o que antes estava escrito à mão: total de séries por grupo, plano do dia, gráficos,
busca e checklists.

## Navegação

- **Hoje** — monta o dia a partir da agenda: treino da vez, pedal, macros do tipo de dia,
  refeições, suplementos aplicáveis e alertas.
- **Treino** — sessões A/B/C/D com cartões de exercício (séries × reps, cues, alertas,
  marcação de séries feitas), volume semanal, progressão, restrições e rotação.
- **Pedal** — rotina, plano de resistência, bike fit e cuidados.
- **Nutrição** — um painel por tipo de dia, suplementos, estratégias e metas.
- **Saúde** — resumo clínico, composição corporal com gráficos, exames, laudos e pendências.
- **Mais** (`⋯`) — dermatologia, histórico, pareceres, perfil, editor, tema, bloquear.
- **Busca global** (ícone de lupa ou `Ctrl/Cmd+K`) sobre todos os documentos decifrados.

As marcações de séries e de suplementos ficam no `localStorage`, por data, e são
apagadas automaticamente depois de 14 dias.

## Editar conteúdo

O texto puro **nunca** é versionado. Duas formas de editar:

**1. No próprio app** (`⋯` → Editar dados)
Escolha o documento, edite o JSON (validado ao digitar), clique em **Salvar cifrado** —
o app baixa `<slug>.enc.json` já cifrado. Substitua o arquivo em `data/` e faça commit.

**2. Por linha de comando**

```bash
node tools/crypto.mjs dump <senha>      # data/*.enc.json -> ./content/*.json (em claro)
$EDITOR content/treinos.json
node tools/crypto.mjs build <senha>     # ./content/*.json -> data/*.enc.json + data/index.json
node tools/crypto.mjs verify <senha>    # decifra tudo e valida JSON + índice
```

`./content/` está no `.gitignore` — é o único lugar onde texto puro aparece, e nunca
deve ser versionado. O `build` reaproveita o salt existente quando a senha é a mesma,
então a senha em uso continua valendo.

Outros comandos:

```bash
node tools/crypto.mjs selftest                        # round-trip de sanidade
cat data/saude.enc.json | node tools/crypto.mjs decrypt <senha>
echo '{"a":1}' | node tools/crypto.mjs encrypt <senha> > data/x.enc.json
```

Para trocar a senha: `node tools/crypto.mjs dump <senhaAtual>` e depois
`node tools/crypto.mjs build <senhaNova>` (gera salt novo e recifra tudo).

## Rodar localmente

Precisa de HTTP — módulos ES e `fetch` não funcionam em `file://`:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Offline

O Service Worker (`sw.js`) usa *stale-while-revalidate* para o shell e *network-first*
para `data/` e `crypto-config.json`, de modo que uma edição publicada aparece assim que
houver rede. O cache guarda apenas ciphertext; a chave nunca é cacheada.
Ao mudar arquivos de `app/`, suba a constante `VERSAO` em `sw.js`.

## Divergências conhecidas nos dados

Preservadas como estavam nos documentos originais e sinalizadas na interface — não foram
"corrigidas" por conta própria porque são decisões clínicas:

1. **Total de séries de B e D.** O documento declarava 20 e 24 séries, mas a soma dos
   exercícios (e o próprio detalhamento por grupo) dá 23 e 26. O app mostra o total
   calculado e explica a diferença.
2. **Dias duplos.** O plano nutricional lista Ter/Qui como dias duplos e a quarta como
   descanso; o calendário da série (revisão 30/06/2026) coloca pedal + academia em Ter e
   Qua, com Qui de academia apenas. O app segue o calendário da série — que é mais recente —
   e mostra um aviso sugerindo alinhar as duas fontes com a nutricionista.

## ⚠️ Avisos de segurança

- A senha em uso é curta. Como o ciphertext é **baixável publicamente**, ela é vulnerável a
  **força bruta offline** por um atacante dedicado. Protege contra olhares casuais,
  buscadores e compartilhamento de URL — não contra um adversário determinado. Use uma
  frase-senha longa para proteção real.
- A chave fica no `localStorage`: quem usar este navegador vê o conteúdo sem digitar a senha.
- `data/index.json` revela quantos documentos existem e seus slugs (`saude`, `laudos`…).
  Isso é intencional — é o que permite o shell carregar sem senha.
- **Histórico do git:** apagar arquivos em texto puro não os remove do histórico de um
  repositório público. Remoção completa exige reescrever o histórico
  (`git filter-repo`/BFG) e force-push.
- Este app é um registro pessoal e não substitui avaliação de profissionais de saúde.
