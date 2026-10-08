"""Agregación de microdatos al esquema de un período anual."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from etl.mappings import load_config, province_iso, zone_of
from etl.read_microdatos import Microdatos

RUBRO_INDEX = {"1": 0, "2": 1, "3": 2, "4": 3}


@dataclass
class _Acc:
    t: float = 0.0
    r: list[float] = field(default_factory=lambda: [0.0, 0.0, 0.0, 0.0])
    z: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    p: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    c: dict[str, float] = field(default_factory=lambda: defaultdict(float))


def r1(value: float) -> float:
    return round(value, 1)


def aggregate_years(micro: Microdatos) -> tuple[dict[str, dict], dict[int, float]]:
    """Devuelve períodos por año (clave '2002') y el total sin redondear de cada año."""
    cfg = load_config()
    names = cfg["names"]
    regions = cfg["regions"]
    zones = cfg["zone_order"]
    confidential = cfg["confidential"]
    product_rename = cfg["product_rename"]
    country_rename = cfg["country_rename"]

    product_name: dict[str, str] = {}
    country_name: dict[str, str] = {}
    product_year: dict[str, int] = {}
    country_year: dict[str, int] = {}
    for row in micro.rows:
        if row.year >= product_year.get(row.rubro, 0):
            product_year[row.rubro] = row.year
            product_name[row.rubro] = row.rubro_name
        if row.country and row.year >= country_year.get(row.country, 0):
            country_year[row.country] = row.year
            country_name[row.country] = row.country_name
    product_name.update(product_rename)
    country_name.update(country_rename)

    buckets: dict[tuple[int, str], _Acc] = defaultdict(_Acc)
    unrounded: dict[int, float] = defaultdict(float)

    for row in micro.rows:
        iso = province_iso(row.province)
        if iso is None:
            raise ValueError(f"Código de provincia desconocido: {row.province!r} ({row.year})")
        digit = row.rubro[:1]
        if digit not in RUBRO_INDEX:
            raise ValueError(f"Rubro sin gran rubro: {row.rubro!r} ({row.year})")
        value = row.fob / 1e6
        unrounded[row.year] += value
        _add(buckets[(row.year, iso)], digit, row.rubro, row.country, value)
        region = regions.get(iso)
        if region:
            _add(buckets[(row.year, "R:" + region)], digit, row.rubro, row.country, value)
        _add(buckets[(row.year, "N")], digit, row.rubro, row.country, value)

    origins = list(names) + ["EXT", "PLAT", "IND"]
    region_ids = ["pampeana", "patagonia", "noa", "cuyo", "nea"]
    periods: dict[str, dict] = {}
    for year in micro.years:
        period: dict = {"kind": "year", "label": str(year), "o": {}, "reg": {}}
        for origin in origins:
            acc = buckets.get((year, origin))
            period["o"][origin] = _origin_payload(acc, zones, product_name, country_name, confidential, 6, 5)
        for region in region_ids:
            acc = buckets[(year, "R:" + region)]
            period["reg"][region] = _rank_payload(acc, product_name, country_name, confidential, 6, 5)
        period["nat"] = _rank_payload(buckets[(year, "N")], product_name, country_name, confidential, 8, 6)
        periods[str(year)] = period
    return periods, dict(unrounded)


def _add(acc: _Acc, digit: str, rubro: str, country: str, value: float) -> None:
    acc.t += value
    acc.r[RUBRO_INDEX[digit]] += value
    acc.z[zone_of(country)] += value
    acc.p[rubro] += value
    if country:
        acc.c[country] += value


def _topn(amounts: dict[str, float], names: dict[str, str], confidential: set[str], limit: int) -> list:
    ranked = sorted(
        ((code, value) for code, value in amounts.items() if code not in confidential),
        key=lambda item: -item[1],
    )[:limit]
    return [[names.get(code, code), r1(value)] for code, value in ranked if value > 0.05]


def _confidential_total(acc: _Acc, confidential: set[str]) -> float:
    return r1(sum(acc.p.get(code, 0.0) for code in confidential))


def _origin_payload(acc, zones, product_name, country_name, confidential, n_products, n_countries) -> dict:
    if acc is None:
        return {
            "t": 0,
            "r": [0, 0, 0, 0],
            "z": [0] * len(zones),
            "p": [],
            "c": [],
            "k": 0,
        }
    return {
        "t": r1(acc.t),
        "r": [r1(value) for value in acc.r],
        "z": [r1(acc.z[zone]) for zone in zones],
        "p": _topn(acc.p, product_name, confidential, n_products),
        "c": _topn(acc.c, country_name, confidential, n_countries),
        "k": _confidential_total(acc, confidential),
    }


def _rank_payload(acc: _Acc, product_name, country_name, confidential, n_products, n_countries) -> dict:
    return {
        "p": _topn(acc.p, product_name, confidential, n_products),
        "c": _topn(acc.c, country_name, confidential, n_countries),
        "k": _confidential_total(acc, confidential),
    }
