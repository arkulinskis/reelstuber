/* Smoke test (the essentials, 2026-11-07 rule): every page address opens without a JS/Python error and isn't empty,
   signed out, as a new member and as admin. Run: python -I tools/ui_test.py --only smoke.js. Resolves to {ok, log}.
   The project and clip editors are reached through the bundled sample (RS.startSample), as a guest and as a member. */
(async function () {
  const log = [], t0 = Date.now(), errors = [];
  const say = (m) => log.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + m);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.addEventListener('error', (e) => errors.push(String(e.message || e)));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 30000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); say('ok   ' + m); };
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function problems() {
    const shown = $$('.anvil-alert-danger, .anvil-notification.anvil-role-error, .error-popup, #error-indicator')
      .filter((e) => e.offsetParent && /error|exception|went wrong/i.test(e.textContent));
    return errors.concat(shown.map((e) => e.textContent.trim().slice(0, 160)));
  }
  async function visit(hash, sel, what) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && location.hash.indexOf(hash.split('/')[0]) === 0 && $(sel), what || hash, 45000);
    await sleep(500);
    const main = $('.ui-main');
    const text = main ? main.textContent.replace(/\s+/g, ' ').trim() : '';
    ok(text.length > 40, (what || hash) + ': page has content (' + text.length + ' chars)');
    const p = problems();
    ok(!p.length, (what || hash) + ': no errors ' + (p.length ? JSON.stringify(p) : ''));
  }
  async function editors(who) {
    // the sample -> project page (Find reels runs), then the first clip in the editor
    location.hash = '#home';
    await until(() => window.UI_READY && $('.st-drop'), 'studio');
    window.UI_READY = false;
    RS.startSample();
    await until(() => /^#project\//.test(location.hash) && window.UI_READY && $('.ui-main canvas, .ui-main video'), who + ' sample project', 90000);
    await sleep(1500);
    const pid = decodeURIComponent(location.hash.split('/')[1]);
    await visit('#project/' + encodeURIComponent(pid), '.ui-main canvas, .ui-main video', who + ': project page');
    let p = await RS.db.project(pid);
    if (!p.clips.length) { await RS.db.addClips(pid, [{ start: 2, end: 14, title: 'Smoke clip' }]); p = await RS.db.project(pid); }
    await visit('#clip/' + encodeURIComponent(pid) + '/' + encodeURIComponent(p.clips[0].id), '.ui-main canvas', who + ': clip editor');
  }
  async function signOut() {
    if (!$('.anvil-role-avatar button')) return;
    $('.anvil-role-avatar button').click();
    await sleep(300);
    const b = $$('.ui-menu button').find((x) => /Sign out/.test(x.textContent));
    b.click();
    await until(() => !$('.anvil-role-avatar button') || !$('.anvil-role-avatar button').offsetParent, 'signed out');
    await until(() => window.UI_READY && location.hash === '#landing', 'landing after sign-out');
    await sleep(500);
  }
  async function signIn(email, pw, name) {
    await visit('#auth', '.au-card input', 'sign-in page');
    const inputs = () => $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]').filter((i) => i.offsetParent);
    type(inputs()[0], email); type(inputs()[1], pw);
    $$('.anvil-role-btn-block button').find((b) => /Sign in/.test(b.textContent)).click();
    await sleep(3000);
    if (location.hash !== '#home') {
      $$('.ui-seg button').find((b) => /Create account/.test(b.textContent)).click();
      await sleep(500);
      const i = inputs(); type(i[0], name); type(i[1], email); type(i[2], pw);
      const tick = $('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
      $$('.anvil-role-btn-block button').find((b) => /Create account/.test(b.textContent)).click();
    }
    await until(() => location.hash === '#home' && window.UI_READY && $('.st-drop'), 'signed in as ' + name, 40000);
  }

  try {
    await signOut();
    // ---- visitors
    await visit('#landing', '.lp-hero', 'guest landing');
    ok($('.lp-reel canvas') && $('.lp-reel canvas').width > 0, 'landing: the reels drawn by the renderer');
    await visit('#auth', '.au-card', 'guest sign in');
    await visit('#auth/signup', '.au-card', 'guest sign up');
    await visit('#home', '.st-drop', 'guest studio');
    await visit('#templates', '.tp-card canvas', 'guest templates');
    await visit('#brand', '.bk-prev canvas', 'guest brand kit');
    $$('.rs-chip')[1].click();
    await sleep(600);
    ok($$('.rs-chip.on').length >= 5, 'brand kit: a chip click redraws the choices');
    await editors('guest');
    await visit('#home', '.st-card', 'guest studio with the sample project');

    // ---- a new member
    await signIn('smoke' + Date.now() + '@example.com', 'Hb-' + Math.random().toString(36).slice(2) + '-Kq7', 'Smoke Tester');
    await visit('#home', '.st-drop', 'member studio');
    await visit('#templates', '.tp-card', 'member templates');
    await visit('#brand', '.bk-prev canvas', 'member brand kit');
    await visit('#profile', '.pf-grid', 'member profile');
    await editors('member');
    await visit('#landing', '.lp-hero', 'member landing');
    await signOut();

    // ---- admin
    await signIn('arkulinskis@gmail.com', 'Hb-local-admin-Kq7-2026', 'Local Admin');
    for (const tab of ['overview', 'usage', 'templates', 'feedback', 'users', 'demo']) {
      await visit('#admin/' + tab, '.ui-tabs', 'admin ' + tab);
    }
    await signOut();
    return { ok: true, log };
  } catch (e) {
    log.push('ERROR ' + (e && e.message) + ' at ' + location.hash);
    return { ok: false, log };
  }
})();
