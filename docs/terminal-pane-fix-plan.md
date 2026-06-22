# Terminal Pane Lifecycle — Fix Plan

Scope: fix the two reproducible bugs the user sees in `desktop/renderer/modules/terminals.js`, plus the related main-process shutdown race in `desktop/main.js`. Feed this file straight into Cursor.

## Bugs

### B1 — Closing one pane appears to close every pane

**Where:** `removePane` (terminals.js:450) → `renderPanes` → `ensureWorkspaceUI` → `syncGridPanes` (terminals.js:216-233).

**Why:** `syncGridPanes` unconditionally detaches every `.pane` DOM node from the grid:

```js
grid.querySelectorAll(".pane").forEach((p) => {
  paneMap.set(p.dataset.paneId, p);
  p.remove();                              // ← detaches survivors too
});
grid.querySelectorAll(".pane-split-gutter").forEach((g) => g.remove());

for (let i = 0; i < ws.paneIds.length; i++) {
  ...
  grid.appendChild(paneEl);                // ← re-attaches survivors
}
```

xterm.js holds internal references to the host element. When the host is detached and re-attached:
- ResizeObserver firings during the gap are dropped.
- The canvas/WebGL renderer can lose its drawing surface.
- The cached `paneEl.querySelector(".pane-term")` host is the same node but xterm's `_core._renderService` may have already torn down on the detach event.

Survivors visually go blank → user perceives "all closed."

A second contributor: `ensureWorkspaceUI` runs `mountTerminal` for every `paneId` not in `termInstances`. The `if (...termInstances.has(paneId)) return;` guard inside `mountTerminal` runs **before** the host check, but the guard is `Map.has` on `paneId`, not on host. Survivors stay in the Map, so this is OK — confirms the issue is purely DOM detach/reattach of live xterm hosts.

### B2 — Adding a pane to a single-pane workspace glitches

**Where:** `addPane` (terminals.js:469) → `renderPanes` → same `syncGridPanes` detach-everything path → `applyGridLayout` changes grid template → `setTimeout(fit, 200)`.

**Why:**
- Layout changes from `grid-1x1` to `split-h2` while the survivor's xterm host is detached.
- `fit.fit()` runs against stale CSS dimensions in `mountTerminal`'s `setTimeout(..., 200)`, but `fitActiveTerminals()` from `showWorkspaceGrid` fires earlier (150ms) before CSS reflow completes.
- Result: survivor xterm renders at old (`grid-1x1`) dimensions inside the new `split-h2` cell — clipped/squashed glyphs.

### B3 — `onExit` race on app close

**Where:** `main.js:444-451`.

```js
const onExit = (code) => {
  terminals.delete(id);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("pty-exit", { id, exitCode: code ?? 0 });
  }
};
```

`mainWindow.isDestroyed()` returns false during teardown, but the render frame is already disposed. `webContents.send` throws `Render frame was disposed before WebFrameMain could be accessed`. Cosmetic on quit, but noisy and risks blocking future cleanup.

---

## Fix plan

### Fix B1+B2 — stop detach-reattaching live xterm hosts

Rewrite `syncGridPanes` to be **incremental** — only touch DOM nodes that changed.

```js
function syncGridPanes(grid, ws) {
  const existing = new Map();
  grid.querySelectorAll(".pane").forEach((p) => existing.set(p.dataset.paneId, p));
  grid.querySelectorAll(".pane-split-gutter").forEach((g) => g.remove());

  // 1. Remove panes that are no longer in ws.paneIds (dispose xterm first).
  for (const [paneId, paneEl] of existing) {
    if (!ws.paneIds.includes(paneId)) {
      const t = S().termInstances.get(paneId);
      if (t) {
        try { t.term.dispose(); } catch {}
        S().termInstances.delete(paneId);
      }
      paneEl.remove();
      existing.delete(paneId);
    }
  }

  // 2. Walk ws.paneIds in order. Reorder via insertBefore — never detach survivors.
  const split = ws.paneIds.length === 2;
  let cursor = grid.firstElementChild;
  for (let i = 0; i < ws.paneIds.length; i++) {
    const paneId = ws.paneIds[i];
    let paneEl = existing.get(paneId);
    if (!paneEl) {
      paneEl = createPaneElement(paneId, ws);
      grid.insertBefore(paneEl, cursor);
    } else if (paneEl !== cursor) {
      grid.insertBefore(paneEl, cursor);  // move into position without detaching from doc tree first
    } else {
      cursor = cursor.nextElementSibling;
    }
    updatePaneHeader(paneEl, paneId);

    if (split && i === 0) {
      grid.insertBefore(createSplitGutter(grid, ws), cursor);
    }
  }
}
```

Key change: **never `.remove()` a surviving pane**. `insertBefore` on an existing parent reorders without firing detached/attached observers in the way `.remove() + appendChild()` does.

