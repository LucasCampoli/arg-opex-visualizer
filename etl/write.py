"""Escritura de los JSON que consume el dashboard."""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path

from etl.mappings import CONFIG_DIR, province_names, province_regions, zone_order


def write_output(
    out_dir: Path,
    periods: dict[str, dict],
    sem: dict,
    order: list[str],
    report: dict,
    sources: dict,
    semester: dict | None,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    periods_dir = out_dir / "periods"
    if periods_dir.exists():
        shutil.rmtree(periods_dir)
    periods_dir.mkdir()
    for key in order:
        _dump(periods_dir / f"{key}.json", periods[key])

    names = province_names()
    regions = province_regions()
    _dump(out_dir / "semestres.json", sem)
    _dump(out_dir / "series.json", _series(periods, order, names, regions))
    shutil.copyfile(CONFIG_DIR / "geo.json", out_dir / "geo.json")
    meta = {
        "zones": zone_order(),
        "names": names,
        "reg": regions,
        "order": order,
        "kinds": {key: periods[key]["kind"] for key in order},
        "labels": {key: periods[key]["label"] for key in order},
        "semester": semester,
        "sources": sources,
        "generated": datetime.now().astimezone().isoformat(timespec="seconds"),
        "build": report,
    }
    _dump(out_dir / "meta.json", meta)


def _series(periods: dict[str, dict], order: list[str], names: dict[str, str], regions: dict[str, str]) -> dict:
    grouped: dict[str, list[str]] = {}
    for iso, region in regions.items():
        grouped.setdefault(region, []).append(iso)
    province = {iso: {"t": {}, "r": {}} for iso in names}
    total: dict[str, dict[str, float]] = {}
    for key in order:
        period = periods[key]
        for iso in names:
            origin = period["o"][iso]
            province[iso]["t"][key] = origin["t"]
            province[iso]["r"][key] = origin["r"]
        for origin, payload in period["o"].items():
            total.setdefault(origin, {})[key] = payload["t"]
        for region, members in grouped.items():
            total.setdefault("R:" + region, {})[key] = sum(period["o"][iso]["t"] for iso in members)
        total.setdefault("N", {})[key] = sum(payload["t"] for payload in period["o"].values())
    return {"province": province, "total": total}


def _dump(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
