# Antropometri anak: sumber, algoritme, dan status aktivasi

## Status

Paket sekarang membundel LMS dari paket WHO-maintained `anthro` 1.1.0 dan `anthroplus` 1.1.0. Z-score berjalan otomatis di browser; kurva dan interpretasi pratinjau ikut berubah saat pengukuran sedang dimasukkan. Contoh resmi WHO Anthro pada README dan fixture uji WHO AnthroPlus telah dicocokkan pada presisi dua desimal untuk indikator yang diuji. Ini adalah benchmark representatif, bukan validasi klinis penuh atau persetujuan penggunaan produksi. Lihat provenance, hash, lisensi, dan cakupan di `data/references/manifest.json`.

JDIH Kementerian Kesehatan mencantumkan Permenkes RI Nomor 2 Tahun 2020 tentang Standar Antropometri Anak berstatus berlaku per 10 Oktober 2026. Hasil aplikasi tetap merupakan dukungan skrining: telaah mutu pengukuran, kondisi klinis (termasuk edema), tren, dan penilaian tenaga kesehatan.

## Cakupan indeks

| Indeks | LMS | Rentang operasi | Kategori otomatis |
|---|---|---:|---|
| BB/U | WHO Child Growth Standards 2006 | 0–<60 bulan | Permenkes 2/2020 |
| PB/U atau TB/U | WHO Child Growth Standards 2006 | 0–<60 bulan | Permenkes 2/2020 |
| BB/PB atau BB/TB | WHO Child Growth Standards 2006 | 0–<60 bulan | Permenkes 2/2020 |
| IMT/U | WHO Child Growth Standards 2006 | 0–<60 bulan | Permenkes 2/2020 |
| LK/U | WHO Child Growth Standards 2006 | 0–<60 bulan | Z-score saja |
| LiLA/U | WHO Child Growth Standards 2006 | 3–<60 bulan | Z-score saja |
| BB/U | WHO Growth Reference 2007 | 60–<121 bulan | Z-score saja |
| TB/U | WHO Growth Reference 2007 | 60–<229 bulan | Z-score saja; Permenkes tidak menetapkan kategori otomatis TB/U usia sekolah di modul ini |
| IMT/U | WHO Growth Reference 2007 | 60–<229 bulan | Kategori Permenkes 2/2020; usia 19 tahun perlu tinjauan kebijakan |

Rentang tersebut mengikuti usia presisi `hari / 30,4375` untuk batas indeks. Referensi WHO 2007 menyimpan baris bulan bulat dan parameter L, M, S diinterpolasi linier di antara barisnya. BB/U 5–10 tahun hanya menghasilkan Z-score; modul tidak memasang kategori nasional untuk indeks ini.

## Provenance data dan lisensi

Sumber standar WHO:

1. WHO Child Growth Standards 2006: <https://www.who.int/tools/child-growth-standards>
2. Paket WHO `anthro` dan alat penerapan: <https://www.who.int/toolkits/child-growth-standards/software>
3. WHO Growth Reference 2007 dan AnthroPlus: <https://www.who.int/tools/growth-reference-data-for-5to19-years/application-tools>
4. WHO `anthroplus` di CRAN: <https://cran.r-project.org/package=anthroplus>
5. Permenkes RI No. 2 Tahun 2020: <https://jdih.kemkes.go.id/documents/peraturan-menteri-kesehatan-nomor-2-tahun-2020>

Sumber LMS persis dipertahankan sebagai `data/references/source/anthro-1.1.0-sysdata.rda` dan `anthroplus-1.1.0-sysdata.rda`. `tools/build_who_reference_bundle.py` membuat `js/growth-reference-datasets.js`; nilai LMS tidak ditaksir dari grafik. Paket `anthro` menggunakan GPL-3 dan `anthroplus` GPL-3-or-later. Teks lisensi disimpan di `data/references/source/licenses/`; hash file sumber dan bundle dicatat di manifest. Jangan mengganti tabel atau metadata tanpa memperbarui hash, versi, dan hasil pembandingan.

## Metode hitung

- Usia dihitung dari tanggal lahir dan pemeriksaan. WHO 2006 menggunakan usia hari; WHO 2007 menggunakan usia bulan (`hari / 30,4375`). LMS diinterpolasi hanya di dalam rentang resmi; ekstrapolasi ditolak.
- Rumus LMS memakai `((X/M)^L − 1)/(L×S)` dan limit `ln(X/M)/S` saat L mendekati nol. Koreksi ekor Z di atas +3 atau di bawah −3 hanya digunakan untuk indeks yang ditandai demikian di sumber WHO. TB/U memakai Z-score tidak terkoreksi sebagaimana fungsi WHO.
- Koreksi posisi ukur mengikuti WHO Anthro: usia <731 hari memakai panjang terlentang; usia ≥731 hari memakai tinggi berdiri. Ukuran dari posisi kebalikannya dikonversi dengan 0,7 cm. Jenis/posisi ukur wajib tersedia untuk indeks PB/TB dan IMT.
- IMT dihitung dari berat dibagi tinggi dalam meter kuadrat. Untuk IMT/U, tinggi/panjang dikoreksi ke posisi standar lebih dulu.
- Tabel LMS dipilih berdasarkan standar, indeks, jenis kelamin, dan untuk BB/PB/TB juga posisi standar panjang atau tinggi. Dataset lain tidak dipakai sebagai fallback.
- Status edema pitting bilateral dikumpulkan per pemeriksaan. BB/U, IMT/U, dan BB/PB/TB ditahan jika statusnya belum diketahui atau edema ditemukan; konfirmasikan status klinis dan ikuti protokol tata laksana setempat.

## Kategori dan batas interpretasi

Ambang otomatis balita BB/U, PB/TB/U, BB/PB/TB, dan IMT/U dikonfigurasi dari Permenkes 2/2020. IMT/U 5–18 tahun mengikuti ambang peraturan yang sama. TB/U usia sekolah, BB/U WHO 2007, LK/U, LiLA/U, serta IMT/U pada usia 19 tahun hanya menampilkan Z-score karena kategori nasionalnya belum dikonfigurasi. Kategori bukan diagnosis dan tidak menangkap seluruh konteks klinis.

Usia koreksi prematur tidak diterapkan otomatis. Pengukuran ekstrem memerlukan verifikasi sumber dan alat. Validasi antarmuka tidak menggantikan SOP klinik, pemeriksaan fisik, atau penilaian klinisi.

## Validasi sebelum produksi

Repo menyertakan provenance dan pencocokan contoh/fixture upstream, tetapi belum melakukan perbandingan menyeluruh terhadap eksekusi WHO Anthro/AnthroPlus untuk kedua jenis kelamin, semua indeks, batas usia, nilai ekstrem, posisi ukur, dan versi paket. Sebelum penggunaan klinis/RME produksi, lakukan benchmark independen tersebut, tinjauan klinis, keamanan dan privasi, peninjauan lisensi deployment, serta uji di lingkungan RME. Hasil lulus dari unit test saja tidak akan menyetujui penggunaan klinis.
