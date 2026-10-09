/*
 * Registry metadata only. No reference curve/LMS values are bundled because the
 * authoritative data files have not yet been imported and independently checked.
 * The engine must fail closed until a verified dataset is registered.
 */
(function (root) {
  "use strict";
  const standards = Object.freeze({
    WHO_CGS_2006: Object.freeze({
      id: "WHO_CGS_2006", name: "WHO Child Growth Standards", version: "2006 + WHO Anthro algorithm 1.1.0",
      minAgeMonths: 0, maxAgeMonths: 60, sourceUrl: "https://www.who.int/tools/child-growth-standards",
      algorithmSource: "WHO/UNICEF anthro R package 1.1.0", license: "WHO data/software terms; R package GPL-3; confirm redistribution rights for each embedded dataset",
      datasetStatus: "unavailable", datasetVersion: null
    }),
    WHO_GGR_2007: Object.freeze({
      id: "WHO_GGR_2007", name: "WHO Growth Reference 2007", version: "2007 + WHO anthroplus algorithm 1.1.0",
      minAgeMonths: 61, maxAgeMonths: 228, sourceUrl: "https://www.who.int/tools/growth-reference-data-for-5to19-years",
      algorithmSource: "WHO anthroplus R package 1.1.0", license: "R package GPL-3 or later; confirm redistribution rights for each embedded dataset",
      datasetStatus: "unavailable", datasetVersion: null
    })
  });
  const indexDefinitions = Object.freeze({
    weight_for_age: {label:"Berat badan menurut umur (BB/U)", unit:"kg", required:["weightKg"], standard:"WHO_CGS_2006", minAgeMonths:0, maxAgeMonths:60, referenceAxis:"ageDays", thresholdSet:"weight_for_age_under5"},
    height_for_age_under5: {label:"Panjang/tinggi badan menurut umur (PB/U atau TB/U)", unit:"cm", required:["lengthHeightCm"], standard:"WHO_CGS_2006", minAgeMonths:0, maxAgeMonths:60, referenceAxis:"ageDays", thresholdSet:"height_for_age"},
    weight_for_length_height: {label:"Berat badan menurut panjang/tinggi badan (BB/PB atau BB/TB)", unit:"kg", required:["weightKg","lengthHeightCm"], standard:"WHO_CGS_2006", minAgeMonths:0, maxAgeMonths:60, referenceAxis:"lengthHeightCm", thresholdSet:"weight_for_length_height"},
    bmi_for_age_under5: {label:"IMT menurut umur (IMT/U)", unit:"kg/m²", required:["bmi"], standard:"WHO_CGS_2006", minAgeMonths:0, maxAgeMonths:60, referenceAxis:"ageDays", thresholdSet:"bmi_for_age_under5"},
    head_circumference_for_age: {label:"Lingkar kepala menurut umur (LK/U)", unit:"cm", required:["headCircumferenceCm"], standard:"WHO_CGS_2006", minAgeMonths:0, maxAgeMonths:60, referenceAxis:"ageDays", thresholdSet:null},
    muac_for_age: {label:"Lingkar lengan atas menurut umur (LiLA/U)", unit:"cm", required:["midUpperArmCircumferenceCm"], standard:"WHO_CGS_2006", minAgeMonths:3, maxAgeMonths:60, referenceAxis:"ageDays", thresholdSet:null},
    height_for_age_5_19: {label:"Tinggi badan menurut umur (TB/U)", unit:"cm", required:["lengthHeightCm"], standard:"WHO_GGR_2007", minAgeMonths:61, maxAgeMonths:228, referenceAxis:"ageMonths", thresholdSet:"height_for_age"},
    bmi_for_age_5_19: {label:"IMT menurut umur (IMT/U)", unit:"kg/m²", required:["bmi"], standard:"WHO_GGR_2007", minAgeMonths:61, maxAgeMonths:228, referenceAxis:"ageMonths", thresholdSet:"bmi_for_age_5_19"}
  });
  const registry = new Map();
  function registerDataset(dataset) {
    const officialSource = dataset && typeof dataset.sourceUrl === "string" &&
      /^https:\/\/(?:www\.|cdn\.)?who\.int\//i.test(dataset.sourceUrl) ||
      (dataset && typeof dataset.sourceUrl === "string" && /^https:\/\/github\.com\/WorldHealthOrganization\/(?:anthro|anthroplus)(?:\/|$)/i.test(dataset.sourceUrl));
    const provenanceOk = dataset && dataset.verified === true && dataset.benchmarkStatus === "passed" && officialSource &&
      typeof dataset.license === "string" && dataset.license.trim() &&
      typeof dataset.sha256 === "string" && /^[a-f0-9]{64}$/i.test(dataset.sha256) &&
      typeof dataset.reviewedAt === "string" && !Number.isNaN(Date.parse(dataset.reviewedAt));
    if (!dataset || !dataset.indexType || !dataset.sex || !dataset.standardId || !dataset.datasetVersion || !Array.isArray(dataset.rows) || !dataset.rows.length || !provenanceOk) {
      throw new TypeError("Dataset ditolak: identitas, provenance resmi, SHA-256, lisensi, verifikasi, dan benchmark independen yang lulus wajib tersedia.");
    }
    if (!Object.hasOwn(indexDefinitions, dataset.indexType)) throw new TypeError("Jenis indeks tidak dikenal.");
    if (!Object.hasOwn(standards, dataset.standardId)) throw new TypeError("Standar rujukan tidak dikenal.");
    if (!["male","female"].includes(dataset.sex)) throw new TypeError("Jenis kelamin dataset tidak dikenal.");
    const sorted=[...dataset.rows].sort((a,b)=>a.axis-b.axis);
    for (let i=0;i<sorted.length;i++) {
      const row=sorted[i];
      if (![row.axis, row.L, row.M, row.S].every(Number.isFinite) || row.M <= 0 || row.S <= 0) throw new TypeError("Baris LMS tidak valid.");
      if (i>0 && sorted[i-1].axis===row.axis) throw new TypeError("Sumbu referensi duplikat.");
    }
    const key = `${dataset.standardId}:${dataset.indexType}:${dataset.sex}`;
    registry.set(key, Object.freeze({...dataset, rows:sorted}));
  }
  function getDataset(standardId, indexType, sex) { return registry.get(`${standardId}:${indexType}:${sex}`) || null; }
  root.GrowthReferenceData = {standards, indexDefinitions, registerDataset, getDataset, datasetCount:()=>registry.size};
})(typeof window !== "undefined" ? window : globalThis);
