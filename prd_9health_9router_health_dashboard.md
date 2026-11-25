# Product Requirements Document (PRD): 9health (9router Health Dashboard)

| Informasi Dokumen | Detail |
| :--- | :--- |
| **Nama Produk** | 9health (9router Health Dashboard) |
| **Versi Dokumen** | 1.1 (Revisi Final MVP) |
| **Arsitektur** | Standalone Web Companion App + Thin Local Proxy (Terhubung ke API lokal 9router) |
| **Status** | Siap untuk Verifikasi Kontrak API & Perancangan Teknis |

---

## 1. Ringkasan Eksekutif & Latar Belakang

### 1.1 Konteks Masalah
**9router** mempermudah pengelolaan dan *routing* otomatis ke berbagai penyedia (*provider*) AI. Namun, ekosistem model AI—khususnya tier **gratis (free tier)**—sangat tidak stabil. Provider secara berkala menonaktifkan model, mengubah *Model ID*, menurunkan batas *rate limit*, atau mencabut akses gratis tanpa pemberitahuan.

Hal ini menimbulkan tiga kendala utama bagi pengguna aktif:
1. **Tingginya Biaya Maintenance:** Pengecekan manual satu per satu untuk memastikan model masih aktif sangat memakan waktu.
2. **Konfigurasi Combo Rusak Diam-diam:** Model yang sudah mati (*deprecated*) tetap tersangkut di dalam *Combo*, menyebabkan kegagalan *request* atau *fallback* yang lambat.
3. **Context Window Bottleneck:** Pengguna sering tidak menyadari bahwa satu model berkapasitas kecil (misalnya `128K` token) di dalam sebuah *Combo* berisi model berkapasitas besar (`1M` token) dapat menurunkan kapasitas memori efektif seluruh *Combo* tersebut, sehingga AI cepat "lupa" saat sesi panjang.

### 1.2 Solusi Produk
**9health** adalah aplikasi *dashboard* independen (*companion app*) yang berjalan berdampingan dengan 9router. Aplikasi ini berfungsi sebagai pusat kontrol kesehatan (*health monitoring*), pembersihan model mati, manajemen *Combo*, serta analisis spesifikasi dan kapasitas *context window* secara *real-time*.

---

## 2. Target Pengguna, Tujuan & Batasan Ruang Lingkup

### 2.1 Target Pengguna
* **AI Enthusiast & Free-Tier Hunter:** Pengguna yang aktif mengumpulkan, menguji, dan merotasi berbagai API AI gratis dari banyak provider di 9router.
* **Developer / Power User:** Pengguna yang memanfaatkan 9router untuk kebutuhan *coding agent*, otomasi, atau percakapan konteks panjang yang menuntut kestabilan *Combo* dan dukungan fitur lanjutan seperti *tool calling*.

### 2.2 Tujuan Utama (Goals)
* Memangkas waktu pengecekan seluruh model aktif hingga **>80%** menggunakan sistem *Rapid Scan* yang aman dari blokir provider.
* Menghilangkan kesalahan hapus model akibat *rate limit* sementara atau ketidakcocokan parameter tes melalui klasifikasi status error yang akurat.
* Memberikan visibilitas penuh terhadap batas **Effective Context Window** dan potensi *bottleneck* di setiap *Combo*.
* Memungkinkan proses *audit → perbaikan (hapus/tambah/edit Combo)* selesai dalam satu antarmuka tanpa berpindah aplikasi.

### 2.3 Batasan Ruang Lingkup (Out of Scope / Non-Goals)
Untuk menjaga fokus pengembangan MVP, hal-hal berikut secara eksplisit **tidak** termasuk dalam ruang lingkup 9health:
* **Bukan Chat UI / Playground:** 9health tidak menyediakan antarmuka percakapan AI penuh, manajemen prompt, atau perbandingan kualitas jawaban antar model.
* **Tidak Mengelola Kredensial & Billing Provider:** Penambahan/penyimpanan API Key provider, pengisian saldo (*top-up*), dan pengaturan *billing* tetap sepenuhnya dikelola di 9router atau dashboard provider masing-masing.
* **Local-First & Single-User (MVP):** Versi MVP hanya ditujukan untuk penggunaan lokal (*localhost*) oleh satu pengguna, tanpa sistem akun multi-user, RBAC, atau *cloud hosting*.
* **Tidak Memodifikasi File Konfigurasi 9router Secara Mentah:** Semua perubahan konfigurasi model dan *Combo* dilakukan melalui API resmi/lokal 9router.

