// Boot, roteador, navegação e tela de desbloqueio.
//
// O shell é público: cabeçalho, abas e coluna lateral montam antes de qualquer
// senha. Só o conteúdo dos documentos é cifrado.

import { Cofre } from './crypto.js';
import { Store, Registro, montarIndiceBusca, buscar } from './store.js';
import { h, icone, carregando, realcar, toast, aviso } from './ui.js';

import * as vHoje from './views/hoje.js';
import * as vComer from './views/comer.js';
import * as vTreinar from './views/treinar.js';
import * as vConsultar from './views/consultar.js';
import * as vSemana from './views/semana.js';
import * as vTreino from './views/treino.js';
import * as vPedal from './views/pedal.js';
import * as vNutricao from './views/nutricao.js';
import * as vSaude from './views/saude.js';
import * as vMais from './views/mais.js';

/* ===================== definição das seções ===================== */

// `principal` = aba inferior. São quatro, e correspondem aos momentos de uso:
// decidir o que fazer agora (Hoje), comer, treinar/pedalar e consultar o resto.
// Tudo mais é alcançado por Consultar, pela busca ou por link direto.
const SECOES = [
  { id: 'hoje', nome: 'Hoje', icone: 'hoje', cor: 'var(--c-hoje)', principal: true, render: vHoje.render },
  { id: 'comer', nome: 'Comer', icone: 'nutricao', cor: 'var(--c-nutricao)', principal: true, render: vComer.render },
  { id: 'treinar', nome: 'Treinar', icone: 'treino', cor: 'var(--c-treino)', principal: true, render: vTreinar.render },
  { id: 'consultar', nome: 'Consultar', icone: 'lista', cor: 'var(--c-geral)', principal: true, render: vConsultar.render },

  // Referência, alcançada por Consultar.
  { id: 'nutricao', nome: 'Nutrição', icone: 'nutricao', cor: 'var(--c-nutricao)', render: vNutricao.render },
  { id: 'treino', nome: 'Série de musculação', icone: 'treino', cor: 'var(--c-treino)', render: vTreino.render },
  { id: 'pedal', nome: 'Ciclismo', icone: 'pedal', cor: 'var(--c-pedal)', render: vPedal.render },
  { id: 'semana', nome: 'Últimos 7 dias', icone: 'historico', cor: 'var(--c-hoje)', render: vSemana.render },
  { id: 'saude', nome: 'Saúde', icone: 'saude', cor: 'var(--c-saude)', render: vSaude.render },
  { id: 'dermatologia', nome: 'Dermatologia', icone: 'derma', cor: 'var(--c-derma)', render: vMais.dermatologia },
  { id: 'historico', nome: 'Histórico', icone: 'historico', cor: 'var(--c-geral)', render: vMais.historico },
  { id: 'pareceres', nome: 'Pareceres', icone: 'parecer', cor: 'var(--c-geral)', render: vMais.pareceres },
  { id: 'perfil', nome: 'Perfil', icone: 'perfil', cor: 'var(--c-geral)', render: vMais.perfil },
  { id: 'editor', nome: 'Editar dados', icone: 'editor', cor: 'var(--c-geral)', render: vMais.editor }
];

const porId = (id) => SECOES.find((s) => s.id === id);

/* ===================== estado global ===================== */

const cofre = new Cofre();
const store = new Store(cofre);
const registro = new Registro();

const el = {
  conteudo: document.getElementById('conteudo'),
  rail: document.getElementById('rail'),
  tabbar: document.getElementById('tabbar'),
  sheet: document.getElementById('sheet'),
  backdrop: document.getElementById('sheet-backdrop'),
  brandSub: document.getElementById('brand-sub')
};

let indiceBusca = null;
let rotaAtual = { secao: 'hoje', params: [] };

/* ===================== tema ===================== */

const TEMA_CHAVE = 'rs.tema';

