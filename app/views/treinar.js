// Aba "Treinar" — responde a três perguntas e nada mais:
//   1. qual série eu tenho que fazer hoje?
//   2. como eu registro a série que fiz?
//   3. como eu registro o pedal que fiz?
//
// Se já há série registrada hoje, a página ABRE nela: na academia o que importa
// é a lista de exercícios, não um painel. Volume, limites clínicos e a janela de
// 7 dias ficam em Consultar → Treino e Consultar → Semana.

import {
  h, icone, cabecalhoPagina, aviso, chip, secao, toast, dataLonga, dataBR, seletorData
} from '../ui.js';
import { hojeISO } from '../store.js';

const ehData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
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

  const hoje = hojeISO();
  const data = ehData(ctx.params[0]) && ctx.params[0] <= hoje ? ctx.params[0] : hoje;
  const deHoje = data === hoje;
  ctx.data = data;

  const dia = resumoDia(dados, registro, data);
  const jan = resumoJanela(dados, registro);
  const comp = nutricao.compensacao;
  const seletor = () => seletorData(data, hoje, (d) => ctx.navegar(`#/treinar/${d}`));

  // Já treinou: a página é a série. Nada antes dela, além do seletor de dia.
  if (dia.sessoes.length) {
    const raiz = h('div');
    raiz.append(seletor());
    for (const s of dia.sessoes) {
      raiz.append(telaSessao(s, treinos, jan, ctx, { voltar: false, volume: false, data }));
    }
    // Mais de uma série no mesmo dia é permitido — recolhido, para não competir
    // com a lista de exercícios, que é o que se olha dentro da academia.
    raiz.append(blocoSerie(dia, jan, comp, ctx, { extra: true }));
    raiz.append(registrado(dia, comp, treinos, ctx));
    raiz.append(blocoPedal(dia, dados, comp, ctx));
    return raiz;
  }

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: deHoje ? dataLonga(new Date()) : `Registrando ${dataBR(data)}`,
    titulo: 'Treinar',
    subtitulo: `${jan.academias.length}/${jan.metaAcademia} academias e ${jan.pedais.length}/${jan.metaPedal} pedais nos últimos ${jan.janelaDias} dias.`
  }));

  raiz.append(seletor());
  raiz.append(blocoSerie(dia, jan, comp, ctx));
  raiz.append(blocoPedal(dia, dados, comp, ctx));
  if (dia.atividades.length) raiz.append(registrado(dia, comp, treinos, ctx));

  return raiz;
}

/* ===================== a série de hoje ===================== */

