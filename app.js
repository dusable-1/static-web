// ====== CONFIG ======
const API_URL = "https://script.google.com/macros/s/AKfycbyVicYWGpC0MeSoX6-uP23c4uKOVo3zFr10mybI6NXFcxeGZ3vcF-Mw5fO-BjfI4dCD/exec"; // будет вида https://script.google.com/macros/s/.../exec
let ADMIN_KEY = ""; // хранится в памяти браузера после ввода

// ====== UI helpers ======
const $ = (id) => document.getElementById(id);
const esc = (s="") => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

// Tabs
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("show"));
    $("tab-"+btn.dataset.tab).classList.add("show");
  });
});

// API
async function api(action, payload = {}) {
  if (!API_URL || API_URL.includes("PASTE_")) {
    $("apiState").textContent = "API: вставь Apps Script URL в app.js";
    throw new Error("API_URL not set");
  }
  $("apiState").textContent = "API: подключено";
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ action, adminKey: ADMIN_KEY || undefined, ...payload })
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "API error");
  return data;
}

// ====== State ======
let tournaments = [];
let teams = [];
let currentTournament = null;
let currentTeam = null;
let currentMatch = null;

// ====== Render: Tournaments list ======
function renderTournamentList() {
  const el = $("tournamentList");
  if (!tournaments.length) {
    el.innerHTML = `<div class="empty">Турниров пока нет.</div>`;
    return;
  }
  el.innerHTML = tournaments.map(t => `
    <div class="item" data-id="${esc(t.id)}">
      <div class="itemTop">
        <div class="itemTitle">${esc(t.name)}</div>
        <div class="badges">
          <span class="badge">${esc(t.slots)} slots</span>
          <span class="badge ${t.status==='LIVE'?'live':''}">${esc(t.status)}</span>
        </div>
      </div>
      <div class="meta">${esc(t.timeText || "")}</div>
      <div class="meta small code">ID: ${esc(t.id)}</div>
    </div>
  `).join("");

  el.querySelectorAll(".item").forEach(i=>{
    i.addEventListener("click",()=>{
      const id = i.dataset.id;
      const t = tournaments.find(x=>x.id===id);
      if (t) showTournament(t);
    });
  });
}

function showTournament(t) {
  currentTournament = t;
  const d = $("tournamentDetails");
  d.innerHTML = `
    <div class="kv">
      <div class="k">Название</div><div class="v">${esc(t.name)}</div>
      <div class="k">Статус</div><div class="v"><span class="badge ${t.status==='LIVE'?'live':''}">${esc(t.status)}</span></div>
      <div class="k">Слоты</div><div class="v">${esc(t.slots)}</div>
      <div class="k">Время</div><div class="v">${esc(t.timeText || "—")}</div>
      <div class="k">ID</div><div class="v code">${esc(t.id)}</div>
    </div>
    <hr />
    <div class="row">
      <button class="btn primary" id="btnLoadBracket">Сетка</button>
      <button class="btn secondary" id="btnRegisterOpen">Подать заявку</button>
      <button class="btn secondary" id="btnCheckIn">Check-in</button>
    </div>
    <p class="hint">Заявка требует Team ID (создай команду во вкладке “Команды”). Check-in доступен после генерации сетки.</p>
    <div id="bracketBox" class="mt"></div>
  `;

  $("btnLoadBracket").onclick = async () => {
    const data = await api("getBracket", { tournamentId: t.id });
    renderBracket(data.bracket || []);
  };

  $("btnRegisterOpen").onclick = async () => {
    const teamId = prompt("Введите Team ID (см. карточку команды):");
    if (!teamId) return;
    const out = await api("registerTeam", { tournamentId: t.id, teamId });
    alert("Заявка отправлена: " + out.registrationId);
    await loadAll();
  };

  $("btnCheckIn").onclick = async () => {
    const teamId = prompt("Введите Team ID для check-in:");
    if (!teamId) return;
    const out = await api("checkIn", { tournamentId: t.id, teamId });
    alert(out.message || "Check-in OK");
    await loadAll();
  };
}

