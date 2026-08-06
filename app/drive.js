// Backup no Google Drive, direto do navegador.
//
// O app é estático e não tem servidor, então não existe "backend que guarda o
// token". O caminho possível é o fluxo de token do Google Identity Services:
// o usuário autoriza, o navegador recebe um access token de ~1 hora e usa esse
// token para falar com a API do Drive. Nada é armazenado além da sessão.
//
// Escopo: drive.file — o app só enxerga os arquivos que ele mesmo criou. Não
// pede, e não recebe, acesso ao resto do Drive.
//
// Requer um client ID OAuth criado pelo dono da conta, guardado em
// perfil.integracoes.googleDrive.clientId. Client ID de aplicação web é público
// por definição (o segredo seria o client secret, que este fluxo não usa).

const GIS = 'https://accounts.google.com/gsi/client';
const ESCOPO = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

let carregandoGis = null;
let tokenAtual = null; // { valor, expiraEm }

/** Configuração vinda do perfil, ou null se o usuário ainda não criou o client ID. */
export function configDoDrive(perfil) {
  const c = perfil && perfil.integracoes && perfil.integracoes.googleDrive;
  return c && c.clientId ? c : null;
}

/** Carrega o script do Google uma única vez. */
function carregarGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (carregandoGis) return carregandoGis;

  carregandoGis = new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = GIS;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      carregandoGis = null;
      erro(new Error('não foi possível carregar o Google Identity Services — sem internet, ou o domínio está bloqueado'));
    };
    document.head.append(s);
  });
  return carregandoGis;
}

/**
 * Pede (ou reaproveita) um access token. O Google exige que a chamada que abre
 * o popup venha de um gesto do usuário — por isso isto só pode ser chamado a
 * partir de um clique.
 */
export async function autorizar(clientId, { forcar = false } = {}) {
  if (!forcar && tokenAtual && tokenAtual.expiraEm > Date.now() + 60_000) return tokenAtual.valor;

  await carregarGis();
  return new Promise((ok, erro) => {
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: ESCOPO,
      prompt: forcar ? 'consent' : '',
      callback: (resp) => {
        if (resp.error) {
          erro(new Error(`autorização negada: ${resp.error_description || resp.error}`));
          return;
        }
        tokenAtual = {
          valor: resp.access_token,
          expiraEm: Date.now() + (Number(resp.expires_in) || 3600) * 1000
        };
        ok(tokenAtual.valor);
      },
      error_callback: (e) => erro(new Error(`não foi possível autorizar: ${(e && e.type) || 'popup fechado'}`))
    });
    cliente.requestAccessToken();
  });
}

export function esquecerToken() {
  tokenAtual = null;
}

export function autorizado() {
  return Boolean(tokenAtual && tokenAtual.expiraEm > Date.now());
}

async function chamar(token, url, opcoes = {}) {
  const r = await fetch(url, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token}`, ...(opcoes.headers || {}) }
  });
  if (r.status === 401) {
    esquecerToken();
    throw new Error('a autorização expirou — autorize de novo');
  }
  if (!r.ok) {
    let detalhe = '';
    try { detalhe = (await r.json()).error?.message || ''; } catch { /* corpo não-JSON */ }
    throw new Error(`Drive respondeu ${r.status}${detalhe ? `: ${detalhe}` : ''}`);
  }
  return r;
}

/** Envia o backup como arquivo novo. Devolve { id, name }. */
export async function enviar(token, nome, texto, pastaId) {
  const meta = {
    name: nome,
    mimeType: 'application/json',
    description: 'Backup do Rotina de Saúde (conteúdo cifrado)',
    ...(pastaId ? { parents: [pastaId] } : {})
  };

  // multipart/related montado à mão: é o formato que o endpoint de upload pede,
  // e evita depender do client JS do Google só para isso.
  const limite = '-------rotina' + Math.random().toString(36).slice(2);
  const corpo =
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${limite}\r\nContent-Type: application/json\r\n\r\n${texto}\r\n` +
    `--${limite}--`;

  const r = await chamar(token, `${UPLOAD}?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
    body: corpo
  });
  return r.json();
}

/** Backups que este app criou, do mais novo para o mais antigo. */
export async function listar(token) {
  const q = encodeURIComponent("name contains 'rotina-backup' and trashed = false");
  const r = await chamar(token,
    `${API}/files?q=${q}&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,modifiedTime,size)`);
  return (await r.json()).files || [];
}

/** Baixa o conteúdo de um backup. */
export async function baixarDoDrive(token, id) {
  const r = await chamar(token, `${API}/files/${encodeURIComponent(id)}?alt=media`);
  return r.text();
}
