// Aba "Saúde" — resumo clínico, composição corporal, exames, laudos e pendências.

import {
  h, icone, cabecalhoPagina, aviso, chip, card, cardTitulado, segmentos,
  tabela, lista, definicoes, secao, dataBR, dataCurta, mesAno, nb, cartaoMetrica
} from '../ui.js';
import { graficoLinha } from '../charts.js';

const SUBABAS = [
  { id: 'resumo', nome: 'Resumo' },
  { id: 'composicao', nome: 'Composição' },
  { id: 'exames', nome: 'Exames' },
  { id: 'laudos', nome: 'Laudos' },
  { id: 'pendencias', nome: 'Pendências' }
];

const NIVEL_GRAVIDADE = { alta: 'critico', media: 'atencao', baixa: 'info', resolvido: 'ok' };

export async function render(ctx) {
  const sub = SUBABAS.some((s) => s.id === ctx.params[0]) ? ctx.params[0] : 'resumo';
  const saude = await ctx.store.doc('saude');

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: `Atualizado em ${dataBR(saude.meta.atualizadoEm)}`,
    titulo: saude.meta.titulo,
    subtitulo: saude.meta.subtitulo
  }));
  raiz.append(segmentos(SUBABAS, sub, (id) => ctx.navegar(`#/saude/${id}`)));

  const corpo = h('div');
  raiz.append(corpo);

  if (sub === 'resumo') corpo.append(abaResumo(saude));
  else if (sub === 'composicao') corpo.append(await abaComposicao(ctx));
  else if (sub === 'exames') corpo.append(await abaExames(ctx));
  else if (sub === 'laudos') corpo.append(await abaLaudos(ctx));
  else corpo.append(abaPendencias(saude));

  return raiz;
}

/* ===================== resumo ===================== */

