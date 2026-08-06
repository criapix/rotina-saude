// Aba "Backup" — exportar, importar e mandar para o Google Drive.
//
// A ordem dos caminhos na tela é a ordem de confiabilidade: baixar o arquivo
// sempre funciona, compartilhar funciona no celular sem configurar nada, e o
// Drive exige um client ID OAuth criado pelo dono da conta.

import {
  h, icone, cabecalhoPagina, aviso, card, secao, toast, dataBR, carregando
} from '../ui.js';
import {
  montarBackup, restaurarBackup, lerEnvelope,
  baixar, compartilhar, podeCompartilhar
} from '../backup.js';
import * as drive from '../drive.js';

export async function render(ctx) {
  const { store, registro, cofre } = ctx;
  const perfil = await store.doc('perfil');

  const raiz = h('div');
  raiz.append(cabecalhoPagina({
    kicker: 'Seus dados',
    titulo: 'Backup',
    subtitulo: `${registro.totalDias()} dia(s) registrado(s) neste aparelho. O app não tem servidor: o que está aqui só existe aqui.`
  }));

  raiz.append(aviso({
    nivel: 'info',
    titulo: 'O backup vai cifrado',
    texto: 'O arquivo carrega o registro e os 11 documentos, cifrados com a senha do app. Dá para guardar em qualquer nuvem sem expor nada — mas sem a senha ele não abre, nem por você.'
  }));

  raiz.append(blocoExportar(ctx));
  raiz.append(blocoImportar(ctx));
  raiz.append(blocoDrive(perfil, ctx));

  return raiz;
}

/* ===================== exportar ===================== */

function blocoExportar(ctx) {
  const estado = h('p.legenda.mt-3');

  const gerar = async () => {
    if (!ctx.cofre.aberto) { toast('Desbloqueie os dados primeiro.'); return null; }
    return montarBackup({ store: ctx.store, registro: ctx.registro, cofre: ctx.cofre });
  };

  const btnBaixar = h('button.btn.btn-primario', {
    type: 'button',
    onClick: async () => {
      try {
        const b = await gerar();
        if (!b) return;
        baixar(b.texto, b.nome);
        estado.textContent = `${b.nome} — ${b.resumo.dias} dia(s) e ${b.resumo.documentos} documento(s).`;
        toast('Backup baixado.');
      } catch (e) { toast('Falhou: ' + ((e && e.message) || e)); }
    }
  }, icone('laudo'), 'Baixar backup');

  const btnCompartilhar = podeCompartilhar()
    ? h('button.btn.btn-secundario', {
        type: 'button',
        onClick: async () => {
          try {
            const b = await gerar();
            if (!b) return;
            const foi = await compartilhar(b.texto, b.nome);
            if (foi) { estado.textContent = `${b.nome} compartilhado.`; toast('Enviado.'); }
          } catch (e) { toast('Falhou: ' + ((e && e.message) || e)); }
        }
      }, icone('seta'), 'Compartilhar')
    : null;

  return secao('Exportar',
    card(
      h('p.texto-2', { texto: 'Um arquivo com tudo. Guarde onde quiser — e-mail para você mesmo, pendrive, qualquer nuvem.' }),
      h('div.grade.grade-2.mt-3', null, btnBaixar, btnCompartilhar),
      btnCompartilhar
        ? h('p.legenda.mt-2', { texto: 'Compartilhar abre a folha do sistema: no celular é o caminho mais curto até o Drive, sem configurar nada.' })
        : h('p.legenda.mt-2', { texto: 'Este navegador não compartilha arquivos — no celular aparece também o botão de compartilhar.' }),
      estado
    )
  );
}

/* ===================== importar ===================== */

function blocoImportar(ctx) {
  const detalhe = h('div.mt-3');
  const substituir = h('input', { type: 'checkbox', id: 'bk-substituir' });
  const entrada = h('input', { type: 'file', accept: 'application/json', estilo: { display: 'none' } });

  entrada.addEventListener('change', async () => {
    const arq = entrada.files && entrada.files[0];
    entrada.value = '';
    if (!arq) return;
    detalhe.replaceChildren(carregando('Lendo o arquivo…'));
    try {
      const texto = await arq.text();
      const env = lerEnvelope(texto);
      const r = await restaurarBackup(texto, {
        store: ctx.store, registro: ctx.registro, cofre: ctx.cofre,
        substituir: substituir.checked
      });
      // Sem recarregar sozinho: a tela some junto com a confirmação, e o
      // usuário fica sem saber o que entrou. Ele decide quando sair daqui.
      detalhe.replaceChildren(
        aviso({
          nivel: 'ok',
          titulo: `Backup de ${dataBR(env.geradoEm.slice(0, 10))} restaurado`,
          texto: `${r.dias} dia(s) de registro e ${r.documentos.length} documento(s).` +
            (r.documentos.length
              ? ' Os documentos valem só nesta sessão: para fixar, baixe cifrado em Editar dados e faça commit.'
              : '')
        }),
        h('button.btn.btn-primario.mt-3', { type: 'button', onClick: () => ctx.navegar('#/hoje') },
          'Ver o dia', icone('seta'))
      );
      toast('Backup restaurado.');
    } catch (e) {
      detalhe.replaceChildren(aviso({
        nivel: 'critico', titulo: 'Não foi possível restaurar', texto: (e && e.message) || String(e)
      }));
    }
  });

  return secao('Importar',
    card(
      h('p.texto-2', { texto: 'Escolha um arquivo de backup. Por padrão os dias do arquivo entram por cima dos que já existem, e o resto é preservado.' }),
      h('label.linha.mt-3', { for: 'bk-substituir' },
        substituir,
        h('span.texto-sm', { texto: 'Substituir tudo (apaga o registro atual antes de importar)' })
      ),
      h('button.btn.btn-secundario.mt-3', { type: 'button', onClick: () => entrada.click() },
        icone('voltar'), 'Escolher arquivo'),
      entrada,
      detalhe
    )
  );
}

