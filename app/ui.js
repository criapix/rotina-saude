// Helpers de DOM e componentes visuais compartilhados.

/* ===================== hyperscript mínimo ===================== */

/**
 * h('div.classe', { attrs }, ...filhos)
 * - filhos: string, Node, array, null/false (ignorados)
 * - props especiais: html (innerHTML), dataset, onClick etc. (on* => addEventListener)
 */
export function h(seletor, props, ...filhos) {
  const [tagEClasses, ...idParte] = seletor.split('#');
  const [tag, ...classes] = tagEClasses.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (idParte.length) el.id = idParte[0];

  // Só um objeto simples (não Node, não array) conta como props; qualquer outra
  // coisa é o primeiro filho — inclusive valores falsos porém válidos como 0.
  const ehProps = props != null && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props);
  if (!ehProps) {
    if (props !== undefined) filhos.unshift(props);
    props = null;
  }

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'html') el.innerHTML = v;
      else if (k === 'texto') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'estilo') aplicarEstilo(el, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }

  anexar(el, filhos);
  return el;
}

/**
 * Aplica estilos inline. Propriedades customizadas (--x) exigem setProperty:
 * `style['--x'] = v` cria só uma propriedade JS solta e não gera declaração CSS.
 */
function aplicarEstilo(el, estilos) {
  for (const [k, v] of Object.entries(estilos)) {
    if (v == null) continue;
    if (k.startsWith('--')) el.style.setProperty(k, String(v));
    else el.style[k] = v;
  }
}

function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false || f === '') continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

/* ===================== ícones ===================== */

const CAMINHOS = {
  hoje: '<path d="M3 9.5 12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 20z"/><path d="M9.5 21.5V13h5v8.5"/>',
  treino: '<path d="M4 9v6M20 9v6M7 6.5v11M17 6.5v11"/><path d="M7 12h10"/>',
  pedal: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M12 17.5V13l-3-2.5 4-3 2.5 3H18"/><circle cx="15.5" cy="5" r="1.2" fill="currentColor"/>',
  nutricao: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h15v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M7 2v3M11 2v3M15 2v3"/>',
  saude: '<path d="M22 12h-4l-2.5 7L9.5 4 7 12H2"/>',
  grafico: '<path d="M4 20V9M10 20V4M16 20v-7M22 20v-11"/>',
  laudo: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  exame: '<path d="M9 3v7.5a4 4 0 1 0 6 0V3"/><path d="M8 3h8"/><path d="M9.5 11h5"/>',
  derma: '<path d="M12 2a5.5 5.5 0 0 1 5.5 5.5c0 3.3-2.2 6-5.5 8.5-3.3-2.5-5.5-5.2-5.5-8.5A5.5 5.5 0 0 1 12 2z"/><path d="M12 22v-6"/>',
  historico: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  parecer: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 12.5h5"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  editor: '<path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  cadeado: '<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5"/>',
  alerta: '<path d="M12 3.5 2.7 19.5h18.6z"/><path d="M12 9.5v4.5M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  seta: '<path d="M9 6l6 6-6 6"/>',
  voltar: '<path d="M15 6l-6 6 6 6"/>',
  subiu: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  desceu: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
  estavel: '<path d="M5 12h14"/>',
  foto: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10.5" r="1.8"/><path d="M3 16.5 8 12l4 3.5 3-2.5 5 4"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  lixeira: '<path d="M4 7h16"/><path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10.5 11v6M13.5 11v6"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  gota: '<path d="M12 3s5.5 6 5.5 10a5.5 5.5 0 0 1-11 0C6.5 9 12 3 12 3z"/>',
  pilula: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.5 8.5 15.5 15.5"/>',
  descanso: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  escudo: '<path d="M12 2.5 20 6v6c0 5-3.4 8.4-8 9.5-4.6-1.1-8-4.5-8-9.5V6z"/><path d="M9 12.5l2 2 4-4"/>',
  rotacao: '<path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2"/><path d="M18 3v3.5h-3.5M6 21v-3.5h3.5"/>',
  balanca: '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/><path d="M12 7v1"/>'
};

export function icone(nome, classe) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (classe) svg.setAttribute('class', classe);
  svg.innerHTML = CAMINHOS[nome] || CAMINHOS.info;
  return svg;
}

