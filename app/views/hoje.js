// Aba "Hoje" — registrar o que foi feito e ingerido, e ver a orientação
// recalculada a partir disso.

import {
  h, icone, cabecalhoPagina, aviso, chip, card, cartaoNavegacao,
  barraMacro, dataLonga, secao, toast, nb
} from '../ui.js';
import { resumoDia, resumoJanela, suplementosDoDia } from '../motor.js';

const CORES_MACRO = { p: 'var(--c-nutricao)', g: 'var(--c-atencao)', c: 'var(--c-treino)' };

export async function render(ctx) {
  const { store, registro } = ctx;
  const [perfil, treinos, nutricao, pedal] = await store.docs('perfil', 'treinos', 'nutricao', 'pedal');
  const dados = { perfil, treinos, nutricao, pedal };

  const dia = resumoDia(dados, registro);
  const jan = resumoJanela(dados, registro);

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: dataLonga(new Date()),
    titulo: saudacao(perfil.pessoa.primeiroNome),
    subtitulo: resumoTexto(dia, jan)
  }));

  raiz.append(blocoRegistro(dia, jan, dados, ctx));

  for (const o of dia.orientacoes.filter((x) => x.nivel !== 'info')) {
    raiz.append(h('div.mt-2', null, aviso(o)));
  }

  raiz.append(blocoTreinoDoDia(dia, jan, ctx));
  raiz.append(blocoNutricao(dia, ctx));
  raiz.append(blocoSuplementos(dia, nutricao, ctx));

  const infos = dia.orientacoes.filter((x) => x.nivel === 'info');
  if (infos.length) {
    raiz.append(secao('Lembretes do dia', h('div.pilha-2', null, infos.map((o) => aviso(o)))));
  }

  raiz.append(blocoJanela(jan, ctx));

  const alertasPerfil = perfil.alertas || [];
  if (alertasPerfil.length) {
    raiz.append(secao('Atenção contínua', h('div.pilha-2', null, alertasPerfil.map(avisoNavegavel))));
  }

  raiz.append(secao('Consultar', h('div.grade.grade-2', null, (perfil.atalhos || []).map((a) => cartaoNavegacao(a)))));

  return raiz;
}

function saudacao(nome) {
  const hora = new Date().getHours();
  return `${hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'}, ${nome}`;
}

function resumoTexto(dia, jan) {
  if (dia.provisorio) {
    return `Nada registrado hoje. Na janela de ${jan.janelaDias} dias: ${jan.academias.length}/${jan.metaAcademia} academias · ${jan.pedais.length}/${jan.metaPedal} pedais.`;
  }
  const partes = dia.sessoes.map((s) => `Treino ${s.id}`);
  if (dia.atividades.some((a) => a.tipo === 'pedal')) partes.push('pedal');
  if (dia.atividades.some((a) => a.tipo === 'rolo')) partes.push('rolo');
  return `${partes.join(' + ')} · alvo ${dia.tipo.kcal} kcal · ${dia.consumido.kcal} kcal registradas`;
}

/* ===================== registro de atividades ===================== */

