import { getNormalizedRect, getPortNormal, isConnectableElement, resolveBindingPoint } from './ports.js';

const CONTAINER_TYPES = new Set(['frame', 'uml_boundary', 'uml_fragment']);

/**
 * @typedef {{ x: number, y: number }} Pt
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/**
 * Check if two axis-aligned rectangles overlap with an optional safety padding.
 * @param {Rect} a
 * @param {Rect} b
 * @param {number} [pad]
 * @returns {boolean}
 */
export function rectsOverlap(a, b, pad = 0) {
  return (
    a.x - pad < b.x + b.width &&
    a.x + a.width + pad > b.x &&
    a.y - pad < b.y + b.height &&
    a.y + a.height + pad > b.y
  );
}

/**
 * Check if an axis-aligned segment AB intersects the interior of a rectangle.
 * @param {Pt} a
 * @param {Pt} b
 * @param {Rect} rect
 * @returns {boolean}
 */
export function orthoSegmentHitsRect(a, b, rect) {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const eps = 0.5;

  if (Math.abs(a.x - b.x) < eps) {
    return (
      a.x > rect.x + eps &&
      a.x < rect.x + rect.width - eps &&
      maxY > rect.y + eps &&
      minY < rect.y + rect.height - eps
    );
  }
  if (Math.abs(a.y - b.y) < eps) {
    return (
      a.y > rect.y + eps &&
      a.y < rect.y + rect.height - eps &&
      maxX > rect.x + eps &&
      minX < rect.x + rect.width - eps
    );
  }
  return false;
}

/**
 * Remove consecutive duplicate or collinear vertices from a polyline.
 * @param {Pt[]} pts
 * @returns {Pt[]}
 */
function simplifyOrthoPath(pts) {
  /** @type {Pt[]} */
  const deduped = [];
  for (const p of pts) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.5) {
      deduped.push({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
    }
  }
  if (deduped.length <= 2) return deduped;

  /** @type {Pt[]} */
  const out = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const a = out[out.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];
    const sameX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
    const sameY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
    if (!sameX && !sameY) {
      out.push(b);
    }
  }
  out.push(deduped[deduped.length - 1]);
  return out;
}

/**
 * Semantic 3-Column Corridor DFD Layout:
 * - Column 1 (Left): External Entities (in declaration order)
 * - Left Corridor (wide 360px multi-lane highway): Entity <-> Process flows
 * - Column 2 (Center): Processes (vertical stack with clean inter-process arrows)
 * - Right Corridor (wide 360px multi-lane highway): Process <-> Data Store flows
 * - Column 3 (Right): Data Stores (in declaration order)
 *
 * Completely separates Entity<->Process flows from Process<->DataStore flows so the
 * two corridors NEVER cross each other, matching textbook DFD Level 1 layouts.
 *
 * @param {import('../types/schema.js').BoardElement[]} nodes
 * @param {import('../types/schema.js').BoardElement[]} connectors
 */
function assignSemanticDfdPositions(nodes, connectors) {
  const entities = nodes.filter((n) => n.type === 'dfd_gs_entity' || n.type === 'dfd_yd_entity');
  const processes = nodes.filter((n) => n.type === 'dfd_gs_process' || n.type === 'dfd_yd_process');
  const stores = nodes.filter((n) => n.type === 'dfd_gs_datastore' || n.type === 'dfd_yd_datastore');
  const others = nodes.filter(
    (n) => !entities.includes(n) && !processes.includes(n) && !stores.includes(n),
  );

  const entityIds = new Set(entities.map((e) => e.id));
  const storeIds = new Set(stores.map((s) => s.id));
  const centerNodes = [...processes, ...others];
  const centerIds = new Set(centerNodes.map((p) => p.id));

  // Count corridor density & per-node side degree so ports & lanes always have generous breathing room
  let leftCorridorFlows = 0;
  let rightCorridorFlows = 0;
  /** @type {Map<string, number>} */
  const leftDeg = new Map();
  /** @type {Map<string, number>} */
  const rightDeg = new Map();

  for (const c of connectors) {
    const s = c.startBinding?.elementId;
    const t = c.endBinding?.elementId;
    if (!s || !t) continue;
    if ((entityIds.has(s) && centerIds.has(t)) || (centerIds.has(s) && entityIds.has(t))) {
      leftCorridorFlows += 1;
      const ent = entityIds.has(s) ? s : t;
      const prc = centerIds.has(s) ? s : t;
      rightDeg.set(ent, (rightDeg.get(ent) || 0) + 1);
      leftDeg.set(prc, (leftDeg.get(prc) || 0) + 1);
    } else if ((centerIds.has(s) && storeIds.has(t)) || (storeIds.has(s) && centerIds.has(t))) {
      rightCorridorFlows += 1;
      const prc = centerIds.has(s) ? s : t;
      const st = storeIds.has(s) ? s : t;
      rightDeg.set(prc, (rightDeg.get(prc) || 0) + 1);
      leftDeg.set(st, (leftDeg.get(st) || 0) + 1);
    }
  }

  // Gently scale node height only when many flows attach to one side so arrows never crowd together
  for (const node of [...entities, ...centerNodes, ...stores]) {
    const maxSide = Math.max(leftDeg.get(node.id) || 0, rightDeg.get(node.id) || 0);
    if (maxSide >= 5) {
      const neededH = Math.min(200, maxSide * 22 + 26);
      if (node.height < neededH) {
        node.height = neededH;
        // Keep Yourdon-DeMarco circles proportional
        if (node.type === 'dfd_yd_process' && node.width < neededH + 16) {
          node.width = Math.min(220, neededH + 16);
        }
      }
    }
  }

  const procGap = centerNodes.length >= 6 ? 104 : 86;
  const col1X = 80;
  const maxEntityW = entities.reduce((m, e) => Math.max(m, e.width), 164);
  const maxProcW = centerNodes.reduce((m, p) => Math.max(m, p.width), 184);

  const leftCorridor =
    entities.length > 0 ? Math.max(340, Math.min(540, 260 + leftCorridorFlows * 11)) : 0;
  const rightCorridor =
    stores.length > 0 ? Math.max(340, Math.min(540, 260 + rightCorridorFlows * 11)) : 0;
  const col2X = entities.length > 0 ? col1X + maxEntityW + leftCorridor : 120;
  const col3X = col2X + maxProcW + rightCorridor;

  const topY = 80;

  // Stack center processes cleanly in declaration order
  let procCursorY = topY;
  for (const proc of centerNodes) {
    proc.x = Math.round(col2X + (maxProcW - proc.width) / 2);
    proc.y = Math.round(procCursorY);
    procCursorY += proc.height + procGap;
  }
  const totalHeight = Math.max(320, procCursorY - topY - procGap);

  /**
   * Distribute a side column evenly across totalHeight while preserving declaration order.
   * @param {import('../types/schema.js').BoardElement[]} list
   * @param {number} x
   */
  function placeDistributedColumn(list, x) {
    if (list.length === 0) return;
    if (list.length === 1) {
      list[0].x = Math.round(x);
      list[0].y = Math.round(topY + (totalHeight - list[0].height) / 2);
      return;
    }
    const sumH = list.reduce((acc, el) => acc + el.height, 0);
    const gap = Math.max(76, (totalHeight - sumH) / (list.length - 1));
    let cy = topY;
    for (const item of list) {
      item.x = Math.round(x);
      item.y = Math.round(cy);
      cy += item.height + gap;
    }
  }

  placeDistributedColumn(entities, col1X);
  placeDistributedColumn(stores, col3X);
}

