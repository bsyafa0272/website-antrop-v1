# Menyiapkan Supabase

Adapter Supabase memakai Auth dan REST API bawaan Supabase, tanpa SDK eksternal. Integrasi aktif hanya setelah `window.SupabaseConfig.enabled` diubah menjadi `true`; konfigurasi salah akan gagal tertutup dan tidak beralih ke localStorage demo.

## Setup proyek

1. Buat proyek Supabase dan jalankan seluruh SQL di `supabase/migrations/20261010000000_anthropometry.sql` melalui SQL Editor.
2. Buat satu organisasi:

   ```sql
   insert into public.organizations (name)
   values ('Nama Klinik')
   returning id;
   ```

3. Buat/invitasikan akun staf di **Authentication → Users**. Ambil UUID pengguna dari tabel `auth.users`, lalu daftarkan ke organisasi melalui SQL Editor:

   ```sql
   insert into public.organization_members (organization_id, user_id, role)
   values ('<organization-uuid>', '<auth-user-uuid>', 'admin');
   ```

   Peran yang didukung: `admin`, `clinician`, dan `reviewer`. Reviewer hanya dapat membaca. Anggota organisasi melihat catatan organisasi yang sama.
4. Isi URL proyek, publishable/anon key, dan UUID organisasi pada `js/supabase-config.js`; kemudian set `enabled: true`.
5. Sajikan situs melalui HTTPS (HTTP localhost diperbolehkan untuk pengembangan), muat ulang, lalu masuk dengan akun yang dibuat administrator.

## Keamanan konfigurasi

- Publishable/anon key memang dikirim ke browser. Keamanan data bergantung pada RLS dan role yang benar. Migrasi mengaktifkan RLS pada semua tabel klinis dan tidak memberi akses tabel kepada role `anon`.
- Jangan menaruh `service_role` key, password staf, atau secret lain di repo, HTML, JavaScript, maupun variabel browser. Service-role hanya boleh berada pada server tepercaya dan tidak dibutuhkan oleh adapter ini.
- Buat akun staf melalui undangan administrator; pendaftaran publik tidak diaktifkan oleh aplikasi.
- Sesi memakai `sessionStorage`, token diperbarui melalui Supabase Auth, dan aksi keluar menghapus sesi browser.
- Kebijakan pada migrasi berbagi pasien/pemeriksaan dengan anggota organisasi; role admin/clinician dapat membuat dan mengoreksi data. Periksa kebijakan dan kebutuhan isolasi tenant organisasi sebelum mengimpor data.

## Data yang disimpan

`patients` menyimpan profil, `exams` menyimpan pengukuran bertanggal dan snapshot perhitungan, dan `audit_events` mencatat pembuatan/koreksi beserta perubahan sebelum/sesudah. Audit dibuat oleh trigger database dan dapat dibaca anggota organisasi. Tidak ada tombol penghapusan data di aplikasi.

## Batas validasi klinis

Snapshot Z-score yang disimpan saat ini dihitung oleh mesin browser lalu dikirim bersama catatan. Snapshot menyimpan `calculationOrigin: "browser-prototype"`; database mengamankan akses dan tipe/rentang dasar, tetapi tidak menghitung ulang formula WHO di server. Karena itu, integrasi ini cocok untuk persistensi dan uji alur dengan data yang berwenang, bukan untuk menjadikan hasil sebagai rekam klinis produksi. Sebelum produksi, pindahkan perhitungan ke backend/Edge Function yang tervalidasi, hitung ulang dari nilai tersimpan, validasi seluruh payload server-side, tinjau audit/retensi/backup, dan selesaikan persetujuan keamanan serta klinis.
