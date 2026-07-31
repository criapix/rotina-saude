// Aba "Consultar" — tudo que é referência, num lugar só.
//
// Separar consulta de operação é o que permite as abas Comer e Treinar serem
// enxutas: o plano completo, os exames, os laudos e o balanço da semana são
// coisas que se lê de vez em quando, não a cada abertura do app.

import { h, icone, cabecalhoPagina, secao } from '../ui.js';

const GRUPOS = [
  {
    titulo: 'O plano',
    itens: [
      { id: 'nutricao', nome: 'Nutrição', desc: 'Cardápio por tipo de dia, alimentos, compensação, estratégias e metas', icone: 'nutricao', cor: 'var(--c-nutricao)' },
      { id: 'treino', nome: 'Série de musculação', desc: 'Sessões A a D, volume, progressão, restrições e rotação', icone: 'treino', cor: 'var(--c-treino)' },
      { id: 'pedal', nome: 'Ciclismo', desc: 'Rotina, protocolo do joelho, resistência e cuidados', icone: 'pedal', cor: 'var(--c-pedal)' }
    ]
  },
  {
    titulo: 'Acompanhamento',
    itens: [
      { id: 'semana', nome: 'Últimos 7 dias', desc: 'O que foi feito, gasto e balanço calórico, volume por grupo', icone: 'historico', cor: 'var(--c-hoje)' },
      { id: 'saude', nome: 'Saúde', desc: 'Resumo clínico, composição corporal, exames, laudos e pendências', icone: 'saude', cor: 'var(--c-saude)' },
      { id: 'dermatologia', nome: 'Dermatologia', desc: 'Rotina de pele', icone: 'derma', cor: 'var(--c-derma)' }
    ]
  },
  {
    titulo: 'Registro e dados',
    itens: [
      { id: 'historico', nome: 'Histórico', desc: 'Mudanças de plano ao longo do tempo', icone: 'historico', cor: 'var(--c-geral)' },
      { id: 'pareceres', nome: 'Pareceres', desc: 'Avaliações multidisciplinares', icone: 'parecer', cor: 'var(--c-geral)' },
      { id: 'perfil', nome: 'Perfil', desc: 'Dados pessoais e agenda de referência', icone: 'perfil', cor: 'var(--c-geral)' },
      { id: 'editor', nome: 'Editar dados', desc: 'Editar o JSON de um documento e baixar cifrado', icone: 'editor', cor: 'var(--c-geral)' }
    ]
  }
];

export async function render(ctx) {
  const perfil = await ctx.store.doc('perfil');
  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: 'Referência',
    titulo: 'Consultar',
    subtitulo: 'O que não é do dia a dia. Para operar, use Comer e Treinar.'
  }));

  for (const g of GRUPOS) {
    raiz.append(secao(g.titulo,
      h('div.pilha-2', null, g.itens.map((i) => h('button.nav-card', {
        type: 'button', estilo: { '--accent': i.cor },
        onClick: () => ctx.navegar(`#/${i.id}`)
      },
        h('span.nav-card-icone', null, icone(i.icone)),
        h('span.nav-card-texto', null,
          h('strong', { texto: i.nome }),
          h('span', { texto: i.desc })
        ),
        h('span.nav-card-seta', null, icone('seta'))
      )))
    ));
  }

  // Atalhos vindos do dado, só os que levam a uma sub-aba: os que apontam para
  // a raiz de uma seção já estão nos grupos acima e virariam linha repetida.
  const raizes = new Set(GRUPOS.flatMap((g) => g.itens.map((i) => `#/${i.id}`)));
  const atalhos = (perfil.atalhos || []).filter((a) => !raizes.has(a.rota));
  if (atalhos.length) {
    raiz.append(secao('Ir direto',
      h('div.grade.grade-2', null, atalhos.map((a) => h('button.nav-card', {
        type: 'button', estilo: { '--accent': 'var(--c-geral)' },
        onClick: () => ctx.navegar(a.rota)
      },
        h('span.nav-card-icone', null, icone(a.icone)),
        h('span.nav-card-texto', null,
          h('strong', { texto: a.titulo }),
          h('span', { texto: a.descricao })
        )
      )))
    ));
  }

  raiz.append(h('p.legenda.mt-4', null,
    'Busca global no ícone de lupa ou ', h('kbd', { texto: 'Ctrl/Cmd + K' }),
    ' — procura em todos os documentos decifrados.'
  ));

  return raiz;
}
