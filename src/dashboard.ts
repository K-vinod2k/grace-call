/** Returns the live-dashboard HTML. Served at GET /dashboard. */
export function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GraceCall — Live Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
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
  body { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.5; }

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
  .pulse { width: 8px; height: 8px; border-radius: 50%; background: #107c10; animation: pulse 1.5s ease-in-out infinite; flex-shrink: 0; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }

  /* Key icon button — replaces the visible API key input */
  .key-area { margin-left: auto; position: relative; }
  .key-icon-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--muted);
    font-size: 13px;
    padding: 5px 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: border-color .15s, color .15s;
  }
  .key-icon-btn:hover { border-color: var(--ms-blue); color: var(--text); }
  .key-icon-btn.has-key { color: var(--extend); border-color: var(--extend); }
  .key-popover {
    display: none;
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px;
    width: 260px;
    z-index: 100;
    box-shadow: 0 8px 24px rgba(0,0,0,.4);
  }
  .key-popover.open { display: block; }
  .key-popover label { font-size: 11px; color: var(--muted); display: block; margin-bottom: 4px; }
  .key-popover input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 12px;
    font-family: monospace;
    padding: 5px 8px;
    width: 100%;
    outline: none;
  }
  .key-popover input:focus { border-color: var(--ms-blue); }
  .key-popover-actions { display: flex; gap: 6px; margin-top: 8px; }
  .key-popover-save {
    background: var(--ms-blue);
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 14px;
    cursor: pointer;
  }
  .key-popover-clear {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--muted);
    font-size: 11px;
    padding: 5px 10px;
    cursor: pointer;
  }

  .ms-badge {
    font-size: 11px;
    padding: 3px 10px;
    border: 1px solid var(--ms-blue);
    border-radius: 4px;
    color: var(--ms-blue);
    flex-shrink: 0;
  }

  /* KPI status strip */
  #kpi-strip {
    background: #13161f;
    border-bottom: 1px solid var(--border);
    padding: 6px 24px;
    display: flex;
    align-items: center;
    gap: 20px;
    font-size: 12px;
  }
  .kpi-item { display: flex; align-items: center; gap: 6px; }
  .kpi-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .kpi-dot.active   { background: var(--recover); animation: pulse 1s ease-in-out infinite; }
  .kpi-dot.overdue  { background: var(--escalate); }
  .kpi-dot.returned { background: var(--extend); }
  .kpi-dot.idle     { background: var(--border); }
  .kpi-label { color: var(--muted); }
  .kpi-value { font-weight: 600; }
  #kpi-strip .kpi-sep { color: var(--border); }

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
  .status-returned  { background: var(--extend);   color: #fff; }
  .status-escalated { background: var(--recover);  color: #fff; }
  .status-awaiting  { background: var(--ms-blue-dim); color: #a8c8e8; border: 1px solid var(--ms-blue); }

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
  .action-row { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; align-items: center; }
  .btn {
    font-size: 12px;
    font-weight: 600;
    padding: 8px 14px;
    border-radius: 4px;
    border: 1px solid;
    cursor: pointer;
    background: transparent;
    min-height: 36px;
    touch-action: manipulation;
  }
  .btn-return  { border-color: var(--extend);  color: var(--extend);  }
  .btn-return.active  { background: var(--extend);  color: #fff; }
  .btn-recheck { border-color: var(--escalate); color: var(--escalate); }
  .btn-recheck:disabled { opacity: 0.4; cursor: default; }
  .btn-call { border-color: var(--ms-blue); color: var(--ms-blue); }
  .btn-call:disabled { opacity: 0.4; cursor: default; }
  .btn-call.calling { opacity: 0.7; }
  .call-feedback {
    font-size: 11px;
    font-weight: 600;
    margin-top: 4px;
    min-height: 16px;
    width: 100%;
  }
  .call-feedback.success { color: #3dd68c; }
  .call-feedback.error   { color: #ffb3b3; }
  .spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 2px solid transparent;
    border-top-color: var(--ms-blue);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: middle;
    margin-right: 4px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .countdown { font-size: 11px; color: var(--ms-blue); margin-top: 6px; }

  /* ── Live Transcript panels (now the page hero) ──────────────────── */
  .live-transcript-section { margin-bottom: 4px; }
  .live-transcript-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 800px) { .live-transcript-grid { grid-template-columns: 1fr; } }
  .transcript-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    min-height: 200px;
    transition: border-color .2s;
  }
  .transcript-panel.active {
    border-color: var(--recover);
    box-shadow: 0 0 0 1px var(--recover);
  }
  .transcript-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-weight: 600;
    font-size: 13px;
  }
  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--recover);
    animation: pulse 1s ease-in-out infinite;
    display: none;
    flex-shrink: 0;
  }
  .live-dot.show { display: inline-block; }
  .live-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--recover);
    display: none;
    margin-left: 2px;
  }
  .live-label.show { display: inline; }
  .transcript-scroll {
    max-height: 240px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .t-bubble {
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    max-width: 92%;
    line-height: 1.45;
  }
  .t-bubble.agent    { background: var(--agent-bubble); align-self: flex-start; }
  .t-bubble.customer { background: var(--customer-bubble); align-self: flex-end; }
  .t-label { font-size: 10px; color: var(--muted); margin-bottom: 2px; }
  .t-empty { color: var(--muted); font-size: 12px; padding: 16px 0; text-align: center; }

  /* ── AI Integration panels ─────────────────────────────────────────── */
  .ai-panels-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 4px;
  }
  @media (max-width: 800px) { .ai-panels-row { grid-template-columns: 1fr; } }

  .ai-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ai-panel-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ai-panel-icon {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }
  .ai-panel-icon.foundry  { background: #001d3d; border: 1px solid var(--ms-blue); }
  .ai-panel-icon.copilot  { background: #1a0a2e; border: 1px solid #7b48cc; }
  .ai-panel-title { font-size: 13px; font-weight: 600; }
  .ai-panel-subtitle { font-size: 11px; color: var(--muted); margin-top: 1px; }

  .ai-panel-body { font-size: 12px; color: var(--muted); line-height: 1.6; }

  .ai-placeholder {
    background: #12151e;
    border: 1px dashed var(--border);
    border-radius: 6px;
    padding: 20px 16px;
    text-align: center;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.7;
  }

  .btn-foundry {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 16px;
    border-radius: 5px;
    border: 1px solid var(--ms-blue);
    color: #a8d4ff;
    background: var(--ms-blue-dim);
    text-decoration: none;
    transition: background 0.15s;
    width: fit-content;
  }
  .btn-foundry:hover { background: #004f8c; }

  .copilot-iframe-wrap {
    width: 100%;
    height: 480px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--border);
    display: none;
  }
  .copilot-iframe-wrap iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse, .live-dot, .kpi-dot.active { animation: none; }
  }
</style>
</head>
<body>
<header>
  <div class="pulse" aria-hidden="true"></div>
  <div>
    <h1>GraceCall</h1>
    <div class="tagline">Horizon Car Rental — Overdue Vehicle Voice Agent</div>
  </div>
  <div class="ms-badge">Enterprise Agents · Foundry IQ</div>
  <div class="key-area">
    <button class="key-icon-btn" id="key-toggle-btn" onclick="toggleKeyPopover()" aria-label="Configure API key" title="Set API key for placing calls">
      <span id="key-icon">🔒</span>
      <span id="key-status-text" style="font-size:11px">API Key</span>
    </button>
    <div class="key-popover" id="key-popover" role="dialog" aria-label="API key configuration">
      <label for="api-key-input">TRIGGER_API_KEY <span style="color:var(--muted);font-weight:400">(from .env)</span></label>
      <input id="api-key-input" type="password" placeholder="Paste key…" autocomplete="off"
        onkeydown="if(event.key==='Enter')saveApiKey()">
      <div class="key-popover-actions">
        <button class="key-popover-save" onclick="saveApiKey()">Save</button>
        <button class="key-popover-clear" onclick="clearApiKey()">Clear</button>
      </div>
    </div>
  </div>
</header>

<!-- KPI status strip — updates every 2s with refresh() -->
<div id="kpi-strip" aria-live="polite" aria-label="System status">
  <div class="kpi-item">
    <div class="kpi-dot idle" id="kpi-dot-active"></div>
    <span class="kpi-label">Active</span>
    <span class="kpi-value" id="kpi-active">—</span>
  </div>
  <span class="kpi-sep">·</span>
  <div class="kpi-item">
    <div class="kpi-dot overdue" id="kpi-dot-overdue"></div>
    <span class="kpi-label">Overdue</span>
    <span class="kpi-value" id="kpi-overdue">—</span>
  </div>
  <span class="kpi-sep">·</span>
  <div class="kpi-item">
    <div class="kpi-dot returned"></div>
    <span class="kpi-label">Recovered</span>
    <span class="kpi-value" id="kpi-recovered">—</span>
  </div>
  <span class="kpi-sep">·</span>
  <div class="kpi-item">
    <span class="kpi-label">Calls placed</span>
    <span class="kpi-value" id="kpi-calls">—</span>
  </div>
</div>

<main>
  <!-- 1. Live Transcript — hero position, above the fold -->
  <div class="live-transcript-section full-width">
    <div class="section-title">Live Transcript</div>
    <div class="live-transcript-grid">
      <div class="transcript-panel" id="tp-RNT-1001">
        <div class="transcript-header">
          <div class="live-dot" id="dot-RNT-1001" aria-hidden="true"></div>
          <span class="live-label" id="live-label-RNT-1001">Live</span>
          <span id="tname-RNT-1001">RNT-1001 &middot; Alex Rivera</span>
        </div>
        <div class="transcript-scroll" id="ts-RNT-1001" aria-live="polite" aria-label="Live transcript for RNT-1001">
          <div class="t-empty">Waiting for call&hellip;</div>
        </div>
      </div>
      <div class="transcript-panel" id="tp-RNT-1002">
        <div class="transcript-header">
          <div class="live-dot" id="dot-RNT-1002" aria-hidden="true"></div>
          <span class="live-label" id="live-label-RNT-1002">Live</span>
          <span id="tname-RNT-1002">RNT-1002 &middot; Jordan Lee</span>
        </div>
        <div class="transcript-scroll" id="ts-RNT-1002" aria-live="polite" aria-label="Live transcript for RNT-1002">
          <div class="t-empty">Waiting for call&hellip;</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 2. Demo Rentals + Call Log side-by-side -->
  <div>
    <div class="section-title">Demo Rentals</div>
    <div class="rentals-row" id="rental-cards">
      <div class="rental-card"><div class="empty-state">Loading…</div></div>
      <div class="rental-card"><div class="empty-state">Loading…</div></div>
    </div>
  </div>

  <div>
    <div class="section-title">Recent Calls <span id="call-count" style="color:var(--ms-blue)"></span></div>
    <div id="call-list" class="call-list">
      <div class="empty-state">No calls placed yet &mdash; select a rental above and click Make Call.</div>
    </div>
    <div class="refresh-hint" id="refresh-hint"></div>
  </div>

  <!-- 3. AI Integration row: Azure AI Foundry + Copilot Studio -->
  <div class="full-width" style="margin-top: 8px;">
    <div class="section-title">AI Integration</div>
    <div class="ai-panels-row">

      <!-- Left: Azure AI Foundry -->
      <div class="ai-panel">
        <div class="ai-panel-header">
          <div class="ai-panel-icon foundry" aria-hidden="true">&#x2728;</div>
          <div>
            <div class="ai-panel-title">Azure AI Foundry</div>
            <div class="ai-panel-subtitle">Foundry IQ knowledge &amp; model playground</div>
          </div>
        </div>
        <div class="ai-panel-body">
          Inspect the Foundry IQ knowledge sources (overage policy, rate card, sample agreement)
          and test model prompts against the GraceCall system prompt directly in the Foundry playground.
        </div>
        <a class="btn-foundry" href="https://ai.azure.com" target="_blank" rel="noopener noreferrer">
          Open in Foundry Playground &#x2192;
        </a>
      </div>

      <!-- Right: Copilot Studio embedded agent -->
      <div class="ai-panel">
        <div class="ai-panel-header">
          <div class="ai-panel-icon copilot" aria-hidden="true">&#x1F916;</div>
          <div>
            <div class="ai-panel-title">Copilot Studio</div>
            <div class="ai-panel-subtitle">Embedded conversational agent</div>
          </div>
        </div>

        <!-- Placeholder shown until /config-public returns a bot URL -->
        <div class="ai-placeholder" id="copilot-placeholder">
          Copilot Studio agent embed<br>
          <span style="font-size:11px;color:var(--border)">Activate by setting COPILOT_BOT_URL in environment</span>
        </div>

        <!-- iframe injected by JS once bot URL is available -->
        <div class="copilot-iframe-wrap" id="copilot-iframe-wrap">
          <!-- iframe inserted dynamically by initCopilotPanel() -->
        </div>
      </div>

    </div>
  </div>

</main>

<script>
const OBJ_CLASS = { recover:'obj-recover', extend:'obj-extend', charge:'obj-charge', escalate:'obj-escalate' };
const openCards = new Set();

/* ── API key — persisted to localStorage ────────────────────────── */
let _cachedApiKey = localStorage.getItem('gcApiKey') || '';

function getApiKey() {
  return _cachedApiKey;
}

function updateKeyIcon() {
  const btn  = document.getElementById('key-toggle-btn');
  const icon = document.getElementById('key-icon');
  const txt  = document.getElementById('key-status-text');
  if (_cachedApiKey) {
    btn.classList.add('has-key');
    if (icon) icon.textContent = '🔓';
    if (txt) txt.textContent = 'Key set';
  } else {
    btn.classList.remove('has-key');
    if (icon) icon.textContent = '🔒';
    if (txt) txt.textContent = 'API Key';
  }
}

function toggleKeyPopover() {
  const pop = document.getElementById('key-popover');
  pop.classList.toggle('open');
  if (pop.classList.contains('open')) {
    const input = document.getElementById('api-key-input');
    input.value = _cachedApiKey;
    input.focus();
  }
}

function saveApiKey() {
  const val = document.getElementById('api-key-input').value.trim();
  _cachedApiKey = val;
  if (val) localStorage.setItem('gcApiKey', val);
  else localStorage.removeItem('gcApiKey');
  document.getElementById('key-popover').classList.remove('open');
  updateKeyIcon();
}

function clearApiKey() {
  _cachedApiKey = '';
  localStorage.removeItem('gcApiKey');
  document.getElementById('api-key-input').value = '';
  document.getElementById('key-popover').classList.remove('open');
  updateKeyIcon();
}

// Close popover on outside click
document.addEventListener('click', function(e) {
  const area = document.querySelector('.key-area');
  if (area && !area.contains(e.target)) {
    document.getElementById('key-popover').classList.remove('open');
  }
});

updateKeyIcon();

/* ── KPI strip ───────────────────────────────────────────────────── */
function updateKpiStrip(calls, rentals) {
  const active    = calls.filter(c => c.placed && !c.outcome).length;
  const recovered = rentals.filter(r => r.returnedAt).length;
  const overdue   = rentals.filter(r => !r.returnedAt).length;

  const dotActive = document.getElementById('kpi-dot-active');
  if (dotActive) {
    dotActive.className = 'kpi-dot ' + (active > 0 ? 'active' : 'idle');
  }
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = String(val); };
  el('kpi-active',    active);
  el('kpi-overdue',   overdue);
  el('kpi-recovered', recovered);
  el('kpi-calls',     calls.length);
}

