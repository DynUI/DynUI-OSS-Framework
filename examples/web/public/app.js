// Browser client. It sends profile / manifest edits to the local server, which
// runs the deterministic DynUI pipeline in Node and returns a validated UITree.
// The client only renders — it never composes a screen itself.

const $ = (sel) => document.querySelector(sel);

const state = {
  signals: [],
  behavior: {},
  personalization: true,
  priorities: {},
  activePreset: "performance",
  lastData: {},
};

const PRESET_DESC = {
  performance: "dense · data-first",
  wellness: "gentle · restorative",
  social: "connected · ranked",
};

async function boot() {
  const cfg = await (await fetch("/api/config")).json();
  state.signals = cfg.signals;
  renderPresets(cfg.presets);
  applyPreset("performance", cfg.presets);
  renderSignals();
  $("#personalization").addEventListener("change", (e) => {
    state.personalization = e.target.checked;
    generate();
  });
  $("#regenerate").addEventListener("click", generate);
  $("#tab-screen").addEventListener("click", () => setView("screen"));
  $("#tab-tree").addEventListener("click", () => setView("tree"));
  await generate();
}

function setView(which) {
  const screen = which === "screen";
  $("#tab-screen").classList.toggle("on", screen);
  $("#tab-tree").classList.toggle("on", !screen);
  $("#tab-screen").setAttribute("aria-selected", String(screen));
  $("#tab-tree").setAttribute("aria-selected", String(!screen));
  $("#view-screen").classList.toggle("on", screen);
  $("#view-tree").classList.toggle("on", !screen);
}

function renderPresets(presets) {
  const wrap = $("#presets");
  wrap.innerHTML = "";
  let i = 1;
  for (const name of Object.keys(presets)) {
    const b = document.createElement("button");
    b.dataset.preset = name;
    b.innerHTML = `<span class="no">0${i}</span><span>${name}</span><span class="desc">${PRESET_DESC[name] ?? ""}</span>`;
    b.addEventListener("click", () => {
      applyPreset(name, presets);
      renderSignals();
      generate();
    });
    wrap.appendChild(b);
    i++;
  }
}

function applyPreset(name, presets) {
  state.activePreset = name;
  state.behavior = { ...presets[name] };
  document
    .querySelectorAll("#presets button")
    .forEach((b) => b.classList.toggle("on", b.dataset.preset === name));
}

function renderSignals() {
  const wrap = $("#signals");
  wrap.innerHTML = "";
  for (const sig of state.signals) {
    const val = state.behavior[sig.key] ?? 0;
    const el = document.createElement("div");
    el.className = "signal";
    el.innerHTML = `
      <div class="row"><label>${sig.label}</label><span class="val">${val.toFixed(2)}</span></div>
      <input type="range" min="0" max="1" step="0.05" value="${val}" aria-label="${sig.label}" />
      <div class="hint">${sig.hint}</div>`;
    const input = el.querySelector("input");
    const out = el.querySelector(".val");
    input.addEventListener("input", () => {
      const v = Number(input.value);
      state.behavior[sig.key] = v;
      out.textContent = v.toFixed(2);
    });
    input.addEventListener("change", generate);
    wrap.appendChild(el);
  }
}

function renderPriorities(components) {
  const wrap = $("#priorities");
  wrap.innerHTML = "";
  for (const c of components) {
    if (!(c.id in state.priorities)) state.priorities[c.id] = c.priority;
    const el = document.createElement("div");
    el.className = "priority";
    el.innerHTML = `
      <span>${c.id}<br /><span class="cat">${c.category}</span></span>
      <input type="number" min="0" max="200" step="5" value="${state.priorities[c.id]}" aria-label="${c.id} priority" />`;
    el.querySelector("input").addEventListener("change", (e) => {
      state.priorities[c.id] = Number(e.target.value);
      generate();
    });
    wrap.appendChild(el);
  }
}

async function generate() {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      behavior: state.behavior,
      personalization: state.personalization,
      priorityOverrides: state.priorities,
    }),
  });
  const result = await res.json();
  if (result.error) {
    $("#screen").innerHTML = `<div class="rejected">server error: ${escapeText(result.error)}</div>`;
    return;
  }
  state.lastData = result.data;
  renderPriorities(result.components);
  renderStatus(result);
  renderScreen(result);
  $("#tree-json").innerHTML = highlightJson(result.tree);
}

