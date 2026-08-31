'use strict';

/* ============================================================
   JOKER — 3人用推理ゲーム
   役職(0:Joker, 1:Normal, 2:Ace) / 投票 / 順位判定のロジックは
   元の main.js の仕様を踏襲しています。
============================================================ */

const ROLE = { JOKER: 0, NORMAL: 1, ACE: 2 };

const ROLE_INFO = {
  [ROLE.JOKER]: {
    name: 'Joker',
    tone: 'tone-joker',
    desc: '嘘つきな人。Jokerであることをバレないようにしよう。',
    icon: iconJoker,
  },
  [ROLE.NORMAL]: {
    name: 'Normal',
    tone: 'tone-normal',
    desc: '普通の人。誰がJokerか見極めて投票しよう。',
    icon: iconEye,
  },
  [ROLE.ACE]: {
    name: 'Ace',
    tone: 'tone-ace',
    desc: '特殊な人。Jokerだと思われて、あえて投票されよう。',
    icon: iconStar,
  },
};

const DEFAULT_NAMES = ['Tom', 'Bob', 'Tim'];

const app = document.getElementById('app');

function freshState() {
  return {
    players: DEFAULT_NAMES.map((n) => ({ name: n })),
    roles: [],          // roles[i] = ROLE.* for player i
    revealIndex: 0,
    voteTurn: 0,
    votes: [],           // { voter, target }
    voteCounts: [0, 0, 0],
  };
}

let state = freshState();

/* ---------------- helpers ---------------- */

