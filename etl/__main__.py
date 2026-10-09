"""CLI: python -m etl"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from etl import ValidationError, run


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Genera los JSON del dashboard de exportaciones por provincia.")
    parser.add_argument("--microdatos", help="Archivo .xlsb de microdatos. Si se omite, se usa data/raw/sources.yml.")
    parser.add_argument("--anexo", help="Anexo .xls del primer semestre. Si se omite, se usa sources.yml.")
    parser.add_argument("--serie", help="Serie mensual .xlsx del OPEX. Si se omite, se usa sources.yml.")
    parser.add_argument("--out", default="site/data", help="Carpeta de salida (por defecto site/data).")
    args = parser.parse_args(argv)

    try:
        microdatos, anexo, serie = _inputs(args.microdatos, args.anexo, args.serie)
    except (FileNotFoundError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1
    if not microdatos.is_file():
        print(f"No existe el archivo de microdatos: {microdatos}", file=sys.stderr)
        return 1
    if anexo is not None and not anexo.is_file():
        print(f"No existe el anexo: {anexo}", file=sys.stderr)
        return 1
    if serie is not None and not serie.is_file():
        print(f"No existe la serie mensual: {serie}", file=sys.stderr)
        return 1

    try:
        run(microdatos, anexo, serie, Path(args.out))
    except (ValidationError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1
    return 0


def _inputs(microdatos: str | None, anexo: str | None, serie: str | None) -> tuple[Path, Path | None, Path | None]:
    sources_path = Path("data/raw/sources.yml")
    sources: dict = {}
    if sources_path.is_file():
        loaded = yaml.safe_load(sources_path.read_text(encoding="utf-8")) or {}
        if not isinstance(loaded, dict):
            raise ValueError("data/raw/sources.yml tiene que ser un mapa")
        sources = loaded
    raw_dir = sources_path.parent
    if microdatos:
        micro_path = Path(microdatos)
    else:
        name = sources.get("microdatos")
        if not name:
            raise ValueError("Falta el microdatos: pasá --microdatos o completalo en data/raw/sources.yml")
        micro_path = raw_dir / str(name)
    return micro_path, _optional(anexo, sources.get("anexo_semestre"), raw_dir), _optional(serie, sources.get("serie_mensual"), raw_dir)


def _optional(given: str | None, configured: object, raw_dir: Path) -> Path | None:
    if given is not None:
        return Path(given) if given else None
    return raw_dir / str(configured) if configured else None


if __name__ == "__main__":
    raise SystemExit(main())
