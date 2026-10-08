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
    parser.add_argument("--out", default="site/data", help="Carpeta de salida (por defecto site/data).")
    args = parser.parse_args(argv)

    try:
        microdatos, anexo = _inputs(args.microdatos, args.anexo)
    except (FileNotFoundError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1
    if not microdatos.is_file():
        print(f"No existe el archivo de microdatos: {microdatos}", file=sys.stderr)
        return 1
    if anexo is not None and not anexo.is_file():
        print(f"No existe el anexo: {anexo}", file=sys.stderr)
        return 1

    try:
        run(microdatos, anexo, Path(args.out))
    except (ValidationError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1
    return 0


def _inputs(microdatos: str | None, anexo: str | None) -> tuple[Path, Path | None]:
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
    if anexo is not None:
        anexo_path = Path(anexo) if anexo else None
    else:
        name = sources.get("anexo_semestre")
        anexo_path = None if not name else raw_dir / str(name)
    return micro_path, anexo_path


if __name__ == "__main__":
    raise SystemExit(main())
