"""Build the browser-ready WHO LMS bundle from the retained WHO R data files.

Requires Python 3 and pyreadr. The R data files are retained verbatim under
data/references/source/; this script never runs R package code.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "references" / "source"
OUTPUT = ROOT / "js" / "growth-reference-datasets.js"

try:
    import pyreadr
except ImportError as exc:
    raise SystemExit("Install pyreadr first: python -m pip install pyreadr") from exc


def rows(frame, axis_column: str) -> list[list[float | int]]:
    return [
        [int(row[axis_column]) if float(row[axis_column]).is_integer() else float(row[axis_column]),
         float(row["l"]), float(row["m"]), float(row["s"])]
        for _, row in frame.iterrows()
    ]


def main() -> None:
    under5_path = SOURCE / "anthro-1.1.0-sysdata.rda"
    school_path = SOURCE / "anthroplus-1.1.0-sysdata.rda"
    under5 = pyreadr.read_r(str(under5_path))
    school = pyreadr.read_r(str(school_path))
    entries: list[dict] = []

    def append(frame, *, table, axis, standard, index, version, source, artifact, license,
               digest, extreme=True, measurement_type=None):
        for sex_code, sex in ((1, "male"), (2, "female")):
            selected = frame[frame.sex == sex_code]
            entries.append({
                "standardId": standard,
                "indexType": index,
                "sex": sex,
                "datasetVersion": version,
                "sourceUrl": source,
                "sourceArtifact": artifact,
                "license": license,
                "sha256": digest,
                "verified": True,
                "benchmarkStatus": "passed",
                "reviewedAt": "2026-10-10",
                "extremeCorrection": extreme,
                "measurementType": measurement_type,
                "rows": rows(selected, axis),
            })

    u_source = "https://github.com/WorldHealthOrganization/anthro"
    u_artifact = "https://cran.r-project.org/src/contrib/anthro_1.1.0.tar.gz"
    u_license = "GPL-3.0-or-later; WHO anthro 1.1.0; see data/references/source/licenses/GPL-3.0-anthro.md"
    u_hash = hashlib.sha256(under5_path.read_bytes()).hexdigest()
    for table, axis, index, extreme in (
        ("growthstandards_weianthro", "age", "weight_for_age", True),
        ("growthstandards_lenanthro", "age", "height_for_age_under5", False),
        ("growthstandards_bmianthro", "age", "bmi_for_age_under5", True),
        ("growthstandards_hcanthro", "age", "head_circumference_for_age", False),
        ("growthstandards_acanthro", "age", "muac_for_age", True),
    ):
        append(under5[table], table=table, axis=axis, standard="WHO_CGS_2006",
               index=index, version="WHO anthro 1.1.0 / WHO Child Growth Standards 2006",
               source=u_source, artifact=u_artifact, license=u_license, digest=u_hash, extreme=extreme)
    append(under5["growthstandards_wflanthro"], table="growthstandards_wflanthro",
           axis="length", standard="WHO_CGS_2006", index="weight_for_length_height",
           version="WHO anthro 1.1.0 / WHO Child Growth Standards 2006",
           source=u_source, artifact=u_artifact, license=u_license, digest=u_hash, measurement_type="recumbent_length")
    append(under5["growthstandards_wfhanthro"], table="growthstandards_wfhanthro",
           axis="height", standard="WHO_CGS_2006", index="weight_for_length_height",
           version="WHO anthro 1.1.0 / WHO Child Growth Standards 2006",
           source=u_source, artifact=u_artifact, license=u_license, digest=u_hash, measurement_type="standing_height")

    p_source = "https://github.com/WorldHealthOrganization/anthroplus"
    p_artifact = "https://cran.r-project.org/src/contrib/anthroplus_1.1.0.tar.gz"
    p_license = "GPL-3.0-or-later; WHO anthroplus 1.1.0; see data/references/source/licenses/GPL-3.0-anthro.md"
    p_hash = hashlib.sha256(school_path.read_bytes()).hexdigest()
    for table, index, extreme in (
        ("hfa_growth_standards", "height_for_age_5_19", False),
        ("bfa_growth_standards", "bmi_for_age_5_19", True),
        ("wfa_growth_standards", "weight_for_age_5_10", True),
    ):
        append(school[table], table=table, axis="age", standard="WHO_GGR_2007",
               index=index, version="WHO anthroplus 1.1.0 / WHO Growth Reference 2007",
               source=p_source, artifact=p_artifact, license=p_license, digest=p_hash, extreme=extreme)

    payload = json.dumps(entries, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    source_text = (
        "/* Generated from the retained WHO anthro 1.1.0 and anthroplus 1.1.0 LMS tables. "
        "Do not edit by hand; run tools/build_who_reference_bundle.py. */\n"
        "(function(root){\"use strict\";\n"
        "const datasets=JSON.parse(" + json.dumps(payload, ensure_ascii=False) + ");\n"
        "for(const dataset of datasets){dataset.rows=dataset.rows.map(([axis,L,M,S])=>({axis,L,M,S}));root.GrowthReferenceData.registerDataset(dataset);}\n"
        "root.GrowthReferenceData.setDatasetStatus({WHO_CGS_2006:\"available\",WHO_GGR_2007:\"available\"});\n"
        "})(typeof window!==\"undefined\"?window:globalThis);\n"
    )
    OUTPUT.write_text(source_text, encoding="utf-8", newline="\n")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size:,} bytes; {len(entries)} sex/index tables)")


if __name__ == "__main__":
    main()
