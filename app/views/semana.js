// Aba "Semana" — janela móvel de 7 dias: o que foi feito, o que falta, como o
// volume por grupo se compara ao alvo semanal e o que priorizar se apertar.

import {
  h, icone, ajuda, cabecalhoPagina, aviso, chip, card, cardTitulado, tabela, lista,
  secao, dataBR, dataCurta
} from '../ui.js';
import {
  resumoJanela, resumoEnergetico, bancoCalorico, medicoesDeGasto,
  aderenciaSuplementos, diasEntre
} from '../motor.js';
import { barrasHorizontais } from '../charts.js';

/** Ícone de ajuda numa linha própria, alinhado à direita. */
const ajudaLinha = (texto, titulo) =>
  h('div.linha.mt-2', null, h('span.esticar'), ajuda(texto, titulo));

export async function render(ctx) {
  const { store, registro } = ctx;
  const [perfil, treinos, nutricao, pedal] = await store.docs('perfil', 'treinos', 'nutricao', 'pedal');
  const dados = { perfil, treinos, nutricao, pedal };
  const jan = resumoJanela(dados, registro);
  const energia = resumoEnergetico(dados, registro);
  const banco = bancoCalorico(dados, registro);
  const med = medicoesDeGasto(dados, registro);
  const ader = aderenciaSuplementos(dados, registro);

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: `${dataBR(jan.dias[0])} a ${dataBR(jan.hoje)}`,
    titulo: `Janela de ${jan.janelaDias} dias`,
    subtitulo: 'Contagem móvel: a cada dia o app olha para os 7 dias anteriores. Não existe virada de semana — as sessões antigas vão saindo da janela.'
  }));

  raiz.append(blocoMetas(jan));

  if (jan.alertas.length) {
    raiz.append(h('div.pilha-2.mt-3', null, jan.alertas.map((a) => aviso(a))));
  }

  raiz.append(blocoPendencia(jan, treinos));
  raiz.append(blocoLinhaDoTempo(jan, treinos, ctx));
  raiz.append(blocoEnergia(energia, banco, nutricao.compensacao, treinos));
  raiz.append(blocoMedicoes(med));
  raiz.append(blocoSuplementos(ader));
  raiz.append(blocoVolume(jan));
  raiz.append(blocoLimites(jan));
  raiz.append(blocoProxima(jan));
  raiz.append(blocoReferencia(perfil, treinos));
  raiz.append(blocoDados(registro, ctx));

  return raiz;
}

/* ===================== metas da janela ===================== */

function blocoMetas(jan) {
  const meta = (label, feito, alvo, nota) => h('div.metrica', {
    dataset: { nivel: feito >= alvo ? 'ok' : feito === 0 ? 'critico' : 'atencao' }
  },
    h('div.metrica-label', { texto: label }),
    h('div.metrica-valor', null, h('b', { texto: `${feito}/${alvo}` })),
    h('div.metrica-nota', { texto: nota })
  );

  return h('div.grade.grade-2', null,
    meta('Academia', jan.academias.length, jan.metaAcademia,
      jan.faltamAcademia ? `faltam ${jan.faltamAcademia}` : 'meta batida'),
    meta('Pedal', jan.pedais.length, jan.metaPedal,
      jan.faltamPedal ? `faltam ${jan.faltamPedal}` : 'meta batida')
  );
}

/* ===================== o que falta ===================== */

function blocoPendencia(jan, treinos) {
  const p = jan.pendencia;

  if (p.completa) {
    return secao('O que falta',
      aviso({
        nivel: 'ok',
        titulo: 'As 4 sessões foram feitas nesta janela',
        texto: p.expirando.length
          ? `A partir de amanhã algumas saem da contagem: ${p.expirando.map((x) => `${x.sessao} em ${x.saiEmDias} dia${x.saiEmDias === 1 ? '' : 's'}`).join(', ')}.`
          : 'Ciclo completo. A próxima sessão reabre o ciclo.'
      })
    );
  }

  const nomes = (ids) => ids.map((id) => {
    const s = treinos.sessoes.find((x) => x.id === id);
    return s ? `${s.id} (${s.nome})` : id;
  });

  return secao('O que falta',
    h('div.card', { estilo: { '--accent': p.apertado ? 'var(--c-atencao)' : 'var(--c-treino)' } },
      h('h3', { texto: `Faltam ${p.restantes.length} sessõe${p.restantes.length === 1 ? '' : 's'} para fechar as ${jan.metaAcademia}` }),
      h('p.texto-2.mt-2', null,
        'Ordem de prioridade: ',
        h('strong', { texto: nomes(p.restantes).join(' → ') })
      ),
      p.apertado
        ? h('div.mt-3', null, aviso({
            nivel: 'atencao',
            titulo: 'A janela provavelmente não fecha',
            texto: `Sobrando ${p.restantes.length} sessões e o ritmo realista é ~1 por dia (a série pede 48h entre treinos da mesma categoria). As primeiras da ordem acima são as que valem garantir; as últimas tendem a ficar de fora.`
          }))
        : null,
      h('h4.mt-4', { texto: 'Critério de prioridade' }),
      h('p.texto-2.texto-sm.mt-2', { texto: p.criterio }),
      h('h4.mt-4', { texto: 'Ressalvas' }),
      lista(p.ressalvas)
    )
  );
}

