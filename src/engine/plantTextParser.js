import { layoutDiagramElements } from './autoLayout.js';
import { getShapePorts } from './ports.js';

/**
 * @typedef {'auto' | 'erd' | 'dfd' | 'class' | 'usecase' | 'sequence' | 'flowchart'} PlantDiagramKind
 * @typedef {{
 *   ok: true,
 *   kind: Exclude<PlantDiagramKind, 'auto'>,
 *   kindLabel: string,
 *   elements: import('../types/schema.js').BoardElement[],
 *   summary: { nodes: number, connectors: number }
 * } | {
 *   ok: false,
 *   error: string
 * }} PlantParseResult
 */

export const MAX_PLANTTEXT_CHARS = 100_000;

export const PLANT_KIND_LABELS = {
  erd: 'ERD (Crow\'s Foot)',
  dfd: 'DFD (Gane & Sarson)',
  class: 'UML Class Diagram',
  usecase: 'UML Use Case Diagram',
  sequence: 'UML Sequence Diagram',
  flowchart: 'Flowchart / Activity Diagram',
};

export const PLANTTEXT_EXAMPLES = [
  {
    id: 'erd',
    label: 'ERD',
    kind: /** @type {PlantDiagramKind} */ ('erd'),
    code: `@startuml
hide circle
skinparam linetype ortho

entity "users" as users {
  * id : UUID <<PK>>
  --
  * name : VARCHAR
  * email : VARCHAR
  created_at : TIMESTAMP
}

entity "orders" as orders {
  * id : UUID <<PK>>
  --
  * user_id : UUID <<FK>>
  * total : DECIMAL
  status : VARCHAR
}

entity "order_items" as items <<weak>> {
  * order_id : UUID <<PK,FK>>
  * product_id : UUID <<FK>>
  --
  quantity : INT
}

users ||--o{ orders : "membuat"
orders ||--|{ items : "berisi"
@enduml`,
  },
  {
    id: 'dfd',
    label: 'DFD',
    kind: /** @type {PlantDiagramKind} */ ('dfd'),
    code: `@startuml
rectangle "Pelanggan" as C
rectangle "Gudang" as G
usecase "1.0 Proses Pesanan" as P1
usecase "2.0 Proses Pengiriman" as P2
database "D1 Data Pesanan" as D1

C --> P1 : Data Pesanan
P1 --> D1 : Simpan Pesanan
P1 --> P2 : Instruksi Kirim
D1 --> P2 : Detail Barang
P2 --> G : Surat Jalan
@enduml`,
  },
  {
    id: 'class',
    label: 'UML Class',
    kind: /** @type {PlantDiagramKind} */ ('class'),
    code: `@startuml
interface PaymentGateway {
  + charge(amount: number): boolean
  + refund(txId: string): void
}

class User {
  - id: string
  - email: string
  + login(): boolean
}

class Customer {
  - address: string
  + placeOrder(): Order
}

class Order {
  - orderId: string
  - total: number
  + calculateTotal(): number
}

User <|-- Customer : mewarisi
Customer "1" --> "*" Order : membuat
Order ..> PaymentGateway : menggunakan
@enduml`,
  },
  {
    id: 'usecase',
    label: 'Use Case',
    kind: /** @type {PlantDiagramKind} */ ('usecase'),
    code: `@startuml
left to right direction
actor Pelanggan
actor Admin

rectangle "Sistem E-Commerce" {
  usecase "Cari Produk" as UC1
  usecase "Checkout Pesanan" as UC2
  usecase "Verifikasi Pembayaran" as UC3
  usecase "Kelola Katalog" as UC4
}

Pelanggan --> UC1
Pelanggan --> UC2
UC2 ..> UC3 : <<include>>
Admin --> UC4
@enduml`,
  },
  {
    id: 'sequence',
    label: 'Sequence',
    kind: /** @type {PlantDiagramKind} */ ('sequence'),
    code: `@startuml
actor Pengguna
participant "Web UI" as UI
participant "Auth API" as API
database "SQLite" as DB

Pengguna -> UI : Input email & sandi
activate UI
UI -> API : POST /api/auth/login
activate API
API -> DB : Cari pengguna
DB --> API : Data pengguna
alt Sandi valid
  API --> UI : 200 OK + Cookie Sesi
  UI --> Pengguna : Buka Dashboard
else Sandi salah
  API --> UI : 401 Unauthorized
end
deactivate API
deactivate UI
@enduml`,
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    kind: /** @type {PlantDiagramKind} */ ('flowchart'),
    code: `@startuml
start
:Input Email dan Kata Sandi;
if (Kredensial valid?) then (Ya)
  :Simpan Sesi Login;
  :Tampilkan Dashboard;
else (Tidak)
  :Tampilkan Pesan Error;
endif
stop
@enduml`,
  },
];

let seedCounter = 500;
function nextSeed() {
  seedCounter = (seedCounter % 999999) + 1;
  return seedCounter;
}

/**
 * Strip PlantUML comments, multiline title/skinparam blocks, and boilerplate directives.
 * @param {string} raw
 * @returns {string[]}
 */
function preprocessLines(raw) {
  let cleaned = raw
    // Remove block comments /' ... '/
    .replace(/\/'[\s\S]*?'\//g, '')
    // Remove multiline title ... end title blocks
    .replace(/^\s*title\s*$[\s\S]*?^\s*end\s+title\s*$/gim, '')
    // Remove multiline skinparam ... { ... } blocks
    .replace(/^\s*skinparam\b[^{}\n]*\{[\s\S]*?\}/gim, '')
    // Remove multiline style / legend blocks
    .replace(/^\s*(?:legend|header|footer)\b[\s\S]*?^\s*end\s+(?:legend|header|footer)\s*$/gim, '');

  return cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (l.startsWith("'") || l.startsWith('//')) return false;
      if (/^@(startuml|enduml|startmindmap|endmindmap)/i.test(l)) return false;
      if (
        /^(skinparam|hide|show|left to right|top to bottom|autonumber|title\s|scale\s|!theme|!include)/i.test(
          l,
        )
      ) {
        return false;
      }
      return true;
    });
}

/**
 * Strip PlantUML Creole markup (`**bold**`, `<color:...></color>`, decorative bar lines).
 * @param {string} raw
 * @returns {string}
 */
function cleanPlantLabel(raw) {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/<color:[^>]+>([\s\S]*?)<\/color>/gi, '$1')
    .replace(/<\/?(?:b|i|u|s|size(?::\d+)?|font[^>]*)>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[━─═\-_=~•·]{3,}$/.test(l))
    .join('\n')
    .trim();
}

/**
 * Map PlantUML arrow color token (`#1565C0`, `#2E7D32`, etc.) to DESIGN.md canvas stroke tokens.
 * @param {string} rawArrowLine
 * @returns {string}
 */