/**
 * Stage 1: Sugiyama Layered Node Layout (Cycle removal, Longest-Path ranks,
 * Barycenter crossing minimization, and non-overlapping coordinate assignment).
 * @param {import('../types/schema.js').BoardElement[]} nodes
 * @param {import('../types/schema.js').BoardElement[]} connectors
 * @param {{ direction?: 'LR' | 'TB', kind?: string }} opts
 */
function assignSugiyamaPositions(nodes, connectors, opts) {
  if (nodes.length === 0) return;

  // Use dedicated semantic 3-zone DFD layout whenever diagram is DFD
  const isDfdGraph =
    opts.kind === 'dfd' ||
    nodes.some((n) => n.type.startsWith('dfd_gs_') || n.type.startsWith('dfd_yd_'));
  if (isDfdGraph && nodes.length >= 3) {
    assignSemanticDfdPositions(nodes, connectors);
    return;
  }

  const direction = opts.direction || 'LR';
  const nodeIds = new Set(nodes.map((n) => n.id));
  /** @type {Map<string, import('../types/schema.js').BoardElement>} */
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  /** @type {Map<string, string[]>} */
  const rawAdj = new Map(nodes.map((n) => [n.id, []]));
  /** @type {Array<{ from: string, to: string }>} */
  const rawEdges = [];

  for (const c of connectors) {
    const from = c.startBinding?.elementId;
    const to = c.endBinding?.elementId;
    if (!from || !to || from === to || !nodeIds.has(from) || !nodeIds.has(to)) continue;
    rawEdges.push({ from, to });
    rawAdj.get(from)?.push(to);
  }

  // 1a. Cycle removal via DFS back-edge reversal
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {Set<string>} */
  const inStack = new Set();
  /** @type {Set<string>} */
  const backEdges = new Set();

  /** @param {string} u */
  function dfs(u) {
    visited.add(u);
    inStack.add(u);
    for (const v of rawAdj.get(u) || []) {
      const key = `${u}->${v}`;
      if (inStack.has(v)) backEdges.add(key);
      else if (!visited.has(v)) dfs(v);
    }
    inStack.delete(u);
  }
  for (const n of nodes) {
    if (!visited.has(n.id)) dfs(n.id);
  }

  /** @type {Map<string, string[]>} */
  const dagOut = new Map(nodes.map((n) => [n.id, []]));
  /** @type {Map<string, string[]>} */
  const dagIn = new Map(nodes.map((n) => [n.id, []]));

  for (const e of rawEdges) {
    const reversed = backEdges.has(`${e.from}->${e.to}`);
    const u = reversed ? e.to : e.from;
    const v = reversed ? e.from : e.to;
    if (!dagOut.get(u)?.includes(v)) {
      dagOut.get(u)?.push(v);
      dagIn.get(v)?.push(u);
    }
  }

  // 1b. Layer assignment (Longest-path ranking)
  /** @type {Map<string, number>} */
  const inDeg = new Map(nodes.map((n) => [n.id, dagIn.get(n.id)?.length || 0]));
  /** @type {Map<string, number>} */
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  /** @type {string[]} */
  const queue = [];

  for (const n of nodes) {
    if ((inDeg.get(n.id) || 0) === 0) queue.push(n.id);
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    const rU = rank.get(u) || 0;
    for (const v of dagOut.get(u) || []) {
      rank.set(v, Math.max(rank.get(v) || 0, rU + 1));
      const rem = (inDeg.get(v) || 1) - 1;
      inDeg.set(v, rem);
      if (rem === 0) queue.push(v);
    }
  }

  let maxRank = 0;
  for (const r of rank.values()) {
    if (r > maxRank) maxRank = r;
  }

  /** @type {string[][]} */
  const layers = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of nodes) {
    layers[rank.get(n.id) || 0].push(n.id);
  }

  if (layers.length === 1 && layers[0].length > 3) {
    const cols = Math.ceil(Math.sqrt(layers[0].length));
    const all = layers[0].slice();
    layers.length = 0;
    for (let i = 0; i < all.length; i += cols) {
      layers.push(all.slice(i, i + cols));
    }
  }

  // 1c. Barycenter crossing minimization (4 bidirectional layer sweeps)
  /**
   * @param {string[][]} layerList
   * @param {number} targetIdx
   * @param {number} refIdx
   * @param {Map<string, string[]>} neighborMap
   */
  function sortLayerByBarycenter(layerList, targetIdx, refIdx, neighborMap) {
    const refPos = new Map(layerList[refIdx].map((id, idx) => [id, idx]));
    const currPos = new Map(layerList[targetIdx].map((id, idx) => [id, idx]));

    layerList[targetIdx].sort((a, b) => {
      const nA = (neighborMap.get(a) || []).filter((id) => refPos.has(id));
      const nB = (neighborMap.get(b) || []).filter((id) => refPos.has(id));
      const avgA =
        nA.length > 0
          ? nA.reduce((acc, id) => acc + (refPos.get(id) || 0), 0) / nA.length
          : (currPos.get(a) || 0);
      const avgB =
        nB.length > 0
          ? nB.reduce((acc, id) => acc + (refPos.get(id) || 0), 0) / nB.length
          : (currPos.get(b) || 0);
      if (Math.abs(avgA - avgB) > 1e-4) return avgA - avgB;
      return (currPos.get(a) || 0) - (currPos.get(b) || 0);
    });
  }

  for (let sweep = 0; sweep < 4; sweep += 1) {
    for (let l = 1; l < layers.length; l += 1) {
      sortLayerByBarycenter(layers, l, l - 1, dagIn);
    }
    for (let l = layers.length - 2; l >= 0; l -= 1) {
      sortLayerByBarycenter(layers, l, l + 1, dagOut);
    }
  }

  // 1d. Generous non-overlapping coordinate assignment with label-friendly channels
  const originX = 90;
  const originY = 90;
  const hasLabels = connectors.some((c) => c.text && c.text.trim().length > 0);
  const channelGap = hasLabels ? 190 : 130;
  const siblingGap = 96;

  if (direction === 'LR') {
    const layerSpans = layers.map((ids) => {
      const totalH =
        ids.reduce((acc, id) => acc + (nodeById.get(id)?.height || 80), 0) +
        Math.max(0, ids.length - 1) * siblingGap;
      const maxW = ids.reduce((acc, id) => Math.max(acc, nodeById.get(id)?.width || 140), 0);
      return { totalH, maxW };
    });
    const maxTotalH = Math.max(...layerSpans.map((s) => s.totalH), 0);

    let cursorX = originX;
    layers.forEach((ids, lIdx) => {
      const { totalH, maxW } = layerSpans[lIdx];
      let cursorY = originY + Math.round((maxTotalH - totalH) / 2);

      for (const id of ids) {
        const node = nodeById.get(id);
        if (!node) continue;
        node.x = Math.round(cursorX + (maxW - node.width) / 2);
        node.y = Math.round(cursorY);
        cursorY += node.height + siblingGap;
      }
      cursorX += maxW + channelGap;
    });
  } else {
    const layerSpans = layers.map((ids) => {
      const totalW =
        ids.reduce((acc, id) => acc + (nodeById.get(id)?.width || 140), 0) +
        Math.max(0, ids.length - 1) * siblingGap;
      const maxH = ids.reduce((acc, id) => Math.max(acc, nodeById.get(id)?.height || 80), 0);
      return { totalW, maxH };
    });
    const maxTotalW = Math.max(...layerSpans.map((s) => s.totalW), 0);

    let cursorY = originY;
    layers.forEach((ids, lIdx) => {
      const { totalW, maxH } = layerSpans[lIdx];
      let cursorX = originX + Math.round((maxTotalW - totalW) / 2);

      for (const id of ids) {
        const node = nodeById.get(id);
        if (!node) continue;
        node.x = Math.round(cursorX);
        node.y = Math.round(cursorY + (maxH - node.height) / 2);
        cursorX += node.width + siblingGap;
      }
      cursorY += maxH + channelGap;
    });
  }
}

