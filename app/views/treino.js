// Aba "Treino" — sessões A/B/C/D, volume, progressão, restrições e rotação.

import {
  h, icone, ajuda, cabecalhoPagina, aviso, chip, card, cardTitulado, segmentos,
  tabela, lista, definicoes, secao, dataBR, toast
} from '../ui.js';
import { volumeSessao, contaNovos } from '../store.js';
import { resumoJanela } from '../motor.js';
import { barrasHorizontais } from '../charts.js';

const SUBABAS = [
  { id: 'sessoes', nome: 'Sessões' },
  { id: 'volume', nome: 'Volume' },
  { id: 'progressao', nome: 'Progressão' },
  { id: 'restricoes', nome: 'Restrições' },
  { id: 'rotacao', nome: 'Rotação' },
  { id: 'notas', nome: 'Notas' }
];

export async function render(ctx) {
  const { store, params, registro } = ctx;
  const [treinos, perfil, nutricao, pedal] = await store.docs('treinos', 'perfil', 'nutricao', 'pedal');
  const jan = resumoJanela({ treinos, perfil, nutricao, pedal }, registro);

  const alvo = params[0] || 'sessoes';
  const sessao = treinos.sessoes.find((s) => s.id === alvo.toUpperCase());

  if (sessao) return telaSessao(sessao, treinos, jan, ctx);

  const sub = SUBABAS.some((s) => s.id === alvo) ? alvo : 'sessoes';
  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: `Revisão ${dataBR(treinos.meta.revisao)}`,
    titulo: treinos.meta.titulo,
    subtitulo: treinos.meta.subtitulo
  }));
  raiz.append(segmentos(SUBABAS, sub, (id) => ctx.navegar(`#/treino/${id}`)));

  const corpo = { sessoes: abaSessoes, volume: abaVolume, progressao: abaProgressao, restricoes: abaRestricoes, rotacao: abaRotacao, notas: abaNotas }[sub];
  raiz.append(corpo(treinos, jan, ctx));
  return raiz;
}

/* ===================== lista de sessões ===================== */

function abaSessoes(treinos, jan, ctx) {
  const frag = h('div');

  for (const a of treinos.avisos) {
    frag.append(aviso({ nivel: a.nivel, titulo: a.titulo, texto: a.texto, data: a.data }));
  }

  frag.append(h('div.seletor-grade.mt-4', null,
    treinos.sessoes.map((s) => {
      const vol = volumeSessao(s);
      const sugerida = jan.proxima.escolhida && jan.proxima.escolhida.sessao.id === s.id;
      const feita = jan.feitasIds.includes(s.id);
      return h('button.seletor-card', {
        type: 'button',
        'aria-current': String(Boolean(sugerida)),
        onClick: () => ctx.navegar(`#/treino/${s.id}`)
      },
        sugerida ? h('span.seletor-hoje', { texto: 'próxima' }) : feita ? h('span.seletor-hoje', { texto: '✓ feita' }) : null,
        h('span.seletor-letra', { texto: s.id }),
        h('span.seletor-nome', { texto: s.nome }),
        h('span.seletor-meta', { texto: `${s.dia} · ${vol.total} séries · ~${s.duracaoMin} min` }),
        h('span.seletor-meta', { texto: s.foco.slice(0, 3).join(' · ') })
      );
    })
  ));

  frag.append(secao('Parâmetros',
    card(definicoes(treinos.parametros.map((p) => [p.nome, p.valor, p.detalhe])))
  ));

  frag.append(secao('Objetivos', card(lista(treinos.objetivos))));

  return frag;
}

/* ===================== detalhe da sessão ===================== */

