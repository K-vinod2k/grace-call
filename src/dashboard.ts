/** Returns the live-dashboard HTML. Served at GET /dashboard. */
export function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GraceCall — Live Dashboard</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --border: #2a2d3a;
    --ms-blue: #0078D4;
    --ms-blue-dim: #003d6b;
    --recover: #d13438;
    --extend: #107c10;
    --charge: #8764b8;
    --escalate: #ca5010;
    --text: #e8eaed;
    --muted: #8b8fa8;
    --agent-bubble: #1e3a5f;
    --customer-bubble: #1e2d1e;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.5; }

  header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 14px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  header h1 { font-size: 16px; font-weight: 600; letter-spacing: .02em; }
  header .tagline { color: var(--muted); font-size: 12px; }
  .pulse { width: 8px; height: 8px; border-radius: 50%; background: #107c10; animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }
  .ms-badge {
    margin-left: auto;
    font-size: 11px;
    padding: 3px 10px;
    border: 1px solid var(--ms-blue);
    border-radius: 4px;
    color: var(--ms-blue);
  }

  main { padding: 20px 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 1200px; margin: 0 auto; }
  @media (max-width: 800px) { main { grid-template-columns: 1fr; } }

  .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 10px; }
  .full-width { grid-column: 1 / -1; }

  .rentals-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .rental-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
  }
  .rental-id { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
  .rental-name { font-weight: 600; margin-bottom: 8px; }
  .rental-stat { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-top: 4px; }
  .rental-stat span:last-child { color: var(--text); }
  .obj-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    padding: 2px 8px;
    border-radius: 4px;
    margin-top: 10px;
  }
  .obj-recover { background: var(--recover); color: #fff; }
  .obj-extend  { background: var(--extend);  color: #fff; }
  .obj-charge  { background: var(--charge);  color: #fff; }
  .obj-escalate{ background: var(--escalate);color: #fff; }
  .obj-pending { background: var(--border);  color: var(--muted); }

  .call-list { display: flex; flex-direction: column; gap: 12px; }
  .call-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .call-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    user-select: none;
  }
  .call-header:hover { background: #20232f; }
  .call-rental { font-weight: 600; }
  .call-time { margin-left: auto; font-size: 11px; color: var(--muted); }
  .call-placed { font-size: 11px; color: var(--extend); }
  .call-not-placed { font-size: 11px; color: var(--muted); }

  .call-body { padding: 12px 14px; display: none; }
  .call-body.open { display: block; }
  .rationale { font-size: 12px; color: var(--muted); margin-bottom: 12px; line-height: 1.6; }

  .transcript { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; padding-right: 4px; margin-bottom: 12px; }
  .bubble { padding: 7px 10px; border-radius: 8px; font-size: 12px; max-width: 90%; line-height: 1.5; }
  .bubble.agent    { background: var(--agent-bubble);    align-self: flex-start; }
  .bubble.customer { background: var(--customer-bubble); align-self: flex-end; }
  .bubble-label { font-size: 10px; color: var(--muted); margin-bottom: 2px; }

  .tools { display: flex; flex-direction: column; gap: 4px; }
  .tool-action {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    padding: 5px 8px;
    background: #12151e;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .tool-name { color: var(--ms-blue); font-family: monospace; font-size: 11px; }
  .tool-detail { color: var(--muted); font-size: 11px; }

  .outcome-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    background: var(--ms-blue-dim);
    border: 1px solid var(--ms-blue);
    border-radius: 4px;
    color: #a8c8e8;
    margin-top: 8px;
  }

  .empty-state { color: var(--muted); text-align: center; padding: 32px; font-size: 13px; }
  .refresh-hint { text-align: right; font-size: 11px; color: var(--border); padding: 6px 0; }
  .error-banner { background: #3a1010; border: 1px solid var(--recover); border-radius: 6px; padding: 10px 14px; color: #ffb3b3; font-size: 12px; margin-bottom: 12px; }
</style>
</head>
<body>
<header>
  <div class="pulse"></div>
  <div>
    <h1>GraceCall</h1>
    <div class="tagline">Horizon Car Rental — Overdue Vehicle Voice Agent</div>
  </div>
  <div class="ms-badge">Enterprise Agents · Foundry IQ</div>
</header>

<main>
  <!-- Left: seed rental status -->
  <div>
    <div class="section-title">Demo Rentals</div>
    <div class="rentals-row" id="rental-cards">
      <div class="rental-card"><div class="empty-state">Loading…</div></div>
      <div class="rental-card"><div class="empty-state">Loading…</div></div>
    </div>
  </div>

  <!-- Right: live call log -->
  <div>
    <div class="section-title">Recent Calls <span id="call-count" style="color:var(--ms-blue)"></span></div>
    <div id="call-list" class="call-list">
      <div class="empty-state">No calls yet — run <code>npm run trigger:demo</code> to place one.</div>
    </div>
    <div class="refresh-hint" id="refresh-hint"></div>
  </div>
</main>

<script>
const OBJ_CLASS = { recover:'obj-recover', extend:'obj-extend', charge:'obj-charge', escalate:'obj-escalate' };
const openCards = new Set();

function badge(obj) {
  const cls = OBJ_CLASS[obj] ?? 'obj-pending';
  return \`<span class="obj-badge \${cls}">\${obj ?? 'pending'}</span>\`;
}

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString() : '';
}

function fmtMin(isoA, isoB) {
  if (!isoA || !isoB) return '';
  const diff = Math.round((Date.now() - new Date(isoA).getTime()) / 60000);
  return diff > 0 ? diff + ' min overdue' : 'on time';
}

function renderRentals(calls) {
  const rentals = [
    { id:'RNT-1001', name:'Alex Rivera', tier:'Gold', plate:'DEMO-101 (SUV)', location:'SFO Airport · HIGH demand' },
    { id:'RNT-1002', name:'Jordan Lee',  tier:'Standard', plate:'DEMO-102 (Economy)', location:'Austin Downtown · low demand' },
  ];
  const byRental = {};
  for (const c of calls) { if (!byRental[c.rentalId]) byRental[c.rentalId] = c; }

  return rentals.map(r => {
    const c = byRental[r.id];
    return \`<div class="rental-card">
      <div class="rental-id">\${r.id}</div>
      <div class="rental-name">\${r.name}</div>
      <div class="rental-stat"><span>Tier</span><span>\${r.tier}</span></div>
      <div class="rental-stat"><span>Vehicle</span><span>\${r.plate}</span></div>
      <div class="rental-stat"><span>Location</span><span style="text-align:right">\${r.location}</span></div>
      \${c ? \`<div class="rental-stat"><span>Last call</span><span>\${fmtTime(c.startedAt)}</span></div>\` : ''}
      \${badge(c?.decision?.objective)}
    </div>\`;
  }).join('');
}

function renderTranscript(items) {
  if (!items?.length) return '<div style="color:var(--muted);font-size:12px;padding:4px 0">No transcript yet</div>';
  return items.map(t => \`
    <div class="bubble \${t.role}">
      <div class="bubble-label">\${t.role === 'agent' ? '🤖 GraceCall' : '👤 Customer'}</div>
      \${t.text}
    </div>\`).join('');
}

function renderTools(actions) {
  if (!actions?.length) return '<div style="color:var(--muted);font-size:12px">No tools fired</div>';
  return actions.map(a => {
    const d = a.detail ?? {};
    let detail = '';
    if (d.hours)      detail = \`extended \${d.hours}h → \${d.newDue ? new Date(d.newDue).toLocaleTimeString() : ''}\`;
    if (d.amountUSD)  detail = \`\$\${d.amountUSD} charged\`;
    if (d.returnByIso)detail = \`return by \${new Date(d.returnByIso).toLocaleString()}\`;
    if (d.reason)     detail = d.reason;
    if (d.body)       detail = \`SMS: "\${d.body.slice(0,60)}…"\`;
    return \`<div class="tool-action">
      <span class="tool-name">\${a.name}()</span>
      <span class="tool-detail">\${detail || JSON.stringify(d).slice(0,80)}</span>
    </div>\`;
  }).join('');
}

function renderCalls(calls) {
  if (!calls.length) {
    return '<div class="empty-state">No calls yet — run <code>npm run trigger:demo</code></div>';
  }
  return calls.map((c, i) => {
    const id = 'call-' + i;
    const isOpen = openCards.has(id);
    return \`<div class="call-card">
      <div class="call-header" onclick="toggle('\${id}')">
        \${badge(c.decision?.objective)}
        <span class="call-rental">\${c.rentalId}</span>
        <span class="\${c.placed ? 'call-placed' : 'call-not-placed'}">\${c.placed ? '📞 placed' : '⏭ skipped'}</span>
        <span class="call-time">\${fmtTime(c.startedAt)}</span>
      </div>
      <div class="call-body \${isOpen ? 'open' : ''}" id="\${id}">
        <div class="rationale">\${c.decision?.rationale ?? ''}</div>
        <div class="section-title" style="margin-bottom:8px">Transcript</div>
        <div class="transcript">\${renderTranscript(c.transcript)}</div>
        <div class="section-title" style="margin-bottom:8px">Tools fired</div>
        <div class="tools">\${renderTools(c.toolActions)}</div>
        \${c.outcome ? \`<div class="outcome-badge">Outcome: \${c.outcome}</div>\` : ''}
      </div>
    </div>\`;
  }).join('');
}

function toggle(id) {
  if (openCards.has(id)) openCards.delete(id); else openCards.add(id);
  document.getElementById(id).classList.toggle('open');
}

let errShown = false;
async function refresh() {
  try {
    const res = await fetch('/calls');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const calls = await res.json();
    errShown = false;
    document.getElementById('call-count').textContent = calls.length ? \`(\${calls.length})\` : '';
    document.getElementById('rental-cards').innerHTML = renderRentals(calls);
    document.getElementById('call-list').innerHTML = renderCalls(calls);
    document.getElementById('refresh-hint').textContent = 'Last update: ' + new Date().toLocaleTimeString();
  } catch (e) {
    if (!errShown) {
      document.getElementById('call-list').insertAdjacentHTML('afterbegin', \`<div class="error-banner">Cannot reach /calls: \${e.message}</div>\`);
      errShown = true;
    }
  }
}

refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>`;
}
