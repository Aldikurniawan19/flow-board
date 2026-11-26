<div align="center">

![FlowBoard — Pratinjau Mode Sketsa Tangan (Kiri) dan Mode Teknis (Kanan)](public/assets/preview.png)

# FlowBoard

**Aplikasi web papan tulis interaktif dan perancangan diagram teknis bergaya hibrida (*Excalidraw + Draw.io*).**

Menggabungkan kebebasan sketsa papan tulis (*whiteboard*) dengan presisi notasi rekayasa perangkat lunak, konektor anti-tumpang-tindih, generator PlantText/PlantUML, serta integrasi AI & MCP dalam satu kanvas tak terbatas.

</div>

---

## Fitur Utama

### 1. Kanvas Ganda (Mode Teknis & Sketsa) + Tema Hitam Pekat
- **Mode Teknis (Rapi):** merender bentuk, teks, dan konektor secara presisi untuk dokumen analisis maupun laporan formal.
- **Mode Sketsa Tangan:** merender elemen dengan gaya goresan tangan alami menggunakan Rough.js.
- **Tema Terang & Gelap Hitam Pekat (`#000000`):** peralihan tema halus dengan kontras tinggi untuk fokus maksimal saat merancang diagram kompleks.
- **Coret-Coret Bebas, Auto-Koreksi & Kursor Penghapus Khusus:** pena bebas dan stabilo halus berbasis `perfect-freehand`, pengenalan bentuk otomatis (dapat dibatalkan ke goresan asli dengan `Ctrl+Z`), serta kursor ikon penghapus khusus saat mode `Eraser` (`E`).

### 2. Pustaka Komponen Lengkap (81 Bentuk Standar + 12 Preset Garis & Penghubung)
- **Dasar & Papan Tulis (8):** Persegi, persegi membulat, elips, belah ketupat, segitiga, segi enam, catatan tempel, dan bingkai area kerja.
- **Garis & Penghubung (12):** *Panah Lurus*, *Panah Siku 90°*, *Panah Kurva*, *Garis Polos*, *Panah Dua Arah*, *Putus-Putus Panah*, notasi **UML 2.5** (*Pewarisan*, *Implementasi*, *Agregasi*, *Komposisi*), dan relasi **ERD Crow's Foot** (*1 : N*, *N : M*) yang bisa langsung diklik atau diseret dari sidebar kiri.
- **Rich Picture / SSM (10):** Stakeholder, tim/divisi, balon pikiran, balon ucapan, konflik, pengawasan, krisis/bottleneck, instansi, anggaran, dan arsip fisik.
- **Flowchart & Workflow (10):** Terminator, proses, keputusan, input/output, dokumen, sub-proses, basis data, operasi manual, tunda, dan konektor halaman.
- **BPMN 2.0 (9):** Start/Intermediate/End Event, Task, Sub-Process, Gateway XOR/AND, Data Object, dan Pool.
- **DFD (6):** Mendukung notasi **Gane & Sarson** serta **Yourdon & DeMarco**.
- **ERD (10):** Tabel entitas & entitas lemah dengan editor kolom interaktif (`PK`, `FK`, `PK,FK`, tipe data) serta notasi **Peter Chen**.
- **UML 2.5 (17):** Class, Interface, Package, Note, Use Case, Sequence (Lifeline, Activation, Fragment), Activity, Component, dan Node.
- **Arsitektur Sistem (11):** Server, Cloud, Database Cluster, Message Queue, API Gateway, Web Client, Aplikasi Mobile, Cache, Firewall, Object Storage, dan External API.

### 3. Konektor Cerdas & Quick-Connect ala Draw.io / Figma
- **Quick-Connect 4 Sisi Otomatis:**
  - **Hover simbol:** memunculkan 4 panah blok di titik tengah sisi beserta penanda port (`×`).
  - **Hover panah:** menyorot panah dan menampilkan strip cepat berisi 4 simbol umum.
  - **Klik panah:** membuka popover ringkas berisi 8 simbol umum untuk langsung menambah dan menghubungkan komponen baru secara otomatis.
  - **Tarik panah:** langsung menarik garis konektor bebas ke simbol lain tanpa perlu mengganti tool.
- **Auto-Rerouting Anti-Tumpang-Tindih (A\* Obstacle-Avoiding):** saat menarik ujung konektor ke sisi yang berlawanan secara ekstrim, jalur garis dan port ujung lawan otomatis menyesuaikan mengelilingi komponen tanpa menembus permukaan simbol.
- **Kontrol Garis Fleksibel:**
  - **Label Konektor Bebas Geser:** teks label pada garis dapat diseret langsung ke posisi mana saja di kanvas + tombol *Reset Posisi*.
  - **Loncatan Garis Bersilang (`/\\`):** dapat diaktifkan atau dinonaktifkan per papan (berlaku di kanvas serta ekspor PNG/SVG).
  - **Pola Garis (*Terpilih* vs *Semua*):** ubah pola `Solid`, `Putus`, atau `Titik` hanya pada garis yang diklik atau langsung ke seluruh garis sejenis di papan.
