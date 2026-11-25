import { describe, expect, it } from 'vitest';
import { ElementSchema } from '../types/schema.js';
import {
  layoutDiagramElements,
  orthoSegmentHitsRect,
  rectsOverlap,
  rerouteAffectedConnectors,
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
});
