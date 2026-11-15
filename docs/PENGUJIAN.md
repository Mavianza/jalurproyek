# Hasil pengujian JalurProyek 1.0

Dilakukan 15 November 2026 WITA pada Linux, Node.js 24.22.1, dan Python 3.12.14.

## Pemeriksaan otomatis yang dijalankan

| Perintah | Hasil aktual |
| --- | --- |
| `node --test tests/*.test.mjs` | 25 tes lulus, 0 gagal, 0 dilewati |
| `npm run check` | Pemeriksaan sintaks modules model, planner, storage, diagrams, app lulus |
| `python3 -m unittest discover -s tests -p "test_*.py" -v` | 6 tes HTTP/peluncur lulus |

Total 31 tes otomatis. Salah satu tes Node menjalankan 200 graf DAG sintetis dengan seed tetap dan membandingkan durasi serta kelonggaran setiap tugas terhadap enumerasi semua jalur root-ke-sink. Perubahan urutan tugas/prasyarat juga harus menghasilkan objek perhitungan yang sama.

Tes integrasi sesi menguji alur normal create/update/reload/backup/import, penolakan siklus tanpa penulisan, penolakan backup invalid, kegagalan baca/tulis/reset, dan konflik nilai dasar pada dua sesi. Kegagalan kuota merupakan simulasi `setItem` yang melempar error sebelum mengubah penyimpanan; bukan klaim pengujian kerusakan disk atau listrik padam.

## Uji browser aktual

Dilakukan melalui kontrol antarmuka pada Chrome desktop dalam lingkungan pratinjau. Source yang dipakai sama dengan aplikasi rilis; server peluncur Python diperiksa terpisah oleh tes HTTP nyata.

| Alur | Hasil yang diamati |
| --- | --- |
| Muat contoh dan konfirmasi | 7 tugas, 8 hubungan, total 16 jam, 5 tugas kritis |
| Pilih Siapkan dataset, simulasi 4 → 1 jam | Simulasi 15 jam; rencana aktif masih 16 jam |
| Terapkan lalu reload | Total 15 jam dan durasi tugas 1 jam bertahan |
| Ubah Susun kebutuhan agar menunggu Demo akhir | Dialog menampilkan lintasan siklus; perubahan ditolak |
| Impor JSON dengan prasyarat X yang tidak ada | Ditolak; rencana aktif tetap 15 jam |
| Tambah Latihan presentasi 2 jam tanpa prasyarat | Total tetap 15 jam; kelonggaran 13 jam |
| Hapus tugas tambahan melalui konfirmasi | Kembali ke 7 tugas |
| Tempel dan impor backup contoh valid | Total kembali 16 jam |
| Unduh Backup JSON | Berkas unduhan terbentuk; dibandingkan dengan dokumen contoh |
| Beralih ke Graf tugas dan unduh SVG | Graf 8 hubungan tampil; unduhan dibaca sebagai XML SVG |

Screenshot `timeline.jpg` dan `graf.jpg` memperlihatkan rencana aktif 16 jam dengan simulasi 15 jam yang belum diterapkan. Keduanya merupakan tangkapan aplikasi yang benar-benar berjalan.

Belum diuji pada perangkat seluler, browser selain Chrome, mode privat, dan klik dua kali launcher Windows. CSS responsif serta launcher Windows disertakan, tetapi dukungannya tidak diklaim telah diuji di perangkat tersebut. Jaminan penyimpanan berlaku untuk satu tab aktif dan operasi localStorage yang berhasil/ditolak sesuai perilaku API; pemeriksaan tab tertinggal bukan pengunci untuk penulisan serentak.
