// Backup completo: tudo que existe neste dispositivo num arquivo só.
//
// O que entra:
//   - registro  — o que foi feito e comido. É o único dado insubstituível:
//                 vive no localStorage e some ao limpar os dados do site.
//   - documentos — os 11 documentos em claro. Eles também estão no git, mas um
//                 backup que não os inclui não é backup completo, e o editor do
//                 app permite editá-los sem passar pelo git.
//   - tema      — preferência de aparência, trivial mas cabe.
//
// O arquivo é CIFRADO com a mesma senha do app, porque contém dado de saúde e o
// destino provável é uma nuvem. O envelope fica em claro (dá para saber o que é
// e de quando é sem a senha); só o conteúdo é cifrado.

const FORMATO = 2;
const APP = 'rotina-saude';

/**
 * Monta o backup. Devolve `{ texto, resumo }` — texto pronto para gravar em
 * arquivo, resumo para mostrar ao usuário antes de compartilhar.
 */
export async function montarBackup({ store, registro, cofre, incluirDocumentos = true }) {
  if (!cofre.aberto) throw new Error('desbloqueie os dados antes de gerar o backup');

  const conteudo = {
    registro: { dias: registro.estado.dias, favoritos: registro.favoritos() }
  };

  if (incluirDocumentos) {
    conteudo.documentos = await store.todos();
  }
  try {
    const tema = localStorage.getItem('rs.tema');
    if (tema) conteudo.tema = tema;
  } catch { /* sem storage: segue sem o tema */ }

  const cifrado = await cofre.cifrar(JSON.stringify(conteudo));
  const envelope = {
    app: APP,
    formato: FORMATO,
    geradoEm: new Date().toISOString(),
    resumo: {
      dias: Object.keys(conteudo.registro.dias).length,
      favoritos: conteudo.registro.favoritos.length,
      documentos: conteudo.documentos ? Object.keys(conteudo.documentos).length : 0
    },
    aviso: 'Conteúdo cifrado com a senha do app. Sem ela, este arquivo não abre.',
    cifrado
  };

  return {
    texto: JSON.stringify(envelope, null, 1),
    resumo: envelope.resumo,
    nome: nomeDoArquivo()
  };
}

export function nomeDoArquivo(data = new Date()) {
  const iso = data.toISOString();
  return `rotina-backup-${iso.slice(0, 10)}-${iso.slice(11, 16).replace(':', 'h')}.json`;
}

/** Lê o envelope sem decifrar — serve para mostrar o que tem antes de restaurar. */
export function lerEnvelope(texto) {
  let e;
  try { e = JSON.parse(texto); } catch { throw new Error('arquivo não é JSON válido'); }
  if (!e || e.app !== APP) throw new Error('não é um backup do Rotina de Saúde');
  if (!e.cifrado || !e.cifrado.iv || !e.cifrado.ct) throw new Error('backup sem conteúdo cifrado');
  if (e.formato > FORMATO) {
    throw new Error(`backup no formato ${e.formato}, mais novo que este app (${FORMATO}) — atualize o app antes de restaurar`);
  }
  return e;
}

/**
 * Restaura o backup. `substituir` troca o registro inteiro; sem ele, os dias do
 * arquivo entram por cima dos existentes e o resto é preservado.
 *
 * Documentos voltam apenas para a sessão em memória: o app é estático e serve
 * os documentos de data/. Para valer permanentemente eles precisam ser baixados
 * cifrados (Consultar → Editar dados) e commitados. O retorno diz quais vieram,
 * para a view poder avisar.
 */
export async function restaurarBackup(texto, { store, registro, cofre, substituir = false }) {
  const envelope = lerEnvelope(texto);
  if (!cofre.aberto) throw new Error('desbloqueie os dados antes de restaurar');

  let conteudo;
  try {
    conteudo = JSON.parse(await cofre.decifrar(envelope.cifrado));
  } catch {
    throw new Error('não foi possível decifrar — o backup é de outra senha?');
  }

  const out = { dias: 0, documentos: [], geradoEm: envelope.geradoEm };

  if (conteudo.registro && conteudo.registro.dias) {
    out.dias = registro.importar(JSON.stringify(conteudo.registro), { substituir });
  }

  if (conteudo.documentos) {
    for (const [slug, dados] of Object.entries(conteudo.documentos)) {
      store.substituir(slug, JSON.stringify(dados, null, 1));
      out.documentos.push(slug);
    }
  }

  if (conteudo.tema) {
    try { localStorage.setItem('rs.tema', conteudo.tema); } catch { /* ignora */ }
  }

  return out;
}

/* ===================== entrega do arquivo ===================== */

/**
 * Baixa o backup como arquivo local.
 */
export function baixar(texto, nome) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** O aparelho consegue compartilhar arquivo? (Android/iOS modernos, sim.) */
export function podeCompartilhar() {
  try {
    return typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] });
  } catch {
    return false;
  }
}

/**
 * Abre a folha de compartilhamento do sistema com o arquivo. No celular é o
 * caminho mais curto para o Drive: um toque, sem OAuth, sem configuração.
 * Devolve false se o usuário cancelar.
 */
export async function compartilhar(texto, nome) {
  const arquivo = new File([texto], nome, { type: 'application/json' });
  try {
    await navigator.share({ files: [arquivo], title: 'Backup do Rotina de Saúde' });
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') return false;
    throw e;
  }
}
