# Menyiapkan Supabase

Adapter memakai REST API Supabase tanpa SDK eksternal. `publicDemo: true` mengaktifkan demo publik tanpa login, sedangkan `publicDemo: false` memakai login staf. Keduanya gagal tertutup dan tidak beralih ke localStorage jika backend aktif tetapi gagal.

## Setup proyek

1. Buat proyek Supabase. Jalankan isi `supabase/migrations/20261010000000_anthropometry.sql`, lalu `supabase/migrations/20261011000000_public_synthetic_demo.sql` melalui SQL Editor.
2. Buat **organisasi khusus demo** dengan tanda publik:

   ```sql
   insert into public.organizations (name, is_public_demo)
   values ('Demo Antropometri Sintetis', true)
   returning id;
   ```

   Isi `organizationId` di `js/supabase-config.js` dengan UUID hasil ini. Jangan tandai organisasi staf/klinik yang berisi data lain sebagai demo publik. Untuk organisasi demo yang sudah ada, tandai hanya setelah memastikan seluruh isinya sintetis:

   ```sql
   update public.organizations
   set is_public_demo = true
   where id = '<organization-uuid>';
   ```

3. Isi URL proyek, publishable/anon key, dan UUID organisasi demo pada `js/supabase-config.js`; atur `enabled: true` dan `publicDemo: true`.
4. Buka `supabase/seeds/public_demo_dummy_data.sql`, lalu jalankan isinya di SQL Editor. File ini sudah memakai UUID organisasi dari konfigurasi lokal. Seed membuat pasien sintetis Jaka Widada dengan lima pengukuran longitudinal dan aman dijalankan ulang.
5. Sajikan situs melalui HTTPS (HTTP localhost diperbolehkan untuk pengembangan), lalu muat ulang. Tidak ada akun yang perlu dimasukkan.
6. Untuk mode staf privat, buat/invitasikan akun pada **Authentication → Users**, daftarkan UUID akun pada `organization_members`, lalu ubah `publicDemo: false`.

## Keamanan konfigurasi

- Publishable/anon key memang dikirim ke browser. Dalam mode publik, role `anon` hanya mendapat akses ke baris di organisasi bertanda `is_public_demo`; jangan tandai organisasi yang berisi data klinis nyata.
- Pengunjung demo publik dapat melihat serta mengoreksi data sintetis bersama. Pembatasan penghapusan tidak mencegah spam atau perubahan merusak; gunakan hanya untuk data buatan dan reset data demo bila perlu.
- Jangan menaruh `service_role` key, password staf, atau secret lain di repo, HTML, JavaScript, maupun variabel browser. Service-role hanya boleh berada pada server tepercaya dan tidak dibutuhkan oleh adapter ini.
- Mode demo publik tidak memakai Auth. Mode staf memakai sesi `sessionStorage`, refresh token Supabase Auth, dan tombol keluar.
- Kebijakan akses staf tetap berbasis keanggotaan organisasi; role admin/clinician dapat membuat dan mengoreksi data, reviewer hanya membaca.

## Data yang disimpan

`patients` menyimpan profil, `exams` menyimpan pengukuran bertanggal dan snapshot perhitungan, dan `audit_events` mencatat pembuatan/koreksi beserta perubahan sebelum/sesudah. Audit dibuat oleh trigger database dan dapat dibaca anggota organisasi. Tidak ada tombol penghapusan data di aplikasi.

## Batas validasi klinis

Snapshot Z-score yang disimpan saat ini dihitung oleh mesin browser lalu dikirim bersama catatan. Snapshot menyimpan `calculationOrigin: "browser-prototype"`; database mengamankan akses dan tipe/rentang dasar, tetapi tidak menghitung ulang formula WHO di server. Karena itu, integrasi ini cocok untuk persistensi dan uji alur dengan data yang berwenang, bukan untuk menjadikan hasil sebagai rekam klinis produksi. Sebelum produksi, pindahkan perhitungan ke backend/Edge Function yang tervalidasi, hitung ulang dari nilai tersimpan, validasi seluruh payload server-side, tinjau audit/retensi/backup, dan selesaikan persetujuan keamanan serta klinis.
