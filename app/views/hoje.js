// Aba "Hoje" — monta o dia a partir da agenda + série + plano nutricional.

import { h, icone, cabecalhoPagina, aviso, chip, card, cartaoNavegacao, barraMacro, dataLonga, secao } from '../ui.js';
import { planoDoDia, volumeSessao } from '../store.js';

const CORES_MACRO = { p: 'var(--c-nutricao)', g: 'var(--c-atencao)', c: 'var(--c-treino)' };

export async function render(ctx) {
  const { store, diario } = ctx;
  const [perfil, treinos, nutricao] = await store.docs('perfil', 'treinos', 'nutricao');
  const plano = planoDoDia(perfil, treinos, nutricao);

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: dataLonga(plano.data),
    titulo: saudacao(perfil.pessoa.primeiroNome),
    subtitulo: resumoDoDia(plano)
  }));

  raiz.append(cartaoDoDia(plano, diario, ctx));

  if (plano.dia.pedal) raiz.append(cartaoPedal(plano, ctx));

  if (plano.tipoDia) raiz.append(cartaoNutricao(plano.tipoDia, ctx));

  const doDia = suplementosDoDia(nutricao.suplementos, plano);
  if (doDia.length) raiz.append(cartaoSuplementos(doDia, diario, ctx));

  const alertas = perfil.alertas || [];
  if (alertas.length) {
    raiz.append(secao('Atenção contínua',
      h('div.pilha-2', null, alertas.map((a) => avisoNavegavel(a)))
    ));
  }

  raiz.append(secao('Semana', tabelaSemana(perfil, treinos, plano)));

  raiz.append(secao('Consultar',
    h('div.grade.grade-2', null, (perfil.atalhos || []).map((a) => cartaoNavegacao(a)))
  ));

  return raiz;
}

function saudacao(nome) {
  const hora = new Date().getHours();
  const parte = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  return `${parte}, ${nome}`;
}

function resumoDoDia(plano) {
  const partes = [];
  if (plano.sessao) partes.push(`Treino ${plano.sessao.id} — ${plano.sessao.nome}`);
  if (plano.dia.pedal) partes.push(`pedal ${plano.dia.pedal}`);
  if (!partes.length) partes.push('Dia de descanso');
  if (plano.tipoDia) partes.push(`${plano.tipoDia.kcal} kcal`);
  return partes.join(' · ');
}

function cartaoDoDia(plano, diario, ctx) {
  if (!plano.sessao) {
    return card(
      h('div.linha', null,
        h('span.nav-card-icone', { estilo: { '--accent': 'var(--c-geral)' } }, icone('descanso')),
        h('div.esticar', null,
          h('h2', { texto: plano.dia.pedal ? 'Sem academia hoje' : 'Descanso' }),
          h('p.legenda', { texto: plano.calendario ? plano.calendario.logica : 'Recuperação.' })
        )
      )
    );
  }

  const s = plano.sessao;
  const vol = volumeSessao(s);
  const prog = diario.progressoSessao(s);

  return h('div.card', { estilo: { '--accent': 'var(--c-treino)' } },
    h('div.linha', null,
      h('span.nav-card-icone', null, icone('treino')),
      h('div.esticar', null,
        h('h2', { texto: `Treino ${s.id} — ${s.nome}` }),
        h('p.legenda', { texto: `${s.foco.join(' · ')}` })
      )
    ),
    h('div.chip-linha.mt-3', null,
      chip(`${vol.total} séries`, 'accent'),
      chip(`${s.exercicios.length} exercícios`),
      chip(`~${s.duracaoMin} min`, null, 'relogio'),
      s.ativacao && chip('Ativação de ombro', 'info')
    ),
    prog.feitas > 0 && h('div.linha.mt-3', null,
      h('span.barra.esticar', { estilo: { '--barra-c': 'var(--c-ok)' } },
        h('i', { estilo: { width: prog.perc + '%' } })),
      h('b.texto-sm.num', { texto: `${prog.feitas}/${prog.total}` })
    ),
    h('button.btn.btn-primario.btn-bloco.mt-3', {
      type: 'button',
      estilo: { background: 'var(--c-treino)' },
      onClick: () => ctx.navegar(`#/treino/${s.id}`)
    }, prog.feitas > 0 ? 'Continuar o treino' : 'Abrir o treino', icone('seta'))
  );
}

function cartaoPedal(plano, ctx) {
  return h('div.card', { estilo: { '--accent': 'var(--c-pedal)' } },
    h('div.linha', null,
      h('span.nav-card-icone', null, icone('pedal')),
      h('div.esticar', null,
        h('h3', { texto: `Pedal ${plano.dia.pedal}` }),
        h('p.legenda', { texto: '2h · zona 2 · 7h às 9h · malto 60–70 g/h + água com sódio' })
      ),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Abrir pedal', onClick: () => ctx.navegar('#/pedal') }, icone('seta'))
    ),
    h('div.aviso.mt-3', { dataset: { nivel: 'atencao' } },
      h('span.aviso-icone', null, icone('alerta')),
      h('div.aviso-corpo', null,
        h('strong', { texto: 'Luvas com padding ulnar são obrigatórias' }),
        h('p', { texto: 'Proteção do nervo ulnar. Whey 30 g + banana em até 30 min após desmontar.' })
      )
    )
  );
}

