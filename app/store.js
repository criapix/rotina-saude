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
 * Monta o plano do dia combinando a agenda do perfil, as sessões de treino e
 * o tipo de dia da nutrição.
 */
export function planoDoDia(perfil, treinos, nutricao, data = new Date()) {
  const dow = data.getDay();
  const dia = perfil.agenda.dias.find((d) => d.diaSemana === dow) || perfil.agenda.dias[0];
  const sessao = dia.treino ? treinos.sessoes.find((s) => s.id === dia.treino) : null;
  const tipoDia = nutricao.tiposDia.find((t) => t.id === dia.tipoDia) || null;
  const calendario = treinos.calendario.dias.find((d) => d.diaSemana === dow) || null;
  return { data, dia, sessao, tipoDia, calendario, descanso: !dia.treino && !dia.pedal };
}

/* ===================== estado local por dia ===================== */

const hojeISO = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export { hojeISO };

/**
 * Marcações do dia (séries feitas, suplementos tomados). Guardadas no
 * localStorage por data, com limpeza automática do que passou de 14 dias.
 */
export class DiarioLocal {
  constructor(prefixo = 'rs.diario') {
    this.prefixo = prefixo;
    this.chave = `${prefixo}.${hojeISO()}`;
    this.estado = this.#ler();
    this.#podar();
  }

  #ler() {
    try {
      return JSON.parse(localStorage.getItem(this.chave) || '{}');
    } catch {
      return {};
    }
  }

  #gravar() {
    try { localStorage.setItem(this.chave, JSON.stringify(this.estado)); } catch { /* ignora */ }
  }

  #podar() {
    const limite = hojeISO(new Date(Date.now() - 14 * 864e5));
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.prefixo + '.') && k.slice(this.prefixo.length + 1) < limite) {
          localStorage.removeItem(k);
        }
      }
    } catch { /* ignora */ }
  }

  seriesFeitas(sessaoId, ordem) {
    return (this.estado.series || {})[`${sessaoId}.${ordem}`] || 0;
  }

  marcarSerie(sessaoId, ordem, total) {
    this.estado.series = this.estado.series || {};
    const k = `${sessaoId}.${ordem}`;
    const atual = this.estado.series[k] || 0;
    this.estado.series[k] = atual >= total ? 0 : atual + 1;
    this.#gravar();
    return this.estado.series[k];
  }

  zerarSessao(sessaoId) {
    if (!this.estado.series) return;
    for (const k of Object.keys(this.estado.series)) {
      if (k.startsWith(sessaoId + '.')) delete this.estado.series[k];
    }
    this.#gravar();
  }

  progressoSessao(sessao) {
    const total = sessao.exercicios.reduce((s, e) => s + e.series, 0);
    const feitas = sessao.exercicios.reduce((s, e) => s + Math.min(this.seriesFeitas(sessao.id, e.ordem), e.series), 0);
    return { feitas, total, perc: total ? Math.round((feitas / total) * 100) : 0 };
  }

  marcado(grupo, id) {
    return Boolean((this.estado[grupo] || {})[id]);
  }

  alternar(grupo, id) {
    this.estado[grupo] = this.estado[grupo] || {};
    this.estado[grupo][id] = !this.estado[grupo][id];
    this.#gravar();
    return this.estado[grupo][id];
  }

  contaMarcados(grupo) {
    return Object.values(this.estado[grupo] || {}).filter(Boolean).length;
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
