"""ETL de Origen provincial de las exportaciones."""

from __future__ import annotations

from pathlib import Path

from etl.aggregate import aggregate_years
from etl.read_anexo import read_anexo
from etl.read_microdatos import read_microdatos
from etl.validate import ValidationError, validate
from etl.write import write_output


def run(microdatos: Path, anexo: Path | None, out_dir: Path, sources: dict | None = None) -> dict:
    micro = read_microdatos(microdatos)
    periods, unrounded = aggregate_years(micro)
    anexo_data = read_anexo(anexo) if anexo else None
    sem: dict = {}
    semester = None
    if anexo_data is not None:
        periods[anexo_data.period_id] = anexo_data.period
        sem = anexo_data.sem
        year = anexo_data.year
        semester = {
            "id": anexo_data.period_id,
            "year": year,
            "previousYear": year - 1,
            "heading": f"1er semestre {year}",
            "aria": f"Primer semestre de {year}",
            "tick": f"1er sem. {str(year)[2:]}",
            "lede": f"primer semestre de {year}",
            "compareWith": f"primer semestre de {year - 1}",
            "compareShort": f"1er semestre de {year - 1}",
        }
    order = [str(year) for year in micro.years]
    if anexo_data is not None:
        order.append(anexo_data.period_id)
    report = validate(micro, periods, unrounded, anexo_data, micro.country_codes)
    source_info = {
        "microdatos": microdatos.name,
        "anexo_semestre": anexo.name if anexo else None,
        "indec": "https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-2-79",
    }
    if sources:
        source_info["config"] = sources
    write_output(out_dir, periods, sem, order, report, source_info, semester)
    _print_summary(report, microdatos, anexo)
    return report


def _print_summary(report: dict, microdatos: Path, anexo: Path | None) -> None:
    print(f"Microdatos: {microdatos.name}")
    if anexo:
        print(f"Anexo: {anexo.name}")
    else:
        print("Anexo: no se usó (solo años completos)")
    print()
    print(f"{'Período':<12}{'Total (M USD)':>16}")
    for key, total in report["totals"].items():
        print(f"{key:<12}{_fmt(total):>16}")
    print()
    diffs = report["anexo_diffs"]
    print(f"Diferencias contra el anexo anual: {diffs}")
    print(f"Orígenes con zonas fuera de tolerancia: {report['zone_gaps']}")
    if report["warnings"]:
        print("Advertencias:")
        for warning in report["warnings"]:
            print(f"- {warning}")
    else:
        print("Advertencias: ninguna")


def _fmt(value: float) -> str:
    whole, frac = f"{abs(value):,.1f}".split(".")
    text = whole.replace(",", ".") + "," + frac
    return f"-{text}" if value < 0 else text


__all__ = ["run", "ValidationError"]
