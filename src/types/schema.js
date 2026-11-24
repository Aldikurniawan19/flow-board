import { z } from 'zod';

/**
 * @typedef {'top' | 'right' | 'bottom' | 'left'} PortSide
 * @typedef {'straight' | 'elbow' | 'curved'} RoutingMode
 * @typedef {'solid' | 'dashed' | 'dotted'} StrokeStyle
 * @typedef {'clean' | 'sketch'} RenderMode
 * @typedef {'dots' | 'lines' | 'none'} GridMode
 * @typedef {'none' | 'arrow' | 'filled_arrow' | 'circle' | 'diamond' | 'hollow_triangle' | 'hollow_diamond' | 'filled_diamond' | 'crow_one' | 'crow_one_only' | 'crow_zero_one' | 'crow_many' | 'crow_one_many' | 'crow_zero_many'} MarkerType
 *
 * @typedef {object} Point
 * @property {number} x
 * @property {number} y
 *
 * @typedef {object} ErdField
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {'' | 'PK' | 'FK' | 'PK,FK'} key
 *
 * @typedef {object} AnchorBinding
 * @property {string} elementId
 * @property {PortSide} side
 * @property {number} [rx]
 * @property {number} [ry]
 *
 * @typedef {object} BoardSettings
 * @property {RenderMode} renderMode
 * @property {GridMode} gridMode
 * @property {boolean} snapToGrid
 * @property {boolean} autoCorrectShapes
 *
 * @typedef {object} BoardElement
 * @property {string} id
 * @property {string} type
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} strokeColor
 * @property {string} fillColor
 * @property {number} strokeWidth
 * @property {StrokeStyle} strokeStyle
 * @property {number} roughness
 * @property {number} opacity
 * @property {number} seed
 * @property {string} [text]
 * @property {string} [subText]
 * @property {number} [fontSize]
 * @property {'sans' | 'mono' | 'sketch'} [fontFamily]
 * @property {boolean} [locked]
 * @property {string} [groupId]
 * @property {Point[]} [points]
 * @property {boolean} [isHighlighter]
 * @property {RoutingMode} [routing]
 * @property {MarkerType} [startMarker]
 * @property {MarkerType} [endMarker]
 * @property {AnchorBinding | null} [startBinding]
 * @property {AnchorBinding | null} [endBinding]
 * @property {Point[]} [waypoints]
 * @property {ErdField[]} [fields]
 * @property {string[]} [attributes]
 * @property {string[]} [methods]
 * @property {string} [stereotype]
 * @property {string} [code]
 *
 * @typedef {object} BoardDocument
 * @property {number} version
 * @property {string} title
 * @property {BoardSettings} settings
 * @property {BoardElement[]} elements
 */

export const ELEMENT_TYPES = [
  // Basic & Whiteboard
  'rectangle',
  'rounded_rect',
  'ellipse',
  'diamond',
  'triangle',
  'hexagon',
  'sticky_note',
  'text',
  'frame',
  'freehand',
  'connector',
  // Flowchart
  'fc_terminator',
  'fc_process',
  'fc_decision',
  'fc_io',
  'fc_document',
  'fc_predefined',
  'fc_database',
  'fc_manual_op',
  'fc_delay',
  'fc_offpage',
  // DFD (Gane & Sarson + Yourdon & DeMarco)
  'dfd_gs_process',
  'dfd_gs_datastore',
  'dfd_gs_entity',
  'dfd_yd_process',
  'dfd_yd_datastore',
  'dfd_yd_entity',
  // ERD (Crow's Foot / IE + Peter Chen)
  'erd_table',
  'erd_weak_table',
  'erd_chen_entity',
  'erd_chen_weak_entity',
  'erd_chen_relation',
  'erd_chen_id_relation',
  'erd_chen_attribute',
  'erd_chen_key_attr',
  'erd_chen_multi_attr',
  'erd_chen_derived_attr',
  // UML (Class, Use Case, Sequence)
  'uml_class',
  'uml_interface',
  'uml_package',
  'uml_note',
  'uml_actor',
  'uml_usecase',
  'uml_boundary',
  'uml_lifeline',
  'uml_activation',
  'uml_fragment',
  // System Architecture
  'arch_server',
  'arch_cloud',
  'arch_database',
  'arch_queue',
  'arch_gateway',
  'arch_browser',
  'arch_mobile',
];