function abaResumo(saude) {
  const frag = h('div');

  frag.append(aviso({ nivel: 'info', texto: saude.meta.aviso }));

  frag.append(secao('Diagnósticos',
    h('div.pilha-2', null, saude.diagnosticos.map((d) => h('div.card', null,
      h('div.linha', null,
        h('h4.esticar', { texto: d.nome }),
        chip(d.gravidade === 'resolvido' ? 'resolvido' : d.prognostico.classificacao, NIVEL_GRAVIDADE[d.gravidade] || 'info')
      ),
      h('p.texto-2.texto-sm.mt-2', { texto: d.detalhe }),
      h('p.legenda.mt-2', { texto: d.resolvidoEm ? `Confirmado em ${dataBR(d.confirmadoEm)} · resolvido em ${dataBR(d.resolvidoEm)}` : `Confirmado em ${dataBR(d.confirmadoEm)}` }),
      d.prognostico.sucessoConservador && h('p.legenda.mt-2', null,
        h('strong', { texto: 'Sucesso conservador: ' }), d.prognostico.sucessoConservador),
      d.prognostico.notas && d.prognostico.notas.length ? lista(d.prognostico.notas) : null
    )))
  ));

  frag.append(h('div.mt-4', null, aviso({
    nivel: 'info', titulo: 'Diagnóstico integrado', texto: saude.diagnosticoIntegrado
  })));

  frag.append(secao('Correlação clínica', card(lista(saude.correlacaoClinica))));

  frag.append(secao(saude.redFlags.titulo,
    h('div.card', { estilo: { '--accent': 'var(--c-critico)' } },
      lista(saude.redFlags.itens, 'lista lista-x')
    )
  ));

  frag.append(secao('Conduta — ' + saude.conduta.ombro.titulo,
    h('div.grade.grade-2', null,
      cardTitulado('Suspender completamente', lista(saude.conduta.ombro.suspender, 'lista lista-x')),
      cardTitulado('Permitido com cautela', lista(saude.conduta.ombro.permitidoComCautela, 'lista lista-check'))
    )
  ));

  frag.append(secao('Conduta — coluna e manutenção',
    h('div.grade.grade-2', null,
      cardTitulado(saude.conduta.coluna.titulo, lista(saude.conduta.coluna.itens, 'lista lista-x')),
      cardTitulado(saude.conduta.manter.titulo, lista(saude.conduta.manter.itens, 'lista lista-check'))
    )
  ));

  frag.append(secao('Sintomas',
    h('div.grade.grade-2', null, saude.sintomas.grupos.map((g) =>
      cardTitulado(g.nome, lista(g.itens))
    ))
  ));

  frag.append(secao('Avaliação funcional',
    h('div.grade.grade-2', null,
      cardTitulado('Compatível com', lista(saude.avaliacaoFuncional.compativel, 'lista lista-check')),
      cardTitulado('Não parece ser', lista(saude.avaliacaoFuncional.descartado, 'lista lista-x'))
    )
  ));

  frag.append(secao(saude.dormenciaMaoDireita.titulo, card(lista(saude.dormenciaMaoDireita.itens))));

  frag.append(secao(saude.criteriosCirurgicos.titulo,
    card(
      aviso({ nivel: 'ok', texto: saude.criteriosCirurgicos.nota }),
      h('div.mt-3', null, h('ol.lista', null, saude.criteriosCirurgicos.itens.map((i) => h('li', { texto: i }))))
    )
  ));

  frag.append(secao(saude.conclusao.titulo,
    card(
      h('p.legenda', { texto: `Referência: ${saude.conclusao.referencia}` }),
      h('div.mt-3', null, saude.conclusao.itens.map((i) => h('div.def-linha', null,
        h('dt', { texto: i.regiao }),
        h('dd', { estilo: { textAlign: 'left', fontWeight: '400' }, texto: i.texto })
      ))),
      h('div.mt-3', null, aviso({ nivel: 'atencao', texto: saude.conclusao.nota }))
    )
  ));

  frag.append(secao('Critérios de evolução',
    h('div.grade.grade-2', null,
      cardTitulado('Sinais de melhora', lista(saude.criteriosEvolucao.melhora, 'lista lista-check')),
      cardTitulado('Quando investigar mais', lista(saude.criteriosEvolucao.investigarMais))
    )
  ));

  frag.append(secao(saude.joelhoHistorico.titulo,
    card(
      h('div.chip-linha', null, chip(saude.joelhoHistorico.periodo, 'ok')),
      h('p.texto-2.mt-3', { texto: saude.joelhoHistorico.status }),
      h('h4.mt-4', { texto: 'Apresentação clínica' }), lista(saude.joelhoHistorico.apresentacao),
      h('h4.mt-4', { texto: 'Hipóteses diagnósticas' }), h('ol.lista', null, saude.joelhoHistorico.hipoteses.map((x) => h('li', { texto: x }))),
      h('p.texto-2.texto-sm.mt-3', null, h('strong', { texto: 'Mecanismo: ' }), saude.joelhoHistorico.mecanismo),
      h('h4.mt-4', { texto: 'Testes de auto-avaliação' }),
      h('div.mt-2', null, saude.joelhoHistorico.autoAvaliacao.map((t) => h('div.refeicao', null,
        h('span.refeicao-hora', { texto: t.teste }),
        h('div.refeicao-corpo', null, h('div.refeicao-itens', { texto: t.como }))
      ))),
      h('h4.mt-4', { texto: 'Conduta histórica (protocolo encerrado)' }), lista(saude.joelhoHistorico.condutaHistorica),
      h('h4.mt-4', { texto: 'Sinais de alarme' }), lista(saude.joelhoHistorico.sinaisAlarme, 'lista lista-x')
    )
  ));

  return frag;
}

/* ===================== composição corporal ===================== */

