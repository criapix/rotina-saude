// Aba "Hoje" — registrar o que foi feito e ingerido, e ver a orientação
// recalculada a partir disso.

import {
  h, icone, cabecalhoPagina, aviso, chip, card, cartaoNavegacao,
  barraMacro, dataLonga, dataCurta, secao, toast, nb
} from '../ui.js';
import {
  resumoDia, resumoJanela, suplementosDoDia,
  gastoDaAtividade, bancoCalorico, formatarDuracao, descreverComposicao
} from '../motor.js';
import { abrirCompositor } from './compositor.js';

const CORES_MACRO = { p: 'var(--c-nutricao)', g: 'var(--c-atencao)', c: 'var(--c-treino)' };

export async function render(ctx) {
  const { store, registro } = ctx;
  const [perfil, treinos, nutricao, pedal] = await store.docs('perfil', 'treinos', 'nutricao', 'pedal');
  const dados = { perfil, treinos, nutricao, pedal };

  const dia = resumoDia(dados, registro);
  const jan = resumoJanela(dados, registro);
  const banco = bancoCalorico(dados, registro);

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
  raiz.append(blocoNutricao(dia, banco, nutricao, ctx));
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
  return `${partes.join(' + ')} · gasto ${dia.gasto} kcal · alvo ${dia.alvo.kcal} kcal · ${dia.consumido.kcal} kcal registradas`;
}

/* ===================== registro de atividades ===================== */

const DURACOES_PEDAL = [45, 60, 90, 120, 150, 180, 210, 240, 300];
const DURACOES_ACADEMIA = [45, 60, 75, 90, 105];

function blocoRegistro(dia, jan, dados, ctx) {
  const { registro } = ctx;
  const { treinos, nutricao } = dados;
  const comp = nutricao.compensacao;
  const defPedal = comp.atividades.find((a) => a.id === 'pedal');

  const registrar = (atividade) => {
    registro.registrarAtividade(atividade);
    ctx.recarregar();
  };

  const pedalFeito = dia.atividades.some((a) => a.tipo === 'pedal');
  const sugerida = jan.proxima.escolhida;

  /* --- pedal: perfil + duração, com o gasto estimado ao vivo --- */
  const selPerfil = h('select', { 'aria-label': 'Intensidade do pedal' },
    defPedal.perfis.map((p) => h('option', { value: p.id, selected: Boolean(p.padrao) }, p.nome))
  );
  const selDurPedal = h('select', { 'aria-label': 'Duração do pedal' },
    DURACOES_PEDAL.map((m) => h('option', {
      value: String(m), selected: m === defPedal.duracaoPadraoMin
    }, formatarDuracao(m)))
  );
  const previaPedal = h('b.num');
  const atualizarPrevia = () => {
    const kcal = gastoDaAtividade(
      { tipo: 'pedal', perfil: selPerfil.value, duracaoMin: Number(selDurPedal.value) }, comp);
    previaPedal.textContent = `≈ ${kcal} kcal`;
  };
  selPerfil.addEventListener('change', atualizarPrevia);
  selDurPedal.addEventListener('change', atualizarPrevia);
  atualizarPrevia();

  const botaoPedal = h('button.btn.btn-bloco.btn-primario', {
    type: 'button',
    estilo: { background: 'var(--c-pedal)' },
    onClick: () => registrar({
      tipo: 'pedal',
      perfil: selPerfil.value,
      duracaoMin: Number(selDurPedal.value),
      zona: dados.pedal.plano.zona
    })
  }, icone('pedal'), pedalFeito ? 'Registrar outro pedal' : 'Pedalei');

  /* --- academia: série + duração --- */
  const seletorSessao = h('select', { 'aria-label': 'Qual série' },
    treinos.sessoes.map((s) => h('option', {
      value: s.id,
      selected: sugerida && sugerida.sessao.id === s.id
    }, `${s.id} — ${s.nome}`))
  );
  const selDurAcad = h('select', { 'aria-label': 'Duração do treino' },
    DURACOES_ACADEMIA.map((m) => h('option', {
      value: String(m),
      selected: m === comp.atividades.find((a) => a.id === 'academia').duracaoPadraoMin
    }, formatarDuracao(m)))
  );

  const botaoAcademia = h('button.btn.btn-bloco.btn-primario', {
    type: 'button',
    estilo: { background: 'var(--c-treino)' },
    onClick: () => registrar({
      tipo: 'academia', sessao: seletorSessao.value, duracaoMin: Number(selDurAcad.value)
    })
  }, icone('treino'), 'Malhei');

  const feitasHoje = dia.atividades.length
    ? h('div.mt-4', null,
        h('p.legenda', { texto: 'Registrado hoje — toque no gasto para corrigir pelo ciclocomputador:' }),
        h('div.pilha-2.mt-2', null, dia.atividades.map((a) => linhaAtividade(a, comp, treinos, ctx)))
      )
    : null;

  return h('div.card', { estilo: { '--accent': 'var(--c-hoje)' } },
    h('h2.card-titulo', null, icone('lista'), ' O que você fez hoje?'),
    h('p.legenda', { texto: 'Registre a cada execução com a duração — o alvo do dia é a base de descanso mais o gasto do que entrar aqui.' }),

    h('div.grade.grade-2.mt-3', null,
      h('div.pilha-2', null,
        h('div.linha', null, h('span.esticar', null, selPerfil)),
        h('div.linha', null, h('span.esticar', null, selDurPedal), previaPedal),
        botaoPedal
      ),
      h('div.pilha-2', null,
        h('div.linha', null, h('span.esticar', null, seletorSessao)),
        h('div.linha', null, h('span.esticar', null, selDurAcad),
          h('b.num', { texto: `≈ ${gastoDaAtividade({ tipo: 'academia' }, comp)} kcal` })),
        botaoAcademia
      )
    ),
    feitasHoje
  );
}