/**
 * Choose natural exit/entry sides for a bound connector based on relative node centers.
 * @param {import('../types/schema.js').BoardElement} src
 * @param {import('../types/schema.js').BoardElement} dst
 * @param {'LR' | 'TB'} direction
 * @returns {{ startSide: import('../types/schema.js').PortSide, endSide: import('../types/schema.js').PortSide }}
 */
function pickOptimalSides(src, dst, direction) {
  const sCx = src.x + src.width / 2;
  const sCy = src.y + src.height / 2;
  const dCx = dst.x + dst.width / 2;
  const dCy = dst.y + dst.height / 2;
  const dx = dCx - sCx;
  const dy = dCy - sCy;

  // Same vertical column (e.g., inter-process P2 -> P3): always connect vertically
  const overlapX = Math.min(src.x + src.width, dst.x + dst.width) - Math.max(src.x, dst.x);
  if (overlapX > 20) {
    return dy >= 0
      ? { startSide: 'bottom', endSide: 'top' }
      : { startSide: 'top', endSide: 'bottom' };
  }

  // Same horizontal row: always connect horizontally
  const overlapY = Math.min(src.y + src.height, dst.y + dst.height) - Math.max(src.y, dst.y);
  if (overlapY > 20) {
    return dx >= 0
      ? { startSide: 'right', endSide: 'left' }
      : { startSide: 'left', endSide: 'right' };
  }

  if (direction === 'LR') {
    // Distinct horizontal columns separated by a corridor: ALWAYS enter/exit into the corridor
    const horizGap =
      dx >= 0 ? dst.x - (src.x + src.width) : src.x - (dst.x + dst.width);
    if (horizGap >= 48 || Math.abs(dx) >= Math.abs(dy) * 0.85) {
      return dx >= 0
        ? { startSide: 'right', endSide: 'left' }
        : { startSide: 'left', endSide: 'right' };
    }
    return dy >= 0
      ? { startSide: 'bottom', endSide: 'top' }
      : { startSide: 'top', endSide: 'bottom' };
  }

  const vertGap =
    dy >= 0 ? dst.y - (src.y + src.height) : src.y - (dst.y + dst.height);
  if (vertGap >= 48 || Math.abs(dy) >= Math.abs(dx) * 0.85) {
    return dy >= 0
      ? { startSide: 'bottom', endSide: 'top' }
      : { startSide: 'top', endSide: 'bottom' };
  }
  return dx >= 0
    ? { startSide: 'right', endSide: 'left' }
    : { startSide: 'left', endSide: 'right' };
}

/**
 * Stage 2: Distribute ports evenly along each node side sorted by opposite endpoint position.
 * @param {import('../types/schema.js').BoardElement[]} connectors
 * @param {Map<string, import('../types/schema.js').BoardElement>} nodeById
 * @param {'LR' | 'TB'} direction
 */
