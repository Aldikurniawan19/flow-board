import { describe, expect, it } from 'vitest';
import { ElementSchema } from '../types/schema.js';
import {
  MAX_PLANTTEXT_CHARS,
  PLANTTEXT_EXAMPLES,
  parsePlantText,
} from '../engine/plantTextParser.js';

describe('PlantText / PlantUML parser & symbol mapper', () => {
  it('parses all 6 preset design diagrams into schema-valid FlowBoard elements', () => {
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
});
