import { FONT_FAMILY_MAP } from '../constants/tokens.js';
import { getNormalizedRect } from './ports.js';

/**
 * @typedef {{ id: string, label: string }} ShapeCategory
 * @typedef {{ kind: 'rect' | 'ellipse' | 'path' | 'line' | 'circle' | 'polygon', props: Record<string, string | number> }} PreviewPrimitive
 * @typedef {{
 *   type: string,
 *   label: string,
 *   category: string,
 *   keywords: string[],
 *   defaultWidth: number,
 *   defaultHeight: number,
 *   defaultText: string,
 *   defaultFill?: string,
 *   defaultStroke?: string,
 *   defaultExtra?: Record<string, unknown>,
 *   preview: PreviewPrimitive[]
 * }} ShapeDefinition
 */

/** @type {ShapeCategory[]} */
export const SHAPE_CATEGORIES = [
  { id: 'basic', label: 'Dasar & Papan Tulis' },
  { id: 'rich_picture', label: 'Rich Picture (SSM)' },
  { id: 'flowchart', label: 'Flowchart & Workflow' },
  { id: 'bpmn', label: 'BPMN 2.0 (Proses Bisnis)' },
  { id: 'dfd', label: 'DFD (Data Flow)' },
  { id: 'erd', label: 'ERD (Basis Data)' },
  { id: 'uml', label: 'UML 2.5 (Perangkat Lunak)' },
  { id: 'arch', label: 'Arsitektur Sistem' },
];

