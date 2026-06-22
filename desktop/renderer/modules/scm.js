/** Source control panel — status, stage, commit, branches */
window.QuillModules = window.QuillModules || {};

(() => {
  const S = () => window.QuillModules.state;
  const { escHtml, pathsEqual } = window.QuillModules.util;

  function scmStatusLabel(code) {
    return S().SCM_STATUS_LABELS[code] || code;
  }

  function relToWorkspace(absPath, workspaceCwd) {
    const a = String(absPath || "").replace(/\\/g, "/");
    const w = String(workspaceCwd || "").replace(/\\/g, "/").replace(/\/$/, "");
    if (!w) return null;
    const prefix = `${w}/`;
    if (a.toLowerCase().startsWith(prefix.toLowerCase())) return a.slice(prefix.length);
    return null;
  }

  function renderScmFileRow(f, ws) {
    const displayPath = relToWorkspace(f.absPath, ws.cwd) || f.path;
    const label = scmStatusLabel(f.status);
    const unstaged = !f.staged || (f.worktree !== " " && f.worktree !== "?");
    return `
    <li class="scm-file${f.staged ? " staged" : ""}${unstaged && f.staged ? " partial" : ""}" data-path="${escHtml(f.absPath)}">
      <span class="scm-code scm-code-${f.status}" title="${escHtml(label)}">${escHtml(label)}</span>
      <span class="scm-name" title="${escHtml(f.path)}">${escHtml(displayPath)}</span>
      ${unstaged ? `<button type="button" class="scm-stage-one" data-rel="${escHtml(f.path)}" title="Stage">+</button>` : ""}
    </li>`;
  }

  function bindScmFileRows(container) {
    container.querySelectorAll(".scm-file").forEach((li) => {
      li.onclick = (e) => {
        if (e.target.closest(".scm-stage-one")) return;
        window.QuillModules.editor.openFileInEditor(li.dataset.path);
      };
    });
    container.querySelectorAll(".scm-stage-one").forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        await stageFiles([btn.dataset.rel]);
      };
    });
  }

  async function refreshScmPanel() {
    const ws = window.QuillModules.workspaces.activeWs();
    const container = document.getElementById("scm-files");
    const statusEl = document.getElementById("scm-status");
    if (!ws?.cwd || !container) return;
    const res = await window.quill.gitStatusFiles(ws.cwd);
    if (!res.ok) {
      container.innerHTML = `<p class="scm-empty">${escHtml(res.error || "Not a git repo")}</p>`;
      return;
    }
    const staged = res.files.filter((f) => f.staged);
    const unstaged = res.files.filter((f) => !f.staged || (f.worktree !== " " && f.worktree !== "?"));
    const showRepoHint = res.repoRoot && !pathsEqual(res.repoRoot, ws.cwd);
    const parts = [];
    if (showRepoHint) {
      parts.push(`<p class="scm-repo-hint" title="${escHtml(res.repoRoot)}">Repo: ${escHtml(res.repoRoot)}</p>`);
    }
    if (!res.files.length) {
      parts.push(`<p class="scm-empty">No changes</p>`);
    } else {
      if (staged.length) {
        parts.push(`
        <section class="scm-section">
          <h4 class="scm-section-title">Staged (${staged.length})</h4>
          <ul class="scm-list">${staged.map((f) => renderScmFileRow(f, ws)).join("")}</ul>
        </section>`);
      }
      if (unstaged.length) {
        parts.push(`
        <section class="scm-section">
          <h4 class="scm-section-title">Changes (${unstaged.length})</h4>
          <ul class="scm-list">${unstaged.map((f) => renderScmFileRow(f, ws)).join("")}</ul>
        </section>`);
      }
    }
    container.innerHTML = parts.join("");
    bindScmFileRows(container);
    if (statusEl && !statusEl.dataset.sticky) statusEl.textContent = "";
  }

  async function refreshBranchDropdown() {
    const sel = document.getElementById("status-branch");
    if (!sel) return;
    const ws = window.QuillModules.workspaces.activeWs();
    if (!ws?.cwd) {
      sel.innerHTML = `<option value="">—</option>`;
      sel.disabled = true;
      return;
    }
    const res = await window.quill.gitBranches(ws.cwd);
    if (!res.ok || !res.branches?.length) {
      sel.innerHTML = `<option value="">${escHtml(res.current || "—")}</option>`;
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = res.branches.map((b) =>
      `<option value="${escHtml(b.name)}"${b.current ? " selected" : ""}>⎇ ${escHtml(b.name)}</option>`
    ).join("");
  }

  async function switchBranch(branch) {
    const ws = window.QuillModules.workspaces.activeWs();
    const statusEl = document.getElementById("scm-status");
    if (!ws?.cwd || !branch) return;
    const res = await window.quill.gitCheckout({ cwd: ws.cwd, branch });
    if (!res.ok) {
      if (statusEl) {
        statusEl.textContent = res.error;
        statusEl.dataset.sticky = "1";
        setTimeout(() => { statusEl.dataset.sticky = ""; }, 4000);
      }
      await refreshBranchDropdown();
      return;
    }
    if (statusEl) statusEl.textContent = "";
    await window.QuillModules.workspaces.refreshGitInfo();
  }

  async function stageFiles(files, all = false) {
    const ws = window.QuillModules.workspaces.activeWs();
    const statusEl = document.getElementById("scm-status");
    const res = await window.quill.gitStage({ cwd: ws?.cwd, files: files || undefined, all });
    if (!res.ok) {
      if (statusEl) statusEl.textContent = res.error;
      return;
    }
    if (statusEl) statusEl.textContent = "";
    await window.QuillModules.workspaces.refreshGitInfo();
  }

  async function commitChanges() {
    const ws = window.QuillModules.workspaces.activeWs();
    const input = document.getElementById("scm-message");
    const statusEl = document.getElementById("scm-status");
    const msg = input?.value?.trim();
    if (!msg) {
      if (statusEl) statusEl.textContent = "Commit message required.";
      return;
    }
    const res = await window.quill.gitCommit({ cwd: ws?.cwd, message: msg });
    if (!res.ok) {
      if (statusEl) statusEl.textContent = res.error;
      return;
    }
    if (input) input.value = "";
    if (statusEl) statusEl.textContent = "Committed.";
    setTimeout(() => { if (statusEl?.textContent === "Committed.") statusEl.textContent = ""; }, 3000);
    await window.QuillModules.workspaces.refreshGitInfo();
  }

  function bindScm() {
    document.getElementById("scm-stage-all")?.addEventListener("click", () => stageFiles(null, true));
    document.getElementById("scm-refresh")?.addEventListener("click", () => refreshScmPanel());
    document.getElementById("scm-commit")?.addEventListener("click", commitChanges);
    document.getElementById("scm-message")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); commitChanges(); }
    });
    const branchSel = document.getElementById("status-branch");
    if (branchSel) {
      branchSel.addEventListener("change", () => {
        const ws = window.QuillModules.workspaces.activeWs();
        const current = ws ? S().gitCache[ws.id]?.branch : null;
        if (branchSel.value && branchSel.value !== current) switchBranch(branchSel.value);
      });
    }
  }

  window.QuillModules.scm = {
    scmStatusLabel,
    relToWorkspace,
    renderScmFileRow,
    bindScmFileRows,
    refreshScmPanel,
    refreshBranchDropdown,
    switchBranch,
    stageFiles,
    commitChanges,
    bindScm,
  };
})();
