# Quill vs Cursor — parity plan

**Baseline:** Cursor = **10** on every axis. Scores below are Quill **today** (post E2E fix, Jun 2026).

---

## Executive summary

| Axis | Quill now | Target | Gap theme |
|------|-----------|--------|-----------|
| **Functionality** | **5.8** | 10 | Editor/agent not first-class UI |
| **Ease of use** | **5.0** | 10 | Dead chrome, sidebar overload |
| **Appearance** | **5.5** | 10 | VS-menubar cosplay, no icons/tabs |

Quill CLI agent is strong; desktop is a **terminal multiplexer with bolted-on panels**. Cursor is **editor + chat first**. Closing the gap means layout inversion + declutter, not more sidebar sections.

---

## Functionality (Cursor = 10)

| Area | Quill | Cursor | Notes |
|------|-------|--------|-------|
| Code editor (LSP, tabs, find) | 4 | 10 | Monaco drawer; no tabs/LSP/rename |
| AI chat / agent | 6 | 10 | Full tools in CLI; xterm UX |
| Inline / composer edits | 5 | 10 | Composer → pty; no diff overlay in editor |
| @ mentions / context | 6 | 10 | File picker only; no symbol/docs |
| Git SCM | 6 | 9 | Stage/commit ok; no inline gutter, blame |
| Terminal | 7 | 8 | node-pty good; not integrated panel tabs |
| File explorer | 6 | 10 | Nested tree; no search/filter/icons |
| Global search | 4 | 10 | Palette only |
| MCP | 7 | 9 | Config + reload; no per-server toggle UI |
| Extensions / plugins | 2 | 10 | None |
| Multi-workspace | 7 | 8 | Works; profiles partial |
| Debugging / run | 2 | 9 | Menu stubs only |
| **Weighted avg** | **5.8** | **10** | |

---

## Ease of use (Cursor = 10)

| Area | Quill | Cursor | Notes |
|------|-------|--------|-------|
| First-run clarity | 5 | 9 | Opens home dir; no “open folder” prompt |
| Discoverability | 4 | 9 | Selection/Go/Run menus do nothing |
| Keyboard shortcuts | 5 | 10 | Ctrl+P, Ctrl+S; sparse vs Cursor |
| Clutter / cognitive load | 4 | 8 | 3 sidebar stacks + brand + 9 menus |
| Layout defaults | 5 | 9 | Terminal center; editor bottom drawer |
| Settings | 6 | 8 | Modal ok; MCP buried in nav |
| Agent feedback | 6 | 9 | Activity dot; no tool-call timeline |
| Error recovery | 6 | 8 | Boot error screen (fixed xterm bug) |
| **Weighted avg** | **5.0** | **10** | |

---

## Appearance (Cursor = 10)

| Area | Quill | Cursor | Notes |
|------|-------|--------|-------|
| Visual polish | 6 | 9 | Coherent dark theme; amateur chrome |
| Typography | 6 | 9 | Segoe + Georgia mix; ok not refined |
| Iconography | 3 | 9 | Text/unicode only |
| Layout hierarchy | 5 | 9 | Everything same visual weight |
| Density / spacing | 4 | 8 | Sidebar + SCM + files always open |
| Motion / feedback | 4 | 8 | Pulse dot; little else |
| Theme depth | 7 | 9 | 6 themes; Monaco vs shell mismatch |
| Brand vs workspace | 5 | 9 | “CODE BEAUTIFUL” permanent header |
| **Weighted avg** | **5.5** | **10** | |

---

## Declutter principles (keep power, lose noise)

1. **One activity bar** (left icons) → Files | Git | Agent | Settings — not 3 always-open `<details>`.
2. **Kill dead menus** — Selection, Go, Run empty triggers → remove or wire up.
3. **Collapse brand row** — title bar only; tagline in About.
4. **Editor center** — Monaco main area; terminal/agent **right dock** (Cursor layout).
5. **Single composer** — one chat bar, not per-pane composer + xterm input.
6. **Tabs for open files** — drawer → tab bar above editor.
7. **Status bar minimal** — branch + errors + agent state; move hints to `?`.

---

## Incremental roadmap (each phase = ship + E2E + score bump)