/** @type {ShapeDefinition[]} */
export const SHAPE_DEFINITIONS = [
  // 1. Basic & Whiteboard
  {
    type: 'rectangle',
    label: 'Persegi Panjang',
    category: 'basic',
    keywords: ['kotak', 'box', 'rect', 'rectangle'],
    defaultWidth: 160,
    defaultHeight: 84,
    defaultText: 'Kotak',
    preview: [{ kind: 'rect', props: { x: 4, y: 6, width: 32, height: 20 } }],
  },
  {
    type: 'rounded_rect',
    label: 'Persegi Membulat',
    category: 'basic',
    keywords: ['rounded', 'kotak', 'card'],
    defaultWidth: 160,
    defaultHeight: 84,
    defaultText: 'Komponen',
    preview: [{ kind: 'rect', props: { x: 4, y: 6, width: 32, height: 20, rx: 6 } }],
  },
  {
    type: 'ellipse',
    label: 'Elips / Lingkaran',
    category: 'basic',
    keywords: ['lingkaran', 'oval', 'circle', 'ellipse'],
    defaultWidth: 130,
    defaultHeight: 84,
    defaultText: 'Elips',
    preview: [{ kind: 'ellipse', props: { cx: 20, cy: 16, rx: 16, ry: 10 } }],
  },
  {
    type: 'diamond',
    label: 'Belah Ketupat',
    category: 'basic',
    keywords: ['diamond', 'decision', 'kondisi'],
    defaultWidth: 130,
    defaultHeight: 96,
    defaultText: 'Kondisi',
    preview: [{ kind: 'polygon', props: { points: '20,4 36,16 20,28 4,16' } }],
  },
  {
    type: 'triangle',
    label: 'Segitiga',
    category: 'basic',
    keywords: ['triangle', 'segitiga'],
    defaultWidth: 120,
    defaultHeight: 100,
    defaultText: 'Segitiga',
    preview: [{ kind: 'polygon', props: { points: '20,4 36,28 4,28' } }],
  },
  {
    type: 'hexagon',
    label: 'Segi Enam',
    category: 'basic',
    keywords: ['hexagon', 'preparation'],
    defaultWidth: 150,
    defaultHeight: 84,
    defaultText: 'Persiapan',
    preview: [{ kind: 'polygon', props: { points: '10,5 30,5 37,16 30,27 10,27 3,16' } }],
  },
  {
    type: 'sticky_note',
    label: 'Catatan Tempel',
    category: 'basic',
    keywords: ['sticky', 'note', 'catatan', 'brainstorm'],
    defaultWidth: 170,
    defaultHeight: 140,
    defaultText: 'Catatan ide...',
    defaultFill: '#FEF3C7',
    defaultStroke: '#B45309',
    preview: [
      { kind: 'path', props: { d: 'M 6 4 H 34 V 22 L 28 28 H 6 Z' } },
      { kind: 'path', props: { d: 'M 28 28 V 22 H 34' } },
    ],
  },
  {
    type: 'frame',
    label: 'Bingkai / Grup',
    category: 'basic',
    keywords: ['frame', 'container', 'section', 'bingkai'],
    defaultWidth: 360,
    defaultHeight: 240,
    defaultText: 'Area Kerja',
    defaultFill: 'transparent',
    preview: [
      { kind: 'rect', props: { x: 4, y: 6, width: 32, height: 22, strokeDasharray: '3 2' } },
      { kind: 'rect', props: { x: 4, y: 3, width: 14, height: 5 } },
    ],
  },

  // 1B. Rich Picture (Soft Systems Methodology — Checkland)
  {
    type: 'rp_stakeholder',
    label: 'Stakeholder / Aktor',
    category: 'rich_picture',
    keywords: ['rich picture', 'ssm', 'stakeholder', 'orang', 'aktor', 'pengguna', 'checkland'],
    defaultWidth: 96,
    defaultHeight: 116,
    defaultText: 'Stakeholder',
    defaultFill: '#DBEAFE',
    preview: [
      { kind: 'circle', props: { cx: 20, cy: 8, r: 4 } },
      { kind: 'path', props: { d: 'M 11 26 C 11 18, 29 18, 29 26 Z' } },
    ],
  },
  {
    type: 'rp_group',
    label: 'Kelompok / Tim',
    category: 'rich_picture',
    keywords: ['rich picture', 'ssm', 'group', 'tim', 'divisi', 'departemen', 'komunitas'],
    defaultWidth: 136,
    defaultHeight: 108,
    defaultText: 'Tim / Divisi',
    defaultFill: '#DBEAFE',
    preview: [
      { kind: 'circle', props: { cx: 20, cy: 8, r: 3.5 } },
      { kind: 'circle', props: { cx: 11, cy: 11, r: 3 } },
      { kind: 'circle', props: { cx: 29, cy: 11, r: 3 } },
      { kind: 'path', props: { d: 'M 13 26 C 13 18, 27 18, 27 26 Z' } },
      { kind: 'path', props: { d: 'M 5 26 C 5 20, 14 20, 15 24' } },
      { kind: 'path', props: { d: 'M 35 26 C 35 20, 26 20, 25 24' } },
    ],
  },
  {
    type: 'rp_thought',
    label: 'Balon Pikiran (Concern)',
    category: 'rich_picture',
    keywords: ['rich picture', 'ssm', 'thought', 'pikiran', 'concern', 'asumsi', 'kekhawatiran'],
    defaultWidth: 176,
    defaultHeight: 112,
    defaultText: 'Apakah proses ini lambat?',
    defaultFill: '#FEF3C7',
    preview: [
      {
        kind: 'path',
        props: {
          d: 'M 11 21 H 29 A 5 5 0 0 0 31 11 A 7 7 0 0 0 18 7 A 6 6 0 0 0 9 12 A 5 5 0 0 0 11 21 Z',
        },
      },
      { kind: 'circle', props: { cx: 11, cy: 25, r: 2 } },
      { kind: 'circle', props: { cx: 7, cy: 28, r: 1.2 } },
    ],
  },
  {
    type: 'rp_speech',
    label: 'Balon Ucapan (Keluhan)',
    category: 'rich_picture',
    keywords: ['rich picture', 'ssm', 'speech', 'ucapan', 'keluhan', 'pernyataan', 'komentar'],
    defaultWidth: 172,
    defaultHeight: 102,
    defaultText: '"Antrean terlalu lama!"',
    defaultFill: '#FFFFFF',
    preview: [
      {
        kind: 'path',
        props: { d: 'M 6 6 H 34 V 21 H 17 L 10 27 V 21 H 6 Z' },
      },
    ],
  },
  {
    type: 'rp_conflict',
    label: 'Konflik (Pedang Silang)',
    category: 'rich_picture',
    keywords: ['rich picture', 'ssm', 'konflik', 'conflict', 'pedang', 'crossed swords', 'benturan'],
    defaultWidth: 104,
    defaultHeight: 104,
    defaultText: 'Konflik',
    defaultFill: '#FEE2E2',
    defaultStroke: '#B91C1C',
    preview: [
      { kind: 'line', props: { x1: 9, y1: 6, x2: 31, y2: 26 } },
      { kind: 'line', props: { x1: 31, y1: 6, x2: 9, y2: 26 } },
      { kind: 'line', props: { x1: 11, y1: 20, x2: 17, y2: 25 } },
      { kind: 'line', props: { x1: 29, y1: 20, x2: 23, y2: 25 } },
    ],
  },
  {
    type: 'rp_eye',
    label: 'Pengawasan / Sudut Pandang',
    category: 'rich_picture',
    keywords: ['rich picture', 'ssm', 'eye', 'mata', 'audit', 'monitoring', 'pengawasan', 'perspektif'],
    defaultWidth: 132,
    defaultHeight: 92,
    defaultText: 'Pengawasan',
    defaultFill: '#FFFFFF',
    preview: [
      { kind: 'path', props: { d: 'M 4 16 Q 20 4 36 16 Q 20 28 4 16 Z' } },
      { kind: 'circle', props: { cx: 20, cy: 16, r: 4.5 } },
      { kind: 'circle', props: { cx: 20, cy: 16, r: 1.8, fill: 'currentColor' } },
    ],
  },
  {
    type: 'rp_crisis',
    label: 'Krisis / Masalah (Petir)',
    category: 'rich_picture',
    keywords: ['rich picture', 'ssm', 'crisis', 'krisis', 'masalah', 'petir', 'lightning', 'bottleneck'],
    defaultWidth: 104,
    defaultHeight: 110,
    defaultText: 'Bottleneck',
    defaultFill: '#FEF3C7',
    defaultStroke: '#B45309',
    preview: [
      { kind: 'polygon', props: { points: '23,4 11,17 19,17 16,28 29,14 21,14' } },
    ],
  },
  {
    type: 'rp_organization',
    label: 'Instansi / Gedung',
    category: 'rich_picture',
    keywords: ['rich picture', 'ssm', 'building', 'gedung', 'instansi', 'kantor', 'perusahaan', 'organisasi'],
    defaultWidth: 136,
    defaultHeight: 116,
    defaultText: 'Kantor Pusat',
    defaultFill: '#F1F5F9',
    preview: [
      { kind: 'rect', props: { x: 8, y: 5, width: 24, height: 23 } },
      { kind: 'rect', props: { x: 12, y: 9, width: 4, height: 4 } },
      { kind: 'rect', props: { x: 24, y: 9, width: 4, height: 4 } },
      { kind: 'rect', props: { x: 12, y: 16, width: 4, height: 4 } },
      { kind: 'rect', props: { x: 24, y: 16, width: 4, height: 4 } },
      { kind: 'rect', props: { x: 17, y: 21, width: 6, height: 7 } },
    ],
  },
  {
    type: 'rp_money',
    label: 'Anggaran / Biaya',
    category: 'rich_picture',
    keywords: ['rich picture', 'ssm', 'money', 'uang', 'biaya', 'budget', 'anggaran', 'finansial'],
    defaultWidth: 104,
    defaultHeight: 104,
    defaultText: 'Anggaran',
    defaultFill: '#DCFCE7',
    defaultStroke: '#15803D',
    preview: [
      { kind: 'circle', props: { cx: 20, cy: 16, r: 11 } },
      { kind: 'circle', props: { cx: 20, cy: 16, r: 7.5 } },
      { kind: 'line', props: { x1: 20, y1: 11, x2: 20, y2: 21 } },
    ],
  },
  {
    type: 'rp_document_stack',
    label: 'Arsip / Dokumen Fisik',
    category: 'rich_picture',
    keywords: ['rich picture', 'ssm', 'arsip', 'berkas', 'dokumen', 'paperwork', 'formulir', 'sop'],
    defaultWidth: 136,
    defaultHeight: 102,
    defaultText: 'Berkas Manual',
    defaultFill: '#FFFFFF',
    preview: [
      { kind: 'rect', props: { x: 11, y: 4, width: 22, height: 20 } },
      { kind: 'rect', props: { x: 7, y: 8, width: 22, height: 20 } },
      { kind: 'line', props: { x1: 11, y1: 14, x2: 24, y2: 14 } },
      { kind: 'line', props: { x1: 11, y1: 19, x2: 21, y2: 19 } },
    ],
  },

  // 2. Flowchart
  {
    type: 'fc_terminator',
    label: 'Mulai / Selesai',
    category: 'flowchart',
    keywords: ['start', 'end', 'terminator', 'flowchart'],
    defaultWidth: 150,
    defaultHeight: 56,
    defaultText: 'Mulai',
    defaultFill: '#DBEAFE',
    preview: [{ kind: 'rect', props: { x: 4, y: 8, width: 32, height: 16, rx: 8 } }],
  },
  {
    type: 'fc_process',
    label: 'Proses Flowchart',
    category: 'flowchart',
    keywords: ['process', 'step', 'aksi', 'flowchart'],
    defaultWidth: 160,
    defaultHeight: 74,
    defaultText: 'Proses Data',
    preview: [{ kind: 'rect', props: { x: 4, y: 7, width: 32, height: 18 } }],
  },
  {
    type: 'fc_decision',
    label: 'Keputusan (If)',
    category: 'flowchart',
    keywords: ['decision', 'cabang', 'if', 'flowchart'],
    defaultWidth: 144,
    defaultHeight: 96,
    defaultText: 'Valid?',
    defaultFill: '#FEF3C7',
    preview: [{ kind: 'polygon', props: { points: '20,4 36,16 20,28 4,16' } }],
  },
  {
    type: 'fc_io',
    label: 'Input / Output',
    category: 'flowchart',
    keywords: ['io', 'input', 'output', 'jajar genjang', 'flowchart'],
    defaultWidth: 164,
    defaultHeight: 72,
    defaultText: 'Input Pengguna',
    preview: [{ kind: 'polygon', props: { points: '10,6 36,6 30,26 4,26' } }],
  },
  {
    type: 'fc_document',
    label: 'Dokumen / Laporan',
    category: 'flowchart',
    keywords: ['document', 'laporan', 'pdf', 'flowchart'],
    defaultWidth: 156,
    defaultHeight: 84,
    defaultText: 'Laporan',
    preview: [{ kind: 'path', props: { d: 'M 5 5 H 35 V 24 Q 27 20 20 25 Q 13 30 5 24 Z' } }],
  },
  {
    type: 'fc_predefined',
    label: 'Sub-Proses',
    category: 'flowchart',
    keywords: ['subroutine', 'predefined', 'fungsi', 'flowchart'],
    defaultWidth: 164,
    defaultHeight: 76,
    defaultText: 'Sub-Proses',
    preview: [
      { kind: 'rect', props: { x: 4, y: 6, width: 32, height: 20 } },
      { kind: 'line', props: { x1: 9, y1: 6, x2: 9, y2: 26 } },
      { kind: 'line', props: { x1: 31, y1: 6, x2: 31, y2: 26 } },
    ],
  },
  {
    type: 'fc_database',
    label: 'Basis Data',
    category: 'flowchart',
    keywords: ['database', 'db', 'cylinder', 'storage', 'flowchart'],
    defaultWidth: 124,
    defaultHeight: 96,
    defaultText: 'Database',
    preview: [
      { kind: 'ellipse', props: { cx: 20, cy: 8, rx: 13, ry: 4 } },
      { kind: 'path', props: { d: 'M 7 8 V 24 A 13 4 0 0 0 33 24 V 8' } },
    ],
  },
  {
    type: 'fc_manual_op',
    label: 'Operasi Manual',
    category: 'flowchart',
    keywords: ['manual', 'trapezoid', 'flowchart'],
    defaultWidth: 160,
    defaultHeight: 74,
    defaultText: 'Verifikasi Manual',
    preview: [{ kind: 'polygon', props: { points: '4,6 36,6 31,26 9,26' } }],
  },
  {
    type: 'fc_delay',
    label: 'Tunda / Delay',
    category: 'flowchart',
    keywords: ['delay', 'wait', 'tunggu', 'flowchart'],
    defaultWidth: 150,
    defaultHeight: 68,
    defaultText: 'Tunggu',
    preview: [{ kind: 'path', props: { d: 'M 5 6 H 24 A 10 10 0 0 1 24 26 H 5 Z' } }],
  },
  {
    type: 'fc_offpage',
    label: 'Konektor Halaman',
    category: 'flowchart',
    keywords: ['offpage', 'connector', 'halaman', 'flowchart'],
    defaultWidth: 84,
    defaultHeight: 84,
    defaultText: 'A',
    preview: [{ kind: 'polygon', props: { points: '8,5 32,5 32,19 20,28 8,19' } }],
  },

  // 2B. BPMN 2.0 (OMG ISO/IEC 19510)
  {
    type: 'bpmn_start',
    label: 'Start Event (BPMN)',
    category: 'bpmn',
    keywords: ['bpmn', 'start', 'event', 'mulai', 'iso 19510'],
    defaultWidth: 64,
    defaultHeight: 64,
    defaultText: 'Mulai',
    defaultFill: '#DCFCE7',
    defaultStroke: '#15803D',
    preview: [{ kind: 'circle', props: { cx: 20, cy: 16, r: 10 } }],
  },
  {
    type: 'bpmn_intermediate',
    label: 'Intermediate Event (BPMN)',
    category: 'bpmn',
    keywords: ['bpmn', 'intermediate', 'event', 'peristiwa', 'tengah'],
    defaultWidth: 68,
    defaultHeight: 68,
    defaultText: 'Event',
    defaultFill: '#FEF3C7',
    defaultStroke: '#B45309',
    preview: [
      { kind: 'circle', props: { cx: 20, cy: 16, r: 11 } },
      { kind: 'circle', props: { cx: 20, cy: 16, r: 8 } },
    ],
  },
  {
    type: 'bpmn_end',
    label: 'End Event (BPMN)',
    category: 'bpmn',
    keywords: ['bpmn', 'end', 'event', 'selesai', 'akhir'],
    defaultWidth: 64,
    defaultHeight: 64,
    defaultText: 'Selesai',
    defaultFill: '#FEE2E2',
    defaultStroke: '#B91C1C',
    preview: [{ kind: 'circle', props: { cx: 20, cy: 16, r: 10, strokeWidth: 3 } }],
  },
  {
    type: 'bpmn_task',
    label: 'Task / Aktivitas (BPMN)',
    category: 'bpmn',
    keywords: ['bpmn', 'task', 'aktivitas', 'activity', 'tugas'],
    defaultWidth: 164,
    defaultHeight: 80,
    defaultText: 'Verifikasi Pesanan',
    defaultFill: '#DBEAFE',
    preview: [{ kind: 'rect', props: { x: 4, y: 6, width: 32, height: 20, rx: 5 } }],
  },
  {
    type: 'bpmn_subprocess',
    label: 'Sub-Proses (BPMN)',
    category: 'bpmn',
    keywords: ['bpmn', 'subprocess', 'sub-proses', 'collapsed'],
    defaultWidth: 168,
    defaultHeight: 84,
    defaultText: 'Proses Pembayaran',
    defaultFill: '#DBEAFE',
    preview: [
      { kind: 'rect', props: { x: 4, y: 5, width: 32, height: 22, rx: 5 } },
      { kind: 'rect', props: { x: 16, y: 19, width: 8, height: 8 } },
      { kind: 'line', props: { x1: 20, y1: 21, x2: 20, y2: 25 } },
      { kind: 'line', props: { x1: 18, y1: 23, x2: 22, y2: 23 } },
    ],
  },
  {
    type: 'bpmn_gateway_xor',
    label: 'Gateway Eksklusif (XOR)',
    category: 'bpmn',
    keywords: ['bpmn', 'gateway', 'xor', 'exclusive', 'keputusan', 'cabang'],
    defaultWidth: 84,
    defaultHeight: 84,
    defaultText: '',
    defaultFill: '#FEF3C7',
    preview: [
      { kind: 'polygon', props: { points: '20,3 35,16 20,29 5,16' } },
      { kind: 'line', props: { x1: 16, y1: 12, x2: 24, y2: 20 } },
      { kind: 'line', props: { x1: 24, y1: 12, x2: 16, y2: 20 } },
    ],
  },
  {
    type: 'bpmn_gateway_and',
    label: 'Gateway Paralel (AND)',
    category: 'bpmn',
    keywords: ['bpmn', 'gateway', 'and', 'parallel', 'paralel', 'plus'],
    defaultWidth: 84,
    defaultHeight: 84,
    defaultText: '',
    defaultFill: '#FEF3C7',
    preview: [
      { kind: 'polygon', props: { points: '20,3 35,16 20,29 5,16' } },
      { kind: 'line', props: { x1: 20, y1: 10, x2: 20, y2: 22 } },
      { kind: 'line', props: { x1: 14, y1: 16, x2: 26, y2: 16 } },
    ],
  },
  {
    type: 'bpmn_data_object',
    label: 'Data Object (BPMN)',
    category: 'bpmn',
    keywords: ['bpmn', 'data object', 'dokumen', 'file', 'artifact'],
    defaultWidth: 96,
    defaultHeight: 112,
    defaultText: 'Data Invoice',
    defaultFill: '#FFFFFF',
    preview: [
      { kind: 'path', props: { d: 'M 10 4 H 24 L 30 10 V 28 H 10 Z' } },
      { kind: 'path', props: { d: 'M 24 4 V 10 H 30' } },
    ],
  },
  {
    type: 'bpmn_pool',
    label: 'Pool / Swimlane (BPMN)',
    category: 'bpmn',
    keywords: ['bpmn', 'pool', 'lane', 'swimlane', 'aktor', 'divisi'],
    defaultWidth: 460,
    defaultHeight: 170,
    defaultText: 'Divisi Operasional',
    defaultFill: 'transparent',
    preview: [
      { kind: 'rect', props: { x: 3, y: 5, width: 34, height: 22 } },
      { kind: 'line', props: { x1: 11, y1: 5, x2: 11, y2: 27 } },
    ],
  },

  // 3. DFD (Data Flow Diagram)
  {
    type: 'dfd_gs_process',
    label: 'Proses DFD (Gane-Sarson)',
    category: 'dfd',
    keywords: ['dfd', 'process', 'gane', 'sarson', 'proses'],
    defaultWidth: 164,
    defaultHeight: 96,
    defaultText: 'Kelola Pesanan',
    defaultFill: '#DBEAFE',
    defaultExtra: { code: '1.0' },
    preview: [
      { kind: 'rect', props: { x: 5, y: 4, width: 30, height: 24, rx: 5 } },
      { kind: 'line', props: { x1: 5, y1: 11, x2: 35, y2: 11 } },
    ],
  },
  {
    type: 'dfd_gs_datastore',
    label: 'Data Store (Gane-Sarson)',
    category: 'dfd',
    keywords: ['dfd', 'datastore', 'penyimpanan', 'gane', 'sarson'],
    defaultWidth: 180,
    defaultHeight: 54,
    defaultText: 'Data Transaksi',
    defaultExtra: { code: 'D1' },
    preview: [
      { kind: 'path', props: { d: 'M 36 8 H 5 V 24 H 36' } },
      { kind: 'line', props: { x1: 13, y1: 8, x2: 13, y2: 24 } },
    ],
  },
  {
    type: 'dfd_gs_entity',
    label: 'Entitas Eksternal (Gane-Sarson)',
    category: 'dfd',
    keywords: ['dfd', 'entity', 'eksternal', 'aktor', 'gane', 'sarson'],
    defaultWidth: 156,
    defaultHeight: 74,
    defaultText: 'Pelanggan',
    defaultFill: '#F1F5F9',
    preview: [
      { kind: 'rect', props: { x: 7, y: 7, width: 29, height: 20 } },
      { kind: 'rect', props: { x: 4, y: 4, width: 29, height: 20 } },
    ],
  },
  {
    type: 'dfd_yd_process',
    label: 'Proses DFD (Yourdon)',
    category: 'dfd',
    keywords: ['dfd', 'yourdon', 'demarco', 'bubble', 'lingkaran', 'bulat', 'proses'],
    defaultWidth: 136,
    defaultHeight: 136,
    defaultText: 'Proses 1',
    defaultFill: '#DBEAFE',
    defaultExtra: { code: '1.0' },
    preview: [{ kind: 'circle', props: { cx: 20, cy: 16, r: 12 } }],
  },
  {
    type: 'dfd_yd_datastore',
    label: 'Data Store (Yourdon)',
    category: 'dfd',
    keywords: ['dfd', 'yourdon', 'demarco', 'datastore', 'paralel'],
    defaultWidth: 176,
    defaultHeight: 50,
    defaultText: 'D1: Pengguna',
    preview: [
      { kind: 'line', props: { x1: 4, y1: 9, x2: 36, y2: 9 } },
      { kind: 'line', props: { x1: 4, y1: 23, x2: 36, y2: 23 } },
    ],
  },
  {
    type: 'dfd_yd_entity',
    label: 'Entitas Eksternal (Yourdon)',
    category: 'dfd',
    keywords: ['dfd', 'yourdon', 'demarco', 'external', 'entity'],
    defaultWidth: 144,
    defaultHeight: 72,
    defaultText: 'Admin Sistem',
    defaultFill: '#F1F5F9',
    preview: [{ kind: 'rect', props: { x: 5, y: 6, width: 30, height: 20 } }],
  },

  // 4. ERD (Crow's Foot & Peter Chen)
  {
    type: 'erd_table',
    label: 'Tabel Entitas ERD',
    category: 'erd',
    keywords: ['erd', 'table', 'entity', 'crow', 'database', 'pk', 'fk'],
    defaultWidth: 224,
    defaultHeight: 146,
    defaultText: 'users',
    defaultFill: '#FFFFFF',
    defaultExtra: {
      fields: [
        { id: 'f1', key: 'PK', name: 'id', type: 'UUID' },
        { id: 'f2', key: '', name: 'name', type: 'VARCHAR' },
        { id: 'f3', key: '', name: 'email', type: 'VARCHAR' },
        { id: 'f4', key: '', name: 'created_at', type: 'TIMESTAMP' },
      ],
    },
    preview: [
      { kind: 'rect', props: { x: 5, y: 4, width: 30, height: 24, rx: 2 } },
      { kind: 'line', props: { x1: 5, y1: 11, x2: 35, y2: 11 } },
      { kind: 'line', props: { x1: 13, y1: 11, x2: 13, y2: 28 } },
    ],
  },
  {
    type: 'erd_weak_table',
    label: 'Tabel Entitas Lemah',
    category: 'erd',
    keywords: ['erd', 'weak', 'entity', 'table'],
    defaultWidth: 224,
    defaultHeight: 126,
    defaultText: 'order_items',
    defaultFill: '#FFFFFF',
    defaultExtra: {
      fields: [
        { id: 'f1', key: 'PK,FK', name: 'order_id', type: 'UUID' },
        { id: 'f2', key: 'FK', name: 'product_id', type: 'UUID' },
        { id: 'f3', key: '', name: 'quantity', type: 'INT' },
      ],
    },
    preview: [
      { kind: 'rect', props: { x: 4, y: 3, width: 32, height: 26, rx: 2 } },
      { kind: 'rect', props: { x: 7, y: 6, width: 26, height: 20 } },
      { kind: 'line', props: { x1: 7, y1: 12, x2: 33, y2: 12 } },
    ],
  },
  {
    type: 'erd_chen_entity',
    label: 'Entitas (Chen)',
    category: 'erd',
    keywords: ['erd', 'chen', 'entity', 'entitas'],
    defaultWidth: 148,
    defaultHeight: 68,
    defaultText: 'MAHASISWA',
    defaultFill: '#DBEAFE',
    preview: [{ kind: 'rect', props: { x: 4, y: 7, width: 32, height: 18 } }],
  },
  {
    type: 'erd_chen_weak_entity',
    label: 'Entitas Lemah (Chen)',
    category: 'erd',
    keywords: ['erd', 'chen', 'weak', 'entitas lemah'],
    defaultWidth: 152,
    defaultHeight: 72,
    defaultText: 'TANGGUNGAN',
    defaultFill: '#DBEAFE',
    preview: [
      { kind: 'rect', props: { x: 4, y: 6, width: 32, height: 20 } },
      { kind: 'rect', props: { x: 7, y: 9, width: 26, height: 14 } },
    ],
  },
  {
    type: 'erd_chen_relation',
    label: 'Relasi (Chen)',
    category: 'erd',
    keywords: ['erd', 'chen', 'relationship', 'relasi'],
    defaultWidth: 136,
    defaultHeight: 84,
    defaultText: 'Memiliki',
    defaultFill: '#FEF3C7',
    preview: [{ kind: 'polygon', props: { points: '20,4 36,16 20,28 4,16' } }],
  },
  {
    type: 'erd_chen_id_relation',
    label: 'Relasi Pengidentifikasi (Chen)',
    category: 'erd',
    keywords: ['erd', 'chen', 'identifying', 'relationship'],
    defaultWidth: 144,
    defaultHeight: 88,
    defaultText: 'Bagian Dari',
    defaultFill: '#FEF3C7',
    preview: [
      { kind: 'polygon', props: { points: '20,3 37,16 20,29 3,16' } },
      { kind: 'polygon', props: { points: '20,7 32,16 20,25 8,16' } },
    ],
  },
  {
    type: 'erd_chen_attribute',
    label: 'Atribut (Chen)',
    category: 'erd',
    keywords: ['erd', 'chen', 'attribute', 'atribut'],
    defaultWidth: 130,
    defaultHeight: 60,
    defaultText: 'nama',
    preview: [{ kind: 'ellipse', props: { cx: 20, cy: 16, rx: 15, ry: 9 } }],
  },
  {
    type: 'erd_chen_key_attr',
    label: 'Atribut Kunci / PK (Chen)',
    category: 'erd',
    keywords: ['erd', 'chen', 'key', 'primary key', 'pk'],
    defaultWidth: 134,
    defaultHeight: 60,
    defaultText: 'id_user',
    preview: [
      { kind: 'ellipse', props: { cx: 20, cy: 16, rx: 15, ry: 9 } },
      { kind: 'line', props: { x1: 12, y1: 19, x2: 28, y2: 19 } },
    ],
  },
  {
    type: 'erd_chen_multi_attr',
    label: 'Atribut Multinilai (Chen)',
    category: 'erd',
    keywords: ['erd', 'chen', 'multivalued', 'attribute'],
    defaultWidth: 142,
    defaultHeight: 66,
    defaultText: 'no_telepon',
    preview: [
      { kind: 'ellipse', props: { cx: 20, cy: 16, rx: 16, ry: 10 } },
      { kind: 'ellipse', props: { cx: 20, cy: 16, rx: 13, ry: 7 } },
    ],
  },
  {
    type: 'erd_chen_derived_attr',
    label: 'Atribut Turunan (Chen)',
    category: 'erd',
    keywords: ['erd', 'chen', 'derived', 'attribute', 'putus'],
    defaultWidth: 136,
    defaultHeight: 60,
    defaultText: 'usia',
    preview: [{ kind: 'ellipse', props: { cx: 20, cy: 16, rx: 15, ry: 9, strokeDasharray: '3 2' } }],
  },

  // 5. UML (Class, Use Case, Sequence)
  {
    type: 'uml_class',
    label: 'Kelas UML',
    category: 'uml',
    keywords: ['uml', 'class', 'oop', 'kelas'],
    defaultWidth: 220,
    defaultHeight: 160,
    defaultText: 'OrderService',
    defaultFill: '#FFFFFF',
    defaultExtra: {
      stereotype: '',
      attributes: ['- orderId: string', '- totalAmount: number'],
      methods: ['+ createOrder(): Order', '+ cancel(): void'],
    },
    preview: [
      { kind: 'rect', props: { x: 6, y: 4, width: 28, height: 24 } },
      { kind: 'line', props: { x1: 6, y1: 11, x2: 34, y2: 11 } },
      { kind: 'line', props: { x1: 6, y1: 19, x2: 34, y2: 19 } },
    ],
  },
  {
    type: 'uml_interface',
    label: 'Interface UML',
    category: 'uml',
    keywords: ['uml', 'interface', 'kontrak'],
    defaultWidth: 216,
    defaultHeight: 136,
    defaultText: 'PaymentGateway',
    defaultFill: '#F1F5F9',
    defaultExtra: {
      stereotype: '<<interface>>',
      attributes: [],
      methods: ['+ charge(amount): boolean', '+ refund(txId): void'],
    },
    preview: [
      { kind: 'rect', props: { x: 6, y: 4, width: 28, height: 24, strokeDasharray: '3 2' } },
      { kind: 'line', props: { x1: 6, y1: 13, x2: 34, y2: 13 } },
    ],
  },
  {
    type: 'uml_package',
    label: 'Package / Modul',
    category: 'uml',
    keywords: ['uml', 'package', 'module', 'folder'],
    defaultWidth: 220,
    defaultHeight: 140,
    defaultText: 'domain::billing',
    defaultFill: '#F8FAFC',
    preview: [
      { kind: 'path', props: { d: 'M 4 10 V 5 H 16 L 19 10 H 36 V 27 H 4 Z' } },
      { kind: 'line', props: { x1: 4, y1: 10, x2: 36, y2: 10 } },
    ],
  },
  {
    type: 'uml_note',
    label: 'Catatan UML',
    category: 'uml',
    keywords: ['uml', 'note', 'komentar'],
    defaultWidth: 168,
    defaultHeight: 92,
    defaultText: 'Catatan desain',
    defaultFill: '#FEF3C7',
    preview: [
      { kind: 'path', props: { d: 'M 5 4 H 28 L 35 11 V 28 H 5 Z' } },
      { kind: 'path', props: { d: 'M 28 4 V 11 H 35' } },
    ],
  },
  {
    type: 'uml_actor',
    label: 'Aktor (Use Case)',
    category: 'uml',
    keywords: ['uml', 'actor', 'use case', 'pengguna', 'user'],
    defaultWidth: 80,
    defaultHeight: 112,
    defaultText: 'Pengguna',
    defaultFill: 'transparent',
    preview: [
      { kind: 'circle', props: { cx: 20, cy: 7, r: 3.5 } },
      { kind: 'line', props: { x1: 20, y1: 10.5, x2: 20, y2: 20 } },
      { kind: 'line', props: { x1: 13, y1: 14, x2: 27, y2: 14 } },
      { kind: 'line', props: { x1: 20, y1: 20, x2: 14, y2: 28 } },
      { kind: 'line', props: { x1: 20, y1: 20, x2: 26, y2: 28 } },
    ],
  },
  {
    type: 'uml_usecase',
    label: 'Use Case',
    category: 'uml',
    keywords: ['uml', 'use case', 'oval', 'fitur'],
    defaultWidth: 168,
    defaultHeight: 74,
    defaultText: 'Kelola Akun',
    defaultFill: '#DBEAFE',
    preview: [{ kind: 'ellipse', props: { cx: 20, cy: 16, rx: 16, ry: 9 } }],
  },
  {
    type: 'uml_boundary',
    label: 'Batas Sistem (Use Case)',
    category: 'uml',
    keywords: ['uml', 'boundary', 'system', 'use case'],
    defaultWidth: 320,
    defaultHeight: 300,
    defaultText: 'Sistem Informasi',
    defaultFill: 'transparent',
    preview: [
      { kind: 'rect', props: { x: 5, y: 4, width: 30, height: 24 } },
      { kind: 'line', props: { x1: 5, y1: 10, x2: 35, y2: 10 } },
    ],
  },
  {
    type: 'uml_lifeline',
    label: 'Lifeline (Sequence)',
    category: 'uml',
    keywords: ['uml', 'sequence', 'lifeline', 'objek'],
    defaultWidth: 132,
    defaultHeight: 240,
    defaultText: ':AuthController',
    defaultFill: '#FFFFFF',
    preview: [
      { kind: 'rect', props: { x: 8, y: 3, width: 24, height: 9 } },
      { kind: 'line', props: { x1: 20, y1: 12, x2: 20, y2: 29, strokeDasharray: '3 2' } },
    ],
  },
  {
    type: 'uml_activation',
    label: 'Aktivasi (Sequence)',
    category: 'uml',
    keywords: ['uml', 'sequence', 'activation', 'execution'],
    defaultWidth: 24,
    defaultHeight: 96,
    defaultText: '',
    defaultFill: '#DBEAFE',
    preview: [{ kind: 'rect', props: { x: 16, y: 4, width: 8, height: 24 } }],
  },
  {
    type: 'uml_fragment',
    label: 'Fragment (alt/loop)',
    category: 'uml',
    keywords: ['uml', 'sequence', 'fragment', 'alt', 'loop', 'opt'],
    defaultWidth: 280,
    defaultHeight: 160,
    defaultText: '[kondisi valid]',
    defaultFill: 'transparent',
    defaultExtra: { code: 'alt' },
    preview: [
      { kind: 'rect', props: { x: 4, y: 4, width: 32, height: 24 } },
      { kind: 'path', props: { d: 'M 4 11 H 15 L 18 8 V 4' } },
    ],
  },
  {
    type: 'uml_initial_node',
    label: 'Initial Node (Activity)',
    category: 'uml',
    keywords: ['uml', 'activity', 'initial', 'start', 'mulai', 'state'],
    defaultWidth: 40,
    defaultHeight: 40,
    defaultText: '',
    defaultFill: '#0F172A',
    preview: [{ kind: 'circle', props: { cx: 20, cy: 16, r: 8, fill: 'currentColor' } }],
  },
  {
    type: 'uml_final_node',
    label: 'Activity Final (Bullseye)',
    category: 'uml',
    keywords: ['uml', 'activity', 'final', 'end', 'selesai', 'bullseye', 'state'],
    defaultWidth: 46,
    defaultHeight: 46,
    defaultText: '',
    defaultFill: '#FFFFFF',
    preview: [
      { kind: 'circle', props: { cx: 20, cy: 16, r: 10 } },
      { kind: 'circle', props: { cx: 20, cy: 16, r: 5.5, fill: 'currentColor' } },
    ],
  },
  {
    type: 'uml_flow_final',
    label: 'Flow Final Node',
    category: 'uml',
    keywords: ['uml', 'activity', 'flow final', 'terminate', 'x'],
    defaultWidth: 44,
    defaultHeight: 44,
    defaultText: '',
    defaultFill: '#FFFFFF',
    preview: [
      { kind: 'circle', props: { cx: 20, cy: 16, r: 10 } },
      { kind: 'line', props: { x1: 13, y1: 9, x2: 27, y2: 23 } },
      { kind: 'line', props: { x1: 27, y1: 9, x2: 13, y2: 23 } },
    ],
  },
  {
    type: 'uml_fork_join',
    label: 'Fork / Join Bar (Activity)',
    category: 'uml',
    keywords: ['uml', 'activity', 'fork', 'join', 'bar', 'sinkronisasi', 'paralel'],
    defaultWidth: 160,
    defaultHeight: 14,
    defaultText: '',
    defaultFill: '#0F172A',
    preview: [{ kind: 'rect', props: { x: 4, y: 13, width: 32, height: 6, rx: 2, fill: 'currentColor' } }],
  },
  {
    type: 'uml_action',
    label: 'Action / State (Activity)',
    category: 'uml',
    keywords: ['uml', 'activity', 'action', 'state', 'aksi', 'status'],
    defaultWidth: 160,
    defaultHeight: 68,
    defaultText: 'Validasi Data',
    defaultFill: '#DBEAFE',
    preview: [{ kind: 'rect', props: { x: 4, y: 7, width: 32, height: 18, rx: 9 } }],
  },
  {
    type: 'uml_component',
    label: 'Komponen UML',
    category: 'uml',
    keywords: ['uml', 'component', 'komponen', 'service', 'module'],
    defaultWidth: 180,
    defaultHeight: 96,
    defaultText: 'AuthComponent',
    defaultFill: '#FFFFFF',
    defaultExtra: { stereotype: '«component»' },
    preview: [
      { kind: 'rect', props: { x: 7, y: 5, width: 28, height: 22 } },
      { kind: 'rect', props: { x: 3, y: 9, width: 7, height: 4 } },
      { kind: 'rect', props: { x: 3, y: 18, width: 7, height: 4 } },
    ],
  },
  {
    type: 'uml_node',
    label: 'Node Deployment (Kubus 3D)',
    category: 'uml',
    keywords: ['uml', 'deployment', 'node', 'cube', 'kubus', 'server', 'device', 'vm'],
    defaultWidth: 176,
    defaultHeight: 120,
    defaultText: 'App Server',
    defaultFill: '#F1F5F9',
    defaultExtra: { stereotype: '«device»' },
    preview: [
      { kind: 'rect', props: { x: 5, y: 10, width: 24, height: 18 } },
      { kind: 'path', props: { d: 'M 5 10 L 12 4 H 35 L 29 10' } },
      { kind: 'path', props: { d: 'M 35 4 V 22 L 29 28' } },
    ],
  },

  // 6. System Architecture
  {
    type: 'arch_server',
    label: 'Server / Service',
    category: 'arch',
    keywords: ['arch', 'server', 'backend', 'api', 'service'],
    defaultWidth: 156,
    defaultHeight: 88,
    defaultText: 'API Server',
    defaultFill: '#F1F5F9',
    preview: [
      { kind: 'rect', props: { x: 6, y: 4, width: 28, height: 8, rx: 1 } },
      { kind: 'rect', props: { x: 6, y: 14, width: 28, height: 8, rx: 1 } },
      { kind: 'line', props: { x1: 10, y1: 8, x2: 14, y2: 8 } },
      { kind: 'line', props: { x1: 10, y1: 18, x2: 14, y2: 18 } },
    ],
  },
  {
    type: 'arch_cloud',
    label: 'Cloud / Internet',
    category: 'arch',
    keywords: ['arch', 'cloud', 'internet', 'aws', 'gcp'],
    defaultWidth: 172,
    defaultHeight: 104,
    defaultText: 'Cloud',
    defaultFill: '#DBEAFE',
    preview: [
      {
        kind: 'path',
        props: {
          d: 'M 11 24 H 29 A 6 6 0 0 0 29 12 A 8 8 0 0 0 14 10 A 6 6 0 0 0 11 24 Z',
        },
      },
    ],
  },
  {
    type: 'arch_database',
    label: 'Database Cluster',
    category: 'arch',
    keywords: ['arch', 'database', 'sql', 'postgres', 'mysql'],
    defaultWidth: 132,
    defaultHeight: 100,
    defaultText: 'PostgreSQL',
    defaultFill: '#DCFCE7',
    preview: [
      { kind: 'ellipse', props: { cx: 20, cy: 8, rx: 13, ry: 4 } },
      { kind: 'path', props: { d: 'M 7 8 V 24 A 13 4 0 0 0 33 24 V 8' } },
      { kind: 'path', props: { d: 'M 7 16 A 13 4 0 0 0 33 16' } },
    ],
  },
  {
    type: 'arch_queue',
    label: 'Message Queue',
    category: 'arch',
    keywords: ['arch', 'queue', 'kafka', 'rabbitmq', 'broker'],
    defaultWidth: 164,
    defaultHeight: 72,
    defaultText: 'Event Queue',
    defaultFill: '#FEF3C7',
    preview: [
      { kind: 'ellipse', props: { cx: 31, cy: 16, rx: 4, ry: 9 } },
      { kind: 'path', props: { d: 'M 31 7 H 9 A 4 9 0 0 0 9 25 H 31' } },
    ],
  },
  {
    type: 'arch_gateway',
    label: 'API Gateway / LB',
    category: 'arch',
    keywords: ['arch', 'gateway', 'load balancer', 'nginx', 'proxy'],
    defaultWidth: 156,
    defaultHeight: 82,
    defaultText: 'API Gateway',
    defaultFill: '#CFFAFE',
    preview: [{ kind: 'polygon', props: { points: '11,5 29,5 36,16 29,27 11,27 4,16' } }],
  },
  {
    type: 'arch_browser',
    label: 'Web Client / Browser',
    category: 'arch',
    keywords: ['arch', 'browser', 'frontend', 'web', 'client'],
    defaultWidth: 164,
    defaultHeight: 96,
    defaultText: 'Web App',
    defaultFill: '#FFFFFF',
    preview: [
      { kind: 'rect', props: { x: 4, y: 5, width: 32, height: 22, rx: 2 } },
      { kind: 'line', props: { x1: 4, y1: 11, x2: 36, y2: 11 } },
    ],
  },
  {
    type: 'arch_mobile',
    label: 'Aplikasi Mobile',
    category: 'arch',
    keywords: ['arch', 'mobile', 'android', 'ios', 'hp'],
    defaultWidth: 100,
    defaultHeight: 148,
    defaultText: 'Mobile App',
    defaultFill: '#FFFFFF',
    preview: [
      { kind: 'rect', props: { x: 12, y: 3, width: 16, height: 26, rx: 3 } },
      { kind: 'line', props: { x1: 17, y1: 25, x2: 23, y2: 25 } },
    ],
  },
  {
    type: 'arch_cache',
    label: 'Cache / Redis',
    category: 'arch',
    keywords: ['arch', 'cache', 'redis', 'memcached', 'memory', 'cepat'],
    defaultWidth: 148,
    defaultHeight: 84,
    defaultText: 'Redis Cache',
    defaultFill: '#FEE2E2',
    defaultStroke: '#B91C1C',
    preview: [
      { kind: 'rect', props: { x: 5, y: 6, width: 30, height: 20, rx: 4 } },
      { kind: 'polygon', props: { points: '22,9 15,17 20,17 18,23 25,15 20,15' } },
    ],
  },
  {
    type: 'arch_firewall',
    label: 'Firewall / WAF',
    category: 'arch',
    keywords: ['arch', 'firewall', 'waf', 'security', 'keamanan', 'shield'],
    defaultWidth: 148,
    defaultHeight: 96,
    defaultText: 'WAF / Firewall',
    defaultFill: '#FEF3C7',
    defaultStroke: '#B45309',
    preview: [
      { kind: 'path', props: { d: 'M 20 4 L 32 9 V 17 C 32 23 26 27 20 29 C 14 27 8 23 8 17 V 9 Z' } },
    ],
  },
  {
    type: 'arch_storage',
    label: 'Object Storage / S3',
    category: 'arch',
    keywords: ['arch', 'storage', 's3', 'bucket', 'blob', 'cdn', 'file'],
    defaultWidth: 144,
    defaultHeight: 92,
    defaultText: 'Object Storage',
    defaultFill: '#DCFCE7',
    defaultStroke: '#15803D',
    preview: [
      { kind: 'path', props: { d: 'M 9 8 H 31 L 28 26 H 12 Z' } },
      { kind: 'ellipse', props: { cx: 20, cy: 8, rx: 11, ry: 3 } },
    ],
  },
  {
    type: 'arch_external_api',
    label: 'API Pihak Ketiga',
    category: 'arch',
    keywords: ['arch', 'external', 'api', 'third party', 'payment', 'webhook', 'integrasi'],
    defaultWidth: 168,
    defaultHeight: 86,
    defaultText: 'Payment API',
    defaultFill: '#F8FAFC',
    defaultExtra: { stereotype: '«external»' },
    preview: [
      { kind: 'rect', props: { x: 4, y: 6, width: 32, height: 20, rx: 4, strokeDasharray: '3 2' } },
    ],
  },
];