---

## 3. Arsitektur, Integrasi & Persistensi Data

* **Aplikasi Independen (Companion App):** Dibangun terpisah dari *codebase* 9router agar aman dari *merge conflict* saat 9router merilis pembaruan resmi.
* **Thin Local Backend / Proxy (Rekomendasi Arsitektur):** 9health dijalankan bersama *local backend/proxy* ringan agar permintaan ke API lokal 9router tidak terblokir **CORS** di browser, sekaligus menjadi tempat penyimpanan data lokal 9health secara persisten.
* **Konfigurasi Koneksi 9router:** Pengguna dapat mengatur *Base URL/Port* 9router (default lokal) serta *API Key / Admin Token* (opsional, jika autentikasi lokal diaktifkan di 9router) melalui halaman pengaturan.
* **Kontrak API 9router & Prasyarat Teknis (Dependency Kritis):**
  * 9health bergantung pada ketersediaan *endpoint* lokal 9router untuk: membaca & mengelola daftar model, membaca & mengelola daftar *Combo* (termasuk urutan *fallback*), serta mengirim *inference test request*.
  * **Syarat Wajib Direct Model Test (Bypass Fallback):** Saat melakukan *health check*, permintaan ke 9router **wajib** menargetkan 1 model spesifik tanpa memicu *auto-fallback* atau *internal retry* ke model lain, guna mencegah hasil *Healthy* palsu (*false positive*) dan distorsi pengukuran latensi.
  * *Catatan Implementasi:* Validasi ketersediaan seluruh *endpoint* dan mekanisme *bypass fallback* di 9router menjadi langkah verifikasi pertama (*API Contract Check*) sebelum pengembangan fitur dimulai.
* **Persistensi Data Lokal 9health:** Data operasional yang tidak disimpan oleh 9router—yaitu timestamp *Last Checked*, hasil scan terakhir, *Manual Override* metadata (*context window*/kapabilitas), cache *Metadata Registry*, serta *Scan History* (Fase 2)—disimpan secara lokal oleh 9health (mis. SQLite / file JSON lokal pada *backend* ringan).
* **Unified Launcher (Rekomendasi Operasional):** Disediakan skrip pembuka tunggal (`.bat`/`.sh` atau `docker-compose.yml`) untuk menyalakan 9router terlebih dahulu, mengecek kesiapan *port*, lalu otomatis menjalankan 9health.

---

## 4. Ruang Lingkup Fitur (Functional Requirements)

> Setiap sub-fitur ditandai secara eksplisit dengan label **`[MVP]`** (Fase 1) atau **`[Fase 2]`** (Post-MVP) agar selaras penuh dengan Roadmap di Bagian 7.

### Fitur 1: Sistem Scanning & Klasifikasi Kesehatan (Health Scanner)

#### FR-1.1 Mode & Cakupan Scan (Scan Scope) `[MVP]`
Pengguna dapat memilih target pemindaian sebelum menekan tombol scan:
* **Scan All:** Memindai seluruh model dari semua provider yang aktif.
* **Scan by Provider:** Memindai seluruh model milik satu atau beberapa provider tertentu.
* **Scan by Combo:** Memindai hanya model-model yang tergabung dalam *Combo* tertentu.
* **Single Model Scan:** Tombol scan individual pada setiap baris/kartu model.

#### FR-1.2 Mode Kecepatan, Batas Konkurensi & Kontrol Proses `[MVP]`
* **Single Scan (Sequential):** Memindai 1 model pada satu waktu (paling aman untuk provider dengan *rate limit* sangat ketat).
* **Rapid Scan (Concurrent):** Memindai secara paralel dengan batas maksimal **5 model paralel secara global** (*global concurrency limit = 5*) **dan pembatasan per-provider** (maksimal **1–2 request paralel per provider/API Key**, atau jeda *pacing* singkat antar-request pada provider yang sama) untuk mencegah *rate limit (429)* massal atau pemblokiran IP/API Key.
* **Kontrol Proses & Penyimpanan Parsial:** Tersedia tombol *Stop/Cancel Scan* serta *progress bar* yang menampilkan jumlah model selesai/total. Jika pengguna membatalkan scan di tengah proses, **seluruh hasil model yang sudah selesai dipindai tetap disimpan dan ditampilkan**, sedangkan model yang belum diproses mempertahankan status sebelumnya.

