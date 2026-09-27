# Arbor Capital Cloud — akun, database, dan harga otomatis

**Status: kode siap dipasang; layanan belum diaktifkan.** Proyek Supabase dan API key milik Anda belum tersedia. Jangan menganggap versi ini sudah tersambung ke harga live sebelum menyelesaikan langkah aktivasi dan uji akhir di bawah.

## Isi paket

- Folder utama paket: source, frontend siap hosting di `docs/`, SQL, dan fungsi backend.
- `private/PRIVATE-portfolio-import.json`: data awal pribadi dari percakapan. Folder `private/` sudah masuk `.gitignore`; **jangan paksa upload file ini ke GitHub.** Impor lewat dashboard setelah login sebagai admin.
- Versi ini menggantikan pencatatan localStorage dengan Supabase PostgreSQL. Password ditangani Supabase Auth. Frontend publik tidak memuat jumlah aset atau modal awal.
- File import mencerminkan data awal percakapan; bukan perubahan terbaru yang mungkin dibuat pada website versi lama.

## Apa yang sudah dibuat

- Login, pendaftaran dengan konfirmasi email, lupa kata sandi, dan ganti kata sandi melalui tautan pemulihan.
- Role `pending`, `viewer`, `editor`, `admin`, dan `blocked`. Pendaftaran tidak pernah otomatis menjadikan seseorang admin.
- Admin menyetujui/menolak akses dan mengubah role. Akun sendiri tidak bisa diturunkan rolenya melalui aplikasi, agar admin terakhir tidak kehilangan akses.
- Portofolio privat. Database memeriksa hak baca dan hak edit, termasuk bila seseorang memanggil API langsung.
- Pencatatan aset dengan kontrol versi untuk mencegah edit lama menimpa edit baru.
- CRUD aset lengkap: tambah, baca, edit, dan hapus. Penghapusan memerlukan konfirmasi ticker, memeriksa versi data, menghapus quote terkait, serta menulis audit log.
- Kalkulator pembelian: nominal Rupiah, harga eksekusi, dan fee otomatis dikonversi menjadi unit. Untuk saham IDX unit dibulatkan ke bawah per 100 lembar.
- Average entry efektif ditampilkan di tabel. Saat average down, pilih Edit → masukkan transaksi tambahan → Terapkan pembelian → Simpan aset; posisi dan average dihitung ulang tanpa kalkulator manual.
- Tombol **Pakai harga pasar** mengambil snapshot API sebagai referensi harga beli. Tetap cocokkan dengan fill broker/exchange karena snapshot dapat tertunda dan bukan bukti harga eksekusi.
- Pencarian instrumen CoinGecko, Yahoo Finance untuk seluruh ticker IDX, dan Twelve Data. Untuk Yahoo cukup ketik kode seperti `BBCA`, `BMRI`, `TLKM`, atau `PACK`; aplikasi otomatis memakai simbol `.JK`.
- Pemeriksaan harga setiap 60 detik selama dashboard aktif; pemeriksaan perubahan database tiap 30 detik. Ini polling, bukan streaming tick-by-tick. Halaman tersembunyi tidak melakukan polling.
- Total nilai, unrealized P/L, persentase return, alokasi, waktu harga, sumber, status pasar, dan kurs IDR dihitung ulang.
- Harga gagal tidak pernah diganti menjadi nol. Harga lama diberi penanda; aset tanpa harga menghasilkan ringkasan parsial.
- Audit perubahan aset/hak akses serta ekspor/impor JSON.

## Batasan sumber harga yang penting

| Aset | Sumber bawaan | Pembaruan / syarat |
|---|---|---|
| BTC, HYPE, SOL dan koin baru | CoinGecko Demo API | Endpoint simple/price; ID koin harus tepat; key dan kuota diperlukan. Polling minimum 60 detik. |
| ACWI dan saham/ETF lainnya | Twelve Data quote + kurs | Butuh key serta paket/izin bursa yang mencakup instrumen. Latensi aktual mengikuti paket. Ditampilkan sebagai snapshot penyedia, bukan diklaim real-time tanpa bukti. |
| PACK dan saham IDX lainnya | Yahoo Finance | Otomatis memakai `{TICKER}.JK`, misalnya `PACK.JK` dan `BBCA.JK`. Data ditandai **tertunda**, diperiksa paling cepat setiap 5 menit, dan tidak memerlukan API key. |
| Sucorinvest Money Market Fund | Harga manual awal dari screenshot | NAB berubah per hari kerja. Integrasi API publik Bibit belum berhasil diverifikasi. **Pembaruan otomatis SMMF belum aktif.** |
| Feed IDX/NAV berlisensi | Adapter JSON opsional | Pemilik backend perlu menyediakan endpoint sesuai kontrak pada `CUSTOM-FEED.md`. |

