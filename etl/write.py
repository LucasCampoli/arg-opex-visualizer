"""Escritura de los JSON que consume el dashboard."""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path

from etl.mappings import CONFIG_DIR, MEASURES, province_names, province_regions, zone_order


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
    series = _series(periods, order, regions)
    _dump(out_dir / "semestres.json", _with_current(sem, series, semester))
    _dump(out_dir / "series.json", series)
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


def _series(periods: dict[str, dict], order: list[str], regions: dict[str, str]) -> dict:
    grouped: dict[str, list[str]] = {}
    for iso, region in regions.items():
        grouped.setdefault(region, []).append(iso)
    series: dict[str, dict[str, dict[str, list[float]]]] = {measure: {} for measure in MEASURES}
    for key in order:
        for measure, by_key in series.items():
            rows = {origin: payload[measure]["r"] for origin, payload in periods[key]["o"].items()}
            for origin, values in rows.items():
                by_key.setdefault(origin, {})[key] = values
            for region, members in grouped.items():
                by_key.setdefault("R:" + region, {})[key] = _sum(rows[iso] for iso in members)
            by_key.setdefault("N", {})[key] = _sum(rows.values())
    return series


def _with_current(sem: dict, series: dict, semester: dict | None) -> dict:
    if semester is None:
        return sem
    year, period = str(semester["year"]), semester["id"]
    for measure, by_key in sem.items():
        for key, years in by_key.items():
            years[year] = series[measure][key][period]
    return sem


def _sum(rows) -> list[float]:
    return [round(sum(values), 1) for values in zip(*rows)]


def _dump(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
