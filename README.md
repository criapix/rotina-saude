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
  motor.js            ajuste diário e da janela a partir do registro
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
| `treinos` | sessões A/B/C/D com exercícios estruturados, volume, progressão, restrições, rotação de mesociclo e `plano` (metas da janela, prioridade, limites clínicos) |
| `nutricao` | macros por tipo de dia, cardápio (5 refeições com porções e macros), trocas equivalentes, preferências alimentares, suplementos, regras, metas |
| `pedal` | rotina de ciclismo, bike fit, técnica, plano de resistência ao quadríceps e `plano` (metas da janela) |
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

## Modo flexível: registrar e deixar o app se ajustar

Não há programação fixa por dia da semana. Você registra o que fez e o app recalcula.

**O que se registra** (aba Hoje): `Pedalei`, `Malhei` (escolhendo a série) e `Fiz rolo` —
mais de uma execução por dia é aceita. As refeições do plano são marcadas uma a uma.

**Ajuste diário.** O tipo de dia deixa de vir do calendário e passa a vir do registro:

| Registrado | Tipo de dia | Alvo |
|---|---|---|
| pedal + academia | duplo | 3500 kcal |
| só pedal | pedal | 3200 kcal |
| só academia | academia | 2700 kcal |
| nada | descanso | 2300 kcal (provisório) |

A partir daí o app mostra quanto falta de caloria, proteína e carboidrato; quais refeições
estão pendentes; e só os suplementos aplicáveis (whey e caseína em dia de treino, colágeno
apenas nos treinos B e D). Se você já comeu como dia leve e depois treinou, ele diz quanto o
alvo subiu e quanto falta repor. Os macros de cada refeição são gravados no momento da
marcação, então mudar o tipo do dia depois não reescreve o que já foi comido.

**Ajuste semanal — janela móvel de 7 dias** (aba Semana). A cada dia o app olha os 7 dias
anteriores, em vez de uma semana de calendário: treinar no domingo conta e não existe virada
que zera o progresso. Metas da janela: 4 academias, 3 pedais, 2 rolos. Mostra o que falta,
o que sai da janela nos próximos dias, o volume por grupo muscular comparado ao alvo semanal
da série, e a próxima sessão sugerida.

**Como a próxima sessão é escolhida**, em ordem:

1. **Limite clínico** — bloqueio duro. Peito é travado em 8 sets por janela (ombro); A e C
   somam exatamente 8, então o motor nunca sugere uma delas se isso estouraria o teto,
   mesmo estando no topo da prioridade.
2. Não repetir uma sessão já feita na janela.
3. 24h desde a última sessão e 48h para a mesma categoria (superior/inferior).
4. A ordem de prioridade configurada em `treinos.plano.prioridadeParcial`.

Quando tudo tem ressalva, escolhe a menos bloqueada. A aba Semana mostra numa tabela por que
cada sessão foi ou não escolhida.

**Semanas curtas.** Se não couberem as 4 sessões, a ordem atual é **A → C → B → D**
(superiores primeiro), escolhida pelo usuário em 30/07/2026 para atender o objetivo de ganho
de peitoral e braço. ⚠️ Isso contraria o parecer de 08/02/2026, que registra pernas como
prioridade absoluta (~40% da massa muscular) pela transferência ao pedal; o app compensa
avisando quando os inferiores passam 7 dias sem estímulo. Para inverter, troque
`treinos.plano.prioridadeParcial.ordem` para `["B","D","A","C"]`.

### Demais abas

- **Treino** — sessões A/B/C/D com cartões de exercício (séries × reps, cues, alertas,
  marcação de séries feitas), volume semanal, progressão, restrições e rotação. A lista
  marca qual é a `próxima` e quais já foram `✓ feitas` na janela.
- **Nutrição** — um painel por tipo de dia (abre no tipo derivado de hoje), suplementos,
  estratégias e metas.
- **Saúde** — resumo clínico, composição corporal com gráficos, exames, laudos e pendências.
- **Mais** (`⋯`) — pedal, dermatologia, histórico, pareceres, perfil, editor, tema, bloquear.
- **Busca global** (ícone de lupa ou `Ctrl/Cmd+K`) sobre todos os documentos decifrados.

### Onde o registro fica guardado

No `localStorage` do navegador, em `rs.registro`, com 180 dias de retenção. O app é estático
e não tem servidor, então **não há sincronização entre aparelhos**: use *Exportar registro* /
*Importar* na aba Semana para levar o histórico de um dispositivo a outro ou fazer backup —
limpar os dados do site apaga o registro.

## Cardápio

As refeições não são genéricas: foram montadas a partir das preferências do usuário,
registradas em `nutricao.preferencias`. São **5 refeições** — 4 grandes (café, almoço,
lanche, jantar) + 1 após a atividade — mais os itens de *combustível* (maltodextrina
durante o pedal, tâmaras no minuto 45), que são marcados com `combustivel: true` e não
contam como refeição.

Cada refeição traz `hora`, `itens` (com as porções em gramas), `macros` e `trocas`
equivalentes. As porções foram resolvidas por iteração para fechar o total de cada tipo
de dia — a proteína e o carbo-base de cada refeição são dimensionados para atingir a
fração-alvo do dia, considerando que arroz, pão e batata também trazem proteína. Desvio
máximo por dia: 2 g de proteína, 4 g de gordura, 13 g de carboidrato.

Duas refeições são marcadas semanticamente para o motor, em vez de por id:
`janelaAnabolica: true` (dispara o alerta de pós-atividade) e `regraDoRelogio: true`
(intra-treino no minuto 45). Renomear a refeição não quebra a regra.

**Para remontar o cardápio** depois de mudar o gosto: atualize `nutricao.preferencias`
e recalcule as porções — os totais por tipo de dia (que vêm do plano da nutricionista)
são a restrição, não as porções.

⚠️ As porções são estimativa para acompanhamento, não medição. Os totais diários são
do plano; o rateio por refeição foi calculado a partir das quantidades dos alimentos.

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
   Qua, com Qui de academia apenas. Com o modo flexível isso deixou de decidir o dia — o tipo
   vem do que é registrado — mas a divergência entre os dois documentos segue sinalizada.
3. **Porções do cardápio são estimativa.** Os totais diários (kcal, P/G/C) são do plano
   nutricional. As porções de cada refeição foram calculadas para fechar esses totais com os
   alimentos que o usuário aceita. É estimativa, não medição, e está rotulada como tal.
   Consequências registradas em `nutricao.preferencias.consequencias`: com peixe limitado a
   tilápia e merluza, o ômega-3 passou a depender exclusivamente da cápsula de 3 g/dia — o
   que pesa porque o HDL está em 43 mg/dL.
4. **Prioridade em semana curta** é escolha do usuário, não recomendação clínica — ver a
   ressalva na seção de modo flexível.

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
