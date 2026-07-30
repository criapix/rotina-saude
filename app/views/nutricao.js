// Aba "Nutrição" — tipos de dia, refeições, suplementos, regras e metas.

import {
  h, icone, cabecalhoPagina, aviso, chip, card, cardTitulado, segmentos,
  tabela, lista, definicoes, secao, barraMacro, dataBR
} from '../ui.js';
import { planoDoDia } from '../store.js';

const CORES = { p: 'var(--c-nutricao)', g: 'var(--c-atencao)', c: 'var(--c-treino)' };

const ROTULO_FREQUENCIA = {
  diario: 'todo dia',
  treino: 'dias de treino',
  treinoBD: 'antes dos treinos B e D'
};

export async function render(ctx) {
  const { store, params } = ctx;
  const [nutricao, perfil, treinos] = await store.docs('nutricao', 'perfil', 'treinos');
  const plano = planoDoDia(perfil, treinos, nutricao);

  const abas = [
    ...nutricao.tiposDia.map((t) => ({ id: t.id, nome: t.nome })),
    { id: 'suplementos', nome: 'Suplementos' },
    { id: 'estrategias', nome: 'Estratégias' },
    { id: 'metas', nome: 'Metas' }
  ];

  const alvo = params[0] || (plano.tipoDia ? plano.tipoDia.id : nutricao.tiposDia[0].id);
  const sub = abas.some((a) => a.id === alvo) ? alvo : abas[0].id;

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: `Atualizado em ${dataBR(nutricao.meta.atualizadoEm)}`,
    titulo: nutricao.meta.titulo,
    subtitulo: nutricao.objetivo
  }));

  raiz.append(aviso({ nivel: 'info', texto: nutricao.meta.aviso }));
  raiz.append(h('div.mt-3'));
  raiz.append(segmentos(abas, sub, (id) => ctx.navegar(`#/nutricao/${id}`)));

  if (sub === 'suplementos') raiz.append(abaSuplementos(nutricao, ctx));
  else if (sub === 'estrategias') raiz.append(abaEstrategias(nutricao));
  else if (sub === 'metas') raiz.append(abaMetas(nutricao));
  else raiz.append(abaTipoDia(nutricao.tiposDia.find((t) => t.id === sub), nutricao, plano));

  return raiz;
}

/* ===================== tipo de dia ===================== */

function abaTipoDia(tipo, nutricao, plano) {
  const frag = h('div');
  const ehHoje = plano.tipoDia && plano.tipoDia.id === tipo.id;

  frag.append(h('div.card', { estilo: { '--accent': 'var(--c-nutricao)' } },
    h('div.linha', null,
      h('div.esticar', null,
        h('h2', { texto: `${tipo.kcal} kcal` }),
        h('p.legenda', { texto: `${tipo.nome} — ${tipo.descricao} · dias no documento: ${tipo.diasDoc.join(', ')}` })
      ),
      ehHoje && chip('é o dia de hoje', 'ok')
    ),
    h('div.mt-3', null,
      barraMacro('Proteína', tipo.proteinaG, 200, ' g', CORES.p),
      barraMacro('Gordura', tipo.gorduraG, 100, ' g', CORES.g),
      barraMacro('Carboidrato', tipo.carboG, 560, ' g', CORES.c)
    ),
    tipo.nota && h('p.legenda.mt-3', { texto: tipo.nota })
  ));

  frag.append(secao('Refeições',
    card(tipo.refeicoes.map((r) => h('div.refeicao', null,
      h('span.refeicao-hora', { texto: r.hora }),
      h('div.refeicao-corpo', null,
        h('div.refeicao-nome', null, r.nome, r.tag && chip(r.tag, 'accent'), r.novo && chip('novo', 'ok')),
        h('div.refeicao-itens', { texto: r.itens })
      )
    )))
  ));

  // Opções de café da manhã relevantes para este tipo de dia
  const usaPrePedal = tipo.refeicoes.some((r) => r.ref === 'cafeManha.prePedal');
  const usaNormal = tipo.refeicoes.some((r) => r.ref === 'cafeManha.normal');
  for (const [chave, usa] of [['prePedal', usaPrePedal], ['normal', usaNormal]]) {
    if (!usa) continue;
    const cm = nutricao.cafeManha[chave];
    frag.append(secao(cm.titulo,
      card(
        h('p.legenda', { texto: cm.descricao }),
        h('div.mt-3', null, cm.opcoes.map((o) => h('div.refeicao', null,
          h('span.refeicao-hora', { texto: 'Opção ' + o.id }),
          h('div.refeicao-corpo', null, h('div.refeicao-itens', { texto: o.itens }))
        )))
      )
    ));
  }

  frag.append(secao('Macros e hidratação',
    card(
      definicoes(nutricao.macrosFixos.map((m) => [m.nome, m.valor, m.detalhe])),
      h('h4.mt-4', null, icone('gota'), ' Hidratação'),
      definicoes(nutricao.hidratacao.porDia.map((x) => [x.contexto, x.valor, x.detalhe])),
      h('p.legenda.mt-2', null, h('strong', { texto: 'Regra prática: ' }), nutricao.hidratacao.regraPratica),
      lista(nutricao.hidratacao.notas)
    )
  ));

  frag.append(h('div.mt-4', null, aviso({
    nivel: nutricao.divergenciaAgenda.nivel,
    titulo: nutricao.divergenciaAgenda.titulo,
    texto: nutricao.divergenciaAgenda.texto
  })));

  return frag;
}

