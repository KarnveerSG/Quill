/** Quill desktop — workspace + xterm agent terminals */

const state = { workspaces: [], activeWorkspace: null, theme: "dark", panes: {} };
const termInstances = new Map();
let bootstrap = null;
let settingsSection = "appearance";

const COMMANDS = [
  { id: "settings", label: "Open settings", run: () => openSettings("appearance") },
  { id: "new-pane", label: "New terminal pane", run: () => addPane() },
  { id: "open-folder", label: "Open folder", run: () => openFolder() },
];

function createFitAddon() {
  if (typeof FitAddon !== "undefined" && FitAddon.FitAddon) return new FitAddon.FitAddon();
  if (typeof FitAddon !== "undefined") return new FitAddon();
  return null;
}

function termTheme() {
  const t = bootstrap?.themes?.[state.theme];
  return t?.terminal || { background: "#14141c", foreground: "#e8e8f0", cursor: "#7eb8ff" };
}

async function init() {
  bootstrap = await window.quill.getBootstrap();
  Object.assign(state, bootstrap.state);
  if (!state.workspaces?.length) resetDefaultState();
  applyTheme();
  renderWorkspaces();
  await renderPanes();
  document.getElementById("status-path").textContent = bootstrap.quillPath || "Quill";
  renderSettingsNav();
  bindEvents();
  bindMenubar();

  window.quill.onPtyData(({ id, data }) => {
    for (const [, t] of termInstances) {
      if (t.ptyId === id) t.term.write(data);
    }
  });
  window.quill.onPtyExit(({ id }) => {
    for (const [, t] of termInstances) {
      if (t.ptyId === id) t.term.write("\r\n\x1b[33m[Quill exited — press Enter or restart app]\x1b[0m\r\n");
    }
  });
}

function resetDefaultState() {
  const home = bootstrap?.state?.workspaces?.[0]?.cwd || "";
  const paneId = "pane-main";
  state.stateVersion = 2;
  state.workspaces = [{
    id: "ws-main", name: "Quill", color: bootstrap.rainbow[4], cwd: home,
    folders: [home], panes: 1, layout: "grid-1x1", paneIds: [paneId],
  }];
  state.activeWorkspace = "ws-main";
  state.panes = { [paneId]: { persona: "Iris", mode: "agent" } };
}

function activeWs() {
  return state.workspaces.find((w) => w.id === state.activeWorkspace) || state.workspaces[0];
}

function applyTheme() {
  const t = bootstrap?.themes?.[state.theme] || bootstrap?.themes?.dark;
  document.body.className = t?.cssClass || "theme-dark";
  if (t?.vars) {
    for (const [k, v] of Object.entries(t.vars)) document.documentElement.style.setProperty(k, v);
  }
  for (const [, inst] of termInstances) {
    inst.term.options.theme = termTheme();
  }
}

function renderWorkspaces() {
  const ul = document.getElementById("workspace-list");
  ul.innerHTML = "";
  state.workspaces.forEach((ws) => {
    const li = document.createElement("li");
    li.className = "ws-item" + (ws.id === state.activeWorkspace ? " active" : "");
    li.style.setProperty("--ws-color", ws.color);
    const folders = (ws.folders || []).length;
    li.innerHTML = `<span class="ws-dot"></span><span>${ws.name}</span><span class="ws-badge">${ws.paneIds?.length || 1}${folders > 1 ? ` · ${folders} folders` : ""}</span>`;
    li.onclick = () => switchWorkspace(ws.id);
    ul.appendChild(li);
  });
}

async function switchWorkspace(id) {
  if (id === state.activeWorkspace) return;
  await killAllPanes();
  state.activeWorkspace = id;
  persist();
  renderWorkspaces();
  await renderPanes();
}

async function renderPanes() {
  const grid = document.getElementById("pane-grid");
  const ws = activeWs();
  if (!ws) return;

  ws.layout = ws.layout || "grid-1x1";
  ws.panes = ws.paneIds?.length || 1;
  grid.className = "pane-grid " + ws.layout;

  if (!ws.paneIds?.length) {
    const paneId = `pane-${ws.id}-0`;
    ws.paneIds = [paneId];
    state.panes[paneId] = { persona: "Iris", mode: "agent" };
  }

  grid.innerHTML = "";
  await killAllPanes();

  for (const paneId of ws.paneIds) {
    grid.appendChild(createPaneElement(paneId, ws));
  }
  for (const paneId of ws.paneIds) {
    await mountTerminal(paneId, ws);
  }
  renderWorkspaces();
}

