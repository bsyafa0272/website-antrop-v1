/* Utilitas tampilan non-klinis. Tidak menghitung z-score atau kategori pertumbuhan. */
function parseISODate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }
  function daysInMonthUTC(year, monthIndex) { return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate(); }
  function addCalendarMonthsClamped(date, months) {
    const absoluteMonth = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
    const year = Math.floor(absoluteMonth / 12), month = absoluteMonth % 12;
    return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), daysInMonthUTC(year, month))));
  }
  function calculateAge(dob, atDate) {
    const birth = parseISODate(dob), at = parseISODate(atDate);
    if (!birth || !at) return {valid:false, reason:"invalid_date", years:null, months:null, days:null, totalDays:null};
    if (at < birth) return {valid:false, reason:"before_birth", years:null, months:null, days:null, totalDays:null};
    const totalDays = Math.round((at.getTime() - birth.getTime()) / 86400000);
    let years = at.getUTCFullYear() - birth.getUTCFullYear();
    let yearAnchor = new Date(Date.UTC(birth.getUTCFullYear() + years, birth.getUTCMonth(), Math.min(birth.getUTCDate(), daysInMonthUTC(birth.getUTCFullYear() + years, birth.getUTCMonth()))));
    if (yearAnchor > at) years--;
    yearAnchor = new Date(Date.UTC(birth.getUTCFullYear() + years, birth.getUTCMonth(), Math.min(birth.getUTCDate(), daysInMonthUTC(birth.getUTCFullYear() + years, birth.getUTCMonth()))));
    let months = (at.getUTCFullYear() - yearAnchor.getUTCFullYear()) * 12 + at.getUTCMonth() - yearAnchor.getUTCMonth();
    let monthAnchor = addCalendarMonthsClamped(yearAnchor, months);
    if (monthAnchor > at) { months--; monthAnchor = addCalendarMonthsClamped(yearAnchor, months); }
    const days = Math.round((at.getTime() - monthAnchor.getTime()) / 86400000);
    return {valid:true, reason:null, years, months, days, totalDays};
  }
  function formatAge(age) {
    if (!age || !age.valid) return age?.reason === "before_birth" ? "Tanggal pemeriksaan mendahului tanggal lahir" : "Tanggal tidak valid";
    return `${age.years} tahun, ${age.months} bulan, ${age.days} hari`;
  }
  window.Anthropometry = {
  calculateAge,
  formatAge,
  ageAt(dob, atDate) {
    const age = calculateAge(dob, atDate);
    return age.valid ? formatAge(age) : formatAge(age);
  },
  formatDate(value) {
    if (!value) return "—";
    const date = new Date(value + "T00:00:00");
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("id-ID", {day:"numeric",month:"short",year:"numeric"}).format(date);
  },
  formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("id-ID", {day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(date);
  },
  sexLabel(value) {
    return value === "female" ? "Perempuan" : value === "male" ? "Laki-laki" : "—";
  },
  measurementTypeLabel(value) {
    return value === "recumbent_length" ? "Panjang badan (terlentang)" : value === "standing_height" ? "Tinggi badan (berdiri)" : "—";
  },
  qualityLabel(value) {
    return ({valid:"Data lengkap",incomplete:"Data tidak lengkap",failed_validation:"Gagal divalidasi"})[value] || "Belum dinilai";
  },
  interpretationLabel(value) {
    return ({not_calculated:"Belum dihitung",valid:"Tervalidasi",incomplete:"Tidak lengkap",failed_validation:"Gagal divalidasi",stale:"Perlu dihitung ulang"})[value] || "Belum dihitung";
  },
  verificationLabel(value) {
    return ({pending:"Menunggu verifikasi",valid:"Terverifikasi",failed_validation:"Gagal validasi"})[value] || "Belum diverifikasi";
  },
  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  },
  numberOrBlank(value) {
    return value === null || value === undefined ? "" : String(value);
  },
  localToday() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }
};
