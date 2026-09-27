# Adapter feed IDX / NAB (opsional)

Ini kontrak internal Arbor, BUKAN endpoint resmi Stockbit/Bibit yang sudah aktif. Adapter ini disediakan untuk sumber data berlisensi/diizinkan yang dipilih pemilik backend.

Atur `CUSTOM_MARKET_URL` dan opsional `CUSTOM_MARKET_TOKEN` di secrets Supabase. URL tidak pernah diisi pengunjung; hanya pemilik backend. Harus HTTPS. Redirect tidak diikuti. Endpoint ini mendapat `GET ?id=<provider_id>` dan header Bearer jika token diisi. Respons harus:

```json
{
  "id": "ID_UNIK_DARI_FEED_ANDA",
  "price_idr": 1993.15,
  "as_of": "2026-09-25T16:00:00+07:00",
  "source": "Nama penyedia resmi",
  "status": "nav",
  "market_open": false
}
```

- Harga per satu unit/lembar dalam IDR, bukan total kepemilikan.
- `as_of` = waktu data dari sumber, bukan waktu HTTP request dibuat.
- `status`: `nav` untuk NAB harian, `eod` untuk akhir hari, `delayed` untuk tertunda, `automatic` hanya bila feed mendukung pembaruan intraday otomatis.
- Aplikasi membandingkan ID persis; quote untuk instrumen lain ditolak.
- Jika data tidak ada/kadaluarsa, kirim non-2xx atau as_of yang sebenarnya. Jangan mengganti waktu dengan sekarang atau mengembalikan nol.
- Untuk suatu aset, pilih Feed khusus lalu isi ID yang dikenali endpoint.
- Kegagalan source mempertahankan harga terakhir dan menampilkan error. Tidak ada fallback diam-diam ke instrumen lain.

Jika belum memiliki sumber yang terverifikasi, gunakan Manual. Sucorinvest belum memiliki konektor otomatis dalam paket ini.
