// Compositor de refeições — monta uma refeição escolhendo alimentos da tabela e
// ajustando as quantidades, com os macros recalculando a cada mudança.
//
// Serve para dois casos:
//   1. personalizar uma refeição do plano (abre com a composição planejada);
//   2. registrar uma refeição avulsa (abre vazia).
//
// Em ambos os casos o que é gravado no registro são os macros do que foi
// realmente montado, não os do cardápio.

import { h, icone, chip, aviso, toast } from '../ui.js';
import { macrosDaComposicao, medidaLegivel, descreverComposicao, indiceAlimentos, buscarAlimentos } from '../motor.js';

/**
 * Abre o compositor numa bottom sheet.
 *
 * @param {object} o
 * @param {object} o.alimentos  nutricao.alimentos
 * @param {object} [o.refeicao] refeição do plano (dá nome, hora e composição inicial)
 * @param {Array}  [o.inicial]  composição inicial, quando difere da do plano
 * @param {object} o.ctx        contexto da view (registro, sheet, recarregar)
 */
export function abrirCompositor({ alimentos, refeicao, inicial, ctx }) {
  const idx = indiceAlimentos(alimentos);
  const doPlano = Boolean(refeicao);

  // Cópia própria: mexer aqui não pode alterar o cardápio em memória.
  let composicao = (inicial || (refeicao && refeicao.composicao) || []).map((x) => ({ ...x }));

  const nomeCampo = h('input', {
    type: 'text',
    value: refeicao ? refeicao.nome : '',
    placeholder: 'Nome da refeição (ex.: Café da manhã)',
    'aria-label': 'Nome da refeição'
  });

  const resumo = h('div.def');
  const listaItens = h('div.pilha-2');
  const comparativo = h('div');

  function macros() {
    return macrosDaComposicao(idx, composicao);
  }

  function pintarResumo() {
    const m = macros();
    // Linha compacta: numa bottom sheet, quatro cartões grandes empurram os
    // controles para fora da tela.
    resumo.replaceChildren(
      h('div.def-linha', null,
        h('dt', { texto: 'Calorias' }),
        h('dd', null, h('b.num', { texto: `${m.kcal} kcal` }))
      ),
      h('div.def-linha', null,
        h('dt', { texto: 'Macros' }),
        h('dd.num', { texto: `P ${m.p} g · G ${m.g} g · C ${m.c} g` })
      )
    );

    // Quando é uma refeição do plano, mostra o que muda em relação ao planejado.
    comparativo.replaceChildren();
    if (doPlano && refeicao.macros) {
      const pl = refeicao.macros;
      const d = { p: m.p - pl.p, g: m.g - pl.g, c: m.c - pl.c, kcal: m.kcal - pl.kcal };
      const sinal = (v, un) => `${v > 0 ? '+' : ''}${v}${un}`;
      const relevante = Math.abs(d.kcal) > 50 || Math.abs(d.p) > 5 || Math.abs(d.g) > 5 || Math.abs(d.c) > 10;
      comparativo.append(h('p.legenda.mt-3', null,
        `Planejado: ${pl.kcal} kcal · P${pl.p} G${pl.g} C${pl.c}. `,
        relevante
          ? h('strong', { texto: `Diferença: ${sinal(d.kcal, ' kcal')} · ${sinal(d.p, 'g')} P · ${sinal(d.g, 'g')} G · ${sinal(d.c, 'g')} C.` })
          : 'Praticamente igual ao planejado.'
      ));
      if (d.p < -10) {
        comparativo.append(h('div.mt-2', null, aviso({
          nivel: 'atencao',
          titulo: `${Math.abs(d.p)} g de proteína a menos que o planejado`,
          texto: 'Proteína é o macro fixo do dia (170 g). O que falta aqui precisa entrar em outra refeição.'
        })));
      }
      if (d.g > 10) {
        comparativo.append(h('div.mt-2', null, aviso({
          nivel: 'atencao',
          titulo: `${d.g} g de gordura a mais que o planejado`,
          texto: 'A gordura do dia também é fixa (80 g). Vale conferir o queijo, o requeijão e o azeite das outras refeições.'
        })));
      }
    }
  }

  function pintarItens() {
    if (!composicao.length) {
      listaItens.replaceChildren(h('p.legenda', { texto: 'Nenhum alimento ainda — escolha abaixo.' }));
      return;
    }
    listaItens.replaceChildren(...composicao.map((item, i) => {
      const a = idx.get(item.alimentoId);
      const passo = (a && a.passoG) || 10;

      const qtd = h('span.num', { texto: medidaLegivel(a, item.gramas) });
      const mudar = (delta) => {
        composicao[i].gramas = Math.max(0, item.gramas + delta);
        if (composicao[i].gramas === 0) composicao.splice(i, 1);
        pintarItens();
        pintarResumo();
      };

      const m = macrosDaComposicao(idx, [item]);
      return h('div', { estilo: { borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-2)' } },
        h('div.linha', null,
          h('div.esticar', { estilo: { minWidth: '0' } },
            h('strong.texto-sm', { texto: a ? a.nome : item.alimentoId }),
            h('div.texto-xs.texto-3', { texto: `${m.kcal} kcal · P${m.p} G${m.g} C${m.c}` })
          ),
          h('button.icon-btn', {
            type: 'button', 'aria-label': `Remover ${a ? a.nome : ''}`, title: 'Remover',
            onClick: () => { composicao.splice(i, 1); pintarItens(); pintarResumo(); }
          }, icone('lixeira'))
        ),
        h('div.linha.mt-2', { estilo: { justifyContent: 'flex-end' } },
          h('button.icon-btn', { type: 'button', 'aria-label': `Diminuir ${a ? a.nome : ''}`, onClick: () => mudar(-passo) }, '−'),
          qtd,
          h('button.icon-btn', { type: 'button', 'aria-label': `Aumentar ${a ? a.nome : ''}`, onClick: () => mudar(passo) }, '+')
        )
      );
    }));
  }

  function adicionar(id) {
    const a = idx.get(id);
    if (!a) return;
    const existente = composicao.find((x) => x.alimentoId === id);
    if (existente) existente.gramas += a.passoG || 10;
    else composicao.push({ alimentoId: id, gramas: a.porcaoG });
    if (a.nota) toast(a.nota);
    pintarItens();
    pintarResumo();
  }

  /* --- busca na tabela de alimentos --- */

  const busca = h('input', { type: 'search', placeholder: 'Buscar alimento…', 'aria-label': 'Buscar alimento' });
  const sugestoes = h('div.chip-linha.mt-2');

  const grupos = [...new Set(alimentos.itens.map((a) => a.grupo))];
  let grupoAtivo = null;

  function pintarSugestoes() {
    // A busca ignora acento e olha nome, grupo e sinônimos: quem digita
    // "tamara" tem que achar "Tâmara seca".
    const lista = buscarAlimentos(alimentos, busca.value, grupoAtivo);
    if (!lista.length) {
      sugestoes.replaceChildren(h('p.legenda', { texto: `Nada encontrado para "${busca.value.trim()}".` }));
      return;
    }
    const semTermo = !busca.value.trim();
    sugestoes.replaceChildren(
      semTermo && !grupoAtivo
        ? h('p.legenda', { texto: 'Os que aparecem no seu cardápio. Busque ou filtre por grupo para ver os outros.' })
        : null,
      ...lista.slice(0, 60).map((a) => h('button.chip', {
        type: 'button',
        dataset: { nivel: a.frequente ? 'accent' : 'info' },
        estilo: { cursor: 'pointer' },
        title: a.nota || `${a.por100.kcal} kcal por 100 g · porção padrão ${a.porcaoG} g`,
        onClick: () => { adicionar(a.id); busca.value = ''; pintarSugestoes(); }
      }, `+ ${a.nome}`)),
      lista.length > 60 ? h('p.legenda', { texto: `+${lista.length - 60} — refine a busca.` }) : null
    );
  }
  busca.addEventListener('input', pintarSugestoes);

  const filtros = h('div.chip-linha.mt-2', null, grupos.map((g) => {
    const b = h('button.chip', {
      type: 'button', dataset: { nivel: 'info' }, estilo: { cursor: 'pointer' },
      onClick: () => {
        grupoAtivo = grupoAtivo === g ? null : g;
        for (const outro of filtros.children) {
          outro.dataset.nivel = outro.textContent === grupoAtivo ? 'ok' : 'info';
        }
        busca.value = '';
        pintarSugestoes();
      }
    }, g);
    return b;
  }));

  /* --- ações --- */

  const salvar = () => {
    const nome = nomeCampo.value.trim() || (refeicao ? refeicao.nome : 'Refeição');
    if (!composicao.length) { toast('Escolha pelo menos um alimento.'); return; }
    ctx.registro.salvarRefeicao({
      id: refeicao ? refeicao.id : undefined,
      nome,
      hora: refeicao ? refeicao.hora : undefined,
      composicao,
      macros: macros(),
      doPlano
    });
    ctx.fecharSheet();
    toast(doPlano ? 'Refeição personalizada.' : 'Refeição registrada.');
    ctx.recarregar();
  };

  pintarItens();
  pintarResumo();
  pintarSugestoes();

  ctx.abrirSheet(h('div', null,
    h('p.sheet-titulo', { texto: doPlano ? 'Personalizar refeição' : 'Registrar refeição' }),
    nomeCampo,
    doPlano
      ? h('p.legenda.mt-2', { texto: `Do plano: ${refeicao.itens}` })
      : h('p.legenda.mt-2', { texto: 'Uma refeição fora do cardápio. Entra na conta do dia igual às outras.' }),

    h('div.mt-3', null, resumo),
    comparativo,

    h('p.sheet-titulo', { texto: 'O que tem na refeição' }),
    listaItens,

    h('p.sheet-titulo', { texto: 'Adicionar alimento' }),
    busca,
    filtros,
    sugestoes,

    h('div.grade.grade-2.mt-4', null,
      h('button.btn.btn-primario', { type: 'button', onClick: salvar }, icone('check'), 'Salvar'),
      h('button.btn.btn-secundario', { type: 'button', onClick: () => ctx.fecharSheet() }, 'Cancelar')
    ),
    h('p.legenda.mt-3', { texto: alimentos.aviso })
  ), doPlano ? 'Personalizar refeição' : 'Registrar refeição');
}

export { descreverComposicao };
