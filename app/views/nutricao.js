// Aba "Nutrição" — tipos de dia, refeições, suplementos, regras e metas.

import {
  h, icone, cabecalhoPagina, aviso, chip, card, cardTitulado, segmentos,
  tabela, lista, definicoes, secao, barraMacro, dataBR
} from '../ui.js';
import { resumoDia, alvoPorGasto, gastoDaAtividade, formatarDuracao } from '../motor.js';

const CORES = { p: 'var(--c-nutricao)', g: 'var(--c-atencao)', c: 'var(--c-treino)' };

const ROTULO_FREQUENCIA = {
  diario: 'todo dia',
  treino: 'dias de treino',
  treinoBD: 'antes dos treinos B e D'
};

export async function render(ctx) {
  const { store, params } = ctx;
  const [nutricao, perfil, treinos, pedal] = await store.docs('nutricao', 'perfil', 'treinos', 'pedal');
  const dia = resumoDia({ nutricao, perfil, treinos, pedal }, ctx.registro);

  const abas = [
    ...nutricao.tiposDia.map((t) => ({ id: t.id, nome: t.nome })),
    { id: 'compensacao', nome: 'Compensação' },
    { id: 'suplementos', nome: 'Suplementos' },
    { id: 'estrategias', nome: 'Estratégias' },
    { id: 'metas', nome: 'Metas' }
  ];

  const alvo = params[0] || dia.tipoId;
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

  if (sub === 'compensacao') raiz.append(abaCompensacao(nutricao, dia));
  else if (sub === 'suplementos') raiz.append(abaSuplementos(nutricao, ctx));
  else if (sub === 'estrategias') raiz.append(abaEstrategias(nutricao));
  else if (sub === 'metas') raiz.append(abaMetas(nutricao));
  else raiz.append(abaTipoDia(nutricao.tiposDia.find((t) => t.id === sub), nutricao, dia));

  return raiz;
}

/* ===================== tipo de dia ===================== */