function renderStatus(result) {
  const archetype = result.tree.generatedFor?.archetype;
  const conf = (result.segment.confidence ?? 0).toFixed(2);
  $("#segment").innerHTML = archetype
    ? `segment <b>${archetype}</b> · confidence ${conf}`
    : `segment <b>neutral</b> · personalisation withheld`;
  const ok = result.validation.ok;
  const n = (result.validation.errors ?? []).length;
  $("#validation").innerHTML = ok
    ? `<span class="ok">✓ validateRenderableTree</span> · 0 errors`
    : `✗ validation failed · ${n} error${n === 1 ? "" : "s"}`;
}

function renderScreen(result) {
  const screen = $("#screen");
  screen.innerHTML = "";

  // Truthful contract: invalid output is never presented as renderable.
  if (!result.validation.ok) {
    const errs = (result.validation.errors ?? [])
      .map((e) => `<li>${escapeText(e.code ?? "error")} — ${escapeText(e.message ?? "")}</li>`)
      .join("");
    screen.innerHTML = `<div class="rejected"><span class="mark">✗ rejected — not rendered.</span>
      DynUI will not render a tree that fails the contract.<ul>${errs}</ul></div>`;
    return;
  }

  const nodes = collectComponents(result.tree.root);
  const data = result.data;
  let n = 0;
  for (const node of nodes) {
    const render = RENDERERS[node.componentId] ?? genericCard;
    const el = render(node, data);
    el.style.animationDelay = `${Math.min(n, 6) * 0.06}s`;
    screen.appendChild(el);
    n++;
  }
}

// --- component renderers (dark-room card vocabulary) -----------------------

const RENDERERS = {
  "activity-headline": (node, data) => {
    const el = comp("activity-headline");
    el.append(
      titleEl(b(node, data, "activity.title") ?? "Activity"),
      subEl(`${b(node, data, "activity.type") ?? ""} · ${b(node, data, "activity.headlineStat") ?? ""}`),
    );
    return el;
  },

  "recovery-score-card": (node, data) => {
    const el = comp("recovery-score-card");
    const score = Number(b(node, data, "readiness.score") ?? 0);
    const wrap = div("ringwrap");
    wrap.append(ring(score), (() => {
      const t = document.createElement("div");
      t.innerHTML = `<div class="c-big">${score}</div>`;
      t.append(subEl(b(node, data, "readiness.narrative") ?? "Recovery"));
      return t;
    })());
    el.append(wrap);
    return el;
  },

  "training-load-chart": (node, data) => {
    const el = comp("training-load-chart");
    el.append(spark(asArray(b(node, data, "training.loadSeries"))));
    el.append(subEl(`acute:chronic ${b(node, data, "training.acuteChronicRatio") ?? "—"}`));
    return el;
  },

  "hr-zone-breakdown": (node, data) => {
    const el = comp("hr-zone-breakdown");
    const zones = asArray(b(node, data, "activity.hrZones")).map(Number);
    const max = Math.max(1, ...zones);
    const row = div("zones");
    zones.forEach((z, i) => {
      const bar = document.createElement("i");
      bar.style.height = `${Math.round((z / max) * 100)}%`;
      bar.style.opacity = String(0.25 + (i / Math.max(1, zones.length - 1)) * 0.65);
      row.appendChild(bar);
    });
    el.append(row, subEl("time in zones z1–z5"));
    return el;
  },

  "split-table": (node, data) => {
    const el = comp("split-table");
    for (const s of asArray(b(node, data, "activity.splits"))) {
      el.append(mrow(`km ${s.km}`, `${s.pace} /km`, `${s.hr} bpm`));
    }
    return el;
  },

  "route-map-hero": (node, data) => {
    const el = comp("route-map-hero");
    const route = b(node, data, "activity.route");
    const map = div("p-map");
    map.innerHTML = routeSvg(route);
    el.append(map, subEl(b(node, data, "activity.headlineStat") ?? "Route"));
    return el;
  },

  "insight-card": (node, data) => {
    const el = comp("insight-card");
    el.append(
      titleEl(b(node, data, "insight.headline") ?? "Insight"),
      bodyEl(b(node, data, "insight.body") ?? ""),
    );
    return el;
  },

  "social-kudos-bar": (node, data) => {
    const el = comp("social-kudos-bar");
    const comments = asArray(b(node, data, "social.comments"));
    const kudos = b(node, data, "social.kudosCount") ?? 0;
    const bar = div("kudos");
    comments.slice(0, 3).forEach((c) => {
      const a = div("avat");
      a.textContent = initials(c.author);
      bar.appendChild(a);
    });
    const cnt = document.createElement("span");
    cnt.className = "c-sub";
    cnt.style.marginLeft = "4px";
    cnt.textContent = `${kudos} kudos`;
    bar.appendChild(cnt);
    el.append(bar);
    for (const c of comments) {
      el.append(mrow(c.author, c.text, ""));
    }
    return el;
  },

  "segment-leaderboard": (node, data) => {
    const el = comp("segment-leaderboard");
    for (const s of asArray(b(node, data, "social.segments"))) {
      const r = mrow(s.name, "", `#${s.rank} / ${s.total}`);
      r.querySelector(".r").classList.add("rank");
      el.append(r);
    }
    return el;
  },

  "strength-volume-card": (node, data) => {
    const el = comp("strength-volume-card");
    const groups = asArray(b(node, data, "strength.volumeByGroup"));
    const max = Math.max(1, ...groups.map((g) => Number(g.volume) || 0));
    for (const g of groups) {
      const row = document.createElement("div");
      row.append(mrow(g.group, "", `${g.volume}`));
      const bar = div("bar");
      const i = document.createElement("i");
      i.style.width = `${Math.round((Number(g.volume) / max) * 100)}%`;
      bar.appendChild(i);
      row.appendChild(bar);
      el.append(row);
    }
    return el;
  },
};