function extractArrowColor(rawArrowLine) {
  const m = rawArrowLine.match(/\[(#[0-9a-fA-F]{3,6}|blue|green|red|orange|amber|gray|slate)\]/i);
  if (!m) return '#0F172A';
  const tok = m[1].toLowerCase();
  if (tok === 'blue' || tok === '#1565c0' || tok === '#1d4ed8' || tok === '#0d47a1') return '#1D4ED8';
  if (tok === 'green' || tok === '#2e7d32' || tok === '#15803d' || tok === '#1b5e20') return '#15803D';
  if (tok === 'orange' || tok === 'amber' || tok === '#e65100' || tok === '#b45309') return '#B45309';
  if (tok === 'red' || tok === '#b91c1c' || tok === '#c62828') return '#B91C1C';
  if (tok === 'gray' || tok === 'slate') return '#475569';
  return '#0F172A';
}

/**
 * Detect PlantUML diagram kind from preprocessed lines and raw source hints.
 * @param {string[]} lines
 * @param {string} [rawSource]
 * @returns {Exclude<PlantDiagramKind, 'auto'>}
 */
export function detectPlantDiagramKind(lines, rawSource = '') {
  const joined = lines.join('\n');

  if (
    /^\s*(start|stop)\s*$/m.test(joined) ||
    /^\s*:[^;]+;\s*$/m.test(joined) ||
    /^\s*if\s*\(.+\)\s*then\b/im.test(joined)
  ) {
    return 'flowchart';
  }

  if (
    /^\s*entity\s+/im.test(joined) ||
    /(\|\||\|o|o\||\}\||\|\{|\}o|o\{)[-.]{1,4}(\|\||\|o|o\||\}\||\|\{|\}o|o\{)/m.test(joined)
  ) {
    return 'erd';
  }

  // Detect DFD before Use Case when DFD stereotypes, title, or notation markers are present
  if (
    /<<\s*(?:DataStore|External|Process)\s*>>/i.test(joined) ||
    /\bDFD\b|Data\s+Flow\s+Diagram|Yourdon|DeMarco|Gane\s*[&-]\s*Sarson/i.test(rawSource)
  ) {
    return 'dfd';
  }

  if (
    /^\s*(class|interface|abstract\s+class|enum)\s+/im.test(joined) ||
    /(<\||\|>|\*--|o--|--\*|--o)/m.test(joined)
  ) {
    return 'class';
  }

  if (
    /^\s*(participant|boundary|control|activate|deactivate|alt\s|loop\s|opt\s)/im.test(joined)
  ) {
    return 'sequence';
  }

  if (
    /^\s*database\s+/im.test(joined) &&
    /^\s*(usecase|component|circle|storage|rectangle)\s+/im.test(joined)
  ) {
    return 'dfd';
  }

  if (
    /^\s*usecase\s+/im.test(joined) ||
    /\([^()]+\)\s*[-.]+>?\s*\([^()]+\)/m.test(joined) ||
    (/^\s*actor\s+/im.test(joined) && /^\s*rectangle\s+/im.test(joined))
  ) {
    return 'usecase';
  }

  if (/->/.test(joined) && /^\s*actor\s+/im.test(joined)) {
    return 'sequence';
  }

  return 'dfd';
}

/**
 * Pick optimal anchor sides between two positioned rectangles.
 * @param {import('../types/schema.js').BoardElement} src
 * @param {import('../types/schema.js').BoardElement} dst
 * @returns {{ startSide: import('../types/schema.js').PortSide, endSide: import('../types/schema.js').PortSide }}
 */
function pickSides(src, dst) {
  const sCx = src.x + src.width / 2;
  const sCy = src.y + src.height / 2;
  const dCx = dst.x + dst.width / 2;
  const dCy = dst.y + dst.height / 2;
  const dx = dCx - sCx;
  const dy = dCy - sCy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { startSide: 'right', endSide: 'left' }
      : { startSide: 'left', endSide: 'right' };
  }
  return dy >= 0
    ? { startSide: 'bottom', endSide: 'top' }
    : { startSide: 'top', endSide: 'bottom' };
}

/**
 * Build a bound connector element between two nodes.
 * @param {import('../types/schema.js').BoardElement} src
 * @param {import('../types/schema.js').BoardElement} dst
 * @param {{
 *   label?: string,
 *   routing?: import('../types/schema.js').RoutingMode,
 *   strokeColor?: string,
 *   strokeStyle?: import('../types/schema.js').StrokeStyle,
 *   startMarker?: import('../types/schema.js').MarkerType,
 *   endMarker?: import('../types/schema.js').MarkerType,
 *   startSide?: import('../types/schema.js').PortSide,
 *   endSide?: import('../types/schema.js').PortSide,
 *   roughness?: number
 * }} opts
 * @returns {import('../types/schema.js').BoardElement}
 */
function makeBoundConnector(src, dst, opts = {}) {
  const auto = pickSides(src, dst);
  const startSide = opts.startSide || auto.startSide;
  const endSide = opts.endSide || auto.endSide;
  const sp = getShapePorts(src)[startSide];
  const ep = getShapePorts(dst)[endSide];

  return {
    id: crypto.randomUUID(),
    type: 'connector',
    x: sp.x,
    y: sp.y,
    width: ep.x - sp.x,
    height: ep.y - sp.y,
    strokeColor: opts.strokeColor || '#0F172A',
    fillColor: 'transparent',
    strokeWidth: 2,
    strokeStyle: opts.strokeStyle || 'solid',
    roughness: opts.roughness ?? 0,
    opacity: 1,
    seed: nextSeed(),
    text: opts.label || '',
    fontSize: 12,
    fontFamily: (opts.roughness ?? 0) > 0 ? 'sketch' : 'sans',
    routing: opts.routing || 'elbow',
    startMarker: opts.startMarker || 'none',
    endMarker: opts.endMarker || 'filled_arrow',
    startBinding: { elementId: src.id, side: startSide },
    endBinding: { elementId: dst.id, side: endSide },
  };
}

/**
 * Map PlantUML Crow's Foot end token to FlowBoard MarkerType.
 * @param {string} token
 * @returns {import('../types/schema.js').MarkerType}
 */
function mapCrowMarker(token) {
  const t = token.trim();
  if (t === '||') return 'crow_one_only';
  if (t === '|o' || t === 'o|') return 'crow_zero_one';
  if (t === '}|' || t === '|{') return 'crow_one_many';
  if (t === '}o' || t === 'o{') return 'crow_zero_many';
  if (t === '}' || t === '{') return 'crow_many';
  if (t === '|') return 'crow_one';
  if (t === '>' || t === '<') return 'arrow';
  return 'none';
}

/**
 * Clean quotes around labels or identifiers.
 * @param {string} s
 */
function stripQuotes(s) {
  return s.trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Parse PlantUML ERD (entities + Crow's Foot relations).
 * @param {string[]} lines
 * @param {number} roughness
 */
function parseErd(lines, roughness) {
  /** @type {Map<string, { id: string, title: string, weak: boolean, fields: import('../types/schema.js').ErdField[] }>} */
  const entities = new Map();
  /** @type {Array<{ from: string, to: string, leftTok: string, rightTok: string, dashed: boolean, label: string }>} */
  const relations = [];

  /** @type {{ id: string, title: string, weak: boolean, fields: import('../types/schema.js').ErdField[] } | null} */
  let current = null;
  let passedDivider = false;

  for (const line of lines) {
    if (current) {
      if (line === '}') {
        current = null;
        passedDivider = false;
        continue;
      }
      if (/^[-=._]{2,}$/.test(line)) {
        passedDivider = true;
        continue;
      }
      const isMandatoryStar = line.startsWith('*');
      let clean = line.replace(/^[*+#~-]\s*/, '').trim();
      /** @type {'' | 'PK' | 'FK' | 'PK,FK'} */
      let key = '';
      if (/<<\s*PK\s*,\s*FK\s*>>|\(PK,\s*FK\)/i.test(clean)) {
        key = 'PK,FK';
      } else if (/<<\s*PK\s*>>|\(PK\)/i.test(clean)) {
        key = 'PK';
      } else if (/<<\s*FK\s*>>|\(FK\)/i.test(clean)) {
        key = 'FK';
      } else if (isMandatoryStar && !passedDivider && current.fields.length === 0) {
        key = 'PK';
      }
      clean = clean.replace(/<<[^>]+>>|\((PK|FK|PK,\s*FK)\)/gi, '').trim();
      const [colNameRaw, colTypeRaw] = clean.split(':').map((s) => s.trim());
      if (colNameRaw) {
        current.fields.push({
          id: crypto.randomUUID(),
          key,
          name: colNameRaw,
          type: colTypeRaw || 'VARCHAR',
        });
      }
      continue;
    }

    const entMatch = line.match(
      /^entity\s+(?:"([^"]+)"|([A-Za-z0-9_.-]+))(?:\s+as\s+([A-Za-z0-9_]+))?(?:\s*<<([^>]+)>>)?\s*(\{)?$/i,
    );
    if (entMatch) {
      const title = entMatch[1] || entMatch[2];
      const alias = entMatch[3] || title;
      const stereo = (entMatch[4] || '').toLowerCase();
      const entry = {
        id: crypto.randomUUID(),
        title,
        weak: stereo.includes('weak'),
        fields: [],
      };
      entities.set(alias, entry);
      if (entMatch[5] === '{') {
        current = entry;
        passedDivider = false;
      }
      continue;
    }

    const relMatch = line.match(
      /^(?:"([^"]+)"|([A-Za-z0-9_]+))\s*(\|\||\|o|o\||\}\||\|\{|\}o|o\{|\}|\||<)?([-.\s]{2,6})(\|\||\|o|o\||\}\||\|\{|\}o|o\{|\{|\||>)?\s*(?:"([^"]+)"|([A-Za-z0-9_]+))(?:\s*:\s*(.+))?$/,
    );
    if (relMatch) {
      const from = relMatch[1] || relMatch[2];
      const leftTok = relMatch[3] || '';
      const mid = relMatch[4] || '--';
      const rightTok = relMatch[5] || '';
      const to = relMatch[6] || relMatch[7];
      const label = stripQuotes(relMatch[8] || '');

      if (!entities.has(from)) {
        entities.set(from, {
          id: crypto.randomUUID(),
          title: from,
          weak: false,
          fields: [{ id: crypto.randomUUID(), key: 'PK', name: 'id', type: 'UUID' }],
        });
      }
      if (!entities.has(to)) {
        entities.set(to, {
          id: crypto.randomUUID(),
          title: to,
          weak: false,
          fields: [{ id: crypto.randomUUID(), key: 'PK', name: 'id', type: 'UUID' }],
        });
      }
      relations.push({
        from,
        to,
        leftTok,
        rightTok,
        dashed: mid.includes('.'),
        label,
      });
    }
  }

  /** @type {import('../types/schema.js').BoardElement[]} */
  const nodes = [];
  /** @type {Map<string, import('../types/schema.js').BoardElement>} */
  const nodeMap = new Map();
  const list = Array.from(entities.entries());
  const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(list.length))));

  list.forEach(([alias, ent], idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const height = Math.max(104, 42 + ent.fields.length * 24 + 8);
    /** @type {import('../types/schema.js').BoardElement} */
    const el = {
      id: ent.id,
      type: ent.weak ? 'erd_weak_table' : 'erd_table',
      x: 80 + col * 320,
      y: 80 + row * 240,
      width: 236,
      height,
      strokeColor: '#0F172A',
      fillColor: '#FFFFFF',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      text: ent.title,
      fontSize: 14,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
      fields: ent.fields,
    };
    nodes.push(el);
    nodeMap.set(alias, el);
  });

  const connectors = relations
    .map((rel) => {
      const src = nodeMap.get(rel.from);
      const dst = nodeMap.get(rel.to);
      if (!src || !dst) return null;
      return makeBoundConnector(src, dst, {
        label: rel.label,
        routing: 'elbow',
        strokeStyle: rel.dashed ? 'dashed' : 'solid',
        startMarker: mapCrowMarker(rel.leftTok),
        endMarker: mapCrowMarker(rel.rightTok),
        roughness,
      });
    })
    .filter(Boolean);

  return [...nodes, .../** @type {import('../types/schema.js').BoardElement[]} */ (connectors)];
}

/**
 * Parse PlantUML Class Diagram.
 * @param {string[]} lines
 * @param {number} roughness
 */
function parseClassDiagram(lines, roughness) {
  /** @type {Map<string, { id: string, title: string, kind: 'uml_class' | 'uml_interface', stereotype: string, attributes: string[], methods: string[] }>} */
  const classes = new Map();
  /** @type {Array<{ from: string, to: string, arrow: string, label: string }>} */
  const rels = [];
  /** @type {{ id: string, title: string, kind: 'uml_class' | 'uml_interface', stereotype: string, attributes: string[], methods: string[] } | null} */
  let current = null;

  /**
   * @param {string} alias
   * @param {string} [title]
   */
  function ensureClass(alias, title) {
    if (!classes.has(alias)) {
      classes.set(alias, {
        id: crypto.randomUUID(),
        title: title || alias,
        kind: 'uml_class',
        stereotype: '',
        attributes: [],
        methods: [],
      });
    }
    return /** @type {NonNullable<ReturnType<typeof classes.get>>} */ (classes.get(alias));
  }

  for (const line of lines) {
    if (current) {
      if (line === '}') {
        current = null;
        continue;
      }
      if (/^[-=._]{2,}$/.test(line)) continue;
      if (line.includes('(') && line.includes(')')) {
        current.methods.push(line);
      } else {
        current.attributes.push(line);
      }
      continue;
    }

    const clsMatch = line.match(
      /^(abstract\s+class|class|interface|enum)\s+(?:"([^"]+)"|([A-Za-z0-9_]+))(?:\s+as\s+([A-Za-z0-9_]+))?(?:\s*<<([^>]+)>>)?\s*(\{)?$/i,
    );
    if (clsMatch) {
      const kw = clsMatch[1].toLowerCase();
      const title = clsMatch[2] || clsMatch[3];
      const alias = clsMatch[4] || title;
      const customStereo = clsMatch[5] ? `<<${clsMatch[5]}>>` : '';
      const kind = kw === 'interface' ? 'uml_interface' : 'uml_class';
      const stereotype =
        customStereo ||
        (kw === 'interface'
          ? '<<interface>>'
          : kw.startsWith('abstract')
            ? '<<abstract>>'
            : kw === 'enum'
              ? '<<enum>>'
              : '');

      const entry = {
        id: crypto.randomUUID(),
        title,
        kind: /** @type {'uml_class' | 'uml_interface'} */ (kind),
        stereotype,
        attributes: [],
        methods: [],
      };
      classes.set(alias, entry);
      if (clsMatch[6] === '{') current = entry;
      continue;
    }

    const relMatch = line.match(
      /^(?:"([^"]+)"|([A-Za-z0-9_]+))(?:\s+"[^"]*")?\s+(<\|\.\.|<\|--|\*--|o--|\.\.>|<--|-->|\.\.\|>|--\|>|--\*|--o|--|\.\.)\s+(?:"[^"]*"\s+)?(?:"([^"]+)"|([A-Za-z0-9_]+))(?:\s*:\s*(.+))?$/,
    );
    if (relMatch) {
      const from = relMatch[1] || relMatch[2];
      const arrow = relMatch[3];
      const to = relMatch[4] || relMatch[5];
      const label = stripQuotes(relMatch[6] || '');
      ensureClass(from);
      ensureClass(to);
      rels.push({ from, to, arrow, label });
    }
  }

  /** @type {import('../types/schema.js').BoardElement[]} */
  const nodes = [];
  /** @type {Map<string, import('../types/schema.js').BoardElement>} */
  const nodeMap = new Map();
  const entries = Array.from(classes.entries());
  const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(entries.length))));

  entries.forEach(([alias, c], idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const headerH = c.stereotype ? 46 : 34;
    const attrH = Math.max(28, c.attributes.length * 19 + 12);
    const methodH = Math.max(28, c.methods.length * 19 + 14);
    const height = Math.max(116, headerH + attrH + methodH);

    /** @type {import('../types/schema.js').BoardElement} */
    const el = {
      id: c.id,
      type: c.kind,
      x: 80 + col * 310,
      y: 80 + row * 240,
      width: 230,
      height,
      strokeColor: c.kind === 'uml_interface' ? '#1D4ED8' : '#0F172A',
      fillColor: c.kind === 'uml_interface' ? '#F1F5F9' : '#FFFFFF',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      text: c.title,
      stereotype: c.stereotype,
      attributes: c.attributes,
      methods: c.methods,
      fontSize: 14,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
    };
    nodes.push(el);
    nodeMap.set(alias, el);
  });

  const connectors = rels
    .map((r) => {
      const src = nodeMap.get(r.from);
      const dst = nodeMap.get(r.to);
      if (!src || !dst) return null;

      /** @type {import('../types/schema.js').MarkerType} */
      let startMarker = 'none';
      /** @type {import('../types/schema.js').MarkerType} */
      let endMarker = 'none';
      /** @type {import('../types/schema.js').StrokeStyle} */
      const strokeStyle = r.arrow.includes('.') ? 'dashed' : 'solid';

      if (r.arrow.startsWith('<|')) startMarker = 'hollow_triangle';
      else if (r.arrow.endsWith('|>')) endMarker = 'hollow_triangle';
      else if (r.arrow.startsWith('*')) startMarker = 'filled_diamond';
      else if (r.arrow.endsWith('*')) endMarker = 'filled_diamond';
      else if (r.arrow.startsWith('o')) startMarker = 'hollow_diamond';
      else if (r.arrow.endsWith('o')) endMarker = 'hollow_diamond';
      else if (r.arrow.endsWith('>')) endMarker = 'arrow';
      else if (r.arrow.startsWith('<')) startMarker = 'arrow';

      return makeBoundConnector(src, dst, {
        label: r.label,
        routing: 'elbow',
        strokeStyle,
        startMarker,
        endMarker,
        roughness,
      });
    })
    .filter(Boolean);

  return [...nodes, .../** @type {import('../types/schema.js').BoardElement[]} */ (connectors)];
}

