# FlowBoard

FlowBoard adalah aplikasi web papan tulis interaktif dan perancangan diagram berbasis JavaScript yang menggabungkan fleksibilitas menggambar bebas bergaya papan tulis (*whiteboard*) dengan kelengkapan komponen serta notasi perancangan teknis untuk kebutuhan analisis dan rekayasa perangkat lunak.

## Tujuan Proyek

FlowBoard dirancang untuk memudahkan perancangan sistem, pemodelan basis data, penyusunan alur kerja (*workflow*), serta sketsa kolaboratif dalam satu kanvas tak terbatas tanpa perlu berpindah antara aplikasi papan tulis dan aplikasi diagram teknis.

## Fitur Utama

### 1. Kanvas Ganda (Mode Teknis & Sketsa)
- **Mode Teknis (Rapi):** merender bentuk dan garis secara presisi untuk dokumen perancangan formal.
- **Mode Sketsa Tangan:** merender komponen, teks, dan konektor dengan gaya goresan tangan menggunakan Rough.js.
- **Coret-Coret Bebas & Auto-Koreksi Bentuk:** pena bebas dan stabilo halus berbasis `perfect-freehand`, dilengkapi pengenalan bentuk otomatis (lingkaran, elips, persegi, persegi panjang, belah ketupat, segitiga, segi enam, dan garis lurus) yang dapat diaktifkan/dinonaktifkan dan dikembalikan ke goresan asli dengan `Ctrl+Z`.

### 2. Pustaka Komponen Perancangan (40+ Bentuk Standar)
- **Dasar & Papan Tulis:** Persegi, persegi membulat, elips, belah ketupat, segitiga, segi enam, catatan tempel, teks, bingkai area kerja.
- **Flowchart & Workflow:** Terminator (Mulai/Selesai), proses, keputusan, input/output, dokumen, sub-proses, basis data, operasi manual, delay, dan konektor halaman.
- **DFD (Data Flow Diagram):** mendukung notasi **Gane & Sarson** (proses bernomor, data store terbuka, entitas eksternal) dan **Yourdon & DeMarco** (bubble proses, data store garis paralel, entitas).
- **ERD (Entity Relationship Diagram):** tabel entitas dan entitas lemah dengan editor kolom interaktif (`PK`, `FK`, `PK,FK`, tipe data), serta simbol **Peter Chen** (entitas, entitas lemah, relasi, atribut kunci, multinilai, dan turunan).
- **UML:** Class Diagram 3-kompartemen, Interface, Package, Note, Use Case (Aktor, Use Case, Batas Sistem), dan Sequence Diagram (Lifeline, Activation Bar, Combined Fragment `alt`/`loop`/`opt`).
- **Arsitektur Sistem:** Server, Cloud, Database Cluster, Message Queue, API Gateway, Web Client, dan Aplikasi Mobile.

### 3. Konektor Fleksibel & Notasi Relasi
- **Titik Tempel Fleksibel:** ujung garis dapat menempel di titik mana pun sepanjang tepi komponen (mengikuti bentuk persegi, elips, maupun belah ketupat) atau di dalam komponen dengan menahan tombol `Alt`, dan tetap mengikuti proporsi saat komponen digeser atau diubah ukurannya.
- **Titik Sudut Interaktif:** mendukung rute **Siku 90° (Orthogonal)**, **Lurus**, dan **Kurva**; titik sudut dapat digeser bebas, ditambah dengan menarik titik tengah segmen, dihapus dengan klik ganda, atau dikembalikan ke rute otomatis.
- **Pratinjau Simbol Ujung Garis:** 14 pilihan ujung awal dan akhir lengkap dengan pratinjau vektor (Panah umum, **Crow's Foot ERD**, serta **Inheritance, Aggregation, Composition UML**).

### 4. Generate Diagram dari PlantText / PlantUML
- Mendukung penempelan kode **PlantText / PlantUML** untuk langsung menghasilkan komponen native yang dapat diedit di kanvas (bukan gambar statis).
- Mendukung deteksi otomatis maupun pemilihan manual untuk **ERD**, **DFD (Gane & Sarson)**, **UML Class**, **UML Use Case**, **UML Sequence**, dan **Flowchart / Activity**.

### 5. Produktivitas, Ekspor, & Manajemen Akun
- **Multi-Select & Select All (`Ctrl+A`):** pengaturan warna, ketebalan, pola garis, tipografi, opasitas, gaya render, penguncian posisi, hingga properti konektor bekerja secara serentak.
- **Navigasi & Pintasan Lengkap:** pan dan zoom kanvas (`Ctrl + Scroll`, `Ctrl + +/-/0`), geser elemen dengan tombol panah (`↑ ↓ ← →` dan `Shift + Panah`), buka/tutup panel samping (`[`, `]`, `\`), undo/redo, serta inisial shortcut langsung di toolbar.
- **Ekspor & Impor:** ekspor ke **PNG (2x HD)**, **SVG vektor**, dan **JSON proyek** (`.flowboard.json`), serta impor JSON dengan validasi skema ketat.
- **Autentikasi & Multi-Board:** sistem registrasi/masuk berbasis sesi cookie `HttpOnly` dengan proteksi CSRF dan penyimpanan papan kerja terpisah per akun pada basis data SQLite.

## Teknologi yang Digunakan

- **Frontend:** React 19, Vite 6, Tailwind CSS v4, Zustand, Lucide React
- **Canvas & Grafis:** HTML5 2D Canvas, Rough.js, perfect-freehand
- **Backend & Penyimpanan:** Node.js 22 (`node:sqlite`), Express 5, `bcryptjs`, `cookie-parser`
- **Validasi & Pengujian:** Zod, Vitest, Supertest, React Testing Library, ESLint, JSDoc Type Checking

## Struktur Direktori

```text
├── server/          # Backend Express, skema SQLite, autentikasi sesi, dan API papan kerja
└── src/
    ├── components/  # Antarmuka pengguna (Auth, Toolbar, Pustaka Bentuk, Inspector, Kanvas, Modal)
    ├── constants/   # Token tampilan, palet gambar kanvas, dan template diagram bawaan
    ├── engine/      # Kamera, geometri, anchor fleksibel, router konektor, pengenalan bentuk, PlantText parser, renderer, exporter
    ├── store/       # State management Zustand (riwayat undo/redo, sinkronisasi papan) dan klien API
    ├── types/       # Definisi kontrak JSDoc dan skema validasi Zod
    └── tests/       # Unit test engine, integrasi API & keamanan, dan pengujian UI
```