/**
 * Uma atividade registrada, com o gasto que ela gerou. O gasto é um campo
 * editável: se o ciclocomputador deu outro número, ele substitui a estimativa.
 */
function linhaAtividade(a, comp, treinos, ctx) {
  const { registro } = ctx;
  const kcal = gastoDaAtividade(a, comp);
  const medido = Number.isFinite(a.kcal);

  const entrada = h('input', {
    type: 'number', min: '0', step: '10', value: String(kcal),
    'aria-label': 'Gasto em kcal',
    estilo: { width: '6.5rem', textAlign: 'right' },
    onChange: (e) => {
      const v = Number(e.target.value);
      registro.atualizarAtividade(a.id, { kcal: Number.isFinite(v) && v > 0 ? Math.round(v) : null });
      toast(Number.isFinite(v) && v > 0 ? 'Gasto corrigido.' : 'Voltou para a estimativa.');
      ctx.recarregar();
    }
  });

  return h('div.linha', null,
    chip(rotuloAtividade(a, treinos), a.tipo === 'academia' ? 'accent' : 'atencao',
      a.tipo === 'academia' ? 'treino' : 'pedal'),
    h('span.esticar'),
    medido ? chip('medido', 'ok') : null,
    entrada,
    h('span.texto-xs.texto-3', { texto: 'kcal' }),
    h('button.icon-btn', {
      type: 'button', 'aria-label': 'Desfazer este registro', title: 'Desfazer',
      onClick: () => { registro.removerAtividade(a.id); toast('Registro desfeito.'); ctx.recarregar(); }
    }, icone('voltar'))
  );
}