#### FR-1.3 Mekanisme Pengecekan Hemat Kuota & Kompatibilitas Model `[MVP]`
* **Direct Lightweight Test:** Pengujian dilakukan dengan *test prompt* ringan (contoh: pesan `"hi"` dengan `max_tokens: 1`) langsung ke model target melalui 9router (**tanpa auto-fallback**) agar validitas respons benar-benar teruji (bukan sekadar cek daftar `/models`).
* **Penanganan Model Reasoning / Parameter Khusus:** Beberapa model *reasoning/thinking* menolak parameter `max_tokens: 1` dan mewajibkan `max_completion_tokens` atau batas token minimum tertentu. Jika sistem menerima penolakan parameter (HTTP 400 non-model), sistem melakukan *fallback payload* yang kompatibel atau menandainya secara terpisah agar tidak salah diklasifikasikan sebagai *Dead*.
* **Timeout Terkonfigurasi:** Batas waktu tunggu per model memiliki nilai default **15 detik** dan dapat disesuaikan oleh pengguna di pengaturan (mis. 5–60 detik).
* **Proteksi Kuota Harian (RPD):** Setiap model menampilkan label **Last Checked** (contoh: *"Diperiksa 12 menit lalu"*) untuk mencegah scan berulang yang memboroskan *Request Per Day (RPD)*.

#### FR-1.4 Klasifikasi Status Error (Granular Status) `[MVP]`
Klasifikasi hasil scan ditentukan berdasarkan **kombinasi HTTP status code dan inspeksi isi error body/code** (untuk mengantisipasi provider yang mengembalikan HTTP 200 berisi payload error, atau HTTP 400 untuk *invalid model ID*):
1. **Healthy (Hijau - HTTP 200 valid tanpa error body):** Model merespons normal.
2. **Rate Limited / Busy (Kuning - HTTP 429 / 503):** Model masih ada, tetapi sedang padat atau kuota sementara habis.
3. **Auth / Quota Exhausted (Oranye - HTTP 401 / 402 / 403):** API Key tidak valid, kedaluwarsa, atau saldo/kredit akun habis.
4. **Dead / Deprecated (Merah - HTTP 404 / 410, atau HTTP 400 khusus Invalid/Deprecated Model ID):** Model sudah dihapus atau diubah namanya oleh provider.
5. **Transient / Provider Error (Ungu - HTTP 500 / 502 / 504, atau HTTP 400 ketidakcocokan parameter non-model):** Gangguan server sementara dari provider atau kendala format request; tidak otomatis dianggap *Dead*.
6. **Timeout / Network Error (Abu-abu):** Tidak ada respons dalam batas waktu *timeout* atau terjadi gangguan jaringan.

---

### Fitur 2: Manajemen Model & Combo Terintegrasi

#### FR-2.1 Penghapusan Model (Single & Bulk Delete) `[MVP]`
* **Hapus Individual:** Tombol hapus langsung pada setiap model.
* **Hapus Massal (Bulk Delete):** Fitur centang (*checkbox*) untuk menghapus beberapa model sekaligus, dilengkapi tombol pintasan **"Pilih Semua Model Dead"**.
* **Smart Safety Guard:** Pintasan pilih massal secara *default* **hanya mencentang model berstatus Dead / Deprecated (Merah)**. Model berstatus *Rate Limited (Kuning)*, *Transient Error (Ungu)*, dan *Timeout (Abu-abu)* tidak ikut tercentang otomatis agar tidak terhapus secara tidak sengaja.

#### FR-2.2 Penanganan Dampak Combo (Cascade Impact) `[MVP]`
* Sebelum penghapusan dieksekusi, sistem memeriksa apakah model tersebut sedang digunakan di dalam *Combo* mana pun.
* Jika terpakai, muncul dialog konfirmasi yang menampilkan daftar *Combo* terdampak beserta opsi:
  * **Hapus & Bersihkan dari Combo:** Menghapus model dari daftar sekaligus mengeluarkannya dari *Combo* terkait.
  * **Swap Model (Ganti Cepat):** Mengganti posisi model mati di dalam *Combo* dengan model lain yang berstatus *Healthy* (dengan saran urutan berdasarkan latensi terendah & *context window* setara/lebih besar).