function cartaoNutricao(tipo, ctx) {
  const maxKcal = 3500;
  return h('div.card', { estilo: { '--accent': 'var(--c-nutricao)' } },
    h('div.linha', null,
      h('span.nav-card-icone', null, icone('nutricao')),
      h('div.esticar', null,
        h('h3', { texto: `${tipo.nome} · ${tipo.kcal} kcal` }),
        h('p.legenda', { texto: tipo.descricao })
      ),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Abrir nutrição', onClick: () => ctx.navegar(`#/nutricao/${tipo.id}`) }, icone('seta'))
    ),
    h('div.mt-3', null,
      barraMacro('Proteína', tipo.proteinaG, 200, ' g', CORES_MACRO.p),
      barraMacro('Gordura', tipo.gorduraG, 100, ' g', CORES_MACRO.g),
      barraMacro('Carboidrato', tipo.carboG, 560, ' g', CORES_MACRO.c),
      barraMacro('Calorias', tipo.kcal, maxKcal, ' kcal', 'var(--c-nutricao)')
    ),
    h('div.mt-3', null,
      tipo.refeicoes.slice(0, 4).map((r) => h('div.refeicao', null,
        h('span.refeicao-hora', { texto: r.hora }),
        h('div.refeicao-corpo', null,
          h('div.refeicao-nome', null, r.nome, r.tag && chip(r.tag, 'accent'), r.novo && chip('novo', 'ok')),
          h('div.refeicao-itens', { texto: r.itens })
        )
      )),
      tipo.refeicoes.length > 4 && h('button.btn.btn-fantasma.mt-2', {
        type: 'button', onClick: () => ctx.navegar(`#/nutricao/${tipo.id}`)
      }, `Ver as ${tipo.refeicoes.length} refeições`, icone('seta'))
    )
  );
}

/**
 * Filtra os suplementos que se aplicam ao dia: os diários sempre; os de dia de
 * treino quando há academia; o colágeno só antes dos Treinos B e D.
 */
function suplementosDoDia(suplementos, plano) {
  const temTreino = Boolean(plano.sessao);
  const ehBD = temTreino && ['B', 'D'].includes(plano.sessao.id);
  return suplementos.filter((s) => {
    if (s.frequencia === 'treino') return temTreino;
    if (s.frequencia === 'treinoBD') return ehBD;
    return s.frequencia === 'diario' || s.critico;
  });
}

function cartaoSuplementos(suplementos, diario, ctx) {
  const feitos = () => suplementos.filter((s) => diario.marcado('suplementos', s.nome)).length;
  const contador = h('span.chip', { dataset: { nivel: feitos() === suplementos.length ? 'ok' : 'accent' } },
    `${feitos()}/${suplementos.length}`);

  const itens = suplementos.map((s) => {
    const item = h('button.check-item', {
      type: 'button',
      dataset: { feito: String(diario.marcado('suplementos', s.nome)) },
      onClick: () => {
        const novo = diario.alternar('suplementos', s.nome);
        item.dataset.feito = String(novo);
        contador.textContent = `${feitos()}/${suplementos.length}`;
        contador.dataset.nivel = feitos() === suplementos.length ? 'ok' : 'accent';
      }
    },
      h('span.check-box', null, icone('check')),
      h('span.check-texto', null,
        h('strong', null, s.nome, ' ', h('span.texto-3.texto-sm', { texto: s.dose })),
        h('span', { texto: s.quando })
      ),
      s.critico ? chip('obrigatório', 'critico') : null
    );
    return item;
  });

  return h('section.secao', null,
    h('div.secao-cabecalho', null,
      h('h2', null, icone('pilula'), ' Suplementos de hoje'),
      contador
    ),
    h('div', null, itens),
    h('button.btn.btn-fantasma.mt-2', {
      type: 'button', estilo: { '--accent': 'var(--c-nutricao)' },
      onClick: () => ctx.navegar('#/nutricao/suplementos')
    }, 'Ver protocolo completo', icone('seta'))
  );
}

function avisoNavegavel(a) {
  const el = aviso({ nivel: a.nivel, titulo: a.titulo, texto: a.texto, data: a.desde });
  if (a.link) {
    el.style.cursor = 'pointer';
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    const ir = () => { location.hash = a.link.replace(/^#/, '#'); };
    el.addEventListener('click', ir);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } });
  }
  return el;
}

function tabelaSemana(perfil, treinos, plano) {
  const hoje = plano.dia.diaSemana;
  const linhas = perfil.agenda.dias
    .slice()
    .sort((a, b) => ((a.diaSemana + 6) % 7) - ((b.diaSemana + 6) % 7))
    .map((d) => {
      const s = d.treino ? treinos.sessoes.find((x) => x.id === d.treino) : null;
      return {
        dataset: d.diaSemana === hoje ? { destaque: 'true' } : {},
        celulas: [
          d.curto,
          s ? `${s.id} — ${s.nome}` : '—',
          d.pedal || '—',
          d.tipoDia === 'descanso' ? 'Descanso' : d.tipoDia.charAt(0).toUpperCase() + d.tipoDia.slice(1)
        ]
      };
    });

  return h('div', null,
    h('div.tabela-wrap', null,
      h('table', null,
        h('thead', null, h('tr', null,
          h('th', { texto: 'Dia' }), h('th', { texto: 'Academia' }), h('th', { texto: 'Pedal' }), h('th', { texto: 'Dia nutricional' })
        )),
        h('tbody', null, linhas.map((l) => h('tr', { dataset: l.dataset },
          l.celulas.map((c) => h('td', { texto: c }))
        )))
      )
    ),
    h('p.legenda.mt-2', { texto: perfil.agenda.nota })
  );
}
