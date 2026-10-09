# Kontrak integrasi layanan data RME

## Status implementasi

Extension ini belum terhubung ke RME produksi. Tidak ada endpoint, skema database, token, atau kredensial klinik yang diasumsikan. Tanpa `window.RMEIntegrationConfig.enabled === true`, aplikasi hanya memakai adapter simulasi yang ditandai `isDemo: true`. Adapter demo memakai `localStorage` bila tersedia dan memberi status memori sementara jika penyimpanan browser tidak tersedia.

`js/data-service.js` menyediakan batas integrasi dan adapter API yang dikonfigurasi pengelola RME. `js/app.js` menggunakan antarmuka adapter yang sama, sehingga UI tidak perlu ditulis ulang ketika route kontrak resmi disediakan. Jika konfigurasi produksi aktif tetapi tidak lengkap, adapter gagal tertutup; aplikasi tidak diam-diam berpindah ke demo.

## Konfigurasi oleh pengelola RME

Sebelum mengaktifkan integrasi, pengelola harus menyuntikkan konfigurasi non-rahasia `window.RMEIntegrationConfig` dari konfigurasi deployment/server **sebelum** `js/data-service.js` dan `js/app.js` dijalankan. Isi `baseUrl` dan setiap nilai `routes` harus disalin dari dokumentasi API resmi instalasi RME yang sebenarnya. Jangan menaruh token, password, client secret, atau kredensial database di objek JavaScript ini.

Kunci konfigurasi yang dibutuhkan:

- `enabled: true`
- `baseUrl`: origin/path dasar API yang telah disetujui
- `routes.patients`: koleksi pasien (GET daftar, POST buat)
- `routes.patient`: satu pasien, dengan parameter template `{patientId}` (GET/PUT)
- `routes.exams`: koleksi pemeriksaan (GET daftar, POST buat; GET dapat menerima query `patientId`)
- `routes.exam`: satu pemeriksaan, dengan parameter template `{examId}` (GET/PUT)
- `routes.interpretations` dan `routes.audit`: opsional untuk endpoint daftar hasil/audit yang sesuai kontrak RME
- `visitRequired: true` jika API mewajibkan ID kunjungan; direkomendasikan aktif untuk integrasi kunjungan yang sesungguhnya
- `readRetries`: opsional, 0–3; default 2 retry hanya untuk pembacaan yang gagal jaringan/HTTP 429/5xx
- `credentials`: opsional; default `same-origin`. Gunakan cookie/session yang dikelola sistem, bukan token rahasia di frontend.

Contoh berikut hanya menunjukkan **bentuk** konfigurasi; nilai route sengaja berupa placeholder dan bukan endpoint yang dapat dipanggil:

```js
window.RMEIntegrationConfig = {
  enabled: true,
  baseUrl: "<base-url-api-yang-disetujui>",
  routes: {
    patients: "<route-koleksi-pasien-dari-dokumentasi-rme>",
    patient: "<route-pasien-dengan-{patientId}>",
    exams: "<route-koleksi-pemeriksaan-dari-dokumentasi-rme>",
    exam: "<route-pemeriksaan-dengan-{examId}>",
    interpretations: "<route-hasil-jika-tersedia>",
    audit: "<route-audit-jika-tersedia>"
  },
  visitRequired: true
};
```

## Kontrak payload dan respons

Adapter mengharapkan JSON, baik respons langsung maupun dibungkus sebagai `{ "data": ... }`. Daftar boleh berupa array atau `{ "items": [...] }`. Mapping untuk DTO RME yang berbeda harus dibuat secara eksplisit di adapter setelah spesifikasi API tersedia; jangan menebak nama kolom.

Identitas yang dibutuhkan UI antara lain `id`, `name`, `medicalRecordNumber`, `birthDate`, `sexAtBirth` pada pasien, serta `id`, `patientId`, `rmeVisitId`, `examDate`, nilai ukur, status, dan metadata versi pada pemeriksaan. Sesuaikan melalui mapper adapter jika model RME resmi berbeda.

