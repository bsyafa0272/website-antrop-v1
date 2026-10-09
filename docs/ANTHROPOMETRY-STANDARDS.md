# Antropometri anak: sumber, algoritme, dan status aktivasi

## Status aktivasi saat ini

**Perhitungan klinis Z-score sengaja belum diaktifkan.** Kode mesin dan kontrak dataset sudah tersedia, tetapi paket ini belum berisi tabel LMS resmi yang diverifikasi maupun keluaran benchmark independen WHO. Mesin tidak boleh menampilkan Z-score/kategori klinis sampai dataset resmi ditambahkan dan seluruh benchmark independen lolos. Saat ini BMI mentah dapat dihitung sebagai `berat_kg / (tinggi_cm / 100)^2`, tetapi itu bukan interpretasi IMT/U.

## Standar dan cakupan indeks

| Indeks | Standar | Cakupan referensi yang dikonfigurasi | Kategori |
|---|---|---|---|
| BB/U | WHO Child Growth Standards | 0–60 bulan | Permenkes RI 2/2020 |
| PB/U atau TB/U | WHO Child Growth Standards | 0–60 bulan | Permenkes RI 2/2020 |
| BB/PB atau BB/TB | WHO Child Growth Standards | 0–60 bulan | Permenkes RI 2/2020 |
| IMT/U | WHO Child Growth Standards | 0–60 bulan | Permenkes RI 2/2020 |
| LK/U | WHO Child Growth Standards | hanya jika data referensi tersedia, 0–60 bulan | tidak ada kategori otomatis pada modul ini |
| LiLA/U | WHO Child Growth Standards | hanya jika data referensi tersedia, 3–60 bulan | tidak ada kategori otomatis pada modul ini |
| TB/U | WHO Growth Reference 2007 | 61–228 bulan | WHO 2007; perlu validasi kategorisasi klinis Indonesia untuk kelompok usia ini |
| IMT/U | WHO Growth Reference 2007 | 61–228 bulan | Permenkes RI 2/2020 untuk 5–18 tahun; WHO reference untuk cakupan 19 tahun perlu tinjauan kebijakan |

WHO 2007 juga memiliki BB/U hanya sampai 10 tahun. Indeks itu tidak diaktifkan di mesin ini untuk usia 5–19 tahun karena cakupan yang diminta adalah TB/U dan IMT/U; implementasi BB/U 5–10 tahun memerlukan aturan tambahan yang jelas.

## Dataset, algoritme, dan lisensi

1. WHO Child Growth Standards: https://www.who.int/tools/child-growth-standards
2. WHO application tools and R package `anthro`: https://www.who.int/toolkits/child-growth-standards/software
3. WHO Growth Reference 2007 (5–19 years), termasuk AnthroPlus dan paket R `anthroplus`: https://www.who.int/tools/growth-reference-data-for-5to19-years/application-tools
4. Permenkes RI Nomor 2 Tahun 2020, Standar Antropometri Anak: https://jdih.kemkes.go.id/storage/documents/pdfs/2020permenkes002.pdf

WHO R packages `anthro` 1.1.0 (GPL-3) dan `anthroplus` 1.1.0 (GPL-3 atau lebih baru) menjadi sumber audit algoritme dan contoh keluaran independen. Lisensi paket algoritme tidak otomatis menyelesaikan hak redistribusi setiap dataset tabel/kurva; verifikasi syarat WHO untuk setiap berkas data sebelum menyertakannya ke aplikasi distribusi.

## Skema data rujukan yang diterima

`GrowthReferenceData.registerDataset()` menerima objek dengan `standardId`, `indexType`, `sex` (`male`/`female`), `datasetVersion`, `sourceUrl`, `rows`, serta opsional `extremeCorrection`. Setiap baris harus memiliki `axis`, `L`, `M`, `S` finite, dengan `M > 0` dan `S > 0`. Baris harus berasal dari file resmi yang versi dan hash-nya dicatat; jangan membuat/menaksir parameter LMS manual.

Mesin menggunakan LMS, penanganan limit L mendekati nol melalui `ln(X/M)/S`, interpolasi hanya di dalam cakupan dataset, dan koreksi ekor Z-score berbasis SD ±2/±3 bila `extremeCorrection` dataset mengizinkan. Tidak ada ekstrapolasi di luar batas tabel. Pengukuran panjang/tinggi mengikuti koreksi WHO 0,7 cm: anak <24 bulan yang diukur berdiri dikonversi ke panjang terlentang (+0,7 cm); usia ≥24 bulan yang diukur terlentang dikonversi ke tinggi berdiri (−0,7 cm). Catatan posisi pengukuran harus tersedia untuk indeks yang memerlukannya.

## Pembaruan dataset (wajib sebelum produksi)

1. Unduh tabel resmi dan dokumentasi dari tautan WHO di atas atau ambil sumber paket WHO yang versi/commit-nya dipatok.
2. Catat nama file, versi/tanggal rilis, URL sumber, hash SHA-256, lisensi, tanggal pengunduhan, dan siapa yang meninjau.
3. Konversi secara reproduktif ke skema JSON LMS, tanpa mengubah nilai presisi; jangan menyalin nilai dari grafik gambar.
4. Tambahkan benchmark WHO/Anthro/AnthroPlus independen yang mencakup kedua jenis kelamin, setiap indeks, batas usia, koreksi panjang/tinggi, L mendekati nol, dan nilai ekstrem. Bandingkan hasil dengan toleransi yang ditentukan dan ditinjau.
5. Uji ulang versi baru berdampingan dengan versi lama. Simpan versi dataset/algoritme pada setiap hasil; jangan menimpa hasil lama tanpa jejak audit.
6. Baru setelah seluruh benchmark lulus, ubah status dataset menjadi tersedia dan lakukan peninjauan klinis serta keamanan sebelum pemakaian pasien nyata.

## Interpretasi

Ambang BB/U, PB/TB/U, BB/PB/TB, dan IMT/U balita mengikuti Tabel kategori dan ambang batas dalam Permenkes RI 2/2020. Ambang IMT/U usia 5–18 tahun juga diambil dari peraturan yang sama. LK/U dan LiLA/U tidak diberi kategori otomatis karena belum dikonfigurasi ambang nasional yang disetujui pada modul ini. Hasil satu indeks tidak membuat diagnosis otomatis; anomali harus ditinjau bersama kualitas pengukuran, riwayat pertumbuhan, kondisi klinis, dan indeks lain.

## Benchmark independen yang belum selesai

Belum ada file dataset LMS resmi dan belum ada perbandingan eksekusi mesin ini terhadap keluaran WHO Anthro/AnthroPlus yang independen. Ini adalah penghambat rilis yang disengaja, bukan dianggap lulus. Test suite membuktikan formula, validasi, pemilihan cakupan, no-extrapolation, koreksi pengukuran, status unavailable, dan kegagalan tertutup; test tersebut **tidak** membuktikan akurasi klinis WHO tanpa dataset dan benchmark resmi.
