// Aba "Semana" — janela móvel de 7 dias: o que foi feito, o que falta, como o
// volume por grupo se compara ao alvo semanal e o que priorizar se apertar.

import {
  h, icone, cabecalhoPagina, aviso, chip, card, cardTitulado, tabela, lista,
  secao, dataBR, dataCurta, toast
} from '../ui.js';
import { resumoJanela, resumoEnergetico, bancoCalorico, diasEntre } from '../motor.js';
import { barrasHorizontais } from '../charts.js';

export async function render(ctx) {
  const { store, registro } = ctx;
  const [perfil, treinos, nutricao, pedal] = await store.docs('perfil', 'treinos', 'nutricao', 'pedal');
  const dados = { perfil, treinos, nutricao, pedal };
  const jan = resumoJanela(dados, registro);
  const energia = resumoEnergetico(dados, registro);
  const banco = bancoCalorico(dados, registro);

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

  return h('div.grade.grade-3', null,
    meta('Academia', jan.academias.length, jan.metaAcademia,
      jan.faltamAcademia ? `faltam ${jan.faltamAcademia}` : 'meta batida'),
    meta('Pedal', jan.pedais.length, jan.metaPedal,
      jan.faltamPedal ? `faltam ${jan.faltamPedal}` : 'meta batida'),
    meta('Rolo', jan.rolos.length, jan.metaRolo, 'sweet spot')
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
  for (const a of [...jan.academias, ...jan.pedais, ...jan.rolos]) {
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
                a.tipo === 'academia' ? (s ? `${s.id} — ${s.nome}` : a.sessao) : a.tipo === 'rolo' ? 'Rolo' : 'Pedal',
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
      return a.tipo === 'rolo' ? 'rolo' : 'pedal';
    });
    return {
      dataset: l.hoje ? { destaque: 'true' } : {},
      celulas: [
        h('span', null, dataCurta(l.data),
          h('small.texto-3', { texto: dist === 0 ? ' · hoje' : ` · há ${dist}d` }),
          nomes.length ? h('small.texto-3', { texto: ' · ' + nomes.join('+') }) : null),
        l.gasto || h('span.texto-3', { texto: '—' }),
        l.registrou ? l.alvo : h('span.texto-3', { texto: '—' }),
        l.consumido || h('span.texto-3', { texto: '—' }),
        l.registrou
          ? h('span', {
              estilo: { color: Math.abs(l.saldo) <= 200 ? 'var(--c-ok)' : l.saldo < 0 ? 'var(--c-atencao)' : 'var(--c-info)' },
              texto: `${l.saldo > 0 ? '+' : ''}${l.saldo}`
            })
          : h('span.texto-3', { texto: 'sem registro' })
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
        h('div.metrica-nota', { texto: 'kcal, só dias com registro' })
      ),
      h('div.metrica', { dataset: { nivel: Math.abs(balanco) <= 500 ? 'ok' : 'atencao' } },
        h('div.metrica-label', { texto: 'Balanço' }),
        h('div.metrica-valor', null, h('b.num', { texto: `${balanco > 0 ? '+' : ''}${balanco}` })),
        h('div.metrica-nota', { texto: balanco < 0 ? 'abaixo do alvo' : 'acima do alvo' })
      )
    ),

    banco.saldo > 0
      ? h('div.mt-3', null, aviso({
          nivel: 'atencao',
          titulo: `${banco.titulo}: ${banco.saldo} kcal a repor`,
          texto: `${banco.gerado} kcal ficaram acima do teto de ${comp.tetoKcalDia} nos últimos ${banco.janelaDias} dias e ${banco.reposto} já foram repostas. ${comp.banco.nota}`
        }))
      : null,

    h('div.mt-3', null, tabela(
      [{ nome: 'Dia' }, { nome: 'Gasto', classe: 'num' }, { nome: 'Alvo', classe: 'num' },
       { nome: 'Comido', classe: 'num' }, { nome: 'Saldo', classe: 'num' }],
      linhas
    )),
    h('p.legenda.mt-2', { texto: comp.regra }),
    h('p.legenda.mt-2', {
      texto: `Taxas usadas: ${comp.atividades.map(taxaTexto).join(' · ')}. O valor de cada registro é editável em Hoje.`
    }),
    comp.divergenciaGasto
      ? h('div.mt-3', null, aviso({
          nivel: comp.divergenciaGasto.nivel,
          titulo: comp.divergenciaGasto.titulo,
          texto: `${comp.divergenciaGasto.texto} ${comp.divergenciaGasto.consequencia}`
        }))
      : null
  );
}

function taxaTexto(a) {
  if (a.perfis) {
    return `${a.nome} ${a.perfis.map((p) => p.kcalPorHora ? `${p.id} ${p.kcalPorHora} kcal/h` : `${p.id} pela curva`).join(', ')}`;
  }
  return `${a.nome} ${a.kcalPorHora} kcal/h${a.estimado ? ' (estimado)' : ''}`;
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
    h('p.legenda.mt-2', { texto: 'Alvo = volume semanal da série. Somado a partir das sessões efetivamente registradas na janela.' })
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

/* ===================== exportar / importar ===================== */

function blocoDados(registro, ctx) {
  const entrada = h('input', { type: 'file', accept: 'application/json', estilo: { display: 'none' } });

  entrada.addEventListener('change', async () => {
    const arq = entrada.files && entrada.files[0];
    if (!arq) return;
    try {
      const n = registro.importar(await arq.text());
      toast(`${n} dia${n === 1 ? '' : 's'} importado${n === 1 ? '' : 's'}.`);
      ctx.recarregar();
    } catch (e) {
      toast('Não foi possível importar: ' + ((e && e.message) || e));
    } finally {
      entrada.value = '';
    }
  });

  const exportar = () => {
    const blob = new Blob([registro.exportar()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registro-rotina-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Registro exportado.');
  };

  return secao('Seus registros',
    card(
      h('p.texto-2', {
        texto: `${registro.totalDias()} dia(s) registrado(s) neste dispositivo. Como o app é estático e não tem servidor, o registro fica no navegador — exporte de vez em quando para não perder ao limpar os dados do site ou trocar de aparelho.`
      }),
      h('div.linha.mt-3', null,
        h('button.btn.btn-secundario', { type: 'button', onClick: exportar }, 'Exportar registro'),
        h('button.btn.btn-secundario', { type: 'button', onClick: () => entrada.click() }, 'Importar'),
        entrada
      )
    )
  );
}