function blocoRegistro(dia, jan, dados, ctx) {
  const { registro } = ctx;
  const { treinos } = dados;

  const registrar = (atividade) => {
    registro.registrarAtividade(atividade);
    ctx.recarregar();
  };

  const pedalFeito = dia.atividades.some((a) => a.tipo === 'pedal');
  const sugerida = jan.proxima.escolhida;

  const botaoPedal = h('button.btn.btn-bloco', {
    type: 'button',
    class: 'btn btn-bloco ' + (pedalFeito ? 'btn-secundario' : 'btn-primario'),
    estilo: pedalFeito ? {} : { background: 'var(--c-pedal)' },
    onClick: () => registrar({ tipo: 'pedal', duracaoMin: dados.pedal.plano.duracaoMin, zona: dados.pedal.plano.zona })
  }, icone('pedal'), pedalFeito ? 'Registrar outro pedal' : 'Pedalei');

  const seletorSessao = h('select', { 'aria-label': 'Qual série' },
    treinos.sessoes.map((s) => h('option', {
      value: s.id,
      selected: sugerida && sugerida.sessao.id === s.id
    }, `${s.id} — ${s.nome}`))
  );

  const botaoAcademia = h('button.btn.btn-primario', {
    type: 'button',
    estilo: { background: 'var(--c-treino)' },
    onClick: () => registrar({ tipo: 'academia', sessao: seletorSessao.value })
  }, icone('treino'), 'Malhei');

  const feitasHoje = dia.atividades.length
    ? h('div.mt-3', null,
        h('p.legenda', { texto: 'Registrado hoje:' }),
        h('div.pilha-2.mt-2', null, dia.atividades.map((a) => h('div.linha', null,
          chip(rotuloAtividade(a, treinos), a.tipo === 'pedal' ? 'atencao' : 'accent',
            a.tipo === 'pedal' ? 'pedal' : a.tipo === 'rolo' ? 'pedal' : 'treino'),
          h('span.esticar'),
          h('button.icon-btn', {
            type: 'button', 'aria-label': 'Desfazer este registro', title: 'Desfazer',
            onClick: () => { registro.removerAtividade(a.id); toast('Registro desfeito.'); ctx.recarregar(); }
          }, icone('voltar'))
        )))
      )
    : null;

  return h('div.card', { estilo: { '--accent': 'var(--c-hoje)' } },
    h('h2.card-titulo', null, icone('lista'), ' O que você fez hoje?'),
    h('p.legenda', { texto: 'Registre a cada execução — as orientações abaixo se ajustam ao que entrar aqui.' }),
    h('div.grade.grade-2.mt-3', null,
      botaoPedal,
      h('div', null,
        h('div.linha', null, h('span.esticar', null, seletorSessao), botaoAcademia)
      )
    ),
    h('button.btn.btn-fantasma.mt-2', {
      type: 'button',
      onClick: () => registrar({ tipo: 'rolo', duracaoMin: dados.pedal.plano.rolo.duracaoMin })
    }, icone('pedal'), 'Fiz rolo (sweet spot)'),
    feitasHoje
  );
}

function rotuloAtividade(a, treinos) {
  if (a.tipo === 'pedal') return `Pedal ${a.zona || ''} ${a.duracaoMin ? a.duracaoMin + ' min' : ''}`.trim();
  if (a.tipo === 'rolo') return `Rolo ${a.duracaoMin ? a.duracaoMin + ' min' : ''}`.trim();
  const s = treinos.sessoes.find((x) => x.id === a.sessao);
  return s ? `Treino ${s.id} — ${s.nome}` : `Treino ${a.sessao}`;
}

/* ===================== treino ===================== */

function blocoTreinoDoDia(dia, jan, ctx) {
  const { registro } = ctx;

  // Já treinou hoje: mostra progresso das séries.
  if (dia.sessoes.length) {
    return h('div.pilha.mt-3', null, dia.sessoes.map((s) => {
      const prog = registro.progressoSessao(s);
      return h('div.card', { estilo: { '--accent': 'var(--c-treino)' } },
        h('div.linha', null,
          h('span.nav-card-icone', null, icone('treino')),
          h('div.esticar', null,
            h('h3', { texto: `Treino ${s.id} — ${s.nome}` }),
            h('p.legenda', { texto: s.foco.join(' · ') })
          )
        ),
        h('div.linha.mt-3', null,
          h('span.barra.esticar', { estilo: { '--barra-c': 'var(--c-ok)' } },
            h('i', { estilo: { width: prog.perc + '%' } })),
          h('b.texto-sm.num', { texto: `${prog.feitas}/${prog.total}` })
        ),
        h('button.btn.btn-fantasma.mt-3', {
          type: 'button', estilo: { '--accent': 'var(--c-treino)' },
          onClick: () => ctx.navegar(`#/treino/${s.id}`)
        }, 'Abrir a série', icone('seta'))
      );
    }));
  }

  // Ainda não treinou: sugere a próxima.
  const p = jan.proxima;
  if (!p.escolhida) {
    return h('div.mt-3', null, aviso({
      nivel: 'ok',
      titulo: 'Nenhuma sessão liberada agora',
      texto: 'Todas as opções estão bloqueadas por limite clínico ou intervalo de recuperação. Hoje é dia de pedal leve ou descanso.'
    }));
  }

  const s = p.escolhida.sessao;
  const motivos = p.escolhida.bloqueios;

  return h('div.card.mt-3', { estilo: { '--accent': 'var(--c-treino)' } },
    h('div.linha', null,
      h('span.nav-card-icone', null, icone('treino')),
      h('div.esticar', null,
        h('h3', { texto: `Próxima sugerida: ${s.id} — ${s.nome}` }),
        h('p.legenda', { texto: s.foco.join(' · ') })
      )
    ),
    h('div.chip-linha.mt-3', null,
      chip(`${s.exercicios.reduce((a, e) => a + e.series, 0)} séries`, 'accent'),
      chip(`~${s.duracaoMin} min`, null, 'relogio'),
      chip(p.escolhida.categoria)
    ),
    jan.pendencia.completa && h('p.legenda.mt-3', {
      texto: `As 4 sessões já foram feitas na janela de ${jan.janelaDias} dias — esta é a reabertura do ciclo.`
    }),
    motivos.length ? h('p.legenda.mt-2', { texto: 'Ressalva: ' + motivos.map((b) => b.texto).join('; ') + '.' }) : null,
    h('div.grade.grade-2.mt-3', null,
      h('button.btn.btn-primario', {
        type: 'button', estilo: { background: 'var(--c-treino)' },
        onClick: () => { registro.registrarAtividade({ tipo: 'academia', sessao: s.id }); ctx.recarregar(); }
      }, icone('check'), `Registrar ${s.id}`),
      h('button.btn.btn-secundario', {
        type: 'button', onClick: () => ctx.navegar(`#/treino/${s.id}`)
      }, 'Ver a série', icone('seta'))
    )
  );
}