- **Rotasi Sudut Kanan Atas:** ikon putar ditempatkan di sudut kanan atas komponen (bebas bentrok dengan panah atas) dan hanya memutar komponen yang dipilih.

### 4. Generator PlantText / PlantUML & Rapikan Diagram Otomatis (Pro)
- **PlantText / PlantUML ke Kanvas Native:** tempel kode PlantUML/PlantText untuk langsung menghasilkan diagram native yang sepenuhnya dapat diedit (ERD, DFD, UML Class/Use Case/Sequence, Flowchart).
- **Optimasi Anti-Bentrok 2 Mode (Pro):** tersedia langsung di sidebar kanan pada bagian *Rapikan Tata Letak*:
  - **Rapikan Penuh:** menata ulang posisi komponen, urutan lapisan, koridor multi-lajur, jalur konektor ortogonal, dan penempatan label anti-tabrakan.
  - **Rapikan Garis & Label Saja:** mempertahankan posisi komponen saat ini dan hanya mengoptimalkan rute konektor beserta labelnya.

### 5. Integrasi AI & MCP (OAuth 2.1 + PKCE + DCR)
- Mendukung koneksi langsung dengan **Google Gemini**, **ChatGPT (OpenAI)**, dan **Claude (Anthropic)** menggunakan protokol **MCP** (*Model Context Protocol*), **OAuth 2.1 + PKCE S256 + Dynamic Client Registration (DCR)**, REST API v1, serta manajemen **API Key** pribadi.

### 6. Autentikasi, Multi-Board, & Ekspor
- **Login Email/Kata Sandi & Login dengan Google (OAuth 2.0 + PKCE):** autentikasi sesi cookie `HttpOnly` dengan proteksi CSRF dan isolasi akses antar pengguna.
- **Penyimpanan Fleksibel:** mendukung **Supabase PostgreSQL** untuk produksi (Vercel Serverless) dan **SQLite** bawaan Node.js untuk pengembangan lokal.
- **Ekspor & Impor:** ekspor ke **PNG (2x HD, latar terang/gelap/transparan)**, **SVG vektor**, serta **JSON proyek** (`.flowboard.json`) dengan validasi skema Zod.

---

## Teknologi yang Digunakan

- **Frontend:** React 19, Vite 6, Tailwind CSS v4, Zustand, Lucide React
- **Canvas & Grafis:** HTML5 2D Canvas, Rough.js, `perfect-freehand`
- **Backend & Database:** Express 5, PostgreSQL (`pg` / Supabase), Node.js SQLite (`node:sqlite`), `bcryptjs`, `cookie-parser`
- **Validasi & Pengujian:** Zod, Vitest, Supertest, React Testing Library, ESLint, TypeScript JSDoc Type Checking

---

## Menjalankan Secara Lokal

### Prasyarat
- **Node.js 22+** dan **npm**

### Langkah Instalasi

```bash
# 1. Pasang dependensi
npm install

# 2. (Opsional) Salin contoh variabel lingkungan untuk Postgres / Google OAuth
cp .env.example .env

# 3. Jalankan server API dan klien Vite secara bersamaan
npm run dev
```

Tanpa `DATABASE_URL`, backend otomatis menggunakan basis data **SQLite lokal** sehingga proyek langsung siap dipakai.

### Skrip Pengujian & Build

```bash
npm run typecheck   # Pemeriksaan tipe JSDoc / TypeScript
npm run lint        # Linting ESLint
npm test            # Menjalankan seluruh unit, API, dan UI integration test
npm run build       # Build produksi Vite
```

---

## Struktur Direktori

```text
├── api/             # Entrypoint Vercel Serverless Functions
├── public/
│   └── assets/      # Aset visual & gambar pratinjau aplikasi
├── server/          # Backend Express (Auth Email & Google OAuth, OAuth 2.1/MCP, Boards API, DB PostgreSQL/SQLite)
└── src/
    ├── components/  # Antarmuka pengguna (Kanvas, Quick-Connect, Sidebar Komponen, Inspector, Modal AI/PlantText/Ekspor)
    ├── constants/   # Token tema terang/gelap, palet gambar, dan template diagram bawaan
    ├── engine/      # Kamera, geometri, port fleksibel, router ortogonal, auto-layout A*, PlantText parser, renderer, exporter
    ├── store/       # State management Zustand (undo/redo, autosave, sinkronisasi papan) dan klien API
    ├── types/       # Kontrak tipe JSDoc dan skema validasi Zod
    └── tests/       # Unit test engine & auto-layout, integrasi API/keamanan, dan pengujian UI
```