/* ===================== linha do tempo ===================== */

function blocoLinhaDoTempo(jan, treinos, ctx) {
  const porDia = new Map(jan.dias.map((d) => [d, []]));
  for (const a of [...jan.academias, ...jan.pedais]) {
    porDia.get(a.data).push(a);
  }

  const linhas = jan.dias.slice().reverse().map((d) => {
    const itens = porDia.get(d) || [];
    const dist = diasEntre(d, jan.hoje);
    return {
      dataset: d === jan.hoje ? { destaque: 'true' } : {},
      celulas: [
        h('span', null, dataCurta(d), h('small.texto-3', { texto: dist === 0 ? ' · hoje' : ` · há ${dist}d` })),
        itens.length
          ? h('span.chip-linha', null, itens.map((a) => {
              const s = a.tipo === 'academia' ? treinos.sessoes.find((x) => x.id === a.sessao) : null;
              return chip(
                a.tipo === 'academia' ? (s ? `${s.id} — ${s.nome}` : a.sessao) : 'Pedal',
                a.tipo === 'academia' ? 'accent' : 'atencao',
                a.tipo === 'academia' ? 'treino' : 'pedal'
              );
            }))
          : h('span.texto-3', { texto: 'nada registrado' })
      ]
    };
  });

  return secao('Dia a dia',
    tabela([{ nome: 'Data' }, { nome: 'Registrado' }], linhas)
  );
}

/* ===================== balanço energético ===================== */

