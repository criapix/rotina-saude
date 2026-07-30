// Seções secundárias: dermatologia, histórico, pareceres, perfil e editor.

import {
  h, icone, cabecalhoPagina, aviso, chip, card, cardTitulado, tabela, lista,
  definicoes, secao, dataBR, dataCurta, idadeEm, toast
} from '../ui.js';

/* ===================== dermatologia ===================== */

export async function dermatologia(ctx) {
  const d = await ctx.store.doc('dermatologia');
  const raiz = h('div');

  raiz.append(cabecalhoPagina({
    kicker: `Prescrito em ${d.meta.prescritoTexto}`,
    titulo: d.meta.titulo,
    subtitulo: d.meta.subtitulo
  }));

  raiz.append(aviso({ nivel: 'info', texto: d.meta.nota }));

  const simOuTexto = (v) => (v === true ? '✓' : v === false ? '—' : v);

  raiz.append(secao(d.rotina.titulo,
    tabela(
      [{ nome: '#' }, { nome: 'Etapa' }, { nome: 'Produto' }, { nome: 'Manhã', classe: 'centro' }, { nome: 'Noite', classe: 'centro' }],
      d.rotina.etapas.map((e) => [e.ordem == null ? '—' : e.ordem, e.tipo, e.produto, simOuTexto(e.manha), simOuTexto(e.noite)])
    ),
    h('div.mt-3', null, aviso({ nivel: 'atencao', titulo: d.rotina.extra.titulo, texto: d.rotina.extra.texto }))
  ));

  raiz.append(secao('Produtos',
    h('div.pilha', null, d.produtos.map((p) => card(
      h('div.linha', null,
        h('div.esticar', null,
          h('h3', { texto: p.nome }),
          h('p.legenda', { texto: `${p.fabricante} · ${p.apresentacao}` })
        ),
        chip(p.quantidade)
      ),
      h('div.mt-3', null, definicoes([
        ['Princípios ativos', p.ativos],
        ['Modo de uso', p.modoUso]
      ])),
      p.alternativas && h('div.mt-4', null,
        h('h4', { texto: p.alternativas.titulo }),
        h('div.mt-2', null, tabela(
          [{ nome: 'Produto' }, { nome: 'Ativos principais' }, { nome: 'Preço aprox.', classe: 'num' }],
          p.alternativas.itens.map((a) => [a.produto, a.ativos, a.preco])
        )),
        h('p.legenda.mt-2', { texto: p.alternativas.nota })
      )
    )))
  ));

  return raiz;
}

/* ===================== histórico ===================== */

const CORES_TAG = { treino: 'var(--c-treino)', nutrição: 'var(--c-nutricao)', pedal: 'var(--c-pedal)', saúde: 'var(--c-saude)', app: 'var(--c-geral)' };

export async function historico(ctx) {
  const dados = await ctx.store.doc('historico');
  const raiz = h('div');

  const tags = [...new Set(dados.entradas.flatMap((e) => e.tags || []))];
  let filtro = ctx.params[0] && tags.includes(ctx.params[0]) ? ctx.params[0] : null;

  raiz.append(cabecalhoPagina({
    kicker: `${dados.entradas.length} registros`,
    titulo: dados.meta.titulo,
    subtitulo: dados.meta.subtitulo
  }));

  const listaEl = h('div.timeline');
  const filtros = h('div.metrica-tabs', { role: 'tablist' },
    [{ id: null, nome: 'Tudo' }, ...tags.map((t) => ({ id: t, nome: t }))].map((t) =>
      h('button.metrica-tab', {
        type: 'button', role: 'tab',
        'aria-selected': String(t.id === filtro),
        onClick: (e) => {
          filtro = t.id;
          filtros.querySelectorAll('.metrica-tab').forEach((b) => b.setAttribute('aria-selected', 'false'));
          e.currentTarget.setAttribute('aria-selected', 'true');
          desenhar();
        }
      }, t.nome)
    )
  );

  const desenhar = () => {
    const entradas = filtro ? dados.entradas.filter((e) => (e.tags || []).includes(filtro)) : dados.entradas;
    listaEl.replaceChildren(...entradas.map(itemHistorico));
  };

  raiz.append(filtros, listaEl);
  desenhar();
  return raiz;
}

