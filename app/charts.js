// Gráficos em SVG puro — sem bibliotecas externas, funciona offline.
//
// O SVG é desenhado na largura real do contêiner (viewBox em pixels) e
// redesenhado quando o contêiner muda de tamanho. Isso mantém círculos
// redondos e texto sem distorção, o que um viewBox fixo com
// preserveAspectRatio="none" não garante.

import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const ALTURA = 168;

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) el.setAttribute(k, String(v));
  }
  return el;
}

const numeroBR = (v, casas) => (Number.isFinite(v) ? v.toFixed(casas).replace('.', ',') : '—');

/**
 * Gráfico de linha com área, grade, rótulos e seleção de ponto.
 *
 * pontos: [{ x: 'rótulo', y: número }]
 * opcoes: { casas, unidade, piso, indiceAtivo, aoSelecionar }
 */
export function graficoLinha(todosOsPontos, opcoes = {}) {
  // Descarta pontos sem valor numérico: um único buraco na série não deve
  // derrubar o desenho (e o erro aconteceria dentro do ResizeObserver, fora do
  // try/catch do roteador, deixando só uma caixa vazia). O índice original é
  // preservado em `orig` para que aoSelecionar continue apontando para a
  // medição certa mesmo com pontos filtrados.
  const pontos = todosOsPontos
    .map((p, i) => ({ ...p, orig: i }))
    .filter((p) => Number.isFinite(p.y));
  if (!pontos.length) return h('div.grafico', null, h('p.vazio', { texto: 'Sem dados para esta métrica.' }));

  const caixa = h('div.grafico');
  let larguraAnterior = 0;

  const desenhar = () => {
    const largura = Math.max(260, Math.round(caixa.clientWidth || 320));
    larguraAnterior = largura;
    caixa.replaceChildren(desenhaSvg(pontos, opcoes, largura));
  };

  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      const l = Math.round(caixa.clientWidth || 0);
      if (l && Math.abs(l - larguraAnterior) > 4) desenhar();
    });
    ro.observe(caixa);
    // Primeiro desenho: o observer dispara ao conectar, mas garantimos
    // conteúdo mesmo se o elemento for medido fora do fluxo.
    queueMicrotask(() => { if (!caixa.childElementCount) desenhar(); });
  } else {
    queueMicrotask(desenhar);
  }

  return caixa;
}

function desenhaSvg(pontos, opcoes, W) {
  const { casas = 1, piso = null, aoSelecionar } = opcoes;
  // indiceAtivo vem em coordenadas da série original; traduz para a filtrada.
  const alvo = opcoes.indiceAtivo == null ? pontos[pontos.length - 1].orig : opcoes.indiceAtivo;
  const indiceAtivo = Math.max(0, pontos.findIndex((p) => p.orig === alvo));

  const L = 40, R = 12, T = 12, B = 26;
  const H = ALTURA;
  const iw = W - L - R;
  const ih = H - T - B;

  const ys = pontos.map((p) => p.y);
  let min = Math.min(...ys, piso != null ? piso : Infinity);
  let max = Math.max(...ys, piso != null ? piso : -Infinity);
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (min === max) { min -= 1; max += 1; }
  const folga = (max - min) * 0.14;
  min -= folga; max += folga;

  const px = (i) => L + (pontos.length === 1 ? iw / 2 : (i / (pontos.length - 1)) * iw);
  const py = (v) => T + ih - ((v - min) / (max - min)) * ih;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    role: 'img',
    'aria-label': `Evolução em ${pontos.length} medições`
  });
  svg.style.width = '100%';
  svg.style.height = 'auto';

  // grade horizontal + rótulos do eixo Y
  const nLinhas = 3;
  for (let i = 0; i <= nLinhas; i++) {
    const v = min + ((max - min) * i) / nLinhas;
    const y = py(v);
    svg.append(svgEl('line', { class: 'grafico-grid', x1: L, y1: y, x2: W - R, y2: y }));
    const t = svgEl('text', { class: 'grafico-eixo', x: L - 6, y: y + 3.5, 'text-anchor': 'end' });
    t.textContent = numeroBR(v, casas === 0 ? 0 : 1);
    svg.append(t);
  }

  // piso clínico (ex.: BF% mínimo de 11%)
  if (piso != null) {
    svg.append(svgEl('line', { class: 'grafico-piso', x1: L, y1: py(piso), x2: W - R, y2: py(piso) }));
  }

  const d = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');

  if (pontos.length > 1) {
    svg.append(svgEl('path', {
      class: 'grafico-area',
      d: `${d} L${px(pontos.length - 1).toFixed(1)},${T + ih} L${px(0).toFixed(1)},${T + ih} Z`
    }));
  }
  svg.append(svgEl('path', { class: 'grafico-linha', d }));

  pontos.forEach((p, i) => {
    const ativo = i === indiceAtivo;
    svg.append(svgEl('circle', {
      class: ativo ? 'grafico-ponto-ativo' : 'grafico-ponto',
      cx: px(i), cy: py(p.y), r: ativo ? 5 : 3.2
    }));
  });

  // áreas clicáveis generosas para toque (por cima dos pontos)
  const passo = iw / Math.max(1, pontos.length - 1);
  pontos.forEach((p, i) => {
    const hit = svgEl('rect', {
      class: 'grafico-hit',
      x: Math.max(0, px(i) - passo / 2), y: T,
      width: Math.min(W, passo || iw), height: ih,
      role: 'button',
      'aria-label': `${p.x}: ${numeroBR(p.y, casas)}`
    });
    if (aoSelecionar) hit.addEventListener('click', () => aoSelecionar(p.orig));
    svg.append(hit);
  });

  // rótulos do eixo X: primeiro, último e o selecionado
  const mostrar = new Set([0, pontos.length - 1, indiceAtivo]);
  for (const i of [...mostrar].sort((a, b) => a - b)) {
    const p = pontos[i];
    if (!p) continue;
    const t = svgEl('text', {
      class: 'grafico-eixo',
      x: px(i), y: H - 7,
      'text-anchor': i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle'
    });
    t.textContent = p.x;
    svg.append(t);
  }

  return svg;
}

/** Barras horizontais para comparação por grupo. */
export function barrasHorizontais(itens, opcoes = {}) {
  const max = opcoes.max || Math.max(...itens.map((i) => i.valor), 1);
  return h('div.pilha-2', null,
    itens.map((it) => h('div.macro-linha', null,
      h('span.macro-nome', { texto: it.nome }),
      h('span.barra', { estilo: it.cor ? { '--barra-c': it.cor } : {} },
        h('i', { estilo: { width: Math.round((it.valor / max) * 100) + '%' } })),
      h('span.macro-valor', { texto: `${it.valor}${opcoes.unidade || ''}` })
    ))
  );
}