function genericCard(node, data) {
  const el = comp(node.componentId);
  const resolved = {};
  for (const [k, path] of Object.entries(node.dataBindings ?? {})) resolved[k] = data[path];
  el.append(bodyEl(JSON.stringify(resolved)));
  return el;
}

// --- small DOM builders ----------------------------------------------------

function comp(label) {
  const el = document.createElement("article");
  el.className = "comp";
  const l = document.createElement("div");
  l.className = "c-label";
  l.textContent = label;
  el.appendChild(l);
  return el;
}
function div(cls) { const d = document.createElement("div"); d.className = cls; return d; }
function titleEl(t) { const e = document.createElement("div"); e.className = "c-title"; e.textContent = t; return e; }
function subEl(t) { const e = document.createElement("div"); e.className = "c-sub"; e.textContent = t; return e; }
function bodyEl(t) { const e = document.createElement("div"); e.className = "c-body"; e.textContent = t; return e; }

function mrow(left, mid, right) {
  const r = div("mrow");
  const a = document.createElement("b"); a.textContent = left;
  const m = document.createElement("span"); m.textContent = mid; m.style.color = "var(--room-dim)"; m.style.flex = "1"; m.style.textAlign = "center";
  const z = document.createElement("span"); z.className = "r"; z.textContent = right;
  r.append(a, m, z);
  return r;
}

function ring(pct) {
  const C = 150.8; // 2πr, r=24
  const off = C * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ring");
  svg.setAttribute("viewBox", "0 0 60 60");
  svg.innerHTML = `<circle class="tr" cx="30" cy="30" r="24"/><circle class="pr" cx="30" cy="30" r="24" stroke-dasharray="${C}" stroke-dashoffset="${off.toFixed(1)}"/>`;
  return svg;
}

function spark(series) {
  const nums = series.map(Number);
  const max = Math.max(1, ...nums);
  const s = div("spark");
  for (const v of nums) {
    const i = document.createElement("i");
    i.style.height = `${Math.round((v / max) * 100)}%`;
    s.appendChild(i);
  }
  return s;
}

function routeSvg(route) {
  const coords = route?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return "";
  const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (x) => 8 + ((x - minX) / (maxX - minX || 1)) * 84;
  const sy = (y) => 62 - ((y - minY) / (maxY - minY || 1)) * 48; // flip lat
  const d = coords.map((c, i) => `${i ? "L" : "M"}${sx(c[0]).toFixed(1)} ${sy(c[1]).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 100 74" preserveAspectRatio="none"><path d="${d}"/></svg>`;
}

// --- helpers ---------------------------------------------------------------

function collectComponents(root) {
  const out = [];
  (function walk(n) {
    if (!n) return;
    if (n.type === "component" && n.componentId) out.push(n);
    (n.children ?? []).forEach(walk);
    Object.values(n.slots ?? {}).flat().forEach(walk);
  })(root);
  return out;
}

const b = (node, data, key) => data[node.dataBindings?.[key]];
const asArray = (v) => (Array.isArray(v) ? v : []);
const initials = (name) =>
  String(name ?? "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const escapeText = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

// Minimal JSON syntax highlight for the UITree view.
function highlightJson(obj) {
  const json = escapeText(JSON.stringify(obj, null, 2));
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?)/g,
    (m) => {
      let cls = "n";
      if (/^"/.test(m)) cls = /:$/.test(m) ? "k" : "s";
      else if (/true|false|null/.test(m)) cls = "b";
      return `<span class="${cls}">${m}</span>`;
    },
  );
}

boot();