function aplicarTema(valor) {
  if (valor === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', valor);
  try { localStorage.setItem(TEMA_CHAVE, valor); } catch { /* ignora */ }
}

function alternarTema() {
  const atual = document.documentElement.getAttribute('data-tema');
  const escuroAgora = atual === 'escuro' ||
    (!atual && matchMedia('(prefers-color-scheme: dark)').matches);
  aplicarTema(escuroAgora ? 'claro' : 'escuro');
}

try {
  const salvo = localStorage.getItem(TEMA_CHAVE);
  if (salvo) aplicarTema(salvo);
} catch { /* ignora */ }

/* ===================== navegação ===================== */

function navegar(hash) {
  if (location.hash === hash) rotear();
  else location.hash = hash;
}

function montarNavegacao() {
  // abas inferiores (mobile)
  el.tabbar.replaceChildren(...SECOES.filter((s) => s.principal).map((s) =>
    h('button.tab', {
      type: 'button', dataset: { secao: s.id }, estilo: { '--accent': s.cor },
      onClick: () => navegar(`#/${s.id}`)
    }, icone(s.icone), h('span', { texto: s.nome }))
  ));

  // coluna lateral (desktop)
  el.rail.replaceChildren(
    h('div.rail-grupo', null,
      h('p.rail-titulo', { texto: 'Operar' }),
      ...SECOES.filter((s) => s.principal && s.id !== 'consultar').map(itemRail)
    ),
    h('div.rail-grupo', null,
      h('p.rail-titulo', { texto: 'Consultar' }),
      ...SECOES.filter((s) => !s.principal && s.id !== 'editor').map(itemRail)
    ),
    h('div.rail-grupo', null,
      h('p.rail-titulo', { texto: 'Dados' }),
      itemRail(porId('editor')),
      h('button.rail-item', { type: 'button', onClick: bloquear }, icone('cadeado'), 'Bloquear')
    )
  );
}

function itemRail(s) {
  return h('button.rail-item', {
    type: 'button', dataset: { secao: s.id }, estilo: { '--accent': s.cor },
    onClick: () => navegar(`#/${s.id}`)
  }, icone(s.icone), s.nome);
}

function marcarAtivo(secaoId) {
  for (const nodo of el.tabbar.children) {
    nodo.setAttribute('aria-current', nodo.dataset.secao === secaoId ? 'page' : 'false');
  }
  for (const nodo of el.rail.querySelectorAll('.rail-item')) {
    if (nodo.dataset.secao) nodo.setAttribute('aria-current', nodo.dataset.secao === secaoId ? 'page' : 'false');
  }
}

/* ===================== sheet "mais" ===================== */

function abrirSheet(conteudo, rotulo) {
  el.sheet.replaceChildren(h('div.sheet-alca'), conteudo);
  el.sheet.setAttribute('aria-label', rotulo || 'Menu');
  el.sheet.hidden = false;
  el.backdrop.hidden = false;
  const foco = el.sheet.querySelector('input, button');
  if (foco) foco.focus();
}

function fecharSheet() {
  el.sheet.hidden = true;
  el.backdrop.hidden = true;
  el.sheet.replaceChildren();
}

function menuMais() {
  const item = (s) => h('button.nav-card', {
    type: 'button', estilo: { '--accent': s.cor },
    onClick: () => { fecharSheet(); navegar(`#/${s.id}`); }
  },
    h('span.nav-card-icone', null, icone(s.icone)),
    h('span.nav-card-texto', null, h('strong', { texto: s.nome })),
    h('span.nav-card-seta', null, icone('seta'))
  );

  abrirSheet(h('div', null,
    h('p.sheet-titulo', { texto: 'Dados' }),
    h('div.pilha-2', null,
      item(porId('consultar')),
      item(porId('editor')),
      h('button.nav-card', {
        type: 'button', estilo: { '--accent': 'var(--c-critico)' },
        onClick: () => { fecharSheet(); bloquear(); }
      },
        h('span.nav-card-icone', null, icone('cadeado')),
        h('span.nav-card-texto', null,
          h('strong', { texto: 'Bloquear' }),
          h('span', { texto: 'Apaga a chave deste dispositivo' })
        )
      )
    ),
    h('p.sheet-titulo', { texto: 'Aparência' }),
    h('div.segmentos', null,
      [['auto', 'Sistema'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, nome]) =>
        h('button.segmento', {
          type: 'button',
          'aria-selected': String((document.documentElement.getAttribute('data-tema') || 'auto') === v),
          onClick: (e) => {
            aplicarTema(v);
            e.currentTarget.parentElement.querySelectorAll('.segmento').forEach((b) => b.setAttribute('aria-selected', 'false'));
            e.currentTarget.setAttribute('aria-selected', 'true');
          }
        }, nome)
      )
    )
  ), 'Mais seções');
}

