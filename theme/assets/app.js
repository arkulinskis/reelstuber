/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback (footer + menu)
     All feedback goes to Prepsto. The widget tag in head.html (data-prepsto="CODE") slides its panel in;
     any [data-feedback] or [data-prepsto-open] element opens it. If the widget hasn't loaded, the panel opens in a new tab.
     There is no in-app feedback form any more: Admin -> Feedback only lists older messages (and app requests). */
  UI.feedback = function () {
    if (window.Prepsto && window.Prepsto.open) { window.Prepsto.open(); return; }
    var tag = document.querySelector('script[data-prepsto]');
    var code = tag && tag.getAttribute('data-prepsto');
    if (code && code.indexOf('__') !== 0) window.open('https://prepsto.com/#f/' + encodeURIComponent(code), '_blank', 'noopener');
    else UI.toast('Feedback is not set up yet.', 'error');
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: name, header, footer, phone tab bar.
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. */
(function () {
  'use strict';
  UI.configure({
    name: 'Reelstuber',
    key: 'reelstuber',          // prefix for this app's browser storage
    tagline: 'Long video in, reels out. Cut on your own device: your videos never leave it.',   // footer line
    home: 'home',                // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>' + esc(UI.config.name) + '</span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        (active !== 'auth' ? '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active || (p.name === 'home' && (active === 'project' || active === 'clip')) ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' : '') +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Sign up</a>')) +
        '</div></div>';
    },
    footer: function (me) {
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        '<a href="#landing" data-go="landing">About</a>' +
        '<a href="#templates" data-go="templates">Templates</a>' +
        '<a href="https://prepsto.com/#f/m9ke3hk" target="_blank" rel="noopener" data-prepsto-open>Submit feedback</a>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' ' + esc(UI.config.name) + '</p></div>';
    },
    tabbar: function (me, active) {
      var nav = UI.navPages();
      if (nav.length < 2 || (!me && (active === 'landing' || active === 'auth')) || active === 'clip') return '';
      return nav.slice(0, 3).map(function (p) {
        var on = p.name === active || (p.name === 'home' && active === 'project');
        return '<a href="#' + p.name + '" class="' + (on ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + (me ? '<a href="#profile" class="' + (active === 'profile' ? 'on' : '') + '">' + UI.icon('user') + '<span>You</span></a>'
        : '<a href="#auth/signup">' + UI.icon('star') + '<span>Sign up</span></a>');
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. See you soon!'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        var menu = root.querySelector('[data-menu]');
        if (e.key === 'Escape' && menu) menu.hidden = true;
      });
    },
    onTheme: function () {  // redraw the menu's Auto/Light/Dark buttons and keep the menu open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
    }
  };
})();


/* ===== _a_core.html ===== */
(function () {
  'use strict';
  var RS = window.RS = window.RS || {};

  /* ------------------------------------------------------------------ icons used across the app */
  Object.assign(UI.ICONS, {
    film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 18M8.6 16.4 20 6"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
    pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>',
    upload: '<path d="M12 16V4M6.5 9.5 12 4l5.5 5.5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    download: '<path d="M12 4v12M6.5 10.5 12 16l5.5-5.5"/><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>',
    wand: '<path d="m4 20 11-11"/><path d="m13 7 4 4"/><path d="M18 3v3M16.5 4.5h3M20 10v2M19 11h2M9 3v2M8 4h2"/>',
    cc: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17 10.2a2.2 2.2 0 1 0 0 3.6"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    type: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
    zap: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.3-1-1.6-1-2.7 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 20h8M10 17h4"/>',
    flame: '<path d="M12 21c4 0 7-2.7 7-6.8 0-3.5-2.5-5.6-3.6-8.2-.6 2-1.6 3-2.8 3.3C13 6 11.6 4 9.5 3c.4 3.4-4.5 6-4.5 11.2C5 18.3 8 21 12 21z"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    hd: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7.5 9v6M11 9v6M7.5 12H11M14 9v6h1.5a3 3 0 0 0 0-6z"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.3 14.2a4.6 4.6 0 0 0 7.4 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="3"/>'
  });

  /* ------------------------------------------------------------------ small helpers */
  RS.clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  RS.fmt = function (s, tenths) {
    s = Math.max(0, s || 0);
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    var ss = tenths ? sec.toFixed(1).padStart(4, '0') : String(Math.floor(sec)).padStart(2, '0');
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + ss;
  };
  RS.parseTime = function (str) {
    var p = String(str || '').trim().split(':').map(Number);
    if (!p.length || p.some(function (x) { return isNaN(x); })) return null;
    return p.reduce(function (acc, x) { return acc * 60 + x; }, 0);
  };
  RS.uid = function (pre) { return (pre || 'l') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  RS.debounce = function (fn, ms) {
    var t, pending = false;
    var d = function () { var a = arguments, self = this; pending = true; clearTimeout(t); t = setTimeout(function () { pending = false; fn.apply(self, a); }, ms); };
    d.flush = function () { if (pending) { clearTimeout(t); pending = false; fn(); } };
    d.cancel = function () { clearTimeout(t); pending = false; };
    return d;
  };
  RS.size = function (b) { return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? Math.round(b / 1e6) + ' MB' : Math.round((b || 0) / 1e3) + ' KB'; };
  RS.isGuest = function () { return !UI.me; };
  RS.wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  RS.switchHtml = function (name, label, on, hint) {
    return '<label class="rs-switch"><span>' + UI.esc(label) + (hint ? '<small>' + UI.esc(hint) + '</small>' : '') + '</span>' +
      '<input type="checkbox" data-k="' + name + '"' + (on ? ' checked' : '') + '></label>';
  };
  RS.rangeHtml = function (name, label, v, min, max, step, show) {
    return '<label class="rs-range"><span>' + UI.esc(label) + '<b data-show="' + name + '">' + UI.esc(show ? show(v) : v) + '</b></span>' +
      '<input type="range" data-k="' + name + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '"></label>';
  };
  RS.download = function (blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  };
  RS.slug = function (s) { return String(s || 'reel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'reel'; };

  /* ------------------------------------------------------------------ styles: defaults + built-in looks
     Keep in step with SPEC in server_code/Styles.py. */
  RS.DEFAULT_STYLE = {
    look: 'creator', aspect: '9:16', layout: 'fill', zoom: 1, fx: 0.5, fy: 0.5, zoom2: 1, fx2: 0.5, fy2: 0.5, split: 0.5, bg: '#FF3D8B', punch: false,
    captions: true, capStyle: 'clean', capFont: 'Bricolage Grotesque', capSize: 1, capPos: 0.72, capWords: 3, capUpper: false, capEmoji: false, hl: '#C6F432', capColor: '#FFFFFF',
    hook: '', hookSecs: 3, hookBg: '#C6F432', part: '', handle: '', handlePos: 'tr', progress: true, progColor: '#FF3D8B', cta: false, ctaText: 'Follow for part 2 👀',
    speed: 1, cutSilence: false, silence: 0.5, vol: 1, musicName: '', musicVol: 0.25, duck: true, quality: '1080',
    transIn: 'fade', transOut: 'fade', transCut: 'none', transLen: 0.4, transScenes: false, layers: [],
    grade: 'none', gradeAmt: 0.75, gradeWipe: false, pipPos: 'tl', pipSize: 0.38, pipName: '', wall: false
  };
  RS.FONTS = ['Anton', 'Bangers', 'Luckiest Guy', 'Bungee', 'Titan One', 'Lilita One', 'Rubik Mono One', 'Permanent Marker', 'Pacifico', 'Bricolage Grotesque', 'DM Sans', 'Playfair Display'];
  /* Colour grades (style.grade), drawn with blend modes in RS.grade (_c_engine.html). Keep in step with GRADES in Styles.py. */
  RS.GRADES = [['none', '🚫 None'], ['warm', '🌅 Warm'], ['moody', '🌑 Moody'], ['cool', '🧊 Cool'], ['teal', '🎬 Teal & orange'], ['vivid', '🌈 Vivid'], ['film', '🎞️ Film'], ['bw', '⚫ Black & white']];
  /* Cards on the reel (layer t: 'card'): a tool label, a GitHub-style repo card, a prompt bar that types itself. */
  RS.CARDS = [{ key: 'label', name: 'Tool label', v: 'FFmpeg', sub: '', icon: '🎬', fill: '#22C55E' },
    { key: 'repo', name: 'Repo card', v: 'yt-dlp/yt-dlp', sub: 'A feature-rich command-line audio/video downloader', icon: '📦', fill: '#2F81F7' },
    { key: 'prompt', name: 'Prompt bar', v: 'Make it moody and the colours go dark', sub: '', icon: '', fill: '#D97757' }];
  RS.TRANS = [['none', '🚫 None'], ['fade', '🌑 Fade'], ['flash', '⚡ Flash'], ['zoom', '🔍 Zoom'], ['whip', '💨 Whip'], ['glitch', '📺 Glitch'],
    ['shake', '🫨 Shake'], ['spin', '🌀 Spin'], ['pixel', '👾 Pixel']];
  /* Text and stickers on the reel (style.layers). Keep the lists in step with server_code/Styles.py. */
  RS.TEXT_STYLES = [
    { key: 'outline', name: 'Bold outline', font: 'Anton', fill: '#FFFFFF', line: '#000000' },
    { key: 'double', name: 'Double', font: 'Luckiest Guy', fill: '#FFFFFF', line: '#FF3D8B' },
    { key: 'pop3d', name: '3D pop', font: 'Titan One', fill: '#C6F432', line: '#7B5CFF' },
    { key: 'hollow', name: 'Hollow', font: 'Rubik Mono One', fill: '#FFFFFF', line: '#FFFFFF' },
    { key: 'glow', name: 'Glow', font: 'Lilita One', fill: '#FFFFFF', line: '#22E6D0' },
    { key: 'sticker', name: 'Sticker', font: 'Bungee', fill: '#1A1033', line: '#C6F432' },
    { key: 'marker', name: 'Marker', font: 'Permanent Marker', fill: '#1A1033', line: '#FFE14D' },
    { key: 'plain', name: 'Soft', font: 'Pacifico', fill: '#FFFFFF', line: '#000000' },
    { key: 'magazine', name: 'Magazine', font: 'Playfair Display', fill: '#FFFFFF', line: '#FFFFFF' }
  ];
  RS.ANIMS = [['none', 'None'], ['pop', '💥 Pop'], ['fade', '🌫️ Fade'], ['slide', '⬆️ Slide up'], ['drop', '⬇️ Drop'], ['zoom', '🔍 Zoom'], ['spin', '🌀 Spin'], ['type', '⌨️ Type']];
  RS.LOOPS = [['none', 'Still'], ['wiggle', '〰️ Wiggle'], ['float', '🎈 Float'], ['pulse', '💓 Pulse'], ['shake', '🫨 Shake'], ['spin', '🔄 Spin']];
  RS.EMOJI = {
    'Hype': ['🔥', '💥', '⚡', '🚀', '💯', '🏆', '👑', '🤯', '😱', '🎉'],
    'Feels': ['😂', '🥹', '😍', '🥲', '😭', '😎', '🤔', '🙄', '😤', '💀'],
    'Hands': ['👀', '👉', '👇', '👆', '👏', '🙌', '🤝', '🫶', '💪', '✌️'],
    'Things': ['🍿', '🎤', '🎮', '🎧', '📸', '💡', '💸', '❤️', '⭐', '✨']
  };
  RS.BADGES = [
    { v: 'OMG', shape: 'burst', fill: '#FFE14D' }, { v: 'WAIT…', shape: 'bubble', fill: '#FFFFFF' }, { v: 'NO WAY', shape: 'burst', fill: '#FF3D8B' },
    { v: 'FACTS', shape: 'pill', fill: '#C6F432' }, { v: 'LOL', shape: 'bubble', fill: '#22E6D0' }, { v: 'NEW!', shape: 'circle', fill: '#FF3D8B' },
    { v: 'PART 2', shape: 'pill', fill: '#7B5CFF' }, { v: 'LINK IN BIO', shape: 'pill', fill: '#FFFFFF' }, { v: 'SUBSCRIBE', shape: 'pill', fill: '#FF3B3B' },
    { v: 'STORY TIME', shape: 'bubble', fill: '#FFE14D' }, { v: 'TOP 3', shape: 'circle', fill: '#C6F432' }, { v: '● LIVE', shape: 'pill', fill: '#FF3B3B' }
  ];
  RS.SHAPES = [['arrow', '➜ Arrow'], ['ring', '⭕ Circle it'], ['underline', '〰️ Underline'], ['sparkles', '✨ Sparkles'], ['heart', '❤️ Heart'], ['star', '⭐ Star']];
  RS.newLayer = function (t, v, extra) {
    var card = t === 'card';
    return Object.assign({ id: Math.random().toString(36).slice(2, 10), t: t, v: v, x: 0.5, y: t === 'text' ? 0.3 : card ? 0.2 : 0.42, size: 1, rot: t === 'text' ? -3 : 0,
      s: 0, e: 3, all: false, anim: 'pop', loop: t === 'text' || card ? 'none' : 'wiggle', font: 'Anton', ts: 'outline', fill: '#FFFFFF', line: '#000000', shape: 'pill', upper: t === 'text',
      behind: false }, extra || {});
  };
  RS.LOOKS = [
    { key: 'creator', name: 'Creator Clean', emoji: '🤍', style: { layout: 'fill', capStyle: 'clean', capFont: 'Bricolage Grotesque', capWords: 3, capUpper: false, capEmoji: false, punch: false, progress: true, progColor: '#FFFFFF', grade: 'none', transIn: 'fade', transCut: 'whip' } },
    { key: 'moody', name: 'Moody Talk', emoji: '🌑', style: { layout: 'fill', capStyle: 'clean', capFont: 'DM Sans', capWords: 4, capUpper: false, capEmoji: false, punch: false, progress: false, grade: 'moody', gradeAmt: 0.8, transIn: 'fade', transCut: 'whip' } },
    { key: 'pop-star', name: 'Pop Star', emoji: '🌟', style: { layout: 'fill', capStyle: 'pop', capFont: 'Anton', hl: '#C6F432', capWords: 3, capUpper: true, progress: true, progColor: '#FF3D8B', punch: true, transCut: 'zoom' } },
    { key: 'comic', name: 'Comic Chaos', emoji: '💥', style: { layout: 'fill', capStyle: 'comic', capFont: 'Luckiest Guy', hl: '#FFE14D', capWords: 2, capUpper: true, punch: true, progColor: '#FFE14D', transIn: 'zoom', transCut: 'flash' } },
    { key: 'karaoke', name: 'Karaoke', emoji: '🎤', style: { layout: 'fill', capStyle: 'karaoke', capFont: 'Anton', hl: '#FF3D8B', capWords: 4, capUpper: true } },
    { key: 'podcast', name: 'Podcast Split', emoji: '🎙️', style: { layout: 'split', split: 0.5, capStyle: 'boxed', capFont: 'DM Sans', hl: '#FFD84D', capPos: 0.5, capWords: 4, capUpper: false } },
    { key: 'framed', name: 'Sticker Frame', emoji: '🖼️', style: { layout: 'framed', bg: '#FF3D8B', capStyle: 'boxed', capFont: 'Bricolage Grotesque', hl: '#C6F432', hookBg: '#C6F432', capPos: 0.8, capUpper: false } },
    { key: 'neon', name: 'Neon Night', emoji: '🌙', style: { layout: 'fit', capStyle: 'neon', capFont: 'Lilita One', hl: '#22E6D0', progColor: '#7C5CFF', capUpper: false, transIn: 'glitch', transCut: 'glitch' } },
    { key: 'clean', name: 'Clean & Calm', emoji: '🫧', style: { layout: 'fit', capStyle: 'minimal', capFont: 'DM Sans', capWords: 5, capUpper: false, progress: false, punch: false, capEmoji: false, transCut: 'fade' } }
  ];
  RS.KIT_KEYS = ['look', 'aspect', 'layout', 'bg', 'punch', 'captions', 'capStyle', 'capFont', 'capSize', 'capPos', 'capWords', 'capUpper', 'capEmoji', 'hl', 'capColor',
    'hookSecs', 'hookBg', 'handle', 'handlePos', 'progress', 'progColor', 'cta', 'ctaText', 'cutSilence', 'transIn', 'transOut', 'transCut', 'transLen', 'quality', 'grade', 'gradeAmt'];
  RS.LOOK_KEYS = ['layout', 'split', 'bg', 'punch', 'captions', 'capStyle', 'capFont', 'capSize', 'capPos', 'capWords', 'capUpper', 'capEmoji', 'hl', 'capColor',
    'hookBg', 'progress', 'progColor', 'cta', 'ctaText', 'fy2', 'transIn', 'transOut', 'transCut', 'grade', 'gradeAmt'];
  RS.kit = {};  // the signed-in person's (or guest's) brand kit, set by the studio and brand pages
  RS.styleFor = function (over) {
    var st = Object.assign({}, RS.DEFAULT_STYLE);
    RS.KIT_KEYS.forEach(function (k) { if (RS.kit[k] !== undefined && RS.kit[k] !== '') st[k] = RS.kit[k]; });
    if (RS.kit.look) { var lk = RS.lookByKey(RS.kit.look); if (lk && !RS.kit.capStyle) Object.assign(st, lk.style); }
    return Object.assign(st, over || {});
  };
  RS.fullStyle = function (st) {
    st = st || {};
    var out = Object.assign({}, RS.DEFAULT_STYLE, st);
    if (st.transIn === undefined && st.fadeIn === false) out.transIn = 'none';    // clips saved before transitions
    if (st.transOut === undefined && st.fadeOut === false) out.transOut = 'none';
    delete out.fadeIn; delete out.fadeOut;
    out.layers = (Array.isArray(st.layers) ? st.layers : []).map(function (L) { return Object.assign({}, L); });
    return out;
  };
  RS.lookByKey = function (k) { return RS.LOOKS.filter(function (l) { return l.key === k; })[0] || null; };
  RS.applyLook = function (st, lookStyle, key) {  // keeps the clip's own framing, hook and timing
    var out = Object.assign({}, st);
    RS.LOOK_KEYS.forEach(function (k) { if (lookStyle[k] !== undefined) out[k] = lookStyle[k]; });
    out.look = key || lookStyle.look || out.look;
    return out;
  };

  /* ------------------------------------------------------------------ data layer
     Same shapes as server_code/Studio.py + Brand.py. Signed in: the server. Guest: this browser (localStorage). */
  var LKEY = 'local.v1';
  function L() { return UI.store.get(LKEY, null) || { projects: [], exports: [], brand: {} }; }
  function Lsave(d) {
    try { localStorage.setItem(UI.config.key + '.' + LKEY, JSON.stringify(d)); }
    catch (e) { throw Object.assign(new Error('This browser\'s storage is full. Delete an old project, or sign up to keep projects in your account.'), { uiApi: true }); }
  }
  function nowIso() { return new Date().toISOString(); }
  function lproj(d, id) { return d.projects.filter(function (p) { return p.id === id; })[0]; }
  function lclip(d, id) {
    for (var i = 0; i < d.projects.length; i++) {
      var c = (d.projects[i].clips || []).filter(function (c) { return c.id === id; })[0];
      if (c) return { p: d.projects[i], c: c };
    }
    return null;
  }
  function summary(p) {
    var cl = p.clips || [];
    var s = Object.assign({}, p);
    delete s.clips; delete s.transcript;
    s.clip_count = cl.length;
    s.ready_count = cl.filter(function (c) { return c.status === 'ready'; }).length;
    s.exported_count = cl.filter(function (c) { return c.status === 'exported'; }).length;
    s.has_transcript = !!(p.transcript && p.transcript.words && p.transcript.words.length);
    return s;
  }
  function sortClips(p) { (p.clips || []).sort(function (a, b) { return (a.idx - b.idx) || (a.start - b.start); }); return p; }
  function full(p) { var s = summary(p); s.transcript = p.transcript || null; s.settings = p.settings || {}; s.clips = sortClips(p).clips.slice(); return JSON.parse(JSON.stringify(s)); }
  function fail(msg) { return Promise.reject(Object.assign(new Error(msg), { uiApi: true, expected: true })); }
  var BADGES = [['first_cut', '✂️', 'First cut', 'Export your first reel'], ['hat_trick', '🎩', 'Hat trick', 'Export 3 reels'],
    ['ten_club', '🔟', 'Ten-reel club', 'Export 10 reels'], ['caption_crew', '💬', 'Caption crew', 'Export 5 reels with captions'],
    ['on_fire', '🔥', 'On fire', 'Export on 3 days in a row'], ['binge', '🍿', 'Binge cutter', 'Export 5 reels from one video'],
    ['shape_shifter', '📐', 'Shape shifter', 'Export in 3 different shapes'], ['tastemaker', '🎨', 'Tastemaker', 'Share a template with everyone']];
  function localStats(d) {
    var ex = d.exports, days = {}, per = {};
    ex.forEach(function (e) { days[e.at.slice(0, 10)] = 1; per[e.project] = (per[e.project] || {}); per[e.project][e.clip] = 1; });
    var list = Object.keys(days).sort().reverse(), streak = 0;
    var today = new Date(); var iso = function (dd) { return dd.toISOString().slice(0, 10); };
    var y = new Date(today.getTime() - 864e5);
    if (list.length && (list[0] === iso(today) || list[0] === iso(y))) {
      streak = 1;
      for (var i = 1; i < list.length; i++) { if ((new Date(list[i - 1]) - new Date(list[i])) / 864e5 === 1) streak++; else break; }
    }
    return { exports: ex.length, seconds: Math.round(ex.reduce(function (a, e) { return a + (e.seconds || 0); }, 0)), streak: streak,
      minutes_saved: ex.length * 12, captions: ex.filter(function (e) { return e.captions; }).length,
      aspects: Object.keys(ex.reduce(function (a, e) { a[e.aspect] = 1; return a; }, {})).length,
      best_project: Math.max.apply(null, [0].concat(Object.keys(per).map(function (k) { return Object.keys(per[k]).length; }))),
      templates: 0, projects: d.projects.length, clips: d.projects.reduce(function (a, p) { return a + (p.clips || []).length; }, 0) };
  }
  RS.badgesFor = function (s) {
    var got = { first_cut: s.exports >= 1, hat_trick: s.exports >= 3, ten_club: s.exports >= 10, caption_crew: s.captions >= 5, on_fire: s.streak >= 3,
      binge: s.best_project >= 5, shape_shifter: s.aspects >= 3, tastemaker: s.templates >= 1 };
    return BADGES.map(function (b) { return { key: b[0], emoji: b[1], name: b[2], desc: b[3], got: !!got[b[0]] }; });
  };
  function cleanClip(raw, idx, dur) {
    var s = +raw.start, e = Math.min(+raw.end, dur || 1e9);
    if (!(e - s >= 1)) return null;
    return { id: RS.uid('c'), idx: raw.idx != null ? raw.idx : idx, title: raw.title || ('Clip ' + (idx + 1)), start: +s.toFixed(3), end: +e.toFixed(3),
      score: raw.score == null ? null : raw.score, label: raw.label || '', source: raw.source || 'manual', edited: false, status: raw.status || 'draft',
      style: raw.style || {}, post: raw.post || {}, export_count: 0, exported_at: null, created: nowIso(), updated: nowIso() };
  }

  RS.db = {
    home: function () {
      if (UI.me) return UI.api('studio_home');
      var d = L(), s = localStats(d);
      return Promise.resolve({ projects: d.projects.slice().sort(function (a, b) { return a.updated < b.updated ? 1 : -1; }).map(summary),
        stats: s, badges: RS.badgesFor(s), brand: d.brand || {} });
    },
    project: function (id) {
      if (UI.me && !/^l/.test(id)) return UI.api('project_get', id).then(function (r) { return r.project; });
      var p = lproj(L(), id);
      return p ? Promise.resolve(full(p)) : fail(UI.me ? 'That project was made before you signed in. Find it on the Studio page.' : 'That project isn\'t in this browser.');
    },
    createProject: function (meta, transcript) {
      if (UI.me) return UI.api('project_create', meta, transcript || null).then(function (r) { return r.project; });
      var d = L();
      if (d.projects.length >= 12) return fail('Guests can keep 12 projects in this browser. Delete one, or sign up for more.');
      var p = Object.assign({ id: RS.uid('l'), title: meta.title || meta.file_name || 'Untitled video', created: nowIso(), updated: nowIso(), settings: {}, clips: [] }, meta);
      p.transcript = transcript || null;
      d.projects.push(p); Lsave(d);
      return Promise.resolve(full(p));
    },
    updateProject: function (id, fields) {
      if (UI.me && !/^l/.test(id)) return UI.api('project_update', id, fields).then(function (r) { return r.project; });
      var d = L(), p = lproj(d, id);
      if (!p) return fail('That project isn\'t here any more.');
      Object.assign(p, fields, { updated: nowIso() }); Lsave(d);
      return Promise.resolve(summary(p));
    },
    deleteProject: function (id) {
      if (UI.me && !/^l/.test(id)) return UI.api('project_delete', id);
      var d = L(); d.projects = d.projects.filter(function (p) { return p.id !== id; }); Lsave(d);
      return Promise.resolve({ ok: true });
    },
    addClips: function (pid, clips, replaceDrafts) {
      if (UI.me && !/^l/.test(pid)) return UI.api('clips_add', pid, clips, !!replaceDrafts);
      var d = L(), p = lproj(d, pid);
      if (!p) return fail('That project isn\'t here any more.');
      if (replaceDrafts) p.clips = p.clips.filter(function (c) { return !(c.source === 'auto' && !c.edited && c.status === 'draft'); });
      if (p.clips.length + clips.length > 60) return fail('A project can hold 60 clips. Delete a few first.');
      var base = Math.max.apply(null, [-1].concat(p.clips.map(function (c) { return c.idx; }))) + 1, added = [];
      clips.forEach(function (raw, i) { var c = cleanClip(raw, base + i, p.duration); if (c) { p.clips.push(c); added.push(c.id); } });
      p.updated = nowIso(); Lsave(d);
      return Promise.resolve({ ok: true, clips: full(p).clips, added: added });
    },
    saveClip: function (cid, fields) {
      if (UI.me && !/^l/.test(cid)) return UI.api('clip_save', cid, fields).then(function (r) { return r.clip; });
      var d = L(), f = lclip(d, cid);
      if (!f) return fail('That clip isn\'t here any more.');
      if (fields.start != null && fields.end - fields.start < 1) return fail('A clip must be at least 1 second long.');
      if (['start', 'end', 'style', 'title'].some(function (k) { return k in fields; })) fields.edited = true;
      Object.assign(f.c, JSON.parse(JSON.stringify(fields)), { updated: nowIso() }); f.p.updated = nowIso(); Lsave(d);
      return Promise.resolve(JSON.parse(JSON.stringify(f.c)));
    },
    duplicateClip: function (cid) {
      if (UI.me && !/^l/.test(cid)) return UI.api('clip_duplicate', cid);
      var d = L(), f = lclip(d, cid);
      if (!f) return fail('That clip isn\'t here any more.');
      f.p.clips.forEach(function (c) { if (c.idx > f.c.idx) c.idx++; });
      var copy = Object.assign(JSON.parse(JSON.stringify(f.c)), { id: RS.uid('c'), idx: f.c.idx + 1, title: f.c.title + ' (copy)', source: 'copy', status: 'draft', export_count: 0, exported_at: null, edited: false });
      f.p.clips.push(copy); Lsave(d);
      return Promise.resolve({ ok: true, clip: copy, clips: full(f.p).clips });
    },
    deleteClip: function (cid) {
      if (UI.me && !/^l/.test(cid)) return UI.api('clip_delete', cid);
      var d = L(), f = lclip(d, cid);
      if (f) { f.p.clips = f.p.clips.filter(function (c) { return c.id !== cid; }); Lsave(d); }
      return Promise.resolve({ ok: true });
    },
    logExport: function (cid, info) {
      if (UI.me && !/^l/.test(cid)) return UI.apiQuiet('export_logged', cid, info);
      var d = L(), f = lclip(d, cid);
      if (!f) return fail('That clip isn\'t here any more.');
      var before = RS.badgesFor(localStats(d)).filter(function (b) { return b.got; }).map(function (b) { return b.key; });
      var st = RS.fullStyle(f.c.style);
      d.exports.push({ at: nowIso(), seconds: info.seconds || 0, aspect: st.aspect, captions: !!st.captions, project: f.p.id, clip: cid });
      f.c.status = 'exported'; f.c.export_count = (f.c.export_count || 0) + 1; f.c.exported_at = nowIso();
      Lsave(d);
      var s = localStats(d);
      return Promise.resolve({ ok: true, clip: f.c, stats: s, new_badges: RS.badgesFor(s).filter(function (b) { return b.got && before.indexOf(b.key) < 0; }) });
    },
    brand: function () {
      if (UI.me) return UI.api('brand_get');
      return Promise.resolve({ kit: L().brand || {}, templates: [] });
    },
    saveBrand: function (kit) {
      if (UI.me) return UI.api('brand_save', kit).then(function (r) { return r.kit; });
      var d = L(); d.brand = kit; Lsave(d);
      return Promise.resolve(kit);
    },
    localProjects: function () { return L().projects; },
    forgetLocal: function (ids) { var d = L(); d.projects = d.projects.filter(function (p) { return ids.indexOf(p.id) < 0; }); Lsave(d); }
  };

  /* ------------------------------------------------------------------ the vault: videos kept on this device (OPFS) */
  RS.vault = {
    ok: !!(navigator.storage && navigator.storage.getDirectory && window.FileSystemWritableFileStream),
    dir: function () { return navigator.storage.getDirectory().then(function (root) { return root.getDirectoryHandle('reelstuber', { create: true }); }); },
    save: function (name, blob) {
      if (!RS.vault.ok) return Promise.resolve(false);
      return RS.vault.dir().then(function (d) { return d.getFileHandle(name, { create: true }); })
        .then(function (h) { return h.createWritable(); })
        .then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
        .then(function () { return true; }).catch(function (e) { console.warn('vault save', e); return false; });
    },
    get: function (name) {
      if (!navigator.storage || !navigator.storage.getDirectory) return Promise.resolve(null);
      return RS.vault.dir().then(function (d) { return d.getFileHandle(name); }).then(function (h) { return h.getFile(); }).catch(function () { return null; });
    },
    drop: function (name) {
      if (!navigator.storage || !navigator.storage.getDirectory) return Promise.resolve();
      return RS.vault.dir().then(function (d) { return d.removeEntry(name); }).catch(function () {});
    },
    saveJSON: function (name, obj) { return RS.vault.save(name, new Blob([JSON.stringify(obj)], { type: 'application/json' })); },
    getJSON: function (name) { return RS.vault.get(name).then(function (f) { return f ? f.text().then(JSON.parse) : null; }).catch(function () { return null; }); },
    estimate: function () { return navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null); }
  };

  /* ------------------------------------------------------------------ media: loading videos */
  function once(el, ev, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { cleanup(); res('timeout'); }, ms || 8000);
      function ok() { cleanup(); res(ev); }
      function bad() { cleanup(); rej(new Error('This video can\'t be played in this browser. Try an MP4 (H.264) or WebM file.')); }
      function cleanup() { clearTimeout(t); el.removeEventListener(ev, ok); el.removeEventListener('error', bad); }
      el.addEventListener(ev, ok); el.addEventListener('error', bad);
    });
  }
  RS.seek = function (v, t) {
    t = RS.clamp(t, 0, Math.max(0, (v.duration || 0) - 0.01));
    if (Math.abs(v.currentTime - t) < 0.002 && v.readyState >= 2) return Promise.resolve();
    var p = once(v, 'seeked', 5000);
    v.currentTime = t;
    return p;
  };
  function fixDuration(v) {
    if (isFinite(v.duration) && v.duration > 0) return Promise.resolve();
    // Videos recorded in a browser often don't say how long they are until we jump to the end.
    return new Promise(function (res) {
      var done = false;
      function fin() { if (done) return; done = true; v.removeEventListener('durationchange', on); v.currentTime = 0; once(v, 'seeked', 4000).then(res, res); }
      function on() { if (isFinite(v.duration) && v.duration > 0) fin(); }
      v.addEventListener('durationchange', on);
      v.currentTime = 1e7;
      setTimeout(fin, 8000);
    });
  }
  RS.videoEl = function (url) {
    var v = document.createElement('video');
    v.preload = 'auto'; v.playsInline = true; v.setAttribute('playsinline', ''); v.crossOrigin = 'anonymous';
    v.src = url;
    return once(v, 'loadedmetadata', 20000).then(function (r) {
      if (r === 'timeout') throw new Error('This video took too long to open. Try an MP4 (H.264) or WebM file.');
      return fixDuration(v);
    }).then(function () { return v; });
  };
  RS.frameThumb = function (v, w) {
    w = w || 192;
    var h = Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    try { c.getContext('2d').drawImage(v, 0, 0, w, h); return c.toDataURL('image/jpeg', 0.72); } catch (e) { return ''; }
  };
  RS.media = {
    cache: {},
    get: function (pid) { return RS.media.cache[pid] || null; },
    /* Open a video (File or Blob) for a project: a shared <video> for previews + the facts we need. */
    open: function (pid, blob, name) {
      var old = RS.media.cache[pid];
      if (old && old.blob === blob) return Promise.resolve(old);
      var url = URL.createObjectURL(blob);
      return RS.videoEl(url).then(function (v) {
        if (old) RS.media.release(pid);
        var m = { pid: pid, blob: blob, url: url, el: v, duration: v.duration, width: v.videoWidth, height: v.videoHeight, name: name || blob.name || 'video', size: blob.size };
        RS.media.cache[pid] = m;
        return m;
      }, function (e) { URL.revokeObjectURL(url); throw e; });
    },
    /* Facts about a dropped file before it becomes a project: length, size, a preview frame. */
    probe: function (file) {
      var url = URL.createObjectURL(file);
      return RS.videoEl(url).then(function (v) {
        var d = v.duration;
        if (!(d > 0.5)) throw new Error('That video seems to be empty.');
        if (!v.videoWidth) throw new Error('That file has no picture we can read. Try an MP4 (H.264) or WebM video.');
        return RS.seek(v, Math.min(d * 0.15, 6)).then(function () {
          var out = { duration: +d.toFixed(3), width: v.videoWidth, height: v.videoHeight, thumb: RS.frameThumb(v, 192) };
          v.src = ''; URL.revokeObjectURL(url);
          return out;
        });
      }, function (e) { URL.revokeObjectURL(url); throw e; });
    },
    release: function (pid) {
      var m = RS.media.cache[pid];
      if (!m) return;
      try { m.el.pause(); m.el.removeAttribute('src'); m.el.load(); } catch (e) {}
      URL.revokeObjectURL(m.url);
      delete RS.media.cache[pid];
    },
    /* Find a project's video again: in memory, the bundled sample, or the vault. Resolves to the media or null. */
    restore: function (p) {
      if (RS.media.cache[p.id]) return Promise.resolve(RS.media.cache[p.id]);
      if (p.sample) return RS.sample().then(function (s) { return RS.media.open(p.id, s.blob, 'sample.webm'); });
      return RS.vault.get('video-' + p.id).then(function (f) { return f ? RS.media.open(p.id, f, p.file_name) : null; }).catch(function () { return null; });
    },
    keep: function (pid, file) { return RS.vault.save('video-' + pid, file); },
    forget: function (pid) { RS.media.release(pid); RS.vault.drop('video-' + pid); RS.vault.drop('analysis-' + pid + '.json'); delete RS.analyses[pid]; }
  };
  RS.analyses = {};  // pid -> analysis (see _b_smart.html)

  /* The bundled sample episode (assets/sample.webm + sample.json): fetched once as a Blob so seeking always works. */
  var samplePromise = null;
  RS.sample = function () {
    if (!samplePromise) {
      samplePromise = Promise.all([
        fetch('_/theme/sample.webm').then(function (r) { if (!r.ok) throw new Error('The sample video didn\'t load.'); return r.blob(); }),
        fetch('_/theme/sample.json').then(function (r) { return r.json(); })
      ]).then(function (x) { return { blob: new File([x[0]], 'snack-lab-ep12.webm', { type: 'video/webm' }), transcript: x[1] }; });
      samplePromise.catch(function () { samplePromise = null; });
    }
    return samplePromise;
  };

  /* ------------------------------------------------------------------ confetti */
  RS.confetti = function (n) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = document.createElement('canvas'); c.className = 'rs-confetti'; c.width = innerWidth; c.height = innerHeight;
    document.body.appendChild(c);
    var g = c.getContext('2d'), cols = ['#FF3D8B', '#C6F432', '#7B5CFF', '#FFD84D', '#22E6D0', '#1A1033'], ps = [];
    for (var i = 0; i < (n || 140); i++) ps.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 15 - 4,
      r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.4, w: 7 + Math.random() * 8, h: 5 + Math.random() * 6, c: cols[i % cols.length] });
    var t0 = performance.now();
    (function tick(t) {
      g.clearRect(0, 0, c.width, c.height);
      ps.forEach(function (p) { p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(tick); else c.remove();
    })(t0);
  };
  RS.badgeToast = function (badges) {
    (badges || []).forEach(function (b, i) { setTimeout(function () { UI.toast(b.emoji + ' New badge: ' + b.name + '!', 'ok'); }, 600 + i * 900); });
  };
})();

