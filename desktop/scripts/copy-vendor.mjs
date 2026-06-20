#!/usr/bin/env node
/** Copy xterm + monaco from node_modules into renderer/vendor for offline boot. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "renderer", "vendor");
const nm = path.join(root, "node_modules");

function cp(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) cpDir(s, d);
    else cp(s, d);
  }
}

const pairs = [
  [path.join(nm, "@xterm/xterm/css/xterm.css"), path.join(vendor, "xterm.css")],
  [path.join(nm, "@xterm/xterm/lib/xterm.js"), path.join(vendor, "xterm.js")],
  [path.join(nm, "@xterm/addon-fit/lib/addon-fit.js"), path.join(vendor, "addon-fit.js")],
];

for (const [s, d] of pairs) {
  if (!fs.existsSync(s)) {
    console.error("Missing:", s, "— run npm install in desktop/");
    process.exit(1);
  }
  cp(s, d);
  console.log("copied", path.basename(d));
}

const monacoVs = path.join(nm, "monaco-editor", "min", "vs");
if (fs.existsSync(monacoVs)) {
  cpDir(monacoVs, path.join(vendor, "monaco", "vs"));
  console.log("copied monaco vs/");
} else {
  console.warn("monaco-editor not installed — CDN fallback at runtime");
}

console.log("vendor copy done");
