// Aba "Comer" — responde a duas perguntas e nada mais:
//   1. o que eu preciso comer agora?
//   2. como eu registro o que comi?
//
// Tudo que é referência (tabela de alimentos, compensação, estratégias, metas)
// fica em Consultar → Nutrição. Aqui só entra o que é do dia de hoje.

import {
  h, icone, cabecalhoPagina, aviso, chip, secao, toast, dataLonga, barraMacro
} from '../ui.js';
import {
  resumoDia, bancoCalorico, suplementosDoDia,
  proximaRefeicao, horaDaRefeicao, descreverComposicao
} from '../motor.js';
import { abrirCompositor } from './compositor.js';

export async function render(ctx) {
  const { store, registro } = ctx;
  const [perfil, treinos, nutricao, pedal] = await store.docs('perfil', 'treinos', 'nutricao', 'pedal');
  const dados = { perfil, treinos, nutricao, pedal };

  const dia = resumoDia(dados, registro);
  const alimentos = nutricao.alimentos;
  const prox = proximaRefeicao(dia);

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: dataLonga(new Date()),
    titulo: 'Comer',
    subtitulo: dia.provisorio
      ? `Alvo provisório de ${dia.alvo.kcal} kcal — registre a atividade em Treinar e ele sobe.`
      : `Alvo de ${dia.alvo.kcal} kcal (base ${nutricao.compensacao.baseKcal} + gasto ${dia.gasto}).`
  }));

  raiz.append(barraDoDia(dia));

  // A refeição da vez, em destaque e com as duas ações a um toque.
  if (prox) raiz.append(cartaoProxima(prox, alimentos, ctx));

  raiz.append(listaRefeicoes(dia, prox, alimentos, ctx));
  raiz.append(avulsas(dia, alimentos, ctx));

  raiz.append(h('button.btn.btn-secundario.mt-3', {
    type: 'button',
    onClick: () => abrirCompositor({ alimentos, ctx })
  }, icone('lista'), 'Registrar algo fora do plano'));

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

  return h('div.card', { estilo: { '--accent': 'var(--c-nutricao)' } },
    item('Calorias', dia.consumido.kcal, dia.alvo.kcal, ' kcal', 'var(--c-nutricao)'),
    item('Proteína', dia.consumido.p, dia.alvo.p, ' g', 'var(--c-treino)'),
    h('p.legenda.mt-2', { texto: 'Caloria e proteína são o que se acompanha de cabeça. Gordura é fixa e o carboidrato absorve o resto — o detalhe por macro está em cada refeição.' })
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
        onClick: () => { registro.alternarRefeicao(r); toast('Registrado.'); ctx.recarregar(); }
      }, icone('check'), 'Comi isso'),
      h('button.btn.btn-secundario', {
        type: 'button',
        onClick: () => abrirCompositor({ alimentos, refeicao: r, ctx })
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
              personalizada ? h('span', null, ' ', chip('personalizada', 'info')) : null),
            h('span', { texto: itens }),
            h('span.texto-xs', { texto: `${personalizada ? '' : '~'}${m.kcal} kcal · P${m.p} G${m.g} C${m.c}` })
          )
        ),
        h('button.icon-btn', {
          type: 'button', 'aria-label': `Personalizar ${r.nome}`, title: 'Comi outra coisa',
          onClick: () => abrirCompositor({
            alimentos, refeicao: r, ctx,
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
  const extras = (registro.dia().refeicoes || []).filter((r) => !doCardapio.has(r.id));
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
              alimentos, ctx,
              refeicao: { id: r.id, nome: r.nome, hora: r.hora, itens: '', composicao: r.composicao }
            })
          }, icone('editor'))
        : null,
      h('button.icon-btn', {
        type: 'button', 'aria-label': `Remover ${r.nome}`, title: 'Remover',
        onClick: () => { registro.removerRefeicao(r.id); toast('Removida.'); ctx.recarregar(); }
      }, icone('lixeira'))
    )))
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
      h('h2', null, icone('pilula'), ' Suplementos'),
      contador
    ),
    h('div.mt-2', null, itens)
  );
}

export { horaDaRefeicao };