/**
 * Parse PlantUML Use Case Diagram.
 * @param {string[]} lines
 * @param {number} roughness
 */
function parseUseCase(lines, roughness) {
  /** @type {Map<string, { id: string, label: string }>} */
  const actors = new Map();
  /** @type {Map<string, { id: string, label: string }>} */
  const usecases = new Map();
  /** @type {Array<{ from: string, to: string, dashed: boolean, label: string }>} */
  const links = [];
  let boundaryTitle = '';
  let insideBoundary = false;

  /**
   * @param {string} raw
   * @returns {string}
   */
  function registerUseCaseIfParen(raw) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      const label = trimmed.slice(1, -1).trim();
      if (!usecases.has(label)) {
        usecases.set(label, { id: crypto.randomUUID(), label });
      }
      return label;
    }
    return stripQuotes(trimmed);
  }

  for (const line of lines) {
    if (line === '}') {
      insideBoundary = false;
      continue;
    }
    const rectMatch = line.match(/^(?:rectangle|package)\s+(?:"([^"]+)"|([A-Za-z0-9_ ]+))\s*\{$/i);
    if (rectMatch) {
      boundaryTitle = (rectMatch[1] || rectMatch[2]).trim();
      insideBoundary = true;
      continue;
    }

    const actorMatch = line.match(/^actor\s+(?:"([^"]+)"|:([^:]+):|([A-Za-z0-9_]+))(?:\s+as\s+([A-Za-z0-9_]+))?$/i);
    if (actorMatch) {
      const label = (actorMatch[1] || actorMatch[2] || actorMatch[3]).trim();
      const alias = actorMatch[4] || label;
      actors.set(alias, { id: crypto.randomUUID(), label });
      continue;
    }

    const ucMatch = line.match(/^usecase\s+(?:"([^"]+)"|\(([^)]+)\)|([A-Za-z0-9_]+))(?:\s+as\s+([A-Za-z0-9_]+))?$/i);
    if (ucMatch) {
      const label = (ucMatch[1] || ucMatch[2] || ucMatch[3]).trim();
      const alias = ucMatch[4] || label;
      usecases.set(alias, { id: crypto.randomUUID(), label });
      continue;
    }

    const linkMatch = line.match(
      /^(\([^)]+\)|"[^"]+"|[A-Za-z0-9_]+)\s*([-.]{1,4}>?)\s*(\([^)]+\)|"[^"]+"|[A-Za-z0-9_]+)(?:\s*:\s*(.+))?$/,
    );
    if (linkMatch) {
      const fromKey = registerUseCaseIfParen(linkMatch[1]);
      const arrow = linkMatch[2];
      const toKey = registerUseCaseIfParen(linkMatch[3]);
      const label = stripQuotes(linkMatch[4] || '');

      if (!actors.has(fromKey) && !usecases.has(fromKey)) {
        if (insideBoundary) usecases.set(fromKey, { id: crypto.randomUUID(), label: fromKey });
        else actors.set(fromKey, { id: crypto.randomUUID(), label: fromKey });
      }
      if (!actors.has(toKey) && !usecases.has(toKey)) {
        usecases.set(toKey, { id: crypto.randomUUID(), label: toKey });
      }

      links.push({ from: fromKey, to: toKey, dashed: arrow.includes('.'), label });
    }
  }

  /** @type {import('../types/schema.js').BoardElement[]} */
  const elements = [];
  /** @type {Map<string, import('../types/schema.js').BoardElement>} */
  const nodeMap = new Map();

  const ucList = Array.from(usecases.entries());
  const ucColX = 330;
  const ucHeight = Math.max(260, ucList.length * 100 + 70);

  if (boundaryTitle || ucList.length > 0) {
    elements.push({
      id: crypto.randomUUID(),
      type: 'uml_boundary',
      x: 260,
      y: 60,
      width: 340,
      height: ucHeight,
      strokeColor: '#0F172A',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      text: boundaryTitle || 'Sistem',
      fontSize: 13,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
    });
  }

  Array.from(actors.entries()).forEach(([alias, a], idx) => {
    /** @type {import('../types/schema.js').BoardElement} */
    const el = {
      id: a.id,
      type: 'uml_actor',
      x: 80,
      y: 100 + idx * 160,
      width: 84,
      height: 112,
      strokeColor: '#0F172A',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      text: a.label,
      fontSize: 13,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
    };
    elements.push(el);
    nodeMap.set(alias, el);
  });

  ucList.forEach(([alias, u], idx) => {
    /** @type {import('../types/schema.js').BoardElement} */
    const el = {
      id: u.id,
      type: 'uml_usecase',
      x: ucColX,
      y: 108 + idx * 96,
      width: 196,
      height: 68,
      strokeColor: '#1D4ED8',
      fillColor: '#DBEAFE',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      text: u.label,
      fontSize: 13,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
    };
    elements.push(el);
    nodeMap.set(alias, el);
  });

  for (const link of links) {
    const src = nodeMap.get(link.from);
    const dst = nodeMap.get(link.to);
    if (!src || !dst) continue;
    const isActorLink = src.type === 'uml_actor' || dst.type === 'uml_actor';
    elements.push(
      makeBoundConnector(src, dst, {
        label: link.label,
        routing: isActorLink ? 'straight' : 'elbow',
        strokeStyle: link.dashed ? 'dashed' : 'solid',
        startMarker: 'none',
        endMarker: link.dashed || !isActorLink ? 'arrow' : 'none',
        roughness,
      }),
    );
  }

  return elements;
}

