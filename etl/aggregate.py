"""Agregación de microdatos al esquema de un período anual."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from etl.mappings import MEASURES, RUBROS, icon_of, load_config, province_iso, put, rubro_of, vector, zone_of
from etl.read_microdatos import Microdatos


@dataclass
class _Acc:
    r: list[float] = field(default_factory=vector)
    z: dict[str, list[float]] = field(default_factory=lambda: defaultdict(vector))
    p: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    c: dict[str, list[float]] = field(default_factory=lambda: defaultdict(vector))


def r1(value: float) -> float:
    return round(value, 1)


def r1s(values: list[float]) -> list[float]:
    return [r1(value) for value in values]


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

    buckets: dict[tuple[int, str, str], _Acc] = defaultdict(_Acc)
    unrounded: dict[int, float] = defaultdict(float)

    for row in micro.rows:
        iso = province_iso(row.province)
        if iso is None:
            raise ValueError(f"Código de provincia desconocido: {row.province!r} ({row.year})")
        rubro = rubro_of(row.rubro)
        if rubro is None:
            raise ValueError(f"Rubro sin gran rubro: {row.rubro!r} ({row.year})")
        zone = zone_of(row.country)
        amounts = {"usd": row.fob / 1e6, "tn": row.kg / 1e6}
        unrounded[row.year] += amounts["usd"]
        keys = [iso, "N"]
        if iso in regions:
            keys.append("R:" + regions[iso])
        for key in keys:
            for measure, amount in amounts.items():
                _add(buckets[(row.year, key, measure)], rubro, row.rubro, row.country, zone, amount)

    origins = list(names) + ["EXT", "PLAT", "IND"]
    region_ids = ["pampeana", "patagonia", "noa", "cuyo", "nea"]
    periods: dict[str, dict] = {}
    for year in micro.years:
        period: dict = {"kind": "year", "label": str(year), "o": {}, "reg": {}}
        for origin in origins:
            period["o"][origin] = {
                measure: _block(buckets[(year, origin, measure)], zones, product_name, country_name, confidential, 6, 5)
                for measure in MEASURES
            }
        for region in region_ids:
            period["reg"][region] = {
                measure: _ranking(buckets[(year, "R:" + region, measure)], product_name, country_name, confidential, 6, 5)
                for measure in MEASURES
            }
        period["nat"] = {
            measure: _ranking(buckets[(year, "N", measure)], product_name, country_name, confidential, 8, 6)
            for measure in MEASURES
        }
        periods[str(year)] = period
    return periods, dict(unrounded)


def _add(acc: _Acc, rubro: int, code: str, country: str, zone: str, amount: float) -> None:
    put(acc.r, rubro, amount)
    put(acc.z[zone], rubro, amount)
    acc.p[code] += amount
    if country:
        put(acc.c[country], rubro, amount)


def _block(acc: _Acc, zones, product_name, country_name, confidential, n_products, n_countries) -> dict:
    return {
        "r": r1s(acc.r),
        "z": [r1s(acc.z[zone]) for zone in zones],
        **_ranking(acc, product_name, country_name, confidential, n_products, n_countries),
    }


def _ranking(acc: _Acc, product_name, country_name, confidential, n_products, n_countries) -> dict:
    return {
        "p": _products(acc.p, product_name, confidential, n_products),
        "c": _countries(acc.c, country_name, n_countries),
        "k": _confidential(acc.p, confidential),
    }


def _products(amounts: dict[str, float], names: dict[str, str], confidential: set[str], limit: int) -> list:
    ranked = sorted(
        ((code, value) for code, value in amounts.items() if code not in confidential and value > 0.05),
        key=lambda item: -item[1],
    )
    taken: Counter[int] = Counter()
    rows = []
    for code, value in ranked:
        rubro = rubro_of(code)
        if taken[rubro] < limit:
            taken[rubro] += 1
            rows.append([names.get(code, code), rubro, r1(value), icon_of(code)])
    return rows


def _countries(amounts: dict[str, list[float]], names: dict[str, str], limit: int) -> list:
    kept: set[str] = set()
    for index in range(len(RUBROS) + 1):
        ranked = sorted(amounts, key=lambda code: -amounts[code][index])[:limit]
        kept.update(code for code in ranked if amounts[code][index] > 0.05)
    return [[names.get(code, code), r1s(amounts[code])] for code in sorted(kept, key=lambda code: -amounts[code][0])]


def _confidential(amounts: dict[str, float], confidential: set[str]) -> list[float]:
    values = vector()
    for code in confidential:
        put(values, rubro_of(code), amounts.get(code, 0.0))
    return r1s(values)