export function telaSessao(s, treinos, jan, ctx, opcoes = {}) {
  const { registro } = ctx;
  const data = opcoes.data;
  const vol = volumeSessao(s);
  const raiz = h('div');

  if (opcoes.voltar !== false) {
    raiz.append(h('button.btn.btn-fantasma', {
      type: 'button', onClick: () => ctx.navegar('#/treino')
    }, icone('voltar'), 'Todas as sessões'));
  }

  raiz.append(cabecalhoPagina({
    kicker: `${s.dia} · ~${s.duracaoMin} min`,
    titulo: `Treino ${s.id} — ${s.nome}`,
    subtitulo: s.foco.join(' · ')
  }));

  raiz.append(h('div.chip-linha', null,
    chip(`${vol.total} séries`, 'accent'),
    chip(`${s.exercicios.length} exercícios`),
    contaNovos(s) > 0 && chip(`${contaNovos(s)} variantes novas`, 'info', 'rotacao'),
    s.comPedal && chip('dia duplo (pedal + academia)', 'atencao', 'pedal'),
    jan.proxima.escolhida && jan.proxima.escolhida.sessao.id === s.id && chip('próxima sugerida', 'ok'),
    // Mesma sessão repetida no mesmo dia tem marcação de série independente.
    s.repeticao > 1 && chip(`${s.repeticao}ª vez hoje`, 'atencao', 'rotacao'),
    jan.feitasIds.includes(s.id) && chip(`já feita nos últimos ${jan.janelaDias} dias`, 'info')
  ));

  for (const a of s.avisos || []) {
    raiz.append(h('div.mt-3', null, aviso({ nivel: a.nivel, titulo: a.titulo, texto: a.texto })));
  }

  // progresso + zerar
  const prog = registro.progressoSessao(s, data);
  const barra = h('i', { estilo: { width: prog.perc + '%' } });
  const contador = h('b.num', { texto: `${prog.feitas}/${prog.total}` });
  const atualizarProgresso = () => {
    const p = registro.progressoSessao(s, data);
    barra.style.width = p.perc + '%';
    contador.textContent = `${p.feitas}/${p.total}`;
  };

  raiz.append(h('div.progresso-treino.mt-4', null,
    h('span.texto-sm.texto-3', { texto: 'Séries de hoje' }),
    h('span.barra', { estilo: { '--barra-c': 'var(--c-ok)' } }, barra),
    contador,
    h('button.icon-btn', {
      type: 'button', 'aria-label': 'Zerar marcações desta sessão', title: 'Zerar marcações',
      onClick: () => {
        registro.zerarSessao(s.chave || s.id, data);
        ctx.recarregar();
        toast('Marcações da sessão zeradas.');
      }
    }, icone('rotacao'))
  ));

  // Postura vem antes da ativação: mobilizar antes de ativar, e é o bloco que
  // muda o padrão que ele quer corrigir.
  if (s.postura) raiz.append(blocoAtivacao(s.postura, 'var(--c-hoje)'));
  if (s.ativacao) raiz.append(blocoAtivacao(s.ativacao));

  raiz.append(h('div.mt-3', null,
    s.exercicios.map((ex) => cartaoExercicio(ex, s, registro, atualizarProgresso, data))
  ));

  if (opcoes.volume !== false) raiz.append(secao('Volume da sessão',
    card(
      barrasHorizontais(
        Object.entries(vol.porGrupo).sort((a, b) => b[1] - a[1]).map(([nome, valor]) => ({ nome, valor })),
        { unidade: ' séries' }
      ),
      h('div.linha.mt-3', null,
        h('span.legenda.esticar', { texto: `Total calculado: ${vol.total} séries.` }),
        s.notaVolume ? ajuda(s.notaVolume, 'Sobre este total') : null)
    )
  ));

  return raiz;
}

function blocoAtivacao(at, cor = 'var(--c-saude)') {
  return h('div.card.mt-3', { estilo: { '--accent': cor } },
    h('div.linha', null,
      h('h3.card-titulo.esticar', null, icone('escudo'), ' ', at.titulo),
      ajuda(at.nota, at.titulo)
    ),
    h('div.mt-3', null, at.itens.map((i) => h('div.refeicao', null,
      h('span.refeicao-hora', { texto: i.series }),
      h('div.refeicao-corpo', null,
        h('div.refeicao-nome', null, i.nome, i.opcional && chip('opcional')),
        i.cue && h('div.refeicao-itens', { texto: i.cue })
      )
    ))),
    at.cueGeral
      ? h('div.linha.mt-3', null,
          h('span.legenda.esticar', { texto: 'Cue geral' }),
          ajuda(at.cueGeral, 'Cue geral'))
      : null
  );
}

