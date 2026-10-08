"""Controles que tienen que pasar para publicar."""

from __future__ import annotations

from etl.mappings import province_names, zone_of, zone_order
from etl.read_anexo import Anexo
from etl.read_microdatos import Microdatos


class ValidationError(Exception):
    def __init__(self, errors: list[str]):
        super().__init__("\n".join(errors))
        self.errors = errors


def validate(
    micro: Microdatos,
    periods: dict[str, dict],
    unrounded: dict[int, float],
    anexo: Anexo | None,
    country_codes: set[str],
) -> dict:
    errors: list[str] = []
    zone_gaps = 0
    anexo_diffs = 0
    isos = list(province_names())
    known_zones = set(zone_order())

    for year, raw in micro.raw_total_m.items():
        got = unrounded.get(year)
        if got is None or abs(got - raw) > 1e-4:
            errors.append(
                f"Año {year}: la suma de orígenes ({got}) no coincide con los microdatos ({raw})."
            )

    for key, period in periods.items():
        missing = [iso for iso in isos if iso not in period["o"]]
        if missing:
            errors.append(f"{key}: faltan provincias {', '.join(missing)}")
        if period["kind"] != "year":
            continue
        for origin, payload in period["o"].items():
            gap = abs(sum(payload["z"]) - payload["t"])
            if gap > 1.001:
                zone_gaps += 1
                errors.append(
                    f"{key} {origin}: las zonas suman {sum(payload['z']):.1f} y el total es {payload['t']:.1f}"
                )

    if anexo is not None:
        for iso, by_year in anexo.official_annual.items():
            for year, official in by_year.items():
                period = periods.get(year)
                if period is None or iso not in period["o"]:
                    anexo_diffs += 1
                    errors.append(f"DIFF {iso} {year}: no está en los microdatos")
                    continue
                mine = period["o"][iso]["t"]
                if abs(mine - official) > max(1.0, 0.005 * abs(official)):
                    anexo_diffs += 1
                    errors.append(f"DIFF {iso} {year} {mine} {round(official, 1)}")

    for code in sorted(country_codes):
        zone = zone_of(code)
        if zone not in known_zones:
            errors.append(f"El país {code} no cae en ninguna zona (obtuve {zone!r})")

    totals = {
        key: round(sum(origin["t"] for origin in period["o"].values()), 1)
        for key, period in periods.items()
    }
    report = {
        "totals": totals,
        "anexo_diffs": anexo_diffs,
        "zone_gaps": zone_gaps,
        "warnings": list(micro.warnings),
        "years": [str(year) for year in micro.years],
        "semester": anexo.period_id if anexo else None,
    }
    if errors:
        raise ValidationError(errors)
    return report