/* ===================== suplementos ===================== */

function abaSuplementos(nutricao, ctx) {
  const { diario } = ctx;
  const frag = h('div');

  frag.append(h('div.pilha-2', null, nutricao.suplementos.map((s) => {
    const item = h('button.check-item', {
      type: 'button',
      dataset: { feito: String(diario.marcado('suplementos', s.nome)) },
      onClick: () => { item.dataset.feito = String(diario.alternar('suplementos', s.nome)); }
    },
      h('span.check-box', null, icone('check')),
      h('span.check-texto', null,
        h('strong', null, s.nome, ' ', h('span.texto-3.texto-sm', { texto: s.dose })),
        h('span', { texto: s.quando }),
        s.obs && h('span.texto-xs.mt-2', { texto: s.obs })
      ),
      h('span.chip-linha', { estilo: { flexDirection: 'column', alignItems: 'flex-end' } },
        s.critico ? chip('obrigatório', 'critico') : null,
        chip(ROTULO_FREQUENCIA[s.frequencia] || s.frequencia, s.frequencia === 'diario' ? 'accent' : 'info')
      )
    );
    return item;
  })));

  frag.append(h('p.legenda.mt-3', { texto: 'As marcações valem só para hoje e ficam guardadas neste dispositivo.' }));

  frag.append(secao('Estratégia anti-inflamatória',
    h('div.grade.grade-2', null,
      cardTitulado('Incluir diariamente', lista(nutricao.antiInflamatorio.incluir, 'lista lista-check')),
      cardTitulado('Evitar', lista(nutricao.antiInflamatorio.evitar, 'lista lista-x'))
    )
  ));

  frag.append(secao('Regras simples',
    card(h('ul.lista', null, nutricao.regras.map((r) =>
      h('li', null, r.texto, r.novo ? h('span', null, ' ', chip('novo', 'ok')) : null)
    )))
  ));

  return frag;
}

/* ===================== estratégias ===================== */

