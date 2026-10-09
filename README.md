# Pemantauan Antropometri Longitudinal Anak — Klinik Padjadjaran Jatinangor

**Status: prototipe terintegrasi untuk pengujian alur; bukan aplikasi klinis produksi.** Paket saat ini memakai data sintetis/demo kecuali pengelola mengonfigurasi API RME yang benar. Dataset LMS WHO resmi dan benchmark independen belum dipasang, sehingga Z-score, kategori antropometri, dan kurva rujukan klinis sengaja tidak diaktifkan.

## 1. Deskripsi aplikasi

Extension front-end untuk meninjau profil anak, mencatat pengukuran antropometri berdasarkan tanggal kunjungan, menelusuri riwayat longitudinal, serta meninjau nilai mentah dan status kelengkapan. Usia dihitung dari tanggal lahir profil dan tanggal pemeriksaan. Grafik memplot pengukuran yang tersedia pada repository untuk pasien terpilih; grafik tidak membuat garis rujukan WHO palsu.

Halaman utama:

- **Dashboard** — ringkasan pasien dan pemeriksaan.
- **Daftar Pasien / Profil Pasien** — identitas, tanggal lahir, dan riwayat.
- **Pemeriksaan Baru / Detail Pemeriksaan** — tanggal pemeriksaan, usia otomatis, pengukuran, validasi, dan koreksi.
- **Riwayat Pemeriksaan** — daftar catatan dengan relasi pasien.
- **Kurva Pertumbuhan** — titik longitudinal dari riwayat yang tersimpan, pemilihan indeks, detail titik, cetak, dan ekspor CSV.
- **Ringkasan Laporan** — ringkasan jumlah catatan; bukan laporan klinis tervalidasi.
- **Jejak Perubahan** — audit lokal demo atau peristiwa yang disediakan backend bila API mendukungnya.

## 2. Teknologi

- HTML5, CSS3, dan JavaScript vanilla; tidak membutuhkan framework atau dependensi runtime eksternal.
- SVG untuk grafik; `localStorage` hanya untuk persistensi demo browser.
- Node.js dan modul bawaan `assert` untuk menjalankan pengujian mandiri tanpa dependensi tambahan.
- Fetch API untuk adapter RME yang dikonfigurasi.

## 3. Struktur direktori

```text
pediatric-anthropometry/
├── index.html                       # Shell, navigasi, pemuatan skrip
├── css/styles.css                   # Tata letak dan responsivitas
├── js/data.js                       # Fixture sintetis (4 pasien, 6 pemeriksaan)
├── js/anthropometry.js              # Utilitas tanggal, usia, label, escaping
├── js/growth-reference-data.js      # Registry standar/dataset dan gerbang aktivasi
├── js/growth-engine.js              # Rumus, validasi, cakupan indeks, LMS
├── js/growth-chart.js               # Model, plot SVG, ekspor CSV
├── js/repository.js                 # Repository demo, validasi, audit lokal
├── js/data-service.js               # Adapter API dan batas integrasi RME
├── js/app.js                        # Halaman, interaksi, formulir, status layanan
├── data/references/manifest.json    # Versi/status dataset, hash dan benchmark
├── data/references/README.md        # Petunjuk dataset rujukan
├── docs/ANTHROPOMETRY-STANDARDS.md  # Sumber standar, algoritme, gerbang klinis
├── docs/RME-INTEGRATION-CONTRACT.md # Kontrak dan kebutuhan backend
└── tests/                           # Pengujian usia, mesin, grafik, data, UI
```

## 4. Instalasi dan menjalankan aplikasi

### Prasyarat

- Browser modern (Chrome, Edge, Firefox, atau setara).
- Node.js LTS untuk menjalankan pengujian.
- Visual Studio Code opsional untuk membuka dan mengedit proyek.

### Langkah

1. Ekstrak ZIP proyek ke folder kerja.
2. Buka folder `pediatric-anthropometry` di VS Code (`File → Open Folder`).
3. Untuk melihat demo, buka `index.html` di browser. Tidak ada langkah build dan tidak ada `npm install` yang diperlukan.
4. Alternatif untuk menjalankan melalui server lokal: buka terminal VS Code pada folder proyek, lalu jalankan `npx serve .` (memerlukan akses untuk mengunduh paket bila belum tersedia), kemudian buka URL lokal yang dicetak terminal. Jika organisasi melarang paket eksternal, gunakan ekstensi Live Server yang telah disetujui atau server statis internal.
5. Gunakan hanya data demo sintetis. Jangan memasukkan identitas, catatan, atau hasil pemeriksaan pasien nyata.