/* ===================== busca ===================== */

async function abrirBusca() {
  if (!cofre.aberto) { toast('Desbloqueie os dados para buscar.'); return; }

  const resultados = h('div');
  const campo = h('input', { type: 'search', placeholder: 'Buscar exercício, exame, suplemento…', autocomplete: 'off', 'aria-label': 'Buscar' });

  abrirSheet(h('div', null,
    h('div.busca-campo', null, icone('busca'), campo),
    resultados
  ), 'Buscar');

  resultados.replaceChildren(carregando('Preparando índice…'));
  try {
    if (!indiceBusca) indiceBusca = montarIndiceBusca(await store.todos());
  } catch (e) {
    // Sem isso, a rejeição ficaria sem tratamento e o painel travaria no spinner.
    resultados.replaceChildren(aviso({
      nivel: 'critico',
      titulo: 'Não foi possível montar o índice de busca',
      texto: String((e && e.message) || e)
    }));
    return;
  }
  resultados.replaceChildren(h('p.legenda', { texto: `${indiceBusca.length} trechos indexados. Digite ao menos 2 letras.` }));

  let debounce = null;
  campo.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const termo = campo.value;
      const achados = buscar(indiceBusca, termo);
      if (termo.trim().length < 2) {
        resultados.replaceChildren(h('p.legenda', { texto: 'Digite ao menos 2 letras.' }));
        return;
      }
      if (!achados.length) {
        resultados.replaceChildren(h('p.vazio', { texto: `Nada encontrado para “${termo}”.` }));
        return;
      }
      resultados.replaceChildren(...achados.map((r) => {
        const secao = porId(r.slug === 'treinos' ? 'treino' : r.slug) || {};
        return h('button.busca-resultado', {
          type: 'button', estilo: { '--accent': secao.cor || 'var(--c-info)' },
          onClick: () => { fecharSheet(); navegar(r.rota); }
        },
          h('div.busca-secao', { texto: r.trilha ? `${r.secao} · ${r.trilha}` : r.secao }),
          h('div.busca-titulo', null, realcar(r.titulo, termo)),
          h('div.busca-trecho', null, realcar(r.texto.slice(0, 220), termo))
        );
      }));
    }, 140);
  });
  campo.focus();
}

/* ===================== desbloqueio ===================== */

function telaDesbloqueio() {
  const erro = h('p.desbloqueio-erro');
  const senha = h('input', { type: 'password', placeholder: 'Senha', autocomplete: 'current-password', 'aria-label': 'Senha' });
  const botao = h('button.btn.btn-primario', { type: 'submit' }, icone('cadeado'), 'Desbloquear');

  const form = h('form', {
    autocomplete: 'off',
    onSubmit: async (e) => {
      e.preventDefault();
      erro.textContent = '';
      if (!senha.value) return;
      botao.disabled = true;
      botao.replaceChildren(document.createTextNode('Verificando…'));
      try {
        await cofre.abrirComSenha(senha.value);
        await depoisDeAbrir();
      } catch {
        erro.textContent = 'Senha incorreta.';
        senha.value = '';
        senha.focus();
        botao.disabled = false;
        botao.replaceChildren(icone('cadeado'), document.createTextNode('Desbloquear'));
      }
    }
  }, senha, botao);

  return h('div.desbloqueio', null,
    h('div.desbloqueio-icone', null, icone('cadeado')),
    h('h1', { texto: 'Dados protegidos' }),
    h('p', { texto: 'A interface do app é pública; o conteúdo dos documentos é cifrado. Digite a senha para decifrar neste dispositivo.' }),
    form,
    erro,
    h('div.desbloqueio-nota', null,
      h('p', null, h('strong', { texto: 'Como funciona: ' }),
        'PBKDF2-SHA256 deriva uma chave AES-GCM-256 da senha. Cada documento em ',
        h('code', { texto: 'data/' }),
        ' é decifrado no navegador — nada é enviado para nenhum servidor.'),
      h('p.mt-2', { texto: 'A chave fica guardada neste dispositivo até você usar “Bloquear”.' })
    )
  );
}

