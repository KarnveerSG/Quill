/** Monaco editor, file tree, open/save */
window.QuillModules = window.QuillModules || {};

(() => {
  const S = () => window.QuillModules.state;
  const { escHtml, pathsEqual, showToast, loadScript } = window.QuillModules.util;

  function monacoThemeId() {
    return S().state.theme === "imode" ? "vs" : "vs-dark";
  }

  function guessMonacoLang(filePath) {
    const ext = (filePath.split(".").pop() || "").toLowerCase();
    const map = {
      js: "javascript", ts: "typescript", py: "python", json: "json", md: "markdown",
      html: "html", css: "css", yml: "yaml", yaml: "yaml", rs: "rust", go: "go",
    };
    return map[ext] || "plaintext";
  }

  function ensureMonaco() {
    if (S().monacoInitPromise) return S().monacoInitPromise;
    S().monacoInitPromise = (async () => {
      if (window.monaco?.editor) return;
      const vsBase = window.QuillFeatures ? await window.QuillFeatures.monacoVsBase() : "./vendor/monaco/vs";
      await loadScript(`${vsBase}/loader.js`);
      window.require.config({ paths: { vs: vsBase } });
      await new Promise((resolve, reject) => {
        window.require(["vs/editor/editor.main"], () => resolve(), reject);
      });
      const el = document.getElementById("monaco-editor");
      if (el && !S().monacoEditor) {
        S().monacoEditor = monaco.editor.create(el, {
          theme: monacoThemeId(),
          automaticLayout: true,
          minimap: { enabled: true },
          fontSize: 13,
          fontFamily: "Cascadia Code, Consolas, monospace",
          scrollBeyondLastLine: false,
          glyphMargin: true,
        });
        S().monacoEditor.onDidChangeModelContent(() => {
          S().editorDirty = true;
          updateEditorDirty();
          window.QuillFeatures?.onEditorContentChange();
        });
      }
      const diffEl = document.getElementById("monaco-diff");
      if (diffEl && !S().monacoDiff) {
        S().monacoDiff = monaco.editor.createDiffEditor(diffEl, {
          theme: monacoThemeId(),
          automaticLayout: true,
          readOnly: true,
          renderSideBySide: true,
          fontSize: 13,
          fontFamily: "Cascadia Code, Consolas, monospace",
        });
      }
      window.QuillFeatures?.registerLspProviders();
    })();
    return S().monacoInitPromise;
  }

  function updateEditorDirty() {
    const tabs = window.QuillFeatures?.getOpenTabs?.();
    if (tabs && S().editorFilePath && tabs.has(S().editorFilePath)) {
      window.QuillFeatures.renderTabs();
      return;
    }
    const dot = document.getElementById("editor-dirty");
    if (dot) dot.classList.toggle("hidden", !S().editorDirty);
  }

  async function saveEditor() {
    if (!S().editorFilePath || !S().monacoEditor) return;
    const ws = window.QuillModules.workspaces.activeWs();
    const content = S().monacoEditor.getValue();
    const res = await window.quill.writeFile({ filePath: S().editorFilePath, content, cwd: ws?.cwd });
    if (!res.ok) {
      showToast(res.error || "Save failed");
      return;
    }
    S().editorDirty = false;
    updateEditorDirty();
    window.QuillFeatures?.markSaved();
    showToast("Saved");
    await window.QuillModules.workspaces.refreshGitInfo();
  }

  async function loadDiffView() {
    if (!S().editorFilePath) return;
    await ensureMonaco();
    const ws = window.QuillModules.workspaces.activeWs();
    const current = S().monacoEditor?.getValue() ?? "";
    const head = await window.quill.gitShowFile({ cwd: ws?.cwd, filePath: S().editorFilePath });
    const original = head.ok ? head.content : "";
    const lang = guessMonacoLang(S().editorFilePath);
    S().monacoDiff.setModel({
      original: monaco.editor.createModel(original, lang),
      modified: monaco.editor.createModel(current, lang),
    });
  }

  async function refreshEditorContent(showNotice = false) {
    if (!S().editorFilePath) return;
    const res = await window.quill.readFile(S().editorFilePath);
    if (!res.ok) return;
    await ensureMonaco();
    if (!S().editorDirty && S().monacoEditor) {
      const lang = guessMonacoLang(S().editorFilePath);
      S().monacoEditor.setModel(monaco.editor.createModel(res.content, lang));
    }
    if (S().activeEditorTab === "diff") await loadDiffView();
    if (showNotice) showFileChangedBadge();
    window.QuillModules.workspaces.refreshGitInfo();
  }

  async function onWorkspaceFileChanged(changedPath) {
    if (!S().editorFilePath || !pathsEqual(changedPath, S().editorFilePath)) return;
    clearTimeout(S().fileChangeRefreshTimer);
    S().fileChangeRefreshTimer = setTimeout(() => {
      void refreshEditorContent(true);
    }, 120);
  }

  function showFileChangedBadge() {
    const title = document.getElementById("editor-title");
    if (title && !title.querySelector(".file-changed-badge")) {
      const badge = document.createElement("span");
      badge.className = "file-changed-badge";
      badge.textContent = "file changed";
      title.appendChild(badge);
    }
    showToast("File changed — editor refreshed");
    clearTimeout(showFileChangedBadge._clearTimer);
    showFileChangedBadge._clearTimer = setTimeout(() => {
      title?.querySelector(".file-changed-badge")?.remove();
    }, 8000);
  }

  function bindEditorDrawer() {
    document.getElementById("editor-close")?.addEventListener("click", () => {
      const p = S().editorFilePath;
      if (p && window.QuillFeatures) void window.QuillFeatures.closeTab(p);
      else closeEditor();
    });
    document.getElementById("editor-save")?.addEventListener("click", () => void saveEditor());
    document.querySelectorAll(".editor-tab-btn[data-tab]").forEach((tab) => {
      tab.onclick = () => void setEditorTab(tab.dataset.tab);
    });
  }

  function closeEditor() {
    S().editorFilePath = null;
    S().editorDirty = false;
    window.QuillFeatures?.getOpenTabs()?.clear?.();
    document.getElementById("editor-area")?.classList.add("hidden");
    document.getElementById("inline-diff-bar")?.classList.add("hidden");
    window.QuillModules.terminals.updateCenterView();
    window.QuillModules.workspaces.updateTitlebar();
    window.QuillFeatures?.renderTabs?.();
  }

  async function setEditorTab(tab) {
    S().activeEditorTab = tab;
    document.querySelectorAll(".editor-tab-btn[data-tab]").forEach((el) => {
      el.classList.toggle("active", el.dataset.tab === tab);
    });
    document.getElementById("monaco-editor")?.classList.toggle("hidden", tab !== "file");
    document.getElementById("monaco-diff")?.classList.toggle("hidden", tab !== "diff");
    if (tab === "diff") await loadDiffView();
    else S().monacoEditor?.layout();
  }

  async function openFileInEditor(filePath) {
    if (window.QuillFeatures) {
      await window.QuillFeatures.openTab(filePath);
      return;
    }
    const res = await window.quill.readFile(filePath);
    if (!res.ok) {
      showToast(res.error || "Cannot open file");
      return;
    }
    await ensureMonaco();
    S().editorFilePath = filePath;
    S().editorDirty = false;
    const title = document.getElementById("editor-title");
    if (!S().monacoEditor) return;
    window.QuillModules.terminals.updateCenterView();
    document.getElementById("editor-area")?.classList.remove("hidden");
    if (title) title.textContent = filePath.split(/[/\\]/).pop() || filePath;
    S().monacoEditor.setModel(monaco.editor.createModel(res.content, guessMonacoLang(filePath)));
    updateEditorDirty();
    window.QuillModules.workspaces.updateTitlebar();
    await setEditorTab("file");
    const fileStatus = document.getElementById("status-file");
    if (fileStatus) fileStatus.textContent = filePath;
    document.querySelectorAll(".tree-item.tree-file").forEach((el) => {
      el.classList.toggle("selected", el.dataset.path === filePath);
    });
  }

  function fileIconClass(name) {
    const ext = (name.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
    if (ext === ".py") return "tree-kind-python";
    if (ext === ".md") return "tree-kind-md";
    if ([".json", ".toml", ".yaml", ".yml"].includes(ext)) return "tree-kind-config";
    if ([".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs"].includes(ext)) return "tree-kind-js";
    if ([".html", ".css", ".scss", ".less"].includes(ext)) return "tree-kind-web";
    return "tree-kind-file";
  }

  function treeRowHtml(depth, isDir, name, gitBadge = "") {
    const pad = 4 + depth * 14;
    const chevron = isDir
      ? `<span class="tree-chevron" aria-hidden="true">›</span>`
      : `<span class="tree-chevron tree-chevron-spacer" aria-hidden="true">›</span>`;
    const kind = isDir
      ? `<span class="tree-kind tree-kind-folder" aria-hidden="true"></span>`
      : `<span class="tree-kind ${fileIconClass(name)}" aria-hidden="true"></span>`;
    return `<div class="tree-row" style="padding-left:${pad}px">${chevron}${kind}<span class="tree-name">${escHtml(name)}</span>${gitBadge}</div>`;
  }

  async function appendTreeDir(parentUl, dirPath, depth) {
    if (window.QuillFeatures?.lazyTreeLimit?.(depth)) return;
    const res = await window.quill.listDirectory(dirPath);
    if (!res.ok) return;
    const maxEntries = depth === 0 ? 200 : 80;
    for (const entry of res.entries.slice(0, maxEntries)) {
      if (S().TREE_SKIP.has(entry.name)) continue;
      if (!entry.isDirectory && S().TREE_SKIP_FILES.test(entry.name)) continue;
      const li = document.createElement("li");
      li.className = "tree-item" + (entry.isDirectory ? " tree-dir" : " tree-file");
      li.dataset.path = entry.path;
      const expanded = entry.isDirectory && S().expandedDirs.has(entry.path);
      if (expanded) li.classList.add("expanded");
      li.innerHTML = treeRowHtml(depth, entry.isDirectory, entry.name, window.QuillFeatures?.treeGitBadge(entry.path) || "");
      const row = li.querySelector(".tree-row");
      if (entry.isDirectory) {
        row.onclick = async (e) => {
          e.stopPropagation();
          if (S().expandedDirs.has(entry.path)) S().expandedDirs.delete(entry.path);
          else S().expandedDirs.add(entry.path);
          await renderFileTree();
        };
        if (expanded) {
          const childUl = document.createElement("ul");
          childUl.className = "tree-children";
          li.appendChild(childUl);
          await appendTreeDir(childUl, entry.path, depth + 1);
        }
      } else {
        row.onclick = (e) => {
          e.stopPropagation();
          openFileInEditor(entry.path);
        };
      }
      parentUl.appendChild(li);
    }
  }

  let treeRootContextMenuEl = null;
  function hideTreeRootContextMenu() {
    treeRootContextMenuEl?.remove();
    treeRootContextMenuEl = null;
  }

  function showTreeRootContextMenu(e, folderPath) {
    hideTreeRootContextMenu();
    e.preventDefault();
    const menu = document.createElement("div");
    menu.className = "pane-context-menu";
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "danger";
    removeBtn.textContent = "Remove folder from workspace";
    removeBtn.onclick = () => { hideTreeRootContextMenu(); void window.QuillModules.workspaces.removeFolderFromWorkspace(folderPath); };
    menu.appendChild(removeBtn);
    document.body.appendChild(menu);
    treeRootContextMenuEl = menu;
    const close = (ev) => {
      if (menu.contains(ev.target)) return;
      hideTreeRootContextMenu();
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
    };
    setTimeout(() => {
      document.addEventListener("click", close);
      document.addEventListener("contextmenu", close);
    }, 0);
  }

  async function appendTreeRoot(parentUl, rootPath) {
    const name = rootPath.split(/[/\\]/).pop() || rootPath;
    const expanded = S().expandedDirs.has(rootPath);
    const li = document.createElement("li");
    li.className = "tree-item tree-dir tree-root" + (expanded ? " expanded" : "");
    li.dataset.path = rootPath;
    li.title = rootPath;
    li.innerHTML = treeRowHtml(0, true, name);
    const row = li.querySelector(".tree-row");
    row.onclick = async (e) => {
      e.stopPropagation();
      if (S().expandedDirs.has(rootPath)) S().expandedDirs.delete(rootPath);
      else S().expandedDirs.add(rootPath);
      await renderFileTree();
    };
    row.addEventListener("contextmenu", (e) => showTreeRootContextMenu(e, rootPath));
    parentUl.appendChild(li);
    if (expanded) {
      const childUl = document.createElement("ul");
      childUl.className = "tree-children";
      li.appendChild(childUl);
      await appendTreeDir(childUl, rootPath, 1);
    }
  }

  async function renderFileTreeImpl() {
    const ul = document.getElementById("file-tree");
    if (!ul) return;
    const ws = window.QuillModules.workspaces.activeWs();
    renderWsFolderRoots();
    if (!ws?.named || !ws?.cwd) {
      ul.innerHTML = `<li class="tree-empty tree-cta">
      <p>No project folder — agents run in your home dir until you open one.</p>
      <button type="button" class="scm-btn tree-cta-btn" id="tree-open-folder">Open folder…</button>
      <button type="button" class="scm-btn tree-cta-btn" id="tree-add-folder">Add folder to workspace…</button>
    </li>`;
      document.getElementById("tree-open-folder")?.addEventListener("click", () => window.QuillModules.workspaces.openFolder());
      document.getElementById("tree-add-folder")?.addEventListener("click", () => window.QuillModules.workspaces.addFolderToWorkspace());
      return;
    }
    ul.innerHTML = "";
    const roots = [...new Set((ws.folders?.length ? ws.folders : [ws.cwd]).filter(Boolean))];
    if (!S().expandedDirs.size) roots.forEach((r) => S().expandedDirs.add(r));
    if (roots.length === 1) {
      await appendTreeDir(ul, roots[0], 0);
    } else {
      for (const root of roots) await appendTreeRoot(ul, root);
      const addLi = document.createElement("li");
      addLi.className = "tree-add-root";
      addLi.innerHTML = `<button type="button" class="tree-add-root-btn" id="tree-add-folder-root">+ Add folder to workspace</button>`;
      ul.appendChild(addLi);
      document.getElementById("tree-add-folder-root")?.addEventListener("click", () => window.QuillModules.workspaces.addFolderToWorkspace());
    }
    if (!ul.querySelector(".tree-item")) {
      ul.innerHTML = `<li class="tree-empty">No files in folder</li>`;
    }
  }

  function renderFileTree() {
    return new Promise((resolve) => {
      S().renderFileTreeWaiters.push(resolve);
      clearTimeout(S().renderFileTreeTimer);
      S().renderFileTreeTimer = setTimeout(async () => {
        const waiters = S().renderFileTreeWaiters.splice(0);
        await renderFileTreeImpl();
        waiters.forEach((r) => r());
      }, 80);
    });
  }

  function renderWsFolderRoots() {
    const el = document.getElementById("ws-folder-roots");
    if (!el) return;
    el.classList.add("hidden");
    el.innerHTML = "";
  }

  window.QuillModules.editor = {
    monacoThemeId,
    guessMonacoLang,
    ensureMonaco,
    updateEditorDirty,
    saveEditor,
    loadDiffView,
    refreshEditorContent,
    onWorkspaceFileChanged,
    showFileChangedBadge,
    bindEditorDrawer,
    closeEditor,
    setEditorTab,
    openFileInEditor,
    renderFileTree,
  };
})();