Membeli di Stockbit/Bibit tidak otomatis memberikan aplikasi ini akses API broker. Aplikasi tidak login ke rekening, mengambil token sesi broker, menyinkronkan saldo/riwayat, atau melakukan transaksi. Jumlah unit, modal, fee, dan broker tetap dicatat oleh admin/editor. Realized P/L tidak dihitung tanpa jurnal transaksi; angka referensi Rp11.551 dari infografis lama sengaja tidak dianggap sebagai hasil yang sudah diverifikasi.

**Tidak ada API universal yang menjamin semua aset baru tersedia real-time.** Yahoo Finance adalah sumber gratis yang tidak resmi untuk integrasi backend ini dan dapat berubah atau membatasi akses. Jika tidak tersedia, harga terakhir dipertahankan dan status menunjukkan masalahnya. Untuk data IDX real-time berlisensi dan NAV otomatis, hubungkan feed yang sah; jangan melabeli data tertunda/EOD/manual sebagai live.

## Aktivasi — sekali saja

### 1. Buat backend Supabase

Buat proyek Supabase milik Anda. Di SQL Editor, jalankan file migrasi secara berurutan. Pada proyek baru jalankan `202609260001_arbor.sql`, lalu `202609260002_yahoo_idx.sql`. Jika migrasi pertama sudah pernah dijalankan, cukup jalankan `202609260002_yahoo_idx.sql`; migrasi kedua menambahkan Yahoo dan memindahkan saham IDX lama tanpa mengubah jumlah unit atau modal.

Jangan mematikan RLS. Jangan mengubah fungsi signup agar membaca role dari metadata pengguna. Role diambil dari tabel membership yang hanya bisa diubah lewat fungsi admin.

### 2. Atur frontend

Edit `docs/config.js`:

```js
window.ARBOR_CONFIG = {
  supabaseUrl: "https://PROJECT_REF.supabase.co",
  supabaseAnonKey: "PUBLISHABLE_KEY_ATAU_ANON_KEY"
};
```

Dua nilai tersebut merupakan konfigurasi publik. **Service-role key, secret key, CoinGecko key, dan Twelve Data key tidak boleh diletakkan di sini.**

### 3. Upload frontend ke GitHub Pages

Upload isi folder utama ke repository GitHub, tetapi jangan upload `private/`, `node_modules/`, atau file `.env`. Jika memakai Git, `.gitignore` sudah mengecualikannya. Aktifkan **Settings → Pages → Deploy from a branch → main → /docs → Save**. File `docs/index.html` harus berada tepat di lokasi itu.

Frontend sudah dikompilasi; tidak perlu `npm install` untuk upload awal. Jika menggunakan repo versi lama, hapus/arsipkan file situs lama yang memuat data pribadi sebelum beralih ke `/docs`. Menghapus file dari branch terbaru tidak menghapus salinan pada riwayat Git yang telanjur publik.

### 4. Atur email dan URL autentikasi

Di Supabase Auth, aktifkan email/password dan konfirmasi email. Atur panjang password minimal 12, rate limit sesuai kebutuhan, serta SMTP untuk pengiriman email produksi. Set **Site URL** dan daftar **Redirect URLs** ke URL persis GitHub Pages Anda, termasuk `/nama-repository/` dan trailing slash. Aplikasi memakai URL halaman saat ini untuk konfirmasi dan pemulihan.

Login memakai sessionStorage untuk sesi, tidak menyimpan password. Tab/perangkat lain membutuhkan login tersendiri. Data aset tetap ada di database walaupun browser ditutup.

### 5. Deploy fungsi harga

Dengan CLI Supabase resmi dari direktori repo:

```sh
npx supabase login
npx supabase link --project-ref PROJECT_REF_ANDA
```

Salin `supabase/.env.example` ke file lokal `supabase/.env` dan isi:

```dotenv
COINGECKO_DEMO_API_KEY=KEY_ANDA
TWELVE_DATA_API_KEY=KEY_ANDA
ALLOWED_ORIGINS=https://USERNAME.github.io
REFRESH_SECONDS=60
```

`ALLOWED_ORIGINS` memakai **origin saja, tanpa path repository**. Beberapa origin dipisahkan koma. Simpan API key melalui Supabase secrets (bukan chat/repository):

```sh
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy market-data --no-verify-jwt
```

Jika memperbarui dari paket versi sebelumnya, deploy ulang fungsi `market-data`. Endpoint referensi harga untuk kalkulator berada di fungsi ini; tidak membutuhkan migrasi SQL tambahan.