function shuffledRoles() {
  const arr = [ROLE.JOKER, ROLE.NORMAL, ROLE.ACE];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fmtVotes(v) {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
}

function otherTwo(i) {
  return [0, 1, 2].filter((x) => x !== i);
}

// Ranks: 0 = 1st place, 1 = 2nd, 2 = 3rd. Mirrors the original
// makeTable() logic — the Ace's rank is fixed by votes received,
// and the remaining two players split the leftover ranks by
// whoever received fewer votes.
function computeRanks() {
  const aceIndex = state.roles.indexOf(ROLE.ACE);
  const ranks = [0, 1, 2];
  const rankOf = {};

  rankOf[aceIndex] = 2 - state.voteCounts[aceIndex];
  ranks.splice(ranks.indexOf(rankOf[aceIndex]), 1);

  const [a, b] = otherTwo(aceIndex);
  if (state.voteCounts[a] < state.voteCounts[b]) {
    rankOf[a] = ranks[0];
    rankOf[b] = ranks[1];
  } else {
    rankOf[a] = ranks[1];
    rankOf[b] = ranks[0];
  }
  return rankOf;
}

function goto(renderFn) {
  app.innerHTML = '';
  renderFn();
}

/* ---------------- icons ---------------- */

function iconJoker() {
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 6c-2 3-5 3-6 7-3-1-6 1-6 4 0 3 3 4 3 7 0 4-4 5-4 9h26c0-4-4-5-4-9 0-3 3-4 3-7 0-3-3-5-6-4-1-4-4-4-6-7z"/>
    <circle cx="18" cy="20" r="1.6" fill="currentColor"/>
    <circle cx="30" cy="20" r="1.6" fill="currentColor"/>
    <path d="M18 26c2 2 10 2 12 0"/>
    <path d="M14 40h20"/>
  </svg>`;
}
function iconEye() {
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 24c4-8 12-13 18-13s14 5 18 13c-4 8-12 13-18 13S10 32 6 24z"/>
    <circle cx="24" cy="24" r="6"/>
  </svg>`;
}
function iconStar() {
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">
    <path d="M24 5l5.6 12.2L43 19l-9.6 9 2.6 13.6L24 35.2 12 41.6 14.6 28 5 19l13.4-1.8z"/>
  </svg>`;
}
function iconDiscuss() {
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 12h22a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H20l-8 6v-6H8a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" transform="translate(2,0)"/>
    <path d="M34 20h6a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-2v5l-6-5" opacity="0.55" transform="translate(-2,0)"/>
  </svg>`;
}

/* ============================================================
   SCREEN 1 — Start
============================================================ */
function renderStart() {
  const el = document.createElement('div');
  el.className = 'screen screen-center';
  el.innerHTML = `
    <div class="eyebrow">3人用推理ゲーム</div>
    <h1 class="title">JOKER</h1>
    <div style="width:96px;height:96px;color:var(--joker);margin:6px 0 30px;">${iconJoker()}</div>
    <div class="spacer"></div>
    <button class="btn btn-primary" id="btnStart">はじめる</button>
  `;
  app.appendChild(el);
  el.querySelector('#btnStart').addEventListener('click', () => goto(renderNames));
}

/* ============================================================
   SCREEN 2 — Names
============================================================ */
function renderNames() {
  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `
    <div class="eyebrow">STEP 1</div>
    <h2 class="title" style="font-size:26px;">名前を入力</h2>
    <p class="lead">3人それぞれの名前を入力してください。</p>
    <div class="field-list">
      ${state.players.map((p, i) => `
        <div class="field">
          <label for="name${i}">プレイヤー ${i + 1}</label>
          <input id="name${i}" type="text" maxlength="8" value="${p.name}" autocomplete="off">
        </div>
      `).join('')}
    </div>
    <div class="spacer"></div>
    <button class="btn btn-primary" id="btnNext">つぎへ</button>
  `;
  app.appendChild(el);
  el.querySelector('#btnNext').addEventListener('click', () => {
    state.players.forEach((p, i) => {
      const input = el.querySelector(`#name${i}`);
      const v = input.value.trim();
      p.name = v || DEFAULT_NAMES[i];
    });
    goto(renderReady);
  });
}

/* ============================================================
   SCREEN 3 — Ready lineup
============================================================ */
function renderReady() {
  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `
    <div class="eyebrow">STEP 2</div>
    <h2 class="title" style="font-size:26px;">メンバー確認</h2>
    <p class="lead">この3人でゲームを始めます。準備ができたら役職を配ります。</p>
    <div class="lineup">
      ${state.players.map((p, i) => `
        <div class="lineup-item">
          <span class="lineup-num">${i + 1}</span>
          <span class="lineup-name">${escapeHtml(p.name)}</span>
        </div>
      `).join('')}
    </div>
    <div class="spacer"></div>
    <button class="btn btn-primary" id="btnReady">役職を配る</button>
  `;
  app.appendChild(el);
  el.querySelector('#btnReady').addEventListener('click', () => {
    state.roles = shuffledRoles();
    state.revealIndex = 0;
    goto(renderReveal);
  });
}

/* ============================================================
   SCREEN 4 — Reveal (flip card), one per player
============================================================ */
function renderReveal() {
  const i = state.revealIndex;
  const player = state.players[i];
  const role = ROLE_INFO[state.roles[i]];

  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `
    <div class="eyebrow">STEP 3 — ${i + 1} / 3</div>
    <div class="turn-banner">
      <div class="name">${escapeHtml(player.name)} さんの番です</div>
    </div>
    <p class="lead" style="text-align:center;">スマホをこの人に渡してください。カードをタップすると役職がめくれます。</p>

    <div class="flip-scene">
      <div class="flip-card" id="flipCard">
        <div class="flip-face flip-front">
          <div class="role-icon" style="width:56px;height:56px;">${iconJoker()}</div>
          <div class="hint">TAP TO REVEAL</div>
        </div>
        <div class="flip-face flip-back">
          <div class="role-icon ${role.tone}" style="width:44px;height:44px;">${role.icon()}</div>
          <div class="role-name ${role.tone}">${role.name}</div>
          <div class="role-desc">${role.desc}</div>
        </div>
      </div>
    </div>

    <div class="spacer"></div>
    <button class="btn btn-primary" id="btnNextReveal" disabled style="opacity:.35;">確認しました。次へ</button>
  `;
  app.appendChild(el);

  const card = el.querySelector('#flipCard');
  const nextBtn = el.querySelector('#btnNextReveal');
  card.addEventListener('click', () => {
    if (card.classList.contains('is-flipped')) return;
    card.classList.add('is-flipped');
    nextBtn.disabled = false;
    nextBtn.style.opacity = '1';
  });

  nextBtn.addEventListener('click', () => {
    if (nextBtn.disabled) return;
    state.revealIndex++;
    if (state.revealIndex < 3) {
      goto(renderReveal);
    } else {
      goto(renderDiscuss);
    }
  });
}

/* ============================================================
   SCREEN 5 — Discuss
============================================================ */
function renderDiscuss() {
  const el = document.createElement('div');
  el.className = 'screen screen-center';
  el.innerHTML = `
    <div class="eyebrow">STEP 4</div>
    <div class="discuss-icon">${iconDiscuss()}</div>
    <h2 class="title" style="font-size:26px;">話し合いタイム</h2>
    <p class="lead">誰がJokerか話し合ってください。<br>話し終えたら投票に進みます。</p>
    <div class="spacer"></div>
    <button class="btn btn-joker" id="btnEndDiscuss">話し合い終了・投票へ</button>
  `;
  app.appendChild(el);
  el.querySelector('#btnEndDiscuss').addEventListener('click', () => {
    state.voteTurn = 0;
    state.votes = [];
    state.voteCounts = [0, 0, 0];
    goto(renderVote);
  });
}

/* ============================================================
   SCREEN 6 — Vote, one per player
============================================================ */
function renderVote() {
  const voter = state.voteTurn;
  const targets = otherTwo(voter);
  const player = state.players[voter];

  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `
    <div class="eyebrow">STEP 5 — 投票 ${voter + 1} / 3</div>
    <div class="turn-banner">
      <div class="name">${escapeHtml(player.name)} さんの投票</div>
    </div>
    <p class="lead" style="text-align:center;">Jokerだと思う人に投票してください。</p>
    <div class="vote-options">
      ${targets.map((t) => `
        <button class="vote-btn" data-target="${t}">
          <span>${escapeHtml(state.players[t].name)}</span>
          <span class="arrow">→</span>
        </button>
      `).join('')}
    </div>
  `;
  app.appendChild(el);

  el.querySelectorAll('.vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = Number(btn.dataset.target);
      const weight = state.roles[voter] === ROLE.ACE ? 0.5 : 1;
      state.voteCounts[target] += weight;
      state.votes.push({ voter, target });
      state.voteTurn++;
      if (state.voteTurn < 3) {
        goto(renderVote);
      } else {
        goto(renderResult);
      }
    });
  });
}

