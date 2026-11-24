import { describe, expect, it } from 'vitest';
import { ElementSchema } from '../types/schema.js';
import {
  layoutDiagramElements,
  orthoSegmentHitsRect,
  rectsOverlap,
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
});
