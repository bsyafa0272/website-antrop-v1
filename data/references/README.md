# WHO reference tables

`js/growth-reference-datasets.js` bundles LMS tables extracted from the WHO-maintained `anthro` 1.1.0 and `anthroplus` 1.1.0 R packages. The exact upstream R data files, their SHA-256 hashes, package URLs, package versions, and licenses are recorded in `manifest.json` and retained under `source/`.

To rebuild the browser bundle, install Python 3 and `pyreadr`, then run:

```sh
python -m pip install pyreadr
python tools/build_who_reference_bundle.py
```

The builder reads the retained `.rda` tables and does not run package code. Review and update the manifest hashes whenever upstream data or the generated bundle changes. Preserve the WHO package attribution and GPL license notice in `source/licenses/` when redistributing.

The runtime registers a table only when its standard, index, sex, measurement mode, provenance, license, hash, and benchmark metadata are present. Unsupported ages and missing table coverage are not extrapolated. `anthro` and `anthroplus` are calculation references; this front-end remains a prototype and is not a substitute for clinical review, local governance, or validation against the approved RME deployment.