function renderBracket(bracket) {
  const box = $("bracketBox");
  if (!bracket.length) {
    box.innerHTML = `<div class="empty">Сетка пока не создана.</div>`;
    return;
  }
  // group by round
  const rounds = {};
  bracket.forEach(m => {
    rounds[m.round] = rounds[m.round] || [];
    rounds[m.round].push(m);
  });
  const roundKeys = Object.keys(rounds).sort((a,b)=>Number(a)-Number(b));

  box.innerHTML = roundKeys.map(r => `
    <div class="card mt">
      <div class="cardTitle">Раунд ${esc(r)}</div>
      <div class="list">
        ${rounds[r].map(m=>`
          <div class="item" data-match="${esc(m.id)}">
            <div class="itemTop">
              <div class="itemTitle">${esc(m.teamAName || "TBD")} <span class="muted">vs</span> ${esc(m.teamBName || "TBD")}</div>
              <div class="badges">
                <span class="badge">${esc(m.status)}</span>
                ${m.winnerTeamId ? `<span class="badge live">WIN</span>` : ``}
              </div>
            </div>
            <div class="meta small code">Match ID: ${esc(m.id)}</div>
          </div>
        `).join("")}
      </div>
      <p class="hint">Открывай матч в вкладке “Матчи” — вставь Tournament ID.</p>
    </div>
  `).join("");
}

// ====== Teams ======
function renderTeamList() {
  const el = $("teamList");
  if (!teams.length) {
    el.innerHTML = `<div class="empty">Команд пока нет.</div>`;
    return;
  }
  el.innerHTML = teams.map(t => `
    <div class="item" data-id="${esc(t.id)}">
      <div class="itemTop">
        <div class="itemTitle">${esc(t.name)} <span class="muted">[${esc(t.tag)}]</span></div>
        <span class="badge">CAP: ${esc(t.captainTgId)}</span>
      </div>
      <div class="meta small code">Team ID: ${esc(t.id)}</div>
    </div>
  `).join("");
  el.querySelectorAll(".item").forEach(i=>{
    i.addEventListener("click",()=>{
      const id = i.dataset.id;
      const t = teams.find(x=>x.id===id);
      if (t) showTeamCard(t);
    });
  });
}

function showTeamCard(t) {
  currentTeam = t;
  $("teamCard").innerHTML = `
    <div class="kv">
      <div class="k">Название</div><div class="v">${esc(t.name)}</div>
      <div class="k">Тег</div><div class="v">${esc(t.tag)}</div>
      <div class="k">Капитан TG ID</div><div class="v code">${esc(t.captainTgId)}</div>
      <div class="k">Team ID</div><div class="v code">${esc(t.id)}</div>
    </div>
    <hr />
    <div class="row">
      <button class="btn secondary" id="btnCopyTeamId">Скопировать Team ID</button>
    </div>
  `;
  $("btnCopyTeamId").onclick = async ()=> {
    await navigator.clipboard.writeText(t.id);
    alert("Скопировано: " + t.id);
  };
}

$("btnCreateTeam").onclick = async () => {
  const name = $("teamName").value.trim();
  const tag = $("teamTag").value.trim().toUpperCase();
  const captainTgId = $("teamCaptainId").value.trim();
  if (!name || !tag || !captainTgId) return alert("Заполни все поля");
  const out = await api("createTeam", { name, tag, captainTgId });
  alert("Команда создана: " + out.teamId);
  $("teamName").value = ""; $("teamTag").value = ""; $("teamCaptainId").value = "";
  await loadAll();
};

// ====== Matches ======
$("btnLoadMatches").onclick = async () => {
  const tid = $("matchesTournamentId").value.trim();
  if (!tid) return alert("Вставь Tournament ID");
  const out = await api("getBracket", { tournamentId: tid });
  renderMatchList(out.bracket || []);
};