/* ── Make Call ───────────────────────────────────────────────────── */
async function makeCall(rentalId, btn) {
  const apiKey = getApiKey();
  const feedbackEl = document.getElementById('call-feedback-' + rentalId);

  function showFeedback(msg, type) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg;
    feedbackEl.className = 'call-feedback ' + type;
  }
  function clearFeedback() {
    if (!feedbackEl) return;
    feedbackEl.textContent = '';
    feedbackEl.className = 'call-feedback';
  }

  if (!apiKey) {
    showFeedback('Click the \u{1F512} key icon in the header to set your API key first.', 'error');
    setTimeout(clearFeedback, 4000);
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Calling…';
  btn.classList.add('calling');
  clearFeedback();

  try {
    const res = await fetch('/trigger-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GraceCall-Key': apiKey,
      },
      body: JSON.stringify({ rentalId }),
    });

    if (res.ok) {
      showFeedback('Call placed', 'success');
      btn.innerHTML = 'Make Call';
      btn.classList.remove('calling');
      await refresh();
      setTimeout(clearFeedback, 3000);
    } else {
      let msg = 'Error ' + res.status;
      try {
        const body = await res.json();
        msg = body.error ?? body.message ?? msg;
      } catch { /* body was not JSON */ }
      showFeedback(msg, 'error');
      btn.innerHTML = 'Make Call';
      btn.classList.remove('calling');
      btn.disabled = false;
    }
  } catch (e) {
    showFeedback('Network error: ' + e.message, 'error');
    btn.innerHTML = 'Make Call';
    btn.classList.remove('calling');
    btn.disabled = false;
  }
}

