// ════════════════════════════════════════════════════════
//  TEKNO AV – YARIŞMA SKORBOARDU   script.js
//
//  ┌─────────────────────────────────────────────────┐
//  │  📅 YARIŞMA BAŞLANGIÇ ZAMANI                    │
//  │  → START_TIME satırını değiştir, başka bir şey  │
//  │    değiştirilmesi gerekmiyor.                   │
//  │  Örnek: new Date("2026-04-22T14:00:00")         │
//  └─────────────────────────────────────────────────┘
// ════════════════════════════════════════════════════════

// ╔══════════════════════════════════════════╗
// ║  ▼▼▼  SADECE BU SATIRI DEĞİŞTİR  ▼▼▼   ║
const START_TIME = new Date("2026-04-22T14:00:00");
// ║  ▲▲▲  SADECE BU SATIRI DEĞİŞTİR  ▲▲▲   ║
// ╚══════════════════════════════════════════╝

// ── AYARLAR ──────────────────────────────────────────
const SHEET_ID   = "1H0CHwZDOZ-TgvjJzrwSiDzgYTpn7J7kZZCNUbHFTag8";
const TEAM_SHEET = "Form Yanıtları 0";

const TASK_SHEETS = [
  { task:1, name:"Form Yanıtları 1" },
  { task:2, name:"Form Yanıtları 2" },
  { task:3, name:"Form Yanıtları 3" },
  { task:4, name:"Form Yanıtları 4" },
  { task:5, name:"Form Yanıtları 5" }
];

const TASK_NAMES = {
  1:"KÜTÜPHANE KRİPTOSU",
  2:"AKADEMİK MANTIĞIN KİLİDİ",
  3:"UNUTULAN BİLGİSAYAR ŞİFRESİ",
  4:"SOSYAL MEDYA",
  5:"FİNAL"
};

const TEAM_COL    = "Takım adınızı giriniz.";
const TASK_POINTS = { 1:100, 2:50, 3:100, 4:100, 5:150 };
const MAX_SCORE   = Object.values(TASK_POINTS).reduce((a,b)=>a+b, 0); // 500
const REFRESH_MS  = 5000;

const TEAM_EMOJIS = ["🤖","🦊","🐉","🦅","🐺","🦁","🐯","🐻","🦝","🐸","🦜","🐙"];

// ── STATE ────────────────────────────────────────────
let winnerShown    = false;
let previousScores = {};
let teamEmojiMap   = {};
let emojiCounter   = 0;
let tickerQueue    = [];
let tickerIdx      = 0;
let chartInstance  = null;

// ── INIT ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (typeof LOGO_ANADOLU   !== 'undefined') document.getElementById('imgAnadolu').src   = LOGO_ANADOLU;
  if (typeof LOGO_TEKNOFEST !== 'undefined') document.getElementById('imgTeknofest').src = LOGO_TEKNOFEST;

  initChart();
  startTimer();
  tick();
  setInterval(tick, REFRESH_MS);
  setInterval(rotateTicker, 4500);
});

// ── SAYAÇ (geçen süre – START_TIME'dan itibaren) ─────
function startTimer() {
  const el = document.getElementById('timerValue');
  setInterval(() => {
    const now  = Date.now();
    const diff = now - START_TIME.getTime();   // negatif olabilir (henüz başlamadı)

    if (diff < 0) {
      // Yarışma henüz başlamadı → geri sayım göster
      const sec  = Math.ceil(-diff / 1000);
      const h    = String(Math.floor(sec/3600)).padStart(2,"0");
      const m    = String(Math.floor((sec%3600)/60)).padStart(2,"0");
      const s    = String(sec%60).padStart(2,"0");
      if (el) el.textContent = `-${h}:${m}:${s}`;
      // etiketi de güncelle
      const lbl = document.querySelector('.timer-label');
      if (lbl) lbl.textContent = '⏳ BAŞLAMASINA';
    } else {
      // Yarışma başladı → geçen süre
      const sec = Math.floor(diff / 1000);
      const h   = String(Math.floor(sec/3600)).padStart(2,"0");
      const m   = String(Math.floor((sec%3600)/60)).padStart(2,"0");
      const s   = String(sec%60).padStart(2,"0");
      if (el) el.textContent = `${h}:${m}:${s}`;
      const lbl = document.querySelector('.timer-label');
      if (lbl) lbl.textContent = '⏱ GEÇEN SÜRE';
    }
  }, 1000);
}