function renderMatchList(matches) {
  const el = $("matchList");
  if (!matches.length) {
    el.innerHTML = `<div class="empty">Матчей нет или сетка не создана.</div>`;
    return;
  }
  el.innerHTML = matches.map(m=>`
    <div class="item" data-id="${esc(m.id)}">
      <div class="itemTop">
        <div class="itemTitle">R${esc(m.round)} — ${esc(m.teamAName||"TBD")} vs ${esc(m.teamBName||"TBD")}</div>
        <span class="badge ${m.status==='LIVE'?'live':''}">${esc(m.status)}</span>
      </div>
      <div class="meta small">
        Check-in: A=${m.checkInA? "✅":"—"} · B=${m.checkInB? "✅":"—"} · Score: ${esc(m.scoreA||"—")} : ${esc(m.scoreB||"—")}
      </div>
      <div class="meta small code">Match ID: ${esc(m.id)}</div>
    </div>
  `).join("");

  el.querySelectorAll(".item").forEach(i=>{
    i.addEventListener("click",()=>{
      const id = i.dataset.id;
      const m = matches.find(x=>x.id===id);
      if (m) showMatch(m);
    });
  });
}

function showMatch(m) {
  currentMatch = m;
  const el = $("matchDetails");
  el.innerHTML = `
    <div class="kv">
      <div class="k">Match ID</div><div class="v code">${esc(m.id)}</div>
      <div class="k">Раунд</div><div class="v">${esc(m.round)}</div>
      <div class="k">Команды</div><div class="v">${esc(m.teamAName||"TBD")} vs ${esc(m.teamBName||"TBD")}</div>
      <div class="k">Статус</div><div class="v"><span class="badge ${m.status==='LIVE'?'live':''}">${esc(m.status)}</span></div>
      <div class="k">Check-in</div><div class="v">A=${m.checkInA?"✅":"—"} · B=${m.checkInB?"✅":"—"}</div>
      <div class="k">Score</div><div class="v">${esc(m.scoreA||"—")} : ${esc(m.scoreB||"—")}</div>
      <div class="k">Подтверждено</div><div class="v">A=${m.confirmA?"✅":"—"} · B=${m.confirmB?"✅":"—"}</div>
    </div>
    <hr/>
    <div class="form">
      <label>Действия</label>
      <div class="row">
        <button class="btn secondary" id="btnMatchCheckInA">Check-in Team A</button>
        <button class="btn secondary" id="btnMatchCheckInB">Check-in Team B</button>
      </div>
      <div class="row">
        <input id="scoreA" class="input" placeholder="Score A" />
        <input id="scoreB" class="input" placeholder="Score B" />
        <button class="btn primary" id="btnSubmitScore">Сдать счет</button>
      </div>
      <div class="row">
        <button class="btn secondary" id="btnConfirmA">Подтвердить (A)</button>
        <button class="btn secondary" id="btnConfirmB">Подтвердить (B)</button>
      </div>
      <p class="hint">В MVP подтверждение можно делать кнопками “A/B”. Позже можно привязать к TG ID капитанов.</p>
    </div>
  `;

  $("btnMatchCheckInA").onclick = async ()=> {
    const out = await api("matchCheckIn", { matchId: m.id, side: "A" });
    alert(out.message || "OK");
    await reloadMatches();
  };
  $("btnMatchCheckInB").onclick = async ()=> {
    const out = await api("matchCheckIn", { matchId: m.id, side: "B" });
    alert(out.message || "OK");
    await reloadMatches();
  };
  $("btnSubmitScore").onclick = async ()=> {
    const a = $("scoreA").value.trim();
    const b = $("scoreB").value.trim();
    if (a==="" || b==="") return alert("Введи счет");
    const out = await api("submitScore", { matchId: m.id, scoreA: a, scoreB: b });
    alert(out.message || "Score submitted");
    await reloadMatches();
  };
  $("btnConfirmA").onclick = async ()=> {
    const out = await api("confirmScore", { matchId: m.id, side: "A" });
    alert(out.message || "Confirmed");
    await reloadMatches();
  };
  $("btnConfirmB").onclick = async ()=> {
    const out = await api("confirmScore", { matchId: m.id, side: "B" });
    alert(out.message || "Confirmed");
    await reloadMatches();
  };
}