function cartaoExercicio(ex, sessao, registro, aoMudar, data) {
  const el = h('article.ex', { dataset: { terapeutico: String(Boolean(ex.terapeutico)) } });

  el.append(h('div.ex-topo', null,
    h('span.ex-ordem', { texto: String(ex.ordem) }),
    h('div.ex-corpo', null,
      h('h3.ex-nome', { texto: ex.nome }),
      ex.detalhe && h('p.ex-detalhe', { texto: ex.detalhe }),
      h('div.chip-linha.mt-2', null,
        (ex.grupos || []).map((g) => chip(g)),
        ex.novo && chip('nova variante', 'info', 'rotacao'),
        ex.terapeutico && chip('terapêutico', 'accent', 'escudo'),
        ex.intensidade && chip(ex.intensidade, 'atencao')
      )
    ),
    h('div.ex-series', null,
      h('b', { texto: `${ex.series}×${ex.reps}` }),
      h('span', { texto: ex.series === 1 ? 'série' : 'séries' })
    )
  ));

  const meta = h('div.ex-meta');
  if (ex.partes) {
    meta.append(h('div.ex-partes', null, ex.partes.map((p) =>
      h('div', null, h('span', { texto: p.nome }), h('b.num', { texto: `${p.series}×${p.reps}` }))
    )));
  }
  if (ex.cues && ex.cues.length) meta.append(h('ul.ex-lista', null, ex.cues.map((c) => h('li', { texto: c }))));
  if (ex.alertas && ex.alertas.length) meta.append(h('ul.ex-lista.alertas', null, ex.alertas.map((c) => h('li', { texto: c }))));
  if (ex.progressao) meta.append(h('p.legenda.mt-2', null, h('strong', { texto: 'Progressão: ' }), ex.progressao));
  if (meta.childElementCount) el.append(meta);

  // marcação de séries: cada bolinha alterna feito/não feito
  const acoes = h('div.ex-acoes');
  const bolinhas = [];
  const desenhar = () => {
    const feitas = registro.seriesFeitas(sessao.chave || sessao.id, ex.ordem, data);
    bolinhas.forEach((b, i) => { b.dataset.feito = String(i < feitas); });
    el.dataset.feito = String(feitas >= ex.series);
  };
  for (let i = 0; i < ex.series; i++) {
    const b = h('button.ex-serie-btn', {
      type: 'button',
      'aria-label': `Marcar série ${i + 1} de ${ex.series}`,
      onClick: () => {
        registro.marcarSerie(sessao.chave || sessao.id, ex.ordem, ex.series, data);
        desenhar();
        aoMudar();
      }
    }, String(i + 1));
    bolinhas.push(b);
    acoes.append(b);
  }
  acoes.append(h('span.ex-acoes-espaco'));
  if (ex.foto) {
    acoes.append(h('a.ex-foto-link', {
      href: ex.foto, target: '_blank', rel: 'noopener noreferrer',
      'aria-label': 'Ver imagem de referência', title: 'Imagem de referência'
    }, icone('foto')));
  }
  el.append(acoes);
  desenhar();

  return el;
}

/* ===================== volume semanal ===================== */

function abaVolume(treinos) {
  const vs = treinos.volumeSemanal;
  const colunas = [
    { nome: 'Grupo' },
    { nome: 'A', classe: 'centro' }, { nome: 'B', classe: 'centro' },
    { nome: 'C', classe: 'centro' }, { nome: 'D', classe: 'centro' },
    { nome: 'Total', classe: 'num' }
  ];
  const linhas = vs.linhas.map((l) => ({
    dataset: l.agregado ? { agregado: 'true' } : l.limite ? { destaque: 'true' } : {},
    celulas: [
      h('span', null, l.grupo, l.nota ? h('small.texto-3', { texto: ' · ' + l.nota }) : null),
      l.A || 0, l.B || 0, l.C || 0, l.D || 0,
      h('b', { texto: String(l.total) })
    ]
  }));

  const calculado = treinos.sessoes.map((s) => ({ nome: `Treino ${s.id}`, valor: volumeSessao(s).total }));

  return h('div', null,
    aviso({ nivel: 'info', texto: vs.nota }),
    h('div.mt-3', null, tabela(colunas, linhas, { zero: '—' })),
    secao('Total por sessão (calculado)',
      card(
        barrasHorizontais(calculado, { unidade: ' séries' }),
        h('p.legenda.mt-3', { texto: 'Somas derivadas da lista de exercícios de cada sessão. Os treinos B e D declaravam 20 e 24 séries no documento original, mas o detalhamento por grupo dá 23 e 26 — os valores acima são os calculados.' })
      )
    )
  );
}

/* ===================== progressão ===================== */

function abaProgressao(treinos) {
  const p = treinos.progressao;
  return h('div', null,
    cardTitulado('Regras gerais', lista(p.regrasGerais)),
    secao('Por grupo',
      h('div.pilha', null, p.porGrupo.map((g) => card(
        h('div.linha', null,
          h('h4.esticar', { texto: g.grupo }),
          g.rpe && chip('RPE ' + g.rpe, 'accent')
        ),
        g.nota && h('p.texto-2.texto-sm.mt-2', { texto: g.nota }),
        g.alerta && h('div.mt-2', null, aviso({ nivel: 'atencao', texto: g.alerta }))
      )))
    ),
    secao('Liberação progressiva',
      tabela(
        [{ nome: 'Exercício' }, { nome: 'Quando' }, { nome: 'Critério' }],
        treinos.liberacaoProgressiva.map((l) => [l.exercicio, l.quando, l.criterio])
      )
    )
  );
}