async function abaComposicao(ctx) {
  const bio = await ctx.store.doc('bioimpedancia');
  const medicoes = bio.medicoes;
  const ultima = medicoes[medicoes.length - 1];
  const penultima = medicoes[medicoes.length - 2];

  const frag = h('div');

  // Destaques da última medição
  const destaques = bio.metricas.filter((m) => m.destaque);
  frag.append(h('div.grade.grade-4', null, destaques.map((m) => {
    const atual = ultima[m.id], anterior = penultima ? penultima[m.id] : null;
    const delta = anterior == null ? null : atual - anterior;
    const dir = delta == null || Math.abs(delta) < 1e-9 ? 'estavel' : delta > 0 ? 'alta' : 'baixa';
    const bom = m.melhor === 'neutro' ? null : (m.melhor === 'maior' ? delta > 0 : delta < 0);
    const noPiso = m.pisoClinico != null && atual <= m.pisoClinico + 1;
    return cartaoMetrica({
      label: m.nome,
      valor: nb(atual, m.casas),
      unidade: m.unidade,
      nivel: noPiso ? 'atencao' : null,
      tendencia: dir,
      bom: dir === 'estavel' ? null : bom,
      nota: delta == null ? dataCurta(ultima.data) : `${delta > 0 ? '+' : ''}${nb(delta, m.casas)} vs ${mesAno(penultima.data)}`
    });
  })));

  // Gráfico com seletor de métrica
  let metricaAtiva = 'ffmKg';
  let indiceAtivo = medicoes.length - 1;
  const areaGrafico = h('div');

  const desenhar = () => {
    const m = bio.metricas.find((x) => x.id === metricaAtiva);
    const pontos = medicoes.map((med) => ({ x: mesAno(med.data), y: med[m.id] }));
    const sel = medicoes[indiceAtivo];
    const faixa = bio.faixasNormalidade[m.id];

    areaGrafico.replaceChildren(
      h('div.grafico-card', null,
        h('div.grafico-topo', null,
          h('div', null,
            h('div.grafico-valor', null,
              h('b', { texto: nb(sel[m.id], m.casas) }),
              h('span', { texto: m.unidade })
            ),
            h('p.legenda', { texto: `${m.nome} · ${dataCurta(sel.data)}` })
          ),
          h('div.chip-linha', null,
            faixa && chip(`normal ${nb(faixa.min, m.casas)}–${nb(faixa.max, m.casas)}${m.unidade}`),
            m.pisoClinico != null && chip(`piso clínico ${m.pisoClinico}${m.unidade}`, 'critico')
          )
        ),
        graficoLinha(pontos, {
          casas: m.casas,
          unidade: m.unidade,
          piso: m.pisoClinico,
          indiceAtivo,
          aoSelecionar: (i) => { indiceAtivo = i; desenhar(); }
        }),
        h('p.legenda.mt-2', { texto: 'Toque em um ponto para ver a medição.' })
      )
    );
  };

  const abasMetrica = h('div.metrica-tabs', { role: 'tablist' },
    bio.metricas.map((m) => h('button.metrica-tab', {
      type: 'button', role: 'tab',
      'aria-selected': String(m.id === metricaAtiva),
      onClick: (e) => {
        metricaAtiva = m.id;
        indiceAtivo = medicoes.length - 1;
        abasMetrica.querySelectorAll('.metrica-tab').forEach((b) => b.setAttribute('aria-selected', 'false'));
        e.currentTarget.setAttribute('aria-selected', 'true');
        desenhar();
      }
    }, m.nome))
  );

  frag.append(secao('Evolução', abasMetrica, areaGrafico));
  desenhar();

  // Detalhe da última medição
  frag.append(secao(`Medição de ${dataCurta(ultima.data)}`,
    card(definicoes([
      ['Peso', `${nb(ultima.pesoKg)} kg`],
      ['IMC', nb(ultima.imc)],
      ['Gordura corporal', `${nb(ultima.bfPerc)} %`, `${nb(ultima.fmKg)} kg de massa de gordura`],
      ['Massa magra (FFM)', `${nb(ultima.ffmKg)} kg`],
      ['Massa muscular (SMM)', `${nb(ultima.smmKg)} kg`],
      ['Água corporal (TBW)', `${nb(ultima.tbwL)} L`, `intra ${nb(ultima.icwL)} L · extra ${nb(ultima.ecwL)} L`],
      ['Proteína', `${nb(ultima.proteinaKg)} kg`],
      ['Mineral ósseo', `${nb(ultima.mineralKg, 2)} kg`],
      ['Gordura visceral', `${nb(ultima.vfaCm2)} cm²`, `nível ${ultima.vfl}`],
      ['Taxa metabólica basal', `${ultima.tmbKcal} kcal`],
      ['Idade metabólica', `${ultima.idadeMetabolica} anos`],
      ['Índice apendicular', nb(ultima.indiceApendicular, 2)],
      ['SMMI', nb(ultima.smmi, 2), ultima.smmiNormal ? `normal ${ultima.smmiNormal.baixo}–${ultima.smmiNormal.alto}` : null]
    ]))
  ));

  // Segmentar
  frag.append(secao('Por segmento',
    tabela(
      [{ nome: 'Segmento' }, { nome: 'Massa magra', classe: 'num' }, { nome: 'Gordura', classe: 'num' }, { nome: 'Água', classe: 'num' }],
      Object.entries(ultima.membros).map(([nome, m]) => [
        rotuloMembro(nome), `${nb(m.ffmKg, 2)} kg`, `${nb(m.fmKg, 2)} kg`, `${nb(m.tbwL, 2)} L`
      ])
    )
  ));

  // Série completa
  frag.append(secao('Série completa',
    tabela(
      [
        { nome: 'Data' }, { nome: 'Peso', classe: 'num' }, { nome: 'BF%', classe: 'num' },
        { nome: 'FM', classe: 'num' }, { nome: 'FFM', classe: 'num' }, { nome: 'SMM', classe: 'num' },
        { nome: 'TBW', classe: 'num' }, { nome: 'VFA', classe: 'num' }, { nome: 'VFL', classe: 'num' },
        { nome: 'TMB', classe: 'num' }, { nome: 'Id. met.', classe: 'num' }
      ],
      medicoes.slice().reverse().map((m, i) => ({
        dataset: i === 0 ? { destaque: 'true' } : {},
        celulas: [
          dataBR(m.data), nb(m.pesoKg), nb(m.bfPerc), nb(m.fmKg), nb(m.ffmKg),
          nb(m.smmKg), nb(m.tbwL), nb(m.vfaCm2), m.vfl, m.tmbKcal, m.idadeMetabolica
        ]
      }))
    ),
    h('p.legenda.mt-2', { texto: `${medicoes.length} medições entre ${dataBR(medicoes[0].data)} e ${dataBR(ultima.data)}. Série consolidada e deduplicada a partir dos 5 arquivos originais da balança.` })
  ));

  return frag;
}