function abaTipoDia(tipo, nutricao, dia) {
  const frag = h('div');
  const ehHoje = dia.tipoId === tipo.id;

  frag.append(h('div.card', { estilo: { '--accent': 'var(--c-nutricao)' } },
    h('div.linha', null,
      h('div.esticar', null,
        h('h2', { texto: `${tipo.kcal} kcal` }),
        h('p.legenda', { texto: `${tipo.nome} — ${tipo.descricao}` })
      ),
      ehHoje && chip(dia.provisorio ? 'perfil de hoje (sem atividade registrada)' : 'é o dia de hoje', 'ok')
    ),
    h('div.mt-3', null,
      barraMacro('Proteína', tipo.proteinaG, 200, ' g', CORES.p),
      barraMacro('Gordura', tipo.gorduraG, 100, ' g', CORES.g),
      barraMacro('Carboidrato', tipo.carboG, 560, ' g', CORES.c)
    ),
    tipo.nota && h('p.legenda.mt-3', { texto: tipo.nota }),
    tipo.notaAlvo && h('p.legenda.mt-2', { texto: tipo.notaAlvo }),
    ehHoje && dia.alvo.kcal !== tipo.kcal
      ? h('div.mt-3', null, aviso({
          nivel: 'info',
          titulo: `Hoje o alvo é ${dia.alvo.kcal} kcal, não ${tipo.kcal}`,
          texto: `Este cardápio é o molde do tipo de dia. O alvo real vem do gasto registrado (${dia.gasto} kcal) — veja a aba Compensação.`
        }))
      : null
  ));

  const refeicoes = tipo.refeicoes.filter((r) => !r.combustivel);
  const combustivel = tipo.refeicoes.filter((r) => r.combustivel);

  frag.append(secao(`Refeições (${refeicoes.length})`,
    card(tipo.refeicoes.map(linhaRefeicao)),
    combustivel.length
      ? h('p.legenda.mt-3', { texto: 'Os itens marcados como combustível não são refeições — são carboidrato ingerido durante a atividade.' })
      : null,
    h('p.legenda.mt-2', { texto: nutricao.estimativaMacros.nota })
  ));

  const cm = nutricao.cafeManha;
  frag.append(secao(cm.titulo,
    card(
      h('p.legenda', { texto: cm.descricao }),
      h('div.mt-3', null, cm.opcoes.map((o) => h('div.refeicao', null,
        h('span.refeicao-hora', { texto: o.id }),
        h('div.refeicao-corpo', null,
          h('div.refeicao-itens', { texto: o.itens }),
          o.porque && h('div.texto-xs.texto-3.mt-2', { texto: o.porque })
        )
      )))
    )
  ));

  const tr = nutricao.trocas;
  frag.append(secao(tr.titulo,
    tabela(
      [{ nome: 'Slot' }, { nome: 'Opção 1' }, { nome: 'Opção 2' }, { nome: 'Opção 3' }],
      tr.linhas.map((l) => [l.slot, ...l.opcoes])
    ),
    h('p.legenda.mt-2', { texto: tr.descricao })
  ));

  frag.append(secao('Macros e hidratação',
    card(
      definicoes(nutricao.macrosFixos.map((m) => [m.nome, m.valor, m.detalhe])),
      h('h4.mt-4', null, icone('gota'), ' Hidratação'),
      definicoes(nutricao.hidratacao.porDia.map((x) => [x.contexto, x.valor, x.detalhe])),
      h('p.legenda.mt-2', null, h('strong', { texto: 'Regra prática: ' }), nutricao.hidratacao.regraPratica),
      lista(nutricao.hidratacao.notas)
    )
  ));

  const pref = nutricao.preferencias;
  frag.append(secao(pref.titulo,
    card(
      h('p.legenda', { texto: `${pref.descricao} Registrado em ${dataBR(pref.registradoEm)}.` }),
      h('div.mt-3', null, definicoes(pref.itens.map((i) => [i.campo, i.valor])))
    ),
    h('h4.mt-4', { texto: 'O que essas escolhas implicam' }),
    h('div.pilha-2.mt-2', null, pref.consequencias.map((c) =>
      aviso({ nivel: c.nivel, titulo: c.titulo, texto: c.texto })
    ))
  ));

  return frag;
}

function linhaRefeicao(r) {
  return h('div.refeicao', null,
    h('span.refeicao-hora', { texto: r.hora }),
    h('div.refeicao-corpo', null,
      h('div.refeicao-nome', null,
        r.nome,
        r.tag && chip(r.tag, 'accent'),
        r.combustivel && chip('combustível', 'atencao', 'pedal')
      ),
      h('div.refeicao-itens', { texto: r.itens }),
      r.macros && h('div.texto-xs.texto-3', { texto: `~${r.macros.kcal} kcal · P${r.macros.p} G${r.macros.g} C${r.macros.c}` }),
      r.trocas && r.trocas.length
        ? h('ul.ex-lista.mt-2', null, r.trocas.map((t) => h('li', { texto: t })))
        : null
    )
  );
}

/* ===================== compensação do gasto ===================== */

// Durações de referência para a tabela de simulação — cobre de um treino curto
// a um pedal de 5h.
const SIMULACOES = [60, 90, 120, 180, 240, 300];

