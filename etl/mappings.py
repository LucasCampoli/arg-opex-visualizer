"""Mapeos de provincias, zonas y nombres. La lógica sale de etl/config."""

from __future__ import annotations

import math
import unicodedata
from functools import lru_cache
from pathlib import Path

import yaml

CONFIG_DIR = Path(__file__).resolve().parent / "config"


def norm_name(value: object) -> str:
    """Nombre comparable: minúsculas, sin tildes ni espacios de más."""
    text = unicodedata.normalize("NFKD", str(value))
    text = text.encode("ascii", "ignore").decode()
    return text.lower().strip()


def norm_code(value: object) -> str:
    """Código INDEC como texto. 998.0 y 998 quedan en '998'."""
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        if value.is_integer():
            return str(int(value))
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    text = str(value).strip()
    if "." in text:
        head, frac = text.split(".", 1)
        if head.isdigit() and frac.isdigit():
            return head
    return text


@lru_cache(maxsize=1)
def load_config() -> dict:
    provincias = _read_yaml("provincias.yml")
    zonas = _read_yaml("zonas.yml")
    productos = _read_yaml("productos.yml")
    paises = _read_yaml("paises.yml")

    by_indec: dict[str, str] = {}
    names: dict[str, str] = {}
    regions: dict[str, str] = {}
    name_to_iso: dict[str, str] = {}
    for code, info in provincias["provincias"].items():
        iso = str(info["iso"])
        by_indec[str(code)] = iso
        names[iso] = str(info["nombre"])
        regions[iso] = str(info["region"])
        for name in [info["nombre"], *info.get("alias", [])]:
            name_to_iso[norm_name(name)] = iso
    for code, iso in provincias["especiales"].items():
        by_indec[str(code)] = str(iso)

    zone_order = [str(z) for z in zonas["order"]]
    zone_by_code: dict[str, str] = {}
    for zone, codes in zonas["codes"].items():
        for code in codes:
            zone_by_code[norm_code(code)] = str(zone)
    fallback = {str(k): str(v) for k, v in zonas["fallback_prefix"].items()}

    return {
        "by_indec": by_indec,
        "names": names,
        "regions": regions,
        "name_to_iso": name_to_iso,
        "region_labels": {norm_name(k): str(v) for k, v in provincias["regiones_anexo"].items()},
        "icons": {norm_code(k): str(v) for k, v in productos["iconos"].items()},
        "subrubros": {norm_name(k): norm_code(v) for k, v in productos["subrubros"].items()},
        "zone_order": zone_order,
        "zone_by_code": zone_by_code,
        "fallback_prefix": fallback,
        "fallback_default": str(zonas["fallback_default"]),
        "confidential": {norm_code(c) for c in productos["confidential"]},
        "product_rename": {norm_code(k): str(v) for k, v in productos["rename"].items()},
        "country_rename": {norm_code(k): str(v) for k, v in paises["rename"].items()},
    }


def province_iso(indec_code: object) -> str | None:
    return load_config()["by_indec"].get(norm_code(indec_code).upper())


def zone_of(country_code: object) -> str:
    """Zona de un código de país. El código explícito gana; si no, el primer dígito."""
    cfg = load_config()
    code = norm_code(country_code)
    if code in cfg["zone_by_code"]:
        return cfg["zone_by_code"][code]
    if not code:
        return cfg["fallback_default"]
    return cfg["fallback_prefix"].get(code[0], cfg["fallback_default"])


def icon_of(code: str) -> str:
    icons = load_config()["icons"]
    prefix = next(code[:size] for size in range(len(code), 0, -1) if code[:size] in icons)
    return icons[prefix]


def subrubro_code(name: object) -> str:
    code = load_config()["subrubros"].get(norm_name(name))
    if code is None:
        raise ValueError(f"Subrubro sin código en productos.yml: {name!r}")
    return code


def province_names() -> dict[str, str]:
    return dict(load_config()["names"])


def province_regions() -> dict[str, str]:
    return dict(load_config()["regions"])


def zone_order() -> list[str]:
    return list(load_config()["zone_order"])


def _read_yaml(name: str) -> dict:
    path = CONFIG_DIR / name
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"{path} no tiene un mapa en la raíz")
    return data
