# 📦 Iconnet Enterprise Asset & Inventory Manager
> Solusi Manajemen Inventaris Kantor & Pemetaan Aset Berbasis **Node.js, Express, Prisma ORM & PostgreSQL**.

![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)
![Prisma](https://img.shields.io/badge/Prisma-5.22.0-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%7C%2018-336791.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)
![Security](https://img.shields.io/badge/Security-Helmet%20%2B%20Bcrypt%20%2B%20RateLimit-red.svg)

---

## 🚀 Fitur Utama

### 💎 Ultra-Modern Glassmorphism UI (2026 Edition)
- **Isometric 3D Login Page**: Desain futuristik dengan latar belakang ilustrasi gedung 3D Iconnet & PLN (`img/background.png`), cyber grid overlay, dan kartu kaca melayang (*frosted glass blur 24px*).
- **Modern Typography**: Menggunakan kombinasi font kelas atas **Plus Jakarta Sans** (kenyamanan baca teks) dan **Outfit** (judul & display metriks).
- **Interactive Bento Grid Stat Cards**: Kartu statistik dengan aksen gradien neon untuk masing-masing kategori hardware (Monitor, PC, Laptop, Headset, TV, Keyboard, Mouse) disertai elevasi kartu 3D dan animasi *hover depth*.
- **Micro-Interactions (Anti-Kaku)**: Respon taktil pegas (`active:scale-95`), *sheen sweep glow* pada tombol utama, dan placeholder *skeleton shimmer wave* (meniadakan teks kaku "Loading...").
- **Tabel Konsolidasi 8 Kolom**: Tampilan data aset terpadu, spesifikasi merk & nomor seri, status kondisi sebelum/sesudah, checklist kelayakan, dan aksi lengkap dengan pengurutan kolom (*sorting*) multi-arah yang stabil.

### 🗄️ Backend Modular & Prisma ORM (PostgreSQL Dialect)
- **Dukungan Penuh PostgreSQL**: Menggunakan engine database relasional **PostgreSQL** (v16 / v18) melalui **Prisma ORM** yang strongly-typed, ACID-compliant, dan teroptimasi.
- **Clean Architecture (`src/`)**:
  - `src/config/`: Singleton Prisma Client terisolasi.
  - `src/validators/`: Validasi payload runtime ketat dengan **Zod Schema**.
  - `src/services/`: Logika bisnis mandiri untuk Inventaris, Denah Kubikel, Serah Terima (Handover), Audit Log Histori, dan Statistik.
  - `src/controllers/`: Layer HTTP controller yang bersih dan terstruktur.
  - `src/middlewares/`: Proteksi **Helmet CSP**, **Rate Limiting** per IP/endpoint login, dan **CORS**.
- **Keamanan Kredensial**: Password akun dienkripsi menggunakan hashing **Bcrypt** dengan salt 10 rounds.

### 🗺️ Interactive Office Mapping & Floor Plan
- **Visual Map Designer**: Kanvas interaktif untuk merancang dan menata letak kubikel kantor secara *drag-and-drop*.
- **Asset Assignment**: Memetakan inventaris barang langsung ke kode kubikel fisik tertentu.
- **Live Real-time Monitoring**: Visualisasi status terisi vs kosong di dashboard utama kantor.

### ✍️ Digital Signature & Handover (Berita Acara)
- **Form Serah Terima Resmi**: Pencatatan pihak penyerah, pihak penerima, tanggal serah terima, perubahan kondisi fisik, dan nomor berita acara otomatis.
- **Digital Canvas Signature**: Tanda tangan digital langsung di layar perangkat (desktop & mobile).
- **Export Excel & PDF**: Cetak label barcode/QR terisolasi dan ekspor data ke Excel/PDF siap pakai.

---

## 🛠️ Tech Stack

| Layer | Teknologi |
| :--- | :--- |
| **Frontend** | Semantic HTML5, CSS3 Glassmorphism, Vanilla JS, Plus Jakarta Sans, Outfit, Chart.js, SignaturePad |
| **Backend Core** | Node.js (v18+/v20 LTS), Express.js |
| **ORM & Database** | **Prisma ORM 5.22.0** dengan **PostgreSQL 16 / 18** |
| **Security & Validation** | Bcrypt.js, Zod, Helmet, Express-Rate-Limit, CORS |
| **Deployment** | Multi-Stage Dockerfile, Docker Compose, Nginx Reverse Proxy |

---

## 📁 Struktur Folder Proyek (Clean Architecture)

Proyek ini telah distrukturisasi mengikuti kaidah fundamental pemisahan tanggung jawab (*Separation of Concerns*) antara Frontend dan Backend:

```
Inventaris_Iconnet/
├── public/                      # 🎨 FRONTEND ASSETS
│   ├── css/
│   │   └── style.css            # Desain antarmuka & responsivitas
│   ├── js/
│   │   └── app.js               # Client logic, denah kantor & manipulasi DOM
│   ├── img/                     # Logo, background login, favicon
│   ├── index.html               # Halaman utama aplikasi (SPA)
│   ├── login.html               # Halaman autentikasi pengguna
│   └── manifest.json            # Web App Manifest
│
├── src/                         # ⚙️ BACKEND (Clean MVC Layered Architecture)
│   ├── config/                  # Koneksi database & konfigurasi Prisma
│   ├── controllers/             # Handler request/response HTTP
│   ├── middlewares/             # Security (Helmet, CORS, Rate Limit), Validator, Error Handler
│   ├── routes/                  # Definisi endpoint RESTful API (/api/*)
│   ├── services/                # Logika bisnis inti (Business Logic Layer)
│   └── validators/              # Skema validasi data request (Zod)
│
├── prisma/                      # 🗄️ Database ORM Schema (PostgreSQL)
│   ├── schema.prisma
│   └── seed.js
│
├── scripts/                     # 🛠️ Script Utilitas & Pengujian
│   ├── test-integration.js      # Otomasi pengujian integrasi API
│   ├── create-cert.js           # Pembuat sertifikat SSL lokal
│   └── list-users.js            # Inspeksi akun terdaftar
│
├── nginx/                       # 🌐 Konfigurasi Web Server Reverse Proxy & SSL
│   ├── conf.d/default.conf
│   └── ssl/
│
├── barcode/                     # 📦 Penyimpanan file fisik QR Code unit aset
├── server.js                    # 🚀 Entrypoint server Express.js
├── Dockerfile                   # Multi-stage container build
└── docker-compose.yml           # Orkestrator Docker (PostgreSQL 16 + Node.js + Nginx)
```

---

## ⚙️ Cara Menjalankan Aplikasi

### Opsi 1: Menjalankan Secara Lokal (Node.js & PostgreSQL)

1. **Clone Repositori:**
   ```bash
   git clone https://github.com/imamn04/Inventaris_Iconnet.git
   cd Inventaris_Iconnet
   ```

2. **Install Dependensi:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment:**
   Salin `.env.example` menjadi `.env` dan sesuaikan kredensial PostgreSQL Anda:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://postgres:password@localhost:5432/inventaris_iconnet?schema=public"
   ```

4. **Inisialisasi Database:**
   Pastikan service PostgreSQL di komputer/server Anda menyala, buat database `inventaris_iconnet`, lalu impor data awal atau sinkronkan schema Prisma:
   ```bash
   # Impor database awal dari file dump SQL
   psql -U postgres -d inventaris_iconnet -f iventaris_db.sql

   # Generate Prisma Client & sinkronkan skema
   npx prisma generate
   npx prisma db push
   ```

5. **Jalankan Aplikasi:**
   ```bash
   npm start
   # atau
   node server.js
   ```
   Buka di browser: **`http://localhost:3000`**

   **Kredensial Default:**
   - **Username:** `admin`
   - **Password:** `admin123`

---

### Opsi 2: Menjalankan dengan Docker Compose (Server Lokal / LAN Kantor)

Sangat direkomendasikan untuk deployment di server lokal atau VPS. Pastikan Docker & Docker Compose telah terpasang, lalu jalankan satu perintah:

```bash
docker compose up -d --build
```

**Layanan yang Otomatis Berjalan:**
- **`iconnet_postgres`**: Database **PostgreSQL 16 Alpine** (Port `5432`) dengan auto-import database dari `iventaris_db.sql` pada startup awal dan volume data persisten (`postgres_data`).
- **`iconnet_app`**: Aplikasi Node.js multi-stage build ber-alokasi RAM aman dengan auto-sync tabel (`npx prisma db push`).
- **`iconnet_nginx`**: Nginx Reverse Proxy pada **Port 80/443** dengan kompresi Gzip dan cache barcode.

**Akses Jaringan Lokal:**
Seluruh komputer dan HP yang berada dalam satu jaringan Wi-Fi/LAN kantor dapat langsung membuka sistem melalui IP lokal server:
👉 **`http://<IP_SERVER_LOKAL>`** (Contoh: `http://192.168.1.50`) tanpa perlu mengetik port `:3000`.

---

## 🧪 Pengujian Otomatis (Integration Tests)

Jalankan test suite integrasi API menyeluruh:
```bash
npm test
```
*Test suite akan menguji status endpoint statistik, otentikasi Bcrypt login, data inventaris, posisi kubikel denah, dan riwayat serah terima pada database PostgreSQL.*

---

## 📄 Lisensi
Hak Cipta &copy; 2026 PT Indonesia Comnets Plus (Iconnet). Dilindungi Undang-Undang.
