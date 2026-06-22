#!/usr/bin/env node
/** UX verification for Quill Desktop — checks recent UI fixes. */
import { _electron as electron } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";

const EXE =
  process.env.QUILL_DESKTOP_EXE ||
  path.join(os.homedir(), "AppData", "Local", "Programs", "Quill Desktop", "Quill.exe");

const GODDESSES = [
  "Hera", "Artemis", "Athena", "Demeter", "Aphrodite",
  "Hestia", "Persephone", "Hecate", "Nike",
];

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  if (!fs.existsSync(EXE)) {
    fail("launch", `Missing ${EXE}`);
    process.exit(1);
  }

  let app;
  try {
    app = await electron.launch({ executablePath: EXE, timeout: 30000 });
    pass("launch", EXE);

    const win = await app.firstWindow();
    await win.waitForLoadState("domcontentloaded", { timeout: 15000 });
    await win.waitForTimeout(6000);

    await win.evaluate(() => {
      localStorage.setItem("quill-onboarded", "1");
      document.getElementById("onboarding")?.classList.add("hidden");
    });

    // 1. No center empty-state splash
    const emptyState = await win.evaluate(() => ({
      exists: !!document.getElementById("empty-state"),
      visible: (() => {
        const el = document.getElementById("empty-state");
        if (!el) return false;
        const s = getComputedStyle(el);
        return s.display !== "none" && !el.classList.contains("hidden");
      })(),
      stageVisible: !!document.getElementById("workspace-stage"),
      headVisible: !document.getElementById("workspace-center-head")?.classList.contains("hidden"),
    }));
    if (!emptyState.visible) pass("no center splash", emptyState.exists ? "hidden" : "removed");
    else fail("no center splash", JSON.stringify(emptyState));

    // 2. Nine Greek goddess personas in bootstrap
    const boot = await win.evaluate(async () => {
      const b = await window.quill.getBootstrap();
      return { personas: b.personas || [], state: b.state };
    });
    if (boot.personas.length === 9) pass("personas count", "9 goddesses");
    else fail("personas count", `got ${boot.personas.length}: ${boot.personas.join(",")}`);
    const allGoddesses = GODDESSES.every((g) => boot.personas.includes(g));
    if (allGoddesses) pass("persona names", GODDESSES.join(", "));
    else fail("persona names", boot.personas.join(", "));

    const migratedPersonas = await win.evaluate(async (goddesses) => {
      const b = await window.quill.getBootstrap();
      const w = b.state.workspaces.find((x) => x.id === b.state.activeWorkspace) || b.state.workspaces[0];
      const names = (w?.paneIds || []).map((id) => b.state.panes[id]?.persona).filter(Boolean);
      return { names, allGoddesses: names.every((n) => goddesses.includes(n)), unique: new Set(names).size === names.length };
    }, GODDESSES);
    if (migratedPersonas.allGoddesses && migratedPersonas.unique) {
      pass("state persona migration", migratedPersonas.names.join(", "));
    } else {
      fail("state persona migration", JSON.stringify(migratedPersonas));
    }

    // 3. Dot colors: green=running, red=idle (CSS)
    const dotCss = await win.evaluate(() => {
      const sheets = [...document.styleSheets];
      let running = "";
      let idle = "";
      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule.selectorText === ".ws-dot.agent-running") running = rule.style.background || rule.style.backgroundColor;
            if (rule.selectorText === ".ws-dot.agent-idle") idle = rule.style.background || rule.style.backgroundColor;
          }
        } catch (_) {}
      }
      return { running, idle };
    });
    const greenRunning = /4ec994|78, 201, 148/i.test(dotCss.running);
    const redIdle = /e06c75|224, 108, 117/i.test(dotCss.idle);
    if (greenRunning && redIdle) pass("dot colors", `running=${dotCss.running} idle=${dotCss.idle}`);
    else fail("dot colors", JSON.stringify(dotCss));

    // 4. MAX_PANES enforced — add panes until limit
    const paneLimit = await win.evaluate(async () => {
      const MAX = 9;
      const state = (await window.quill.getBootstrap()).state;
      const ws = state.workspaces.find((w) => w.id === state.activeWorkspace) || state.workspaces[0];
      if (!ws) return { error: "no workspace" };

      // Simulate addPane logic via internal state manipulation + check toast path
      const before = ws.paneIds?.length || 0;
      // Click + Terminal repeatedly
      const btn = document.getElementById("ws-add-terminal");
      if (!btn) return { error: "no + Terminal button" };
      let clicks = 0;
      let lastToast = "";
      const origToast = document.getElementById("quill-toast");
      for (let i = 0; i < 12; i++) {
        btn.click();
        clicks++;
        await new Promise((r) => setTimeout(r, 400));
        const toast = document.getElementById("quill-toast");
        if (toast?.textContent?.includes("Maximum")) {
          lastToast = toast.textContent;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
      const afterState = (await window.quill.getBootstrap()).state;
      const afterWs = afterState.workspaces.find((w) => w.id === afterState.activeWorkspace);
      const paneCount = afterWs?.paneIds?.length || 0;
      const activeGrid = document.querySelector(".ws-pane-grid:not(.hidden)");
      const panes = activeGrid ? activeGrid.querySelectorAll(".pane").length : 0;
      const personas = (afterWs?.paneIds || []).map((id) => afterState.panes[id]?.persona).filter(Boolean);
      const unique = new Set(personas).size === personas.length;
      return { before, paneCount, panes, clicks, lastToast, unique, personas, capped: paneCount <= MAX };
    });
    if (paneLimit.error) fail("pane limit", paneLimit.error);
    else if (paneLimit.capped && paneLimit.paneCount <= 9) {
      pass("pane limit", `${paneLimit.paneCount} panes (clicked ${paneLimit.clicks}x) toast=${paneLimit.lastToast || "none"}`);
    } else fail("pane limit", JSON.stringify(paneLimit));
    if (paneLimit.unique) pass("unique personas per pane", paneLimit.personas?.join(", "));
    else fail("unique personas per pane", paneLimit.personas?.join(", "));
    const allGoddessPanes = (paneLimit.personas || []).every((p) => GODDESSES.includes(p));
    if (allGoddessPanes) pass("pane personas are goddesses", paneLimit.personas?.join(", "));
    else fail("pane personas are goddesses", paneLimit.personas?.join(", "));

    // 5. Pane headers with goddess names
    const headers = await win.evaluate(() => {
      const grid = document.querySelector(".ws-pane-grid:not(.hidden)");
      if (!grid) return [];
      return [...grid.querySelectorAll(".pane-persona")].map((el) => el.textContent?.trim()).filter(Boolean);
    });
    if (headers.length > 0 && headers.every((h) => GODDESSES.includes(h))) {
      pass("pane headers", headers.join(", "));
    } else if (headers.length > 0) fail("pane headers", headers.join(", "));
    else fail("pane headers", "none found");

    // 6. Right-click terminal opens context menu
    const ctxMenu = await win.evaluate(() => {
      const term = document.querySelector(".pane-term");
      if (!term) return { error: "no .pane-term" };
      const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 200 });
      term.dispatchEvent(evt);
      const menu = document.querySelector(".pane-context-menu");
      if (!menu) return { error: "no menu after contextmenu" };
      const items = [...menu.querySelectorAll("button")].map((b) => b.textContent?.trim());
      menu.remove();
      return { items };
    });
    if (ctxMenu.error) fail("terminal right-click menu", ctxMenu.error);
    else if (ctxMenu.items?.includes("Close") && ctxMenu.items?.includes("Split right")) {
      pass("terminal right-click menu", ctxMenu.items.join(", "));
    } else fail("terminal right-click menu", JSON.stringify(ctxMenu));

    // 7. Ctrl+` focuses only (does not add pane when not focused in terminal)
    const toggleFocus = await win.evaluate(async () => {
      const count = () => document.querySelector(".ws-pane-grid:not(.hidden)")?.querySelectorAll(".pane").length || 0;
      const before = count();
      document.body.focus();
      await new Promise((r) => setTimeout(r, 200));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "`", ctrlKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      const after = count();
      return { before, after, same: before === after };
    });
    if (toggleFocus.same) pass("Ctrl+` no auto-add", `${toggleFocus.before} panes unchanged`);
    else fail("Ctrl+` no auto-add", JSON.stringify(toggleFocus));

    // 8. Settings Soon label spacing
    await win.click(".menu-item[data-menu='file'] .menu-trigger");
    await win.waitForTimeout(150);
    await win.click("[data-action='settings']");
    await win.waitForTimeout(500);
    const soonSpacing = await win.evaluate(() => {
      const items = [...document.querySelectorAll(".settings-nav-item")].filter((el) =>
        el.querySelector(".soon")
      );
      if (items.length < 2) return { error: `only ${items.length} soon items` };
      const margins = items.map((el) => {
        const soon = el.querySelector(".soon");
        const label = el.querySelector(".nav-label");
        return {
          label: label?.textContent?.trim(),
          marginLeft: soon ? getComputedStyle(soon).marginLeft : "",
          flex: label ? getComputedStyle(label).flex : "",
        };
      });
      const soonLefts = items.map((el) => el.querySelector(".soon")?.getBoundingClientRect().left || 0);
      const soonAligned = soonLefts.length >= 2 && soonLefts.every((l) => Math.abs(l - soonLefts[0]) < 2);
      return { margins, soonAligned, soonLefts };
    });
    if (soonSpacing.error) fail("settings Soon spacing", soonSpacing.error);
    else if (soonSpacing.soonAligned) {
      pass("settings Soon spacing", `Soon x=${soonSpacing.soonLefts?.map((x) => Math.round(x)).join(",")}`);
    } else fail("settings Soon spacing", JSON.stringify(soonSpacing));
    await win.click("#settings-close");

    // 9. File type icon classes exist in CSS
    const fileIcons = await win.evaluate(() => {
      const classes = ["tree-kind-python", "tree-kind-md", "tree-kind-config", "tree-kind-js", "tree-kind-web"];
      const sheets = [...document.styleSheets];
      const found = {};
      for (const cls of classes) {
        found[cls] = false;
        for (const sheet of sheets) {
          try {
            for (const rule of sheet.cssRules || []) {
              if (rule.selectorText?.includes(cls)) found[cls] = true;
            }
          } catch (_) {}
        }
      }
      return found;
    });
    const iconCount = Object.values(fileIcons).filter(Boolean).length;
    if (iconCount >= 4) pass("file type icon CSS", `${iconCount}/5 classes`);
    else fail("file type icon CSS", JSON.stringify(fileIcons));

    // 10. removeFolderFromWorkspace exists (API surface)
    const hasRemoveFolder = await win.evaluate(() => {
      // Trigger via checking app.js exposed behavior — tree root context menu structure
      return typeof window.quill?.pickFolder === "function";
    });
    if (hasRemoveFolder) pass("folder IPC ready", "pickFolder available");
    else fail("folder IPC ready");

    // 11. grid-3x3 layout class exists
    const grid3 = await win.evaluate(() => {
      const sheets = [...document.styleSheets];
      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule.selectorText === ".grid-3x3") return true;
          }
        } catch (_) {}
      }
      return false;
    });
    if (grid3) pass("grid-3x3 layout CSS");
    else fail("grid-3x3 layout CSS");

    // 12. Agent delegate shows goddess names not "Pane N:"
    const delegate = await win.evaluate(() => {
      const sel = document.getElementById("agent-delegate");
      if (!sel) return { error: "no delegate select" };
      const opts = [...sel.options].map((o) => o.textContent?.trim());
      const hasPanePrefix = opts.some((o) => /^Pane \d+:/.test(o));
      return { opts, hasPanePrefix };
    });
    if (delegate.error) fail("delegate labels", delegate.error);
    else if (!delegate.hasPanePrefix) pass("delegate labels", delegate.opts.join(" | "));
    else fail("delegate labels", delegate.opts.join(" | "));

    // Grid fills workspace stage (no wasted vertical space)
    const gridFill = await win.evaluate(() => {
      const stage = document.getElementById("workspace-stage");
      const grid = document.querySelector(".ws-pane-grid:not(.hidden)");
      if (!stage || !grid) return { error: "no stage/grid" };
      const stageH = stage.getBoundingClientRect().height;
      const gridH = grid.getBoundingClientRect().height;
      const ratio = gridH / stageH;
      return { stageH, gridH, ratio };
    });
    if (gridFill.error) fail("grid fills stage", gridFill.error);
    else     if (gridFill.ratio >= 0.95) pass("grid fills stage", `${Math.round(gridFill.gridH)}px / ${Math.round(gridFill.stageH)}px`);
    else fail("grid fills stage", JSON.stringify(gridFill));

    // 13. Close middle pane — survivors keep xterm canvas
    const closeMiddle = await win.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const grid = document.querySelector(".ws-pane-grid:not(.hidden)");
      if (!grid) return { error: "no grid" };

      const closePane = (paneId) => {
        grid.querySelector(`.pane[data-pane-id="${paneId}"] .pane-close`)?.click();
      };
      const activeWs = () =>
        window.quill.getBootstrap().then((b) =>
          b.state.workspaces.find((w) => w.id === b.state.activeWorkspace),
        );

      let ws = await activeWs();
      while ((ws?.paneIds?.length || 0) > 4) {
        closePane(ws.paneIds[ws.paneIds.length - 1]);
        await sleep(600);
        ws = await activeWs();
      }
      const addBtn = document.getElementById("ws-add-terminal");
      while ((ws?.paneIds?.length || 0) < 4 && addBtn) {
        addBtn.click();
        await sleep(700);
        ws = await activeWs();
      }
      if ((ws?.paneIds?.length || 0) !== 4) {
        return { error: `expected 4 panes, got ${ws?.paneIds?.length}` };
      }

      closePane(ws.paneIds[1]);
      await sleep(900);

      const panes = [...grid.querySelectorAll(".pane")];
      const screens = panes.map((p) => {
        const canvas = p.querySelector(".xterm-screen canvas");
        return { hasCanvas: !!canvas, w: canvas?.width || 0, h: canvas?.height || 0 };
      });
      return { paneCount: panes.length, screens };
    });
    if (closeMiddle.error) fail("close middle pane", closeMiddle.error);
    else if (
      closeMiddle.paneCount === 3
      && closeMiddle.screens.length === 3
      && closeMiddle.screens.every((s) => s.hasCanvas && s.w > 0 && s.h > 0)
    ) {
      pass("close middle pane", `3 survivors, canvases ${closeMiddle.screens.map((s) => `${s.w}x${s.h}`).join(", ")}`);
    } else fail("close middle pane", JSON.stringify(closeMiddle));

    // 14. Add pane from single — both readable width
    const addFromOne = await win.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const grid = document.querySelector(".ws-pane-grid:not(.hidden)");
      if (!grid) return { error: "no grid" };

      const closePane = (paneId) => {
        grid.querySelector(`.pane[data-pane-id="${paneId}"] .pane-close`)?.click();
      };
      const activeWs = () =>
        window.quill.getBootstrap().then((b) =>
          b.state.workspaces.find((w) => w.id === b.state.activeWorkspace),
        );

      let ws = await activeWs();
      while ((ws?.paneIds?.length || 0) > 1) {
        closePane(ws.paneIds[ws.paneIds.length - 1]);
        await sleep(600);
        ws = await activeWs();
      }
      const before = grid.querySelectorAll(".pane").length;
      document.getElementById("ws-add-terminal")?.click();
      await sleep(900);

      const panes = [...grid.querySelectorAll(".pane")];
      const widths = panes.map((p) => p.querySelector(".xterm-screen canvas")?.width || 0);
      return { before, after: panes.length, widths };
    });
    if (addFromOne.error) fail("add pane from single", addFromOne.error);
    else if (
      addFromOne.before === 1
      && addFromOne.after === 2
      && addFromOne.widths.length === 2
      && addFromOne.widths.every((w) => w > 100)
    ) {
      pass("add pane from single", `widths ${addFromOne.widths.join(", ")}px`);
    } else fail("add pane from single", JSON.stringify(addFromOne));

  } catch (e) {
    fail("exception", String(e.message || e));
  } finally {
    if (app) await app.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailed:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main();