function blocoEnergia(en, banco, comp, treinos) {
  const linhas = en.linhas.slice().reverse().map((l) => {
    const dist = diasEntre(l.data, en.hoje);
    const nomes = l.atividades.map((a) => {
      if (a.tipo === 'academia') {
        const s = treinos.sessoes.find((x) => x.id === a.sessao);
        return s ? s.id : a.sessao;
      }
      return 'pedal';
    });
    return {
      dataset: l.hoje ? { destaque: 'true' } : {},
      celulas: [
        h('span', null, dataCurta(l.data),
          h('small.texto-3', { texto: dist === 0 ? ' · hoje' : ` · há ${dist}d` }),
          nomes.length ? h('small.texto-3', { texto: ' · ' + nomes.join('+') }) : null),
        l.gasto || h('span.texto-3', { texto: '—' }),
        l.confiavel ? l.alvo : h('span.texto-3', { texto: '—' }),
        l.consumido || h('span.texto-3', { texto: '—' }),
        l.confiavel
          ? h('span', null,
              h('span', {
                estilo: { color: Math.abs(l.saldo) <= 200 ? 'var(--c-ok)' : l.saldo < 0 ? 'var(--c-atencao)' : 'var(--c-info)' },
                texto: `${l.saldo > 0 ? '+' : ''}${l.saldo}`
              }),
              l.fechado ? h('small.texto-3', { texto: ' · fechado' }) : null
            )
          : h('span.texto-3', { texto: l.registrou ? 'só treino' : 'sem registro' })
      ]
    };
  });

  const balanco = en.saldo;

  return secao(`Gasto e compensação (${en.janelaDias} dias)`,
    h('div.grade.grade-3', null,
      h('div.metrica', { estilo: { '--accent': 'var(--c-pedal)' } },
        h('div.metrica-label', { texto: 'Gasto na janela' }),
        h('div.metrica-valor', null, h('b.num', { texto: String(en.gasto) })),
        h('div.metrica-nota', { texto: en.mediaGasto ? `~${en.mediaGasto} kcal/dia ativo` : 'kcal' })
      ),
      h('div.metrica', { estilo: { '--accent': 'var(--c-nutricao)' } },
        h('div.metrica-label', { texto: 'Alvo × consumido' }),
        h('div.metrica-valor', null, h('b.num', { texto: `${en.consumido}/${en.alvo}` })),
        h('div.metrica-nota', {
          texto: `kcal em ${en.diasConfiaveis} de ${en.janelaDias} dias contáveis`
        })
      ),
      h('div.metrica', { dataset: { nivel: Math.abs(balanco) <= 500 ? 'ok' : 'atencao' } },
        h('div.metrica-label', { texto: 'Balanço' }),
        h('div.metrica-valor', null, h('b.num', { texto: `${balanco > 0 ? '+' : ''}${balanco}` })),
        h('div.metrica-nota', {
          texto: en.diasConfiaveis
            ? `${balanco < 0 ? 'abaixo' : 'acima'} do alvo · ~${en.mediaSaldo > 0 ? '+' : ''}${en.mediaSaldo}/dia`
            : 'nenhum dia contável'
        })
      )
    ),

    // Sem essa distinção o app lia "não anotei" como "não comi" e alimentava o
    // banco calórico com déficits que nunca existiram.
    en.diasConfiaveis < en.janelaDias
      ? h('div.linha.mt-3', null,
          h('span.legenda.esticar', {
            texto: `${en.janelaDias - en.diasConfiaveis} dia(s) fora da conta`
          }),
          ajuda('Um dia só entra no balanço se tiver refeição registrada ou estiver marcado como fechado em Comer. Dia sem nada anotado não é dia de déficit — é dia sem dado, e por isso fica de fora.',
            'Dias fora da conta'))
      : null,

    banco.saldo > 0
      ? h('div.mt-3', null, aviso({
          nivel: 'atencao',
          titulo: `${banco.titulo}: ${banco.saldo} kcal a repor`,
          texto: `${banco.gerado} kcal ficaram acima do teto de ${comp.tetoKcalDia} nos últimos ${banco.janelaDias} dias e ${banco.reposto} já foram repostas.`
            + (banco.semDado ? ` Atenção: ${banco.semDado} kcal vêm de dias sem refeição registrada — você pode ter reposto e não anotado.` : '')
            + ` ${comp.banco.nota}`
        }))
      : null,

    h('div.mt-3', null, tabela(
      [{ nome: 'Dia' }, { nome: 'Gasto', classe: 'num' }, { nome: 'Alvo', classe: 'num' },
       { nome: 'Comido', classe: 'num' }, { nome: 'Saldo', classe: 'num' }],
      linhas
    )),
    ajudaLinha([comp.regra,
      `Taxas usadas: ${comp.atividades.map(taxaTexto).join(' · ')}.`,
      'O valor de cada registro é editável em Treinar.'], 'Como o balanço é calculado'),
    comp.divergenciaGasto
      ? h('div.mt-3', null, aviso({
          nivel: comp.divergenciaGasto.nivel,
          titulo: comp.divergenciaGasto.titulo,
          texto: `${comp.divergenciaGasto.texto} ${comp.divergenciaGasto.consequencia}`
        }))
      : null
  );
}

/* ===================== taxa medida × taxa usada ===================== */

// Cada gasto corrigido à mão é uma medição. Acumuladas, elas dizem se a taxa
// do plano está errada — o que uma correção isolada nunca prova.
function blocoMedicoes(med) {
  if (!med.grupos.length) {
    return secao('Sua taxa real de gasto',
      card(
        h('p.texto-2', { texto: `Nenhuma medição ainda. Sempre que o ciclocomputador ou o relógio der outro número, corrija o gasto do registro em Treinar: a partir de ${med.minimoMedicoes} correções do mesmo tipo de treino o app compara a sua taxa real com a taxa do plano.` })
      )
    );
  }

  const linhas = med.grupos.map((g) => ({
    dataset: g.sugereRevisar ? { destaque: 'true' } : {},
    celulas: [
      h('span', null, g.perfil ? `${g.tipo} ${g.perfil}` : g.tipo,
        h('small.texto-3', { texto: ` · ${g.n} medição${g.n === 1 ? '' : 'ões'}` })),
      g.taxaAtual,
      h('b.num', { texto: String(g.taxaMedida) }),
      h('span', {
        estilo: { color: Math.abs(g.desvioPerc) < 10 ? 'var(--c-ok)' : 'var(--c-atencao)' },
        texto: `${g.desvioPerc > 0 ? '+' : ''}${g.desvioPerc}%`
      }),
      g.sugereRevisar
        ? chip('revisar a taxa', 'atencao')
        : g.faltamMedicoes
          ? h('span.texto-3', { texto: `faltam ${g.faltamMedicoes}` })
          : chip('taxa confere', 'ok')
    ]
  }));

  const revisar = med.grupos.filter((g) => g.sugereRevisar);

  return secao('Sua taxa real de gasto',
    tabela(
      [{ nome: 'Treino' }, { nome: 'Plano', classe: 'num' }, { nome: 'Medido', classe: 'num' },
       { nome: 'Desvio', classe: 'num' }, { nome: 'Situação' }],
      linhas
    ),
    ajudaLinha('Os números são kcal por hora. "Plano" é a taxa que o app usa para estimar o gasto; "medido" é a média das suas correções manuais. Corrigir o gasto de um registro em Treinar alimenta esta tabela.',
      'Plano × medido'),
    revisar.length
      ? h('div.mt-3', null, aviso({
          nivel: 'atencao',
          titulo: 'A taxa do plano está fora do que você mede',
          texto: revisar.map((g) => `${g.perfil ? `${g.tipo} ${g.perfil}` : g.tipo}: ${g.taxaMedida} kcal/h medido contra ${g.taxaAtual} do plano (${g.desvioPerc > 0 ? '+' : ''}${g.desvioPerc}%) em ${g.n} medições`).join('; ') + '. Vale trocar a taxa no plano — cada 10% de erro aqui vira ~100 kcal por hora de pedal no seu alvo do dia.'
        }))
      : null,
    med.nota ? ajudaLinha(med.nota, 'Por que revisar a taxa') : null
  );
}