/** @type {Map<string, ShapeDefinition>} */
const SHAPE_MAP = new Map(SHAPE_DEFINITIONS.map((def) => [def.type, def]));

/**
 * Look up a shape definition by type.
 * @param {string} type
 * @returns {ShapeDefinition | undefined}
 */
export function getShapeDefinition(type) {
  return SHAPE_MAP.get(type);
}

/**
 * Create a new BoardElement centered around (cx, cy) from a shape type.
 * @param {string} type
 * @param {number} cx
 * @param {number} cy
 * @param {{ renderMode?: 'clean' | 'sketch', strokeColor?: string, fillColor?: string }} [options]
 * @returns {import('../types/schema.js').BoardElement}
 */
export function createElementFromShape(type, cx, cy, options = {}) {
  const def = SHAPE_MAP.get(type);
  const width = def?.defaultWidth ?? 150;
  const height = def?.defaultHeight ?? 80;
  const roughness = options.renderMode === 'sketch' ? 1.3 : 0;
  const seed = Math.floor(Math.random() * 1000000) + 1;

  const extra = def?.defaultExtra ? structuredClone(def.defaultExtra) : {};

  return {
    id: crypto.randomUUID(),
    type,
    x: Math.round(cx - width / 2),
    y: Math.round(cy - height / 2),
    width,
    height,
    strokeColor: def?.defaultStroke ?? options.strokeColor ?? '#0F172A',
    fillColor: def?.defaultFill ?? options.fillColor ?? '#FFFFFF',
    strokeWidth: type === 'bpmn_end' ? 4 : 2,
    strokeStyle:
      type === 'erd_chen_derived_attr' || type === 'arch_external_api' ? 'dashed' : 'solid',
    roughness,
    opacity: 1,
    seed,
    text: def?.defaultText ?? '',
    fontSize: 14,
    fontFamily: options.renderMode === 'sketch' ? 'sketch' : 'sans',
    ...extra,
  };
}

