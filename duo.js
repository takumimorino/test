/* 2人用ゲームの共通部品。
   - 画面の上下の端に、それぞれのプレイヤーの名前・状態・スコアを出す（奥側は180°回転）
   - スタート／メニュー／結果の画面を上下に1枚ずつ出す
   - リアルタイムのゲームは「2人とも準備OK → 3・2・1」で始める
   - 対戦成績を端末に保存する
   使い方: const duo = Duo({ id, title, rules, realtime, options, onStart(opts, starter), onResume() })
   プレイヤー番号は 0 = 手前（画面の下・ピンク）、1 = 奥（画面の上・ブルー）。 */
(function () {
  'use strict';
  const NAMES = ['ピンク', 'ブルー'];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // ---------- 効果音（最初のタップで鳴らせるようになる） ----------
  let actx = null, master = null;
  function audio() {
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain(); master.gain.value = .32; master.connect(actx.destination);
      }
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  addEventListener('pointerdown', audio, { capture: true, passive: true });
  addEventListener('touchstart', audio, { capture: true, passive: true });
  function tone(f0, f1, dur, type = 'triangle', peak = .2, delay = 0) {
    if (!actx) return;
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + .05);
  }
  const sfx = {
    tap() { tone(520, 660, .06, 'triangle', .12); },
    place() { tone(330, 540, .09, 'triangle', .18); },
    pop() { tone(700, 1150, .08, 'sine', .15); },
    hit(v = 1) { tone(260 + 300 * v, 180, .05, 'square', .06 + .06 * v); },
    bad() { tone(240, 110, .2, 'square', .1); },
    beep(go) { tone(go ? 990 : 660, go ? 990 : 660, go ? .32 : .1, 'square', .08); },
    goal() { [784, 988, 1175].forEach((f, k) => tone(f, f, .15, 'square', .1, k * .08)); },
    win() { [523, 659, 784, 1046].forEach((f, k) => tone(f, f, .2, 'triangle', .16, k * .11)); }
  };
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

  function Duo(cfg) {
    const names = cfg.names || NAMES;
    const key = k => 'duo.' + cfg.id + '.' + k;
    let tally = store.get(key('tally'), [0, 0]);
    const opts = {};
    for (const o of cfg.options || []) opts[o.key] = store.get(key(o.key), o.value);
    let state = 'menu', mode = 'menu', starter = 0, ready = [false, false], cdTimer = 0, lastResult = null, cdDone = null, resumeFn = null;

    document.body.classList.add('duo');
    const stage = document.querySelector('.duo-stage');
    const mkBar = i => {
      const el = document.createElement('div');
      el.className = 'duo-bar p' + (i + 1);
      el.innerHTML = `<div class="duo-who"><span class="duo-dot"></span><span class="duo-name">${names[i]}</span></div><div class="duo-status"></div><div class="duo-score"></div><button class="duo-mbtn" type="button" aria-label="メニュー">≡</button>`;
      return el;
    };
    const bars = [mkBar(0), mkBar(1)];
    stage.before(bars[1]); stage.after(bars[0]);
    const flashes = [0, 1].map(i => {
      const el = document.createElement('div');
      el.className = 'duo-flash p' + (i + 1);
      el.innerHTML = '<div class="duo-ft"></div><div class="duo-fs"></div>';
      document.body.append(el);
      return el;
    });
    const ov = document.createElement('div');
    ov.className = 'duo-ov';
    ov.innerHTML = [1, 0].map(i => `
      <div class="duo-half p${i + 1}" data-i="${i}" role="dialog" aria-label="${names[i]}の画面">
        <div class="duo-panel">
          <div class="duo-eyebrow"></div>
          <h1 class="duo-title"></h1>
          <p class="duo-text"></p>
          <div class="duo-opts"></div>
          <div class="duo-actions"><button class="duo-btn duo-main" type="button"></button><button class="duo-btn ghost duo-sub" type="button"></button></div>
          <p class="duo-note"></p>
          <div class="duo-links"><span class="duo-tally"></span><a href="index.html">← ゲーム選択</a></div>
        </div>
      </div>`).join('');
    document.body.append(ov);
    const halves = [ov.querySelector('.duo-half.p1'), ov.querySelector('.duo-half.p2')];
    const q = (i, s) => halves[i].querySelector(s);

    // ---------- 画面の中身 ----------
    function renderOptions(i) {
      const box = q(i, '.duo-opts');
      if (mode !== 'menu' || !cfg.options) { box.innerHTML = ''; return; }
      box.innerHTML = cfg.options.map(o => `<div class="duo-opt"><span class="duo-opt-l">${o.label}</span>` +
        o.choices.map(([v, l]) => `<button type="button" class="duo-chip${opts[o.key] === v ? ' on' : ''}" data-k="${o.key}" data-v="${v}">${l}</button>`).join('') + '</div>').join('');
    }
    function render() {
      ov.hidden = mode === null;
      ov.classList.toggle('result', mode === 'result');
      for (const i of [0, 1]) {
        const me = tally[i], foe = tally[1 - i];
        const title = q(i, '.duo-title'), main = q(i, '.duo-main'), sub = q(i, '.duo-sub');
        title.className = 'duo-title';
        let eyebrow = '', titleText = '', text = '', mainText = '', subText = '', note = '';
        if (mode === 'menu') {
          eyebrow = `2 PLAYERS · あなたは${names[i]}`;
          titleText = cfg.title; text = cfg.rules || '';
          mainText = cfg.realtime ? (ready[i] ? '相手を待っています…' : '準備OK') : 'はじめる';
          if (cfg.realtime && ready[1 - i] && !ready[i]) note = '相手は準備OK！';
        } else if (mode === 'pause') {
          eyebrow = 'メニュー'; titleText = 'ひと休み';
          text = cfg.realtime ? '「つづける」を押すと、3秒後に再開します。' : '';
          mainText = 'つづける'; subText = '最初の画面へ';
        } else if (mode === 'result') {
          const w = lastResult.winner;
          eyebrow = `あなた ${me} 勝 · 相手 ${foe} 勝`;
          if (w < 0) { titleText = 'DRAW'; title.classList.add('lose'); }
          else if (w === i) { titleText = 'WIN!'; title.classList.add('win'); }
          else { titleText = 'LOSE…'; title.classList.add('lose'); }
          text = lastResult.detail || '';
          mainText = cfg.realtime ? (ready[i] ? '相手を待っています…' : 'もう一回（準備OK）') : 'もう一回';
          subText = cfg.options ? 'ルールを変える' : '';
          if (cfg.realtime && ready[1 - i] && !ready[i]) note = '相手は準備OK！';
        }
        q(i, '.duo-eyebrow').textContent = eyebrow;
        title.textContent = titleText;
        q(i, '.duo-text').textContent = text;
        main.textContent = mainText; main.classList.toggle('wait', !!ready[i] && cfg.realtime && mode !== 'pause');
        sub.textContent = subText; sub.hidden = !subText;
        q(i, '.duo-note').textContent = note;
        q(i, '.duo-tally').innerHTML = `成績 あなた ${me} – ${foe} 相手 <button type="button" class="duo-reset">リセット</button>`;
        renderOptions(i);
      }
    }
    function show(m) { mode = m; render(); }
    function hide() { mode = null; ready = [false, false]; render(); }

    // ---------- 進行 ----------
    function begin() {
      for (const b of bars) b.classList.remove('active');
      if (cfg.realtime) countdown(() => { state = 'playing'; cfg.onStart && cfg.onStart(opts, starter); }, true);
      else { hide(); state = 'playing'; cfg.onStart && cfg.onStart(opts, starter); }
    }
    function countdown(done, fresh) {
      hide();
      state = 'countdown'; cdDone = done;
      if (fresh && cfg.onPrepare) cfg.onPrepare(opts, starter);
      let n = 3;
      const step = () => {
        if (state !== 'countdown') return;
        if (n > 0) { api.flash('both', String(n), ''); sfx.beep(false); n--; cdTimer = setTimeout(step, 800); }
        else { api.flash('both', 'GO!', ''); sfx.beep(true); done(); }
      };
      step();
    }
    function onMain(i) {
      if (mode === 'menu' || mode === 'result') {
        if (!cfg.realtime) { begin(); return; }
        ready[i] = !ready[i];
        if (ready[0] && ready[1]) begin(); else render();
      } else if (mode === 'pause') {
        const fn = resumeFn; resumeFn = null;
        if (!fn) hide();
        else if (cfg.realtime) countdown(fn, false);
        else { hide(); fn(); }
      }
    }
    function onSub() {
      clearTimeout(cdTimer);
      state = 'menu'; ready = [false, false];
      if (cfg.onMenu) cfg.onMenu();
      show('menu');
    }
    ov.addEventListener('click', e => {
      const half = e.target.closest('.duo-half'); if (!half) return;
      const i = +half.dataset.i;
      if (e.target.closest('.duo-main')) onMain(i);
      else if (e.target.closest('.duo-sub')) { if (mode === 'pause' || mode === 'result') onSub(); }
      else if (e.target.closest('.duo-reset')) { tally = [0, 0]; store.set(key('tally'), tally); render(); }
      else if (e.target.closest('.duo-chip')) {
        const c = e.target.closest('.duo-chip'), o = cfg.options.find(x => x.key === c.dataset.k);
        const raw = o.choices.find(([v]) => String(v) === c.dataset.v)[0];
        opts[o.key] = raw; store.set(key(o.key), raw); render();
      }
    });
    // カウントダウン中に止めたときは、再開でカウントダウンからやり直す（開始処理を飛ばさない）
    function pause() {
      if (mode !== null || state === 'result' || state === 'menu') return;
      clearTimeout(cdTimer);
      if (state === 'countdown') resumeFn = cdDone;
      else if (state === 'playing') resumeFn = () => { state = 'playing'; cfg.onResume && cfg.onResume(); };
      else resumeFn = null;
      state = 'paused';
      show('pause');
    }
    for (const b of bars) b.querySelector('.duo-mbtn').addEventListener('click', pause);  // どちらのバーからでも開ける
    document.addEventListener('visibilitychange', () => { if (document.hidden && cfg.realtime && (state === 'playing' || state === 'countdown')) pause(); });

    const api = {
      sfx, buzz, names, opts,
      get state() { return state; },
      get playing() { return state === 'playing'; },
      get starter() { return starter; },
      get tally() { return tally.slice(); },
      // i 番の人の番にする。text を省くと「あなたの番！」
      turn(i, text) {
        bars.forEach((b, k) => {
          b.classList.toggle('active', k === i);
          b.querySelector('.duo-status').textContent = k === i ? (text || 'あなたの番！') : '相手の番…';
        });
      },
      status(i, text) { bars[i].querySelector('.duo-status').textContent = text; },
      active(i, on) { bars[i].classList.toggle('active', on); },
      score(i, v) { bars[i].querySelector('.duo-score').textContent = v == null ? '' : String(v); },
      dot(i, html) { bars[i].querySelector('.duo-dot').innerHTML = html; },
      // who: 0 / 1 / 'both'。cls: 'pink' | 'blue' | 'gray'（文字色）
      flash(who, text, sub, cls) {
        for (const i of who === 'both' ? [0, 1] : [who]) {
          const f = flashes[i];
          f.className = 'duo-flash p' + (i + 1) + (cls ? ' ' + cls : '');
          f.querySelector('.duo-ft').textContent = text; f.querySelector('.duo-fs').textContent = sub || '';
          void f.offsetWidth; f.classList.add('show');
        }
      },
      // 勝敗が決まったとき。winner = 0 / 1、引き分けは -1
      end(winner, detail, delay = 900) {
        if (state === 'result') return;
        state = 'result';
        if (winner >= 0) { tally[winner]++; store.set(key('tally'), tally); }
        starter = winner >= 0 ? 1 - winner : 1 - starter;  // 次は負けた人から
        lastResult = { winner, detail };
        bars.forEach((b, k) => {
          b.classList.toggle('active', k === winner);
          b.querySelector('.duo-status').textContent = winner < 0 ? '引き分け' : k === winner ? 'WIN!' : 'LOSE…';
        });
        sfx.win(); buzz(winner < 0 ? 60 : [60, 40, 120]);
        setTimeout(() => { ready = [false, false]; show('result'); }, delay);
      }
    };
    render();
    // ゲーム側の初期化は、Duo() の戻り値が変数に入ってから呼ぶ
    queueMicrotask(() => { if (cfg.onMenu) cfg.onMenu(); });
    return api;
  }
  Duo.sfx = sfx; Duo.buzz = buzz;
  window.Duo = Duo;
})();
