/*
 * Integration boundary for RME data services.
 * No production URL, credentials, token, or database schema is hard-coded here.
 * API mode is enabled only when the RME administrator injects an explicit route contract.
 */
(() => {
  "use strict";

  class DataServiceError extends Error {
    constructor(code, message, details = {}) {
      super(message); this.name = "DataServiceError"; this.code = code; this.details = details;
    }
  }
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const template = (path, params = {}) => String(path).replace(/\{([a-zA-Z]+)\}/g, (_, key) => {
    if (params[key] === undefined || params[key] === null || params[key] === "") {
      throw new DataServiceError("CONFIGURATION_ERROR", `Parameter rute '${key}' belum tersedia.`);
    }
    return encodeURIComponent(String(params[key]));
  });
  const unwrap = body => body && Object.prototype.hasOwnProperty.call(body, "data") ? body.data : body;

  function createApiAdapter(config, dependencies = {}) {
    const fetchImpl = dependencies.fetch || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    const clock = dependencies.clock || (() => new Date());
    if (!fetchImpl) throw new DataServiceError("CONFIGURATION_ERROR", "Fetch tidak tersedia di lingkungan ini.");
    if (!config || typeof config.baseUrl !== "string" || !config.baseUrl.trim() || !config.routes || typeof config.routes !== "object") {
      throw new DataServiceError("CONFIGURATION_ERROR", "Konfigurasi RME harus menyediakan baseUrl dan peta routes dari pengelola sistem.");
    }
    const requiredRoutes = ["patients", "patient", "exams", "exam"];
    const missing = requiredRoutes.filter(k => !config.routes[k]);
    if (missing.length) throw new DataServiceError("CONFIGURATION_ERROR", `Rute RME belum dikonfigurasi: ${missing.join(", ")}.`);
    const baseUrl = config.baseUrl.replace(/\/$/, "");
    const maxReadRetries = Number.isInteger(config.readRetries) ? Math.max(0, Math.min(config.readRetries, 3)) : 2;

    async function request(method, route, {params = {}, query = {}, body, headers = {}, retryRead = false} = {}) {
      if (!route) throw new DataServiceError("CONFIGURATION_ERROR", `Rute untuk ${method} belum dikonfigurasi.`);
      const path = template(route, params);
      const url = new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, typeof location !== "undefined" ? location.href : "http://localhost/");
      Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v)); });
      const csrf = typeof document !== "undefined" ? document.querySelector('meta[name="csrf-token"]')?.content : null;
      const requestHeaders = {Accept: "application/json", ...headers};
      if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
      if (csrf) requestHeaders["X-CSRF-Token"] = csrf;
      let attempt = 0;
      while (true) {
        let response;
        try {
          response = await fetchImpl(url.toString(), {
            method, headers: requestHeaders, credentials: config.credentials || "same-origin",
            cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body)
          });
        } catch (cause) {
          if (retryRead && attempt < maxReadRetries) { attempt++; continue; }
          throw new DataServiceError("NETWORK_ERROR", "Backend RME tidak dapat dijangkau. Data belum dipastikan tersimpan.", {method, path, cause: String(cause)});
        }
        if (response.status === 401) throw new DataServiceError("UNAUTHENTICATED", "Sesi autentikasi tidak tersedia atau telah berakhir.", {status: 401});
        if (response.status === 403) throw new DataServiceError("FORBIDDEN", "Akses ke data ini ditolak oleh backend RME.", {status: 403});
        if (response.status === 404) throw new DataServiceError("NOT_FOUND", "Pasien, kunjungan, atau pemeriksaan tidak ditemukan.", {status: 404});
        if (response.status === 409 || response.status === 412) throw new DataServiceError("CONFLICT", "Data berubah di server atau terjadi konflik versi. Muat ulang sebelum mencoba kembali.", {status: response.status});
        if ((response.status >= 500 || response.status === 429) && retryRead && attempt < maxReadRetries) { attempt++; continue; }
        if (!response.ok) {
          let message = `Backend RME mengembalikan HTTP ${response.status}.`;
          try { const err = await response.json(); if (typeof err.message === "string") message = err.message; } catch (_) {}
          throw new DataServiceError("SERVER_ERROR", message, {status: response.status, method, path});
        }
        if (response.status === 204) return null;
        try { return unwrap(await response.json()); }
        catch (cause) { throw new DataServiceError("INVALID_RESPONSE", "Respons backend bukan JSON yang dapat dibaca.", {method, path, cause: String(cause)}); }
      }
    }
    function assertSavedExam(saved, input, expectedId = null) {
      if (!saved || (expectedId && saved.id !== expectedId) || saved.patientId !== input.patientId ||
          String(saved.rmeVisitId || "") !== String(input.rmeVisitId || "")) {
        throw new DataServiceError("DATA_INTEGRITY_ERROR", "Respons simpan tidak sesuai ID pemeriksaan, pasien, atau kunjungan yang diminta.");
      }
      const calc = saved.anthropometryCalculation;
      if (!calc || !calc.algorithmVersion || !calc.referenceSchemaVersion || !Array.isArray(calc.results) ||
          !calc.calculatedAt || Number.isNaN(Date.parse(calc.calculatedAt))) {
        throw new DataServiceError("PROVENANCE_MISSING", "Backend belum mengembalikan snapshot hasil dengan versi algoritme/referensi dan waktu perhitungan. Simpanan tidak dapat dikonfirmasi sebagai catatan lengkap.");
      }
      if (calc.results.some(r => r.zScore !== null && r.zScore !== undefined && (r.validityStatus !== "valid" || !Number.isFinite(r.zScore))) ||
          calc.results.some(r => r.category !== null && r.category !== undefined && r.validityStatus !== "valid")) {
        throw new DataServiceError("DATA_INTEGRITY_ERROR", "Backend mengembalikan hasil interpretasi yang tidak memiliki status validitas konsisten.");
      }
      return clone(saved);
    }

    const api = {
      adapterName: "rme-api",
      mode: "production",
      persistenceMode: "server-confirmed",
      isDemo: false,
      async initialize() { return this.getSnapshot(); },
      async getSnapshot() {
        const [patients, exams, interpretations, auditEvents] = await Promise.all([
          request("GET", config.routes.patients, {retryRead: true}),
          request("GET", config.routes.exams, {retryRead: true}),
          config.routes.interpretations ? request("GET", config.routes.interpretations, {retryRead: true}) : Promise.resolve([]),
          config.routes.audit ? request("GET", config.routes.audit, {retryRead: true}) : Promise.resolve([])
        ]);
        const snapshot = {mode: "production", patients: patients?.items || patients || [], exams: exams?.items || exams || [], interpretations: interpretations?.items || interpretations || [], auditEvents: auditEvents?.items || auditEvents || []};
        if (![snapshot.patients, snapshot.exams, snapshot.interpretations, snapshot.auditEvents].every(Array.isArray)) throw new DataServiceError("INVALID_RESPONSE", "Skema respons daftar RME tidak sesuai kontrak integrasi.");
        const patientIds = new Set(snapshot.patients.map(p => p.id));
        if (snapshot.exams.some(e => !e.patientId || !patientIds.has(e.patientId))) throw new DataServiceError("DATA_INTEGRITY_ERROR", "Snapshot backend berisi pemeriksaan tanpa relasi pasien yang valid.");
        return clone(snapshot);
      },
      async listPatients() { const r = await request("GET", config.routes.patients, {retryRead: true}); return clone(r?.items || r || []); },
      async getPatient(id) { return clone(await request("GET", config.routes.patient, {params: {patientId: id}, retryRead: true})); },
      async createPatient(input) { return clone(await request("POST", config.routes.patients, {body: input})); },
      async updatePatient(id, input) { return clone(await request("PUT", config.routes.patient, {params: {patientId: id}, body: input, headers: input.version ? {"If-Match": String(input.version)} : {}})); },
      async listExams(patientId = null) { const r = await request("GET", config.routes.exams, {query: {patientId}, retryRead: true}); return clone(r?.items || r || []); },
      async getExam(id) { return clone(await request("GET", config.routes.exam, {params: {examId: id}, retryRead: true})); },
      async createExam(input) {
        if (!input.patientId) throw new DataServiceError("VALIDATION_ERROR", "Pemeriksaan wajib terhubung ke ID pasien.");
        if (config.visitRequired && !input.rmeVisitId) throw new DataServiceError("VALIDATION_ERROR", "ID kunjungan RME wajib diisi sesuai kontrak backend.");
        const saved = await request("POST", config.routes.exams, {body: {...input, patientId: input.patientId, rmeVisitId: input.rmeVisitId || null}, headers: {"Idempotency-Key": `anthro-${clock().getTime()}-${Math.random().toString(36).slice(2, 10)}`}});
        return assertSavedExam(saved, input);
      },
      async updateExam(id, input) {
        if (!input.patientId) throw new DataServiceError("VALIDATION_ERROR", "Pemeriksaan wajib terhubung ke ID pasien.");
        if (config.visitRequired && !input.rmeVisitId) throw new DataServiceError("VALIDATION_ERROR", "ID kunjungan RME wajib diisi sesuai kontrak backend.");
        const saved = await request("PUT", config.routes.exam, {params: {examId: id}, body: {...input, patientId: input.patientId, rmeVisitId: input.rmeVisitId || null}, headers: input.version ? {"If-Match": String(input.version)} : {}});
        return assertSavedExam(saved, input, id);
      },
      async listInterpretations(examId = null) { const r = await request("GET", config.routes.interpretations, {query: {examId}, retryRead: true}); return clone(r?.items || r || []); },
      async listAuditEvents({entityType = null, entityId = null, limit = 100} = {}) { const r = await request("GET", config.routes.audit, {query: {entityType, entityId, limit}, retryRead: true}); return clone(r?.items || r || []); },
      async getEntityHistory(entityType, entityId) { return this.listAuditEvents({entityType, entityId}); },
      async resetDemoData() { throw new DataServiceError("NOT_SUPPORTED", "Reset data hanya tersedia pada adapter demo."); }
    };
    return api;
  }

  function createConfiguredService({demoAdapter, config = (typeof window !== "undefined" ? window.RMEIntegrationConfig : null), dependencies = {}} = {}) {
    if (!config || config.enabled !== true) {
      if (!demoAdapter) throw new DataServiceError("CONFIGURATION_ERROR", "Adapter demo harus disediakan saat mode RME tidak aktif.");
      return demoAdapter;
    }
    try { return createApiAdapter(config, dependencies); }
    catch (error) {
      const unavailable = async () => { throw error; };
      return {adapterName: "rme-api-misconfigured", mode: "production", isDemo: false, persistenceMode: "server-unavailable",
        initialize: unavailable, getSnapshot: unavailable, listPatients: unavailable, getPatient: unavailable,
        createPatient: unavailable, updatePatient: unavailable, listExams: unavailable, getExam: unavailable,
        createExam: unavailable, updateExam: unavailable, listInterpretations: unavailable, listAuditEvents: unavailable,
        getEntityHistory: unavailable, resetDemoData: unavailable};
    }
  }

  window.AnthropometryDataService = {createApiAdapter, createConfiguredService, DataServiceError};
})();