function abaEstrategias(nutricao) {
  const t = nutricao.treinoMatinal;
  const frag = h('div');

  frag.append(h('div.card', { estilo: { '--accent': 'var(--c-nutricao)' } },
    h('h2', { texto: t.titulo }),
    h('p.legenda.mt-2', { texto: dataBR(t.data) }),
    h('p.texto-2.mt-3', null, h('strong', { texto: 'Cenário: ' }), t.cenario)
  ));

  frag.append(secao('As 3 mudanças prioritárias',
    card(h('ol.lista', null, t.prioridades.map((p) => h('li', { texto: p }))))
  ));

  frag.append(secao(t.intraTreino.titulo,
    h('div.card', { estilo: { '--accent': 'var(--c-atencao)' } },
      h('div.aviso', { dataset: { nivel: 'atencao' } },
        h('span.aviso-icone', null, icone('relogio')),
        h('div.aviso-corpo', null, h('strong', { texto: t.intraTreino.regra }))
      ),
      h('div.mt-3', null, tabela(
        [{ nome: 'Opção' }, { nome: 'Quantidade' }, { nome: 'CHO' }, { nome: 'Vantagem' }],
        t.intraTreino.opcoes.map((o) => ({
          dataset: o.recomendado ? { destaque: 'true' } : {},
          celulas: [o.item, o.quantidade, o.cho, o.vantagem]
        }))
      )),
      h('p.legenda.mt-3', { texto: t.intraTreino.nota })
    )
  ));

  frag.append(secao(t.porQue.titulo, card(lista(t.porQue.itens))));

  frag.append(secao(t.cafeOtimizado.titulo,
    card(
      h('p.texto-2', { texto: t.cafeOtimizado.descricao }),
      h('div.mt-3', null, tabela(
        [{ nome: 'Substituição' }, { nome: 'Quantidade' }, { nome: 'Por quê' }],
        t.cafeOtimizado.substituicoes.map((s) => [s.item, s.quantidade, s.porque])
      )),
      h('p.legenda.mt-3', { texto: t.cafeOtimizado.nota })
    )
  ));

  frag.append(secao(t.cafeina.titulo, card(lista(t.cafeina.itens))));
  frag.append(secao(t.hidratacaoAcademia.titulo, card(lista(t.hidratacaoAcademia.itens))));

  frag.append(secao(nutricao.examesImpacto.titulo,
    tabela(
      [{ nome: 'Exame' }, { nome: 'Resultado' }, { nome: 'Status' }, { nome: 'Ação nutricional' }],
      nutricao.examesImpacto.itens.map((e) => [
        e.exame, e.resultado,
        chip(e.status, e.status === 'elevado' ? 'critico' : 'atencao'),
        e.acao
      ])
    ),
    h('p.legenda.mt-2', { texto: `Painel de ${dataBR(nutricao.examesImpacto.data)}.` })
  ));

  return frag;
}

/* ===================== metas ===================== */

function abaMetas(nutricao) {
  const m = nutricao.monitoramento;
  const frag = h('div');

  frag.append(h('div.card', { estilo: { '--accent': 'var(--c-ok)' } },
    h('div.linha', null,
      h('h2.esticar', { texto: m.resultadoAtual.titulo }),
      chip(dataBR(m.resultadoAtual.data), 'ok')
    ),
    h('ul.lista.mt-3', null, m.resultadoAtual.itens.map((i) =>
      h('li', null, i.texto, ' ', chip(i.status === 'ok' ? 'ok' : 'atenção', i.status))
    )),
    h('p.legenda.mt-3', null, h('strong', { texto: 'Anterior: ' }), `${dataBR(m.anterior.data)} — ${m.anterior.texto}`)
  ));

  frag.append(secao('Metas',
    tabela(
      [{ nome: 'Meta' }, { nome: 'Alvo' }, { nome: 'Justificativa' }],
      m.metas.map((x) => ({
        dataset: x.critico ? { destaque: 'true' } : {},
        celulas: [x.meta, x.alvo, x.justificativa]
      }))
    ),
    h('p.legenda.mt-2', { texto: `Próxima bioimpedância: ${m.proximaBio}.` })
  ));

  frag.append(secao(m.planoContingencia.titulo,
    h('div.card', { estilo: { '--accent': 'var(--c-atencao)' } },
      lista(m.planoContingencia.itens)
    )
  ));

  frag.append(secao('Base atual',
    card(definicoes(nutricao.baseAtual.itens.map((i) => [i.label, i.valor, i.nota])),
      h('p.legenda.mt-2', { texto: nutricao.baseAtual.fonte }))
  ));

  return frag;
}