// ── GOOGLE SHEETS ────────────────────────────────────
async function fetchSheet(name) {
  const url = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(name)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Sheet okunamadı: ${name}`);
  return r.json();
}

// ── TIMESTAMP ────────────────────────────────────────
function parseTs(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (!isNaN(d)) return d;
  const m = ts.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const dt = new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0));
    if (!isNaN(dt)) return dt;
  }
  return null;
}

// ── EMOJİ ────────────────────────────────────────────
function emojiFor(team) {
  if (!teamEmojiMap[team]) {
    teamEmojiMap[team] = TEAM_EMOJIS[emojiCounter % TEAM_EMOJIS.length];
    emojiCounter++;
  }
  return teamEmojiMap[team];
}

// ── SKOR HESAPLAMA ───────────────────────────────────
async function computeScores() {
  const teamData = {};

  const teamRows = await fetchSheet(TEAM_SHEET);
  for (const row of teamRows) {
    const team = (row[TEAM_COL]||"").trim();
    if (!team) continue;
    if (!teamData[team])
      teamData[team] = { done:new Set(), times:{}, finishTime:null, score:0 };
  }

  for (const t of TASK_SHEETS) {
    const rows = await fetchSheet(t.name);
    for (const row of rows) {
      const team = (row[TEAM_COL]||row["Takım adınızı giriniz"]||"").trim();
      if (!team) continue;
      const ts = row["Zaman damgası"]||row["Timestamp"]||row["Zaman damgası "]||null;
      const dt = parseTs(ts);
      if (!teamData[team])
        teamData[team] = { done:new Set(), times:{}, finishTime:null, score:0 };
      teamData[team].done.add(t.task);
      if (dt) {
        const prev = teamData[team].times[t.task];
        if (!prev || dt < prev) teamData[team].times[t.task] = dt;
      } else if (!teamData[team].times[t.task]) {
        teamData[team].times[t.task] = null;
      }
    }
  }

  const results = [];
  for (const [team, info] of Object.entries(teamData)) {
    info.score = Array.from(info.done).reduce((s,t)=>s+(TASK_POINTS[t]||0),0);
    const needed = [1,2,3,4,5];
    if (needed.every(k=>info.done.has(k))) {
      const times = needed.map(k=>info.times[k]).filter(x=>x instanceof Date);
      if (times.length===5)
        info.finishTime = new Date(Math.max(...times.map(d=>d.getTime())));
    }
    results.push({ team, score:info.score, done:Array.from(info.done).sort((a,b)=>a-b), finishTime:info.finishTime });
  }

  const finishers = results.filter(r=>r.score>=MAX_SCORE);
  let winner = null;
  const withTime = finishers.filter(f=>f.finishTime instanceof Date).sort((a,b)=>a.finishTime-b.finishTime);
  if (withTime.length)   winner = withTime[0];
  else if (finishers.length) winner = finishers.sort((a,b)=>b.score-a.score||a.team.localeCompare(b.team))[0];

  results.sort((a,b)=>{
    if (b.score!==a.score) return b.score-a.score;
    const at = a.finishTime?a.finishTime.getTime():Infinity;
    const bt = b.finishTime?b.finishTime.getTime():Infinity;
    if (at!==bt) return at-bt;
    return a.team.localeCompare(b.team);
  });

  return { results, winner };
}

// ── GRAFİK (Chart.js) ────────────────────────────────
function initChart() {
  const ctx = document.getElementById('scoreChart');
  if (!ctx) return;
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Puan',
        data: [],
        backgroundColor: [
          'rgba(255,215,64,.75)','rgba(77,170,255,.75)','rgba(155,89,255,.75)',
          'rgba(57,255,143,.75)','rgba(255,61,106,.75)','rgba(18,232,255,.75)',
          'rgba(255,140,0,.75)','rgba(200,200,200,.5)',
        ],
        borderColor: [
          'rgba(255,215,64,1)','rgba(77,170,255,1)','rgba(155,89,255,1)',
          'rgba(57,255,143,1)','rgba(255,61,106,1)','rgba(18,232,255,1)',
          'rgba(255,140,0,1)','rgba(200,200,200,.8)',
        ],
        borderWidth: 1, borderRadius: 5,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration:800, easing:'easeOutQuart' },
      plugins: {
        legend: { display:false },
        tooltip: {
          backgroundColor:'rgba(6,10,22,.96)',
          titleColor:'#12E8FF', bodyColor:'#E8F4FF',
          borderColor:'rgba(18,232,255,.25)', borderWidth:1,
          titleFont:{ family:'Orbitron', size:10 },
          callbacks: { label: ctx => ` ${ctx.raw} puan` }
        }
      },
      scales: {
        x: {
          ticks: { color:'rgba(232,244,255,.55)', font:{ family:'Exo 2', size:10, weight:'700' }, maxRotation:28 },
          grid:  { color:'rgba(255,255,255,.04)' }
        },
        y: {
          beginAtZero:true, max:MAX_SCORE,
          ticks: { color:'rgba(232,244,255,.45)', font:{ family:'Orbitron', size:9 }, stepSize:100 },
          grid:  { color:'rgba(255,255,255,.05)' }
        }
      }
    }
  });
}

function updateChart(results) {
  if (!chartInstance) return;
  const top = results.slice(0,8);
  chartInstance.data.labels = top.map(r => {
    const w = r.team.split(' ');
    return w.length > 2 ? w.slice(0,2).join(' ')+'…' : r.team;
  });
  chartInstance.data.datasets[0].data = top.map(r=>r.score);
  chartInstance.update();
}

// ── GÖREV LİSTESİ ────────────────────────────────────
function renderTaskList(results) {
  const container = document.querySelector('.tasks');
  if (!container) return;
  const titleEl = container.querySelector('.side-title');
  container.innerHTML = '';
  if (titleEl) container.appendChild(titleEl);

  const taskCount = {};
  for (let i=1;i<=5;i++) taskCount[i]=0;
  for (const r of results) for (const d of r.done) taskCount[d]=(taskCount[d]||0)+1;
  const total = results.length || 1;

  for (let i=1;i<=5;i++) {
    const cnt = taskCount[i]||0;
    const pct = Math.round((cnt/total)*100);
    let tickCls='neu', tickSym='–';
    if (cnt===0)        { tickCls='bad'; tickSym='!'; }
    else if (pct>=50)   { tickCls='ok';  tickSym='✓'; }
    else                { tickCls='mid'; tickSym='◐'; }
    let rowCls = 'task-row';
    if (i===5) rowCls += ' danger-task';
    else if (pct>0 && pct<50) rowCls += ' active-task';

    const div = document.createElement('div');
    div.className = rowCls;
    div.innerHTML = `
      <span class="task-num">${i}</span>
      <span class="task-name-text">GÖREV ${i}: ${TASK_NAMES[i]}</span>
      <span class="task-count-badge">${cnt}/${total}</span>
      <span class="task-tick ${tickCls}">${tickSym}</span>
    `;
    container.appendChild(div);
  }
}

// ── TICKER ───────────────────────────────────────────
function pushTicker(msg) {
  tickerQueue.push(msg);
  if (tickerQueue.length > 30) tickerQueue.shift();
}

function rotateTicker() {
  if (tickerQueue.length === 0) return;
  const el = document.getElementById('tickerText');
  if (!el) return;
  tickerIdx = (tickerIdx+1) % tickerQueue.length;
  el.classList.add('fade-out');
  setTimeout(()=>{
    el.textContent = tickerQueue[tickerIdx];
    el.classList.remove('fade-out');
  }, 360);
}

// ── WINNER ───────────────────────────────────────────
function showWinner(team, time) {
  document.getElementById('winnerName').textContent = team;
  document.getElementById('winnerTime').textContent = time ? `Süre: ${time}` : '';
  document.getElementById('winnerPopup').classList.remove('hidden');
  if (typeof confetti === 'function') {
    confetti({ particleCount:220, spread:130, origin:{y:.55} });
    setTimeout(()=>confetti({ particleCount:100, spread:80, origin:{y:.65} }), 800);
  }
}

// ── LEADERBOARD ──────────────────────────────────────
const rankCls   = i => ['gold','silver','bronze'][i] || '';
const pointsCls = i => ['gold','silver','bronze'][i] || '';

function renderLeaderboard(results, winner) {
  const el = document.getElementById('leaderboardRows');
  if (!el) return;

  // Puan değişimlerini yakala
  for (const r of results) {
    const prev = previousScores[r.team];
    if (prev !== undefined && r.score > prev) {
      const gained = r.score - prev;
      const taskId = Object.entries(TASK_POINTS).find(([,p])=>p===gained)?.[0];
      const taskLabel = taskId ? ` Görev ${taskId}'i Tamamladı` : '';
      pushTicker(`${emojiFor(r.team)} ${r.team}${taskLabel} → +${gained} Puan  |  Toplam: ${r.score} puan`);
    }
    previousScores[r.team] = r.score;
  }

  el.innerHTML = '';
  results.forEach((r, i) => {
    const missions = [1,2,3,4,5].map(g=>{
      const done = r.done.includes(g) ? 'done' : '';
      return `<span class="m ${done}">G${g}</span>`;
    }).join('');

    const isWinner = winner && winner.team === r.team;
    const allDone  = r.done.length === 5;
    const statusCls= isWinner ? 'leader' : allDone ? 'done-st' : '';
    const statusTxt= isWinner ? '👑 KAZANAN' : allDone ? '✅ BİTİRDİ' : '⚡ Devam Ediyor';
    const pct      = Math.round((r.score/MAX_SCORE)*100);

    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = `
      <div class="rank ${rankCls(i)}">${i+1}</div>
      <div class="team">
        <div class="team-badge">${emojiFor(r.team)}</div>
        <div class="team-info">
          <div class="team-name">${r.team}</div>
          <div class="team-progress"><div class="progress-bar" style="width:${pct}%"></div></div>
        </div>
      </div>
      <div class="missions">${missions}</div>
      <div class="points ${pointsCls(i)}">${r.score}</div>
      <div class="status ${statusCls}">${statusTxt}</div>
    `;
    el.appendChild(div);
  });

  // Ticker'ın ilk değerini ayarla
  const tickerEl = document.getElementById('tickerText');
  if (tickerEl && tickerQueue.length > 0)
    tickerEl.textContent = tickerQueue[tickerQueue.length-1];

  // Kazanan popup
  if (winner && !winnerShown) {
    winnerShown = true;
    let shortTime = '';
    if (winner.finishTime instanceof Date) {
      const sec = Math.floor((winner.finishTime-START_TIME)/1000);
      shortTime = [Math.floor(sec/3600),Math.floor((sec%3600)/60),sec%60]
        .map(n=>String(n).padStart(2,'0')).join(':');
    }
    pushTicker(`🏁 KAZANAN: ${winner.team}${shortTime ? ' — SÜRE: '+shortTime : ''}`);
    showWinner(winner.team, shortTime);
  }
}

// ── ANA DÖNGÜ ────────────────────────────────────────
async function tick() {
  try {
    const { results, winner } = await computeScores();
    renderLeaderboard(results, winner);
    renderTaskList(results);
    updateChart(results);
  } catch(e) {
    const t = document.getElementById('tickerText');
    if (t) t.textContent = '⚠️ Veri okunamadı – Sheets paylaşımını kontrol et.';
    console.error('tick error:', e);
  }
}