## 5. Konfigurasi

### Mode demo (default)

Jika `window.RMEIntegrationConfig` tidak diaktifkan, aplikasi memakai repository demo. Data awal berisi empat pasien sintetis dan enam pemeriksaan sintetis. Perubahan disimpan di `localStorage` browser yang sama bila tersedia; bila tidak tersedia, penyimpanan menjadi memori sementara dan akan hilang saat halaman ditutup/dimuat ulang. Gunakan profil browser terpisah bila ingin menguji dari awal; jangan menganggap localStorage sebagai database klinis.

### Mode RME (belum dikonfigurasi)

Tidak ada URL API, endpoint, skema basis data, token, atau kredensial RME Klinik Padjadjaran yang disertakan. Pengelola RME harus menyediakan kontrak endpoint dan konfigurasi deployment. Sebelum `js/data-service.js` dan `js/app.js` dijalankan, server/deployment harus menyuntikkan objek konfigurasi nonrahasia `window.RMEIntegrationConfig` sesuai contoh placeholder di [`docs/RME-INTEGRATION-CONTRACT.md`](docs/RME-INTEGRATION-CONTRACT.md).

Kunci utama: `enabled`, `baseUrl`, `routes.patients`, `routes.patient`, `routes.exams`, `routes.exam`; `visitRequired` ditetapkan sesuai aturan kunjungan RME. Endpoint harus mengikuti kontrak DTO yang terdokumentasi atau dipetakan eksplisit. Jangan memasukkan token Bearer, password, client secret, atau kredensial database ke JavaScript. Jika konfigurasi produksi aktif tetapi salah/tidak lengkap atau skrip adapter tidak tersedia, aplikasi gagal tertutup dan tidak beralih ke demo.

Backend wajib menangani autentikasi, RBAC, batas akses pasien/organisasi, validasi server, relasi pasien-kunjungan, transaksi, perlindungan CSRF yang sesuai, audit, version/ETag atau idempotensi, retensi, backup, dan pemantauan. Keberhasilan simpan hanya boleh dikonfirmasi setelah respons backend yang memenuhi kontrak dan pemuatan ulang data berhasil.

## 6. Pengujian

Dari terminal pada folder proyek:

```sh
npm test
npm run check
```

- `npm test` menjalankan pengujian usia, formula/validasi mesin antropometri, pemilihan indeks dan gerbang dataset, grafik longitudinal, repository demo, adapter API dengan fetch tiruan, serta alur UI smoke test dan kegagalan tertutup jika skrip adapter produksi tidak termuat.
- `npm run check` menjalankan `node --check` pada modul dan test JavaScript.
- Pengujian adapter menggunakan mock, bukan backend RME sungguhan. Lulusnya tes ini tidak membuktikan integrasi, keamanan, atau akurasi klinis produksi.

## 7. Sumber standar antropometri

Sumber yang didokumentasikan dalam `docs/ANTHROPOMETRY-STANDARDS.md` dan `data/references/manifest.json`:

1. WHO Child Growth Standards (2006): <https://www.who.int/tools/child-growth-standards>
2. Perangkat lunak dan paket R WHO `anthro`: <https://www.who.int/toolkits/child-growth-standards/software>
3. WHO Growth Reference 2007 untuk usia 5–19 tahun dan alat AnthroPlus: <https://www.who.int/tools/growth-reference-data-for-5to19-years/application-tools>
4. Permenkes RI Nomor 2 Tahun 2020 tentang Standar Antropometri Anak: <https://jdih.kemkes.go.id/storage/documents/pdfs/2020permenkes002.pdf>

Daftar tersebut menyatakan rujukan yang direncanakan, **bukan** bahwa dataset atau hasil algoritme sudah divalidasi. File LMS resmi belum dibundel; lisensi dataset, hash SHA-256, dan benchmark independen terhadap WHO Anthro/AnthroPlus belum lengkap. Lihat manifest untuk status terbaru.

## 8. Ringkasan algoritme

