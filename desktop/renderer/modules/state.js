/** Shared application state and constants */
window.QuillModules = window.QuillModules || {};

(() => {
  const state = { workspaces: [], activeWorkspace: null, theme: "dark", panes: {} };
  const termInstances = new Map();
  const gitCache = {};
  const expandedDirs = new Set();
  let editorFilePath = null;
  let editorDirty = false;
  let monacoEditor = null;
  let monacoDiff = null;
  let monacoInitPromise = null;
  let activeEditorTab = "file";
  let bootstrap = null;
  let settingsSection = "appearance";
  let mcpDraft = { servers: {} };
  let activeSidePanel = "explorer";
  let agentChatLineBuffer = "";
  let primaryPaneId = null;
  let agentChatFlushTimer = null;
  const wsChats = {};
  const agentSeenChatLines = new Set();
  let agentPanelMode = "open";
  let agentPtyToChat = false;
  let fitTerminalsRaf = null;
  let fileChangeRefreshTimer = null;
  let renderFileTreeTimer = null;
  let renderFileTreeWaiters = [];
  let paletteItems = [];
  let paletteSearchTimer = null;

  const AGENT_DEDUPE_BANNERS = new Set([
    "code beautiful", "quill", "provider:", "model:", "fallback chain:",
    "workspace:", "instruction files:", "type /help", "tip:", "token savings:",
  ]);
  const AGENT_DEDUPE_MAX = 240;
  const TREE_SKIP = new Set(["node_modules", ".git", ".codegraph", "__pycache__", "dist", "build"]);
  const TREE_SKIP_FILES = /^NTUSER\.DAT|^ntuser\.dat|^desktop\.ini$/i;
  const MAX_PANES = 9;
  const DEFAULT_PERSONA = "Hera";
  const THEME_CSS_VARS = [
    "--bg", "--bg-panel", "--bg-header", "--bg-activity", "--border",
    "--text", "--text-dim", "--accent", "--accent-purple",
  ];
  const SCM_STATUS_LABELS = {
    M: "Modified",
    A: "Added",
    D: "Deleted",
    R: "Renamed",
    "?": "Untracked",
  };

  window.QuillModules.state = {
    state,
    termInstances,
    gitCache,
    expandedDirs,
    wsChats,
    agentSeenChatLines,
    AGENT_DEDUPE_BANNERS,
    AGENT_DEDUPE_MAX,
    TREE_SKIP,
    TREE_SKIP_FILES,
    MAX_PANES,
    DEFAULT_PERSONA,
    THEME_CSS_VARS,
    SCM_STATUS_LABELS,
    get editorFilePath() { return editorFilePath; },
    set editorFilePath(v) { editorFilePath = v; },
    get editorDirty() { return editorDirty; },
    set editorDirty(v) { editorDirty = v; },
    get monacoEditor() { return monacoEditor; },
    set monacoEditor(v) { monacoEditor = v; },
    get monacoDiff() { return monacoDiff; },
    set monacoDiff(v) { monacoDiff = v; },
    get monacoInitPromise() { return monacoInitPromise; },
    set monacoInitPromise(v) { monacoInitPromise = v; },
    get activeEditorTab() { return activeEditorTab; },
    set activeEditorTab(v) { activeEditorTab = v; },
    get bootstrap() { return bootstrap; },
    set bootstrap(v) { bootstrap = v; },
    get settingsSection() { return settingsSection; },
    set settingsSection(v) { settingsSection = v; },
    get mcpDraft() { return mcpDraft; },
    set mcpDraft(v) { mcpDraft = v; },
    get activeSidePanel() { return activeSidePanel; },
    set activeSidePanel(v) { activeSidePanel = v; },
    get agentChatLineBuffer() { return agentChatLineBuffer; },
    set agentChatLineBuffer(v) { agentChatLineBuffer = v; },
    get primaryPaneId() { return primaryPaneId; },
    set primaryPaneId(v) { primaryPaneId = v; },
    get agentChatFlushTimer() { return agentChatFlushTimer; },
    set agentChatFlushTimer(v) { agentChatFlushTimer = v; },
    get agentPanelMode() { return agentPanelMode; },
    set agentPanelMode(v) { agentPanelMode = v; },
    get agentPtyToChat() { return agentPtyToChat; },
    set agentPtyToChat(v) { agentPtyToChat = v; },
    get fitTerminalsRaf() { return fitTerminalsRaf; },
    set fitTerminalsRaf(v) { fitTerminalsRaf = v; },
    get fileChangeRefreshTimer() { return fileChangeRefreshTimer; },
    set fileChangeRefreshTimer(v) { fileChangeRefreshTimer = v; },
    get renderFileTreeTimer() { return renderFileTreeTimer; },
    set renderFileTreeTimer(v) { renderFileTreeTimer = v; },
    get renderFileTreeWaiters() { return renderFileTreeWaiters; },
    get paletteItems() { return paletteItems; },
    set paletteItems(v) { paletteItems = v; },
    get paletteSearchTimer() { return paletteSearchTimer; },
    set paletteSearchTimer(v) { paletteSearchTimer = v; },
  };
})();