### Fix B2 — sequence the fit pass after CSS reflow

In `ensureWorkspaceUI`, replace the bare `fitActiveTerminals()` tail call with:

```js
requestAnimationFrame(() => requestAnimationFrame(() => fitActiveTerminals()));
```

And in `mountTerminal`, remove the `setTimeout(..., 200)` fit — let the ResizeObserver handle the post-mount fit (which it does anyway).

Also: in `showWorkspaceGrid`, change `setTimeout(() => fitActiveTerminals(), 150)` to the same double-rAF pattern. The 150ms timeout fires before CSS template recalc completes when layout changes from `grid-1x1` to `split-h2`.

### Fix B1 hardening — guard removePane against re-entry

```js
async function removePane(paneId) {
  const ws = window.QuillModules.workspaces.activeWs();
  if (!ws || ws.paneIds.length <= 1) return;
  if (S()._removingPane === paneId) return;
  S()._removingPane = paneId;
  try {
    const t = S().termInstances.get(paneId);
    if (t) {
      await window.quill.ptyKill(t.ptyId);
      try { t.term.dispose(); } catch {}
      S().termInstances.delete(paneId);
    }
    ws.paneIds = ws.paneIds.filter((p) => p !== paneId);
    delete S().state.panes[paneId];
    ws.panes = ws.paneIds.length;
    ws.layout = layoutForPaneCount(ws.paneIds.length);
    if (S().primaryPaneId === paneId) S().primaryPaneId = ws.paneIds[0];
    window.QuillModules.workspaces.persist();

    // Surgical update instead of full renderPanes — no other workspace touched.
    const grid = getWsGrid(ws);
    applyGridLayout(grid, ws);
    syncGridPanes(grid, ws);
    fitActiveTerminals();
    focusPane(S().primaryPaneId);
    window.QuillMultiAgent?.onPaneRemoved?.();
  } finally {
    S()._removingPane = null;
  }
}
```

Same surgical pattern for `addPane` and `splitPaneRight` — don't call `renderPanes()` (which iterates *every* workspace via `for (const other of state.workspaces) ensureWorkspaceUI(other)` at terminals.js:314-316 and is the wrong primitive for a single-pane add/remove).

### Fix B3 — main-process teardown guard

In `main.js:444`:

```js
const onExit = (code) => {
  terminals.delete(id);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed() || wc.isCrashed()) return;
  try {
    wc.send("pty-exit", { id, exitCode: code ?? 0 });
  } catch { /* render frame disposed mid-quit */ }
};
```

And add to `app.on("before-quit")`:

```js
app.on("before-quit", () => {
  for (const [, t] of terminals) {
    try { t.pty?.kill(); } catch {}
  }
  terminals.clear();
});
```

Same guard for the `emit` closure two lines above.

---

## Test plan

Manual repro for each bug:

1. **B1 baseline:** Open workspace, split to 4 panes. Click × on pane 2. **Expect:** panes 1/3/4 still rendering live cursors, pane 2 gone. **Today:** all panes blank.
2. **B2 baseline:** Open workspace (1 pane). Click `+ Terminal`. **Expect:** smooth split, both panes readable. **Today:** original pane squashed/clipped.
3. **B1 stress:** 9 panes → close panes one-by-one from the middle. Each survivor must keep its xterm scrollback.
4. **B3:** Launch + quit. **Expect:** no `Render frame was disposed` stderr. **Today:** see it every quit.
5. **Regression:** Workspace switch (sidebar click) still hides/shows correct grid. Persona pills still render. Right-click → Split right works.

Automated: add to `desktop/test_ux_verify.mjs`:

- Spawn app via playwright, open 4 panes, close middle, assert 3 `.pane` nodes with non-empty xterm `.xterm-screen` canvases.
- 1 pane → click `#ws-add-terminal`, assert 2 `.pane` nodes, both `.xterm-screen` widths > 100px after 500ms.

---

## Out of scope (file separately)

- The `renderPanes()` cross-workspace mount loop at terminals.js:314-316 is a separate "concurrent agents" design issue — keep its current behavior, but document that `removePane`/`addPane` no longer route through it.
- `killAllPanes` on shutdown is fine as-is once B3 is fixed.
- GPU/network-service exit codes on quit are downstream of B3 — re-check after the guard lands; if they persist, file a separate ticket.

---

## Files touched

- `desktop/renderer/modules/terminals.js` — rewrite `syncGridPanes`, `removePane`, `addPane`, `splitPaneRight`, `ensureWorkspaceUI`, `mountTerminal`, `showWorkspaceGrid`.
- `desktop/main.js` — guard `onExit` + `emit`; add `before-quit` cleanup.
- `desktop/test_ux_verify.mjs` — add pane-lifecycle assertions.

Total estimate: ~120 lines changed, ~2 hours including manual verification.
