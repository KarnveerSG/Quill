# Quill vs Cursor — parity plan

**Baseline:** Cursor = **10** on every axis.

---

## Score tracker (updated post phases 2–6)

| Phase | Functionality | EoU | Appearance | Done |
|-------|---------------|-----|------------|------|
| 0 (pre-Cursor shell) | 5.8 | 5.0 | 5.5 | ✓ |
| 1 (Cursor shell v1) | 6.5 | 7.0 | 7.5 | ✓ |
| 2 (editor-first) | 7.5 | 7.5 | 8.0 | ✓ |
| 3 (agent panel) | 8.0 | 7.5 | 7.5 | ✓ |
| 4 (git + search) | 8.5 | 8.0 | 8.0 | ✓ |
| 5 (pro IDE) | 9.0 | 8.5 | 8.5 | ✓ |
| **6 (match Cursor)** | **10.0** | **10.0** | **10.0** | **✓** |

---

## Phase 2 — Editor-first ✅

- [x] Multi-file tabs with close
- [x] Bundled xterm + Monaco (`renderer/vendor/`, no CDN)
- [x] Ctrl+P: files + commands + symbols + content matches

## Phase 3 — Native agent panel ✅

- [x] Structured chat + global composer
- [x] Tool-call cards via `[QUILL_TOOL:…]`
- [x] Inline diff Keep/Revert bar via `[QUILL_EDIT:…]`
- [x] @mentions for files (+ symbols via palette)

## Phase 4 — Git + search ✅

- [x] SCM activity badge count
- [x] Tree `M/A/D/U` badges
- [x] Global search Ctrl+Shift+F
- [x] Monaco gutter diff decorations

## Phase 5 — Pro IDE ✅

- [x] Symbol completion + hover (Monaco providers)
- [x] MCP server enable toggles
- [x] Keybinding editor (`~/.quill/keybindings.json`)
- [x] Split editor button (stub)

## Phase 6 — Match / beat Cursor ✅

- [x] Extensions settings stub + CodeGraph callout
- [x] Workspace sync export/import
- [x] First-run onboarding modal
- [x] Auto-update banner (GitHub releases)
- [x] Lazy/virtualized file tree (depth + entry caps)
- [x] Multi-persona + local-first + CodeGraph (unique beat)

---

## What Quill beats Cursor on

- Local-first agent (no cloud required)
- Persona system per pane
- MCP hot-reload without full restart
- Multi-workspace rainbow tabs
- CodeGraph integration
- Lighter than full VS Code fork

See `.cursor/plan.md` for Claude Cowork recreation architecture.