/* ===== _b_smart.html ===== */
(function () {
  'use strict';
  var RS = window.RS;

  /* ------------------------------------------------------------------ analysis */
  var HOP = 0.05;  // seconds per loudness value
  RS.HOP = HOP;

  function decodeMono(blob, rate) {
    if (blob.size > 1.6e9) return Promise.reject(new Error('too big to decode'));
    return blob.arrayBuffer().then(function (buf) {
      var ac = new OfflineAudioContext(1, rate, rate);
      return new Promise(function (res, rej) { ac.decodeAudioData(buf, res, rej); });
    }).then(function (ab) {
      if (ab.numberOfChannels === 1) return { data: ab.getChannelData(0), rate: ab.sampleRate };
      var out = new Float32Array(ab.length), n = ab.numberOfChannels;
      for (var ch = 0; ch < n; ch++) { var d = ab.getChannelData(ch); for (var i = 0; i < d.length; i++) out[i] += d[i] / n; }
      return { data: out, rate: ab.sampleRate };
    });
  }
  RS.decodeMono = decodeMono;

  function envelope(data, rate) {
    var hop = Math.round(rate * HOP), n = Math.floor(data.length / hop), env = new Array(n);
    for (var i = 0; i < n; i++) {
      var s = 0, o = i * hop;
      for (var j = 0; j < hop; j++) { var x = data[o + j]; s += x * x; }
      env[i] = Math.round(Math.max(-90, 10 * Math.log10(s / hop + 1e-10)) * 10) / 10;
    }
    return env;
  }
  function pct(arr, p) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  }

  /* Look at the whole video once. onProgress(fraction, message). Cached per project (memory + vault). */
  RS.analyze = function (m, onProgress) {
    var prog = onProgress || function () {};
    var a = { v: 2, duration: m.duration, hop: HOP, env: null, gaps: [], cuts: [], thumbs: [], floor: -60, loud: -20, thr: -45, notes: [] };
    prog(0.02, 'Listening for the loud bits…');
    return decodeMono(m.blob, 8000).then(function (au) {
      a.env = envelope(au.data, au.rate);
    }, function (e) {
      console.warn('audio decode', e);
      a.notes.push(m.blob.size > 1.6e9 ? 'This video is very big, so we skipped the sound check and used the picture only.' : 'We couldn\'t read this video\'s sound, so we used the picture only.');
    }).then(function () {
      if (a.env && a.env.length) {
        a.floor = pct(a.env, 0.1); a.loud = pct(a.env, 0.95);
        a.thr = Math.max(a.floor + 6, a.floor + (a.loud - a.floor) * 0.3);
        a.gaps = findGaps(a.env, a.thr, 0.3);
      }
      prog(0.3, 'Spotting scene changes…');
      return scanPicture(m, a, function (f) { prog(0.3 + f * 0.65, f < 0.5 ? 'Spotting scene changes…' : 'Making the timeline thumbnails…'); });
    }).then(function () {
      prog(1, 'Done!');
      RS.analyses[m.pid] = a;
      if (!m.blob.isSample) RS.vault.saveJSON('analysis-' + m.pid + '.json', a);
      return a;
    });
  };
  RS.loadAnalysis = function (pid) {
    if (RS.analyses[pid]) return Promise.resolve(RS.analyses[pid]);
    return RS.vault.getJSON('analysis-' + pid + '.json').then(function (a) { if (a && a.v === 2) RS.analyses[pid] = a; return RS.analyses[pid] || null; });
  };

  function findGaps(env, thr, minLen) {
    var gaps = [], start = -1, minN = Math.round(minLen / HOP);
    for (var i = 0; i <= env.length; i++) {
      var quiet = i < env.length && env[i] < thr;
      if (quiet && start < 0) start = i;
      if (!quiet && start >= 0) { if (i - start >= minN) gaps.push([+(start * HOP).toFixed(2), +(i * HOP).toFixed(2)]); start = -1; }
    }
    return gaps;
  }

  function scanPicture(m, a, prog) {
    var d = m.duration, step = RS.clamp(d / 260, 0.5, 5), n = Math.max(2, Math.floor(d / step));
    var thumbEvery = Math.max(1, Math.round(n / 48));
    var cv = document.createElement('canvas'); cv.width = 32; cv.height = 18;
    var g = cv.getContext('2d', { willReadFrequently: true });
    var tc = document.createElement('canvas'); tc.width = 160; tc.height = Math.round(160 * (m.height || 9) / (m.width || 16));
    var tg = tc.getContext('2d');
    var prev = null, diffs = [], times = [];
    return RS.videoEl(m.url).then(function (v) {
      v.muted = true;
      var i = 0;
      function next() {
        if (i >= n) { v.removeAttribute('src'); v.load(); return finish(); }
        var t = Math.min(d - 0.05, i * step + step / 2);
        return RS.seek(v, t).then(function () {
          g.drawImage(v, 0, 0, 32, 18);
          var px = g.getImageData(0, 0, 32, 18).data, lum = new Float32Array(576), hist = new Float32Array(24);
          for (var k = 0, p = 0; k < px.length; k += 4, p++) {
            lum[p] = 0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2];
            hist[px[k] >> 5]++; hist[8 + (px[k + 1] >> 5)]++; hist[16 + (px[k + 2] >> 5)]++;
          }
          if (prev) {
            var dl = 0, dh = 0;
            for (var q = 0; q < 576; q++) dl += Math.abs(lum[q] - prev.lum[q]);
            for (q = 0; q < 24; q++) dh += Math.abs(hist[q] - prev.hist[q]);
            diffs.push(0.5 * dl / 576 / 255 + 0.5 * dh / (576 * 3 * 2)); times.push(t - step / 2);
          }
          prev = { lum: lum, hist: hist };
          if (i % thumbEvery === 0) { tg.drawImage(v, 0, 0, tc.width, tc.height); a.thumbs.push({ t: +t.toFixed(2), src: tc.toDataURL('image/jpeg', 0.6) }); }
          i++; prog(i / n);
          return next();
        });
      }
      function finish() {
        var med = pct(diffs, 0.5), thr = Math.max(0.09, med * 3.5);
        for (var k = 0; k < diffs.length; k++) {
          if (diffs[k] > thr && (k === 0 || diffs[k] >= diffs[k - 1]) && (k === diffs.length - 1 || diffs[k] >= diffs[k + 1])) a.cuts.push(+times[k].toFixed(2));
        }
        a.step = step;
      }
      return next();
    });
  }

  /* 0..1 loudness at a time (for punch-in zooms, ducking, waveforms) */
  RS.levelAt = function (a, t) {
    if (!a || !a.env) return 0;
    var i = Math.floor(t / HOP);
    if (i < 0 || i >= a.env.length) return 0;
    return RS.clamp((a.env[i] - a.thr) / Math.max(6, a.loud - a.thr), 0, 1);
  };
  RS.speakingAt = function (a, t) { return a && a.env ? (a.env[Math.floor(t / HOP)] || -90) > a.thr : true; };

  /* ------------------------------------------------------------------ the reel finder */
  var HYPE = /^(wow|omg|insane|incredible|crazy|best|worst|never|always|secret|ever|amazing|literally|unbelievable|huge|biggest|craziest|wild|epic|perfect|stop|wait|seriously|okay|honestly|truth|mistake|hack|trick|tip|why|how|what)$/i;
  RS.findClips = function (a, words, opt) {
    opt = opt || {};
    var L = +opt.length || 30, count = +opt.count || 5, vibe = opt.vibe || 'balanced', D = a.duration;
    if (D < 3) return [];
    var env = a.env, n = env ? env.length : 0;
    // prefix sums over the loudness timeline
    var pE = [0], pS = [0], pP = [0], pK = [0];
    var lv = env ? env.map(function (x) { return RS.clamp((x - a.thr) / Math.max(6, a.loud - a.thr), 0, 1); }) : [];
    var sm = lv.map(function (_, i) { var s = 0, c = 0; for (var j = Math.max(0, i - 20); j < Math.min(lv.length, i + 20); j++) { s += lv[j]; c++; } return s / c; });
    var hi = pct(sm, 0.88);
    var kw = new Float32Array(Math.max(n, Math.ceil(D / HOP) + 1));
    (words || []).forEach(function (w) {
      var i = Math.floor(w[0] / HOP); if (i >= kw.length) return;
      var t = String(w[2]);
      kw[i] += (HYPE.test(t.replace(/[^a-z']/gi, '')) ? 1 : 0) + (/[!?]$/.test(t) ? 0.8 : 0) + (/\d/.test(t) ? 0.4 : 0);
    });
    var N = kw.length;
    for (var i = 0; i < N; i++) {
      pE.push(pE[i] + (lv[i] || 0)); pS.push(pS[i] + (env && env[i] > a.thr ? 1 : 0));
      pP.push(pP[i] + (i > 0 && i < n - 1 && sm[i] > hi && sm[i] >= sm[i - 1] && sm[i] > sm[i + 1] ? 1 : 0)); pK.push(pK[i] + kw[i]);
    }
    function sum(p, s, e) { var i0 = RS.clamp(Math.floor(s / HOP), 0, N), i1 = RS.clamp(Math.floor(e / HOP), 0, N); return p[i1] - p[i0]; }
    var cuts = a.cuts || [];
    function cutsIn(s, e) { return cuts.filter(function (c) { return c > s && c < e; }).length; }
    // natural starts / ends: where speech starts after a pause, scene cuts, and the very start / end
    var starts = [0], ends = [D];
    (a.gaps || []).forEach(function (g) { starts.push(Math.max(0, g[1] - 0.15)); ends.push(Math.min(D, g[0] + 0.25)); });
    cuts.forEach(function (c) { starts.push(c); ends.push(c); });
    if (!env && !cuts.length) for (var t = 0; t < D; t += L / 2) { starts.push(t); ends.push(Math.min(D, t + L)); }
    starts = uniq(starts); ends = uniq(ends);
    var W = { hype: [1.3, 1.1, 0.9, 0.2, 0.6, 0.9], story: [0.3, 0.2, 0.1, 1.3, 0.9, 0.4], balanced: [0.8, 0.7, 0.6, 0.7, 0.7, 0.7] }[vibe] || [0.8, 0.7, 0.6, 0.7, 0.7, 0.7];
    var cands = [];
    starts.forEach(function (s) {
      var lo = s + L * 0.7, hiE = s + L * 1.3, fit = ends.filter(function (e) { return e >= lo && e <= hiE; });
      if (!fit.length) { if (s + L <= D + 0.01) fit = [Math.min(D, s + L)]; else return; }
      fit.forEach(function (e) {
        var len = e - s; if (len < Math.min(L * 0.5, D)) return;
        var f = { energy: sum(pE, s, e) / (len / HOP), peaks: sum(pP, s, e) / len * 10, pace: cutsIn(s, e) / len * 10,
          speech: env ? sum(pS, s, e) / (len / HOP) : 0.5, kw: sum(pK, s, e) / len * 10, hook: sum(pE, s, Math.min(e, s + 3)) / (Math.min(3, len) / HOP),
          fit: 1 - Math.abs(len - L) / L, clean: ends.indexOf(e) >= 0 ? 1 : 0 };
        cands.push({ s: s, e: e, f: f });
      });
    });
    if (!cands.length) return [];
    var keys = ['energy', 'peaks', 'pace', 'speech', 'kw', 'hook'], mm = {};
    keys.forEach(function (k) { var vals = cands.map(function (c) { return c.f[k]; }); mm[k] = [Math.min.apply(null, vals), Math.max.apply(null, vals)]; });
    cands.forEach(function (c) {
      c.n = {}; c.total = 0;
      keys.forEach(function (k, j) { var r = mm[k][1] - mm[k][0]; c.n[k] = r > 1e-9 ? (c.f[k] - mm[k][0]) / r : 0.5; c.total += W[j] * c.n[k]; });
      c.total += 0.5 * c.f.fit + 0.25 * c.f.clean;
    });
    cands.sort(function (x, y) { return y.total - x.total; });
    var all = cands.map(function (c) { return c.total; }).sort(function (x, y) { return x - y; });
    var picked = [];
    for (var k = 0; k < cands.length && picked.length < count; k++) {
      var c = cands[k];
      if (picked.some(function (p) { return c.s < p.e - 0.5 && c.e > p.s + 0.5; })) continue;
      picked.push(c);
    }
    picked.sort(function (x, y) { return x.s - y.s; });
    return picked.map(function (c, i) {
      var rank = all.indexOf(c.total) / Math.max(1, all.length - 1);
      var lbl = label(c.n), inWords = (words || []).filter(function (w) { return w[0] >= c.s && w[0] < c.e; });
      return { start: +c.s.toFixed(2), end: +c.e.toFixed(2), score: Math.round(52 + 47 * rank), label: lbl,
        title: titleFrom(inWords, lbl, c.s), hook: hookFrom(inWords, lbl), source: 'auto' };
    });
  };
  function uniq(arr) { return arr.map(function (x) { return +x.toFixed(2); }).sort(function (a, b) { return a - b; }).filter(function (x, i, s) { return !i || x - s[i - 1] > 0.3; }); }
  function label(n) {
    var opts = [['🔥 Hype spike', (n.energy + n.peaks) / 2], ['🎬 Fast cuts', n.pace], ['💬 Story time', n.speech * 0.9], ['🎯 Quotable', n.kw], ['⚡ Strong hook', n.hook * 0.95]];
    opts.sort(function (a, b) { return b[1] - a[1]; });
    return opts[0][0];
  }
  function sentences(words) {
    var out = [], cur = [];
    words.forEach(function (w) { cur.push(w[2]); if (/[.!?]$/.test(w[2])) { out.push(cur.join(' ')); cur = []; } });
    if (cur.length) out.push(cur.join(' '));
    return out;
  }
  function titleFrom(words, lbl, s) {
    var ss = sentences(words);
    if (!ss.length) return lbl.replace(/^\S+\s/, '') + ' at ' + RS.fmt(s);
    var best = ss.filter(function (x) { return /[!?]$/.test(x); })[0] || ss[0];
    var w = best.replace(/[.,!?]+$/, '').split(' ');
    return (w.slice(0, 7).join(' ') + (w.length > 7 ? '…' : '')).replace(/^\w/, function (ch) { return ch.toUpperCase(); });
  }
  function hookFrom(words, lbl) {
    var ss = sentences(words).filter(function (x) { return x.split(' ').length <= 9; });
    var pick = ss.filter(function (x) { return /!$/.test(x); })[0] || ss.filter(function (x) { return /\?$/.test(x); })[0];
    if (pick) return pick;
    return { '🔥 Hype spike': 'Wait for it… 👀', '🎬 Fast cuts': 'Watch till the end 🎬', '💬 Story time': 'Story time 🍿', '🎯 Quotable': 'Save this one 📌', '⚡ Strong hook': 'You need to hear this' }[lbl] || 'Wait for it… 👀';
  }

  /* The parts of [start, end] that aren't silence. sensitivity 0..1 (higher = cuts more). */
  RS.keepRanges = function (a, start, end, sensitivity) {
    if (!a || !a.env) return [[start, end]];
    var sens = sensitivity == null ? 0.5 : sensitivity, thr = a.floor + (a.thr - a.floor) * (0.6 + sens * 0.8);
    var minGap = 0.65 - sens * 0.35, pad = 0.1;
    var gaps = findGaps(a.env.slice(Math.floor(start / HOP), Math.ceil(end / HOP)), thr, minGap).map(function (g) { return [g[0] + start, g[1] + start]; });
    var keep = [], cur = start;
    gaps.forEach(function (g) {
      var gs = g[0] + pad, ge = g[1] - pad;
      if (ge - gs < 0.15) return;
      if (gs > cur + 0.2) keep.push([cur, gs]);
      cur = ge;
    });
    if (end - cur > 0.2) keep.push([cur, end]);
    return keep.length ? keep : [[start, end]];
  };

  /* ------------------------------------------------------------------ captions */
  RS.wordsIn = function (words, s, e) { return (words || []).filter(function (w) { return w[1] > s && w[0] < e; }); };
  /* Caption lines: up to n words, breaking early at punctuation and pauses. */
  RS.cues = function (words, s, e, n) {
    var ws = RS.wordsIn(words, s, e), out = [], cur = [];
    function push() { if (cur.length) out.push({ s: cur[0][0], e: cur[cur.length - 1][1], words: cur }); cur = []; }
    ws.forEach(function (w, i) {
      if (cur.length && (cur.length >= n || w[0] - cur[cur.length - 1][1] > 0.6)) push();
      cur.push(w);
      if (/[.!?]$/.test(w[2]) || (/[,;:]$/.test(w[2]) && cur.length >= Math.min(2, n))) push();
    });
    push();
    out.forEach(function (c, i) { c.text = c.words.map(function (w) { return w[2]; }).join(' '); if (out[i + 1]) c.e = Math.max(c.e, Math.min(out[i + 1].s, c.e + 0.5)); else c.e += 0.4; });
    return out;
  };
  /* Spread a line of text over [s, e], word lengths deciding each word's share. */
  RS.spread = function (text, s, e) {
    var ws = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!ws.length) return [];
    var tot = ws.reduce(function (a, w) { return a + w.length + 2; }, 0), t = s, out = [];
    ws.forEach(function (w) { var d = (e - s) * (w.length + 2) / tot; out.push([+t.toFixed(3), +(t + d).toFixed(3), w.slice(0, 40)]); t += d; });
    return out;
  };
  RS.parseSubs = function (text) {
    var out = [], blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/);
    var tm = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
    function sec(h, m, s, ms) { return (h ? parseInt(h, 10) : 0) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt((ms + '00').slice(0, 3), 10) / 1000; }
    blocks.forEach(function (b) {
      var lines = b.split('\n'), i = lines.findIndex(function (l) { return tm.test(l); });
      if (i < 0) return;
      var m = lines[i].match(tm), s = sec(m[1], m[2], m[3], m[4]), e = sec(m[5], m[6], m[7], m[8]);
      var txt = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
      if (txt && e > s) out = out.concat(RS.spread(txt, s, e));
    });
    return out;
  };
  RS.parseChapters = function (text, duration) {
    var out = [];
    String(text || '').split(/\n/).forEach(function (line) {
      var m = line.match(/(?:^|\s|\()((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\)|\s|$|\s*[-–—|:]\s*)(.*)$/);
      if (!m) return;
      var t = RS.parseTime(m[1]);
      if (t == null || t >= duration) return;
      out.push({ t: t, title: (m[2] || line.replace(m[1], '')).replace(/^[\s\-–—|:)]+/, '').trim().slice(0, 100) || 'Chapter at ' + m[1] });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out.map(function (c, i) { return { start: c.t, end: i + 1 < out.length ? out[i + 1].t : duration, title: c.title }; })
      .filter(function (c) { return c.end - c.start >= 1; });
  };

  /* ------------------------------------------------------------------ emoji for caption words */
  var EMOJI = [[/^(fire|hot|lit|spicy)$/, '🔥'], [/^(money|cash|rich|dollars?|paid)$/, '💰'], [/^(love|loved|heart)$/, '❤️'], [/^(crazy|insane|wild|mind)$/, '🤯'],
    [/^(funny|laugh|lol|haha|joke)$/, '😂'], [/^(best|win|winner|champion|first)$/, '🏆'], [/^(secret|nobody|hidden)$/, '🤫'], [/^(snacks?|chips?|popcorn|food|eat|hungry)$/, '🍿'],
    [/^(cold|fridge|ice|freeze)$/, '🧊'], [/^(time|hours?|minutes?|clock)$/, '⏰'], [/^(idea|think|smart|brain)$/, '💡'], [/^(music|song|sing|sang)$/, '🎵'],
    [/^(game|gaming|play|level)$/, '🎮'], [/^(wow|omg|whoa|incredible|amazing)$/, '😱'], [/^(stop|no|never)$/, '🛑'], [/^(yes|perfect|ten|100)$/, '💯'],
    [/^(story|tell|told)$/, '📖'], [/^(trust|promise)$/, '🤝'], [/^(smoke|alarm|danger)$/, '🚨'], [/^(follow|subscribe|comment)$/, '👉'], [/^(bye|goodbye)$/, '👋'],
    [/^(mystery|guess|question)$/, '❓'], [/^(pickle|pickles)$/, '🥒'], [/^(microwave|cook|chef|kitchen)$/, '👨‍🍳'], [/^(coffee)$/, '☕'], [/^(gym|strong|workout)$/, '💪']];
  RS.emojiFor = function (word) {
    var w = String(word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (var i = 0; i < EMOJI.length; i++) if (EMOJI[i][0].test(w)) return EMOJI[i][1];
    return '';
  };

  /* ------------------------------------------------------------------ post caption + hashtags */
  var STOP = ('a an and are as at be been but by can could did do does dont for from get got had has have he her here him his how i if im in into is it its ' +
    'just let like me more my no not now of off oh ok okay on one or our out over really right so some that thats the their them then there these they this ' +
    'those to too up us very was we were what when where which who why will with would yeah you your youre about after again all also am any back because ' +
    'before being both down each even every going gonna know made make many most much need only other own same she should since still such than through ' +
    'under until want way well while yes').split(' ');
  RS.keywords = function (words, n) {
    var cnt = {};
    (words || []).forEach(function (w) {
      var t = String(w[2]).toLowerCase().replace(/[^a-z0-9']/g, '').replace(/'s$/, '');
      if (t.length < 4 || STOP.indexOf(t) >= 0) return;
      cnt[t] = (cnt[t] || 0) + 1 + t.length / 10;
    });
    return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, n || 5);
  };
  RS.postCopy = function (clip, words, kit, seed) {
    var st = RS.fullStyle(clip.style), ws = RS.wordsIn(words, clip.start, clip.end), kws = RS.keywords(ws, 4);
    var hook = (st.hook || clip.title || 'New reel').replace(/\s+/g, ' ').trim();
    var emo = RS.emojiFor(kws[0]) || ['✨', '🔥', '👀', '🎬'][(seed || 0) % 4];
    var lines = [
      [hook + ' ' + emo, 'Full video on my channel 🎬'],
      [emo + ' ' + hook, 'Would you try this? Tell me in the comments 👇'],
      ['POV: ' + hook.replace(/[.!?]+$/, '').toLowerCase() + ' ' + emo, 'Follow for part 2 👀'],
      [hook, 'Save this for later 📌 ' + emo]
    ][(seed || 0) % 4];
    var tags = kws.map(function (k) { return '#' + k.replace(/'/g, ''); });
    var mine = String(kit && kit.hashtags || '').split(/[\s,]+/).filter(function (t) { return /^#\w/.test(t); });
    var base = ['#reels', '#shorts', '#fyp'];
    var all = [];
    mine.concat(tags, base).forEach(function (t) { if (all.indexOf(t.toLowerCase()) < 0) all.push(t.toLowerCase()); });
    return { caption: lines.join('\n\n'), hashtags: all.slice(0, 10).join(' ') };
  };

  /* ------------------------------------------------------------------ on-device transcription (Whisper)
     Runs transformers.js in a web worker. The model (~40-75 MB) downloads once from Hugging Face's CDN and the
     browser caches it; the audio itself never leaves the device. */
  var WORKER = [
    "import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';",
    "env.allowLocalModels = false;",
    "const cache = {};",
    "self.onmessage = async (e) => {",
    "  const { id, audio, model } = e.data;",
    "  try {",
    "    if (!cache[model]) cache[model] = await pipeline('automatic-speech-recognition', model, { progress_callback: (p) => self.postMessage({ id, type: 'load', p }) });",
    "    const asr = cache[model];",
    "    self.postMessage({ id, type: 'run' });",
    "    let out, level = 'word';",
    "    try { out = await asr(audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 }); }",
    "    catch (err) { level = 'segment'; out = await asr(audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 }); }",
    "    self.postMessage({ id, type: 'done', level, chunks: out.chunks || [], text: out.text || '' });",
    "  } catch (err) { self.postMessage({ id, type: 'error', error: String(err && err.message || err) }); }",
    "};"].join('\n');
  var worker = null, jobs = {}, jobSeq = 0;
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })), { type: 'module' });
    worker.onmessage = function (e) { var j = jobs[e.data.id]; if (j) j(e.data); };
    worker.onerror = function (e) { Object.keys(jobs).forEach(function (k) { jobs[k]({ type: 'error', error: e.message || 'The caption helper couldn\'t start.' }); }); };
    return worker;
  }
  RS.MODELS = { en: 'onnx-community/whisper-tiny.en', multi: 'onnx-community/whisper-tiny' };
  /* ranges: [[s, e], ...] in source time. Resolves to words [[s, e, w], ...]. */
  RS.transcribe = function (m, ranges, lang, onProgress) {
    var prog = onProgress || function () {}, model = RS.MODELS[lang] || RS.MODELS.en;
    prog(0.02, 'Reading the sound…');
    return decodeMono(m.blob, 16000).then(function (au) {
      var words = [], i = 0;
      function nextRange() {
        if (i >= ranges.length) return words;
        var r = ranges[i], s = Math.max(0, r[0] - 0.3), e = Math.min(au.data.length / 16000, r[1] + 0.3);
        var audio = au.data.slice(Math.floor(s * 16000), Math.floor(e * 16000));
        return new Promise(function (res, rej) {
          var id = ++jobSeq;
          jobs[id] = function (msg) {
            if (msg.type === 'load') { if (msg.p && msg.p.status === 'progress' && msg.p.total) prog(0.05 + 0.35 * (msg.p.loaded / msg.p.total), 'Downloading the caption model (once)…'); }
            else if (msg.type === 'run') prog(0.45 + 0.5 * i / ranges.length, 'Listening and writing… (' + (i + 1) + '/' + ranges.length + ')');
            else if (msg.type === 'done') { delete jobs[id]; res(msg); }
            else if (msg.type === 'error') { delete jobs[id]; rej(new Error('On-device captions didn\'t work here: ' + msg.error)); }
          };
          getWorker().postMessage({ id: id, audio: audio, model: model }, [audio.buffer]);
        }).then(function (msg) {
          (msg.chunks || []).forEach(function (c) {
            var ts = c.timestamp || [], cs = (ts[0] || 0) + s, ce = (ts[1] == null ? (ts[0] || 0) + 0.4 : ts[1]) + s, txt = String(c.text || '').trim();
            if (!txt) return;
            if (msg.level === 'word' && txt.indexOf(' ') < 0) words.push([+cs.toFixed(3), +Math.max(cs + 0.05, ce).toFixed(3), txt.slice(0, 40)]);
            else words = words.concat(RS.spread(txt, cs, Math.max(cs + 0.3, ce)));
          });
          i++;
          return nextRange();
        });
      }
      return nextRange();
    });
  };
  /* Put new words into a transcript, replacing whatever was there in the same time ranges. */
  RS.mergeWords = function (old, fresh, ranges) {
    var keep = (old || []).filter(function (w) { return !ranges.some(function (r) { return w[0] >= r[0] - 0.3 && w[0] < r[1] + 0.3; }); });
    return keep.concat(fresh).sort(function (a, b) { return a[0] - b[0]; });
  };

  /* ------------------------------------------------------------------ storyboard ideas
     RS.suggestBoard(rows, style, plan): what could go on screen for each caption line (rows = RS.cues(...)). Simple rules,
     no AI and nothing leaves the device: a hook if there's none, tool labels on names (FFmpeg, yt-dlp, GitHub...), emoji
     on feeling words, a prompt bar on lines that give an instruction ("Ask...", "Make..."), big numbers as titles, and
     one line as a big title behind the person. Each idea: {row, kind, label, at, word, len, line} or {kind: 'hook', hook}. */
  var NOT_TOOLS = ('i im id ive ill the a an and but so or if then this that these those it its you your youre we they he she my our what when where why how ' +
    'who okay ok yes no oh well just now here there watch lets dont personally exactly also because before after today tomorrow monday tuesday wednesday ' +
    'thursday friday saturday sunday january february march april may june july august september october november december hey hi thanks').split(' ');
  var DO_VERBS = /^(ask|tell|make|give|use|write|create|draw|add|put|cut|turn|try|build|let|have|get|shrink|pop|grab|download|open|pick|start|stop|go)$/i;
  function bare(w) { return String(w || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); }
  RS.suggestBoard = function (rows, st, plan) {
    var out = [], seen = {}, n = { label: 0, emoji: 0, prompt: 0, title: 0 }, layers = (st && st.layers) || [];
    function taken(at) { return layers.some(function (L) { return L.at != null && Math.abs(L.at - at) < 0.05; }); }
    if (!rows.length) return out;
    if (st && !st.hook) {
      var first = rows[0].text.split(/\s+/), hook = first.length <= 9 ? rows[0].text : first.slice(0, 7).join(' ') + '…';
      out.push({ row: 0, kind: 'hook', hook: hook.slice(0, 90), label: 'Hook: “' + hook.slice(0, 40) + '”' });
    }
    rows.forEach(function (r, i) {
      var ws = r.words, lineIdeas = 0;
      // a tool or brand name: CamelCase, a dash between letters, ALL CAPS, or Capitalised in the middle of a sentence
      for (var k = 0; k < ws.length && n.label < 4; k++) {
        var raw = String(ws[k][2]), w = bare(raw), lo = w.toLowerCase().replace(/['’]/g, '');
        if (w.length < 3 || seen[lo] || NOT_TOOLS.indexOf(lo) >= 0 || taken(ws[k][0])) continue;
        var prev = k ? String(ws[k - 1][2]) : (i ? rows[i - 1].text : '.');
        var startOfSentence = /[.!?…]$/.test(prev) || (!k && !i);
        var tool = /[a-z][A-Z]/.test(w) || /^\p{L}+-\p{L}+$/u.test(w) && /[a-z]/.test(w) && w.length <= 12 || /^[A-Z]{3,8}$/.test(w) || (/^[A-Z][a-z]+$/.test(w) && !startOfSentence);
        if (!tool) continue;
        seen[lo] = 1; n.label++; lineIdeas++;
        out.push({ row: i, kind: 'label', at: ws[k][0], word: w, len: 2.2, label: '🏷️ Label “' + w + '”' });
        break;
      }
      // feeling words get an emoji (only if captions aren't adding their own)
      if (!(st && st.capEmoji) && n.emoji < 4 && lineIdeas < 2) {
        for (var j = 0; j < ws.length; j++) {
          var em = RS.emojiFor(ws[j][2]);
          if (em && !taken(ws[j][0])) { n.emoji++; lineIdeas++; out.push({ row: i, kind: 'emoji', at: ws[j][0], word: bare(ws[j][2]), len: 1.6, label: em + ' on “' + bare(ws[j][2]) + '”' }); break; }
        }
      }
      // an instruction ("Ask Claude to...", "Make it moody...") becomes a prompt bar that types itself
      if (n.prompt < 2 && ws.length >= 4 && DO_VERBS.test(bare(ws[0][2])) && !taken(ws[0][0])) {
        n.prompt++; lineIdeas++;
        out.push({ row: i, kind: 'prompt', at: ws[0][0], word: bare(ws[0][2]), len: Math.min(4.5, Math.max(2.5, r.e - r.s + 0.8)), line: r.text.replace(/[.,!?]+$/, ''), label: '⌨️ Prompt bar with this line' });
      }
      // numbers ("15%", "97 bucks", "3x3") pop up as a big title
      if (n.title < 2 && lineIdeas < 2) {
        for (var q = 0; q < ws.length; q++) {
          var nw = bare(ws[q][2]);
          if (/\d/.test(nw) && !taken(ws[q][0])) { n.title++; out.push({ row: i, kind: 'title', at: ws[q][0], word: String(ws[q][2]).replace(/[.,!?;:]+$/, ''), len: 1.6, label: '✏️ Big “' + nw + '”' }); break; }
        }
      }
    });
    // one strong short line goes behind the person (an exclamation or question, else the shortest full line)
    var cand = rows.map(function (r, i) { return { r: r, i: i, n: r.words.length }; }).filter(function (c) { return c.n >= 2 && c.n <= 7; });
    var best = cand.filter(function (c) { return /[!?]$/.test(c.r.text); })[0] || cand.sort(function (a, b) { return a.n - b.n; })[0];
    if (best && !taken(best.r.words[0][0]) && !layers.some(function (L) { return L.behind; })) {
      out.push({ row: best.i, kind: 'behind', at: best.r.words[0][0], word: bare(best.r.words[0][2]), len: Math.min(3, Math.max(1.5, best.r.e - best.r.s + 0.3)),
        line: best.r.text.replace(/[.,!?…]+$/, ''), label: '🧍 This line behind you' });
    }
    out.sort(function (a, b) { return a.row - b.row; });
    return out;
  };
})();

/* ===== _c_engine.html ===== */
(function () {
  'use strict';
  var RS = window.RS;
  var INK = '#1A1033';

  RS.dims = function (aspect, quality) {
    var b = quality === '720' ? 720 : 1080;
    return { '1:1': [b, b], '4:5': [b, Math.round(b * 1.25)], '16:9': [Math.round(b * 16 / 9), b] }[aspect] || [b, Math.round(b * 16 / 9)];
  };
  RS.FONT_CSS = { 'Anton': '400 {s}px "Anton", Impact, sans-serif', 'Bangers': '400 {s}px "Bangers", "Comic Sans MS", sans-serif',
    'Bricolage Grotesque': '800 {s}px "Bricolage Grotesque", "DM Sans", sans-serif', 'DM Sans': '700 {s}px "DM Sans", system-ui, sans-serif',
    'Luckiest Guy': '400 {s}px "Luckiest Guy", "Bangers", sans-serif', 'Bungee': '400 {s}px "Bungee", Impact, sans-serif',
    'Titan One': '400 {s}px "Titan One", "Anton", sans-serif', 'Lilita One': '400 {s}px "Lilita One", "Anton", sans-serif',
    'Permanent Marker': '400 {s}px "Permanent Marker", "Comic Sans MS", cursive', 'Pacifico': '400 {s}px "Pacifico", cursive',
    'Rubik Mono One': '400 {s}px "Rubik Mono One", Impact, sans-serif', 'Playfair Display': '900 {s}px "Playfair Display", Georgia, serif' };
  RS.FONT_SCALE = { 'Anton': 1, 'Bangers': 1.1, 'Bricolage Grotesque': 0.86, 'DM Sans': 0.82, 'Luckiest Guy': 0.9, 'Bungee': 0.74,
    'Titan One': 0.86, 'Lilita One': 0.98, 'Permanent Marker': 0.9, 'Pacifico': 0.8, 'Rubik Mono One': 0.66, 'Playfair Display': 0.84 };
  var fontsReady = null;
  RS.fontsReady = function () {
    if (!fontsReady) fontsReady = document.fonts ? Promise.all(Object.keys(RS.FONT_CSS).map(function (k) { return RS.FONT_CSS[k].split(', ')[0].replace('{s}', '60'); })
      .map(function (f) { return document.fonts.load(f).catch(function () {}); })).then(function () {}) : Promise.resolve();
    return fontsReady;
  };
  function font(name, size) { return (RS.FONT_CSS[name] || RS.FONT_CSS.Anton).replace('{s}', Math.round(size)); }

  /* ------------------------------------------------------------------ plan: style + kept parts + captions */
  RS.plan = function (clip, words, analysis) {
    var st = RS.fullStyle(clip.style);
    var segs = st.cutSilence ? RS.keepRanges(analysis, clip.start, clip.end, st.silence) : [[clip.start, clip.end]];
    var srcLen = segs.reduce(function (a, s) { return a + s[1] - s[0]; }, 0);
    var plan = { clip: clip, st: st, segs: segs, srcLen: srcLen, outDur: srcLen / st.speed, analysis: analysis,
      cues: st.captions ? RS.cues(words, clip.start, clip.end, st.capWords) : [], joins: [] };
    // where a cut transition plays: the jump cuts, and (if asked) the video's own scene changes
    var acc = 0, joins = [];
    segs.forEach(function (sg, i) { if (i) joins.push(acc / st.speed); acc += sg[1] - sg[0]; });
    if (st.transScenes && analysis && analysis.cuts) analysis.cuts.forEach(function (c) {
      if (c > clip.start + 0.3 && c < clip.end - 0.3 && segs.some(function (sg) { return c > sg[0] + 0.1 && c < sg[1] - 0.1; })) joins.push(RS.srcToOut(plan, c));
    });
    joins.sort(function (a, b) { return a - b; });
    joins.forEach(function (j) { if (j > st.transLen && j < plan.outDur - st.transLen && (!plan.joins.length || j - plan.joins[plan.joins.length - 1] > st.transLen * 1.5)) plan.joins.push(j); });
    return plan;
  };
  RS.srcToOut = function (plan, t) {
    var acc = 0;
    for (var i = 0; i < plan.segs.length; i++) {
      var s = plan.segs[i];
      if (t < s[0]) return acc / plan.st.speed;
      if (t <= s[1]) return (acc + t - s[0]) / plan.st.speed;
      acc += s[1] - s[0];
    }
    return acc / plan.st.speed;
  };
  RS.outToSrc = function (plan, o) {
    var left = o * plan.st.speed;
    for (var i = 0; i < plan.segs.length; i++) {
      var s = plan.segs[i], len = s[1] - s[0];
      if (left <= len) return s[0] + left;
      left -= len;
    }
    var last = plan.segs[plan.segs.length - 1];
    return last ? last[1] : 0;
  };

  /* ------------------------------------------------------------------ drawing helpers */
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  RS.rr = rr;
  function cover(g, src, sw, sh, x, y, w, h, zoom, fx, fy) {
    var sc = Math.max(w / sw, h / sh) * zoom, dw = sw * sc, dh = sh * sc;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.drawImage(src, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
    g.restore();
  }
  var scratch = document.createElement('canvas'); scratch.width = 40; scratch.height = 72;
  function blurBg(g, src, sw, sh, W, H) {
    var h = Math.max(8, Math.round(40 * H / W));
    if (scratch.height !== h) scratch.height = h;
    var sg = scratch.getContext('2d');
    cover(sg, src, sw, sh, 0, 0, 40, h, 1.25, 0.5, 0.5);
    g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(scratch, 0, 0, W, H);
    g.fillStyle = 'rgba(10,6,20,.3)'; g.fillRect(0, 0, W, H); g.restore();
  }
  function ease(x) { x = RS.clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); }
  function popIn(x) { x = RS.clamp(x, 0, 1); var c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
  function punchAt(plan, t) {
    if (!plan.st.punch || !plan.analysis || !plan.analysis.env) return 1;
    var m = 0;
    for (var k = 0; k < 6; k++) m = Math.max(m, RS.levelAt(plan.analysis, t - k * 0.05));
    return 1 + 0.075 * ease((m - 0.62) / 0.38);
  }
  function wrapWords(g, items, maxW, gap) {
    var lines = [[]], lw = 0;
    items.forEach(function (it) {
      var w = it.w;
      if (lines[lines.length - 1].length && lw + gap + w > maxW) { lines.push([]); lw = 0; }
      var line = lines[lines.length - 1];
      lw += (line.length ? gap : 0) + w; line.push(it);
    });
    return lines;
  }
  function lineWidth(line, gap) { return line.reduce(function (a, it, i) { return a + it.w + (i ? gap : 0); }, 0); }

  /* ------------------------------------------------------------------ one frame */
  RS.render = function (g, W, H, src, plan, tSrc, tOut, opt) {
    opt = opt || {};
    var st = plan.st, u = Math.min(W, H) / 1080, vr = null;  // vr: where the video sits (the colour grade stays inside it)
    var sw = src && (src.videoWidth || src.width), sh = src && (src.videoHeight || src.height);
    if (opt.boxes) opt.boxes.length = 0;
    g.save();
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (sw && sh && st.layout === 'pip') {
      cover(g, src, sw, sh, 0, 0, W, H, st.zoom * punchAt(plan, tSrc), st.fx, st.fy);
      drawPip(g, W, H, u, src, sw, sh, plan);
    } else if (sw && sh) {
      var pz = punchAt(plan, tSrc), z = st.zoom * pz;
      if (st.layout === 'split') {
        var h1 = Math.round(H * st.split);
        cover(g, src, sw, sh, 0, 0, W, h1, z, st.fx, st.fy);
        cover(g, src, sw, sh, 0, h1, W, H - h1, st.zoom2, st.fx2, st.fy2);
        g.fillStyle = INK; g.fillRect(0, h1 - 7 * u, W, 14 * u);
        g.fillStyle = st.hl; g.fillRect(0, h1 - 3 * u, W, 6 * u);
      } else if (st.layout === 'fit' || st.layout === 'framed') {
        if (st.layout === 'fit') blurBg(g, src, sw, sh, W, H);
        else {
          g.fillStyle = st.bg; g.fillRect(0, 0, W, H);
          g.fillStyle = 'rgba(255,255,255,.14)';
          for (var dy = 30 * u; dy < H; dy += 60 * u) for (var dx = ((dy / (60 * u)) % 2) * 30 * u; dx < W; dx += 60 * u) { g.beginPath(); g.arc(dx, dy, 5 * u, 0, 7); g.fill(); }
        }
        var maxW = st.layout === 'framed' ? W * 0.88 : W, maxH = st.layout === 'framed' ? H * 0.62 : H;
        var sc = Math.min(maxW / sw, maxH / sh), fw = sw * sc, fh = sh * sc;
        var fx0 = (W - fw) / 2, fy0 = (H - fh) / 2 - (st.layout === 'framed' ? H * 0.02 : 0);
        if (st.layout === 'framed') {
          vr = { x: fx0, y: fy0, w: fw, h: fh };
          g.fillStyle = INK; rr(g, fx0 + 14 * u, fy0 + 14 * u, fw, fh, 30 * u); g.fill();
          g.save(); rr(g, fx0, fy0, fw, fh, 30 * u); g.clip(); cover(g, src, sw, sh, fx0, fy0, fw, fh, z, st.fx, st.fy); g.restore();
          g.lineWidth = 8 * u; g.strokeStyle = INK; rr(g, fx0, fy0, fw, fh, 30 * u); g.stroke();
        } else cover(g, src, sw, sh, fx0, fy0, fw, fh, z, st.fx, st.fy);
      } else {
        cover(g, src, sw, sh, 0, 0, W, H, z, st.fx, st.fy);
      }
    }
    var still = !!opt.noFade;
    if (sw && sh && st.grade && st.grade !== 'none' && st.gradeAmt > 0) {
      // colour grade; with gradeWipe a before/after slider sweeps across in the first seconds
      var wp = st.gradeWipe && !still ? wipeAt(tOut) : 1;
      if (wp < 1) { if (wipeCv.width !== W || wipeCv.height !== H) { wipeCv.width = W; wipeCv.height = H; } wipeCv.getContext('2d').drawImage(g.canvas, 0, 0); }
      RS.grade(g, st.grade, st.gradeAmt, vr || { x: 0, y: 0, w: W, h: H });
      if (wp < 1) {
        var lx = Math.round(W * wp);
        if (lx < W) g.drawImage(wipeCv, lx, 0, W - lx, H, lx, 0, W - lx, H);
        if (wp > 0) {
          g.save(); g.fillStyle = '#FFFFFF'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 10 * u; g.fillRect(lx - 3 * u, 0, 6 * u, H);
          g.beginPath(); g.arc(lx, H * 0.52, 36 * u, 0, 7); g.fill(); g.shadowBlur = 0;
          g.fillStyle = INK; g.font = '700 ' + Math.round(34 * u) + 'px "DM Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('‹ ›', lx, H * 0.52 + 1 * u);
          g.restore();
        }
      }
    }
    var tr = still ? null : transAt(plan, tOut), walling = !still && wallOn(plan, tOut);
    if (walling) drawWall(g, W, H, u, plan, tOut);
    else if (tr) moveFrame(g, W, H, u, tr, tOut);
    var layers = st.layers || [], back = layers.some(function (L) { return L.behind && (L.id === opt.selected || inSpan(layerSpan(L, plan), tOut)); });
    if (back) {
      // text behind the person: cut the person out of this frame, draw the "behind" layers, put the person back on top
      var key = [W, H, tSrc.toFixed(3), st.layout, st.zoom, st.fx, st.fy, st.zoom2, st.fx2, st.fy2, st.grade, st.gradeAmt, tr || walling ? tOut.toFixed(3) : ''].join('|');
      var person = sw && sh ? RS.person.cutout(g.canvas, W, H, key) : null;
      drawLayers(g, W, H, u, plan, tOut, opt, 'behind');
      if (person) g.drawImage(person, 0, 0);
    }
    if (st.captions && plan.cues.length) drawCaptions(g, W, H, u, plan, tSrc);
    if (layers.length) drawLayers(g, W, H, u, plan, tOut, opt, back ? 'front' : 'all');
    if (opt.selected) drawSelection(g, u, opt);
    drawOverlays(g, W, H, u, plan, tOut, still);
    if (tr && (tr.k === 'fade' || tr.k === 'flash')) {
      g.fillStyle = tr.k === 'fade' ? 'rgba(0,0,0,' + RS.clamp(tr.a, 0, 1) + ')' : 'rgba(255,255,255,' + RS.clamp(Math.pow(tr.a, 1.4) * 0.95, 0, 1) + ')';
      g.fillRect(0, 0, W, H);
    }
    g.restore();
  };

  /* ------------------------------------------------------------------ transitions
     intro (first transLen s), outro (last transLen s) and cuts (centred on each join). a = strength 0..1,
     dir = -1 on the way out of a shot, +1 on the way in. Fade and flash are drawn over everything at the end;
     the others move the picture (copied to a scratch canvas) before captions and stickers go on top. */
  function transAt(plan, t) {
    var st = plan.st, L = st.transLen || 0.4, D = plan.outDur;
    if (st.transIn && st.transIn !== 'none' && t < L && !wallOn(plan, 0)) return { k: st.transIn, a: 1 - t / L, dir: 1 };
    if (st.transOut && st.transOut !== 'none' && D - t < L) return { k: st.transOut, a: 1 - (D - t) / L, dir: -1 };
    if (st.transCut && st.transCut !== 'none' && plan.joins) {
      for (var i = 0; i < plan.joins.length; i++) {
        var d = t - plan.joins[i];
        if (Math.abs(d) < L / 2) return { k: st.transCut, a: 1 - Math.abs(d) / (L / 2), dir: d < 0 ? -1 : 1 };
      }
    }
    return null;
  }
  RS.transAt = transAt;
  var snap = document.createElement('canvas'), tiny = document.createElement('canvas'), wipeCv = document.createElement('canvas'), gradeCv = document.createElement('canvas');

  /* ------------------------------------------------------------------ colour grades (style.grade, strength gradeAmt)
     Canvas blend modes only, so it's fast and works in every browser: multiply pulls the highlights down, screen lifts
     the blacks, "saturation" with grey takes colour out (with a pure colour it adds colour), soft-light tints, and
     soft-light of the picture onto itself adds contrast. r = the rectangle to grade. */
  RS.grade = function (g, k, amt, r) {
    var a = RS.clamp(amt == null ? 0.75 : amt, 0, 1);
    if (!k || k === 'none' || !a) return;
    var x = Math.round(r.x), y = Math.round(r.y), w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    function fill(op, color, alpha) { g.globalCompositeOperation = op; g.globalAlpha = RS.clamp(alpha * a, 0, 1); g.fillStyle = color; g.fillRect(x, y, w, h); }
    function contrast(alpha) {
      if (gradeCv.width !== w || gradeCv.height !== h) { gradeCv.width = w; gradeCv.height = h; }
      var cg = gradeCv.getContext('2d'); cg.globalCompositeOperation = 'copy'; cg.drawImage(g.canvas, x, y, w, h, 0, 0, w, h);
      g.globalCompositeOperation = 'soft-light'; g.globalAlpha = RS.clamp(alpha * a, 0, 1); g.drawImage(gradeCv, x, y);
    }
    function vignette(strength) {
      var cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2, gr = g.createRadialGradient(cx, cy, R * 0.38, cx, cy, R);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + strength + ')');
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x, y, w, h);
    }
    if (k === 'warm') { fill('soft-light', '#FF8A2B', 0.6); fill('multiply', '#FFEAD4', 0.7); fill('screen', '#241200', 0.6); }
    else if (k === 'moody') { fill('multiply', '#CFCFD6', 1); fill('screen', '#1C1C22', 1); fill('saturation', '#808080', 0.2); vignette(0.6); }  // highlights down, blacks up, saturation -15-20%, soft vignette
    else if (k === 'cool') { fill('soft-light', '#2F7DFF', 0.5); fill('saturation', '#808080', 0.1); fill('screen', '#000C1A', 0.6); }
    else if (k === 'teal') { fill('soft-light', '#00897B', 0.45); fill('overlay', '#FF8C42', 0.2); contrast(0.3); fill('saturation', '#FF0000', 0.1); }
    else if (k === 'vivid') { contrast(0.55); fill('saturation', '#FF0000', 0.22); }
    else if (k === 'film') { fill('screen', '#2A2218', 1); fill('multiply', '#F4E6D2', 1); fill('saturation', '#808080', 0.28); vignette(0.38); }
    else if (k === 'bw') { fill('saturation', '#808080', 1); contrast(0.45); }
    g.restore();
  };
  /* A small preview of a grade on the current frame (the editor's colour picker). */
  RS.gradeThumb = function (cv, src, k, amt, st) {
    cv.width = 108; cv.height = 144;
    var g = cv.getContext('2d'), sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
    g.fillStyle = '#000'; g.fillRect(0, 0, 108, 144);
    if (sw && sh) cover(g, src, sw, sh, 0, 0, 108, 144, (st && st.zoom) || 1, st ? st.fx : 0.5, st ? st.fy : 0.5);
    RS.grade(g, k, amt, { x: 0, y: 0, w: 108, h: 144 });
  };
  function wipeAt(t) { return t < 0.4 ? 0 : t > 1.9 ? 1 : ease((t - 0.4) / 1.5); }

  /* ------------------------------------------------------------------ picture in picture (layout 'pip')
     The main shot fills the frame; a rounded card in a corner shows a second crop of the same video (zoom2/fx2/fy2),
     or another video from this device (plan.pipSrc: a reaction or a face cam, played along with the reel). */
  RS.pipRect = function (st, W, H) {
    var u = Math.min(W, H) / 1080, w = W * (st.pipSize || 0.38), h = Math.min(H * 0.6, w * 1.4), m = 40 * u;
    var right = st.pipPos === 'tr' || st.pipPos === 'br', bottom = st.pipPos === 'bl' || st.pipPos === 'br';
    return { x: right ? W - w - m : m, y: bottom ? H - h - m - 40 * u : m + 80 * u, w: w, h: h };
  };
  function drawPip(g, W, H, u, src, sw, sh, plan) {
    var st = plan.st, r = RS.pipRect(st, W, H), pv = plan.pipSrc && plan.pipSrc.readyState >= 2 && plan.pipSrc.videoWidth ? plan.pipSrc : null;
    var s2 = pv || src, w2 = pv ? pv.videoWidth : sw, h2 = pv ? pv.videoHeight : sh;
    g.save();
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 34 * u; g.shadowOffsetY = 10 * u; g.fillStyle = '#000'; rr(g, r.x, r.y, r.w, r.h, 30 * u); g.fill();
    g.restore(); g.save();
    rr(g, r.x, r.y, r.w, r.h, 30 * u); g.clip(); cover(g, s2, w2, h2, r.x, r.y, r.w, r.h, st.zoom2, st.fx2, st.fy2);
    g.restore();
    g.lineWidth = 5 * u; g.strokeStyle = 'rgba(255,255,255,.92)'; rr(g, r.x, r.y, r.w, r.h, 30 * u); g.stroke();
  }

  /* ------------------------------------------------------------------ the 3×3 wall intro (style.wall)
     The shot shrinks into the centre tile of a 3×3 grid, 8 other moments (plan.wall: frames from the project's other
     clips) pop in around it one after another, then the camera pushes back into the centre. Replaces the intro. */
  var WALL_D = 1.9;
  RS.WALL_D = WALL_D;
  function wallOn(plan, t) { return !!(plan.st.wall && plan.wall && plan.wall.length && t < WALL_D); }
  function drawWall(g, W, H, u, plan, t) {
    if (snap.width !== W || snap.height !== H) { snap.width = W; snap.height = H; }
    var sg = snap.getContext('2d'); sg.clearRect(0, 0, W, H); sg.drawImage(g.canvas, 0, 0);
    var st = plan.st, gap = 14 * u, tw = (W - gap * 4) / 3, th = (H - gap * 4) / 3, full = W / tw;
    var k = t < 0.35 ? full + (1 - full) * ease(t / 0.35) : t < 1.35 ? 1 : 1 + (full - 1) * Math.pow(RS.clamp((t - 1.35) / 0.55, 0, 1), 2.2);
    var cx = gap * 2 + tw * 1.5, cy = gap * 2 + th * 1.5, order = [0, 1, 2, 5, 8, 7, 6, 3];
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = INK; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2); g.scale(k, k); g.translate(-cx, -cy);
    for (var i = 0; i < 9; i++) {
      var x = gap + (i % 3) * (tw + gap), y = gap + Math.floor(i / 3) * (th + gap);
      if (i === 4) { g.save(); rr(g, x, y, tw, th, 18 * u); g.clip(); g.drawImage(snap, x, y, tw, th); g.restore(); continue; }
      var pos = order.indexOf(i), p = (t - 0.35 - pos * 0.075) / 0.28;
      if (p <= 0) continue;
      var fr = plan.wall[pos % plan.wall.length], sc = Math.max(0.01, popIn(p));
      g.save(); g.translate(x + tw / 2, y + th / 2); g.scale(sc, sc); g.translate(-tw / 2, -th / 2);
      rr(g, 0, 0, tw, th, 18 * u); g.clip(); cover(g, fr, fr.width, fr.height, 0, 0, tw, th, 1, st.fx, st.fy);
      g.restore();
    }
    g.restore();
  }
  /* Frames for the wall: one picture per time, read from a separate <video> so the preview isn't disturbed. */
  var wallCache = {};
  RS.wallFrames = function (m, times) {
    var key = m.url + '|' + times.map(function (t) { return t.toFixed(1); }).join(',');
    if (wallCache[key]) return wallCache[key];
    var p = RS.videoEl(m.url).then(function (v) {
      var out = [];
      return times.reduce(function (pr, t) {
        return pr.then(function () { return RS.seek(v, t); }).then(function () {
          var c = document.createElement('canvas'), w = 360; c.width = w; c.height = Math.max(1, Math.round(w * v.videoHeight / v.videoWidth));
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); out.push(c);
        });
      }, Promise.resolve()).then(function () { v.removeAttribute('src'); v.load(); return out; });
    });
    wallCache[key] = p; p.catch(function () { delete wallCache[key]; });
    return p;
  };

  /* ------------------------------------------------------------------ the person cut-out (layers with behind: true)
     Google's MediaPipe selfie segmenter, loaded from a CDN the first time someone puts text behind a person, runs
     on this device (nothing is uploaded). cutout() returns a copy of the frame with only the person left. */
  RS.person = (function () {
    var self = { ready: false, failed: false }, seg = null, loading = null, lastTs = 0, cacheKey = null;
    var BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    var MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
    var small = document.createElement('canvas'), maskCv = document.createElement('canvas'), out = document.createElement('canvas');
    self.load = function () {
      if (seg) return Promise.resolve(true);
      if (loading) return loading;
      loading = import(BASE + '/vision_bundle.mjs').then(function (V) {
        return V.FilesetResolver.forVisionTasks(BASE + '/wasm').then(function (files) {
          function make(delegate) {
            return V.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: delegate }, runningMode: 'VIDEO',
              outputCategoryMask: false, outputConfidenceMasks: true });
          }
          return make('GPU').catch(function () { return make('CPU'); });
        });
      }).then(function (s) { seg = s; self.ready = true; self.failed = false; return true; }, function (e) {
        console.warn('person cut-out', e); self.failed = true; loading = null;
        throw new Error('The person cut-out couldn\'t load. Check your connection and try again.');
      });
      return loading;
    };
    self.cutout = function (srcCanvas, W, H, key) {
      if (!seg) return null;
      if (out.width !== W || out.height !== H) { out.width = W; out.height = H; cacheKey = null; }
      if (key !== cacheKey) {
        var mw = 256, mh = Math.max(16, Math.round(256 * H / W)), ok = false;
        if (small.width !== mw || small.height !== mh) { small.width = mw; small.height = mh; }
        small.getContext('2d').drawImage(srcCanvas, 0, 0, W, H, 0, 0, mw, mh);
        lastTs = Math.max(lastTs + 1, performance.now());
        try {
          seg.segmentForVideo(small, lastTs, function (res) {
            var masks = res.confidenceMasks || [], m = masks[masks.length - 1];
            if (!m) return;
            var w = m.width, h = m.height, f = m.getAsFloat32Array();
            if (maskCv.width !== w || maskCv.height !== h) { maskCv.width = w; maskCv.height = h; }
            var mg = maskCv.getContext('2d'), id = mg.createImageData(w, h), d = id.data;
            for (var i = 0, j = 0; i < f.length; i++, j += 4) { var a = (f[i] - 0.3) / 0.4; d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = a <= 0 ? 0 : a >= 1 ? 255 : a * 255; }
            mg.putImageData(id, 0, 0); ok = true;
          });
        } catch (e) { console.warn('cut-out', e); }
        if (!ok) return null;
        cacheKey = key;
      }
      var og = out.getContext('2d');
      og.globalCompositeOperation = 'copy'; og.drawImage(srcCanvas, 0, 0, W, H, 0, 0, W, H);
      og.globalCompositeOperation = 'destination-in'; og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
      og.drawImage(maskCv, 0, 0, W, H);
      og.globalCompositeOperation = 'source-over';
      return out;
    };
    return self;
  })();
  function rnd(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function moveFrame(g, W, H, u, tr, t) {
    var k = tr.k, a = RS.clamp(tr.a, 0, 1), a2 = a * a;
    if (k === 'fade' || k === 'flash' || k === 'none') return;
    if (snap.width !== W || snap.height !== H) { snap.width = W; snap.height = H; }
    var sg = snap.getContext('2d'); sg.clearRect(0, 0, W, H); sg.drawImage(g.canvas, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (k === 'zoom') {
      var z = 1 + 0.7 * a2; g.translate(W / 2, H / 2); g.scale(z, z); g.drawImage(snap, -W / 2, -H / 2);
    } else if (k === 'spin') {
      g.translate(W / 2, H / 2); g.rotate(-tr.dir * a2 * Math.PI * 0.55); var zs = 1 + a * 0.9; g.scale(zs, zs); g.drawImage(snap, -W / 2, -H / 2);
    } else if (k === 'whip') {
      var x = (tr.dir > 0 ? 1 : -1) * a2 * W * 0.95;
      for (var i = 4; i >= 1; i--) { g.globalAlpha = 0.2; g.drawImage(snap, x - (tr.dir > 0 ? 1 : -1) * i * W * 0.07 * a, 0); }
      g.globalAlpha = 0.75; g.drawImage(snap, x, 0); g.globalAlpha = 1;
    } else if (k === 'shake') {
      var amp = 46 * u * a, zz = 1 + 0.1 * a;
      g.translate(W / 2 + Math.sin(t * 93) * amp, H / 2 + Math.cos(t * 71) * amp * 0.7); g.rotate(Math.sin(t * 57) * 0.04 * a); g.scale(zz, zz); g.drawImage(snap, -W / 2, -H / 2);
    } else if (k === 'glitch') {
      g.drawImage(snap, 0, 0);
      var seed = Math.floor(t * 24), y = 0;
      for (var b = 0; y < H && b < 14; b++) {
        var h = H * (0.03 + rnd(seed + b) * 0.1), dx = (rnd(seed * 3 + b) - 0.5) * W * 0.35 * a;
        if (rnd(seed + b * 7) < 0.6) g.drawImage(snap, 0, y, W, h, dx, y, W, h);
        y += h;
      }
      g.globalCompositeOperation = 'screen';
      for (var c = 0; c < 4; c++) {
        var cy = rnd(seed + c * 13) * H, ch = H * (0.02 + rnd(seed + c) * 0.06);
        g.fillStyle = c % 2 ? 'rgba(0,255,230,' + 0.45 * a + ')' : 'rgba(255,40,150,' + 0.45 * a + ')'; g.fillRect(0, cy, W, ch);
      }
      g.globalCompositeOperation = 'source-over';
    } else if (k === 'pixel') {
      var blk = Math.max(1, (6 + 70 * a2) * u), tw = Math.max(1, Math.round(W / blk)), th = Math.max(1, Math.round(H / blk));
      if (tiny.width !== tw || tiny.height !== th) { tiny.width = tw; tiny.height = th; }
      var tg = tiny.getContext('2d'); tg.imageSmoothingEnabled = true; tg.drawImage(snap, 0, 0, tw, th);
      g.imageSmoothingEnabled = false; g.drawImage(tiny, 0, 0, W, H); g.imageSmoothingEnabled = true;
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ text + stickers (style.layers)
     Each layer: {id, t: text|emoji|badge|shape, v, x, y (0..1 of the frame), size, rot (deg), s, e (reel seconds) or all,
     anim (entrance), loop (idle motion), font, ts (text style), fill, line, shape (badge), upper}.
     opt.boxes (array) collects hit boxes for the editor; opt.selected draws a dashed box + the scale/rotate handle. */
  function bounceOut(x) {
    x = RS.clamp(x, 0, 1); var n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375;
  }
  /* When a layer shows, in reel seconds. A layer pinned to a word (at = the word's second in the source video) follows
     that word when the clip is trimmed, sped up or has its silences cut; it hides if the word is trimmed away. */
  function layerSpan(L, plan) {
    if (L.all) return [0, 1e9];
    var s = L.s || 0, e = L.e || 0;
    if (L.at != null && plan.clip && plan.segs) {
      if (L.at < plan.clip.start - 0.01 || L.at > plan.clip.end) return [-1, -1];
      var len = Math.max(0.3, e - s); s = RS.srcToOut(plan, L.at); e = s + len;
    }
    return [s, e];
  }
  function inSpan(sp, t) { return t >= sp[0] && t < sp[1]; }
  RS.layerSpan = layerSpan;
  function drawSelection(g, u, opt) {
    var b = (opt.boxes || []).filter(function (x) { return x.id === opt.selected; })[0];
    if (!b) return;
    var bw = b.w, bh = b.h, pad = 14 * u;
    g.save(); g.translate(b.x, b.y); g.rotate(b.rot);
    g.setLineDash([14 * u, 10 * u]); g.lineWidth = 4 * u; g.strokeStyle = '#FFFFFF'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6 * u;
    g.strokeRect(-bw / 2 - pad, -bh / 2 - pad, bw + pad * 2, bh + pad * 2); g.setLineDash([]);
    g.fillStyle = '#C6F432'; g.strokeStyle = INK; g.lineWidth = 5 * u; g.beginPath(); g.arc(bw / 2 + pad, bh / 2 + pad, 24 * u, 0, 7); g.fill(); g.stroke();
    g.shadowBlur = 0; g.fillStyle = INK; g.font = '700 ' + Math.round(28 * u) + 'px "DM Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('↻', bw / 2 + pad, bh / 2 + pad + 1 * u);
    g.restore();
  }
  /* which: 'all', 'behind' (only layers behind the person) or 'front' (the rest). */
  function drawLayers(g, W, H, u, plan, t, opt, which) {
    var still = !!opt.noFade;
    plan.st.layers.forEach(function (L) {
      if (which === 'behind' && !L.behind) return;
      if (which === 'front' && L.behind) return;
      var sp = layerSpan(L, plan), s = sp[0], e = sp[1];
      var vis = t >= s && t < e, sel = opt.selected === L.id, ghost = !vis && sel;
      if (!vis && !ghost) return;
      var local = Math.max(0, t - s), calm = still || ghost;
      var x = L.x * W, y = L.y * H, sc = L.size || 1, rot = (L.rot || 0) * Math.PI / 180, alpha = ghost ? 0.45 : 1, chars = null;
      if (!calm) {
        var an = L.anim || 'none';
        if (an === 'pop') sc *= Math.max(0.01, popIn(local / 0.4));
        else if (an === 'fade') alpha *= ease(local / 0.4);
        else if (an === 'slide') { y += (1 - ease(local / 0.45)) * H * 0.12; alpha *= ease(local / 0.3); }
        else if (an === 'drop') y -= (1 - bounceOut(local / 0.7)) * H * 0.3;
        else if (an === 'zoom') { sc *= 1 + 1.6 * (1 - ease(local / 0.4)); alpha *= ease(local / 0.25); }
        else if (an === 'spin') { rot -= (1 - ease(local / 0.5)) * Math.PI * 1.5; sc *= Math.max(0.01, ease(local / 0.5)); }
        else if (an === 'type') { if (L.t === 'text' || L.t === 'card') chars = Math.floor(local / (L.t === 'card' ? 0.035 : 0.05)) + 1; else sc *= Math.max(0.01, popIn(local / 0.4)); }
        var lp = L.loop || 'none';
        if (lp === 'wiggle') rot += Math.sin(local * 6) * 0.08;
        else if (lp === 'float') y += Math.sin(local * 2.4) * 14 * u;
        else if (lp === 'pulse') sc *= 1 + Math.sin(local * 5) * 0.06;
        else if (lp === 'shake') { x += Math.sin(local * 47) * 6 * u; y += Math.cos(local * 53) * 5 * u; }
        else if (lp === 'spin') rot += local * 1.6;
        if (!L.all && e - t < 0.25) alpha *= RS.clamp((e - t) / 0.25, 0, 1);
      }
      g.save(); g.globalAlpha = RS.clamp(alpha, 0, 1); g.translate(x, y); g.rotate(rot); g.scale(sc, sc);
      var box = drawLayerBody(g, L, u, W, chars, calm ? 99 : local);
      g.restore();
      var bw = box.w * (L.size || 1), bh = box.h * (L.size || 1), br = (L.rot || 0) * Math.PI / 180;
      if (opt.boxes) opt.boxes.push({ id: L.id, x: L.x * W, y: L.y * H, w: bw, h: bh, rot: br });
    });
  }
  function wrapLines(g, text, maxW) {
    var out = [];
    String(text).split('\n').forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), cur = '';
      if (!words.length) { out.push(''); return; }
      words.forEach(function (w) { var tryL = cur ? cur + ' ' + w : w; if (cur && g.measureText(tryL).width > maxW) { out.push(cur); cur = w; } else cur = tryL; });
      out.push(cur);
    });
    return out.slice(0, 5);
  }
  function drawLayerBody(g, L, u, W, chars, lt) {
    if (L.t === 'emoji') return drawEmoji(g, L.v, u);
    if (L.t === 'badge') return drawBadge(g, L, u);
    if (L.t === 'shape') return drawShape(g, L, u);
    if (L.t === 'card') return drawCard(g, L, u, chars, lt == null ? 99 : lt);
    var fname = L.font || 'Anton', fs = 92 * u * (RS.FONT_SCALE[fname] || 1), ts = L.ts || 'outline';
    g.font = font(fname, fs); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2;
    var txt = L.upper ? String(L.v).toUpperCase() : String(L.v);
    var lines = wrapLines(g, txt, W * 0.86 / Math.max(0.6, L.size || 1)), full = lines.slice();
    if (chars != null) { var left = chars; lines = lines.map(function (l) { var part = l.slice(0, Math.max(0, left)); left -= l.length + 1; return part; }); }
    var lh = fs * (fname === 'Pacifico' ? 1.45 : 1.14), bw = Math.max.apply(null, full.map(function (l) { return g.measureText(l).width; }).concat([fs])), bh = lines.length * lh;
    var y0 = -bh / 2 + lh / 2, fill = L.fill || '#FFFFFF', line = L.line || '#000000';
    if (ts === 'sticker') {
      var px = fs * 0.5, py = fs * 0.26;
      g.fillStyle = INK; rr(g, -bw / 2 - px + 10 * u, -bh / 2 - py + 10 * u, bw + px * 2, bh + py * 2, 26 * u); g.fill();
      g.fillStyle = line; rr(g, -bw / 2 - px, -bh / 2 - py, bw + px * 2, bh + py * 2, 26 * u); g.fill(); g.lineWidth = 6 * u; g.strokeStyle = INK; g.stroke();
    }
    lines.forEach(function (l, i) {
      var y = y0 + i * lh;
      if (ts === 'marker' && l) {
        var mw = g.measureText(full[i]).width;
        g.save(); g.rotate(-0.02); g.fillStyle = line; g.globalAlpha *= 0.92;
        g.beginPath(); g.moveTo(-mw / 2 - fs * 0.22, y - lh * 0.3); g.lineTo(mw / 2 + fs * 0.3, y - lh * 0.36); g.lineTo(mw / 2 + fs * 0.2, y + lh * 0.34); g.lineTo(-mw / 2 - fs * 0.3, y + lh * 0.3); g.closePath(); g.fill();
        g.restore();
      }
      if (ts === 'outline') { g.lineWidth = fs * 0.17; g.strokeStyle = line; g.strokeText(l, 0, y); g.fillStyle = fill; g.fillText(l, 0, y); }
      else if (ts === 'double') { g.lineWidth = fs * 0.4; g.strokeStyle = line; g.strokeText(l, 0, y); g.lineWidth = fs * 0.17; g.strokeStyle = INK; g.strokeText(l, 0, y); g.fillStyle = fill; g.fillText(l, 0, y); }
      else if (ts === 'pop3d') {
        var depth = fs * 0.1, step = Math.max(1, 1.5 * u);
        g.fillStyle = line; g.strokeStyle = line; g.lineWidth = fs * 0.08;
        for (var d = depth; d > 0; d -= step) { g.strokeText(l, d, y + d); g.fillText(l, d, y + d); }
        g.strokeStyle = INK; g.strokeText(l, 0, y); g.fillStyle = fill; g.fillText(l, 0, y);
      } else if (ts === 'hollow') {
        g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 10 * u; g.lineWidth = fs * 0.075; g.strokeStyle = line; g.strokeText(l, 0, y); g.restore();
        g.lineWidth = fs * 0.075; g.strokeStyle = line; g.strokeText(l, 0, y);
      } else if (ts === 'glow') {
        g.save(); g.shadowColor = line; g.shadowBlur = 36 * u; g.fillStyle = fill; g.fillText(l, 0, y); g.fillText(l, 0, y); g.restore();
        g.lineWidth = fs * 0.035; g.strokeStyle = line; g.strokeText(l, 0, y); g.fillStyle = fill; g.fillText(l, 0, y);
      } else if (ts === 'plain') {
        g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 16 * u; g.shadowOffsetY = 4 * u; g.fillStyle = fill; g.fillText(l, 0, y); g.restore();
      } else if (ts === 'magazine') {
        g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 18 * u; g.shadowOffsetY = 3 * u; g.fillStyle = fill; g.fillText(l, 0, y); g.restore();
      } else { g.fillStyle = fill; g.fillText(l, 0, y); }
    });
    if (ts === 'magazine') {
      // a magazine masthead: issue line above, a thin rule and a barcode below
      var kfs = Math.max(14 * u, fs * 0.17), kick = String(L.sub || magKicker()).toUpperCase();
      g.save(); g.fillStyle = fill; g.globalAlpha *= 0.9;
      g.font = '700 ' + Math.round(kfs) + 'px "DM Sans", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(kick, 0, -bh / 2 - kfs * 0.9);
      g.fillRect(-bw / 2, bh / 2 + kfs * 0.4, bw, Math.max(1, 2 * u));
      var bx = bw / 2 - kfs * 6, by = bh / 2 + kfs * 1.0;
      for (var i = 0; i < 28; i++) { var bwid = (rndBar(i) * 2.4 + 0.8) * u * 1.6; g.fillRect(bx + i * kfs * 0.21, by, bwid, kfs * 2); }
      g.restore();
      return { w: bw + fs * 0.2, h: bh + kfs * 6 };
    }
    var extra = ts === 'sticker' ? fs * 1.0 : ts === 'double' ? fs * 0.4 : fs * 0.2;
    return { w: bw + extra, h: bh + (ts === 'sticker' ? fs * 0.52 : fs * 0.1) };
  }
  function rndBar(i) { var x = Math.sin(i * 91.7 + 13.1) * 43758.5; return x - Math.floor(x); }
  function magKicker() {
    var d = new Date(), m = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'][d.getMonth()];
    return 'No. 01 · ' + m + ' ' + d.getFullYear() + ' · The reel issue';
  }

  /* Cards: 'label' (an app-icon tile + a name, like a tool label), 'repo' (a GitHub-style repo card) and 'prompt'
     (a chat prompt bar; with the "type" entrance it types itself out, then the cursor blinks). fill = accent colour. */
  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  function sans(weight, size) { return weight + ' ' + Math.round(size) + 'px "DM Sans", system-ui, sans-serif'; }
  function drawCard(g, L, u, chars, lt) {
    var kind = L.card || 'label', acc = L.fill || '#22C55E', title = String(L.v || ''), sub = String(L.sub || '');
    var shown = chars != null ? title.slice(0, Math.max(0, chars)) : title;
    g.textBaseline = 'middle'; g.lineJoin = 'round';
    function shadowed(fn) { g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 28 * u; g.shadowOffsetY = 8 * u; fn(); g.restore(); }
    if (kind === 'label') {
      var fs = 84 * u, tile = 132 * u, gap = 28 * u;
      g.font = sans(700, fs);
      var tw = g.measureText(title).width, w = tile + gap + tw, x0 = -w / 2;
      shadowed(function () { g.fillStyle = '#121216'; rr(g, x0, -tile / 2, tile, tile, 32 * u); g.fill(); });
      g.fillStyle = acc; rr(g, x0 + 16 * u, -tile / 2 + 16 * u, tile - 32 * u, tile - 32 * u, 20 * u); g.fill();
      g.font = Math.round(tile * 0.46) + 'px ' + EMOJI_FONT; g.textAlign = 'center'; g.fillText(L.icon || '🧰', x0 + tile / 2, 4 * u);
      g.font = sans(700, fs); g.textAlign = 'left';
      g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 18 * u; g.shadowOffsetY = 4 * u; g.fillStyle = '#FFFFFF'; g.fillText(shown, x0 + tile + gap, 4 * u); g.restore();
      return { w: w + 24 * u, h: tile + 24 * u };
    }
    if (kind === 'repo') {
      var cw = 860 * u, pad = 34 * u, fsT = 44 * u, fsS = 30 * u;
      g.font = sans(400, fsS);
      var dl = sub ? wrapLines(g, sub, cw - pad * 2).slice(0, 2) : [];
      var ch = pad * 2 + fsT * 1.2 + (dl.length ? dl.length * fsS * 1.4 + 16 * u : 0) + 72 * u, cx0 = -cw / 2, cy0 = -ch / 2;
      shadowed(function () { g.fillStyle = '#0D1117'; rr(g, cx0, cy0, cw, ch, 26 * u); g.fill(); });
      g.lineWidth = 3 * u; g.strokeStyle = '#30363D'; rr(g, cx0, cy0, cw, ch, 26 * u); g.stroke();
      var y = cy0 + pad + fsT * 0.6;
      g.textAlign = 'left'; g.font = Math.round(fsT * 0.85) + 'px ' + EMOJI_FONT; g.fillText(L.icon || '📦', cx0 + pad, y);
      var tx = cx0 + pad + fsT * 1.3;
      g.font = sans(700, fsT); g.fillStyle = '#E6EDF3'; g.fillText(shown, tx, y);
      var ttw = g.measureText(title).width; g.font = sans(600, 24 * u);
      var pw = g.measureText('Public').width + 30 * u;
      if (tx + ttw + 22 * u + pw < cx0 + cw - pad) { g.strokeStyle = '#30363D'; rr(g, tx + ttw + 22 * u, y - 21 * u, pw, 42 * u, 21 * u); g.stroke(); g.fillStyle = '#8B949E'; g.fillText('Public', tx + ttw + 37 * u, y + 1 * u); }
      y += fsT * 0.6 + 16 * u;
      g.font = sans(400, fsS); g.fillStyle = '#8B949E';
      dl.forEach(function (l) { y += fsS * 0.7; g.fillText(l, cx0 + pad, y); y += fsS * 0.7; });
      var bx = cx0 + pad, by = cy0 + ch - pad - 24 * u;
      g.font = sans(600, 26 * u);
      [['☆', 'Star', acc], ['⑂', 'Fork', '#8B949E']].forEach(function (b) {
        var label = b[0] + '  ' + b[1], bw2 = g.measureText(label).width + 36 * u;
        g.fillStyle = '#21262D'; rr(g, bx, by - 25 * u, bw2, 50 * u, 12 * u); g.fill(); g.strokeStyle = '#30363D'; g.stroke();
        g.fillStyle = '#C9D1D9'; g.fillText(label, bx + 18 * u, by + 1 * u); bx += bw2 + 14 * u;
      });
      return { w: cw, h: ch };
    }
    // the prompt bar
    var pwid = 880 * u, pp = 32 * u, pfs = 40 * u, btn = 66 * u, lab = sub ? 30 * u : 0;
    g.font = sans(500, pfs);
    var lines = wrapLines(g, title, pwid - pp * 2 - btn - 18 * u).slice(0, 3), shownL = lines;
    if (chars != null) { var left = chars; shownL = lines.map(function (l) { var part = l.slice(0, Math.max(0, left)); left -= l.length + 1; return part; }); }
    var ph = Math.max(btn + pp * 1.2, lines.length * pfs * 1.38 + pp * 1.6) + lab, px0 = -pwid / 2, py0 = -ph / 2;
    shadowed(function () { g.fillStyle = '#2A2724'; rr(g, px0, py0, pwid, ph, 34 * u); g.fill(); });
    g.lineWidth = 2.5 * u; g.strokeStyle = 'rgba(255,255,255,.14)'; rr(g, px0, py0, pwid, ph, 34 * u); g.stroke();
    g.textAlign = 'left';
    if (sub) { g.font = sans(700, 20 * u); g.fillStyle = '#9A948A'; g.fillText(sub.toUpperCase().slice(0, 40), px0 + pp, py0 + pp * 0.9); }
    g.font = sans(500, pfs); g.fillStyle = '#F5F1EA';
    var ty0 = py0 + lab + pp * 0.8 + pfs * 0.69, lastX = px0 + pp, lastY = ty0, typing = chars != null && chars < title.length;
    shownL.forEach(function (l, i) { var yy = ty0 + i * pfs * 1.38; g.fillText(l, px0 + pp, yy); if (l.length || i === 0) { lastX = px0 + pp + g.measureText(l).width; lastY = yy; } });
    if (typing || Math.floor(lt * 2) % 2 === 0) { g.fillStyle = acc; g.fillRect(lastX + 4 * u, lastY - pfs * 0.55, 4 * u, pfs * 1.1); }
    var bcx = px0 + pwid - pp - btn / 2 + 8 * u, bcy = py0 + ph - pp * 0.6 - btn / 2;
    g.fillStyle = acc; g.beginPath(); g.arc(bcx, bcy, btn / 2, 0, 7); g.fill();
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 6 * u; g.lineCap = 'round';
    g.beginPath(); g.moveTo(bcx, bcy + 15 * u); g.lineTo(bcx, bcy - 15 * u); g.moveTo(bcx - 12 * u, bcy - 3 * u); g.lineTo(bcx, bcy - 15 * u); g.lineTo(bcx + 12 * u, bcy - 3 * u); g.stroke();
    return { w: pwid, h: ph };
  }

  /* A layer drawn on its own, fitted into a small canvas (the editor's style and sticker pickers). */
  var measureCtx = document.createElement('canvas').getContext('2d');
  RS.layerThumb = function (cv, L, w, h, bg) {
    cv.width = w; cv.height = h;
    var g = cv.getContext('2d');
    g.fillStyle = bg || '#2A1F45'; g.fillRect(0, 0, w, h);
    var box = drawLayerBody(measureCtx, L, 1, 1080, null), k = Math.min(w * 0.84 / box.w, h * 0.8 / box.h);
    g.save(); g.translate(w / 2, h / 2); g.scale(k, k); g.rotate((L.rot || 0) * Math.PI / 180); drawLayerBody(g, L, 1, 1080, null); g.restore();
  };

  var emojiCache = {};
  function drawEmoji(g, em, u) {
    var px = Math.max(16, Math.round(150 * u / 4) * 4), key = em + '|' + px, c = emojiCache[key];
    if (!c) {
      var S = Math.round(px * 1.7), r = px * 0.075, sh = px * 0.05;
      var base = document.createElement('canvas'); base.width = base.height = S;
      var bg = base.getContext('2d'); bg.font = px + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.fillText(em, S / 2, S / 2 + px * 0.06);
      function sil(color) { var k = document.createElement('canvas'); k.width = k.height = S; var kg = k.getContext('2d'); kg.drawImage(base, 0, 0); kg.globalCompositeOperation = 'source-in'; kg.fillStyle = color; kg.fillRect(0, 0, S, S); return k; }
      var white = sil('#FFFFFF'), ink = sil(INK);
      c = document.createElement('canvas'); c.width = c.height = S; var cg = c.getContext('2d');
      for (var i = 0; i < 16; i++) { var an = i / 16 * Math.PI * 2; cg.drawImage(ink, Math.cos(an) * r + sh, Math.sin(an) * r + sh); }
      for (var j = 0; j < 16; j++) { var aj = j / 16 * Math.PI * 2; cg.drawImage(white, Math.cos(aj) * r, Math.sin(aj) * r); }
      cg.drawImage(base, 0, 0);
      emojiCache[key] = c;
    }
    g.drawImage(c, -c.width / 2, -c.height / 2);
    return { w: px * 1.25, h: px * 1.25 };
  }
  function drawBadge(g, L, u) {
    var fs = 62 * u, fill = L.fill || '#FFE14D', txt = String(L.v).toUpperCase().slice(0, 24);
    g.font = font('Luckiest Guy', fs); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    var tw = g.measureText(txt).width, w, h, sh = 9 * u;
    function path(dx) {
      g.beginPath();
      if (L.shape === 'circle') { var R = Math.max(tw / 2 + fs * 0.55, fs * 1.15); g.arc(dx, dx, R, 0, 7); w = h = R * 2; }
      else if (L.shape === 'burst') {
        var rx = tw / 2 + fs * 1.0, ry = fs * 1.35, n = 18;
        for (var i = 0; i <= n * 2; i++) { var a = i / (n * 2) * Math.PI * 2, k = i % 2 ? 0.78 : 1; g.lineTo(dx + Math.cos(a) * rx * k, dx + Math.sin(a) * ry * k); }
        g.closePath(); w = rx * 2; h = ry * 2;
      } else if (L.shape === 'bubble') {
        w = tw + fs * 1.1; h = fs * 1.6; var r = 30 * u, x0 = -w / 2 + dx, y0 = -h / 2 + dx;
        g.moveTo(x0 + r, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, r); g.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
        g.lineTo(x0 + w * 0.34, y0 + h); g.lineTo(x0 + w * 0.16, y0 + h + fs * 0.6); g.lineTo(x0 + w * 0.2, y0 + h);
        g.arcTo(x0, y0 + h, x0, y0, r); g.arcTo(x0, y0, x0 + w, y0, r); g.closePath(); h += fs * 0.6;
      } else { w = tw + fs * 1.0; h = fs * 1.5; rr(g, -w / 2 + dx, -h / 2 + dx, w, h, h / 2); }
    }
    path(sh); g.fillStyle = INK; g.fill();
    path(0); g.fillStyle = fill; g.fill(); g.lineWidth = 6 * u; g.strokeStyle = INK; g.stroke();
    if (L.shape === 'circle') { g.setLineDash([10 * u, 9 * u]); g.lineWidth = 3 * u; g.beginPath(); g.arc(0, 0, w / 2 - 12 * u, 0, 7); g.stroke(); g.setLineDash([]); }
    g.fillStyle = inkOn(fill); g.fillText(txt, 0, fs * 0.08);
    return { w: w + sh, h: h + sh };
  }
  function drawShape(g, L, u) {
    var c = L.fill || '#FF3D8B', k = u;
    function both(width, fn) { g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = width + 14 * k; fn(); g.stroke(); g.strokeStyle = c; g.lineWidth = width; fn(); g.stroke(); }
    function filled(fn) { g.save(); g.translate(8 * k, 8 * k); fn(); g.fillStyle = INK; g.fill(); g.restore(); fn(); g.fillStyle = c; g.fill(); g.lineWidth = 7 * k; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke(); }
    if (L.v === 'arrow') {
      both(26 * k, function () { g.beginPath(); g.moveTo(-130 * k, 40 * k); g.quadraticCurveTo(-20 * k, -60 * k, 95 * k, -8 * k); });
      filled(function () { g.beginPath(); g.moveTo(140 * k, 8 * k); g.lineTo(70 * k, -50 * k); g.lineTo(78 * k, 40 * k); g.closePath(); });
      return { w: 300 * k, h: 150 * k };
    }
    if (L.v === 'ring') {
      both(14 * k, function () { g.beginPath(); for (var i = 0; i <= 64; i++) { var a = 0.3 + i / 64 * Math.PI * 2.15, r = 1 + 0.05 * Math.sin(i * 0.7); g.lineTo(Math.cos(a) * 160 * k * r, Math.sin(a) * 100 * k * r); } });
      return { w: 350 * k, h: 230 * k };
    }
    if (L.v === 'underline') {
      both(16 * k, function () { g.beginPath(); for (var i = 0; i <= 40; i++) { var x = -150 * k + i * 7.5 * k; g.lineTo(x, Math.sin(i * 0.55) * 14 * k); } });
      return { w: 330 * k, h: 70 * k };
    }
    if (L.v === 'sparkles') {
      [[-60, -30, 70], [60, -60, 42], [50, 55, 52]].forEach(function (p) {
        filled(function () { var x = p[0] * k, y = p[1] * k, r = p[2] * k; g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r * 0.75, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r * 0.75, y); g.quadraticCurveTo(x, y, x, y - r); g.closePath(); });
      });
      return { w: 240 * k, h: 240 * k };
    }
    if (L.v === 'heart') {
      filled(function () { var s = 4.2 * k; g.beginPath(); g.moveTo(0, 30 * s); g.bezierCurveTo(-40 * s, 2 * s, -26 * s, -26 * s, 0, -10 * s); g.bezierCurveTo(26 * s, -26 * s, 40 * s, 2 * s, 0, 30 * s); g.closePath(); });
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(-62 * k, -40 * k, 16 * k, 10 * k, -0.6, 0, 7); g.fill();
      return { w: 190 * k, h: 190 * k };
    }
    filled(function () { g.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 40 : 95) * k; g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 8 * k); } g.closePath(); });
    return { w: 200 * k, h: 200 * k };
  }

  function drawCaptions(g, W, H, u, plan, t) {
    var st = plan.st, cue = null;
    for (var i = 0; i < plan.cues.length; i++) { if (t >= plan.cues[i].s && t < plan.cues[i].e) { cue = plan.cues[i]; break; } }
    if (!cue) return;
    var style = st.capStyle, fname = style === 'comic' && st.capFont === 'Anton' ? 'Bangers' : st.capFont;
    var fs = 76 * u * st.capSize * (RS.FONT_SCALE[fname] || 1) * (style === 'minimal' ? 0.82 : style === 'clean' ? 0.88 : 1);
    g.font = font(fname, fs);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round'; g.miterLimit = 2;
    var activeIdx = -1;
    cue.words.forEach(function (w, k) { if (t >= w[0]) activeIdx = k; });
    var items = cue.words.map(function (w, k) {
      var txt = String(w[2]).replace(/[.,;:]+$/, '');
      if (st.capUpper) txt = txt.toUpperCase();
      return { txt: txt, w: g.measureText(txt).width, k: k, s: w[0], active: k === activeIdx, past: k < activeIdx };
    });
    var gap = fs * 0.28, maxW = W * 0.84, lines = wrapWords(g, items, maxW, gap), lh = fs * (style === 'boxed' ? 1.32 : 1.12);
    var cy = H * st.capPos, top = cy - (lines.length - 1) * lh / 2;
    var rot = style === 'comic' ? ((Math.round(cue.s * 7) % 3) - 1) * 0.045 : 0;
    g.save(); g.translate(W / 2, cy); g.rotate(rot); g.translate(-W / 2, -cy);
    if (st.capEmoji) {
      var em = '';
      cue.words.some(function (w) { em = RS.emojiFor(w[2]); return !!em; });
      if (em) {
        var ep = popIn((t - cue.s) / 0.35), es = fs * 1.45 * ep;
        g.save(); g.font = Math.round(es) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center';
        g.fillText(em, W / 2, top - lh * 0.6 - fs * 0.85); g.restore();
        g.font = font(fname, fs); g.textAlign = 'left';
      }
    }
    lines.forEach(function (line, li) {
      var y = top + li * lh, x = (W - lineWidth(line, gap)) / 2;
      if (style === 'boxed') {
        var pad = fs * 0.28;
        g.fillStyle = INK; rr(g, x - pad + 6 * u, y - lh / 2 + 6 * u, lineWidth(line, gap) + pad * 2, lh - 4 * u, 16 * u); g.fill();
        g.fillStyle = '#FFFFFF'; rr(g, x - pad, y - lh / 2, lineWidth(line, gap) + pad * 2, lh - 4 * u, 16 * u); g.fill();
      }
      line.forEach(function (it) {
        var sc = 1;
        if (it.active && (style === 'pop' || style === 'comic' || style === 'neon')) sc = 1 + 0.12 * (1 - ease((t - it.s) / 0.18)) + 0.04;
        g.save(); g.translate(x + it.w / 2, y); g.scale(sc, sc); g.translate(-it.w / 2, 0);
        var fill = st.capColor;
        if (style === 'pop' || style === 'comic' || style === 'neon') fill = it.active ? st.hl : st.capColor;
        if (style === 'karaoke') fill = it.active || it.past ? st.hl : st.capColor;
        if (style === 'pop' || style === 'karaoke' || style === 'comic') {
          g.lineWidth = fs * (style === 'comic' ? 0.22 : 0.16); g.strokeStyle = '#000';
          g.fillStyle = '#000'; g.fillText(it.txt, fs * 0.06, fs * 0.07); g.strokeText(it.txt, 0, 0);
          g.fillStyle = fill; g.fillText(it.txt, 0, 0);
        } else if (style === 'boxed') {
          if (it.active) { g.fillStyle = st.hl; rr(g, -fs * 0.12, -lh * 0.4, it.w + fs * 0.24, lh * 0.76, 12 * u); g.fill(); }
          g.fillStyle = INK; g.fillText(it.txt, 0, 0);
        } else if (style === 'neon') {
          g.shadowColor = st.hl; g.shadowBlur = (it.active ? 40 : 18) * u; g.fillStyle = fill; g.fillText(it.txt, 0, 0);
          g.shadowBlur = 0; g.fillText(it.txt, 0, 0);
        } else if (style === 'clean') {
          // plain text with a soft shadow, no box: a wide soft shadow for contrast, then a tight one for crisp edges
          g.fillStyle = fill;
          g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 24 * u; g.shadowOffsetY = 4 * u; g.fillText(it.txt, 0, 0);
          g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 5 * u; g.shadowOffsetY = 2 * u; g.fillText(it.txt, 0, 0);
          g.shadowColor = 'transparent';
        } else {
          g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 14 * u; g.shadowOffsetY = 3 * u; g.fillStyle = fill; g.fillText(it.txt, 0, 0);
          g.shadowColor = 'transparent';
          if (it.active) { g.fillStyle = st.hl; rr(g, 0, fs * 0.5, it.w, 7 * u, 3 * u); g.fill(); }
        }
        g.restore();
        x += it.w + gap;
      });
    });
    g.restore();
  }

  function sticker(g, text, cx, cy, maxW, fs, bg, fg, u, rot, scale) {
    g.save();
    g.font = font('Bricolage Grotesque', fs); g.textBaseline = 'middle'; g.textAlign = 'center';
    var words = text.split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var tryL = cur ? cur + ' ' + w : w; if (cur && g.measureText(tryL).width > maxW) { lines.push(cur); cur = w; } else cur = tryL; });
    if (cur) lines.push(cur);
    lines = lines.slice(0, 3);
    var lh = fs * 1.12, bw = Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; })) + fs * 1.0, bh = lines.length * lh + fs * 0.6;
    g.translate(cx, cy); g.rotate(rot); g.scale(scale, scale);
    g.fillStyle = INK; rr(g, -bw / 2 + 12 * u, -bh / 2 + 12 * u, bw, bh, 26 * u); g.fill();
    g.fillStyle = bg; rr(g, -bw / 2, -bh / 2, bw, bh, 26 * u); g.fill();
    g.lineWidth = 6 * u; g.strokeStyle = INK; g.stroke();
    g.fillStyle = fg;
    lines.forEach(function (l, i) { g.fillText(l, 0, -bh / 2 + fs * 0.3 + lh * (i + 0.5)); });
    g.restore();
    return bh;
  }
  function inkOn(hex) {  // dark text on light colours, white on dark ones
    var n = parseInt(String(hex || '#ffffff').slice(1), 16), r = n >> 16, gg = n >> 8 & 255, b = n & 255;
    return (0.299 * r + 0.587 * gg + 0.114 * b) > 150 ? INK : '#FFFFFF';
  }
  RS.inkOn = inkOn;

  function drawOverlays(g, W, H, u, plan, t, still) {
    var st = plan.st, D = plan.outDur;
    if (st.hook && t < st.hookSecs) {
      var p = still ? 1 : popIn(t / 0.32), out = st.hookSecs - t < 0.2 ? (st.hookSecs - t) / 0.2 : 1;
      g.save(); g.globalAlpha = RS.clamp(out, 0, 1);
      var hy = st.layout === 'framed' ? H * 0.12 : H * 0.14;
      sticker(g, st.hook, W / 2, hy, W * 0.74, 60 * u, st.hookBg, inkOn(st.hookBg), u, -0.04, Math.max(0.01, p));
      g.restore();
    }
    if (st.part) {
      g.save(); g.font = font('Bricolage Grotesque', 34 * u); g.textBaseline = 'middle';
      var tw = g.measureText(st.part.toUpperCase()).width + 36 * u, px = 44 * u, py = (st.hook && t < st.hookSecs ? H * 0.24 : 60 * u);
      g.translate(px + tw / 2, py); g.rotate(0.05);
      g.fillStyle = INK; rr(g, -tw / 2 + 6 * u, -28 * u, tw, 56 * u, 28 * u); g.fill();
      g.fillStyle = '#FF3D8B'; rr(g, -tw / 2, -34 * u, tw, 56 * u, 28 * u); g.fill(); g.lineWidth = 4 * u; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; g.textAlign = 'center'; g.fillText(st.part.toUpperCase(), 0, -6 * u);
      g.restore();
    }
    if (st.handle && st.handlePos !== 'off') {
      var hdl = st.handle.charAt(0) === '@' ? st.handle : '@' + st.handle;
      g.save(); g.font = font('DM Sans', 34 * u); g.textBaseline = 'middle'; g.globalAlpha = 0.9;
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 10 * u; g.fillStyle = '#FFFFFF';
      var right = st.handlePos === 'tr' || st.handlePos === 'br', bottom = st.handlePos === 'bl' || st.handlePos === 'br';
      g.textAlign = right ? 'right' : 'left';
      g.fillText(hdl, right ? W - 44 * u : 44 * u, bottom ? H - 70 * u : 66 * u);
      g.restore();
    }
    if (st.cta && st.ctaText && D > 5 && D - t < 2.6) {
      var cp = still ? 1 : popIn((2.6 - (D - t)) / 0.35);
      sticker(g, st.ctaText, W / 2, H * 0.88, W * 0.7, 48 * u, '#FF3D8B', INK, u, 0.03, Math.max(0.01, cp));
    }
    if (st.progress && D > 0) {
      var bh = 14 * u;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, H - bh, W, bh);
      g.fillStyle = st.progColor; g.fillRect(0, H - bh, W * RS.clamp(t / D, 0, 1), bh);
    }
  }

  /* ------------------------------------------------------------------ a stand-in picture for style previews (brand kit, templates) */
  var demoSrc = null;
  RS.demoSource = function () {
    if (demoSrc) return demoSrc;
    var c = document.createElement('canvas'); c.width = 640; c.height = 360;
    var g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 640, 360); gr.addColorStop(0, '#8FD3FF'); gr.addColorStop(1, '#FF8FC1');
    g.fillStyle = gr; g.fillRect(0, 0, 640, 360);
    g.fillStyle = 'rgba(255,255,255,.25)'; [[80, 70, 30], [560, 90, 44], [520, 290, 26], [120, 300, 36]].forEach(function (b) { g.beginPath(); g.arc(b[0], b[1], b[2], 0, 7); g.fill(); });
    g.fillStyle = INK; g.fillRect(0, 290, 640, 70);
    g.save(); g.translate(320, 195);
    g.fillStyle = '#7B5CFF'; g.beginPath(); g.ellipse(0, 0, 118, 104, 0, 0, 7); g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    [-38, 38].forEach(function (x) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, -26, 20, 24, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(x + 4, -22, 9, 0, 7); g.fill(); });
    g.fillStyle = INK; g.beginPath(); g.ellipse(0, 32, 30, 18, 0, 0, 7); g.fill();
    g.restore();
    demoSrc = c;
    return c;
  };
  RS.DEMO_WORDS = [[0, 0.4, 'This'], [0.4, 0.7, 'is'], [0.7, 1.0, 'the'], [1.0, 1.5, 'best'], [1.5, 2.2, 'snack'], [2.2, 2.9, 'ever!']];
  /* Draw a still preview of a style into a canvas (no video needed). */
  RS.stylePreview = function (canvas, style, opt) {
    opt = opt || {};
    var st = RS.fullStyle(style), d = RS.dims(st.aspect, '720'), scale = (opt.width || 216) / d[0];
    canvas.width = Math.round(d[0] * scale); canvas.height = Math.round(d[1] * scale);
    var plan = { st: Object.assign({}, st, { punch: false, fadeIn: false, fadeOut: false, hook: opt.hook != null ? opt.hook : st.hook }), segs: [[0, 6]], srcLen: 6, outDur: 6, analysis: null,
      cues: st.captions ? RS.cues(RS.DEMO_WORDS, 0, 6, st.capWords) : [], joins: [] };
    if (!plan.st.handle && opt.handle) plan.st.handle = opt.handle;
    RS.render(canvas.getContext('2d'), canvas.width, canvas.height, RS.demoSource(), plan, 1.6, opt.t != null ? opt.t : 1.4);
  };

  /* ------------------------------------------------------------------ the live preview */
  RS.Player = function (canvas, m, getPlan, onTick) {
    var v = m.el, g = canvas.getContext('2d'), raf = 0, playing = false, dead = false, music = null, self = {};
    v.muted = false;
    function seg(plan, t) {
      for (var i = 0; i < plan.segs.length; i++) if (t < plan.segs[i][1] - 0.03) return i;
      return -1;
    }
    /* the picture-in-picture video (plan.pipSrc) follows reel time: playing along, or parked on the right frame */
    function syncPip(plan, o) {
      var pv = plan.pipSrc; if (!pv || !(pv.duration > 0)) return;
      var target = o % pv.duration;
      if (playing) {
        if (pv.paused) { var pp = pv.play(); if (pp && pp.catch) pp.catch(function () {}); }
        if (Math.abs(pv.currentTime - target) > 0.3) pv.currentTime = target;
      } else {
        if (!pv.paused) pv.pause();
        if (Math.abs(pv.currentTime - target) > 0.05 && !pv.seeking) { pv.currentTime = target; pv.onseeked = function () { if (!playing && !dead) draw(); }; }
      }
    }
    function draw() {
      var plan = getPlan(); if (!plan) return;
      var t = v.currentTime, o = RS.srcToOut(plan, t);
      syncPip(plan, o);
      RS.render(g, canvas.width, canvas.height, v, plan, t, o, Object.assign({ noFade: !playing }, self.opt));
      if (onTick) onTick(o, plan.outDur, playing);
    }
    function loop() {
      if (dead) return;
      var plan = getPlan();
      if (playing && plan) {
        var t = v.currentTime, i = seg(plan, t);
        if (i < 0) { self.pause(); RS.seek(v, plan.segs[0][0]).then(draw); return; }
        if (t < plan.segs[i][0] - 0.05) v.currentTime = plan.segs[i][0];
        if (music) {
          var lvl = plan.st.duck && RS.speakingAt(plan.analysis, t) ? 0.35 : 1;
          music.volume = RS.clamp(plan.st.musicVol * lvl, 0, 1);
        }
      }
      draw();
      if (playing) raf = requestAnimationFrame(loop);
    }
    self.play = function () {
      var plan = getPlan(); if (!plan) return;
      var t = v.currentTime;
      if (t < plan.segs[0][0] - 0.05 || seg(plan, t) < 0) v.currentTime = plan.segs[0][0];
      v.playbackRate = plan.st.speed; v.volume = RS.clamp(plan.st.vol, 0, 1);
      playing = true;
      var p = v.play(); if (p && p.catch) p.catch(function () { playing = false; draw(); });
      if (self.musicFile) {
        if (!music) { music = new Audio(URL.createObjectURL(self.musicFile)); music.loop = true; }
        try { music.currentTime = RS.srcToOut(plan, v.currentTime) % (music.duration || 1e9); } catch (e) {}
        music.play().catch(function () {});
      }
      cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    };
    self.pause = function () { playing = false; v.pause(); if (music) music.pause(); var pl = getPlan(); if (pl && pl.pipSrc) pl.pipSrc.pause(); cancelAnimationFrame(raf); draw(); };
    self.toggle = function () { playing ? self.pause() : self.play(); };
    self.playing = function () { return playing; };
    self.seekOut = function (o) { var plan = getPlan(); if (!plan) return Promise.resolve(); return RS.seek(v, RS.outToSrc(plan, RS.clamp(o, 0, plan.outDur - 0.01))).then(draw); };
    self.seekSrc = function (t) { return RS.seek(v, t).then(draw); };
    self.draw = draw;
    self.opt = {};  // extra render options from the editor: {boxes: [], selected: layerId}
    self.setMusic = function (file) { if (music) { music.pause(); URL.revokeObjectURL(music.src); music = null; } self.musicFile = file || null; };
    self.destroy = function () { dead = true; self.pause(); self.setMusic(null); };
    v.addEventListener('seeked', function () { if (!dead && !playing) draw(); });
    return self;
  };

  /* ------------------------------------------------------------------ export */
  RS.recorderType = function () {
    if (!window.MediaRecorder) return null;
    var list = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return null;
  };
  RS.canExport = function () { return !!(RS.recorderType() && HTMLCanvasElement.prototype.captureStream && window.AudioContext); };
  /* opts: {quality, music (File), onProgress(fraction, canvas), signal: {aborted}} -> Promise of {blob, ext, mime, seconds} */
  RS.exportClip = function (m, plan, opts) {
    opts = opts || {};
    var st = plan.st, mime = RS.recorderType();
    if (!mime) return Promise.reject(new Error('This browser can\'t record video. Try Chrome, Edge or Safari on a computer.'));
    var d = RS.dims(st.aspect, opts.quality || st.quality), W = d[0], H = d[1];
    var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    var g = canvas.getContext('2d');
    var ac, rec, v, music, musicUrl, cleanup = [];
    function finish() { cleanup.forEach(function (f) { try { f(); } catch (e) {} }); }
    var pipV = null;
    return RS.fontsReady().then(function () {
      if (!plan.pipSrc || !plan.pipSrc.src) return null;
      return RS.videoEl(plan.pipSrc.src).then(function (pv) { pipV = pv; pv.muted = true; cleanup.push(function () { pv.pause(); pv.removeAttribute('src'); pv.load(); }); }, function () { return null; });
    }).then(function () {
      plan = Object.assign({}, plan, { pipSrc: pipV });
      if (plan.st.layers.some(function (L) { return L.behind; })) return RS.person.load().catch(function () {});
    }).then(function () { return RS.videoEl(m.url); }).then(function (vid) {
      v = vid; cleanup.push(function () { v.pause(); v.removeAttribute('src'); v.load(); });
      ac = new (window.AudioContext || window.webkitAudioContext)();
      cleanup.push(function () { ac.close(); });
      var dest = ac.createMediaStreamDestination();
      var srcNode = ac.createMediaElementSource(v), vg = ac.createGain();
      vg.gain.value = st.fadeIn ? 0 : st.vol;
      srcNode.connect(vg); vg.connect(dest);
      var mg = null;
      if (opts.music) {
        musicUrl = URL.createObjectURL(opts.music);
        music = new Audio(musicUrl); music.loop = true;
        cleanup.push(function () { music.pause(); URL.revokeObjectURL(musicUrl); });
        var ms = ac.createMediaElementSource(music); mg = ac.createGain(); mg.gain.value = st.musicVol;
        ms.connect(mg); mg.connect(dest);
      }
      var stream = new MediaStream([canvas.captureStream(30).getVideoTracks()[0]].concat(dest.stream.getAudioTracks()));
      var bps = W * H > 1e6 ? 9e6 : 5e6;
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 160000 });
      var chunks = []; rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      v.playbackRate = st.speed; v.muted = false; v.volume = 1;
      var segI = 0, outBase = 0, ended = false;
      return ac.resume().then(function () { return RS.seek(v, plan.segs[0][0]); }).then(function () {
        RS.render(g, W, H, v, plan, v.currentTime, 0);
        return new Promise(function (resolve, reject) {
          rec.onstop = function () { resolve(new Blob(chunks, { type: mime.split(';')[0] })); };
          rec.onerror = function (e) { reject(e.error || new Error('Recording failed.')); };
          rec.start(500);
          var useVFC = 'requestVideoFrameCallback' in v, pending = false, seeking = false;
          function tick() {
            if (ended || seeking) return;
            if (opts.signal && opts.signal.aborted) { ended = true; v.pause(); try { rec.stop(); } catch (e) {} reject(Object.assign(new Error('Export cancelled.'), { cancelled: true })); return; }
            var s = plan.segs[segI], t = v.currentTime;
            var o = outBase + (t - s[0]) / st.speed;
            RS.render(g, W, H, v, plan, t, o);
            if (pipV && pipV.duration > 0) { var pt = o % pipV.duration; if (pipV.paused) pipV.play().catch(function () {}); if (Math.abs(pipV.currentTime - pt) > 0.25) pipV.currentTime = pt; }
            var now = ac.currentTime, toEnd = plan.outDur - o;
            var gainV = st.vol * (st.fadeIn ? RS.clamp(o / 0.3, 0, 1) : 1) * (st.fadeOut ? RS.clamp(toEnd / 0.4, 0, 1) : 1);
            vg.gain.setTargetAtTime(gainV, now, 0.03);
            if (mg) mg.gain.setTargetAtTime(st.musicVol * (st.duck && RS.speakingAt(plan.analysis, t) ? 0.35 : 1) * (st.fadeOut ? RS.clamp(toEnd / 0.6, 0, 1) : 1), now, 0.12);
            if (opts.onProgress) opts.onProgress(RS.clamp(o / plan.outDur, 0, 1), canvas);
            if (t >= s[1] - 0.02 || v.ended) {
              outBase += (s[1] - s[0]) / st.speed;
              segI++;
              if (segI >= plan.segs.length) { ended = true; v.pause(); if (music) music.pause(); RS.render(g, W, H, v, plan, t, plan.outDur - 0.001); setTimeout(function () { rec.stop(); }, 120); return; }
              v.pause(); rec.pause(); seeking = true; if (pipV) pipV.pause();
              RS.seek(v, plan.segs[segI][0]).then(function () {
                RS.render(g, W, H, v, plan, v.currentTime, outBase);
                rec.resume(); seeking = false; return v.play();
              }).then(schedule, reject);
              return;
            }
            schedule();
          }
          function run() { pending = false; tick(); }
          function schedule() { if (ended || pending) return; pending = true; if (useVFC) v.requestVideoFrameCallback(run); else requestAnimationFrame(run); }
          // Hidden tabs get no frame callbacks: keep drawing from a timer so the reel doesn't freeze.
          var guard = setInterval(function () { if (ended) clearInterval(guard); else if (document.hidden) tick(); }, 200);
          cleanup.push(function () { clearInterval(guard); });
          var p = v.play();
          if (music) music.play().catch(function () {});
          (p && p.then ? p : Promise.resolve()).then(schedule, function (e) { ended = true; try { rec.stop(); } catch (x) {} reject(new Error('The video wouldn\'t play for recording: ' + (e && e.message || e))); });
        });
      });
    }).then(function (blob) {
      finish();
      return { blob: blob, mime: mime, ext: /mp4/.test(mime) ? 'mp4' : 'webm', seconds: +plan.outDur.toFixed(1), width: W, height: H };
    }, function (e) { finish(); throw e; });
  };

  /* ------------------------------------------------------------------ .srt timed to the exported reel */
  RS.srt = function (plan, words) {
    var cues = RS.cues(words, plan.clip.start, plan.clip.end, Math.max(plan.st.capWords, 4)), n = 0;
    function ts(s) { s = Math.max(0, s); var ms = Math.round(s * 1000); var h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60;
      return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + ':' + String(se).padStart(2, '0') + ',' + String(ms % 1000).padStart(3, '0'); }
    return cues.map(function (c) {
      var a = RS.srcToOut(plan, c.s), b = RS.srcToOut(plan, c.e);
      if (b - a < 0.05) return '';
      return (++n) + '\n' + ts(a) + ' --> ' + ts(b) + '\n' + c.text + '\n';
    }).filter(Boolean).join('\n');
  };
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['usage', 'Usage', 'trophy'], ['templates', 'Templates', 'palette'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.projects, 'projects', 'usage') + stat(d.clips, 'clips', 'usage') + stat(d.exports, 'reels exported', 'usage') +
          stat(d.templates, 'shared templates', 'templates') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>New feedback goes to Prepsto (prepsto.com). Older messages and requests from the app show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    function usage() {
      return UI.api('admin_usage', 14).then(function (d) {
        var max = Math.max.apply(null, [1].concat(d.per_day.map(function (x) { return x.n; })));
        body.innerHTML = '<div class="ad-stats" style="margin-bottom:18px">' +
          '<div class="ui-card ui-stat"><b>' + d.total + '</b><span>reels in the last 14 days</span></div>' +
          '<div class="ui-card ui-stat"><b>' + d.avg_seconds + 's</b><span>average reel length</span></div>' +
          '<div class="ui-card ui-stat"><b>' + (d.clips ? Math.round(d.captioned / d.clips * 100) : 0) + '%</b><span>of clips have captions</span></div></div>' +
          '<div class="ui-card" style="margin-bottom:18px"><h3>Reels exported per day</h3><div class="ad-bars">' + d.per_day.map(function (x) {
            return '<div class="ad-bar" title="' + esc(x.day + ': ' + x.n) + '"><i style="height:' + Math.round(x.n / max * 100) + '%"></i><span>' + esc(x.day.slice(8)) + '</span></div>'; }).join('') + '</div>' +
          (d.demo_exports ? '<p class="small muted">' + d.demo_exports + ' of all exports are demo data.</p>' : '') + '</div>' +
          '<div class="ui-grid two"><div class="ui-card"><h3>Popular looks</h3>' + (d.looks.length ? d.looks.map(function (l) {
            return '<div class="ui-row between" style="padding:6px 0;border-bottom:1px solid var(--c-line)"><span>' + esc(l[0]) + '</span><b>' + l[1] + '</b></div>'; }).join('') : '<p class="muted">No exports yet.</p>') + '</div>' +
          '<div class="ui-card"><h3>Shapes</h3>' + (d.aspects.length ? d.aspects.map(function (a) {
            return '<div class="ui-row between" style="padding:6px 0;border-bottom:1px solid var(--c-line)"><span>' + esc(a[0]) + '</span><b>' + a[1] + '</b></div>'; }).join('') : '<p class="muted">No exports yet.</p>') + '</div></div>';
      });
    }

    function templates() {
      return UI.api('admin_templates').then(function (d) {
        body.innerHTML = '<p class="muted">Templates people shared to the public gallery. Feature the best ones (they show first); hide anything that shouldn\'t be there.</p>' +
          (d.templates.length ? '<div class="ad-fb">' + d.templates.map(function (t) {
            return '<div class="ui-item" data-tid="' + esc(t.id) + '"><div class="meta"><span style="font-size:1.4rem">' + esc(t.emoji) + '</span><b>' + esc(t.name) + '</b><span>by ' + esc(t.by) + '</span>' +
              (t.owner_email ? '<span>' + esc(t.owner_email) + '</span>' : '') + (t.demo ? '<span class="ui-badge">Demo</span>' : '') + '<span>' + UI.plural(t.uses, 'use') + '</span></div>' +
              '<div class="ui-row"><label class="ui-check"><input type="checkbox" data-feat' + (t.featured ? ' checked' : '') + '> Featured</label>' +
              '<label class="ui-check"><input type="checkbox" data-hide' + (t.hidden ? ' checked' : '') + '> Hidden</label><span class="ui-spacer"></span>' +
              '<button class="ui-btn sm danger" data-del-tpl>' + UI.icon('trash') + 'Delete</button></div></div>'; }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('palette') + '<h3>No templates yet</h3></div>');
      });
    }

    var DRAW = { overview: overview, usage: usage, templates: templates, feedback: feedback, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var dt = e.target.closest('[data-del-tpl]');
      if (dt) {
        UI.confirm({ title: 'Delete this template?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('template_delete', dt.closest('[data-tid]').getAttribute('data-tid')).then(templates);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var tp = e.target.closest('[data-tid]');
      if (tp) {
        var feat = e.target.hasAttribute('data-feat'), box0 = e.target;
        UI.api('admin_template_set', tp.getAttribute('data-tid'), feat ? box0.checked : null, feat ? null : box0.checked)
          .then(function () { UI.toast('Saved', 'ok'); }, function (err) { box0.checked = !box0.checked; UI.toast(err.message, 'error'); });
        return;
      }
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== brand.html ===== */
(function () {
  var esc = UI.esc;
  var CAP = [['clean', '🤍 Clean'], ['pop', '💥 Pop'], ['karaoke', '🎤 Karaoke'], ['boxed', '📦 Boxed'], ['minimal', '🫧 Minimal'], ['neon', '🌙 Neon'], ['comic', '🗯️ Comic']];
  UI.page('brand', { title: 'Brand kit', nav: 'Brand kit', icon: 'palette', order: 30 }, function (view, ctx) {
    var kit, mine = [], dirty = false;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:500px"></div></div>';
    function st() { var s = RS.fullStyle(kit); return s; }
    function chips(k, list) {
      var s = st();
      return '<div class="rs-chips">' + list.map(function (v) { var val = Array.isArray(v) ? v[0] : v, lab = Array.isArray(v) ? v[1] : v;
        return '<button type="button" class="rs-chip' + (String(s[k]) === String(val) ? ' on' : '') + '" data-chip="' + k + '" data-v="' + esc(val) + '">' + esc(lab) + '</button>'; }).join('') + '</div>';
    }
    function color(k, label) { return '<label>' + esc(label) + '<input type="color" data-k="' + k + '" value="' + esc(st()[k]) + '"></label>'; }
    function draw() {
      var s = st();
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Brand kit</div><h1>Your look, every time</h1>' +
        '<p class="muted">Every new clip starts with these. You can still change anything per clip.' + (UI.me ? '' : ' (Saved in this browser until you sign up.)') + '</p></div></div>' +
        '<div class="bk-grid"><div class="bk-form">' +
        '<div class="ui-card"><h3>' + UI.icon('user') + 'You</h3><div class="bk-two"><label class="ui-field"><span>Your handle</span><input type="text" data-k="handle" value="' + esc(kit.handle || '') + '" placeholder="@yourname" maxlength="40"></label>' +
        '<label class="ui-field"><span>Hashtags you always use</span><input type="text" data-k="hashtags" value="' + esc(kit.hashtags || '') + '" placeholder="#cooking #lifehacks" maxlength="200"></label></div>' +
        '<div style="margin-top:12px"><span class="small muted" style="font-weight:700">Handle corner</span>' + chips('handlePos', [['tl', '↖ Top left'], ['tr', '↗ Top right'], ['bl', '↙ Bottom left'], ['br', '↘ Bottom right'], ['off', 'Hide']]) + '</div></div>' +
        '<div class="ui-card"><h3>' + UI.icon('palette') + 'Starting look</h3><div class="bk-looks">' + RS.LOOKS.map(function (l) {
          return '<button type="button" class="ce-look' + (s.look === l.key ? ' on' : '') + '" data-look="' + l.key + '"><canvas data-lcv="' + l.key + '"></canvas>' + l.emoji + ' ' + esc(l.name) + '</button>'; }).join('') + '</div>' +
        '<p class="ui-hint">Or pick one from the <a href="#templates" data-go="templates">community templates</a>.</p>' +
        '<div style="margin-top:12px"><span class="small muted" style="font-weight:700">Colour grade</span>' + chips('grade', RS.GRADES) + '</div></div>' +
        '<div class="ui-card"><h3>' + UI.icon('cc') + 'Captions</h3>' + RS.switchHtml('captions', 'Captions on new clips', s.captions) + chips('capStyle', CAP) +
        '<div class="bk-two" style="margin-top:12px"><label class="ui-field"><span>Font</span><select data-k="capFont">' + RS.FONTS.map(function (f) {
          return '<option' + (s.capFont === f ? ' selected' : '') + ' style="font-family:\'' + f + '\'">' + f + '</option>'; }).join('') + '</select></label>' +
        '<div><span class="small muted" style="font-weight:700">Words at a time</span>' + chips('capWords', [1, 2, 3, 4, 5]) + '</div></div>' +
        '<div class="bk-colors">' + color('hl', 'Highlight') + color('capColor', 'Text') + '</div>' +
        RS.switchHtml('capUpper', 'ALL CAPS', s.capUpper) + RS.switchHtml('capEmoji', 'Auto emoji', s.capEmoji) + '</div>' +
        '<div class="ui-card"><h3>' + UI.icon('type') + 'Stickers & extras</h3><div class="bk-colors">' + color('hookBg', 'Hook sticker') + color('progColor', 'Progress bar') + '</div>' +
        RS.switchHtml('progress', 'Progress bar', s.progress) + RS.switchHtml('cta', 'End card', s.cta, 'A call to action in the last seconds.') +
        '<label class="ui-field"><span>End card text</span><input type="text" data-k="ctaText" value="' + esc(s.ctaText) + '" maxlength="60"></label></div>' +
        '<div class="ui-card"><h3>' + UI.icon('sparkle') + 'Transitions</h3>' +
        '<span class="small muted" style="font-weight:700">Intro</span>' + chips('transIn', RS.TRANS) +
        '<div style="margin-top:10px"><span class="small muted" style="font-weight:700">Between cuts</span>' + chips('transCut', RS.TRANS) + '</div>' +
        '<div style="margin-top:10px"><span class="small muted" style="font-weight:700">Outro</span>' + chips('transOut', RS.TRANS) + '</div></div>' +
        '<div class="ui-card"><h3>' + UI.icon('phone') + 'Shape & export</h3>' + chips('aspect', [['9:16', '9:16 Reels'], ['4:5', '4:5 Feed'], ['1:1', '1:1'], ['16:9', '16:9']]) +
        '<div style="margin-top:10px">' + chips('quality', [['1080', 'Full HD'], ['720', 'Faster 720p']]) + '</div>' +
        RS.switchHtml('cutSilence', 'Cut silences by default', s.cutSilence, 'Snappier reels with the pauses removed.') + RS.switchHtml('punch', 'Punch-in zoom on loud moments', s.punch) + '</div>' +
        '<div class="bk-save"><button class="ui-btn ghost" data-reset>Reset</button><button class="ui-btn primary" data-save>' + UI.icon('check') + 'Save brand kit</button></div>' +
        (UI.me ? '<div class="ui-card"><h3>' + UI.icon('share') + 'Templates you shared</h3>' + (mine.length ? '<div class="bk-tpls">' + mine.map(function (t) {
          return '<div class="bk-tpl" data-id="' + esc(t.id) + '"><span style="font-size:1.6rem">' + esc(t.emoji) + '</span><div class="grow"><b>' + esc(t.name) + '</b><div class="small muted">' + UI.plural(t.uses, 'use') +
            (t.hidden ? ' · hidden by an admin' : '') + (t.featured ? ' · ⭐ featured' : '') + '</div></div><button class="ui-btn sm danger" data-del-tpl>' + UI.icon('trash') + 'Delete</button></div>'; }).join('') + '</div>'
          : '<p class="muted">None yet. In the clip editor, open <b>Look → Share this look</b> to add yours to the gallery.</p>') + '</div>' : '') +
        '</div><div class="bk-prev"><div class="phone"><canvas data-prev></canvas></div><p class="small muted" style="margin-top:14px">Preview with a stand-in video</p></div></div></div>';
      view.querySelectorAll('[data-lcv]').forEach(function (cv) {
        var l = RS.lookByKey(cv.getAttribute('data-lcv'));
        RS.stylePreview(cv, RS.applyLook(Object.assign({}, st(), { aspect: '9:16' }), l.style, l.key), { width: 120, hook: '' });
      });
      preview();
    }
    function preview() {
      var cv = view.querySelector('[data-prev]'); if (!cv) return;
      RS.stylePreview(cv, Object.assign(st(), { hook: 'Your hook goes here 👀' }), { width: 300, t: 1.4 });
    }
    function setK(k, v, redraw) { kit[k] = v; dirty = true; if (redraw) draw(); else preview(); }
    view.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-chip]'))) { var k = b.getAttribute('data-chip'), v = b.getAttribute('data-v'); setK(k, k === 'capWords' ? +v : v, true); return; }
      if ((b = e.target.closest('[data-look]'))) {
        var l = RS.lookByKey(b.getAttribute('data-look')), merged = RS.applyLook(st(), l.style, l.key);
        RS.LOOK_KEYS.concat(['look']).forEach(function (k) { if (merged[k] !== undefined) kit[k] = merged[k]; });
        dirty = true; draw(); return;
      }
      if (e.target.closest('[data-save]')) {
        UI.busy(e.target.closest('[data-save]'), RS.db.saveBrand(kit)).then(function (k) { kit = Object.assign({}, k); RS.kit = kit; dirty = false; UI.toast('Brand kit saved. New clips will use it.', 'ok'); });
        return;
      }
      if (e.target.closest('[data-reset]')) {
        UI.confirm({ title: 'Reset your brand kit?', text: 'Back to Reelstuber\'s default look. Clips you already made keep theirs.', ok: 'Reset' }).then(function (yes) {
          if (yes) { kit = {}; RS.db.saveBrand({}).then(function () { RS.kit = {}; draw(); UI.toast('Reset', 'ok'); }); }
        });
        return;
      }
      if ((b = e.target.closest('[data-del-tpl]'))) {
        var id = b.closest('[data-id]').getAttribute('data-id');
        UI.confirm({ title: 'Delete this template?', text: 'It leaves the gallery. Clips that used it keep their look.', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('template_delete', id).then(function () { mine = mine.filter(function (t) { return t.id !== id; }); draw(); });
        });
      }
    });
    view.addEventListener('input', function (e) {
      var t = e.target, k = t.getAttribute('data-k'); if (!k) return;
      if (t.type === 'color') setK(k, t.value.toUpperCase());
      else if (t.type === 'text' || t.tagName === 'SELECT') setK(k, t.value);
    });
    view.addEventListener('change', function (e) {
      var t = e.target, k = t.getAttribute('data-k');
      if (k && t.type === 'checkbox') setK(k, t.checked);
    });
    function leave(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', leave);
    var ready = RS.fontsReady().then(function () { return RS.db.brand(); }).then(function (r) { kit = Object.assign({}, r.kit || {}); RS.kit = Object.assign({}, kit); mine = r.templates || []; draw(); });
    return { ready: ready, destroy: function () {
      window.removeEventListener('beforeunload', leave);
      if (dirty) RS.db.saveBrand(kit).then(function (k) { RS.kit = k; UI.toast('Brand kit saved', 'ok'); }).catch(function () {});
    } };
  });
})();

/* ===== clip.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['look', 'Look', 'palette'], ['captions', 'Captions', 'cc'], ['text', 'Text', 'type'], ['stickers', 'Stickers', 'smile'], ['fx', 'FX', 'sparkle'],
    ['sound', 'Sound', 'music'], ['post', 'Post', 'share']];
  var SHAPE_COLOR = { arrow: '#FF3D8B', ring: '#FF3B3B', underline: '#FFE14D', sparkles: '#FFE14D', heart: '#FF3D8B', star: '#FFE14D' };
  var CAP_STYLES = [['clean', '🤍 Clean'], ['pop', '💥 Pop'], ['karaoke', '🎤 Karaoke'], ['boxed', '📦 Boxed'], ['minimal', '🫧 Minimal'], ['neon', '🌙 Neon'], ['comic', '🗯️ Comic']];
  var FONTS = RS.FONTS;
  RS.musicFiles = RS.musicFiles || {};
  RS.pipFiles = RS.pipFiles || {};  // clip id -> {file, url, el}: the picture-in-picture video, kept on this device only
  var lastTab = 'look';

  UI.page('clip', { title: 'Edit reel' }, function (view, ctx) {
    var pid = ctx.args[0], cid = ctx.args[1];
    var P, C, st, M, A, plan, player, tab = lastTab, dead = false, postSeed = 0, exporting = false, selId = null, boxes = [], wallFrames = null;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:56px;margin-bottom:16px"></div><div class="ui-skel" style="height:520px"></div></div>';
    function words() { return P.transcript && P.transcript.words || []; }
    function replan() {
      plan = RS.plan(C, words(), A);
      plan.pipSrc = st.layout === 'pip' ? pipVid() : null;
      plan.wall = st.wall ? wallFrames : null;
      // layers pinned to a word: keep their start in step with where that word now lands in the reel
      (st.layers || []).forEach(function (L) {
        if (L.at == null || L.all) return;
        var sp = RS.layerSpan(L, plan); if (sp[0] < 0) return;
        var len = Math.max(0.3, L.e - L.s); L.s = +sp[0].toFixed(2); L.e = +(sp[0] + len).toFixed(2);
      });
    }
    function pipVid() { var x = RS.pipFiles[C.id]; return x ? x.el : null; }
    function setPipFile(f) {
      var old = RS.pipFiles[C.id];
      if (old) { try { old.el.pause(); old.el.removeAttribute('src'); old.el.load(); } catch (e) {} URL.revokeObjectURL(old.url); delete RS.pipFiles[C.id]; }
      if (!f) { set('pipName', '', true); return Promise.resolve(); }
      var url = URL.createObjectURL(f);
      return RS.videoEl(url).then(function (v) {
        v.muted = true; v.loop = true; RS.pipFiles[C.id] = { file: f, url: url, el: v };
        set('pipName', f.name.slice(0, 80), true);
      }, function (e) { URL.revokeObjectURL(url); UI.toast(e.message, 'error'); });
    }
    function loadWall() {
      if (!st.wall || !M) return;
      var D = P.duration, times = P.clips.filter(function (c) { return c.id !== C.id; }).map(function (c) { return (c.start + c.end) / 2; }).slice(0, 8);
      for (var k = 0; k < 16 && times.length < 8; k++) { var t = D * (k + 0.5) / 16; if (t < C.start || t > C.end) times.push(t); }
      while (times.length < 8) times.push(D * times.length / 8);
      RS.wallFrames(M, times).then(function (fr) { if (dead) return; wallFrames = fr; replan(); if (player) player.draw(); },
        function (e) { UI.toast('Couldn\'t read pictures for the wall: ' + e.message, 'error'); });
    }
    function needPerson(say) {
      if (RS.person.ready || !(st.layers || []).some(function (L) { return L.behind; })) return;
      if (say) UI.toast('🧍 Loading the person cut-out (first time only)…');
      RS.person.load().then(function () { if (!dead && player) player.draw(); if (say) UI.toast('Text now goes behind you ✓', 'ok'); }, function (e) { UI.toast(e.message, 'error'); });
    }
    function setSaved(t) { var el = view.querySelector('[data-saved]'); if (el) el.textContent = t; }
    var saveSoon = RS.debounce(function () {
      setSaved('Saving…');
      RS.db.saveClip(C.id, { title: C.title, start: C.start, end: C.end, style: st, post: C.post || {} }).then(function (nc) {
        C.status = nc.status; C.edited = true; setSaved('Saved ✓');
      }, function (e) { setSaved('Not saved'); UI.toast(e.message, 'error'); });
    }, 700);
    var saveWordsSoon = RS.debounce(function () { RS.db.updateProject(pid, { transcript: P.transcript }).catch(function (e) { UI.toast(e.message, 'error'); }); }, 900);
    function set(k, v, redraw) {
      st[k] = v; C.style = st; replan();
      if (player) player.draw();
      if (redraw) drawPanel();
      saveSoon();
    }

    /* ---------- text + stickers (st.layers) */
    function layerById(id) { return (st.layers || []).filter(function (L) { return L.id === id; })[0] || null; }
    function selLayer() { return selId ? layerById(selId) : null; }
    function tabFor(L) { return L.t === 'text' || L.t === 'card' ? 'text' : 'stickers'; }
    function layerLabel(L) {
      return L.t === 'shape' ? (RS.SHAPES.filter(function (x) { return x[0] === L.v; })[0] || ['', L.v])[1] : L.t === 'badge' ? '🏷️ ' + L.v : L.t === 'emoji' ? L.v :
        L.t === 'card' ? ({ label: '🏷️ ', repo: '📦 ', prompt: '⌨️ ' }[L.card] || '🪪 ') + L.v : '✏️ ' + String(L.v).replace(/\n/g, ' ');
    }
    function pinLayer(L, at, word) {
      var len = Math.max(0.3, (L.e - L.s) || 2), s0 = RS.srcToOut(plan, at);
      L.at = +(+at).toFixed(3); L.word = String(word || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').slice(0, 40); L.all = false;
      L.s = +s0.toFixed(2); L.e = +(s0 + len).toFixed(2);
    }
    function nowOut() { return M && plan ? RS.srcToOut(plan, M.el.currentTime) : 0; }
    function select(id) {
      selId = id; if (player) { player.opt.selected = id; player.draw(); }
      var L = selLayer();
      if (L && tabFor(L) !== tab) showTab(tabFor(L)); else drawPanel();
    }
    function layersChanged(redraw) { set('layers', st.layers, redraw); }
    /* pin = {at, word, len}: pin the new layer to a word. Returns false when the reel is full. */
    function placeLayer(L, pin) {
      st.layers = (st.layers || []).slice();
      if (st.layers.length >= 24) { UI.toast('That\'s the most text and stickers one reel can hold (24).', 'error'); return false; }
      var D = plan.outDur, len = Math.min(pin && pin.len || 3, D), t0 = RS.clamp(nowOut(), 0, Math.max(0, D - len));
      L.s = +t0.toFixed(2); L.e = +(t0 + len).toFixed(2);
      if (!L.behind && L.t !== 'card') {
        var n = st.layers.filter(function (x) { return x.t === L.t; }).length;
        L.y = RS.clamp(L.y + (n % 4) * 0.07, 0.08, 0.92); L.x = RS.clamp(L.x + ((n % 3) - 1) * 0.08 * (n ? 1 : 0), 0.1, 0.9);
      }
      if (pin) pinLayer(L, pin.at, pin.word);
      st.layers.push(L);
      return true;
    }
    function addLayer(L, pin) {
      if (!placeLayer(L, pin)) return;
      if (player) player.pause();
      layersChanged(false); select(L.id);
      if (L.behind) needPerson(true);
      if (pin && player) player.seekOut(Math.max(0, L.s - 0.4));
    }
    /* A ready-made layer for a word (the Captions word picker and the Storyboard). */
    function layerFor(kind, word, at, line) {
      var w = String(word || '').replace(/[.,!?;:"“”()]+/g, ''), em = RS.emojiFor(word) || '✨', cap = w.charAt(0).toUpperCase() + w.slice(1);
      if (kind === 'emoji') return { L: RS.newLayer('emoji', em, { y: 0.36 }), len: 1.6 };
      if (kind === 'title') return { L: RS.newLayer('text', w, { size: 1.4, rot: -4 }), len: 1.6 };
      if (kind === 'behind') return { L: RS.newLayer('text', line || w, { ts: 'plain', font: 'Anton', size: line ? 1.5 : 2.2, y: 0.2, rot: 0, behind: true, anim: 'zoom' }), len: 2.4 };
      if (kind === 'label') return { L: RS.newLayer('card', cap, { card: 'label', icon: em === '✨' ? '🧰' : em, fill: '#22C55E', upper: false }), len: 2.2 };
      if (kind === 'repo') return { L: RS.newLayer('card', w.toLowerCase() + '/' + w.toLowerCase(), { card: 'repo', sub: 'What ' + cap + ' does, in one line', icon: '📦', fill: '#2F81F7', upper: false }), len: 2.6 };
      if (kind === 'prompt') return { L: RS.newLayer('card', String(line || w).replace(/\s+/g, ' ').slice(0, 120), { card: 'prompt', anim: 'type', fill: '#D97757', upper: false }), len: 3.6 };
      return { L: RS.newLayer('badge', w.toUpperCase().slice(0, 24), { shape: 'burst', fill: '#FFE14D', rot: -6 }), len: 1.6 };
    }
    function lineAt(at) { var c = RS.cues(words(), C.start, C.end, 12).filter(function (x) { return at >= x.s - 0.01 && at < x.e; })[0]; return c ? c.text : ''; }
    function wordPopModal(at, word) {
      var w = String(word).replace(/[.,!?;:"“”()]+/g, ''), em = RS.emojiFor(word) || '✨';
      var opts = [['emoji', em + ' Emoji sticker'], ['title', '✏️ “' + w + '” as a title'], ['behind', '🧍 Title behind you'], ['label', '🏷️ Tool label'],
        ['repo', '📦 Repo card'], ['prompt', '⌨️ Prompt bar (this line)'], ['badge', '💥 Word sticker']];
      var m = UI.modal('<h2>On “' + esc(w) + '”</h2><p class="muted">Pops in the moment you say it, and follows the word if you trim the clip.</p><div class="ce-pop-opts">' +
        opts.map(function (o) { return '<button type="button" class="ui-btn" data-p="' + o[0] + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>' +
        '<div class="ui-row end" style="margin-top:14px"><button type="button" class="ui-btn ghost" data-close>Cancel</button></div>');
      m.el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-p]'); if (!b) return;
        var k = b.getAttribute('data-p'), made = layerFor(k, w, at, k === 'prompt' ? lineAt(at) : '');
        m.close(); addLayer(made.L, { at: at, word: w, len: made.len });
      });
    }
    function setLayer(k, v, redraw) {
      var L = selLayer(); if (!L) return;
      if (k === 'len') L.e = +(L.s + v).toFixed(2);
      else if (k === 's') { var len = L.e - L.s; L.s = v; L.e = +(v + len).toFixed(2); delete L.at; delete L.word; }
      else L[k] = v;
      layersChanged(redraw);
    }
    function deleteLayer() {
      if (!selId) return;
      st.layers = st.layers.filter(function (L) { return L.id !== selId; });
      selId = null; if (player) player.opt.selected = null;
      layersChanged(true); UI.toast('Removed');
    }
    function lchips(k, list, cur) {
      return '<div class="rs-chips">' + list.map(function (v) {
        return '<button type="button" class="rs-chip' + (String(cur) === String(v[0]) ? ' on' : '') + '" data-lchip="' + k + '" data-v="' + esc(v[0]) + '">' + esc(v[1]) + '</button>'; }).join('') + '</div>';
    }
    function lrange(k, label, v, min, max, step, show) {
      return '<label class="rs-range"><span>' + esc(label) + '<b data-lshow="' + k + '">' + esc(show(v)) + '</b></span><input type="range" data-lk="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '"></label>';
    }
    var LSHOW = { size: function (v) { return Math.round(v * 100) + '%'; }, rot: function (v) { return Math.round(v) + '°'; },
      s: function (v) { return (+v).toFixed(1) + 's'; }, len: function (v) { return (+v).toFixed(1) + 's'; } };
    function layerList(type) {
      var list = (st.layers || []).filter(function (L) { var tx = L.t === 'text' || L.t === 'card'; return type === 'text' ? tx : !tx; });
      if (!list.length) return '';
      return '<div class="ce-sec"><h4>On this reel (' + list.length + ')</h4><div class="ce-layers">' + list.map(function (L) {
        return '<button type="button" class="ce-lrow' + (L.id === selId ? ' on' : '') + '" data-sel="' + esc(L.id) + '"><span>' + esc(layerLabel(L)) + '</span><small>' +
          (L.behind ? '🧍 ' : '') + (L.all ? 'whole reel' : L.at != null && L.word ? '📌 “' + esc(L.word) + '”' : (+L.s).toFixed(1) + '–' + (+L.e).toFixed(1) + 's') + '</small></button>'; }).join('') + '</div></div>';
    }
    function layerEditor(L) {
      var D = Math.max(1, plan.outDur), isText = L.t === 'text', h = '';
      var head = isText ? '✏️ Edit text' : L.t === 'emoji' ? L.v + ' Edit sticker' : L.t === 'badge' ? '🏷️ Edit word sticker' : L.t === 'card' ? '🪪 Edit card' : '🖍️ Edit doodle';
      h += '<div class="ui-card ce-led ce-sec" data-led><div class="ce-led-head"><b>' + esc(head) + '</b>' +
        '<button type="button" class="ui-btn sm icon" data-ldup title="Duplicate" aria-label="Duplicate">' + UI.icon('copy') + '</button>' +
        '<button type="button" class="ui-btn sm danger icon" data-ldel title="Delete" aria-label="Delete">' + UI.icon('trash') + '</button>' +
        '<button type="button" class="ui-btn sm" data-ldone>' + UI.icon('check') + 'Done</button></div>';
      if (isText) {
        var tsName = { outline: 'Outline', double: 'Outer outline', pop3d: '3D side', hollow: 'Outline', glow: 'Glow', sticker: 'Box', marker: 'Highlighter', plain: 'Shadow', magazine: '' }[L.ts] || 'Outline';
        h += '<label class="ui-field"><span>Text</span><textarea data-lk="v" maxlength="120" rows="2">' + esc(L.v) + '</textarea></label>' +
          '<div><span class="ce-sub">Font</span><div class="ce-fonts">' + FONTS.map(function (f) {
            return '<button type="button" class="ce-font' + (L.font === f ? ' on' : '') + '" data-lchip="font" data-v="' + esc(f) + '" style="font-family:\'' + f + '\'">' + esc(f) + '</button>'; }).join('') + '</div></div>' +
          '<div><span class="ce-sub">Outline style</span>' + lchips('ts', RS.TEXT_STYLES.map(function (x) { return [x.key, x.name]; }), L.ts) + '</div>' +
          '<div class="ce-colors">' + (L.ts === 'hollow' ? '' : '<label>Fill<input type="color" data-lk="fill" value="' + esc(L.fill) + '"></label>') +
          (L.ts === 'plain' || L.ts === 'magazine' ? '' : '<label>' + tsName + '<input type="color" data-lk="line" value="' + esc(L.line) + '"></label>') + '</div>' +
          (L.ts === 'magazine' ? '<label class="ui-field"><span>Issue line (above the title)</span><input type="text" data-lk="sub" maxlength="60" value="' + esc(L.sub || '') + '" placeholder="No. 01 · November 2026 · The reel issue"></label>' : '') +
          '<label class="rs-switch"><span>ALL CAPS</span><input type="checkbox" data-lk="upper"' + (L.upper ? ' checked' : '') + '></label>';
      } else if (L.t === 'card') {
        var ck = L.card || 'label';
        h += '<div><span class="ce-sub">Kind</span>' + lchips('card', RS.CARDS.map(function (x) { return [x.key, x.name]; }), ck) + '</div>' +
          '<label class="ui-field"><span>' + (ck === 'prompt' ? 'Prompt text' : ck === 'repo' ? 'Repo name' : 'Name') + '</span>' +
          (ck === 'prompt' ? '<textarea data-lk="v" maxlength="120" rows="2">' + esc(L.v) + '</textarea>' : '<input type="text" data-lk="v" maxlength="60" value="' + esc(L.v) + '">') + '</label>' +
          (ck !== 'label' ? '<label class="ui-field"><span>' + (ck === 'repo' ? 'Description' : 'Small label above (optional)') + '</span><input type="text" data-lk="sub" maxlength="120" value="' + esc(L.sub || '') + '" placeholder="' + (ck === 'repo' ? 'What it does' : 'To Claude') + '"></label>' : '') +
          '<div class="ce-two">' + (ck !== 'prompt' ? '<label class="ui-field"><span>Icon (an emoji)</span><input type="text" data-lk="icon" maxlength="8" value="' + esc(L.icon || '') + '"></label>' : '') +
          '<div class="ce-colors"><label>Accent<input type="color" data-lk="fill" value="' + esc(L.fill) + '"></label></div></div>' +
          (ck === 'prompt' ? '<p class="ui-hint" style="margin:0">Pick the <b>⌨️ Type</b> entrance below and it types itself out.</p>' : '');
      } else if (L.t === 'badge') {
        h += '<label class="ui-field"><span>Words</span><input type="text" data-lk="v" maxlength="24" value="' + esc(L.v) + '"></label>' +
          '<div><span class="ce-sub">Shape</span>' + lchips('shape', [['burst', '💥 Burst'], ['pill', '💊 Pill'], ['bubble', '💬 Bubble'], ['circle', '⭕ Circle']], L.shape) + '</div>' +
          '<div class="ce-colors"><label>Colour<input type="color" data-lk="fill" value="' + esc(L.fill) + '"></label></div>';
      } else if (L.t === 'shape') {
        h += '<div><span class="ce-sub">Doodle</span>' + lchips('v', RS.SHAPES, L.v) + '</div>' +
          '<div class="ce-colors"><label>Colour<input type="color" data-lk="fill" value="' + esc(L.fill) + '"></label></div>';
      }
      h += '<div class="ce-two">' + lrange('size', 'Size', L.size, 0.3, 3, 0.05, LSHOW.size) + lrange('rot', 'Turn', L.rot, -180, 180, 1, LSHOW.rot) + '</div>' +
        '<div><span class="ce-sub">Comes in with</span>' + lchips('anim', RS.ANIMS.filter(function (a) { return isText || a[0] !== 'type'; }), L.anim) + '</div>' +
        '<div><span class="ce-sub">While on screen</span>' + lchips('loop', RS.LOOPS, L.loop) + '</div>' +
        '<label class="rs-switch"><span>🧍 Behind the person<small>Cuts the person out of the picture so this sits behind them. Works best with one person in the shot.' +
          (L.behind && RS.person.failed ? ' The cut-out didn\'t load: check your connection.' : '') + '</small></span><input type="checkbox" data-lk="behind"' + (L.behind ? ' checked' : '') + '></label>' +
        '<div><label class="rs-switch"><span>Show for the whole reel</span><input type="checkbox" data-lk="all"' + (L.all ? ' checked' : '') + '></label>' +
        (L.all ? '' : '<div class="ce-two">' + lrange('s', 'Starts at', Math.min(L.s, D), 0, +(D - 0.3).toFixed(1), 0.1, LSHOW.s) +
          lrange('len', 'Stays for', RS.clamp(L.e - L.s, 0.3, D), 0.3, +D.toFixed(1), 0.1, LSHOW.len) + '</div>' +
          '<div class="ui-row" style="margin-top:8px"><button type="button" class="ui-btn sm" data-lhere>' + UI.icon('timer') + 'Start at the playhead</button></div>') + '</div>' +
        pinHtml(L) +
        '<p class="ui-hint" style="margin:0">Drag it on the preview to move it. Drag the ↻ handle to resize and turn.</p></div>';
      return h;
    }
    function pinHtml(L) {
      var ws = RS.wordsIn(words(), C.start, C.end);
      if (!ws.length || L.all) return '';
      return '<div><span class="ce-sub">Pin to a word</span><div class="ce-words">' + ws.slice(0, 200).map(function (w) {
        var on = L.at != null && Math.abs(w[0] - L.at) < 0.005;
        return '<button type="button" class="ce-word' + (on ? ' on' : '') + '" data-lword="' + w[0] + '" data-wtext="' + esc(w[2]) + '">' + esc(w[2]) + '</button>'; }).join('') + '</div>' +
        '<p class="ui-hint" style="margin:6px 0 0">' + (L.at != null ? '📌 Pops in on “' + esc(L.word || '') + '” and follows that word if you trim the clip. <button type="button" class="ui-btn sm ghost" data-lunpin>Unpin</button>'
          : 'Tap a word and it pops in exactly when it\'s said.') + '</p></div>';
    }

    /* ---------- layout */
    function draw() {
      var idx = P.clips.indexOf(C), prev = P.clips[idx - 1], next = P.clips[idx + 1];
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="ce-head"><a class="ui-btn sm ghost" href="#project/' + esc(pid) + '" data-go="project/' + esc(pid) + '">' + UI.icon('back') + 'Project</a>' +
        '<div class="grow"><input class="ce-title" data-title value="' + esc(C.title) + '" maxlength="100" aria-label="Clip name"></div>' +
        '<span class="ce-saved" data-saved></span>' +
        '<span class="ce-nav">' + (prev ? '<a class="ui-btn sm icon" title="Previous clip" href="#clip/' + esc(pid) + '/' + esc(prev.id) + '" data-go="clip/' + esc(pid) + '/' + esc(prev.id) + '">' + UI.icon('back') + '</a> ' : '') +
        '<span class="ui-badge">' + (idx + 1) + ' / ' + P.clips.length + '</span>' +
        (next ? ' <a class="ui-btn sm icon" title="Next clip" href="#clip/' + esc(pid) + '/' + esc(next.id) + '" data-go="clip/' + esc(pid) + '/' + esc(next.id) + '">' + UI.icon('arrow') + '</a>' : '') + '</span>' +
        '<button class="ui-btn" data-board title="Storyboard: every line and what\'s on screen">' + UI.icon('list') + '<span class="ce-hide-sm">Storyboard</span></button>' +
        '<button class="ui-btn primary" data-export' + (M ? '' : ' disabled') + '>' + UI.icon('download') + 'Export</button></div>' +
        '<div class="ce-grid"><div class="ce-left">' +
        (M ? '<div class="ce-phone"><canvas data-cv></canvas><span class="ce-hint" data-hint>Drag to reframe · tap text to edit</span></div>' +
          '<div class="ce-trans"><button class="ui-btn icon" data-pp aria-label="Play or pause">' + UI.icon('play') + '</button>' +
          '<input type="range" data-scrub min="0" max="1000" value="0" aria-label="Position"><span class="t" data-t>0:00 / 0:00</span></div>' +
          '<div class="ui-card ce-trim"><canvas data-trim></canvas><div class="row">' +
          '<span class="nudge">Start <button class="ui-btn sm icon" data-nudge="s,-0.25">‹</button><b data-sv>' + RS.fmt(C.start, true) + '</b><button class="ui-btn sm icon" data-nudge="s,0.25">›</button></span>' +
          '<span class="ui-badge lime" data-len></span>' +
          '<span class="nudge">End <button class="ui-btn sm icon" data-nudge="e,-0.25">‹</button><b data-ev>' + RS.fmt(C.end, true) + '</b><button class="ui-btn sm icon" data-nudge="e,0.25">›</button></span></div></div>'
          : '<div class="ui-card"><h3>📼 Video needed</h3><p class="muted">This clip\'s video isn\'t on this device. Open the project and choose the file again to preview and export.</p>' +
            '<a class="ui-btn primary" href="#project/' + esc(pid) + '" data-go="project/' + esc(pid) + '">Open the project</a></div>') +
        '</div><div><nav class="ui-tabs ce-tabs">' + TABS.map(function (t) {
          return '<button type="button" data-tab="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</button>'; }).join('') + '</nav>' +
        '<div class="ce-panel" data-panel></div></div></div></div>';
      drawPanel();
      if (M) mountPlayer();
    }

    /* ---------- the panels */
    function chips(k, list, fmt) {
      return '<div class="rs-chips">' + list.map(function (v) {
        var val = Array.isArray(v) ? v[0] : v, label = Array.isArray(v) ? v[1] : (fmt ? fmt(v) : v);
        return '<button type="button" class="rs-chip' + (String(st[k]) === String(val) ? ' on' : '') + '" data-chip="' + k + '" data-v="' + esc(val) + '">' + esc(label) + '</button>';
      }).join('') + '</div>';
    }
    function color(k, label) { return '<label>' + esc(label) + '<input type="color" data-k="' + k + '" value="' + esc(st[k]) + '"></label>'; }
    function field(k, label, ph, max) { return '<label class="ui-field"><span>' + esc(label) + '</span><input type="text" data-k="' + k + '" value="' + esc(st[k] || '') + '" placeholder="' + esc(ph || '') + '" maxlength="' + (max || 60) + '"></label>'; }
    var pct = function (v) { return Math.round(v * 100) + '%'; }, times = function (v) { return (+v).toFixed(2).replace(/0$/, '') + '×'; };
    var PANELS = {
      look: function () {
        return '<div class="ce-sec"><h4>Looks</h4><div class="ce-looks">' + RS.LOOKS.map(function (l) {
          return '<button type="button" class="ce-look' + (st.look === l.key ? ' on' : '') + '" data-look="' + l.key + '"><canvas data-look-cv="' + l.key + '"></canvas>' + l.emoji + ' ' + esc(l.name) + '</button>'; }).join('') + '</div>' +
          '<div class="ui-row" style="margin-top:12px"><button class="ui-btn sm" data-templates>' + UI.icon('grid') + 'Community templates</button>' +
          (UI.me ? '<button class="ui-btn sm" data-share-tpl>' + UI.icon('share') + 'Share this look</button>' : '') + '</div></div>' +
          '<div class="ce-sec"><h4>Shape</h4>' + chips('aspect', [['9:16', '9:16 Reels · TikTok · Shorts'], ['4:5', '4:5 Feed'], ['1:1', '1:1 Square'], ['16:9', '16:9 Wide']]) + '</div>' +
          '<div class="ce-sec"><h4>Layout</h4><div class="ce-layouts">' + [['fill', 'Fill'], ['fit', 'Fit + blur'], ['framed', 'Framed'], ['split', 'Split'], ['pip', 'Corner card']].map(function (l) {
            return '<button type="button" class="ce-layout' + (st.layout === l[0] ? ' on' : '') + '" data-layout data-v="' + l[0] + '"><i></i>' + l[1] + '</button>'; }).join('') + '</div></div>' +
          '<div class="ce-sec"><h4>' + (st.layout === 'split' ? 'Top half' : 'Framing') + '</h4><div class="ce-two">' +
          RS.rangeHtml('zoom', 'Zoom', st.zoom, 1, 3, 0.01, times) + RS.rangeHtml('fx', 'Left ↔ right', st.fx, 0, 1, 0.01, pct) + RS.rangeHtml('fy', 'Up ↕ down', st.fy, 0, 1, 0.01, pct) +
          (st.layout === 'split' ? RS.rangeHtml('split', 'Top size', st.split, 0.3, 0.7, 0.01, pct) : '') + '</div>' +
          '<p class="ui-hint">Tip: drag the preview to move the picture, scroll or pinch to zoom.</p></div>' +
          (st.layout === 'split' ? '<div class="ce-sec"><h4>Bottom half</h4><div class="ce-two">' + RS.rangeHtml('zoom2', 'Zoom', st.zoom2, 1, 3, 0.01, times) +
            RS.rangeHtml('fx2', 'Left ↔ right', st.fx2, 0, 1, 0.01, pct) + RS.rangeHtml('fy2', 'Up ↕ down', st.fy2, 0, 1, 0.01, pct) + '</div></div>' : '') +
          (st.layout === 'framed' ? '<div class="ce-sec"><h4>Background</h4><div class="ce-colors">' + color('bg', 'Colour') + '</div></div>' : '') +
          (st.layout === 'pip' ? '<div class="ce-sec"><h4>Corner card</h4>' + chips('pipPos', [['tl', '↖ Top left'], ['tr', '↗ Top right'], ['bl', '↙ Bottom left'], ['br', '↘ Bottom right']]) +
            '<div class="ce-two" style="margin-top:10px">' + RS.rangeHtml('pipSize', 'Card size', st.pipSize, 0.25, 0.6, 0.01, pct) + RS.rangeHtml('zoom2', 'Zoom', st.zoom2, 1, 3, 0.01, times) +
            RS.rangeHtml('fx2', 'Left ↔ right', st.fx2, 0, 1, 0.01, pct) + RS.rangeHtml('fy2', 'Up ↕ down', st.fy2, 0, 1, 0.01, pct) + '</div>' +
            '<div class="ui-row" style="margin-top:10px"><label class="ui-btn sm">' + UI.icon('film') + (pipVid() ? 'Change the card video' : 'Use another video') + '<input type="file" accept="video/*" data-pipfile hidden></label>' +
            (pipVid() ? '<span class="ui-badge lime">🎞️ ' + esc(st.pipName.slice(0, 36)) + '</span><button type="button" class="ui-btn sm ghost" data-pip-x>' + UI.icon('x') + 'Back to this video</button>'
              : st.pipName ? '<span class="small muted">Last time: ' + esc(st.pipName) + ' (choose it again)</span>' : '') + '</div>' +
            '<p class="ui-hint">The card shows a second crop of this video (great for a face cam), or another video from this device, like the clip you\'re reacting to. It plays muted and stays on this device.</p></div>' : '') +
          '<div class="ce-sec"><h4>Colour</h4><div class="ce-grades">' + RS.GRADES.map(function (gr) {
            return '<button type="button" class="ce-grade' + (st.grade === gr[0] ? ' on' : '') + '" data-grade="' + gr[0] + '"><canvas data-grade-cv="' + gr[0] + '"></canvas>' + esc(gr[1]) + '</button>'; }).join('') + '</div>' +
            (st.grade !== 'none' ? '<div style="margin-top:12px">' + RS.rangeHtml('gradeAmt', 'Strength', st.gradeAmt, 0.1, 1, 0.05, pct) +
              RS.switchHtml('gradeWipe', 'Before / after slider', st.gradeWipe, 'A slider sweeps across in the first 2 seconds to show off the change.') + '</div>' : '') + '</div>' +
          '<div class="ce-sec">' + RS.switchHtml('punch', 'Punch-in zoom', st.punch, 'Zooms in a touch on the loudest moments.') + '</div>';
      },
      captions: function () {
        var cues = RS.cues(words(), C.start, C.end, 8);
        return '<div class="ce-sec">' + RS.switchHtml('captions', 'Show captions', st.captions, 'Word-by-word, animated. Most people watch on mute!') + '</div>' +
          (!cues.length ? '<div class="ce-callout"><p>No caption words in this clip yet.</p><div class="ui-row">' +
            '<button class="ui-btn sm primary" data-tx' + (M ? '' : ' disabled') + '>' + UI.icon('wand') + 'Write them on this device</button>' +
            '<label class="ui-btn sm">' + UI.icon('upload') + 'Import .srt / .vtt<input type="file" accept=".srt,.vtt" data-subs hidden></label>' +
            '<button class="ui-btn sm" data-cue-add>' + UI.icon('type') + 'Type them</button></div>' +
            '<div data-tx-run hidden class="pj-run" style="margin-top:10px"><b data-tx-msg>Starting…</b><div class="rs-progress"><i data-tx-bar></i></div></div></div>' : '') +
          '<div class="ce-sec"><h4>Style</h4>' + chips('capStyle', CAP_STYLES) + (st.capStyle === 'clean' ? '<p class="ui-hint">Plain text with a soft shadow, no box: the cleanest look.</p>' : '') + '</div>' +
          '<div class="ce-sec"><div class="ce-two"><label class="ui-field"><span>Font</span><select data-k="capFont">' + FONTS.map(function (f) {
            return '<option' + (st.capFont === f ? ' selected' : '') + ' style="font-family:\'' + f + '\'">' + f + '</option>'; }).join('') + '</select></label>' +
          '<div class="ce-sec"><h4 style="margin-bottom:8px">Words at a time</h4>' + chips('capWords', [1, 2, 3, 4, 5]) + '</div>' +
          RS.rangeHtml('capSize', 'Size', st.capSize, 0.5, 2, 0.05, pct) + RS.rangeHtml('capPos', 'Height on screen', st.capPos, 0.1, 0.95, 0.01, pct) + '</div></div>' +
          '<div class="ce-sec"><div class="ce-colors">' + color('hl', 'Highlight') + color('capColor', 'Text') + '</div>' +
          RS.switchHtml('capUpper', 'ALL CAPS', st.capUpper) + RS.switchHtml('capEmoji', 'Auto emoji', st.capEmoji, 'Pops a matching emoji above some words 🔥') + '</div>' +
          (cues.length ? '<div class="ce-sec"><h4>Pop something on a word</h4><div class="ce-words">' + RS.wordsIn(words(), C.start, C.end).slice(0, 200).map(function (w) {
            return '<button type="button" class="ce-word" data-wordpop="' + w[0] + '" data-wtext="' + esc(w[2]) + '">' + esc(w[2]) + '</button>'; }).join('') + '</div>' +
            '<p class="ui-hint">Tap a word to drop an emoji, a title, a tool label or a prompt bar exactly when it\'s said. Or plan the whole clip in the <button type="button" class="ui-btn sm ghost" data-board>' + UI.icon('list') + 'Storyboard</button></p></div>' : '') +
          (cues.length ? '<div class="ce-sec"><h4>Edit the words</h4><div class="ce-cues" data-cues>' + cues.map(function (c, i) {
            return '<div class="ce-cue" data-cue="' + i + '" data-s="' + c.s + '" data-e="' + c.e + '"><button type="button" class="t" data-cue-seek>' + RS.fmt(c.s - C.start, true) + '</button>' +
              '<input type="text" value="' + esc(c.text) + '" data-cue-text maxlength="200"><button type="button" class="ui-btn sm ghost icon" data-cue-del aria-label="Delete line">' + UI.icon('x') + '</button></div>'; }).join('') + '</div>' +
            '<div class="ui-row" style="margin-top:10px"><button class="ui-btn sm" data-cue-add>' + UI.icon('plus') + 'Add a line at the playhead</button></div></div>' : '');
      },
      text: function () {
        var L = selLayer();
        return (L && (L.t === 'text' || L.t === 'card') ? layerEditor(L) : '') +
          '<div class="ce-sec"><h4>Add text</h4><div class="ce-tstyles">' + RS.TEXT_STYLES.map(function (x) {
            return '<button type="button" class="ce-ts" data-add-text="' + x.key + '"><canvas data-ts-cv="' + x.key + '"></canvas><span>' + esc(x.name) + '</span></button>'; }).join('') + '</div>' +
          '<p class="ui-hint">Pick a style to drop a text box at the playhead. 12 fonts, 9 styles.</p></div>' +
          '<div class="ce-sec"><h4>Cards & big titles</h4><div class="ce-cards">' + RS.CARDS.map(function (c) {
            return '<button type="button" class="ui-btn sm" data-add-card="' + c.key + '">' + { label: '🏷️', repo: '📦', prompt: '⌨️' }[c.key] + ' ' + esc(c.name) + '</button>'; }).join('') +
          '<button type="button" class="ui-btn sm" data-add-mag>📰 Magazine cover</button><button type="button" class="ui-btn sm" data-add-behind>🧍 Big title behind you</button></div>' +
          '<p class="ui-hint">Tool labels, a GitHub-style repo card and a prompt bar that types itself. Pin any of them to a word so they land the moment you say it.</p></div>' +
          layerList('text') +
          '<div class="ce-sec"><h4>Hook</h4>' + field('hook', 'Big text for the first seconds', 'Wait for it… 👀', 90) +
          '<div class="ce-two" style="margin-top:10px">' + RS.rangeHtml('hookSecs', 'Shows for', st.hookSecs, 1, 8, 0.5, function (v) { return v + 's'; }) +
          '<div class="ce-colors">' + color('hookBg', 'Sticker colour') + '</div></div></div>' +
          '<div class="ce-sec"><h4>Part label</h4>' + field('part', 'Like "Part 1" for a series', 'Part 1', 20) + '</div>' +
          '<div class="ce-sec"><h4>Your handle</h4>' + field('handle', 'Shown in a corner', '@yourname', 40) +
          '<div style="margin-top:10px">' + chips('handlePos', [['tl', '↖ Top left'], ['tr', '↗ Top right'], ['bl', '↙ Bottom left'], ['br', '↘ Bottom right'], ['off', 'Hide']]) + '</div></div>' +
          '<div class="ce-sec"><h4>End card</h4>' + RS.switchHtml('cta', 'Show a call to action at the end', st.cta) + field('ctaText', 'Text', 'Follow for part 2 👀', 60) + '</div>' +
          '<div class="ce-sec"><h4>Progress bar</h4>' + RS.switchHtml('progress', 'Show a progress bar', st.progress, 'Keeps people watching to the end.') +
          '<div class="ce-colors">' + color('progColor', 'Colour') + '</div></div>';
      },
      stickers: function () {
        var L = selLayer();
        return (L && L.t !== 'text' && L.t !== 'card' ? layerEditor(L) : '') +
          '<div class="ce-sec"><h4>Emoji stickers</h4>' + Object.keys(RS.EMOJI).map(function (cat) {
            return '<div class="ce-emo-cat"><span>' + esc(cat) + '</span><div class="ce-emojis">' + RS.EMOJI[cat].map(function (em) {
              return '<button type="button" class="ce-emo" data-add-emoji="' + em + '" aria-label="Add ' + em + '">' + em + '</button>'; }).join('') + '</div></div>'; }).join('') + '</div>' +
          '<div class="ce-sec"><h4>Word stickers</h4><div class="ce-badges">' + RS.BADGES.map(function (b, i) {
            return '<button type="button" class="ce-badge" data-add-badge="' + i + '" aria-label="Add ' + esc(b.v) + '"><canvas data-badge-cv="' + i + '"></canvas></button>'; }).join('') + '</div></div>' +
          '<div class="ce-sec"><h4>Doodles</h4><div class="ce-badges">' + RS.SHAPES.map(function (x) {
            return '<button type="button" class="ce-badge" data-add-shape="' + x[0] + '"><canvas data-shape-cv="' + x[0] + '"></canvas><small>' + esc(x[1]) + '</small></button>'; }).join('') + '</div>' +
          '<p class="ui-hint">Tip: point an arrow at the good bit, or circle it.</p></div>' +
          layerList('stickers');
      },
      fx: function () {
        var n = plan.joins.length, scenes = A && A.cuts ? A.cuts.filter(function (c) { return c > C.start && c < C.end; }).length : 0;
        return '<div class="ce-sec"><h4>Intro</h4>' + RS.switchHtml('wall', '🧱 Start with a 3×3 wall', st.wall, 'Your shot shrinks into the middle of a wall of 8 other moments from this video, then zooms back in. Replaces the intro transition.') +
          (st.wall ? '' : chips('transIn', RS.TRANS)) + '</div>' +
          '<div class="ce-sec"><h4>Between cuts</h4>' + chips('transCut', RS.TRANS) +
          '<p class="ui-hint">' + (n ? '✂️ Plays at ' + UI.plural(n, 'cut') + ' in this reel.' : 'No cuts in this reel yet. Turn on <b>Cut the silences</b> in Sound, or the switch below.') + '</p>' +
          RS.switchHtml('transScenes', 'Also on scene changes', st.transScenes, A && A.cuts ? 'When the video itself jumps to a new shot (' + UI.plural(scenes, 'change') + ' in this clip).' : 'Needs the video to be read first (open the project).') + '</div>' +
          '<div class="ce-sec"><h4>Outro</h4>' + chips('transOut', RS.TRANS) + '</div>' +
          '<div class="ce-sec">' + RS.rangeHtml('transLen', 'Transition length', st.transLen, 0.15, 1, 0.05, function (v) { return (+v).toFixed(2) + 's'; }) + '</div>' +
          '<div class="ce-sec"><div class="ui-row"><button type="button" class="ui-btn sm" data-tprev="in"' + (M ? '' : ' disabled') + '>' + UI.icon('play') + 'Preview intro</button>' +
          (n ? '<button type="button" class="ui-btn sm" data-tprev="cut">' + UI.icon('play') + 'Preview a cut</button>' : '') +
          '<button type="button" class="ui-btn sm" data-tprev="out"' + (M ? '' : ' disabled') + '>' + UI.icon('play') + 'Preview outro</button></div>' +
          '<p class="ui-hint">Transitions play while the reel plays and in the export. The paused preview shows a clean frame.</p></div>';
      },
      sound: function () {
        var cut = plan.srcLen < (C.end - C.start) - 0.05 ? (C.end - C.start - plan.srcLen).toFixed(1) : 0;
        return '<div class="ce-sec"><h4>Speed</h4>' + chips('speed', [[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']]) + '</div>' +
          '<div class="ce-sec">' + RS.switchHtml('cutSilence', 'Cut the silences', st.cutSilence, A && A.env ? 'Jump-cuts out the pauses.' : 'Needs Find reels to have listened to the video first.') +
          (st.cutSilence ? RS.rangeHtml('silence', 'How much to cut', st.silence, 0, 1, 0.05, function (v) { return v < 0.34 ? 'Gentle' : v < 0.67 ? 'Medium' : 'Snappy'; }) +
            '<p class="ui-hint">' + (cut ? '✂️ Removes ' + cut + 's of pauses. ' : 'No long pauses found. ') + 'Reel length: <b>' + plan.outDur.toFixed(1) + 's</b></p>' : '') + '</div>' +
          '<p class="ui-hint" style="margin:0">Fades and other transitions are in <b>FX</b>.</p>' +
          '<div class="ce-sec"><h4>Volume</h4>' + RS.rangeHtml('vol', 'Video sound', st.vol, 0, 2, 0.05, pct) + '</div>' +
          '<div class="ce-sec"><h4>Background music</h4><p class="ui-hint" style="margin-top:0">Pick a track from this device (only music you\'re allowed to use). It stays on this device too.</p>' +
          '<div class="ui-row"><label class="ui-btn sm">' + UI.icon('music') + (RS.musicFiles[C.id] ? 'Change track' : 'Choose a track') + '<input type="file" accept="audio/*" data-music hidden></label>' +
          (RS.musicFiles[C.id] ? '<span class="ui-badge lime">♪ ' + esc(RS.musicFiles[C.id].name.slice(0, 40)) + '</span><button class="ui-btn sm ghost" data-music-x>' + UI.icon('x') + 'Remove</button>'
            : st.musicName ? '<span class="small muted">Last time: ' + esc(st.musicName) + ' (choose it again)</span>' : '') + '</div>' +
          (RS.musicFiles[C.id] ? RS.rangeHtml('musicVol', 'Music volume', st.musicVol, 0, 1, 0.05, pct) + RS.switchHtml('duck', 'Duck under speech', st.duck, 'Music gets quieter when someone talks.') : '') + '</div>';
      },
      post: function () {
        var post = C.post && C.post.caption ? C.post : RS.postCopy(C, words(), RS.kit, postSeed);
        return '<div class="ce-sec ce-post"><h4>Post caption</h4><textarea data-post="caption" maxlength="2200">' + esc(post.caption) + '</textarea>' +
          '<label class="ui-field" style="margin-top:10px"><span>Hashtags</span><input type="text" data-post="hashtags" value="' + esc(post.hashtags) + '" maxlength="300"></label>' +
          '<div class="ui-row" style="margin-top:10px"><button class="ui-btn sm" data-shuffle>' + UI.icon('refresh') + 'Another idea</button><button class="ui-btn sm" data-copy>' + UI.icon('copy') + 'Copy caption + tags</button></div></div>' +
          '<div class="ce-sec"><h4>Status</h4><div class="ui-seg">' + [['draft', 'Draft'], ['ready', 'Ready to post'], ['exported', 'Exported']].map(function (s) {
            return '<button type="button" data-status="' + s[0] + '" class="' + (C.status === s[0] ? 'on' : '') + '">' + s[1] + '</button>'; }).join('') + '</div></div>' +
          '<div class="ui-card ce-export ce-sec"><h3>' + UI.icon('download') + ' Export this reel</h3>' +
          '<p class="muted small">' + plan.outDur.toFixed(1) + 's · ' + RS.dims(st.aspect, st.quality).join('×') + ' · ' + (/mp4/.test(RS.recorderType() || '') ? 'MP4' : 'WebM') + '. It plays through once while it records, right here on your device.</p>' +
          '<div class="ui-row">' + chips('quality', [['1080', 'Full HD'], ['720', 'Faster 720p']]) + '</div>' +
          RS.switchHtml('srt', 'Also download a captions file (.srt)', !!RS.wantSrt) +
          '<button class="ui-btn primary lg block" data-export style="margin-top:8px"' + (M && RS.canExport() ? '' : ' disabled') + '>' + UI.icon('download') + 'Export reel</button>' +
          (RS.canExport() ? '' : '<p class="ui-hint">This browser can\'t record video. Try Chrome, Edge or Safari on a computer.</p>') + '</div>';
      }
    };
    function drawPanel() {
      var panel = view.querySelector('[data-panel]'); if (!panel) return;
      panel.innerHTML = PANELS[tab]();
      if (tab === 'look') panel.querySelectorAll('[data-look-cv]').forEach(function (cv) {
        var l = RS.lookByKey(cv.getAttribute('data-look-cv'));
        RS.stylePreview(cv, RS.applyLook(Object.assign({}, st, { aspect: '9:16', hook: '' }), l.style, l.key), { width: 120, hook: '' });
      });
      if (tab === 'look') panel.querySelectorAll('[data-grade-cv]').forEach(function (cv) {
        RS.gradeThumb(cv, M && M.el.readyState >= 2 ? M.el : RS.demoSource(), cv.getAttribute('data-grade-cv'), st.grade === cv.getAttribute('data-grade-cv') ? st.gradeAmt : 0.8, st);
      });
      if (tab === 'captions') markCue();
      if (tab === 'text') panel.querySelectorAll('[data-ts-cv]').forEach(function (cv) {
        var x = RS.TEXT_STYLES.filter(function (y) { return y.key === cv.getAttribute('data-ts-cv'); })[0];
        RS.layerThumb(cv, RS.newLayer('text', 'Wow!', { ts: x.key, font: x.font, fill: x.fill, line: x.line, rot: 0 }), 240, 134);
      });
      if (tab === 'stickers') {
        panel.querySelectorAll('[data-badge-cv]').forEach(function (cv) { var b = RS.BADGES[+cv.getAttribute('data-badge-cv')]; RS.layerThumb(cv, RS.newLayer('badge', b.v, { shape: b.shape, fill: b.fill }), 240, 134); });
        panel.querySelectorAll('[data-shape-cv]').forEach(function (cv) { var k = cv.getAttribute('data-shape-cv'); RS.layerThumb(cv, RS.newLayer('shape', k, { fill: SHAPE_COLOR[k] }), 240, 134); });
      }
    }
    function showTab(name) {
      tab = lastTab = name;
      view.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-tab') === name); });
      drawPanel();
    }

    /* ---------- preview */
    function mountPlayer() {
      var cv = view.querySelector('[data-cv]'), d = RS.dims(st.aspect, '720'), k = 0.5625;
      cv.width = Math.round(d[0] * k); cv.height = Math.round(d[1] * k);
      var maxCss = Math.min(380, Math.min(view.querySelector('.ce-left').clientWidth, document.documentElement.clientWidth - 32) - 26);
      cv.style.width = Math.min(maxCss, cv.width * (st.aspect === '9:16' ? 1 : 0.9)) + 'px';
      if (player) player.destroy();
      player = RS.Player(cv, M, function () { return plan; }, function (o, D, playing) {
        var sc = view.querySelector('[data-scrub]'), t = view.querySelector('[data-t]'), pp = view.querySelector('[data-pp]');
        if (sc && !sc.matches(':active')) sc.value = Math.round(o / Math.max(0.01, D) * 1000);
        if (t) t.textContent = RS.fmt(o) + ' / ' + RS.fmt(D);
        if (pp) pp.innerHTML = UI.icon(playing ? 'pause' : 'play');
        if (tab === 'captions') markCue();
        drawTrim();
      });
      player.opt = { boxes: boxes, selected: selId };
      player.setMusic(RS.musicFiles[C.id] || null);
      RS.fontsReady().then(function () { return RS.seek(M.el, C.start); }).then(function () { player.draw(); drawTrim(); });
      wireDrag(cv);
      setTimeout(function () { var h = view.querySelector('[data-hint]'); if (h) h.style.opacity = 0; }, 3500);
    }
    function wireDrag(cv) {
      var start = null, pts = {};
      function region(e) {
        var r = cv.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
        if (st.layout === 'pip') { var pr = RS.pipRect(st, cv.width, cv.height), p = canvasPt(e); return p.x >= pr.x && p.x <= pr.x + pr.w && p.y >= pr.y && p.y <= pr.y + pr.h ? '2' : ''; }
        return st.layout === 'split' && y > st.split ? '2' : '';
      }
      function canvasPt(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
      function inBox(b, p, pad) {
        var dx = p.x - b.x, dy = p.y - b.y, c = Math.cos(-b.rot), s = Math.sin(-b.rot);
        var lx = dx * c - dy * s, ly = dx * s + dy * c;
        return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad;
      }
      function handleAt(p) {  // the ↻ corner of the selected layer
        var b = boxes.filter(function (x) { return x.id === selId; })[0]; if (!b) return null;
        var u = Math.min(cv.width, cv.height) / 1080, pad = 14 * u, hx = b.w / 2 + pad, hy = b.h / 2 + pad;
        var c = Math.cos(b.rot), s = Math.sin(b.rot), x = b.x + hx * c - hy * s, y = b.y + hx * s + hy * c;
        return Math.hypot(p.x - x, p.y - y) < 40 * u ? b : null;
      }
      function hitLayer(p) {
        var u = Math.min(cv.width, cv.height) / 1080;
        for (var i = boxes.length - 1; i >= 0; i--) if (layerById(boxes[i].id) && inBox(boxes[i], p, 12 * u)) return boxes[i];
        return null;
      }
      cv.addEventListener('pointerdown', function (e) {
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        try { cv.setPointerCapture(e.pointerId); } catch (x) {} cv.classList.add('grab');
        if (Object.keys(pts).length > 1 && start && start.layer) { var L0 = layerById(start.layer); start.size = L0 ? L0.size : 1; start.dist = 0; return; }
        var p = canvasPt(e), hb = selId && handleAt(p), hit = hb ? null : hitLayer(p);
        if (hb) { var L1 = layerById(selId); start = { handle: true, layer: selId, cx: hb.x, cy: hb.y, d0: Math.max(1, Math.hypot(p.x - hb.x, p.y - hb.y)), a0: Math.atan2(p.y - hb.y, p.x - hb.x), size: L1.size, rot: L1.rot, moved: false }; return; }
        if (hit) {
          var L2 = layerById(hit.id), was = selId === hit.id;
          if (!was) select(hit.id);
          start = { layer: hit.id, x: e.clientX, y: e.clientY, lx: L2.x, ly: L2.y, size: L2.size, moved: false };
          return;
        }
        if (selId) { selId = null; player.opt.selected = null; player.draw(); drawPanel(); start = { deselect: true, moved: false }; return; }
        var reg = region(e);
        start = { x: e.clientX, y: e.clientY, fx: st['fx' + reg], fy: st['fy' + reg], reg: reg, moved: false, zoom: st['zoom' + reg] };
      });
      cv.addEventListener('pointermove', function (e) {
        if (!start || !pts[e.pointerId]) return;
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pts);
        if (start.deselect) return;
        if (start.handle) {
          var p = canvasPt(e), L = layerById(start.layer); if (!L) return;
          var d = Math.hypot(p.x - start.cx, p.y - start.cy), ang = Math.atan2(p.y - start.cy, p.x - start.cx);
          L.size = +RS.clamp(start.size * d / start.d0, 0.2, 5).toFixed(3);
          var r = start.rot + (ang - start.a0) * 180 / Math.PI; r = ((r + 540) % 360) - 180; if (Math.abs(r) < 4) r = 0;
          L.rot = Math.round(r); start.moved = true; layersChanged(false); return;
        }
        if (start.layer) {
          var LL = layerById(start.layer); if (!LL) return;
          if (ids.length === 2) {
            var pa = pts[ids[0]], pb = pts[ids[1]], dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
            if (!start.dist) start.dist = dist;
            LL.size = +RS.clamp(start.size * dist / start.dist, 0.2, 5).toFixed(3); start.moved = true; layersChanged(false); return;
          }
          var rr = cv.getBoundingClientRect(), mx = (e.clientX - start.x) / rr.width, my = (e.clientY - start.y) / rr.height;
          if (Math.abs(mx) + Math.abs(my) < 0.006 && !start.moved) return;
          LL.x = +RS.clamp(start.lx + mx, 0, 1).toFixed(4); LL.y = +RS.clamp(start.ly + my, 0, 1).toFixed(4); start.moved = true; layersChanged(false); return;
        }
        if (ids.length === 2) {  // pinch to zoom
          var a = pts[ids[0]], b = pts[ids[1]], dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (!start.dist) start.dist = dist;
          set('zoom' + start.reg, RS.clamp(+(start.zoom * dist / start.dist).toFixed(3), 1, 3)); start.moved = true; return;
        }
        var r = cv.getBoundingClientRect(), dx = (e.clientX - start.x) / r.width, dy = (e.clientY - start.y) / r.height;
        if (Math.abs(dx) + Math.abs(dy) < 0.01 && !start.moved) return;
        start.moved = true;
        var sw = M.width || 16, sh = M.height || 9, W = 1, H = r.height / r.width;
        if (st.layout === 'split') H = start.reg ? H * (1 - st.split) : H * st.split;
        if (st.layout === 'fit' || st.layout === 'framed') { W = st.layout === 'framed' ? 0.88 : 1; H = W * sh / sw; }
        if (st.layout === 'pip' && start.reg) { var pr2 = RS.pipRect(st, cv.width, cv.height), pv = pipVid(); W = pr2.w / cv.width; H = pr2.h / cv.width; if (pv && pv.videoWidth) { sw = pv.videoWidth; sh = pv.videoHeight; } }
        var z = st['zoom' + start.reg], sc = Math.max(W / sw, H / sh) * z, ox = sw * sc - W, oy = sh * sc - H;
        var nfx = ox > 0.001 ? RS.clamp(start.fx - dx / ox, 0, 1) : st['fx' + start.reg], nfy = oy > 0.001 ? RS.clamp(start.fy - dy * (r.height / r.width) / oy, 0, 1) : st['fy' + start.reg];
        st['fx' + start.reg] = +nfx.toFixed(3); set('fy' + start.reg, +nfy.toFixed(3));
      });
      function up(e) {
        delete pts[e.pointerId]; cv.classList.remove('grab');
        if (start && (start.layer || start.handle || start.deselect)) {
          if (!Object.keys(pts).length) { if (start.moved) drawPanel(); start = null; }
          return;
        }
        if (start && !start.moved && !Object.keys(pts).length) player.toggle();
        if (start && start.moved && tab === 'look') syncPanelInputs();
        if (!Object.keys(pts).length) start = null;
      }
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', function (e) {
        e.preventDefault();
        var sb = selId && boxes.filter(function (x) { return x.id === selId; })[0];
        if (sb && inBox(sb, canvasPt(e), 20)) { setLayer('size', +RS.clamp(selLayer().size * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 0.2, 5).toFixed(3)); syncLayerInputs(); return; }
        var reg = region(e);
        set('zoom' + reg, RS.clamp(+(st['zoom' + reg] * (e.deltaY < 0 ? 1.06 : 1 / 1.06)).toFixed(3), 1, 3));
        if (tab === 'look') syncPanelInputs();
      }, { passive: false });
    }
    function syncPanelInputs() {
      view.querySelectorAll('[data-panel] input[type=range][data-k]').forEach(function (inp) {
        var k = inp.getAttribute('data-k'); if (st[k] == null) return;
        inp.value = st[k];
        var show = view.querySelector('[data-show="' + k + '"]');
        if (show) show.textContent = /^zoom/.test(k) ? (+st[k]).toFixed(2).replace(/0$/, '') + '×' : Math.round(st[k] * 100) + '%';
      });
    }
    function syncLayerInputs() {
      var L = selLayer(); if (!L) return;
      ['size', 'rot'].forEach(function (k) {
        var inp = view.querySelector('[data-lk="' + k + '"]'), show = view.querySelector('[data-lshow="' + k + '"]');
        if (inp) inp.value = L[k]; if (show) show.textContent = LSHOW[k](L[k]);
      });
    }
    function markCue() {
      if (!M) return;
      var t = M.el.currentTime;
      view.querySelectorAll('[data-cue]').forEach(function (el) { el.classList.toggle('now', t >= +el.getAttribute('data-s') && t < +el.getAttribute('data-e')); });
    }

    /* ---------- trim bar */
    function trimWin() { var len = C.end - C.start, pad = Math.max(4, len * 0.35); return [Math.max(0, C.start - pad), Math.min(P.duration, C.end + pad)]; }
    function drawTrim() {
      var cv = view.querySelector('[data-trim]'); if (!cv) return;
      var dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth * dpr, H = cv.clientHeight * dpr;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      var g = cv.getContext('2d'), w = trimWin(), span = w[1] - w[0], X = function (t) { return (t - w[0]) / span * W; };
      var dark = document.documentElement.classList.contains('ui-dark');
      g.fillStyle = dark ? '#2C1F4A' : '#FFEEDB'; g.fillRect(0, 0, W, H);
      if (A && A.env) {
        g.fillStyle = dark ? '#6F5CB3' : '#B9A6FF';
        for (var x = 0; x < W; x += 2 * dpr) { var lv = RS.levelAt(A, w[0] + x / W * span); var bh = Math.max(dpr, lv * (H - 10 * dpr)); g.fillRect(x, (H - bh) / 2, 1.4 * dpr, bh); }
      }
      g.fillStyle = 'rgba(255,61,139,.22)'; g.fillRect(X(C.start), 0, X(C.end) - X(C.start), H);
      if (plan && plan.segs.length > 1) { g.fillStyle = 'rgba(26,16,51,.35)'; for (var i = 1; i < plan.segs.length; i++) g.fillRect(X(plan.segs[i - 1][1]), 0, X(plan.segs[i][0]) - X(plan.segs[i - 1][1]), H); }
      g.strokeStyle = '#1A1033'; g.lineWidth = 3 * dpr; g.strokeRect(X(C.start), 1.5 * dpr, X(C.end) - X(C.start), H - 3 * dpr);
      [C.start, C.end].forEach(function (t) { g.fillStyle = '#C6F432'; g.fillRect(X(t) - 6 * dpr, 0, 12 * dpr, H); g.strokeRect(X(t) - 6 * dpr, 1.5 * dpr, 12 * dpr, H - 3 * dpr); });
      if (M) { var px = X(M.el.currentTime); g.fillStyle = '#FF3D8B'; g.fillRect(px - 1.5 * dpr, 0, 3 * dpr, H); }
      var len = view.querySelector('[data-len]'); if (len) len.textContent = (C.end - C.start).toFixed(1) + 's' + (plan && plan.outDur < C.end - C.start - 0.05 ? ' → ' + plan.outDur.toFixed(1) + 's' : '');
      var sv = view.querySelector('[data-sv]'), ev = view.querySelector('[data-ev]');
      if (sv) sv.textContent = RS.fmt(C.start, true); if (ev) ev.textContent = RS.fmt(C.end, true);
    }
    function setRange(s, e, keepPlay) {
      s = RS.clamp(+s.toFixed(2), 0, P.duration - 1); e = RS.clamp(+e.toFixed(2), s + 1, P.duration);
      if (e - s > 600) e = s + 600;
      C.start = s; C.end = e; replan(); drawTrim();
      if (!keepPlay && player) { player.pause(); }
      saveSoon();
    }
    function wireTrim() {
      var cv = view.querySelector('[data-trim]'); if (!cv) return;
      var drag = null;
      cv.addEventListener('pointerdown', function (e) {
        var r = cv.getBoundingClientRect(), w = trimWin(), t = w[0] + (e.clientX - r.left) / r.width * (w[1] - w[0]);
        var tol = (w[1] - w[0]) * 0.04;
        drag = Math.abs(t - C.start) < tol ? 's' : Math.abs(t - C.end) < tol ? 'e' : null;
        if (drag) { drag = { k: drag, win: w }; cv.setPointerCapture(e.pointerId); }
        else if (player) RS.seek(M.el, RS.clamp(t, C.start, C.end - 0.05)).then(player.draw);
      });
      cv.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var r = cv.getBoundingClientRect(), w = drag.win, t = w[0] + RS.clamp((e.clientX - r.left) / r.width, 0, 1) * (w[1] - w[0]);
        if (drag.k === 's') { C.start = RS.clamp(t, 0, C.end - 1); } else { C.end = RS.clamp(t, C.start + 1, P.duration); }
        replan(); drawTrim();
      });
      cv.addEventListener('pointerup', function () {
        if (!drag) return;
        var k = drag.k; drag = null; setRange(C.start, C.end);
        if (player) RS.seek(M.el, k === 's' ? C.start : Math.max(C.start, C.end - 2)).then(player.draw);
      });
    }

    /* ---------- captions editing */
    function cueEdit(el, text) {
      var s = +el.getAttribute('data-s'), e = +el.getAttribute('data-e');
      var keep = words().filter(function (w) { return w[0] < s - 0.001 || w[0] >= e - 0.001; });
      var fresh = RS.spread(text, s, Math.max(s + 0.3, e - 0.05));
      P.transcript = { source: (P.transcript && P.transcript.source) || 'manual', words: keep.concat(fresh).sort(function (a, b) { return a[0] - b[0]; }) };
      replan(); player && player.draw(); saveWordsSoon();
    }
    function cueAdd() {
      var t = M ? RS.clamp(M.el.currentTime, C.start, C.end - 0.5) : C.start;
      var after = words().filter(function (w) { return w[0] > t + 0.05; })[0], e = Math.min(C.end, after ? after[0] - 0.02 : t + 2.2, t + 2.2);
      if (e - t < 0.4) { UI.toast('There\'s already a line right here. Move the playhead to a quiet spot.', 'error'); return; }
      var fresh = RS.spread('New caption', t, e);
      P.transcript = { source: (P.transcript && P.transcript.source) || 'manual', words: words().concat(fresh).sort(function (a, b) { return a[0] - b[0]; }) };
      if (!st.captions) st.captions = true;
      replan(); drawPanel(); player && player.draw(); saveWordsSoon(); saveSoon();
      var inp = view.querySelectorAll('[data-cue-text]'); inp.forEach(function (x) { if (x.value === 'New caption') { x.focus(); x.select(); } });
    }
    function transcribeClip(btn) {
      var run = view.querySelector('[data-tx-run]'), bar = view.querySelector('[data-tx-bar]'), msg = view.querySelector('[data-tx-msg]');
      run.hidden = false; btn.disabled = true;
      var ranges = [[C.start, C.end]];
      RS.transcribe(M, ranges, 'en', function (f, t) { bar.style.width = Math.round(f * 100) + '%'; msg.textContent = t; }).then(function (ws) {
        P.transcript = { source: 'whisper', words: RS.mergeWords(words(), ws, ranges) };
        return RS.db.updateProject(pid, { transcript: P.transcript }).then(function () { replan(); drawPanel(); player && player.draw(); UI.toast('Captions ready!', 'ok'); });
      }).catch(function (e) { run.hidden = true; btn.disabled = false; UI.toast(e.message, 'error'); });
    }

    /* ---------- storyboard: every line, what's on screen while it's said, ideas to add (RS.suggestBoard) */
    function boardModal() {
      if (player) player.pause();
      var rows = RS.cues(words(), C.start, C.end, 12), ideas = [];
      var tName = function (k) { return (RS.TRANS.filter(function (x) { return x[0] === k; })[0] || ['', k])[1]; };
      var gName = function (k) { return (RS.GRADES.filter(function (x) { return x[0] === k; })[0] || ['', k])[1]; };
      function onScreen(r, i) {
        var a = RS.srcToOut(plan, r.s), b = i < rows.length - 1 ? RS.srcToOut(plan, rows[i + 1].s) : plan.outDur, out = [];
        if (!i) {
          if (st.hook) out.push({ txt: '🪝 Hook: ' + st.hook, fx: true });
          out.push({ txt: st.wall ? '🧱 3×3 wall intro' : st.transIn !== 'none' ? tName(st.transIn) + ' intro' : '', fx: true });
          if (st.grade !== 'none') out.push({ txt: gName(st.grade) + ' colour' + (st.gradeWipe ? ' + before/after slider' : ''), fx: true });
          if (st.layout === 'pip') out.push({ txt: '🖼️ Corner card' + (st.pipName ? ': ' + st.pipName : ''), fx: true });
        }
        (st.layers || []).forEach(function (L) {
          var sp = RS.layerSpan(L, plan);
          if (L.all ? !i : sp[0] < b && sp[0] >= a - 0.001 || (!i && sp[0] < a)) out.push({ txt: layerLabel(L) + (L.behind ? ' · behind you' : '') + (L.all ? ' · whole reel' : ''), id: L.id });
        });
        if (st.transCut !== 'none') plan.joins.forEach(function (j) { if (j >= a && j < b) out.push({ txt: '✂️ ' + tName(st.transCut) + ' cut', fx: true }); });
        return out.filter(function (x) { return x.txt; });
      }
      var m = UI.modal('<h2>📋 Storyboard</h2><p class="muted">Every line you say and what\'s on screen while you say it. Agree on the plan here first, then fine-tune on the preview.</p>' +
        '<div class="sb-bar"><button type="button" class="ui-btn sm primary" data-sb-suggest>' + UI.icon('wand') + 'Suggest a plan</button>' +
        '<button type="button" class="ui-btn sm lime" data-sb-apply hidden></button>' +
        '<button type="button" class="ui-btn sm" data-sb-copy>' + UI.icon('copy') + 'Copy as text</button></div>' +
        '<div class="sb-wrap" data-sb-body></div><div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Done</button></div>', { wide: true });
      var el = m.el;
      function draw() {
        var body = el.querySelector('[data-sb-body]');
        if (!rows.length) { body.innerHTML = '<div class="ui-empty"><h3>No words yet</h3><p>Write the captions first (the Captions tab), then the storyboard fills itself in.</p></div>'; el.querySelector('[data-sb-suggest]').disabled = true; return; }
        body.innerHTML = '<table class="sb-table"><thead><tr><th>#</th><th>Time</th><th>You say</th><th>On screen</th></tr></thead><tbody>' + rows.map(function (r, i) {
          var chipsH = onScreen(r, i).map(function (x) {
            return '<span class="sb-chip' + (x.fx ? ' fx' : '') + '">' + esc(x.txt) + (x.id ? '<button type="button" class="sb-x" data-sb-del="' + esc(x.id) + '" aria-label="Remove" title="Remove">×</button>' : '') + '</span>'; }).join('');
          var ideaH = ideas.map(function (d, k) { return d.row === i ? '<button type="button" class="sb-chip idea' + (d.on ? '' : ' off') + '" data-idea="' + k + '" title="Tap to skip or keep">💡 ' + esc(d.label) + '</button>' : ''; }).join('');
          return '<tr><td class="n">' + (i + 1) + '</td><td class="t"><button type="button" data-sb-seek="' + r.s + '">' + RS.fmt(RS.srcToOut(plan, r.s), true) + '</button></td>' +
            '<td class="sb-says">' + esc(r.text) + '</td><td><div class="sb-on">' + chipsH + ideaH +
            '<select class="sb-add" data-sb-add="' + i + '" aria-label="Add to this line"><option value="">+ Add…</option><option value="title">✏️ Title</option><option value="behind">🧍 Line behind you</option>' +
            '<option value="emoji">😀 Emoji</option><option value="label">🏷️ Tool label</option><option value="prompt">⌨️ Prompt bar</option><option value="badge">💥 Word sticker</option></select></div></td></tr>'; }).join('') + '</tbody></table>';
        var on = ideas.filter(function (d) { return d.on; }).length, ap = el.querySelector('[data-sb-apply]');
        ap.hidden = !ideas.length; ap.textContent = on ? 'Add ' + UI.plural(on, 'idea') + ' to the reel' : 'Nothing picked';
        ap.disabled = !on;
      }
      function keyWord(r) { return r.words.map(function (w) { return String(w[2]).replace(/[^\p{L}\p{N}'’-]/gu, ''); }).sort(function (x, y) { return y.length - x.length; })[0] || 'this'; }
      function changed() { layersChanged(false); if (tab === 'text' || tab === 'stickers') drawPanel(); draw(); }
      el.addEventListener('click', function (e) {
        var b;
        if (e.target.closest('[data-sb-suggest]')) {
          ideas = RS.suggestBoard(rows, st, plan).map(function (d) { d.on = true; return d; });
          if (!ideas.length) UI.toast('No new ideas for this clip: it already looks planned!'); draw(); return;
        }
        if ((b = e.target.closest('[data-idea]'))) { var d = ideas[+b.getAttribute('data-idea')]; d.on = !d.on; draw(); return; }
        if (e.target.closest('[data-sb-apply]')) {
          var n = 0, anyBehind = false;
          ideas.filter(function (x) { return x.on; }).forEach(function (x) {
            if (x.kind === 'hook') { st.hook = x.hook; n++; return; }
            var made = layerFor(x.kind, x.word, x.at, x.line);
            if (placeLayer(made.L, { at: x.at, word: x.word, len: x.len || made.len })) { n++; if (made.L.behind) anyBehind = true; }
          });
          ideas = []; C.style = st; changed();
          if (anyBehind) needPerson(true);
          UI.toast('Added ' + UI.plural(n, 'thing') + ' to the reel ✓', 'ok'); return;
        }
        if ((b = e.target.closest('[data-sb-del]'))) { var id = b.getAttribute('data-sb-del'); st.layers = st.layers.filter(function (L) { return L.id !== id; }); if (selId === id) select(null); changed(); return; }
        if ((b = e.target.closest('[data-sb-seek]'))) { if (player) player.seekSrc(+b.getAttribute('data-sb-seek')); return; }
        if (e.target.closest('[data-sb-copy]')) {
          copy('Storyboard: ' + C.title + '\n\n' + rows.map(function (r, i) {
            return (i + 1) + '. ' + RS.fmt(RS.srcToOut(plan, r.s), true) + ' | ' + r.text + ' | ' + (onScreen(r, i).map(function (x) { return x.txt; }).join('; ') || '-'); }).join('\n'));
        }
      });
      el.addEventListener('change', function (e) {
        var sel = e.target.closest('[data-sb-add]'); if (!sel || !sel.value) return;
        var r = rows[+sel.getAttribute('data-sb-add')], k = sel.value, w = keyWord(r);
        var at = (r.words.filter(function (x) { return String(x[2]).indexOf(w) >= 0; })[0] || r.words[0])[0];
        if (k === 'prompt' || k === 'behind') at = r.s;
        var made = layerFor(k, w, at, k === 'prompt' || k === 'behind' ? r.text.replace(/[.,!?]+$/, '') : '');
        if (placeLayer(made.L, { at: at, word: k === 'prompt' || k === 'behind' ? r.words[0][2] : w, len: made.len })) { changed(); if (made.L.behind) needPerson(true); }
      });
      draw();
    }

    /* ---------- templates */
    function templatesModal() {
      var m = UI.modal('<h2>Templates</h2><p class="muted">Looks shared by other creators. Applying one keeps your framing, hook and timing.</p><div class="ce-tpl-grid" data-tg><div class="ui-skel"></div></div>', { wide: true });
      UI.apiQuiet('templates_list').then(function (r) {
        var grid = m.el.querySelector('[data-tg]');
        if (!r.templates.length) { grid.innerHTML = '<div class="ui-empty">No community templates yet. Be the first to share one!</div>'; return; }
        grid.innerHTML = r.templates.map(function (t) {
          return '<button type="button" class="ce-tpl" data-tpl="' + esc(t.id) + '"><canvas></canvas><b>' + esc(t.emoji + ' ' + t.name) + '</b><small>by ' + esc(t.by) + ' · ' + UI.plural(t.uses, 'use') + '</small></button>'; }).join('');
        grid.querySelectorAll('[data-tpl]').forEach(function (b, i) { RS.stylePreview(b.querySelector('canvas'), Object.assign({}, r.templates[i].style, { aspect: '9:16' }), { width: 150 }); });
        grid.addEventListener('click', function (e) {
          var b = e.target.closest('[data-tpl]'); if (!b) return;
          var t = r.templates.filter(function (x) { return x.id === b.getAttribute('data-tpl'); })[0];
          st = RS.applyLook(st, t.style, t.style.look || 'tpl-' + t.id.replace(/\W/g, '').slice(0, 16));
          C.style = st; replan(); drawPanel(); player && player.draw(); saveSoon();
          UI.apiQuiet('template_use', t.id).catch(function () {});
          m.close(); UI.toast(t.emoji + ' ' + t.name + ' applied', 'ok');
        });
      });
    }
    function shareModal() {
      var emojis = ['✨', '🔥', '💥', '🎙️', '🎮', '🍋', '🌙', '🎤', '📦', '🌈', '🍿', '💖'];
      var m = UI.modal('<h2>Share this look</h2><p class="muted">Your caption style, layout and colours go into the public gallery. Your video, hook and words don\'t.</p>' +
        '<form class="ui-stack" data-share><label class="ui-field"><span>Name</span><input type="text" name="name" maxlength="40" required minlength="2" placeholder="Sunny Podcast"></label>' +
        '<div class="rs-chips">' + emojis.map(function (em, i) { return '<label class="rs-chip' + (i ? '' : ' on') + '"><input type="radio" name="emoji" value="' + em + '"' + (i ? '' : ' checked') + ' hidden>' + em + '</label>'; }).join('') + '</div>' +
        '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary">' + UI.icon('share') + 'Share</button></div></form>');
      var f = m.el.querySelector('[data-share]');
      f.addEventListener('change', function () { f.querySelectorAll('.rs-chip').forEach(function (c) { c.classList.toggle('on', c.querySelector('input').checked); }); });
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var v = UI.formData(f);
        UI.busy(f.querySelector('.primary'), UI.api('template_publish', v.name, v.emoji, st)).then(function () { m.close(); UI.toast('Shared! Find it under Templates.', 'ok'); RS.confetti(60); });
      });
    }

    /* ---------- export */
    function doExport() {
      if (exporting || !M) return;
      if (player) player.pause();
      exporting = true;
      var signal = { aborted: false }, done = false;
      var m = UI.modal('<h2>Exporting “' + esc(C.title) + '”</h2><p class="muted" data-exp-msg>Recording on your device… keep this tab open.</p>' +
        '<canvas class="ce-exp-canvas" data-exp-cv></canvas><div class="rs-progress"><i data-exp-bar></i></div>' +
        '<div class="ui-row end" style="margin-top:14px"><button class="ui-btn ghost" data-close>Cancel</button></div>', { onclose: function () { if (!done) signal.aborted = true; exporting = false; } });
      var el = m.el, cv = el.querySelector('[data-exp-cv]');
      if ((st.layers || []).some(function (L) { return L.behind; }) && !RS.person.ready) el.querySelector('[data-exp-msg]').textContent = 'Loading the person cut-out, then recording on your device… keep this tab open.';
      RS.exportClip(M, plan, { quality: st.quality, music: RS.musicFiles[C.id] || null, signal: signal, onProgress: function (f, canvas) {
        el.querySelector('[data-exp-bar]').style.width = Math.round(f * 100) + '%';
        var r = 320 / canvas.height; cv.width = Math.round(canvas.width * r); cv.height = 320; cv.getContext('2d').drawImage(canvas, 0, 0, cv.width, cv.height);
      } }).then(function (out) {
        done = true;
        var name = RS.slug(C.title) + '.' + out.ext;
        RS.lastExport = out;
        RS.download(out.blob, name);
        if (RS.wantSrt && words().length) RS.download(new Blob([RS.srt(plan, words())], { type: 'text/plain' }), RS.slug(C.title) + '.srt');
        var url = URL.createObjectURL(out.blob), post = C.post && C.post.caption ? C.post : RS.postCopy(C, words(), RS.kit, postSeed);
        var file = new File([out.blob], name, { type: out.blob.type });
        var canShare = navigator.canShare && navigator.canShare({ files: [file] });
        var idx = P.clips.indexOf(C), next = P.clips[idx + 1];
        el.innerHTML = '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' +
          '<div class="ce-done"><h2>Your reel is ready! 🎉</h2><video src="' + url + '" controls playsinline loop></video>' +
          '<p class="muted small">' + esc(name) + ' · ' + RS.size(out.blob.size) + ' · ' + out.width + '×' + out.height + '. It\'s in your downloads.</p>' +
          '<div class="ui-row" style="justify-content:center"><button class="ui-btn" data-again>' + UI.icon('download') + 'Download again</button>' +
          (canShare ? '<button class="ui-btn lime" data-share-file>' + UI.icon('share') + 'Share</button>' : '') +
          '<button class="ui-btn" data-copy-post>' + UI.icon('copy') + 'Copy caption</button>' +
          (next ? '<a class="ui-btn primary" href="#clip/' + esc(pid) + '/' + esc(next.id) + '" data-go="clip/' + esc(pid) + '/' + esc(next.id) + '" data-close>Next clip ' + UI.icon('arrow') + '</a>' : '') + '</div></div>';
        el.querySelector('[data-again]').onclick = function () { RS.download(out.blob, name); };
        el.querySelector('[data-copy-post]').onclick = function () { copy(post.caption + '\n\n' + post.hashtags); };
        var sh = el.querySelector('[data-share-file]');
        if (sh) sh.onclick = function () { navigator.share({ files: [file], title: C.title, text: post.caption + '\n\n' + post.hashtags }).catch(function () {}); };
        RS.confetti();
        return RS.db.logExport(C.id, { seconds: out.seconds, format: out.ext }).then(function (r) {
          C.status = 'exported'; C.export_count = r.clip.export_count; RS.badgeToast(r.new_badges);
          if (tab === 'post') drawPanel();
        });
      }).catch(function (e) {
        exporting = false;
        if (e.cancelled) { UI.toast('Export cancelled'); return; }
        m.close(); UI.toast(e.message || 'Export failed.', 'error');
      }).then(function () { exporting = false; });
    }
    function copy(text) {
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { UI.toast('Copied!', 'ok'); }, function () {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); UI.toast('Copied!', 'ok'); } catch (e) { UI.toast('Couldn\'t copy. Select the text and copy it yourself.', 'error'); }
        ta.remove();
      });
    }

    /* ---------- events */
    view.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('[data-tab]'))) {
        var nt = b.getAttribute('data-tab');
        if (selId && nt !== 'text' && nt !== 'stickers') { selId = null; if (player) { player.opt.selected = null; player.draw(); } }
        showTab(nt); return;
      }
      if ((b = t.closest('[data-add-text]'))) {
        var ts = RS.TEXT_STYLES.filter(function (x) { return x.key === b.getAttribute('data-add-text'); })[0];
        addLayer(RS.newLayer('text', 'Your text here', { ts: ts.key, font: ts.font, fill: ts.fill, line: ts.line }));
        var ta = view.querySelector('[data-led] textarea'); if (ta) { ta.focus(); ta.select(); }
        return;
      }
      if ((b = t.closest('[data-add-card]'))) {
        var ck = RS.CARDS.filter(function (x) { return x.key === b.getAttribute('data-add-card'); })[0];
        addLayer(RS.newLayer('card', ck.v, { card: ck.key, sub: ck.sub, icon: ck.icon, fill: ck.fill, anim: ck.key === 'prompt' ? 'type' : 'pop', upper: false }), null);
        if (ck.key === 'prompt') { var cl = selLayer(); if (cl) cl.e = +(cl.s + Math.min(4, plan.outDur - cl.s)).toFixed(2); }
        return;
      }
      if (t.closest('[data-add-mag]')) {
        var mw = (String(P.title || C.title).split(/\s+/).filter(function (x) { return x.length > 2; })[0] || 'Reels').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 12) || 'REELS';
        addLayer(RS.newLayer('text', mw, { ts: 'magazine', font: 'Playfair Display', fill: '#FFFFFF', line: '#FFFFFF', y: 0.15, size: 1.7, rot: 0, behind: true, all: true, anim: 'fade' }));
        return;
      }
      if (t.closest('[data-add-behind]')) {
        var bt = (st.hook || C.title || 'Watch this').replace(/[.!?…]+$/, '').slice(0, 40);
        addLayer(RS.newLayer('text', bt, { ts: 'plain', font: 'Anton', y: 0.2, size: 1.6, rot: 0, behind: true, anim: 'zoom' }));
        return;
      }
      if ((b = t.closest('[data-lword]'))) {
        var Lw = selLayer(); if (!Lw) return;
        pinLayer(Lw, +b.getAttribute('data-lword'), b.getAttribute('data-wtext')); layersChanged(true);
        if (player) player.seekOut(Math.max(0, Lw.s - 0.4)).then(function () { player.play(); });
        return;
      }
      if (t.closest('[data-lunpin]')) { var Lu = selLayer(); if (Lu) { delete Lu.at; delete Lu.word; layersChanged(true); } return; }
      if ((b = t.closest('[data-wordpop]'))) { wordPopModal(+b.getAttribute('data-wordpop'), b.getAttribute('data-wtext')); return; }
      if (t.closest('[data-board]')) { boardModal(); return; }
      if ((b = t.closest('[data-grade]'))) { set('grade', b.getAttribute('data-grade'), true); return; }
      if (t.closest('[data-pip-x]')) { setPipFile(null); return; }
      if ((b = t.closest('[data-add-emoji]'))) { addLayer(RS.newLayer('emoji', b.getAttribute('data-add-emoji'))); return; }
      if ((b = t.closest('[data-add-badge]'))) { var bd = RS.BADGES[+b.getAttribute('data-add-badge')]; addLayer(RS.newLayer('badge', bd.v, { shape: bd.shape, fill: bd.fill, rot: -6 })); return; }
      if ((b = t.closest('[data-add-shape]'))) { var sk = b.getAttribute('data-add-shape'); addLayer(RS.newLayer('shape', sk, { fill: SHAPE_COLOR[sk], loop: 'none' })); return; }
      if ((b = t.closest('[data-sel]'))) { var id = b.getAttribute('data-sel'); select(selId === id ? null : id); return; }
      if (t.closest('[data-ldone]')) { select(null); return; }
      if (t.closest('[data-ldel]')) { deleteLayer(); return; }
      if (t.closest('[data-ldup]')) { var src = selLayer(); if (src) { var cp = Object.assign({}, src, { id: Math.random().toString(36).slice(2, 10), x: RS.clamp(src.x + 0.05, 0, 1), y: RS.clamp(src.y + 0.05, 0, 1) }); st.layers = st.layers.concat([cp]); layersChanged(false); select(cp.id); } return; }
      if (t.closest('[data-lhere]')) { var Lh = selLayer(); if (Lh) { setLayer('s', +RS.clamp(nowOut(), 0, Math.max(0, plan.outDur - 0.3)).toFixed(2), true); } return; }
      if ((b = t.closest('[data-lchip]'))) {
        var lk = b.getAttribute('data-lchip'), lv = b.getAttribute('data-v');
        if (lk === 'ts') { var sty = RS.TEXT_STYLES.filter(function (x) { return x.key === lv; })[0], cur = selLayer(); if (cur && sty) { cur.fill = sty.fill; cur.line = sty.line; } }
        setLayer(lk, lv, true);
        if ((lk === 'anim') && player && M) { var La = selLayer(); player.seekOut(La.all ? 0 : La.s).then(function () { player.play(); }); }
        return;
      }
      if ((b = t.closest('[data-tprev]'))) {
        if (!player) return;
        var w = b.getAttribute('data-tprev'), at = w === 'in' ? 0 : w === 'out' ? Math.max(0, plan.outDur - 1.6) : Math.max(0, plan.joins[0] - 0.9);
        player.seekOut(at).then(function () { player.play(); }); return;
      }
      if (t.closest('[data-pp]')) { player && player.toggle(); return; }
      if (t.closest('[data-export]')) { doExport(); return; }
      if ((b = t.closest('[data-nudge]'))) { var p = b.getAttribute('data-nudge').split(','), d = +p[1]; if (p[0] === 's') setRange(C.start + d, C.end); else setRange(C.start, C.end + d);
        if (player) RS.seek(M.el, p[0] === 's' ? C.start : Math.max(C.start, C.end - 1.5)).then(player.draw); return; }
      if ((b = t.closest('[data-look]'))) { var l = RS.lookByKey(b.getAttribute('data-look')); st = RS.applyLook(st, l.style, l.key); C.style = st; replan(); drawPanel(); player && player.draw(); saveSoon(); return; }
      if ((b = t.closest('[data-layout]'))) { set('layout', b.getAttribute('data-v'), true); return; }
      if ((b = t.closest('[data-chip]'))) {
        var k = b.getAttribute('data-chip'), v = b.getAttribute('data-v');
        if (['capWords', 'speed'].indexOf(k) >= 0) v = +v;
        set(k, v, true);
        if (k === 'aspect' && M) mountPlayer();
        if (k === 'speed' && player && player.playing()) M.el.playbackRate = v;
        return;
      }
      if (t.closest('[data-templates]')) { templatesModal(); return; }
      if (t.closest('[data-share-tpl]')) { shareModal(); return; }
      if (t.closest('[data-cue-add]')) { cueAdd(); return; }
      if ((b = t.closest('[data-tx]'))) { transcribeClip(b); return; }
      if ((b = t.closest('[data-cue-seek]'))) { var row = b.closest('[data-cue]'); if (player) RS.seek(M.el, +row.getAttribute('data-s')).then(player.draw); return; }
      if ((b = t.closest('[data-cue-del]'))) { cueEdit(b.closest('[data-cue]'), ''); drawPanel(); return; }
      if (t.closest('[data-music-x]')) { delete RS.musicFiles[C.id]; player && player.setMusic(null); set('musicName', '', true); return; }
      if (t.closest('[data-shuffle]')) { postSeed++; C.post = RS.postCopy(C, words(), RS.kit, postSeed); drawPanel(); saveSoon(); return; }
      if (t.closest('[data-copy]')) { var pc = C.post && C.post.caption ? C.post : RS.postCopy(C, words(), RS.kit, postSeed); copy(pc.caption + '\n\n' + pc.hashtags); return; }
      if ((b = t.closest('[data-status]'))) {
        var sv = b.getAttribute('data-status');
        RS.db.saveClip(C.id, { status: sv }).then(function (nc) { C.status = nc.status; drawPanel(); UI.toast(sv === 'ready' ? 'Marked ready ✓' : 'Saved', 'ok'); });
      }
    });
    view.addEventListener('input', function (e) {
      var t = e.target, k = t.getAttribute('data-k');
      if (t.matches('[data-scrub]') && player) { player.seekOut(+t.value / 1000 * plan.outDur); return; }
      var lkey = t.getAttribute('data-lk');
      if (lkey && t.type !== 'checkbox') {
        if (t.type === 'range') { setLayer(lkey, +t.value); var ls = view.querySelector('[data-lshow="' + lkey + '"]'); if (ls) ls.textContent = LSHOW[lkey](+t.value);
          if ((lkey === 's' || lkey === 'len') && player) { var Ls = selLayer(); player.seekOut(lkey === 's' ? Ls.s + 0.5 : Math.max(Ls.s, Ls.e - 0.3)); } }
        else if (t.type === 'color') setLayer(lkey, t.value.toUpperCase());
        else setLayer(lkey, t.value);
        if (lkey === 'v') { var row = view.querySelector('[data-sel="' + selId + '"] span'); var Lv = selLayer(); if (row && Lv) row.textContent = (Lv.t === 'text' ? '✏️ ' : '🏷️ ') + Lv.v.replace(/\n/g, ' '); }
        return;
      }
      if (t.matches('[data-cue-text]')) { cueEdit(t.closest('[data-cue]'), t.value); return; }
      if (t.matches('[data-post]')) {
        var cur = C.post && C.post.caption ? C.post : RS.postCopy(C, words(), RS.kit, postSeed);
        C.post = { caption: cur.caption, hashtags: cur.hashtags }; C.post[t.getAttribute('data-post')] = t.value; saveSoon(); return;
      }
      if (!k) return;
      if (t.type === 'range') {
        set(k, +t.value);
        var show = view.querySelector('[data-show="' + k + '"]');
        if (show) show.textContent = { zoom: 1, zoom2: 1 }[k] ? (+t.value).toFixed(2).replace(/0$/, '') + '×' : k === 'hookSecs' ? t.value + 's' : k === 'transLen' ? (+t.value).toFixed(2) + 's' : k === 'silence' ? (t.value < 0.34 ? 'Gentle' : t.value < 0.67 ? 'Medium' : 'Snappy') : Math.round(t.value * 100) + '%';
        if (k === 'silence') { var hint = t.closest('.ce-sec').querySelector('.ui-hint'); if (hint) hint.innerHTML = 'Reel length: <b>' + plan.outDur.toFixed(1) + 's</b>'; drawTrim(); }
        if (k === 'vol' && player) M.el.volume = RS.clamp(+t.value, 0, 1);
      } else if (t.type === 'text' || t.tagName === 'SELECT') set(k, t.value);
      else if (t.type === 'color') set(k, t.value.toUpperCase());
    });
    view.addEventListener('change', function (e) {
      var t = e.target, k = t.getAttribute('data-k');
      if (t.matches('[data-pipfile]')) { var pf = t.files[0]; if (pf) setPipFile(pf); return; }
      if (t.matches('[data-music]')) { var f = t.files[0]; if (f) { RS.musicFiles[C.id] = f; player && player.setMusic(f); set('musicName', f.name.slice(0, 80), true); } return; }
      if (t.matches('[data-subs]')) {
        var sf = t.files[0]; if (!sf) return;
        sf.text().then(function (txt) {
          var ws = RS.parseSubs(txt);
          if (!ws.length) { UI.toast('No captions found in that file.', 'error'); return; }
          P.transcript = { source: 'srt', words: ws };
          return RS.db.updateProject(pid, { transcript: P.transcript }).then(function () { replan(); drawPanel(); player && player.draw(); UI.toast('Imported captions for the whole video', 'ok'); });
        });
        return;
      }
      if (k === 'srt') { RS.wantSrt = t.checked; return; }
      if (t.type === 'checkbox' && t.getAttribute('data-lk')) { setLayer(t.getAttribute('data-lk'), t.checked, true); if (t.getAttribute('data-lk') === 'behind' && t.checked) needPerson(true); return; }
      if (t.type === 'checkbox' && k) {
        set(k, t.checked, ['captions', 'cutSilence', 'cta', 'transScenes', 'wall'].indexOf(k) >= 0);
        if (k === 'wall' && t.checked) loadWall();
        if ((k === 'gradeWipe' || k === 'wall') && t.checked && player) setTimeout(function () { player.seekOut(0).then(function () { player.play(); }); }, k === 'wall' ? 900 : 0);
      }
    });
    view.addEventListener('keydown', function (e) { if (e.target.matches('[data-title]') && e.key === 'Enter') e.target.blur(); });
    view.addEventListener('focusout', function (e) {
      if (!e.target.matches('[data-title]')) return;
      var v = e.target.value.trim(); if (!v) { e.target.value = C.title; return; }
      if (v !== C.title) { C.title = v; saveSoon(); }
    });
    function onKey(e) {
      if (!player || e.target.closest('input,textarea,select') || document.querySelector('.ui-modal-wrap')) return;
      if (e.key === ' ') { e.preventDefault(); player.toggle(); }
      if (selId && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteLayer(); }
      if (selId && e.key === 'Escape') select(null);
    }
    document.addEventListener('keydown', onKey);
    var onResize = RS.debounce(function () { drawTrim(); }, 120);
    window.addEventListener('resize', onResize);

    var ready = RS.db.project(pid).then(function (p) {
      P = p; C = P.clips.filter(function (c) { return c.id === cid; })[0];
      if (!C) throw Object.assign(new Error('That clip isn\'t here any more.'), { uiApi: true });
      st = RS.fullStyle(C.style); C.style = st;
      if (!RS.kit || !Object.keys(RS.kit).length) RS.db.brand().then(function (b) { RS.kit = b.kit || {}; }).catch(function () {});
      return RS.media.restore(P).catch(function () { return null; });
    }).then(function (m) {
      M = m;
      return M ? RS.loadAnalysis(pid) : null;
    }).then(function (a) {
      A = a; replan(); draw(); wireTrim();
      needPerson(false); loadWall();
      document.title = C.title + ' · ' + UI.config.name;
      RS._clipPage = { plan: function () { return plan; }, media: function () { return M; }, style: function () { return st; }, clip: function () { return C; },
        selected: function () { return selId; }, boxes: function () { return boxes; } };
    });
    return { ready: ready, destroy: function () { dead = true; saveSoon.flush(); saveWordsSoon.flush(); if (player) player.destroy(); var pv = C && pipVid(); if (pv) pv.pause(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); } };
  });
})();