/* ===================== formatação ===================== */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** '2026-04-04' -> '04/04/2026' */
export function dataBR(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : iso;
}

/** '2026-04-04' -> '4 de abr 2026' */
export function dataCurta(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`;
}

/** '2026-04-04' -> 'abr/26' */
export function mesAno(iso) {
  const [a, m] = iso.slice(0, 10).split('-');
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
}

export function dataLonga(data) {
  return `${DIAS[data.getDay()]}, ${data.getDate()} de ${MESES[data.getMonth()]}`;
}

/** Número no padrão pt-BR com N casas. */
export function nb(valor, casas = 1) {
  if (valor == null || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function idadeEm(nascimentoISO, ref = new Date()) {
  const [a, m, d] = nascimentoISO.slice(0, 10).split('-').map(Number);
  let idade = ref.getFullYear() - a;
  const mesAtual = ref.getMonth() + 1;
  if (mesAtual < m || (mesAtual === m && ref.getDate() < d)) idade--;
  return idade;
}

/* ===================== componentes ===================== */

export function cabecalhoPagina({ kicker, titulo, subtitulo, acoes }) {
  return h('header.pagina-cabecalho', null,
    kicker && h('p.pagina-kicker', { texto: kicker }),
    h('div.linha', null,
      h('h1.esticar', { texto: titulo }),
      acoes || null
    ),
    subtitulo && h('p.subtitulo', { texto: subtitulo })
  );
}

export function chip(texto, nivel, nomeIcone) {
  return h('span.chip', { dataset: nivel ? { nivel } : {} },
    nomeIcone && icone(nomeIcone),
    texto
  );
}

export function aviso({ nivel = 'info', titulo, texto, data, itens }) {
  const mapaIcone = { ok: 'ok', atencao: 'alerta', critico: 'alerta', info: 'info' };
  return h('div.aviso', { dataset: { nivel } },
    h('span.aviso-icone', null, icone(mapaIcone[nivel] || 'info')),
    h('div.aviso-corpo', null,
      titulo && h('strong', { texto: titulo }),
      texto && h('p', { texto }),
      itens && itens.length ? lista(itens) : null,
      data && h('p.aviso-data', { texto: dataBR(data) })
    )
  );
}

export function lista(itens, classe = 'lista') {
  return h(`ul.${classe}`, null, itens.map((i) => h('li', null, typeof i === 'string' ? i : i.texto || String(i))));
}

export function cartaoMetrica({ label, valor, unidade, nota, nivel, tendencia, bom }) {
  return h('div.metrica', { dataset: nivel ? { nivel } : {} },
    h('div.metrica-label', { texto: label }),
    h('div.metrica-valor', null,
      h('b', { texto: String(valor) }),
      unidade && h('span', { texto: unidade }),
      tendencia && h('span.tendencia', { dataset: { dir: tendencia, bom: bom == null ? 'neutro' : String(bom) } },
        icone(tendencia === 'alta' ? 'subiu' : tendencia === 'baixa' ? 'desceu' : 'estavel'))
    ),
    nota && h('div.metrica-nota', { texto: nota })
  );
}

export function cartaoNavegacao({ titulo, descricao, rota, icone: nomeIcone, aoClicar }) {
  return h('button.nav-card', {
    type: 'button',
    onClick: aoClicar || (() => { location.hash = rota; })
  },
    h('span.nav-card-icone', null, icone(nomeIcone || 'seta')),
    h('span.nav-card-texto', null,
      h('strong', { texto: titulo }),
      descricao && h('span', { texto: descricao })
    ),
    h('span.nav-card-seta', null, icone('seta'))
  );
}

export function secao(titulo, ...filhos) {
  return h('section.secao', null,
    titulo && h('div.secao-cabecalho', null, h('h2', { texto: titulo })),
    ...filhos
  );
}

export function card(...filhos) {
  return h('div.card', null, ...filhos);
}

export function cardTitulado(titulo, ...filhos) {
  return h('div.card', null,
    h('h3.card-titulo', { texto: titulo }),
    ...filhos
  );
}

/** Controle segmentado de sub-abas. */
export function segmentos(itens, ativo, aoTrocar) {
  return h('div.segmentos', { role: 'tablist' },
    itens.map((it) => h('button.segmento', {
      type: 'button', role: 'tab',
      'aria-selected': String(it.id === ativo),
      onClick: () => aoTrocar(it.id)
    }, it.nome))
  );
}

/** Tabela a partir de colunas + linhas. */
export function tabela(colunas, linhas, opcoes = {}) {
  const thead = h('thead', null, h('tr', null,
    colunas.map((c) => h('th', { class: c.classe || '', texto: c.nome || c }))
  ));
  const tbody = h('tbody', null,
    linhas.map((linha) => h('tr', { dataset: linha.dataset || {} },
      (linha.celulas || linha).map((cel, i) => {
        const c = colunas[i] || {};
        const conteudo = cel && typeof cel === 'object' && !(cel instanceof Node) ? cel.valor : cel;
        const td = h('td', { class: c.classe || '' });
        if (conteudo instanceof Node) td.append(conteudo);
        else if (conteudo === 0 || conteudo === '0') td.append(h('span.zero', { texto: opcoes.zero || '—' }));
        else td.textContent = conteudo == null || conteudo === '' ? '—' : String(conteudo);
        return td;
      })
    ))
  );
  return h('div.tabela-wrap', null, h('table', null, thead, tbody));
}

export function definicoes(pares) {
  return h('dl.def', null, pares.filter(Boolean).map(([rotulo, valor, nota]) =>
    h('div.def-linha', null,
      h('dt', { texto: rotulo }),
      h('dd', null, String(valor), nota && h('small', { texto: nota }))
    )
  ));
}

export function barraMacro(nome, valor, max, unidade, cor) {
  const perc = max ? Math.min(100, Math.round((valor / max) * 100)) : 0;
  return h('div.macro-linha', null,
    h('span.macro-nome', { texto: nome }),
    h('span.barra', { estilo: cor ? { '--barra-c': cor } : {} }, h('i', { estilo: { width: perc + '%' } })),
    h('span.macro-valor', { texto: `${valor}${unidade || ''}` })
  );
}

/**
 * Seletor do dia que está sendo registrado. Existe porque o registro real
 * mostrou lançamentos em bloco à noite e dois dias que ficaram em branco sem
 * possibilidade de recuperar: sem escolher a data, um dia perdido é perdido.
 */
export function seletorData(dataISO, hoje, aoTrocar) {
  const campo = h('input', {
    type: 'date', value: dataISO, max: hoje, 'aria-label': 'Dia registrado',
    onChange: (e) => { if (e.target.value) aoTrocar(e.target.value); }
  });

  const desloca = (dias) => {
    const d = new Date(dataISO + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    const iso = d.toISOString().slice(0, 10);
    if (iso <= hoje) aoTrocar(iso);
  };

  const ehHoje = dataISO === hoje;
  return h('div.linha', { estilo: { marginBottom: 'var(--sp-3)' } },
    h('button.icon-btn', { type: 'button', 'aria-label': 'Dia anterior', onClick: () => desloca(-1) }, icone('voltar')),
    h('span.esticar', null, campo),
    h('button.icon-btn', {
      type: 'button', 'aria-label': 'Dia seguinte', disabled: ehHoje,
      estilo: ehHoje ? { opacity: '0.35' } : {},
      onClick: () => desloca(1)
    }, icone('seta')),
    ehHoje
      ? h('span.chip', { dataset: { nivel: 'ok' } }, 'hoje')
      : h('button.chip', {
          type: 'button', dataset: { nivel: 'atencao' }, estilo: { cursor: 'pointer' },
          onClick: () => aoTrocar(hoje)
        }, 'voltar para hoje')
  );
}

export function vazio(texto) {

  return h('p.vazio', { texto });
}

export function carregando(texto = 'Decifrando…') {
  return h('div.carregando', null, h('div.spinner'), texto);
}

/** Realça o termo buscado com <mark>. */
export function realcar(texto, termo) {
  const limpo = termo.trim();
  if (!limpo) return document.createTextNode(texto);
  const partes = limpo.split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${partes.join('|')})`, 'gi');
  const span = document.createElement('span');
  span.innerHTML = texto
    .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
    .replace(re, '<mark>$1</mark>');
  return span;
}

let timerToast = null;
export function toast(mensagem, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = mensagem;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.hidden = true; }, ms);
}
