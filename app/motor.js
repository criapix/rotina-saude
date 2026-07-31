// Motor de ajuste: transforma o que foi REGISTRADO no que deve ser ORIENTADO.
//
// Não há dia fixo da semana. Tudo parte de duas perguntas:
//   1. O que foi feito na janela móvel de 7 dias? -> o que falta e qual a
//      próxima sessão.
//   2. O que foi feito e ingerido HOJE? -> alvo do dia e o que resta comer.
//
// Funções puras: recebem dados + registro e devolvem objetos de resumo. Toda
// regra numérica vem de treinos.plano, pedal.plano e nutricao.tiposDia — sem
// constante clínica escondida no código.

import { hojeISO } from './store.js';

const DIA_MS = 864e5;

/* ===================== utilidades de data ===================== */

export function diasEntre(isoA, isoB) {
  return Math.round((Date.parse(isoB + 'T00:00:00Z') - Date.parse(isoA + 'T00:00:00Z')) / DIA_MS);
}

/** Datas ISO da janela, da mais antiga até hoje (inclusive). */
export function janela(dias, ref = new Date()) {
  const out = [];
  for (let i = dias - 1; i >= 0; i--) out.push(hojeISO(new Date(ref.getTime() - i * DIA_MS)));
  return out;
}

/* ===================== gasto calórico ===================== */

/** Interpola uma curva [[min, kcal], ...] e extrapola pela taxa marginal final. */
function daCurva(curva, min, kcalPorHoraAcima) {
  if (min <= curva[0][0]) return Math.round(curva[0][1] * min / curva[0][0]);
  for (let i = 0; i < curva.length - 1; i++) {
    const [m0, v0] = curva[i], [m1, v1] = curva[i + 1];
    if (min <= m1) return Math.round(v0 + (v1 - v0) * (min - m0) / (m1 - m0));
  }
  const [mUlt, vUlt] = curva[curva.length - 1];
  return Math.round(vUlt + ((min - mUlt) / 60) * kcalPorHoraAcima);
}

/**
 * Gasto de uma atividade registrada. Se o registro traz `kcal` (o usuário
 * corrigiu pelo ciclocomputador), esse valor manda.
 */
export function gastoDaAtividade(atividade, compensacao) {
  if (Number.isFinite(atividade.kcal)) return Math.round(atividade.kcal);

  const def = compensacao.atividades.find((a) => a.id === atividade.tipo);
  if (!def) return 0;
  const min = Number.isFinite(atividade.duracaoMin) ? atividade.duracaoMin : def.duracaoPadraoMin;

  if (def.perfis) {
    const perfil = def.perfis.find((p) => p.id === atividade.perfil)
      || def.perfis.find((p) => p.padrao)
      || def.perfis[0];
    if (perfil.curvaMin) return daCurva(perfil.curvaMin, min, perfil.kcalPorHoraAcimaDaCurva);
    return Math.round((perfil.kcalPorHora * min) / 60);
  }
  return Math.round((def.kcalPorHora * min) / 60);
}

/** Soma o gasto de uma lista de atividades. */
export function gastoTotal(atividades, compensacao) {
  return atividades.reduce((a, at) => a + gastoDaAtividade(at, compensacao), 0);
}

/**
 * Alvo do dia a partir do gasto: base + gasto, limitado ao teto. Proteína e
 * gordura ficam fixas; o excedente aceito vira carboidrato.
 */
export function alvoPorGasto(compensacao, gasto) {
  const c = compensacao;
  const bruto = c.baseKcal + gasto;
  const kcal = Math.min(bruto, c.tetoKcalDia);
  const gastoAceito = kcal - c.baseKcal;
  return {
    gasto,
    bruto,
    kcal,
    p: c.proteinaFixaG,
    g: c.gorduraFixaG,
    c: Math.round(c.baseCarboG + gastoAceito / 4),
    cortadoPeloTeto: bruto - kcal,
    noTeto: bruto > c.tetoKcalDia
  };
}

