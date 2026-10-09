/*
 * Data access boundary. UI hanya bergantung pada kontrak repository ini.
 * Saat backend tersedia, implementasikan adapter API dengan metode Promise
 * yang sama; jangan menulis akses localStorage di komponen UI.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "klinikPadjadjaran.anthropometry.demo.v2";
  const INTERPRETATION_STATES = Object.freeze([
    "not_calculated", "valid", "incomplete", "failed_validation", "stale"
  ]);
  const DATA_QUALITY_STATES = Object.freeze(["valid", "incomplete", "failed_validation"]);
  const MEASUREMENT_TYPES = Object.freeze(["recumbent_length", "standing_height"]);

  class RepositoryError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "RepositoryError";
      this.code = code;
      this.details = details;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function toNullableNumber(value) {
    if (value === undefined || value === null || value === "") return null;
    return typeof value === "number" ? value : Number(value);
  }

  function makeMemoryStorage() {
    const map = new Map();
    return {
      getItem: key => map.has(key) ? map.get(key) : null,
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: key => map.delete(key)
    };
  }

  function createDemoRepository(options = {}) {
    const seed = clone(options.seedData || window.DemoSeedData);
    const storage = options.storage || (() => {
      try { return window.localStorage; } catch (_) { return makeMemoryStorage(); }
    })();
    const clock = options.clock || (() => new Date());
    const idFactory = options.idFactory || ((prefix) => {
      const uuid = window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID().replace(/-/g, "")
        : `${clock().getTime().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      return `${prefix}-${uuid.toUpperCase()}`;
    });

    function fail(code, message, details) {
      throw new RepositoryError(code, message, details);
    }
    function nowIso() { return clock().toISOString(); }
    function today() { return localDateString(clock()); }
    function requirePatient(id, source = state) {
      const found = source.patients.find(item => item.id === id);
      if (!found) fail("NOT_FOUND", `Pasien dengan ID '${id || "(kosong)"}' tidak ditemukan.`, {entity: "patient", id});
      return found;
    }
    function requireExam(id, source = state) {
      const found = source.exams.find(item => item.id === id);
      if (!found) fail("NOT_FOUND", `Pemeriksaan dengan ID '${id || "(kosong)"}' tidak ditemukan.`, {entity: "exam", id});
      return found;
    }
    function integrityCheck(candidate) {
      if (!candidate || candidate.mode !== "simulation" || !Array.isArray(candidate.patients) ||
          !Array.isArray(candidate.exams) || !Array.isArray(candidate.interpretations) ||
          !Array.isArray(candidate.auditEvents)) {
        fail("DATA_ISOLATION_ERROR", "Data demo tidak sesuai skema atau bukan ruang data simulasi.");
      }
      const entities = [...candidate.patients, ...candidate.exams, ...candidate.interpretations, ...candidate.auditEvents];
      if (entities.some(item => item.isDemo !== true)) {
        fail("DATA_ISOLATION_ERROR", "Repository demo menolak entitas yang tidak ditandai sebagai simulasi.");
      }
      const patientIds = new Set(candidate.patients.map(item => item.id));
      const examIds = new Set(candidate.exams.map(item => item.id));
      if (patientIds.size !== candidate.patients.length || examIds.size !== candidate.exams.length) {
        fail("DATA_INTEGRITY_ERROR", "ID pasien atau ID pemeriksaan duplikat dalam penyimpanan demo.");
      }
      for (const exam of candidate.exams) {
        if (!patientIds.has(exam.patientId)) fail("DATA_INTEGRITY_ERROR", `Pemeriksaan ${exam.id} tidak memiliki relasi pasien yang valid.`);
        if (exam.anthropometryCalculation) {
          const calc = exam.anthropometryCalculation;
          if (!calc.algorithmVersion || !calc.referenceSchemaVersion || !Array.isArray(calc.results) || !calc.calculatedAt || Number.isNaN(Date.parse(calc.calculatedAt))) {
            fail("DATA_INTEGRITY_ERROR", `Snapshot perhitungan ${exam.id} tidak memiliki provenance lengkap.`);
          }
          if (calc.results.some(result => result.zScore !== null && result.zScore !== undefined && (result.validityStatus !== "valid" || !Number.isFinite(result.zScore)))) {
            fail("DATA_INTEGRITY_ERROR", `Snapshot perhitungan ${exam.id} memuat Z-score yang tidak tervalidasi.`);
          }
          if (calc.results.some(result => result.category !== null && result.category !== undefined && result.validityStatus !== "valid")) {
            fail("DATA_INTEGRITY_ERROR", `Snapshot perhitungan ${exam.id} memuat kategori yang tidak tervalidasi.`);
          }
        }
      }
      for (const result of candidate.interpretations) {
        if (!examIds.has(result.examId)) fail("DATA_INTEGRITY_ERROR", `Interpretasi ${result.id} tidak memiliki relasi pemeriksaan yang valid.`);
        if (!INTERPRETATION_STATES.includes(result.validationStatus)) fail("DATA_INTEGRITY_ERROR", `Status interpretasi ${result.id} tidak dikenal.`);
        // Model hasil menyimpan provenance; nilai klinis hanya boleh berstatus valid
        // jika indeks, nilai, versi rujukan/algoritme, dan waktu hitung tersedia.
        if (result.validationStatus === "valid" &&
            (!result.indexType || !Number.isFinite(result.calculatedValue) ||
             !result.referenceStandardVersion || !result.algorithmVersion ||
             !result.calculatedAt || Number.isNaN(Date.parse(result.calculatedAt)))) {
          fail("DATA_INTEGRITY_ERROR", `Interpretasi valid ${result.id} tidak memiliki provenance lengkap.`);
        }
        if (result.zScore !== null && result.zScore !== undefined &&
            (result.validationStatus !== "valid" || !Number.isFinite(result.zScore))) {
          fail("DATA_INTEGRITY_ERROR", `Z-score ${result.id} hanya boleh disimpan sebagai angka pada hasil tervalidasi.`);
        }
        if (result.category !== null && result.category !== undefined && result.validationStatus !== "valid") {
          fail("DATA_INTEGRITY_ERROR", `Kategori ${result.id} hanya boleh disimpan pada hasil tervalidasi.`);
        }
      }
      const rms = candidate.patients.map(item => String(item.medicalRecordNumber).trim().toLowerCase());
      if (new Set(rms).size !== rms.length) fail("DATA_INTEGRITY_ERROR", "Nomor rekam medis duplikat dalam penyimpanan demo.");
    }

    let state;
    let persistence = "localStorage";
    try {
      const stored = storage.getItem(STORAGE_KEY);
      state = stored === null ? seed : JSON.parse(stored);
      integrityCheck(state);
      if (stored === null) storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      // Jika localStorage tidak tersedia, gunakan memori terisolasi dan jangan
      // mengalihkan data ke namespace lain.
      persistence = "memory-only";
      state = seed;
      integrityCheck(state);
    }

    function persistDraft(draft) {
      integrityCheck(draft);
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch (error) {
        if (persistence === "memory-only") { state = draft; return; }
        fail("PERSISTENCE_ERROR", "Data simulasi tidak berhasil disimpan di browser.", {cause: String(error)});
      }
      state = draft;
    }

    function uniqueId(prefix, collection) {
      let id;
      do { id = idFactory(prefix); } while (collection.some(item => item.id === id));
      return id;
    }

    function auditEvent(draft, {entityType, entityId, action, before = null, after = null, changedFields = []}) {
      draft.auditEvents.push({
        id: uniqueId("AUD-DEMO", draft.auditEvents), entityType, entityId, action,
        changedFields: [...changedFields], before: before ? clone(before) : null,
        after: after ? clone(after) : null, actorId: null, occurredAt: nowIso(), isDemo: true
      });
    }

    function validatePatient(input, source = state, existing = null) {
      const errors = [];
      const name = String(input.name || "").trim();
      const medicalRecordNumber = String(input.medicalRecordNumber || "").trim();
      const birthDate = String(input.birthDate || "");
      const sexAtBirth = String(input.sexAtBirth || "");
      if (!name) errors.push("Nama pasien wajib diisi.");
      if (!medicalRecordNumber) errors.push("Nomor rekam medis wajib diisi.");
      if (!isIsoDate(birthDate)) errors.push("Tanggal lahir harus berupa tanggal yang valid.");
      else if (birthDate > today()) errors.push("Tanggal lahir tidak boleh di masa depan.");
      if (!(["female", "male"].includes(sexAtBirth))) errors.push("Jenis kelamin untuk standar pertumbuhan harus dipilih.");
      if (medicalRecordNumber && source.patients.some(item => item.id !== existing?.id && item.medicalRecordNumber.toLowerCase() === medicalRecordNumber.toLowerCase())) {
        errors.push("Nomor rekam medis sudah digunakan pada ruang data demo.");
      }
      const ga = input.gestationalAgeAtBirth;
      let gestationalAgeAtBirth = null;
      if (ga && ga.weeks !== "" && ga.weeks !== null && ga.weeks !== undefined) {
        const weeks = Number(ga.weeks), days = ga.days === "" || ga.days === null || ga.days === undefined ? 0 : Number(ga.days);
        if (!Number.isInteger(weeks) || weeks < 20 || weeks > 45 || !Number.isInteger(days) || days < 0 || days > 6) {
          errors.push("Usia gestasi harus berupa minggu 20–45 dan hari 0–6.");
        } else gestationalAgeAtBirth = {weeks, days};
      }
      return {errors, normalized: {name, medicalRecordNumber, birthDate, sexAtBirth, gestationalAgeAtBirth,
        guardianName: String(input.guardianName || "").trim() || null,
        clinicalNotes: String(input.clinicalNotes || "").trim() || null}};
    }

    function validateExam(input, source = state, existing = null) {
      const errors = [];
      const patientId = existing ? existing.patientId : String(input.patientId || "");
      let p;
      try { p = requirePatient(patientId, source); } catch (error) { errors.push(error.message); }
      const examDate = String(input.examDate || "");
      if (!isIsoDate(examDate)) errors.push("Tanggal pemeriksaan harus berupa tanggal yang valid.");
      else {
        if (examDate > today()) errors.push("Tanggal pemeriksaan tidak boleh di masa depan.");
        if (p && examDate < p.birthDate) errors.push("Tanggal pemeriksaan tidak boleh sebelum tanggal lahir pasien.");
      }
      const measurementType = String(input.measurementType || "");
      if (!MEASUREMENT_TYPES.includes(measurementType)) errors.push("Jenis pengukuran panjang/tinggi harus dipilih.");
      const fields = [
        ["weightKg", "Berat badan", 0.1, 300],
        ["lengthHeightCm", "Panjang/tinggi badan", 20, 250],
        ["headCircumferenceCm", "Lingkar kepala", 10, 100],
        ["midUpperArmCircumferenceCm", "Lingkar lengan atas", 3, 80]
      ];
      const normalizedMetrics = {};
      for (const [key, label, min, max] of fields) {
        const n = toNullableNumber(input[key]);
        if (n !== null && (!Number.isFinite(n) || n < min || n > max)) errors.push(`${label} harus berada dalam rentang ${min}–${max}.`);
        normalizedMetrics[key] = n;
      }
      if (normalizedMetrics.weightKg === null && normalizedMetrics.lengthHeightCm === null &&
          normalizedMetrics.headCircumferenceCm === null && normalizedMetrics.midUpperArmCircumferenceCm === null) {
        errors.push("Masukkan sedikitnya satu nilai pengukuran sebelum menyimpan catatan.");
      }
      const normalized = {
        patientId, rmeVisitId: String(input.rmeVisitId || "").trim() || null, examDate,
        ...normalizedMetrics, measurementType,
        notes: String(input.notes || "").trim() || null
      };
      const completePrimary = normalized.weightKg !== null && normalized.lengthHeightCm !== null;
      return {errors, normalized, dataValidationStatus: completePrimary ? "valid" : "incomplete",
        interpretationStatus: completePrimary ? "not_calculated" : "incomplete"};
    }

    function makeCalculationSnapshot(patient, exam) {
      const engine = window.PediatricGrowthEngine;
      if (!engine) return {algorithmVersion:"unavailable",referenceSchemaVersion:"unavailable",calculatedAt:nowIso(),overallStatus:"not_calculated",results:[]};
      const evaluated = engine.evaluateExam(patient, exam);
      return {...evaluated, calculatedAt:nowIso(), referenceStandards:Object.values(window.GrowthReferenceData.standards).map(s=>({id:s.id,version:s.version,datasetVersion:s.datasetVersion,datasetStatus:s.datasetStatus,sourceUrl:s.sourceUrl}))};
    }

    const repository = {
      adapterName: "demo-localStorage",
      mode: "simulation",
      isDemo: true,
      get persistenceMode() { return persistence; },
      storageKey: STORAGE_KEY,
      statusEnums: {interpretation: [...INTERPRETATION_STATES], dataQuality: [...DATA_QUALITY_STATES]},
      interpretationModelFields: ["id", "examId", "indexType", "calculatedValue", "zScore", "category", "referenceStandardVersion", "algorithmVersion", "calculatedAt", "validationStatus", "isDemo"],

      async initialize() { return this.getSnapshot(); },
      async getSnapshot() { return clone(state); },
      async listPatients() { return clone(state.patients).sort((a, b) => a.name.localeCompare(b.name, "id")); },
      async getPatient(id) { return clone(requirePatient(id)); },
      async createPatient(input) {
        const check = validatePatient(input);
        if (check.errors.length) fail("VALIDATION_ERROR", check.errors.join(" "), {status: "failed_validation", errors: check.errors});
        const draft = clone(state);
        const time = nowIso();
        const patient = {id: uniqueId("PAT-DEMO", draft.patients), ...check.normalized,
          createdAt: time, updatedAt: time, isDemo: true};
        draft.patients.push(patient);
        auditEvent(draft, {entityType: "patient", entityId: patient.id, action: "CREATED", after: patient,
          changedFields: Object.keys(check.normalized)});
        persistDraft(draft);
        return clone(patient);
      },
      async updatePatient(id, input) {
        const current = requirePatient(id);
        const check = validatePatient(input, state, current);
        if (check.errors.length) fail("VALIDATION_ERROR", check.errors.join(" "), {status: "failed_validation", errors: check.errors});
        const draft = clone(state);
        const target = draft.patients.find(item => item.id === id);
        const before = clone(target);
        const changedFields = Object.keys(check.normalized).filter(key => JSON.stringify(target[key] ?? null) !== JSON.stringify(check.normalized[key] ?? null));
        if (changedFields.length) {
          Object.assign(target, check.normalized, {updatedAt: nowIso(), isDemo: true});
          auditEvent(draft, {entityType: "patient", entityId: id, action: "CORRECTED", before, after: target,
            changedFields: [...changedFields, "updatedAt"]});
          persistDraft(draft);
        }
        return clone(target);
      },

      async listExams(patientId = null) {
        if (patientId) requirePatient(patientId);
        return clone(state.exams.filter(item => !patientId || item.patientId === patientId)
          .sort((a, b) => b.examDate.localeCompare(a.examDate) || b.createdAt.localeCompare(a.createdAt)));
      },
      async getExam(id) { return clone(requireExam(id)); },
      async createExam(input) {
        const check = validateExam(input);
        if (check.errors.length) fail("VALIDATION_ERROR", check.errors.join(" "), {status: "failed_validation", errors: check.errors});
        const draft = clone(state);
        const time = nowIso();
        const exam = {id: uniqueId("EX-DEMO", draft.exams), ...check.normalized,
          recordedBy: null, createdAt: time, updatedAt: time,
          verificationStatus: "pending", dataValidationStatus: check.dataValidationStatus,
          interpretationStatus: check.interpretationStatus, isDemo: true};
        exam.anthropometryCalculation = makeCalculationSnapshot(requirePatient(exam.patientId, draft), exam);
        draft.exams.push(exam);
        auditEvent(draft, {entityType: "exam", entityId: exam.id, action: "CREATED", after: exam,
          changedFields: Object.keys(check.normalized)});
        persistDraft(draft);
        return clone(exam);
      },
      async updateExam(id, input) {
        const current = requireExam(id);
        const check = validateExam(input, state, current);
        if (check.errors.length) fail("VALIDATION_ERROR", check.errors.join(" "), {status: "failed_validation", errors: check.errors});
        const draft = clone(state);
        const target = draft.exams.find(item => item.id === id);
        const before = clone(target);
        const comparableFields = Object.keys(check.normalized);
        const changedFields = comparableFields.filter(key => JSON.stringify(target[key] ?? null) !== JSON.stringify(check.normalized[key] ?? null));
        Object.assign(target, check.normalized, {
          updatedAt: nowIso(), dataValidationStatus: check.dataValidationStatus,
          interpretationStatus: check.interpretationStatus
        });
        target.isDemo = true;
        target.anthropometryCalculation = makeCalculationSnapshot(requirePatient(target.patientId, draft), target);
        // Perubahan input menjadikan hasil lama (jika kelak ada) kedaluwarsa;
        // nilainya tidak dihapus dan tetap dapat ditelusuri melalui audit.
        if (changedFields.length) {
          draft.interpretations = draft.interpretations.map(result => result.examId === id
            ? {...result, validationStatus: "stale", isDemo: true} : result);
          auditEvent(draft, {entityType: "exam", entityId: id, action: "CORRECTED", before, after: target,
            changedFields: [...changedFields, "updatedAt", "interpretationStatus"]});
        }
        persistDraft(draft);
        return clone(target);
      },
      async listInterpretations(examId = null) {
        if (examId) requireExam(examId);
        return clone(state.interpretations.filter(item => !examId || item.examId === examId));
      },
      async listAuditEvents({entityType = null, entityId = null, limit = 100} = {}) {
        const events = state.auditEvents.filter(item => (!entityType || item.entityType === entityType) && (!entityId || item.entityId === entityId));
        return clone(events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit));
      },
      async getEntityHistory(entityType, entityId) {
        if (entityType === "patient") requirePatient(entityId);
        else if (entityType === "exam") requireExam(entityId);
        else fail("INVALID_ARGUMENT", "Jenis entitas riwayat tidak dikenal.");
        return this.listAuditEvents({entityType, entityId});
      },
      // Dipakai untuk pengujian agar input gagal bisa diberi status jelas tanpa
      // membuat catatan pemeriksaan yang tidak sah di penyimpanan.
      validateExamInput(input) {
        const check = validateExam(input);
        return {ok: check.errors.length === 0, status: check.errors.length ? "failed_validation" : check.dataValidationStatus,
          errors: [...check.errors], dataValidationStatus: check.dataValidationStatus,
          interpretationStatus: check.interpretationStatus};
      },
      async resetDemoData() {
        const clean = clone(seed);
        integrityCheck(clean);
        persistDraft(clean);
        return clone(state);
      }
    };
    return repository;
  }

  window.AnthropometryRepository = {createDemoRepository, RepositoryError, STORAGE_KEY};
})();
