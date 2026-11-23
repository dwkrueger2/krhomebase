// file: apps/sandbox-api/src/hostPage.ts
/**
 * The sandbox's host page (`GET /`): the stand-in for the KR Homebase page around a tool, so a developer can open
 * their frame tool against sample data with no KR Homebase account.
 *
 * Stages: (1) the developer types the tool's address, its client id and the sandbox secret, and picks the display
 * mode and the theme; (2) the page trades the secret for a frame token (`POST /sandbox/frame-token`); (3) it opens
 * the tool in a frame with the same `sandbox` attribute KR Homebase uses; (4) it answers the bridge exactly as
 * KR Homebase does (protocol 1 of `@krhomebase/tool-sdk/protocol`): `krh:hello` gets `krh:init`, each `krh:request`
 * is sent to this sandbox's `/v1/...` with the frame token and answered with `krh:response`; (5) it shows every
 * message in a log, and `krh:set-title`, `krh:set-dirty` and `krh:set-height` in the header.
 *
 * The tool must list this page's origin in `connectToHost({ hostOrigins })` and allow it in its own
 * `frame-ancestors`, beside `https://krhomebase.com`.
 *
 * Plain HTML and one inline script (no build step): the page is a few kilobytes and served with a strict
 * Content-Security-Policy that allows only that script (by its hash), this origin, and frames from any https address
 * or a localhost one (the developer's tool).
 */

/** The `sandbox` attribute KR Homebase gives a tool's frame (`TOOL_FRAME_SANDBOX` in apps/web). Keep them the same. */
export const HOST_FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads'

/** The theme values a tool may rely on (packages/tool-sdk/README.md, section 3), light and dark, from apps/web/styles/theme.css. */
export const SAMPLE_THEME: Record<'light' | 'dark', Record<string, string>> = (() => {
  const font = 'Raleway, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  const light: Record<string, string> = {
    text: '#243142', 'text-muted': '#5a6775', 'text-inverse': '#f7f9fb', 'shell-surface': '#f7f9fb', 'card-surface': '#ffffff', 'muted-surface': '#eef3f7',
    'panel-background': '#ffffff', line: '#d7dee5', orange: '#e45e25', teal: '#4e998a', accent: '#8a715c', 'brand-primary': '#00305b', danger: '#9d2c20',
    success: '#246b45', warning: '#e45e25', 'button-primary-background': '#21394f', 'button-primary-hover-background': '#2d4a66',
    'button-secondary-background': '#eef3f7', 'table-heading-light': '#eef3f7', 'table-heading-dark': '#21394f', 'table-row-background-1': '#ffffff',
    'table-row-background-2': '#f7f9fb', 'table-row-hover': '#f0f6fb', 'table-row-selected': '#e3edf7', 'font-body': font, 'font-display': font,
    'font-size-base': '13px', 'font-size-small': '11px', 'font-size-bigger': '14.5px', 'font-size-title': 'clamp(20px, 2.4vw, 30px)',
  }
  const dark: Record<string, string> = {
    ...light,
    text: '#e3e9ef', 'text-muted': '#a3b0be', 'shell-surface': '#10161d', 'card-surface': '#18212b', 'muted-surface': '#1f2a36', 'panel-background': '#18212b',
    line: '#2f3d4c', orange: '#ec6a32', teal: '#66b8a8', accent: '#c0a68c', 'brand-primary': '#0b2744', danger: '#e2735f', success: '#5cbf86', warning: '#ec6a32',
    'button-primary-background': '#2d4a66', 'button-primary-hover-background': '#3a5c7e', 'button-secondary-background': '#1f2a36', 'table-heading-light': '#1f2a36',
    'table-heading-dark': '#2a4560', 'table-row-background-1': '#18212b', 'table-row-background-2': '#1c2631', 'table-row-hover': '#243243', 'table-row-selected': '#29405a',
  }
  const prefix = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).map(([name, value]) => [`--kr-theme-${name}`, value]))
  return { light: prefix(light), dark: prefix(dark) }
})()