function rotuloAtividade(a, treinos) {
  const dur = a.duracaoMin ? ` ${formatarDuracao(a.duracaoMin)}` : '';
  if (a.tipo === 'pedal') return `Pedal ${a.perfil || 'z2'}${dur}`;
  if (a.tipo !== 'academia') return `${a.tipo}${dur}`; // registro antigo de um tipo removido
  const s = treinos.sessoes.find((x) => x.id === a.sessao);
  return s ? `Treino ${s.id}${dur}` : `Treino ${a.sessao}${dur}`;
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

function blocoNutricao(dia, banco, nutricao, ctx) {
  const { registro } = ctx;
  const comp = nutricao.compensacao;
  const alimentos = nutricao.alimentos;
  const t = dia.tipo;
  const alvo = dia.alvo;

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
        h('h3', { texto: `${t.nome} · alvo ${alvo.kcal} kcal` }),
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

    // De onde vem o número: base de um dia parado + o gasto registrado.
    blocoContaDoAlvo(dia, comp),

    h('div.mt-3', null,
      barraMacro('Calorias', dia.consumido.kcal, alvo.kcal, ` / ${alvo.kcal}`, 'var(--c-nutricao)'),
      barraMacro('Proteína', dia.consumido.p, alvo.p, ` / ${alvo.p} g`, CORES_MACRO.p),
      barraMacro('Gordura', dia.consumido.g, alvo.g, ` / ${alvo.g} g`, CORES_MACRO.g),
      barraMacro('Carboidrato', dia.consumido.c, alvo.c, ` / ${alvo.c} g`, CORES_MACRO.c)
    ),

    h('h4.mt-4', { texto: 'Falta ingerir' }),
    h('dl.def.mt-2', null,
      linhaRestante('Calorias', dia.restante.kcal, ' kcal'),
      linhaRestante('Proteína', dia.restante.p, ' g'),
      linhaRestante('Carboidrato', dia.restante.c, ' g')
    ),

    // O reforço do cardápio e o corte pelo teto já saem em dia.orientacoes,
    // renderizadas no topo da página — aqui só o banco, que o motor não avisa.
    banco.saldo > 0 ? blocoBanco(banco, comp) : null,

    h('h4.mt-4', { texto: `Refeições (${t.refeicoes.length - dia.pendentes.length}/${t.refeicoes.length})` }),
    h('div.mt-2', null, t.refeicoes.map((r) => linhaRefeicaoDoDia(r, alimentos, ctx))),

    // Refeições que não estão no cardápio do dia (avulsas ou de outro tipo).
    avulsas(dia, t, alimentos, ctx),

    h('button.btn.btn-fantasma.mt-3', {
      type: 'button',
      onClick: () => abrirCompositor({ alimentos, ctx })
    }, icone('lista'), 'Registrar outra refeição'),

    h('p.legenda.mt-3', { texto: 'Marque para comer como no plano, ou toque no lápis para dizer o que realmente comeu — os macros passam a ser os do que você montou.' })
  );
}

/**
 * Uma refeição do cardápio: marcar como feita (macros do plano) ou personalizar
 * (macros do que foi montado). Quando personalizada, mostra o que foi comido em
 * vez do que estava planejado.
 */
function linhaRefeicaoDoDia(r, alimentos, ctx) {
  const { registro } = ctx;
  const registrada = registro.refeicao(r.id);
  const feita = Boolean(registrada);
  const personalizada = Boolean(registrada && registrada.personalizada);

  const itens = personalizada && registrada.composicao
    ? descreverComposicao(alimentos, registrada.composicao)
    : r.itens;
  const m = personalizada ? registrada : r.macros;

  return h('div.linha', null,
    h('button.check-item.esticar', {
      type: 'button', dataset: { feito: String(feita) },
      onClick: () => { registro.alternarRefeicao(r); ctx.recarregar(); }
    },
      h('span.check-box', null, icone('check')),
      h('span.check-texto', null,
        h('strong', null, `${r.hora} · ${r.nome}`,
          r.tag ? h('span', null, ' ', chip(r.tag, 'accent')) : null,
          r.combustivel ? h('span', null, ' ', chip('combustível', 'atencao')) : null,
          personalizada ? h('span', null, ' ', chip('personalizada', 'info')) : null),
        h('span', { texto: itens }),
        h('span.texto-xs', { texto: `${personalizada ? '' : '~'}${m.kcal} kcal · P${m.p} G${m.g} C${m.c}` })
      )
    ),
    h('button.icon-btn', {
      type: 'button', 'aria-label': `Personalizar ${r.nome}`, title: 'Dizer o que realmente comeu',
      onClick: () => abrirCompositor({
        alimentos, refeicao: r, ctx,
        inicial: personalizada ? registrada.composicao : r.composicao
      })
    }, icone('editor'))
  );
}