### Phase 1 — Declutter shell (EoU + appearance → ~6.5) ✅ shipped
- [x] Activity bar replaces stacked sidebar sections (one panel visible)
- [x] Remove dead menubar items (Selection, Go, Run, Terminal dup)
- [x] Slim header: title bar + compact menu (no brand tagline row)
- [x] Empty-state home with shortcuts (Cursor-style center)
- [x] Agent panel right dock with chat + composer
- [x] Editor center (not bottom drawer); terminal collapsible bottom
- [ ] First-run: “Open folder” modal when cwd not a project
- [ ] Default workspace = last opened folder
- **Scores:** Func 6.5 · EoU 7.0 · Appearance 7.5

### Phase 2 — Editor-first layout (functionality → ~7.0)
- [ ] Editor fills center; bottom drawer → center panel
- [ ] File tabs + close; click tree opens tab
- [ ] Bundled xterm + Monaco (no CDN); offline boot
- [ ] `Ctrl+P` unified: files + commands + symbols (ripgrep)
- **Target:** Functionality 7.0, Appearance 7.0

### Phase 3 — Native agent panel (functionality → ~8.0, EoU → ~7.5)
- [ ] Right dock: structured chat UI (not raw xterm for prompts)
- [ ] Keep xterm as optional “Agent terminal” tab for power users
- [ ] Tool-call cards (read file, edit, bash) like Cursor
- [ ] Inline diff accept/reject in editor gutter
- [ ] `@` mentions: files + symbols + selection
- **Target:** Functionality 8.0, EoU 7.5

### Phase 4 — Git + search polish (→ ~8.5)
- [ ] SCM icon badge count; inline `M/U/D` in tree
- [ ] Gutter diff indicators; click → diff tab
- [ ] Global search panel (`Ctrl+Shift+F`)
- [ ] Branch picker in status bar only (remove duplicate UI)
- **Target:** Functionality 8.5

### Phase 5 — Pro IDE features (→ ~9.0)
- [ ] LSP via monaco-languageclient (Python/TS minimum)
- [ ] MCP server toggles + tool list in settings
- [ ] Persona/mode picker in agent panel (not pane header)
- [ ] Split editor groups; drag tabs
- [ ] Keybinding editor
- **Target:** Functionality 9.0, EoU 8.5, Appearance 8.5

### Phase 6 — Match / beat Cursor (→ 10)
- [ ] Extension host or WASM plugins (stretch)
- [ ] Cloud sync workspace state (optional)
- [ ] Polished onboarding + docs in-app
- [ ] Signed auto-update
- [ ] Performance: lazy tree, virtualized SCM list
- [ ] Unique beat: multi-persona panes, local-first, CodeGraph integration
- **Target:** 10 / 10 / 10 on axes where scope committed

---

## Score tracker (update each phase)

| Phase | Functionality | EoU | Appearance | Done |
|-------|---------------|-----|------------|------|
| 0 (pre-Cursor shell) | 5.8 | 5.0 | 5.5 | ✓ |
| **1 (Cursor shell v1)** | **6.5** | **7.0** | **7.5** | **✓** |
| 2 | 7.5 | 7.5 | 8.0 | |
| 3 | 8.0 | 7.5 | 7.5 | |
| 4 | 8.5 | 8.0 | 8.0 | |
| 5 | 9.0 | 8.5 | 8.5 | |
| 6 | 10.0 | 10.0 | 10.0 | |

---

## Quick wins (next sprint)

1. **Activity bar** — hide FILES + SCM until selected (biggest clutter win).
2. **Remove dead menus** — 4 no-op menu items gone.
3. **Open folder on first launch** — if cwd not git/project.
4. **Bundle CDN assets** — reliability + offline.
5. **Move composer** — one global bar above status or in agent dock.
6. **E2E in CI** — `desktop/test_desktop_e2e.mjs` on build.

---

## What Quill already beats or matches

- Local-first agent (no cloud required)
- Persona system per pane
- MCP hot-reload without full restart
- Multi-workspace rainbow tabs
- Lighter than full VS Code fork

Lean into these while fixing layout/agent UX — don’t copy Cursor verbatim.