function rotuloMembro(chave) {
  return {
    bracoDireito: 'Braço direito', bracoEsquerdo: 'Braço esquerdo',
    tronco: 'Tronco', pernaDireita: 'Perna direita', pernaEsquerda: 'Perna esquerda'
  }[chave] || chave;
}

/* ===================== exames ===================== */

const NIVEL_STATUS = {
  excelente: 'ok', bom: 'ok', normal: 'ok',
  limitrofe: 'atencao', atencao: 'atencao', baixo: 'atencao', elevado: 'critico'
};

async function abaExames(ctx) {
  const exames = await ctx.store.doc('exames');
  const frag = h('div');

  for (const p of exames.paineis) {
    frag.append(h('div.card', null,
      h('div.linha', null,
        h('h2.esticar', { texto: p.nome }),
        chip(dataBR(p.data), 'accent')
      ),
      h('div.mt-3', null, tabela(
        [{ nome: 'Categoria' }, { nome: 'Status' }, { nome: 'Observação' }],
        p.resumo.map((r) => ({
          dataset: NIVEL_STATUS[r.status] === 'critico' ? { destaque: 'true' } : {},
          celulas: [r.categoria, chip(r.status, NIVEL_STATUS[r.status] || 'info'), r.observacao]
        }))
      )),
      h('h4.mt-4', { texto: 'Pontos de atenção' }),
      h('div.mt-2', null, tabela(
        [{ nome: 'Marcador' }, { nome: 'Resultado' }, { nome: 'Ação' }],
        p.acoes.map((a) => ({
          dataset: a.prioridade === 'alta' ? { destaque: 'true' } : {},
          celulas: [a.marcador, a.resultado, a.acao]
        }))
      )),
      h('p.legenda.mt-3', { texto: p.nota }),
      p.statusPosterior && h('div.mt-3', null, aviso({ nivel: 'ok', texto: p.statusPosterior }))
    ));
  }

  const t = exames.tireoide;
  frag.append(secao(t.titulo,
    card(
      h('div.timeline', null, t.linhaDoTempo.map((e) => h('div.timeline-item', { dataset: { nivel: 'atencao' } },
        h('div.timeline-data', { texto: dataBR(e.data) }),
        h('div.timeline-titulo', { texto: e.titulo }),
        h('div.timeline-corpo', { texto: e.texto }),
        e.acao && h('p.legenda.mt-2', null, h('strong', { texto: 'Ação: ' }), e.acao),
        e.laudo && h('button.btn.btn-fantasma.mt-2', {
          type: 'button', onClick: () => { location.hash = '#/saude/laudos'; }
        }, 'Ver laudo', icone('seta'))
      )))
    )
  ));

  frag.append(secao(t.bethesda.titulo,
    tabela(
      [{ nome: 'Categoria' }, { nome: 'Descrição' }, { nome: 'Risco de malignidade', classe: 'num' }],
      t.bethesda.categorias.map((c) => ({
        dataset: c.atual ? { destaque: 'true' } : {},
        celulas: [c.categoria, c.nome, c.risco]
      }))
    ),
    h('p.legenda.mt-2', { texto: t.bethesda.fonte })
  ));

  const cr = exames.cronogramaAcompanhamento;
  frag.append(secao(cr.titulo,
    tabela(
      [{ nome: 'Quando' }, { nome: 'Ação' }, { nome: 'Profissional' }],
      cr.itens.map((i) => ({
        dataset: i.urgente ? { destaque: 'true' } : {},
        celulas: [i.quando, i.acao, i.profissional]
      }))
    ),
    h('div.mt-3', null, aviso({ nivel: 'atencao', texto: cr.nota })),
    h('p.legenda.mt-2', { texto: cr.fonte })
  ));

  return frag;
}

