import { describe, expect, it } from 'vitest';
import { ElementSchema } from '../types/schema.js';
import { orthoSegmentHitsRect, rectsOverlap } from '../engine/autoLayout.js';
import { rectsIntersect } from '../engine/geometry.js';
import { getNormalizedRect, isConnectableElement } from '../engine/ports.js';
import { computeConnectorPath } from '../engine/router.js';
import {
  MAX_PLANTTEXT_CHARS,
  PLANTTEXT_EXAMPLES,
  parsePlantText,
} from '../engine/plantTextParser.js';

describe('PlantText / PlantUML parser & symbol mapper', () => {
  it('parses all preset design diagrams into schema-valid FlowBoard elements', () => {
    for (const example of PLANTTEXT_EXAMPLES) {
      const res = parsePlantText(example.code);
      expect(res.ok, `Example ${example.id} should parse cleanly`).toBe(true);
      if (!res.ok) continue;

      expect(res.kind).toBe(example.kind);
      expect(res.elements.length).toBeGreaterThan(0);

      for (const el of res.elements) {
        const valid = ElementSchema.safeParse(el);
        expect(valid.success, `Element ${el.type} in ${example.id} must satisfy ElementSchema`).toBe(true);
      }
    }
  });

  it('maps ERD entities, PK/FK fields, weak tables, and Crow Foot markers accurately', () => {
    const erd = PLANTTEXT_EXAMPLES.find((e) => e.id === 'erd');
    const res = parsePlantText(erd?.code || '');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const tables = res.elements.filter((e) => e.type === 'erd_table' || e.type === 'erd_weak_table');
    const connectors = res.elements.filter((e) => e.type === 'connector');
    expect(tables).toHaveLength(3);
    expect(tables.some((t) => t.type === 'erd_weak_table')).toBe(true);
    expect(tables[0].fields?.some((f) => f.key === 'PK')).toBe(true);
    expect(connectors[0].startMarker).toBe('crow_one_only');
    expect(connectors[0].endMarker).toBe('crow_zero_many');
    expect(connectors[1].endMarker).toBe('crow_one_many');
  });

  it('maps DFD Gane-Sarson entities, numbered processes, and data stores', () => {
    const dfd = PLANTTEXT_EXAMPLES.find((e) => e.id === 'dfd');
    const res = parsePlantText(dfd?.code || '');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const entities = res.elements.filter((e) => e.type === 'dfd_gs_entity');
    const processes = res.elements.filter((e) => e.type === 'dfd_gs_process');
    const stores = res.elements.filter((e) => e.type === 'dfd_gs_datastore');
    expect(entities).toHaveLength(2);
    expect(processes).toHaveLength(2);
    expect(processes[0].code).toBe('1.0');
    expect(stores).toHaveLength(1);
    expect(stores[0].code).toBe('D1');
  });

  it('maps UML Class inheritance/dependency, Use Case boundary/actors, Sequence lifelines/fragments, and Flowchart decisions', () => {
    const cls = parsePlantText(PLANTTEXT_EXAMPLES.find((e) => e.id === 'class')?.code || '');
    expect(cls.ok).toBe(true);
    if (cls.ok) {
      expect(cls.elements.some((e) => e.type === 'uml_interface')).toBe(true);
      expect(cls.elements.some((e) => e.type === 'connector' && e.startMarker === 'hollow_triangle')).toBe(true);
      expect(cls.elements.some((e) => e.type === 'connector' && e.strokeStyle === 'dashed')).toBe(true);
    }

    const uc = parsePlantText(PLANTTEXT_EXAMPLES.find((e) => e.id === 'usecase')?.code || '');
    expect(uc.ok).toBe(true);
    if (uc.ok) {
      expect(uc.elements.some((e) => e.type === 'uml_boundary')).toBe(true);
      expect(uc.elements.filter((e) => e.type === 'uml_actor')).toHaveLength(2);
      expect(uc.elements.filter((e) => e.type === 'uml_usecase')).toHaveLength(4);
    }

    const seq = parsePlantText(PLANTTEXT_EXAMPLES.find((e) => e.id === 'sequence')?.code || '');
    expect(seq.ok).toBe(true);
    if (seq.ok) {
      expect(seq.elements.filter((e) => e.type === 'uml_lifeline')).toHaveLength(4);
      expect(seq.elements.some((e) => e.type === 'uml_activation')).toBe(true);
      expect(seq.elements.some((e) => e.type === 'uml_fragment' && e.code === 'alt')).toBe(true);
    }

    const fc = parsePlantText(PLANTTEXT_EXAMPLES.find((e) => e.id === 'flowchart')?.code || '');
    expect(fc.ok).toBe(true);
    if (fc.ok) {
      expect(fc.elements.filter((e) => e.type === 'fc_terminator')).toHaveLength(2);
      expect(fc.elements.filter((e) => e.type === 'fc_decision')).toHaveLength(1);
      expect(fc.elements.some((e) => e.type === 'fc_io')).toBe(true);
    }
  });

  it('rejects empty, comment-only, and oversized inputs cleanly', () => {
    expect(parsePlantText('').ok).toBe(false);
    expect(parsePlantText("@startuml\n' only comment\n@enduml").ok).toBe(false);
    expect(parsePlantText('a'.repeat(MAX_PLANTTEXT_CHARS + 1)).ok).toBe(false);
  });

  it('parses full 20-node, 49-flow Yourdon-DeMarco DFD Level 1 cleanly with zero node or corridor collisions', () => {
    const realWorldDfd = `@startuml
title
  DFD Level 1 - Sistem Informasi Pengiriman Barang
  (Notasi Yourdon-DeMarco)
end title

left to right direction
skinparam backgroundColor #FFFFFF
skinparam shadowing false
skinparam defaultFontName Arial
skinparam defaultFontSize 11
skinparam nodesep 32
skinparam ranksep 95
skinparam ArrowFontSize 10
skinparam ArrowColor #E65100
hide stereotype

skinparam rectangle<<External>> {
  BackgroundColor #E3F2FD
  BorderColor #1565C0
  FontColor #0D47A1
  FontStyle bold
  RoundCorner 0
}

skinparam usecase<<Process>> {
  BackgroundColor #FFF8E1
  BorderColor #E65100
  FontColor #BF360C
}

skinparam rectangle<<DataStore>> {
  BackgroundColor #FFFFFF
  BorderColor #FFFFFF
  FontColor #1B5E20
}

rectangle "Admin\\nOperasional" as E6 <<External>>
rectangle "Pengirim\\n(Customer)" as E1 <<External>>
rectangle "Payment\\nGateway" as E4 <<External>>
rectangle "Kurir /\\nDriver" as E3 <<External>>
rectangle "Penerima\\n(Recipient)" as E2 <<External>>
rectangle "Manajemen /\\nPimpinan" as E5 <<External>>

E6 -[hidden]down-> E1
E1 -[hidden]down-> E4
E4 -[hidden]down-> E3
E3 -[hidden]down-> E2
E2 -[hidden]down-> E5

usecase "**1.0**\\nManajemen\\nMaster &\\nTarif" as P1 <<Process>>
usecase "**2.0**\\nPemesanan &\\nKalkulasi\\nTarif" as P2 <<Process>>
usecase "**3.0**\\nPemrosesan\\nPembayaran" as P3 <<Process>>
usecase "**4.0**\\nPenjemputan,\\nSortir &\\nPenugasan" as P4 <<Process>>
usecase "**5.0**\\nPengiriman &\\nPelacakan\\nPaket" as P5 <<Process>>
usecase "**6.0**\\nSerah Terima &\\nPenanganan\\nKlaim" as P6 <<Process>>
usecase "**7.0**\\nPelaporan\\nOperasional &\\nKeuangan" as P7 <<Process>>

P1 -[hidden]down-> P2
P2 -down-> P3 : Data Tagihan\\nOrder
P3 -down-> P4 : Order Terbayar\\n(Siap Jemput)
P4 -[hidden]down-> P5
P5 -[hidden]down-> P6
P6 -[hidden]down-> P7

rectangle "<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>\\n**D2**  Data Tarif & Zona\\n<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>" as D2 <<DataStore>>
rectangle "<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>\\n**D1**  Data Pelanggan\\n<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>" as D1 <<DataStore>>
rectangle "<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>\\n**D5**  Data Pembayaran\\n<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>" as D5 <<DataStore>>
rectangle "<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>\\n**D4**  Data Kurir & Armada\\n<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>" as D4 <<DataStore>>
rectangle "<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>\\n**D3**  Data Pengiriman (Resi)\\n<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>" as D3 <<DataStore>>
rectangle "<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>\\n**D6**  Log Status & Tracking\\n<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>" as D6 <<DataStore>>
rectangle "<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>\\n**D7**  Data Klaim & Komplain\\n<color:#2E7D32>━━━━━━━━━━━━━━━━━━━━━━</color>" as D7 <<DataStore>>

D2 -[hidden]down-> D1
D1 -[hidden]down-> D5
D5 -[hidden]down-> D4
D4 -[hidden]down-> D3
D3 -[hidden]down-> D6
D6 -[hidden]down-> D7

E6 -[#1565C0]-> P1 : Data Tarif, Zona\\n& Armada
E6 <-[#1565C0]- P1 : Konfirmasi\\nPembaruan Data
E1 -[#1565C0]-> P2 : Data Pengirim, Penerima\\n& Detail Paket
E1 <-[#1565C0]- P2 : Rincian Biaya\\n& ID Tagihan
E1 -[#1565C0]-> P3 : Instruksi / Bukti\\nPembayaran
E1 <-[#1565C0]- P3 : Invoice & Nomor\\nResi Resmi
E4 <-[#1565C0]- P3 : Permintaan Otorisasi\\nTransaksi
E4 -[#1565C0]-> P3 : Status Verifikasi\\nPembayaran
E3 <-[#1565C0]- P4 : Instruksi Pickup\\n& Manifest Sortir
E3 -[#1565C0]-> P4 : Konfirmasi Pickup &\\nHasil Scan Hub
E3 -[#1565C0]-> P5 : Update Koordinat &\\nStatus Transit
E1 -[#1565C0]-> P5 : Permintaan\\nLacak Resi
E1 <-[#1565C0]- P5 : Info Status &\\nLokasi Paket
E2 -[#1565C0]-> P5 : Permintaan Cek\\nStatus Paket
E2 <-[#1565C0]- P5 : Estimasi Tiba &\\nStatus Pengiriman
E3 -[#1565C0]-> P6 : Bukti Serah Terima\\n(Foto / POD)
E2 <-[#1565C0]- P6 : Notifikasi & Bukti\\nPenerimaan Paket
E2 -[#1565C0]-> P6 : Tanda Terima Digital\\n& Ulasan
E1 -[#1565C0]-> P6 : Pengajuan Klaim\\nKerusakan / Hilang
E1 <-[#1565C0]- P6 : Notifikasi Selesai /\\nResolusi Klaim
E6 <-[#1565C0]- P6 : Data Pengajuan\\nKlaim (Audit)
E6 -[#1565C0]-> P6 : Keputusan\\nPersetujuan Klaim
E5 -[#1565C0]-> P7 : Permintaan\\nLaporan Periodik
E5 <-[#1565C0]- P7 : Laporan Keuangan,\\nSLA & Evaluasi Klaim

P1 -[#2E7D32]-> D2 : Update Master\\nTarif & Zona
P1 -[#2E7D32]-> D4 : Update Data\\nKurir & Armada
P2 <-[#2E7D32]- D2 : Info Tarif &\\nEstimasi SLA
P2 -[#2E7D32]-> D1 : Simpan / Update\\nData Pelanggan
P2 -[#2E7D32]-> D3 : Draft Order\\nPengiriman
P3 -[#2E7D32]-> D5 : Rekam Transaksi\\nPembayaran
P3 -[#2E7D32]-> D3 : Update Status Lunas\\n& Nomor Resi
P4 -[#2E7D32]-> D4 : Update Penugasan\\nKurir
P4 <-[#2E7D32]- D4 : Info Ketersediaan\\nKurir & Rute
P4 <-[#2E7D32]- D3 : Data Paket &\\nAlamat Jemput
P4 -[#2E7D32]-> D3 : Update Status Sortir\\n& Resi Aktif
P4 -[#2E7D32]-> D6 : Log Awal Pickup\\n& Transit Hub
P5 <-[#2E7D32]- D3 : Detail Info\\nPengiriman
P5 -[#2E7D32]-> D6 : Simpan Riwayat\\nPergerakan Paket
P5 <-[#2E7D32]- D6 : Data Riwayat\\nTracking
P6 -[#2E7D32]-> D3 : Update Status\\nSelesai / Bermasalah
P6 -[#2E7D32]-> D6 : Log Final Pengiriman\\n(Delivered)
P6 -[#2E7D32]-> D7 : Simpan Data &\\nStatus Klaim
P7 <-[#2E7D32]- D1 : Data Pelanggan
P7 <-[#2E7D32]- D3 : Rekap Volume\\nPengiriman
P7 <-[#2E7D32]- D5 : Rekap Pendapatan\\n& Transaksi
P7 <-[#2E7D32]- D6 : Data Ketepatan\\nWaktu (SLA)
P7 <-[#2E7D32]- D7 : Rekap Insiden\\n& Klaim
@enduml`;

    const t0 = performance.now();
    const res = parsePlantText(realWorldDfd);
    const elapsedMs = performance.now() - t0;

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.kind).toBe('dfd');
    expect(res.kindLabel).toBe('DFD (Yourdon & DeMarco)');
    expect(elapsedMs).toBeLessThan(1500);

    const entities = res.elements.filter((e) => e.type === 'dfd_yd_entity');
    const processes = res.elements.filter((e) => e.type === 'dfd_yd_process');
    const stores = res.elements.filter((e) => e.type === 'dfd_yd_datastore');
    const connectors = res.elements.filter((e) => e.type === 'connector');

    expect(entities).toHaveLength(6);
    expect(processes).toHaveLength(7);
    expect(stores).toHaveLength(7);
    // 2 inter-process + 24 entity<->process + 23 process<->store = 49 real flows (all 15 [hidden] arrows ignored!)
    expect(connectors).toHaveLength(49);
    expect(processes[0].code).toBe('1.0');
    expect(processes[0].text).toBe('Manajemen Master & Tarif');
    expect(stores[0].text).toContain('D2');
    expect(stores[0].text).not.toContain('━━━');
    expect(stores[0].text).not.toContain('<color');
    expect(connectors.some((c) => c.strokeColor === '#1D4ED8')).toBe(true);
    expect(connectors.some((c) => c.strokeColor === '#15803D')).toBe(true);

    // Verify clean 3-column corridor layout: Col 1 (Entities) < Col 2 (Processes) < Col 3 (Data Stores)
    const minEntityLeft = Math.min(...entities.map((e) => e.x));
    const maxEntityRight = Math.max(...entities.map((e) => e.x + e.width));
    const minProcLeft = Math.min(...processes.map((p) => p.x));
    const maxProcRight = Math.max(...processes.map((p) => p.x + p.width));
    const minStoreLeft = Math.min(...stores.map((s) => s.x));
    const maxStoreRight = Math.max(...stores.map((s) => s.x + s.width));
    expect(minProcLeft - maxEntityRight).toBeGreaterThanOrEqual(350);
    expect(minStoreLeft - maxProcRight).toBeGreaterThanOrEqual(350);

    // Every single connector must stay strictly inside the 3-column footprint (no detours behind Entities/Stores!)
    for (const c of connectors) {
      const pts = [
        { x: c.x, y: c.y },
        ...(c.waypoints || []),
        { x: c.x + c.width, y: c.y + c.height },
      ];
      for (const pt of pts) {
        expect(pt.x, `Connector "${c.text}" must not detour behind Entities`).toBeGreaterThanOrEqual(
          minEntityLeft - 2,
        );
        expect(pt.x, `Connector "${c.text}" must not detour behind Data Stores`).toBeLessThanOrEqual(
          maxStoreRight + 2,
        );
      }
    }

    for (const el of res.elements) {
      expect(ElementSchema.safeParse(el).success).toBe(true);
    }
  });

  it('lays out multi-axis directional DFD into a compact report-ready 2D hub grid with skinparam colors', () => {
    const rentalDfd = `@startuml
title DFD Level 1 - Sistem Penyewaan Kendaraan
top to bottom direction
skinparam rectangle<<External>> {
  BackgroundColor #F5F5F5
  BorderColor #666666
}
skinparam usecase<<Process>> {
  BackgroundColor #F5F5F5
  BorderColor #666666
}
skinparam rectangle<<DataStore>> {
  BackgroundColor #FFFFFF
  BorderColor #FFFFFF
}
rectangle "Pelanggan" as Pelanggan <<External>>
rectangle "Sopir" as Sopir <<External>>
rectangle "Pimpinan" as Pimpinan <<External>>
usecase "1.0\\nRegistrasi &\\nkelola akun" as P1 <<Process>>
usecase "2.0\\nPemesanan\\nKendaraan" as P2 <<Process>>
usecase "3.0\\nVerifikasi &\\nValidasi\\nPesanan" as P3 <<Process>>
usecase "4.0\\nPelepasan\\nKendaraan" as P4 <<Process>>
usecase "5.0\\nPengembalian\\n& Kelola\\nDenda" as P5 <<Process>>
usecase "6.0\\nPengelolaan\\nlaporan" as P6 <<Process>>
rectangle "----\\nData pelanggan\\n----" as DP <<DataStore>>
rectangle "----\\nData Kendaraan\\n----" as DK1 <<DataStore>>
rectangle "----\\nData Transaksi\\n----" as DT <<DataStore>>
rectangle "----\\nData Sopir\\n----" as DS <<DataStore>>
rectangle "----\\nData Kendaraan\\n----" as DK2 <<DataStore>>

Pelanggan -right-> P1 : Data registrasi akun
P1 -left-> Pelanggan : Informasi akun berhasil di buat
P1 -right-> DP : Simpan data pelanggan
Pelanggan -down-> P2 : Data pemesanan Kendaraan
P2 -up-> Pelanggan : Info ketersediaan kendaraan
P2 -left-> DK1 : Cek ketersediaan kendaraan
P2 -down-> DT : Simpan data pemesanan
DT -up-> P3 : Ambil data transaksi pending
P3 -down-> DT : Update status transaksi dikonfirmasi
P3 -up-> Pelanggan : Konfirmasi pesanan & Kwitansi
DT -up-> Pelanggan : History penyewaan
DT -left-> P4 : Ambil data transaksi dikonfirmasi
P4 -right-> DT : Update transaksi berjalan & kondisi awal
P4 -up-> DK1 : Update status kendaraan tidak tersedia
P4 -down-> Sopir : Info jadwal penugasan
DT -right-> P5 : Ambil data transaksi berjalan
P5 -left-> DT : Update transaksi selesai & hitung denda
P5 -down-> DS : Update status sopir tersedia
P5 -down-> DK2 : Update status mobil tersedia
DT -down-> P6 : Ambil data transaksi lengkap
P6 -right-> Pimpinan : Rekap laporan operasional
@enduml`;

    const res = parsePlantText(rentalDfd);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.kind).toBe('dfd');
    expect(res.kindLabel).toBe('DFD (Yourdon & DeMarco)');

    const byText = (sub) => res.elements.find((e) => e.type !== 'connector' && (e.text || '').includes(sub));
    const pelanggan = byText('Pelanggan');
    const p1 = byText('Registrasi');
    const p4 = byText('Pelepasan');
    const p5 = byText('Pengembalian');
    const p6 = byText('Pengelolaan');
    const dt = byText('Data Transaksi');
    const dp = byText('Data pelanggan');

    expect(pelanggan?.fillColor).toBe('#F5F5F5');
    expect(pelanggan?.strokeColor).toBe('#666666');
    // No fabricated D1/D2 prefix when user did not write one
    expect(dp?.text).toBe('Data pelanggan');
    // Hub-anchored 2D spatial grid: P4 left of DT, P5 right of DT, P6 below DT, Pelanggan left of P1
    expect((p4?.x || 0) < (dt?.x || 0)).toBe(true);
    expect((p5?.x || 0) > (dt?.x || 0)).toBe(true);
    expect((p6?.y || 0) > (dt?.y || 0)).toBe(true);
    expect((pelanggan?.x || 0) < (p1?.x || 0)).toBe(true);

    // Ironclad check: NO connector interior segment may cut through ANY node (including its own src or dst!)
    // and every connector must enter its target strictly from OUTSIDE its bound side.
    const byId = new Map(res.elements.map((e) => [e.id, e]));
    const allNodes = res.elements.filter((e) => isConnectableElement(e));
    const allConns = res.elements.filter((e) => e.type === 'connector');
    for (const conn of allConns) {
      const pts = computeConnectorPath(conn, byId).points;
      for (let i = 1; i < pts.length - 2; i += 1) {
        for (const node of allNodes) {
          expect(
            orthoSegmentHitsRect(pts[i], pts[i + 1], getNormalizedRect(node)),
            `Interior segment of "${conn.text}" must never cut through "${node.text}"`,
          ).toBe(false);
        }
      }
      // Verify last approach segment enters target from OUTSIDE (never from inside the shape!)
      const dst = conn.endBinding ? byId.get(conn.endBinding.elementId) : null;
      if (dst && conn.endBinding && pts.length >= 2) {
        const penult = pts[pts.length - 2];
        const last = pts[pts.length - 1];
        if (conn.endBinding.side === 'top') expect(penult.y).toBeLessThanOrEqual(last.y + 0.5);
        if (conn.endBinding.side === 'bottom') expect(penult.y).toBeGreaterThanOrEqual(last.y - 0.5);
        if (conn.endBinding.side === 'left') expect(penult.x).toBeLessThanOrEqual(last.x + 0.5);
        if (conn.endBinding.side === 'right') expect(penult.x).toBeGreaterThanOrEqual(last.x - 0.5);
      }
    }

    for (const el of res.elements) {
      expect(ElementSchema.safeParse(el).success).toBe(true);
    }
  });

  it('strips Creole bold markup from ERD fields and auto-sizes wide ENUM tables cleanly', () => {
    const code = `@startuml
!theme plain
skinparam linetype ortho
title ERD - Sistem Pengiriman Barang

entity "PELANGGAN" as pelanggan {
  * **id_pelanggan** : INT <<PK>>
  --
  * nama_lengkap : VARCHAR(100)
}

entity "PENGIRIMAN" as pengiriman {
  * **no_resi** : VARCHAR(20) <<PK>>
  --
  * id_pengirim : INT <<FK>>
  * id_penerima : INT <<FK>>
  * id_kurir : INT <<FK>>
  * status_pengiriman : ENUM('Pending', 'Lunas', 'Dikirim', 'Diterima')
  * tanggal_order : DATETIME
}

entity "KURIR" as kurir {
  * **id_kurir** : INT <<PK>>
  --
  * no_plat_kendaraan : VARCHAR(15)
  * status_ketersediaan : ENUM('Tersedia', 'Bertugas', 'Off')
}

pelanggan ||--o{ pengiriman : "mengirim (id_pengirim)"
pelanggan ||--o{ pengiriman : "menerima (id_penerima)"
kurir ||--o{ pengiriman : "mengantar"
@enduml`;

    const res = parsePlantText(code, { kind: 'auto' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.kind).toBe('erd');
    const tables = res.elements.filter((e) => e.type === 'erd_table');
    expect(tables).toHaveLength(3);

    const pengiriman = tables.find((t) => t.text === 'PENGIRIMAN');
    const kurir = tables.find((t) => t.text === 'KURIR');
    expect(pengiriman).toBeDefined();
    expect(kurir).toBeDefined();

    // No raw Creole '**' markers in any parsed field name or type
    for (const t of tables) {
      for (const f of t.fields || []) {
        expect(f.name).not.toContain('**');
        expect(f.type).not.toContain('**');
      }
    }
    expect(pengiriman?.fields?.[0]).toMatchObject({ key: 'PK', name: 'no_resi', type: 'VARCHAR(20)' });
    expect(kurir?.fields?.[0]).toMatchObject({ key: 'PK', name: 'id_kurir', type: 'INT' });

    // Wide ENUM tables expand dynamically so name & type never collide or overflow
    expect((pengiriman?.width || 0) >= 480).toBe(true);
    expect((kurir?.width || 0) >= 400).toBe(true);

    // Zero node overlaps & zero wires cutting through tables
    for (let i = 0; i < tables.length; i += 1) {
      for (let j = i + 1; j < tables.length; j += 1) {
        expect(rectsIntersect(getNormalizedRect(tables[i]), getNormalizedRect(tables[j]))).toBe(false);
      }
    }
    const byId = new Map(res.elements.map((e) => [e.id, e]));
    for (const conn of res.elements.filter((e) => e.type === 'connector')) {
      const pts = computeConnectorPath(conn, byId).points;
      for (let i = 1; i < pts.length - 2; i += 1) {
        for (const t of tables) {
          expect(orthoSegmentHitsRect(pts[i], pts[i + 1], getNormalizedRect(t))).toBe(false);
        }
      }
    }
  });

  it('generates Peter Chen conceptual ERD from both preset and Crow Foot entity syntax without overlaps', () => {
    const chenPreset = PLANTTEXT_EXAMPLES.find((e) => e.id === 'erd_chen');
    const presetRes = parsePlantText(chenPreset?.code || '');
    expect(presetRes.ok).toBe(true);
    if (!presetRes.ok) return;

    expect(presetRes.kind).toBe('erd_chen');
    expect(presetRes.kindLabel).toBe('ERD Konseptual (Peter Chen)');

    const entities = presetRes.elements.filter((e) => e.type === 'erd_chen_entity');
    const relations = presetRes.elements.filter((e) => e.type === 'erd_chen_relation');
    const keyAttrs = presetRes.elements.filter((e) => e.type === 'erd_chen_key_attr');
    const attrs = presetRes.elements.filter((e) => e.type === 'erd_chen_attribute');
    const connectors = presetRes.elements.filter((e) => e.type === 'connector');

    expect(entities).toHaveLength(6);
    expect(relations).toHaveLength(5);
    expect(keyAttrs).toHaveLength(6);
    expect(attrs.length).toBeGreaterThanOrEqual(20);
    expect(connectors.every((c) => c.routing === 'straight')).toBe(true);
    expect(connectors.some((c) => c.text === '1')).toBe(true);
    expect(connectors.some((c) => c.text === 'N')).toBe(true);

    const presetShapes = presetRes.elements.filter((e) => isConnectableElement(e));
    for (let i = 0; i < presetShapes.length; i += 1) {
      for (let j = i + 1; j < presetShapes.length; j += 1) {
        expect(
          rectsOverlap(getNormalizedRect(presetShapes[i]), getNormalizedRect(presetShapes[j]), 10),
          `Chen shapes "${presetShapes[i].text}" and "${presetShapes[j].text}" must not overlap`,
        ).toBe(false);
      }
    }

    // Converting standard Crow's Foot entity code (including parallel relations & special attr stereotypes)
    const crowFootCode = `@startuml
entity "PELANGGAN" as pelanggan {
  * **id_pelanggan** : INT <<PK>>
  --
  * nama_lengkap : VARCHAR(100)
  * no_telepon : VARCHAR(15) <<multi>>
  * usia : INT <<derived>>
}

entity "PENGIRIMAN" as pengiriman {
  * **no_resi** : VARCHAR(20) <<PK>>
  --
  * id_pengirim : INT <<FK>>
  * id_penerima : INT <<FK>>
  * total_biaya : DECIMAL(12,2)
}

pelanggan ||--o{ pengiriman : "mengirim (id_pengirim)"
pelanggan ||--o{ pengiriman : "menerima (id_penerima)"
@enduml`;

    const converted = parsePlantText(crowFootCode, { kind: 'erd_chen' });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    expect(converted.kind).toBe('erd_chen');
    const convEntities = converted.elements.filter((e) => e.type === 'erd_chen_entity');
    const convRelations = converted.elements.filter((e) => e.type === 'erd_chen_relation');
    const convKeyAttrs = converted.elements.filter((e) => e.type === 'erd_chen_key_attr');
    const convMultiAttrs = converted.elements.filter((e) => e.type === 'erd_chen_multi_attr');
    const convDerivedAttrs = converted.elements.filter((e) => e.type === 'erd_chen_derived_attr');
    const convConns = converted.elements.filter((e) => e.type === 'connector');

    expect(convEntities).toHaveLength(2);
    expect(convRelations).toHaveLength(2);
    expect(convRelations.map((r) => r.text)).toEqual(['mengirim (id_pengirim)', 'menerima (id_penerima)']);
    expect(convKeyAttrs.map((a) => a.text)).toEqual(['id_pelanggan', 'no_resi']);
    expect(convMultiAttrs.map((a) => a.text)).toEqual(['no_telepon']);
    expect(convDerivedAttrs.map((a) => a.text)).toEqual(['usia']);
    expect(convConns.filter((c) => c.text === '1')).toHaveLength(2);
    expect(convConns.filter((c) => c.text === 'N')).toHaveLength(2);

    const convShapes = converted.elements.filter((e) => isConnectableElement(e));
    for (let i = 0; i < convShapes.length; i += 1) {
      for (let j = i + 1; j < convShapes.length; j += 1) {
        expect(rectsOverlap(getNormalizedRect(convShapes[i]), getNormalizedRect(convShapes[j]), 10)).toBe(false);
      }
    }
    for (const el of converted.elements) {
      expect(ElementSchema.safeParse(el).success).toBe(true);
    }
  });
});
