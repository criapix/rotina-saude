// Aba "Comer" — responde a duas perguntas e nada mais:
//   1. o que eu preciso comer agora?
//   2. como eu registro o que comi?
//
// Tudo que é referência (tabela de alimentos, compensação, estratégias, metas)
// fica em Consultar → Nutrição. Aqui só entra o que é do dia de hoje.

import {
  h, icone, ajuda, cabecalhoPagina, aviso, chip, card, secao, toast, dataLonga, dataBR,
  barraMacro, seletorData
} from '../ui.js';
import {
  resumoDia, bancoCalorico, suplementosDoDia,
  proximaRefeicao, horaDaRefeicao, descreverComposicao
} from '../motor.js';
import { hojeISO } from '../store.js';
import { abrirCompositor } from './compositor.js';

const ehData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export async function render(ctx) {
  const { store, registro } = ctx;
  const [perfil, treinos, nutricao, pedal] = await store.docs('perfil', 'treinos', 'nutricao', 'pedal');
  const dados = { perfil, treinos, nutricao, pedal };

  const hoje = hojeISO();
  // A data vem da rota (#/comer/2026-08-05) para poder recuperar um dia perdido.
  const data = ehData(ctx.params[0]) && ctx.params[0] <= hoje ? ctx.params[0] : hoje;
  const deHoje = data === hoje;
  ctx.data = data; // as funções de bloco leem daqui em vez de receber por parâmetro

  const dia = resumoDia(dados, registro, data);
  const alimentos = nutricao.alimentos;
  // Num dia passado, "próxima refeição" não faz sentido: não há relógio correndo.
  const prox = deHoje ? proximaRefeicao(dia) : null;

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: deHoje ? dataLonga(new Date()) : `Registrando ${dataBR(data)}`,
    titulo: 'Comer',
    subtitulo: dia.provisorio
      ? `Alvo provisório de ${dia.alvo.kcal} kcal — registre a atividade em Treinar e ele sobe.`
      : `Alvo de ${dia.alvo.kcal} kcal (base ${nutricao.compensacao.baseKcal} + gasto ${dia.gasto}).`
  }));

  raiz.append(seletorData(data, hoje, (d) => ctx.navegar(`#/comer/${d}`)));
  raiz.append(blocoModo(dia, nutricao, data, ctx));
  raiz.append(barraDoDia(dia));

  // A refeição da vez, em destaque e com as duas ações a um toque.
  if (prox) raiz.append(cartaoProxima(prox, alimentos, ctx));

  raiz.append(listaRefeicoes(dia, prox, alimentos, ctx));
  raiz.append(avulsas(dia, alimentos, ctx));

  raiz.append(blocoFavoritos(alimentos, ctx));

  raiz.append(h('button.btn.btn-secundario.mt-3', {
    type: 'button',
    onClick: () => abrirCompositor({ alimentos, ctx, data })
  }, icone('lista'), 'Registrar algo fora do plano'));

  raiz.append(blocoFecharDia(dia, data, ctx));
  raiz.append(blocoSuplementos(dia, nutricao, ctx));

  // Só os avisos que mudam o que ele vai comer agora.
  const relevantes = dia.orientacoes.filter((o) => o.nivel === 'critico' || o.nivel === 'atencao');
  if (relevantes.length) {
    raiz.append(secao('Atenção hoje', h('div.pilha-2', null, relevantes.map((o) => aviso(o)))));
  }

  const banco = bancoCalorico(dados, registro);
  if (banco.saldo > 0) {
    raiz.append(h('div.mt-3', null, aviso({
      nivel: 'atencao',
      titulo: `${banco.titulo}: ${banco.saldo} kcal a repor`,
      texto: `${nutricao.compensacao.banco.nota} Detalhe em Consultar → Semana.`
    })));
  }

  return raiz;
}

/* ===================== progresso do dia ===================== */

/**
 * Uma linha só, com o que ele precisa saber de cabeça: quanto falta de caloria
 * e de proteína. Os quatro macros completos ficam na lista de refeições.
 */
function barraDoDia(dia) {
  const item = (rotulo, feito, alvo, unidade, cor) => {
    const falta = alvo - feito;
    return h('div', null,
      barraMacro(rotulo, feito, alvo, ` / ${alvo}`, cor),
      h('p.texto-xs.texto-3', {
        texto: falta > 0
          ? `faltam ${falta}${unidade}`
          : falta === 0 ? 'fechado' : `${-falta}${unidade} acima do alvo`
      })
    );
  };

  return h('div.card.card-com-ajuda', { estilo: { '--accent': 'var(--c-nutricao)' } },
    ajuda('Caloria e proteína são o que se acompanha de cabeça. Gordura é fixa e o carboidrato absorve o resto — o detalhe por macro está em cada refeição.',
      'Por que só duas barras'),
    item('Calorias', dia.consumido.kcal, dia.alvo.kcal, ' kcal', 'var(--c-nutricao)'),
    item('Proteína', dia.consumido.p, dia.alvo.p, ' g', 'var(--c-treino)')
  );
}

