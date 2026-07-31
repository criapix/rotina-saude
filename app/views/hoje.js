// Aba "Hoje" — triagem, não painel.
//
// O app é aberto com UMA intenção. Esta tela responde "o que faço agora?" e
// oferece os cinco atalhos que cobrem os momentos frequentes: saber o que
// comer, registrar o que comeu, saber a série, registrar a série, registrar o
// pedal. Detalhe é nas abas Comer e Treinar; referência é em Consultar.

import {
  h, icone, cabecalhoPagina, aviso, dataLonga
} from '../ui.js';
import { resumoDia, resumoJanela, proximaAcao } from '../motor.js';

export async function render(ctx) {
  const { store, registro } = ctx;
  const [perfil, treinos, nutricao, pedal] = await store.docs('perfil', 'treinos', 'nutricao', 'pedal');
  const dados = { perfil, treinos, nutricao, pedal };

  const dia = resumoDia(dados, registro);
  const jan = resumoJanela(dados, registro);
  const acao = proximaAcao(dados, dia, jan);

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: dataLonga(new Date()),
    titulo: saudacao(perfil.pessoa.primeiroNome),
    subtitulo: statusDoDia(dia)
  }));

  raiz.append(cartaoAgora(acao, ctx));
  raiz.append(atalhos(dia, jan, ctx));
  raiz.append(alertas(dia, jan, perfil, ctx));

  return raiz;
}

function saudacao(nome) {
  const hora = new Date().getHours();
  return `${hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'}, ${nome}`;
}

/** Uma linha, três números: o que gastou, o alvo, o que já comeu. */
function statusDoDia(dia) {
  const partes = [];
  if (dia.gasto) partes.push(`gasto ${dia.gasto} kcal`);
  partes.push(`alvo ${dia.alvo.kcal} kcal`);
  partes.push(`comeu ${dia.consumido.kcal}`);
  if (dia.provisorio) partes.push('sem atividade registrada');
  return partes.join(' · ');
}

/* ===================== o que fazer agora ===================== */

const COR_URGENCIA = {
  critico: 'var(--c-critico)',
  atencao: 'var(--c-atencao)',
  info: 'var(--c-hoje)',
  ok: 'var(--c-ok)'
};

function cartaoAgora(a, ctx) {
  return h('div.card', { estilo: { '--accent': COR_URGENCIA[a.urgencia] } },
    h('div.linha', null,
      h('span.chip', { dataset: { nivel: a.urgencia === 'info' ? 'accent' : a.urgencia } }, 'agora'),
      h('span.esticar')
    ),
    h('h2.mt-2', { texto: a.titulo }),
    h('p.texto-2.mt-2', { texto: a.texto }),
    h('button.btn.btn-bloco.btn-primario.mt-3', {
      type: 'button',
      estilo: { background: COR_URGENCIA[a.urgencia] },
      onClick: () => ctx.navegar(a.rota)
    }, a.acao, icone('seta'))
  );
}

/* ===================== os cinco momentos ===================== */

function atalhos(dia, jan, ctx) {
  const feitas = dia.tipo.refeicoes.length - dia.pendentes.length;
  const total = dia.tipo.refeicoes.length;
  const serie = dia.sessoes.length
    ? dia.sessoes.map((s) => s.id).join(' + ')
    : jan.proxima.escolhida ? jan.proxima.escolhida.sessao.id : '—';

  const tile = ({ titulo, nota, nomeIcone, cor, rota }) => h('button.nav-card', {
    type: 'button', estilo: { '--accent': cor },
    onClick: () => ctx.navegar(rota)
  },
    h('span.nav-card-icone', null, icone(nomeIcone)),
    h('span.nav-card-texto', null,
      h('strong', { texto: titulo }),
      h('span', { texto: nota })
    ),
    h('span.nav-card-seta', null, icone('seta'))
  );

  return h('div.pilha-2.mt-3', null,
    tile({
      titulo: 'O que comer',
      nota: `${feitas}/${total} refeições · faltam ${Math.max(0, dia.restante.kcal)} kcal e ${Math.max(0, dia.restante.p)} g de proteína`,
      nomeIcone: 'nutricao', cor: 'var(--c-nutricao)', rota: '#/comer'
    }),
    tile({
      titulo: dia.sessoes.length ? `Série de hoje — ${serie}` : `Qual série fazer — ${serie}`,
      nota: dia.sessoes.length
        ? 'marcar série por série'
        : `${jan.academias.length}/${jan.metaAcademia} na janela de ${jan.janelaDias} dias`,
      nomeIcone: 'treino', cor: 'var(--c-treino)', rota: '#/treinar'
    }),
    tile({
      titulo: 'Registrar pedal',
      nota: dia.atividades.some((a) => a.tipo === 'pedal')
        ? 'pedal já registrado hoje'
        : `${jan.pedais.length}/${jan.metaPedal} na janela de ${jan.janelaDias} dias`,
      nomeIcone: 'pedal', cor: 'var(--c-pedal)', rota: '#/treinar'
    }),
    tile({
      titulo: 'Consultar',
      nota: 'plano, exames, laudos, histórico e a semana',
      nomeIcone: 'lista', cor: 'var(--c-geral)', rota: '#/consultar'
    })
  );
}

/* ===================== alertas, com teto ===================== */

/**
 * Só o mais urgente fica visível. O resto vai para um contador que abre a lista
 * completa — sem isso a tela volta a ser uma parede de avisos.
 */
function alertas(dia, jan, perfil, ctx) {
  const doDia = dia.orientacoes.filter((o) => o.nivel === 'critico' || o.nivel === 'atencao');
  const daJanela = jan.alertas || [];
  const continuos = perfil.alertas || [];

  const todos = [...doDia, ...daJanela, ...continuos];
  if (!todos.length) return h('div');

  const primeiro = doDia[0] || daJanela[0] || null;
  const resto = todos.length - (primeiro ? 1 : 0);

  const frag = h('div.mt-3');
  if (primeiro) frag.append(aviso(primeiro));

  if (resto > 0) {
    frag.append(h('button.btn.btn-fantasma.mt-2', {
      type: 'button',
      onClick: () => ctx.abrirSheet(h('div', null,
        h('p.sheet-titulo', { texto: 'Do dia' }),
        doDia.length
          ? h('div.pilha-2', null, doDia.map((o) => aviso(o)))
          : h('p.legenda', { texto: 'Nada pendente hoje.' }),
        daJanela.length
          ? h('div', null,
              h('p.sheet-titulo', { texto: `Janela de ${jan.janelaDias} dias` }),
              h('div.pilha-2', null, daJanela.map((a) => aviso(a)))
            )
          : null,
        h('p.sheet-titulo', { texto: 'Atenção contínua' }),
        continuos.length
          ? h('div.pilha-2', null, continuos.map((a) => aviso({
              nivel: a.nivel, titulo: a.titulo, texto: a.texto, data: a.desde
            })))
          : h('p.legenda', { texto: 'Nenhum alerta clínico aberto.' })
      ), 'Alertas')
    }, icone('alerta'), `Ver todos os alertas (${todos.length})`));
  }

  return frag;
}