/** The page's one script. Kept as plain JavaScript text: it runs in the developer's browser as it is. */
const HOST_SCRIPT = `
'use strict';
(function () {
  var THEME = ${JSON.stringify(SAMPLE_THEME)};
  var SANDBOX = ${JSON.stringify(HOST_FRAME_SANDBOX)};
  var $ = function (id) { return document.getElementById(id); };
  var frame = null, toolOrigin = '', token = '', clientId = '', mode = 'workspace', themeName = 'light';

  function log(direction, text) {
    var row = document.createElement('div');
    row.className = 'log-row ' + direction;
    row.textContent = new Date().toLocaleTimeString() + '  ' + (direction === 'in' ? 'tool → sandbox  ' : direction === 'out' ? 'sandbox → tool  ' : '') + text;
    $('log').prepend(row);
  }
  function say(text, bad) { $('status').textContent = text; $('status').className = bad ? 'bad' : 'ok'; }
  function remember() { try { localStorage.setItem('krh-sandbox-host', JSON.stringify({ address: $('address').value, clientId: $('clientId').value, mode: $('mode').value, theme: $('theme').value })); } catch (e) {} }
  try { var saved = JSON.parse(localStorage.getItem('krh-sandbox-host') || 'null'); if (saved) { $('address').value = saved.address || ''; $('clientId').value = saved.clientId || ''; $('mode').value = saved.mode || 'workspace'; $('theme').value = saved.theme || 'light'; } } catch (e) {}

  function allowedPath(path) {
    return typeof path === 'string' && path.indexOf('/v1/') === 0 && path.length <= 2000 && path.indexOf('..') < 0 && path.indexOf('\\\\') < 0 && path.indexOf('//') < 0 && !/[\\u0000-\\u001f\\u007f]/.test(path);
  }
  function send(message) { if (frame && frame.contentWindow) frame.contentWindow.postMessage(message, toolOrigin); }

  window.addEventListener('message', function (event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== toolOrigin) return;
    var data = event.data;
    if (!data || typeof data !== 'object' || data.protocol !== 1 || typeof data.kind !== 'string') return;
    if (data.kind === 'krh:hello') {
      log('in', 'krh:hello');
      send({ kind: 'krh:init', protocol: 1, clientId: clientId, mode: mode, theme: THEME[themeName] });
      log('out', 'krh:init (' + mode + ', ' + themeName + ' theme)');
      return;
    }
    if (data.kind === 'krh:request') {
      if (typeof data.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(data.id) || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].indexOf(data.method) < 0 || !allowedPath(data.path)) {
        log('in', 'a krh:request that KR Homebase would ignore (bad id, method or path)');
        return;
      }
      log('in', data.method + ' ' + data.path);
      var init = { method: data.method, headers: { authorization: 'Bearer ' + token, accept: 'application/json' } };
      if (data.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(data.body); }
      fetch(data.path, init).then(function (response) {
        return response.text().then(function (text) {
          var body; try { body = JSON.parse(text); } catch (e) { body = text; }
          send({ kind: 'krh:response', protocol: 1, id: data.id, status: response.status, body: body });
          log('out', response.status + ' ' + data.method + ' ' + data.path + (body && body.error ? '  ' + body.error.code : ''));
        });
      }).catch(function () {
        send({ kind: 'krh:response', protocol: 1, id: data.id, status: 0, body: { ok: false, error: { code: 'NETWORK_ERROR', message: 'The sandbox could not be reached.' }, requestId: '' } });
      });
      return;
    }
    if (data.kind === 'krh:set-title' && typeof data.title === 'string') { $('title').textContent = data.title.slice(0, 80); log('in', 'krh:set-title'); return; }
    if (data.kind === 'krh:set-dirty' && typeof data.dirty === 'boolean') { $('dirty').hidden = !data.dirty; log('in', 'krh:set-dirty ' + data.dirty); return; }
    if (data.kind === 'krh:set-height' && typeof data.height === 'number' && isFinite(data.height)) {
      var height = Math.min(2000, Math.max(40, Math.round(data.height)));
      if (mode === 'widget') frame.style.height = height + 'px';
      log('in', 'krh:set-height ' + height + (mode === 'widget' ? '' : ' (ignored outside a widget)'));
    }
  });

  $('open').addEventListener('click', function () {
    var address = $('address').value.trim();
    var url;
    try { url = new URL(address); } catch (e) { return say('The tool address is not a full address.', true); }
    var local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return say('The tool address must be https (http only for localhost).', true);
    clientId = $('clientId').value.trim(); mode = $('mode').value; themeName = $('theme').value;
    remember();
    say('Asking for a frame token...');
    fetch('/sandbox/frame-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: clientId, clientSecret: $('secret').value.trim() }) })
      .then(function (response) { return response.json(); })
      .then(function (reply) {
        if (!reply || !reply.ok) return say('Refused: ' + (reply && reply.error ? reply.error.code + ' ' + reply.error.message + (reply.error.details && reply.error.details.reason ? ' (' + reply.error.details.reason + ')' : '') : 'no reply'), true);
        token = reply.data.accessToken;
        toolOrigin = url.origin;
        if (frame) frame.remove();
        frame = document.createElement('iframe');
        frame.setAttribute('sandbox', SANDBOX);
        frame.setAttribute('title', 'Tool under test');
        frame.className = mode === 'widget' ? 'tool widget' : 'tool';
        frame.src = url.href;
        $('frameHolder').append(frame);
        $('dirty').hidden = true;
        $('title').textContent = '';
        document.documentElement.dataset.theme = themeName;
        say('Open with permissions: ' + (reply.data.scopes.join(', ') || 'none') + '. Sample data only; nothing is saved.');
        log('', 'Frame opened at ' + url.href);
      })
      .catch(function () { say('The sandbox could not be reached.', true); });
  });
})();
`

