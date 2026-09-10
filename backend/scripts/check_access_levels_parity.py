"""Smoke-check: AccessLevel short/titles match across panel domain, bot mirror, FE.

Run from State-LoveAdmin:
  python backend/scripts/check_access_levels_parity.py
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PANEL = ROOT / "backend" / "app" / "domain" / "access_levels.py"
BOT = ROOT.parent / "State-LoveBot" / "database" / "access_levels.py"
FE = ROOT / "frontend" / "src" / "lib" / "accessLevels.ts"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _parse_ts_record(src: str, const_name: str) -> dict[int, str]:
    m = re.search(
        rf"export const {const_name}: Record<number, string> = \{{(.*?)\n\}}",
        src,
        re.S,
    )
    if not m:
        raise SystemExit(f"FE: cannot find {const_name}")
    out: dict[int, str] = {}
    for km, vm in re.findall(r"(\d+):\s*'([^']*)'", m.group(1)):
        out[int(km)] = vm
    return out


def main() -> None:
    for path in (PANEL, BOT, FE):
        if not path.is_file():
            raise SystemExit(f"Missing {path}")

    panel = _load(PANEL, "panel_access_levels")
    bot = _load(BOT, "bot_access_levels")
    if panel.SHORT_NAMES != bot.SHORT_NAMES or panel.ROLE_TITLES != bot.ROLE_TITLES:
        raise SystemExit("panel domain access_levels != bot database/access_levels (copy SoT)")

    fe_src = FE.read_text(encoding="utf-8")
    fe_short = _parse_ts_record(fe_src, "ACCESS_LEVEL_SHORT")
    fe_titles = _parse_ts_record(fe_src, "ACCESS_ROLE_TITLES")
    if fe_short != panel.SHORT_NAMES:
        raise SystemExit(f"FE ACCESS_LEVEL_SHORT mismatch: {fe_short} vs {panel.SHORT_NAMES}")
    if fe_titles != panel.ROLE_TITLES:
        raise SystemExit(f"FE ACCESS_ROLE_TITLES mismatch vs domain ROLE_TITLES")

    print("OK: access_levels panel <-> bot <-> FE parity")


if __name__ == "__main__":
    main()
    sys.exit(0)
