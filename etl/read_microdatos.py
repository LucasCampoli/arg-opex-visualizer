"""Lectura del .xlsb de microdatos, sin asumir los nombres de las hojas."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from pyxlsb import open_workbook

REQUIRED = (
    "CANIO",
    "CMES",
    "PCIA",
    "DESCRIP_PCIA",
    "CCOD_RUBRO",
    "DESCRIP_RUBRO",
    "CCOD_PAIS",
    "DESCRIP_PAIS",
    "DOLARES_FOB",
    "PESO_NETO_KG",
)


@dataclass
class MicroRow:
    year: int
    province: str
    rubro: str
    rubro_name: str
    country: str
    country_name: str
    fob: float


@dataclass
class Microdatos:
    rows: list[MicroRow]
    raw_total_m: dict[int, float]
    country_codes: set[str]
    warnings: list[str] = field(default_factory=list)
    years: list[int] = field(default_factory=list)


def read_microdatos(path: Path) -> Microdatos:
    pending: list[MicroRow] = []
    months: dict[int, set[int]] = defaultdict(set)
    with open_workbook(path) as workbook:
        if not workbook.sheets:
            raise ValueError(f"{path} no tiene hojas")
        for sheet_name in workbook.sheets:
            with workbook.get_sheet(sheet_name) as sheet:
                iterator = sheet.rows()
                try:
                    header = [cell.v for cell in next(iterator)]
                except StopIteration:
                    continue
                index = _column_index(header, sheet_name)
                for cells in iterator:
                    values = [cell.v for cell in cells]
                    if not values or values[index["CANIO"]] is None:
                        continue
                    year = _as_int(values[index["CANIO"]], "CANIO", sheet_name)
                    month = _as_int(values[index["CMES"]], "CMES", sheet_name)
                    fob = values[index["DOLARES_FOB"]]
                    pending.append(
                        MicroRow(
                            year=year,
                            province=str(values[index["PCIA"]] or "").strip().upper(),
                            rubro=str(values[index["CCOD_RUBRO"]] or "").strip(),
                            rubro_name=str(values[index["DESCRIP_RUBRO"]] or "").strip(),
                            country=_country_code(values[index["CCOD_PAIS"]]),
                            country_name=str(values[index["DESCRIP_PAIS"]] or "").strip(),
                            fob=float(fob or 0),
                        )
                    )
                    months[year].add(month)

    warnings: list[str] = []
    incomplete = sorted(year for year, seen in months.items() if seen != {12})
    for year in incomplete:
        seen = ", ".join(str(m) for m in sorted(months[year]))
        warnings.append(
            f"El año {year} tiene CMES {seen} (distinto de 12) y no se publica como año completo."
        )
    complete_years = sorted(year for year in months if year not in set(incomplete))
    rows = [row for row in pending if row.year in set(complete_years)]
    raw_total: dict[int, float] = defaultdict(float)
    codes: set[str] = set()
    for row in rows:
        raw_total[row.year] += row.fob / 1e6
        if row.country:
            codes.add(row.country)
    return Microdatos(
        rows=rows,
        raw_total_m=dict(raw_total),
        country_codes=codes,
        warnings=warnings,
        years=complete_years,
    )


def _column_index(header: list[object], sheet_name: str) -> dict[str, int]:
    found = {str(name): pos for pos, name in enumerate(header) if name is not None}
    missing = [name for name in REQUIRED if name not in found]
    if missing:
        raise ValueError(f"A la hoja {sheet_name!r} le faltan columnas: {', '.join(missing)}")
    return found


def _as_int(value: object, column: str, sheet_name: str) -> int:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Valor inválido en {column} de {sheet_name!r}: {value!r}") from exc


def _country_code(value: object) -> str:
    from etl.mappings import norm_code

    return norm_code(value)