- Tanggal diperiksa dalam format kalender ISO; tanggal tidak valid, tanggal sebelum lahir, dan tanggal pemeriksaan masa depan ditolak oleh alur formulir/repository.
- Usia kalender diturunkan dari tanggal lahir dan tanggal pemeriksaan; usia dalam hari serta usia bulan algoritmik digunakan sesuai kebutuhan indeks.
- IMT mentah dihitung sebagai `berat_kg / (tinggi_cm / 100)^2` jika kedua nilai valid. IMT mentah bukan kategori IMT/U.
- Koreksi panjang/tinggi 0,7 cm tersedia mengikuti konvensi WHO (di bawah 24 bulan, tinggi berdiri dikonversi ke panjang telentang; mulai 24 bulan, panjang telentang dikonversi ke tinggi berdiri) dan memerlukan jenis pengukuran yang dicatat.
- Mesin menyediakan formula LMS, interpolasi antar titik yang tersedia, koreksi ekstrem, batas cakupan usia, dan pemblokiran ekstrapolasi. Namun perhitungan Z-score klinis dinonaktifkan karena dataset resmi yang diverifikasi dan benchmark independen belum tersedia. Karena itu kategori dan kurva rujukan tidak boleh dianggap hasil klinis.
- Setiap snapshot perhitungan menyimpan versi algoritme/skema referensi, waktu hitung, status dataset, dan status tiap indeks. Hasil yang tidak valid/tidak dihitung tidak diberi kategori normal sebagai pengganti.

## 9. Batasan sistem

- Ini adalah prototipe front-end; belum ada server klinik, database klinis, SSO, autentikasi, atau otorisasi yang disediakan oleh paket ini.
- Data demo tidak nyata dan tidak boleh dicampur dengan data pasien sebenarnya.
- Belum ada dataset LMS WHO yang terverifikasi, hash dataset, tinjauan lisensi dataset, atau benchmark independen; Z-score, kategori klinis, dan kurva referensi tetap nonaktif.
- Validasi formulir sisi klien tidak menggantikan validasi backend atau SOP pengukuran. Rentang ekstrem hanya memicu verifikasi, bukan membuktikan kesalahan.
- Usia koreksi prematur tidak diterapkan otomatis. LK/U dan LiLA/U tidak diberi kategori otomatis pada modul ini.
- Ringkasan laporan belum merupakan laporan klinis final; ekspor laporan PDF tidak tersedia. Ekspor CSV hanya untuk titik kurva yang dibentuk dari riwayat aplikasi.
- Uji keamanan, privasi, usability dengan staf, integrasi terhadap lingkungan uji RME, pemulihan backup, dan validasi klinis belum dilakukan.

## 10. Panduan data demo

1. Pastikan indikator antarmuka menunjukkan **Mode demo**.
2. Buka profil sintetis yang ada atau buat pasien uji dengan identitas yang jelas fiktif.
3. Tambahkan pemeriksaan dengan tanggal pemeriksaan dan satuan yang benar; tanggal lahir diambil dari profil, usia diperbarui otomatis.
4. Periksa riwayat dan grafik untuk memastikan catatan baru ditambahkan, bukan mengganti pemeriksaan terdahulu.
5. Bila nilai berada di luar rentang kewajaran, periksa kembali sumber pengukuran sebelum memilih lanjut. Sistem tidak mengubah nilai otomatis.
6. Untuk memulai ulang, hapus data situs untuk origin demo dari pengaturan browser atau gunakan profil browser terpisah. Penghapusan ini akan menghilangkan perubahan demo lokal.

## 11. Status integrasi RME

**Belum terhubung ke backend RME produksi.** Adapter dan kontrak integrasi tersedia, tetapi tidak ada konfigurasi endpoint nyata atau kredensial. Uji API bersifat simulasi/mock. Sebelum integrasi, minta dokumentasi API/OpenAPI resmi, contoh DTO yang disetujui, aturan ID kunjungan, lingkungan uji, mekanisme autentikasi, kebijakan akses, audit, dan pemilik integrasi. Ikuti checklist di [`docs/RME-INTEGRATION-CONTRACT.md`](docs/RME-INTEGRATION-CONTRACT.md).

**Jangan gunakan aplikasi ini untuk keputusan klinis atau data pasien nyata sampai integrasi, validasi klinis, keamanan, privasi, dan tata kelola telah diuji serta disetujui secara formal.**