function createPaneElement(paneId, ws) {
  const meta = state.panes[paneId] || { persona: "Iris", mode: "agent" };
  state.panes[paneId] = meta;
  const el = document.createElement("div");
  el.className = "pane";
  el.innerHTML = `
    <div class="pane-header">
      <span class="pane-persona">${meta.persona}</span>
      <span class="pane-mode">Quill agent</span>
      ${ws.paneIds.length > 1 ? `<button type="button" class="pane-close" title="Close pane">×</button>` : ""}
    </div>
    <div class="pane-term" id="term-${paneId}"></div>
    <div class="pane-footer">${ws.cwd || ""}</div>`;
  const close = el.querySelector(".pane-close");
  if (close) close.onclick = () => removePane(paneId);
  return el;
}

async function mountTerminal(paneId, ws) {
  const host = document.getElementById(`term-${paneId}`);
  if (!host || termInstances.has(paneId)) return;

  const meta = state.panes[paneId] || { persona: "Iris", mode: "agent" };
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "Cascadia Code, Consolas, monospace",
    theme: termTheme(),
    convertEol: true,
  });
  const fit = createFitAddon();
  if (fit) term.loadAddon(fit);
  term.open(host);
  if (fit) fit.fit();

  const { id } = await window.quill.ptyCreate({ cwd: ws.cwd, persona: meta.persona, mode: "agent" });
  termInstances.set(paneId, { term, fit, ptyId: id });
  term.onData((data) => window.quill.ptyWrite(id, data));

  const ro = new ResizeObserver(() => {
    if (fit) fit.fit();
    window.quill.ptyResize(id, term.cols, term.rows);
  });
  ro.observe(host);

  setTimeout(() => { if (fit) fit.fit(); }, 200);
}

async function killAllPanes() {
  for (const [, t] of termInstances) {
    await window.quill.ptyKill(t.ptyId);
    t.term.dispose();
  }
  termInstances.clear();
}

async function removePane(paneId) {
  const ws = activeWs();
  if (!ws || ws.paneIds.length <= 1) return;
  const t = termInstances.get(paneId);
  if (t) {
    await window.quill.ptyKill(t.ptyId);
    t.term.dispose();
    termInstances.delete(paneId);
  }
  ws.paneIds = ws.paneIds.filter((p) => p !== paneId);
  delete state.panes[paneId];
  ws.panes = ws.paneIds.length;
  persist();
  await renderPanes();
}

async function addPane() {
  const ws = activeWs();
  if (!ws) return;
  const paneId = `pane-${Date.now()}`;
  ws.paneIds = ws.paneIds || [];
  ws.paneIds.push(paneId);
  state.panes[paneId] = { persona: bootstrap.personas[ws.paneIds.length % bootstrap.personas.length], mode: "agent" };
  ws.panes = ws.paneIds.length;
  ws.layout = ws.paneIds.length <= 1 ? "grid-1x1" : ws.paneIds.length <= 4 ? "grid-2x2" : "grid-3x2";
  persist();
  await renderPanes();
}

async function openFolder() {
  const folder = await window.quill.pickFolder();
  if (!folder) return;
  const ws = activeWs();
  if (ws) {
    ws.cwd = folder;
    if (!ws.folders) ws.folders = [];
    if (!ws.folders.includes(folder)) ws.folders.push(folder);
    persist();
    await killAllPanes();
    await renderPanes();
    renderWorkspaces();
  }
}

async function addFolderToWorkspace() {
  const folder = await window.quill.pickFolder();
  if (!folder) return;
  const ws = activeWs();
  if (!ws.folders) ws.folders = [ws.cwd];
  if (!ws.folders.includes(folder)) ws.folders.push(folder);
  persist();
  renderWorkspaces();
}

async function openWorkspaceFile() {
  const file = await window.quill.pickWorkspaceFile();
  if (!file) return;
  alert(`Workspace file selected: ${file}\n(Full workspace import coming soon — see future_features.md)`);
}

function addWorkspace() {
  const i = state.workspaces.length;
  const id = `ws-${Date.now()}`;
  const paneId = `pane-${id}-0`;
  state.workspaces.push({
    id,
    name: `Workspace ${i + 1}`,
    color: bootstrap.rainbow[i % bootstrap.rainbow.length],
    cwd: activeWs()?.cwd || "",
    folders: [],
    panes: 1,
    layout: "grid-1x1",
    paneIds: [paneId],
  });
  state.panes[paneId] = { persona: bootstrap.personas[i % bootstrap.personas.length], mode: "agent" };
  state.activeWorkspace = id;
  persist();
  switchWorkspace(id);
}