/** SHA-256 of the script, base64, for the Content-Security-Policy. Worked out once per isolate. */
let scriptHash: Promise<string> | null = null
async function hashOfScript(): Promise<string> {
  scriptHash ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(HOST_SCRIPT)).then((digest) => {
    let text = ''
    for (const byte of new Uint8Array(digest)) text += String.fromCharCode(byte)
    return btoa(text)
  })
  return scriptHash
}

/**
 * Builds the host page.
 *
 * @param version - The version shown in the footer.
 * @returns The response with the page and its security headers.
 */
export async function hostPageResponse(version: string): Promise<Response> {
  const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KR Homebase tool sandbox</title>
<style>
  :root { color-scheme: light; --bg: #f7f9fb; --card: #fff; --text: #243142; --muted: #5a6775; --line: #d7dee5; --accent: #e45e25; }
  :root[data-theme="dark"] { color-scheme: dark; --bg: #10161d; --card: #18212b; --text: #e3e9ef; --muted: #a3b0be; --line: #2f3d4c; --accent: #ec6a32; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 13px/1.3 Raleway, Inter, system-ui, sans-serif; }
  header { display: flex; gap: 8px; align-items: center; padding: 4px 8px; border-bottom: 2px solid var(--accent); background: var(--card); }
  header h1 { margin: 0; font-size: 14px; }
  .banner { padding: 3px 8px; background: var(--accent); color: #fff; font-weight: 600; }
  .form { display: grid; gap: 3px 6px; grid-template-columns: 110px minmax(0, 1fr); padding: 6px 8px; background: var(--card); border-bottom: 1px solid var(--line); }
  label { font-weight: 600; align-self: center; }
  input, select { height: 24px; padding: 2px 6px; border: 1px solid var(--line); border-radius: 2px; background: var(--card); color: var(--text); font: inherit; }
  button { height: 24px; padding: 0 10px; border: 0; border-radius: 2px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; justify-self: start; }
  #status { padding: 3px 8px; } .ok { color: var(--muted); } .bad { color: #c0392b; font-weight: 600; }
  main { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; padding: 6px 8px; }
  @media (min-width: 1024px) { main { grid-template-columns: minmax(0, 1fr) 360px; } }
  .tool { width: 100%; height: 70vh; border: 1px solid var(--line); border-radius: 3px; background: var(--card); }
  .tool.widget { height: 160px; max-width: 420px; }
  #log { height: 70vh; overflow: auto; border: 1px solid var(--line); border-radius: 3px; background: var(--card); font: 11px/1.3 ui-monospace, monospace; padding: 4px; }
  .log-row { padding: 1px 0; border-bottom: 1px solid var(--line); } .log-row.in { color: var(--muted); }
  #dirty { color: var(--accent); font-weight: 600; } #title { color: var(--muted); }
  footer { padding: 4px 8px; color: var(--muted); font-size: 11px; }
</style>
</head>
<body>
<div class="banner">Sandbox: sample data only. Nothing here is KR Homebase data, and nothing is saved.</div>
<header><h1>KR Homebase tool sandbox</h1><span id="title"></span><span id="dirty" hidden>Unsaved changes</span></header>
<div class="form">
  <label for="address">Tool address</label><input id="address" placeholder="https://your-tool.example.com/ or http://localhost:5173/" autocomplete="off">
  <label for="clientId">Client id</label><input id="clientId" placeholder="krt_..." autocomplete="off">
  <label for="secret">Sandbox secret</label><input id="secret" type="password" placeholder="krsbx1_... (from the super admin)" autocomplete="off">
  <label for="mode">Display mode</label><select id="mode"><option value="workspace">workspace</option><option value="popout">popout</option><option value="widget">widget</option></select>
  <label for="theme">Theme</label><select id="theme"><option value="light">light</option><option value="dark">dark</option></select>
  <span></span><button id="open" type="button">Open tool</button>
</div>
<div id="status" class="ok">Add this page's address to your tool's hostOrigins and frame-ancestors, then open it.</div>
<main><div id="frameHolder"></div><div id="log" aria-label="Bridge messages"></div></main>
<footer>krhomebase-sandbox-api ${escapeHtml(version)}. Server tools: POST /v1/tools/token here with the client id and the sandbox secret.</footer>
<script>${HOST_SCRIPT}</script>
</body>
</html>`
  const hash = await hashOfScript()
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': [
        "default-src 'none'",
        `script-src 'sha256-${hash}'`,
        "style-src 'unsafe-inline'",
        "connect-src 'self'",
        'frame-src https: http://localhost:* http://127.0.0.1:*',
        "img-src 'self' data:",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  })
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
