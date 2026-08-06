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

## Arquitetura de informação: operar × consultar

O app tem duas naturezas de conteúdo e elas não se misturam:

- **Operar** — o que se faz várias vezes por dia. Três telas, cada uma com um trabalho.
- **Consultar** — plano completo, exames, laudos, histórico, balanço da semana. Se lê de vez
  em quando; não pode competir por espaço com a operação.

A navegação inferior tem exatamente quatro itens:

| Aba | Responde | Contém |
|---|---|---|
| **Hoje** | o que eu faço agora? | uma ação em destaque, quatro atalhos, no máximo um alerta |
| **Comer** | o que preciso comer? como registro? | progresso do dia, refeição da vez, lista do cardápio, suplementos |
| **Treinar** | qual série? como registro série e pedal? | série de hoje (ou a sugerida), registro de pedal, o que já entrou |
| **Consultar** | onde está aquilo? | todo o resto, agrupado |

### Os momentos de uso, e onde cada um resolve

O desenho partiu dos cinco momentos frequentes, não das entidades do domínio:

| Momento | Caminho | Toques |
|---|---|---|
| saber o que preciso comer | Comer → refeição da vez em destaque | 1 |
| registrar o que comi | Comer → **Comi isso**, ou **Comi outra coisa** para compor | 2 |
| saber qual série tenho que fazer | Treinar → série sugerida no topo | 1 |
| registrar a série que fiz | Treinar → **Começar o treino X** → marcar série por série | 2 |
| registrar o pedal que fiz | Treinar → perfil, duração, **Registrar pedal** | 3 |

**Hoje calcula a próxima ação** em vez de listar tudo (`proximaAcao` no motor), por ordem de
prazo real: janela anabólica aberta (30 min) → refeição da hora → série sugerida → dia fechado.
O cartão muda de cor com a urgência e leva direto ao lugar de agir.

**Treinar abre na série quando já há treino registrado.** Na academia o que importa é a lista
de exercícios com as marcações, não um painel — então o painel some.

### Teto de alertas

O problema anterior era acúmulo: orientações do dia, alertas da janela e alertas clínicos
contínuos empilhados na mesma tela. Agora:

- **Hoje** mostra **um** alerta — o mais urgente. O resto vira `Ver todos os alertas (n)`, que
  abre uma folha com três grupos: do dia, da janela, atenção contínua.
- **Comer** mostra só os avisos que mudam o que se vai comer agora.
- **Treinar** mostra só as ressalvas da sessão sugerida.
- Alerta clínico contínuo (ombro, composição corporal, cirurgião) não é do dia: vive na folha
  de alertas e em Consultar → Saúde.

Efeito medido no navegador, com o mesmo estado: a tela Hoje passou de **~10 300 px** de altura
para **~1 000 px** — cabe numa tela e meia em vez de dez.

## Modo flexível: registrar e deixar o app se ajustar

Não há programação fixa por dia da semana. Você registra o que fez e o app recalcula.