function distributeConnectorPorts(connectors, nodeById, direction) {
  /**
   * @typedef {{
   *   connector: import('../types/schema.js').BoardElement,
   *   which: 'start' | 'end',
   *   side: import('../types/schema.js').PortSide,
   *   sortKey: number
   * }} PortSlot
   */
  /** @type {Map<string, PortSlot[]>} */
  const groups = new Map();

  for (const c of connectors) {
    const src = c.startBinding ? nodeById.get(c.startBinding.elementId) : null;
    const dst = c.endBinding ? nodeById.get(c.endBinding.elementId) : null;
    if (!src || !dst) continue;

    const { startSide, endSide } = pickOptimalSides(src, dst, direction);
    const sCx = src.x + src.width / 2;
    const sCy = src.y + src.height / 2;
    const dCx = dst.x + dst.width / 2;
    const dCy = dst.y + dst.height / 2;

    c.startBinding = { elementId: src.id, side: startSide, rx: 0.5, ry: 0.5 };
    c.endBinding = { elementId: dst.id, side: endSide, rx: 0.5, ry: 0.5 };

    const startKey = `${src.id}:${startSide}`;
    const endKey = `${dst.id}:${endSide}`;

    if (!groups.has(startKey)) groups.set(startKey, []);
    if (!groups.has(endKey)) groups.set(endKey, []);

    groups.get(startKey)?.push({
      connector: c,
      which: 'start',
      side: startSide,
      sortKey: startSide === 'left' || startSide === 'right' ? dCy : dCx,
    });
    groups.get(endKey)?.push({
      connector: c,
      which: 'end',
      side: endSide,
      sortKey: endSide === 'left' || endSide === 'right' ? sCy : sCx,
    });
  }

  for (const slots of groups.values()) {
    // Deterministic tie-break by connector.id ensures bidirectional pairs (A->B and B->A)
    // occupy matching vertical positions on both endpoints and NEVER cross each other!
    slots.sort((a, b) => {
      if (Math.abs(a.sortKey - b.sortKey) > 1) return a.sortKey - b.sortKey;
      return a.connector.id.localeCompare(b.connector.id);
    });
    const n = slots.length;

    slots.forEach((slot, idx) => {
      const t = n === 1 ? 0.5 : 0.14 + (idx / (n - 1)) * 0.72;
      const rx = slot.side === 'left' ? 0 : slot.side === 'right' ? 1 : t;
      const ry = slot.side === 'top' ? 0 : slot.side === 'bottom' ? 1 : t;
      const binding = slot.which === 'start' ? slot.connector.startBinding : slot.connector.endBinding;
      if (binding) {
        binding.rx = Math.round(rx * 1000) / 1000;
        binding.ry = Math.round(ry * 1000) / 1000;
      }
    });
  }
}

/**
 * Deduplicate and sort numeric grid coordinates within tolerance.
 * @param {number[]} values
 * @returns {number[]}
 */
function uniqueSortedCoords(values) {
  const sorted = [...values].sort((a, b) => a - b);
  /** @type {number[]} */
  const out = [];
  for (const v of sorted) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) >= 2) {
      out.push(v);
    }
  }
  return out;
}

/**
 * Stage 3: Multi-Track Visibility-Grid A* Router with Obstacle Avoidance & Strong Congestion Cost.
 * @param {Pt} start
 * @param {Pt} end
 * @param {import('../types/schema.js').PortSide} startSide
 * @param {import('../types/schema.js').PortSide} endSide
 * @param {Array<{ id: string, rect: Rect }>} obstacles
 * @param {Set<string>} ignoreIds
 * @param {Array<{ a: Pt, b: Pt }>} usedSegments
 * @returns {Pt[]}
 */