/** Combustível sugerido para uma atividade de pedal, pela duração. */
export function combustivelDoPedal(atividades, compensacao) {
  const min = atividades
    .filter((a) => a.tipo === 'pedal' || a.tipo === 'rolo')
    .reduce((a, at) => a + (at.duracaoMin || 0), 0);
  if (!min) return null;

  const horas = min / 60;
  const ia = compensacao.intraAtividade;
  const [minH, maxH] = ia.alvoCarboPorHora;
  const gel = ia.itens.find((i) => /gel/i.test(i.nome));
  const iso = ia.itens.find((i) => /isot/i.test(i.nome));
  const bala = ia.itens.find((i) => /bala/i.test(i.nome));

  const nGel = Math.round(horas);
  const mlIso = Math.round(horas * 500);
  // gel + isotônico dão ~55 g/h e não alcançam o alvo: a bala de goma fecha a
  // diferença. Arredonda para o pacote mais próximo — arredondar para cima
  // passaria dos 70 g/h e é mais carboidrato do que o estômago aceita.
  const carboBase = nGel * gel.carboG + (mlIso / 500) * iso.carboG;
  const alvoCarbo = Math.round(horas * maxH);
  const nBala = Math.max(0, Math.round((alvoCarbo - carboBase) / bala.carboG));

  const itens = [`${nGel} gel`, `${mlIso} ml de isotônico`];
  if (nBala) itens.push(`${nBala} pacote${nBala > 1 ? 's' : ''} de bala de goma`);

  const carbo = carboBase + nBala * bala.carboG;
  return {
    duracaoMin: min,
    horas,
    itens: itens.join(' + '),
    carboG: Math.round(carbo),
    kcal: Math.round(nGel * gel.kcal + (mlIso / 500) * iso.kcal + nBala * bala.kcal),
    faixaAlvo: `${Math.round(horas * minH)}–${alvoCarbo} g`
  };
}

/**
 * Reforço de carboidrato: escolhe itens do cardápio para cobrir um excedente de
 * calorias, do mais denso para o menos, sem passar muito do alvo.
 */
export function sugerirReforco(compensacao, kcalFaltando) {
  if (kcalFaltando < 100) return null;
  const itens = compensacao.reforcos.itens.slice().sort((a, b) => b.kcal - a.kcal);
  const escolhidos = [];
  let resta = kcalFaltando;
  for (const it of itens) {
    const n = Math.floor(resta / it.kcal);
    if (n < 1) continue;
    const usar = Math.min(n, 3); // no máximo 3 porções do mesmo item
    escolhidos.push({ ...it, porcoes: usar });
    resta -= usar * it.kcal;
    if (resta < 100) break;
  }
  if (!escolhidos.length) return null;
  const kcal = escolhidos.reduce((a, i) => a + i.porcoes * i.kcal, 0);
  return {
    alvoKcal: kcalFaltando,
    kcal,
    carboG: escolhidos.reduce((a, i) => a + i.porcoes * i.carboG, 0),
    texto: escolhidos.map((i) => `${i.porcoes}× ${i.nome} (${i.medida})`).join(' + ')
  };
}

/* ===================== tipo de dia derivado ===================== */

/**
 * O tipo de dia deixa de vir do calendário e passa a vir do que foi
 * registrado: pedal + academia = duplo, e assim por diante.
 */
export function tipoDiaDe(atividades) {
  const temPedal = atividades.some((a) => a.tipo === 'pedal');
  const temAcademia = atividades.some((a) => a.tipo === 'academia');
  if (temPedal && temAcademia) return 'duplo';
  if (temAcademia) return 'academia';
  if (temPedal) return 'pedal';
  return 'descanso';
}

/* ===================== resumo do dia ===================== */

/**
 * Alvo do dia (derivado das atividades), o que já foi ingerido e o que resta.
 * `provisorio` = ainda não há atividade registrada, então o alvo é de descanso
 * e sobe se algo for registrado.
 */