function abaCompensacao(nutricao, dia) {
  const c = nutricao.compensacao;
  const frag = h('div');

  frag.append(h('div.card', { estilo: { '--accent': 'var(--c-nutricao)' } },
    h('h2', { texto: c.titulo }),
    h('p.legenda.mt-2', { texto: `Definido em ${dataBR(c.definidoEm)}` }),
    h('p.texto-2.mt-3', { texto: c.descricao }),
    h('p.texto-2.mt-3', null, h('strong', { texto: 'Regra: ' }), c.regra),
    h('div.grade.grade-2.mt-3', null,
      h('div.metrica', null,
        h('div.metrica-label', { texto: 'Base (dia parado)' }),
        h('div.metrica-valor', null, h('b.num', { texto: String(c.baseKcal) })),
        h('div.metrica-nota', { texto: `${c.baseCarboG} g de carboidrato` })
      ),
      h('div.metrica', { dataset: { nivel: 'atencao' } },
        h('div.metrica-label', { texto: 'Teto do dia' }),
        h('div.metrica-valor', null, h('b.num', { texto: String(c.tetoKcalDia) })),
        h('div.metrica-nota', { texto: 'acima disso vai para o banco' })
      )
    ),
    h('p.legenda.mt-3', { texto: c.notaTeto }),
    h('div.mt-3', null, definicoes([
      ['Proteína', `${c.proteinaFixaG} g`, 'fixa — não muda com o gasto'],
      ['Gordura', `${c.gorduraFixaG} g`, 'fixa — não muda com o gasto'],
      ['Carboidrato', `${c.baseCarboG} g + gasto/4`, 'absorve todo o excedente calórico']
    ]))
  ));

  // Hoje, na prática.
  frag.append(secao('Como está hoje',
    card(
      h('div.grade.grade-3', null,
        h('div.metrica', null,
          h('div.metrica-label', { texto: 'Gasto registrado' }),
          h('div.metrica-valor', null, h('b.num', { texto: String(dia.gasto) })),
          h('div.metrica-nota', { texto: dia.provisorio ? 'nada registrado' : 'kcal' })
        ),
        h('div.metrica', null,
          h('div.metrica-label', { texto: 'Alvo derivado' }),
          h('div.metrica-valor', null, h('b.num', { texto: String(dia.alvo.kcal) })),
          h('div.metrica-nota', { texto: `${dia.alvo.c} g de carboidrato` })
        ),
        h('div.metrica', { dataset: { nivel: dia.derivado.noTeto ? 'atencao' : 'ok' } },
          h('div.metrica-label', { texto: 'Cortado pelo teto' }),
          h('div.metrica-valor', null, h('b.num', { texto: String(dia.derivado.cortadoPeloTeto) })),
          h('div.metrica-nota', { texto: dia.derivado.noTeto ? 'vai para o banco' : 'nada pendente' })
        )
      )
    )
  ));

  // Taxas por atividade.
  const linhasAtividade = [];
  for (const a of c.atividades) {
    if (a.perfis) {
      for (const p of a.perfis) {
        linhasAtividade.push({
          dataset: p.padrao ? { destaque: 'true' } : {},
          celulas: [
            h('span', null, a.nome, h('small.texto-3', { texto: ` · ${p.nome}` })),
            p.kcalPorHora ? `${p.kcalPorHora} kcal/h` : 'curva por duração',
            formatarDuracao(a.duracaoPadraoMin),
            p.nota || (p.curvaMin ? p.curvaMin.map(([m, k]) => `${formatarDuracao(m)} = ${k}`).join(' · ') : '')
          ]
        });
      }
    } else {
      linhasAtividade.push({
        celulas: [
          h('span', null, a.nome, a.estimado ? h('span', null, ' ', chip('estimado', 'atencao')) : null),
          `${a.kcalPorHora} kcal/h`,
          formatarDuracao(a.duracaoPadraoMin),
          a.fonte || ''
        ]
      });
    }
  }

  frag.append(secao('Taxas por atividade',
    tabela(
      [{ nome: 'Atividade' }, { nome: 'Taxa' }, { nome: 'Padrão' }, { nome: 'Origem' }],
      linhasAtividade
    ),
    h('p.legenda.mt-2', { texto: 'Toda estimativa é editável no registro em Hoje — o valor do ciclocomputador substitui a taxa.' })
  ));

  // O que cada duração vira de alvo.
  const perfisPedal = c.atividades.find((a) => a.id === 'pedal').perfis;
  frag.append(secao('Quanto comer para cada pedal',
    tabela(
      [{ nome: 'Duração' }, ...perfisPedal.map((p) => ({ nome: p.id, classe: 'num' })), { nome: 'Alvo (Z2)', classe: 'num' }],
      SIMULACOES.map((min) => {
        const gastoZ2 = gastoDaAtividade({ tipo: 'pedal', duracaoMin: min }, c);
        const a = alvoPorGasto(c, gastoZ2);
        return {
          celulas: [
            formatarDuracao(min),
            ...perfisPedal.map((p) => gastoDaAtividade({ tipo: 'pedal', perfil: p.id, duracaoMin: min }, c)),
            h('span', null, `${a.kcal} kcal`,
              a.noTeto ? h('small.texto-3', { texto: ` · ${a.cortadoPeloTeto} no banco` }) : null)
          ]
        };
      })
    ),
    h('p.legenda.mt-2', { texto: 'Gasto em kcal por perfil de intensidade. A última coluna é o alvo do dia se o pedal for em Z2 e não houver outra atividade.' })
  ));

  // Combustível durante.
  const ia = c.intraAtividade;
  frag.append(secao(ia.titulo,
    card(
      h('p.texto-2', { texto: ia.descricao }),
      h('p.texto-2.mt-3', null, h('strong', { texto: `Alvo: ${ia.alvoCarboPorHora[0]}–${ia.alvoCarboPorHora[1]} g de carboidrato por hora. ` }), ia.porHora),
      h('div.mt-3', null, tabela(
        [{ nome: 'Item' }, { nome: 'Papel' }, { nome: 'Medida' }, { nome: 'CHO', classe: 'num' }, { nome: 'kcal', classe: 'num' }],
        ia.itens.map((i) => ({
          dataset: i.papel === 'base' ? { destaque: 'true' } : {},
          celulas: [
            h('span', null, i.nome, i.nota ? h('div.texto-xs.texto-3', { texto: i.nota }) : null),
            i.papel === 'base' ? `base · ${i.porHora || 1}/hora` : 'completa',
            i.medida, `${i.carboG} g`, i.kcal
          ]
        }))
      )),
      h('p.legenda.mt-2', { texto: 'Base entra por hora de pedal; os demais fecham a diferença até o meio da faixa. A escolha é do dado — o motor não conhece nome de alimento.' }),
      ia.trocas && ia.trocas.length
        ? h('div.mt-3', null,
            h('h4', { texto: 'Trocas' }),
            lista(ia.trocas)
          )
        : null,
      h('div.mt-3', null, aviso({ nivel: 'critico', titulo: 'Por que não dá para pular', texto: ia.alerta }))
    )
  ));

  // Banco calórico.
  frag.append(secao(c.banco.titulo,
    card(
      h('p.texto-2', { texto: c.banco.descricao }),
      h('p.texto-2.mt-3', null, h('strong', { texto: 'Fórmula: ' }), c.banco.formula),
      h('p.legenda.mt-3', { texto: c.banco.nota })
    )
  ));

  // Reforços.
  frag.append(secao(c.reforcos.titulo,
    tabela(
      [{ nome: 'Item' }, { nome: 'Porção' }, { nome: 'CHO', classe: 'num' }, { nome: 'kcal', classe: 'num' }],
      c.reforcos.itens.map((i) => [i.nome, i.medida, `${i.carboG} g`, i.kcal])
    ),
    h('p.legenda.mt-2', { texto: c.reforcos.descricao })
  ));

  // Divergência registrada.
  const dv = c.divergenciaGasto;
  frag.append(secao(dv.titulo,
    h('div.card', { estilo: { '--accent': 'var(--c-atencao)' } },
      h('p.legenda', { texto: `Resolvida em ${dataBR(dv.resolvidoEm)}` }),
      h('p.texto-2.mt-3', { texto: dv.texto }),
      h('div.mt-3', null, aviso({ nivel: 'atencao', titulo: 'Consequência', texto: dv.consequencia }))
    )
  ));

  return frag;
}

/* ===================== suplementos ===================== */

function abaSuplementos(nutricao, ctx) {
  const { registro } = ctx;
  const frag = h('div');

  frag.append(h('div.pilha-2', null, nutricao.suplementos.map((s) => {
    const item = h('button.check-item', {
      type: 'button',
      dataset: { feito: String(registro.suplementoTomado(s.nome)) },
      onClick: () => { item.dataset.feito = String(registro.alternarSuplemento(s.nome)); }
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
