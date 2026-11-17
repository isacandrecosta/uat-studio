// Login "na própria ferramenta": abre uma janela do UAT Studio que mostra a página de login do fornecedor
// (por exemplo, a da Microsoft). A ferramenta não tem nenhum formulário de password: quem desenha a página
// e recebe a password é o fornecedor. A janela usa uma sessão em memória (sem cookies guardados no disco),
// não tem acesso ao Node nem à ponte da interface, e o regresso ao redirect_uri é apanhado antes de sair.
import { BrowserWindow, session } from 'electron';
import { randomBytes } from 'node:crypto';
import { ErroApi, LoginInterativo } from './pedidos';

const LIMITE_MS = 5 * 60_000;

/** Para o smoke: chamado com a janela de login aberta (para preencher a página de teste). */
let aoAbrirJanela: ((janela: BrowserWindow) => void) | null = null;
export function definirAoAbrirJanelaDeLogin(fn: ((janela: BrowserWindow) => void) | null): void {
  aoAbrirJanela = fn;
}

/** Preenche o utilizador (e a password, se o perfil a tiver no cofre) quando a página tem esses campos. */
function scriptPreencher(utilizador: string | undefined, password: string | undefined): string {
  return `(() => {
    const u = ${JSON.stringify(utilizador ?? '')}, p = ${JSON.stringify(password ?? '')};
    const visivel = (el) => el && el.offsetParent !== null;
    const definir = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const campoU = [...document.querySelectorAll('input[autocomplete="username"], input[type="email"], input[name*="user" i], input[name*="utilizador" i], input[name*="login" i], input[name*="email" i]')].find(visivel);
    if (u && campoU && !campoU.value) definir(campoU, u);
    const campoP = [...document.querySelectorAll('input[type="password"]')].find(visivel);
    if (p && campoP && !campoP.value) definir(campoP, p);
  })();`;
}

export function loginNaJanela(pedido: LoginInterativo, mae?: BrowserWindow | null): Promise<string> {
  const regresso = pedido.redirectUri.split(/[?#]/)[0];
  // Sessão só em memória (partição sem "persist:"): desaparece quando a janela fecha.
  const sessao = session.fromPartition(`uat-login-${randomBytes(6).toString('hex')}`);
  sessao.setPermissionRequestHandler((_wc, _permissao, responder) => responder(false));
  const janela = new BrowserWindow({
    width: 520,
    height: 720,
    title: `Login: ${pedido.perfilNome}`,
    autoHideMenuBar: true,
    ...(mae && !mae.isDestroyed() ? { parent: mae } : {}),
    webPreferences: { session: sessao, sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false },
  });
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  return new Promise<string>((resolver, rejeitar) => {
    let terminado = false;
    const acabar = (erro: Error | null, url?: string): void => {
      if (terminado) return;
      terminado = true;
      clearTimeout(relogio);
      if (!janela.isDestroyed()) janela.destroy();
      void sessao.clearStorageData().catch(() => undefined);
      if (erro) rejeitar(erro);
      else resolver(url ?? '');
    };
    const relogio = setTimeout(() => acabar(new ErroApi(`O login do perfil "${pedido.perfilNome}" não terminou em ${LIMITE_MS / 60_000} minutos.`)), LIMITE_MS);
    // O regresso nunca chega à rede: o pedido é cancelado e o endereço (com o código) fica connosco.
    sessao.webRequest.onBeforeRequest((detalhes, responder) => {
      if (detalhes.url.startsWith(regresso)) {
        responder({ cancel: true });
        acabar(null, detalhes.url);
        return;
      }
      responder({});
    });
    janela.on('closed', () => acabar(new ErroApi(`A janela de login do perfil "${pedido.perfilNome}" foi fechada antes de terminar.`)));
    janela.webContents.on('did-finish-load', () => {
      if (pedido.utilizador || pedido.password) void janela.webContents.executeJavaScript(scriptPreencher(pedido.utilizador, pedido.password)).catch(() => undefined);
    });
    janela.loadURL(pedido.url).catch((erro: unknown) => {
      // Um regresso apanhado também faz o carregamento "falhar" (cancelado): isso não é um erro.
      if (terminado) return;
      acabar(new ErroApi(`Não foi possível abrir a página de login do perfil "${pedido.perfilNome}": ${erro instanceof Error ? erro.message : String(erro)}`));
    });
    aoAbrirJanela?.(janela);
  });
}
