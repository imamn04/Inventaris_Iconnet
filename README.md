# 📦 Iconnet Enterprise Asset & Inventory Manager
> Solusi Manajemen Inventaris Kantor & Pemetaan Aset Berbasis **Node.js, Express, Prisma ORM & MySQL**.

![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)
![Prisma](https://img.shields.io/badge/Prisma-5.22.0-blue.svg)
![MySQL](https://img.shields.io/badge/MySQL-8.0-orange.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)
![Security](https://img.shields.io/badge/Security-Helmet%20%2B%20Bcrypt%20%2B%20RateLimit-red.svg)

---

## 🚀 Fitur Utama

### 💎 Ultra-Modern Glassmorphism UI (2026 Edition)
- **Aurora Glow Login Page**: Desain futuristik dengan *dynamic mesh aurora background*, cyber grid overlay, kartu kaca melayang (*frosted glass blur 24px*), dan tombol *Auto Fill* instan untuk testing.
- **Modern Typography**: Menggunakan kombinasi font kelas atas **Plus Jakarta Sans** (kenyamanan baca teks) dan **Outfit** (judul & display metriks).
- **Interactive Bento Grid Stat Cards**: Kartu statistik dengan aksen gradien neon untuk masing-masing kategori hardware (Monitor, PC, Laptop, Headset, TV, Keyboard, Mouse) disertai elevasi kartu 3D dan animasi *hover depth*.
- **Micro-Interactions (Anti-Kaku)**: Respon taktil pegas (`active:scale-95`), *sheen sweep glow* pada tombol utama, dan placeholder *skeleton shimmer wave* (meniadakan teks kaku "Loading...").

### 🗄️ Backend Modular & Prisma ORM (MySQL Dialect)
- **Migrasi Penuh ke MySQL**: Sepenuhnya beralih dari PostgreSQL lama ke MySQL melalui **Prisma ORM** yang strongly-typed.
- **Clean Architecture (`src/`)**:
  - `src/config/`: Singleton Prisma Client terisolasi.
  - `src/validators/`: Validasi payload runtime ketat dengan **Zod Schema**.
  - `src/services/`: Logika bisnis mandiri untuk Inventaris, Denah Kubikel, Serah Terima (Handover), Audit Log Histori, dan Statistik.
  - `src/controllers/`: Layer HTTP controller yang bersih dan terstruktur.
  - `src/middlewares/`: Proteksi **Helmet CSP**, **Rate Limiting** per IP/endpoint login, dan **CORS**.
- **Keamanan Kredensial**: Password admin dienkripsi menggunakan hashing **Bcrypt** dengan salt 10 rounds.

### 🗺️ Interactive Office Mapping & Floor Plan
- **Visual Map Designer**: Kanvas interaktif 1500px untuk merancang dan menata letak kubikel kantor secara *drag-and-drop*.
- **Asset Assignment**: Memetakan inventaris barang langsung ke kode kubikel fisik tertentu.
- **Live Real-time Monitoring**: Visualisasi status terisi vs kosong di dashboard utama kantor.

### ✍️ Digital Signature & Handover (Berita Acara)
- **Form Serah Terima Resmi**: Pencatatan pihak penyerah, pihak penerima, tanggal, perubahan kondisi sebelum/sesudah, dan nomor berita acara otomatis.
- **Digital Canvas Signature**: Tanda tangan digital langsung di layar perangkat (desktop & mobile).
- **Export Excel & PDF**: Cetak label barcode/QR terisolasi dan ekspor data ke Excel/PDF siap pakai.

---

## 🛠️ Tech Stack

| Layer | Teknologi |
| :--- | :--- |
| **Frontend** | Semantic HTML5, CSS3 Glassmorphism, Vanilla JS, Plus Jakarta Sans, Outfit, Chart.js, SignaturePad |
| **Backend Core** | Node.js (v18+/v20 LTS), Express.js |
| **ORM & Database** | **Prisma ORM 5.22.0** dengan **MySQL 8.0** |
| **Security & Validation** | Bcrypt.js, Zod, Helmet, Express-Rate-Limit, CORS |
| **Deployment** | Multi-Stage Dockerfile, Docker Compose, Nginx Reverse Proxy |

---

## ⚙️ Cara Menjalankan Aplikasi

### Opsi 1: Menjalankan Secara Lokal (Node.js & MySQL)

1. **Clone Repositori:**
   ```bash
   git clone https://github.com/imam-ngh/Iventaris_Iconnet.git
   cd Iventaris_Iconnet
   ```

2. **Install Dependensi:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment:**
   Salin `.env.example` menjadi `.env` dan pastikan kredensial MySQL lokal Anda sesuai:
   ```env
   PORT=3000
   DATABASE_URL="mysql://root:@localhost:3306/inventaris_iconnet"
   ```

4. **Sinkronkan Database & Jalankan Seeder:**
   ```bash
   npx prisma db push
   node prisma/seed.js
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

### Opsi 2: Menjalankan dengan Docker Compose (Siap Produksi / VPS)

Pastikan Docker & Docker Compose telah terinstall di mesin/server Anda, lalu jalankan:

```bash
docker-compose up -d --build
```

Layanan yang otomatis berjalan:
- **`iconnet_mysql`**: Database MySQL 8.0 utf8mb4 dengan volume data persisten.
- **`iconnet_app`**: Aplikasi Node.js multi-stage build ber-alokasi RAM aman (`max-old-space-size=1536`).
- **`iconnet_nginx`**: Nginx Reverse Proxy port 80/443 dengan kompresi Gzip dan cache barcode.

---

## 🧪 Pengujian Otomatis (Integration Tests)

Jalankan test suite integrasi API menyeluruh:
```bash
npm test
```
*Test suite akan menguji status endpoint statistik, otentikasi Bcrypt login, data inventaris, posisi kubikel denah, dan riwayat serah terima.*

---

## 📄 Lisensi
Hak Cipta &copy; 2026 PT Indonesia Comnets Plus (Iconnet). Dilindungi Undang-Undang.