/** Refeições registradas que não fazem parte do cardápio do dia. */
function avulsas(dia, tipo, alimentos, ctx) {
  const { registro } = ctx;
  const doCardapio = new Set(tipo.refeicoes.map((r) => r.id));
  const extras = (registro.dia().refeicoes || []).filter((r) => !doCardapio.has(r.id));
  if (!extras.length) return null;

  return h('div.mt-3', null,
    h('h4', { texto: `Fora do cardápio (${extras.length})` }),
    h('div.pilha-2.mt-2', null, extras.map((r) => h('div.linha', null,
      h('div.esticar', null,
        h('strong.texto-sm', null, r.hora ? `${r.hora} · ${r.nome}` : r.nome),
        h('div.texto-xs.texto-3', {
          texto: r.composicao ? descreverComposicao(alimentos, r.composicao) : '—'
        }),
        h('div.texto-xs', { texto: `${r.kcal} kcal · P${r.p} G${r.g} C${r.c}` })
      ),
      r.composicao
        ? h('button.icon-btn', {
            type: 'button', 'aria-label': `Editar ${r.nome}`, title: 'Editar',
            onClick: () => abrirCompositor({
              alimentos, ctx,
              refeicao: { id: r.id, nome: r.nome, hora: r.hora, itens: '', composicao: r.composicao }
            })
          }, icone('editor'))
        : null,
      h('button.icon-btn', {
        type: 'button', 'aria-label': `Remover ${r.nome}`, title: 'Remover',
        onClick: () => { registro.removerRefeicao(r.id); toast('Refeição removida.'); ctx.recarregar(); }
      }, icone('voltar'))
    )))
  );
}

/**
 * A conta que produziu o alvo. Sem isso o número aparece do nada e não dá para
 * conferir contra o ciclocomputador.
 */
function blocoContaDoAlvo(dia, comp) {
  const d = dia.derivado;
  const parcela = (rotulo, valor, cor) => h('div.metrica', { estilo: cor ? { '--accent': cor } : {} },
    h('div.metrica-label', { texto: rotulo }),
    h('div.metrica-valor', null, h('b.num', { texto: String(valor) })),
    h('div.metrica-nota', { texto: 'kcal' })
  );

  return h('div.mt-3', null,
    h('div.grade.grade-3', null,
      parcela('Base (dia parado)', comp.baseKcal),
      parcela('Gasto registrado', d.gasto, 'var(--c-pedal)'),
      parcela(d.noTeto ? `Alvo (teto ${comp.tetoKcalDia})` : 'Alvo de hoje', d.kcal, 'var(--c-nutricao)')
    ),
    h('p.legenda.mt-2', {
      texto: `Proteína (${comp.proteinaFixaG} g) e gordura (${comp.gorduraFixaG} g) são fixas — todo o gasto vira carboidrato: ${comp.baseCarboG} g de base + ${Math.round((d.kcal - comp.baseKcal) / 4)} g do gasto.`
    })
  );
}

/** Saldo a repor nos próximos dias, quando o teto cortou parte do gasto. */
function blocoBanco(banco, comp) {
  return h('div.card.mt-3', { estilo: { '--accent': 'var(--c-atencao)' } },
    h('div.linha', null,
      h('span.nav-card-icone', null, icone('historico')),
      h('div.esticar', null,
        h('h4', { texto: `${banco.titulo}: ${banco.saldo} kcal a repor` }),
        h('p.legenda', { texto: `Gerado ${banco.gerado} kcal · já reposto ${banco.reposto} kcal · janela de ${banco.janelaDias} dias.` })
      )
    ),
    h('p.legenda.mt-2', { texto: banco.descricao }),
    banco.detalhe.length
      ? h('div.chip-linha.mt-2', null, banco.detalhe.map((x) => chip(
          `${dataCurta(x.data)}: gasto ${x.gasto}${x.cortado ? ` · ${x.cortado} pendentes` : ''}${x.acimaDoAlvo ? ` · ${x.acimaDoAlvo} repostas` : ''}`,
          x.cortado > x.acimaDoAlvo ? 'atencao' : 'ok'
        )))
      : null,
    h('p.legenda.mt-2', { texto: comp.banco.nota })
  );
}

/* ===================== suplementos ===================== */

function blocoSuplementos(dia, nutricao, ctx) {
  const { registro } = ctx;
  const lista = suplementosDoDia(nutricao.suplementos, dia, nutricao.orientacoes);
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
    h('div.grade.grade-2', null,
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