/* ===================== nutrição ===================== */

function blocoNutricao(dia, ctx) {
  const { registro } = ctx;
  const t = dia.tipo;

  const marcar = (r) => { registro.alternarRefeicao(r); ctx.recarregar(); };

  const linhaRestante = (rotulo, valor, unidade) => h('div.def-linha', null,
    h('dt', { texto: rotulo }),
    h('dd', {
      estilo: { color: valor < 0 ? 'var(--c-critico)' : valor === 0 ? 'var(--c-ok)' : 'inherit' },
      texto: `${valor > 0 ? 'faltam ' : valor < 0 ? 'excedeu ' : ''}${Math.abs(valor)}${unidade}`
    })
  );

  return h('div.card.mt-3', { estilo: { '--accent': 'var(--c-nutricao)' } },
    h('div.linha', null,
      h('span.nav-card-icone', null, icone('nutricao')),
      h('div.esticar', null,
        h('h3', { texto: `${t.nome} · alvo ${t.kcal} kcal` }),
        h('p.legenda', {
          texto: dia.provisorio
            ? 'Alvo provisório de descanso — sobe se você registrar uma atividade.'
            : `Derivado do que você registrou hoje.`
        })
      ),
      h('button.icon-btn', {
        type: 'button', 'aria-label': 'Abrir nutrição', onClick: () => ctx.navegar(`#/nutricao/${t.id}`)
      }, icone('seta'))
    ),

    h('div.mt-3', null,
      barraMacro('Calorias', dia.consumido.kcal, t.kcal, ` / ${t.kcal}`, 'var(--c-nutricao)'),
      barraMacro('Proteína', dia.consumido.p, t.proteinaG, ` / ${t.proteinaG} g`, CORES_MACRO.p),
      barraMacro('Gordura', dia.consumido.g, t.gorduraG, ` / ${t.gorduraG} g`, CORES_MACRO.g),
      barraMacro('Carboidrato', dia.consumido.c, t.carboG, ` / ${t.carboG} g`, CORES_MACRO.c)
    ),

    h('h4.mt-4', { texto: 'Falta ingerir' }),
    h('dl.def.mt-2', null,
      linhaRestante('Calorias', dia.restante.kcal, ' kcal'),
      linhaRestante('Proteína', dia.restante.p, ' g'),
      linhaRestante('Carboidrato', dia.restante.c, ' g')
    ),

    h('h4.mt-4', { texto: `Refeições (${t.refeicoes.length - dia.pendentes.length}/${t.refeicoes.length})` }),
    h('div.mt-2', null, t.refeicoes.map((r) => {
      const feita = registro.refeicaoFeita(r.id);
      return h('button.check-item', {
        type: 'button', dataset: { feito: String(feita) }, onClick: () => marcar(r)
      },
        h('span.check-box', null, icone('check')),
        h('span.check-texto', null,
          h('strong', null, `${r.hora} · ${r.nome}`, r.tag ? h('span', null, ' ', chip(r.tag, 'accent')) : null),
          h('span', { texto: r.itens }),
          h('span.texto-xs', { texto: `~${r.macros.kcal} kcal · P${r.macros.p} G${r.macros.g} C${r.macros.c}` })
        )
      );
    })),
    h('p.legenda.mt-3', { texto: 'Macros por refeição são estimativa a partir das quantidades do plano, normalizadas para fechar o total do dia.' })
  );
}