function routeObstacleAvoidingOrtho(start, end, startSide, endSide, obstacles, ignoreIds, usedSegments) {
  const stubDist = 28;
  const pad = 22;
  const sNorm = getPortNormal(startSide);
  const eNorm = getPortNormal(endSide);
  const sStub = { x: start.x + sNorm.x * stubDist, y: start.y + sNorm.y * stubDist };
  const eStub = { x: end.x + eNorm.x * stubDist, y: end.y + eNorm.y * stubDist };

  const activeObstacles = obstacles
    .filter((o) => !ignoreIds.has(o.id))
    .map((o) => ({
      x: o.rect.x - pad,
      y: o.rect.y - pad,
      width: o.rect.width + pad * 2,
      height: o.rect.height + pad * 2,
    }));

  const rawX = [start.x, end.x, sStub.x, eStub.x, (sStub.x + eStub.x) / 2];
  const rawY = [start.y, end.y, sStub.y, eStub.y, (sStub.y + eStub.y) / 2];

  let minX = Math.min(start.x, end.x, sStub.x, eStub.x);
  let maxX = Math.max(start.x, end.x, sStub.x, eStub.x);
  let minY = Math.min(start.y, end.y, sStub.y, eStub.y);
  let maxY = Math.max(start.y, end.y, sStub.y, eStub.y);

  for (const o of obstacles) {
    const lx = o.rect.x - pad;
    const rx = o.rect.x + o.rect.width + pad;
    const ty = o.rect.y - pad;
    const by = o.rect.y + o.rect.height + pad;
    rawX.push(lx, rx);
    rawY.push(ty, by);
    if (lx < minX) minX = lx;
    if (rx > maxX) maxX = rx;
    if (ty < minY) minY = ty;
    if (by > maxY) maxY = by;
  }

  // Outer perimeter multi-lane highways so skip-edges never stack on top of each other
  rawX.push(minX - 36, minX - 64, maxX + 36, maxX + 64);
  rawY.push(minY - 36, minY - 64, minY - 92, maxY + 36, maxY + 64, maxY + 92);

  const baseXs = uniqueSortedCoords(rawX);
  const baseYs = uniqueSortedCoords(rawY);

  // Add multi-lane tracks inside wide channels between nodes
  const xsWithLanes = [...baseXs];
  for (let i = 0; i < baseXs.length - 1; i += 1) {
    const span = baseXs[i + 1] - baseXs[i];
    if (span >= 44) {
      const mid = (baseXs[i] + baseXs[i + 1]) / 2;
      xsWithLanes.push(mid);
      if (span >= 110) {
        xsWithLanes.push(mid - 24, mid + 24);
      }
    }
  }
  const ysWithLanes = [...baseYs];
  for (let i = 0; i < baseYs.length - 1; i += 1) {
    const span = baseYs[i + 1] - baseYs[i];
    if (span >= 44) {
      const mid = (baseYs[i] + baseYs[i + 1]) / 2;
      ysWithLanes.push(mid);
      if (span >= 110) {
        ysWithLanes.push(mid - 24, mid + 24);
      }
    }
  }

  const xs = uniqueSortedCoords(xsWithLanes);
  const ys = uniqueSortedCoords(ysWithLanes);

  /** @param {number[]} arr @param {number} val */
  function closestIdx(arr, val) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < arr.length; i += 1) {
      const d = Math.abs(arr[i] - val);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  const sXi = closestIdx(xs, sStub.x);
  const sYi = closestIdx(ys, sStub.y);
  const eXi = closestIdx(xs, eStub.x);
  const eYi = closestIdx(ys, eStub.y);

  const goalX = xs[eXi];
  const goalY = ys[eYi];

  /**
   * Compute overlap + crossing cost against already-routed segments.
   * @param {Pt} a
   * @param {Pt} b
   */
  function segmentInteractionCost(a, b) {
    const horiz = Math.abs(a.y - b.y) < 0.5;
    let penalty = 0;
    for (const seg of usedSegments) {
      const segHoriz = Math.abs(seg.a.y - seg.b.y) < 0.5;
      if (horiz && segHoriz && Math.abs(a.y - seg.a.y) < 10) {
        const minA = Math.min(a.x, b.x);
        const maxA = Math.max(a.x, b.x);
        const minB = Math.min(seg.a.x, seg.b.x);
        const maxB = Math.max(seg.a.x, seg.b.x);
        if (Math.min(maxA, maxB) - Math.max(minA, minB) > 4) penalty += 1400;
      } else if (!horiz && !segHoriz && Math.abs(a.x - seg.a.x) < 10) {
        const minA = Math.min(a.y, b.y);
        const maxA = Math.max(a.y, b.y);
        const minB = Math.min(seg.a.y, seg.b.y);
        const maxB = Math.max(seg.a.y, seg.b.y);
        if (Math.min(maxA, maxB) - Math.max(minA, minB) > 4) penalty += 1400;
      } else if (horiz && !segHoriz) {
        const sx = seg.a.x;
        const syMin = Math.min(seg.a.y, seg.b.y);
        const syMax = Math.max(seg.a.y, seg.b.y);
        if (sx > Math.min(a.x, b.x) + 2 && sx < Math.max(a.x, b.x) - 2 && a.y > syMin + 2 && a.y < syMax - 2) {
          penalty += 220;
        }
      } else if (!horiz && segHoriz) {
        const sy = seg.a.y;
        const sxMin = Math.min(seg.a.x, seg.b.x);
        const sxMax = Math.max(seg.a.x, seg.b.x);
        if (sy > Math.min(a.y, b.y) + 2 && sy < Math.max(a.y, b.y) - 2 && a.x > sxMin + 2 && a.x < sxMax - 2) {
          penalty += 220;
        }
      }
    }
    return penalty;
  }

  /**
   * @param {Pt} a
   * @param {Pt} b
   */
  function hitsAnyObstacle(a, b) {
    for (const rect of activeObstacles) {
      if (orthoSegmentHitsRect(a, b, rect)) return true;
    }
    return false;
  }

  const startDir = startSide === 'left' || startSide === 'right' ? 1 : 2;
  const endDir = endSide === 'left' || endSide === 'right' ? 1 : 2;
  const keyOf = (xi, yi, dir) => `${xi},${yi},${dir}`;

  /** @type {Map<string, number>} */
  const gScore = new Map();
  /** @type {Map<string, string>} */
  const cameFrom = new Map();
  /** @type {Array<{ xi: number, yi: number, dir: number, f: number }>} */
  const open = [];

  const startKey = keyOf(sXi, sYi, startDir);
  gScore.set(startKey, 0);
  open.push({
    xi: sXi,
    yi: sYi,
    dir: startDir,
    f: Math.abs(xs[sXi] - goalX) + Math.abs(ys[sYi] - goalY),
  });

  const dirs = [
    { dx: 1, dy: 0, dir: 1 },
    { dx: -1, dy: 0, dir: 1 },
    { dx: 0, dy: 1, dir: 2 },
    { dx: 0, dy: -1, dir: 2 },
  ];

  let foundKey = '';
  let iterations = 0;
  const maxIterations = 12000;

  while (open.length > 0 && iterations < maxIterations) {
    iterations += 1;
    let bestIdx = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const curr = open.splice(bestIdx, 1)[0];
    const currKey = keyOf(curr.xi, curr.yi, curr.dir);

    if (curr.xi === eXi && curr.yi === eYi) {
      foundKey = currKey;
      break;
    }

    const currG = gScore.get(currKey) ?? Infinity;
    const pA = { x: xs[curr.xi], y: ys[curr.yi] };

    for (const step of dirs) {
      const nXi = curr.xi + step.dx;
      const nYi = curr.yi + step.dy;
      if (nXi < 0 || nXi >= xs.length || nYi < 0 || nYi >= ys.length) continue;

      const pB = { x: xs[nXi], y: ys[nYi] };
      const dist = Math.abs(pB.x - pA.x) + Math.abs(pB.y - pA.y);
      const turnPenalty = curr.dir !== step.dir ? 95 : 0;
      const obstaclePenalty = hitsAnyObstacle(pA, pB) ? 80000 : 0;
      const interactionPenalty = segmentInteractionCost(pA, pB);
      const goalAlignPenalty = nXi === eXi && nYi === eYi && step.dir !== endDir ? 35 : 0;

      const tentativeG =
        currG + dist + turnPenalty + obstaclePenalty + interactionPenalty + goalAlignPenalty;
      const nextKey = keyOf(nXi, nYi, step.dir);
      if (tentativeG < (gScore.get(nextKey) ?? Infinity)) {
        gScore.set(nextKey, tentativeG);
        cameFrom.set(nextKey, currKey);
        const h = Math.abs(pB.x - goalX) + Math.abs(pB.y - goalY);
        open.push({ xi: nXi, yi: nYi, dir: step.dir, f: tentativeG + h });
      }
    }
  }

  /** @type {Pt[]} */
  const gridPath = [];
  if (foundKey) {
    let cur = foundKey;
    while (cur) {
      const [xiStr, yiStr] = cur.split(',');
      gridPath.push({ x: xs[Number(xiStr)], y: ys[Number(yiStr)] });
      cur = cameFrom.get(cur) || '';
    }
    gridPath.reverse();
  } else {
    gridPath.push(
      sStub,
      { x: (sStub.x + eStub.x) / 2, y: sStub.y },
      { x: (sStub.x + eStub.x) / 2, y: eStub.y },
      eStub,
    );
  }

  return simplifyOrthoPath([start, sStub, ...gridPath, eStub, end]);
}

