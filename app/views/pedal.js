// Aba "Pedal" — rotina de ciclismo, bike fit, técnica e plano de resistência.

import {
  h, icone, cabecalhoPagina, aviso, chip, card, cardTitulado, segmentos,
  tabela, lista, definicoes, secao, dataBR
} from '../ui.js';

const SUBABAS = [
  { id: 'rotina', nome: 'Rotina' },
  { id: 'resistencia', nome: 'Resistência' },
  { id: 'cuidados', nome: 'Cuidados' }
];

export async function render(ctx) {
  const pedal = await ctx.store.doc('pedal');
  const sub = SUBABAS.some((s) => s.id === ctx.params[0]) ? ctx.params[0] : 'rotina';

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: `Atualizado em ${dataBR(pedal.meta.atualizadoEm)}`,
    titulo: pedal.meta.titulo,
    subtitulo: pedal.meta.descricao
  }));
  raiz.append(segmentos(SUBABAS, sub, (id) => ctx.navegar(`#/pedal/${id}`)));

  raiz.append({ rotina: abaRotina, resistencia: abaResistencia, cuidados: abaCuidados }[sub](pedal));
  return raiz;
}

function abaRotina(pedal) {
  const frag = h('div');

  frag.append(h('div.card', { estilo: { '--accent': 'var(--c-pedal)' } },
    h('h3.card-titulo', null, icone('pedal'), ' ', pedal.dadosAtuais.titulo),
    h('p.legenda', { texto: `Referência: ${pedal.dadosAtuais.referencia}` }),
    h('div.mt-3', null, definicoes(pedal.dadosAtuais.itens.map((i) => [i.label, i.valor, i.nota])))
  ));

  frag.append(secao('Equipamento obrigatório',
    h('div.pilha-2', null, pedal.equipamentoObrigatorio.map((e) =>
      aviso({ nivel: 'critico', titulo: e.item, texto: e.motivo })
    ))
  ));

  frag.append(secao(pedal.protocoloRetorno.titulo,
    card(
      h('div.timeline', null, pedal.protocoloRetorno.fases.map((f) => h('div.timeline-item', null,
        h('div.timeline-data', { texto: f.periodo }),
        h('div.timeline-corpo', { texto: f.texto })
      ))),
      h('div.mt-3', null, lista(pedal.protocoloRetorno.notas))
    )
  ));

  frag.append(secao(pedal.integracao.titulo,
    card(
      lista(pedal.integracao.itens),
      h('div.mt-3', null, aviso({ nivel: 'atencao', texto: pedal.integracao.nota }))
    )
  ));

  frag.append(secao('Observações', card(lista(pedal.observacoes))));

  frag.append(secao('Próximos passos',
    card(h('ol.lista', null, pedal.proximosPassos.map((p) => h('li', { texto: p }))))
  ));

  return frag;
}

function abaResistencia(pedal) {
  const r = pedal.resistenciaQuadriceps;
  const frag = h('div');

  frag.append(h('div.card', { estilo: { '--accent': 'var(--c-pedal)' } },
    h('h2', { texto: r.titulo }),
    h('p.legenda.mt-2', { texto: dataBR(r.data) }),
    h('p.texto-2.mt-3', null, h('strong', { texto: 'Problema: ' }), r.problema),
    h('p.texto-2.mt-2', null, h('strong', { texto: 'Diagnóstico: ' }), r.diagnostico)
  ));

  frag.append(secao(r.rolo.titulo,
    card(
      h('div.chip-linha', null, chip(r.rolo.frequencia, 'accent', 'relogio')),
      h('p.texto-2.texto-sm.mt-3', { texto: r.rolo.compatibilidade }),
      h('div.mt-3', null, tabela(
        [{ nome: 'Sessão' }, { nome: 'Estrutura' }, { nome: 'Intensidade' }, { nome: 'Cadência' }],
        r.rolo.sessoes.map((s) => [s.nome, s.estrutura, s.intensidade, s.cadencia])
      )),
      h('div.mt-3', null, aviso({ nivel: 'info', titulo: 'Por que funciona', texto: r.rolo.porQue }))
    )
  ));

  frag.append(secao(r.campo.titulo, card(lista(r.campo.itens))));

  frag.append(secao(r.progressao.titulo,
    tabela(
      [{ nome: 'Marco' }, { nome: 'Sustentar puxada por', classe: 'num' }],
      r.progressao.marcos.map((m) => [m.marco, m.sustentar])
    ),
    h('div.mt-3', null, aviso({ nivel: 'atencao', titulo: 'Condicional', texto: r.progressao.condicional }))
  ));

  return frag;
}

function abaCuidados(pedal) {
  const c = pedal.cuidados;
  const frag = h('div');

  frag.append(h('div.card', { estilo: { '--accent': 'var(--c-saude)' } },
    h('h2', { texto: c.titulo }),
    h('p.legenda.mt-2', { texto: `Referência: ${c.referencia}` }),
    h('p.texto-2.mt-3', { texto: c.base })
  ));

  frag.append(secao(c.sinaisAlerta.titulo,
    h('div.card', { estilo: { '--accent': 'var(--c-critico)' } },
      h('h4', null, '🔴 Parar imediatamente'),
      lista(c.sinaisAlerta.vermelhos, 'lista lista-x'),
      h('h4.mt-4', null, '🟡 Vigiar'),
      lista(c.sinaisAlerta.amarelos)
    )
  ));

  frag.append(secao(c.bikeFit.titulo,
    tabela(
      [{ nome: 'Componente' }, { nome: 'Recomendação' }, { nome: 'Justificativa' }],
      c.bikeFit.itens.map((i) => [i.componente, i.recomendacao, i.justificativa])
    )
  ));

  frag.append(secao(c.tecnica.titulo,
    h('div.grade.grade-2', null, c.tecnica.itens.map((i) => card(
      h('h4', { texto: i.titulo }),
      h('p.texto-2.texto-sm.mt-2', { texto: i.texto })
    )))
  ));

  frag.append(secao('MTB × Speed',
    tabela(
      [{ nome: 'Modalidade' }, { nome: 'Status' }, { nome: 'Observação' }],
      c.modalidades.map((m) => [
        m.modalidade,
        chip(m.status, m.status === 'evitar' ? 'critico' : m.status === 'ok' ? 'info' : 'ok'),
        m.observacao
      ])
    )
  ));

  return frag;
}