/* ===================== laudos ===================== */

async function abaLaudos(ctx) {
  const { laudos } = await ctx.store.doc('laudos');
  const frag = h('div');

  const categorias = [...new Set(laudos.map((l) => l.categoria))];
  for (const cat of categorias) {
    frag.append(secao(cat,
      h('div.pilha', null, laudos.filter((l) => l.categoria === cat).map(cartaoLaudo))
    ));
  }
  return frag;
}

function cartaoLaudo(l) {
  const aberto = h('div', { hidden: true });
  const detalhe = () => {
    if (aberto.childElementCount) return;
    if (l.identificacao) aberto.append(h('h4.mt-4', { texto: 'Identificação' }),
      definicoes(l.identificacao.map((i) => [i.campo, i.valor])));
    if (l.indicacao) aberto.append(h('p.texto-2.texto-sm.mt-3', null, h('strong', { texto: 'Indicação: ' }), l.indicacao));
    if (l.procedimento) aberto.append(h('h4.mt-4', { texto: 'Procedimento' }), lista(l.procedimento));
    if (l.achados) aberto.append(h('h4.mt-4', { texto: 'Principais achados' }), lista(l.achados));
    if (l.medidas) aberto.append(h('h4.mt-4', { texto: 'Medidas' }),
      h('div.mt-2', null, tabela(
        [{ nome: 'Estrutura' }, { nome: 'Dimensões' }, { nome: 'Volume', classe: 'num' }],
        l.medidas.map((m) => [m.estrutura, m.dimensoes, m.volume])
      )));
    if (l.interpretacao) aberto.append(h('h4.mt-4', { texto: 'Interpretação clínica' }), lista(l.interpretacao));
    if (l.conclusao) aberto.append(h('div.mt-3', null, aviso({ nivel: 'atencao', titulo: 'Conclusão', texto: l.conclusao })));
    if (l.conduta) aberto.append(h('p.texto-2.texto-sm.mt-3', null, h('strong', { texto: 'Conduta indicada: ' }), l.conduta));
    if (l.achadosAssociados) aberto.append(h('h4.mt-4', { texto: 'Achados associados' }), lista(l.achadosAssociados));
    if (l.consideracoes) aberto.append(h('h4.mt-4', { texto: 'Considerações' }), lista(l.consideracoes));
    if (l.observacoes) aberto.append(h('h4.mt-4', { texto: 'Observações' }), lista(l.observacoes));
    if (l.notas) aberto.append(h('h4.mt-4', { texto: 'Notas' }), lista(l.notas));
    if (l.contexto) aberto.append(h('p.legenda.mt-3', { texto: l.contexto }));
    if (l.notaPosterior) aberto.append(h('div.mt-3', null, aviso({ nivel: 'info', texto: l.notaPosterior })));
    if (l.referencia) aberto.append(h('p.legenda.mt-3', { texto: 'Referência: ' + l.referencia }));
  };

  const botao = h('button.btn.btn-fantasma.mt-3', {
    type: 'button',
    onClick: () => {
      detalhe();
      aberto.hidden = !aberto.hidden;
      botao.firstChild.textContent = aberto.hidden ? 'Ver laudo completo' : 'Recolher';
    }
  }, document.createTextNode('Ver laudo completo'), icone('seta'));

  return h('article.card', null,
    h('div.linha', null,
      h('div.esticar', null,
        h('h3', { texto: l.exame }),
        h('p.legenda', { texto: l.dataAproximada ? `Aprox. ${l.data.slice(0, 4)}` : dataBR(l.data) })
      ),
      chip(l.resultado.titulo, l.resultado.nivel)
    ),
    h('p.texto-2.mt-2', { texto: l.resultado.texto }),
    botao,
    aberto
  );
}