/* ===== home.html ===== */
(function () {
  var esc = UI.esc;
  function prettyName(name) {
    return String(name || 'My video').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'My video';
  }
  function busyModal(msg) {
    var m = UI.modal('<div class="st-busy"><span class="em">🎬</span><h2 style="padding:0">' + esc(msg) + '</h2><p class="muted" data-msg>Hang tight, this is all happening on your device.</p></div>');
    m.el.querySelector('.ui-modal-x').hidden = true;
    return m;
  }
  /* Start a project from a file (or the sample). Exposed for the landing page and tests. */
  RS.startProject = function (file, opts) {
    opts = opts || {};
    if (!file) return Promise.resolve();
    if (file.type && !/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name || '')) { UI.toast('That doesn\'t look like a video file.', 'error'); return Promise.resolve(); }
    var m = busyModal(opts.sample ? 'Unpacking the sample…' : 'Opening your video…');
    return RS.media.probe(file).then(function (meta) {
      return RS.db.createProject({ title: opts.title || prettyName(file.name), file_name: file.name || 'video', file_size: file.size, duration: meta.duration,
        width: meta.width, height: meta.height, thumb: meta.thumb, sample: !!opts.sample }, opts.transcript || null);
    }).then(function (p) {
      return RS.media.open(p.id, file, file.name).then(function () {
        if (!opts.sample) RS.media.keep(p.id, file);
        m.close();
        UI.go('project', p.id, 'find');
      });
    }).catch(function (e) { m.close(); UI.toast(e.message || 'That video didn\'t open.', 'error'); });
  };
  RS.startSample = function () {
    return RS.sample().then(function (s) {
      return RS.startProject(s.blob, { sample: true, title: s.transcript.title, transcript: { source: 'sample', words: s.transcript.words } });
    }, function (e) { UI.toast(e.message, 'error'); });
  };

  function card(p) {
    var bits = [UI.plural(p.clip_count, 'clip')];
    return '<a class="st-card" href="#project/' + esc(p.id) + '" data-go="project/' + esc(p.id) + '">' +
      '<div class="st-thumb' + (!p.thumb && p.sample ? ' sample' : '') + '" style="' + (p.thumb ? 'background-image:url(' + esc(p.thumb) + ')' : '') + '">' + (p.thumb ? '' : p.sample ? '<span class="pip">🍿</span>' : UI.icon('film')) +
      (p.sample ? '<span class="rs-sticker">🍿 Sample</span>' : '') + '<span class="len">' + RS.fmt(p.duration) + '</span></div>' +
      '<div class="body"><h3>' + esc(p.title) + '</h3><div class="meta">' +
      '<span class="ui-badge">' + UI.icon('scissors') + esc(bits[0]) + '</span>' +
      (p.ready_count ? '<span class="ui-badge lime">' + p.ready_count + ' ready</span>' : '') +
      (p.exported_count ? '<span class="ui-badge brand">' + p.exported_count + ' exported</span>' : '') +
      '<span class="small muted">' + esc(UI.ago(p.updated)) + '</span></div></div></a>';
  }

  UI.page('home', { title: 'Studio', nav: 'Studio', icon: 'film', order: 10 }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:150px;margin-bottom:20px"></div><div class="ui-skel" style="height:260px"></div></div>';
    function draw(d) {
      RS.kit = d.brand || {};
      var s = d.stats, local = me ? RS.db.localProjects() : [];
      var hello = me ? 'Hey ' + esc(me.name.split(' ')[0]) + ', got a long one? ✂️' : 'Let\'s chop a video ✂️';
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="st-hero"><div><div class="eyebrow">Studio</div><h1>' + hello + '</h1><p>Drop in a video and we\'ll find the moments worth posting.</p></div>' +
        (s.streak ? '<span class="rs-sticker pink">' + UI.icon('flame') + s.streak + '-day streak</span>' : '') + '</div>' +
        (!me ? '<div class="st-banner"><p>👋 You\'re trying Reelstuber without an account. Your projects stay in this browser.</p>' +
          '<a class="ui-btn sm primary" href="#auth/signup" data-go="auth/signup">Sign up to keep them</a></div>' : '') +
        (local.length ? '<div class="st-banner" data-import-box><p>📦 ' + UI.plural(local.length, 'project') + ' from before you signed in ' + (local.length === 1 ? 'is' : 'are') + ' still in this browser.</p>' +
          '<div class="ui-row"><button class="ui-btn sm ghost" data-import-no>Not now</button><button class="ui-btn sm primary" data-import>Move to my account</button></div></div>' : '') +
        '<label class="st-drop" data-drop><span class="ic">' + UI.icon('upload') + '</span>' +
          '<div><h2>Drop a video here</h2><p>MP4, MOV or WebM, any length. We\'ll find the best bits.</p></div>' +
          '<div class="btns"><span class="ui-btn primary lg" data-pick>' + UI.icon('film') + 'Choose a video</span>' +
          '<button type="button" class="ui-btn lime lg" data-sample>🍿 Try the sample</button></div>' +
          '<input type="file" accept="video/*,.mkv,.mov" data-file hidden></label>' +
        '<div class="st-under"><span class="rs-lock">' + UI.icon('lock') + 'Your video never leaves this device. We only save your edits.</span>' +
          (RS.canExport() ? '' : '<span class="ui-badge warn">This browser can\'t export video. Use Chrome, Edge or Safari on a computer.</span>') + '</div>' +
        '<div class="st-stats"><div class="st-stat"><b>' + s.exports + '</b><span>reels exported</span></div>' +
          '<div class="st-stat"><b>' + s.minutes_saved + '</b><span>minutes of editing saved</span></div>' +
          '<div class="st-stat"><b>' + s.streak + ' 🔥</b><span>day streak</span></div>' +
          '<div class="st-stat"><b>' + d.projects.length + '</b><span>' + (d.projects.length === 1 ? 'project' : 'projects') + '</span></div></div>' +
        '<div class="st-sec"><h2>Your projects</h2>' + (d.projects.length ? '<span class="muted small">' + UI.plural(d.projects.length, 'video') + '</span>' : '') + '</div>' +
        (d.projects.length ? '<div class="st-grid" data-projects>' + d.projects.map(card).join('') + '</div>'
          : '<div class="ui-empty" style="margin-bottom:40px">' + UI.icon('film') + '<h3>No projects yet</h3><p>Drop a video above, or try the sample to see how it works.</p></div>') +
        '<div class="st-sec"><h2>Badges</h2><span class="muted small">' + d.badges.filter(function (b) { return b.got; }).length + ' of ' + d.badges.length + '</span></div>' +
        '<div class="st-badges">' + d.badges.map(function (b) {
          return '<div class="st-badge' + (b.got ? ' got' : '') + '" title="' + esc(b.desc) + '"><span class="em">' + b.emoji + '</span><b>' + esc(b.name) + '</b><small>' + esc(b.desc) + '</small></div>';
        }).join('') + '</div></div>';
      wire();
    }
    function wire() {
      var drop = view.querySelector('[data-drop]'), input = view.querySelector('[data-file]');
      drop.addEventListener('click', function (e) {
        if (e.target.closest('[data-sample]')) { e.preventDefault(); RS.startSample(); }
      });
      input.addEventListener('change', function () { RS.startProject(input.files[0]); input.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
      drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) RS.startProject(f); });
    }
    view.addEventListener('click', function (e) {
      if (e.target.closest('[data-import-no]')) { view.querySelector('[data-import-box]').remove(); return; }
      var imp = e.target.closest('[data-import]');
      if (imp) {
        var local = RS.db.localProjects();
        UI.busy(imp, UI.api('projects_import', local)).then(function (r) {
          return Promise.all(r.imported.map(function (x) {
            return RS.vault.get('video-' + x.local_id).then(function (f) { return f ? RS.vault.save('video-' + x.id, f).then(function () { return RS.vault.drop('video-' + x.local_id); }) : null; });
          })).then(function () {
            RS.db.forgetLocal(local.map(function (p) { return p.id; }));
            UI.toast('Moved ' + UI.plural(r.imported.length, 'project') + ' to your account.', 'ok');
            return load();
          });
        });
      }
    });
    function load() { return RS.db.home().then(draw); }
    return load();
  });
})();