async function reloadMatches(){
  const tid = $("matchesTournamentId").value.trim();
  if (!tid) return;
  const out = await api("getBracket", { tournamentId: tid });
  renderMatchList(out.bracket || []);
  if (currentMatch) {
    const updated = (out.bracket||[]).find(x=>x.id===currentMatch.id);
    if (updated) showMatch(updated);
  }
}

// ====== Admin ======
$("btnAdminLogin").onclick = async () => {
  ADMIN_KEY = "TEST";
  $("adminState").textContent = "Авторизован (test mode)";
  alert("Админ-режим включён (без защиты).");
};

$("btnCreateTournament").onclick = async () => {
  if (!ADMIN_KEY) return alert("Сначала войди в Админ");
  const name = $("tName").value.trim();
  const timeText = $("tTime").value.trim();
  const slots = Number($("tSlots").value);
  const rules = $("tRules").value.trim();
  if (!name || !timeText) return alert("Заполни название и время");
  const out = await api("createTournament", { name, timeText, slots, rules });
  alert("Турнир создан: " + out.tournamentId);
  await loadAll();
};

$("btnLoadRegistrations").onclick = async () => {
  if (!ADMIN_KEY) return alert("Сначала войди в Админ");
  const tid = $("adminTournamentId").value.trim();
  if (!tid) return alert("Вставь Tournament ID");
  const out = await api("listRegistrations", { tournamentId: tid });
  renderRegistrations(out.items || [], tid);
};

$("btnGenerateBracket").onclick = async () => {
  if (!ADMIN_KEY) return alert("Сначала войди в Админ");
  const tid = $("adminTournamentId").value.trim();
  if (!tid) return alert("Вставь Tournament ID");
  const out = await api("generateBracket", { tournamentId: tid });
  alert(out.message || "Bracket generated");
  await loadAll();
};

$("btnNotifyAll").onclick = async () => {
  if (!ADMIN_KEY) return alert("Сначала войди в Админ");
  const tid = $("adminTournamentId").value.trim();
  if (!tid) return alert("Вставь Tournament ID");
  const out = await api("notifyAll", { tournamentId: tid, text: "Напоминание: check-in / матчи. Откройте турнир." });
  alert(out.message || "Sent");
};

function renderRegistrations(items, tid){
  const el = $("registrationList");
  if (!items.length) {
    el.innerHTML = `<div class="empty">Заявок нет.</div>`;
    return;
  }
  el.innerHTML = items.map(r=>`
    <div class="item">
      <div class="itemTop">
        <div class="itemTitle">${esc(r.teamName)} <span class="muted">[${esc(r.teamTag)}]</span></div>
        <span class="badge ${r.status==='APPROVED'?'live':''}">${esc(r.status)}</span>
      </div>
      <div class="meta small code">Reg: ${esc(r.id)} · TeamID: ${esc(r.teamId)}</div>
      <div class="row mt">
        <button class="btn secondary" data-act="approve" data-id="${esc(r.id)}">Approve</button>
        <button class="btn secondary" data-act="reject" data-id="${esc(r.id)}">Reject</button>
      </div>
    </div>
  `).join("");

  el.querySelectorAll("button").forEach(b=>{
    b.onclick = async ()=>{
      const act = b.dataset.act;
      const id = b.dataset.id;
      await api("setRegistrationStatus", { tournamentId: tid, registrationId: id, status: act==="approve" ? "APPROVED" : "REJECTED" });
      const out = await api("listRegistrations", { tournamentId: tid });
      renderRegistrations(out.items || [], tid);
    };
  });
}

// ====== Load all ======
async function loadAll(){
  const out = await api("bootstrap", {});
  tournaments = out.tournaments || [];
  teams = out.teams || [];
  renderTournamentList();
  renderTeamList();
  if (currentTournament) {
    const t = tournaments.find(x=>x.id===currentTournament.id);
    if (t) showTournament(t);
  }
}
$("btnRefresh").onclick = loadAll;

// initial
(async ()=>{
  try {
    await loadAll();
  } catch (e) {
    console.log(e);
  }
})();