/* ============================================================
   SCREEN 7 — Result table (SVG triangle)
============================================================ */
function renderResult() {
  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `
    <div class="eyebrow">RESULT</div>
    <h2 class="title" style="font-size:24px;">投票結果</h2>
    <div class="table-diagram">${buildTableSvg()}</div>
    <div class="spacer"></div>
    <button class="btn btn-primary" id="btnRanking">順位を見る</button>
  `;
  app.appendChild(el);
  el.querySelector('#btnRanking').addEventListener('click', () => goto(renderRanking));
}

// Layout: player0 top, player1 bottom-left, player2 bottom-right.
function nodePositions() {
  return [
    { x: 150, y: 66 },
    { x: 62, y: 258 },
    { x: 238, y: 258 },
  ];
}

function buildTableSvg() {
  const pos = nodePositions();
  const R = 44;

  const arrows = state.votes.map(({ voter, target }, idx) => {
    const p1 = pos[voter];
    const p2 = pos[target];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    // perpendicular offset so a<->b pairs in both directions don't overlap
    const px = -uy, py = ux;
    const side = voter < target ? 1 : -1;
    const bend = 20 * side;

    const startX = p1.x + ux * (R + 2) + px * bend * 0.3;
    const startY = p1.y + uy * (R + 2) + py * bend * 0.3;
    const endX = p2.x - ux * (R + 10) + px * bend * 0.3;
    const endY = p2.y - uy * (R + 10) + py * bend * 0.3;
    const midX = (p1.x + p2.x) / 2 + px * bend;
    const midY = (p1.y + p2.y) / 2 + py * bend;

    return `<path class="arrow-path" style="animation-delay:${300 + idx * 180}ms"
      d="M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}"
      marker-end="url(#arrowhead)" />`;
  }).join('');

  const nodes = pos.map((p, i) => {
    const role = ROLE_INFO[state.roles[i]];
    const fillByRole = { [ROLE.JOKER]: 'var(--joker)', [ROLE.NORMAL]: 'var(--normal-blue)', [ROLE.ACE]: 'var(--ace)' };
    return `
      <g>
        <circle cx="${p.x}" cy="${p.y}" r="${R}" fill="#fffdf7" stroke="${fillByRole[state.roles[i]]}" stroke-width="2.5"/>
        <text x="${p.x}" y="${p.y - 10}" text-anchor="middle" class="node-name">${escapeHtml(truncate(state.players[i].name, 6))}</text>
        <text x="${p.x}" y="${p.y + 6}" text-anchor="middle" class="node-role" fill="${fillByRole[state.roles[i]]}">${role.name}</text>
        <text x="${p.x}" y="${p.y + 22}" text-anchor="middle" class="node-votes">${fmtVotes(state.voteCounts[i])}票</text>
      </g>`;
  }).join('');

  return `
    <svg viewBox="0 0 300 320" width="100%">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--joker)"/>
        </marker>
      </defs>
      ${arrows}
      ${nodes}
    </svg>
  `;
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

/* ============================================================
   SCREEN 8 — Ranking
============================================================ */
function renderRanking() {
  const rankOf = computeRanks();
  const order = [0, 1, 2].slice().sort((a, b) => rankOf[a] - rankOf[b]);
  const medalClass = ['is-first', 'is-second', 'is-third'];
  const medalLabel = ['1st', '2nd', '3rd'];

  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `
    <div class="eyebrow">FINAL</div>
    <h2 class="title" style="font-size:26px;">順位発表</h2>
    <div class="rank-list">
      ${order.map((playerIdx, pos) => {
        const role = ROLE_INFO[state.roles[playerIdx]];
        return `
          <div class="rank-item ${medalClass[pos]}">
            <div class="rank-medal">${medalLabel[pos]}</div>
            <div class="rank-info">
              <span class="rname">${escapeHtml(state.players[playerIdx].name)}</span>
              <span class="rrole ${role.tone}">${role.name} · ${fmtVotes(state.voteCounts[playerIdx])}票</span>
            </div>
          </div>`;
      }).join('')}
    </div>
    <div class="spacer"></div>
    <button class="btn btn-primary" id="btnReplay">もう一度あそぶ</button>
  `;
  app.appendChild(el);
  el.querySelector('#btnReplay').addEventListener('click', () => {
    state = freshState();
    goto(renderStart);
  });
}

/* ---------------- util ---------------- */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ---------------- boot ---------------- */
function populateStaticIcons() {
  const map = { normal: iconEye, joker: iconJoker, ace: iconStar };
  document.querySelectorAll('.role-icon[data-icon]').forEach((elm) => {
    const fn = map[elm.dataset.icon];
    if (fn) elm.innerHTML = fn();
  });
}
populateStaticIcons();
goto(renderStart);