function taxaTexto(a) {
  if (a.perfis) {
    return `${a.nome} ${a.perfis.map((p) => p.kcalPorHora ? `${p.id} ${p.kcalPorHora} kcal/h` : `${p.id} pela curva`).join(', ')}`;
  }
  return `${a.nome} ${a.kcalPorHora} kcal/h${a.estimado ? ' (estimado)' : ''}`;
}

/* ===================== aderência aos suplementos ===================== */

// A checklist mostra hoje; nunca mostra a série. Um essencial em zero há duas
// semanas é invisível numa tela que só pergunta "tomou hoje?".
function blocoSuplementos(a) {
  if (!a.itens.length) return h('div');

  const linhas = a.ordenado.map((i) => ({
    dataset: i.nunca ? { destaque: 'true' } : {},
    celulas: [
      h('span', null, i.nome,
        i.prioridade === 'essencial' ? h('small.texto-3', { texto: ' · essencial' }) : null),
      `${i.feitos}/${i.aplicaveis}`,
      i.perc === null
        ? h('span.texto-3', { texto: 'nenhum dia aplicável' })
        : h('span', {
            estilo: {
              color: i.perc >= 80 ? 'var(--c-ok)' : i.perc === 0 ? 'var(--c-critico)' : 'var(--c-atencao)'
            },
            texto: i.perc + '%'
          })
    ]
  }));

  return secao(`Suplementos na janela (${a.janelaDias} dias)`,
    tabela([{ nome: 'Item' }, { nome: 'Dias', classe: 'num' }, { nome: 'Aderência', classe: 'num' }], linhas),
    a.essenciaisEmZero.length
      ? h('div.mt-3', null, aviso({
          nivel: 'critico',
          titulo: a.essenciaisEmZero.length === 1
            ? `${a.essenciaisEmZero[0]}: nenhuma marcação na janela`
            : `${a.essenciaisEmZero.length} essenciais sem nenhuma marcação na janela`,
          texto: `${a.essenciaisEmZero.join(', ')} — classificados como essenciais por deficiência medida ou alvo clínico ativo, e sem um único dia marcado nos últimos ${a.janelaDias} dias.`
        }))
      : null,
    ajudaLinha('Só entra aqui o que não é alimento. O whey mora no cardápio, e os macros dele entram pela composição da refeição — contá-lo também aqui somaria o mesmo item duas vezes.',
      'O que conta como suplemento')
  );
}

/* ===================== volume por grupo ===================== */

function blocoVolume(jan) {
  const grupos = Object.keys(jan.alvoVolume)
    .filter((g) => jan.alvoVolume[g] > 0)
    .sort((a, b) => (jan.volume[b] || 0) - (jan.volume[a] || 0) || jan.alvoVolume[b] - jan.alvoVolume[a]);

  const linhas = grupos.map((g) => {
    const feito = jan.volume[g] || 0;
    const alvo = jan.alvoVolume[g];
    const perc = Math.round((feito / alvo) * 100);
    const lim = jan.limites.find((l) => l.grupo === g);
    return {
      dataset: lim && lim.estourado ? { destaque: 'true' } : {},
      celulas: [
        h('span', null, g, lim ? h('small.texto-3', { texto: ` · limite ${lim.maxJanela}` }) : null),
        feito,
        alvo,
        h('span', {
          estilo: { color: perc >= 100 ? 'var(--c-ok)' : perc >= 50 ? 'inherit' : 'var(--c-atencao)' },
          texto: perc + '%'
        })
      ]
    };
  });

  return secao('Volume por grupo na janela',
    tabela(
      [{ nome: 'Grupo' }, { nome: 'Feito', classe: 'num' }, { nome: 'Alvo', classe: 'num' }, { nome: '%', classe: 'num' }],
      linhas
    ),
    ajudaLinha('Alvo é o volume semanal previsto na série. O feito vem das sessões efetivamente registradas na janela — se você treinou e não registrou, não conta aqui.',
      'De onde vem o volume')
  );
}