**O que se registra** (aba Treinar): pedal e série, mais de uma execução por dia. As refeições
são marcadas na aba Comer, uma a uma, ou [personalizadas](#personalizar-refeições) com o que
você realmente comeu.

**O que se registra, em detalhe.** Cada execução leva **duração** e, no pedal, um **perfil de
intensidade**; o gasto estimado aparece no botão antes de gravar e continua editável depois
(o valor do ciclocomputador substitui a estimativa). O tipo de dia deixa de vir do calendário
e passa a vir do registro:

| Registrado | Tipo de dia | Molde de cardápio |
|---|---|---|
| pedal + academia | duplo | 3483 kcal |
| só pedal | pedal | 3302 kcal |
| só academia | academia | 2781 kcal |
| nada | descanso | 2332 kcal (provisório) |

O **alvo do dia**, porém, não é mais esse degrau fixo — vem do gasto registrado (ver
[Compensação do gasto calórico](#compensação-do-gasto-calórico)). O tipo de dia continua
servindo como molde de cardápio, e o app diz o que somar quando o alvo passa do molde.

A partir daí o app mostra quanto falta de caloria, proteína e carboidrato; quais refeições
estão pendentes; e só os suplementos aplicáveis (whey e caseína em dia de treino, colágeno
apenas nos treinos B e D). Se você já comeu como dia leve e depois treinou, ele diz quanto o
alvo subiu e quanto falta repor. Os macros de cada refeição são gravados no momento da
marcação, então mudar o tipo do dia depois não reescreve o que já foi comido.

**Ajuste semanal — janela móvel de 7 dias** (Consultar → Últimos 7 dias). A cada dia o app olha os 7 dias
anteriores, em vez de uma semana de calendário: treinar no domingo conta e não existe virada
que zera o progresso. Metas da janela: 4 academias e 3 pedais. Mostra o que falta,
o que sai da janela nos próximos dias, o volume por grupo muscular comparado ao alvo semanal
da série, e a próxima sessão sugerida.

**Como a próxima sessão é escolhida**, em ordem:

1. **Limite clínico** — bloqueio duro. Peito é travado em 8 sets por janela (ombro); A e C
   somam exatamente 8, então o motor nunca sugere uma delas se isso estouraria o teto,
   mesmo estando no topo da prioridade.
2. Não repetir uma sessão já feita na janela.
3. 24h desde a última sessão e 48h para a mesma categoria (superior/inferior).
4. A ordem de prioridade configurada em `treinos.plano.prioridadeParcial`.

Quando tudo tem ressalva, escolhe a menos bloqueada — e a ressalva aparece no cartão da série
em Treinar. Consultar → Últimos 7 dias mostra numa tabela por que cada sessão foi ou não
escolhida.

**Semanas curtas.** Se não couberem as 4 sessões, a ordem atual é **A → C → B → D**
(superiores primeiro), escolhida pelo usuário em 30/07/2026 para atender o objetivo de ganho
de peitoral e braço. ⚠️ Isso contraria o parecer de 08/02/2026, que registra pernas como
prioridade absoluta (~40% da massa muscular) pela transferência ao pedal; o app compensa
avisando quando os inferiores passam 7 dias sem estímulo. Para inverter, troque
`treinos.plano.prioridadeParcial.ordem` para `["B","D","A","C"]`.

### O que há em Consultar

- **Nutrição** — um painel por tipo de dia (abre no tipo derivado de hoje), tabela de
  alimentos, compensação do gasto, suplementos, estratégias e metas.
- **Série de musculação** — sessões A/B/C/D com cartões de exercício (séries × reps, cues,
  alertas, marcação de séries feitas), volume semanal, progressão, restrições e rotação. A
  lista marca qual é a `próxima` e quais já foram `✓ feitas` na janela.
- **Ciclismo** — rotina, protocolo do joelho, plano de resistência e cuidados.
- **Últimos 7 dias** — o que foi feito, gasto e balanço calórico dia a dia, volume por grupo,
  limites clínicos, por que cada sessão foi escolhida, exportar/importar o registro.
- **Saúde** — resumo clínico, composição corporal com gráficos, exames, laudos e pendências.
- **Dermatologia · Histórico · Pareceres · Perfil · Editar dados.**
- **Ir direto** — atalhos vindos de `perfil.atalhos` para sub-abas específicas.
- **Busca global** (ícone de lupa ou `Ctrl/Cmd+K`) sobre todos os documentos decifrados.
- `⋯` no topo — Consultar, editor, bloquear e tema.

### Onde o registro fica guardado

No `localStorage` do navegador, em `rs.registro`, com 180 dias de retenção. O app é estático
e não tem servidor, então **não há sincronização entre aparelhos**: use *Exportar registro* /
*Importar* em Consultar → Últimos 7 dias para levar o histórico de um aparelho a outro ou
fazer backup —
limpar os dados do site apaga o registro.

## Compensação do gasto calórico

O alvo do dia é **base + gasto**, não um degrau fixo:

```
alvo   = baseKcal (2300) + gasto            , limitado ao teto de 4000 kcal/dia
proteína = 170 g   (fixa)
gordura  =  80 g   (fixa)
carbo    = 236 g + gastoAceito / 4          — todo o excedente vira carboidrato
```

Proteína e gordura não se movem porque não é o gasto que as define; o carboidrato absorve
tudo. É a mesma regra que os quatro tipos de dia do plano já seguiam — só deixou de estar
implícita em quatro degraus.

**Taxas por atividade** (`nutricao.compensacao.atividades`, nada disso está no código):

| Atividade | Taxa | Padrão | Origem |
|---|---|---|---|
| Musculação | 350 kcal/h | 1h15 | informado pelo usuário |
| Pedal · Z2 (padrão) | 650 kcal/h | 2h | meio-termo — ver divergência abaixo |
| Pedal · forte | curva `1h=1000 · 2h=1800 · 3h=2500 · 4h=3200`, +700 kcal/h acima | — | informado pelo usuário |
| Pedal · leve | 500 kcal/h | — | recuperação ativa |

O perfil *forte* usa interpolação linear entre os pontos da curva e extrapola pela taxa
marginal final — a taxa por hora cai com a duração, como acontece na prática.

**Teto de 4000 kcal/dia.** Um pedal forte de 4h pediria 5500 kcal, o que ninguém come. O que
não couber no teto vai para o **banco calórico** (`compensacao.banco`): saldo a repor nos
3 dias seguintes, que é a janela real de ressíntese de glicogênio. Comer acima do alvo num dia
abate o saldo. Só entra no banco o que o *teto cortou* — o que você simplesmente deixou de
comer aparece como déficit do dia, não como saldo.

**Combustível durante a atividade** (`compensacao.intraAtividade`): gel, bala de goma e
isotônico, dimensionados pela duração para 60–70 g de carboidrato por hora. `trocas` lista as
substituições equivalentes (2 tâmaras no lugar de 1 pacote de bala, por exemplo) — são
documentadas, não calculadas: o motor dimensiona os três itens e a troca mantém o carbo por
hora. Em pedal longo
isso responde por um terço a metade do gasto e não compete com as refeições.

**Reforço** (`compensacao.reforcos`): quando o alvo passa do molde do cardápio, o app escolhe
itens que já estão no seu cardápio (arroz, batata, macarrão, tapioca, pão, banana, aveia, mel)
para fechar a diferença.

Onde ver: **Comer** mostra o alvo, o que falta, o combustível, o reforço e o banco; **Treinar**
mostra o gasto de cada atividade registrada, editável; **Consultar → Últimos 7 dias** mostra
gasto/alvo/comido/saldo dia a dia e o balanço da janela; **Consultar → Nutrição →
Compensação** é a referência completa, com uma tabela de quanto comer para cada duração de
pedal.

### ⚠️ Divergência resolvida sobre o gasto do pedal

O documento do pedal assumia ~1000 kcal para 2h de Z2 — 500 kcal/h, ou ~134 W (1,7 W/kg),
baixo até para Z2. O usuário relatou 1h = 1000 kcal e 4h = 3200 kcal — 800–1000 kcal/h, ou
~214–267 W (2,7–3,4 W/kg), desempenho de ciclista treinado e acima de Z2.

O árbitro foi a evidência empírica das últimas 10 semanas de bioimpedância, comendo os alvos do
plano: peso estável com ganho de massa magra e perda de gordura — recomposição em manutenção,
não o padrão de quem está em déficit de 800 kcal três vezes por semana. Se o gasto fosse o
relatado, o peso teria caído. Os números estão em `nutricao.compensacao.divergenciaGasto`, nos
dados cifrados.

Decisão do usuário (31/07/2026): **650 kcal/h em Z2** e a curva relatada reservada ao perfil
*forte*. Consequência: um dia de pedal Z2 de 2h passa de 3200 para 3600 kcal de alvo. O
registro fica em `nutricao.compensacao.divergenciaGasto` e aparece nas abas Semana e Nutrição.
**Reavaliar na próxima bioimpedância:** se o percentual de gordura subir, a taxa está alta; se
cair abaixo do piso clínico registrado no perfil, está baixa.

## Cardápio

As refeições não são genéricas: foram montadas a partir das preferências do usuário,
registradas em `nutricao.preferencias`. São **5 refeições** — 4 grandes (café, almoço,
lanche, jantar) + 1 após a atividade — mais os itens de *combustível* (gel + isotônico +
bala de goma durante o pedal, 2 tâmaras no minuto 45 do treino), que são marcados com
`combustivel: true` e não contam como refeição. O item intra-pedal do cardápio está dimensionado para 2h; em Hoje
o app recalcula pela duração efetivamente registrada.

Cada refeição traz `hora`, `itens` (com as porções em gramas), `macros` e `trocas`
equivalentes. As porções foram resolvidas por iteração para fechar o total de cada tipo
de dia — a proteína e o carbo-base de cada refeição são dimensionados para atingir a
fração-alvo do dia, considerando que arroz, pão e batata também trazem proteína. Desvio
máximo em relação ao alvo original do plano (guardado em `tiposDia[].alvoPlano`): 4 g de
proteína, 4 g de gordura, 27 g de carboidrato. Os campos `kcal`/`proteinaG`/`gorduraG`/
`carboG` de cada tipo de dia são a **soma exata** das refeições — é esse número que o motor
usa para calcular o reforço.

Duas refeições são marcadas semanticamente para o motor, em vez de por id:
`janelaAnabolica: true` (dispara o alerta de pós-atividade) e `regraDoRelogio: true`
(intra-treino no minuto 45). Renomear a refeição não quebra a regra.

**Para remontar o cardápio** depois de mudar o gosto: atualize `nutricao.preferencias`,
recalcule as porções e reescreva os totais do tipo de dia com a soma das refeições —
`alvoPlano` (que vem do plano da nutricionista) é a referência a não perder de vista.

⚠️ As porções são estimativa para acompanhamento, não medição. Os totais diários são
do plano; o rateio por refeição foi calculado a partir das quantidades dos alimentos.

## Personalizar refeições

O cardápio é uma sugestão, não um contrato. Cada refeição tem duas ações:

- **marcar** (toque na linha, ou **Comi isso** na refeição da vez) — comeu como no plano,
  entram os macros planejados;
- **personalizar** (ícone de lápis, ou **Comi outra coisa**) — abre o compositor com a
  composição do plano já carregada;
  você troca, tira e ajusta as quantidades, e o que entra na conta do dia são os macros do que
  foi montado.

Há também **Registrar outra refeição**, para o que não está no cardápio. Essas aparecem numa
seção *Fora do cardápio* e contam no total do dia sem mexer nas pendências do plano.

O compositor mostra os macros recalculando a cada mudança e, quando é uma refeição do plano,
a **diferença em relação ao planejado** — com alerta quando falta mais de 10 g de proteína ou
sobra mais de 10 g de gordura, que são os dois macros fixos do dia.

### Tabela de alimentos

`nutricao.alimentos` traz 99 alimentos com a composição por 100 g, agrupados por
carboidrato / proteína / gordura / legume / fruta / bebida / combustível / fora do plano.
O último grupo existe de propósito: registrar a pizza vale mais que fingir que não comeu.
Cada item tem:

| Campo | Para que serve |
|---|---|
| `por100` | `{p, g, c, kcal}` por 100 g — a base de todo cálculo |
| `porcaoG` | quanto entra ao adicionar o alimento |
| `passoG` | incremento dos botões `−` / `+` |
| `unidadeG`, `unidadeNome` | quando o alimento é contável, para exibir "100 g (2 unidades)" |
| `nota` | ressalva clínica, mostrada como dica e num toast ao adicionar |
| `sinonimos` | como a pessoa procura de verdade — "peixe", "gatorade", "catupiry" |
| `frequente` | aparece no cardápio; é o que a busca mostra sem termo digitado |

**A porção padrão é o que se come de uma vez**, não a embalagem. Foi recalibrada em
04/08/2026 depois que o usuário apontou o cottage entrando com 200 g — meio pote. Um teste
verifica que nenhum item servido a granel entra com mais de 400 kcal e que nenhum contável
entra com mais de 5 unidades; itens de uma unidade só (um hambúrguer, uma fatia de pizza)
ficam de fora do teto calórico, porque uma unidade é realista por definição.

### Busca de alimentos

`buscarAlimentos(alimentos, termo, grupo)` procura em nome, grupo e sinônimos, **sem acento e
sem caixa** — quem digita "tamara" acha "Tâmara seca". Sem termo, devolve só os `frequente`;
com filtro de grupo, o grupo inteiro. Quem começa com o termo aparece antes de quem só o
contém no meio.

Isso corrigiu um bug real: a tâmara existia na tabela desde 01/08 mas era inalcançável na
prática — era o 13º item de uma lista que mostrava 12, e a busca por "tamara" sem circunflexo
não retornava nada. O usuário concluiu, com razão, que ela não estava cadastrada.

Os valores dos alimentos que compõem o cardápio são **os mesmos que geraram as porções**, então
a tabela e as refeições não divergem. Cada refeição do plano carrega uma `composicao`
`[{alimentoId, gramas}]`, e há um teste que recalcula os macros de todas as 23 refeições a partir
dela e compara com os macros gravados — o desvio atual é **0 g**.

Para acrescentar um alimento: adicione a entrada em `nutricao.alimentos.itens` e refaça o build.
Nada no código conhece nomes de alimentos — nem o compositor, nem o cálculo do combustível do
pedal, que escolhe pelos campos `papel` e `porHora` de `compensacao.intraAtividade`.

**Cuidado com `unidadeG`.** É o campo que mais facilmente introduz erro silencioso: ele define
quantos gramas vale "1 unidade", e um chute errado muda a dose sem mudar nada visível.

A tâmara passou por isso duas vezes, em direções opostas. Em 01/08/2026 a tabela dizia 8 g por
unidade mas a refeição usava a contagem do plano (2 unidades), entregando 16 g — 12 g de carbo
em vez dos 30 g prescritos. Em 04/08/2026, com o tamanho real confirmado (~8 g, tâmara pequena),
a dose em gramas foi mantida e a **contagem** corrigida para 5 unidades.

A lição está no dado: **o alvo clínico é o carboidrato em gramas; a contagem em unidades depende
do tamanho do alimento e não é a prescrição.** O teste (`=== 21`) verifica os dois lados —
que a refeição cai na faixa de carbo que o plano prescreve, e que `contagem × unidadeG` bate com
os gramas do cardápio.

⚠️ A composição por 100 g é a usual (TACO e rótulos). Peso cru × cozido, corte da carne e marca
do produto mudam o resultado — é estimativa para acompanhamento, não medição.

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
   tilápia e merluza, o ômega-3 passou a depender exclusivamente da cápsula diária — o que pesa
   dado o resultado de HDL no último painel.
4. **Prioridade em semana curta** é escolha do usuário, não recomendação clínica — ver a
   ressalva na seção de modo flexível.
5. **Gasto do pedal.** Resolvida em 31/07/2026 adotando 650 kcal/h em Z2, um meio-termo entre
   os 500 kcal/h do plano e os 800–1000 kcal/h relatados; o árbitro foi a estabilidade do peso
   sob os alvos do plano. Detalhes em
   [Compensação do gasto calórico](#️-divergência-resolvida-sobre-o-gasto-do-pedal).
6. **Dose de tâmara do intra-treino.** Corrigida em 01/08/2026 — ver
   [Tabela de alimentos](#tabela-de-alimentos). O carboidrato do dia de academia subiu de 323
   para 341 g como consequência, o que é coerente: carboidrato é o macro flexível, proteína e
   gordura não se movem.
7. **Rolo fora do acompanhamento.** Removido em 31/07/2026 a pedido do usuário (a taxa de
   700 kcal/h era estimativa, não medição). A prescrição de sweet spot de 14/05/2026 continua
   documentada na aba Pedal → Resistência, marcada como não rastreada, porque era a resposta
   indicada para a queima de quadríceps em alta intensidade — sem ela, o trabalho de limiar
   precisa sair do pedal na rua. Para voltar: ver `pedal.plano.roloRemovido.comoVoltar`.

## ⚠️ Avisos de segurança

### Limite de exposição: o que pode ficar em claro

O repositório é **público**. A regra é: dado pessoal só existe nos blobs cifrados em `data/`.
Nem o frontend, nem o README, nem arquivos de ferramenta podem carregar nome, e-mail,
antropometria, diagnóstico ou resultado laboratorial.

Isso vale para o código também. Os avisos que precisam citar um número clínico guardam uma
**lacuna** (`{bfPerc}`, `{proteinaFixaG}`) e o valor vem de `nutricao.orientacoes`, nos dados
cifrados. Quais sessões contam como treino de perna também vem de lá, em vez de uma lista
`['B','D']` no motor.

Há um teste (`=== 20`) que varre todos os arquivos públicos procurando nome, e-mail,
percentual de gordura, peso, massa magra, nomes de diagnóstico e resultados laboratoriais.
Ele falha se algum voltar.

**Faxina de 31/07/2026.** Uma auditoria dos 60 arquivos em claro encontrou:

| O que | Onde | Ação |
|---|---|---|
| Nome completo, e-mail, idade, antropometria e diagnósticos ortopédicos detalhados (~80 KB, 28 arquivos) | `.claude/agent-memory/` | removido do versionamento e adicionado ao `.gitignore` — o mesmo conteúdo já vive nos documentos cifrados |
| Percentual de gordura, meta de proteína e tendão específico | textos de orientação em `app/motor.js` | movidos para `nutricao.orientacoes` |
| Peso, ganho de massa magra, perda de gordura, HDL | `README.md` | trocados pelo raciocínio, com ponteiro para os dados cifrados |
| Caminho e usuário da máquina local | `.claude/settings.local.json` | removido do versionamento |

⚠️ **O histórico não foi reescrito.** Os commits anteriores a 31/07/2026 seguem contendo esses
arquivos, e as mensagens de commit e descrições de PR de #30 a #34 citam números clínicos.
Remover isso de verdade exige `git filter-repo`/BFG e force-push — e mesmo assim os blobs
antigos continuam acessíveis pela API do GitHub até um pedido de purga ao suporte, além de
persistirem em qualquer fork ou clone existente. Tornar o repositório privado é a única medida
que fecha a exposição imediatamente.

### Outros pontos

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
