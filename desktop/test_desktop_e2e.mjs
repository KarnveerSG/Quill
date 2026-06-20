#!/usr/bin/env node
/** Live E2E smoke test for Quill Desktop (Playwright Electron). */
import { _electron as electron } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";

const REPO = process.env.QUILL_REPO || "E:\\CodingProjects\\FinishedProjects\\Quill";
const EXE =
  process.env.QUILL_DESKTOP_EXE ||
  path.join(os.homedir(), "AppData", "Local", "Programs", "Quill Desktop", "Quill.exe");

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
    pass("window load");

    const title = await win.title();
    if (title.includes("Quill")) pass("title", title);
    else fail("title", title);

    await win.waitForTimeout(8000);
    await win.waitForSelector("#menubar", { timeout: 15000 }).catch(() => {});

    const bootErr = await win.evaluate(() => {
      const pre = document.body?.querySelector("pre");
      return pre?.textContent?.startsWith("Quill failed:") ? pre.textContent : null;
    });
    if (bootErr) fail("init", bootErr);
    else pass("init", "no boot error");

    const api = await win.evaluate(async () => {
      if (!window.quill) return { error: "no window.quill" };
      try {
        const b = await window.quill.getBootstrap();
        return {
          version: b.version,
          ptyAvailable: b.ptyAvailable,
          themes: Object.keys(b.themes || {}).length,
          personas: (b.personas || []).length,
        };
      } catch (e) {
        return { error: String(e.message || e) };
      }
    });
    if (api.error) fail("getBootstrap", api.error);
    else pass("getBootstrap", `v${api.version} pty=${api.ptyAvailable} themes=${api.themes} personas=${api.personas}`);

    const chrome = await win.evaluate(() => ({
      menubar: !!document.getElementById("menubar"),
      fileTree: !!document.getElementById("file-tree"),
      scm: !!document.getElementById("scm-panel"),
      paneGrid: !!document.getElementById("pane-grid"),
      editorDrawer: !!document.getElementById("editor-drawer"),
      palette: !!document.getElementById("palette"),
      branchSelect: !!document.getElementById("status-branch"),
      xterm: !!document.querySelector(".xterm-screen"),
      composer: !!document.querySelector(".pane-composer-input"),
    }));
    for (const [k, v] of Object.entries(chrome)) {
      if (v) pass(`ui:${k}`);
      else fail(`ui:${k}`, "missing");
    }

    await win.keyboard.press("Control+P");
    await win.waitForTimeout(400);
    const paletteVisible = await win.evaluate(() => !document.getElementById("palette")?.classList.contains("hidden"));
    if (paletteVisible) pass("palette Ctrl+P");
    else fail("palette Ctrl+P");
    await win.keyboard.press("Escape");

    await win.click(".menu-item[data-menu='file'] .menu-trigger");
    await win.waitForTimeout(200);
    await win.click("[data-action='settings']");
    await win.waitForTimeout(500);
    const settingsOpen = await win.evaluate(() => !document.getElementById("settings")?.classList.contains("hidden"));
    if (settingsOpen) pass("settings open");
    else fail("settings open");
    await win.click("#settings-close");

    const fsTest = await win.evaluate(async (repoPath) => {
      const list = await window.quill.listDirectory(repoPath);
      if (!list.ok || !list.entries?.length) return { error: "listDirectory empty" };
      const entry = list.entries.find((e) => e.name === "pyproject.toml") || list.entries.find((e) => !e.isDirectory);
      if (!entry || entry.isDirectory) return { error: "no file to read" };
      const read = await window.quill.readFile(entry.path);
      if (!read.ok) return { error: read.error };
      const testPath = `${repoPath}\\.quill\\e2e-test-${Date.now()}.txt`;
      const write = await window.quill.writeFile({ filePath: testPath, content: "e2e-ok", cwd: repoPath });
      if (!write.ok) return { error: write.error };
      const read2 = await window.quill.readFile(testPath);
      return read2.content === "e2e-ok" ? { read: entry.name, write: true } : { error: "write mismatch" };
    }, REPO);
    if (fsTest.error) fail("ipc read/write", fsTest.error);
    else pass("ipc read/write", JSON.stringify(fsTest));

    const git = await win.evaluate(async (repoPath) => {
      const info = await window.quill.getGitInfo(repoPath);
      const branches = await window.quill.gitBranches(repoPath);
      const files = await window.quill.gitStatusFiles(repoPath);
      return { branch: info.branch, branchCount: branches.branches?.length ?? 0, statusOk: files.ok };
    }, REPO);
    if (git.error) fail("ipc git", git.error);
    else pass("ipc git", `branch=${git.branch} branches=${git.branchCount} status=${git.statusOk}`);

    const search = await win.evaluate(async (repoPath) => {
      const res = await window.quill.searchFiles({ cwd: repoPath, query: "cli", limit: 5 });
      return { count: res.files?.length ?? 0 };
    }, REPO);
    if (search.count > 0) pass("ipc searchFiles", `${search.count} hits`);
    else fail("ipc searchFiles", "no results");

    const mcp = await win.evaluate(async (repoPath) => {
      const cfg = await window.quill.getMcpConfig(repoPath);
      const servers = { ...(cfg.config?.servers || {}), _e2e: { command: "node", args: ["-v"] } };
      const save = await window.quill.saveMcpConfig(repoPath, { servers });
      const reload = await window.quill.reloadMcpAgents(repoPath);
      const cfg2 = await window.quill.getMcpConfig(repoPath);
      await window.quill.saveMcpConfig(repoPath, { servers: cfg.config?.servers || {} });
      return { saveOk: save?.ok, reloadOk: reload?.ok, hasE2e: !!cfg2.config?.servers?._e2e };
    }, REPO);
    if (mcp.saveOk && mcp.reloadOk) pass("ipc mcp", `saved reloaded=${mcp.hasE2e}`);
    else fail("ipc mcp", JSON.stringify(mcp));

    const monacoOk = await win.evaluate(async (repoPath) => {
      const target = repoPath + "\\pyproject.toml";
      const res = await window.quill.readFile(target);
      if (!res.ok) return { error: res.error };
      return new Promise((resolve) => {
        if (typeof window.require === "undefined") {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js";
          s.onload = () => {
            window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });
            window.require(["vs/editor/editor.main"], () => resolve({ monaco: !!window.monaco?.editor }));
          };
          s.onerror = () => resolve({ error: "loader failed" });
          document.head.appendChild(s);
        } else {
          window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });
          window.require(["vs/editor/editor.main"], () => resolve({ monaco: !!window.monaco?.editor }));
        }
        setTimeout(() => resolve({ error: "monaco timeout" }), 15000);
      });
    }, REPO);
    if (monacoOk.monaco) pass("monaco CDN");
    else fail("monaco CDN", monacoOk.error || "no editor");

    const termOut = await win.evaluate(() => {
      const lines = document.querySelector(".xterm-rows")?.textContent || "";
      return { len: lines.length, hasQuill: /Quill|CodeGraph|agent/i.test(lines) };
    });
    if (termOut.len > 10) pass("terminal output", `${termOut.len} chars quill=${termOut.hasQuill}`);
    else fail("terminal output", "empty or too short");

    // Composer send (non-destructive ping)
    const composerTest = await win.evaluate(async () => {
      const input = document.querySelector(".pane-composer-input");
      if (!input) return { error: "no composer" };
      input.value = "/help";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return { ok: true };
    });
    if (composerTest.ok) pass("composer input");
    else fail("composer input", composerTest.error);

    pass("session", "completed");
  } catch (e) {
    fail("exception", String(e.message || e));
  } finally {
    if (app) await app.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
