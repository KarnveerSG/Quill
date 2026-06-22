/** Phase 2 — multi-agent tray, pane status, task board, handoff */

const QuillMultiAgent = (() => {
  let deps = null;
  const tasksByCwd = new Map();
  let agentsMenuEl = null;

  const TOOL_STATUS = {
    write_file: "editing",
    edit_file: "editing",
    multi_edit: "editing",
    apply_patch: "editing",
    execute_bash: "thinking",
    execute_bash_async: "thinking",
    bash: "thinking",
    finish: "idle",
    read_file: "thinking",
    grep: "thinking",
    glob: "thinking",
    code_search: "thinking",
    web_fetch: "thinking",
    spawn_agent: "thinking",
    bash_job_status: "waiting",
    bash_job_output: "waiting",
    wait_for_file: "waiting",
  };

  function strip(raw) {
    return window.QuillAgentStream?.stripAnsi(raw)
      ?? String(raw || "").replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function defaultStatus() {
    return { status: "idle", currentTask: "", tokens: { in: 0, out: 0 }, lastUpdate: Date.now() };
  }

  function ensureStatus(inst) {
    if (!inst.status) Object.assign(inst, defaultStatus());
  }

  function updatePaneStatusUI(paneId, inst) {
    ensureStatus(inst);
    const pill = document.getElementById(`pane-status-${paneId}`);
    if (!pill) return;
    const { status, currentTask, tokens } = inst;
    pill.className = `pane-status ${status}`;
    const tok = (tokens.in || tokens.out) ? ` · ${tokens.in + tokens.out}` : "";
    const task = currentTask ? ` — ${currentTask.slice(0, 36)}` : "";
    pill.textContent = `${status}${task}${tok}`;
    pill.title = `${status}${task}\n${tokens.in || 0} in / ${tokens.out || 0} out`;
  }

  function mapToolStatus(name) {
    return TOOL_STATUS[name] || "thinking";
  }

  function parsePtyData(paneId, inst, raw) {
    if (!inst) return;
    ensureStatus(inst);
    const clean = strip(raw);

    const toolRe = /\[QUILL_TOOL:([^:\]]+):([^\]\r\n]*)\]/g;
    let m;
    while ((m = toolRe.exec(clean)) !== null) {
      const name = m[1];
      const detail = m[2] || "";
      inst.status = mapToolStatus(name);
      inst.currentTask = detail || name;
      inst.lastUpdate = Date.now();
    }

    const tokM = clean.match(/↳ turn used ([\d,]+) in \/ ([\d,]+) out tokens/);
    if (tokM) {
      inst.tokens.in = parseInt(tokM[1].replace(/,/g, ""), 10) || inst.tokens.in;
      inst.tokens.out = parseInt(tokM[2].replace(/,/g, ""), 10) || inst.tokens.out;
      inst.lastUpdate = Date.now();
    }

    const errM = /\b(error|failed|is_error)\b/i.test(clean) && /\[QUILL_TOOL:/.test(clean);
    if (errM) inst.status = "error";

    updatePaneStatusUI(paneId, inst);
    void ingestTaskMarkers(clean, inst.wsId);
  }

  function countRunningAgents() {
    const state = deps?.getState?.() || { workspaces: [] };
    const terms = deps?.getTermInstances?.() || new Map();
    let n = 0;
    for (const ws of state.workspaces || []) {
      if (ws.agentStopped) continue;
      if ((ws.paneIds || []).some((pid) => terms.has(pid))) n += 1;
    }
    return n;
  }

  function hideAgentsMenu() {
    agentsMenuEl?.remove();
    agentsMenuEl = null;
  }

  function updateAgentsTrayBadge() {
    const badge = document.getElementById("agents-tray-badge");
    if (!badge) return;
    const n = countRunningAgents();
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.classList.toggle("hidden", n === 0);
  }

  function showAgentsTrayMenu(e) {
    hideAgentsMenu();
    const state = deps?.getState?.() || { workspaces: [] };
    const terms = deps?.getTermInstances?.() || new Map();
    const items = (state.workspaces || []).filter((ws) => {
      if (ws.agentStopped) return false;
      return (ws.paneIds || []).some((pid) => terms.has(pid));
    });
    if (!items.length) return;

    const menu = document.createElement("div");
    menu.className = "agents-tray-menu";
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    items.forEach((ws) => {
      const panes = (ws.paneIds || []).filter((pid) => terms.has(pid)).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `<span class="agents-tray-dot"></span><span>${esc(ws.name)}</span><small>${panes} pane${panes === 1 ? "" : "s"}</small>`;
      btn.onclick = () => {
        hideAgentsMenu();
        deps?.switchWorkspace?.(ws.id);
      };
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    agentsMenuEl = menu;
    const close = (ev) => {
      if (!menu.contains(ev.target) && ev.target.id !== "agents-tray-btn") {
        hideAgentsMenu();
        document.removeEventListener("click", close, true);
      }
    };
    setTimeout(() => document.addEventListener("click", close, true), 0);
  }

  async function loadTasksForCwd(cwd) {
    if (!cwd) return [];
    if (tasksByCwd.has(cwd)) return tasksByCwd.get(cwd);
    try {
      const res = await window.quill.getTasks(cwd);
      const tasks = res.tasks || [];
      tasksByCwd.set(cwd, tasks);
      return tasks;
    } catch (_) {
      return [];
    }
  }

  async function saveTasksForCwd(cwd, tasks) {
    if (!cwd) return;
    tasksByCwd.set(cwd, tasks);
    try {
      await window.quill.saveTasks({ cwd, tasks });
    } catch (_) {}
    renderTaskBoard();
  }

  async function ingestTaskMarkers(clean, wsId) {
    const ws = deps?.getState?.()?.workspaces?.find((w) => w.id === wsId);
    const cwd = ws?.cwd;
    if (!cwd) return;
    let tasks = await loadTasksForCwd(cwd);
    let changed = false;

    const startRe = /\[QUILL:TASK_START\s+([^\s\]]+)\s+([^\]]+)\]/g;
    let sm;
    while ((sm = startRe.exec(clean)) !== null) {
      const id = sm[1];
      const title = sm[2].trim();
      const existing = tasks.find((t) => t.id === id);
      if (existing) {
        existing.title = title;
        existing.status = existing.status || "pending";
      } else {
        tasks.push({ id, title, status: "pending", createdAt: Date.now() });
      }
      changed = true;
    }

    const doneRe = /\[QUILL:TASK_DONE\s+([^\s\]]+)\]/g;
    let dm;
    while ((dm = doneRe.exec(clean)) !== null) {
      const id = dm[1];
      const t = tasks.find((x) => x.id === id);
      if (t) {
        t.status = "done";
        t.doneAt = Date.now();
        changed = true;
      }
    }

    const legacyM = clean.match(/\[QUILL_TASK:([^\]]+)\]/);
    if (legacyM) {
      try {
        const parsed = JSON.parse(legacyM[1]);
        if (Array.isArray(parsed)) {
          tasks = parsed.map((t, i) => ({
            id: String(i + 1),
            title: t.text || t.title || "",
            status: t.status || "pending",
          }));
          changed = true;
        }
      } catch (_) {}
    }

    if (changed) await saveTasksForCwd(cwd, tasks);
  }

  function renderTaskBoard() {
    const list = document.getElementById("task-board-list");
    if (!list) return;
    const ws = deps?.activeWs?.();
    const cwd = ws?.cwd;
    if (!cwd) {
      list.innerHTML = `<li class="task-empty">Open a folder to track tasks</li>`;
      return;
    }
    void loadTasksForCwd(cwd).then((tasks) => {
      if (!tasks.length) {
        list.innerHTML = `<li class="task-empty">No tasks yet — agent uses task_track</li>`;
        return;
      }
      const icons = { pending: "○", in_progress: "◐", done: "●" };
      list.innerHTML = tasks.map((t) =>
        `<li class="task-item task-${esc(t.status || "pending")}" data-id="${esc(t.id)}">
          <span class="task-icon">${icons[t.status] || "○"}</span>
          <span class="task-title">${esc(t.title)}</span>
        </li>`
      ).join("");
    });
  }

  function formatComposerWrite(text, targetPaneId) {
    const ws = deps?.agentPanelWs?.();
    if (!targetPaneId || !ws?.paneIds?.includes(targetPaneId)) return text;
    const primary = ws.paneIds[0];
    if (targetPaneId === primary) return text;
    const persona = deps?.getPanePersona?.(targetPaneId) || "Agent";
    return `/handoff ${persona}\n${text}`;
  }

  function bindAgentsTray() {
    document.getElementById("agents-tray-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      showAgentsTrayMenu(e);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideAgentsMenu();
    });
  }

  function bindProviderSwitcher() {
    const sel = document.getElementById("status-provider");
    if (!sel) return;
    const providers = deps?.getBootstrap?.()?.providers || ["auto", "anthropic", "cursor", "local"];
    const active = deps?.getBootstrap?.()?.activeProvider || "auto";
    const localOk = deps?.getBootstrap?.()?.localLlmAvailable;
    sel.innerHTML = providers.map((p) => {
      const label = p === "local" && !localOk ? `${p} (offline)` : p;
      const dis = p === "local" && !localOk ? " disabled" : "";
      return `<option value="${esc(p)}"${p === active ? " selected" : ""}${dis}>${esc(label)}</option>`;
    }).join("");
    sel.onchange = async () => {
      const v = sel.value;
      const res = await window.quill.setProvider(v);
      if (res?.ok) deps?.showToast?.(`Provider: ${v}`);
      else deps?.showToast?.(res?.error || "Provider switch failed");
    };
  }

  function onPaneMounted(paneId, inst) {
    Object.assign(inst, defaultStatus());
    updatePaneStatusUI(paneId, inst);
    updateAgentsTrayBadge();
  }

  function onPaneRemoved() {
    updateAgentsTrayBadge();
  }

  function onWorkspaceChange() {
    updateAgentsTrayBadge();
    renderTaskBoard();
    tasksByCwd.clear();
  }

  function init(hooks) {
    deps = hooks;
    bindAgentsTray();
    bindProviderSwitcher();
    updateAgentsTrayBadge();
    renderTaskBoard();
  }

  return {
    init,
    parsePtyData,
    updateAgentsTrayBadge,
    formatComposerWrite,
    onPaneMounted,
    onPaneRemoved,
    onWorkspaceChange,
    renderTaskBoard,
    updatePaneStatusUI,
  };
})();

window.QuillMultiAgent = QuillMultiAgent;