function badge(obj) {
  const cls = OBJ_CLASS[obj] ?? 'obj-pending';
  return \`<span class="obj-badge \${cls}">\${obj ?? 'pending'}</span>\`;
}

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString() : '';
}

function fmtCountdown(isoDeadline) {
  if (!isoDeadline) return '';
  const diff = Math.round((new Date(isoDeadline).getTime() - Date.now()) / 1000);
  if (diff <= 0) return 'Re-check overdue';
  const m = Math.floor(diff / 60), s = diff % 60;
  return \`Re-check in \${m}m \${s}s\`;
}

async function toggleReturned(rentalId) {
  await fetch(\`/rentals/\${rentalId}/returned\`, { method: 'PATCH' });
  await refresh();
}

async function triggerRecheck(rentalId, btn) {
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const res = await fetch(\`/rentals/\${rentalId}/recheck\`, { method: 'POST' });
    const data = await res.json();
    if (data.status === 'returned') {
      btn.textContent = '✓ Already returned';
    } else {
      btn.textContent = '🚨 Escalated — 2nd call placed';
      btn.style.background = 'var(--recover)';
      btn.style.color = '#fff';
    }
  } catch {
    btn.textContent = 'Error — try again';
    btn.disabled = false;
  }
  await refresh();
}

function renderRentals(rentals, calls) {
  if (!rentals?.length) return '<div class="empty-state">Loading rentals…</div>';
  const byRental = {};
  for (const c of calls) { if (!byRental[c.rentalId]) byRental[c.rentalId] = c; }

  return rentals.map(r => {
    const c = byRental[r.rentalId];
    const isReturned = !!r.returnedAt;
    const isEscalated = !!r.isEscalated;
    const hasRecheck = !!r.promisedReturnAt;
    const plate = \`\${r.vehicle.plate} (\${r.vehicle.class})\`;
    const loc = \`\${r.location.name} · \${r.location.demandLevel} demand\`;

    let statusBadge = '';
    if (isReturned)   statusBadge = '<span class="obj-badge status-returned">✓ Returned</span>';
    else if (isEscalated) statusBadge = '<span class="obj-badge status-escalated">🚨 Escalated</span>';
    else if (hasRecheck)  statusBadge = '<span class="obj-badge status-awaiting">⏳ Awaiting Return</span>';

    const countdown = (!isReturned && hasRecheck)
      ? \`<div class="countdown" id="cd-\${r.rentalId}">\${fmtCountdown(r.promisedReturnAt)}</div>\` : '';

    const recheckBtn = (hasRecheck && !isReturned && !isEscalated)
      ? \`<button class="btn btn-recheck" onclick="triggerRecheck('\${r.rentalId}', this)">Force Re-check Now</button>\` : '';

    const maxAttempts = (r.callAttempts ?? 0) >= 2;
    const callDisabled = (isReturned || maxAttempts) ? 'disabled' : '';
    const callTitle = isReturned
      ? 'Vehicle already returned'
      : maxAttempts
        ? 'Max call attempts reached (2)'
        : '';
    const callBtn = \`<button
        class="btn btn-call"
        \${callDisabled}
        title="\${callTitle}"
        onclick="makeCall('\${r.rentalId}', this)"
      >Make Call</button>\`;

    return \`<div class="rental-card">
      <div class="rental-id">\${r.rentalId}</div>
      <div class="rental-name">\${r.name}</div>
      <div class="rental-stat"><span>Tier</span><span>\${r.tier}</span></div>
      <div class="rental-stat"><span>Vehicle</span><span>\${plate}</span></div>
      <div class="rental-stat"><span>Location</span><span style="text-align:right">\${loc}</span></div>
      \${r.promisedReturnAt ? \`<div class="rental-stat"><span>Promised by</span><span>\${fmtTime(r.promisedReturnAt)}</span></div>\` : ''}
      \${r.returnedAt ? \`<div class="rental-stat"><span>Returned at</span><span style="color:var(--extend)">\${fmtTime(r.returnedAt)}</span></div>\` : ''}
      \${c ? \`<div class="rental-stat"><span>Calls made</span><span>\${r.callAttempts}</span></div>\` : ''}
      \${badge(c?.decision?.objective)} \${statusBadge}
      \${countdown}
      <div class="action-row">
        <button class="btn btn-return \${isReturned ? 'active' : ''}" onclick="toggleReturned('\${r.rentalId}')">
          \${isReturned ? '✓ Mark Not Returned' : 'Mark Returned'}
        </button>
        \${recheckBtn}
        \${callBtn}
      </div>
      <div id="call-feedback-\${r.rentalId}" class="call-feedback"></div>
    </div>\`;
  }).join('');
}

function renderTranscript(items) {
  if (!items?.length) return '<div style="color:var(--muted);font-size:12px;padding:4px 0">No transcript yet</div>';
  return items.map(t => \`
    <div class="bubble \${t.role}">
      <div class="bubble-label">\${t.role === 'agent' ? '🤖 Vera' : '👤 Customer'}</div>
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
    return '<div class="empty-state">No calls placed yet — select a rental above and click Make Call.</div>';
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
    const [callsRes, rentalsRes] = await Promise.all([fetch('/calls'), fetch('/rentals')]);
    if (!callsRes.ok) throw new Error('HTTP ' + callsRes.status);
    const calls = await callsRes.json();
    const rentals = rentalsRes.ok ? await rentalsRes.json() : [];
    errShown = false;
    document.getElementById('call-count').textContent = calls.length ? \`(\${calls.length})\` : '';
    document.getElementById('rental-cards').innerHTML = renderRentals(rentals, calls);
    document.getElementById('call-list').innerHTML = renderCalls(calls);
    document.getElementById('refresh-hint').textContent = 'Last update: ' + new Date().toLocaleTimeString();
    updateKpiStrip(calls, rentals);
  } catch (e) {
    if (!errShown) {
      document.getElementById('call-list').insertAdjacentHTML('afterbegin', \`<div class="error-banner">Cannot reach /calls: \${e.message}</div>\`);
      errShown = true;
    }
  }
}

refresh();
setInterval(refresh, 2000);

/* ── Copilot Studio panel init ─────────────────────────────────────── */
async function initCopilotPanel() {
  try {
    const res = await fetch('/config-public');
    if (!res.ok) return;
    const cfg = await res.json();
    const botUrl = (cfg && typeof cfg.COPILOT_BOT_URL === 'string') ? cfg.COPILOT_BOT_URL.trim() : '';
    if (!botUrl) return;

    const placeholder = document.getElementById('copilot-placeholder');
    const wrap        = document.getElementById('copilot-iframe-wrap');
    if (!placeholder || !wrap) return;

    placeholder.style.display = 'none';
    wrap.style.display        = 'block';

    const iframe = document.createElement('iframe');
    iframe.src              = botUrl;
    iframe.allow            = 'microphone';
    iframe.title            = 'Copilot Studio agent';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
    wrap.appendChild(iframe);
  } catch (_) {
    // /config-public not yet implemented — stay in placeholder mode
  }
}

initCopilotPanel();

/* ── Live Transcript polling ─────────────────────────────────────── */
async function refreshTranscript(rentalId) {
  try {
    const res = await fetch('/transcript/' + rentalId);
    if (!res.ok) return;
    const data = await res.json();
    const panel  = document.getElementById('tp-'          + rentalId);
    const dot    = document.getElementById('dot-'         + rentalId);
    const label  = document.getElementById('live-label-'  + rentalId);
    const scroll = document.getElementById('ts-'          + rentalId);
    if (!panel || !dot || !scroll) return;

    panel.classList.toggle('active', !!data.active);
    dot.classList.toggle('show',    !!data.active);
    if (label) label.classList.toggle('show', !!data.active);

    if (!data.transcript || !data.transcript.length) {
      scroll.innerHTML = '<div class="t-empty">Waiting for call…</div>';
      return;
    }

    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 30;
    scroll.innerHTML = data.transcript.map(function(t) {
      return '<div class="t-bubble ' + t.role + '">' +
        '<div class="t-label">' + (t.role === 'agent' ? '🤖 Vera' : '👤 Customer') + '</div>' +
        t.text +
        '</div>';
    }).join('');
    if (atBottom) scroll.scrollTop = scroll.scrollHeight;
  } catch (_) { /* server not ready yet */ }
}

var TRANSCRIPT_RENTAL_IDS = ['RNT-1001', 'RNT-1002'];
setInterval(function() { TRANSCRIPT_RENTAL_IDS.forEach(refreshTranscript); }, 1000);
TRANSCRIPT_RENTAL_IDS.forEach(refreshTranscript);
</script>
</body>
</html>`;
}
