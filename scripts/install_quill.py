#!/usr/bin/env python3
"""Build and install Quill CLI + desktop on Windows."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(cmd: list[str], *, cwd: Path | None = None, shell: bool = False) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=str(cwd or ROOT), check=True, shell=shell)


def cli_install_dir() -> Path:
    return Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Quill"


def desktop_install_dir() -> Path:
    return Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Quill Desktop"


def add_to_user_path(install_dir: Path) -> None:
    target = str(install_dir)
    ps = (
        f"$dir = '{target}'; "
        "$p = [Environment]::GetEnvironmentVariable('Path', 'User'); "
        "if ($p -notlike \"*$dir*\") { "
        "[Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + $dir), 'User') }"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)


def migrate_env() -> None:
    legacy = Path.home() / ".sexyjarvis" / ".env"
    target_dir = Path.home() / ".quill"
    target = target_dir / ".env"
    if legacy.is_file() and not target.is_file():
        target_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy, target)
        print(f"Migrated config: {legacy} -> {target}")


def desktop_shortcut(exe: Path) -> None:
    desktop = Path.home() / "Desktop" / "Quill.lnk"
    ps = (
        f"$s = (New-Object -COM WScript.Shell).CreateShortcut('{desktop}'); "
        f"$s.TargetPath = '{exe}'; "
        f"$s.WorkingDirectory = '{exe.parent}'; "
        f"$s.IconLocation = '{exe},0'; "
        f"$s.Description = 'Quill — CODE BEAUTIFUL'; "
        f"$s.Save()"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)
    print(f"Desktop shortcut: {desktop}")


def copy_exe(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest.unlink()
    shutil.copy2(src, dest)


def main() -> int:
    if sys.platform != "win32":
        print("install_quill.py is Windows-focused.", file=sys.stderr)
        return 1

    migrate_env()

    run([sys.executable, "-m", "pip", "install", "-e", ".[cursor,build,voice]"])

    # Build CLI — install manually to avoid overwriting desktop exe (same name on Windows FS)
    run([sys.executable, "scripts/build_binary.py", "--with", "cursor"])

    desktop_dir = ROOT / "desktop"
    run(["npm", "install"], cwd=desktop_dir, shell=True)
    run(["npm", "run", "build:dir"], cwd=desktop_dir, shell=True)

    cli_src = ROOT / "dist" / "quill.exe"
    desktop_src = ROOT / "dist" / "desktop" / "win-unpacked" / "Quill.exe"
    if not cli_src.is_file():
        print(f"CLI build missing: {cli_src}", file=sys.stderr)
        return 1
    if not desktop_src.is_file():
        print(f"Desktop build missing: {desktop_src}", file=sys.stderr)
        return 1

    cli_dir = cli_install_dir()
    desk_dir = desktop_install_dir()
    cli_dest = cli_dir / "quill.exe"
    desk_dest = desk_dir / "Quill.exe"

    copy_exe(cli_src, cli_dest)
    copy_exe(desktop_src, desk_dest)
    add_to_user_path(cli_dir)
    desktop_shortcut(desk_dest)

    print("\nDone.")
    print(f"  Desktop IDE: {desk_dest}")
    print(f"  CLI:         {cli_dest}")
    print("  Restart terminal, then run: quill")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
