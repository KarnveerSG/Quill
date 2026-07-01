/** DAP-lite: launch configs, run/stop, output pane, breakpoint gutter marks */
window.QuillModules = window.QuillModules || {};

(() => {
  const S = () => window.QuillModules.state;
  const { escHtml, showToast } = window.QuillModules.util;

  const activeSessionByCfg = new Map();
  let editingIndex = -1;

  function breakpointsForWs(wsId) {
    if (!S().state.breakpoints) S().state.breakpoints = {};
    if (!S().state.breakpoints[wsId]) S().state.breakpoints[wsId] = {};
    return S().state.breakpoints[wsId];
  }

  function persist() { window.QuillModules.workspaces.persist(); }

  function parseArgs(str) {
    const t = String(str || "").trim();
    if (!t) return [];
    const out = [];
    let cur = "";
    let quote = null;
    for (const ch of t) {
      if (quote) {
        if (ch === quote) { quote = null; continue; }
        cur += ch;
      } else if (ch === '"' || ch === "'") { quote = ch; }
      else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ""; } }
      else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  function parseEnv(str) {
    const out = {};
    for (const kv of String(str || "").split(",")) {
      const [k, ...rest] = kv.split("=");
      const key = k?.trim();
      if (!key) continue;
      out[key] = rest.join("=").trim();
    }
    return out;
  }

  async function loadConfig(ws) {
    if (!ws?.cwd) return { configurations: [] };
    const res = await window.quill.debugGetConfig(ws.cwd);
    return res?.config || { configurations: [] };
  }
  async function saveConfig(ws, config) {
    if (!ws?.cwd) return;
    await window.quill.debugSaveConfig({ cwd: ws.cwd, config });
  }

  async function renderDebugPanel() {
    const list = document.getElementById("debug-config-list");
    const bpList = document.getElementById("debug-breakpoint-list");
    if (!list || !bpList) return;
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws?.cwd) {
      list.innerHTML = `<li class="task-empty">Open a folder to configure debug launches</li>`;
      bpList.innerHTML = "";
      return;
    }
    const cfg = await loadConfig(ws);
    const configs = Array.isArray(cfg.configurations) ? cfg.configurations : [];
    if (!configs.length) {
      list.innerHTML = `<li class="task-empty">No configurations. Click + to add one.</li>`;
    } else {
      list.innerHTML = configs.map((c, i) => {
        const running = activeSessionByCfg.has(c.name);
        return `<li class="task-item">
          <span>${escHtml(c.name || "(unnamed)")}${running ? " · <em>running</em>" : ""}</span>
          <span style="display:flex;gap:4px">
            <button type="button" class="scm-btn" data-dbg-run="${i}">${running ? "Stop" : "Run"}</button>
            <button type="button" class="scm-btn" data-dbg-edit="${i}">Edit</button>
          </span>
        </li>`;
      }).join("");
      list.querySelectorAll("[data-dbg-run]").forEach((btn) => {
        btn.onclick = async () => {
          const c = configs[Number(btn.dataset.dbgRun)];
          if (!c) return;
          if (activeSessionByCfg.has(c.name)) {
            await window.quill.debugStop({ id: activeSessionByCfg.get(c.name) });
            activeSessionByCfg.delete(c.name);
            renderDebugPanel();
            return;
          }
          appendOutput(`\n$ ${c.program} ${(c.args || []).join(" ")}\n`, "stdout");
          showOutput(c.name);
          const res = await window.quill.debugStart({
            cwd: ws.cwd, name: c.name, program: c.program,
            args: Array.isArray(c.args) ? c.args : parseArgs(c.args || ""),
            cwd: c.cwd || undefined,
            env: c.env || {},
          });
          if (res?.ok) { activeSessionByCfg.set(c.name, res.id); renderDebugPanel(); }
          else appendOutput(`[quill debug] failed to start: ${res?.error || "?"}\n`, "stderr");
        };
      });
      list.querySelectorAll("[data-dbg-edit]").forEach((btn) => {
        btn.onclick = () => openEditor(Number(btn.dataset.dbgEdit));
      });
    }

    // Breakpoints
    const bps = breakpointsForWs(ws.id);
    const rows = Object.entries(bps).flatMap(([file, lines]) => (lines || []).map((ln) => ({ file, ln })));
    bpList.innerHTML = rows.length
      ? rows.map(({ file, ln }) => `<li class="task-item">
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis">${escHtml(file.split(/[/\\]/).pop())}:${ln}</span>
          <button type="button" class="scm-btn" data-bp-goto="${escHtml(file)}" data-bp-line="${ln}">Go</button>
        </li>`).join("")
      : `<li class="task-empty">Click a line-number gutter to toggle a breakpoint</li>`;
    bpList.querySelectorAll("[data-bp-goto]").forEach((btn) => {
      btn.onclick = async () => {
        await window.QuillModules.editor.openFileInEditor(btn.dataset.bpGoto);
        const ed = S().monacoEditor;
        ed?.revealLineInCenter?.(Number(btn.dataset.bpLine));
      };
    });
  }

  async function openEditor(index) {
    const modal = document.getElementById("debug-config-modal");
    if (!modal) return;
    const ws = window.QuillModules.workspaces.activeWs();
    const cfg = await loadConfig(ws);
    const configs = Array.isArray(cfg.configurations) ? cfg.configurations : [];
    editingIndex = index;
    const cur = index >= 0 ? configs[index] : { name: "Run", program: "python", args: [], cwd: "", env: {} };
    document.getElementById("dcfg-name").value = cur.name || "";
    document.getElementById("dcfg-program").value = cur.program || "";
    document.getElementById("dcfg-args").value = Array.isArray(cur.args) ? cur.args.join(" ") : (cur.args || "");
    document.getElementById("dcfg-cwd").value = cur.cwd || "";
    document.getElementById("dcfg-env").value = Object.entries(cur.env || {}).map(([k, v]) => `${k}=${v}`).join(",");
    document.getElementById("dcfg-status").textContent = "";
    modal.classList.remove("hidden");
  }

  async function saveEditor() {
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws?.cwd) return;
    const cfg = await loadConfig(ws);
    const configs = Array.isArray(cfg.configurations) ? cfg.configurations : [];
    const next = {
      name: document.getElementById("dcfg-name").value.trim() || "Run",
      program: document.getElementById("dcfg-program").value.trim(),
      args: parseArgs(document.getElementById("dcfg-args").value),
      cwd: document.getElementById("dcfg-cwd").value.trim() || undefined,
      env: parseEnv(document.getElementById("dcfg-env").value),
    };
    if (!next.program) { document.getElementById("dcfg-status").textContent = "Program required."; return; }
    if (editingIndex >= 0) configs[editingIndex] = next;
    else configs.push(next);
    await saveConfig(ws, { configurations: configs });
    document.getElementById("debug-config-modal")?.classList.add("hidden");
    renderDebugPanel();
  }

  async function deleteEditor() {
    if (editingIndex < 0) { document.getElementById("debug-config-modal")?.classList.add("hidden"); return; }
    const ws = window.QuillModules.workspaces.activeWs();
    const cfg = await loadConfig(ws);
    const configs = Array.isArray(cfg.configurations) ? cfg.configurations : [];
    configs.splice(editingIndex, 1);
    await saveConfig(ws, { configurations: configs });
    document.getElementById("debug-config-modal")?.classList.add("hidden");
    renderDebugPanel();
  }

  function showOutput(title) {
    const el = document.getElementById("debug-output");
    if (!el) return;
    el.classList.remove("hidden");
    const t = document.getElementById("debug-output-title");
    if (t) t.textContent = `Debug — ${title}`;
  }
  function appendOutput(text, stream) {
    const log = document.getElementById("debug-output-log");
    if (!log) return;
    const span = document.createElement("span");
    span.className = stream === "stderr" ? "stderr" : "";
    span.textContent = text;
    log.appendChild(span);
    log.scrollTop = log.scrollHeight;
  }
  function clearOutput() { const log = document.getElementById("debug-output-log"); if (log) log.textContent = ""; }
  function closeOutput() {
    document.getElementById("debug-output")?.classList.add("hidden");
  }
  async function stopCurrent() {
    for (const [name, id] of activeSessionByCfg) {
      await window.quill.debugStop({ id });
      activeSessionByCfg.delete(name);
    }
    renderDebugPanel();
  }

  function toggleBreakpoint(filePath, line) {
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws) return;
    const bps = breakpointsForWs(ws.id);
    const lines = new Set(bps[filePath] || []);
    if (lines.has(line)) lines.delete(line); else lines.add(line);
    bps[filePath] = [...lines].sort((a, b) => a - b);
    if (!bps[filePath].length) delete bps[filePath];
    persist();
    applyGutterDecorations(filePath);
    renderDebugPanel();
  }

  let bpDecoIds = [];
  function applyGutterDecorations(filePath) {
    const ed = S().monacoEditor;
    if (!ed || !window.monaco) return;
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws) return;
    const bps = breakpointsForWs(ws.id);
    const lines = bps[filePath] || [];
    const decos = lines.map((ln) => ({
      range: new monaco.Range(ln, 1, ln, 1),
      options: { isWholeLine: false, glyphMarginClassName: "dbg-bp", glyphMarginHoverMessage: { value: "Breakpoint (Quill DAP-lite)" } },
    }));
    bpDecoIds = ed.deltaDecorations(bpDecoIds, decos);
  }

  function bindGutterClicks() {
    // Monaco emits mousedown with target.type === MOUSE_TARGET_TYPE.GUTTER_LINE_NUMBERS/GLYPH_MARGIN.
    const ed = S().monacoEditor;
    if (!ed || !window.monaco || ed._quillDapBound) return;
    ed._quillDapBound = true;
    ed.onMouseDown((e) => {
      const t = e.target;
      if (!t) return;
      const isGutter = t.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
        || t.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
      if (!isGutter) return;
      const line = t.position?.lineNumber;
      const file = S().editorFilePath;
      if (line && file) toggleBreakpoint(file, line);
    });
  }

  function bind() {
    document.getElementById("debug-new-config")?.addEventListener("click", () => openEditor(-1));
    document.getElementById("debug-edit-launch")?.addEventListener("click", async () => {
      const ws = window.QuillModules.workspaces.activeWs();
      if (!ws?.cwd) return;
      const p = `${ws.cwd.replace(/[/\\]+$/, "")}/.quill/launch.json`;
      await window.QuillModules.editor.openFileInEditor(p);
    });
    document.getElementById("debug-clear-breakpoints")?.addEventListener("click", () => {
      const ws = window.QuillModules.workspaces.activeWs();
      if (!ws) return;
      S().state.breakpoints = S().state.breakpoints || {};
      S().state.breakpoints[ws.id] = {};
      persist();
      renderDebugPanel();
      const file = S().editorFilePath;
      if (file) applyGutterDecorations(file);
    });
    document.getElementById("dcfg-save")?.addEventListener("click", saveEditor);
    document.getElementById("dcfg-delete")?.addEventListener("click", deleteEditor);
    document.getElementById("debug-config-close")?.addEventListener("click", () =>
      document.getElementById("debug-config-modal")?.classList.add("hidden"));
    document.getElementById("debug-output-close")?.addEventListener("click", closeOutput);
    document.getElementById("debug-output-clear")?.addEventListener("click", clearOutput);
    document.getElementById("debug-output-stop")?.addEventListener("click", () => void stopCurrent());
    window.quill.onDebugData?.(({ data, stream }) => appendOutput(data, stream));
    window.quill.onDebugExit?.(({ name, code }) => {
      appendOutput(`\n[exited ${code ?? 0}]\n`, code ? "stderr" : "stdout");
      if (name) activeSessionByCfg.delete(name);
      renderDebugPanel();
    });
  }

  window.QuillModules.debug = {
    renderDebugPanel,
    bind,
    applyGutterDecorations,
    bindGutterClicks,
    toggleBreakpoint,
  };
})();