function bloquear() {
  cofre.esquecer();
  store.limpar();
  indiceBusca = null;
  location.reload();
}

async function depoisDeAbrir() {
  await store.carregarIndice();
  const perfil = await store.doc('perfil');
  el.brandSub.textContent = `${perfil.pessoa.primeiroNome} · atualizado em ${perfil.meta.atualizadoEm.split('-').reverse().join('/')}`;
  registrarServiceWorker();
  rotear();
}

/* ===================== roteador ===================== */

function lerHash() {
  const m = location.hash.match(/^#\/([^/]+)(?:\/(.*))?$/);
  // Hash que não é rota (ex.: o "#conteudo" do link de pular navegação) não
  // deve jogar o usuário de volta para Hoje: mantém a rota atual.
  if (!m) return { secao: rotaAtual.secao, params: rotaAtual.params };
  const secao = decodeURIComponent(m[1]);
  const params = m[2] ? m[2].split('/').map(decodeURIComponent).filter(Boolean) : [];
  return { secao, params };
}

let tokenRender = 0;

async function rotear() {
  const { secao: id, params } = lerHash();
  const secao = porId(id) || porId('hoje');
  rotaAtual = { secao: secao.id, params };

  document.documentElement.style.setProperty('--accent', secao.cor);
  el.conteudo.style.setProperty('--accent', secao.cor);
  marcarAtivo(secao.id);
  document.title = secao.id === 'hoje' ? 'Rotina de Saúde' : `${secao.nome} — Rotina de Saúde`;

  // Incrementado antes de qualquer saída para que um render em voo não pinte
  // por cima do que vem depois.
  const meu = ++tokenRender;

  if (!cofre.aberto) {
    // Reaproveita a tela existente: trocar de aba com o cofre fechado não deve
    // apagar o que já foi digitado no campo de senha.
    if (!el.conteudo.firstElementChild || !el.conteudo.firstElementChild.classList.contains('desbloqueio')) {
      el.conteudo.replaceChildren(telaDesbloqueio());
      const campo = el.conteudo.querySelector('input');
      if (campo) campo.focus();
    }
    return;
  }

  el.conteudo.replaceChildren(carregando());

  try {
    const vista = await secao.render({
      store, registro, cofre,
      params,
      navegar,
      recarregar: rotear,
      abrirSheet, fecharSheet
    });
    if (meu !== tokenRender) return; // navegação mais nova já assumiu
    el.conteudo.replaceChildren(vista);
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (e) {
    if (meu !== tokenRender) return;
    el.conteudo.replaceChildren(
      aviso({ nivel: 'critico', titulo: 'Não foi possível montar esta seção', texto: String(e && e.message || e) }),
      h('button.btn.btn-secundario.mt-3', { type: 'button', onClick: rotear }, 'Tentar de novo')
    );
    console.error(e);
  }
}

/* ===================== service worker ===================== */

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline opcional */ });
}

/* ===================== eventos ===================== */

document.getElementById('btn-brand').addEventListener('click', () => navegar('#/hoje'));
document.getElementById('btn-menu').addEventListener('click', menuMais);
document.getElementById('btn-busca').addEventListener('click', abrirBusca);
document.getElementById('btn-tema').addEventListener('click', alternarTema);
el.backdrop.addEventListener('click', fecharSheet);
window.addEventListener('hashchange', rotear);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el.sheet.hidden) fecharSheet();
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); abrirBusca(); }
});

/* ===================== boot ===================== */

(async function iniciar() {
  montarNavegacao();
  marcarAtivo(lerHash().secao);

  try {
    await cofre.carregarConfig();
  } catch (e) {
    el.conteudo.replaceChildren(aviso({
      nivel: 'critico',
      titulo: 'Falha ao carregar a configuração',
      texto: 'Não foi possível ler crypto-config.json. Verifique se o app está sendo servido por HTTP (não por file://).'
    }));
    return;
  }

  el.conteudo.replaceChildren(carregando('Abrindo…'));
  const reaberto = await cofre.abrirComChaveSalva();
  if (reaberto) await depoisDeAbrir();
  else {
    // Índice é público: já pode ser carregado antes da senha.
    try { await store.carregarIndice(); } catch { /* segue sem índice */ }
    registrarServiceWorker();
    rotear();
  }
})();
