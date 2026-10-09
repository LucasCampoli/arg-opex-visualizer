"""Anexo de cuadros del primer semestre. Las hojas se ubican por patrón."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import xlrd

from etl.aggregate import r1
from etl.mappings import RUBROS, icon_of, load_config, norm_name, rubro_of, subrubro_code, zone_order

# Países que el anexo destaca dentro de OP-Zonas, con el nombre que muestra el dashboard.
_SELECTED = (
    ("Brasil", "brasil"),
    ("Paraguay", "paraguay"),
    ("Uruguay", "uruguay"),
    ("Chile", "chile"),
    ("Perú", "peru"),
    ("Estados Unidos", "estados unidos"),
    ("China (incl. Hong Kong)", "china"),
    ("India", "india"),
    ("Indonesia", "indonesia"),
    ("Malasia", "malasia"),
    ("Tailandia", "tailandia"),
    ("Viet Nam", "viet nam"),
)

# Zonas que OP-Zonas publica. El resto del vector queda en 0: el anexo no las abre.
_ZONE_HEADERS = (
    ("mercosur", lambda label: label.startswith("mercosur")),
    ("aladi", lambda label: label.startswith("resto de aladi") or label == "resto aladi"),
    ("usmca", lambda label: label.startswith("usmca")),
    ("ue", lambda label: label.startswith("union europea")),
    ("china", lambda label: label == "china"),
    ("india", lambda label: label == "india"),
    ("asean", lambda label: label == "asean"),
    ("mo", lambda label: label.startswith("medio oriente")),
    ("magreb", lambda label: label.startswith("magreb")),
    ("sacu", lambda label: label == "sacu"),
    ("oceania", lambda label: label.startswith("oceania")),
    ("resto", lambda label: label.startswith("resto del mundo")),
)

_RUBRO_HEADERS = (
    ("total", lambda label: label == "total"),
    ("pp", lambda label: label.startswith("productos primarios")),
    ("moa", lambda label: "agropecuario" in label),
    ("moi", lambda label: "industrial" in label),
    ("cye", lambda label: label.startswith("combustibles")),
)


@dataclass
class Anexo:
    year: int
    period_id: str
    period: dict
    official_annual: dict[str, dict[str, float]] = field(default_factory=dict)
    official_years: list[str] = field(default_factory=list)


def read_anexo(path: Path) -> Anexo:
    workbook = xlrd.open_workbook(path)
    year, zonas_sheet = _latest_zonas(workbook)
    period_id = f"{year}-S1"
    names = load_config()["name_to_iso"]
    zonas = _by_origin(workbook.sheet_by_name(zonas_sheet), names, extranjero="EXT")
    rubros_sheet = _one_sheet(workbook, lambda label: label.startswith("op-rubros"), "OP-Rubros")
    rubros = _by_origin(workbook.sheet_by_name(rubros_sheet), names, extranjero="EXT")
    zone_cols = _zone_columns(workbook.sheet_by_name(zonas_sheet))
    selected_cols = _selected_columns(workbook.sheet_by_name(zonas_sheet))
    rubro_cols = _rubro_columns(workbook.sheet_by_name(rubros_sheet), year)
    products = _province_products(workbook, year)
    period = _semester_period(
        year, names, zonas, rubros, zone_cols, selected_cols, rubro_cols, products
    )
    _regions_and_countries(workbook, period, year)
    _national_countries(workbook, period, zonas, zone_cols)
    period["complejos"] = _complexes(workbook)
    period["split"] = _split(workbook, year)
    official, official_years = _official_annual(workbook, names)
    return Anexo(
        year=year,
        period_id=period_id,
        period=period,
        official_annual=official,
        official_years=official_years,
    )


def _semester_period(year, names, zonas, rubros, zone_cols, selected_cols, rubro_cols, products) -> dict:
    period: dict = {"kind": "sem", "label": f"1er sem. {year}", "o": {}, "reg": {}}
    zones = zone_order()
    for iso in list(names.values()) + ["EXT", "IND"]:
        if iso not in zonas or iso not in rubros:
            raise ValueError(f"El anexo no trae el origen {iso}")
        zone_row = zonas[iso]
        rubro_row = rubros[iso]
        key = "EXTPLAT" if iso == "EXT" else iso
        countries = sorted(
            (
                [label, _total_only(num(zone_row[col]))]
                for label, col in selected_cols.items()
                if num(zone_row[col]) > 0.05
            ),
            key=lambda item: -item[1][0],
        )[:5]
        period["o"][key] = {
            "usd": {
                "r": [r1(num(rubro_row[rubro_cols[code]])) for code in ("total", "pp", "moa", "moi", "cye")],
                "z": [_total_only(num(zone_row[zone_cols[zone]]) if zone in zone_cols else 0) for zone in zones],
                "p": products.get(iso, []),
                "c": countries,
            }
        }
    return period


def _total_only(value: float) -> list:
    return [r1(value)] + [None] * len(RUBROS)


def _regions_and_countries(workbook: xlrd.Book, period: dict, year: int) -> None:
    sheet = workbook.sheet_by_name(
        _one_sheet(workbook, lambda label: label.startswith("region-pais"), "Region-país")
    )
    header = _year_header(sheet)
    value_col = _column_for_year(header, year)
    labels = load_config()["region_labels"]
    current: str | None = None
    for index in range(sheet.nrows):
        row = sheet.row_values(index)
        label = norm_name(row[0])
        if label in labels:
            current = labels[label]
            period["reg"][current] = {"usd": {"p": [], "c": []}}
            continue
        if label.startswith("extranjero") or label == "indeterminado" or label == "":
            current = None
            continue
        if current and not label.startswith("resto de pa"):
            name = str(row[0]).strip()
            name = name.replace("Corea, República de", "Corea del Sur")
            name = name.replace("Indeterminado (Continente)", "Destino indeterminado")
            countries = period["reg"][current]["usd"]["c"]
            if len(countries) < 5:
                countries.append([name, _total_only(num(row[value_col]))])


def _national_countries(workbook, period, zonas, zone_cols) -> None:
    sheet = workbook.sheet_by_name(_one_sheet(workbook, lambda label: label == "cuadro4", "cuadro4"))
    header_row = _find_row(sheet, lambda row: any(norm_name(cell) == "total" for cell in row))
    total_col = next(i for i, cell in enumerate(sheet.row_values(header_row)) if norm_name(cell) == "total")
    countries = []
    for index in range(sheet.nrows):
        row = sheet.row_values(index)
        name = row[0]
        if isinstance(name, str) and name.startswith("  ") and isinstance(row[total_col], (int, float)):
            countries.append([name.strip(), r1(num(row[total_col]))])
    total = zonas["TOT"]
    countries.append(["China (incl. Hong Kong)", r1(num(total[zone_cols["china"]]))])
    countries.append(["India", r1(num(total[zone_cols["india"]]))])
    ranked = sorted(countries, key=lambda item: -item[1])[:6]
    period["nat"] = {"usd": {"p": [], "c": [[name, _total_only(value)] for name, value in ranked]}}


def _complexes(workbook: xlrd.Book) -> list:
    sheet = workbook.sheet_by_name(_one_sheet(workbook, lambda label: label == "cuadro5", "cuadro5"))
    header_row = _find_row(
        sheet, lambda row: any(norm_name(cell).startswith("complejos exportadores") for cell in row)
    )
    headers = [norm_name(cell) for cell in sheet.row_values(header_row)]
    value_col = next(i for i, label in enumerate(headers) if label.startswith("millones de usd"))
    var_col = next(i for i, label in enumerate(headers) if label.startswith("variacion porcentual"))
    complexes = []
    for index in range(header_row + 1, sheet.nrows):
        row = sheet.row_values(index)
        name = row[0]
        if not isinstance(name, str) or not name.strip() or name.startswith(" "):
            continue
        label = norm_name(name)
        if label.startswith("total") or label.startswith("principales complejos"):
            continue
        if not isinstance(row[value_col], (int, float)):
            continue
        complexes.append([name.strip(), r1(num(row[value_col])), r1(num(row[var_col]))])
    return sorted(complexes, key=lambda item: -item[1])[:8]


def _split(workbook: xlrd.Book, year: int) -> dict:
    sheet = workbook.sheet_by_name(
        _one_sheet(workbook, lambda label: label.startswith("prov-rubros"), "Prov-rubros")
    )
    header = _year_header(sheet)
    current_col = _column_for_year(header, year)
    previous_col = _column_for_year(header, year - 1)
    split: dict[str, list] = {}
    for index in range(sheet.nrows):
        row = sheet.row_values(index)
        label = norm_name(row[0])
        if label == "extranjero":
            split["EXT"] = [r1(num(row[current_col])), r1(num(row[previous_col]))]
        elif label == "plataforma continental":
            split["PLAT"] = [r1(num(row[current_col])), r1(num(row[previous_col]))]
    if "EXT" not in split or "PLAT" not in split:
        raise ValueError("Prov-rubros no trae los totales de extranjero y plataforma continental")
    return split


def _province_products(workbook: xlrd.Book, year: int) -> dict[str, list]:
    sheet = workbook.sheet_by_name(
        _one_sheet(workbook, lambda label: label.startswith("prov-rubros"), "Prov-rubros")
    )
    header = _year_header(sheet)
    current_col = _column_for_year(header, year)
    previous_col = _column_for_year(header, year - 1)
    names = load_config()["name_to_iso"]
    products: dict[str, list] = {}
    current: str | None = None
    for index in range(sheet.nrows):
        row = sheet.row_values(index)
        label = norm_name(row[0])
        if label in names:
            current = names[label]
            continue
        if label in {"extranjero", "plataforma continental", "indeterminado", ""} or label.startswith("nota"):
            current = None
            continue
        if not current or label.startswith("resto de productos"):
            continue
        name = str(row[0]).strip()
        code = subrubro_code(name)
        current_value = row[current_col]
        if isinstance(current_value, str) and current_value.strip() == "s":
            products.setdefault(current, []).append([name + " (confidencial)*", rubro_of(code), None, icon_of(code)])
        elif num(current_value) > 0:
            previous = num(row[previous_col])
            change = r1(100 * (num(current_value) / previous - 1)) if previous > 0 else None
            products.setdefault(current, []).append([name, rubro_of(code), r1(num(current_value)), icon_of(code), change])
    return products


def _official_annual(workbook: xlrd.Book, names: dict[str, str]) -> tuple[dict, list[str]]:
    sheet = workbook.sheet_by_name(
        _one_sheet(
            workbook,
            lambda label: "region-prov" in label and "anual" in label,
            "Region-prov anual",
        )
    )
    header = _year_header(sheet)
    official: dict[str, dict[str, float]] = {}
    for index in range(sheet.nrows):
        row = sheet.row_values(index)
        iso = _province_cell(row, names)
        if iso is None:
            continue
        official[iso] = {str(year): num(row[col]) for year, col in header}
    years = [str(year) for year, _col in header]
    return official, years


def _by_origin(sheet: xlrd.sheet.Sheet, names: dict[str, str], extranjero: str) -> dict[str, list]:
    found: dict[str, list] = {}
    for index in range(sheet.nrows):
        row = sheet.row_values(index)
        left, right = norm_name(row[0] if row else ""), norm_name(row[1] if len(row) > 1 else "")
        if right in names:
            found[names[right]] = row
        elif left in names:
            found[names[left]] = row
        elif left.startswith("extranjero"):
            found[extranjero] = row
        elif left == "indeterminado":
            found["IND"] = row
        elif left.startswith("total") or right.startswith("total"):
            found["TOT"] = row
    return found


def _province_cell(row: list, names: dict[str, str]) -> str | None:
    for index in (1, 0):
        if len(row) > index and norm_name(row[index]) in names:
            return names[norm_name(row[index])]
    return None


def _latest_zonas(workbook: xlrd.Book) -> tuple[int, str]:
    found: list[tuple[int, str]] = []
    for name in workbook.sheet_names():
        match = re.search(r"op-zonas\s+(\d{4})", norm_name(name))
        if match:
            found.append((int(match.group(1)), name))
    if not found:
        raise ValueError("El anexo no tiene una hoja OP-Zonas {año}")
    return max(found)


def _one_sheet(workbook: xlrd.Book, predicate, title: str) -> str:
    matches = [name for name in workbook.sheet_names() if predicate(norm_name(name))]
    if not matches:
        raise ValueError(f"El anexo no tiene una hoja {title}")
    if len(matches) == 1:
        return matches[0]
    dated = []
    for name in matches:
        years = [int(piece) for piece in re.findall(r"\d{4}", name)]
        dated.append((max(years) if years else 0, name))
    return max(dated)[1]


def _zone_columns(sheet: xlrd.sheet.Sheet) -> dict[str, int]:
    header = _header_row(sheet, lambda row: any(norm_name(cell).startswith("mercosur") for cell in row))
    columns = {}
    for zone, predicate in _ZONE_HEADERS:
        columns[zone] = _find_header(header, predicate, zone)
    return columns


def _selected_columns(sheet: xlrd.sheet.Sheet) -> dict[str, int]:
    header = _header_row(sheet, lambda row: any(norm_name(cell).startswith("mercosur") for cell in row))
    return {label: _find_header(header, lambda text, expected=expected: text == expected, label) for label, expected in _SELECTED}


def _rubro_columns(sheet: xlrd.sheet.Sheet, year: int) -> dict[str, int]:
    label_row = _find_row(sheet, lambda row: any(norm_name(cell).startswith("productos primarios") for cell in row))
    year_row = _find_row(sheet, lambda row: sum(1 for cell in row if parse_year(cell) == year) >= 4)
    labels = sheet.row_values(label_row)
    years = sheet.row_values(year_row)
    groups: list[tuple[str, int, int]] = []
    start: int | None = None
    current = ""
    for index, cell in enumerate(labels):
        text = norm_name(cell)
        if text:
            if start is not None:
                groups.append((current, start, index))
            start = index
            current = text
    if start is not None:
        groups.append((current, start, len(labels)))
    columns = {}
    for key, predicate in _RUBRO_HEADERS:
        span = next(((begin, end) for label, begin, end in groups if predicate(label)), None)
        if span is None:
            raise ValueError(f"OP-Rubros no tiene la columna de {key}")
        begin, end = span
        match = next((index for index in range(begin, end) if parse_year(years[index]) == year), None)
        if match is None:
            raise ValueError(f"OP-Rubros no tiene el año {year} para {key}")
        columns[key] = match
    return columns


def _year_header(sheet: xlrd.sheet.Sheet) -> list[tuple[int, int]]:
    best: list[tuple[int, int]] = []
    for index in range(min(sheet.nrows, 15)):
        found = []
        for column, cell in enumerate(sheet.row_values(index)):
            year = parse_year(cell)
            if year is not None:
                found.append((year, column))
        if len(found) > len(best):
            best = found
    if len(best) < 2:
        raise ValueError(f"No encontré una fila de años en {sheet.name!r}")
    return best


def _column_for_year(header: list[tuple[int, int]], year: int) -> int:
    for found, column in header:
        if found == year:
            return column
    raise ValueError(f"No encontré la columna del año {year}")


def _header_row(sheet: xlrd.sheet.Sheet, predicate) -> list:
    index = _find_row(sheet, predicate)
    return [norm_name(cell) for cell in sheet.row_values(index)]


def _find_header(header: list[str], predicate, title: str) -> int:
    matches = [index for index, label in enumerate(header) if predicate(label)]
    if len(matches) != 1:
        raise ValueError(f"Esperaba una columna {title} y encontré {len(matches)}")
    return matches[0]


def _find_row(sheet: xlrd.sheet.Sheet, predicate, limit: int = 25) -> int:
    for index in range(min(sheet.nrows, limit)):
        if predicate(sheet.row_values(index)):
            return index
    raise ValueError(f"No encontré el encabezado esperado en {sheet.name!r}")


def parse_year(value: object) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not value.is_integer():
            return None
        year = int(value)
    else:
        text = str(value).strip().replace("*", "")
        if not text or not text.replace(".", "", 1).isdigit():
            return None
        number = float(text)
        if not number.is_integer():
            return None
        year = int(number)
    if 1990 <= year <= 2100:
        return year
    return None


def num(value: object) -> float:
    if isinstance(value, bool) or value is None:
        return 0.0
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value != value:
            return 0.0
        return float(value)
    return 0.0