/**
 * Convert an existing shape element into a different symbol type while preserving
 * its ID, position, rotation, text, style, and bound connectors.
 * @param {import('../types/schema.js').BoardElement} el
 * @param {string} targetType
 * @returns {Partial<import('../types/schema.js').BoardElement> | null}
 */
export function morphElementShape(el, targetType) {
  if (el.locked || el.type === 'connector' || el.type === 'freehand') return null;
  if (el.type === targetType) return null;
  const def = SHAPE_MAP.get(targetType);
  if (!def) return null;

  /** @type {Partial<import('../types/schema.js').BoardElement>} */
  const patch = { type: targetType };

  const extra = def.defaultExtra || {};
  if (extra.code && !el.code) {
    patch.code = String(extra.code);
  }
  if (Array.isArray(extra.fields) && (!el.fields || el.fields.length === 0)) {
    patch.fields = structuredClone(extra.fields);
    if (el.height < def.defaultHeight) {
      patch.height = def.defaultHeight;
    }
    if (el.width < def.defaultWidth) {
      patch.width = def.defaultWidth;
    }
  }
  if (Array.isArray(extra.attributes) && (!el.attributes || el.attributes.length === 0)) {
    patch.attributes = structuredClone(extra.attributes);
  }
  if (Array.isArray(extra.methods) && (!el.methods || el.methods.length === 0)) {
    patch.methods = structuredClone(extra.methods);
    if (el.height < def.defaultHeight) {
      patch.height = def.defaultHeight;
    }
    if (el.width < def.defaultWidth) {
      patch.width = def.defaultWidth;
    }
  }
  if (typeof extra.stereotype === 'string' && !el.stereotype) {
    patch.stereotype = extra.stereotype;
  }

  // Keep Yourdon-DeMarco Process as a perfect 1:1 circle centered on the previous shape
  if (targetType === 'dfd_yd_process') {
    const side = Math.max(def.defaultWidth, Math.round(Math.max(el.width, el.height)));
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    patch.x = Math.round(cx - side / 2);
    patch.y = Math.round(cy - side / 2);
    patch.width = side;
    patch.height = side;
  }

  return patch;
}

/**
 * Configure canvas dash pattern from StrokeStyle.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types/schema.js').StrokeStyle} style
 */
export function applyStrokeDash(ctx, style) {
  if (style === 'dashed') {
    ctx.setLineDash([8, 6]);
  } else if (style === 'dotted') {
    ctx.setLineDash([2, 5]);
  } else {
    ctx.setLineDash([]);
  }
}

/**
 * Word-wrap text into lines fitting within maxWidth.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
export function wrapTextLines(ctx, text, maxWidth) {
  if (!text) return [];
  const paragraphs = text.split('\n');
  /** @type {string[]} */
  const lines = [];
  const safeMax = Math.max(24, maxWidth);

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let current = words[0] || '';
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= safeMax) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * Draw centered multiline text inside a bounding box.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {{ fontSize?: number, fontFamily?: 'sans' | 'mono' | 'sketch', color?: string, bold?: boolean, underline?: boolean, align?: 'center' | 'left', vAlign?: 'middle' | 'top' }} opts
 */
export function drawBoxText(ctx, text, x, y, width, height, opts = {}) {
  if (!text) return;
  const fontSize = opts.fontSize || 14;
  const family = FONT_FAMILY_MAP[opts.fontFamily || 'sans'];
  const weight = opts.bold ? '600' : '500';
  ctx.save();
  ctx.font = `${weight} ${fontSize}px ${family}`;
  ctx.fillStyle = opts.color || '#0F172A';
  ctx.textBaseline = 'middle';
  ctx.textAlign = opts.align || 'center';

  const pad = 10;
  const lines = wrapTextLines(ctx, text, width - pad * 2);
  const lineHeight = fontSize * 1.35;
  const totalHeight = lines.length * lineHeight;
  const startY =
    opts.vAlign === 'top'
      ? y + pad + lineHeight / 2
      : y + height / 2 - totalHeight / 2 + lineHeight / 2;
  const textX = opts.align === 'left' ? x + pad : x + width / 2;

  lines.forEach((line, idx) => {
    const ly = startY + idx * lineHeight;
    ctx.fillText(line, textX, ly);
    if (opts.underline && line.length > 0) {
      const w = ctx.measureText(line).width;
      const startX = opts.align === 'left' ? textX : textX - w / 2;
      ctx.beginPath();
      ctx.strokeStyle = opts.color || '#0F172A';
      ctx.lineWidth = 1.25;
      ctx.moveTo(startX, ly + fontSize * 0.45);
      ctx.lineTo(startX + w, ly + fontSize * 0.45);
      ctx.stroke();
    }
  });
  ctx.restore();
}

/**
 * Draw rounded rectangle path on Canvas 2D.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function traceRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/**
 * Fill and stroke current canvas path consistently.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types/schema.js').BoardElement} el
 */
function paintPath(ctx, el) {
  if (el.fillColor && el.fillColor !== 'transparent') {
    ctx.fillStyle = el.fillColor;
    ctx.fill();
  }
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth;
  applyStrokeDash(ctx, el.strokeStyle);
  ctx.stroke();
}

/**
 * Build Rough.js style options for sketchy rendering.
 * @param {import('../types/schema.js').BoardElement} el
 */
