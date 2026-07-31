// Aba "Treinar" — responde a três perguntas e nada mais:
//   1. qual série eu tenho que fazer hoje?
//   2. como eu registro a série que fiz?
//   3. como eu registro o pedal que fiz?
//
// Se já há série registrada hoje, a página ABRE nela: na academia o que importa
// é a lista de exercícios, não um painel. Volume, limites clínicos e a janela de
// 7 dias ficam em Consultar → Treino e Consultar → Semana.

import {
  h, icone, cabecalhoPagina, aviso, chip, secao, toast, dataLonga
} from '../ui.js';
import {
  resumoDia, resumoJanela, gastoDaAtividade, formatarDuracao
} from '../motor.js';
import { telaSessao } from './treino.js';

const DURACOES_PEDAL = [45, 60, 90, 120, 150, 180, 210, 240, 300];
const DURACOES_ACADEMIA = [45, 60, 75, 90, 105];

export async function render(ctx) {
  const { store, registro } = ctx;
  const [perfil, treinos, nutricao, pedal] = await store.docs('perfil', 'treinos', 'nutricao', 'pedal');
  const dados = { perfil, treinos, nutricao, pedal };

  const dia = resumoDia(dados, registro);
  const jan = resumoJanela(dados, registro);
  const comp = nutricao.compensacao;

  // Já treinou: a página é a série. Nada antes dela.
  if (dia.sessoes.length) {
    const raiz = h('div');
    for (const s of dia.sessoes) {
      raiz.append(telaSessao(s, treinos, jan, ctx, { voltar: false, volume: false }));
    }
    raiz.append(registrado(dia, comp, treinos, ctx));
    raiz.append(blocoPedal(dia, dados, comp, ctx));
    return raiz;
  }

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: dataLonga(new Date()),
    titulo: 'Treinar',
    subtitulo: `${jan.academias.length}/${jan.metaAcademia} academias e ${jan.pedais.length}/${jan.metaPedal} pedais nos últimos ${jan.janelaDias} dias.`
  }));

  raiz.append(blocoSerie(dia, jan, comp, ctx));
  raiz.append(blocoPedal(dia, dados, comp, ctx));
  if (dia.atividades.length) raiz.append(registrado(dia, comp, treinos, ctx));

  return raiz;
}

/* ===================== a série de hoje ===================== */

function blocoSerie(dia, jan, comp, ctx) {
  const { registro } = ctx;
  const p = jan.proxima.escolhida;

  if (!p) {
    return h('div', null, aviso({
      nivel: 'ok',
      titulo: 'Nenhuma série liberada agora',
      texto: 'Todas as opções estão bloqueadas por limite clínico ou intervalo de recuperação. Hoje é pedal leve ou descanso.'
    }));
  }

  const s = p.sessao;
  const selDur = h('select', { 'aria-label': 'Duração do treino' },
    DURACOES_ACADEMIA.map((m) => h('option', {
      value: String(m),
      selected: m === comp.atividades.find((a) => a.id === 'academia').duracaoPadraoMin
    }, formatarDuracao(m)))
  );
  const seletorSessao = h('select', { 'aria-label': 'Qual série' },
    jan.proxima.candidatos.map((c) => h('option',
      { value: c.sessao.id, selected: c.sessao.id === s.id },
      `${c.sessao.id} — ${c.sessao.nome}${c.livre ? '' : ' (com ressalva)'}`))
  );

  return h('div.card', { estilo: { '--accent': 'var(--c-treino)' } },
    h('div.linha', null,
      h('span.chip', { dataset: { nivel: 'accent' } }, 'sugerida agora'),
      h('span.esticar'),
      h('span.texto-sm.texto-3', { texto: `~${s.duracaoMin} min` })
    ),
    h('h2.mt-2', { texto: `Treino ${s.id} — ${s.nome}` }),
    h('p.texto-2.mt-2', { texto: s.foco.join(' · ') }),
    h('div.chip-linha.mt-2', null,
      chip(`${s.exercicios.reduce((a, e) => a + e.series, 0)} séries`),
      chip(`${s.exercicios.length} exercícios`),
      p.bloqueios.length ? chip('com ressalva', 'atencao') : null
    ),
    p.bloqueios.length
      ? h('p.legenda.mt-2', { texto: 'Ressalva: ' + p.bloqueios.map((b) => b.texto).join('; ') + '.' })
      : null,

    h('button.btn.btn-bloco.btn-primario.mt-3', {
      type: 'button', estilo: { background: 'var(--c-treino)' },
      onClick: () => {
        registro.registrarAtividade({ tipo: 'academia', sessao: s.id, duracaoMin: Number(selDur.value) });
        ctx.recarregar();
      }
    }, icone('check'), `Começar o treino ${s.id}`),
    h('p.legenda.mt-2', { texto: 'Registra a sessão e abre a lista de exercícios para marcar série por série.' }),

    h('details.mt-3', null,
      h('summary.legenda', { texto: 'Outra série, ou outra duração' }),
      h('div.pilha-2.mt-2', null,
        h('div.linha', null, h('span.esticar', null, seletorSessao)),
        h('div.linha', null,
          h('span.esticar', null, selDur),
          h('b.num', { texto: `≈ ${gastoDaAtividade({ tipo: 'academia' }, comp)} kcal` })
        ),
        h('button.btn.btn-secundario', {
          type: 'button',
          onClick: () => {
            registro.registrarAtividade({
              tipo: 'academia', sessao: seletorSessao.value, duracaoMin: Number(selDur.value)
            });
            ctx.recarregar();
          }
        }, icone('check'), 'Registrar essa')
      )
    )
  );
}