/**
 * Parse PlantUML Sequence Diagram.
 * @param {string[]} lines
 * @param {number} roughness
 */
function parseSequence(lines, roughness) {
  /** @type {Array<{ alias: string, label: string }>} */
  const participants = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Array<{ from: string, to: string, dashed: boolean, openArrow: boolean, label: string, row: number }>} */
  const messages = [];
  /** @type {Array<{ alias: string, startRow: number, endRow: number }>} */
  const activations = [];
  /** @type {Map<string, number>} */
  const activeStart = new Map();
  /** @type {Array<{ code: string, label: string, startRow: number, endRow: number }>} */
  const fragments = [];
  /** @type {Array<{ code: string, label: string, startRow: number }>} */
  const fragStack = [];

  /**
   * @param {string} alias
   * @param {string} [label]
   */
  function ensureParticipant(alias, label) {
    if (!seen.has(alias)) {
      seen.add(alias);
      participants.push({ alias, label: label || alias });
    }
  }

  let row = 0;

  for (const line of lines) {
    const partMatch = line.match(
      /^(?:actor|participant|database|boundary|control|entity)\s+(?:"([^"]+)"|([A-Za-z0-9_]+))(?:\s+as\s+([A-Za-z0-9_]+))?$/i,
    );
    if (partMatch) {
      const label = partMatch[1] || partMatch[2];
      const alias = partMatch[3] || label;
      ensureParticipant(alias, label);
      continue;
    }

    const actMatch = line.match(/^activate\s+([A-Za-z0-9_]+)$/i);
    if (actMatch) {
      activeStart.set(actMatch[1], Math.max(0, row - 1));
      continue;
    }

    const deactMatch = line.match(/^deactivate\s+([A-Za-z0-9_]+)$/i);
    if (deactMatch) {
      const startRow = activeStart.get(deactMatch[1]);
      if (startRow !== undefined) {
        activations.push({ alias: deactMatch[1], startRow, endRow: Math.max(startRow, row - 1) });
        activeStart.delete(deactMatch[1]);
      }
      continue;
    }

    const fragMatch = line.match(/^(alt|loop|opt|par)\s*(.*)$/i);
    if (fragMatch) {
      fragStack.push({ code: fragMatch[1].toLowerCase(), label: fragMatch[2].trim(), startRow: row });
      continue;
    }

    if (/^else\b/i.test(line)) {
      continue;
    }

    if (/^end$/i.test(line)) {
      const open = fragStack.pop();
      if (open) {
        fragments.push({ ...open, endRow: Math.max(open.startRow, row - 1) });
      }
      continue;
    }

    const msgMatch = line.match(
      /^(?:"([^"]+)"|([A-Za-z0-9_]+))\s*(-->>|-->|->>|->|<<--|<-)\s*(?:"([^"]+)"|([A-Za-z0-9_]+))(?:\s*:\s*(.+))?$/,
    );
    if (msgMatch) {
      const left = msgMatch[1] || msgMatch[2];
      const arrow = msgMatch[3];
      const right = msgMatch[4] || msgMatch[5];
      const label = stripQuotes(msgMatch[6] || '');
      ensureParticipant(left);
      ensureParticipant(right);

      const reversed = arrow.startsWith('<');
      messages.push({
        from: reversed ? right : left,
        to: reversed ? left : right,
        dashed: arrow.includes('--'),
        openArrow: arrow.includes('>>') || arrow.includes('<<') || arrow.includes('--'),
        label,
        row,
      });
      row += 1;
    }
  }

  for (const [alias, startRow] of activeStart.entries()) {
    activations.push({ alias, startRow, endRow: Math.max(startRow, row - 1) });
  }

  // Scale column spacing dynamically to the longest message label so sequence text never overlaps
  const longestLabel = messages.reduce((max, m) => Math.max(max, (m.label || '').length), 0);
  const colSpacing = Math.max(220, Math.min(340, Math.round(longestLabel * 7.5 + 80)));
  const rowSpacing = 62;
  const firstMsgY = 148;
  const totalHeight = Math.max(240, firstMsgY + Math.max(1, row) * rowSpacing + 36);

  /** @type {import('../types/schema.js').BoardElement[]} */
  const elements = [];
  /** @type {Map<string, number>} */
  const centerXByAlias = new Map();

  // Render fragments behind lifelines
  const leftEdge = 70;
  const rightEdge = Math.max(360, 80 + participants.length * colSpacing);
  for (const f of fragments) {
    const y = firstMsgY + f.startRow * rowSpacing - 28;
    const h = Math.max(76, (f.endRow - f.startRow + 1) * rowSpacing + 24);
    elements.push({
      id: crypto.randomUUID(),
      type: 'uml_fragment',
      x: leftEdge,
      y,
      width: rightEdge - leftEdge,
      height: h,
      strokeColor: '#475569',
      fillColor: 'transparent',
      strokeWidth: 1.5,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      code: f.code,
      text: f.label ? `[${f.label}]` : '',
      fontSize: 12,
      fontFamily: 'mono',
    });
  }

  participants.forEach((p, idx) => {
    const x = 90 + idx * colSpacing;
    const width = 148;
    centerXByAlias.set(p.alias, x + width / 2);
    elements.push({
      id: crypto.randomUUID(),
      type: 'uml_lifeline',
      x,
      y: 60,
      width,
      height: totalHeight,
      strokeColor: '#0F172A',
      fillColor: '#FFFFFF',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      text: p.label,
      fontSize: 13,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
    });
  });

  for (const act of activations) {
    const cx = centerXByAlias.get(act.alias);
    if (cx === undefined) continue;
    const y = firstMsgY + act.startRow * rowSpacing - 8;
    const h = Math.max(32, (act.endRow - act.startRow + 1) * rowSpacing - 16);
    elements.push({
      id: crypto.randomUUID(),
      type: 'uml_activation',
      x: cx - 9,
      y,
      width: 18,
      height: h,
      strokeColor: '#1D4ED8',
      fillColor: '#DBEAFE',
      strokeWidth: 1.5,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      text: '',
    });
  }

  for (const m of messages) {
    const sx = centerXByAlias.get(m.from);
    const ex = centerXByAlias.get(m.to);
    if (sx === undefined || ex === undefined) continue;
    const y = firstMsgY + m.row * rowSpacing;
    elements.push({
      id: crypto.randomUUID(),
      type: 'connector',
      x: sx,
      y,
      width: ex - sx,
      height: 0,
      strokeColor: '#0F172A',
      fillColor: 'transparent',
      strokeWidth: 2,
      strokeStyle: m.dashed ? 'dashed' : 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      text: m.label,
      fontSize: 12,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
      routing: 'straight',
      startMarker: 'none',
      endMarker: m.openArrow ? 'arrow' : 'filled_arrow',
      startBinding: null,
      endBinding: null,
    });
  }

  return elements;
}