function roughOpts(el) {
  /** @type {Record<string, unknown>} */
  const opts = {
    stroke: el.strokeColor,
    strokeWidth: el.strokeWidth,
    roughness: el.roughness,
    seed: el.seed,
    fillStyle: 'hachure',
    hachureGap: 6,
  };
  if (el.fillColor && el.fillColor !== 'transparent') {
    opts.fill = el.fillColor;
    opts.fillStyle = 'solid';
  }
  if (el.strokeStyle === 'dashed') {
    opts.strokeLineDash = [8, 6];
  } else if (el.strokeStyle === 'dotted') {
    opts.strokeLineDash = [2, 5];
  }
  return opts;
}

/**
 * Build SVG path data for a rounded rectangle (used for Rough.js Sketch mode).
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 * @returns {string}
 */
function roundedRectSvgPath(x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  return [
    `M ${x + rad} ${y}`,
    `L ${x + w - rad} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rad}`,
    `L ${x + w} ${y + h - rad}`,
    `Q ${x + w} ${y + h} ${x + w - rad} ${y + h}`,
    `L ${x + rad} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - rad}`,
    `L ${x} ${y + rad}`,
    `Q ${x} ${y} ${x + rad} ${y}`,
    'Z',
  ].join(' ');
}

/**
 * Truncate text with an ellipsis so it never exceeds maxWidth in pixels.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string}
 */
function truncateTextToWidth(ctx, text, maxWidth) {
  if (!text || maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  const ellW = ctx.measureText(ellipsis).width;
  if (ellW >= maxWidth) return '';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid)).width + ellW <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo > 0 ? `${text.slice(0, lo)}${ellipsis}` : '';
}

/**
 * Render an ERD Entity Table with PK/FK badges and column types.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} rc
 * @param {import('../types/schema.js').BoardElement} el
 * @param {{ x: number, y: number, width: number, height: number }} r
 * @param {boolean} isWeak
 */
function drawErdTable(ctx, rc, el, r, isWeak) {
  const headerH = 34;
  const rowH = 24;
  const fields = el.fields || [];
  const useRough = el.roughness > 0;
  const bodyFontFamily = FONT_FAMILY_MAP[el.fontFamily || 'sans'];
  const bodyFontSize = Math.max(10, Math.min(16, (el.fontSize || 14) - 2));

  ctx.save();
  // Clip interior fill & rows cleanly first
  ctx.save();
  traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 6);
  ctx.fillStyle = el.fillColor === 'transparent' ? '#FFFFFF' : el.fillColor;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(r.x, r.y, r.width, headerH);

  drawBoxText(ctx, el.text || 'entity', r.x, r.y, r.width, headerH, {
    fontSize: el.fontSize || 14,
    fontFamily: el.fontFamily || 'sans',
    color: '#0F172A',
    bold: true,
  });

  // Rows
  const keyColW = 46;
  const padX = 8;
  const colGap = 12;
  const contentLeft = r.x + keyColW + padX;
  const contentRight = r.x + r.width - padX;
  const availW = Math.max(0, contentRight - contentLeft);
  const typeFontSize = Math.max(10, bodyFontSize - 1);
  const typeFontFamily =
    el.fontFamily === 'sketch' ? FONT_FAMILY_MAP.sketch : FONT_FAMILY_MAP.mono;

  ctx.beginPath();
  ctx.moveTo(r.x + keyColW, r.y + headerH);
  ctx.lineTo(r.x + keyColW, r.y + r.height);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.stroke();

  fields.forEach((field, idx) => {
    const rowY = r.y + headerH + idx * rowH;
    if (rowY + rowH > r.y + r.height + 4) return;

    if (idx > 0) {
      ctx.beginPath();
      ctx.moveTo(r.x, rowY);
      ctx.lineTo(r.x + r.width, rowY);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const cy = rowY + rowH / 2;
    if (field.key) {
      ctx.font = `600 10px ${FONT_FAMILY_MAP.mono}`;
      ctx.fillStyle = field.key.includes('PK') ? '#1D4ED8' : '#B45309';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(field.key, r.x + keyColW / 2, cy);
    }

    const nameFont = `${field.key?.includes('PK') ? 600 : 500} ${bodyFontSize}px ${bodyFontFamily}`;
    const typeFont = `400 ${typeFontSize}px ${typeFontFamily}`;
    const rawName = field.name || '';
    const rawType = field.type || '';

    ctx.font = nameFont;
    const measuredNameW = ctx.measureText(rawName).width;
    ctx.font = typeFont;
    const measuredTypeW = rawType ? ctx.measureText(rawType).width : 0;

    let maxNameW = availW;
    let maxTypeW = 0;
    if (rawType && availW > 0) {
      if (measuredNameW + colGap + measuredTypeW <= availW) {
        maxNameW = measuredNameW + 1;
        maxTypeW = measuredTypeW + 1;
      } else {
        maxNameW = Math.max(
          Math.min(measuredNameW, availW * 0.45),
          Math.min(measuredNameW, availW - measuredTypeW - colGap),
        );
        maxNameW = Math.max(0, Math.min(availW, maxNameW));
        maxTypeW = Math.max(0, availW - maxNameW - colGap);
      }
    }

    ctx.font = nameFont;
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const fittedName = truncateTextToWidth(ctx, rawName, maxNameW);
    if (fittedName) {
      ctx.fillText(fittedName, contentLeft, cy);
    }

    if (rawType && maxTypeW > 12) {
      const actualNameW = fittedName ? ctx.measureText(fittedName).width : 0;
      const finalTypeMaxW = Math.max(0, availW - actualNameW - (fittedName ? colGap : 0));
      ctx.font = typeFont;
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'right';
      const fittedType = truncateTextToWidth(ctx, rawType, finalTypeMaxW);
      if (fittedType) {
        ctx.fillText(fittedType, contentRight, cy);
      }
    }
  });
  ctx.restore();

  // Outer border & header separator (Rough.js in Sketch mode, crisp in Technical mode)
  if (useRough && rc) {
    const strokeOnly = { ...roughOpts(el), fill: undefined };
    rc.rectangle(r.x, r.y, r.width, r.height, strokeOnly);
    rc.line(r.x, r.y + headerH, r.x + r.width, r.y + headerH, { ...strokeOnly, strokeWidth: 1.5 });
    if (isWeak) {
      rc.rectangle(r.x + 4, r.y + 4, Math.max(8, r.width - 8), Math.max(8, r.height - 8), {
        ...strokeOnly,
        strokeWidth: 1.25,
      });
    }
  } else {
    traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 6);
    ctx.strokeStyle = el.strokeColor;
    ctx.lineWidth = el.strokeWidth;
    applyStrokeDash(ctx, el.strokeStyle);
    ctx.stroke();

    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.moveTo(r.x, r.y + headerH);
    ctx.lineTo(r.x + r.width, r.y + headerH);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (isWeak) {
      traceRoundedRect(ctx, r.x + 4, r.y + 4, Math.max(8, r.width - 8), Math.max(8, r.height - 8), 4);
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Render a 3-compartment UML Class or Interface box.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} rc
 * @param {import('../types/schema.js').BoardElement} el
 * @param {{ x: number, y: number, width: number, height: number }} r
 */
function drawUmlClass(ctx, rc, el, r) {
  const hasStereo = Boolean(el.stereotype);
  const headerH = hasStereo ? 46 : 34;
  const attrs = el.attributes || [];
  const methods = el.methods || [];
  const lineH = 19;
  const attrsH = Math.max(28, attrs.length * lineH + 12);
  const useRough = el.roughness > 0;
  const memberFont = el.fontFamily === 'sketch' ? FONT_FAMILY_MAP.sketch : el.fontFamily === 'sans' ? FONT_FAMILY_MAP.sans : FONT_FAMILY_MAP.mono;
  const memberSize = Math.max(10, Math.min(16, (el.fontSize || 14) - 2));

  ctx.save();
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.width, r.height);
  ctx.fillStyle = el.fillColor === 'transparent' ? '#FFFFFF' : el.fillColor;
  ctx.fill();
  ctx.clip();

  // Header
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(r.x, r.y, r.width, headerH);
  if (hasStereo) {
    ctx.font = `500 11px ${memberFont}`;
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.stereotype || '', r.x + r.width / 2, r.y + 14);
    drawBoxText(ctx, el.text || 'ClassName', r.x, r.y + 18, r.width, headerH - 18, {
      fontSize: el.fontSize || 14,
      fontFamily: el.fontFamily || 'sans',
      bold: true,
    });
  } else {
    drawBoxText(ctx, el.text || 'ClassName', r.x, r.y, r.width, headerH, {
      fontSize: el.fontSize || 14,
      fontFamily: el.fontFamily || 'sans',
      bold: true,
    });
  }

  // Attributes & methods
  ctx.font = `400 ${memberSize}px ${memberFont}`;
  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  attrs.forEach((line, i) => {
    ctx.fillText(line, r.x + 10, r.y + headerH + 14 + i * lineH);
  });

  const div2Y = r.y + headerH + attrsH;
  methods.forEach((line, i) => {
    ctx.fillText(line, r.x + 10, div2Y + 14 + i * lineH);
  });
  ctx.restore();

  if (useRough && rc) {
    const strokeOnly = { ...roughOpts(el), fill: undefined };
    rc.rectangle(r.x, r.y, r.width, r.height, strokeOnly);
    rc.line(r.x, r.y + headerH, r.x + r.width, r.y + headerH, { ...strokeOnly, strokeWidth: 1.25 });
    rc.line(r.x, div2Y, r.x + r.width, div2Y, { ...strokeOnly, strokeWidth: 1.25 });
  } else {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.width, r.height);
    ctx.strokeStyle = el.strokeColor;
    ctx.lineWidth = el.strokeWidth;
    applyStrokeDash(ctx, el.strokeStyle);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + headerH);
    ctx.lineTo(r.x + r.width, r.y + headerH);
    ctx.moveTo(r.x, div2Y);
    ctx.lineTo(r.x + r.width, div2Y);
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw a cylinder (used for fc_database and arch_database).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types/schema.js').BoardElement} el
 * @param {{ x: number, y: number, width: number, height: number }} r
 */