/* ===================== limites clínicos ===================== */

function blocoLimites(jan) {
  return secao('Limites clínicos',
    h('div.pilha-2', null, jan.limites.map((l) => h('div.card.card-compacto', {
      estilo: { '--accent': l.estourado ? 'var(--c-critico)' : 'var(--c-ok)' }
    },
      h('div.linha', null,
        h('h4.esticar', { texto: l.grupo }),
        chip(`${l.atual} / ${l.maxJanela} sets`, l.estourado ? 'critico' : l.atual === l.maxJanela ? 'atencao' : 'ok')
      ),
      h('p.texto-2.texto-sm.mt-2', { texto: l.motivo })
    )))
  );
}

/* ===================== próxima sessão e bloqueios ===================== */

function blocoProxima(jan) {
  const p = jan.proxima;
  return secao('Próxima sessão',
    p.escolhida
      ? h('div.card', { estilo: { '--accent': 'var(--c-treino)' } },
          h('h3', { texto: `${p.escolhida.sessao.id} — ${p.escolhida.sessao.nome}` }),
          h('div.chip-linha.mt-2', null, chip(p.escolhida.categoria, 'accent')),
          p.escolhida.bloqueios.length
            ? h('p.legenda.mt-2', { texto: 'Com ressalva: ' + p.escolhida.bloqueios.map((b) => b.texto).join('; ') + '.' })
            : h('p.legenda.mt-2', { texto: 'Sem restrição: respeita a ordem de prioridade, os intervalos de recuperação e os limites clínicos.' })
        )
      : aviso({ nivel: 'atencao', titulo: 'Nenhuma sessão liberada', texto: 'Todas as opções estão bloqueadas — ver os motivos abaixo.' }),
    h('h4.mt-4', { texto: 'Por que cada sessão foi ou não escolhida' }),
    h('div.mt-2', null, tabela(
      [{ nome: 'Sessão' }, { nome: 'Categoria' }, { nome: 'Situação' }],
      p.candidatos.map((c) => ({
        dataset: p.escolhida && c.sessao.id === p.escolhida.sessao.id ? { destaque: 'true' } : {},
        celulas: [
          `${c.sessao.id} — ${c.sessao.nome}`,
          c.categoria,
          c.livre
            ? chip('liberada', 'ok')
            : h('span', null,
                c.temDuro ? chip('bloqueada', 'critico') : chip('com ressalva', 'atencao'),
                h('small.texto-3', { texto: ' ' + c.bloqueios.map((b) => b.texto).join('; ') })
              )
        ]
      }))
    ))
  );
}

/* ===================== agenda de referência ===================== */

function blocoReferencia(perfil, treinos) {
  return secao('Distribuição de referência',
    card(
      h('p.texto-2', { texto: perfil.agenda.nota }),
      h('div.mt-3', null, tabela(
        [{ nome: 'Dia' }, { nome: 'Academia' }, { nome: 'Pedal' }],
        perfil.agenda.dias
          .slice()
          .sort((a, b) => ((a.diaSemana + 6) % 7) - ((b.diaSemana + 6) % 7))
          .map((d) => [d.curto, d.treino || '—', d.pedal || '—'])
      ))
    )
  );
}

/* ===================== ponteiro para o backup ===================== */

// Exportar/importar mora numa tela só, em Consultar → Backup. Duas portas para
// a mesma coisa foi o que fez o usuário não achar o que procurava antes.
function blocoDados(registro, ctx) {
  return secao('Seus registros',
    card(
      h('div.linha', null,
        h('span.texto-2.esticar', { texto: `${registro.totalDias()} dia(s) registrado(s) neste aparelho.` }),
        ajuda('O app é estático e não tem servidor: o registro vive no navegador deste aparelho e some ao limpar os dados do site. Não há sincronização entre celular e computador — por isso existe o backup.',
          'Onde o registro fica')),
      h('button.btn.btn-secundario.mt-3', {
        type: 'button', onClick: () => ctx.navegar('#/backup')
      }, icone('escudo'), 'Exportar, importar e backup no Drive')
    )
  );
}