/* ===================== suplementos ===================== */

function blocoSuplementos(dia, nutricao, ctx) {
  const { registro } = ctx;
  const lista = suplementosDoDia(nutricao.suplementos, dia);
  if (!lista.length) return h('div');

  const feitos = () => lista.filter((s) => registro.suplementoTomado(s.nome)).length;
  const contador = h('span.chip', { dataset: { nivel: feitos() === lista.length ? 'ok' : 'accent' } },
    `${feitos()}/${lista.length}`);

  const itens = lista.map((s) => {
    const item = h('button.check-item', {
      type: 'button',
      dataset: { feito: String(registro.suplementoTomado(s.nome)) },
      onClick: () => {
        item.dataset.feito = String(registro.alternarSuplemento(s.nome));
        contador.textContent = `${feitos()}/${lista.length}`;
        contador.dataset.nivel = feitos() === lista.length ? 'ok' : 'accent';
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
    h('p.legenda', {
      texto: dia.sessoes.length
        ? 'Lista já ajustada ao treino registrado hoje.'
        : 'Só os de uso diário — registrar um treino acrescenta whey, caseína e (em B/D) colágeno.'
    }),
    h('div.mt-2', null, itens)
  );
}

/* ===================== janela móvel ===================== */

function blocoJanela(jan, ctx) {
  const anelPedal = `${jan.pedais.length}/${jan.metaPedal}`;
  const anelAcad = `${jan.academias.length}/${jan.metaAcademia}`;

  return h('section.secao', null,
    h('div.secao-cabecalho', null,
      h('h2', null, icone('historico'), ` Últimos ${jan.janelaDias} dias`),
      h('button.btn.btn-fantasma', { type: 'button', onClick: () => ctx.navegar('#/semana') }, 'Detalhes', icone('seta'))
    ),
    h('div.grade.grade-3', null,
      h('div.metrica', { dataset: { nivel: jan.faltamAcademia ? 'atencao' : 'ok' } },
        h('div.metrica-label', { texto: 'Academia' }),
        h('div.metrica-valor', null, h('b', { texto: anelAcad })),
        h('div.metrica-nota', { texto: jan.faltamAcademia ? `faltam ${jan.faltamAcademia}` : 'meta batida' })
      ),
      h('div.metrica', { dataset: { nivel: jan.faltamPedal ? 'atencao' : 'ok' } },
        h('div.metrica-label', { texto: 'Pedal' }),
        h('div.metrica-valor', null, h('b', { texto: anelPedal })),
        h('div.metrica-nota', { texto: jan.faltamPedal ? `faltam ${jan.faltamPedal}` : 'meta batida' })
      ),
      h('div.metrica', null,
        h('div.metrica-label', { texto: 'Rolo' }),
        h('div.metrica-valor', null, h('b', { texto: `${jan.rolos.length}/${jan.metaRolo}` })),
        h('div.metrica-nota', { texto: 'sweet spot' })
      )
    ),
    jan.alertas.length
      ? h('div.pilha-2.mt-3', null, jan.alertas.map((a) => aviso(a)))
      : null,
    !jan.pendencia.completa
      ? h('p.legenda.mt-3', { texto: `Faltam nesta janela, em ordem de prioridade: ${jan.pendencia.restantes.join(', ')}.` })
      : null
  );
}

/* ===================== auxiliares ===================== */

function avisoNavegavel(a) {
  const el = aviso({ nivel: a.nivel, titulo: a.titulo, texto: a.texto, data: a.desde });
  if (a.link) {
    el.style.cursor = 'pointer';
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    const ir = () => { location.hash = a.link; };
    el.addEventListener('click', ir);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); }
    });
  }
  return el;
}