function drawCylinder(ctx, el, r) {
  const ry = Math.min(16, r.height * 0.18);
  const cx = r.x + r.width / 2;
  const rx = r.width / 2;

  ctx.beginPath();
  ctx.ellipse(cx, r.y + ry, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(r.x + r.width, r.y + r.height - ry);
  ctx.ellipse(cx, r.y + r.height - ry, rx, ry, 0, 0, Math.PI);
  ctx.closePath();
  paintPath(ctx, el);

  ctx.beginPath();
  ctx.ellipse(cx, r.y + ry, rx, ry, 0, 0, Math.PI);
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth;
  ctx.stroke();

  if (el.type === 'arch_database') {
    const bandY = r.y + ry * 2.05;
    const bandRy = ry * 0.65;
    ctx.beginPath();
    ctx.ellipse(cx, bandY, rx, bandRy, 0, 0, Math.PI);
    ctx.strokeStyle = el.strokeColor;
    ctx.lineWidth = Math.max(1, el.strokeWidth * 0.75);
    ctx.stroke();

    const textTop = bandY + bandRy + 2;
    const textBottom = r.y + r.height - ry * 0.35;
    drawBoxText(ctx, el.text || '', r.x, textTop, r.width, Math.max(20, textBottom - textTop), {
      fontSize: el.fontSize,
      fontFamily: el.fontFamily,
    });
    return;
  }

  drawBoxText(ctx, el.text || '', r.x, r.y + ry * 1.5, r.width, r.height - ry * 2, {
    fontSize: el.fontSize,
    fontFamily: el.fontFamily,
  });
}

/**
 * Render any non-connector, non-freehand shape onto HTML5 2D Canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} rc RoughCanvas instance
 * @param {import('../types/schema.js').BoardElement} el
 */
export function drawShapeElement(ctx, rc, el) {
  const r = getNormalizedRect(el);
  const useRough = el.roughness > 0;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;

  ctx.save();
  ctx.globalAlpha = el.opacity;
  if (el.rotation) {
    ctx.translate(cx, cy);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  switch (el.type) {
    case 'text':
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width, r.height, {
        fontSize: el.fontSize || 16,
        fontFamily: el.fontFamily || 'sans',
        color: el.strokeColor,
        align: 'left',
        vAlign: 'top',
      });
      break;

    case 'rectangle':
    case 'fc_process':
    case 'dfd_yd_entity':
    case 'erd_chen_entity':
      if (useRough) {
        rc.rectangle(r.x, r.y, r.width, r.height, roughOpts(el));
      } else {
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.width, r.height);
        paintPath(ctx, el);
      }
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: el.type === 'erd_chen_entity',
      });
      break;

    case 'rounded_rect':
    case 'fc_terminator': {
      const radius = el.type === 'fc_terminator' ? r.height / 2 : 12;
      if (useRough && rc) {
        rc.path(roundedRectSvgPath(r.x, r.y, r.width, r.height, radius), roughOpts(el));
      } else {
        traceRoundedRect(ctx, r.x, r.y, r.width, r.height, radius);
        paintPath(ctx, el);
      }
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'ellipse':
    case 'erd_chen_attribute':
    case 'erd_chen_key_attr':
    case 'erd_chen_derived_attr':
    case 'uml_usecase':
      if (useRough) {
        rc.ellipse(cx, cy, r.width, r.height, roughOpts(el));
      } else {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
        paintPath(ctx, el);
      }
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        underline: el.type === 'erd_chen_key_attr',
      });
      break;

    case 'erd_chen_multi_attr':
      ctx.beginPath();
      ctx.ellipse(cx, cy, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
      paintPath(ctx, el);
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(4, r.width / 2 - 5), Math.max(4, r.height / 2 - 5), 0, 0, Math.PI * 2);
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = Math.max(1, el.strokeWidth - 0.5);
      ctx.stroke();
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;

    case 'diamond':
    case 'fc_decision':
    case 'erd_chen_relation':
    case 'erd_chen_id_relation': {
      /** @type {[number, number][]} */
      const pts = [
        [cx, r.y],
        [r.x + r.width, cy],
        [cx, r.y + r.height],
        [r.x, cy],
      ];
      if (useRough) {
        rc.polygon(pts, roughOpts(el));
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.closePath();
        paintPath(ctx, el);
      }
      if (el.type === 'erd_chen_id_relation') {
        const inset = 6;
        ctx.beginPath();
        ctx.moveTo(cx, r.y + inset);
        ctx.lineTo(r.x + r.width - inset * 1.4, cy);
        ctx.lineTo(cx, r.y + r.height - inset);
        ctx.lineTo(r.x + inset * 1.4, cy);
        ctx.closePath();
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      drawBoxText(ctx, el.text || '', r.x + r.width * 0.14, r.y + r.height * 0.14, r.width * 0.72, r.height * 0.72, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'triangle': {
      /** @type {[number, number][]} */
      const pts = [
        [cx, r.y],
        [r.x + r.width, r.y + r.height],
        [r.x, r.y + r.height],
      ];
      if (useRough) {
        rc.polygon(pts, roughOpts(el));
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.closePath();
        paintPath(ctx, el);
      }
      drawBoxText(ctx, el.text || '', r.x, r.y + r.height * 0.35, r.width, r.height * 0.6, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'hexagon':
    case 'arch_gateway': {
      const dx = Math.min(24, r.width * 0.22);
      /** @type {[number, number][]} */
      const pts = [
        [r.x + dx, r.y],
        [r.x + r.width - dx, r.y],
        [r.x + r.width, cy],
        [r.x + r.width - dx, r.y + r.height],
        [r.x + dx, r.y + r.height],
        [r.x, cy],
      ];
      if (useRough) {
        rc.polygon(pts, roughOpts(el));
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.closePath();
        paintPath(ctx, el);
      }
      drawBoxText(ctx, el.text || '', r.x + dx * 0.5, r.y, r.width - dx, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'sticky_note':
    case 'uml_note': {
      const fold = 18;
      ctx.beginPath();
      if (el.type === 'sticky_note') {
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + r.width, r.y);
        ctx.lineTo(r.x + r.width, r.y + r.height - fold);
        ctx.lineTo(r.x + r.width - fold, r.y + r.height);
        ctx.lineTo(r.x, r.y + r.height);
        ctx.closePath();
        paintPath(ctx, el);
        ctx.beginPath();
        ctx.moveTo(r.x + r.width - fold, r.y + r.height);
        ctx.lineTo(r.x + r.width - fold, r.y + r.height - fold);
        ctx.lineTo(r.x + r.width, r.y + r.height - fold);
        ctx.stroke();
      } else {
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + r.width - fold, r.y);
        ctx.lineTo(r.x + r.width, r.y + fold);
        ctx.lineTo(r.x + r.width, r.y + r.height);
        ctx.lineTo(r.x, r.y + r.height);
        ctx.closePath();
        paintPath(ctx, el);
        ctx.beginPath();
        ctx.moveTo(r.x + r.width - fold, r.y);
        ctx.lineTo(r.x + r.width - fold, r.y + fold);
        ctx.lineTo(r.x + r.width, r.y + fold);
        ctx.stroke();
      }
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        align: 'left',
        vAlign: 'top',
      });
      break;
    }

    case 'frame':
    case 'uml_boundary': {
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      if (el.fillColor && el.fillColor !== 'transparent') {
        ctx.fillStyle = el.fillColor;
        ctx.fill();
      }
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.setLineDash(el.type === 'frame' ? [6, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      // Header tab
      ctx.font = `600 12px ${FONT_FAMILY_MAP.sans}`;
      const label = el.text || (el.type === 'frame' ? 'Area Kerja' : 'Sistem');
      const labelW = Math.min(r.width - 16, ctx.measureText(label).width + 20);
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(r.x + 1, r.y + 1, labelW, 24);
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x, r.y, labelW, 25);
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, r.x + 10, r.y + 13);
      break;
    }

    case 'fc_io': {
      const skew = Math.min(22, r.width * 0.16);
      /** @type {[number, number][]} */
      const pts = [
        [r.x + skew, r.y],
        [r.x + r.width, r.y],
        [r.x + r.width - skew, r.y + r.height],
        [r.x, r.y + r.height],
      ];
      if (useRough && rc) {
        rc.polygon(pts, roughOpts(el));
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.closePath();
        paintPath(ctx, el);
      }
      drawBoxText(ctx, el.text || '', r.x + skew * 0.5, r.y, r.width - skew, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'fc_document': {
      const wave = Math.min(14, r.height * 0.18);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + r.width, r.y);
      ctx.lineTo(r.x + r.width, r.y + r.height - wave);
      ctx.quadraticCurveTo(
        r.x + r.width * 0.75,
        r.y + r.height - wave * 2.2,
        r.x + r.width * 0.5,
        r.y + r.height - wave,
      );
      ctx.quadraticCurveTo(
        r.x + r.width * 0.25,
        r.y + r.height + wave * 0.4,
        r.x,
        r.y + r.height - wave,
      );
      ctx.closePath();
      paintPath(ctx, el);
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width, r.height - wave, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'fc_predefined': {
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      paintPath(ctx, el);
      const inset = 14;
      ctx.beginPath();
      ctx.moveTo(r.x + inset, r.y);
      ctx.lineTo(r.x + inset, r.y + r.height);
      ctx.moveTo(r.x + r.width - inset, r.y);
      ctx.lineTo(r.x + r.width - inset, r.y + r.height);
      ctx.stroke();
      drawBoxText(ctx, el.text || '', r.x + inset, r.y, r.width - inset * 2, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'fc_database':
    case 'arch_database':
      drawCylinder(ctx, el, r);
      break;

    case 'fc_manual_op': {
      const inset = Math.min(20, r.width * 0.14);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + r.width, r.y);
      ctx.lineTo(r.x + r.width - inset, r.y + r.height);
      ctx.lineTo(r.x + inset, r.y + r.height);
      ctx.closePath();
      paintPath(ctx, el);
      drawBoxText(ctx, el.text || '', r.x + inset, r.y, r.width - inset * 2, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'fc_delay': {
      const arcR = r.height / 2;
      const straightW = Math.max(8, r.width - arcR);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + straightW, r.y);
      ctx.arc(r.x + straightW, cy, arcR, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(r.x, r.y + r.height);
      ctx.closePath();
      paintPath(ctx, el);
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width - arcR * 0.3, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'fc_offpage': {
      const tipH = r.height * 0.32;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + r.width, r.y);
      ctx.lineTo(r.x + r.width, r.y + r.height - tipH);
      ctx.lineTo(cx, r.y + r.height);
      ctx.lineTo(r.x, r.y + r.height - tipH);
      ctx.closePath();
      paintPath(ctx, el);
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width, r.height - tipH * 0.4, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'dfd_gs_process': {
      const bandH = 26;
      if (useRough && rc) {
        rc.path(roundedRectSvgPath(r.x, r.y, r.width, r.height, 12), roughOpts(el));
        rc.line(r.x, r.y + bandH, r.x + r.width, r.y + bandH, { ...roughOpts(el), fill: undefined, strokeWidth: 1.5 });
      } else {
        traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 12);
        paintPath(ctx, el);
        ctx.beginPath();
        ctx.moveTo(r.x, r.y + bandH);
        ctx.lineTo(r.x + r.width, r.y + bandH);
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      drawBoxText(ctx, el.code || '1.0', r.x, r.y, r.width, bandH, {
        fontSize: 12,
        fontFamily: el.fontFamily === 'sketch' ? 'sketch' : 'mono',
        bold: true,
      });
      drawBoxText(ctx, el.text || '', r.x, r.y + bandH, r.width, r.height - bandH, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'dfd_gs_datastore': {
      const idW = Math.min(44, r.width * 0.25);
      if (el.fillColor && el.fillColor !== 'transparent') {
        ctx.fillStyle = el.fillColor;
        ctx.fillRect(r.x, r.y, r.width, r.height);
      }
      if (useRough && rc) {
        const strokeOnly = { ...roughOpts(el), fill: undefined };
        rc.linearPath(
          [
            [r.x + r.width, r.y],
            [r.x, r.y],
            [r.x, r.y + r.height],
            [r.x + r.width, r.y + r.height],
          ],
          strokeOnly,
        );
        rc.line(r.x + idW, r.y, r.x + idW, r.y + r.height, strokeOnly);
      } else {
        ctx.beginPath();
        ctx.moveTo(r.x + r.width, r.y);
        ctx.lineTo(r.x, r.y);
        ctx.lineTo(r.x, r.y + r.height);
        ctx.lineTo(r.x + r.width, r.y + r.height);
        ctx.moveTo(r.x + idW, r.y);
        ctx.lineTo(r.x + idW, r.y + r.height);
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = el.strokeWidth;
        applyStrokeDash(ctx, el.strokeStyle);
        ctx.stroke();
      }

      drawBoxText(ctx, el.code || 'D1', r.x, r.y, idW, r.height, {
        fontSize: 12,
        fontFamily: el.fontFamily === 'sketch' ? 'sketch' : 'mono',
        bold: true,
      });
      drawBoxText(ctx, el.text || '', r.x + idW, r.y, r.width - idW, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        align: 'left',
      });
      break;
    }

    case 'dfd_gs_entity': {
      const off = 5;
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(r.x + off, r.y + off, r.width - off, r.height - off);
      if (useRough && rc) {
        rc.rectangle(r.x, r.y, r.width - off, r.height - off, roughOpts(el));
      } else {
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.width - off, r.height - off);
        paintPath(ctx, el);
      }
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width - off, r.height - off, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'dfd_yd_process': {
      if (useRough && rc) {
        rc.ellipse(cx, cy, r.width, r.height, roughOpts(el));
      } else {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
        paintPath(ctx, el);
      }

      const insetX = Math.max(14, r.width * 0.12);
      const insetY = Math.max(12, r.height * 0.14);
      const innerW = Math.max(24, r.width - insetX * 2);
      const innerH = Math.max(24, r.height - insetY * 2);

      if (el.code) {
        const fontSize = el.fontSize || 13;
        const family = FONT_FAMILY_MAP[el.fontFamily || 'sans'];
        ctx.save();
        ctx.font = `500 ${fontSize}px ${family}`;
        const bodyLines = wrapTextLines(ctx, el.text || '', innerW);
        const codeH = 18;
        const gap = bodyLines.length > 0 ? 4 : 0;
        const bodyLineH = fontSize * 1.3;
        const totalH = codeH + gap + bodyLines.length * bodyLineH;
        const startY = cy - totalH / 2;

        ctx.fillStyle = '#0F172A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.min(13, fontSize)}px ${family}`;
        ctx.fillText(el.code, cx, startY + codeH / 2);

        ctx.font = `500 ${fontSize}px ${family}`;
        bodyLines.forEach((line, idx) => {
          ctx.fillText(line, cx, startY + codeH + gap + bodyLineH / 2 + idx * bodyLineH);
        });
        ctx.restore();
      } else {
        drawBoxText(ctx, el.text || '', r.x + insetX, r.y + insetY, innerW, innerH, {
          fontSize: el.fontSize,
          fontFamily: el.fontFamily,
        });
      }
      break;
    }

    case 'dfd_yd_datastore': {
      if (el.fillColor && el.fillColor !== 'transparent') {
        ctx.fillStyle = el.fillColor;
        ctx.fillRect(r.x, r.y, r.width, r.height);
      }
      if (useRough && rc) {
        const strokeOnly = { ...roughOpts(el), fill: undefined };
        rc.line(r.x, r.y, r.x + r.width, r.y, strokeOnly);
        rc.line(r.x, r.y + r.height, r.x + r.width, r.y + r.height, strokeOnly);
      } else {
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + r.width, r.y);
        ctx.moveTo(r.x, r.y + r.height);
        ctx.lineTo(r.x + r.width, r.y + r.height);
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = el.strokeWidth;
        applyStrokeDash(ctx, el.strokeStyle);
        ctx.stroke();
      }
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'erd_table':
      drawErdTable(ctx, rc, el, r, false);
      break;

    case 'erd_weak_table':
      drawErdTable(ctx, rc, el, r, true);
      break;

    case 'erd_chen_weak_entity':
      if (useRough && rc) {
        rc.rectangle(r.x, r.y, r.width, r.height, roughOpts(el));
        rc.rectangle(r.x + 5, r.y + 5, Math.max(4, r.width - 10), Math.max(4, r.height - 10), {
          ...roughOpts(el),
          fill: undefined,
          strokeWidth: 1.25,
        });
      } else {
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.width, r.height);
        paintPath(ctx, el);
        ctx.beginPath();
        ctx.rect(r.x + 5, r.y + 5, Math.max(4, r.width - 10), Math.max(4, r.height - 10));
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      drawBoxText(ctx, el.text || '', r.x + 6, r.y + 6, r.width - 12, r.height - 12, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;

    case 'uml_class':
    case 'uml_interface':
      drawUmlClass(ctx, rc, el, r);
      break;

    case 'uml_package': {
      const tabW = Math.min(110, r.width * 0.48);
      const tabH = 24;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + tabH);
      ctx.lineTo(r.x, r.y);
      ctx.lineTo(r.x + tabW - 8, r.y);
      ctx.lineTo(r.x + tabW, r.y + tabH);
      ctx.lineTo(r.x + r.width, r.y + tabH);
      ctx.lineTo(r.x + r.width, r.y + r.height);
      ctx.lineTo(r.x, r.y + r.height);
      ctx.closePath();
      paintPath(ctx, el);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + tabH);
      ctx.lineTo(r.x + tabW, r.y + tabH);
      ctx.stroke();
      drawBoxText(ctx, el.text || '', r.x, r.y + tabH, r.width, r.height - tabH, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'uml_actor': {
      const headR = Math.min(14, r.height * 0.14);
      const headCy = r.y + headR + 4;
      const bodyTop = headCy + headR;
      const bodyBot = r.y + r.height * 0.58;
      const armY = bodyTop + (bodyBot - bodyTop) * 0.35;
      const legBot = r.y + r.height * 0.8;
      const spread = Math.min(24, r.width * 0.32);

      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.beginPath();
      ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, bodyTop);
      ctx.lineTo(cx, bodyBot);
      ctx.moveTo(cx - spread, armY);
      ctx.lineTo(cx + spread, armY);
      ctx.moveTo(cx, bodyBot);
      ctx.lineTo(cx - spread * 0.85, legBot);
      ctx.moveTo(cx, bodyBot);
      ctx.lineTo(cx + spread * 0.85, legBot);
      ctx.stroke();

      drawBoxText(ctx, el.text || '', r.x - 16, legBot + 2, r.width + 32, r.height - (legBot - r.y), {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'uml_lifeline': {
      const boxH = 42;
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, boxH);
      paintPath(ctx, el);
      drawBoxText(ctx, el.text || ':Objek', r.x, r.y, r.width, boxH, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
        underline: true,
        bold: true,
      });

      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.moveTo(cx, r.y + boxH);
      ctx.lineTo(cx, r.y + r.height);
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }

    case 'uml_activation':
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      paintPath(ctx, el);
      break;

    case 'uml_fragment': {
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      paintPath(ctx, el);
      const tagW = 64;
      const tagH = 24;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + tagW, r.y);
      ctx.lineTo(r.x + tagW, r.y + tagH - 7);
      ctx.lineTo(r.x + tagW - 8, r.y + tagH);
      ctx.lineTo(r.x, r.y + tagH);
      ctx.closePath();
      ctx.fillStyle = '#F1F5F9';
      ctx.fill();
      ctx.stroke();

      drawBoxText(ctx, el.code || 'alt', r.x, r.y, tagW - 6, tagH, {
        fontSize: 12,
        fontFamily: 'mono',
        bold: true,
      });
      drawBoxText(ctx, el.text || '', r.x + tagW + 6, r.y, r.width - tagW - 10, tagH, {
        fontSize: 12,
        fontFamily: 'mono',
        align: 'left',
      });
      break;
    }

    case 'arch_server': {
      traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 8);
      paintPath(ctx, el);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + 24);
      ctx.lineTo(r.x + r.width, r.y + 24);
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      // Status dots on server bar
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.arc(r.x + 14, r.y + 12, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1D4ED8';
      ctx.beginPath();
      ctx.arc(r.x + 26, r.y + 12, 3.5, 0, Math.PI * 2);
      ctx.fill();
      drawBoxText(ctx, el.text || '', r.x, r.y + 24, r.width, r.height - 24, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'arch_cloud': {
      ctx.beginPath();
      const x = r.x;
      const y = r.y;
      const w = r.width;
      const h = r.height;
      ctx.moveTo(x + w * 0.25, y + h * 0.85);
      ctx.bezierCurveTo(x, y + h * 0.85, x, y + h * 0.45, x + w * 0.2, y + h * 0.42);
      ctx.bezierCurveTo(x + w * 0.22, y + h * 0.12, x + w * 0.55, y + h * 0.08, x + w * 0.64, y + h * 0.28);
      ctx.bezierCurveTo(x + w * 0.85, y + h * 0.22, x + w, y + h * 0.45, x + w * 0.9, y + h * 0.65);
      ctx.bezierCurveTo(x + w, y + h * 0.85, x + w * 0.82, y + h * 0.85, x + w * 0.75, y + h * 0.85);
      ctx.closePath();
      paintPath(ctx, el);
      drawBoxText(ctx, el.text || '', x + w * 0.14, y + h * 0.24, w * 0.72, h * 0.58, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'arch_queue': {
      const rx = Math.min(14, r.width * 0.12);
      const ry = r.height / 2;
      ctx.beginPath();
      ctx.ellipse(r.x + rx, cy, rx, ry, 0, Math.PI / 2, Math.PI * 1.5);
      ctx.lineTo(r.x + r.width - rx, r.y);
      ctx.ellipse(r.x + r.width - rx, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      paintPath(ctx, el);
      ctx.beginPath();
      ctx.ellipse(r.x + r.width - rx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      drawBoxText(ctx, el.text || '', r.x + rx, r.y, r.width - rx * 2.4, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'arch_browser': {
      traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 8);
      paintPath(ctx, el);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + 24);
      ctx.lineTo(r.x + r.width, r.y + 24);
      ctx.stroke();
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(r.x + 12 + i * 11, r.y + 12, 2.8, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawBoxText(ctx, el.text || '', r.x, r.y + 24, r.width, r.height - 24, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'arch_mobile': {
      traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 14);
      paintPath(ctx, el);
      ctx.beginPath();
      ctx.moveTo(cx - 14, r.y + 12);
      ctx.lineTo(cx + 14, r.y + 12);
      ctx.moveTo(cx - 12, r.y + r.height - 12);
      ctx.lineTo(cx + 12, r.y + r.height - 12);
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawBoxText(ctx, el.text || '', r.x + 6, r.y + 20, r.width - 12, r.height - 40, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    // === Rich Picture (Soft Systems Methodology — Checkland) ===
    case 'rp_stakeholder': {
      const iconH = r.height * 0.72;
      const headR = Math.min(r.width * 0.2, iconH * 0.24);
      const headCy = r.y + headR + 6;
      const bodyTop = headCy + headR + 4;
      const bodyBot = r.y + iconH;
      const bodyHalfW = Math.min(r.width * 0.36, headR * 2.1);

      ctx.beginPath();
      ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
      paintPath(ctx, el);

      ctx.beginPath();
      ctx.moveTo(cx - bodyHalfW, bodyBot);
      ctx.quadraticCurveTo(cx - bodyHalfW, bodyTop, cx, bodyTop);
      ctx.quadraticCurveTo(cx + bodyHalfW, bodyTop, cx + bodyHalfW, bodyBot);
      ctx.closePath();
      paintPath(ctx, el);

      drawBoxText(ctx, el.text || '', r.x - 16, bodyBot + 2, r.width + 32, r.height - iconH, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'rp_group': {
      const iconH = r.height * 0.7;
      const drawPerson = (px, py, scale) => {
        const hr = Math.min(r.width * 0.12, iconH * 0.2) * scale;
        const bTop = py + hr + 3;
        const bBot = r.y + iconH;
        const bw = hr * 1.95;
        ctx.beginPath();
        ctx.arc(px, py, hr, 0, Math.PI * 2);
        paintPath(ctx, el);
        ctx.beginPath();
        ctx.moveTo(px - bw, bBot);
        ctx.quadraticCurveTo(px - bw, bTop, px, bTop);
        ctx.quadraticCurveTo(px + bw, bTop, px + bw, bBot);
        ctx.closePath();
        paintPath(ctx, el);
      };
      const sideOffset = Math.min(34, r.width * 0.26);
      drawPerson(cx - sideOffset, r.y + iconH * 0.34, 0.85);
      drawPerson(cx + sideOffset, r.y + iconH * 0.34, 0.85);
      drawPerson(cx, r.y + iconH * 0.26, 1.0);
      drawBoxText(ctx, el.text || '', r.x - 12, r.y + iconH + 2, r.width + 24, r.height - iconH, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'rp_thought': {
      const x = r.x;
      const y = r.y;
      const w = r.width;
      const h = r.height * 0.78;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.22, y + h * 0.9);
      ctx.bezierCurveTo(x, y + h * 0.9, x, y + h * 0.45, x + w * 0.16, y + h * 0.4);
      ctx.bezierCurveTo(x + w * 0.16, y + h * 0.08, x + w * 0.48, y + h * 0.04, x + w * 0.56, y + h * 0.22);
      ctx.bezierCurveTo(x + w * 0.76, y + h * 0.08, x + w * 0.96, y + h * 0.3, x + w * 0.88, y + h * 0.54);
      ctx.bezierCurveTo(x + w, y + h * 0.78, x + w * 0.82, y + h * 0.94, x + w * 0.66, y + h * 0.9);
      ctx.bezierCurveTo(x + w * 0.54, y + h * 0.98, x + w * 0.34, y + h * 0.98, x + w * 0.22, y + h * 0.9);
      ctx.closePath();
      paintPath(ctx, el);

      // Trailing thought circles
      ctx.beginPath();
      ctx.arc(x + w * 0.22, r.y + h + (r.height - h) * 0.36, Math.min(7, (r.height - h) * 0.28), 0, Math.PI * 2);
      paintPath(ctx, el);
      ctx.beginPath();
      ctx.arc(x + w * 0.12, r.y + h + (r.height - h) * 0.76, Math.min(4.2, (r.height - h) * 0.18), 0, Math.PI * 2);
      paintPath(ctx, el);

      drawBoxText(ctx, el.text || '', x + w * 0.12, y + h * 0.16, w * 0.76, h * 0.68, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'rp_speech': {
      const tailH = Math.min(18, r.height * 0.2);
      const boxH = r.height - tailH;
      const rad = 12;
      ctx.beginPath();
      ctx.moveTo(r.x + rad, r.y);
      ctx.lineTo(r.x + r.width - rad, r.y);
      ctx.quadraticCurveTo(r.x + r.width, r.y, r.x + r.width, r.y + rad);
      ctx.lineTo(r.x + r.width, r.y + boxH - rad);
      ctx.quadraticCurveTo(r.x + r.width, r.y + boxH, r.x + r.width - rad, r.y + boxH);
      ctx.lineTo(r.x + Math.min(48, r.width * 0.36), r.y + boxH);
      ctx.lineTo(r.x + Math.min(20, r.width * 0.16), r.y + r.height);
      ctx.lineTo(r.x + Math.min(24, r.width * 0.2), r.y + boxH);
      ctx.lineTo(r.x + rad, r.y + boxH);
      ctx.quadraticCurveTo(r.x, r.y + boxH, r.x, r.y + boxH - rad);
      ctx.lineTo(r.x, r.y + rad);
      ctx.quadraticCurveTo(r.x, r.y, r.x + rad, r.y);
      ctx.closePath();
      paintPath(ctx, el);
      drawBoxText(ctx, el.text || '', r.x + 6, r.y + 4, r.width - 12, boxH - 8, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'rp_conflict': {
      const iconH = r.height * 0.72;
      const icx = cx;
      const icy = r.y + iconH / 2 + 2;
      const rad = Math.min(r.width, iconH) * 0.44;

      // Soft circular emblem behind crossed swords
      ctx.beginPath();
      ctx.arc(icx, icy, rad, 0, Math.PI * 2);
      paintPath(ctx, el);

      // Classic SSM Crossed Swords
      const s = rad * 0.66;
      const g = rad * 0.22;
      ctx.save();
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = Math.max(2.2, el.strokeWidth + 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Sword 1 (top-left to bottom-right)
      ctx.moveTo(icx - s, icy - s);
      ctx.lineTo(icx + s, icy + s);
      // Guard 1 (near bottom-right hilt)
      ctx.moveTo(icx + s * 0.35 - g, icy + s * 0.35 + g);
      ctx.lineTo(icx + s * 0.35 + g, icy + s * 0.35 - g);
      // Sword 2 (top-right to bottom-left)
      ctx.moveTo(icx + s, icy - s);
      ctx.lineTo(icx - s, icy + s);
      // Guard 2 (near bottom-left hilt)
      ctx.moveTo(icx - s * 0.35 - g, icy + s * 0.35 - g);
      ctx.lineTo(icx - s * 0.35 + g, icy + s * 0.35 + g);
      ctx.stroke();
      ctx.restore();

      drawBoxText(ctx, el.text || '', r.x - 12, r.y + iconH + 2, r.width + 24, r.height - iconH, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'rp_eye': {
      const iconH = r.height * 0.68;
      const ey = r.y + iconH / 2 + 2;
      const ex1 = r.x + 8;
      const ex2 = r.x + r.width - 8;
      const arc = iconH * 0.56;

      ctx.beginPath();
      ctx.moveTo(ex1, ey);
      ctx.quadraticCurveTo(cx, ey - arc, ex2, ey);
      ctx.quadraticCurveTo(cx, ey + arc, ex1, ey);
      ctx.closePath();
      paintPath(ctx, el);

      const irisR = Math.min(iconH * 0.27, (ex2 - ex1) * 0.18);
      ctx.beginPath();
      ctx.arc(cx, ey, irisR, 0, Math.PI * 2);
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, ey, irisR * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = el.strokeColor;
      ctx.fill();

      drawBoxText(ctx, el.text || '', r.x - 10, r.y + iconH + 2, r.width + 20, r.height - iconH, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'rp_crisis': {
      const iconH = r.height * 0.72;
      const ix = r.x + r.width * 0.18;
      const iw = r.width * 0.64;
      const iy = r.y + 4;
      const ih = iconH - 6;
      ctx.beginPath();
      ctx.moveTo(ix + iw * 0.58, iy);
      ctx.lineTo(ix + iw * 0.14, iy + ih * 0.54);
      ctx.lineTo(ix + iw * 0.48, iy + ih * 0.54);
      ctx.lineTo(ix + iw * 0.34, iy + ih);
      ctx.lineTo(ix + iw * 0.86, iy + ih * 0.42);
      ctx.lineTo(ix + iw * 0.52, iy + ih * 0.42);
      ctx.closePath();
      paintPath(ctx, el);

      drawBoxText(ctx, el.text || '', r.x - 14, r.y + iconH + 2, r.width + 28, r.height - iconH, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'rp_organization': {
      const iconH = r.height * 0.72;
      const bx = r.x + r.width * 0.16;
      const bw = r.width * 0.68;
      const by = r.y + 6;
      const bh = iconH - 6;

      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      paintPath(ctx, el);

      // Windows 2x2 + Door
      const winW = bw * 0.18;
      const winH = bh * 0.16;
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = Math.max(1.2, el.strokeWidth * 0.75);
      for (const rxOff of [0.18, 0.64]) {
        for (const ryOff of [0.16, 0.42]) {
          ctx.strokeRect(bx + bw * rxOff, by + bh * ryOff, winW, winH);
        }
      }
      ctx.strokeRect(bx + bw * 0.39, by + bh * 0.68, bw * 0.22, bh * 0.32);

      drawBoxText(ctx, el.text || '', r.x - 10, r.y + iconH + 2, r.width + 20, r.height - iconH, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'rp_money': {
      const iconH = r.height * 0.72;
      const icy = r.y + iconH / 2 + 2;
      const rad = Math.min(r.width, iconH) * 0.44;

      ctx.beginPath();
      ctx.arc(cx, icy, rad, 0, Math.PI * 2);
      paintPath(ctx, el);

      ctx.beginPath();
      ctx.arc(cx, icy, Math.max(4, rad - 5), 0, Math.PI * 2);
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = 1.25;
      ctx.stroke();

      drawBoxText(ctx, 'Rp', cx - rad, icy - rad, rad * 2, rad * 2, {
        fontSize: Math.max(12, Math.round(rad * 0.65)),
        fontFamily: 'mono',
        color: el.strokeColor,
        bold: true,
      });

      drawBoxText(ctx, el.text || '', r.x - 12, r.y + iconH + 2, r.width + 24, r.height - iconH, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'rp_document_stack': {
      const off = 8;
      // Back sheet
      ctx.beginPath();
      ctx.rect(r.x + off, r.y, r.width - off, r.height - off);
      paintPath(ctx, el);
      // Front sheet
      ctx.beginPath();
      ctx.rect(r.x, r.y + off, r.width - off, r.height - off);
      paintPath(ctx, el);

      drawBoxText(ctx, el.text || '', r.x + 6, r.y + off + 4, r.width - off - 12, r.height - off - 8, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
      });
      break;
    }

    // === BPMN 2.0 (OMG ISO/IEC 19510) ===
    case 'bpmn_start':
    case 'bpmn_intermediate':
    case 'bpmn_end': {
      const rad = Math.min(r.width, r.height) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      if (el.fillColor && el.fillColor !== 'transparent') {
        ctx.fillStyle = el.fillColor;
        ctx.fill();
      }
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.type === 'bpmn_end' ? Math.max(3.5, el.strokeWidth) : el.strokeWidth;
      applyStrokeDash(ctx, el.strokeStyle);
      ctx.stroke();

      if (el.type === 'bpmn_intermediate') {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(4, rad - 5), 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1.25, el.strokeWidth * 0.75);
        ctx.stroke();
      }

      drawBoxText(ctx, el.text || '', r.x - 16, r.y + r.height + 2, r.width + 32, 24, {
        fontSize: el.fontSize || 12,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'bpmn_task':
    case 'bpmn_subprocess': {
      if (useRough && rc) {
        rc.path(roundedRectSvgPath(r.x, r.y, r.width, r.height, 10), roughOpts(el));
      } else {
        traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 10);
        paintPath(ctx, el);
      }
      if (el.type === 'bpmn_subprocess') {
        const s = 14;
        const sx = cx - s / 2;
        const sy = r.y + r.height - s - 4;
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(sx, sy, s, s);
        ctx.beginPath();
        ctx.moveTo(cx, sy + 3);
        ctx.lineTo(cx, sy + s - 3);
        ctx.moveTo(sx + 3, sy + s / 2);
        ctx.lineTo(sx + s - 3, sy + s / 2);
        ctx.stroke();
      }
      drawBoxText(
        ctx,
        el.text || '',
        r.x + 8,
        r.y + 4,
        r.width - 16,
        el.type === 'bpmn_subprocess' ? r.height - 22 : r.height - 8,
        { fontSize: el.fontSize, fontFamily: el.fontFamily },
      );
      break;
    }

    case 'bpmn_gateway_xor':
    case 'bpmn_gateway_and': {
      /** @type {[number, number][]} */
      const pts = [
        [cx, r.y],
        [r.x + r.width, cy],
        [cx, r.y + r.height],
        [r.x, cy],
      ];
      if (useRough && rc) {
        rc.polygon(pts, roughOpts(el));
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.closePath();
        paintPath(ctx, el);
      }

      const arm = Math.min(r.width, r.height) * 0.2;
      ctx.save();
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = Math.max(2.5, el.strokeWidth + 0.8);
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (el.type === 'bpmn_gateway_xor') {
        ctx.moveTo(cx - arm, cy - arm);
        ctx.lineTo(cx + arm, cy + arm);
        ctx.moveTo(cx + arm, cy - arm);
        ctx.lineTo(cx - arm, cy + arm);
      } else {
        ctx.moveTo(cx, cy - arm * 1.15);
        ctx.lineTo(cx, cy + arm * 1.15);
        ctx.moveTo(cx - arm * 1.15, cy);
        ctx.lineTo(cx + arm * 1.15, cy);
      }
      ctx.stroke();
      ctx.restore();

      if (el.text) {
        drawBoxText(ctx, el.text, r.x - 20, r.y + r.height + 2, r.width + 40, 24, {
          fontSize: el.fontSize || 12,
          fontFamily: el.fontFamily,
        });
      }
      break;
    }

    case 'bpmn_data_object': {
      const fold = Math.min(18, r.width * 0.26);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + r.width - fold, r.y);
      ctx.lineTo(r.x + r.width, r.y + fold);
      ctx.lineTo(r.x + r.width, r.y + r.height);
      ctx.lineTo(r.x, r.y + r.height);
      ctx.closePath();
      paintPath(ctx, el);

      ctx.beginPath();
      ctx.moveTo(r.x + r.width - fold, r.y);
      ctx.lineTo(r.x + r.width - fold, r.y + fold);
      ctx.lineTo(r.x + r.width, r.y + fold);
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.stroke();

      drawBoxText(ctx, el.text || '', r.x + 6, r.y + fold, r.width - 12, r.height - fold - 4, {
        fontSize: el.fontSize || 12,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'bpmn_pool': {
      const headerW = 34;
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      paintPath(ctx, el);

      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(r.x + 1, r.y + 1, headerW - 1, r.height - 2);
      ctx.beginPath();
      ctx.moveTo(r.x + headerW, r.y);
      ctx.lineTo(r.x + headerW, r.y + r.height);
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.stroke();

      ctx.save();
      ctx.translate(r.x + headerW / 2, cy);
      ctx.rotate(-Math.PI / 2);
      drawBoxText(ctx, el.text || 'Swimlane', -r.height / 2, -headerW / 2, r.height, headerW, {
        fontSize: el.fontSize || 13,
        fontFamily: el.fontFamily,
        bold: true,
      });
      ctx.restore();
      break;
    }

    // === UML 2.5 Activity, Component & Deployment ===
    case 'uml_initial_node': {
      const rad = Math.min(r.width, r.height) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = el.fillColor === 'transparent' ? el.strokeColor : el.fillColor;
      ctx.fill();
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.stroke();
      break;
    }

    case 'uml_final_node': {
      const rad = Math.min(r.width, r.height) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      paintPath(ctx, el);

      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(4, rad * 0.58), 0, Math.PI * 2);
      ctx.fillStyle = el.strokeColor;
      ctx.fill();
      break;
    }

    case 'uml_flow_final': {
      const rad = Math.min(r.width, r.height) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      paintPath(ctx, el);
      const d = rad * 0.707;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d);
      ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d);
      ctx.lineTo(cx - d, cy + d);
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.stroke();
      break;
    }

    case 'uml_fork_join': {
      traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 4);
      ctx.fillStyle = el.fillColor === 'transparent' ? el.strokeColor : el.fillColor;
      ctx.fill();
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.stroke();
      break;
    }

    case 'uml_action': {
      const rad = Math.min(20, r.height * 0.42);
      if (useRough && rc) {
        rc.path(roundedRectSvgPath(r.x, r.y, r.width, r.height, rad), roughOpts(el));
      } else {
        traceRoundedRect(ctx, r.x, r.y, r.width, r.height, rad);
        paintPath(ctx, el);
      }
      drawBoxText(ctx, el.text || '', r.x + 8, r.y, r.width - 16, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
    }

    case 'uml_component': {
      const tabW = 14;
      const tabH = 8;
      const bodyX = r.x + tabW * 0.5;
      const bodyW = r.width - tabW * 0.5;
      ctx.beginPath();
      ctx.rect(bodyX, r.y, bodyW, r.height);
      paintPath(ctx, el);

      // Official UML component 2-tab symbol on left side
      const t1Y = r.y + Math.min(18, r.height * 0.22);
      const t2Y = r.y + Math.min(36, r.height * 0.56);
      ctx.beginPath();
      ctx.rect(r.x, t1Y, tabW, tabH);
      paintPath(ctx, el);
      ctx.beginPath();
      ctx.rect(r.x, t2Y, tabW, tabH);
      paintPath(ctx, el);

      const stereo = el.stereotype || '«component»';
      drawBoxText(ctx, stereo, bodyX + 8, r.y + 8, bodyW - 12, 20, {
        fontSize: 11,
        fontFamily: 'mono',
        color: '#475569',
      });
      drawBoxText(ctx, el.text || '', bodyX + 8, r.y + 24, bodyW - 12, r.height - 28, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'uml_node': {
      // Official UML 2.5 Deployment Node (3D perspective cuboid/cube)
      const depth = Math.min(16, r.width * 0.14, r.height * 0.2);
      const fx = r.x;
      const fy = r.y + depth;
      const fw = r.width - depth;
      const fh = r.height - depth;

      // Top face
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + depth, r.y);
      ctx.lineTo(r.x + r.width, r.y);
      ctx.lineTo(fx + fw, fy);
      ctx.closePath();
      paintPath(ctx, el);

      // Right face
      ctx.beginPath();
      ctx.moveTo(fx + fw, fy);
      ctx.lineTo(r.x + r.width, r.y);
      ctx.lineTo(r.x + r.width, r.y + fh);
      ctx.lineTo(fx + fw, r.y + r.height);
      ctx.closePath();
      paintPath(ctx, el);

      // Front face
      ctx.beginPath();
      ctx.rect(fx, fy, fw, fh);
      paintPath(ctx, el);

      const stereo = el.stereotype || '«device»';
      drawBoxText(ctx, stereo, fx + 6, fy + 6, fw - 12, 20, {
        fontSize: 11,
        fontFamily: 'mono',
        color: '#475569',
      });
      drawBoxText(ctx, el.text || '', fx + 6, fy + 22, fw - 12, fh - 26, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    // === Expanded System Architecture ===
    case 'arch_cache': {
      traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 8);
      paintPath(ctx, el);
      // Fast bolt accent on top-left
      const bx = r.x + 12;
      const by = r.y + 10;
      ctx.beginPath();
      ctx.moveTo(bx + 8, by);
      ctx.lineTo(bx + 1, by + 10);
      ctx.lineTo(bx + 6, by + 10);
      ctx.lineTo(bx + 4, by + 18);
      ctx.lineTo(bx + 12, by + 8);
      ctx.lineTo(bx + 7, by + 8);
      ctx.closePath();
      ctx.fillStyle = el.strokeColor;
      ctx.fill();

      drawBoxText(ctx, el.text || '', r.x + 22, r.y, r.width - 28, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'arch_firewall': {
      ctx.beginPath();
      ctx.moveTo(cx, r.y);
      ctx.lineTo(r.x + r.width, r.y + r.height * 0.2);
      ctx.lineTo(r.x + r.width, r.y + r.height * 0.56);
      ctx.quadraticCurveTo(r.x + r.width, r.y + r.height * 0.86, cx, r.y + r.height);
      ctx.quadraticCurveTo(r.x, r.y + r.height * 0.86, r.x, r.y + r.height * 0.56);
      ctx.lineTo(r.x, r.y + r.height * 0.2);
      ctx.closePath();
      paintPath(ctx, el);

      drawBoxText(ctx, el.text || '', r.x + 10, r.y + r.height * 0.18, r.width - 20, r.height * 0.64, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'arch_storage': {
      const ry = Math.min(12, r.height * 0.14);
      const inset = Math.min(14, r.width * 0.12);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + ry);
      ctx.lineTo(r.x + r.width, r.y + ry);
      ctx.lineTo(r.x + r.width - inset, r.y + r.height - 4);
      ctx.quadraticCurveTo(cx, r.y + r.height + 4, r.x + inset, r.y + r.height - 4);
      ctx.closePath();
      paintPath(ctx, el);

      ctx.beginPath();
      ctx.ellipse(cx, r.y + ry, r.width / 2, ry, 0, 0, Math.PI * 2);
      paintPath(ctx, el);

      drawBoxText(ctx, el.text || '', r.x + inset, r.y + ry * 2, r.width - inset * 2, r.height - ry * 2.4, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    case 'arch_external_api': {
      traceRoundedRect(ctx, r.x, r.y, r.width, r.height, 8);
      paintPath(ctx, el);
      const stereo = el.stereotype || '«external»';
      drawBoxText(ctx, stereo, r.x + 6, r.y + 6, r.width - 12, 20, {
        fontSize: 11,
        fontFamily: 'mono',
        color: '#475569',
      });
      drawBoxText(ctx, el.text || '', r.x + 6, r.y + 22, r.width - 12, r.height - 26, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        bold: true,
      });
      break;
    }

    default:
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      paintPath(ctx, el);
      drawBoxText(ctx, el.text || '', r.x, r.y, r.width, r.height, {
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
      });
      break;
  }

  ctx.restore();
}