* **Penanganan Combo Tunggal (Edge Case):** Jika model yang akan dihapus adalah **satu-satunya model tersisa** di dalam sebuah *Combo*, sistem menampilkan peringatan khusus agar tidak meninggalkan *Combo* kosong/invalid, dengan pilihan: **Swap ke Model Healthy**, **Hapus Model beserta Combo-nya**, atau **Batalkan**.

#### FR-2.3 Penambahan Model & Provider Sync
* **Tambah Model Manual `[MVP]`:** Form cepat untuk menambah *Model ID*, memilih *Provider*, dan mengisi metadata dasar (*context window*, *max output token*).
* **Fetch dari Provider / Model Hunter `[Fase 2]`:** Tombol untuk menarik daftar model terbaru langsung dari *endpoint* provider, lalu membandingkannya dengan daftar yang sudah terpasang. Menampilkan penanda khusus untuk model baru (*New*) dan filter pencarian (misalnya filter kata kunci `:free`).

#### FR-2.4 Pengaturan Combo di Dalam Dashboard `[MVP]`
* Melihat daftar semua *Combo* beserta urutan prioritas (*fallback order*) model di dalamnya.
* Membuat *Combo* baru, menambah/menghapus anggota model, serta mengubah urutan *fallback* (via *drag-and-drop* atau tombol naik/turun).

---

### Fitur 3: Intelijen Model & Context Window Awareness

#### FR-3.1 Detail Spesifikasi Model
Setiap kartu/baris model menampilkan informasi berikut:
* **Context Window `[MVP]`:** Kapasitas konteks (contoh: `32K`, `128K`, `200K`, `1M` token) atau label `Unknown` jika belum tersedia.
* **Max Output Token `[MVP]`:** Batas token keluaran maksimal (jika tersedia).
* **Metrik Kecepatan `[MVP]`:** Menampilkan **Response Latency** (waktu respons *round-trip* dari *lightweight test* non-streaming) atau **TTFT (Time to First Token)** apabila pengujian dijalankan dalam mode *streaming* (`stream: true`), dalam satuan milidetik/detik dari hasil scan terakhir untuk membantu mengurutkan prioritas *Combo*.
* **Capability Badges `[Fase 2]`:** Deteksi dan tampilan ikon/label otomatis untuk dukungan fitur **Tool Calling**, **Vision**, dan **Reasoning/Thinking**.

#### FR-3.2 Deteksi Context Bottleneck pada Combo `[MVP]`
* **Kalkulasi Effective Context:** Setiap *Combo* secara otomatis menghitung kapasitas konteks aman berdasarkan **nilai terkecil (Lowest Common Denominator)** dari seluruh model aktif di dalamnya.
  * *Contoh:* Jika Combo A berisi Model 1 (`1M`), Model 2 (`200K`), dan Model 3 (`128K`), maka *Effective Context* Combo A adalah **`128K`**.
* **Penanganan Model dengan Metadata `Unknown`:** Jika ada model di dalam *Combo* yang kapasitas konteksnya belum diketahui (`Unknown`), dashboard tetap menampilkan kalkulasi dari model yang diketahui namun wajib menyertakan label peringatan ***"Parsial: ada model dengan Context Window tidak diketahui"*** serta pintasan cepat ke *Manual Override*.
* **Aturan Ambang Bottleneck Warning Badge:** Lencana peringatan (*"Bottleneck: Membatasi Combo ke 128K"*) muncul secara otomatis apabila terdapat model dengan kapasitas konteks **≤ 50% (setengah atau kurang)** dari kapasitas model terbesar di dalam *Combo* yang sama. (Pada Fase 2, model yang sedang di-*quarantine* tidak dihitung dalam kalkulasi *Effective Context* maupun *bottleneck*).

#### FR-3.3 Sumber Data Metadata (Fallback Hierarchy) `[MVP]`
Karena tidak semua provider menyediakan data *context window* secara konsisten, sistem menggunakan urutan sumber berikut:
1. **API 9router / Provider:** Mengambil metadata langsung jika tersedia.
2. **Metadata Registry (Lokal Ter-cache):** Mencocokkan nama model dengan katalog referensi (seperti struktur katalog OpenRouter/LiteLLM) yang di-cache secara lokal oleh 9health.
3. **Manual Override:** Pengguna dapat mengisi atau mengoreksi angka *context window* (dan *capability* pada Fase 2) secara manual jika model belum terdaftar atau datanya tidak akurat. Nilai *Manual Override* selalu diprioritaskan di atas katalog referensi.