/* ===================== a refeição da vez ===================== */

function cartaoProxima(r, alimentos, ctx) {
  const { registro } = ctx;

  return h('div.card.mt-3', { estilo: { '--accent': 'var(--c-hoje)' } },
    h('div.linha', null,
      h('span.chip', { dataset: { nivel: r.janelaAnabolica ? 'critico' : 'accent' } },
        r.janelaAnabolica ? 'agora — janela de 30 min' : 'agora'),
      h('span.esticar'),
      h('span.texto-sm.texto-3', { texto: r.hora })
    ),
    h('h2.mt-2', { texto: r.nome }),
    h('p.texto-2.mt-2', { texto: r.itens }),
    h('p.legenda.mt-2', { texto: `${r.macros.kcal} kcal · P${r.macros.p} G${r.macros.g} C${r.macros.c}` }),

    h('div.grade.grade-2.mt-3', null,
      h('button.btn.btn-primario', {
        type: 'button',
        onClick: () => { registro.alternarRefeicao(r, ctx.data); toast('Registrado.'); ctx.recarregar(); }
      }, icone('check'), 'Comi isso'),
      h('button.btn.btn-secundario', {
        type: 'button',
        onClick: () => abrirCompositor({ alimentos, refeicao: r, ctx, data: ctx.data })
      }, icone('editor'), 'Comi outra coisa')
    ),

    r.trocas && r.trocas.length
      ? h('details.mt-3', null,
          h('summary.legenda', { texto: 'Trocas equivalentes' }),
          h('ul.lista.mt-2', null, r.trocas.map((t) => h('li', { texto: t })))
        )
      : null
  );
}

/* ===================== as demais refeições ===================== */

function listaRefeicoes(dia, prox, alimentos, ctx) {
  const { registro } = ctx;
  const restantes = dia.tipo.refeicoes.filter((r) => !prox || r.id !== prox.id);
  const feitas = dia.tipo.refeicoes.length - dia.pendentes.length;

  return secao(`Refeições do dia (${feitas}/${dia.tipo.refeicoes.length})`,
    h('div.pilha-2', null, restantes.map((r) => {
      const registrada = registro.refeicao(r.id, ctx.data);
      const feita = Boolean(registrada);
      const personalizada = Boolean(registrada && registrada.personalizada);
      const itens = personalizada && registrada.composicao
        ? descreverComposicao(alimentos, registrada.composicao)
        : r.itens;
      const m = personalizada ? registrada : r.macros;

      return h('div.linha', null,
        h('button.check-item.esticar', {
          type: 'button', dataset: { feito: String(feita) },
          onClick: () => { registro.alternarRefeicao(r, ctx.data); ctx.recarregar(); }
        },
          h('span.check-box', null, icone('check')),
          h('span.check-texto', null,
            h('strong', null, `${r.hora} · ${r.nome}`,
              personalizada ? h('span', null, ' ', chip('personalizada', 'info')) : null),
            h('span', { texto: itens }),
            h('span.texto-xs', { texto: `${personalizada ? '' : '~'}${m.kcal} kcal · P${m.p} G${m.g} C${m.c}` })
          )
        ),
        h('button.icon-btn', {
          type: 'button', 'aria-label': `Personalizar ${r.nome}`, title: 'Comi outra coisa',
          onClick: () => abrirCompositor({
            alimentos, refeicao: r, ctx, data: ctx.data,
            inicial: personalizada ? registrada.composicao : r.composicao
          })
        }, icone('editor'))
      );
    }))
  );
}

/** Refeições registradas que não fazem parte do cardápio do dia. */
function avulsas(dia, alimentos, ctx) {
  const { registro } = ctx;
  const doCardapio = new Set(dia.tipo.refeicoes.map((r) => r.id));
  const extras = (registro.dia(ctx.data).refeicoes || []).filter((r) => !doCardapio.has(r.id));
  if (!extras.length) return h('div');

  return secao(`Fora do cardápio (${extras.length})`,
    h('div.pilha-2', null, extras.map((r) => h('div.linha', null,
      h('div.esticar', null,
        h('strong.texto-sm', { texto: r.hora ? `${r.hora} · ${r.nome}` : r.nome }),
        h('div.texto-xs.texto-3', {
          texto: r.composicao ? descreverComposicao(alimentos, r.composicao) : '—'
        }),
        h('div.texto-xs', { texto: `${r.kcal} kcal · P${r.p} G${r.g} C${r.c}` })
      ),
      r.composicao
        ? h('button.icon-btn', {
            type: 'button', 'aria-label': `Editar ${r.nome}`, title: 'Editar',
            onClick: () => abrirCompositor({
              alimentos, ctx, data: ctx.data,
              refeicao: { id: r.id, nome: r.nome, hora: r.hora, itens: '', composicao: r.composicao }
            })
          }, icone('editor'))
        : null,
      h('button.icon-btn', {
        type: 'button', 'aria-label': `Remover ${r.nome}`, title: 'Remover',
        onClick: () => { registro.removerRefeicao(r.id, ctx.data); toast('Removida.'); ctx.recarregar(); }
      }, icone('lixeira'))
    )))
  );
}

