import { describe, expect, it } from 'vitest';
import { ElementSchema } from '../types/schema.js';
import {
  auditDiagramConflicts,
  layoutDiagramElements,
  orthoSegmentHitsRect,
  rectsOverlap,
  rerouteAffectedConnectors,
  rerouteSingleConnector,
  tidyDiagramElements,
} from '../engine/autoLayout.js';
import { getNormalizedRect, isConnectableElement } from '../engine/ports.js';
import { computeConnectorPath } from '../engine/router.js';
import { PLANTTEXT_EXAMPLES, parsePlantText } from '../engine/plantTextParser.js';
import { createElementFromShape } from '../engine/shapeRegistry.js';

describe('Sugiyama auto-layout & obstacle-avoiding orthogonal routing', () => {
  it('lays out all PlantText presets with zero overlapping nodes and schema-valid connectors', () => {
    for (const preset of PLANTTEXT_EXAMPLES) {
      const res = parsePlantText(preset.code);
      expect(res.ok, `Preset ${preset.id} should parse`).toBe(true);
      if (!res.ok) continue;

      const shapes = res.elements.filter(
        (e) =>
          isConnectableElement(e) &&
          e.type !== 'uml_boundary' &&
          e.type !== 'uml_fragment' &&
          e.type !== 'uml_activation',
      );

      for (let i = 0; i < shapes.length; i += 1) {
        for (let j = i + 1; j < shapes.length; j += 1) {
          const a = getNormalizedRect(shapes[i]);
          const b = getNormalizedRect(shapes[j]);
          expect(
            rectsOverlap(a, b, 10),
            `Nodes ${shapes[i].text} and ${shapes[j].text} in ${preset.id} must not overlap`,
          ).toBe(false);
        }
      }

      for (const el of res.elements) {
        expect(ElementSchema.safeParse(el).success).toBe(true);
      }
    }
  });

  it('distributes multiple ports exiting the same side and avoids routing through middle obstacle nodes', () => {
    const a = createElementFromShape('dfd_gs_entity', 0, 0);
    a.id = 'A';
    a.text = 'Source';
    const mid = createElementFromShape('dfd_gs_process', 0, 0);
    mid.id = 'M';
    mid.text = 'Middle';
    const b1 = createElementFromShape('dfd_gs_process', 0, 0);
    b1.id = 'B1';
    b1.text = 'Branch 1';
    const b2 = createElementFromShape('dfd_gs_datastore', 0, 0);
    b2.id = 'B2';
    b2.text = 'Branch 2';

    const makeConn = (id, fromId, toId, label) => ({
      id,
      type: 'connector',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: '#0F172A',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: /** @type {const} */ ('solid'),
      roughness: 0,
      opacity: 1,
      seed: 1,
      text: label,
      routing: /** @type {const} */ ('elbow'),
      startMarker: /** @type {const} */ ('none'),
      endMarker: /** @type {const} */ ('filled_arrow'),
      startBinding: { elementId: fromId, side: /** @type {const} */ ('right') },
      endBinding: { elementId: toId, side: /** @type {const} */ ('left') },
    });

    // Graph with skip-layer edge A -> B2 that must route cleanly around M without intersecting M
    const input = [
      a,
      mid,
      b1,
      b2,
      makeConn('c1', 'A', 'M', 'flow 1'),
      makeConn('c2', 'M', 'B1', 'flow 2'),
      makeConn('c3', 'M', 'B2', 'flow 3'),
      makeConn('c4', 'A', 'B2', 'skip flow'),
    ];

    const laidOut = layoutDiagramElements(input, { direction: 'LR' });
    const byId = new Map(laidOut.map((e) => [e.id, e]));

    // Check ports leaving A (c1 & c4) have distinct vertical anchor offsets
    const c1 = byId.get('c1');
    const c4 = byId.get('c4');
    expect(c1?.startBinding?.ry).not.toBe(c4?.startBinding?.ry);

    // Check skip-edge c4 never cuts through obstacle M
    const midRect = getNormalizedRect(/** @type {any} */ (byId.get('M')));
    const c4Path = computeConnectorPath(/** @type {any} */ (c4), byId);
    for (let i = 0; i < c4Path.points.length - 1; i += 1) {
      expect(orthoSegmentHitsRect(c4Path.points[i], c4Path.points[i + 1], midRect)).toBe(false);
    }
  });

  it('parses complex 15-node DFD with colors, stereotypes, directional arrows, and compact 3-zone layout', () => {
    const complexDfd = `@startuml
rectangle "Pelanggan" as E1 #LightBlue
rectangle "Kurir" as E2 #LightBlue
rectangle "Manajer" as E3 <<external>>
usecase "1.0 Registrasi" as P1 #DBEAFE
usecase "2.0 Pemesanan" as P2
usecase "3.0 Pembayaran" as P3
usecase "4.0 Pengiriman" as P4
usecase "5.0 Pelaporan" as P5
database "D1 Data User" as D1 #FEF3C7
storage "D2 Data Order" as D2
collections "D3 Data Bayar" as D3
database D4 as "D4 Data Kirim"

E1 -right-> P1 : Data Registrasi & Profil
P1 --> D1 : Simpan Akun
E1 --> P2 : Data Pesanan Baru
P2 --> D2 : Simpan Pesanan
P2 --> P3 : Tagihan Pembayaran
P3 --> D3 : Catat Transaksi
P3 --> E1 : Konfirmasi Pembayaran & Resi
P3 --> P4 : Instruksi Pengiriman
P4 --> D4 : Update Status Kirim
P4 --> E2 : Surat Jalan Kurir
E2 --> P4 : Bukti Terima Paket
D2 --> P5 : Rekap Pesanan
D3 --> P5 : Rekap Keuangan
P5 --> E3 : Laporan Keuangan & Aktivitas
@enduml`;

    const res = parsePlantText(complexDfd, { kind: 'dfd' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const entities = res.elements.filter((e) => e.type === 'dfd_gs_entity');
    const processes = res.elements.filter((e) => e.type === 'dfd_gs_process');
    const stores = res.elements.filter((e) => e.type === 'dfd_gs_datastore');
    expect(entities).toHaveLength(3);
    expect(processes).toHaveLength(5);
    expect(stores).toHaveLength(4);

    // Every pair of nodes must have zero overlap
    const allNodes = [...entities, ...processes, ...stores];
    for (let i = 0; i < allNodes.length; i += 1) {
      for (let j = i + 1; j < allNodes.length; j += 1) {
        expect(rectsOverlap(getNormalizedRect(allNodes[i]), getNormalizedRect(allNodes[j]), 12)).toBe(false);
      }
    }

    // Compact aspect ratio (not an ultra-wide 10-column strip)
    const minX = Math.min(...allNodes.map((n) => n.x));
    const maxX = Math.max(...allNodes.map((n) => n.x + n.width));
    const minY = Math.min(...allNodes.map((n) => n.y));
    const maxY = Math.max(...allNodes.map((n) => n.y + n.height));
    const aspectRatio = (maxX - minX) / Math.max(1, maxY - minY);
    expect(aspectRatio).toBeLessThan(3.5);
  });

  it('automatically flips anchor sides and reroutes connectors cleanly when a bound component is dragged to another side', () => {
    const pelanggan = createElementFromShape('dfd_yd_entity', 60, 80);
    pelanggan.id = 'pelanggan';
    pelanggan.text = 'Pelanggan';

    const bank = createElementFromShape('dfd_yd_entity', 60, 380);
    bank.id = 'bank';
    bank.text = 'Bank / Payment Gateway';

    const sistem = createElementFromShape('dfd_yd_process', 520, 140);
    sistem.id = 'sistem';
    sistem.width = 200;
    sistem.height = 200;
    sistem.text = 'SISTEM RENTAL MOBIL';

    const makeConn = (id, fromId, toId, text, waypoints) => ({
      id,
      type: 'connector',
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      strokeColor: '#0F172A',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: /** @type {const} */ ('solid'),
      roughness: 0,
      opacity: 1,
      seed: 1,
      text,
      routing: /** @type {const} */ ('elbow'),
      startMarker: /** @type {const} */ ('none'),
      endMarker: /** @type {const} */ ('filled_arrow'),
      startBinding: {
        elementId: fromId,
        side: /** @type {import('../types/schema.js').PortSide} */ ('right'),
        rx: 1,
        ry: 0.5,
      },
      endBinding: {
        elementId: toId,
        side: /** @type {import('../types/schema.js').PortSide} */ ('left'),
        rx: 0,
        ry: 0.5,
      },
      waypoints,
    });

    const cUntouched = makeConn('c-pel', 'pelanggan', 'sistem', 'Data registrasi', [
      { x: 340, y: 115 },
      { x: 340, y: 190 },
    ]);
    const cBankToSys = makeConn('c-b2s', 'bank', 'sistem', 'Status pembayaran', [
      { x: 360, y: 400 },
      { x: 360, y: 270 },
    ]);
    const cSysToBank = makeConn('c-s2b', 'sistem', 'bank', 'Instruksi pembayaran', [
      { x: 390, y: 290 },
      { x: 390, y: 430 },
    ]);
    cSysToBank.startBinding = { elementId: 'sistem', side: 'left', rx: 0, ry: 0.75 };
    cSysToBank.endBinding = { elementId: 'bank', side: 'right', rx: 1, ry: 0.75 };

    // Simulate dragging Bank from the LEFT of Sistem to the RIGHT of Sistem
    const draggedRight = [
      pelanggan,
      { ...bank, x: 960, y: 200 },
      sistem,
      cUntouched,
      cBankToSys,
      cSysToBank,
    ];

    // Live fast preview during drag immediately flips sides and drops stale left-side waypoints
    const live = rerouteAffectedConnectors(draggedRight, new Set(['bank']), { fast: true });
    const liveB2S = live.find((e) => e.id === 'c-b2s');
    const liveS2B = live.find((e) => e.id === 'c-s2b');
    const liveUntouched = live.find((e) => e.id === 'c-pel');
    expect(liveB2S?.startBinding?.side).toBe('left');
    expect(liveB2S?.endBinding?.side).toBe('right');
    expect(liveS2B?.startBinding?.side).toBe('right');
    expect(liveS2B?.endBinding?.side).toBe('left');
    expect(liveB2S?.waypoints).toBeUndefined();
    expect(liveS2B?.waypoints).toBeUndefined();
    // Parallel ports stay cleanly separated
    expect(liveB2S?.startBinding?.ry).not.toBe(liveS2B?.endBinding?.ry);
    // Untouched connector keeps its exact existing waypoints
    expect(liveUntouched?.waypoints).toEqual(cUntouched.waypoints);

    // Full drop-commit reroute produces obstacle-free, non-crossing orthogonal routes
    const committed = rerouteAffectedConnectors(draggedRight, new Set(['bank']), { fast: false });
    const byId = new Map(committed.map((e) => [e.id, e]));
    const movedBankRect = getNormalizedRect(/** @type {any} */ (byId.get('bank')));
    const sistemRect = getNormalizedRect(/** @type {any} */ (byId.get('sistem')));

    for (const cid of ['c-b2s', 'c-s2b']) {
      const conn = /** @type {any} */ (byId.get(cid));
      const pts = computeConnectorPath(conn, byId).points;
      expect(pts.length).toBeGreaterThanOrEqual(2);
      // Every point must stay strictly in the right corridor (x >= sistem center), never swinging back left!
      for (const pt of pts) {
        expect(pt.x).toBeGreaterThan(sistemRect.x + sistemRect.width * 0.5);
      }
      // Interior segments must never slice through Bank or Sistem
      for (let i = 1; i < pts.length - 2; i += 1) {
        expect(orthoSegmentHitsRect(pts[i], pts[i + 1], movedBankRect)).toBe(false);
        expect(orthoSegmentHitsRect(pts[i], pts[i + 1], sistemRect)).toBe(false);
      }
    }

    // Dragging Bank ABOVE Sistem automatically switches connectors to bottom/top sides
    const draggedAbove = [
      pelanggan,
      { ...bank, x: 540, y: -120 },
      sistem,
      cUntouched,
      cBankToSys,
      cSysToBank,
    ];
    const aboveRouted = rerouteAffectedConnectors(draggedAbove, new Set(['bank']), { fast: false });
    const aboveB2S = aboveRouted.find((e) => e.id === 'c-b2s');
    const aboveS2B = aboveRouted.find((e) => e.id === 'c-s2b');
    expect(aboveB2S?.startBinding?.side).toBe('bottom');
    expect(aboveB2S?.endBinding?.side).toBe('top');
    expect(aboveS2B?.startBinding?.side).toBe('top');
    expect(aboveS2B?.endBinding?.side).toBe('bottom');
  });

  it('untangles crossed edges in full mode and preserves node positions in connectors_only mode', () => {
    const a = createElementFromShape('dfd_gs_entity', 60, 80);
    a.id = 'E1';
    a.text = 'Mahasiswa';
    const b = createElementFromShape('dfd_gs_entity', 60, 280);
    b.id = 'E2';
    b.text = 'Dosen';
    const c = createElementFromShape('dfd_gs_process', 420, 80);
    c.id = 'P1';
    c.text = 'Validasi KRS';
    const d = createElementFromShape('dfd_gs_process', 420, 280);
    d.id = 'P2';
    d.text = 'Input Nilai';

    // Deliberately crossed straight wires: E1(top-left) -> P2(bottom-right) and E2(bottom-left) -> P1(top-right)
    const c1 = {
      id: 'c-cross-1',
      type: 'connector',
      x: 200,
      y: 115,
      width: 220,
      height: 200,
      strokeColor: '#0F172A',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: /** @type {const} */ ('solid'),
      roughness: 0,
      opacity: 1,
      seed: 1,
      text: 'Pilihan mata kuliah',
      routing: /** @type {const} */ ('elbow'),
      startMarker: /** @type {const} */ ('none'),
      endMarker: /** @type {const} */ ('filled_arrow'),
      startBinding: { elementId: 'E1', side: /** @type {const} */ ('right'), rx: 1, ry: 0.5 },
      endBinding: { elementId: 'P2', side: /** @type {const} */ ('left'), rx: 0, ry: 0.5 },
      labelPos: { x: 310, y: 215 },
    };
    const c2 = {
      id: 'c-cross-2',
      type: 'connector',
      x: 200,
      y: 315,
      width: 220,
      height: -200,
      strokeColor: '#0F172A',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: /** @type {const} */ ('solid'),
      roughness: 0,
      opacity: 1,
      seed: 2,
      text: 'Persetujuan PA',
      routing: /** @type {const} */ ('elbow'),
      startMarker: /** @type {const} */ ('none'),
      endMarker: /** @type {const} */ ('filled_arrow'),
      startBinding: { elementId: 'E2', side: /** @type {const} */ ('right'), rx: 1, ry: 0.5 },
      endBinding: { elementId: 'P1', side: /** @type {const} */ ('left'), rx: 0, ry: 0.5 },
      labelPos: { x: 310, y: 215 },
    };

    const tangled = [a, b, c, d, c1, c2];
    const beforeAudit = auditDiagramConflicts(tangled);
    expect(beforeAudit.edgeCrossings).toBeGreaterThanOrEqual(1);
    expect(beforeAudit.labelCollisions).toBeGreaterThanOrEqual(1);

    // Mode 1: Full tidy eliminates crossings and label collisions while preserving all 6 elements
    const fullRes = tidyDiagramElements(tangled, { mode: 'full' });
    expect(fullRes.elements).toHaveLength(6);
    expect(fullRes.metrics.after.edgeCrossings).toBe(0);
    expect(fullRes.metrics.after.labelCollisions).toBe(0);
    expect(fullRes.metrics.after.score).toBeLessThan(fullRes.metrics.before.score);

    // Mode 2: Connectors-only locks every component at its exact original (x, y) while eliminating label overlap
    const connOnlyRes = tidyDiagramElements(tangled, { mode: 'connectors_only' });
    expect(connOnlyRes.elements).toHaveLength(6);
    for (const orig of [a, b, c, d]) {
      const kept = connOnlyRes.elements.find((el) => el.id === orig.id);
      expect(kept?.x).toBe(orig.x);
      expect(kept?.y).toBe(orig.y);
    }
    expect(connOnlyRes.metrics.after.labelCollisions).toBe(0);
  });

  it('cleanly untangles a dense 15-node SIAKAD DFD Level 1 with zero node hits, zero overlaps, and separated entity/store corridors', () => {
    const siakadDfd = `@startuml
rectangle "Admin Akademik / BAAK" as Admin <<External>>
rectangle "Mahasiswa" as Mhs <<External>>
rectangle "Dosen" as Dosen <<External>>
rectangle "Pimpinan" as Pimp <<External>>

usecase "1.0\\nPengelolaan Data Master" as P1 <<Process>>
usecase "2.0\\nPengelolaan Registrasi" as P2 <<Process>>
usecase "3.0\\nPengelolaan KRS" as P3 <<Process>>
usecase "4.0\\nPengelolaan Perkuliahan" as P4 <<Process>>
usecase "5.0\\nPengelolaan Nilai" as P5 <<Process>>
usecase "6.0\\nPembuatan Laporan Akademik" as P6 <<Process>>

database "D1 Data Master Akademik" as D1 <<DataStore>>
database "D2 Data Registrasi" as D2 <<DataStore>>
database "D3 Data KRS" as D3 <<DataStore>>
database "D4 Data Perkuliahan" as D4 <<DataStore>>
database "D5 Data Nilai" as D5 <<DataStore>>

Admin --> P1 : Data mahasiswa, dosen, MK
P1 --> Admin : Konfirmasi pengelolaan data
P1 --> D1 : Simpan data master
D1 --> P1 : Data master
D1 --> P2 : Data mahasiswa
D1 --> P3 : Data mahasiswa & MK
D1 --> P4 : Data dosen & MK
D1 --> P6 : Data master akademik

Mhs --> P2 : Data registrasi / daftar ulang
P2 --> Mhs : Informasi status registrasi
P2 --> D2 : Simpan registrasi
D2 --> P2 : Status registrasi
D2 --> P3 : Status registrasi
D2 --> P6 : Data registrasi

Mhs --> P3 : Pengajuan KRS
P3 --> Mhs : KRS dan status persetujuan
Dosen --> P3 : Persetujuan KRS
P3 --> D3 : Simpan KRS
D3 --> P3 : Data KRS
D3 --> P4 : KRS yang disetujui
D3 --> P5 : Data peserta kuliah

Admin --> P4 : Data kelas dan jadwal
Dosen --> P4 : Data presensi mahasiswa
P4 --> Dosen : Daftar kelas & jadwal mengajar
P4 --> Mhs : Jadwal & informasi presensi
P4 --> D4 : Simpan kelas, jadwal & presensi
D4 --> P4 : Data perkuliahan
D4 --> P5 : Data presensi
D4 --> P6 : Data perkuliahan

Dosen --> P5 : Input nilai mahasiswa
P5 --> Mhs : Informasi nilai dan KHS
P5 --> D5 : Simpan nilai
D5 --> P5 : Data nilai
D5 --> P6 : Data nilai

P6 --> Admin : Laporan dan rekap akademik
P6 --> Pimp : Laporan statistik akademik
@enduml`;

    const parsed = parsePlantText(siakadDfd, { kind: 'dfd' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Scramble node positions across mixed columns (simulating tangled 2D grid where stores/entities mix)
    const scrambled = parsed.elements.map((el) => {
      const copy = structuredClone(el);
      if (copy.text?.includes('Data Master Akademik')) {
        copy.x = 60;
        copy.y = 60;
      } else if (copy.text === 'Mahasiswa') {
        copy.x = 860;
        copy.y = 60;
      } else if (copy.text?.includes('5.0')) {
        copy.x = 860;
        copy.y = 680;
      }
      return copy;
    });

    const fullTidied = tidyDiagramElements(scrambled, { mode: 'full' });
    expect(fullTidied.elements).toHaveLength(parsed.elements.length);

    // Every entity must live cleanly on the Left column, processes in Center, data stores on Right
    const entities = fullTidied.elements.filter((e) => e.type.endsWith('_entity'));
    const processes = fullTidied.elements.filter((e) => e.type.endsWith('_process'));
    const stores = fullTidied.elements.filter((e) => e.type.endsWith('_datastore'));
    const maxEntityRight = Math.max(...entities.map((e) => e.x + e.width));
    const minProcLeft = Math.min(...processes.map((p) => p.x));
    const maxProcRight = Math.max(...processes.map((p) => p.x + p.width));
    const minStoreLeft = Math.min(...stores.map((s) => s.x));

    expect(maxEntityRight).toBeLessThan(minProcLeft - 200);
    expect(maxProcRight).toBeLessThan(minStoreLeft - 200);

    // Processes ordered cleanly 1.0 -> 6.0 top-to-bottom (preserving logical DFD numbering)
    const sortedProcs = [...processes].sort((a, b) => a.y - b.y);
    expect(`${sortedProcs[0].code || ''} ${sortedProcs[0].text || ''}`).toContain('1.0');
    expect(
      `${sortedProcs[sortedProcs.length - 1].code || ''} ${sortedProcs[sortedProcs.length - 1].text || ''}`,
    ).toContain('6.0');

    // Pimpinan (connected only to 6.0) sits at bottom of Entities; all 15 nodes remain strictly non-overlapping
    const sortedEntities = [...entities].sort((a, b) => a.y - b.y);
    expect(sortedEntities[sortedEntities.length - 1].text).toBe('Pimpinan');
    const allNodes = [...entities, ...processes, ...stores];
    for (let i = 0; i < allNodes.length; i += 1) {
      for (let j = i + 1; j < allNodes.length; j += 1) {
        expect(rectsOverlap(getNormalizedRect(allNodes[i]), getNormalizedRect(allNodes[j]), 12)).toBe(false);
      }
    }

    // Zero wire-through-node hits, zero collinear overlaps, and strict reduction in crossings & score
    expect(fullTidied.metrics.after.nodeHits).toBe(0);
    expect(fullTidied.metrics.after.segmentOverlaps).toBe(0);
    expect(fullTidied.metrics.after.edgeCrossings).toBeLessThan(
      fullTidied.metrics.before.edgeCrossings,
    );
    expect(fullTidied.metrics.after.score).toBeLessThan(fullTidied.metrics.before.score);
  });

  it('auto-reroutes cleanly without overlapping any component when dragging a connector endpoint to the extreme opposite side', () => {
    const valid = createElementFromShape('fc_decision', 0, 0);
    valid.id = 'valid';
    valid.x = 240;
    valid.y = 40;
    valid.width = 140;
    valid.height = 90;
    valid.text = 'Valid?';

    const session = createElementFromShape('fc_process', 0, 0);
    session.id = 'session';
    session.x = 230;
    session.y = 180;
    session.width = 160;
    session.height = 70;
    session.text = 'Buat Sesi Login';

    const selesai = createElementFromShape('fc_terminator', 0, 0);
    selesai.id = 'selesai';
    selesai.x = 100;
    selesai.y = 360;
    selesai.width = 140;
    selesai.height = 60;
    selesai.text = 'Selesai';

    // Existing vertical flow: Valid? -> Buat Sesi Login -> Selesai
    /** @type {import('../types/schema.js').BoardElement} */
    const cYa = {
      id: 'c-ya',
      type: 'connector',
      x: 310,
      y: 130,
      width: 0,
      height: 50,
      strokeColor: '#22C55E',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 1,
      seed: 1,
      text: 'Ya',
      routing: 'elbow',
      startMarker: 'none',
      endMarker: 'filled_arrow',
      startBinding: { elementId: 'valid', side: 'bottom', rx: 0.5, ry: 1 },
      endBinding: { elementId: 'session', side: 'top', rx: 0.5, ry: 0 },
    };

    /** @type {import('../types/schema.js').BoardElement} */
    const cToDone = {
      id: 'c-to-done',
      type: 'connector',
      x: 310,
      y: 250,
      width: -120,
      height: 110,
      strokeColor: '#FFFFFF',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 1,
      seed: 2,
      text: '',
      routing: 'elbow',
      startMarker: 'none',
      endMarker: 'filled_arrow',
      startBinding: { elementId: 'session', side: 'bottom', rx: 0.5, ry: 1 },
      endBinding: { elementId: 'selesai', side: 'top', rx: 0.65, ry: 0 },
      waypoints: [
        { x: 310, y: 310 },
        { x: 191, y: 310 },
      ],
    };

    // Connector originally went Selesai(top) -> Valid?(left), now user dragged its end to Valid?(right)
    /** @type {import('../types/schema.js').BoardElement} */
    const cLoop = {
      id: 'c-loop',
      type: 'connector',
      x: 130,
      y: 360,
      width: 250,
      height: -275,
      strokeColor: '#FFFFFF',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 0,
      opacity: 1,
      seed: 3,
      text: '',
      routing: 'elbow',
      startMarker: 'none',
      endMarker: 'filled_arrow',
      startBinding: { elementId: 'selesai', side: 'top', rx: 0.21, ry: 0 },
      endBinding: { elementId: 'valid', side: 'right', rx: 1, ry: 0.5 },
      waypoints: [{ x: 130, y: 85 }],
    };

    const base = [valid, session, selesai, cYa, cToDone, cLoop];
    const validInner = {
      x: valid.x + 4,
      y: valid.y + 4,
      width: valid.width - 8,
      height: valid.height - 8,
    };
    const sessionInner = {
      x: session.x + 4,
      y: session.y + 4,
      width: session.width - 8,
      height: session.height - 8,
    };
    const selesaiInner = {
      x: selesai.x + 4,
      y: selesai.y + 4,
      width: selesai.width - 8,
      height: selesai.height - 8,
    };

    // Before rerouting, the stale left-side waypoint shoots straight through the interior of Valid?
    const beforePath = computeConnectorPath(cLoop, new Map(base.map((e) => [e.id, e])));
    const hitsValidBefore = beforePath.points
      .slice(0, -1)
      .some((pt, i) => orthoSegmentHitsRect(pt, beforePath.points[i + 1], validInner));
    expect(hitsValidBefore).toBe(true);

    const rerouted = rerouteSingleConnector(base, 'c-loop', {
      pinnedEnd: 'end',
      allowFlipOpposite: true,
      preferredOppositeBinding: cLoop.startBinding,
    });

    const updated = rerouted.find((el) => el.id === 'c-loop');
    expect(updated).toBeDefined();
    // User's chosen right side on Valid? is strictly respected
    expect(updated?.endBinding?.elementId).toBe('valid');
    expect(updated?.endBinding?.side).toBe('right');
    // Opposite start port on Selesai adapts cleanly to right or bottom instead of wrapping over the top
    expect(['right', 'bottom']).toContain(updated?.startBinding?.side);

    // Zero node collisions and zero wire crossings across the entire diagram
    const afterAudit = auditDiagramConflicts(rerouted);
    expect(afterAudit.nodeHits).toBe(0);
    expect(afterAudit.edgeCrossings).toBe(0);

    // No segment of the rerouted connector slices through Valid?, Buat Sesi Login, or Selesai
    const map = new Map(rerouted.map((e) => [e.id, e]));
    const path = computeConnectorPath(/** @type {import('../types/schema.js').BoardElement} */ (updated), map);
    expect(path.points.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < path.points.length - 1; i += 1) {
      expect(orthoSegmentHitsRect(path.points[i], path.points[i + 1], validInner)).toBe(false);
      expect(orthoSegmentHitsRect(path.points[i], path.points[i + 1], sessionInner)).toBe(false);
      expect(orthoSegmentHitsRect(path.points[i], path.points[i + 1], selesaiInner)).toBe(false);
    }

    // The final approach segment enters Valid?(right) cleanly from the right outside (x > valid.x + valid.width)
    const approach = path.points[path.points.length - 2];
    const tip = path.points[path.points.length - 1];
    expect(approach.x).toBeGreaterThan(valid.x + valid.width);
    expect(tip.x).toBeCloseTo(valid.x + valid.width, 1);
  });
});