/* ===================== pedal ===================== */

function blocoPedal(dia, dados, comp, ctx) {
  const { registro } = ctx;
  const def = comp.atividades.find((a) => a.id === 'pedal');
  const pedalFeito = dia.atividades.some((a) => a.tipo === 'pedal');

  const selPerfil = h('select', { 'aria-label': 'Intensidade do pedal' },
    def.perfis.map((p) => h('option', { value: p.id, selected: Boolean(p.padrao) }, p.nome))
  );
  const selDur = h('select', { 'aria-label': 'Duração do pedal' },
    DURACOES_PEDAL.map((m) => h('option', {
      value: String(m), selected: m === def.duracaoPadraoMin
    }, formatarDuracao(m)))
  );
  const previa = h('b.num');
  const atualizar = () => {
    previa.textContent = `≈ ${gastoDaAtividade(
      { tipo: 'pedal', perfil: selPerfil.value, duracaoMin: Number(selDur.value) }, comp)} kcal`;
  };
  selPerfil.addEventListener('change', atualizar);
  selDur.addEventListener('change', atualizar);
  atualizar();

  return h('div.card.mt-3', { estilo: { '--accent': 'var(--c-pedal)' } },
    h('h2.card-titulo', null, icone('pedal'), pedalFeito ? ' Outro pedal' : ' Pedalei'),
    h('p.legenda', { texto: 'Duração e intensidade definem o gasto — e o gasto define quanto você precisa comer hoje.' }),
    h('div.pilha-2.mt-3', null,
      h('div.linha', null, h('span.esticar', null, selPerfil)),
      h('div.linha', null, h('span.esticar', null, selDur), previa),
      h('button.btn.btn-bloco.btn-primario', {
        type: 'button', estilo: { background: 'var(--c-pedal)' },
        onClick: () => {
          registro.registrarAtividade({
            tipo: 'pedal',
            perfil: selPerfil.value,
            duracaoMin: Number(selDur.value),
            zona: dados.pedal.plano.zona
          });
          toast('Pedal registrado.');
          ctx.recarregar();
        }
      }, icone('check'), 'Registrar pedal')
    )
  );
}

/* ===================== o que já entrou hoje ===================== */

function registrado(dia, comp, treinos, ctx) {
  const { registro } = ctx;
  if (!dia.atividades.length) return h('div');

  return secao(`Registrado hoje · gasto ${dia.gasto} kcal`,
    h('div.pilha-2', null, dia.atividades.map((a) => {
      const kcal = gastoDaAtividade(a, comp);
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
        chip(rotulo(a, treinos), a.tipo === 'academia' ? 'accent' : 'atencao',
          a.tipo === 'academia' ? 'treino' : 'pedal'),
        h('span.esticar'),
        Number.isFinite(a.kcal) ? chip('medido', 'ok') : null,
        entrada,
        h('span.texto-xs.texto-3', { texto: 'kcal' }),
        h('button.icon-btn', {
          type: 'button', 'aria-label': 'Desfazer este registro', title: 'Desfazer',
          onClick: () => { registro.removerAtividade(a.id); toast('Registro desfeito.'); ctx.recarregar(); }
        }, icone('lixeira'))
      );
    })),
    h('p.legenda.mt-2', { texto: 'O número é editável: se o ciclocomputador deu outro valor, ele substitui a estimativa.' })
  );
}

function rotulo(a, treinos) {
  const dur = a.duracaoMin ? ` ${formatarDuracao(a.duracaoMin)}` : '';
  if (a.tipo === 'pedal') return `Pedal ${a.perfil || 'z2'}${dur}`;
  if (a.tipo !== 'academia') return `${a.tipo}${dur}`;
  const s = treinos.sessoes.find((x) => x.id === a.sessao);
  return s ? `Treino ${s.id}${dur}` : `Treino ${a.sessao}${dur}`;
}