function itemHistorico(e) {
  const corpo = h('div.timeline-corpo');
  corpo.append(h('p', { texto: e.resumo }));

  if (e.blocos) {
    const detalhe = h('div', { hidden: true });
    for (const b of e.blocos) {
      detalhe.append(h('h4.mt-3', { texto: b.titulo }));
      if (b.texto) detalhe.append(h('p.texto-2.texto-sm.mt-2', { texto: b.texto }));
      if (b.itens) detalhe.append(lista(b.itens));
      if (b.alerta) detalhe.append(h('div.mt-2', null, aviso({ nivel: 'atencao', texto: b.alerta })));
    }
    const botao = h('button.btn.btn-fantasma.mt-2', {
      type: 'button',
      onClick: () => {
        detalhe.hidden = !detalhe.hidden;
        botao.firstChild.textContent = detalhe.hidden ? 'Ver detalhes' : 'Recolher';
      }
    }, document.createTextNode('Ver detalhes'), icone('seta'));
    corpo.append(botao, detalhe);
  }

  return h('div.timeline-item', null,
    h('div.timeline-data', { texto: dataBR(e.data) }),
    h('div.timeline-titulo', { texto: e.titulo }),
    (e.tags || []).length ? h('div.chip-linha.mt-2', null, e.tags.map((t) =>
      h('span.chip', { estilo: { color: CORES_TAG[t] || 'var(--text-2)' }, texto: t })
    )) : null,
    corpo
  );
}

/* ===================== pareceres ===================== */

export async function pareceres(ctx) {
  const dados = await ctx.store.doc('pareceres');
  const raiz = h('div');

  raiz.append(cabecalhoPagina({
    titulo: dados.meta.titulo,
    subtitulo: `Atualizado em ${dataBR(dados.meta.atualizadoEm)}`
  }));
  raiz.append(aviso({ nivel: 'info', texto: dados.meta.aviso }));

  for (const p of dados.pareceres) {
    raiz.append(secao(`${p.titulo} — ${dataBR(p.data)}`, cartaoParecer(p)));
  }

  raiz.append(secao('Outros pareceres',
    h('div.timeline', null, dados.outrosPareceres.map((o) => h('div.timeline-item', null,
      h('div.timeline-data', { texto: dataBR(o.data) }),
      h('div.timeline-titulo', { texto: o.tema }),
      h('div.chip-linha.mt-2', null, o.equipe.map((e) => chip(e))),
      h('div.timeline-corpo', { texto: o.desfecho })
    )))
  ));

  return raiz;
}

function cartaoParecer(p) {
  const frag = h('div');

  frag.append(card(
    h('div.chip-linha', null, p.equipe.map((e) => chip(e, 'accent'))),
    h('p.texto-2.mt-3', null, h('strong', { texto: 'Objetivo: ' }), p.objetivo),
    h('p.legenda.mt-2', null, h('strong', { texto: 'Paciente no momento: ' }), p.pacienteNoMomento),
    h('div.mt-3', null, aviso({ nivel: 'info', texto: p.nota }))
  ));

  frag.append(secao('Ações urgentes',
    tabela(
      [{ nome: 'Ação' }, { nome: 'Urgência' }, { nome: 'Responsável' }, { nome: 'Status posterior' }],
      p.acoesUrgentes.map((a) => [a.acao, a.urgencia, a.responsavel, a.statusPosterior || '—'])
    )
  ));

  frag.append(secao('Convergências entre especialidades',
    card(h('ol.lista', null, p.convergencias.map((c) => h('li', { texto: c }))))
  ));

  for (const parte of p.partes) {
    frag.append(secao(parte.titulo,
      card(
        parte.avaliacao && h('p.texto-2', null, h('strong', { texto: 'Avaliação: ' }), parte.avaliacao),
        lista(parte.itens),
        parte.alerta && h('div.mt-3', null, aviso({ nivel: 'critico', texto: parte.alerta })),
        parte.redFlags && h('div.mt-3', null,
          h('h4', { texto: 'Red flags' }), lista(parte.redFlags, 'lista lista-x')),
        parte.cronograma && h('p.texto-2.texto-sm.mt-3', null, h('strong', { texto: 'Cronograma: ' }), parte.cronograma),
        parte.integracao && h('div.mt-3', null, aviso({ nivel: 'atencao', texto: parte.integracao }))
      )
    ));
  }

  frag.append(secao('Quadro-resumo de ajustes',
    h('div.pilha', null, p.quadroResumo.map((q) => h('div', null,
      h('h4.mt-2', { texto: q.area }),
      h('div.mt-2', null, tabela(
        [{ nome: 'Parâmetro' }, { nome: 'Anterior' }, { nome: 'Ajuste' }],
        q.linhas.map((l) => [l.parametro, l.anterior, l.ajuste])
      ))
    )))
  ));

  return frag;
}

/* ===================== perfil ===================== */

