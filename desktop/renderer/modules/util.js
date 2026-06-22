/** HTML escape, terminal text cleanup, path helpers, toast */
window.QuillModules = window.QuillModules || {};

(() => {
  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function stripAnsi(text) {
    return String(text || "")
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
      .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "")
      .replace(/\x1b[@-_]/g, "")
      .replace(/\[\?[0-9;]*[hlm]/g, "")
      .replace(/\r/g, "");
  }

  function cleanTerminalLine(line) {
    return String(line || "")
      .replace(/[│┃┆┇┊┋║╭╮╰╯┌┐└┘├┤┬┴┼─═▌▀]+/g, " ")
      .replace(/\[[^\]]*\]/g, (m) => (/bold|dim|cyan|green|red|yellow|italic/i.test(m) ? " " : m))
      .replace(/\s+/g, " ")
      .trim();
  }

  function normPath(p) {
    return String(p || "").replace(/\\/g, "/").toLowerCase();
  }

  function pathsEqual(a, b) {
    return normPath(a) === normPath(b);
  }

  function resolveWsPath(relOrAbs) {
    const ws = window.QuillModules.workspaces.activeWs();
    const raw = String(relOrAbs || "").trim();
    if (!raw) return raw;
    if (/^[a-z]:\/|^\//i.test(raw.replace(/\\/g, "/"))) return raw;
    const base = (ws?.cwd || "").replace(/\\/g, "/").replace(/\/$/, "");
    return `${base}/${raw.replace(/^\/+/, "")}`.replace(/\/+/g, "/");
  }

  function showToast(msg) {
    let toast = document.getElementById("quill-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "quill-toast";
      toast.className = "quill-toast hidden";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add("hidden"), 3200);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  window.QuillModules.util = {
    escHtml,
    stripAnsi,
    cleanTerminalLine,
    normPath,
    pathsEqual,
    resolveWsPath,
    showToast,
    loadScript,
  };
})();
