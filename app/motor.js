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
    .filter((a) => a.tipo === 'pedal')
    .reduce((a, at) => a + (at.duracaoMin || 0), 0);
  if (!min) return null;

  const horas = min / 60;
  const ia = compensacao.intraAtividade;
  const [minH, maxH] = ia.alvoCarboPorHora;

  // Quem é base e quem fecha a conta vem do dado, não de nome de alimento no
  // código. A ordem da lista só desempata — o critério é chegar perto do alvo.
  const alvo = horas * ((minH + maxH) / 2);
  const teto = horas * maxH;
  const escolhidos = [];
  let carbo = 0;
  let kcal = 0;

  const somar = (item, n) => {
    const j = escolhidos.find((x) => x.item === item);
    if (j) j.n += n; else escolhidos.push({ item, n });
    carbo += n * item.carboG;
    kcal += n * item.kcal;
  };

  const bases = ia.itens.filter((i) => i.papel === 'base');
  if (horas < 1) {
    // Pedal curto: o glicogênio cobre ~60–75 min sozinho. Uma dose única da
    // primeira base é preventiva; a base cheia passaria muito da faixa.
    if (bases.length) somar(bases[0], 1);
  } else {
    // Piso, não arredondamento: em 1h30 arredondar para 2 doses daria 80 g/h.
    for (const item of bases) somar(item, Math.floor(horas * (item.porHora || 1)));
  }

  // Fecha a diferença uma dose por vez, sempre com o item que chega mais perto
  // do alvo sem passar do teto. Qualquer item pode completar, inclusive os da
  // base — é o que permite 1h30 fechar com mais uma dose em vez de um gel.
  for (let passo = 0; passo < 12 && carbo < alvo; passo++) {
    const cabe = ia.itens
      .filter((i) => carbo + i.carboG <= teto)
      .sort((a, b) => Math.abs(carbo + a.carboG - alvo) - Math.abs(carbo + b.carboG - alvo));
    if (!cabe.length) break;
    somar(cabe[0], 1);
  }

  const nome = (i) => i.curto || i.nome.toLowerCase();
  return {
    duracaoMin: min,
    horas,
    escolhidos,
    itens: escolhidos.map(({ item, n }) =>
      `${nome(item)}: ${n === 1 ? item.medida : `${n}× ${item.medida}`}`).join(' · '),
    carboG: Math.round(carbo),
    carboPorHora: Math.round(carbo / horas),
    kcal: Math.round(kcal),
    faixaAlvo: `${Math.round(horas * minH)}–${Math.round(horas * maxH)} g`,
    // Pedal curto fica abaixo da faixa de propósito — a view explica.
    abaixoDaFaixa: carbo < horas * minH
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

/**
 * Compara o gasto MEDIDO (corrigido pelo ciclocomputador) com o que o app teria
 * estimado, por tipo e perfil de atividade.
 *
 * A taxa de 650 kcal/h em Z2 foi arbitrada por estabilidade de peso, entre os
 * 500 do plano e os 800–1000 relatados. Medição é melhor que arbitragem: com
 * medições suficientes, esta função diz se a taxa deveria mudar e para quanto.
 */
export function medicoesDeGasto(dados, registro, diasAtras = 180) {
  const comp = dados.nutricao.compensacao;
  const cfg = comp.revisaoDaTaxa || { minimoMedicoes: 3, desvioRelevante: 0.1 };
  const grupos = new Map();

  for (const data of janela(diasAtras)) {
    for (const a of registro.dia(data).atividades || []) {
      if (!Number.isFinite(a.kcal) || !a.duracaoMin) continue;
      // A estimativa que o app teria dado, ignorando a correção.
      const estimado = gastoDaAtividade({ ...a, kcal: undefined }, comp);
      if (!estimado) continue;

      const chave = a.perfil ? `${a.tipo}/${a.perfil}` : a.tipo;
      if (!grupos.has(chave)) grupos.set(chave, { chave, tipo: a.tipo, perfil: a.perfil || null, medicoes: [] });
      grupos.get(chave).medicoes.push({
        data,
        duracaoMin: a.duracaoMin,
        medido: a.kcal,
        estimado,
        medidoPorHora: Math.round(a.kcal / (a.duracaoMin / 60)),
        estimadoPorHora: Math.round(estimado / (a.duracaoMin / 60))
      });
    }
  }

  const out = [];
  for (const g of grupos.values()) {
    const n = g.medicoes.length;
    const razao = g.medicoes.reduce((s, m) => s + m.medido / m.estimado, 0) / n;
    const taxaMedida = Math.round(g.medicoes.reduce((s, m) => s + m.medidoPorHora, 0) / n);
    const taxaAtual = g.medicoes[0].estimadoPorHora;
    out.push({
      ...g,
      n,
      razao,
      desvioPerc: Math.round((razao - 1) * 100),
      taxaAtual,
      taxaMedida,
      // Só sugere trocar com amostra mínima E desvio que importa. Uma medição
      // 18% acima é indício; três seguidas são motivo.
      sugereRevisar: n >= cfg.minimoMedicoes && Math.abs(razao - 1) >= cfg.desvioRelevante,
      faltamMedicoes: Math.max(0, cfg.minimoMedicoes - n)
    });
  }
  return {
    grupos: out.sort((a, b) => b.n - a.n),
    minimoMedicoes: cfg.minimoMedicoes,
    desvioRelevante: cfg.desvioRelevante,
    nota: cfg.nota
  };
}

/* ===================== composição de refeições ===================== */

/** Índice id -> alimento, para não varrer a tabela a cada item. */
export function indiceAlimentos(alimentos) {
  return new Map((alimentos.itens || []).map((a) => [a.id, a]));
}

/** Minúsculas e sem acento — quem digita "tamara" tem que achar "Tâmara". */
export function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Busca na tabela de alimentos. Sem termo, devolve os frequentes (os que
 * aparecem no cardápio) — é o que ele mais registra. Com termo, procura em
 * nome, grupo e sinônimos, tudo sem acento.
 */
export function buscarAlimentos(alimentos, termo, grupo) {
  const itens = alimentos.itens || [];
  const t = normalizar(termo);

  if (!t) {
    const base = grupo ? itens.filter((a) => a.grupo === grupo) : itens.filter((a) => a.frequente);
    return base.length ? base : itens;
  }

  const casa = (a) => {
    const campos = [a.nome, a.grupo, ...(a.sinonimos || [])];
    return campos.some((c) => normalizar(c).includes(t));
  };
  // Quem começa com o termo vem antes de quem só o contém no meio.
  return itens.filter(casa).sort((a, b) => {
    const pa = normalizar(a.nome).startsWith(t) ? 0 : 1;
    const pb = normalizar(b.nome).startsWith(t) ? 0 : 1;
    return pa - pb || a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

/**
 * Macros de uma composição [{ alimentoId, gramas }]. Arredonda só no fim: somar
 * valores já arredondados erra vários gramas numa refeição de 6 itens.
 */
export function macrosDaComposicao(alimentos, composicao) {
  const idx = alimentos instanceof Map ? alimentos : indiceAlimentos(alimentos);
  const t = (composicao || []).reduce((a, x) => {
    const f = idx.get(x.alimentoId);
    if (!f) return a;
    const k = x.gramas / 100;
    return { p: a.p + f.por100.p * k, g: a.g + f.por100.g * k, c: a.c + f.por100.c * k };
  }, { p: 0, g: 0, c: 0 });
  return {
    p: Math.round(t.p),
    g: Math.round(t.g),
    c: Math.round(t.c),
    kcal: Math.round(t.p * 4 + t.g * 9 + t.c * 4)
  };
}

/** Quantidade legível: "100 g (2 unidades)" quando o alimento é contável. */
export function medidaLegivel(alimento, gramas) {
  if (!alimento) return `${gramas} g`;
  if (!alimento.unidadeG) return `${gramas} g`;
  const n = gramas / alimento.unidadeG;
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return `${gramas} g (${txt} ${pluralizar(alimento.unidadeNome || 'unidade', n)})`;
}

/**
 * Plural da medida caseira. Só a primeira palavra flexiona ("2 colheres de
 * sopa", não "2 colher de sopas"), e palavra terminada em r ganha -es.
 */
function pluralizar(nome, n) {
  if (n === 1) return nome;
  const [primeira, ...resto] = nome.split(' ');
  if (primeira.endsWith('s')) return nome;
  const flexionada = primeira.endsWith('r') ? `${primeira}es` : `${primeira}s`;
  return [flexionada, ...resto].join(' ');
}

/** Descrição de uma composição, no mesmo formato dos itens do cardápio. */
export function descreverComposicao(alimentos, composicao) {
  const idx = alimentos instanceof Map ? alimentos : indiceAlimentos(alimentos);
  return (composicao || [])
    .filter((x) => x.gramas > 0)
    .map((x) => {
      const f = idx.get(x.alimentoId);
      return f ? `${f.nome.toLowerCase()} ${medidaLegivel(f, x.gramas)}` : `${x.alimentoId} ${x.gramas} g`;
    })
    .join(' + ');
}

/* ===================== o que fazer agora ===================== */

/**
 * Hora aproximada de uma refeição, em horas decimais, a partir do rótulo do
 * cardápio ("~5:30", "~12h"). As refeições ancoradas em evento — "após o
 * treino", "durante o pedal" — não têm hora e devolvem null: elas são
 * disparadas pela atividade, não pelo relógio.
 */
export function horaDaRefeicao(refeicao) {
  const m = String(refeicao.hora || '').match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  if (/minuto/i.test(refeicao.hora)) return null; // "minuto 45" é do treino, não do dia
  return Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
}

/**
 * A refeição que vem agora: entre as pendentes, a de hora mais próxima que
 * ainda não passou; se todas já passaram, a mais atrasada. Refeições ancoradas
 * em evento entram apenas quando a atividade correspondente foi registrada.
 */
export function proximaRefeicao(resumo, agoraH = new Date().getHours() + new Date().getMinutes() / 60) {
  const candidatas = resumo.pendentes.filter((r) => {
    if (horaDaRefeicao(r) !== null) return true;
    // ancorada em evento: só depois de haver atividade registrada
    return resumo.atividades.length > 0;
  });
  if (!candidatas.length) return null;

  // Ancoradas em evento são as mais urgentes: a janela anabólica não espera.
  const porEvento = candidatas.find((r) => r.janelaAnabolica);
  if (porEvento) return porEvento;

  const comHora = candidatas
    .map((r) => ({ r, h: horaDaRefeicao(r) }))
    .filter((x) => x.h !== null)
    .sort((a, b) => a.h - b.h);
  if (!comHora.length) return candidatas[0];

  const aVir = comHora.find((x) => x.h >= agoraH - 0.5);
  return (aVir || comHora[comHora.length - 1]).r;
}

/**
 * A única coisa que o app precisa dizer ao abrir: o que fazer agora. Devolve
 * `{ tipo, titulo, texto, rota, acao }` — a tela Hoje só renderiza.
 *
 * A ordem é de urgência real, não de importância abstrata: o que tem prazo
 * (janela anabólica, combustível) vem antes do que pode esperar.
 */
export function proximaAcao(dados, dia, jan) {
  const agora = new Date();
  const h = agora.getHours() + agora.getMinutes() / 60;

  // 1. Janela anabólica aberta — prazo de 30 min.
  const anabolica = dia.pendentes.find((x) => x.janelaAnabolica);
  if (dia.atividades.length && anabolica) {
    return {
      tipo: 'refeicao',
      urgencia: 'critico',
      titulo: anabolica.nome,
      texto: `${anabolica.itens} — janela de 30 min depois da atividade.`,
      rota: '#/comer',
      acao: 'Registrar agora'
    };
  }

  // 2. Refeição da hora.
  const prox = proximaRefeicao(dia, h);
  if (prox) {
    const hr = horaDaRefeicao(prox);
    const atrasada = hr !== null && h > hr + 1;
    return {
      tipo: 'refeicao',
      urgencia: atrasada ? 'atencao' : 'info',
      titulo: `${prox.nome}${hr !== null ? ` · ${prox.hora}` : ''}`,
      texto: atrasada ? `${prox.itens} — passou da hora.` : prox.itens,
      rota: '#/comer',
      acao: 'Ver e registrar'
    };
  }

  // 3. Nada pendente para comer: sobra o treino.
  if (!dia.sessoes.length && jan.proxima.escolhida) {
    const s = jan.proxima.escolhida.sessao;
    return {
      tipo: 'treino',
      urgencia: 'info',
      titulo: `Treino ${s.id} — ${s.nome}`,
      texto: `${s.foco.join(' · ')} · ~${s.duracaoMin} min.`,
      rota: '#/treinar',
      acao: 'Abrir a série'
    };
  }

  // 4. Dia cumprido.
  return {
    tipo: 'ok',
    urgencia: 'ok',
    titulo: 'Dia fechado',
    texto: dia.sessoes.length
      ? 'Refeições marcadas e treino registrado. Nada pendente.'
      : 'Todas as refeições do cardápio já foram marcadas.',
    rota: '#/comer',
    acao: 'Revisar o dia'
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
export function resumoDia(dados, registro, dataISO = hojeISO(), ref = new Date()) {
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
  // Vários avisos só valem a partir de certa hora ("já é 19h e falta gordura").
  // Num dia passado essa cobrança tem de valer sempre: o dia acabou, o prazo
  // venceu. Só o dia de hoje anda pelo relógio.
  resumo.hora = dataISO === hojeISO(ref) ? ref.getHours() : 23;
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
  let semDado = 0;
  const detalhe = [];

  for (const d of dias) {
    const dia = registro.dia(d);
    const atividades = dia.atividades || [];
    const gasto = gastoTotal(atividades, comp);
    const alvo = alvoPorGasto(comp, gasto);
    const consumido = (dia.refeicoes || []).reduce((a, r) => a + r.kcal, 0);
    // O que o teto cortou vem do gasto, que ele registra — isso é dado.
    // Já a reposição só existe se houver refeição registrada ou dia fechado:
    // sem isso não se sabe se ele repôs ou só não anotou.
    const confiavel = (dia.refeicoes || []).length > 0 || Boolean(dia.fechado);

    gerado += alvo.cortadoPeloTeto;
    const acima = confiavel ? Math.max(0, consumido - alvo.kcal) : 0;
    reposto += acima;
    if (alvo.cortadoPeloTeto > 0 && !confiavel) semDado += alvo.cortadoPeloTeto;

    if (alvo.cortadoPeloTeto > 0 || acima > 0) {
      detalhe.push({ data: d, gasto, cortado: alvo.cortadoPeloTeto, acimaDoAlvo: acima, confiavel });
    }
  }

  return {
    janelaDias: comp.banco.janelaDias,
    gerado,
    reposto,
    semDado,
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
    const temRefeicao = (dia.refeicoes || []).length > 0;
    const registrou = atividades.length > 0 || temRefeicao;
    // "Fechei o dia" é o que autoriza tratar o déficit como real. Sem a marca e
    // sem refeição, o dia é incompleto, não deficitário.
    const confiavel = dia.fechado || temRefeicao;
    return {
      data,
      hoje: data === hoje,
      atividades,
      gasto,
      alvo: alvo.kcal,
      cortadoPeloTeto: alvo.cortadoPeloTeto,
      consumido,
      saldo: confiavel ? consumido - alvo.kcal : 0,
      registrou,
      fechado: Boolean(dia.fechado),
      confiavel
    };
  });

  const somar = (campo) => linhas.reduce((a, l) => a + l[campo], 0);
  const comRegistro = linhas.filter((l) => l.registrou);
  const confiaveis = linhas.filter((l) => l.confiavel);

  return {
    janelaDias: dias.length,
    dias,
    hoje,
    linhas,
    gasto: somar('gasto'),
    // O alvo comparável é só o dos dias confiáveis: somar o alvo de um dia que
    // ele não registrou inventa um déficit que nunca existiu.
    alvo: confiaveis.reduce((a, l) => a + l.alvo, 0),
    alvoJanela: somar('alvo'),
    consumido: somar('consumido'),
    saldo: somar('saldo'),
    diasComRegistro: comRegistro.length,
    diasConfiaveis: confiaveis.length,
    diasFechados: linhas.filter((l) => l.fechado).length,
    // Média só sobre o que é confiável: incluir dia pela metade puxa para baixo
    // e faz parecer que ele comeu menos do que comeu.
    mediaSaldo: confiaveis.length ? Math.round(somar('saldo') / confiaveis.length) : 0,
    mediaGasto: comRegistro.length ? Math.round(somar('gasto') / comRegistro.length) : 0
  };
}

/** Troca {campo} pelo valor correspondente — os textos vêm do dado com lacunas. */
function preencher(texto, valores) {
  return String(texto).replace(/\{(\w+)\}/g, (m, k) => (k in valores ? String(valores[k]) : m));
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
  const O = nutricao.orientacoes || {};
  const { tipo, tipoId, alvo, derivado, restante, consumido, pendentes, sessoes, atividades, combustivel, reforco } = r;
  const hora = Number.isFinite(r.hora) ? r.hora : new Date().getHours();
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

  // Colágeno antes dos treinos de perna. Quais sessões e qual o texto vêm do
  // dado: o frontend é público e não guarda particularidade clínica.
  const pre = O.preTreinoPerna;
  if (pre && sessoes.some((s) => pre.sessoes.includes(s.id))) {
    av.push({ nivel: 'info', titulo: pre.titulo, texto: pre.texto });
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
  if (tipoId === 'duplo' && O.diaDuplo) {
    av.push({ nivel: 'info', titulo: O.diaDuplo.titulo, texto: O.diaDuplo.texto });
  }

  // Carboidrato concentrado no fim do dia — só cobra quem já começou a comer.
  const cp = O.carboPendente;
  if (cp && hora >= cp.horaMinima && consumido.kcal > 0 && restante.c > alvo.c * cp.fracaoLimite) {
    av.push({
      nivel: 'atencao',
      titulo: cp.titulo,
      texto: `Restam ${restante.c} g de carboidrato (${Math.round((restante.c / alvo.c) * 100)}% do dia). ${cp.texto}`
    });
  }

  // Gordura também é macro fixo, e era o único que ninguém cobrava. O registro
  // real mostrou cinco dias seguidos abaixo de 62% do alvo sem um aviso.
  const gb = O.gorduraBaixa;
  if (gb && hora >= gb.horaMinima && consumido.kcal > 0 && consumido.g < alvo.g * gb.fracaoLimite) {
    av.push({
      nivel: 'atencao',
      titulo: `${gb.titulo}: ${consumido.g} g de ${alvo.g}`,
      texto: preencher(gb.texto, { gorduraFixaG: alvo.g })
    });
  }

  // Proteína é o macro que não se negocia. Só cobra quem já começou a comer —
  // com o registro vazio isso seria só ruído.
  const pp = O.proteinaPendente;
  if (pp && hora >= pp.horaMinima && consumido.kcal > 0 && restante.p > pp.limiteG) {
    av.push({
      nivel: 'atencao',
      titulo: `Faltam ${restante.p} g de proteína`,
      texto: preencher(pp.texto, { proteinaFixaG: alvo.p })
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

  // Composição corporal no piso: não é dia de cortar caloria. Idem — só depois
  // de comer algo, e sem repetir o número que o aviso de "alvo subiu" já deu.
  const dc = O.deficitCalorico;
  if (dc && hora >= dc.horaMinima && consumido.kcal > 0 && restante.kcal > dc.limiteKcal && !jaAvisouDeficitKcal) {
    av.push({
      nivel: 'atencao',
      titulo: `Faltam ${restante.kcal} kcal`,
      texto: preencher(dc.texto, dc)
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
    feitasIds: academias.map((a) => a.sessao),
    faltamAcademia: Math.max(0, plano.sessoesPorJanela - academias.length),
    faltamPedal: Math.max(0, pedal.plano.sessoesPorJanela - pedais.length),
    metaAcademia: plano.sessoesPorJanela,
    metaPedal: pedal.plano.sessoesPorJanela,
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

/**
 * Filtra os suplementos aplicáveis ao que foi registrado hoje. Quais sessões
 * contam como treino de perna vem do dado (a mesma lista que dispara o aviso do
 * colágeno), não de uma constante aqui.
 */
export function suplementosDoDia(suplementos, resumo, orientacoes, ordem) {
  const temTreino = resumo.sessoes.length > 0;
  const dePerna = (orientacoes && orientacoes.preTreinoPerna && orientacoes.preTreinoPerna.sessoes) || [];
  const ehBD = resumo.sessoes.some((s) => dePerna.includes(s.id));
  const doDia = suplementos.filter((s) => {
    if (s.frequencia === 'treino') return temTreino;
    if (s.frequencia === 'treinoBD') return ehBD;
    return s.frequencia === 'diario' || s.critico;
  });

  // Se o dado traz a ordem de prioridade, a checklist segue ela: o que tem
  // deficiência medida vem primeiro, o que é opcional desce. Marcar sete itens
  // é diferente de marcar os três que importam.
  if (!Array.isArray(ordem) || !ordem.length) return doDia;
  const posicao = (s) => {
    const i = ordem.indexOf(s.prioridade);
    return i < 0 ? ordem.length : i;
  };
  return doDia
    .map((s, i) => ({ s, i }))
    .sort((a, b) => posicao(a.s) - posicao(b.s) || a.i - b.i)
    .map((x) => x.s);
}
