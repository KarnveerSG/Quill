/** Terminal pane grid, mount/kill, layout */
window.QuillModules = window.QuillModules || {};

(() => {
  const S = () => window.QuillModules.state;
  const { escHtml, showToast } = window.QuillModules.util;

  function createFitAddon() {
    if (typeof FitAddon !== "undefined" && FitAddon.FitAddon) return new FitAddon.FitAddon();
    if (typeof FitAddon !== "undefined") return new FitAddon();
    return null;
  }

  function termTheme() {
    const t = S().bootstrap?.themes?.[S().state.theme];
    return t?.terminal || { background: "#0b0b0b", foreground: "#cccccc", cursor: "#3794ff" };
  }

  function ptyWorkspaceId(ptyId) {
    for (const [, t] of S().termInstances) {
      if (t.ptyId === ptyId) return t.wsId;
    }
    return null;
  }

  function pulseActivity(paneId) {
    const dot = document.getElementById(`activity-${paneId}`) || document.getElementById("agent-activity");
    if (!dot) return;
    dot.classList.add("active");
    clearTimeout(dot._pulseTimer);
    dot._pulseTimer = setTimeout(() => dot.classList.remove("active"), 1500);
  }

  function fitActiveTerminals() {
    if (S().fitTerminalsRaf) return;
    S().fitTerminalsRaf = requestAnimationFrame(() => {
      S().fitTerminalsRaf = null;
      const ws = window.QuillModules.workspaces.activeWs();
      if (!ws?.paneIds) return;
      for (const paneId of ws.paneIds) {
        S().termInstances.get(paneId)?.fit?.fit();
      }
    });
  }

  function getWsGrid(ws) {
    const stage = document.getElementById("workspace-stage");
    if (!stage || !ws) return null;
    let grid = document.getElementById(`pane-grid-${ws.id}`);
    if (!grid) {
      grid = document.createElement("div");
      grid.id = `pane-grid-${ws.id}`;
      grid.dataset.wsId = ws.id;
      grid.className = `pane-grid ${ws.layout || "grid-1x1"} ws-pane-grid hidden`;
      stage.appendChild(grid);
    }
    return grid;
  }

  function updateCenterView() {
    document.getElementById("empty-state")?.classList.add("hidden");
    const ws = window.QuillModules.workspaces.activeWs();
    if (ws) {
      document.getElementById("workspace-center-head")?.classList.remove("hidden");
    }
  }

  function showWorkspaceGrid(wsId) {
    document.querySelectorAll(".ws-pane-grid").forEach((g) => {
      g.classList.toggle("hidden", g.dataset.wsId !== wsId);
    });
    updateCenterView();
    window.QuillModules.workspaces.updateWorkspaceHead();
    setTimeout(() => fitActiveTerminals(), 150);
  }

  function toggleTerminalPanel() {
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws) return;
    showWorkspaceGrid(ws.id);
    focusWorkspaceTerminal();
  }

  function focusWorkspaceTerminal() {
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws) return;
    showWorkspaceGrid(ws.id);
    const paneId = (S().primaryPaneId && ws.paneIds?.includes(S().primaryPaneId))
      ? S().primaryPaneId
      : ws.paneIds?.[0];
    if (paneId) focusPane(paneId);
  }

  function focusPane(paneId) {
    S().primaryPaneId = paneId;
    const host = document.getElementById(`term-${paneId}`);
    S().termInstances.get(paneId)?.term?.focus();
    host?.focus();
    fitActiveTerminals();
    window.QuillModules.agentPanel.bindGlobalComposer();
  }

  function isWorkspaceAgentRunning(ws) {
    if (!ws || ws.agentStopped) return false;
    return (ws.paneIds || []).some((id) => S().termInstances.has(id));
  }

  function updateAgentStoppedOverlay(ws) {
    const grid = getWsGrid(ws);
    if (!grid) return;
    grid.querySelector(".agent-stopped-overlay")?.remove();
    grid.classList.toggle("agent-stopped", Boolean(ws?.agentStopped));
    if (!ws?.agentStopped) return;
    const overlay = document.createElement("div");
    overlay.className = "agent-stopped-overlay";
    overlay.innerHTML = `<p>Agent stopped for this workspace</p><button type="button" class="btn-primary ws-start-agent">Start agent</button>`;
    overlay.querySelector(".ws-start-agent").onclick = () => window.QuillModules.terminals.startWorkspaceAgent(ws.id);
    grid.appendChild(overlay);
  }

  async function stopWorkspaceAgent(wsId) {
    const ws = S().state.workspaces.find((w) => w.id === wsId);
    if (!ws || ws.agentStopped) return;
    for (const paneId of ws.paneIds || []) {
      const t = S().termInstances.get(paneId);
      if (t) {
        await window.quill.ptyKill(t.ptyId);
        t.term.dispose();
        S().termInstances.delete(paneId);
      }
    }
    ws.agentStopped = true;
    window.QuillModules.workspaces.persist();
    updateAgentStoppedOverlay(ws);
    window.QuillModules.workspaces.renderWorkspaces();
    window.QuillModules.workspaces.updateWorkspaceHead();
    window.QuillModules.agentPanel.updateAgentComposerState();
    if (wsId === (S().state.agentPanelWorkspaceId || S().state.activeWorkspace)) {
      window.QuillModules.agentPanel.bindGlobalComposer();
    }
  }

  async function startWorkspaceAgent(wsId) {
    const ws = S().state.workspaces.find((w) => w.id === wsId);
    if (!ws || !ws.agentStopped) return;
    ws.agentStopped = false;
    window.QuillModules.workspaces.persist();
    await ensureWorkspaceUI(ws);
    const panelWs = S().state.agentPanelWorkspaceId || S().state.activeWorkspace;
    if (wsId === panelWs) {
      window.QuillModules.agentPanel.bindGlobalComposer();
      window.QuillModules.agentPanel.populateAgentPersona();
      window.QuillCowork?.populateDelegateSelect();
    }
    updateAgentStoppedOverlay(ws);
    window.QuillModules.workspaces.renderWorkspaces();
    window.QuillModules.workspaces.updateWorkspaceHead();
    window.QuillModules.agentPanel.updateAgentComposerState();
  }

  function toggleWorkspaceAgent() {
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws) return;
    if (ws.agentStopped) void startWorkspaceAgent(ws.id);
    else void stopWorkspaceAgent(ws.id);
  }

  function layoutForPaneCount(n) {
    if (n <= 1) return "grid-1x1";
    if (n === 2) return "split-h2";
    if (n <= 4) return "grid-2x2";
    return "grid-3x3";
  }

  function applyGridLayout(grid, ws) {
    const layout = layoutForPaneCount(ws.paneIds.length);
    ws.layout = layout;
    grid.className = `pane-grid ${layout} ws-pane-grid`;
    if (grid.dataset.wsId !== ws.id) grid.dataset.wsId = ws.id;

    if (layout === "split-h2") {
      ws.splitPct = ws.splitPct ?? 50;
      grid.style.gridTemplateColumns = `${ws.splitPct}% 5px 1fr`;
      grid.style.gridTemplateRows = "";
    } else {
      grid.style.gridTemplateColumns = "";
      grid.style.gridTemplateRows = "";
    }
  }

  function createSplitGutter(grid, ws) {
    const gutter = document.createElement("div");
    gutter.className = "pane-split-gutter";
    gutter.onmousedown = (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startPct = ws.splitPct;
      const onMove = (ev) => {
        const delta = ev.clientX - startX;
        const w = grid.clientWidth || 1;
        ws.splitPct = Math.min(80, Math.max(20, startPct + (delta / w) * 100));
        grid.style.gridTemplateColumns = `${ws.splitPct}% 5px 1fr`;
        fitActiveTerminals();
      };
      const onUp = () => {
        window.QuillModules.workspaces.persist();
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
    return gutter;
  }

  function syncGridPanes(grid, ws) {
    const split = ws.paneIds.length === 2;
    const paneMap = new Map();
    grid.querySelectorAll(".pane").forEach((p) => {
      paneMap.set(p.dataset.paneId, p);
      p.remove();
    });
    grid.querySelectorAll(".pane-split-gutter").forEach((g) => g.remove());

    for (let i = 0; i < ws.paneIds.length; i++) {
      const paneId = ws.paneIds[i];
      let paneEl = paneMap.get(paneId);
      if (!paneEl) paneEl = createPaneElement(paneId, ws);
      else updatePaneHeader(paneEl, paneId);
      grid.appendChild(paneEl);
      if (split && i === 0) grid.appendChild(createSplitGutter(grid, ws));
    }
  }

  function updatePaneHeader(paneEl, paneId) {
    const meta = S().state.panes[paneId];
    if (!meta) return;
    const personaEl = paneEl.querySelector(".pane-persona");
    if (personaEl) personaEl.textContent = meta.persona;
  }

  function bindPaneHeader(el, paneId) {
    const header = el.querySelector(".pane-header");
    header?.addEventListener("click", (e) => {
      if (e.target.closest(".pane-close")) return;
      focusPane(paneId);
    });
    header?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showPaneContextMenu(e, paneId);
    });
    el.querySelector(".pane-term")?.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showPaneContextMenu(e, paneId);
    });
    el.querySelector(".pane-close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      void removePane(paneId);
    });
  }

  function createPaneElement(paneId, ws) {
    const meta = S().state.panes[paneId] || { persona: S().DEFAULT_PERSONA, mode: "agent" };
    S().state.panes[paneId] = meta;
    const el = document.createElement("div");
    el.className = "pane";
    el.dataset.paneId = paneId;
    el.innerHTML = `
    <div class="pane-header" data-pane-id="${paneId}">
      <span class="pane-activity" id="activity-${paneId}"></span>
      <span class="pane-persona">${escHtml(meta.persona)}</span>
      <span class="pane-status idle" id="pane-status-${paneId}">idle</span>
      <button type="button" class="pane-close" title="Close pane">×</button>
    </div>
    <div class="pane-term" id="term-${paneId}"></div>
  `;
    bindPaneHeader(el, paneId);
    return el;
  }

  async function ensureWorkspaceUI(ws) {
    if (!ws) return;
    const grid = getWsGrid(ws);
    if (!grid) return;

    ws.panes = ws.paneIds?.length || 1;

    if (!ws.paneIds?.length) {
      const paneId = `pane-${ws.id}-0`;
      ws.paneIds = [paneId];
      S().state.panes[paneId] = { persona: S().DEFAULT_PERSONA, mode: "agent" };
    }

    applyGridLayout(grid, ws);
    syncGridPanes(grid, ws);

    for (const paneId of ws.paneIds) {
      if (!ws.agentStopped && !S().termInstances.has(paneId)) await mountTerminal(paneId, ws);
    }
    updateAgentStoppedOverlay(ws);
    fitActiveTerminals();
  }

  async function renderPanes() {
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws) return;
    await ensureWorkspaceUI(ws);
    showWorkspaceGrid(ws.id);
    S().primaryPaneId = ws.paneIds[0];
    window.QuillModules.agentPanel.populateAgentPersona();
    window.QuillModules.agentPanel.bindGlobalComposer();
    window.QuillCowork?.populateDelegateSelect();
    window.QuillModules.workspaces.renderWorkspaces();
    for (const other of S().state.workspaces) {
      if (other.id !== ws.id) void ensureWorkspaceUI(other);
    }
  }

  async function remountPane(paneId) {
    const ws = S().state.workspaces.find((w) => w.paneIds?.includes(paneId));
    if (!ws || ws.agentStopped) return;
    const t = S().termInstances.get(paneId);
    if (t) {
      await window.quill.ptyKill(t.ptyId);
      t.term.dispose();
      S().termInstances.delete(paneId);
    }
    await mountTerminal(paneId, ws);
  }

  async function mountTerminal(paneId, ws) {
    const host = document.getElementById(`term-${paneId}`);
    if (!host || S().termInstances.has(paneId)) return;

    const meta = S().state.panes[paneId] || { persona: S().DEFAULT_PERSONA, mode: "agent" };
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

    const { id } = await window.quill.ptyCreate({
      cwd: ws.cwd,
      persona: meta.persona,
      mode: "agent",
      named: Boolean(ws.named),
      workspaceId: ws.id,
      cols: term.cols,
      rows: term.rows,
    });
    S().termInstances.set(paneId, { term, fit, ptyId: id, wsId: ws.id });
    window.QuillMultiAgent?.onPaneMounted?.(paneId, S().termInstances.get(paneId));
    term.onData((data) => window.quill.ptyWrite(id, data));
    if (paneId === S().primaryPaneId) window.QuillModules.agentPanel.bindGlobalComposer();

    let lastResizeAt = 0;
    const ro = new ResizeObserver(() => {
      const now = Date.now();
      if (now - lastResizeAt < 100) return;
      lastResizeAt = now;
      if (fit) fit.fit();
      window.quill.ptyResize(id, term.cols, term.rows);
    });
    ro.observe(host);

    setTimeout(() => { if (fit) fit.fit(); }, 200);
  }

  function bindComposer(paneId, ptyId) {
    const composer = document.querySelector(`#composer-${paneId}`)?.closest(".pane-composer");
    const input = document.getElementById(`composer-${paneId}`);
    const send = document.getElementById(`composer-send-${paneId}`);
    if (!input || !send) return;

    let mentionMenu = null;
    let mentionAt = -1;

    const hideMentionMenu = () => {
      mentionMenu?.remove();
      mentionMenu = null;
      mentionAt = -1;
    };

    const submit = () => {
      const text = input.value;
      if (!text) return;
      hideMentionMenu();
      window.quill.ptyWrite(ptyId, text + "\r");
      input.value = "";
    };

    const showMentionMenu = async (query) => {
      const ws = window.QuillModules.workspaces.activeWs();
      if (!ws?.cwd) return;
      hideMentionMenu();
      const res = await window.quill.searchFiles({ cwd: ws.cwd, query, limit: 8 });
      if (!res.files?.length) return;
      mentionMenu = document.createElement("div");
      mentionMenu.className = "mention-menu";
      res.files.forEach((f) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mention-item";
        btn.innerHTML = `${escHtml(f.name)}<small>${escHtml(f.rel)}</small>`;
        btn.onclick = () => {
          const before = input.value.slice(0, mentionAt);
          input.value = `${before}@${f.rel} `;
          hideMentionMenu();
          input.focus();
        };
        mentionMenu.appendChild(btn);
      });
      composer?.appendChild(mentionMenu);
    };

    send.onclick = submit;
    input.onkeydown = (e) => {
      if (e.key === "Escape") hideMentionMenu();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    };
    input.oninput = () => {
      const val = input.value;
      const at = val.lastIndexOf("@");
      if (at < 0 || (at > 0 && !/\s/.test(val[at - 1]))) {
        hideMentionMenu();
        return;
      }
      mentionAt = at;
      showMentionMenu(val.slice(at + 1));
    };
  }

  async function killAllPanes() {
    for (const [, t] of S().termInstances) {
      await window.quill.ptyKill(t.ptyId);
      t.term.dispose();
    }
    S().termInstances.clear();
  }

  async function removePane(paneId) {
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws || ws.paneIds.length <= 1) return;
    const t = S().termInstances.get(paneId);
    if (t) {
      await window.quill.ptyKill(t.ptyId);
      t.term.dispose();
      S().termInstances.delete(paneId);
    }
    ws.paneIds = ws.paneIds.filter((p) => p !== paneId);
    delete S().state.panes[paneId];
    ws.panes = ws.paneIds.length;
    ws.layout = layoutForPaneCount(ws.paneIds.length);
    if (S().primaryPaneId === paneId) S().primaryPaneId = ws.paneIds[0];
    window.QuillModules.workspaces.persist();
    await renderPanes();
    window.QuillMultiAgent?.onPaneRemoved?.();
  }

  async function addPane(personaOverride) {
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws) return;
    if (ws.agentStopped) await startWorkspaceAgent(ws.id);
    if (ws.paneIds.length >= S().MAX_PANES) {
      showToast(`Maximum ${S().MAX_PANES} terminal panes`);
      return;
    }
    const paneId = `pane-${Date.now()}`;
    ws.paneIds = ws.paneIds || [];
    const persona = personaOverride || window.QuillModules.workspaces.pickUnusedPersona(ws);
    ws.paneIds.push(paneId);
    S().state.panes[paneId] = { persona, mode: "agent" };
    ws.panes = ws.paneIds.length;
    ws.layout = layoutForPaneCount(ws.paneIds.length);
    window.QuillModules.workspaces.persist();
    await renderPanes();
    focusPane(paneId);
    window.QuillCowork?.populateDelegateSelect();
  }

  let paneContextMenuEl = null;
  function hidePaneContextMenu() {
    paneContextMenuEl?.remove();
    paneContextMenuEl = null;
  }

  function showPaneContextMenu(e, paneId) {
    hidePaneContextMenu();
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws) return;
    const menu = document.createElement("div");
    menu.className = "pane-context-menu";
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const splitBtn = document.createElement("button");
    splitBtn.type = "button";
    splitBtn.textContent = "Split right";
    splitBtn.onclick = () => { hidePaneContextMenu(); void splitPaneRight(paneId); };
    menu.appendChild(splitBtn);

    const dupBtn = document.createElement("button");
    dupBtn.type = "button";
    dupBtn.textContent = "Duplicate";
    dupBtn.onclick = () => { hidePaneContextMenu(); void duplicatePane(paneId); };
    menu.appendChild(dupBtn);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "danger";
    closeBtn.textContent = "Close";
    closeBtn.onclick = () => { hidePaneContextMenu(); void removePane(paneId); };
    if (ws.paneIds.length <= 1) closeBtn.disabled = true;
    menu.appendChild(closeBtn);

    document.body.appendChild(menu);
    paneContextMenuEl = menu;
    const close = (ev) => {
      if (menu.contains(ev.target)) return;
      hidePaneContextMenu();
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
    };
    setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("contextmenu", close);
    }, 0);
  }

  async function splitPaneRight(paneId) {
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws || ws.paneIds.length >= S().MAX_PANES) {
      showToast(`Maximum ${S().MAX_PANES} terminal panes`);
      return;
    }
    if (ws.agentStopped) await startWorkspaceAgent(ws.id);
    const idx = ws.paneIds.indexOf(paneId);
    const meta = S().state.panes[paneId];
    const persona = window.QuillModules.workspaces.pickUnusedPersona(ws);
    const newPaneId = `pane-${Date.now()}`;
    ws.paneIds.splice(idx + 1, 0, newPaneId);
    S().state.panes[newPaneId] = { persona, mode: meta?.mode || "agent" };
    ws.panes = ws.paneIds.length;
    ws.layout = layoutForPaneCount(ws.paneIds.length);
    window.QuillModules.workspaces.persist();
    await renderPanes();
    focusPane(newPaneId);
  }

  async function duplicatePane(paneId) {
    await addPane();
  }

  window.QuillModules.terminals = {
    createFitAddon,
    termTheme,
    ptyWorkspaceId,
    pulseActivity,
    fitActiveTerminals,
    getWsGrid,
    updateCenterView,
    showWorkspaceGrid,
    toggleTerminalPanel,
    focusWorkspaceTerminal,
    focusPane,
    isWorkspaceAgentRunning,
    updateAgentStoppedOverlay,
    stopWorkspaceAgent,
    startWorkspaceAgent,
    toggleWorkspaceAgent,
    layoutForPaneCount,
    ensureWorkspaceUI,
    renderPanes,
    remountPane,
    mountTerminal,
    bindComposer,
    killAllPanes,
    removePane,
    addPane,
    splitPaneRight,
    duplicatePane,
  };
})();
