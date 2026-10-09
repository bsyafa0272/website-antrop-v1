const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..');
const window = {};
vm.createContext({window, Date, Intl, Number, String, Math});
const ctx = vm.createContext({window, Date, Intl, Number, String, Math});
vm.runInContext(fs.readFileSync(path.join(root, 'js/anthropometry.js'), 'utf8'), ctx);
const {calculateAge, formatAge} = window.Anthropometry;
function age(dob, at) { return calculateAge(dob, at); }
// Bayi belum genap setahun: kalender, bukan pembagian hari/30.
assert.deepStrictEqual(JSON.parse(JSON.stringify(age('2025-10-09','2026-03-08'))), {valid:true,reason:null,years:0,months:4,days:27,totalDays:150});
// Tepat ulang tahun.
assert.equal(formatAge(age('2020-06-15','2025-06-15')), '5 tahun, 0 bulan, 0 hari');
// Akhir bulan: tanggal 31 dipasangkan dengan hari terakhir bulan berikutnya.
assert.equal(formatAge(age('2025-01-31','2025-02-28')), '0 tahun, 1 bulan, 0 hari');
// Tahun kabisat dan tanggal ulang tahun pada 29 Februari di tahun non-kabisat.
assert.equal(formatAge(age('2024-02-29','2025-02-28')), '1 tahun, 0 bulan, 0 hari');
assert.equal(age('2024-02-29','2024-03-01').totalDays, 1);
// Pemeriksaan pada tanggal lahir.
assert.deepStrictEqual(JSON.parse(JSON.stringify(age('2026-01-10','2026-01-10'))), {valid:true,reason:null,years:0,months:0,days:0,totalDays:0});
// Tanggal pemeriksaan sebelum lahir.
assert.equal(age('2024-01-02','2024-01-01').reason, 'before_birth');
// Perubahan tanggal pemeriksaan menghitung ulang umur pada konteks tanggal baru.
const first = age('2023-05-10','2024-05-09');
const changed = age('2023-05-10','2024-05-10');
assert.equal(formatAge(first), '0 tahun, 11 bulan, 29 hari');
assert.equal(formatAge(changed), '1 tahun, 0 bulan, 0 hari');
assert.equal(age('2023-02-30','2023-03-01').reason, 'invalid_date');
console.log('PASS usia bayi di bawah 1 tahun');
console.log('PASS ulang tahun tepat');
console.log('PASS akhir bulan dan tanggal 31');
console.log('PASS tahun kabisat / ulang tahun 29 Februari');
console.log('PASS pemeriksaan pada tanggal lahir');
console.log('PASS pemeriksaan sebelum tanggal lahir ditolak');
console.log('PASS perubahan tanggal pemeriksaan menghitung ulang usia');
console.log('PASS tanggal ISO tidak valid ditolak');