/* ===================== favoritos e repetir ===================== */

/**
 * Atalhos para o que ele já come. O registro real trouxe o mesmo café da manhã
 * quatro vezes, idêntico — remontar item por item era o maior atrito do app.
 */
function blocoFavoritos(alimentos, ctx) {
  const { registro } = ctx;
  const favs = registro.favoritos();
  const ontem = diaAnterior(ctx.data);
  const doOntem = (registro.dia(ontem).refeicoes || []).filter((r) => r.composicao);

  if (!favs.length && !doOntem.length) {
    return h('div.linha.mt-3', null,
      h('span.legenda.esticar', { texto: 'Nada para repetir ainda.' }),
      ajuda('Ao personalizar uma refeição no compositor, dá para salvá-la como favorita. Ela passa a aparecer aqui como um chip, e um toque lança a refeição inteira no dia. As refeições compostas de ontem também aparecem.',
        'Repetir refeições')
    );
  }

  const repetir = (r, nome) => {
    registro.salvarRefeicao({
      id: r.id && !r.id.startsWith('livre-') ? r.id : undefined,
      nome: nome || r.nome,
      hora: r.hora,
      composicao: r.composicao,
      macros: { p: r.p ?? r.macros.p, g: r.g ?? r.macros.g, c: r.c ?? r.macros.c, kcal: r.kcal ?? r.macros.kcal },
      doPlano: Boolean(r.doPlano)
    }, ctx.data);
    toast(`${nome || r.nome} registrada.`);
    ctx.recarregar();
  };

  return secao('Repetir',
    card(
      favs.length
        ? h('div', null,
            h('h4', { texto: 'Favoritas' }),
            h('div.chip-linha.mt-2', null, favs.map((f) => h('button.chip', {
              type: 'button', dataset: { nivel: 'accent' }, estilo: { cursor: 'pointer' },
              title: `${f.macros.kcal} kcal · P${f.macros.p} G${f.macros.g} C${f.macros.c}`,
              onClick: () => repetir({ ...f, ...f.macros, composicao: f.composicao }, f.nome)
            }, `+ ${f.nome}`))),
            ajuda('Toque num chip para lançar a refeição no dia. Para remover uma favorita, abra-a no compositor e salve de novo com outro nome — o nome igual substitui.', 'Como usar as favoritas')
          )
        : null,
      doOntem.length
        ? h('div.mt-3', null,
            h('h4', { texto: `De ${dataBR(ontem)}` }),
            h('div.chip-linha.mt-2', null, doOntem.map((r) => h('button.chip', {
              type: 'button', dataset: { nivel: 'info' }, estilo: { cursor: 'pointer' },
              title: `${r.kcal} kcal · P${r.p} G${r.g} C${r.c}`,
              onClick: () => repetir(r)
            }, `+ ${r.nome}`)))
          )
        : null
    )
  );
}

