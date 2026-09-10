"""Smoke-check: bot mirror of sphere_grant_rules matches panel SoT.

Run from State-LoveAdmin:
  python backend/scripts/check_sphere_grant_rules_parity.py
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PANEL_RULES = ROOT / "backend" / "app" / "domain" / "sphere_grant_rules.py"
BOT_RULES = ROOT.parent / "State-LoveBot" / "database" / "sphere_grant_rules.py"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    if not PANEL_RULES.is_file():
        raise SystemExit(f"Missing SoT: {PANEL_RULES}")
    if not BOT_RULES.is_file():
        raise SystemExit(f"Missing bot mirror: {BOT_RULES}")

    panel_src = PANEL_RULES.read_text(encoding="utf-8")
    bot_src = BOT_RULES.read_text(encoding="utf-8")
    # Strip module docstring differences — compare by executing both.
    panel = _load(PANEL_RULES, "panel_sphere_grant_rules")
    bot = _load(BOT_RULES, "bot_sphere_grant_rules")

    for attr in (
        "ALL_SPHERE_KEYS",
        "MINISTRY_SPHERE_KEYS",
        "STRUCTURE_SPHERE_KEYS",
        "SPHERE_LABELS",
        "STRUCTURE_SUPERVISOR_LEVEL",
        "CURATOR_LEVEL",
    ):
        if getattr(panel, attr) != getattr(bot, attr):
            raise SystemExit(f"Mismatch on {attr}")

    cases = [
        (2, ["central_apparatus"]),
        (4, ["justice", "defense"]),
        (5, ["gov_structures"]),
        (7, []),
        (8, ["server"]),
        (11, []),
    ]
    for level, spheres in cases:
        p = panel.effective_grantable_sphere_keys(level, spheres)
        b = bot.effective_grantable_sphere_keys(level, spheres)
        if p != b:
            raise SystemExit(f"grantable mismatch level={level}: panel={p} bot={b}")
        pa = panel.allowed_sphere_keys_for_level(level)
        ba = bot.allowed_sphere_keys_for_level(level)
        if pa != ba:
            raise SystemExit(f"allowed mismatch level={level}: panel={pa} bot={ba}")

    # Curator must get all spheres (the P01 bug)
    curator = panel.effective_grantable_sphere_keys(8, [])
    if curator != set(panel.ALL_SPHERE_KEYS):
        raise SystemExit(f"Curator should grant all, got {curator}")
    struct = panel.effective_grantable_sphere_keys(5, [])
    expected_struct = set(panel.MINISTRY_SPHERE_KEYS) | set(panel.STRUCTURE_SPHERE_KEYS)
    if struct != expected_struct:
        raise SystemExit(f"Structure tier mismatch: {struct}")

    if panel_src.strip() != bot_src.strip():
        print("WARN: file text differs (docstring/comments OK if functions match).")
        print(f"  SoT:  {PANEL_RULES}")
        print(f"  Bot:  {BOT_RULES}")
        print("  Prefer keeping files byte-identical; copy SoT → bot after edits.")
    print("OK: sphere_grant_rules panel <-> bot parity")


if __name__ == "__main__":
    main()
    sys.exit(0)