`verify_jwt=false` pada gateway diperlukan untuk kompatibilitas key Supabase. Ini **tidak** membuat handler bebas akses: setiap request diperiksa ulang melalui Auth `/user`, email harus terkonfirmasi, dan role aktif diperiksa di database. Jangan menghapus pemeriksaan ini. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` disediakan oleh runtime Edge Functions; tidak dikirim ke frontend.

CoinGecko dan Twelve Data memiliki kuota/entitlement. Yahoo IDX dibatasi paling cepat setiap 5 menit per aset walaupun dashboard memeriksa siklus setiap 60 detik. Cache dipakai bersama antar pengguna. Max 20 aset otomatis diproses per siklus dengan urutan harga paling lama; untuk portofolio besar, pembaruan setiap aset akan lebih lambat. Request yang gagal dicoba lagi dan harga terakhir tidak diubah menjadi nol. Tidak ada penjadwal background ketika tidak ada dashboard terbuka.

### 6. Buat admin pertama secara aman

Buka website, daftar dengan email Anda, lalu konfirmasi email. Akun menjadi pending. Di SQL Editor Supabase, jalankan (ganti email dengan email Anda):

```sql
update public.memberships m
set role = 'admin'
from auth.users u
where m.user_id = u.id
  and u.email = 'EMAIL_ANDA'
  and u.email_confirmed_at is not null;
```

Pastikan tepat satu baris diperbarui. Muat ulang halaman dan pilih Periksa akses. Tidak ada fitur "pengguna pertama otomatis admin" sehingga pendaftar asing tidak dapat merebut proyek Anda.

### 7. Impor data awal

Sebagai admin, klik **Impor** dan pilih `private/PRIVATE-portfolio-import.json` dari komputer, lalu konfirmasi. Data masuk melalui API yang dilindungi role. Import tidak dikirim ke GitHub.

PACK berisi asumsi 33 lot @Rp612 termasuk fee sebagaimana catatan lama; pastikan cocok dengan transaksi Stockbit. SMMF menggunakan nilai screenshot 23 Sep 2026 dan ditandai manual. Aset otomatis tidak diberi harga palsu sebelum API pertama berhasil.

## Uji akhir setelah backend diaktifkan

1. Login admin, impor enam aset; pastikan jumlah/modal cocok dan sumber harga jelas.
2. Pastikan kripto menampilkan timestamp penyedia dan berubah sesuai pasar.
3. Tambahkan `BBCA` melalui sumber Yahoo dan pastikan tersimpan sebagai `BBCA.JK`; periksa juga PACK. Status tertunda/pasar tutup bukan error. Periksa ACWI, kurs, dan entitlement Twelve Data secara terpisah.
4. Buat akun lain dan konfirmasi email. Sebelum disetujui, portofolio tidak boleh terlihat.
5. Set akun kedua sebagai viewer: bisa membaca, tidak bisa edit. Set editor: bisa edit aset, tidak bisa mengatur role.
6. Blokir akun tersebut: API database harus menolak akses segera; UI memperbarui role di polling berikutnya (maksimum sekitar 30 detik saat aktif).
7. Matikan sementara API key pasar: harga lama harus tetap bertanggal lama dan bertanda gagal, bukan berubah nol.
8. Simpan edit dari dua tab: edit dengan versi lama harus ditolak.

## Mengembangkan source

Node.js 22+:

```sh
npm ci
npm run build
npm test
npx tsc --noEmit
npx tsc -p tsconfig.edge.json
```

Build menghasilkan `docs/assets/app.js`. Styling berada di `docs/assets/styles.css` (CSS siap pakai; utility baru tidak dihasilkan otomatis). Edit CSS biasa untuk menambah styling.

Tabel keuangan memakai NUMERIC di database. Perhitungan tampilan menggunakan number JavaScript untuk portofolio ritel, sehingga pembulatan ditampilkan dalam Rupiah; bukan ledger akuntansi presisi tanpa batas.

## Verifikasi yang telah dilakukan dalam paket

20 pengujian otomatis lulus. Pengujian lokal SQL menggunakan PGlite/PostgreSQL untuk RLS/role, perubahan status, write conflict dan audit; parser provider dengan fixture untuk currency, timestamp, cache, error dan EOD; serta perhitungan parsial. Build frontend dan type check dijalankan.

**Belum diverifikasi live:** proyek Supabase Anda, pengiriman email/SMTP, kredensial CoinGecko/Twelve Data, cakupan PACK/ACWI pada paket Anda, dan integrasi NAV Sucorinvest. Tidak ada klaim deploy/live sampai aktivasi selesai.

## Dokumentasi resmi

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase functions: https://supabase.com/docs/guides/functions
- Supabase signup: https://supabase.com/docs/reference/javascript/auth-signup
- CoinGecko prices: https://docs.coingecko.com/demo/reference/simple-price
- CoinGecko search: https://docs.coingecko.com/demo/reference/search-data
- Twelve Data: https://twelvedata.com/docs
- IDX coverage: https://twelvedata.com/exchanges/XIDX
- Yahoo Finance: https://finance.yahoo.com/
- NAB Bibit: https://faq.bibit.id/id/article/apa-itu-net-asset-value-nav-unit-penyertaan-expense-ratio-tscs04/
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