/* ===================== restrições ===================== */

function abaRestricoes(treinos) {
  const r = treinos.restricoes;
  const frag = h('div');

  frag.append(h('div.card', { estilo: { '--accent': 'var(--c-critico)' } },
    h('h3.card-titulo', null, icone('alerta'), ' ', r.ombro.titulo),
    h('p.legenda', { texto: dataBR(r.ombro.data) }),
    lista(r.ombro.itens)
  ));

  frag.append(cardTitulado(r.coluna.titulo, lista(r.coluna.itens)));

  frag.append(secao('Exercícios suspensos',
    aviso({ nivel: 'atencao', texto: treinos.notaSuspensos }),
    h('div.mt-3', null, tabela(
      [{ nome: 'Exercício' }, { nome: 'Motivo' }, { nome: 'Região' }],
      treinos.suspensos.map((s) => [s.exercicio, s.motivo, s.regiao])
    ))
  ));

  frag.append(secao('O que pode fazer',
    h('div.pilha-2', null, treinos.liberado.map((l) => card(
      h('h4', { texto: l.regiao }),
      h('p.texto-2.texto-sm.mt-2', { texto: l.texto })
    )))
  ));

  const j = treinos.joelho;
  frag.append(secao(j.titulo,
    h('div.card', { estilo: { '--accent': 'var(--c-ok)' } },
      h('div.chip-linha', null, chip('recuperado', 'ok', 'ok'), chip('alta em ' + dataBR(j.altaEm))),
      h('p.texto-2.mt-3', { texto: j.statusTexto }),
      h('h4.mt-4', { texto: j.manutencao.titulo }),
      h('p.legenda.mt-2', { texto: j.manutencao.contexto }),
      lista(j.manutencao.itens),
      h('div.mt-3', null, aviso({ nivel: 'atencao', texto: j.manutencao.alerta })),
      h('h4.mt-4', { texto: 'Sinais de retorno da lesão' }),
      lista(j.sinaisRetorno),
      h('h4.mt-4', { texto: 'Sinais de alarme (ortopedista)' }),
      lista(j.sinaisAlarme, 'lista lista-x'),
      h('h4.mt-4', { texto: 'Suporte nutricional' }),
      lista(j.nutricao)
    )
  ));

  return frag;
}

/* ===================== rotação de variantes ===================== */

function abaRotacao(treinos) {
  const r = treinos.rotacao;
  const frag = h('div');

  frag.append(card(
    h('p.texto-2', { texto: r.descricao }),
    h('p.texto-2.mt-3', null, h('strong', { texto: 'Critério: ' }), r.criterio)
  ));

  frag.append(h('div.mt-3', null, aviso({
    nivel: 'info', titulo: 'Atualização aplicada', texto: r.atualizacao.texto, data: r.atualizacao.data
  })));

  for (const t of r.tabelas) {
    frag.append(secao(t.titulo,
      tabela(
        t.colunas.map((c) => ({ nome: c })),
        t.linhas.map((l) => ({ dataset: l.atual ? { destaque: 'true' } : {}, celulas: l.celulas }))
      ),
      t.nota && h('p.legenda.mt-2', { texto: t.nota })
    ));
  }

  frag.append(secao('Histórico de pareceres da série',
    h('div.timeline', null, treinos.historicoPareceres.map((p) => h('div.timeline-item', null,
      h('div.timeline-data', { texto: dataBR(p.data) }),
      h('div.timeline-corpo', { texto: p.texto })
    )))
  ));

  return frag;
}

/* ===================== notas ===================== */

function abaNotas(treinos) {
  const frag = h('div');
  frag.append(h('div.pilha', null, treinos.notas.map((n) => card(
    h('h4', { texto: n.titulo }),
    h('p.texto-2.texto-sm.mt-2', { texto: n.texto })
  ))));

  frag.append(secao('Calendário semanal',
    tabela(
      [{ nome: 'Dia' }, { nome: 'Treino' }, { nome: 'Pedal' }, { nome: 'Lógica' }],
      treinos.calendario.dias
        .slice()
        .sort((a, b) => ((a.diaSemana + 6) % 7) - ((b.diaSemana + 6) % 7))
        .map((d) => [d.dia, d.treino ? `${d.treino}` : '—', d.pedal || '—', d.logica])
    ),
    h('div.mt-3', null, treinos.calendario.notas.map((n) => aviso({ nivel: 'info', texto: n })))
  ));

  return frag;
}