/* ===================== pendências ===================== */

const ORDEM_PRIORIDADE = { alta: 0, media: 1, meta: 2, concluido: 3 };
const NIVEL_PRIORIDADE = { alta: 'critico', media: 'atencao', meta: 'info', concluido: 'ok' };
const ROTULO_PRIORIDADE = { alta: 'prioridade alta', media: 'acompanhar', meta: 'meta', concluido: 'concluído' };

function abaPendencias(saude) {
  const frag = h('div');
  const st = saude.statusAtual;

  frag.append(h('div.card', { estilo: { '--accent': 'var(--c-saude)' } },
    h('h2', { texto: 'Objetivo atual' }),
    h('p.texto-2.mt-2', { texto: st.objetivoAtual })
  ));

  const ordenadas = saude.pendencias.slice().sort((a, b) =>
    (ORDEM_PRIORIDADE[a.prioridade] ?? 9) - (ORDEM_PRIORIDADE[b.prioridade] ?? 9));

  frag.append(secao('Pendências ativas',
    h('div.pilha-2', null, ordenadas.map((p) => h('div.card.card-compacto', null,
      h('div.linha', null,
        h('h4.esticar', { texto: p.titulo }),
        chip(ROTULO_PRIORIDADE[p.prioridade] || p.prioridade, NIVEL_PRIORIDADE[p.prioridade] || 'info')
      ),
      h('p.texto-2.texto-sm.mt-2', { texto: p.texto })
    )))
  ));

  frag.append(secao(st.titulo,
    card(
      h('p.legenda', { texto: `Referência: ${dataBR(st.referencia)}` }),
      h('div.mt-3', null, st.itens.map((i) => h('div.linha', { estilo: { alignItems: 'flex-start', padding: '6px 0' } },
        chip(rotuloStatus(i.status), nivelStatus(i.status)),
        h('span.esticar.texto-2.texto-sm', { texto: i.texto })
      )))
    )
  ));

  frag.append(secao('Concluídos', card(lista(saude.concluidos, 'lista lista-check'))));

  return frag;
}

function rotuloStatus(s) {
  return { ok: 'feito', cancelado: 'cancelado', atencao: 'atenção', neutro: 'em curso' }[s] || s;
}
function nivelStatus(s) {
  return { ok: 'ok', cancelado: 'critico', atencao: 'atencao', neutro: 'info' }[s] || 'info';
}