---

### Fitur 4: Fitur Pendukung, Navigasi & Keamanan Aksi (QoL)

* **FR-4.1 Filter & Pencarian Cepat:**
  * **`[MVP]`:** Pencarian nama/ID model serta filter berdasarkan **Status** (*Healthy, Dead, Rate Limited, Auth/Quota, Transient, Timeout*), **Provider**, **Combo**, dan **Minimal Context Window** (misal: `>= 128K`).
  * **`[Fase 2]`:** Tambahan filter berdasarkan **Kemampuan** (*Tool Calling, Vision, Reasoning*).
* **FR-4.2 Soft Disable / Quarantine `[Fase 2]`:** Opsi untuk menonaktifkan sementara (*mute*) model yang sedang bermasalah dari rotasi *Combo* tanpa menghapus konfigurasinya, sehingga bisa diuji kembali di kemudian hari.
* **FR-4.3 Riwayat Kesehatan Ringkas (Scan History) `[Fase 2]`:** Menampilkan indikator visual dari **5 hasil scan terakhir** (misal: 5 titik berwarna sesuai status) pada tiap model untuk membedakan model yang memang sering mati dengan yang baru pertama kali error.

---

## 5. Alur Penggunaan Utama (User Flows — MVP)

### Alur 1: Rutinitas Pembersihan Model Gratis `[MVP]`
1. Pengguna membuka 9health (indikator menunjukkan terhubung ke 9router lokal).
2. Memilih scope **"Scan All"** dan mode **"Rapid Scan (Max 5 Global, Per-Provider Safe)"**.
3. Sistem memindai seluruh model secara asinkron dan menampilkan hasil berdasarkan klasifikasi status secara *real-time*.
4. Pengguna memfilter status **Dead / Deprecated**, klik **"Pilih Semua Model Dead"** (model *Rate Limited* tidak ikut tercentang), lalu klik **"Hapus"**.
5. Dialog *Cascade Impact* muncul karena 1 model mati terpakai di *Combo Coding*. Pengguna memilih opsi **Swap** ke model gratis lain yang berstatus *Healthy* dengan latensi rendah.
6. Perubahan tersimpan langsung ke 9router melalui API lokal.

### Alur 2: Optimasi Context Window pada Combo `[MVP]`
1. Pengguna membuka tab **Combo Manager** dan memilih *Combo A*.
2. Dashboard menampilkan status: **Effective Context: 128K** disertai **Bottleneck Warning Badge** pada *Model X (`128K`)* karena kapasitasnya ≤ 50% dibanding model lain di *Combo A* (`1M`).
3. Pengguna mengeluarkan/menghapus *Model X* dari *Combo A* (atau menonaktifkannya sementara lewat *Quarantine* pada Fase 2).
4. Dashboard langsung memperbarui metrik *Combo A* menjadi **Effective Context: 1M** dan menghilangkan peringatan *bottleneck*.

---

## 6. Persyaratan Non-Fungsional (NFR)

* **NFR-1 Keamanan Kredensial:** API Key provider tetap dikelola sepenuhnya oleh 9router. 9health tidak menyimpan *plaintext* API Key provider di sisi *browser/frontend*.
* **NFR-2 Performa & Responsivitas:** Antarmuka harus tetap responsif saat proses *Rapid Scan* berjalan, dengan pembaruan hasil per model secara asinkron/streaming segera setelah tiap model selesai diuji.
* **NFR-3 Penanganan Koneksi Terputus:** Jika layanan 9router belum aktif, port berubah, atau terputus di tengah jalan, 9health menampilkan indikator *"9router Disconnected"* dengan tombol *Retry Connection* dan pintasan ke Pengaturan Koneksi tanpa menyebabkan *crash*.
* **NFR-4 Pengalaman Visual & Aksesibilitas (UX):** Menggunakan *dark mode* sebagai tampilan bawaan (*default*) yang nyaman untuk pemantauan. Setiap status kesehatan wajib dibedakan menggunakan **kombinasi warna kontras + ikon + label teks** (tidak hanya mengandalkan warna) agar mudah dipindai sekilas.
* **NFR-5 Konsistensi Data Lokal:** Data lokal 9health (*Last Checked*, *Manual Override*, cache registry) tetap tersimpan lintas sesi browser dan tidak hilang saat halaman di-*refresh*.

