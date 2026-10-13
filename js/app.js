/* UI aplikasi antropometri. Semua operasi data melewati repository adapter. */
(() => {
  "use strict";
  const utils = window.Anthropometry;
  const Repository = window.AnthropometryRepository;
  const content = document.getElementById("app-content");
  const breadcrumb = document.getElementById("breadcrumb-current");
  const sidebar = document.getElementById("sidebar");
  const toast = document.getElementById("toast");
  const titles = {dashboard:"Dashboard",patients:"Daftar Pasien",profile:"Profil Pasien",patientNew:"Pasien Baru",exam:"Pemeriksaan Baru",results:"Detail Pemeriksaan",growth:"Kurva Pertumbuhan",history:"Riwayat Pemeriksaan",reports:"Ringkasan Laporan"};
  const esc = utils.escape;
  const themeStorageKey = "pediatricAnthropometry.theme.v1";
  const themeSelect = document.getElementById("theme-select");
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let themePreference = "system";
  try {
    const savedTheme = localStorage.getItem(themeStorageKey);
    if (["system", "light", "dark"].includes(savedTheme)) themePreference = savedTheme;
  } catch (_) { /* Penyimpanan lokal dapat dinonaktifkan browser. */ }
  function applyTheme() {
    const resolvedTheme = themePreference === "system" ? (systemTheme.matches ? "dark" : "light") : themePreference;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    if (themeSelect) themeSelect.value = themePreference;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = resolvedTheme === "dark" ? "#101b24" : "#0f766e";
  }
  applyTheme();
  themeSelect?.addEventListener("change", () => {
    themePreference = ["system", "light", "dark"].includes(themeSelect.value) ? themeSelect.value : "system";
    try { localStorage.setItem(themeStorageKey, themePreference); } catch (_) { /* Preferensi tetap berlaku sampai halaman ditutup. */ }
    applyTheme();
  });
  systemTheme.addEventListener?.("change", () => { if (themePreference === "system") applyTheme(); });
  if (!systemTheme.addEventListener) systemTheme.addListener?.(() => { if (themePreference === "system") applyTheme(); });
  const DataService = window.AnthropometryDataService;
  const integrationConfig = window.RMEIntegrationConfig;
  const supabaseConfig = window.SupabaseConfig;
  const SupabaseDataService = window.AnthropometrySupabase;
  // Jangan membuat/menulis seed demo sama sekali saat integrasi produksi diaktifkan.
  const unavailableProductionAdapter = () => {
    const fail = async () => { throw new Error("Layanan integrasi RME tidak termuat. Mode demo dinonaktifkan karena konfigurasi produksi aktif."); };
    return {adapterName:"rme-api-unavailable",mode:"production",isDemo:false,persistenceMode:"server-unavailable",
      initialize:fail,getSnapshot:fail,listPatients:fail,getPatient:fail,createPatient:fail,updatePatient:fail,
      listExams:fail,getExam:fail,createExam:fail,updateExam:fail,listInterpretations:fail,listAuditEvents:fail,getEntityHistory:fail,resetDemoData:fail};
  };
  const supabaseUnavailableAdapter = () => {
    const fail = async () => { throw new Error("Adapter Supabase tidak termuat. Mode demo dinonaktifkan karena konfigurasi Supabase aktif."); };
    return {adapterName:"supabase-unavailable",providerLabel:"Supabase",mode:"production",isDemo:false,persistenceMode:"server-unavailable",
      initialize:fail,getSnapshot:fail,listPatients:fail,getPatient:fail,createPatient:fail,updatePatient:fail,
      listExams:fail,getExam:fail,createExam:fail,updateExam:fail,listInterpretations:fail,listAuditEvents:fail,getEntityHistory:fail,signIn:fail,signOut:fail,resetDemoData:fail};
  };
  const repo = integrationConfig?.enabled === true
    ? (DataService ? DataService.createConfiguredService({config: integrationConfig}) : unavailableProductionAdapter())
    : supabaseConfig?.enabled === true
      ? (SupabaseDataService ? SupabaseDataService.createConfiguredService({config: supabaseConfig}) : supabaseUnavailableAdapter())
      : Repository.createDemoRepository();
  let serviceState = "loading", serviceError = "", serviceCode = "";
  let state = {patients:[],exams:[],interpretations:[],auditEvents:[]};
  let currentPage = "dashboard", selectedPatientId = "", searchTerm = "", historyFilterPatientId = "", currentExamId = "", currentGrowthIndex = "weight_for_age";
  let toastTimer;

  const patient = id => state.patients.find(p => p.id === id) || null;
  const exam = id => state.exams.find(e => e.id === id) || null;
  const examsFor = id => state.exams.filter(e => !id || e.patientId === id).sort((a,b)=>b.examDate.localeCompare(a.examDate)||b.createdAt.localeCompare(a.createdAt));
  const qualityClass = s => s === "valid" ? "status-ok" : s === "failed_validation" ? "status-alert" : "status-neutral";
  const interpretationClass = s => s === "valid" ? "status-ok" : s === "failed_validation" ? "status-alert" : "status-neutral";
  const status = (label, cls="status-neutral") => `<span class="status ${cls}">${esc(label)}</span>`;
  function notify(message) { toast.textContent=message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove("show"),3500); }
  const growthEngine = window.PediatricGrowthEngine;
  const growthChart = window.PediatricGrowthChart;
  const growthStatusLabel = result => ({valid:result.interpretationStatus==="clinical_review_required"?"Z-score valid; kategori perlu tinjauan klinis":"Dihitung dan tervalidasi",not_calculated:result.reason==="verified_reference_dataset_not_loaded"?"Belum dihitung — dataset resmi belum tersedia":result.reason==="edema_present_weight_based_index_withheld"?"Tidak dihitung — edema tercatat":result.reason==="edema_status_unknown_weight_based_index_withheld"?"Belum dihitung — status edema belum dikonfirmasi":"Belum dihitung",incomplete:"Data tidak lengkap",failed_validation:"Gagal validasi",out_of_reference_range:"Di luar rentang referensi",not_applicable:"Tidak berlaku untuk usia ini",clinical_review_required:"Perlu peninjauan klinis"})[result.validityStatus]||"Belum dihitung";
  function growthResultsMarkup(evaluation) {
    if(!evaluation || !evaluation.age?.valid) return `<div class="panel-body"><p class="muted">Pilih pasien dan tanggal pemeriksaan yang valid untuk menentukan cakupan indeks.</p></div>`;
    const bmi=evaluation.bmi?.status==="calculated"?`${evaluation.bmi.value.toFixed(2)} kg/m²`:(evaluation.bmi?.status==="incomplete"?"Belum tersedia":"Tidak valid");
    const rows=evaluation.results.map(r=>`<tr><td><strong>${esc(r.label)}</strong><div class="subtext">${esc(r.standardId)} · ${esc(r.referenceStandardVersion)}</div></td><td>${r.calculatedValue===null||r.calculatedValue===undefined?"—":`${Number(r.calculatedValue).toFixed(2)} ${esc(r.unit)}`}</td><td>${Number.isFinite(r.zScore)?r.zScore.toFixed(2):"—"}</td><td>${esc(r.category||"—")}</td><td>${esc(r.threshold||"—")}</td><td>${esc(growthStatusLabel(r))}<div class="subtext">${esc(r.reason||"")}</div></td></tr>`).join("");
    return `<div class="panel-body"><div class="profile-grid"><div class="detail-tile"><span>IMT terhitung</span><strong>${esc(bmi)}</strong><div class="subtext">Rumus BB (kg) / [TB (m)]². Hasil per indeks di bawah memperhitungkan usia dan rujukan WHO.</div></div><div class="detail-tile"><span>Mesin</span><strong>${esc(evaluation.algorithmVersion)}</strong><div class="subtext">Skema referensi ${esc(evaluation.referenceSchemaVersion)}</div></div><div class="detail-tile"><span>Status dataset</span><strong>${window.GrowthReferenceData.datasetCount()>0?"WHO LMS aktif":"Belum tersedia"}</strong><div class="subtext">${window.GrowthReferenceData.datasetCount()>0?"Versi, sumber, lisensi, dan hash tercatat di manifest.":"Dataset rujukan belum termuat."}</div></div></div><div class="note-banner mt-16"><div><strong>Z-score dan kategori adalah hasil skrining antropometri otomatis.</strong> Tinjau mutu pengukuran, kondisi klinis (termasuk edema), tren pertumbuhan, dan standar yang berlaku. Hasil prototipe ini bukan diagnosis atau pengganti keputusan tenaga kesehatan.</div></div><div class="table-wrap mt-16"><table><thead><tr><th>Indeks / standar</th><th>Nilai</th><th>Z-score</th><th>Kategori</th><th>Ambang</th><th>Status validitas</th></tr></thead><tbody>${rows}</tbody></table></div><p class="subtext mt-16">Standar rujukan: WHO Child Growth Standards 2006 dan WHO Growth Reference 2007. Kategori yang dikonfigurasi mengikuti Permenkes RI No. 2 Tahun 2020; indeks tanpa ambang nasional yang dikonfigurasi hanya menampilkan Z-score.</p></div>`;
  }
  function growthInterpretationMarkup(evaluation, indexType, examDate=null) {
    const indexResultType=indexType==="height_for_age"?(evaluation?.age?.ageMonths<60?"height_for_age_under5":"height_for_age_5_19"):
      indexType==="bmi_for_age"?(evaluation?.age?.ageMonths<60?"bmi_for_age_under5":"bmi_for_age_5_19"):indexType;
    const result=evaluation?.results?.find(item=>item.indexType===indexResultType);
    if(!result)return `<section class="growth-interpretation" aria-live="polite"><strong>Interpretasi singkat</strong><p>Belum ada hasil untuk indeks kurva ini.</p></section>`;
    const categoryDescriptions={
      "Berat badan sangat kurang":"Berat badan berada jauh di bawah rujukan untuk umur. Tinjau kembali pengukuran dan kondisi anak.",
      "Berat badan kurang":"Berat badan berada di bawah rentang rujukan untuk umur. Perhatikan hasil pemeriksaan dan tren pertumbuhan.",
      "Berat badan normal":"Berat badan berada dalam rentang kategori rujukan untuk umur pada indikator BB/U.",
      "Risiko berat badan lebih":"Berat badan berada di atas ambang kategori rujukan untuk umur; nilai bersama indikator lain.",
      "Sangat pendek":"Panjang/tinggi berada jauh di bawah rujukan untuk umur. Verifikasi umur dan teknik pengukuran.",
      "Pendek":"Panjang/tinggi berada di bawah rentang rujukan untuk umur. Tinjau hasil dan tren pertumbuhan.",
      "Dalam rentang rujukan":"Panjang/tinggi berada dalam rentang rujukan WHO untuk umur pada indikator ini.",
      "Tinggi; tinjau konteks klinis":"Panjang/tinggi berada di atas rentang rujukan; tinjau kembali umur, pengukuran, dan konteks klinis.",
      "Gizi buruk (severely wasted)":"Nilai berada jauh di bawah ambang rujukan untuk indikator ini. Tinjau segera sesuai alur klinis setempat.",
      "Gizi kurang (wasted)":"Nilai berada di bawah rentang rujukan untuk indikator ini. Tinjau bersama kondisi dan pengukuran lain.",
      "Gizi baik":"Nilai berada dalam rentang kategori rujukan untuk indikator ini.",
      "Berisiko gizi lebih":"Nilai berada pada rentang risiko di atas kategori rujukan; nilai bersama indikator lain.",
      "Gizi lebih":"Nilai berada di atas rentang kategori rujukan untuk indikator ini.",
      "Obesitas":"Nilai melampaui ambang kategori rujukan untuk indikator ini; hasil skrining perlu ditinjau klinisi.",
      "Gizi buruk (severely thinness)":"IMT/U berada jauh di bawah ambang rujukan. Tinjau pengukuran dan kondisi anak sesuai alur klinis.",
      "Gizi kurang (thinness)":"IMT/U berada di bawah rentang rujukan. Tinjau bersama kondisi dan pengukuran lain.",
      "Gizi lebih (overweight)":"IMT/U berada di atas rentang kategori rujukan; nilai bersama indikator lain."
    };
    let description;
    if(Number.isFinite(result.zScore)){
      if(result.category)description=categoryDescriptions[result.category]||`Hasil masuk kategori “${result.category}” pada indikator ini; kategori bukan diagnosis.`;
      else if(result.reason?.includes("Ambang kategori"))description=`Z-score tersedia, tetapi ${result.reason}`;
      else if(result.zScore < -2)description="Z-score berada di bawah −2 SD dari median rujukan WHO. Indeks ini belum memiliki kategori otomatis yang dikonfigurasi.";
      else if(result.zScore > 2)description="Z-score berada di atas +2 SD dari median rujukan WHO. Indeks ini belum memiliki kategori otomatis yang dikonfigurasi.";
      else description="Z-score berada antara −2 dan +2 SD dari median rujukan WHO. Indeks ini belum memiliki kategori otomatis yang dikonfigurasi.";
    }else if(result.reason==="edema_present_weight_based_index_withheld")description="Perhitungan indeks berbasis berat badan ditahan karena edema tercatat pada pemeriksaan ini.";
    else if(result.reason==="edema_status_unknown_weight_based_index_withheld")description="Konfirmasikan status edema pada pemeriksaan ini untuk menghitung indeks berbasis berat badan.";
    else if(result.validityStatus==="incomplete")description="Nilai belum dapat diinterpretasikan karena data yang dibutuhkan untuk indeks ini belum lengkap.";
    else if(result.validityStatus==="not_applicable")description="Indeks ini tidak dihitung karena usia berada di luar cakupan standar rujukannya.";
    else if(result.validityStatus==="out_of_reference_range")description="Nilai berada di luar rentang tabel rujukan WHO dan tidak diekstrapolasi.";
    else if(result.validityStatus==="failed_validation")description="Periksa kembali tanggal, jenis kelamin, posisi ukur, dan nilai yang dimasukkan.";
    else description="Z-score belum tersedia untuk pemeriksaan ini; periksa kelengkapan data dan status dataset rujukan.";
    const score=Number.isFinite(result.zScore)?`Z-score ${result.zScore>0?"+":""}${result.zScore.toFixed(2)} SD`:"Z-score belum tersedia";
    const category=result.category?`Kategori: ${result.category}.`:"Kategori otomatis tidak tersedia untuk indeks ini.";
    return `<section class="growth-interpretation" aria-live="polite"><div><strong>Interpretasi singkat · ${esc(result.label)}</strong>${examDate?`<span class="growth-interpretation-date">Pengukuran ${utils.formatDate(examDate)}</span>`:""}<p>${esc(description)}</p></div><span class="growth-interpretation-score">${esc(score)}${result.category?` · ${esc(result.category)}`:""}</span><small>Hasil skrining berdasarkan rujukan WHO; ${esc(category)} Tinjauan tenaga kesehatan tetap diperlukan.</small></section>`;
  }
  function liveGrowthChartMarkup(p, draft) {
    if(!p||!growthChart||!growthEngine)return `<div class="growth-empty">Pilih pasien untuk melihat kurva.</div>`;
    const history=examsFor(p.id).filter(e=>e.id!==currentExamId);
    const hasMeasurement=[draft.weightKg,draft.lengthHeightCm,draft.headCircumferenceCm,draft.midUpperArmCircumferenceCm].some(v=>v!==null&&v!==undefined&&v!=="");
    const exams=hasMeasurement?[...history,{...draft,id:"LIVE-EXAM-PREVIEW",patientId:p.id,dataValidationStatus:"valid",verificationStatus:"pending"}]:history;
    const options=growthChart.availableIndexes(p,exams,growthEngine);
    if(!options.length)return `<div class="growth-empty">Tidak ada indeks kurva yang sesuai dengan usia pada tanggal pemeriksaan.</div>`;
    const index=options.some(o=>o.value===currentGrowthIndex)?currentGrowthIndex:options[0].value;
    currentGrowthIndex=index;
    const model=growthChart.buildModel({patient:p,exams,indexType:index,engine:growthEngine,referenceData:window.GrowthReferenceData});
    const evaluation=growthEngine.evaluateExam(p,draft);
    return `<div class="growth-controls"><div class="field"><label for="exam-growth-index">Kurva indeks</label><select id="exam-growth-index">${options.map(o=>`<option value="${esc(o.value)}" ${o.value===index?"selected":""}>${esc(o.label)}</option>`).join("")}</select></div></div><div class="growth-reference-meta mt-16"><strong>${model.referenceAvailable?"Kurva WHO dan titik pemeriksaan":"Titik pengukuran pasien"}</strong><span>${model.referenceAvailable?esc(model.referenceSource):"Kurva rujukan tidak tersedia untuk indeks ini."}</span></div>${model.warnings.length?`<div class="note-banner mt-16"><div>${model.warnings.map(esc).join(" ")}</div></div>`:""}${growthChart.renderSvg(model)}${growthInterpretationMarkup(evaluation,index,draft.examDate)}<p class="subtext">Kurva dan titik mengikuti tanggal, indeks, posisi ukur, serta status edema yang sedang dipilih.</p>`;
  }
  async function refresh() {
    serviceState = "loading";
    try { state=await repo.getSnapshot(); serviceState="ready"; serviceError=""; serviceCode=""; }
    catch (error) { serviceState="error"; serviceError=error?.message||"Backend tidak dapat dimuat."; serviceCode=error?.code||""; throw error; }
  }
  const isProduction = () => repo.mode === "production";
  const backendLabel = () => repo.providerLabel || "backend";
  function demoNote(title, message) { return isProduction() && !repo.publicDemo ? "" : note(title, message); }
  function serviceBanner() {
    if (serviceState === "loading") return `<div class="note-banner" role="status"><strong>Memuat data…</strong> Mengambil profil dan riwayat melalui adapter data.</div>`;
    if (serviceState === "error" && repo.providerLabel === "Supabase" && repo.adapterName === "supabase-postgrest" && repo.authRequired) return `<div class="supabase-auth-panel" role="alert"><div><strong>${serviceCode==="UNAUTHENTICATED"?"Masuk ke Supabase":"Data Supabase belum berhasil dimuat"}</strong><p>${esc(serviceError||"Masuk memakai akun yang telah diundang administrator Supabase.")}</p></div><form id="supabase-login" class="supabase-login-form"><label class="field"><span>Email</span><input type="email" name="email" autocomplete="username" required></label><label class="field"><span>Kata sandi</span><input type="password" name="password" autocomplete="current-password" required></label><button class="button button-primary" type="submit">Masuk</button></form></div>`;
    if (serviceState === "error") return `<div class="note-banner" role="alert"><strong>Data belum berhasil dimuat.</strong> ${esc(serviceError)} Tidak ada operasi simpan yang dinyatakan berhasil. <button class="button button-secondary" data-action="retryData">Coba muat ulang</button></div>`;
    if (repo.mode === "production" && repo.providerLabel === "Supabase" && repo.publicDemo) return `<div class="note-banner supabase-connected"><div><strong>Demo publik Supabase aktif.</strong> Tanpa login; data sintetis di organisasi demo ini dapat dilihat dan dikoreksi pengunjung.</div></div>`;
    if (repo.mode === "production" && repo.providerLabel === "Supabase") return `<div class="note-banner supabase-connected"><div><strong>Supabase terhubung.</strong> Data yang terlihat dibatasi oleh kebijakan organisasi dan RLS.</div><button class="button button-secondary" data-action="supabaseSignOut">Keluar</button></div>`;
    if (repo.mode === "production") return `<div class="note-banner"><strong>Integrasi ${esc(backendLabel())} aktif.</strong> Data berasal dari backend yang dikonfigurasi. Autentikasi, otorisasi, validasi server, dan audit produksi wajib ditegakkan backend.</div>`;
    return repo.persistenceMode === "memory-only"
      ? `<div class="note-banner"><strong>MODE DEMO — PENYIMPANAN MEMORI SEMENTARA.</strong> Data sintetis hanya ada selama halaman ini hidup; data tidak tersimpan permanen dan dapat hilang saat dimuat ulang.</div>`
      : `<div class="note-banner"><strong>MODE DEMO — DATA SIMULASI.</strong> Perubahan disimpan di localStorage browser ini saja, bukan ke RME/server, dan tidak cocok untuk data pasien nyata.</div>`;
  }
  function successPersistenceMessage(action) {
    if (repo.providerLabel === "Supabase") return `${action} tersimpan di Supabase.`;
    if (repo.mode === "production") return `${action} dikonfirmasi ${backendLabel()}.`;
    return repo.persistenceMode === "memory-only" ? `${action} hanya tersimpan sementara di memori demo; tidak permanen.` : `${action} tersimpan di localStorage demo browser ini; belum dikirim ke RME.`;
  }
  function setPage(page) {
    currentPage=page; breadcrumb.textContent=titles[page]||"Dashboard";
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page||(page==="profile"&&b.dataset.page==="patients")||(["results","growth"].includes(page)&&b.dataset.page==="history")||page==="patientNew"&&b.dataset.page==="patients"));
    sidebar.classList.remove("open"); render(); if(page==="exam")updateExamAgeAndSummary(); content.focus({preventScroll:true}); window.scrollTo({top:0,behavior:"smooth"});
  }
  function heading(title, subtitle, button="") { return `<div class="page-heading"><div><p class="eyebrow">Pemantauan pertumbuhan anak</p><h1>${title}</h1><p>${subtitle}</p></div>${button}</div>`; }
  function panel(title, subtitle, body, action="") { return `<section class="panel"><div class="panel-header"><div><h2 class="panel-title">${title}</h2>${subtitle?`<p class="panel-subtitle">${subtitle}</p>`:""}</div>${action}</div>${body}</section>`; }
  function note(title, message) { return `<div class="note-banner"><span aria-hidden="true">ⓘ</span><div><strong>${title}</strong>${message}</div></div>`; }
  function patientCell(p) { return `<div class="patient-name">${esc(p.name)}</div><div class="subtext">${esc(p.medicalRecordNumber)} · ${esc(utils.sexLabel(p.sexAtBirth))}</div>`; }
  function emptyRow(cols, title, msg) { return `<tr><td colspan="${cols}"><div class="empty-state"><strong>${title}</strong><p>${msg}</p></div></td></tr>`; }
  function examRows(rows, cols=5) {
    if (!rows.length) return emptyRow(cols,"Belum ada pemeriksaan","Catatan akan muncul setelah pengukuran disimpan.");
    return rows.map(e=>{const p=patient(e.patientId);return `<tr><td>${utils.formatDate(e.examDate)}</td><td>${p?patientCell(p):status("Relasi pasien tidak valid","status-alert")}</td><td>${e.weightKg??"—"} kg / ${e.lengthHeightCm??"—"} cm</td><td>${status(utils.qualityLabel(e.dataValidationStatus),qualityClass(e.dataValidationStatus))}</td><td><button class="button button-quiet" data-action="profile" data-id="${esc(e.patientId)}">Buka pasien →</button></td></tr>`;}).join("");
  }
  const combinedIndexes = {
    under5:["weight_for_age","height_for_age_under5","weight_for_length_height","muac_for_age","head_circumference_for_age","bmi_for_age_under5"],
    school:["bmi_for_age_5_19"]
  };
  const combinedIndexLabels = {
    weight_for_age:"BB/U",height_for_age_under5:"TB/U",weight_for_length_height:"BB/TB",
    muac_for_age:"LiLA/U",head_circumference_for_age:"LK/U",bmi_for_age_under5:"IMT/U",bmi_for_age_5_19:"IMT/U"
  };
  const combinedCategories = {
    weight_for_age:[["Berat badan sangat kurang","Z < −3 SD",z=>z < -3],["Berat badan kurang","−3 ≤ Z < −2 SD",z=>z >= -3&&z < -2],["Normal","−2 ≤ Z ≤ +1 SD",z=>z >= -2&&z <= 1],["Risiko berat badan lebih","Z > +1 SD",z=>z > 1]],
    height_for_age_under5:[["Sangat pendek","Z < −3 SD",z=>z < -3],["Pendek","−3 ≤ Z < −2 SD",z=>z >= -3&&z < -2],["Normal","−2 ≤ Z ≤ +3 SD",z=>z >= -2&&z <= 3],["Tinggi","Z > +3 SD",z=>z > 3]],
    weight_for_length_height:[["Gizi buruk","Z < −3 SD",z=>z < -3],["Gizi kurang","−3 ≤ Z < −2 SD",z=>z >= -3&&z < -2],["Gizi baik","−2 ≤ Z ≤ +1 SD",z=>z >= -2&&z <= 1],["Berisiko gizi lebih","+1 < Z ≤ +2 SD",z=>z > 1&&z <= 2],["Gizi lebih","+2 < Z ≤ +3 SD",z=>z > 2&&z <= 3],["Obesitas","Z > +3 SD",z=>z > 3]],
    bmi_for_age_under5:[["Gizi buruk","Z < −3 SD",z=>z < -3],["Gizi kurang","−3 ≤ Z < −2 SD",z=>z >= -3&&z < -2],["Gizi baik","−2 ≤ Z ≤ +1 SD",z=>z >= -2&&z <= 1],["Berisiko gizi lebih","+1 < Z ≤ +2 SD",z=>z > 1&&z <= 2],["Gizi lebih","+2 < Z ≤ +3 SD",z=>z > 2&&z <= 3],["Obesitas","Z > +3 SD",z=>z > 3]],
    bmi_for_age_5_19:[["Gizi buruk (sangat kurus)","Z < −3 SD",z=>z < -3],["Gizi kurang (kurus)","−3 ≤ Z < −2 SD",z=>z >= -3&&z < -2],["Gizi baik (normal)","−2 ≤ Z ≤ +1 SD",z=>z >= -2&&z <= 1],["Gizi lebih (overweight)","+1 < Z ≤ +2 SD",z=>z > 1&&z <= 2],["Obesitas","Z > +2 SD",z=>z > 2]]
  };
  const descriptiveIndexes = new Set(["muac_for_age","head_circumference_for_age"]);
  const descriptiveZBands = [["Sangat rendah (deskriptif)","Z < −3 SD",z=>z < -3],["Rendah (deskriptif)","−3 ≤ Z < −2 SD",z=>z >= -3&&z < -2],["Rentang tengah (deskriptif)","−2 ≤ Z ≤ +2 SD",z=>z >= -2&&z <= 2],["Tinggi (deskriptif)","Z > +2 SD",z=>z > 2]];
  const normalCombinedCategories = new Set(["Normal","Gizi baik","Gizi baik (normal)"]);
  const formatReportPercent = value => new Intl.NumberFormat("id-ID",{minimumFractionDigits:1,maximumFractionDigits:1}).format(value);
  function latestPatientEvaluations() {
    if(!growthEngine)return [];
    return state.patients.flatMap(p=>{
      const latest=examsFor(p.id)[0];
      if(!latest)return [];
      const evaluation=growthEngine.evaluateExam(p,latest);
      if(!evaluation.age?.valid)return [];
      const ageMonths=evaluation.age.ageMonths;
      const rejected=latest.dataValidationStatus==="failed_validation"||latest.verificationStatus==="failed_validation";
      const usableEvaluation=rejected?{...evaluation,results:evaluation.results.map(result=>({...result,zScore:null,category:null,validityStatus:"failed_validation",reason:"measurement_failed_validation"}))}:evaluation;
      return [{patient:p,exam:latest,evaluation:usableEvaluation,ageMonths,group:ageMonths<60?"under5":ageMonths<228?"school":"outOfRange"}];
    });
  }
  function combinedCategorySummary(cohort,indexTypes,tableGroup) {
    if(!cohort.length)return `<div class="empty-state compact-empty"><strong>Belum ada pasien dalam kelompok usia ini</strong><p>Tabel ringkasan akan terisi setelah ada pemeriksaan terbaru.</p></div>`;
    return `<div class="summary-index-list">${indexTypes.map((indexType,indexOffset)=>{
      const measured=cohort.map(item=>item.evaluation.results.find(result=>result.indexType===indexType)).filter(result=>result?.validityStatus==="valid"&&Number.isFinite(result.zScore));
      const eligible=cohort.filter(item=>indexType!=="muac_for_age"||(item.ageMonths>=3&&item.ageMonths<60));
      const categories=descriptiveIndexes.has(indexType)?descriptiveZBands:combinedCategories[indexType];
      const rows=categories.map(([category,threshold,predicate])=>{
        const count=measured.filter(result=>predicate(result.zScore)).length;
        return `<tr><td>${esc(category)}</td><td>${esc(threshold)}</td><td>${count}</td><td>${measured.length?`${formatReportPercent(count/measured.length*100)}%`:"—"}</td></tr>`;
      });
      const label=combinedIndexLabels[indexType]||window.GrowthReferenceData?.indexDefinitions?.[indexType]?.label||indexType;
      const eligibleNote=indexType==="muac_for_age"?` ${cohort.length-eligible.length} pasien tidak masuk cakupan usia LiLA/U (3–<60 bulan).`:"";
      const noteText=descriptiveIndexes.has(indexType)?"Pita Z-score bersifat deskriptif dan bukan kategori klinis/status gizi nasional.":`${eligible.length-measured.length} dari ${eligible.length} pasien dalam cakupan usia tidak memiliki Z-score valid untuk indeks ini.`;
      const tableNumber=`${tableGroup}.${indexOffset+1}`;
      return `<section class="summary-index"><div class="summary-index-heading"><h4>Tabel ${tableNumber} — ${esc(label)} (n = ${measured.length})</h4><span>${measured.length} hasil valid · ${eligible.length} memenuhi cakupan${indexType==="muac_for_age"?" · LiLA mulai usia 3 bulan":""}</span></div><div class="table-wrap"><table class="category-table"><thead><tr><th>Interpretasi</th><th>Ambang Z-score</th><th>n</th><th>%</th></tr></thead><tbody>${rows.join("")}<tr class="category-total"><th>Total hasil valid</th><td>—</td><th>${measured.length}</th><th>${measured.length?"100,0%":"—"}</th></tr></tbody></table></div><p class="summary-table-note">${noteText}${eligibleNote}</p></section>`;
    }).join("")}</div>`;
  }
  function combinedInterpretationBullets(cohorts) {
    const bullets=[];
    for(const [groupName,cohort,indexTypes] of cohorts){
      const normalLeaders=[];
      const findings=[];
      for(const indexType of indexTypes){
        if(descriptiveIndexes.has(indexType))continue;
        const valid=cohort.flatMap(item=>item.evaluation.results).filter(result=>result.indexType===indexType&&result.validityStatus==="valid"&&Number.isFinite(result.zScore));
        if(!valid.length)continue;
        const counts=(combinedCategories[indexType]||[]).map(([name,,predicate])=>({name,count:valid.filter(result=>predicate(result.zScore)).length}));
        const highest=Math.max(...counts.map(item=>item.count));
        if(highest>0&&counts.some(item=>normalCombinedCategories.has(item.name)&&item.count===highest))normalLeaders.push(combinedIndexLabels[indexType]);
        const normalCount=counts.filter(item=>normalCombinedCategories.has(item.name)).reduce((sum,item)=>sum+item.count,0);
        const other=valid.length-normalCount;
        if(other)findings.push(`${combinedIndexLabels[indexType]} ${other}/${valid.length}`);
      }
      if(normalLeaders.length)bullets.push(`<li><strong>${esc(groupName)}:</strong> kategori normal/gizi baik paling banyak pada ${normalLeaders.join(", ")}.</li>`);
      if(findings.length)bullets.push(`<li><strong>${esc(groupName)}:</strong> terdapat hasil selain normal pada ${findings.join("; ")}; tinjau catatan pasien dan tren ukurannya.</li>`);
    }
    if(!bullets.length)bullets.push("<li>Belum ada Z-score valid yang dapat diringkas.</li>");
    return `<ul class="interpretation-bullets">${bullets.join("")}</ul><p class="subtext">Proporsi menggambarkan catatan yang tersedia, bukan prevalensi populasi atau diagnosis. Temuan perlu ditinjau per pasien.</p>`;
  }
  function combinedAnthropometryMarkup() {
    if(serviceState!=="ready") return panel("Ringkasan antropometri gabungan","Ringkasan menurut kelompok umur dan indeks.",`<div class="panel-body"><div class="empty-state"><strong>Data belum siap diringkas</strong><p>Ringkasan akan muncul setelah data pasien dan pemeriksaan berhasil dimuat.</p></div></div>`);
    const evaluated=latestPatientEvaluations();
    const under5=evaluated.filter(item=>item.group==="under5");
    const school=evaluated.filter(item=>item.group==="school");
    const outOfRange=evaluated.filter(item=>item.group==="outOfRange");
    const withoutExam=state.patients.filter(p=>!examsFor(p.id).length).length;
    const withExam=state.patients.length-withoutExam;
    const unaged=state.patients.filter(p=>examsFor(p.id).length&&!evaluated.some(item=>item.patient.id===p.id)).length;
    const summaries=`<details class="report-accordion"><summary><span>Kelompok anak usia &lt;5 tahun (&lt;60 bulan)</span><small>${under5.length} pasien · 6 indeks</small></summary><div class="accordion-content"><p class="subtext">BB/U, TB/U, BB/TB, LiLA/U (mulai usia 3 bulan), LK/U, dan IMT/U. LiLA/U dan LK/U disajikan sebagai pita Z-score deskriptif, bukan kategori status gizi nasional.</p>${combinedCategorySummary(under5,combinedIndexes.under5,1)}</div></details>
      <details class="report-accordion"><summary><span>Kelompok anak usia ≥5 tahun (5–18 tahun)</span><small>${school.length} pasien · IMT/U</small></summary><div class="accordion-content"><p class="subtext">IMT/U menjadi indeks klasifikasi status gizi untuk kelompok usia ini. Tabel memakai Z-score valid dari pemeriksaan terbaru tiap pasien.</p>${combinedCategorySummary(school,combinedIndexes.school,2)}</div></details>`;
    const overall=`<div class="panel-body"><div class="stats-grid combined-population-stats"><div class="stat-card"><div class="stat-top">Semua profil</div><div class="stat-value">${state.patients.length}</div></div><div class="stat-card"><div class="stat-top">Dengan pemeriksaan</div><div class="stat-value">${withExam}</div></div><div class="stat-card"><div class="stat-top">Usia &lt;5 tahun</div><div class="stat-value">${under5.length}</div></div><div class="stat-card"><div class="stat-top">Usia 5–&lt;19 tahun</div><div class="stat-value">${school.length}</div></div></div>
      <p class="subtext report-cohort-note">Satu pemeriksaan terbaru per pasien. ${withoutExam} pasien belum diperiksa; ${unaged} belum dapat dikelompokkan karena tanggal tidak valid; ${outOfRange.length} berada di luar cakupan usia. Persentase memakai jumlah Z-score valid sebagai penyebut; hasil yang tidak valid tidak masuk persentase. Kategori risiko BB/U adalah penanda untuk pemantauan individual.</p>
      ${summaries}
      <section class="overall-interpretation"><h3>Interpretasi singkat keseluruhan</h3>${combinedInterpretationBullets([["<5 tahun",under5,combinedIndexes.under5],["5–<19 tahun",school,combinedIndexes.school]])}</section>
      <p class="subtext combined-sources">Acuan: <a href="https://jdih.kemkes.go.id/storage/documents/pdfs/2020permenkes002.pdf" target="_blank" rel="noreferrer">Permenkes RI No. 2 Tahun 2020</a>, <a href="https://www.who.int/tools/child-growth-standards/standards/arm-circumference-for-age" target="_blank" rel="noreferrer">standar LiLA/U WHO</a>, <a href="https://www.who.int/tools/child-growth-standards/standards/head-circumference-for-age" target="_blank" rel="noreferrer">standar LK/U WHO</a>, dan <a href="https://www.who.int/tools/growth-reference-data-for-5to19-years/indicators/bmi-for-age" target="_blank" rel="noreferrer">standar IMT/U WHO usia 5–19 tahun</a>.</p></div>`;
    return panel("Ringkasan antropometri gabungan","Klik kelompok usia untuk melihat tabel kategori dan interpretasi singkat dari pemeriksaan terbaru setiap pasien.",overall);
  }
  function dashboard() {
    const recent=examsFor(null).slice(0,5);
    return `${heading("Dashboard pemantauan antropometri",isProduction()?`Kelola profil dan telusuri pengukuran longitudinal dari ${esc(backendLabel())}.`:"Kelola profil pasien demo dan telusuri pengukuran longitudinal.",`<button class="button button-primary" data-action="patientNew">＋ Pasien baru</button>`)}
      ${demoNote("MODE DEMONSTRASI — DATA SIMULASI","Semua pasien dan pemeriksaan di aplikasi ini sintetis, terpisah dari data pasien nyata, dan belum terhubung ke RME.")}
      <div class="stats-grid"><div class="stat-card"><div class="stat-top">${isProduction()?"Profil pasien":"Profil pasien demo"}</div><div class="stat-value">${state.patients.length}</div><div class="stat-foot">ID pasien unik</div></div><div class="stat-card"><div class="stat-top">Catatan pemeriksaan</div><div class="stat-value">${state.exams.length}</div><div class="stat-foot">Riwayat tersimpan terpisah</div></div><div class="stat-card"><div class="stat-top">Data belum lengkap</div><div class="stat-value">${state.exams.filter(e=>e.dataValidationStatus==="incomplete").length}</div><div class="stat-foot">Perlu dilengkapi atau diverifikasi</div></div><div class="stat-card"><div class="stat-top">Snapshot antropometri valid</div><div class="stat-value">${state.exams.filter(e=>e.anthropometryCalculation?.results?.some(r=>r.validityStatus==="valid")).length}</div><div class="stat-foot">Perhitungan layar memakai WHO LMS aktif</div></div></div>
      <div class="dashboard-grid"><div>${panel("Pemeriksaan terbaru","Urut berdasarkan tanggal pemeriksaan",`<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Pasien</th><th>Berat / panjang-tinggi</th><th>Kelengkapan</th><th></th></tr></thead><tbody>${examRows(recent)}</tbody></table></div>`,`<button class="button button-secondary" data-action="history">Lihat riwayat</button>`)}${panel("Akses cepat","",`<div class="panel-body"><div class="quick-grid"><button class="quick-action" data-action="patients"><div class="quick-icon">♙</div><strong>Daftar pasien</strong><span>Cari dan buka profil</span></button><button class="quick-action" data-action="exam"><div class="quick-icon">＋</div><strong>Pemeriksaan baru</strong><span>Tambah catatan tanpa menimpa riwayat</span></button></div></div>`)}</div><div>${panel("Keamanan interpretasi","Status penghitungan antropometri",`<div class="panel-body"><p class="muted">${state.exams.length} pemeriksaan tersimpan. Tampilan pemeriksaan dan profil menghitung ulang Z-score dari WHO LMS untuk indeks yang memenuhi cakupan. Hasil perlu ditinjau bersama mutu ukur dan keadaan klinis; grafik rujukan hanya muncul jika tabel yang sesuai tersedia.</p></div>`)}${panel(isProduction()?`Penyimpanan ${esc(backendLabel())}`:"Penyimpanan demo","Adapter data aktif",`<div class="panel-body"><p class="muted">${esc(repo.adapterName)}. ${isProduction()?`Perubahan dikirim ke ${esc(backendLabel())}; akses dan audit dikelola oleh backend.`:"Perubahan disimpan di localStorage demo browser ini, dengan jejak audit lokal untuk pembuatan dan koreksi. Ini bukan penyimpanan klinis."}</p><button class="button button-secondary" data-action="audit">Lihat jejak perubahan</button></div>`)}</div></div>`;
  }
  function patientsPage() {
    const list=state.patients.filter(p=>[p.name,p.medicalRecordNumber,p.id].some(v=>String(v||"").toLowerCase().includes(searchTerm.toLowerCase())));
    return `${heading("Daftar pasien anak","Pilih pasien untuk melihat profil dan riwayat pemeriksaannya.",`<button class="button button-primary" data-action="patientNew">＋ Pasien baru</button>`)}${demoNote("Data simulasi","Pencarian hanya mencakup profil demo; nomor rekam medis harus unik dalam ruang data ini.")}${panel("Pasien terdaftar",`${list.length} profil`, `<div class="panel-body"><div class="filter-row"><div class="search-wrap"><span class="search-symbol">⌕</span><input class="search-input" id="patient-search" type="search" placeholder="Cari nama, ID, atau nomor RM…" value="${esc(searchTerm)}" aria-label="Cari pasien"></div></div></div><div class="table-wrap"><table><thead><tr><th>Pasien</th><th>Tanggal lahir</th><th>Usia saat ini</th><th>Jumlah pemeriksaan</th><th></th></tr></thead><tbody>${list.map(p=>`<tr><td>${patientCell(p)}<div class="subtext">ID: ${esc(p.id)}</div></td><td>${utils.formatDate(p.birthDate)}</td><td>${utils.ageAt(p.birthDate,utils.localToday())}</td><td>${examsFor(p.id).length}</td><td><button class="button button-secondary" data-action="profile" data-id="${esc(p.id)}">Lihat profil</button></td></tr>`).join("")||emptyRow(5,"Pasien tidak ditemukan","Coba kata kunci lain atau buat profil baru.")}</tbody></table></div>`)}`;
  }
  function patientNewPage() {
    const editing = patient(selectedPatientId);
    return `${heading(editing?"Koreksi profil pasien":"Tambah profil pasien",editing?"Perbarui profil yang sama; koreksi dicatat pada jejak audit.":repo.publicDemo?"Buat profil sintetis di ruang demo publik Supabase.":isProduction()?`Buat profil melalui layanan ${esc(backendLabel())} yang telah dikonfigurasi.`:"Buat identitas simulasi dengan ID internal yang dibuat otomatis.")}${demoNote("Ruang data demo","Gunakan data sintetis saja. Pengunjung demo publik dapat melihat dan mengoreksi profil yang dibuat.")}
      <form id="patient-form" class="panel" data-edit-id="${esc(editing?.id||"")}">${editing?.version?`<input type="hidden" name="version" value="${esc(editing.version)}">`:""}<div class="form-section"><h2 class="section-heading">Identitas pasien</h2><p class="section-help">Kolom bertanda * wajib diisi.</p><div class="form-grid">
      <div class="field"><label for="patient-name">Nama pasien *</label><input id="patient-name" name="name" maxlength="120" value="${esc(editing?.name||"")}" required></div>
      <div class="field"><label for="patient-rm">${isProduction()?"Nomor rekam medis":"Nomor rekam medis demo"} *</label><input id="patient-rm" name="medicalRecordNumber" maxlength="64" value="${esc(editing?.medicalRecordNumber||"")}" required></div>
      <div class="field"><label for="patient-dob">Tanggal lahir *</label><input id="patient-dob" name="birthDate" type="date" max="${utils.localToday()}" value="${esc(editing?.birthDate||"")}" required></div>
      <div class="field"><label for="patient-sex">Jenis kelamin untuk standar pertumbuhan *</label><select id="patient-sex" name="sexAtBirth" required><option value="">Pilih…</option><option value="female" ${editing?.sexAtBirth==="female"?"selected":""}>Perempuan</option><option value="male" ${editing?.sexAtBirth==="male"?"selected":""}>Laki-laki</option></select></div>
      <div class="field"><label for="ga-weeks">Usia gestasi saat lahir (minggu)</label><input id="ga-weeks" name="gestationWeeks" type="number" min="20" max="45" step="1" value="${esc(editing?.gestationalAgeAtBirth?.weeks??"")}" placeholder="Opsional"></div>
      <div class="field"><label for="ga-days">Tambahan hari gestasi</label><input id="ga-days" name="gestationDays" type="number" min="0" max="6" step="1" value="${esc(editing?.gestationalAgeAtBirth?.days??0)}"></div>
      <div class="field"><label for="patient-guardian">Nama wali (opsional)</label><input id="patient-guardian" name="guardianName" maxlength="120" value="${esc(editing?.guardianName||"")}"></div>
      <div class="field" style="grid-column:1/-1"><label for="patient-notes">Informasi klinis tambahan yang relevan (opsional)</label><textarea id="patient-notes" name="clinicalNotes" maxlength="1000" placeholder="${repo.publicDemo?"Catatan sintetis untuk demo saja.":isProduction()?`Catatan sesuai kebijakan ${backendLabel()}.`:"Hanya catatan sintetis untuk pengujian. Hindari data identitas nyata."}">${esc(editing?.clinicalNotes||"")}</textarea></div>
      </div></div><div class="form-actions"><button class="button button-secondary" type="button" data-action="${editing?"profile":"patients"}" data-id="${esc(editing?.id||"")}">Batal</button><button class="button button-primary" type="submit">${editing?"Simpan koreksi profil":isProduction()?"Simpan profil":"Simpan profil demo"}</button></div></form>`;
  }
  function profilePage() {
    const p=patient(selectedPatientId);
    if(!p) return `${heading("Profil pasien","ID pasien tidak ditemukan pada ruang data aktif.")}${note("Tidak ditemukan","Pilih pasien dari daftar. Tidak ada profil yang dibuat otomatis untuk ID yang tidak dikenal.")}<button class="button button-secondary" data-action="patients">Kembali ke daftar</button>`;
    const rows=examsFor(p.id), audits=state.auditEvents.filter(a=>a.entityType==="patient"&&a.entityId===p.id).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
    const growthOptions=growthChart&&growthEngine?growthChart.availableIndexes(p,rows,growthEngine):[];
    if(growthOptions.length&&!growthOptions.some(o=>o.value===currentGrowthIndex))currentGrowthIndex=growthOptions[0].value;
    const growthModel=growthChart&&growthEngine?growthChart.buildModel({patient:p,exams:rows,indexType:currentGrowthIndex,engine:growthEngine,referenceData:window.GrowthReferenceData}):null;
    const latest=rows[0];
    const latestEvaluation=latest&&growthEngine?growthEngine.evaluateExam(p,latest):null;
    const selectedPoint=growthModel?.points?.[growthModel.points.length-1];
    const selectedExam=selectedPoint?rows.find(item=>item.id===selectedPoint.examId):null;
    const selectedGrowthEvaluation=selectedExam&&growthEngine?growthEngine.evaluateExam(p,selectedExam):latestEvaluation;
    const growthOptionsMarkup=growthOptions.map(o=>`<option value="${esc(o.value)}" ${o.value===currentGrowthIndex?"selected":""}>${esc(o.label)}</option>`).join("");
    const profileGrowthPanel=panel("Kurva hasil pengukuran",`${rows.length} pemeriksaan · grafik mengikuti indeks yang dipilih`,
      `<div class="panel-body"><div class="growth-controls"><div class="field"><label for="profile-growth-index">Indeks antropometri</label><select id="profile-growth-index" ${growthOptions.length?"":"disabled"}>${growthOptionsMarkup||`<option value="">Belum ada data pemeriksaan</option>`}</select></div></div><div class="growth-reference-meta mt-16"><strong>${growthModel?.referenceAvailable?"Kurva rujukan tervalidasi tersedia":"Titik pengukuran pasien"}</strong><span>${growthModel?.referenceAvailable?esc(growthModel.referenceSource):"Garis hanya menghubungkan hasil ukur; kurva WHO/Z-score belum tersedia."}</span></div>${growthModel?.warnings?.length?`<div class="note-banner mt-16"><div>${growthModel.warnings.map(esc).join(" ")}</div></div>`:""}${growthChart?growthChart.renderSvg(growthModel):`<div class="growth-empty">Modul grafik belum tersedia.</div>`}${growthInterpretationMarkup(selectedGrowthEvaluation,currentGrowthIndex,selectedExam?.examDate||latest?.examDate)}<p class="subtext">Sumbu X: usia saat pemeriksaan. Sumbu Y: ${esc(growthModel?.label||"nilai indeks")} (${esc(growthModel?.unit||"satuan")}). Grafik menampilkan nilai pengukuran tersimpan.</p></div>`);
    return `${heading("Profil pasien","Identitas, riwayat pemeriksaan, dan jejak perubahan.",`<button class="button button-secondary" data-action="growth" data-id="${esc(p.id)}">Kurva longitudinal</button> <button class="button button-secondary" data-action="editPatient" data-id="${esc(p.id)}">Koreksi profil</button> <button class="button button-primary" data-action="exam" data-id="${esc(p.id)}">＋ Catat pemeriksaan</button>`)}${demoNote("Profil simulasi","Data profil dan pemeriksaan adalah sintetis. Identitas pencatat tidak tersedia karena autentikasi belum diimplementasikan.")}
      <section class="panel"><div class="panel-body"><div class="profile-header"><div class="profile-avatar">${esc(p.name.split(/\s+/).map(x=>x[0]).slice(0,2).join(""))}</div><div class="profile-meta"><h2>${esc(p.name)}</h2><p>${esc(p.medicalRecordNumber)} · ${esc(utils.sexLabel(p.sexAtBirth))} · ${utils.ageAt(p.birthDate,utils.localToday())}</p>${isProduction()?status(repo.publicDemo?"Data demo publik":"Data tersimpan di backend"):status("Identitas simulasi") }<div class="subtext">ID pasien: ${esc(p.id)}</div></div></div><div class="profile-grid"><div class="detail-tile"><span>Tanggal lahir</span><strong>${utils.formatDate(p.birthDate)}</strong></div><div class="detail-tile"><span>Nomor RM</span><strong>${esc(p.medicalRecordNumber)}</strong></div><div class="detail-tile"><span>Usia gestasi saat lahir</span><strong>${p.gestationalAgeAtBirth?`${p.gestationalAgeAtBirth.weeks} minggu ${p.gestationalAgeAtBirth.days} hari`:"Tidak dicatat"}</strong></div><div class="detail-tile"><span>Jumlah pemeriksaan</span><strong>${rows.length}</strong></div></div><div class="mt-16"><strong>Catatan tambahan</strong><p class="muted">${esc(p.clinicalNotes||"Tidak ada catatan tambahan.")}</p></div><p class="subtext">Dibuat ${utils.formatDateTime(p.createdAt)} · Diubah ${utils.formatDateTime(p.updatedAt)}</p></div></section>
      ${profileGrowthPanel}
      ${panel("Interpretasi pemeriksaan terbaru",latest?`Pemeriksaan ${utils.formatDate(latest.examDate)} · hasil mesin dan cakupan indeks`:"Belum ada hasil untuk ditampilkan",latestEvaluation?growthResultsMarkup(latestEvaluation):`<div class="panel-body"><p class="muted">Simpan pemeriksaan antropometri untuk melihat nilai yang dapat dihitung dan status interpretasinya.</p></div>`)}
      ${panel("Riwayat pemeriksaan",`${rows.length} catatan; setiap pengukuran memiliki ID dan tanggal tersendiri`,`<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Berat</th><th>Panjang/tinggi</th><th>LK / LILA</th><th>Kelengkapan</th><th>Interpretasi</th><th></th></tr></thead><tbody>${rows.map(e=>`<tr><td>${utils.formatDate(e.examDate)}<div class="subtext">ID: ${esc(e.id)}</div></td><td>${e.weightKg??"—"} kg</td><td>${e.lengthHeightCm??"—"} cm<div class="subtext">${esc(utils.measurementTypeLabel(e.measurementType))}</div></td><td>${e.headCircumferenceCm??"—"} / ${e.midUpperArmCircumferenceCm??"—"} cm</td><td>${status(utils.qualityLabel(e.dataValidationStatus),qualityClass(e.dataValidationStatus))}</td><td>${status(utils.interpretationLabel(e.interpretationStatus),interpretationClass(e.interpretationStatus))}</td><td><button class="button button-quiet" data-action="examDetail" data-id="${esc(e.id)}">Detail / koreksi</button></td></tr>`).join("")||emptyRow(7,"Belum ada pemeriksaan","Gunakan tombol Catat pemeriksaan untuk menambah catatan pertama.")}</tbody></table></div>`,`<button class="button button-secondary" data-action="history" data-id="${esc(p.id)}">Riwayat lengkap</button>`)}
      ${panel("Jejak perubahan profil",`${audits.length} peristiwa audit`,`<div class="panel-body">${audits.map(a=>`<div class="review-item"><strong>${esc(a.action)}</strong><p>${utils.formatDateTime(a.occurredAt)} · Kolom: ${esc(a.changedFields.join(", ")||"—")}</p></div>`).join("")||`<p class="muted">Belum ada koreksi tercatat.</p>`}</div>`)}`;
  }
  function examPage() {
    const editing=exam(currentExamId), formExam=editing||null;
    if(editing&&!patient(editing.patientId)) return `${heading("Pemeriksaan","Relasi pasien untuk pemeriksaan ini tidak valid.")}${note("Pemeriksaan tidak dapat dibuka","ID pasien terkait tidak ditemukan.")}<button class="button button-secondary" data-action="history">Kembali</button>`;
    const assigned=patient(formExam?.patientId||selectedPatientId||"");
    const examDate=formExam?.examDate||utils.localToday();
    const age=assigned?utils.calculateAge(assigned.birthDate,examDate):null;
    const patientOptions=state.patients.map(x=>`<option value="${esc(x.id)}" ${x.id===assigned?.id?"selected":""}>${esc(x.name)} — ${esc(x.medicalRecordNumber)}</option>`).join("");
    const dob=assigned?.birthDate||"";
    const initialGrowthEvaluation=assigned&&growthEngine?growthEngine.evaluateExam(assigned,{...formExam,examDate,weightKg:formExam?.weightKg??null,lengthHeightCm:formExam?.lengthHeightCm??null,measurementType:formExam?.measurementType||"",edemaStatus:formExam?.edemaStatus||"unknown",headCircumferenceCm:formExam?.headCircumferenceCm??null,midUpperArmCircumferenceCm:formExam?.midUpperArmCircumferenceCm??null}):null;
    const agePanel=assigned ? `<div class="detail-tile"><span>Usia kronologis saat pemeriksaan</span><strong id="age-display" aria-live="polite">${esc(utils.formatAge(age))}</strong><div class="subtext" id="age-days">${age?.valid?`Usia tepat: ${age.totalDays.toLocaleString("id-ID")} hari`:"Periksa tanggal lahir dan pemeriksaan."}</div></div>` : `<div class="detail-tile"><span>Usia kronologis</span><strong id="age-display">Pilih pasien terlebih dahulu</strong><div class="subtext" id="age-days">Usia dihitung berdasarkan profil pasien dan tanggal pemeriksaan.</div></div>`;
    return `${heading(formExam?"Koreksi catatan pemeriksaan":"Pemeriksaan antropometri",formExam?"Koreksi memperbarui catatan yang sama dan mencatat perubahan di audit.":"Formulir terhubung ke profil pasien; tanggal pemeriksaan menentukan usia yang ditampilkan.")}${demoNote("Data simulasi","Jangan masukkan data pasien nyata. Identitas diambil dari profil demo. Usia yang ditampilkan adalah usia kronologis; koreksi usia prematur tidak diterapkan otomatis.")}
      <form id="exam-form" class="panel" data-edit-id="${esc(formExam?.id||"")}" data-birth-date="${esc(dob)}">${formExam?.version?`<input type="hidden" name="version" value="${esc(formExam.version)}">`:""}<div class="form-section"><h2 class="section-heading">1. Data dasar dan usia</h2><p class="section-help">Identitas dan tanggal lahir dibaca dari profil pasien; ubahnya melalui koreksi profil bila ada kesalahan.</p><div class="form-grid">
      <div class="field"><label for="exam-patient">Pasien anak *</label><select id="exam-patient" name="patientId" required ${formExam?"disabled":""}><option value="">Pilih pasien…</option>${patientOptions}</select>${formExam?`<input type="hidden" name="patientId" value="${esc(formExam.patientId)}">`:""}</div>
      <div class="field"><label>Nomor rekam medis</label><input id="exam-rm" value="${esc(assigned?.medicalRecordNumber||"")}" readonly aria-readonly="true" placeholder="Terisi dari profil pasien"></div>
      <div class="field"><label>Nama pasien</label><input id="exam-name" value="${esc(assigned?.name||"")}" readonly aria-readonly="true" placeholder="Terisi dari profil pasien"></div>
      <div class="field"><label>Jenis kelamin</label><input id="exam-sex" value="${esc(assigned?utils.sexLabel(assigned.sexAtBirth):"")}" readonly aria-readonly="true" placeholder="Terisi dari profil pasien"></div>
      <div class="field"><label>Tanggal lahir</label><input id="exam-dob" type="date" value="${esc(dob)}" readonly aria-readonly="true"><span class="field-help">Bersumber dari profil pasien.</span></div>
      <div class="field"><label>Usia gestasi saat lahir</label><input id="exam-gestation" value="${esc(assigned?.gestationalAgeAtBirth?`${assigned.gestationalAgeAtBirth.weeks} minggu ${assigned.gestationalAgeAtBirth.days} hari`:"Tidak dicatat")}" readonly aria-readonly="true"><span class="field-help">Koreksi usia prematur tidak diterapkan tanpa standar dan aturan yang dikonfigurasi.</span></div>
      <div class="field"><label for="exam-date">Tanggal pemeriksaan *</label><input id="exam-date" name="examDate" type="date" max="${utils.localToday()}" min="${esc(dob)}" value="${esc(examDate)}" required></div>
      <div class="field"><label for="rme-visit">ID kunjungan RME (opsional)</label><input id="rme-visit" name="rmeVisitId" maxlength="128" value="${esc(formExam?.rmeVisitId||"")}" placeholder="${isProduction()&&integrationConfig?.visitRequired?"ID kunjungan wajib sesuai RME":"Kosong jika belum tersedia"}"></div>
      <div class="field"><label>Usia kronologis pada tanggal pemeriksaan</label>${agePanel}<span class="field-help">Tidak digunakan sebagai pengganti usia yang mungkin dibutuhkan algoritme antropometri.</span></div>
      <div class="field" style="grid-column:1/-1"><div id="age-warning" class="note-banner ${age?.valid?"hidden":""}" role="status">${age?.reason==="before_birth"?"Tanggal pemeriksaan tidak boleh mendahului tanggal lahir.":age?.reason==="invalid_date"?"Tanggal lahir atau tanggal pemeriksaan tidak valid.":"Pilih pasien dan tanggal pemeriksaan yang valid."}</div></div>
      </div></div><div class="form-section"><h2 class="section-heading">2. Pengukuran antropometri</h2><p class="section-help">Nilai kosong diperbolehkan per kolom, tetapi sedikitnya satu pengukuran harus diisi. Nilai ekstrem akan meminta konfirmasi untuk diverifikasi.</p><div class="form-grid">
      <div class="field"><label for="measurement-type">Jenis pengukuran panjang/tinggi *</label><select id="measurement-type" name="measurementType" required><option value="">Pilih…</option><option value="recumbent_length" ${formExam?.measurementType==="recumbent_length"?"selected":""}>Panjang badan (terlentang)</option><option value="standing_height" ${formExam?.measurementType==="standing_height"?"selected":""}>Tinggi badan (berdiri)</option></select></div>
      <div class="field"><label for="weight">Berat badan (kg)</label><input id="weight" name="weightKg" type="number" min="0.1" max="300" step="0.01" value="${utils.numberOrBlank(formExam?.weightKg)}" placeholder="Contoh: 8,25"><span class="field-help">Satuan kg; jangan masukkan gram.</span></div>
      <div class="field"><label for="height">Panjang/tinggi badan (cm)</label><input id="height" name="lengthHeightCm" type="number" min="20" max="250" step="0.1" value="${utils.numberOrBlank(formExam?.lengthHeightCm)}" placeholder="Contoh: 72,5"><span class="field-help">Satuan cm; pilih metode ukur di atas.</span></div>
      <div class="field"><label for="head">Lingkar kepala (cm)</label><input id="head" name="headCircumferenceCm" type="number" min="10" max="100" step="0.1" value="${utils.numberOrBlank(formExam?.headCircumferenceCm)}" placeholder="Opsional"><span class="field-help">Isi jika sesuai kelompok usia dan indikasi.</span></div>
      <div class="field"><label for="muac">Lingkar lengan atas (cm)</label><input id="muac" name="midUpperArmCircumferenceCm" type="number" min="3" max="80" step="0.1" value="${utils.numberOrBlank(formExam?.midUpperArmCircumferenceCm)}" placeholder="Opsional"><span class="field-help">Isi jika diperlukan sesuai protokol.</span></div>
      <div class="field"><label for="edema-status">Edema pitting bilateral</label><select id="edema-status" name="edemaStatus"><option value="unknown" ${!formExam?.edemaStatus||formExam.edemaStatus==="unknown"?"selected":""}>Belum diperiksa / belum dicatat</option><option value="absent" ${formExam?.edemaStatus==="absent"?"selected":""}>Tidak ditemukan</option><option value="present" ${formExam?.edemaStatus==="present"?"selected":""}>Ditemukan</option></select><span class="field-help">Status belum dikonfirmasi menahan perhitungan indeks berbasis berat badan.</span></div>
      <div class="field" style="grid-column:1/-1"><label for="exam-notes">Catatan pengukuran</label><textarea id="exam-notes" name="notes" maxlength="1500" placeholder="Kondisi atau kendala pengukuran">${esc(formExam?.notes||"")}</textarea></div>
      </div><div id="exam-extreme-warning" class="note-banner hidden" role="status"></div></div>
      <div class="form-section"><h2 class="section-heading">3. Ringkasan sebelum disimpan</h2><div class="profile-grid" id="exam-summary"><div class="detail-tile"><span>Pasien</span><strong id="summary-patient">${esc(assigned?.name||"Belum dipilih")}</strong></div><div class="detail-tile"><span>Tanggal pemeriksaan</span><strong id="summary-date">${utils.formatDate(examDate)}</strong></div><div class="detail-tile"><span>Usia</span><strong id="summary-age">${esc(utils.formatAge(age))}</strong></div><div class="detail-tile"><span>Berat badan</span><strong id="summary-weight">${formExam?.weightKg??"—"} kg</strong></div><div class="detail-tile"><span>Panjang/tinggi</span><strong id="summary-height">${formExam?.lengthHeightCm??"—"} cm</strong></div><div class="detail-tile"><span>Metode ukur</span><strong id="summary-method">${esc(utils.measurementTypeLabel(formExam?.measurementType))}</strong></div><div class="detail-tile"><span>Lingkar kepala</span><strong id="summary-head">${formExam?.headCircumferenceCm??"—"} cm</strong></div><div class="detail-tile"><span>Lingkar lengan atas</span><strong id="summary-muac">${formExam?.midUpperArmCircumferenceCm??"—"} cm</strong></div><div class="detail-tile"><span>Hasil hitung</span><strong>Lihat tabel Z-score di bawah</strong></div></div></div>
      <div class="form-section"><h2 class="section-heading">4. Kurva dan hasil langsung</h2><p class="section-help">Kurva dan tabel Z-score mengikuti nilai yang sedang diketik. Pilih status edema agar indeks terkait berat badan dapat dinilai.</p><div id="growth-chart-preview">${liveGrowthChartMarkup(assigned,{...formExam,examDate,weightKg:formExam?.weightKg??null,lengthHeightCm:formExam?.lengthHeightCm??null,measurementType:formExam?.measurementType||"",edemaStatus:formExam?.edemaStatus||"unknown",headCircumferenceCm:formExam?.headCircumferenceCm??null,midUpperArmCircumferenceCm:formExam?.midUpperArmCircumferenceCm??null})}</div><div id="growth-results-preview" class="mt-16">${growthResultsMarkup(initialGrowthEvaluation)}</div></div>
      <div class="form-actions"><button class="button button-secondary" type="button" data-action="profile" data-id="${esc(assigned?.id||"")}">Batal</button><button class="button button-primary" type="submit">${formExam?"Simpan koreksi":isProduction()?"Simpan pemeriksaan":"Simpan pemeriksaan"}</button></div></form>`;
  }
  function examDetailPage() {
    const e=exam(currentExamId), p=e&&patient(e.patientId);
    if(!e||!p) return `${heading("Detail pemeriksaan","ID pemeriksaan atau pasien tidak ditemukan.")}${note("Tidak ditemukan","Periksa ID dari daftar riwayat. Tidak ada data baru yang dibuat otomatis.")}<button class="button button-secondary" data-action="history">Kembali ke riwayat</button>`;
    const audits=state.auditEvents.filter(a=>a.entityType==="exam"&&a.entityId===e.id).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
    const liveEvaluation=growthEngine?growthEngine.evaluateExam(p,e):null;
    return `${heading("Detail pemeriksaan","Rincian data ukur, status validasi, dan hasil hitung antropometri.",`<button class="button button-primary" data-action="editExam" data-id="${esc(e.id)}">Koreksi data</button>`)}
      ${panel("Data pemeriksaan",`ID: ${esc(e.id)}`,`<div class="panel-body"><div class="profile-header"><div class="profile-avatar">${esc(p.name.split(/\s+/).map(x=>x[0]).slice(0,2).join(""))}</div><div class="profile-meta"><h2>${esc(p.name)}</h2><p>${esc(p.medicalRecordNumber)} · ${utils.formatDate(e.examDate)}</p></div></div><div class="profile-grid"><div class="detail-tile"><span>Berat badan</span><strong>${e.weightKg??"—"} kg</strong></div><div class="detail-tile"><span>Panjang/tinggi</span><strong>${e.lengthHeightCm??"—"} cm</strong></div><div class="detail-tile"><span>Lingkar kepala</span><strong>${e.headCircumferenceCm??"—"} cm</strong></div><div class="detail-tile"><span>LILA</span><strong>${e.midUpperArmCircumferenceCm??"—"} cm</strong></div><div class="detail-tile"><span>Edema pitting bilateral</span><strong>${({absent:"Tidak ditemukan",present:"Ditemukan",unknown:"Belum diperiksa / dicatat"})[e.edemaStatus||"unknown"]}</strong></div><div class="detail-tile"><span>Jenis pengukuran</span><strong>${esc(utils.measurementTypeLabel(e.measurementType))}</strong></div><div class="detail-tile"><span>ID kunjungan RME</span><strong>${esc(e.rmeVisitId||"—")}</strong></div><div class="detail-tile"><span>Validasi data</span><strong>${esc(utils.qualityLabel(e.dataValidationStatus))}</strong></div><div class="detail-tile"><span>Verifikasi</span><strong>${esc(utils.verificationLabel(e.verificationStatus))}</strong></div><div class="detail-tile"><span>Interpretasi</span><strong>${esc(utils.interpretationLabel(e.interpretationStatus))}</strong></div></div><div class="mt-16"><strong>Catatan</strong><p class="muted">${esc(e.notes||"Tidak ada catatan.")}</p></div><p class="subtext">Dibuat ${utils.formatDateTime(e.createdAt)} · Diubah ${utils.formatDateTime(e.updatedAt)} · Pencatat: ${esc(e.recordedBy||"Tidak tersedia; autentikasi belum ada")}</p></div>`)}
      ${panel("Hasil mesin antropometri",`Algoritme: ${esc(liveEvaluation?.algorithmVersion||e.anthropometryCalculation?.algorithmVersion||"Belum tersedia")} · Rujukan WHO LMS`,growthResultsMarkup(liveEvaluation||e.anthropometryCalculation||null))}
      ${panel("Jejak koreksi",`${audits.length} peristiwa audit`,`<div class="panel-body">${audits.map(a=>`<div class="review-item"><strong>${esc(a.action)}</strong><p>${utils.formatDateTime(a.occurredAt)} · Kolom berubah: ${esc(a.changedFields.join(", ")||"—")}</p>${a.before?`<details><summary>Lihat nilai sebelum koreksi</summary><pre>${esc(JSON.stringify(a.before,null,2))}</pre></details>`:""}</div>`).join("")||`<p class="muted">Belum ada koreksi tercatat.</p>`}</div>`)}<button class="button button-secondary" data-action="profile" data-id="${esc(p.id)}">Kembali ke profil</button>`;
  }
  function historyPage() {
    const id=historyFilterPatientId, rows=examsFor(id);
    return `${heading("Riwayat pemeriksaan","Setiap baris adalah catatan terpisah; urut dari tanggal terbaru.",`<button class="button button-primary" data-action="exam">＋ Pemeriksaan baru</button>`)}${panel("Semua catatan",`${rows.length} catatan${id?` untuk ${esc(patient(id)?.name||"pasien terpilih")}`:""}`,`<div class="panel-body"><div class="field"><label for="history-patient">Filter pasien</label><select id="history-patient"><option value="">Semua pasien</option>${state.patients.map(p=>`<option value="${esc(p.id)}" ${p.id===id?"selected":""}>${esc(p.name)} — ${esc(p.medicalRecordNumber)}</option>`).join("")}</select></div></div><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Pasien / ID pemeriksaan</th><th>Berat / panjang-tinggi</th><th>Kualitas data</th><th>Interpretasi</th><th></th></tr></thead><tbody>${rows.map(e=>`<tr><td>${utils.formatDate(e.examDate)}</td><td>${patient(e.patientId)?patientCell(patient(e.patientId)):status("Pasien tidak ditemukan","status-alert")}<div class="subtext">${esc(e.id)}</div></td><td>${e.weightKg??"—"} kg / ${e.lengthHeightCm??"—"} cm</td><td>${status(utils.qualityLabel(e.dataValidationStatus),qualityClass(e.dataValidationStatus))}</td><td>${status(utils.interpretationLabel(e.interpretationStatus),interpretationClass(e.interpretationStatus))}</td><td><button class="button button-quiet" data-action="examDetail" data-id="${esc(e.id)}">Detail →</button></td></tr>`).join("")||emptyRow(6,"Belum ada catatan","Pilih pasien lain atau tambahkan pemeriksaan baru.")}</tbody></table></div>`)}`;
  }
  function growthPage() {
    const p=patient(selectedPatientId), rows=examsFor(selectedPatientId);
    const options=p&&growthChart?growthChart.availableIndexes(p,state.exams,growthEngine):[];
    if(options.length&&!options.some(o=>o.value===currentGrowthIndex))currentGrowthIndex=options[0].value;
    const model=growthChart?growthChart.buildModel({patient:p,exams:state.exams,indexType:currentGrowthIndex,engine:growthEngine,referenceData:window.GrowthReferenceData}):null;
    const interpretedPoint=model?.points?.[model.points.length-1];
    const interpretedExam=interpretedPoint?rows.find(item=>item.id===interpretedPoint.examId):rows[0];
    const growthEvaluation=p&&interpretedExam&&growthEngine?growthEngine.evaluateExam(p,interpretedExam):null;
    const indexOptions=options.map(o=>`<option value="${esc(o.value)}" ${o.value===currentGrowthIndex?"selected":""}>${esc(o.label)}</option>`).join("");
    const pointRows=(model?.points||[]).map(pt=>`<tr><td>${utils.formatDate(pt.date)}<div class="subtext">${esc(pt.examId)}</div></td><td>${pt.ageLabel} <span class="subtext">(${pt.ageDays} hari)</span></td><td>${pt.value.toFixed(2)} ${esc(pt.unit)}</td><td>${pt.zScore===null?"—":pt.zScore.toFixed(2)}</td><td>${pt.referenceStatus==="validated"?status("Referensi tersedia","status-ok"):status("Referensi belum tersedia")}${pt.measurementStatus==="incomplete"?`<div class="subtext">Catatan keseluruhan tidak lengkap; nilai indeks tersedia</div>`:""}${pt.sameDate?`<div class="subtext">Tanggal duplikat; tidak dihubungkan</div>`:""}</td><td><button class="button button-quiet" data-action="growthPoint" data-id="${esc(pt.examId)}">Detail pemeriksaan →</button></td></tr>`).join("");
    const excludedRows=(model?.excluded||[]).map(pt=>{const e=rows.find(r=>r.id===pt.examId);return `<tr><td>${utils.formatDate(pt.date)}<div class="subtext">${esc(pt.examId)}</div></td><td colspan="4">${esc(pt.reason==="outside_reference_age_coverage"?"Usia di luar cakupan indeks":pt.reason==="invalid_exam_date_or_before_birth"?"Tanggal tidak valid":pt.reason==="measurement_failed_validation"?"Data pemeriksaan gagal validasi; tidak diplot":pt.reason==="edema_present_weight_based_index_withheld"?"Edema ditemukan; indeks berbasis berat badan tidak diplot":pt.reason==="edema_status_unknown_weight_based_index_withheld"?"Status edema belum diketahui; indeks berbasis berat badan tidak diplot":`Tidak dapat diplot: ${pt.reason}`)}</td><td>${e?`<button class="button button-quiet" data-action="growthPoint" data-id="${esc(e.id)}">Lihat catatan →</button>`:"—"}</td></tr>`;}).join("");
    const legend=model?.referenceAvailable?`<div class="growth-legend"><span><i class="legend-point"></i> Pemeriksaan pasien</span><span><i class="legend-line"></i> Hubungan longitudinal (tanggal unik)</span>${[-3,-2,-1,0,1,2,3].map(z=>`<span><i class="legend-z legend-z-${z<0?`m${Math.abs(z)}`:z}"></i>Z = ${z} SD</span>`).join("")}</div>`:`<div class="growth-legend"><span><i class="legend-point"></i> Pemeriksaan pasien</span><span><i class="legend-line"></i> Hubungan longitudinal (tanggal unik)</span></div>`;
    const warningText=(model?.warnings||[]).join(" ");
    return `${heading("Kurva pertumbuhan longitudinal","Kurva mengambil catatan dari riwayat pasien tersimpan. Titik adalah pengukuran, bukan diagnosis.",`<button class="button button-secondary" data-action="printGrowth">Cetak</button> <button class="button button-primary" data-action="exportGrowth">Ekspor CSV</button>`)}${repo.mode === "production" ? "" : note("MODE DEMONSTRASI — DATA SIMULASI","Seluruh profil dan titik yang ditampilkan di proyek ini adalah data sintetis. Jangan gunakan sebagai dasar keputusan klinis.")}
      ${panel("Pilih pasien dan indeks","Pilihan indeks mengikuti cakupan usia standar; catatan di luar cakupan tidak diplot.",`<div class="panel-body"><div class="growth-controls"><div class="field"><label for="growth-patient">Pasien</label><select id="growth-patient"><option value="">Pilih pasien…</option>${state.patients.map(x=>`<option value="${esc(x.id)}" ${x.id===selectedPatientId?"selected":""}>${esc(x.name)} — ${esc(x.medicalRecordNumber)}</option>`).join("")}</select></div><div class="field"><label for="growth-index">Indeks antropometri</label><select id="growth-index" ${options.length?"":"disabled"}>${indexOptions||`<option value="">Pilih pasien terlebih dahulu</option>`}</select></div></div></div>`)}
      ${panel(`${esc(p?.name||"Pilih pasien")}${p?` · ${esc(utils.sexLabel(p.sexAtBirth))}`:""}`,`${rows.length} pemeriksaan tersimpan · ${esc(model?.label||"Indeks belum dipilih")}`,`<div class="panel-body"><div class="growth-reference-meta"><strong>${model?.referenceAvailable?"Kurva rujukan tersedia untuk segmen yang tervalidasi":"Kurva referensi WHO belum tersedia"}</strong><span>${esc(model?.referenceSource||"Pilih pasien dan indeks")}</span></div>${model?.referenceAvailable?"":`<div class="note-banner mt-16"><div><strong>Garis/pita Z-score tidak ditampilkan.</strong> Dataset WHO resmi yang sesuai indeks, usia, dan jenis kelamin belum dipasang serta diverifikasi. Tidak ada garis ilustratif atau Z-score simulasi. Titik pengukuran tetap ditampilkan jika data dan usia memenuhi cakupan indeks.</div></div>`}${warningText?`<p class="growth-warning" role="status">${esc(warningText)}</p>`:""}${growthChart?growthChart.renderSvg(model):`<div class="growth-empty">Modul grafik belum tersedia.</div>`}${growthInterpretationMarkup(growthEvaluation,currentGrowthIndex,interpretedExam?.examDate)}${legend}<p class="subtext">Sumbu X: usia saat pemeriksaan (bulan). Sumbu Y: ${esc(model?.label||"nilai indeks")} (${esc(model?.unit||"satuan" )}). Sumber kurva hanya akan ditampilkan dari dataset WHO tervalidasi yang terdaftar dan cocok dengan jenis kelamin serta rentang usia.</p></div>`)}
      ${panel("Titik pemeriksaan dan detail","Pilih Detail untuk membuka catatan pemeriksaan terkait. Pengukuran yang dikoreksi akan terbaca ulang dari riwayat terbaru.",`<div class="table-wrap"><table><thead><tr><th>Tanggal pemeriksaan</th><th>Usia saat ukur</th><th>Nilai</th><th>Z-score</th><th>Status pembanding</th><th></th></tr></thead><tbody>${pointRows}${excludedRows}${!pointRows&&!excludedRows?emptyRow(6,"Belum ada pengukuran yang dapat diplot","Tambahkan pemeriksaan atau pilih indeks lain yang sesuai cakupan usia."):""}</tbody></table></div>`)}
      <button class="button button-secondary" data-action="profile" data-id="${esc(selectedPatientId)}">Kembali ke profil</button>`;
  }
  function exportGrowthCsv() {
    if(!growthChart || !patient(selectedPatientId)){notify("Pilih pasien terlebih dahulu sebelum ekspor.");return;}
    const model=growthChart.buildModel({patient:patient(selectedPatientId),exams:state.exams,indexType:currentGrowthIndex,engine:growthEngine,referenceData:window.GrowthReferenceData});
    const rows=growthChart.csvRows(model).map(row=>row.map(value=>`"${String(value??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const link=document.createElement("a");link.href=`data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF"+rows)}`;link.download=`kurva-${selectedPatientId}-${currentGrowthIndex}.csv`;link.style.display="none";document.body.appendChild(link);link.click();link.remove();notify("Ekspor CSV disiapkan dari riwayat pasien terpilih.");
  }
  function reportsPage() {
    return `${heading("Ringkasan laporan","Lihat cakupan data dan hasil skrining antropometri seluruh pasien.")}
      <div class="stats-grid"><div class="stat-card"><div class="stat-top">Pasien</div><div class="stat-value">${state.patients.length}</div></div><div class="stat-card"><div class="stat-top">Pemeriksaan</div><div class="stat-value">${state.exams.length}</div></div><div class="stat-card"><div class="stat-top">Audit events</div><div class="stat-value">${state.auditEvents.length}</div></div><div class="stat-card"><div class="stat-top">Hasil tervalidasi</div><div class="stat-value">${state.interpretations.filter(i=>i.validationStatus==="valid").length}</div></div></div>
      ${note("Catatan interpretasi","Ringkasan otomatis ini untuk skrining. Tinjau pengukuran dan kondisi klinis; hasil bukan diagnosis.")}
      ${panel("Jumlah pemeriksaan per pasien",isProduction()?"Data dari backend RME":"Data demo",`<div class="table-wrap"><table><thead><tr><th>Pasien</th><th>Jumlah pemeriksaan</th><th>Terbaru</th><th></th></tr></thead><tbody>${state.patients.map(p=>{const es=examsFor(p.id);return `<tr><td>${patientCell(p)}</td><td>${es.length}</td><td>${es[0]?utils.formatDate(es[0].examDate):"—"}</td><td><button class="button button-secondary" data-action="profile" data-id="${esc(p.id)}">Buka</button></td></tr>`;}).join("")}</tbody></table></div>`)}
      ${combinedAnthropometryMarkup()}`;
  }
  function auditPage() {
    const events=[...state.auditEvents].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
    return `${heading("Jejak perubahan data",isProduction()?"Peristiwa audit yang disediakan backend RME.":"Log simulasi untuk pembuatan profil, pemeriksaan, dan koreksi.")}${demoNote("Audit demo","Aktor tercatat kosong karena autentikasi belum tersedia. Log browser demo bukan audit trail sistem klinis produksi.")}${panel("Semua peristiwa",`${events.length} peristiwa`,`<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Entitas</th><th>ID entitas</th><th>Aksi</th><th>Kolom</th></tr></thead><tbody>${events.map(a=>`<tr><td>${utils.formatDateTime(a.occurredAt)}</td><td>${esc(a.entityType)}</td><td>${esc(a.entityId)}</td><td>${esc(a.action)}</td><td>${esc(a.changedFields.join(", ")||"—")}</td></tr>`).join("")||emptyRow(5,"Belum ada audit","Perubahan baru akan dicatat di sini.")}</tbody></table></div>`)}`;
  }
  function updateEnvironmentIndicators() {
    const title = document.getElementById("environment-title");
    const detail = document.getElementById("environment-detail");
    const indicator = document.getElementById("environment-indicator");
    const avatar = document.getElementById("user-mode-avatar");
    const dot = document.getElementById("environment-status-dot");
    if (!title || !detail || !indicator || !avatar) return;
    if (repo.mode === "production") {
      const provider=repo.providerLabel||"RME";
      if (serviceState === "ready") {
        title.textContent = `${provider} terhubung`;
        detail.textContent = repo.publicDemo ? "Data sintetis bersama tersedia untuk demo publik." : "Data organisasi berhasil dimuat untuk sesi ini.";
        indicator.textContent = `▣ ${provider} · terhubung`;
        avatar.textContent = repo.publicDemo?"DEMO":provider==="Supabase"?"SB":"RME";
        avatar.setAttribute("aria-label", repo.publicDemo?"Demo publik Supabase":`Sesi integrasi ${provider}`);
      } else if (serviceState === "loading") {
        title.textContent = `Menghubungkan ${provider}…`;
        detail.textContent = "Menunggu respons backend; data belum dikonfirmasi.";
        indicator.textContent = `▣ Menghubungkan ${provider}…`;
        avatar.textContent = provider==="Supabase"?"SB":"RME";
        avatar.setAttribute("aria-label", `Menghubungkan ke ${provider}`);
      } else {
        title.textContent = `Integrasi ${provider} gagal`;
        detail.textContent = "Backend belum dapat dikonfirmasi. Tidak menggunakan data demo.";
        indicator.textContent = `▣ ${provider} tidak tersedia`;
        avatar.textContent = "ERR";
        avatar.setAttribute("aria-label", `Integrasi ${provider} tidak tersedia`);
      }
    } else if (repo.persistenceMode === "memory-only") {
      title.textContent = "Demo · memori sementara";
      detail.textContent = "Data sintetis hilang ketika halaman dimuat ulang.";
      indicator.textContent = "▣ Demo · sementara";
      avatar.textContent = "DEMO";
      avatar.setAttribute("aria-label", "Lingkungan demo sementara");
    } else {
      title.textContent = "Mode demo";
      detail.textContent = "Data simulasi tersimpan di browser ini, bukan RME.";
      indicator.textContent = "▣ Lingkungan demo";
      avatar.textContent = "DEMO";
      avatar.setAttribute("aria-label", "Lingkungan demonstrasi");
    }
    if (dot) {
      dot.style.background = repo.mode === "production" && serviceState === "ready" ? "#16a34a" :
        repo.mode === "production" && serviceState === "error" ? "#dc2626" : "#d97706";
    }
  }
  function render() {
    updateEnvironmentIndicators();
    const views={dashboard,patients:patientsPage,profile:profilePage,patientNew:patientNewPage,exam:examPage,examDetail:examDetailPage,results:examDetailPage,growth:growthPage,history:historyPage,reports:reportsPage,audit:auditPage};
    content.innerHTML=serviceBanner()+(views[currentPage]||dashboard)();
  }
  function handleError(error) {
    if(error?.code==="VALIDATION_ERROR") notify(error.message);
    else if(error?.code==="NOT_FOUND") notify(error.message||"ID tidak ditemukan.");
    else if(error?.code==="UNAUTHENTICATED"&&repo.providerLabel==="Supabase"){serviceState="error";serviceCode="UNAUTHENTICATED";serviceError=error.message||"Silakan masuk kembali.";render();}
    else if(error?.code==="UNAUTHENTICATED") notify(`Sesi tidak terautentikasi. Silakan masuk ke ${backendLabel()} lalu muat ulang.`);
    else if(error?.code==="FORBIDDEN") notify(`Akses ditolak. Periksa hak akses pengguna pada ${backendLabel()}.`);
    else if(error?.code==="CONFLICT") notify("Konflik perubahan. Muat ulang data sebelum mengoreksi; perubahan belum dikonfirmasi.");
    else { if(["NETWORK_ERROR","SERVER_ERROR","INVALID_RESPONSE"].includes(error?.code)){serviceState="error";serviceError=error.message||"Backend tidak tersedia.";render();} notify(`Operasi gagal: ${error?.message||"kesalahan tidak diketahui"}`); }
  }
  document.addEventListener("click", async e=>{
    const nav=e.target.closest("[data-page]"); if(nav){
      try { if(isProduction()){serviceState="loading";render();await refresh();} if(nav.dataset.page==="exam")currentExamId="";setPage(nav.dataset.page); }
      catch(err){handleError(err);} return;
    }
    const action=e.target.closest("[data-action]"); if(!action)return;
    const id=action.dataset.id, next=action.dataset.action;
    try {
      if(isProduction() && ["profile","exam","patientNew","editPatient","patients","dashboard","reports","growth","history","examDetail","results","editExam","audit","growthPoint"].includes(next)) { serviceState="loading";render();await refresh(); }
      if(next==="profile") { selectedPatientId=id||""; currentExamId=""; historyFilterPatientId=""; setPage("profile"); return; }
      if(next==="exam") { if(id&&patient(id))selectedPatientId=id; currentExamId=""; setPage("exam"); return; }
      if(next==="patientNew") { selectedPatientId=""; setPage("patientNew"); return; }
      if(next==="editPatient") { if(!patient(id)) throw new Repository.RepositoryError("NOT_FOUND","Pasien tidak ditemukan."); selectedPatientId=id; setPage("patientNew"); return; }
      if(next==="patients"||next==="dashboard"||next==="reports"||next==="growth") { if(id&&patient(id))selectedPatientId=id; setPage(next);return; }
      if(next==="history") { historyFilterPatientId=id&&patient(id)?id:"";setPage("history");return; }
      if(next==="examDetail"||next==="results") { currentExamId=id||new URLSearchParams(location.search).get("exam")||""; setPage("examDetail");return; }
      if(next==="editExam") { currentExamId=id||""; const existing=exam(currentExamId); if(!existing) throw new Repository.RepositoryError("NOT_FOUND","Pemeriksaan tidak ditemukan."); selectedPatientId=existing.patientId;setPage("exam");return; }
      if(next==="audit") {setPage("audit");return;}
      if(next==="growthPoint") { currentExamId=id||""; setPage("examDetail"); return; }
      if(next==="retryData") { serviceState="loading"; render(); await refresh(); render(); notify(repo.mode === "production" ? "Data backend berhasil dimuat ulang." : "Data demo berhasil dimuat ulang."); return; }
      if(next==="supabaseSignOut") { await repo.signOut(); state={patients:[],exams:[],interpretations:[],auditEvents:[]};serviceState="error";serviceCode="UNAUTHENTICATED";serviceError="Sesi telah diakhiri.";render();return; }
      if(next==="printGrowth") { if(typeof window.print==="function")window.print(); return; }
      if(next==="exportGrowth") { exportGrowthCsv(); return; }
    } catch(err){handleError(err);}
  });
  document.addEventListener("input",e=>{
    if(e.target.id==="patient-search") { const pos=e.target.selectionStart;searchTerm=e.target.value;render();const input=document.getElementById("patient-search");if(input){input.focus();input.setSelectionRange(pos,pos);} }
  });
  document.addEventListener("change",e=>{
    if(e.target.id==="history-patient") {historyFilterPatientId=e.target.value;render();}
    if(e.target.id==="growth-patient") {selectedPatientId=e.target.value;render();}
    if(e.target.id==="growth-index"||e.target.id==="profile-growth-index") {currentGrowthIndex=e.target.value||"weight_for_age";render();}
  });
  function updateExamAgeAndSummary() {
    const form=document.getElementById("exam-form"); if(!form)return;
    const patientId=document.getElementById("exam-patient")?.value||form.querySelector('input[name="patientId"]')?.value||"";
    const p=patient(patientId), date=document.getElementById("exam-date")?.value||"";
    const age=p?utils.calculateAge(p.birthDate,date):null;
    form.dataset.birthDate=p?.birthDate||"";
    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
    const rm=document.getElementById("exam-rm"), name=document.getElementById("exam-name"), sex=document.getElementById("exam-sex"), dob=document.getElementById("exam-dob"), gestation=document.getElementById("exam-gestation");
    if(rm)rm.value=p?.medicalRecordNumber||"";if(name)name.value=p?.name||"";if(sex)sex.value=p?utils.sexLabel(p.sexAtBirth):"";if(dob)dob.value=p?.birthDate||"";if(gestation)gestation.value=p?.gestationalAgeAtBirth?`${p.gestationalAgeAtBirth.weeks} minggu ${p.gestationalAgeAtBirth.days} hari`:"Tidak dicatat";
    const dateInput=document.getElementById("exam-date");if(dateInput)dateInput.min=p?.birthDate||"";
    set("age-display",p?utils.formatAge(age):"Pilih pasien terlebih dahulu");
    set("age-days",age?.valid?`Usia tepat: ${age.totalDays.toLocaleString("id-ID")} hari`:"Usia belum dapat dihitung.");
    set("summary-patient",p?.name||"Belum dipilih");set("summary-date",utils.formatDate(date));set("summary-age",p?utils.formatAge(age):"—");
    const metric=(id)=>{const el=document.getElementById(id);return el&&el.value!==""&&Number.isFinite(Number(el.value))?String(Number(el.value)):"—";};
    set("summary-weight",`${metric("weight")} kg`);set("summary-height",`${metric("height")} cm`);set("summary-method",utils.measurementTypeLabel(document.getElementById("measurement-type")?.value));set("summary-head",`${metric("head")} cm`);set("summary-muac",`${metric("muac")} cm`);
    const resultsContainer=document.getElementById("growth-results-preview");
    const numberOrNull=id=>{const el=document.getElementById(id);return !el||el.value===""?null:Number(el.value);};
    const draft={examDate:date,weightKg:numberOrNull("weight"),lengthHeightCm:numberOrNull("height"),measurementType:document.getElementById("measurement-type")?.value||"",edemaStatus:document.getElementById("edema-status")?.value||"unknown",headCircumferenceCm:numberOrNull("head"),midUpperArmCircumferenceCm:numberOrNull("muac")};
    if(resultsContainer&&growthEngine)resultsContainer.innerHTML=growthResultsMarkup(p?growthEngine.evaluateExam(p,draft):null);
    const chartPreview=document.getElementById("growth-chart-preview");if(chartPreview)chartPreview.innerHTML=liveGrowthChartMarkup(p,draft);
    const warning=document.getElementById("age-warning");
    if(warning){const msg=!p?"Pilih pasien terlebih dahulu.":!age?.valid?(age?.reason==="before_birth"?"Tanggal pemeriksaan mendahului tanggal lahir. Pilih tanggal yang sama atau setelah tanggal lahir.":"Tanggal lahir atau tanggal pemeriksaan tidak valid."):date>utils.localToday()?"Tanggal pemeriksaan tidak boleh di masa depan.":"";warning.textContent=msg;warning.classList.toggle("hidden",!msg);}
    const extreme=[];const values=[ ["weight","Berat badan",0.5,50,"kg"],["height","Panjang/tinggi badan",30,200,"cm"],["head","Lingkar kepala",25,60,"cm"],["muac","Lingkar lengan atas",5,40,"cm"] ];
    for(const [id,label,min,max,unit] of values){const input=document.getElementById(id);if(!input||input.value==="")continue;const n=Number(input.value);if(Number.isFinite(n)&&(n<min||n>max))extreme.push(`${label} ${n} ${unit} berada di luar rentang pemeriksaan kewajaran (${min}–${max} ${unit})`);}
    const extremeBox=document.getElementById("exam-extreme-warning");if(extremeBox){extremeBox.textContent=extreme.length?`Mohon verifikasi sebelum menyimpan: ${extreme.join("; ")}. Nilai tidak diubah otomatis.`:"";extremeBox.classList.toggle("hidden",!extreme.length);}
  }
  document.addEventListener("input",e=>{if(e.target.closest("#exam-form"))updateExamAgeAndSummary();});
  document.addEventListener("change",e=>{
    if(e.target.id==="exam-growth-index"){currentGrowthIndex=e.target.value||"weight_for_age";updateExamAgeAndSummary();return;}
    if(e.target.id==="growth-patient") { selectedPatientId=e.target.value||""; currentGrowthIndex="weight_for_age"; render(); return; }
    if(e.target.id==="growth-index") { currentGrowthIndex=e.target.value||"weight_for_age"; render(); return; }
    if(e.target.id==="history-patient") { historyFilterPatientId=e.target.value||""; render(); return; }
    if(e.target.id==="exam-patient"||e.target.id==="exam-date"||e.target.closest("#exam-form"))updateExamAgeAndSummary();
  });

  document.addEventListener("submit",async e=>{
    const form=e.target;
    if(form.id==="supabase-login"){
      e.preventDefault();const fields=new FormData(form),button=form.querySelector('button[type="submit"]');
      if(button){button.disabled=true;button.textContent="Menghubungkan…";}
      try{await repo.signIn(String(fields.get("email")||""),String(fields.get("password")||""));state=await repo.initialize();serviceState="ready";serviceError="";serviceCode="";render();notify("Supabase terhubung; data organisasi berhasil dimuat.");}
      catch(error){serviceState="error";serviceCode=error?.code||"";serviceError=error?.message||"Login Supabase gagal.";render();}
      return;
    }
    if(!["patient-form","exam-form"].includes(form.id))return;
    e.preventDefault(); const fd=new FormData(form);
    const submitButton=typeof form.querySelector === "function" ? form.querySelector('button[type="submit"]') : null;
    const submitLabel=submitButton?.textContent||"Simpan";
    if(submitButton){submitButton.disabled=true;submitButton.textContent="Menyimpan…";}
    try {
      if(form.id==="patient-form") {
        const weeks=String(fd.get("gestationWeeks")||"");
        const days=String(fd.get("gestationDays")??"0");
        const input={version:fd.get("version")||undefined,name:fd.get("name"),medicalRecordNumber:fd.get("medicalRecordNumber"),birthDate:fd.get("birthDate"),sexAtBirth:fd.get("sexAtBirth"),gestationalAgeAtBirth:weeks?{weeks,days}:null,guardianName:fd.get("guardianName"),clinicalNotes:fd.get("clinicalNotes")};
        const editId=form.dataset.editId;
        const saved=editId?await repo.updatePatient(editId,input):await repo.createPatient(input);
        await refresh(); selectedPatientId=saved.id; searchTerm="";notify(successPersistenceMessage(editId?"Profil diperbarui; jejak koreksi dicatat":"Profil dibuat")+` ID: ${saved.id}`);setPage("profile");return;
      }
      const input={patientId:String(fd.get("patientId")||""),rmeVisitId:fd.get("rmeVisitId"),version:fd.get("version")||undefined,examDate:fd.get("examDate"),weightKg:fd.get("weightKg"),lengthHeightCm:fd.get("lengthHeightCm"),measurementType:fd.get("measurementType"),edemaStatus:fd.get("edemaStatus"),headCircumferenceCm:fd.get("headCircumferenceCm"),midUpperArmCircumferenceCm:fd.get("midUpperArmCircumferenceCm"),notes:fd.get("notes")};
      const metricFields=[["weightKg","Berat badan"],["lengthHeightCm","Panjang/tinggi badan"],["headCircumferenceCm","Lingkar kepala"],["midUpperArmCircumferenceCm","Lingkar lengan atas"]];
      for(const [key,label] of metricFields){const raw=input[key];if(raw!==null&&raw!==undefined&&String(raw).trim()!==""&&!Number.isFinite(Number(raw)))throw new Repository.RepositoryError("VALIDATION_ERROR",`${label} harus berupa angka dengan satuan yang benar.`);}
      const selected=patient(input.patientId);if(!selected)throw new Repository.RepositoryError("NOT_FOUND","Pilih pasien yang tersedia sebelum menyimpan pemeriksaan.");
      const ageCheck=utils.calculateAge(selected.birthDate,String(input.examDate||""));if(!ageCheck.valid)throw new Repository.RepositoryError("VALIDATION_ERROR",ageCheck.reason==="before_birth"?"Tanggal pemeriksaan tidak boleh mendahului tanggal lahir pasien.":"Tanggal lahir atau tanggal pemeriksaan tidak valid.");
      if(String(input.examDate)>utils.localToday())throw new Repository.RepositoryError("VALIDATION_ERROR","Tanggal pemeriksaan tidak boleh di masa depan.");
      const extremes=[];for(const [key,label,min,max,unit] of [["weightKg","Berat badan",0.5,50,"kg"],["lengthHeightCm","Panjang/tinggi badan",30,200,"cm"],["headCircumferenceCm","Lingkar kepala",25,60,"cm"],["midUpperArmCircumferenceCm","Lingkar lengan atas",5,40,"cm"]]){const raw=input[key];if(raw!==""&&raw!==null&&raw!==undefined){const n=Number(raw);if(Number.isFinite(n)&&(n<min||n>max))extremes.push(`${label}: ${n} ${unit} (rentang kewajaran ${min}–${max} ${unit})`);}}
      if(extremes.length&&typeof window.confirm==="function"&&!window.confirm(`Nilai berikut tampak ekstrem. Verifikasi nilai asli alat ukur sebelum menyimpan; sistem tidak akan mengubah nilainya.\n\n${extremes.join("\n")}\n\nTetap simpan nilai yang dimasukkan?`))return;
      const wasEditing=Boolean(currentExamId);
      let saved;
      if(wasEditing) saved=await repo.updateExam(currentExamId,input); else saved=await repo.createExam(input);
      await refresh(); selectedPatientId=saved.patientId; currentExamId=""; historyFilterPatientId="";notify(successPersistenceMessage(wasEditing?"Pemeriksaan dikoreksi dan jejak perubahan dicatat":"Pemeriksaan baru dibuat"));setPage("profile");
    } catch(err) {handleError(err);}
    finally {if(submitButton&&submitButton.isConnected !== false){submitButton.disabled=false;submitButton.textContent=submitLabel;}}
  });
  document.getElementById("menu-toggle").addEventListener("click",()=>sidebar.classList.toggle("open"));
  document.addEventListener("keydown",e=>{if(e.key==="Escape")sidebar.classList.remove("open");});
  content.innerHTML=serviceBanner();
  (async()=>{try{state=await repo.initialize();serviceState="ready";serviceError="";serviceCode="";const params=new URLSearchParams(location.search);if(params.has("exam")){currentExamId=params.get("exam");currentPage="examDetail";}setPage(currentPage);}catch(err){serviceState="error";serviceError=err.message||"Backend tidak tersedia.";serviceCode=err?.code||"";content.innerHTML=serviceBanner();}})();
})();