/**
 * Parse PlantUML Activity / Flowchart syntax (`start`, `:Action;`, `if/then/else/endif`, `stop`).
 * @param {string[]} lines
 * @param {number} roughness
 */
function parseFlowchart(lines, roughness) {
  /** @type {import('../types/schema.js').BoardElement[]} */
  const nodes = [];
  /** @type {import('../types/schema.js').BoardElement[]} */
  const connectors = [];

  /**
   * @param {string} type
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {string} [fill]
   * @param {string} [stroke]
   */
  function addNode(type, text, x, y, fill = '#FFFFFF', stroke = '#0F172A') {
    const width = type === 'fc_decision' ? 156 : 176;
    const height = type === 'fc_terminator' ? 52 : type === 'fc_decision' ? 92 : 68;
    /** @type {import('../types/schema.js').BoardElement} */
    const el = {
      id: crypto.randomUUID(),
      type,
      x: Math.round(x - width / 2),
      y: Math.round(y),
      width,
      height,
      strokeColor: stroke,
      fillColor: fill,
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      text,
      fontSize: 13,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
    };
    nodes.push(el);
    return el;
  }

  /**
   * Infer flowchart symbol type from Indonesian/English action wording.
   * @param {string} text
   */
  function inferActionType(text) {
    const low = text.toLowerCase();
    if (/^(input|masukkan|baca|read|output|tampilkan|cetak|display|prompt)/.test(low)) {
      return 'fc_io';
    }
    if (/^(simpan ke db|query|database|basis data)/.test(low)) {
      return 'fc_database';
    }
    return 'fc_process';
  }

  let cursorY = 60;
  const centerX = 360;
  /** @type {Array<{ node: import('../types/schema.js').BoardElement, label?: string, startSide?: import('../types/schema.js').PortSide }>} */
  let incoming = [];

  /**
   * @typedef {{
   *   decision: import('../types/schema.js').BoardElement,
   *   branch: 'then' | 'else',
   *   thenEnds: Array<{ node: import('../types/schema.js').BoardElement, label?: string, startSide?: import('../types/schema.js').PortSide }>,
   *   elseLabel: string,
   *   branchStartY: number,
   *   maxBranchY: number
   * }} IfFrame
   */
  /** @type {IfFrame[]} */
  const ifStack = [];

  /** @param {import('../types/schema.js').BoardElement} target */
  function connectIncoming(target) {
    for (const src of incoming) {
      connectors.push(
        makeBoundConnector(src.node, target, {
          label: src.label || '',
          routing: 'elbow',
          startSide: src.startSide,
          endSide: 'top',
          endMarker: 'filled_arrow',
          roughness,
        }),
      );
    }
    incoming = [];
  }

  for (const line of lines) {
    const activeIf = ifStack[ifStack.length - 1];
    const currentX = activeIf ? (activeIf.branch === 'then' ? centerX - 160 : centerX + 160) : centerX;

    if (/^start$/i.test(line)) {
      const node = addNode('fc_terminator', 'Mulai', currentX, cursorY, '#DBEAFE', '#1D4ED8');
      connectIncoming(node);
      incoming = [{ node }];
      cursorY += node.height + 52;
      continue;
    }

    if (/^(stop|end)$/i.test(line)) {
      const node = addNode('fc_terminator', 'Selesai', currentX, cursorY, '#F1F5F9', '#0F172A');
      connectIncoming(node);
      incoming = [];
      cursorY += node.height + 52;
      continue;
    }

    const ifMatch = line.match(/^if\s*\((.+)\)\s*then\s*(?:\(([^)]*)\))?$/i);
    if (ifMatch) {
      const decision = addNode('fc_decision', ifMatch[1].trim(), currentX, cursorY, '#FEF3C7', '#B45309');
      connectIncoming(decision);
      const nextY = cursorY + decision.height + 56;
      ifStack.push({
        decision,
        branch: 'then',
        thenEnds: [],
        elseLabel: 'Tidak',
        branchStartY: nextY,
        maxBranchY: nextY,
      });
      incoming = [{ node: decision, label: (ifMatch[2] || 'Ya').trim(), startSide: 'left' }];
      cursorY = nextY;
      continue;
    }

    const elseMatch = line.match(/^else\s*(?:\(([^)]*)\))?$/i);
    if (elseMatch && activeIf) {
      activeIf.thenEnds = [...incoming];
      activeIf.maxBranchY = Math.max(activeIf.maxBranchY, cursorY);
      activeIf.branch = 'else';
      activeIf.elseLabel = (elseMatch[1] || 'Tidak').trim();
      incoming = [{ node: activeIf.decision, label: activeIf.elseLabel, startSide: 'right' }];
      cursorY = activeIf.branchStartY;
      continue;
    }

    if (/^endif$/i.test(line) && activeIf) {
      const finished = ifStack.pop();
      if (finished) {
        const elseEnds =
          finished.branch === 'else'
            ? [...incoming]
            : [
                {
                  node: finished.decision,
                  label: finished.elseLabel,
                  startSide: /** @type {const} */ ('right'),
                },
              ];
        const thenEnds = finished.branch === 'then' ? [...incoming] : finished.thenEnds;
        incoming = [...thenEnds, ...elseEnds];
        cursorY = Math.max(finished.maxBranchY, cursorY) + 12;
      }
      continue;
    }

    const actMatch = line.match(/^:(.+);$/);
    if (actMatch) {
      const text = actMatch[1].trim();
      const type = inferActionType(text);
      const node = addNode(type, text, currentX, cursorY);
      connectIncoming(node);
      incoming = [{ node }];
      cursorY += node.height + 52;
    }
  }

  return [...nodes, ...connectors];
}