---

## 7. Roadmap Pengembangan

### Fase 1: MVP (Minimum Viable Product)
* Integrasi API lokal 9router (via *thin local proxy*), halaman Pengaturan Koneksi, indikator status koneksi, serta penyimpanan state lokal 9health.
* Health Scanner: *Single & Rapid Scan* (maks 5 global + *per-provider concurrency*), Scope (*All / Provider / Combo / Single*), tombol *Stop/Cancel* dengan penyimpanan hasil parsial, *timeout* terkonfigurasi, dan *fallback payload* untuk model *reasoning*.
* Klasifikasi 6 status error granular (berbasis HTTP + *error body*) + metrik *Response Latency* + label *Last Checked*.
* Hapus model (*Single & Bulk* dengan *Smart Safety Guard* & dialog *Cascade Impact* termasuk penanganan *Combo* 1 model dan *Quick Swap*).
* Tambah model manual & pengelolaan dasar *Combo* (buat, edit, hapus, ubah urutan *fallback*).
* Tampilan *Context Window* & *Max Output Token* per model + kalkulasi *Effective Context* (termasuk penanganan status `Unknown`) + *Bottleneck Warning* (ambang ≤ 50%) di *Combo*.
* Hirarki *Metadata Registry* lokal + *Manual Override*.
* Filter & Pencarian Cepat (Status, Provider, Combo, Minimal Context Window).

### Fase 2: Peningkatan Produktivitas (Post-MVP)
* **Provider Sync (Model Hunter):** Deteksi otomatis model gratis baru yang rilis di provider + filter kata kunci `:free`.
* **Soft Disable / Quarantine:** Menonaktifkan model sementara dari rotasi *Combo* (dan mengecualikannya dari kalkulasi *Effective Context*) tanpa menghapus konfigurasi.
* **Scan History (5 titik riwayat)** & grafik uptime sederhana.
* **Capability Badges** otomatis (*Tool Calling, Vision, Reasoning*) + filter berdasarkan kemampuan.
* **Export / Import Konfigurasi** daftar model, *Combo*, dan *Manual Override* sebagai *backup*.

### Fase 3: Automasi Lanjutan (Future)
* **Scheduled Auto-Scan:** Pemindaian berkala otomatis di latar belakang (misal setiap pagi) dengan notifikasi lokal/Telegram/Discord jika ada model inti yang mati.
* **Auto-Heal Combo:** Opsi otomatis menonaktifkan model berstatus *Dead (`404`/`410`)* dari *Combo* secara mandiri jika gagal 3 kali berturut-turut.

---

## 8. Metrik Keberhasilan & Counter-Metrics

### 8.1 Metrik Keberhasilan (Success Metrics)
* **Efisiensi Waktu Audit:** Pengecekan 50 model selesai dalam waktu **< 60 detik** menggunakan mode *Rapid Scan* (pada kondisi latensi respons normal, di luar model yang mengalami *timeout* penuh).
* **Zero Accidental Deletion:** `0` model berstatus *Rate Limited (`429`)*, *Transient Error*, atau *Timeout* yang terhapus melalui aksi *Bulk Delete* bawaan.
* **Akurasi Visibilitas Konteks:** `100%` *Combo* menampilkan *Effective Context* akurat untuk model bermetadata lengkap, menyoroti *bottleneck* (≤ 50%), serta menandai secara eksplisit jika ada model berstatus `Unknown`.

### 8.2 Counter-Metrics (Guardrails)
* **0% False-Positive Dead:** Tidak ada model sehat (termasuk model *reasoning* atau model di belakang *auto-fallback* 9router) yang salah diklasifikasikan sebagai *Dead* akibat format *request test* yang tidak kompatibel atau hasil *fallback* yang bocor.
* **Minimal Quota Overhead & Zero Provider Ban:** Eksekusi *Rapid Scan* dengan pembatasan *per-provider concurrency* tidak memicu pemblokiran permanen API Key dan menjaga konsumsi token tes pada batas minimum per model.