export async function perfil(ctx) {
  const [p, bio] = await ctx.store.docs('perfil', 'bioimpedancia');
  const raiz = h('div');

  raiz.append(cabecalhoPagina({
    titulo: p.pessoa.nome,
    subtitulo: `${idadeEm(p.pessoa.nascimento)} anos · ${p.pessoa.estaturaCm} cm · ${p.pessoa.cidade}`
  }));

  raiz.append(card(definicoes([
    ['Nascimento', dataBR(p.pessoa.nascimento)],
    ['Estatura', `${p.pessoa.estaturaCm} cm`],
    ['Profissão', p.pessoa.profissao],
    ['Última bioimpedância', dataCurta(bio.meta.atualizadoEm), `${bio.meta.totalMedicoes} medições no histórico`]
  ])));

  raiz.append(secao('Objetivos',
    h('div.pilha-2', null, p.objetivos.map((o) => h('div.card.card-compacto', null,
      h('div.linha', null,
        h('span.esticar', { texto: o.titulo }),
        chip(o.area, o.critico ? 'critico' : 'accent')
      ),
      o.nota && h('p.legenda.mt-2', { texto: o.nota })
    )))
  ));

  raiz.append(secao('Agenda semanal',
    tabela(
      [{ nome: 'Dia' }, { nome: 'Treino' }, { nome: 'Pedal' }, { nome: 'Tipo de dia' }],
      p.agenda.dias
        .slice()
        .sort((a, b) => ((a.diaSemana + 6) % 7) - ((b.diaSemana + 6) % 7))
        .map((d) => [d.nome, d.treino || '—', d.pedal || '—', d.tipoDia])
    ),
    h('p.legenda.mt-2', { texto: `${p.agenda.fonte}. ${p.agenda.nota}` }),
    h('div.mt-3', null, aviso({ nivel: 'info', titulo: 'Modo flexível', texto: 'Esta tabela é referência. O que o app orienta vem do que você registra em Hoje, numa janela móvel de 7 dias.' }))
  ));

  raiz.append(secao('Alertas ativos',
    h('div.pilha-2', null, p.alertas.map((a) =>
      aviso({ nivel: a.nivel, titulo: a.titulo, texto: a.texto, data: a.desde })
    ))
  ));

  return raiz;
}

/* ===================== editor ===================== */

export async function editor(ctx) {
  const { store, params } = ctx;
  const slug = params[0];
  const raiz = h('div');

  if (!slug) {
    raiz.append(cabecalhoPagina({
      titulo: 'Editar dados',
      subtitulo: 'Cada documento é um JSON. Ao salvar, o app cifra o conteúdo e baixa o arquivo pronto para substituir em data/.'
    }));
    raiz.append(aviso({
      nivel: 'info',
      titulo: 'Como publicar uma edição',
      texto: 'Edite o JSON, clique em “Salvar cifrado”, substitua o arquivo baixado em data/ no repositório e faça commit. O texto puro nunca é gravado no repositório.'
    }));
    raiz.append(h('div.grade.grade-2.mt-4', null, store.slugs.map((s) =>
      h('button.nav-card', { type: 'button', onClick: () => ctx.navegar(`#/editor/${s}`) },
        h('span.nav-card-icone', null, icone('editor')),
        h('span.nav-card-texto', null,
          h('strong', { texto: s + '.json' }),
          h('span', { texto: store.cache.has(s) ? 'carregado nesta sessão' : 'será decifrado ao abrir' })
        ),
        h('span.nav-card-seta', null, icone('seta'))
      )
    )));
    return raiz;
  }

  await store.doc(slug); // garante que o texto bruto está em memória
  const original = store.bruto(slug);
  const bonito = JSON.stringify(JSON.parse(original), null, 1);

  raiz.append(h('button.btn.btn-fantasma', {
    type: 'button', onClick: () => ctx.navegar('#/editor')
  }, icone('voltar'), 'Todos os documentos'));

  raiz.append(cabecalhoPagina({ kicker: 'Editor', titulo: `${slug}.json` }));

  const status = h('span.editor-status', { texto: `${bonito.length} caracteres` });
  const area = h('textarea.editor-area', { spellcheck: 'false', 'aria-label': `Conteúdo de ${slug}.json` });
  area.value = bonito;

  const validar = () => {
    try {
      JSON.parse(area.value);
      status.dataset.estado = 'ok';
      status.textContent = `JSON válido · ${area.value.length} caracteres`;
      return true;
    } catch (e) {
      status.dataset.estado = 'erro';
      status.textContent = 'JSON inválido: ' + e.message;
      return false;
    }
  };
  area.addEventListener('input', validar);

  const salvar = async () => {
    if (!validar()) { toast('Corrija o JSON antes de salvar.'); return; }
    const texto = JSON.stringify(JSON.parse(area.value)); // normaliza compacto, como o build
    const blob = await ctx.cofre.cifrar(texto);
    store.substituir(slug, texto);
    const arquivo = new Blob([JSON.stringify(blob)], { type: 'application/json' });
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.enc.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Baixado ${slug}.enc.json — substitua em data/ e faça commit.`);
  };

  raiz.append(
    h('div.editor-barra', null,
      h('button.btn.btn-primario', { type: 'button', onClick: salvar }, 'Salvar cifrado'),
      h('button.btn.btn-secundario', { type: 'button', onClick: () => { area.value = bonito; validar(); } }, 'Reverter'),
      h('span.esticar'),
      status
    ),
    area,
    h('p.legenda.mt-3', { texto: 'Alternativa por linha de comando: node tools/crypto.mjs dump <senha> extrai todos os documentos para ./content, e node tools/crypto.mjs build <senha> cifra de volta.' })
  );

  validar();
  return raiz;
}
