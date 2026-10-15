/* 1人用・3人用ゲームの共通部品：効果音・振動・保存・ダイアログ・ひとこと表示・紙吹雪 */
(function () {
  'use strict';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let actx = null, master = null;
  function audio() {
    try {
      if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = .32; master.connect(actx.destination); }
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  addEventListener('pointerdown', audio, { capture: true, passive: true });
  addEventListener('keydown', audio, { capture: true, passive: true });
  function tone(f0, f1, dur, type = 'triangle', peak = .2, delay = 0) {
    if (!actx) return;
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + .05);
  }
  function noise(dur, freq, peak, delay = 0) {
    if (!actx) return;
    const t = actx.currentTime + delay, len = Math.ceil(actx.sampleRate * dur), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t);
  }
  const sfx = {
    tap() { tone(520, 660, .06, 'triangle', .12); },
    place(p = 1) { tone(300 * p, 480 * p, .09, 'triangle', .18); },
    pop(p = 1) { tone(700 * p, 1150 * p, .08, 'sine', .15); },
    good() { tone(660, 990, .1, 'triangle', .16); tone(990, 1320, .12, 'triangle', .12, .08); },
    bad() { tone(240, 110, .2, 'square', .1); },
    tick(p = 1) { tone(1500 * p, 1400 * p, .025, 'square', .05); },
    roll() { for (let k = 0; k < 6; k++) noise(.04, 2500, .18, k * .06); },
    boom() { noise(.9, 600, .9); tone(120, 40, .8, 'sawtooth', .3); },
    win() { [523, 659, 784, 1046].forEach((f, k) => tone(f, f, .2, 'triangle', .16, k * .11)); }
  };
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

  let ov = null;
  // o: { eyebrow, title, text, stats: [[ラベル, 値, 強調?]], buttons: [{ label, ghost, on }] }
  function dialog(o) {
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'pop-ov';
      ov.innerHTML = '<div class="pop-dlg" role="dialog" aria-modal="true"><div class="pop-eyebrow"></div><h2 class="pop-h"></h2><p class="pop-p"></p><div class="pop-stats"></div><div class="pop-acts"></div></div>';
      document.body.append(ov);
    }
    ov.querySelector('.pop-eyebrow').textContent = o.eyebrow || '';
    ov.querySelector('.pop-h').textContent = o.title || '';
    ov.querySelector('.pop-p').textContent = o.text || '';
    ov.querySelector('.pop-stats').innerHTML = (o.stats || []).map(([l, v, hi]) => `<div class="pop-stat${hi ? ' hi' : ''}"><span>${l}</span><b>${v}</b></div>`).join('');
    const acts = ov.querySelector('.pop-acts'); acts.innerHTML = '';
    for (const b of o.buttons || []) {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'pop-btn' + (b.ghost ? ' ghost' : ''); el.textContent = b.label;
      el.addEventListener('click', () => { if (!b.keep) close(); b.on && b.on(); });
      acts.append(el);
    }
    ov.hidden = false;
    const first = acts.querySelector('button'); if (first) first.focus({ preventScroll: true });
  }
  function close() { if (ov) ov.hidden = true; }
  const isOpen = () => !!ov && !ov.hidden;
  let toastEl = null;
  function toast(text, cls) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'pop-toast'; toastEl.setAttribute('aria-live', 'polite'); document.body.append(toastEl); }
    toastEl.className = 'pop-toast' + (cls ? ' ' + cls : ''); toastEl.textContent = text;
    void toastEl.offsetWidth; toastEl.classList.add('show');
  }
  function confetti(n = 40) {
    const colors = ['#ff5f9e', '#4d96ff', '#ffd447', '#70e1b2', '#8b5cf6', '#ff934f'];
    for (let k = 0; k < n; k++) {
      const c = document.createElement('i');
      c.className = 'pop-confetti';
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = colors[k % colors.length];
      c.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px'); c.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
      c.style.animationDuration = (1.6 + Math.random() * 1.4) + 's'; c.style.animationDelay = (Math.random() * .4) + 's';
      document.body.append(c); setTimeout(() => c.remove(), 3600);
    }
  }
  window.Pop = { store, sfx, buzz, dialog, close, isOpen, toast, confetti };
})();