/**
 * Stage 4: Separate any remaining overlapping parallel interior segments (edge nudging).
 * @param {Array<{ connector: import('../types/schema.js').BoardElement, path: Pt[] }>} routedList
 * @param {Array<{ id: string, rect: Rect }>} obstacles
 */
function nudgeParallelSegments(routedList, obstacles) {
  const gap = 18;
  /** @type {Array<{ idx: number, segIdx: number, axis: 'x' | 'y', coord: number, min: number, max: number }>} */
  const interiorSegs = [];

  routedList.forEach((item, idx) => {
    const pts = item.path;
    for (let s = 1; s < pts.length - 2; s += 1) {
      const a = pts[s];
      const b = pts[s + 1];
      if (Math.abs(a.x - b.x) < 0.5) {
        interiorSegs.push({
          idx,
          segIdx: s,
          axis: 'x',
          coord: a.x,
          min: Math.min(a.y, b.y),
          max: Math.max(a.y, b.y),
        });
      } else if (Math.abs(a.y - b.y) < 0.5) {
        interiorSegs.push({
          idx,
          segIdx: s,
          axis: 'y',
          coord: a.y,
          min: Math.min(a.x, b.x),
          max: Math.max(a.x, b.x),
        });
      }
    }
  });

  /** @type {Set<number>} */
  const processed = new Set();

  for (let i = 0; i < interiorSegs.length; i += 1) {
    if (processed.has(i)) continue;
    const base = interiorSegs[i];
    /** @type {number[]} */
    const cluster = [i];
    processed.add(i);

    for (let j = i + 1; j < interiorSegs.length; j += 1) {
      if (processed.has(j)) continue;
      const other = interiorSegs[j];
      if (other.axis !== base.axis) continue;
      if (Math.abs(other.coord - base.coord) > 6) continue;
      const overlap = Math.min(base.max, other.max) - Math.max(base.min, other.min);
      if (overlap > 6) {
        cluster.push(j);
        processed.add(j);
      }
    }

    if (cluster.length <= 1) continue;

    cluster.forEach((entryIdx, pos) => {
      const entry = interiorSegs[entryIdx];
      const offset = (pos - (cluster.length - 1) / 2) * gap;
      if (Math.abs(offset) < 0.5) return;

      const pts = routedList[entry.idx].path;
      const a = pts[entry.segIdx];
      const b = pts[entry.segIdx + 1];
      const candA = entry.axis === 'x' ? { x: a.x + offset, y: a.y } : { x: a.x, y: a.y + offset };
      const candB = entry.axis === 'x' ? { x: b.x + offset, y: b.y } : { x: b.x, y: b.y + offset };

      const conn = routedList[entry.idx].connector;
      const ignore = new Set([conn.startBinding?.elementId || '', conn.endBinding?.elementId || '']);
      const blocked = obstacles.some(
        (o) => !ignore.has(o.id) && orthoSegmentHitsRect(candA, candB, o.rect),
      );
      if (!blocked) {
        pts[entry.segIdx] = candA;
        pts[entry.segIdx + 1] = candB;
      }
    });
  }
}

/**
 * Estimate wrapped connector label pill dimensions (matching canvasRenderer wrap width 144px).
 * @param {string} text
 * @returns {{ width: number, height: number }}
 */
function estimateLabelSize(text) {
  const clean = text.trim();
  const maxCharsPerLine = 22;
  const estLines = Math.max(1, Math.min(3, Math.ceil(clean.length / maxCharsPerLine)));
  const longest = Math.min(maxCharsPerLine, clean.length);
  return {
    width: Math.max(44, longest * 6.4 + 14),
    height: estLines * 14.5 + 8,
  };
}

/**
 * Stage 5: Non-overlapping label placement along each connector's longest clear segment.
 * @param {Array<{ connector: import('../types/schema.js').BoardElement, path: Pt[] }>} routedList
 * @param {Array<{ id: string, rect: Rect }>} obstacles
 */
function placeConnectorLabelsCleanly(routedList, obstacles) {
  /** @type {Rect[]} */
  const occupiedLabels = [];
  const nodeBoxes = obstacles.map((o) => o.rect);

  for (const { connector, path } of routedList) {
    if (!connector.text || !connector.text.trim() || path.length < 2) {
      connector.labelPos = null;
      continue;
    }

    const size = estimateLabelSize(connector.text);

    // Rank segments: prefer longer horizontal segments (horizontal text sits best on horizontal tracks)
    /** @type {Array<{ a: Pt, b: Pt, len: number, score: number }>} */
    const segs = [];
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i];
      const b = path[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const isHoriz = Math.abs(a.y - b.y) < 1;
      segs.push({ a, b, len, score: len * (isHoriz ? 1.35 : 1) });
    }
    segs.sort((s1, s2) => s2.score - s1.score);

    /** @type {Pt[]} */
    const candidates = [];
    const ratios = [0.5, 0.32, 0.68, 0.18, 0.82];
    for (const seg of segs.slice(0, 4)) {
      const isHoriz = Math.abs(seg.a.y - seg.b.y) < 1;
      for (const t of ratios) {
        const px = seg.a.x + (seg.b.x - seg.a.x) * t;
        const py = seg.a.y + (seg.b.y - seg.a.y) * t;
        candidates.push({ x: px, y: py });
        if (isHoriz) {
          candidates.push({ x: px, y: py - size.height * 0.68 });
          candidates.push({ x: px, y: py + size.height * 0.68 });
        } else {
          candidates.push({ x: px - size.width * 0.42, y: py });
          candidates.push({ x: px + size.width * 0.42, y: py });
        }
      }
    }

    let chosen = candidates[0];
    let bestScore = Infinity;

    for (const cand of candidates) {
      const rect = {
        x: cand.x - size.width / 2,
        y: cand.y - size.height / 2,
        width: size.width,
        height: size.height,
      };
      let score = 0;
      for (const nb of nodeBoxes) {
        if (rectsOverlap(rect, nb, 4)) score += 1000;
      }
      for (const lb of occupiedLabels) {
        if (rectsOverlap(rect, lb, 4)) score += 600;
      }
      if (score < bestScore) {
        bestScore = score;
        chosen = cand;
        if (score === 0) break;
      }
    }

    if (chosen) {
      connector.labelPos = {
        x: Math.round(chosen.x * 10) / 10,
        y: Math.round(chosen.y * 10) / 10,
      };
      occupiedLabels.push({
        x: chosen.x - size.width / 2,
        y: chosen.y - size.height / 2,
        width: size.width,
        height: size.height,
      });
    }
  }
}