function persist() {
  window.quill.saveState(state);
}

function bindMenubar() {
  document.querySelectorAll(".menu-item").forEach((item) => {
    const trigger = item.querySelector(".menu-trigger");
    const dropdown = item.querySelector(".menu-dropdown");
    if (!dropdown) return;
    trigger.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll(".menu-dropdown").forEach((d) => d.classList.add("hidden"));
      dropdown.classList.toggle("hidden");
    };
    dropdown.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.onclick = () => {
        dropdown.classList.add("hidden");
        handleAction(btn.dataset.action);
      };
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".menu-dropdown").forEach((d) => d.classList.add("hidden"));
  });
}

function handleAction(action) {
  const map = {
    "open-workspace": openWorkspaceFile,
    "open-folder": openFolder,
    "add-folder": addFolderToWorkspace,
    settings: () => openSettings("integrations"),
    "settings-appearance": () => openSettings("appearance"),
    quit: () => window.quill.quit(),
    palette: openPalette,
    "new-pane": addPane,
    about: () => openSettings("about"),
  };
  map[action]?.();
}

function bindEvents() {
  document.getElementById("add-workspace").onclick = addWorkspace;
  document.getElementById("settings-close").onclick = closeSettings;
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "p") { e.preventDefault(); openPalette(); }
    if (e.ctrlKey && e.shiftKey && e.key === "I") { cycleTheme(); }
    if (e.key === "Escape") { closePalette(); closeSettings(); }
  });
}

function cycleTheme() {
  const ids = Object.keys(bootstrap.themes || { dark: 1, imode: 1 });
  const idx = ids.indexOf(state.theme);
  state.theme = ids[(idx + 1) % ids.length];
  applyTheme();
  persist();
}

function openSettings(section = "appearance") {
  settingsSection = section;
  document.getElementById("settings").classList.remove("hidden");
  renderSettingsNav();
  renderSettingsContent();
}

function closeSettings() {
  document.getElementById("settings").classList.add("hidden");
}

function renderSettingsNav() {
  const nav = document.getElementById("settings-nav");
  if (!nav || !bootstrap) return;
  nav.innerHTML = bootstrap.settingsSections.map((s) =>
    `<button type="button" class="settings-nav-item${s.id === settingsSection ? " active" : ""}" data-section="${s.id}">
      <span class="nav-icon">${s.icon}</span>${s.label}${s.comingSoon ? ' <em class="soon">Soon</em>' : ""}
    </button>`
  ).join("");
  nav.querySelectorAll(".settings-nav-item").forEach((btn) => {
    btn.onclick = () => {
      settingsSection = btn.dataset.section;
      renderSettingsNav();
      renderSettingsContent();
    };
  });
}