function diaAnterior(dataISO) {
  const d = new Date(dataISO + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ===================== modo do dia ===================== */

/**
 * Alterna entre o cardápio de 5 refeições com hora marcada e o modo tranquilo,
 * de 3 sem horário. É marcação do usuário, não do calendário: o app nunca
 * deduziu nada de dia da semana. O alvo calórico não muda — só o cardápio.
 */
function blocoModo(dia, nutricao, data, ctx) {
  const mt = nutricao.modoTranquilo;
  if (!mt) return h('div');
  const { registro } = ctx;
  const ligado = dia.tranquilo;

  return h('div.card.card-com-ajuda.mt-3', {
    estilo: { '--accent': ligado ? 'var(--c-hoje)' : 'var(--c-geral)' }
  },
    ajuda([mt.descricao, mt.porQue, ...mt.regras, mt.nota], mt.titulo),
    h('div.linha', null,
      h('div.esticar', null,
        h('h4', { texto: ligado ? mt.titulo : 'Dia de rotina' }),
        h('p.legenda', {
          texto: ligado
            ? `${mt.refeicoes.length} refeições sem hora marcada.`
            : `${dia.tipoDoPlano.refeicoes.length} refeições com hora — o cardápio normal.`
        })
      ),
      h('button.btn.btn-secundario', {
        type: 'button',
        onClick: () => {
          const agora = registro.alternarDiaTranquilo(data);
          toast(agora ? 'Modo tranquilo ligado.' : 'De volta ao cardápio normal.');
          ctx.recarregar();
        }
      }, icone(ligado ? 'voltar' : 'rotacao'), ligado ? 'Voltar ao normal' : 'Estou fora da rotina')
    ),
    ligado && mt.piso
      ? h('div.mt-3', null, aviso({
          nivel: 'ok',
          titulo: `O piso do dia: ${mt.piso.refeicoes.length} refeições`,
          texto: mt.piso.texto
        }))
      : null
  );
}

/* ===================== fechar o dia ===================== */

/**
 * Marca explicitamente que o dia acabou. Sem isso o app não distingue "não
 * comi" de "não registrei", e um dia com uma refeição lançada virava déficit de
 * 2000 kcal no balanço da semana e no banco calórico.
 */
function blocoFecharDia(dia, data, ctx) {
  const { registro } = ctx;
  const fechado = registro.diaFechado(data);
  const faltam = dia.pendentes.length;

  return h('div.card.mt-3', { estilo: { '--accent': fechado ? 'var(--c-ok)' : 'var(--c-geral)' } },
    h('div.linha', null,
      h('div.esticar', null,
        h('h4', { texto: fechado ? 'Dia fechado' : 'Fechar o dia' }),
        h('p.legenda', {
          texto: fechado
            ? `Contabilizado como está: ${dia.consumido.kcal} de ${dia.alvo.kcal} kcal.`
            : faltam
              ? `${faltam} refeição(ões) do cardápio ainda sem marcar. Fechar assim diz ao app que o que falta não foi comido.`
              : 'Todas as refeições do cardápio marcadas.'
        })
      ),
      h('button.btn.btn-secundario', {
        type: 'button',
        onClick: () => {
          const agora = registro.alternarDiaFechado(data);
          toast(agora ? 'Dia fechado.' : 'Dia reaberto.');
          ctx.recarregar();
        }
      }, icone(fechado ? 'voltar' : 'check'), fechado ? 'Reabrir' : 'Fechei o dia'),
      ajuda('Enquanto o dia não é fechado, ele não entra no balanço da semana nem no banco calórico — melhor ficar de fora que entrar errado. O app não consegue distinguir "não comi" de "não registrei": fechar o dia é você dizendo que o que falta não foi comido.',
        'Para que serve fechar o dia')
    )
  );
}

/* ===================== suplementos ===================== */

function blocoSuplementos(dia, nutricao, ctx) {
  const { registro } = ctx;
  const nota = nutricao.suplementosNota;
  const lista = suplementosDoDia(nutricao.suplementos, dia, nutricao.orientacoes, nota && nota.ordem);
  if (!lista.length) return h('div');

  const feitos = () => lista.filter((s) => registro.suplementoTomado(s.nome, ctx.data)).length;
  const contador = h('span.chip', { dataset: { nivel: feitos() === lista.length ? 'ok' : 'accent' } },
    `${feitos()}/${lista.length}`);

  const itens = lista.map((s) => {
    const item = h('button.check-item', {
      type: 'button',
      dataset: { feito: String(registro.suplementoTomado(s.nome, ctx.data)) },
      onClick: () => {
        item.dataset.feito = String(registro.alternarSuplemento(s.nome, ctx.data));
        contador.textContent = `${feitos()}/${lista.length}`;
        contador.dataset.nivel = feitos() === lista.length ? 'ok' : 'accent';
      }
    },
      h('span.check-box', null, icone('check')),
      h('span.check-texto', null,
        h('strong', null, s.nome, ' ', h('span.texto-3.texto-sm', { texto: s.dose })),
        h('span', { texto: s.quando })
      ),
      s.prioridade === 'essencial' ? chip('essencial', 'critico') : null
    );
    return item;
  });

  const essenciais = lista.filter((s) => s.prioridade === 'essencial');

  return h('section.secao', null,
    h('div.secao-cabecalho', null,
      h('h2', null, icone('pilula'), ' Suplementos'),
      contador
    ),
    h('div.mt-2', null, itens),
    essenciais.length
      ? h('p.legenda.mt-2', null,
          'Se o dia apertar, os que não podem faltar são ',
          h('strong', { texto: essenciais.map((s) => s.nome).join(', ') }),
          '. O porquê de cada um está em Consultar → Nutrição → Suplementos.'
        )
      : null
  );
}

export { horaDaRefeicao };
