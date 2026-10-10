/* Supabase REST adapter for the existing repository contract. */
(() => {
  "use strict";

  class SupabaseDataError extends Error {
    constructor(code, message, details = {}) {
      super(message); this.name = "SupabaseDataError"; this.code = code; this.details = details;
    }
  }
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  function createSupabaseAdapter(config, dependencies = {}) {
    const fetchImpl = dependencies.fetch || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    const storage = dependencies.storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    const publicDemo = config?.publicDemo === true;
    const clock = dependencies.clock || (() => Date.now());
    const baseUrl = String(config?.url || "").replace(/\/$/, "");
    const anonKey = String(config?.anonKey || "").trim();
    let session = null;
    const sessionKey = "pediatricAnthropometry.supabase.session.v1";
    if (!fetchImpl) throw new SupabaseDataError("CONFIGURATION_ERROR", "Fetch API tidak tersedia.");
    let parsedUrl;
    try { parsedUrl = new URL(baseUrl); } catch (_) { throw new SupabaseDataError("CONFIGURATION_ERROR", "URL Supabase belum valid."); }
    if (!/^https:$/.test(parsedUrl.protocol) && !(parsedUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsedUrl.hostname))) {
      throw new SupabaseDataError("CONFIGURATION_ERROR", "Supabase wajib memakai HTTPS (HTTP hanya diizinkan untuk localhost).");
    }
    if (!anonKey || anonKey.length < 20) throw new SupabaseDataError("CONFIGURATION_ERROR", "Supabase anon/publishable key belum dikonfigurasi.");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(config?.organizationId || ""))) {
      throw new SupabaseDataError("CONFIGURATION_ERROR", "UUID organizationId Supabase belum dikonfigurasi.");
    }
    if (!publicDemo && !storage) throw new SupabaseDataError("CONFIGURATION_ERROR", "sessionStorage tidak tersedia untuk sesi login Supabase.");
    if (!publicDemo) {
      try { session = JSON.parse(storage.getItem(sessionKey) || "null"); } catch (_) { storage.removeItem(sessionKey); }
    }

    function saveSession(value) {
      session = value;
      if (publicDemo) return;
      if (value) storage.setItem(sessionKey, JSON.stringify(value));
      else storage.removeItem(sessionKey);
    }
    function errorFromResponse(status, body, operation) {
      const message = body?.message || body?.msg || body?.error_description || body?.error || `Supabase mengembalikan HTTP ${status}.`;
      const code = status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" :
        status === 404 ? "NOT_FOUND" : status === 409 || body?.code === "23505" ? "CONFLICT" :
        status === 400 || status === 422 ? "VALIDATION_ERROR" : "SERVER_ERROR";
      return new SupabaseDataError(code, String(message), {status, operation, backendCode: body?.code || null});
    }
    async function rawFetch(path, {method = "GET", body, token, prefer, query, retryAuth = true} = {}) {
      const url = new URL(`${baseUrl}${path}`);
      Object.entries(query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
      });
      const headers = {apikey: anonKey, Accept: "application/json"};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (prefer) headers.Prefer = prefer;
      let response;
      try {
        response = await fetchImpl(url.toString(), {method, headers, credentials: "omit", cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body)});
      } catch (cause) {
        throw new SupabaseDataError("NETWORK_ERROR", "Supabase tidak dapat dijangkau. Perubahan belum dipastikan tersimpan.", {cause: String(cause), method, path});
      }
      if (response.status === 401 && retryAuth && path.startsWith("/rest/v1/") && session?.refresh_token) {
        await refreshSession();
        return rawFetch(path, {method, body, token: session?.access_token, prefer, query, retryAuth: false});
      }
      if (response.status === 204) return null;
      let result = null;
      try { result = await response.json(); } catch (_) {}
      if (!response.ok) throw errorFromResponse(response.status, result, `${method} ${path}`);
      return result;
    }
    async function refreshSession() {
      if (!session?.refresh_token) { saveSession(null); throw new SupabaseDataError("UNAUTHENTICATED", "Sesi Supabase berakhir. Silakan masuk kembali."); }
      let result;
      try { result = await rawFetch("/auth/v1/token?grant_type=refresh_token", {method: "POST", body: {refresh_token: session.refresh_token}, retryAuth: false}); }
      catch (error) {
        if ([400, 401].includes(error?.details?.status)) { saveSession(null); throw new SupabaseDataError("UNAUTHENTICATED", "Sesi Supabase berakhir. Silakan masuk kembali."); }
        throw error;
      }
      saveSession({...result, expires_at: clock() + Number(result.expires_in || 3600) * 1000 - 30000});
      return session;
    }
    async function accessToken() {
      if (publicDemo) return null;
      if (!session?.access_token) throw new SupabaseDataError("UNAUTHENTICATED", "Silakan masuk dengan akun Supabase yang telah dibuat administrator.");
      if (!session.expires_at || Number(session.expires_at) <= clock() + 30000) await refreshSession();
      return session.access_token;
    }
    async function request(table, {method = "GET", query = {}, body, prefer = "return=representation"} = {}) {
      const token = await accessToken();
      return rawFetch(`/rest/v1/${table}`, {method, query, body, prefer, token});
    }
    async function readAll(table, query = {}) {
      const rows = [], pageSize = 1000, maxRows = 50000;
      for (let offset = 0; offset < maxRows; offset += pageSize) {
        const page = await request(table, {query: {...query, organization_id: `eq.${config.organizationId}`, limit: pageSize, offset}});
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
      throw new SupabaseDataError("TOO_MANY_RESULTS", `Data ${table} melebihi batas pemuatan aplikasi. Tambahkan paginasi sebelum memuat lebih banyak catatan.`);
    }
    const patientFromRow = row => ({
      id: row.id, name: row.name, medicalRecordNumber: row.medical_record_number,
      birthDate: row.birth_date, sexAtBirth: row.sex_at_birth,
      gestationalAgeAtBirth: row.gestational_age_at_birth,
      guardianName: row.guardian_name, clinicalNotes: row.clinical_notes,
      version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, isDemo: publicDemo
    });
    const examFromRow = row => ({
      id: row.id, patientId: row.patient_id, rmeVisitId: row.rme_visit_id,
      examDate: row.exam_date, weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
      lengthHeightCm: row.length_height_cm === null ? null : Number(row.length_height_cm),
      measurementType: row.measurement_type, edemaStatus: row.edema_status,
      headCircumferenceCm: row.head_circumference_cm === null ? null : Number(row.head_circumference_cm),
      midUpperArmCircumferenceCm: row.mid_upper_arm_circumference_cm === null ? null : Number(row.mid_upper_arm_circumference_cm),
      notes: row.notes, recordedBy: row.recorded_by, createdAt: row.created_at, updatedAt: row.updated_at,
      version: row.version, verificationStatus: row.verification_status,
      dataValidationStatus: row.data_validation_status, interpretationStatus: row.interpretation_status,
      anthropometryCalculation: row.anthropometry_calculation, isDemo: publicDemo
    });
    const auditFromRow = row => ({id: row.id, entityType: row.entity_type, entityId: row.entity_id,
      action: row.action, before: row.before_data, after: row.after_data,
      changedFields: row.changed_fields || [], occurredAt: row.occurred_at, actorId: row.actor_id});
    async function calculateSnapshot(patient, exam) {
      const engine = typeof window !== "undefined" ? window.PediatricGrowthEngine : null;
      if (!engine) throw new SupabaseDataError("CONFIGURATION_ERROR", "Mesin antropometri tidak termuat; hasil tidak dapat disimpan bersama pemeriksaan.");
      const evaluated = engine.evaluateExam(patient, exam);
      return {...evaluated, calculatedAt: new Date(clock()).toISOString(), calculationOrigin: "browser-prototype",
        referenceStandards: Object.values(window.GrowthReferenceData.standards).map(standard => ({
          id: standard.id, version: standard.version,
          datasetStatus: window.GrowthReferenceData.datasetStatus(standard.id), sourceUrl: standard.sourceUrl
        }))};
    }
    const patientRow = (input, ownerId) => ({
      organization_id: config.organizationId, owner_id: ownerId, name: input.name, medical_record_number: input.medicalRecordNumber,
      birth_date: input.birthDate, sex_at_birth: input.sexAtBirth,
      gestational_age_at_birth: input.gestationalAgeAtBirth || null,
      guardian_name: input.guardianName || null, clinical_notes: input.clinicalNotes || null
    });
    function examRow(input, patient, snapshot, ownerId, verificationStatus = "pending") {
      const primaryComplete = input.weightKg !== null && input.weightKg !== undefined && input.weightKg !== "" && input.lengthHeightCm !== null && input.lengthHeightCm !== undefined && input.lengthHeightCm !== "";
      const hasValid = snapshot.results.some(result => result.validityStatus === "valid");
      return {
        organization_id: config.organizationId, owner_id: ownerId, patient_id: input.patientId, rme_visit_id: input.rmeVisitId || null,
        exam_date: input.examDate, weight_kg: input.weightKg === "" ? null : input.weightKg,
        length_height_cm: input.lengthHeightCm === "" ? null : input.lengthHeightCm,
        measurement_type: input.measurementType, edema_status: input.edemaStatus || "unknown",
        head_circumference_cm: input.headCircumferenceCm === "" ? null : input.headCircumferenceCm,
        mid_upper_arm_circumference_cm: input.midUpperArmCircumferenceCm === "" ? null : input.midUpperArmCircumferenceCm,
        notes: input.notes || null, recorded_by: session?.user?.id || null,
        data_validation_status: primaryComplete ? "valid" : "incomplete",
        interpretation_status: hasValid ? "valid" : primaryComplete ? "not_calculated" : "incomplete",
        verification_status: verificationStatus, anthropometry_calculation: snapshot
      };
    }

    return {
      adapterName: "supabase-postgrest", providerLabel: "Supabase", mode: "production", publicDemo, authRequired: !publicDemo,
      persistenceMode: "server-confirmed", isDemo: publicDemo,
      async signIn(email, password) {
        if (publicDemo) throw new SupabaseDataError("NOT_SUPPORTED", "Mode demo publik tidak memakai login.");
        const result = await rawFetch("/auth/v1/token?grant_type=password", {method: "POST", body: {email, password}, retryAuth: false});
        saveSession({...result, expires_at: clock() + Number(result.expires_in || 3600) * 1000 - 30000});
        return {id: result.user?.id, email: result.user?.email};
      },
      async signOut() {
        if (publicDemo) return;
        try { if (session?.access_token) await rawFetch("/auth/v1/logout", {method: "POST", token: session.access_token, retryAuth: false}); } catch (_) {}
        finally { saveSession(null); }
      },
      get currentUser() { return session?.user ? {id: session.user.id, email: session.user.email} : null; },
      async initialize() { return this.getSnapshot(); },
      async getSnapshot() {
        if (publicDemo) {
          const organizations = await request("organizations", {query: {select: "id,is_public_demo", id: `eq.${config.organizationId}`, limit: 1}});
          if (!organizations?.[0]?.is_public_demo) throw new SupabaseDataError("PUBLIC_DEMO_NOT_ENABLED", "Organisasi ini belum ditandai sebagai demo publik. Jalankan migrasi demo publik dan tandai hanya organisasi yang berisi data sintetis.");
        }
        const [patients, exams, auditEvents] = await Promise.all([
          readAll("patients", {select: "*", order: "name.asc,id.asc"}),
          readAll("exams", {select: "*", order: "exam_date.desc,id.asc"}),
          readAll("audit_events", {select: "*", order: "occurred_at.desc,id.asc"})
        ]);
        const snapshot = {mode: "production", patients: patients.map(patientFromRow), exams: exams.map(examFromRow),
          interpretations: [], auditEvents: auditEvents.map(auditFromRow)};
        const patientIds = new Set(snapshot.patients.map(item => item.id));
        if (snapshot.exams.some(item => !patientIds.has(item.patientId))) throw new SupabaseDataError("DATA_INTEGRITY_ERROR", "Snapshot Supabase memiliki pemeriksaan tanpa pasien yang dapat diakses.");
        return clone(snapshot);
      },
      async listPatients() { return (await readAll("patients", {select: "*", order: "name.asc,id.asc"})).map(patientFromRow); },
      async getPatient(id) {
        const rows = await request("patients", {query: {select: "*", id: `eq.${id}`, organization_id: `eq.${config.organizationId}`, limit: 1}});
        if (!rows.length) throw new SupabaseDataError("NOT_FOUND", "Pasien tidak ditemukan atau tidak dapat diakses.");
        return patientFromRow(rows[0]);
      },
      async createPatient(input) {
        const rows = await request("patients", {method: "POST", body: patientRow(input, session?.user?.id || null)});
        if (!rows?.[0]) throw new SupabaseDataError("INVALID_RESPONSE", "Supabase tidak mengembalikan pasien yang dibuat.");
        return patientFromRow(rows[0]);
      },
      async updatePatient(id, input) {
        const current = await this.getPatient(id);
        const version = input.version ?? current.version;
        const rows = await request("patients", {method: "PATCH", query: {id: `eq.${id}`, organization_id: `eq.${config.organizationId}`, version: `eq.${version}`}, body: patientRow(input, session?.user?.id || null)});
        if (!rows?.[0]) throw new SupabaseDataError("CONFLICT", "Data pasien berubah di server. Muat ulang sebelum mencoba koreksi.");
        return patientFromRow(rows[0]);
      },
      async listExams(patientId = null) {
        const query = {select: "*", order: "exam_date.desc,id.asc", organization_id: `eq.${config.organizationId}`}; if (patientId) query.patient_id = `eq.${patientId}`;
        return (await readAll("exams", query)).map(examFromRow);
      },
      async getExam(id) {
        const rows = await request("exams", {query: {select: "*", id: `eq.${id}`, organization_id: `eq.${config.organizationId}`, limit: 1}});
        if (!rows.length) throw new SupabaseDataError("NOT_FOUND", "Pemeriksaan tidak ditemukan atau tidak dapat diakses.");
        return examFromRow(rows[0]);
      },
      async createExam(input) {
        if (!input.patientId) throw new SupabaseDataError("VALIDATION_ERROR", "Pemeriksaan wajib terhubung ke pasien.");
        const patient = await this.getPatient(input.patientId);
        const snapshot = calculateSnapshot(patient, input);
        const rows = await request("exams", {method: "POST", body: examRow(input, patient, await snapshot, session?.user?.id || null)});
        if (!rows?.[0]) throw new SupabaseDataError("INVALID_RESPONSE", "Supabase tidak mengembalikan pemeriksaan yang dibuat.");
        return examFromRow(rows[0]);
      },
      async updateExam(id, input) {
        if (!input.patientId) throw new SupabaseDataError("VALIDATION_ERROR", "Pemeriksaan wajib terhubung ke pasien.");
        const [current, patient] = await Promise.all([this.getExam(id), this.getPatient(input.patientId)]);
        const version = input.version ?? current.version;
        const snapshot = await calculateSnapshot(patient, input);
        const rows = await request("exams", {method: "PATCH", query: {id: `eq.${id}`, organization_id: `eq.${config.organizationId}`, version: `eq.${version}`}, body: examRow(input, patient, snapshot, session?.user?.id || null, current.verificationStatus)});
        if (!rows?.[0]) throw new SupabaseDataError("CONFLICT", "Pemeriksaan berubah di server. Muat ulang sebelum mencoba koreksi.");
        return examFromRow(rows[0]);
      },
      async listInterpretations() { return []; },
      async listAuditEvents({entityType = null, entityId = null, limit = 100} = {}) {
        const query = {select: "*", order: "occurred_at.desc", limit: Math.max(1, Math.min(Number(limit) || 100, 500))};
        query.organization_id = `eq.${config.organizationId}`;
        if (entityType) query.entity_type = `eq.${entityType}`;
        if (entityId) query.entity_id = `eq.${entityId}`;
        return (await request("audit_events", {query})).map(auditFromRow);
      },
      async getEntityHistory(entityType, entityId) { return this.listAuditEvents({entityType, entityId}); },
      async resetDemoData() { throw new SupabaseDataError("NOT_SUPPORTED", "Reset data hanya tersedia pada adapter demo."); }
    };
  }

  function createConfiguredService({config = (typeof window !== "undefined" ? window.SupabaseConfig : null), dependencies = {}} = {}) {
    if (!config || config.enabled !== true) throw new SupabaseDataError("CONFIGURATION_ERROR", "Supabase belum diaktifkan.");
    try { return createSupabaseAdapter(config, dependencies); }
    catch (error) {
      const unavailable = async () => { throw error; };
      return {adapterName: "supabase-misconfigured", providerLabel: "Supabase", mode: "production", publicDemo: config.publicDemo === true, authRequired: config.publicDemo !== true, isDemo: config.publicDemo === true, persistenceMode: "server-unavailable",
        initialize: unavailable, getSnapshot: unavailable, listPatients: unavailable, getPatient: unavailable,
        createPatient: unavailable, updatePatient: unavailable, listExams: unavailable, getExam: unavailable,
        createExam: unavailable, updateExam: unavailable, listInterpretations: unavailable, listAuditEvents: unavailable,
        getEntityHistory: unavailable, signIn: unavailable, signOut: unavailable, resetDemoData: unavailable};
    }
  }
  window.AnthropometrySupabase = {createSupabaseAdapter, createConfiguredService, SupabaseDataError};
})();
