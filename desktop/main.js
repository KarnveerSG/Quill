const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { INTEGRATIONS, SETTINGS_SECTIONS, CORE_ENV_KEYS } = require("./integrations");
const { THEMES } = require("./themes");

const PERSONAS = ["Iris", "Thea", "Nova", "Sage", "Luna", "Wren"];
const RAINBOW = ["#FF6B6B", "#FF9F43", "#FECA57", "#1DD1A1", "#54A0FF", "#5F27CD", "#A29BFE"];

let mainWindow = null;
const terminals = new Map();
let termCounter = 0;

function quillCliPath() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Quill", "Quill.exe"),
    path.join(__dirname, "..", "dist", "Quill.exe"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return "Quill";
}

function envPath() {
  const dir = path.join(os.homedir(), ".quill");
  const legacy = path.join(os.homedir(), ".sexyjarvis", ".env");
  const target = path.join(dir, ".env");
  if (!fs.existsSync(target) && fs.existsSync(legacy)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(legacy, target);
  }
  return target;
}

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function writeEnvFile(filePath, data) {
  const lines = ["# Quill — keys saved from Settings → Integrations", ""];
  for (const k of Object.keys(data).sort()) {
    if (data[k]) lines.push(`${k}=${data[k]}`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function integrationStatus(env, integration) {
  return integration.keys.every((k) => Boolean((env[k.env] || "").trim()))
    ? "connected" : "disconnected";
}

const STATE_VERSION = 2;

function defaultState() {
  const home = os.homedir();
  const paneId = "pane-main";
  return {
    stateVersion: STATE_VERSION,
    workspaces: [{
      id: "ws-main",
      name: "Quill",
      color: RAINBOW[4],
      cwd: home,
      folders: [home],
      panes: 1,
      layout: "grid-1x1",
      paneIds: [paneId],
    }],
    activeWorkspace: "ws-main",
    theme: "dark",
    panes: { [paneId]: { persona: "Iris", mode: "agent" } },
  };
}

function statePath() {
  return path.join(app.getPath("userData"), "quill-state.json");
}

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), "utf8"));
    if (!raw.workspaces?.length || (raw.stateVersion || 1) < STATE_VERSION) {
      const fresh = defaultState();
      saveState(fresh);
      return fresh;
    }
    return raw;
  } catch {
    const fresh = defaultState();
    saveState(fresh);
    return fresh;
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: "#0d0d12",
    title: "Quill",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
    for (const [id, t] of terminals) {
      try { t.proc.kill(); } catch (_) {}
      terminals.delete(id);
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function spawnTerm(id, opts) {
  const cwd = opts.cwd || os.homedir();
  const persona = opts.persona || "Iris";
  const quill = quillCliPath();
  const args = ["-w", cwd, "--no-speech"];

  const proc = spawn(quill, args, {
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      FORCE_COLOR: "1",
      QUILL_PERSONA: persona,
      QUILL_DESKTOP: "1",
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  terminals.set(id, { proc, persona, cwd });

  const emit = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("pty-data", { id, data: data.toString() });
    }
  };
  proc.stdout.on("data", emit);
  proc.stderr.on("data", emit);
  proc.on("exit", (code) => {
    terminals.delete(id);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("pty-exit", { id, exitCode: code });
    }
  });
  proc.on("error", (err) => emit(`\r\n\x1b[31m${err.message}\x1b[0m\r\n`));

  return { id, persona, mode: "agent" };
}

ipcMain.handle("get-bootstrap", () => {
  const env = parseEnvFile(envPath());
  const integrations = INTEGRATIONS.map((i) => ({
    ...i,
    status: integrationStatus(env, i),
    keys: i.keys.map((k) => ({ ...k, set: Boolean((env[k.env] || "").trim()) })),
  }));
  const connected = integrations.filter((i) => i.status === "connected").length;
  return {
    state: loadState(),
    personas: PERSONAS,
    rainbow: RAINBOW,
    themes: THEMES,
    quillPath: quillCliPath(),
    envPath: envPath(),
    version: app.getVersion(),
    settingsSections: SETTINGS_SECTIONS,
    integrations,
    integrationsSummary: `${connected} of ${INTEGRATIONS.length} connected`,
    coreEnvKeys: CORE_ENV_KEYS.map((k) => ({ ...k, set: Boolean((env[k.env] || "").trim()) })),
  };
});

ipcMain.handle("save-state", (_e, state) => { saveState(state); return true; });
ipcMain.handle("pick-folder", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Folder",
  });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});
ipcMain.handle("pick-workspace-file", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Quill Workspace", extensions: ["json", "yaml", "yml"] }],
    title: "Open Workspace",
  });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});
ipcMain.handle("get-env", () => {
  const env = parseEnvFile(envPath());
  return { path: envPath(), keys: Object.keys(env) };
});
ipcMain.handle("save-env-keys", (_e, updates) => {
  const file = envPath();
  const env = parseEnvFile(file);
  for (const [k, v] of Object.entries(updates || {})) {
    if (v === "" || v == null) delete env[k];
    else env[k] = String(v).trim();
  }
  writeEnvFile(file, env);
  const integrations = INTEGRATIONS.map((i) => ({
    id: i.id,
    status: integrationStatus(env, i),
  }));
  const connected = integrations.filter((i) => i.status === "connected").length;
  return { ok: true, integrationsSummary: `${connected} of ${INTEGRATIONS.length} connected`, integrations };
});
ipcMain.handle("pty-create", (_e, opts) => spawnTerm(`term-${++termCounter}`, opts));
ipcMain.handle("pty-write", (_e, { id, data }) => {
  const t = terminals.get(id);
  if (t?.proc?.stdin?.writable) t.proc.stdin.write(data);
});
ipcMain.handle("pty-resize", () => {});
ipcMain.handle("pty-kill", (_e, { id }) => {
  const t = terminals.get(id);
  if (t) { try { t.proc.kill(); } catch (_) {} terminals.delete(id); }
});
ipcMain.handle("open-external", (_e, url) => shell.openExternal(url));
ipcMain.handle("app-quit", () => app.quit());

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