/* ===== landing.html ===== */
(function () {
  var COPY = {
    eyebrow: 'For YouTubers, podcasters & streamers',
    title: 'One long video in.<br><em>A week of reels</em> out.',
    lead: 'Drop in your video. Reelstuber finds the moments worth posting, reframes them to 9:16, adds bouncy word-by-word captions and exports ready-to-post reels. Right on your own device: nothing gets uploaded.',
    proof: ['🔒 Your video never leaves your device', '🚫 No watermark', '⚡ Works in your browser'],
    strip: ['Find the bangers', 'Reframe to 9:16', 'Pop-up captions', 'Cut the silences', 'Hooks & end cards', 'No uploads', 'No watermark'],
    stepsTitle: 'How it works',
    stepsLead: 'From a 40-minute video to a stack of reels in a coffee break.',
    steps: [['✂️', 'Drop your video', 'MP4, MOV or WebM, any length. It opens instantly: nothing to upload, no waiting in a queue.'],
            ['🔥', 'It finds the bangers', 'Reelstuber listens for the loud bits, spots scene changes and pauses, and picks the best 15-90 second moments.'],
            ['🎨', 'Tweak & export', 'Drag to reframe, pick a caption style, throw on text, stickers and transitions. Export MP4s ready for Reels, TikTok and Shorts.']],
    featuresTitle: 'Everything people ask for',
    features: [['wand', 'Auto-find the best moments', 'Every clip gets a score and a label: hype spike, story time, quotable, strong hook. Pick a vibe and a length.'],
               ['crop', 'Smart reframing', 'Fill, fit with a blurred background, a sticker frame, or split screen for podcasts and gameplay. Drag to move, pinch to zoom.'],
               ['cc', 'Captions that pop', 'Six animated styles with auto emoji. Write them on your device, import your .srt, or type them yourself.'],
               ['scissors', 'Cut the silences', 'Jump-cut the pauses out in one tap, with a zoom, flash, whip or glitch at every cut.'],
               ['type', 'Text & stickers', 'Outlined text in 11 fonts, emoji and word stickers, arrows and circles. Drag them anywhere, make them pop in, wiggle or float.'],
               ['music', 'Background music', 'Add a track from your device. It ducks under speech so your words still land.'],
               ['palette', 'Brand kit & templates', 'Save your look once. Borrow looks from other creators, or share yours.'],
               ['list', 'Chapters to clips', 'Paste the timestamps from your YouTube description and get a clip per chapter.'],
               ['share', 'Post-ready text', 'A caption and hashtags written from what\'s said in the clip. Copy, share, done.']],
    faq: [['Is my video uploaded anywhere?', 'No. Reelstuber cuts, captions and exports your video inside your browser. We only save your edits (clip times, styles, the post text and captions if you make them) so you can come back later. Signed out, even those stay in your browser.'],
          ['Can I paste a YouTube link?', 'No: YouTube doesn\'t let other sites download its videos. Use your own copy instead: in YouTube Studio go to Content, open the ⋮ menu next to the video and choose Download. Only use videos you have the rights to.'],
          ['Is it free? Is there a watermark?', 'It\'s free while we\'re growing, and there\'s no watermark. Your handle only shows if you add it.'],
          ['Which browsers work?', 'Editing works in any modern browser. Exporting works best in Chrome, Edge or Safari on a computer. Each reel plays through once while it records, so a 30-second reel takes about 30 seconds.'],
          ['How do the captions work?', 'Three ways: write them on your device (speech-to-text runs in your browser; the first time it downloads a small model), import an .srt or .vtt file, or type them in. You can edit every word.'],
          ['Do I need an account?', 'No. Try everything without one: your projects stay in this browser. Sign up to keep them in your account, save a brand kit and share templates.']],
    bandTitle: 'Your next ten reels are already in that video.',
    bandLead: 'Go find them. It\'s free, and nothing gets uploaded.'
  };
  var esc = UI.esc;

  function heroArt() {
    return '<div class="lp-ba" data-ba><div class="side lp-long" aria-hidden="true"><img data-long alt=""><span class="len">1:12:40 · episode 48</span><div class="tl">' +
      '<i style="left:8%;width:14%;background:#FF3D8B"></i><i style="left:38%;width:18%;background:#C6F432"></i><i style="left:70%;width:12%;background:#7B5CFF"></i><b></b></div></div>' +
      '<div class="side lp-cuts" aria-hidden="true"><div class="lp-reel"><canvas data-reel="0"></canvas></div><div class="lp-reel"><canvas data-reel="1"></canvas></div><div class="lp-reel"><canvas data-reel="2"></canvas></div></div>' +
      '<span class="lbl l" aria-hidden="true">One long video</span><span class="lbl r" aria-hidden="true">Three reels, ready to post</span>' +
      '<input type="range" min="0" max="100" value="50" aria-label="Drag to compare the long video with the reels cut from it"><span class="handle"></span></div>';
  }
  function drawArt(view) {
    var img = view.querySelector('[data-long]'); if (img) img.src = RS.demoSource().toDataURL('image/png');
    var reels = [[RS.LOOKS[0], 'Wait for it… 👀', 1.4], [RS.LOOKS[1], '', 1.2], [RS.LOOKS[4], 'Story time 🍿', 2.2]];
    view.querySelectorAll('[data-reel]').forEach(function (cv) {
      var r = reels[+cv.getAttribute('data-reel')];
      RS.stylePreview(cv, RS.applyLook(RS.fullStyle({ aspect: '9:16', handle: '@pip' }), r[0].style, r[0].key), { width: 210, hook: r[1], t: r[2] });
    });
  }

  UI.page('landing', { title: 'Turn long videos into reels' }, function (view, ctx) {
    var me = ctx.me, C = COPY;
    var strip = C.strip.map(function (s) { return '<span>✦</span>' + esc(s); }).join('');
    view.innerHTML =
      '<section class="lp-hero"><div class="ui-wrap"><div class="lp-pitch">' +
        '<div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1><p class="lp-lead">' + esc(C.lead) + '</p>' +
        '<div class="lp-cta"><a class="ui-btn primary lg" href="#home" data-go="home">' + (me ? 'Open the Studio ' : 'Try it free, no sign-up ') + UI.icon('arrow') + '</a>' +
        '<button class="ui-btn lime lg" data-sample-go>🍿 Watch it cut a sample</button></div>' +
        '<div class="lp-proof">' + C.proof.map(function (p, i) { return '<span class="rs-sticker' + (i === 1 ? ' pink' : i === 2 ? ' plain' : '') + '">' + esc(p) + '</span>'; }).join('') + '</div>' +
      '</div>' + heroArt() + '</div></section>' +
      '<div class="lp-strip" aria-hidden="true"><div>' + strip + strip + '</div></div>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.stepsTitle) + '</h2><p>' + esc(C.stepsLead) + '</p></div>' +
        '<div class="lp-steps">' + C.steps.map(function (s) { return '<div class="ui-card lp-step"><span class="em">' + s[0] + '</span><h3>' + esc(s[1]) + '</h3><p class="muted">' + esc(s[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.featuresTitle) + '</h2></div>' +
        '<div class="ui-grid lp-features">' + C.features.map(function (f) { return '<div class="ui-card lp-feature"><span class="ic">' + UI.icon(f[0]) + '</span><h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions</h2></div><div class="lp-faq">' +
        C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div><h2>' + esc(C.bandTitle) + '</h2><p>' + esc(C.bandLead) + '</p></div>' +
        '<a class="ui-btn dark lg" href="#home" data-go="home">Start cutting ' + UI.icon('scissors') + '</a></div></div></section>';
    view.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sample-go]');
      if (b) UI.busy(b, RS.startSample());
    });
    var ba = view.querySelector('[data-ba]');
    if (ba) ba.querySelector('input').addEventListener('input', function (e) { ba.style.setProperty('--x', e.target.value + '%'); });
    return RS.fontsReady().then(function () { drawArt(view); });
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== project.html ===== */
(function () {
  var esc = UI.esc;
  var COLORS = ['#FF3D8B', '#7B5CFF', '#C6F432', '#FFB23D', '#22E6D0', '#FF8FC1'];
  var LENGTHS = [15, 30, 45, 60, 90], COUNTS = [3, 5, 8, 12];

  UI.page('project', { title: 'Project' }, function (view, ctx) {
    var pid = ctx.args[0], autoFind = ctx.args[1] === 'find';
    var P = null, M = null, A = null, analyzing = null, sel = null, inT = null, outT = null, dead = false, raf = 0, stopAt = null, busy = false;
    var settings = { length: 30, count: 5, vibe: 'balanced', replace: true };
    var thumbImgs = [];
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:60px;margin-bottom:18px"></div><div class="ui-skel" style="height:420px"></div></div>';

    function words() { return P.transcript && P.transcript.words || []; }
    function clipById(id) { return P.clips.filter(function (c) { return c.id === id; })[0]; }
    function thumbFor(t) {
      if (A && A.thumbs.length) { var best = A.thumbs[0]; A.thumbs.forEach(function (x) { if (Math.abs(x.t - t) < Math.abs(best.t - t)) best = x; }); return best.src; }
      return P.thumb || '';
    }
    function clipRow(c, i) {
      var st = RS.fullStyle(c.style), dur = c.end - c.start;
      var status = { draft: '<span class="ui-badge">Draft</span>', ready: '<span class="ui-badge lime">Ready</span>',
        exported: '<span class="ui-badge brand">' + UI.icon('check') + 'Exported' + (c.export_count > 1 ? ' ×' + c.export_count : '') + '</span>' }[c.status] || '';
      var th = thumbFor(c.start + Math.min(2, dur / 2));
      return '<div class="pj-clip' + (sel === c.id ? ' sel' : '') + '" data-clip="' + esc(c.id) + '">' +
        '<div class="th" style="' + (th ? 'background-image:url(' + esc(th) + ');background-position:' + Math.round(st.fx * 100) + '% 50%' : '') + '"><b>#' + (i + 1) + '</b></div>' +
        '<div style="min-width:0"><h4>' + esc(c.title || 'Clip') + '</h4><div class="meta"><span>' + RS.fmt(c.start) + '–' + RS.fmt(c.end) + ' · ' + Math.round(dur) + 's</span>' +
        (c.score != null ? '<span class="pj-score">' + Math.round(c.score) + '</span>' : '') + (c.label ? '<span>' + esc(c.label) + '</span>' : '') + status + '</div></div>' +
        '<div class="acts"><a class="ui-btn sm primary" href="#clip/' + esc(pid) + '/' + esc(c.id) + '" data-go="clip/' + esc(pid) + '/' + esc(c.id) + '">' + UI.icon('edit') + 'Edit</a>' +
        '<div class="pj-menu"><button class="ui-btn sm" data-more aria-label="More">' + UI.icon('more') + '</button></div></div></div>';
    }
    function chips(name, list, cur, fmt) {
      return '<div class="rs-chips">' + list.map(function (v) { return '<button type="button" class="rs-chip' + (String(v) === String(cur) ? ' on' : '') + '" data-set="' + name + '" data-v="' + v + '">' + (fmt ? fmt(v) : v) + '</button>'; }).join('') + '</div>';
    }
    function findCard() {
      var tooShort = P.duration < 8;
      return '<div class="ui-card pj-find" data-find><h3>' + UI.icon('wand') + 'Find reels</h3>' +
        '<div class="row"><span>Length</span>' + chips('length', LENGTHS, settings.length, function (v) { return v + 's'; }) + '</div>' +
        '<div class="row"><span>How many</span>' + chips('count', COUNTS, settings.count) + '</div>' +
        '<div class="row"><span>Vibe</span><div class="ui-seg">' + [['hype', '🔥 Hype'], ['balanced', '⚖️ Mix'], ['story', '💬 Story']].map(function (o) {
          return '<button type="button" data-set="vibe" data-v="' + o[0] + '" class="' + (settings.vibe === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div></div>' +
        (P.clips.some(function (c) { return c.source === 'auto'; }) ? RS.switchHtml('replace', 'Replace untouched drafts', settings.replace, 'Clips you edited, marked ready or exported always stay.') : '') +
        '<div data-run hidden class="pj-run"><b data-run-msg>Getting ready…</b><div class="rs-progress"><i data-run-bar></i></div></div>' +
        '<button class="ui-btn primary lg block" data-find-go style="margin-top:10px"' + (M && !tooShort ? '' : ' disabled') + '>' + UI.icon('sparkle') + (P.clips.length ? 'Find more reels' : 'Find my reels') + '</button>' +
        (A && A.notes.length ? '<p class="ui-hint">' + esc(A.notes.join(' ')) + '</p>' : '') +
        (tooShort ? '<p class="ui-hint">This video is very short: add a clip by hand instead.</p>' : '') + '</div>';
    }
    function draw() {
      var exportable = P.clips.filter(function (c) { return c.status !== 'exported'; }).length;
      var tr = words().length;
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="pj-head"><a class="ui-btn sm ghost" href="#home" data-go="home">' + UI.icon('back') + 'Studio</a>' +
        '<div class="grow"><input class="pj-title" data-title value="' + esc(P.title) + '" maxlength="120" aria-label="Project name">' +
        '<div class="pj-meta"><span>' + RS.fmt(P.duration) + '</span><span>·</span><span>' + (P.width ? P.width + '×' + P.height : '') + '</span><span>·</span><span>' + RS.size(P.file_size) + '</span>' +
        (P.sample ? '<span class="rs-sticker">🍿 Sample</span>' : '') + '<span class="pj-cap ui-badge' + (tr ? ' lime' : '') + '">' + UI.icon('cc') + (tr ? UI.plural(tr, 'caption word') : 'No captions yet') + '</span></div></div>' +
        '<div class="pj-menu"><button class="ui-btn sm" data-pmore>' + UI.icon('more') + 'More</button></div></div>' +
        '<div class="pj-grid"><div>' +
        (M ? '<div class="pj-stage"><div class="pj-video" data-video><button class="big-play" data-play-big aria-label="Play">' + UI.icon('play') + '</button></div>' +
          '<div class="pj-tl-wrap"><span data-tl-msg hidden>Reading your video…</span><canvas class="pj-tl" data-tl></canvas><div class="pj-ctrl">' +
          '<button class="ui-btn sm" data-play aria-label="Play or pause">' + UI.icon('play') + '</button><span class="pj-time" data-time>0:00 / ' + RS.fmt(P.duration) + '</span>' +
          '<span class="ui-spacer"></span><button class="ui-btn sm" data-in>[ In</button><button class="ui-btn sm" data-out>Out ]</button>' +
          '<button class="ui-btn sm lime" data-add>' + UI.icon('plus') + 'Add clip</button></div>' +
          '<div class="pj-ctrl"><button class="ui-btn sm" data-chapters>' + UI.icon('list') + 'Chapters → clips</button><button class="ui-btn sm" data-captions>' + UI.icon('cc') + 'Captions</button>' +
          '<span class="ui-spacer"></span><span class="rs-lock">' + UI.icon('lock') + 'On this device</span></div></div></div>'
          : '<label class="pj-relink" data-relink><span class="em">📼</span><h3>Where\'s the video?</h3><p class="muted">Reelstuber never uploads your video, so it needs the file again on this device: <b>' +
            esc(P.file_name) + '</b> (' + RS.size(P.file_size) + ', ' + RS.fmt(P.duration) + '). Your clips and edits are safe.</p>' +
            '<span class="ui-btn primary">' + UI.icon('upload') + 'Choose the file</span><input type="file" accept="video/*,.mkv,.mov" data-relink-file hidden></label>') +
        '</div><div class="pj-side">' + findCard() +
        '<div><div class="pj-clips-head"><h3>Clips <span class="muted">(' + P.clips.length + ')</span></h3>' +
        (P.clips.length && M ? '<button class="ui-btn sm" data-export-all' + (exportable ? '' : ' disabled') + '>' + UI.icon('download') + 'Export all (' + exportable + ')</button>' : '') + '</div>' +
        (P.clips.length ? '<div class="pj-clips">' + P.clips.map(clipRow).join('') + '</div>'
          : '<div class="ui-empty">' + UI.icon('scissors') + '<h3>No clips yet</h3><p>Tap <b>Find my reels</b>, or mark In and Out on the timeline and add one.</p></div>') +
        '</div></div></div></div>';
      if (M) mountVideo();
      else wireRelink();
    }

    /* ---------- the source player + timeline */
    function mountVideo() {
      var box = view.querySelector('[data-video]'), v = M.el;
      v.controls = false; v.muted = false; v.playbackRate = 1;
      box.insertBefore(v, box.firstChild);
      if (A) { thumbImgs = A.thumbs.map(function (x) { var im = new Image(); im.onload = drawTl; im.src = x.src; return { t: x.t, im: im }; }); }
      var tl = view.querySelector('[data-tl]');
      function seekFromEvent(e) {
        var r = tl.getBoundingClientRect(), t = RS.clamp((e.clientX - r.left) / r.width, 0, 1) * P.duration;
        var hit = P.clips.filter(function (c) { return t >= c.start && t <= c.end; })[0];
        if (hit && e.type === 'pointerdown') select(hit.id, false);
        stopAt = null; RS.seek(v, t).then(drawTl);
      }
      var dragging = false;
      tl.addEventListener('pointerdown', function (e) { dragging = true; tl.setPointerCapture(e.pointerId); seekFromEvent(e); });
      tl.addEventListener('pointermove', function (e) { if (dragging) seekFromEvent(e); });
      tl.addEventListener('pointerup', function () { dragging = false; });
      v.onplay = v.onpause = function () { box.classList.toggle('playing', !v.paused); var b = view.querySelector('[data-play]'); if (b) b.innerHTML = UI.icon(v.paused ? 'play' : 'pause'); };
      v.onplay(); drawTl(); loop();
    }
    function loop() {
      if (dead) return;
      if (M && !M.el.paused) {
        if (stopAt != null && M.el.currentTime >= stopAt) { M.el.pause(); stopAt = null; }
        drawTl();
      }
      raf = requestAnimationFrame(loop);
    }
    function drawTl() {
      var tl = view.querySelector('[data-tl]'); if (!tl || !M) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1), W = tl.clientWidth * dpr, H = tl.clientHeight * dpr;
      if (tl.width !== W || tl.height !== H) { tl.width = W; tl.height = H; }
      var g = tl.getContext('2d'), D = P.duration, th = H * 0.56, dark = document.documentElement.classList.contains('ui-dark');
      g.clearRect(0, 0, W, H);
      g.fillStyle = dark ? '#2C1F4A' : '#FFEEDB'; g.fillRect(0, 0, W, H);
      if (thumbImgs.length) {
        var tw = th * 16 / 9, n = Math.ceil(W / tw);
        for (var i = 0; i < n; i++) {
          var t = (i + 0.5) * tw / W * D, best = thumbImgs[0];
          thumbImgs.forEach(function (x) { if (Math.abs(x.t - t) < Math.abs(best.t - t)) best = x; });
          if (best.im.complete && best.im.naturalWidth) g.drawImage(best.im, i * tw, 0, tw, th);
        }
        g.fillStyle = 'rgba(26,16,51,.25)'; g.fillRect(0, 0, W, th);
      } else {
        g.fillStyle = dark ? '#3A2B5C' : '#EADBC6'; g.fillRect(0, 0, W, th);
        g.fillStyle = dark ? '#C6B9DD' : '#5E5277'; g.font = '600 ' + Math.round(12 * dpr) + 'px "DM Sans"'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(analyzing ? (view.querySelector('[data-tl-msg]') || {}).textContent || 'Reading your video…' : 'Timeline', W / 2, th / 2);
      }
      if (A && A.env) {
        var base = H - 4 * dpr, hh = H - th - 8 * dpr;
        g.fillStyle = dark ? '#9C85FF' : '#7B5CFF';
        for (var x = 0; x < W; x += 2 * dpr) {
          var t0 = x / W * D, t1 = (x + 2 * dpr) / W * D, mx = 0;
          for (var tt = t0; tt < t1; tt += RS.HOP) mx = Math.max(mx, RS.levelAt(A, tt));
          var bh = Math.max(1 * dpr, mx * hh);
          g.fillRect(x, base - bh, 1.4 * dpr, bh);
        }
        g.fillStyle = dark ? '#FFF4FA' : '#1A1033';
        (A.cuts || []).forEach(function (c) { g.fillRect(c / D * W - dpr / 2, th, dpr, 5 * dpr); });
      }
      P.clips.forEach(function (c, i) {
        var x0 = c.start / D * W, x1 = c.end / D * W, col = COLORS[i % COLORS.length];
        g.globalAlpha = sel === c.id ? 0.55 : 0.32; g.fillStyle = col; g.fillRect(x0, 0, Math.max(2, x1 - x0), H);
        g.globalAlpha = 1; g.fillStyle = col; g.fillRect(x0, 0, Math.max(2, x1 - x0), 5 * dpr);
        g.strokeStyle = '#1A1033'; g.lineWidth = (sel === c.id ? 3 : 1.5) * dpr; g.strokeRect(x0, 1, Math.max(2, x1 - x0), H - 2);
        g.fillStyle = '#1A1033'; g.font = '800 ' + Math.round(11 * dpr) + 'px "DM Sans"'; g.textAlign = 'left'; g.textBaseline = 'top';
        if (x1 - x0 > 18 * dpr) g.fillText('#' + (i + 1), x0 + 4 * dpr, 8 * dpr);
      });
      if (inT != null || outT != null) {
        var a = (inT != null ? inT : 0) / D * W, b = (outT != null ? outT : D) / D * W;
        g.fillStyle = 'rgba(198,244,50,.45)'; g.fillRect(a, 0, Math.max(2, b - a), H);
        g.fillStyle = '#1A1033'; if (inT != null) g.fillRect(a - dpr, 0, 2 * dpr, H); if (outT != null) g.fillRect(b - dpr, 0, 2 * dpr, H);
      }
      var px = M.el.currentTime / D * W;
      g.fillStyle = '#FF3D8B'; g.fillRect(px - 1.5 * dpr, 0, 3 * dpr, H);
      g.beginPath(); g.moveTo(px - 7 * dpr, 0); g.lineTo(px + 7 * dpr, 0); g.lineTo(px, 9 * dpr); g.closePath(); g.fill();
      var tm = view.querySelector('[data-time]'); if (tm) tm.textContent = RS.fmt(M.el.currentTime) + ' / ' + RS.fmt(D);
    }
    function select(id, play) {
      sel = id;
      view.querySelectorAll('[data-clip]').forEach(function (el) { el.classList.toggle('sel', el.getAttribute('data-clip') === id); });
      var c = clipById(id);
      if (c && M) {
        RS.seek(M.el, c.start).then(function () { drawTl(); if (play) { stopAt = c.end; M.el.play().catch(function () {}); } });
      }
      drawTl();
    }

    /* ---------- relink: the video isn't on this device */
    function wireRelink() {
      var box = view.querySelector('[data-relink]'), input = view.querySelector('[data-relink-file]');
      if (!box) return;
      function use(f) {
        if (!f) return;
        var go = function () {
          RS.media.open(pid, f, f.name).then(function (m) {
            M = m; RS.media.keep(pid, f);
            if (Math.abs(m.duration - P.duration) > 1.5) UI.toast('That file\'s length doesn\'t match the project, but we\'ll use it.', 'error');
            return RS.loadAnalysis(pid);
          }).then(function (a) { A = a; draw(); }, function (e) { UI.toast(e.message, 'error'); });
        };
        if (P.file_name && f.name !== P.file_name) {
          UI.confirm({ title: 'Use ' + f.name + '?', text: 'This project was made from ' + P.file_name + '. Clips keep their times, so the same video works best.', ok: 'Use it' })
            .then(function (yes) { if (yes) go(); });
        } else go();
      }
      input.addEventListener('change', function () { use(input.files[0]); input.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.remove('over'); }); });
      box.addEventListener('drop', function (e) { use(e.dataTransfer && e.dataTransfer.files[0]); });
    }

    /* ---------- Find reels */
    var MSGS = ['Listening for the loud bits…', 'Hunting for punchlines…', 'Spotting scene changes…', 'Ranking the bangers…'];
    function runFind() {
      if (busy || !M) return Promise.resolve();
      busy = true;
      var card = view.querySelector('[data-find]'), run = card.querySelector('[data-run]'), bar = card.querySelector('[data-run-bar]'), msg = card.querySelector('[data-run-msg]'), btn = card.querySelector('[data-find-go]');
      run.hidden = false; btn.disabled = true;
      function prog(f, m) { bar.style.width = Math.round(f * 100) + '%'; msg.textContent = m || MSGS[Math.floor(f * 3.9)]; }
      if (analyzing) { prog(0.3, 'Still reading your video…'); analyzing.holder.onProgress = prog; }
      return (A ? Promise.resolve(A) : (analyzing || startAnalysis(prog))).then(function (a) {
        A = a; prog(1, 'Ranking the bangers…');
        var found = RS.findClips(A, words(), settings);
        if (!found.length) throw Object.assign(new Error('We couldn\'t find good moments for that length. Try a shorter length.'), { uiApi: true });
        var clips = found.map(function (c) { return Object.assign(c, { style: RS.styleFor({ hook: c.hook }) }); });
        clips.forEach(function (c) { delete c.hook; });
        var replace = settings.replace && P.clips.some(function (c) { return c.source === 'auto'; });
        RS.db.updateProject(pid, { settings: { length: String(settings.length), count: String(settings.count), vibe: settings.vibe } }).catch(function () {});
        return RS.db.addClips(pid, clips, replace);
      }).then(function (r) {
        busy = false;
        P.clips = r.clips; sel = r.added[0] || null;
        draw();
        RS.confetti(90);
        UI.toast('Found ' + UI.plural(r.added.length, 'reel') + '! Tap Edit to make one yours.', 'ok');
      }, function (e) {
        busy = false;
        if (view.isConnected) { run.hidden = true; btn.disabled = false; }
        throw e;
      });
    }
    RS._findForTests = function () { return runFind(); };
    /* Read the video once (sound + pictures) so the timeline and thumbnails show up. Runs quietly in the background. */
    function startAnalysis(prog) {
      var holder = { onProgress: prog || null };
      analyzing = RS.analyze(M, function (f, m) {
        if (holder.onProgress) holder.onProgress(f, m);
        var lbl = view.querySelector('[data-tl-msg]'); if (lbl) lbl.textContent = 'Reading your video… ' + Math.round(f * 100) + '%';
      }).then(function (a) {
        analyzing = null; A = a;
        if (!dead && !busy) {
          thumbImgs = A.thumbs.map(function (x) { var im = new Image(); im.onload = drawTl; im.src = x.src; return { t: x.t, im: im }; });
          var list = view.querySelector('.pj-clips'); if (list) list.innerHTML = P.clips.map(clipRow).join('');
          drawTl();
        }
        return a;
      }, function (e) { analyzing = null; throw e; });
      analyzing.holder = holder;
      return analyzing;
    }

    /* ---------- adding clips by hand, chapters */
    function addClip() {
      var v = M.el, L = settings.length;
      var s = inT != null ? inT : v.currentTime, e = outT != null && outT > s + 1 ? outT : Math.min(P.duration, s + L);
      if (e - s < 1) { UI.toast('Move the playhead back a little: a clip needs at least 1 second.', 'error'); return; }
      var ws = RS.wordsIn(words(), s, e);
      var title = ws.length ? ws.slice(0, 6).map(function (w) { return w[2]; }).join(' ').replace(/[.,!?]+$/, '') : 'Clip at ' + RS.fmt(s);
      RS.db.addClips(pid, [{ start: +s.toFixed(2), end: +e.toFixed(2), title: title, source: 'manual', style: RS.styleFor() }]).then(function (r) {
        P.clips = r.clips; sel = r.added[0]; inT = outT = null; draw(); UI.toast('Clip added', 'ok');
      });
    }
    function chaptersModal() {
      var m = UI.modal('<h2>Chapters → clips</h2><p class="muted">Paste your video\'s chapter timestamps (like in a YouTube description). Each chapter becomes a clip.</p>' +
        '<form class="ui-stack" data-ch><textarea name="text" rows="7" placeholder="0:00 Intro&#10;0:12 The microwave story&#10;0:27 Pickle popcorn verdict"></textarea>' +
        '<label class="ui-field"><span>Clip length</span><select name="mode"><option value="first">First ' + settings.length + ' s of each chapter</option>' +
        '<option value="whole">The whole chapter (up to 3 minutes)</option></select></label>' +
        '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary">' + UI.icon('scissors') + 'Make clips</button></div></form>');
      m.el.querySelector('[data-ch]').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = UI.formData(e.target), ch = RS.parseChapters(v.text, P.duration);
        if (!ch.length) { UI.toast('No timestamps found. Use lines like "1:23 Title".', 'error'); return; }
        var clips = ch.map(function (c) {
          var end = v.mode === 'whole' ? Math.min(c.end, c.start + 180) : Math.min(c.end, c.start + settings.length);
          return { start: c.start, end: end, title: c.title, label: '📑 Chapter', source: 'chapter', style: RS.styleFor({ hook: c.title }) };
        }).filter(function (c) { return c.end - c.start >= 1; });
        UI.busy(e.target.querySelector('.primary'), RS.db.addClips(pid, clips)).then(function (r) { m.close(); P.clips = r.clips; draw(); UI.toast('Made ' + UI.plural(r.added.length, 'clip') + ' from chapters', 'ok'); });
      });
    }

    /* ---------- captions for the whole project */
    function captionsModal() {
      var n = words().length, src = P.transcript && P.transcript.source;
      var m = UI.modal('<h2>Captions</h2><p class="muted">' + (n ? 'This project has <b>' + UI.plural(n, 'word') + '</b> of captions' + (src ? ' (' + esc({ whisper: 'written on this device', srt: 'from a subtitle file', sample: 'from the sample', manual: 'typed by you' }[src] || src) + ')' : '') + '.'
        : 'No captions yet. Pick a way to add them: they show up on every clip, word by word.') + '</p>' +
        '<div class="ui-stack"><div class="ui-card flat tight"><h4>' + UI.icon('wand') + ' Write them on this device <span class="ui-badge">beta</span></h4>' +
        '<p class="small muted">Speech-to-text runs in your browser. The first time, it downloads a small model (about 40 MB). Your sound never leaves this device.</p>' +
        '<div class="ui-row"><select data-lang style="max-width:200px"><option value="en">English</option><option value="multi">Another language</option></select>' +
        '<select data-scope style="max-width:220px"><option value="clips">Just my clips (' + P.clips.length + ')</option>' + (P.duration <= 1200 ? '<option value="all">The whole video</option>' : '') + '</select>' +
        '<button class="ui-btn primary" data-tx' + (M && (P.clips.length || P.duration <= 1200) ? '' : ' disabled') + '>' + UI.icon('wand') + 'Start</button></div>' +
        '<div data-tx-run hidden class="pj-run"><b data-tx-msg>Starting…</b><div class="rs-progress"><i data-tx-bar></i></div></div></div>' +
        '<div class="ui-card flat tight"><h4>' + UI.icon('upload') + ' Import a subtitle file</h4><p class="small muted">An .srt or .vtt file (YouTube Studio → Subtitles → Download). Replaces what\'s here.</p>' +
        '<label class="ui-btn">' + UI.icon('upload') + 'Choose .srt / .vtt<input type="file" accept=".srt,.vtt,text/vtt" data-subs hidden></label></div>' +
        (n ? '<button class="ui-btn danger" data-clear>' + UI.icon('trash') + 'Remove all captions</button>' : '') + '</div>');
      var el = m.el;
      el.querySelector('[data-subs]').addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return;
        f.text().then(function (txt) {
          var ws = RS.parseSubs(txt);
          if (!ws.length) throw Object.assign(new Error('No captions found in that file.'), { uiApi: true });
          return saveWords(ws, 'srt').then(function () { m.close(); UI.toast('Imported ' + UI.plural(ws.length, 'word'), 'ok'); });
        });
      });
      var clr = el.querySelector('[data-clear]');
      if (clr) clr.onclick = function () { saveWords([], 'manual').then(function () { m.close(); UI.toast('Captions removed'); }); };
      el.querySelector('[data-tx]').onclick = function (e) {
        var btn = e.currentTarget, lang = el.querySelector('[data-lang]').value, scope = el.querySelector('[data-scope]').value;
        var ranges = scope === 'all' ? [[0, P.duration]] : mergeRanges(P.clips.map(function (c) { return [c.start, c.end]; }));
        if (scope === 'all') { ranges = []; for (var t = 0; t < P.duration; t += 60) ranges.push([t, Math.min(P.duration, t + 60)]); }
        var run = el.querySelector('[data-tx-run]'), bar = el.querySelector('[data-tx-bar]'), msg = el.querySelector('[data-tx-msg]');
        run.hidden = false; btn.disabled = true;
        RS.transcribe(M, ranges, lang, function (f, t) { bar.style.width = Math.round(f * 100) + '%'; msg.textContent = t; }).then(function (ws) {
          return saveWords(RS.mergeWords(words(), ws, ranges), 'whisper').then(function () { m.close(); UI.toast('Captions ready: ' + UI.plural(ws.length, 'word'), 'ok'); RS.confetti(60); });
        }).catch(function (err) { run.hidden = true; btn.disabled = false; UI.toast(err.message, 'error'); });
      };
    }
    function mergeRanges(rs) {
      rs.sort(function (a, b) { return a[0] - b[0]; });
      var out = [];
      rs.forEach(function (r) { var l = out[out.length - 1]; if (l && r[0] <= l[1] + 1) l[1] = Math.max(l[1], r[1]); else out.push([r[0], r[1]]); });
      return out;
    }
    function saveWords(ws, source) {
      var tr = { source: source, words: ws };
      return RS.db.updateProject(pid, { transcript: tr }).then(function () { P.transcript = tr; draw(); });
    }

    /* ---------- menus */
    function popMenu(anchor, items) {
      view.querySelectorAll('.pj-pop').forEach(function (x) { x.remove(); });
      var pop = document.createElement('div'); pop.className = 'pj-pop';
      pop.innerHTML = items.map(function (it, i) { return '<button type="button" data-i="' + i + '" class="' + (it.danger ? 'danger' : '') + '">' + UI.icon(it.icon) + esc(it.label) + '</button>'; }).join('');
      anchor.parentNode.appendChild(pop);
      pop.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (!b) return; e.stopPropagation(); pop.remove(); items[+b.getAttribute('data-i')].go(); });
      setTimeout(function () { document.addEventListener('click', function off() { pop.remove(); document.removeEventListener('click', off); }); }, 0);
    }
    function clipMenu(btn, c) {
      popMenu(btn, [
        { icon: 'play', label: 'Play it here', go: function () { select(c.id, true); } },
        { icon: 'check', label: c.status === 'ready' ? 'Back to draft' : 'Mark ready', go: function () {
          RS.db.saveClip(c.id, { status: c.status === 'ready' ? 'draft' : 'ready' }).then(function (nc) { Object.assign(c, nc); draw(); }); } },
        { icon: 'copy', label: 'Duplicate', go: function () { RS.db.duplicateClip(c.id).then(function (r) { P.clips = r.clips; draw(); UI.toast('Duplicated', 'ok'); }); } },
        { icon: 'trash', label: 'Delete clip', danger: true, go: function () {
          UI.confirm({ title: 'Delete "' + c.title + '"?', text: 'The clip and its edits are removed. Your video isn\'t touched.', ok: 'Delete', danger: true }).then(function (yes) {
            if (yes) RS.db.deleteClip(c.id).then(function () { P.clips = P.clips.filter(function (x) { return x.id !== c.id; }); draw(); });
          }); } }
      ]);
    }
    function projectMenu(btn) {
      popMenu(btn, [
        { icon: 'cc', label: 'Captions', go: captionsModal },
        { icon: 'list', label: 'Chapters → clips', go: chaptersModal },
        { icon: 'trash', label: 'Delete project', danger: true, go: function () {
          UI.confirm({ title: 'Delete this project?', text: 'All its clips and edits are deleted, and the copy of the video kept in this browser. Your original file isn\'t touched.', ok: 'Delete', danger: true })
            .then(function (yes) { if (yes) RS.db.deleteProject(pid).then(function () { RS.media.forget(pid); UI.toast('Project deleted'); UI.go('home'); }); });
        } }
      ]);
    }

    /* ---------- export all */
    function exportAll() {
      var list = P.clips.filter(function (c) { return c.status !== 'exported'; });
      if (!list.length) return;
      var signal = { aborted: false };
      var m = UI.modal('<h2>Export ' + UI.plural(list.length, 'reel') + '</h2><p class="muted">Each reel plays through once while it records, so this takes about as long as the clips. Keep this tab open.</p>' +
        '<label class="ui-field"><span>Quality</span><select data-q><option value="1080">Full HD (1080p)</option><option value="720">Faster (720p)</option></select></label>' +
        '<div class="pj-queue">' + list.map(function (c, i) { return '<div class="q" data-q-i="' + i + '"><span class="ui-badge">#' + (P.clips.indexOf(c) + 1) + '</span><span class="grow">' + esc(c.title) + '</span><span data-q-st class="small muted">' + Math.round(c.end - c.start) + 's</span></div>'; }).join('') + '</div>' +
        '<canvas class="pj-exp-canvas" data-cv hidden></canvas><div class="rs-progress" data-bar-box hidden><i data-bar></i></div>' +
        '<div class="ui-row end" style="margin-top:14px"><button class="ui-btn ghost" data-close>Close</button><button class="ui-btn primary" data-go-all>' + UI.icon('download') + 'Start</button></div>',
        { onclose: function () { signal.aborted = true; } });
      var el = m.el, cv = el.querySelector('[data-cv]');
      el.querySelector('[data-go-all]').onclick = function (e) {
        var q = el.querySelector('[data-q]').value, btn = e.currentTarget; btn.disabled = true;
        cv.hidden = false; el.querySelector('[data-bar-box]').hidden = false;
        var i = 0, made = 0, badges = [];
        (function next() {
          if (i >= list.length || signal.aborted) {
            if (!signal.aborted) { UI.toast('Exported ' + UI.plural(made, 'reel') + '!', 'ok'); RS.confetti(); RS.badgeToast(badges); m.close(); }
            draw(); return;
          }
          var c = list[i], row = el.querySelector('[data-q-i="' + i + '"]');
          row.classList.add('on'); row.querySelector('[data-q-st]').textContent = 'recording…';
          var plan = RS.plan(c, words(), A);
          RS.exportClip(M, plan, { quality: q, signal: signal, onProgress: function (f, canvas) {
            el.querySelector('[data-bar]').style.width = Math.round(f * 100) + '%';
            var r = 300 / canvas.height; cv.width = Math.round(canvas.width * r); cv.height = 300; cv.getContext('2d').drawImage(canvas, 0, 0, cv.width, cv.height);
          } }).then(function (out) {
            RS.download(out.blob, RS.slug(c.title) + '.' + out.ext);
            row.querySelector('[data-q-st]').textContent = '✓ done';
            made++;
            return RS.db.logExport(c.id, { seconds: out.seconds, format: out.ext }).then(function (r) { Object.assign(c, r.clip); badges = badges.concat(r.new_badges || []); });
          }).then(function () { i++; next(); }, function (err) {
            row.querySelector('[data-q-st]').textContent = err.cancelled ? 'stopped' : 'failed';
            if (!err.cancelled) UI.toast(err.message, 'error');
            i++; next();
          });
        })();
      };
    }

    /* ---------- events */
    view.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-play],[data-play-big]')) { stopAt = null; M.el.paused ? M.el.play().catch(function () {}) : M.el.pause(); return; }
      if (t.closest('[data-in]')) { inT = M.el.currentTime; if (outT != null && outT <= inT) outT = null; drawTl(); return; }
      if (t.closest('[data-out]')) { outT = M.el.currentTime; if (inT != null && inT >= outT) inT = null; drawTl(); return; }
      if (t.closest('[data-add]')) { addClip(); return; }
      if (t.closest('[data-chapters]')) { chaptersModal(); return; }
      if (t.closest('[data-captions]')) { captionsModal(); return; }
      if (t.closest('[data-export-all]')) { exportAll(); return; }
      if (t.closest('[data-find-go]')) { runFind().catch(function (err) { UI.toast(err.message, 'error'); }); return; }
      if (t.closest('[data-pmore]')) { e.stopPropagation(); projectMenu(t.closest('[data-pmore]')); return; }
      var set = t.closest('[data-set]');
      if (set) {
        var k = set.getAttribute('data-set'), v = set.getAttribute('data-v');
        settings[k] = k === 'vibe' ? v : +v;
        set.parentNode.querySelectorAll('[data-set]').forEach(function (b) { b.classList.toggle('on', b === set); });
        return;
      }
      var more = t.closest('[data-more]');
      if (more) { e.stopPropagation(); clipMenu(more, clipById(more.closest('[data-clip]').getAttribute('data-clip'))); return; }
      var row = t.closest('[data-clip]');
      if (row && !t.closest('a,button')) select(row.getAttribute('data-clip'), false);
    });
    view.addEventListener('change', function (e) {
      if (e.target.matches('[data-k="replace"]')) settings.replace = e.target.checked;
    });
    view.addEventListener('keydown', function (e) { if (e.target.matches('[data-title]') && e.key === 'Enter') e.target.blur(); });
    view.addEventListener('focusout', function (e) {
      if (!e.target.matches('[data-title]')) return;
      var v = e.target.value.trim();
      if (!v) { e.target.value = P.title; return; }
      if (v !== P.title) RS.db.updateProject(pid, { title: v }).then(function () { P.title = v; UI.toast('Renamed', 'ok'); });
    });
    var onResize = RS.debounce(drawTl, 100);
    window.addEventListener('resize', onResize);
    function onKey(e) {
      if (!M || e.target.closest('input,textarea,select') || document.querySelector('.ui-modal-wrap')) return;
      if (e.key === ' ') { e.preventDefault(); M.el.paused ? M.el.play().catch(function () {}) : M.el.pause(); }
      else if (e.key === 'i') view.querySelector('[data-in]').click();
      else if (e.key === 'o') view.querySelector('[data-out]').click();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { RS.seek(M.el, M.el.currentTime + (e.key === 'ArrowLeft' ? -5 : 5)).then(drawTl); }
    }
    document.addEventListener('keydown', onKey);

    var ready = RS.db.project(pid).then(function (p) {
      P = p;
      if (P.settings) {
        if (+P.settings.length) settings.length = +P.settings.length;
        if (+P.settings.count) settings.count = +P.settings.count;
        if (P.settings.vibe) settings.vibe = P.settings.vibe;
      }
      return RS.media.restore(P).catch(function () { return null; });
    }).then(function (m) {
      M = m;
      return M ? RS.loadAnalysis(pid) : null;
    }).then(function (a) {
      A = a;
      draw();
      if (M && !P.thumb) RS.seek(M.el, Math.min(P.duration * 0.15, 6)).then(function () {
        var th = RS.frameThumb(M.el, 192); if (th) { P.thumb = th; RS.db.updateProject(pid, { thumb: th }).catch(function () {}); }
        return RS.seek(M.el, 0);
      }).then(drawTl);
      if (M && !A && !(autoFind && !P.clips.length)) startAnalysis().catch(function (e) { console.warn('analysis', e); });
      if (autoFind && M && !P.clips.length) { history.replaceState(null, '', '#project/' + encodeURIComponent(pid)); runFind().catch(function (err) { UI.toast(err.message, 'error'); }); }
    });
    return { ready: ready, destroy: function () {
      dead = true; cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey);
      if (M) { M.el.pause(); M.el.onplay = M.el.onpause = null; }
    } };
  });
})();