export function resumoDia(dados, registro, dataISO = hojeISO()) {
  const { nutricao, treinos } = dados;
  const dia = registro.dia(dataISO);
  const atividades = dia.atividades || [];

  const tipoId = tipoDiaDe(atividades);
  const tipo = nutricao.tiposDia.find((t) => t.id === tipoId) || nutricao.tiposDia[0];

  const consumido = (dia.refeicoes || []).reduce(
    (a, r) => ({ p: a.p + r.p, g: a.g + r.g, c: a.c + r.c, kcal: a.kcal + r.kcal }),
    { p: 0, g: 0, c: 0, kcal: 0 }
  );

  // O alvo vem do gasto registrado, não do degrau fixo: base + gasto, limitado
  // ao teto. O tipo de dia continua servindo de molde para o cardápio.
  const comp = nutricao.compensacao;
  const gasto = gastoTotal(atividades, comp);
  const derivado = alvoPorGasto(comp, gasto);
  const alvo = { p: derivado.p, g: derivado.g, c: derivado.c, kcal: derivado.kcal };
  const restante = {
    p: alvo.p - consumido.p,
    g: alvo.g - consumido.g,
    c: alvo.c - consumido.c,
    kcal: alvo.kcal - consumido.kcal
  };

  const feitas = new Set((dia.refeicoes || []).map((r) => r.id));
  const pendentes = tipo.refeicoes.filter((r) => !feitas.has(r.id));

  const sessoes = atividades
    .filter((a) => a.tipo === 'academia' && a.sessao)
    .map((a) => treinos.sessoes.find((s) => s.id === a.sessao))
    .filter(Boolean);

  const resumo = {
    dataISO,
    atividades,
    tipoId,
    tipo,
    sessoes,
    alvo,
    derivado,
    gasto,
    consumido,
    restante,
    pendentes,
    combustivel: combustivelDoPedal(atividades, comp),
    reforco: sugerirReforco(comp, alvo.kcal - tipo.kcal),
    percKcal: alvo.kcal ? Math.min(100, Math.round((consumido.kcal / alvo.kcal) * 100)) : 0,
    provisorio: atividades.length === 0
  };
  resumo.orientacoes = orientacoesDoDia(nutricao, resumo);
  return resumo;
}

/**
 * Banco calórico: o gasto que o teto diário cortou nos últimos dias, menos o
 * que já foi reposto comendo acima do alvo.
 */
export function bancoCalorico(dados, registro, ref = new Date()) {
  const comp = dados.nutricao.compensacao;
  const dias = janela(comp.banco.janelaDias, ref);

  let gerado = 0;
  let reposto = 0;
  const detalhe = [];

  for (const d of dias) {
    const dia = registro.dia(d);
    const atividades = dia.atividades || [];
    const gasto = gastoTotal(atividades, comp);
    const alvo = alvoPorGasto(comp, gasto);
    const consumido = (dia.refeicoes || []).reduce((a, r) => a + r.kcal, 0);

    gerado += alvo.cortadoPeloTeto;
    const acima = Math.max(0, consumido - alvo.kcal);
    reposto += acima;

    if (alvo.cortadoPeloTeto > 0 || acima > 0) {
      detalhe.push({ data: d, gasto, cortado: alvo.cortadoPeloTeto, acimaDoAlvo: acima });
    }
  }

  return {
    janelaDias: comp.banco.janelaDias,
    gerado,
    reposto,
    saldo: Math.max(0, gerado - reposto),
    detalhe,
    titulo: comp.banco.titulo,
    descricao: comp.banco.descricao
  };
}

/**
 * Balanço energético da janela: gasto, alvo derivado e consumido de cada dia,
 * mais os totais. É o que a aba Semana precisa para mostrar se a compensação
 * está acontecendo.
 */
export function resumoEnergetico(dados, registro, ref = new Date()) {
  const comp = dados.nutricao.compensacao;
  const dias = janela(dados.treinos.plano.janelaDias, ref);
  const hoje = dias[dias.length - 1];

  const linhas = dias.map((data) => {
    const dia = registro.dia(data);
    const atividades = dia.atividades || [];
    const gasto = gastoTotal(atividades, comp);
    const alvo = alvoPorGasto(comp, gasto);
    const consumido = (dia.refeicoes || []).reduce((a, r) => a + r.kcal, 0);
    const registrou = atividades.length > 0 || (dia.refeicoes || []).length > 0;
    return {
      data,
      hoje: data === hoje,
      atividades,
      gasto,
      alvo: alvo.kcal,
      cortadoPeloTeto: alvo.cortadoPeloTeto,
      consumido,
      // sem nada registrado não há saldo: um dia em branco é falta de registro,
      // não um déficit de 2300 kcal
      saldo: registrou ? consumido - alvo.kcal : 0,
      registrou
    };
  });

  const somar = (campo) => linhas.reduce((a, l) => a + l[campo], 0);
  const comRegistro = linhas.filter((l) => l.registrou);

  return {
    janelaDias: dias.length,
    dias,
    hoje,
    linhas,
    gasto: somar('gasto'),
    alvo: somar('alvo'),
    consumido: somar('consumido'),
    saldo: somar('saldo'),
    diasComRegistro: comRegistro.length,
    mediaGasto: comRegistro.length ? Math.round(somar('gasto') / comRegistro.length) : 0
  };
}

