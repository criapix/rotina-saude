// Carregamento e derivação dos dados.
//
// data/index.json é público (só a lista de slugs). Cada data/<slug>.enc.json é
// cifrado e decifrado sob demanda, com cache em memória.

export class Store {
  constructor(cofre) {
    this.cofre = cofre;
    this.indice = null;
    this.cache = new Map();
    this.brutos = new Map(); // slug -> texto JSON em claro (usado pelo editor)
  }

  async carregarIndice() {
    const r = await fetch('data/index.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('não foi possível carregar data/index.json');
    this.indice = await r.json();
    return this.indice;
  }

  get slugs() {
    return this.indice ? this.indice.documentos : [];
  }

  /** Decifra e faz o parse de um documento (com cache). */
  async doc(slug) {
    if (this.cache.has(slug)) return this.cache.get(slug);
    const r = await fetch(`data/${slug}.enc.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`documento indisponível: ${slug}`);
    const blob = await r.json();
    const texto = await this.cofre.decifrar(blob);
    const dados = JSON.parse(texto);
    this.brutos.set(slug, texto);
    this.cache.set(slug, dados);
    return dados;
  }

  async docs(...slugs) {
    return Promise.all(slugs.map((s) => this.doc(s)));
  }

  /** Carrega tudo — usado pela busca global e pelo editor. */
  async todos() {
    const entradas = await Promise.all(this.slugs.map(async (s) => [s, await this.doc(s)]));
    return Object.fromEntries(entradas);
  }

  bruto(slug) {
    return this.brutos.get(slug) || null;
  }

  /** Substitui o conteúdo em memória (após edição) para refletir na sessão. */
  substituir(slug, texto) {
    const dados = JSON.parse(texto);
    this.cache.set(slug, dados);
    this.brutos.set(slug, texto);
    return dados;
  }

  limpar() {
    this.cache.clear();
    this.brutos.clear();
  }
}

/* ===================== derivações ===================== */

/** Soma de séries de uma sessão, calculada a partir dos exercícios. */
export function volumeSessao(sessao) {
  const porGrupo = {};
  let total = 0;
  for (const ex of sessao.exercicios) {
    total += ex.series;
    for (const g of ex.grupos || ['Outros']) {
      porGrupo[g] = (porGrupo[g] || 0) + ex.series;
    }
  }
  return { total, porGrupo };
}

/** Contagem de exercícios marcados como novos no ciclo. */
export function contaNovos(sessao) {
  return sessao.exercicios.filter((e) => e.novo).length;
}

/**
 * Linha da agenda de referência para um dia da semana. A agenda deixou de
 * decidir o que fazer (isso agora vem do registro, ver app/motor.js) e serve só
 * como desenho recomendado da semana.
 */
export function referenciaDoDia(perfil, data = new Date()) {
  const dow = data.getDay();
  return perfil.agenda.dias.find((d) => d.diaSemana === dow) || perfil.agenda.dias[0];
}

/* ===================== estado local por dia ===================== */

const hojeISO = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export { hojeISO };

/**
 * Registro do que foi feito e ingerido, por dia, no dispositivo.
 *
 * Guardado num único item de localStorage (`rs.registro`) com a forma
 * `{ dias: { 'AAAA-MM-DD': { atividades, refeicoes, suplementos, series } } }`.
 * Um item só (em vez de um por data) permite exportar/importar tudo de uma vez,
 * já que não há servidor para sincronizar.
 *
 * - atividades: [{ id, tipo: 'pedal'|'academia', sessao?, em, ... }]
 * - refeicoes:  [{ id, nome, em, p, g, c, kcal }] — macros gravados no momento
 *   da marcação, para que mudar o tipo do dia depois não reescreva o passado.
 */
export class Registro {
  constructor(chave = 'rs.registro', retencaoDias = 180) {
    this.chave = chave;
    this.retencaoDias = retencaoDias;
    this.estado = this.#ler();
    this.#podar();
  }

  #ler() {
    try {
      const bruto = JSON.parse(localStorage.getItem(this.chave) || '{}');
      return bruto && typeof bruto === 'object' && bruto.dias ? bruto : { dias: {} };
    } catch {
      return { dias: {} };
    }
  }

  #gravar() {
    try { localStorage.setItem(this.chave, JSON.stringify(this.estado)); } catch { /* cota/modo privado */ }
  }

  #podar() {
    const limite = hojeISO(new Date(Date.now() - this.retencaoDias * 864e5));
    let mexeu = false;
    for (const d of Object.keys(this.estado.dias)) {
      if (d < limite) { delete this.estado.dias[d]; mexeu = true; }
    }
    if (mexeu) this.#gravar();
  }

  /** Dia em modo leitura (sempre devolve objeto, nunca undefined). */
  dia(dataISO = hojeISO()) {
    const d = this.estado.dias[dataISO];
    if (!d) return { atividades: [], refeicoes: [], suplementos: {}, series: {}, fechado: false, tranquilo: false };
    return {
      atividades: d.atividades || [],
      refeicoes: d.refeicoes || [],
      suplementos: d.suplementos || {},
      series: d.series || {},
      fechado: Boolean(d.fechado),
      tranquilo: Boolean(d.tranquilo)
    };
  }

  /** Recarrega do storage — útil quando outra aba gravou. */
  recarregar() {
    this.estado = this.#ler();
  }

  /**
   * Relê o storage antes de escrever. Sem isso, uma segunda aba (ou o app
   * reaberto) sobrescreveria com o estado que carregou na inicialização.
   */
  #sincronizar() {
    this.estado = this.#ler();
  }

  /** Dia em modo escrita (cria se não existir). */
  #diaEditavel(dataISO) {
    this.#sincronizar();
    const d = this.estado.dias[dataISO] || (this.estado.dias[dataISO] = {});
    d.atividades = d.atividades || [];
    d.refeicoes = d.refeicoes || [];
    d.suplementos = d.suplementos || {};
    d.series = d.series || {};
    return d;
  }

  /* ---------------- atividades ---------------- */

  registrarAtividade(atividade, dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    const item = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      em: new Date().toISOString(),
      ...atividade
    };
    d.atividades.push(item);
    this.#gravar();
    return item;
  }

  /**
   * Corrige uma atividade já registrada (duração, perfil de intensidade ou o
   * gasto medido pelo ciclocomputador). Passar `kcal: null` volta para a
   * estimativa. Devolve a atividade atualizada, ou null se o id não existir.
   */
  atualizarAtividade(id, campos, dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    const a = d.atividades.find((x) => x.id === id);
    if (!a) return null;
    for (const [k, v] of Object.entries(campos)) {
      if (v === null || v === undefined || v === '') delete a[k];
      else a[k] = v;
    }
    this.#gravar();
    return a;
  }

  removerAtividade(id, dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    d.atividades = d.atividades.filter((a) => a.id !== id);
    this.#gravar();
  }

  temAtividade(tipo, dataISO = hojeISO()) {
    return this.dia(dataISO).atividades.some((a) => a.tipo === tipo);
  }

  /* ---------------- refeições ---------------- */

  refeicaoFeita(id, dataISO = hojeISO()) {
    return this.dia(dataISO).refeicoes.some((r) => r.id === id);
  }

  /**
   * Marca/desmarca uma refeição do plano, gravando os macros no momento da
   * marcação. Devolve true se ficou marcada.
   */
  alternarRefeicao(refeicao, dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    const i = d.refeicoes.findIndex((r) => r.id === refeicao.id);
    if (i >= 0) {
      d.refeicoes.splice(i, 1);
      this.#gravar();
      return false;
    }
    const m = refeicao.macros || { p: 0, g: 0, c: 0, kcal: 0 };
    d.refeicoes.push({
      id: refeicao.id,
      nome: refeicao.nome,
      em: new Date().toISOString(),
      p: m.p, g: m.g, c: m.c, kcal: m.kcal
    });
    this.#gravar();
    return true;
  }

  /** A refeição registrada com este id, ou null. */
  refeicao(id, dataISO = hojeISO()) {
    return this.dia(dataISO).refeicoes.find((r) => r.id === id) || null;
  }

  /**
   * Grava uma refeição com composição própria — seja uma do plano que foi
   * alterada, seja uma avulsa. Substitui a de mesmo id, se houver, para que
   * personalizar duas vezes não some duas refeições no dia.
   *
   * `composicao` é [{ alimentoId, gramas }]; fica guardada para que a refeição
   * possa ser reaberta e ajustada depois.
   */
  salvarRefeicao({ id, nome, hora, composicao, macros, doPlano }, dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    const m = macros || { p: 0, g: 0, c: 0, kcal: 0 };
    const item = {
      id: id || `livre-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      nome,
      em: new Date().toISOString(),
      p: m.p, g: m.g, c: m.c, kcal: m.kcal,
      personalizada: true,
      ...(hora ? { hora } : {}),
      ...(doPlano ? { doPlano: true } : {}),
      ...(composicao ? { composicao } : {})
    };
    const i = d.refeicoes.findIndex((r) => r.id === item.id);
    if (i >= 0) d.refeicoes[i] = item; else d.refeicoes.push(item);
    this.#gravar();
    return item;
  }

  removerRefeicao(id, dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    d.refeicoes = d.refeicoes.filter((r) => r.id !== id);
    this.#gravar();
  }

  /* ---------------- favoritos ---------------- */

  /**
   * Refeições salvas para repetir. O registro real mostrou o mesmo café da
   * manhã lançado quatro vezes, idêntico — remontar item por item era o maior
   * atrito do app.
   *
   * Ficam no estado (e portanto no backup), não numa chave separada.
   */
  favoritos() {
    return this.estado.favoritos || [];
  }

  salvarFavorito({ nome, composicao, macros }) {
    this.#sincronizar();
    this.estado.favoritos = this.estado.favoritos || [];
    const item = {
      id: `fav-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      nome,
      composicao,
      macros,
      criadoEm: new Date().toISOString()
    };
    // Mesmo nome sobrescreve: salvar duas vezes é corrigir, não duplicar.
    const i = this.estado.favoritos.findIndex((f) => f.nome.toLowerCase() === nome.toLowerCase());
    if (i >= 0) this.estado.favoritos[i] = { ...item, id: this.estado.favoritos[i].id };
    else this.estado.favoritos.push(item);
    this.#gravar();
    return item;
  }

  removerFavorito(id) {
    this.#sincronizar();
    this.estado.favoritos = (this.estado.favoritos || []).filter((f) => f.id !== id);
    this.#gravar();
  }

  /* ---------------- dia fechado ---------------- */

  /**
   * "Fechei o dia" é diferente de "não registrei". Sem essa marca, um dia com
   * uma refeição lançada vira um déficit de 2000 kcal no balanço da semana e no
   * banco calórico — dado sujo entrando em conta clínica.
   */
  diaFechado(dataISO = hojeISO()) {
    return Boolean((this.estado.dias[dataISO] || {}).fechado);
  }

  alternarDiaFechado(dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    d.fechado = !d.fechado;
    this.#gravar();
    return d.fechado;
  }

  /**
   * Dia fora da rotina: troca o cardápio de 5 refeições com hora marcada pelo
   * modo tranquilo, de 3 sem horário. É marcação do usuário, não do calendário —
   * o app nunca deduziu nada de dia da semana e não vai começar agora.
   */
  diaTranquilo(dataISO = hojeISO()) {
    return Boolean((this.estado.dias[dataISO] || {}).tranquilo);
  }

  alternarDiaTranquilo(dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    d.tranquilo = !d.tranquilo;
    this.#gravar();
    return d.tranquilo;
  }

  /* ---------------- suplementos ---------------- */

  suplementoTomado(nome, dataISO = hojeISO()) {
    return Boolean(this.dia(dataISO).suplementos[nome]);
  }

  alternarSuplemento(nome, dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    d.suplementos[nome] = !d.suplementos[nome];
    this.#gravar();
    return d.suplementos[nome];
  }

  /* ---------------- séries do treino ---------------- */

  seriesFeitas(sessaoId, ordem, dataISO = hojeISO()) {
    return this.dia(dataISO).series[`${sessaoId}.${ordem}`] || 0;
  }

  marcarSerie(sessaoId, ordem, total, dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    const k = `${sessaoId}.${ordem}`;
    const atual = d.series[k] || 0;
    d.series[k] = atual >= total ? 0 : atual + 1;
    this.#gravar();
    return d.series[k];
  }

  zerarSessao(sessaoId, dataISO = hojeISO()) {
    const d = this.#diaEditavel(dataISO);
    for (const k of Object.keys(d.series)) {
      if (k.startsWith(sessaoId + '.')) delete d.series[k];
    }
    this.#gravar();
  }

  /**
   * `sessao.chave` distingue duas execuções da mesma sessão no mesmo dia; a
   * primeira do dia tem chave igual ao id, então o dado antigo continua válido.
   */
  progressoSessao(sessao, dataISO = hojeISO()) {
    const chave = sessao.chave || sessao.id;
    const total = sessao.exercicios.reduce((s, e) => s + e.series, 0);
    const feitas = sessao.exercicios.reduce(
      (s, e) => s + Math.min(this.seriesFeitas(chave, e.ordem, dataISO), e.series), 0);
    return { feitas, total, perc: total ? Math.round((feitas / total) * 100) : 0 };
  }

  /* ---------------- exportar / importar ---------------- */

  exportar() {
    return JSON.stringify({
      versao: 2,
      geradoEm: new Date().toISOString(),
      dias: this.estado.dias,
      favoritos: this.estado.favoritos || []
    }, null, 1);
  }

  importar(texto, { substituir = false } = {}) {
    const bruto = JSON.parse(texto);
    if (!bruto || typeof bruto !== 'object' || !bruto.dias) throw new Error('arquivo sem o campo "dias"');
    if (substituir) { this.estado.dias = {}; this.estado.favoritos = []; }
    if (Array.isArray(bruto.favoritos)) {
      const porNome = new Map((this.estado.favoritos || []).map((f) => [f.nome.toLowerCase(), f]));
      for (const f of bruto.favoritos) if (f && f.nome) porNome.set(f.nome.toLowerCase(), f);
      this.estado.favoritos = [...porNome.values()];
    }
    let n = 0;
    for (const [data, dia] of Object.entries(bruto.dias)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
      this.estado.dias[data] = dia;
      n++;
    }
    this.#gravar();
    return n;
  }

  totalDias() {
    return Object.keys(this.estado.dias).length;
  }

  apagarTudo() {
    this.estado = { dias: {} };
    this.#gravar();
  }
}

/* ===================== índice de busca ===================== */

const ROTAS_BUSCA = {
  perfil: { secao: 'Perfil', rota: '#/perfil' },
  treinos: { secao: 'Treino', rota: '#/treino' },
  nutricao: { secao: 'Nutrição', rota: '#/nutricao' },
  pedal: { secao: 'Pedal', rota: '#/pedal' },
  saude: { secao: 'Saúde', rota: '#/saude' },
  bioimpedancia: { secao: 'Composição', rota: '#/saude/composicao' },
  exames: { secao: 'Exames', rota: '#/saude/exames' },
  laudos: { secao: 'Laudos', rota: '#/saude/laudos' },
  dermatologia: { secao: 'Dermatologia', rota: '#/dermatologia' },
  historico: { secao: 'Histórico', rota: '#/historico' },
  pareceres: { secao: 'Pareceres', rota: '#/pareceres' }
};

/**
 * Achata os documentos em registros buscáveis. Percorre a árvore JSON e
 * agrupa cada nó com título reconhecível num registro de texto.
 */
export function montarIndiceBusca(docs) {
  const registros = [];

  const CAMPOS_TITULO = ['titulo', 'nome', 'exame', 'grupo', 'exercicio', 'label', 'marcador', 'produto', 'meta', 'categoria'];

  function textoDe(valor, profundidade = 0) {
    if (valor == null || profundidade > 4) return '';
    if (typeof valor === 'string') return valor;
    if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
    if (Array.isArray(valor)) return valor.map((v) => textoDe(v, profundidade + 1)).join(' · ');
    return Object.entries(valor)
      .filter(([k]) => !k.startsWith('_'))
      .map(([, v]) => textoDe(v, profundidade + 1))
      .join(' · ');
  }

  function tituloDe(obj) {
    for (const c of CAMPOS_TITULO) {
      if (typeof obj[c] === 'string' && obj[c].trim()) return obj[c];
    }
    return null;
  }

  function andar(no, slug, rota, trilha) {
    if (no == null) return;
    if (Array.isArray(no)) {
      no.forEach((v) => andar(v, slug, rota, trilha));
      return;
    }
    if (typeof no !== 'object') return;

    const titulo = tituloDe(no);
    if (titulo) {
      const corpo = textoDe(no).slice(0, 700);
      registros.push({
        slug,
        secao: ROTAS_BUSCA[slug] ? ROTAS_BUSCA[slug].secao : slug,
        rota,
        titulo,
        trilha,
        texto: corpo,
        busca: (titulo + ' ' + corpo).toLowerCase()
      });
    }
    for (const [k, v] of Object.entries(no)) {
      if (v && typeof v === 'object') andar(v, slug, rota, titulo || trilha || k);
    }
  }

  for (const [slug, dados] of Object.entries(docs)) {
    const meta = ROTAS_BUSCA[slug] || { secao: slug, rota: '#/hoje' };
    andar(dados, slug, meta.rota, null);
  }
  return registros;
}

const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function buscar(indice, termo, limite = 30) {
  const q = semAcento(termo.trim().toLowerCase());
  if (q.length < 2) return [];
  const partes = q.split(/\s+/);
  const vistos = new Set();
  const achados = [];
  for (const reg of indice) {
    const alvo = semAcento(reg.busca);
    if (!partes.every((p) => alvo.includes(p))) continue;
    const chave = reg.slug + '|' + reg.titulo;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const tituloBate = semAcento(reg.titulo.toLowerCase()).includes(partes[0]);
    achados.push({ ...reg, peso: tituloBate ? 0 : 1, pos: alvo.indexOf(partes[0]) });
    if (achados.length > limite * 4) break;
  }
  achados.sort((a, b) => a.peso - b.peso || a.pos - b.pos);
  return achados.slice(0, limite);
}