export const MARKER_TYPES = [
  'none',
  'arrow',
  'filled_arrow',
  'circle',
  'diamond',
  'hollow_triangle',
  'hollow_diamond',
  'filled_diamond',
  'crow_one',
  'crow_one_only',
  'crow_zero_one',
  'crow_many',
  'crow_one_many',
  'crow_zero_many',
];

export const ROUTING_MODES = ['straight', 'elbow', 'curved'];
export const STROKE_STYLES = ['solid', 'dashed', 'dotted'];
export const PORT_SIDES = ['top', 'right', 'bottom', 'left'];

const PointSchema = z.object({
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
});

const AnchorBindingSchema = z.object({
  elementId: z.string().min(1).max(100),
  side: z.enum(['top', 'right', 'bottom', 'left']),
  rx: z.number().finite().min(0).max(1).optional(),
  ry: z.number().finite().min(0).max(1).optional(),
});

const ErdFieldSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(120),
  type: z.string().max(80),
  key: z.enum(['', 'PK', 'FK', 'PK,FK']),
});

export const ElementSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(/** @type {[string, ...string[]]} */ (ELEMENT_TYPES)),
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
  width: z.number().finite().min(-100000).max(100000),
  height: z.number().finite().min(-100000).max(100000),
  strokeColor: z.string().min(1).max(32),
  fillColor: z.string().min(1).max(32),
  strokeWidth: z.number().finite().min(1).max(24),
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']),
  roughness: z.number().finite().min(0).max(3),
  opacity: z.number().finite().min(0.1).max(1),
  seed: z.number().int().min(1).max(2147483647),
  text: z.string().max(4000).optional(),
  subText: z.string().max(500).optional(),
  fontSize: z.number().finite().min(8).max(96).optional(),
  fontFamily: z.enum(['sans', 'mono', 'sketch']).optional(),
  locked: z.boolean().optional(),
  groupId: z.string().max(100).optional(),
  points: z.array(PointSchema).max(5000).optional(),
  isHighlighter: z.boolean().optional(),
  routing: z.enum(['straight', 'elbow', 'curved']).optional(),
  startMarker: z.enum(/** @type {[string, ...string[]]} */ (MARKER_TYPES)).optional(),
  endMarker: z.enum(/** @type {[string, ...string[]]} */ (MARKER_TYPES)).optional(),
  startBinding: AnchorBindingSchema.nullable().optional(),
  endBinding: AnchorBindingSchema.nullable().optional(),
  waypoints: z.array(PointSchema).max(64).optional(),
  fields: z.array(ErdFieldSchema).max(100).optional(),
  attributes: z.array(z.string().max(200)).max(100).optional(),
  methods: z.array(z.string().max(200)).max(100).optional(),
  stereotype: z.string().max(80).optional(),
  code: z.string().max(40).optional(),
});

export const BoardSettingsSchema = z.object({
  renderMode: z.enum(['clean', 'sketch']).default('clean'),
  gridMode: z.enum(['dots', 'lines', 'none']).default('dots'),
  snapToGrid: z.boolean().default(true),
  autoCorrectShapes: z.boolean().default(true),
});

export const BoardDocumentSchema = z.object({
  version: z.literal(1).default(1),
  title: z.string().trim().min(1, 'Judul papan wajib diisi').max(120),
  settings: BoardSettingsSchema.default({
    renderMode: 'clean',
    gridMode: 'dots',
    snapToGrid: true,
    autoCorrectShapes: true,
  }),
  elements: z.array(ElementSchema).max(5000),
});

export const RegisterSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80),
  email: z.string().trim().email('Format email tidak valid').max(120).toLowerCase(),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').max(128),
});

export const LoginSchema = z.object({
  email: z.string().trim().email('Format email tidak valid').max(120).toLowerCase(),
  password: z.string().min(1, 'Kata sandi wajib diisi').max(128),
});

export const CreateBoardSchema = z.object({
  title: z.string().trim().min(1, 'Judul papan wajib diisi').max(120),
  settings: BoardSettingsSchema.optional(),
  elements: z.array(ElementSchema).max(5000).optional(),
});

export const UpdateBoardSchema = z.object({
  title: z.string().trim().min(1, 'Judul papan wajib diisi').max(120).optional(),
  settings: BoardSettingsSchema.optional(),
  elements: z.array(ElementSchema).max(5000).optional(),
});

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