function blocoSerie(dia, jan, comp, ctx, opcoes = {}) {
  const { registro } = ctx;
  const extra = Boolean(opcoes.extra);
  const p = jan.proxima.escolhida;
  const s = p && p.sessao;

  const selDur = h('select', { 'aria-label': 'Duração do treino' },
    DURACOES_ACADEMIA.map((m) => h('option', {
      value: String(m),
      selected: m === comp.atividades.find((a) => a.id === 'academia').duracaoPadraoMin
    }, formatarDuracao(m)))
  );
  // Todas as sessões entram no seletor manual, inclusive as já feitas na
  // janela: quem faz a segunda série do dia pode querer justamente repetir.
  const seletorSessao = h('select', { 'aria-label': 'Qual série' },
    jan.proxima.candidatos.map((c) => h('option',
      { value: c.sessao.id, selected: Boolean(s) && c.sessao.id === s.id },
      `${c.sessao.id} — ${c.sessao.nome}${c.livre ? '' : ' (com ressalva)'}`))
  );

  const registrar = (sessaoId) => {
    registro.registrarAtividade(
      { tipo: 'academia', sessao: sessaoId, duracaoMin: Number(selDur.value) }, ctx.data);
    if (extra) toast('Segunda série registrada.');
    ctx.recarregar();
  };

  // A ressalva da sessão escolhida, atualizada ao trocar no seletor. Sem isso
  // dá para registrar a segunda série do dia sem ver que ela estoura um limite
  // clínico — o aviso existia só em Consultar → Semana, longe da decisão.
  const ressalva = h('p.legenda');
  const atualizarRessalva = () => {
    const c = jan.proxima.candidatos.find((x) => x.sessao.id === seletorSessao.value);
    const bs = (c && c.bloqueios) || [];
    ressalva.textContent = bs.length
      ? (c.temDuro ? 'Bloqueio: ' : 'Ressalva: ') + bs.map((b) => b.texto).join('; ') + '.'
      : 'Sem restrição para esta sessão agora.';
    ressalva.dataset.nivel = bs.length ? (c.temDuro ? 'critico' : 'atencao') : 'ok';
    ressalva.style.color = bs.length
      ? (c.temDuro ? 'var(--c-critico)' : 'var(--c-atencao)')
      : '';
  };
  seletorSessao.addEventListener('change', atualizarRessalva);
  atualizarRessalva();

  const manual = h('div.pilha-2.mt-2', null,
    h('div.linha', null, h('span.esticar', null, seletorSessao)),
    ressalva,
    h('div.linha', null,
      h('span.esticar', null, selDur),
      h('b.num', { texto: `≈ ${gastoDaAtividade({ tipo: 'academia' }, comp)} kcal` })
    ),
    h('button.btn.btn-secundario', {
      type: 'button', onClick: () => registrar(seletorSessao.value)
    }, icone('check'), 'Registrar essa')
  );

  // Segunda série do dia: recolhido, para não disputar espaço com a lista de
  // exercícios da série que já está em andamento.
  if (extra) {
    return h('details.card.mt-3', { estilo: { '--accent': 'var(--c-treino)' } },
      h('summary', null, h('strong', { texto: 'Registrar outra série hoje' })),
      h('p.legenda.mt-2', {
        texto: s
          ? `Sugerida agora: ${s.id} — ${s.nome}. As marcações de série de cada execução são independentes.`
          : 'Nenhuma sugestão livre — escolha a série na lista. As marcações de série de cada execução são independentes.'
      }),
      manual
    );
  }

  if (!p) {
    return h('div', null,
      aviso({
        nivel: 'ok',
        titulo: 'Nenhuma série liberada agora',
        texto: 'Todas as opções estão bloqueadas por limite clínico ou intervalo de recuperação. Hoje é pedal leve ou descanso.'
      }),
      h('details.card.mt-3', null,
        h('summary.legenda', { texto: 'Registrar uma série mesmo assim' }),
        manual
      )
    );
  }

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
      onClick: () => registrar(s.id)
    }, icone('check'), `Começar o treino ${s.id}`),
    h('p.legenda.mt-2', { texto: 'Registra a sessão e abre a lista de exercícios para marcar série por série.' }),

    h('details.mt-3', null,
      h('summary.legenda', { texto: 'Outra série, ou outra duração' }),
      manual
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
          }, ctx.data);
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

  const quando = ctx.data === hojeISO() ? 'hoje' : `em ${dataBR(ctx.data)}`;
  return secao(`Registrado ${quando} · gasto ${dia.gasto} kcal`,
    h('div.pilha-2', null, dia.atividades.map((a) => {
      const kcal = gastoDaAtividade(a, comp);
      const entrada = h('input', {
        type: 'number', min: '0', step: '10', value: String(kcal),
        'aria-label': 'Gasto em kcal',
        estilo: { width: '6.5rem', textAlign: 'right' },
        onChange: (e) => {
          const v = Number(e.target.value);
          registro.atualizarAtividade(a.id, { kcal: Number.isFinite(v) && v > 0 ? Math.round(v) : null }, ctx.data);
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
          onClick: () => { registro.removerAtividade(a.id, ctx.data); toast('Registro desfeito.'); ctx.recarregar(); }
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
