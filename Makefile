PYTHON ?= python3

.PHONY: etl serve

etl:
	$(PYTHON) -m etl

serve:
	cd site && $(PYTHON) -m http.server 8000
