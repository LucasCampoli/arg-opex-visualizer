# Argentine provincial exports

Where each export dollar originates, and which market it goes to. The map shows the provincial origin; the bands show the destination.

## Sources

- INDEC, Provincial origin of exports (OPEX), microdata and table annex. <https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-2-79>
- INDEC publishes this information under the [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license.

Original INDEC files stay in `data/raw/` and are not committed. `data/raw/sources.yml` names the files to use. The site publishes the JSON produced by the ETL, under `site/data/`.

## Methodology and limitations

Amounts are in millions of current US dollars, FOB, and are not adjusted for inflation.

Zones for full years are built by summing destination countries. The current European Union membership (27 members) is applied to the whole series, so totals can differ slightly from the tables INDEC published in each year. “Country not declared” covers records in the source that list only a continent, or no country at all.

From 2018 onward, some products are confidential. They are included in totals, product groups, and destinations, and excluded from the product ranking.

In the first-semester annex, the continental shelf and foreign origin are published together. “Rest of the world” is not broken down; that amount stays in a single zone.

## Run locally

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
make etl
make serve
```

Open <http://localhost:8000/>. Opening the files with `file://` does not work: the browser blocks `fetch`.

## Update the data

When a new full year is released:

1. Replace the microdata `.xlsb` in `data/raw/` (local only).
2. Update `microdatos` in `data/raw/sources.yml`.
3. Run `make etl` and commit `site/data/`.
4. Push to `main`. The workflow publishes the site.

When a new semester is released, add the annex `.xls` locally and set its filename in `anexo_semestre`. Once the full year is available and the semester view should be removed, set `anexo_semestre: null`, run `make etl` again, and commit `site/data/`.

## Deploy

In the repository, set Settings → Pages → Build and deployment → Source to **GitHub Actions**. Each push to `main` runs `.github/workflows/pages.yml`, which publishes the `site/` directory to GitHub Pages.

## Licenses

The code is released under the MIT License (see `LICENSE`). Derived data (the JSON produced by the ETL) is published under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), with attribution to INDEC.