/**
 * Parse PlantUML syntax mapped to DFD symbols (Gane & Sarson or Yourdon & DeMarco).
 * Supports colors, stereotypes, Creole formatting (`**bold**`, `<color>`), `[hidden]` layout hints,
 * reversed `keyword alias as "Label"`, `\n` newlines, and directional arrows (`-down->`, `-right->`).
 * @param {string[]} lines
 * @param {number} roughness
 * @param {{ notation?: 'gane_sarson' | 'yourdon' }} [options]
 */
function parseDfd(lines, roughness, options = {}) {
  const useYourdon = options.notation === 'yourdon';
  const entityType = useYourdon ? 'dfd_yd_entity' : 'dfd_gs_entity';
  const processType = useYourdon ? 'dfd_yd_process' : 'dfd_gs_process';
  const storeType = useYourdon ? 'dfd_yd_datastore' : 'dfd_gs_datastore';

  /** @type {Map<string, { id: string, role: 'entity' | 'process' | 'datastore', code: string, text: string }>} */
  const nodesMap = new Map();
  /** @type {Array<{ from: string, to: string, label: string, dashed: boolean, color: string }>} */
  const flows = [];

  let procCounter = 1;
  let storeCounter = 1;

  /**
   * Split leading numeric/ID code from cleaned label (e.g. "1.0\nManajemen Master" or "D2  Data Tarif").
   * @param {string} rawLabel
   * @param {string} fallbackCode
   */
  function splitCode(rawLabel, fallbackCode) {
    const normalized = cleanPlantLabel(rawLabel);
    const m = normalized.match(/^([A-Za-z]?\d+(?:\.\d+)?)\s*[-:\n]\s*([\s\S]+)$/);
    if (m) return { code: m[1].trim(), text: m[2].replace(/\n+/g, ' ').trim() };
    const mSpace = normalized.match(/^([A-Za-z]?\d+(?:\.\d+)?)\s+([\s\S]+)$/);
    if (mSpace) return { code: mSpace[1].trim(), text: mSpace[2].replace(/\n+/g, ' ').trim() };
    return { code: fallbackCode, text: normalized.replace(/\n+/g, ' ').trim() };
  }

  /**
   * Infer DFD role from explicit stereotype, PlantUML keyword, or standard E/P/D naming.
   * @param {string} alias
   * @param {string} rawLabel
   * @param {string} kw
   * @param {string} stereo
   * @returns {'entity' | 'process' | 'datastore'}
   */
  function inferDfdRole(alias, rawLabel, kw, stereo) {
    const st = stereo.toLowerCase();
    if (st.includes('store') || st.includes('data') || st.includes('db')) return 'datastore';
    if (st.includes('entity') || st.includes('external') || st.includes('aktor')) return 'entity';
    if (st.includes('process') || st.includes('proses')) return 'process';

    if (['database', 'storage', 'collections', 'file', 'folder', 'queue', 'stack'].includes(kw)) {
      return 'datastore';
    }
    if (['usecase', 'component', 'circle', 'card', 'control'].includes(kw)) {
      return 'process';
    }
    if (['rectangle', 'actor', 'agent', 'person', 'boundary', 'node'].includes(kw)) {
      if (/^(D|DS)\d+\b/i.test(alias) || /^(D|DS)\d+\b/i.test(cleanPlantLabel(rawLabel))) return 'datastore';
      if (/^P\d+\b/i.test(alias) || /^\d+\.\d+\b/.test(cleanPlantLabel(rawLabel))) return 'process';
      return 'entity';
    }

    if (/^(D|DS|DB)\d+/i.test(alias)) return 'datastore';
    if (/^(E|EXT)\d+/i.test(alias)) return 'entity';
    if (/^P\d+/i.test(alias)) return 'process';
    return 'process';
  }

  /**
   * Register a DFD node entry.
   * @param {string} alias
   * @param {string} rawLabel
   * @param {string} kw
   * @param {string} stereo
   */
  function registerNode(alias, rawLabel, kw, stereo) {
    const role = inferDfdRole(alias, rawLabel, kw, stereo);
    const cleaned = cleanPlantLabel(rawLabel);
    if (role === 'datastore') {
      const defaultCode = /^(D|DS)\d+$/i.test(alias) ? alias.toUpperCase() : `D${storeCounter++}`;
      const { code, text } = splitCode(cleaned, defaultCode);
      nodesMap.set(alias, { id: crypto.randomUUID(), role, code, text });
    } else if (role === 'process') {
      const defaultCode = /^P\d+$/i.test(alias) ? `${alias.slice(1)}.0` : `${procCounter++}.0`;
      const { code, text } = splitCode(cleaned, defaultCode);
      nodesMap.set(alias, { id: crypto.randomUUID(), role, code, text });
    } else {
      nodesMap.set(alias, {
        id: crypto.randomUUID(),
        role,
        code: '',
        text: cleaned.replace(/\n+/g, '\n'),
      });
    }
  }

  for (const rawLine of lines) {
    // Ignore layout-only hidden connectors (`E6 -[hidden]down-> E1`)
    if (/\[hidden\]/i.test(rawLine)) continue;

    // Strip trailing color tokens like #LightBlue or #E2E8F0;border:black
    const line = rawLine.replace(/\s+#[A-Za-z0-9_;:-]+$/, '').trim();
    if (!line || line === '}' || /^(?:package|together|frame)\b.*\{$/i.test(line)) continue;

    // Declaration: `keyword "Label" as alias <<stereo>>` OR `keyword alias as "Label"`
    const decl = line.match(
      /^(rectangle|actor|agent|person|boundary|node|usecase|component|circle|card|control|database|storage|collections|file|folder|queue|stack)\s+(?:"([^"]+)"|\(([^)]+)\)|\[([^\]]+)\]|([A-Za-z0-9_.-]+))(?:\s+as\s+(?:"([^"]+)"|([A-Za-z0-9_]+)))?(?:\s*<<([^>]+)>>)?$/i,
    );
    if (decl) {
      const kw = decl[1].toLowerCase();
      const firstVal = (decl[2] || decl[3] || decl[4] || decl[5]).trim();
      const secondQuoted = decl[6];
      const secondIdent = decl[7];
      const stereo = decl[8] || '';

      if (secondQuoted) {
        registerNode(firstVal, secondQuoted, kw, stereo);
      } else {
        const alias = secondIdent || firstVal;
        registerNode(alias, firstVal, kw, stereo);
      }
      continue;
    }

    const color = extractArrowColor(line);

    // Normalize PlantUML colored & directional arrows (`-[#1565C0]->`, `<-down-`, `-[#2E7D32]down->`, etc.)
    const normalizedFlow = line
      .replace(/-\[[^\]]+\](?:up|down|left|right|u|d|l|r)?-/gi, '--')
      .replace(/-(?:up|down|left|right|u|d|l|r)-/gi, '--')
      .replace(/\.(?:up|down|left|right|u|d|l|r)\./gi, '..');

    const flowMatch = normalizedFlow.match(
      /^(?:"([^"]+)"|([A-Za-z0-9_]+))\s*([-.]{1,4}>|<[-.]{1,4}|<[-.]{1,4}>)\s*(?:"([^"]+)"|([A-Za-z0-9_]+))(?:\s*:\s*(.+))?$/,
    );
    if (flowMatch) {
      const left = flowMatch[1] || flowMatch[2];
      const arrow = flowMatch[3];
      const right = flowMatch[4] || flowMatch[5];
      const label = cleanPlantLabel(stripQuotes(flowMatch[6] || '')).replace(/\n+/g, ' ');
      const reversed = arrow.startsWith('<') && !arrow.endsWith('>');
      const from = reversed ? right : left;
      const to = reversed ? left : right;

      if (!nodesMap.has(from)) registerNode(from, from, '', '');
      if (!nodesMap.has(to)) registerNode(to, to, '', '');

      flows.push({ from, to, label, dashed: arrow.includes('.'), color });
    }
  }

  const entities = Array.from(nodesMap.entries()).filter(([, n]) => n.role === 'entity');
  const processes = Array.from(nodesMap.entries()).filter(([, n]) => n.role === 'process');
  const stores = Array.from(nodesMap.entries()).filter(([, n]) => n.role === 'datastore');

  /** @type {import('../types/schema.js').BoardElement[]} */
  const elements = [];
  /** @type {Map<string, import('../types/schema.js').BoardElement>} */
  const positioned = new Map();

  entities.forEach(([alias, n], idx) => {
    /** @type {import('../types/schema.js').BoardElement} */
    const el = {
      id: n.id,
      type: entityType,
      x: 80,
      y: 100 + idx * 140,
      width: 164,
      height: 76,
      strokeColor: '#1D4ED8',
      fillColor: '#DBEAFE',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      text: n.text,
      fontSize: 13,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
    };
    elements.push(el);
    positioned.set(alias, el);
  });

  processes.forEach(([alias, n], idx) => {
    /** @type {import('../types/schema.js').BoardElement} */
    const el = {
      id: n.id,
      type: processType,
      x: 480,
      y: 80 + idx * 180,
      width: useYourdon ? 184 : 188,
      height: useYourdon ? 114 : 98,
      strokeColor: '#B45309',
      fillColor: '#FEF3C7',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      code: n.code,
      text: n.text,
      fontSize: 13,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
    };
    elements.push(el);
    positioned.set(alias, el);
  });

  stores.forEach(([alias, n], idx) => {
    const storeText = useYourdon ? `${n.code}  ${n.text}`.trim() : n.text;
    /** @type {import('../types/schema.js').BoardElement} */
    const el = {
      id: n.id,
      type: storeType,
      x: 920,
      y: 100 + idx * 140,
      width: 224,
      height: 58,
      strokeColor: '#15803D',
      fillColor: '#FFFFFF',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness,
      opacity: 1,
      seed: nextSeed(),
      code: n.code,
      text: storeText,
      fontSize: 13,
      fontFamily: roughness > 0 ? 'sketch' : 'sans',
    };
    elements.push(el);
    positioned.set(alias, el);
  });

  for (const f of flows) {
    const src = positioned.get(f.from);
    const dst = positioned.get(f.to);
    if (!src || !dst) continue;
    elements.push(
      makeBoundConnector(src, dst, {
        label: f.label,
        routing: 'elbow',
        strokeColor: f.color,
        strokeStyle: f.dashed ? 'dashed' : 'solid',
        startMarker: 'none',
        endMarker: 'filled_arrow',
        roughness,
      }),
    );
  }

  return elements;
}

