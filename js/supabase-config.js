/*
 * Konfigurasi mode demo publik. organizationId wajib menunjuk organisasi
 * khusus sintetis yang ditandai is_public_demo oleh migrasi Supabase.
 * Publishable/anon key memang dipakai browser; jangan gunakan secret key.
 * Jangan pernah menaruh service_role key di file ini.
 */
window.SupabaseConfig = Object.freeze({
  enabled: true,
  publicDemo: true,
  url: "https://dlimocrafoflksmuzezd.supabase.co",
  anonKey: "sb_publishable_z4syMpY9T_eBWHP-J5wumA_LlmtI62b",
  organizationId: "97d31d90-6c36-4d93-ad42-865daa5346ff"
});