function formatarDuracao(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export { formatarDuracao };

/** Orientações que mudam conforme o registro. A view só renderiza. */
function orientacoesDoDia(nutricao, r) {
  const av = [];
  const hora = new Date().getHours();
  const { tipo, tipoId, alvo, derivado, restante, consumido, pendentes, sessoes, atividades, combustivel, reforco } = r;
  let jaAvisouDeficitKcal = false;

  // O alvo subiu depois de já ter comido como dia mais leve.
  if (tipoId !== 'descanso' && consumido.kcal > 0) {
    const descanso = nutricao.tiposDia.find((t) => t.id === 'descanso');
    if (descanso && alvo.kcal > descanso.kcal && consumido.kcal < descanso.kcal && restante.kcal > 0) {
      av.push({
        nivel: 'atencao',
        titulo: `Alvo do dia subiu para ${alvo.kcal} kcal`,
        texto: `O gasto registrado (${derivado.gasto} kcal) elevou o alvo. Faltam ${restante.kcal} kcal e ${restante.c} g de carboidrato — priorize carboidrato ao redor da atividade.`
      });
      jaAvisouDeficitKcal = true;
    }
  }

  // Janela anabólica: a refeição é identificada por marcação no dado
  // (janelaAnabolica), não pelo id — renomear a refeição não quebra a regra.
  const anabolicaPendente = pendentes.find((x) => x.janelaAnabolica);
  if (atividades.length && anabolicaPendente) {
    const pedalou = atividades.some((a) => a.tipo === 'pedal');
    av.push({
      nivel: 'critico',
      titulo: `${anabolicaPendente.nome} pendente`,
      texto: pedalou
        ? `${anabolicaPendente.itens} em até 30 min após desmontar — não esperar o almoço.`
        : `${anabolicaPendente.itens} logo após o treino.`
    });
  }

  // Colágeno antes dos treinos de perna.
  if (sessoes.some((s) => ['B', 'D'].includes(s.id))) {
    av.push({
      nivel: 'info',
      titulo: 'Treino de perna hoje',
      texto: 'Colágeno hidrolisado 15 g + vitamina C 50 mg 60 min antes — proteção do tendão quadricipital.'
    });
  }

  // Regra do relógio no intra-treino (também marcado no dado).
  const relogioPendente = pendentes.find((x) => x.regraDoRelogio);
  if (sessoes.length && relogioPendente) {
    av.push({
      nivel: 'info',
      titulo: `${relogioPendente.nome} — ${relogioPendente.hora}`,
      texto: `${relogioPendente.itens}. Pelo relógio, não pela sensação.`
    });
  }

  // Combustível durante o pedal, dimensionado pela duração.
  if (combustivel) {
    av.push({
      nivel: combustivel.horas >= 2 ? 'critico' : 'info',
      titulo: `Combustível para ${formatarDuracao(combustivel.duracaoMin)} de pedal`,
      texto: `${combustivel.itens} — ${combustivel.carboG} g de carboidrato (alvo ${combustivel.faixaAlvo}). Sem isso, um pedal longo abre um buraco que não fecha comendo depois.`
    });
  }

  // O teto cortou parte do gasto: o resto vai para o banco.
  if (derivado.noTeto) {
    av.push({
      nivel: 'atencao',
      titulo: `Gasto acima do que cabe num dia`,
      texto: `O gasto foi de ${derivado.gasto} kcal, o que daria um alvo de ${derivado.bruto} kcal. O teto realista é ${alvo.kcal}, então ${derivado.cortadoPeloTeto} kcal vão para o banco calórico — reponha nos próximos dias.`
    });
  }

  // O cardápio do tipo de dia não cobre o alvo derivado: sugere reforço.
  if (reforco && restante.kcal > 200) {
    av.push({
      nivel: 'info',
      titulo: `Reforço de ${reforco.kcal} kcal sobre o cardápio`,
      texto: `O cardápio de "${tipo.nome}" fecha ${tipo.kcal} kcal e hoje o alvo é ${alvo.kcal}. Para cobrir: ${reforco.texto}.`
    });
  }

  // Dia duplo.
  if (tipoId === 'duplo') {
    av.push({
      nivel: 'info',
      titulo: 'Dia duplo',
      texto: 'Carboidrato imediatamente após o pedal (malto, banana ou batata-doce) antes da academia. Se a fadiga estiver alta, tirar 1 série dos acessórios — manter os compostos de perna e o supino.'
    });
  }

  // Carboidrato concentrado no fim do dia — só cobra quem já começou a comer.
  if (hora >= 20 && consumido.kcal > 0 && restante.c > alvo.c * 0.3) {
    av.push({
      nivel: 'atencao',
      titulo: 'Muito carboidrato pendente para o horário',
      texto: `Restam ${restante.c} g de carboidrato (${Math.round((restante.c / alvo.c) * 100)}% do dia). Amanhã, adiantar o carbo no café e ao redor da atividade.`
    });
  }

  // Proteína é o macro que não se negocia. Só cobra quem já começou a comer —
  // com o registro vazio isso seria só ruído.
  if (hora >= 19 && consumido.kcal > 0 && restante.p > 40) {
    av.push({
      nivel: 'atencao',
      titulo: `Faltam ${restante.p} g de proteína`,
      texto: 'Proteína é o macro fixo (170 g/dia). Jantar + caseína ou iogurte antes de dormir fecham a conta.'
    });
  }

  // Estourou o alvo.
  if (restante.kcal < -150) {
    av.push({
      nivel: 'atencao',
      titulo: `${Math.abs(restante.kcal)} kcal acima do alvo`,
      texto: `O alvo de hoje é ${alvo.kcal} kcal (base ${derivado.bruto - derivado.gasto} + gasto ${derivado.gasto}). Registrar mais atividade eleva o alvo; sem isso, compense amanhã sem cortar proteína.`
    });
  }

  // BF% no piso: não é dia de cortar caloria. Idem — só depois de comer algo, e
  // sem repetir o número que o aviso de "alvo subiu" já deu.
  if (hora >= 18 && consumido.kcal > 0 && restante.kcal > 400 && !jaAvisouDeficitKcal) {
    av.push({
      nivel: 'atencao',
      titulo: `Faltam ${restante.kcal} kcal`,
      texto: 'Com BF% em 11,7% (piso clínico 11%), ficar abaixo do alvo é o risco maior — não deixe o dia fechar em déficit.'
    });
  }

  // Hidratação conforme o dia virou.
  const pedalHoje = tipoId === 'duplo' || tipoId === 'pedal';
  const hidr = nutricao.hidratacao.porDia.find((h) =>
    pedalHoje ? /pedal/i.test(h.contexto) : /descanso/i.test(h.contexto));
  if (hidr) {
    av.push({ nivel: 'info', titulo: `Hidratação: ${hidr.valor}`, texto: nutricao.hidratacao.regraPratica });
  }

  if (!atividades.length) {
    av.push({
      nivel: 'info',
      titulo: 'Nenhuma atividade registrada hoje',
      texto: `O alvo mostrado é de descanso (${alvo.kcal} kcal). Registre o pedal ou a academia e ele se ajusta ao gasto.`
    });
  }

  return av;
}

/* ===================== resumo da janela móvel ===================== */

/**
 * O que foi feito nos últimos N dias, o que falta, a próxima sessão e o volume
 * por grupo muscular diante dos limites clínicos.
 */
export function resumoJanela(dados, registro, ref = new Date()) {
  const { treinos, pedal } = dados;
  const plano = treinos.plano;
  const dias = janela(plano.janelaDias, ref);
  const hoje = dias[dias.length - 1];

  const execucoes = [];
  for (const d of dias) {
    for (const a of registro.dia(d).atividades || []) execucoes.push({ ...a, data: d });
  }

  const academias = execucoes.filter((e) => e.tipo === 'academia' && e.sessao);
  const pedais = execucoes.filter((e) => e.tipo === 'pedal');
  const rolos = execucoes.filter((e) => e.tipo === 'rolo');

  const volume = volumePorGrupo(treinos, academias);

  const alvoVolume = {};
  for (const l of treinos.volumeSemanal.linhas) {
    if (!l.agregado) alvoVolume[l.grupo] = l.total;
  }

  const limites = plano.limitesClinicos.map((l) => ({
    ...l,
    atual: volume[l.grupo] || 0,
    estourado: (volume[l.grupo] || 0) > l.maxJanela
  }));

  const proxima = proximaSessao(treinos, academias, hoje);
  const alertas = alertasJanela(plano, academias, hoje, limites);

  return {
    dias,
    hoje,
    janelaDias: plano.janelaDias,
    academias,
    pedais,
    rolos,
    feitasIds: academias.map((a) => a.sessao),
    faltamAcademia: Math.max(0, plano.sessoesPorJanela - academias.length),
    faltamPedal: Math.max(0, pedal.plano.sessoesPorJanela - pedais.length),
    metaAcademia: plano.sessoesPorJanela,
    metaPedal: pedal.plano.sessoesPorJanela,
    metaRolo: pedal.plano.rolo.minPorJanela,
    volume,
    alvoVolume,
    limites,
    proxima,
    alertas,
    pendencia: pendenciaDaJanela(plano, academias, hoje)
  };
}

function volumePorGrupo(treinos, academias) {
  const volume = {};
  for (const a of academias) {
    const s = treinos.sessoes.find((x) => x.id === a.sessao);
    if (!s) continue;
    for (const e of s.exercicios) {
      for (const g of e.grupos || []) volume[g] = (volume[g] || 0) + e.series;
    }
  }
  return volume;
}

function alertasJanela(plano, academias, hoje, limites) {
  const alertas = [];

  if (!academias.length) {
    // Um aviso só: repetir "sem superior" e "sem inferior" quando nada foi
    // registrado é ruído.
    alertas.push({
      nivel: 'atencao',
      titulo: `Nenhuma academia registrada nos últimos ${plano.janelaDias} dias`,
      texto: `A meta é ${plano.sessoesPorJanela} sessões na janela. Registre em Hoje o que for fazendo para o app acompanhar.`
    });
  } else {
    for (const regra of plano.alertasCategoria || []) {
      const ultima = academias
        .filter((e) => plano.categorias[e.sessao] === regra.categoria)
        .sort((a, b) => b.data.localeCompare(a.data))[0];
      const d = ultima ? diasEntre(ultima.data, hoje) : null;
      if (d == null || d >= regra.diasSemEstimulo) {
        alertas.push({
          nivel: regra.nivel,
          titulo: d == null
            ? `Sem treino ${regra.categoria} nos últimos ${plano.janelaDias} dias`
            : `Sem treino ${regra.categoria} há ${d} dia${d === 1 ? '' : 's'}`,
          texto: regra.texto
        });
      }
    }
  }

  for (const l of limites.filter((x) => x.estourado)) {
    alertas.push({
      nivel: l.nivel,
      titulo: `${l.grupo}: ${l.atual} sets na janela (limite ${l.maxJanela})`,
      texto: l.motivo
    });
  }

  return alertas;
}

/** Tipos de bloqueio que impedem sugerir uma sessão. */
const BLOQUEIO = {
  limite: { duro: true },
  repetida: { duro: false },
  intervalo: { duro: false },
  categoria: { duro: false }
};

/**
 * Escolhe a próxima sessão respeitando, em ordem:
 *   1. limite clínico por grupo (bloqueio duro — nunca sugerida);
 *   2. não repetir sessão já feita na janela;
 *   3. 24h desde a última sessão e 48h para a mesma categoria;
 *   4. a ordem de prioridade configurada (hoje: superiores primeiro).
 * Devolve o motivo de cada exclusão para a interface poder explicar a escolha.
 */
export function proximaSessao(treinos, academias, hoje) {
  const plano = treinos.plano;
  const feitas = new Set(academias.map((a) => a.sessao));
  const volumeAtual = volumePorGrupo(treinos, academias);

  const ultima = academias.slice().sort((a, b) => b.data.localeCompare(a.data))[0];
  const ultimaPorCategoria = {};
  for (const a of academias) {
    const cat = plano.categorias[a.sessao];
    if (!ultimaPorCategoria[cat] || a.data > ultimaPorCategoria[cat]) ultimaPorCategoria[cat] = a.data;
  }

  const candidatos = plano.prioridadeParcial.ordem.map((id) => {
    const s = treinos.sessoes.find((x) => x.id === id);
    const cat = plano.categorias[id];
    const bloqueios = [];

    // Somar esta sessão estouraria algum limite clínico?
    for (const lim of plano.limitesClinicos) {
      const soma = s.exercicios
        .filter((e) => (e.grupos || []).includes(lim.grupo))
        .reduce((a, e) => a + e.series, 0);
      const total = (volumeAtual[lim.grupo] || 0) + soma;
      if (soma && total > lim.maxJanela && lim.nivel === 'critico') {
        bloqueios.push({
          tipo: 'limite',
          texto: `${lim.grupo} chegaria a ${total} sets na janela (limite ${lim.maxJanela}) — ${lim.motivo}`
        });
      }
    }

    if (feitas.has(id)) bloqueios.push({ tipo: 'repetida', texto: 'já feita nesta janela' });

    if (ultima) {
      const d = diasEntre(ultima.data, hoje);
      if (d * 24 < plano.minHorasEntreSessoes) {
        bloqueios.push({ tipo: 'intervalo', texto: `menos de ${plano.minHorasEntreSessoes}h desde a última sessão` });
      }
    }

    if (ultimaPorCategoria[cat] != null) {
      const d = diasEntre(ultimaPorCategoria[cat], hoje);
      if (d * 24 < plano.minHorasMesmaCategoria) {
        bloqueios.push({
          tipo: 'categoria',
          texto: `${cat} treinado há ${d} dia${d === 1 ? '' : 's'} — a série pede ${plano.minHorasMesmaCategoria}h`
        });
      }
    }

    const temDuro = bloqueios.some((b) => BLOQUEIO[b.tipo].duro);
    return { sessao: s, categoria: cat, bloqueios, livre: bloqueios.length === 0, temDuro };
  });

  // Preferência: sem nenhum bloqueio na ordem de prioridade. Se todas tiverem
  // ressalva, escolhe a menos bloqueada — assim, num dia em que já se treinou,
  // a sugestão é a próxima sessão coerente e não a mesma de novo.
  const elegiveis = candidatos.filter((c) => !c.temDuro);
  const escolhida =
    elegiveis.find((c) => c.livre) ||
    elegiveis.slice().sort((a, b) =>
      a.bloqueios.length - b.bloqueios.length ||
      plano.prioridadeParcial.ordem.indexOf(a.sessao.id) - plano.prioridadeParcial.ordem.indexOf(b.sessao.id)
    )[0] ||
    null;

  const cicloCompleto = plano.prioridadeParcial.ordem.every((id) => feitas.has(id));
  return { escolhida, candidatos, cicloCompleto };
}

/**
 * O que falta na janela, em ordem de prioridade, e o que sai da janela em
 * breve. Numa janela móvel não existe "fim de semana": as sessões antigas vão
 * expirando, então o que importa é o ritmo, não o prazo.
 */
function pendenciaDaJanela(plano, academias, hoje) {
  const feitas = new Set(academias.map((a) => a.sessao));
  const restantes = plano.prioridadeParcial.ordem.filter((id) => !feitas.has(id));

  // Sessões que deixam a janela nos próximos 2 dias (e voltam a "faltar").
  const expirando = academias
    .map((a) => ({ sessao: a.sessao, data: a.data, saiEmDias: plano.janelaDias - diasEntre(a.data, hoje) }))
    .filter((x) => x.saiEmDias <= 2 && x.saiEmDias > 0)
    .sort((a, b) => a.saiEmDias - b.saiEmDias);

  return {
    restantes,
    expirando,
    completa: restantes.length === 0,
    // Com 48h entre a mesma categoria, o ritmo realista é ~1 sessão por dia.
    diasParaFechar: restantes.length,
    apertado: restantes.length >= 3,
    criterio: plano.prioridadeParcial.descricao,
    ressalvas: plano.prioridadeParcial.ressalvas
  };
}

/* ===================== suplementos do dia ===================== */

/** Filtra os suplementos aplicáveis ao que foi registrado hoje. */
export function suplementosDoDia(suplementos, resumo) {
  const temTreino = resumo.sessoes.length > 0;
  const ehBD = resumo.sessoes.some((s) => ['B', 'D'].includes(s.id));
  return suplementos.filter((s) => {
    if (s.frequencia === 'treino') return temTreino;
    if (s.frequencia === 'treinoBD') return ehBD;
    return s.frequencia === 'diario' || s.critico;
  });
}