/**
 * Stage 3a: Fast Left-Edge Corridor Channel Router for clear multi-column highways
 * (e.g. DFD Entity <-> Process Left Corridor & Process <-> DataStore Right Corridor).
 * Guarantees zero overlapping vertical tracks and zero node collisions in < 2ms.
 *
 * @param {import('../types/schema.js').BoardElement[]} connectors
 * @param {Map<string, import('../types/schema.js').BoardElement>} nodeById
 * @param {Array<{ id: string, rect: Rect }>} obstacles
 * @returns {Map<string, Pt[]>}
 */
function routeClearCorridorChannels(connectors, nodeById, obstacles) {
  /** @type {Map<string, Pt[]>} */
  const routed = new Map();

  /**
   * @typedef {{
   *   conn: import('../types/schema.js').BoardElement,
   *   start: Pt,
   *   end: Pt,
   *   corrMinX: number,
   *   corrMaxX: number,
   *   yMin: number,
   *   yMax: number,
   *   ignore: Set<string>
   * }} CorridorEdge
   */
  /** @type {Map<number, CorridorEdge[]>} */
  const buckets = new Map();

  for (const conn of connectors) {
    if (conn.routing === 'straight' || !conn.startBinding || !conn.endBinding) continue;
    const src = nodeById.get(conn.startBinding.elementId);
    const dst = nodeById.get(conn.endBinding.elementId);
    if (!src || !dst) continue;

    const start = resolveBindingPoint(src, conn.startBinding);
    const end = resolveBindingPoint(dst, conn.endBinding);
    const sSide = conn.startBinding.side;
    const eSide = conn.endBinding.side;
    const ignore = new Set([src.id, dst.id]);

    // Direct obstacle-free vertical link between adjacent stacked nodes (e.g. P2 -> P3)
    if (
      ((sSide === 'bottom' && eSide === 'top' && end.y > start.y + 8) ||
        (sSide === 'top' && eSide === 'bottom' && start.y > end.y + 8)) &&
      Math.abs(start.x - end.x) < 40
    ) {
      const midY = (start.y + end.y) / 2;
      const cand =
        Math.abs(start.x - end.x) < 2
          ? [start, end]
          : [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
      let blocked = false;
      for (let i = 0; i < cand.length - 1; i += 1) {
        if (obstacles.some((o) => !ignore.has(o.id) && orthoSegmentHitsRect(cand[i], cand[i + 1], o.rect))) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        routed.set(conn.id, simplifyOrthoPath(cand));
        continue;
      }
    }

    // Horizontal corridor edge between two adjacent columns
    const isHorizCorridor =
      (sSide === 'right' && eSide === 'left' && end.x - start.x >= 90) ||
      (sSide === 'left' && eSide === 'right' && start.x - end.x >= 90);
    if (!isHorizCorridor) continue;

    const corrMinX = Math.min(start.x, end.x);
    const corrMaxX = Math.max(start.x, end.x);
    const yMin = Math.min(start.y, end.y);
    const yMax = Math.max(start.y, end.y);

    // Ensure the corridor box between start and end contains NO intermediate obstacle nodes
    const corridorBox = {
      x: corrMinX + 18,
      y: yMin - 10,
      width: corrMaxX - corrMinX - 36,
      height: Math.max(20, yMax - yMin + 20),
    };
    const hasObstacleInCorridor = obstacles.some(
      (o) => !ignore.has(o.id) && rectsOverlap(corridorBox, o.rect, 4),
    );
    if (hasObstacleInCorridor) continue;

    if (Math.abs(start.y - end.y) < 3) {
      routed.set(conn.id, simplifyOrthoPath([start, end]));
      continue;
    }

    const bucketKey = Math.round(((corrMinX + corrMaxX) / 2) / 140);
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)?.push({ conn, start, end, corrMinX, corrMaxX, yMin, yMax, ignore });
  }

  for (const list of buckets.values()) {
    if (list.length === 0) continue;
    const safeMinX = Math.max(...list.map((e) => e.corrMinX)) + 34;
    const safeMaxX = Math.min(...list.map((e) => e.corrMaxX)) - 34;
    if (safeMaxX - safeMinX < 24) continue;

    // Left-Edge interval coloring: pack non-overlapping vertical spans into minimal distinct lanes
    const sorted = [...list].sort((a, b) => {
      if (Math.abs(a.yMin - b.yMin) > 2) return a.yMin - b.yMin;
      return (a.yMax - a.yMin) - (b.yMax - b.yMin);
    });

    /** @type {Array<Array<{ yMin: number, yMax: number }>>} */
    const lanes = [];
    /** @type {Array<{ edge: CorridorEdge, laneIdx: number }>} */
    const assignments = [];

    for (const edge of sorted) {
      const padMin = edge.yMin - 8;
      const padMax = edge.yMax + 8;
      let chosenLane = -1;
      for (let l = 0; l < lanes.length; l += 1) {
        const conflict = lanes[l].some(
          (iv) => Math.min(iv.yMax, padMax) - Math.max(iv.yMin, padMin) > 0,
        );
        if (!conflict) {
          chosenLane = l;
          break;
        }
      }
      if (chosenLane === -1) {
        chosenLane = lanes.length;
        lanes.push([]);
      }
      lanes[chosenLane].push({ yMin: padMin, yMax: padMax });
      assignments.push({ edge, laneIdx: chosenLane });
    }

    const totalLanes = lanes.length;
    for (const { edge, laneIdx } of assignments) {
      const laneX =
        totalLanes === 1
          ? (safeMinX + safeMaxX) / 2
          : safeMinX + (laneIdx / (totalLanes - 1)) * (safeMaxX - safeMinX);
      const path = simplifyOrthoPath([
        edge.start,
        { x: laneX, y: edge.start.y },
        { x: laneX, y: edge.end.y },
        edge.end,
      ]);

      let blocked = false;
      for (let i = 0; i < path.length - 1; i += 1) {
        if (
          obstacles.some(
            (o) => !edge.ignore.has(o.id) && orthoSegmentHitsRect(path[i], path[i + 1], o.rect),
          )
        ) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        routed.set(edge.conn.id, path);
      }
    }
  }

  return routed;
}