/* ===================== google drive ===================== */

function blocoDrive(perfil, ctx) {
  const cfg = drive.configDoDrive(perfil);
  const painel = h('div.mt-3');

  if (!cfg) {
    const g = (perfil.integracoes && perfil.integracoes.googleDrive) || {};
    return secao('Google Drive',
      card(
        h('p.texto-2', { texto: 'Enviar o backup direto para o Drive precisa de um ID de cliente OAuth criado na sua conta Google. Enquanto ele não existir, use Compartilhar — no celular resolve em um toque.' }),
        g.comoConfigurar
          ? h('div.mt-3', null,
              h('h4', { texto: 'Como configurar' }),
              h('ol.lista.mt-2', null, g.comoConfigurar.map((t) => h('li', { texto: t })))
            )
          : null,
        g.notaSeguranca ? h('p.legenda.mt-3', { texto: g.notaSeguranca }) : null
      )
    );
  }

  const comToken = async (fn) => {
    painel.replaceChildren(carregando('Falando com o Drive…'));
    try {
      const token = await drive.autorizar(cfg.clientId);
      await fn(token);
    } catch (e) {
      painel.replaceChildren(aviso({
        nivel: 'critico', titulo: 'Drive', texto: (e && e.message) || String(e)
      }));
    }
  };

  const enviar = () => comToken(async (token) => {
    const b = await montarBackup({ store: ctx.store, registro: ctx.registro, cofre: ctx.cofre });
    const arq = await drive.enviar(token, b.nome, b.texto, cfg.pastaId);
    painel.replaceChildren(aviso({
      nivel: 'ok',
      titulo: 'Enviado para o Drive',
      texto: `${arq.name} — ${b.resumo.dias} dia(s) e ${b.resumo.documentos} documento(s), cifrados.`
    }));
  });

  const listar = () => comToken(async (token) => {
    const arquivos = await drive.listar(token);
    if (!arquivos.length) {
      painel.replaceChildren(h('p.legenda', { texto: 'Nenhum backup deste app no seu Drive ainda.' }));
      return;
    }
    painel.replaceChildren(
      h('p.sheet-titulo', { texto: 'Backups no Drive' }),
      h('div.pilha-2', null, arquivos.map((a) => h('div.linha', null,
        h('div.esticar', null,
          h('strong.texto-sm', { texto: a.name }),
          h('div.texto-xs.texto-3', { texto: `${dataBR(a.modifiedTime.slice(0, 10))}${a.size ? ` · ${Math.round(a.size / 1024)} KB` : ''}` })
        ),
        h('button.btn.btn-fantasma', {
          type: 'button',
          onClick: () => comToken(async (token) => {
            const texto = await drive.baixarDoDrive(token, a.id);
            const r = await restaurarBackup(texto, {
              store: ctx.store, registro: ctx.registro, cofre: ctx.cofre
            });
            painel.replaceChildren(
              aviso({
                nivel: 'ok',
                titulo: 'Restaurado do Drive',
                texto: `${r.dias} dia(s) e ${r.documentos.length} documento(s).`
              }),
              h('button.btn.btn-primario.mt-3', { type: 'button', onClick: () => ctx.navegar('#/hoje') },
                'Ver o dia', icone('seta'))
            );
          })
        }, 'Restaurar')
      )))
    );
  });

  return secao('Google Drive',
    card(
      h('p.texto-2', { texto: 'O app envia o backup cifrado para o seu Drive. O escopo é drive.file: ele só enxerga os arquivos que ele mesmo criou.' }),
      h('div.grade.grade-2.mt-3', null,
        h('button.btn.btn-primario', { type: 'button', onClick: enviar }, icone('seta'), 'Enviar backup'),
        h('button.btn.btn-secundario', { type: 'button', onClick: listar }, icone('historico'), 'Ver backups')
      ),
      h('p.legenda.mt-2', { texto: cfg.notaBackup || '' }),
      painel
    )
  );
}