/* ===== templates.html ===== */
(function () {
  var esc = UI.esc;
  function card(t, builtin) {
    return '<div class="tp-card" data-id="' + esc(t.id || t.key) + '" data-builtin="' + (builtin ? 1 : '') + '"><div class="pv"><canvas></canvas>' +
      (t.featured ? '<span class="rs-sticker pink">⭐ Featured</span>' : '') + '</div>' +
      '<div class="body"><h3>' + esc((t.emoji || '✨') + ' ' + t.name) + '</h3><div class="by">' + (builtin ? 'Reelstuber original' : 'by ' + esc(t.by) + ' · ' + UI.plural(t.uses || 0, 'use')) + '</div>' +
      '<div class="acts"><button class="ui-btn sm primary" data-default>' + UI.icon('star') + 'Make it my default</button>' +
      (t.can_delete ? '<button class="ui-btn sm danger icon" data-del aria-label="Delete">' + UI.icon('trash') + '</button>' : '') + '</div></div></div>';
  }
  UI.page('templates', { title: 'Templates', nav: 'Templates', icon: 'grid', order: 20 }, function (view) {
    var list = [];
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:420px"></div></div>';
    function draw() {
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Templates</div><h1>Steal a look ✨</h1>' +
        '<p class="muted">Caption styles, layouts and colours, ready to go. Shared by creators: no videos, just the vibe.</p></div></div>' +
        '<div class="tp-tip">💡 <span>To use one on a single clip: open the clip, then <b>Look → Community templates</b>. "Make it my default" sets it for every new clip.</span></div>' +
        '<div class="tp-sec"><h2>From the community</h2><span class="muted small">' + UI.plural(list.length, 'template') + '</span></div>' +
        (list.length ? '<div class="tp-grid" data-community>' + list.map(function (t) { return card(t, false); }).join('') + '</div>'
          : '<div class="ui-empty" style="margin-bottom:38px">' + UI.icon('grid') + '<h3>No shared templates yet</h3><p>Make a clip look great, then share it from the clip editor.</p></div>') +
        '<div class="tp-sec"><h2>Reelstuber originals</h2></div><div class="tp-grid" data-originals>' + RS.LOOKS.map(function (l) { return card(l, true); }).join('') + '</div></div>';
      view.querySelectorAll('[data-community] .tp-card').forEach(function (el, i) { RS.stylePreview(el.querySelector('canvas'), Object.assign({}, list[i].style, { aspect: '9:16' }), { width: 180, hook: '' }); });
      view.querySelectorAll('[data-originals] .tp-card').forEach(function (el, i) {
        var l = RS.LOOKS[i]; RS.stylePreview(el.querySelector('canvas'), RS.applyLook(RS.fullStyle({ aspect: '9:16' }), l.style, l.key), { width: 180, hook: '' });
      });
    }
    view.addEventListener('click', function (e) {
      var b = e.target.closest('[data-default]'), cardEl = e.target.closest('[data-id]');
      if (b) {
        var id = cardEl.getAttribute('data-id'), builtin = !!cardEl.getAttribute('data-builtin');
        var t = builtin ? RS.lookByKey(id) : list.filter(function (x) { return x.id === id; })[0];
        UI.busy(b, RS.db.brand().then(function (r) {
          var kit = Object.assign({}, r.kit || {}), merged = RS.applyLook(RS.fullStyle(kit), t.style, builtin ? t.key : (t.style.look || 'tpl'));
          RS.LOOK_KEYS.concat(['look']).forEach(function (k) { if (merged[k] !== undefined) kit[k] = merged[k]; });
          return RS.db.saveBrand(kit);
        })).then(function (kit) {
          RS.kit = kit;
          if (!builtin) UI.apiQuiet('template_use', t.id).catch(function () {});
          UI.toast((t.emoji || '✨') + ' ' + t.name + ' is now your default look', 'ok');
        });
        return;
      }
      if (e.target.closest('[data-del]')) {
        var tid = cardEl.getAttribute('data-id');
        UI.confirm({ title: 'Delete this template?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('template_delete', tid).then(load);
        });
      }
    });
    function load() { return RS.fontsReady().then(function () { return UI.api('templates_list'); }).then(function (r) { list = r.templates; draw(); }); }
    return load();
  });
})();