Pemeriksaan harus mengirim `patientId` dan `rmeVisitId` secara eksplisit. Respons POST/PUT pemeriksaan juga wajib mengembalikan `anthropometryCalculation` dengan `algorithmVersion`, `referenceSchemaVersion`, `calculatedAt`, dan `results` (nilai Z-score/kategori tetap null jika referensi belum tervalidasi). Adapter memeriksa provenance ini serta ID pemeriksaan/pasien/kunjungan pada respons simpan; jika tidak ada, operasi tidak dilaporkan sebagai sukses lengkap. **Backend wajib** memastikan bahwa kunjungan memang milik pasien tersebut, bahwa pengguna berhak mengakses pasien/kunjungan, serta bahwa validasi klinis dan integritas foreign-key berlaku dalam transaksi server. Pemeriksaan tanpa kunjungan hanya diizinkan jika kebijakan RME menyatakan demikian.

## Autentikasi, otorisasi, dan audit

- Adapter menggunakan `credentials: "same-origin"` secara default; tidak ada header Bearer/token yang ditanam di source frontend.
- Jika server merender token CSRF ke `<meta name="csrf-token" content="...">`, adapter meneruskannya sebagai `X-CSRF-Token`. Mekanisme CSRF harus sesuai implementasi server.
- Backend harus menerapkan autentikasi, role-based access control, pembatasan akses per pasien/organisasi, validasi seluruh input, sanitasi output, audit actor dan perubahan sebelum/sesudah, serta kebijakan retensi.
- UI tidak menganggap catatan audit browser demo sebagai audit produksi. Endpoint audit harus mengembalikan data yang diotorisasi server.
- HTTP 401/403, 404, konflik 409/412, kegagalan jaringan, dan 5xx memiliki status terpisah. Hanya GET yang diulang otomatis; operasi tulis tidak diulang otomatis agar tidak membuat duplikasi. Server perlu mendukung idempotensi dan/atau version/ETag untuk operasi tulis yang aman.
- Untuk mencegah lost update, API sebaiknya mendukung ETag/version dan `If-Match`; adapter meneruskannya bila DTO memiliki `version`. Bila server menggunakan kontrak lain, sesuaikan adapter secara eksplisit.

## Persistensi, provenance, dan pemulihan

- `localStorage` adalah penyimpanan demo di satu browser, bukan penyimpanan permanen server atau penyimpanan klinis yang aman.
- Jika penyimpanan browser gagal dan adapter beralih ke memori, UI menyebutnya sementara dan tidak mengklaim data permanen.
- Pesan sukses produksi hanya muncul setelah respons sukses dari server dan pemuatan ulang snapshot berhasil.
- Koreksi pemeriksaan harus mempertahankan ID dan histori di backend; server harus menyimpan audit append-only sesuai kebijakan.
- Snapshot hasil antropometri harus menyimpan versi algoritme, versi/skema dataset rujukan, input yang digunakan atau referensi ke versi input, waktu perhitungan, status validitas, serta provenance. Perhitungan ulang tidak boleh menimpa audit hasil sebelumnya.

## Checklist sebelum produksi

1. Pengelola memberikan dokumentasi OpenAPI/kontrak endpoint resmi, skema DTO, aturan ID kunjungan, dan lingkungan uji.
2. Pengelola mengonfigurasi autentikasi sesi/SSO, CSRF, RBAC, izin pasien, dan audit di backend.
3. Tambahkan mapper DTO dan pengujian integrasi terhadap server uji, termasuk konflik, retry, duplikasi, batas transaksi, dan akses silang pasien.
4. Uji pemulihan setelah putus jaringan dan pastikan operasi tulis gagal tidak menghasilkan pesan sukses palsu.
5. Verifikasi enkripsi transport, kebijakan log tanpa PHI, retensi, backup/restore, pemantauan, dan persetujuan keamanan sebelum memakai data nyata.
6. Jangan aktifkan produksi sampai seluruh kontrak, keamanan, dan pengujian disetujui pemilik sistem RME.