function renderSettingsContent() {
  const el = document.getElementById("settings-content");
  if (!el || !bootstrap) return;
  const sec = bootstrap.settingsSections.find((s) => s.id === settingsSection);

  if (settingsSection === "mcp" || settingsSection === "remote") {
    el.innerHTML = `<div class="settings-page coming-soon-page">
      <h3>${sec?.label || settingsSection}</h3>
      <p class="badge-soon">Coming Soon</p>
      <p class="settings-sub">Planned for a future release. See <code>future_features.md</code> in the repo.</p>
    </div>`;
    return;
  }

  if (settingsSection === "skills") {
    el.innerHTML = `<div class="settings-page coming-soon-page">
      <h3>MCP Skills</h3>
      <p class="badge-soon">Coming Soon</p>
      <p class="settings-sub">Configure MCP servers and agent skills from one panel.</p>
    </div>`;
    return;
  }

  if (settingsSection === "appearance") {
    const opts = Object.entries(bootstrap.themes || {}).map(([id, t]) =>
      `<option value="${id}"${state.theme === id ? " selected" : ""}>${t.label}</option>`
    ).join("");
    el.innerHTML = `<div class="settings-page">
      <h3>Appearance</h3>
      <p class="settings-sub">Color theme for the IDE shell and terminals.</p>
      <label class="field-row"><span>Theme</span><select id="theme-select">${opts}</select></label>
      <button type="button" class="btn-primary" id="save-appearance">Apply</button>
      <p class="settings-sub">Shortcut: Ctrl+Shift+I to cycle themes.</p>
    </div>`;
    document.getElementById("save-appearance").onclick = () => {
      state.theme = document.getElementById("theme-select").value;
      applyTheme();
      persist();
    };
    return;
  }

  if (settingsSection === "integrations") {
    el.innerHTML = `<div class="settings-page">
      <div class="settings-page-head"><div><h3>Integrations</h3>
      <p class="settings-sub">Keys saved to <code>~/.quill/.env</code>.</p></div>
      <span class="integration-count">${bootstrap.integrationsSummary}</span></div>
      <div class="integration-list" id="integration-list"></div></div>`;
    renderIntegrationCards();
    return;
  }

  if (settingsSection === "models") {
    el.innerHTML = `<div class="settings-page"><h3>Models</h3><p class="settings-sub">LLM provider keys.</p>
      <div class="env-form" id="models-form"></div><button type="button" class="btn-primary" id="save-models">Save</button></div>`;
    renderEnvForm("models-form", bootstrap.coreEnvKeys);
    document.getElementById("save-models").onclick = () => saveEnvForm("models-form");
    return;
  }

  if (settingsSection === "about") {
    el.innerHTML = `<div class="settings-page about-page"><h3>Quill</h3><p class="settings-sub">CODE BEAUTIFUL</p>
      <p>Version ${bootstrap.version || "0.2.0"}</p></div>`;
    return;
  }

  el.innerHTML = `<div class="settings-page"><h3>${sec?.label || settingsSection}</h3><p class="settings-sub">Coming soon.</p></div>`;
}

function renderIntegrationCards() {
  const list = document.getElementById("integration-list");
  if (!list) return;
  list.innerHTML = bootstrap.integrations.map((int) => `
    <details class="integration-card ${int.status}">
      <summary><span class="int-name">${int.name}</span>
      <span class="int-badge ${int.status}">${int.status === "connected" ? "✓ Connected" : "Not connected"}</span></summary>
      <p class="int-desc">${int.desc}</p>
      <div class="int-keys">${int.keys.map((k) => `
        <label class="field-row"><span>${k.label}</span>
        <input type="password" data-env="${k.env}" placeholder="${k.placeholder}" autocomplete="off" /></label>`).join("")}
        <button type="button" class="btn-primary save-int">Save</button></div>
    </details>`).join("");
  list.querySelectorAll(".save-int").forEach((btn) => {
    btn.onclick = async () => {
      const wrap = btn.closest(".int-keys");
      const updates = {};
      wrap.querySelectorAll("input[data-env]").forEach((inp) => {
        if (inp.value.trim()) updates[inp.dataset.env] = inp.value.trim();
      });
      const res = await window.quill.saveEnvKeys(updates);
      bootstrap.integrationsSummary = res.integrationsSummary;
      renderIntegrationCards();
    };
  });
}

function renderEnvForm(id, keys) {
  const form = document.getElementById(id);
  if (!form) return;
  form.innerHTML = keys.map((k) => `
    <label class="field-row"><span>${k.label}</span>
    <input type="password" data-env="${k.env}" placeholder="${k.placeholder || ""}" autocomplete="off" /></label>`).join("");
}

async function saveEnvForm(id) {
  const form = document.getElementById(id);
  const updates = {};
  form.querySelectorAll("input[data-env]").forEach((inp) => {
    if (inp.value.trim()) updates[inp.dataset.env] = inp.value.trim();
  });
  await window.quill.saveEnvKeys(updates);
  bootstrap = await window.quill.getBootstrap();
}

function openPalette() {
  document.getElementById("palette").classList.remove("hidden");
  const input = document.getElementById("palette-input");
  input.value = "";
  input.focus();
  renderPalette("");
  input.oninput = () => renderPalette(input.value);
}

function closePalette() {
  document.getElementById("palette").classList.add("hidden");
}

function renderPalette(q) {
  const list = document.getElementById("palette-list");
  const filtered = COMMANDS.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  list.innerHTML = filtered.map((c, i) => `<li data-id="${c.id}" class="${i === 0 ? "active" : ""}">${c.label}</li>`).join("");
  list.querySelectorAll("li").forEach((li) => {
    li.onclick = () => { COMMANDS.find((c) => c.id === li.dataset.id)?.run(); closePalette(); };
  });
}

init().catch((err) => {
  document.body.innerHTML = `<pre style="color:#ff6b6b;padding:20px">Quill failed: ${err.message}</pre>`;
});