/**
 * Route all bound orthogonal connectors cleanly around obstacle nodes with distributed ports,
 * multi-lane separation, and collision-free label placement.
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @param {{ direction?: 'LR' | 'TB' }} [options]
 * @returns {import('../types/schema.js').BoardElement[]}
 */
export function routeConnectorsCleanly(elements, options = {}) {
  const direction = options.direction || 'LR';
  const cloned = elements.map((el) => structuredClone(el));
  const nodeById = new Map(
    cloned.filter((e) => isConnectableElement(e)).map((e) => [e.id, e]),
  );

  const connectors = cloned.filter(
    (e) => e.type === 'connector' && e.startBinding && e.endBinding,
  );
  if (connectors.length === 0) return cloned;

  distributeConnectorPorts(connectors, nodeById, direction);

  const obstacles = cloned
    .filter((e) => isConnectableElement(e) && !CONTAINER_TYPES.has(e.type))
    .map((e) => ({ id: e.id, rect: getNormalizedRect(e) }));

  // Fast-path clean corridor channel routing (Left-Edge algorithm) before A* fallback
  const corridorRouted = routeClearCorridorChannels(connectors, nodeById, obstacles);

  // Route shorter local connections first so inner lanes stay crisp and long skip-edges take outer highways
  const sortedConnectors = [...connectors].sort((c1, c2) => {
    const s1 = c1.startBinding ? nodeById.get(c1.startBinding.elementId) : null;
    const d1 = c1.endBinding ? nodeById.get(c1.endBinding.elementId) : null;
    const s2 = c2.startBinding ? nodeById.get(c2.startBinding.elementId) : null;
    const d2 = c2.endBinding ? nodeById.get(c2.endBinding.elementId) : null;
    const dist1 = s1 && d1 ? Math.hypot(s1.x - d1.x, s1.y - d1.y) : 0;
    const dist2 = s2 && d2 ? Math.hypot(s2.x - d2.x, s2.y - d2.y) : 0;
    return dist1 - dist2;
  });

  /** @type {Array<{ a: Pt, b: Pt }>} */
  const usedSegments = [];
  /** @type {Array<{ connector: import('../types/schema.js').BoardElement, path: Pt[] }>} */
  const routedList = [];

  for (const conn of sortedConnectors) {
    const src = conn.startBinding ? nodeById.get(conn.startBinding.elementId) : null;
    const dst = conn.endBinding ? nodeById.get(conn.endBinding.elementId) : null;
    if (!src || !dst || !conn.startBinding || !conn.endBinding) continue;

    const start = resolveBindingPoint(src, conn.startBinding);
    const end = resolveBindingPoint(dst, conn.endBinding);

    if (conn.routing === 'straight') {
      conn.x = start.x;
      conn.y = start.y;
      conn.width = end.x - start.x;
      conn.height = end.y - start.y;
      conn.waypoints = undefined;
      routedList.push({ connector: conn, path: [start, end] });
      continue;
    }

    const fastPath = corridorRouted.get(conn.id);
    const fullPath =
      fastPath ||
      routeObstacleAvoidingOrtho(
        start,
        end,
        conn.startBinding.side,
        conn.endBinding.side,
        obstacles,
        new Set([src.id, dst.id]),
        usedSegments,
      );

    routedList.push({ connector: conn, path: fullPath });
    for (let i = 0; i < fullPath.length - 1; i += 1) {
      usedSegments.push({ a: fullPath[i], b: fullPath[i + 1] });
    }
  }

  nudgeParallelSegments(routedList, obstacles);

  for (const { connector, path } of routedList) {
    if (connector.routing === 'straight') continue;
    const clean = simplifyOrthoPath(path);
    const first = clean[0];
    const last = clean[clean.length - 1];
    connector.x = first.x;
    connector.y = first.y;
    connector.width = last.x - first.x;
    connector.height = last.y - first.y;
    const interior = clean.slice(1, -1);
    connector.waypoints = interior.length > 0 ? interior : undefined;
  }

  placeConnectorLabelsCleanly(routedList, obstacles);

  return cloned;
}

/**
 * Full automatic diagram layout:
 * 1. Semantic 3-Zone DFD layout OR Sugiyama layered non-overlapping node placement
 * 2. Smart port distribution
 * 3. Multi-lane obstacle-avoiding orthogonal routing
 * 4. Parallel segment separation
 * 5. Collision-free connector label placement
 *
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @param {{ direction?: 'LR' | 'TB', kind?: string, skipNodeLayout?: boolean }} [options]
 * @returns {import('../types/schema.js').BoardElement[]}
 */
export function layoutDiagramElements(elements, options = {}) {
  if (elements.length === 0) return [];

  const direction = options.direction || 'LR';
  const cloned = elements.map((el) => structuredClone(el));

  if (!options.skipNodeLayout) {
    const layoutNodes = cloned.filter(
      (e) => isConnectableElement(e) && !CONTAINER_TYPES.has(e.type) && !e.locked,
    );
    const boundConnectors = cloned.filter(
      (e) => e.type === 'connector' && e.startBinding && e.endBinding,
    );

    assignSugiyamaPositions(layoutNodes, boundConnectors, { direction, kind: options.kind });

    const boundaries = cloned.filter((e) => e.type === 'uml_boundary');
    const useCases = cloned.filter((e) => e.type === 'uml_usecase');
    if (boundaries.length === 1 && useCases.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const u of useCases) {
        if (u.x < minX) minX = u.x;
        if (u.y < minY) minY = u.y;
        if (u.x + u.width > maxX) maxX = u.x + u.width;
        if (u.y + u.height > maxY) maxY = u.y + u.height;
      }
      boundaries[0].x = Math.round(minX - 44);
      boundaries[0].y = Math.round(minY - 56);
      boundaries[0].width = Math.round(maxX - minX + 88);
      boundaries[0].height = Math.round(maxY - minY + 96);
    }
  }

  return routeConnectorsCleanly(cloned, { direction });
}