/**
 * Parse PlantText / PlantUML code into native FlowBoard elements with standardized design symbols.
 * @param {string} source
 * @param {{ kind?: PlantDiagramKind, renderMode?: 'clean' | 'sketch' }} [options]
 * @returns {PlantParseResult}
 */
export function parsePlantText(source, options = {}) {
  if (typeof source !== 'string' || !source.trim()) {
    return { ok: false, error: 'Kode PlantText masih kosong. Tempel kode terlebih dahulu.' };
  }
  if (source.length > MAX_PLANTTEXT_CHARS) {
    return { ok: false, error: 'Ukuran kode PlantText melebihi batas maksimum 100 KB.' };
  }

  const lines = preprocessLines(source);
  if (lines.length === 0) {
    return {
      ok: false,
      error: 'Tidak ditemukan definisi komponen atau relasi di dalam kode PlantText.',
    };
  }

  const requestedKind = options.kind || 'auto';
  const kind = requestedKind === 'auto' ? detectPlantDiagramKind(lines, source) : requestedKind;
  const roughness = options.renderMode === 'sketch' ? 1.3 : 0;
  const isYourdon = /yourdon|demarco/i.test(source);

  /** @type {import('../types/schema.js').BoardElement[]} */
  let elements = [];
  switch (kind) {
    case 'erd':
      elements = layoutDiagramElements(parseErd(lines, roughness), { direction: 'LR', kind });
      break;
    case 'class':
      elements = layoutDiagramElements(parseClassDiagram(lines, roughness), { direction: 'TB', kind });
      break;
    case 'usecase':
      elements = layoutDiagramElements(parseUseCase(lines, roughness), {
        direction: 'LR',
        kind,
        skipNodeLayout: true,
      });
      break;
    case 'sequence':
      elements = parseSequence(lines, roughness);
      break;
    case 'flowchart':
      elements = layoutDiagramElements(parseFlowchart(lines, roughness), {
        direction: 'TB',
        kind,
        skipNodeLayout: true,
      });
      break;
    case 'dfd':
    default:
      elements = layoutDiagramElements(
        parseDfd(lines, roughness, { notation: isYourdon ? 'yourdon' : 'gane_sarson' }),
        { direction: 'LR', kind },
      );
      break;
  }

  if (elements.length === 0) {
    return {
      ok: false,
      error:
        'Sintaks tidak dikenali untuk jenis diagram terpilih. Coba ubah jenis diagram atau gunakan salah satu contoh PlantText.',
    };
  }

  const connectors = elements.filter((e) => e.type === 'connector').length;
  const kindLabel =
    kind === 'dfd' && isYourdon ? 'DFD (Yourdon & DeMarco)' : PLANT_KIND_LABELS[kind];
  return {
    ok: true,
    kind,
    kindLabel,
    elements,
    summary: {
      nodes: elements.length - connectors,
      connectors,
    },
  };
}
