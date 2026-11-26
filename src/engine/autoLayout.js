import {
  getNormalizedRect,
  getPortNormal,
  isConnectableElement,
  projectPointToElementAnchor,
  resolveBindingPoint,
} from './ports.js';

const CONTAINER_TYPES = new Set(['frame', 'uml_boundary', 'uml_fragment', 'bpmn_pool']);

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
 * Extract numeric process ordering key (e.g. "1.0", "2.1", "3.0") if present in `code` or `text`.
 * @param {import('../types/schema.js').BoardElement} el
 * @returns {number | null}
 */
function parseProcessOrderNumber(el) {
  const src = `${el.code || ''} ${el.text || ''}`.trim();
  const match = src.match(/^(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = match[2] ? Number(match[2]) / 100 : 0;
  return Number.isFinite(major) ? major + minor : null;
}

/**
 * Count exact bipartite crossings between an ordered side column (`sideNodes`)
 * and an ordered center column (`centerNodes`) given edges connecting them.
 * @param {string[]} sideOrder
 * @param {Map<string, number>} centerRank
 * @param {Array<{ sideId: string, centerId: string }>} pairs
 * @returns {{ crossings: number, span: number }}
 */
function evaluateBipartiteOrder(sideOrder, centerRank, pairs) {
  const sideRank = new Map(sideOrder.map((id, idx) => [id, idx]));
  /** @type {Array<{ s: number, c: number }>} */
  const edges = [];
  let span = 0;
  for (const p of pairs) {
    const s = sideRank.get(p.sideId);
    const c = centerRank.get(p.centerId);
    if (s === undefined || c === undefined) continue;
    edges.push({ s, c });
    span += Math.abs(s - c);
  }
  let crossings = 0;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const ds = edges[i].s - edges[j].s;
      const dc = edges[i].c - edges[j].c;
      if (ds * dc < 0) crossings += 1;
    }
  }
  return { crossings, span };
}

/**
 * Reorder a side column (`entities` or `stores`) by barycenter + 2-opt crossing minimization
 * relative to the fixed center process spine so corridor wires have minimal crossings.
 * @param {import('../types/schema.js').BoardElement[]} sideNodes
 * @param {Map<string, number>} centerRank
 * @param {Array<{ sideId: string, centerId: string }>} pairs
 * @returns {import('../types/schema.js').BoardElement[]}
 */
function sortSideColumnForMinCrossings(sideNodes, centerRank, pairs) {
  if (sideNodes.length <= 1) return sideNodes;
  const byId = new Map(sideNodes.map((n) => [n.id, n]));
  const declIdx = new Map(sideNodes.map((n, idx) => [n.id, idx]));

  // Initial barycenter sort (average connected process rank)
  const barycenter = new Map();
  for (const n of sideNodes) {
    const ranks = pairs
      .filter((p) => p.sideId === n.id)
      .map((p) => centerRank.get(p.centerId))
      .filter(/** @type {(v: number | undefined) => v is number} */ ((v) => v !== undefined));
    const avg =
      ranks.length > 0
        ? ranks.reduce((acc, r) => acc + r, 0) / ranks.length
        : (declIdx.get(n.id) || 0);
    barycenter.set(n.id, avg);
  }

  let order = [...sideNodes]
    .sort((a, b) => {
      const diff = (barycenter.get(a.id) || 0) - (barycenter.get(b.id) || 0);
      if (Math.abs(diff) > 0.01) return diff;
      return (declIdx.get(a.id) || 0) - (declIdx.get(b.id) || 0);
    })
    .map((n) => n.id);

  // Hill-climbing swap + re-insertion search until no further crossing reduction is possible
  let best = evaluateBipartiteOrder(order, centerRank, pairs);
  let improved = true;
  let guard = 0;
  while (improved && guard < 20) {
    improved = false;
    guard += 1;
    for (let i = 0; i < order.length; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        const swapped = order.slice();
        const tmp = swapped[i];
        swapped[i] = swapped[j];
        swapped[j] = tmp;
        const evalSwap = evaluateBipartiteOrder(swapped, centerRank, pairs);
        if (
          evalSwap.crossings < best.crossings ||
          (evalSwap.crossings === best.crossings && evalSwap.span < best.span)
        ) {
          order = swapped;
          best = evalSwap;
          improved = true;
        }
      }
    }
  }

  return order
    .map((id) => byId.get(id))
    .filter(/** @type {(v: import('../types/schema.js').BoardElement | undefined) => v is import('../types/schema.js').BoardElement} */ ((v) => Boolean(v)));
}

/**
 * Semantic 3-Column Corridor DFD Layout:
 * - Column 1 (Left): External Entities (sorted by barycenter + 2-opt crossing minimization)
 * - Left Corridor (wide multi-lane highway): Entity <-> Process flows
 * - Column 2 (Center): Processes (ordered by process number 1.0..N or topological flow)
 * - Right Corridor (wide multi-lane highway): Process <-> Data Store flows
 * - Column 3 (Right): Data Stores (sorted by barycenter + 2-opt crossing minimization)
 *
 * Completely separates Entity<->Process flows from Process<->DataStore flows so the
 * two corridors NEVER cross each other, matching textbook DFD Level 1 layouts.
 *
 * @param {import('../types/schema.js').BoardElement[]} nodes
 * @param {import('../types/schema.js').BoardElement[]} connectors
 */
function assignSemanticDfdPositions(nodes, connectors) {
  const rawEntities = nodes.filter((n) => n.type === 'dfd_gs_entity' || n.type === 'dfd_yd_entity');
  const rawProcesses = nodes.filter(
    (n) => n.type === 'dfd_gs_process' || n.type === 'dfd_yd_process',
  );
  const rawStores = nodes.filter(
    (n) => n.type === 'dfd_gs_datastore' || n.type === 'dfd_yd_datastore',
  );
  const others = nodes.filter(
    (n) => !rawEntities.includes(n) && !rawProcesses.includes(n) && !rawStores.includes(n),
  );

  // Order center processes by explicit process number (1.0, 2.0, ...) when available
  const procDeclIdx = new Map(rawProcesses.map((p, idx) => [p.id, idx]));
  const orderedProcesses = [...rawProcesses].sort((a, b) => {
    const na = parseProcessOrderNumber(a);
    const nb = parseProcessOrderNumber(b);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return (procDeclIdx.get(a.id) || 0) - (procDeclIdx.get(b.id) || 0);
  });

  const centerNodes = [...orderedProcesses, ...others];
  const entityIds = new Set(rawEntities.map((e) => e.id));
  const storeIds = new Set(rawStores.map((s) => s.id));
  const centerIds = new Set(centerNodes.map((p) => p.id));
  const centerRank = new Map(centerNodes.map((p, idx) => [p.id, idx]));

  // Count corridor density, per-node side degree, and bipartite pairs for crossing-free column ordering
  let leftCorridorFlows = 0;
  let rightCorridorFlows = 0;
  /** @type {Map<string, number>} */
  const leftDeg = new Map();
  /** @type {Map<string, number>} */
  const rightDeg = new Map();
  /** @type {Array<{ sideId: string, centerId: string }>} */
  const entityPairs = [];
  /** @type {Array<{ sideId: string, centerId: string }>} */
  const storePairs = [];

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
      entityPairs.push({ sideId: ent, centerId: prc });
    } else if ((centerIds.has(s) && storeIds.has(t)) || (storeIds.has(s) && centerIds.has(t))) {
      rightCorridorFlows += 1;
      const prc = centerIds.has(s) ? s : t;
      const st = storeIds.has(s) ? s : t;
      rightDeg.set(prc, (rightDeg.get(prc) || 0) + 1);
      leftDeg.set(st, (leftDeg.get(st) || 0) + 1);
      storePairs.push({ sideId: st, centerId: prc });
    }
  }

  const entities = sortSideColumnForMinCrossings(rawEntities, centerRank, entityPairs);
  const stores = sortSideColumnForMinCrossings(rawStores, centerRank, storePairs);

  // Scale node height for high-degree nodes so parallel corridor wires & labels have ample vertical space
  for (const node of [...entities, ...centerNodes, ...stores]) {
    const maxSide = Math.max(leftDeg.get(node.id) || 0, rightDeg.get(node.id) || 0);
    if (maxSide >= 4) {
      const neededH = Math.min(240, maxSide * 28 + 26);
      if (node.height < neededH) {
        node.height = neededH;
        // Keep Yourdon-DeMarco processes strict 1:1 circles (bubbles) per textbook rules
        if (node.type === 'dfd_yd_process') {
          node.width = neededH;
        }
      }
    } else if (node.type === 'dfd_yd_process' && node.width !== node.height) {
      const side = Math.max(node.width, node.height);
      node.width = side;
      node.height = side;
    }
  }

  const procGap = centerNodes.length >= 6 ? 124 : 96;
  const col1X = 80;
  const maxEntityW = entities.reduce((m, e) => Math.max(m, e.width), 164);
  const maxProcW = centerNodes.reduce((m, p) => Math.max(m, p.width), 184);

  const leftCorridor =
    entities.length > 0 ? Math.max(420, Math.min(640, 340 + leftCorridorFlows * 12)) : 0;
  const rightCorridor =
    stores.length > 0 ? Math.max(420, Math.min(640, 340 + rightCorridorFlows * 12)) : 0;
  const col2X = entities.length > 0 ? col1X + maxEntityW + leftCorridor : 120;
  const col3X = col2X + maxProcW + rightCorridor;

  const topY = 80;

  // Stack center processes cleanly in logical order
  let procCursorY = topY;
  /** @type {Map<string, number>} */
  const centerYMap = new Map();
  for (const proc of centerNodes) {
    proc.x = Math.round(col2X + (maxProcW - proc.width) / 2);
    proc.y = Math.round(procCursorY);
    centerYMap.set(proc.id, proc.y + proc.height / 2);
    procCursorY += proc.height + procGap;
  }
  const totalHeight = Math.max(320, procCursorY - topY - procGap);

  /**
   * Align each node in a side column close to the vertical barycenter of its connected processes,
   * while enforcing clean non-overlapping vertical spacing.
   * @param {import('../types/schema.js').BoardElement[]} list
   * @param {number} x
   * @param {Array<{ sideId: string, centerId: string }>} pairs
   */
  function placeAlignedSideColumn(list, x, pairs) {
    if (list.length === 0) return;
    if (list.length === 1) {
      const targetYs = pairs
        .filter((p) => p.sideId === list[0].id)
        .map((p) => centerYMap.get(p.centerId))
        .filter(/** @type {(v: number | undefined) => v is number} */ ((v) => v !== undefined));
      const idealCenterY =
        targetYs.length > 0
          ? targetYs.reduce((a, b) => a + b, 0) / targetYs.length
          : topY + totalHeight / 2;
      list[0].x = Math.round(x);
      list[0].y = Math.round(Math.max(topY, idealCenterY - list[0].height / 2));
      return;
    }

    const minGap = 68;
    const ideals = list.map((item, idx) => {
      const targetYs = pairs
        .filter((p) => p.sideId === item.id)
        .map((p) => centerYMap.get(p.centerId))
        .filter(/** @type {(v: number | undefined) => v is number} */ ((v) => v !== undefined));
      if (targetYs.length > 0) {
        const avg = targetYs.reduce((a, b) => a + b, 0) / targetYs.length;
        return Math.max(topY, Math.min(topY + totalHeight - item.height, avg - item.height / 2));
      }
      return topY + (idx / Math.max(1, list.length - 1)) * Math.max(0, totalHeight - item.height);
    });

    // Forward pass: push down overlapping items to enforce minGap
    const ys = ideals.slice();
    for (let i = 1; i < list.length; i += 1) {
      const minY = ys[i - 1] + list[i - 1].height + minGap;
      if (ys[i] < minY) ys[i] = minY;
    }
    // Backward pull-up if bottom overflowed totalHeight + 80
    const bottomLimit = topY + totalHeight;
    const lastBottom = ys[list.length - 1] + list[list.length - 1].height;
    if (lastBottom > bottomLimit + 40) {
      ys[list.length - 1] = bottomLimit - list[list.length - 1].height;
      for (let i = list.length - 2; i >= 0; i -= 1) {
        const maxY = ys[i + 1] - minGap - list[i].height;
        if (ys[i] > maxY) ys[i] = maxY;
      }
      if (ys[0] < topY) {
        const shift = topY - ys[0];
        for (let i = 0; i < ys.length; i += 1) ys[i] += shift;
      }
    }

    for (let i = 0; i < list.length; i += 1) {
      list[i].x = Math.round(x);
      list[i].y = Math.round(ys[i]);
    }
  }

  placeAlignedSideColumn(entities, col1X, entityPairs);
  placeAlignedSideColumn(stores, col3X, storePairs);
}

/**
 * Hub-Anchored 2D Directional Grid Layout for report-ready diagrams whose PlantUML source
 * specifies explicit multi-axis spatial directions (`-up->`, `-down->`, `-left->`, `-right->`).
 * Anchors the highest-degree central hub (e.g. Data Transaksi) at (0,0) and places surrounding
 * processes, entities, and data stores cleanly on a balanced 2D report grid to minimize crossings.
 *
 * @param {import('../types/schema.js').BoardElement[]} nodes
 * @param {import('../types/schema.js').BoardElement[]} connectors
 * @param {Map<string, 'up' | 'down' | 'left' | 'right'>} dirHints
 */
function assignDirectionalGridPositions(nodes, connectors, dirHints) {
  if (nodes.length === 0) return;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const nodeOrder = new Map(nodes.map((n, idx) => [n.id, idx]));

  /** @type {Map<string, Array<{ neighbor: string, dx: number, dy: number, hasHint: boolean }>>} */
  const adj = new Map(nodes.map((n) => [n.id, []]));
  /** @type {Map<string, number>} */
  const degree = new Map(nodes.map((n) => [n.id, 0]));

  const dirToVec = {
    right: { dx: 1, dy: 0 },
    left: { dx: -1, dy: 0 },
    down: { dx: 0, dy: 1 },
    up: { dx: 0, dy: -1 },
  };

  for (const c of connectors) {
    const s = c.startBinding?.elementId;
    const t = c.endBinding?.elementId;
    if (!s || !t || s === t || !nodeIds.has(s) || !nodeIds.has(t)) continue;
    degree.set(s, (degree.get(s) || 0) + 1);
    degree.set(t, (degree.get(t) || 0) + 1);
    const hint = dirHints.get(c.id);
    if (hint) {
      const v = dirToVec[hint];
      adj.get(s)?.push({ neighbor: t, dx: v.dx, dy: v.dy, hasHint: true });
      adj.get(t)?.push({ neighbor: s, dx: -v.dx, dy: -v.dy, hasHint: true });
    } else {
      adj.get(s)?.push({ neighbor: t, dx: 1, dy: 0, hasHint: false });
      adj.get(t)?.push({ neighbor: s, dx: -1, dy: 0, hasHint: false });
    }
  }

  // Anchor highest-degree central hub at (0, 0) so all connected processes radiate around it
  let hubId = nodes[0].id;
  let maxDeg = -1;
  for (const n of nodes) {
    const d = degree.get(n.id) || 0;
    if (d > maxDeg) {
      maxDeg = d;
      hubId = n.id;
    }
  }

  /** @type {Map<string, { gx: number, gy: number }>} */
  const placed = new Map();
  /** @type {Set<string>} */
  const occupied = new Set();
  const cellKey = (gx, gy) => `${gx},${gy}`;

  placed.set(hubId, { gx: 0, gy: 0 });
  occupied.add(cellKey(0, 0));

  /**
   * Pick the nearest free integer grid cell to ideal floating coordinate (tx, ty),
   * preferring direct neighbor cells and compact horizontal span [-1, +1].
   * @param {number} tx
   * @param {number} ty
   * @param {boolean} preferDown
   */
  function findFreeCell(tx, ty, preferDown) {
    const baseGx = Math.round(tx);
    const baseGy = Math.round(ty);
    let best = { gx: baseGx, gy: baseGy };
    let bestCost = Infinity;

    for (let rad = 0; rad <= 5; rad += 1) {
      for (let dy = -rad; dy <= rad; dy += 1) {
        for (let dx = rad; dx >= -rad; dx -= 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
          const gx = baseGx + dx;
          const gy = baseGy + dy;
          if (occupied.has(cellKey(gx, gy))) continue;
          if (preferDown && gy < baseGy) continue;
          const dist = Math.hypot(gx - tx, gy - ty);
          const widePen = Math.abs(gx) > 1 ? Math.abs(gx) * 0.45 : 0;
          // Prefer left-to-right reading flow (positive dx) on exact distance ties
          const flowBias = dx > 0 ? -0.02 : 0;
          const cost = dist + widePen + flowBias;
          if (cost < bestCost) {
            bestCost = cost;
            best = { gx, gy };
          }
        }
      }
      if (bestCost < Infinity) return best;
    }
    return best;
  }

  const isProcessNode = (id) => {
    const n = nodes.find((item) => item.id === id);
    return Boolean(n && (n.type === 'dfd_yd_process' || n.type === 'dfd_gs_process'));
  };

  // Iteratively place the most constrained unplaced neighbor of already-placed nodes
  while (placed.size < nodes.length) {
    /** @type {Array<{ id: string, placedNeighbors: number, hintedNeighbors: number, isProc: number, order: number }>} */
    const frontier = [];
    for (const n of nodes) {
      if (placed.has(n.id)) continue;
      const edges = adj.get(n.id) || [];
      let pCount = 0;
      let hCount = 0;
      /** @type {Set<string>} */
      const seenNeighbors = new Set();
      for (const e of edges) {
        if (placed.has(e.neighbor) && !seenNeighbors.has(e.neighbor)) {
          seenNeighbors.add(e.neighbor);
          pCount += 1;
          if (e.hasHint) hCount += 1;
        }
      }
      if (pCount > 0) {
        frontier.push({
          id: n.id,
          placedNeighbors: pCount,
          hintedNeighbors: hCount,
          isProc: isProcessNode(n.id) ? 1 : 0,
          order: nodeOrder.get(n.id) || 0,
        });
      }
    }

    if (frontier.length === 0) {
      // Disconnected node: place at next available row
      const unplaced = nodes.find((n) => !placed.has(n.id));
      if (!unplaced) break;
      const cell = findFreeCell(0, 2, false);
      placed.set(unplaced.id, cell);
      occupied.add(cellKey(cell.gx, cell.gy));
      continue;
    }

    // Prioritize multi-constrained nodes first, then core Processes around the hub before outer Entities/Stores
    frontier.sort((a, b) => {
      if (b.hintedNeighbors !== a.hintedNeighbors) return b.hintedNeighbors - a.hintedNeighbors;
      if (b.placedNeighbors !== a.placedNeighbors) return b.placedNeighbors - a.placedNeighbors;
      if (b.isProc !== a.isProc) return b.isProc - a.isProc;
      return a.order - b.order;
    });

    const nextId = frontier[0].id;
    const edges = adj.get(nextId) || [];
    let sumX = 0;
    let sumY = 0;
    let weightSum = 0;
    let preferDown = false;

    for (const e of edges) {
      const pPos = placed.get(e.neighbor);
      if (!pPos) continue;
      // From placed neighbor -> nextId, desired vector is (-e.dx, -e.dy)
      const w = e.hasHint ? 2 : 0.5;
      sumX += (pPos.gx - e.dx) * w;
      sumY += (pPos.gy - e.dy) * w;
      weightSum += w;
      if (e.hasHint && -e.dy > 0) preferDown = true;
    }

    const tx = weightSum > 0 ? sumX / weightSum : 0;
    const ty = weightSum > 0 ? sumY / weightSum : 0;
    const cell = findFreeCell(tx, ty, preferDown);
    placed.set(nextId, cell);
    occupied.add(cellKey(cell.gx, cell.gy));
  }

  // Row-centering polish: if top or bottom row is shifted +1/-1 relative to core columns [-1..1], align it cleanly
  /** @type {Map<number, string[]>} */
  const byRow = new Map();
  for (const [id, pos] of placed.entries()) {
    if (!byRow.has(pos.gy)) byRow.set(pos.gy, []);
    byRow.get(pos.gy)?.push(id);
  }
  const allGxs = Array.from(placed.values()).map((p) => p.gx);
  const coreMinX = Math.min(...allGxs);
  const coreMaxX = Math.max(...allGxs);
  if (coreMaxX - coreMinX >= 3) {
    for (const ids of byRow.values()) {
      const rxs = ids.map((id) => placed.get(id)?.gx || 0);
      const rMin = Math.min(...rxs);
      const rMax = Math.max(...rxs);
      if (rMax === coreMaxX && rMin > coreMinX) {
        const canShiftLeft = ids.every((id) => {
          const p = placed.get(id);
          if (!p) return false;
          const targetKey = cellKey(p.gx - 1, p.gy);
          return !occupied.has(targetKey) || ids.some((oid) => {
            const op = placed.get(oid);
            return op && op.gx === p.gx - 1 && op.gy === p.gy;
          });
        });
        if (canShiftLeft) {
          for (const id of ids) {
            const p = placed.get(id);
            if (p) occupied.delete(cellKey(p.gx, p.gy));
          }
          for (const id of ids) {
            const p = placed.get(id);
            if (p) {
              p.gx -= 1;
              occupied.add(cellKey(p.gx, p.gy));
            }
          }
        }
      }
    }
  }

  // Normalize grid coordinates to start at (0, 0) and convert to balanced pixel coordinates
  let minGx = Infinity;
  let maxGx = -Infinity;
  let minGy = Infinity;
  let maxGy = -Infinity;
  for (const p of placed.values()) {
    if (p.gx < minGx) minGx = p.gx;
    if (p.gx > maxGx) maxGx = p.gx;
    if (p.gy < minGy) minGy = p.gy;
    if (p.gy > maxGy) maxGy = p.gy;
  }

  const numCols = maxGx - minGx + 1;
  const numRows = maxGy - minGy + 1;
  const colWidths = Array.from({ length: numCols }, () => 136);
  const rowHeights = Array.from({ length: numRows }, () => 76);

  for (const n of nodes) {
    const p = placed.get(n.id);
    if (!p) continue;
    const c = p.gx - minGx;
    const r = p.gy - minGy;
    colWidths[c] = Math.max(colWidths[c], n.width);
    rowHeights[r] = Math.max(rowHeights[r], n.height);
  }

  const colGap = 205;
  const rowGap = 128;
  const originX = 110;
  const originY = 110;

  /** @type {number[]} */
  const colLefts = [];
  let cx = originX;
  for (let c = 0; c < numCols; c += 1) {
    colLefts.push(cx);
    cx += colWidths[c] + colGap;
  }

  /** @type {number[]} */
  const rowTops = [];
  let cy = originY;
  for (let r = 0; r < numRows; r += 1) {
    rowTops.push(cy);
    cy += rowHeights[r] + rowGap;
  }

  for (const n of nodes) {
    const p = placed.get(n.id);
    if (!p) continue;
    const c = p.gx - minGx;
    const r = p.gy - minGy;
    n.x = Math.round(colLefts[c] + (colWidths[c] - n.width) / 2);
    n.y = Math.round(rowTops[r] + (rowHeights[r] - n.height) / 2);
  }
}

/**
 * Stage 1: Sugiyama Layered Node Layout (Cycle removal, Longest-Path ranks,
 * Barycenter crossing minimization, and non-overlapping coordinate assignment).
 * @param {import('../types/schema.js').BoardElement[]} nodes
 * @param {import('../types/schema.js').BoardElement[]} connectors
 * @param {{ direction?: 'LR' | 'TB', kind?: string, dirHints?: Map<string, 'up' | 'down' | 'left' | 'right'> }} opts
 */
function assignSugiyamaPositions(nodes, connectors, opts) {
  if (nodes.length === 0) return;

  // Use Hub-Anchored 2D Directional Grid whenever explicit multi-axis spatial hints exist
  if (opts.dirHints && opts.dirHints.size >= 4 && nodes.length >= 4) {
    assignDirectionalGridPositions(nodes, connectors, opts.dirHints);
    return;
  }

  // Use dedicated semantic 3-zone DFD layout whenever diagram is DFD without 2D hints
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
 * Choose natural exit/entry sides for a bound connector based on relative node centers
 * and optional explicit PlantUML directional hints (`up`, `down`, `left`, `right`).
 * @param {import('../types/schema.js').BoardElement} src
 * @param {import('../types/schema.js').BoardElement} dst
 * @param {'LR' | 'TB'} direction
 * @param {'up' | 'down' | 'left' | 'right'} [dirHint]
 * @param {boolean} [is2DGrid]
 * @returns {{ startSide: import('../types/schema.js').PortSide, endSide: import('../types/schema.js').PortSide }}
 */
function pickOptimalSides(src, dst, direction, dirHint, is2DGrid = false) {
  const sCx = src.x + src.width / 2;
  const sCy = src.y + src.height / 2;
  const dCx = dst.x + dst.width / 2;
  const dCy = dst.y + dst.height / 2;
  const dx = dCx - sCx;
  const dy = dCy - sCy;

  // Same vertical column (e.g., inter-process P2 -> P3 or P2 -> DT): always connect vertically
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

  // In 2D Directional Grid mode, honor diagonal L-bend and outer-perimeter hints cleanly
  if (is2DGrid && dirHint) {
    if (dirHint === 'up') {
      if (dy < -40) {
        // Long upward jump across multiple columns (e.g. P3 -> Pelanggan): route over top cleanly
        if (Math.abs(dx) > 420) return { startSide: 'top', endSide: 'top' };
        return { startSide: 'top', endSide: 'bottom' };
      }
    }
    if (dirHint === 'down') {
      if (dy > 40) {
        if (Math.abs(dx) > 260) return { startSide: 'bottom', endSide: 'bottom' };
        return { startSide: 'bottom', endSide: 'top' };
      }
    }
    if (dirHint === 'left' && dx < -40) {
      return { startSide: 'left', endSide: dy >= 0 ? 'top' : 'bottom' };
    }
    if (dirHint === 'right' && dx > 40) {
      return { startSide: 'right', endSide: dy >= 0 ? 'top' : 'bottom' };
    }
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
 * @param {Map<string, 'up' | 'down' | 'left' | 'right'>} [dirHints]
 */
function distributeConnectorPorts(connectors, nodeById, direction, dirHints) {
  const is2DGrid = Boolean(dirHints && dirHints.size >= 4);
  /**
   * @typedef {{
   *   connector: import('../types/schema.js').BoardElement,
   *   which: 'start' | 'end',
   *   side: import('../types/schema.js').PortSide,
   *   sortKey: number,
   *   secondaryKey: number
   * }} PortSlot
   */
  /** @type {Map<string, PortSlot[]>} */
  const groups = new Map();

  for (const c of connectors) {
    const src = c.startBinding ? nodeById.get(c.startBinding.elementId) : null;
    const dst = c.endBinding ? nodeById.get(c.endBinding.elementId) : null;
    if (!src || !dst) continue;

    const { startSide, endSide } = pickOptimalSides(
      src,
      dst,
      direction,
      dirHints?.get(c.id),
      is2DGrid,
    );
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

    /**
     * Compute secondary nested-L-bend tie-breaker so multiple wires fanning out of a single side
     * toward targets in the same column/row nest cleanly without crossing each other.
     * @param {import('../types/schema.js').PortSide} side
     * @param {number} ox
     * @param {number} oy
     * @param {number} tx
     * @param {number} ty
     */
    const computeSecondary = (side, ox, oy, tx, ty) => {
      if (side === 'bottom') return tx < ox ? ty : -ty;
      if (side === 'top') return tx < ox ? -ty : ty;
      if (side === 'right') return ty < oy ? -tx : tx;
      return ty < oy ? tx : -tx;
    };

    groups.get(startKey)?.push({
      connector: c,
      which: 'start',
      side: startSide,
      sortKey: startSide === 'left' || startSide === 'right' ? dCy : dCx,
      secondaryKey: computeSecondary(startSide, sCx, sCy, dCx, dCy),
    });
    groups.get(endKey)?.push({
      connector: c,
      which: 'end',
      side: endSide,
      sortKey: endSide === 'left' || endSide === 'right' ? sCy : sCx,
      secondaryKey: computeSecondary(endSide, dCx, dCy, sCx, sCy),
    });
  }

  const ELLIPSE_PORT_TYPES = new Set([
    'ellipse',
    'uml_usecase',
    'dfd_yd_process',
    'erd_chen_attribute',
    'erd_chen_key_attr',
    'erd_chen_multi_attr',
    'erd_chen_derived_attr',
  ]);

  for (const [groupKey, slots] of groups.entries()) {
    // Sort by primary target axis, then nested-L-bend secondary axis (eliminates fan-out crossings!),
    // then deterministic connector.id tie-break for bidirectional pairs.
    slots.sort((a, b) => {
      if (Math.abs(a.sortKey - b.sortKey) > 36) return a.sortKey - b.sortKey;
      if (Math.abs(a.secondaryKey - b.secondaryKey) > 1) return a.secondaryKey - b.secondaryKey;
      if (Math.abs(a.sortKey - b.sortKey) > 1) return a.sortKey - b.sortKey;
      return a.connector.id.localeCompare(b.connector.id);
    });
    const nodeId = groupKey.slice(0, groupKey.lastIndexOf(':'));
    const ownerNode = nodeById.get(nodeId);
    const isOval = Boolean(ownerNode && ELLIPSE_PORT_TYPES.has(ownerNode.type));
    const n = slots.length;

    slots.forEach((slot, idx) => {
      const margin = isOval ? 0.18 : 0.14;
      const t = n === 1 ? 0.5 : margin + (idx / (n - 1)) * (1 - margin * 2);
      let rx = slot.side === 'left' ? 0 : slot.side === 'right' ? 1 : t;
      let ry = slot.side === 'top' ? 0 : slot.side === 'bottom' ? 1 : t;

      // Project onto exact ellipse perimeter so arrows touch the curved oval edge with zero gap
      if (isOval) {
        if (slot.side === 'left' || slot.side === 'right') {
          const dyNorm = (ry - 0.5) * 2;
          const dxHalf = 0.5 * Math.sqrt(Math.max(0, 1 - dyNorm * dyNorm));
          rx = slot.side === 'left' ? 0.5 - dxHalf : 0.5 + dxHalf;
        } else {
          const dxNorm = (rx - 0.5) * 2;
          const dyHalf = 0.5 * Math.sqrt(Math.max(0, 1 - dxNorm * dxNorm));
          ry = slot.side === 'top' ? 0.5 - dyHalf : 0.5 + dyHalf;
        }
      }

      const binding = slot.which === 'start' ? slot.connector.startBinding : slot.connector.endBinding;
      if (binding) {
        binding.rx = Math.round(rx * 1000) / 1000;
        binding.ry = Math.round(ry * 1000) / 1000;
      }
    });
  }

  // Align facing parallel pairs horizontally/vertically when both nodes have different heights/widths
  // (e.g. 60px Entity <-> 132px Process) so adjacent links are razor-straight with ZERO 10px stair-steps!
  for (const c of connectors) {
    if (!c.startBinding || !c.endBinding) continue;
    const src = nodeById.get(c.startBinding.elementId);
    const dst = nodeById.get(c.endBinding.elementId);
    if (!src || !dst) continue;
    const sSide = c.startBinding.side;
    const eSide = c.endBinding.side;
    const sCount = groups.get(`${src.id}:${sSide}`)?.length || 1;
    const eCount = groups.get(`${dst.id}:${eSide}`)?.length || 1;

    if (
      ((sSide === 'right' && eSide === 'left') || (sSide === 'left' && eSide === 'right')) &&
      sCount === eCount &&
      sCount <= 2
    ) {
      const pS = resolveBindingPoint(src, c.startBinding);
      const pE = resolveBindingPoint(dst, c.endBinding);
      const targetY = src.height <= dst.height ? pS.y : pE.y;
      const clampedS = Math.max(0.14, Math.min(0.86, (targetY - src.y) / Math.max(1, src.height)));
      const clampedE = Math.max(0.14, Math.min(0.86, (targetY - dst.y) / Math.max(1, dst.height)));
      if (Math.abs((src.y + clampedS * src.height) - (dst.y + clampedE * dst.height)) < 2) {
        c.startBinding.ry = Math.round(clampedS * 1000) / 1000;
        c.endBinding.ry = Math.round(clampedE * 1000) / 1000;
        if (ELLIPSE_PORT_TYPES.has(src.type)) {
          const d = (c.startBinding.ry - 0.5) * 2;
          const h = 0.5 * Math.sqrt(Math.max(0, 1 - d * d));
          c.startBinding.rx = Math.round((sSide === 'left' ? 0.5 - h : 0.5 + h) * 1000) / 1000;
        }
        if (ELLIPSE_PORT_TYPES.has(dst.type)) {
          const d = (c.endBinding.ry - 0.5) * 2;
          const h = 0.5 * Math.sqrt(Math.max(0, 1 - d * d));
          c.endBinding.rx = Math.round((eSide === 'left' ? 0.5 - h : 0.5 + h) * 1000) / 1000;
        }
      }
    } else if (
      ((sSide === 'bottom' && eSide === 'top') || (sSide === 'top' && eSide === 'bottom')) &&
      sCount === eCount &&
      sCount <= 2
    ) {
      const pS = resolveBindingPoint(src, c.startBinding);
      const pE = resolveBindingPoint(dst, c.endBinding);
      const targetX = src.width <= dst.width ? pS.x : pE.x;
      const clampedS = Math.max(0.14, Math.min(0.86, (targetX - src.x) / Math.max(1, src.width)));
      const clampedE = Math.max(0.14, Math.min(0.86, (targetX - dst.x) / Math.max(1, dst.width)));
      if (Math.abs(src.x + clampedS * src.width - (dst.x + clampedE * dst.width)) < 2) {
        c.startBinding.rx = Math.round(clampedS * 1000) / 1000;
        c.endBinding.rx = Math.round(clampedE * 1000) / 1000;
        if (ELLIPSE_PORT_TYPES.has(src.type)) {
          const d = (c.startBinding.rx - 0.5) * 2;
          const h = 0.5 * Math.sqrt(Math.max(0, 1 - d * d));
          c.startBinding.ry = Math.round((sSide === 'top' ? 0.5 - h : 0.5 + h) * 1000) / 1000;
        }
        if (ELLIPSE_PORT_TYPES.has(dst.type)) {
          const d = (c.endBinding.rx - 0.5) * 2;
          const h = 0.5 * Math.sqrt(Math.max(0, 1 - d * d));
          c.endBinding.ry = Math.round((eSide === 'top' ? 0.5 - h : 0.5 + h) * 1000) / 1000;
        }
      }
    }
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
 * Compute an outward stub point strictly outside an endpoint node's full bounding rectangle
 * (crucial for circles/ovals whose off-center perimeter points are inset inside the bounding box).
 * @param {Pt} pt
 * @param {import('../types/schema.js').PortSide} side
 * @param {Rect | null} rect
 * @param {number} stubDist
 * @returns {Pt}
 */
function computeClearStub(pt, side, rect, stubDist) {
  if (!rect) {
    const n = getPortNormal(side);
    return { x: pt.x + n.x * stubDist, y: pt.y + n.y * stubDist };
  }
  switch (side) {
    case 'top':
      return { x: pt.x, y: rect.y - stubDist };
    case 'bottom':
      return { x: pt.x, y: rect.y + rect.height + stubDist };
    case 'left':
      return { x: rect.x - stubDist, y: pt.y };
    case 'right':
      return { x: rect.x + rect.width + stubDist, y: pt.y };
    default:
      return pt;
  }
}

/**
 * Stage 3: Multi-Track Visibility-Grid A* Router with Obstacle Avoidance & Strong Congestion Cost.
 * Keeps BOTH source and target nodes as solid forbidden obstacles so wires NEVER cut through
 * their own endpoints (e.g. never poking from inside a circle or rectangle to its outer border).
 * @param {Pt} start
 * @param {Pt} end
 * @param {import('../types/schema.js').PortSide} startSide
 * @param {import('../types/schema.js').PortSide} endSide
 * @param {Array<{ id: string, rect: Rect }>} obstacles
 * @param {Set<string>} endpointIds
 * @param {Array<{ a: Pt, b: Pt }>} usedSegments
 * @param {Rect | null} [srcRect]
 * @param {Rect | null} [dstRect]
 * @returns {Pt[]}
 */
function routeObstacleAvoidingOrtho(
  start,
  end,
  startSide,
  endSide,
  obstacles,
  endpointIds,
  usedSegments,
  srcRect = null,
  dstRect = null,
) {
  const stubDist = 28;
  const pad = 22;
  const endpointPad = 4;
  const sStub = computeClearStub(start, startSide, srcRect, stubDist);
  const eStub = computeClearStub(end, endSide, dstRect, stubDist);

  // Include ALL nodes as solid obstacles (tight 4px pad on src/dst, generous 22px pad on all others)
  const activeObstacles = obstacles.map((o) => {
    const p = endpointIds.has(o.id) ? endpointPad : pad;
    return {
      x: o.rect.x - p,
      y: o.rect.y - p,
      width: o.rect.width + p * 2,
      height: o.rect.height + p * 2,
    };
  });

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
          penalty += 480;
        }
      } else if (!horiz && segHoriz) {
        const sy = seg.a.y;
        const sxMin = Math.min(seg.a.x, seg.b.x);
        const sxMax = Math.max(seg.a.x, seg.b.x);
        if (sy > Math.min(a.y, b.y) + 2 && sy < Math.max(a.y, b.y) - 2 && a.x > sxMin + 2 && a.x < sxMax - 2) {
          penalty += 480;
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
 * Skips connectors already cleanly lane-assigned by the Left-Edge Corridor Router.
 * @param {Array<{ connector: import('../types/schema.js').BoardElement, path: Pt[] }>} routedList
 * @param {Array<{ id: string, rect: Rect }>} obstacles
 * @param {Set<string>} [skipIds]
 */
function nudgeParallelSegments(routedList, obstacles, skipIds = new Set()) {
  const gap = 18;
  /** @type {Array<{ idx: number, segIdx: number, axis: 'x' | 'y', coord: number, min: number, max: number }>} */
  const interiorSegs = [];

  routedList.forEach((item, idx) => {
    if (skipIds.has(item.connector.id)) return;
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

      const prevPt = pts[entry.segIdx - 1];
      const nextPt = pts[entry.segIdx + 2];
      // Never nudge any interior segment (or its adjacent arm) inside ANY node, including src & dst!
      const blocked = obstacles.some((o) => {
        const padded = {
          x: o.rect.x - 4,
          y: o.rect.y - 4,
          width: o.rect.width + 8,
          height: o.rect.height + 8,
        };
        if (orthoSegmentHitsRect(candA, candB, padded)) return true;
        if (prevPt && entry.segIdx > 1 && orthoSegmentHitsRect(prevPt, candA, padded)) return true;
        if (nextPt && entry.segIdx + 2 < pts.length - 1 && orthoSegmentHitsRect(candB, nextPt, padded)) {
          return true;
        }
        return false;
      });
      if (!blocked) {
        pts[entry.segIdx] = candA;
        pts[entry.segIdx + 1] = candB;
      }
    });
  }
}

/**
 * Estimate wrapped connector label pill dimensions (matching canvasRenderer wrap width 158px).
 * @param {string} text
 * @returns {{ width: number, height: number }}
 */
function estimateLabelSize(text) {
  const clean = text.trim();
  const maxCharsPerLine = 25;
  const estLines = Math.max(1, Math.min(3, Math.ceil(clean.length / maxCharsPerLine)));
  const longest = Math.min(maxCharsPerLine, clean.length);
  return {
    width: Math.max(44, longest * 6.0 + 14),
    height: estLines * 14.2 + 8,
  };
}

/**
 * Stage 5: Non-overlapping, wire-crossing-aware label placement along clear horizontal/vertical arms.
 * @param {Array<{ connector: import('../types/schema.js').BoardElement, path: Pt[] }>} routedList
 * @param {Array<{ id: string, rect: Rect }>} obstacles
 */
function placeConnectorLabelsCleanly(routedList, obstacles) {
  /** @type {Rect[]} */
  const occupiedLabels = [];
  const nodeBoxes = obstacles.map((o) => o.rect);

  /** @type {Array<{ ownerIdx: number, a: Pt, b: Pt }>} */
  const allWireSegs = [];
  routedList.forEach(({ path }, ownerIdx) => {
    for (let i = 0; i < path.length - 1; i += 1) {
      allWireSegs.push({ ownerIdx, a: path[i], b: path[i + 1] });
    }
  });

  // Process connectors with shorter horizontal arms first so tighter wires claim clear pockets first
  const order = routedList
    .map((entry, idx) => {
      let maxHoriz = 0;
      for (let i = 0; i < entry.path.length - 1; i += 1) {
        const a = entry.path[i];
        const b = entry.path[i + 1];
        if (Math.abs(a.y - b.y) < 1) {
          maxHoriz = Math.max(maxHoriz, Math.abs(b.x - a.x));
        }
      }
      return { entry, idx, maxHoriz };
    })
    .sort((a, b) => a.maxHoriz - b.maxHoriz);

  for (const { entry, idx: ownerIdx } of order) {
    const { connector, path } = entry;
    if (!connector.text || !connector.text.trim() || path.length < 2) {
      connector.labelPos = null;
      continue;
    }

    const size = estimateLabelSize(connector.text);

    // Collect all meaningful segments, prioritizing clear horizontal arms (both left & right of vertical bus)
    /** @type {Array<{ a: Pt, b: Pt, len: number, isHoriz: boolean, score: number }>} */
    const segs = [];
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i];
      const b = path[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 24) continue;
      const isHoriz = Math.abs(a.y - b.y) < 1;
      segs.push({ a, b, len, isHoriz, score: len * (isHoriz ? 1.6 : 0.85) });
    }
    if (segs.length === 0) {
      segs.push({
        a: path[0],
        b: path[path.length - 1],
        len: Math.hypot(path[path.length - 1].x - path[0].x, path[path.length - 1].y - path[0].y),
        isHoriz: true,
        score: 1,
      });
    }
    segs.sort((s1, s2) => s2.score - s1.score);

    /** @type {Array<{ x: number, y: number, basePenalty: number }>} */
    const candidates = [];
    const ratios = [0.5, 0.34, 0.66, 0.2, 0.8, 0.12, 0.88];

    for (const seg of segs.slice(0, 4)) {
      const vertPen = seg.isHoriz ? 0 : 75;
      for (const t of ratios) {
        const px = seg.a.x + (seg.b.x - seg.a.x) * t;
        const py = seg.a.y + (seg.b.y - seg.a.y) * t;
        // Slight preference for centered-on-wire placement
        const offCenterPen = Math.abs(t - 0.5) * 18;
        candidates.push({ x: px, y: py, basePenalty: vertPen + offCenterPen });
        if (seg.isHoriz) {
          candidates.push({
            x: px,
            y: py - (size.height * 0.58 + 4),
            basePenalty: vertPen + offCenterPen + 28,
          });
          candidates.push({
            x: px,
            y: py + (size.height * 0.58 + 4),
            basePenalty: vertPen + offCenterPen + 28,
          });
          candidates.push({
            x: px,
            y: py - (size.height * 1.12 + 6),
            basePenalty: vertPen + offCenterPen + 56,
          });
          candidates.push({
            x: px,
            y: py + (size.height * 1.12 + 6),
            basePenalty: vertPen + offCenterPen + 56,
          });
        } else {
          candidates.push({
            x: px - (size.width * 0.45 + 6),
            y: py,
            basePenalty: vertPen + offCenterPen + 30,
          });
          candidates.push({
            x: px + (size.width * 0.45 + 6),
            y: py,
            basePenalty: vertPen + offCenterPen + 30,
          });
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
      const paddedWireRect = {
        x: rect.x - 3,
        y: rect.y - 3,
        width: rect.width + 6,
        height: rect.height + 6,
      };
      let score = cand.basePenalty;
      for (const nb of nodeBoxes) {
        if (rectsOverlap(rect, nb, 6)) score += 3000;
      }
      for (const lb of occupiedLabels) {
        if (rectsOverlap(rect, lb, 5)) score += 1500;
      }
      for (const seg of allWireSegs) {
        if (seg.ownerIdx === ownerIdx) continue;
        if (orthoSegmentHitsRect(seg.a, seg.b, paddedWireRect)) score += 320;
      }
      if (score < bestScore) {
        bestScore = score;
        chosen = cand;
        if (score < 12) break;
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
    const midX = (corrMinX + corrMaxX) / 2;

    // Trim corridor margins against protruding neighbor nodes in the left/right columns.
    // Only reject if an obstacle truly sits IN THE MIDDLE of the corridor (e.g. skip-column edge).
    let clearMinX = corrMinX + 20;
    let clearMaxX = corrMaxX - 20;
    let blockedMiddle = false;

    for (const o of obstacles) {
      if (ignore.has(o.id)) continue;
      if (o.rect.y + o.rect.height < yMin - 10 || o.rect.y > yMax + 10) continue;
      const oRight = o.rect.x + o.rect.width;
      if (oRight <= corrMinX + 2 || o.rect.x >= corrMaxX - 2) continue;

      if (oRight < midX - 24) {
        clearMinX = Math.max(clearMinX, oRight + 18);
      } else if (o.rect.x > midX + 24) {
        clearMaxX = Math.min(clearMaxX, o.rect.x - 18);
      } else {
        blockedMiddle = true;
        break;
      }
    }
    if (blockedMiddle || clearMaxX - clearMinX < 48) continue;

    if (Math.abs(start.y - end.y) < 0.8) {
      routed.set(conn.id, simplifyOrthoPath([start, end]));
      continue;
    }

    const bucketKey = Math.round(((clearMinX + clearMaxX) / 2) / 160);
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)?.push({
      conn,
      start,
      end,
      corrMinX: clearMinX,
      corrMaxX: clearMaxX,
      yMin,
      yMax,
      ignore,
    });
  }

  for (const list of buckets.values()) {
    if (list.length === 0) continue;
    const safeMinX = Math.max(...list.map((e) => e.corrMinX)) + 14;
    const safeMaxX = Math.min(...list.map((e) => e.corrMaxX)) - 14;
    const availW = safeMaxX - safeMinX;
    if (availW < 24) continue;

    // Left-Edge interval coloring: pack non-overlapping vertical spans into minimal distinct lanes
    const sorted = [...list].sort((a, b) => {
      if (Math.abs(a.yMin - b.yMin) > 2) return a.yMin - b.yMin;
      return (a.yMax - a.yMin) - (b.yMax - b.yMin);
    });

    /** @type {Array<Array<{ yMin: number, yMax: number }>>} */
    const lanes = [];
    /** @type {Array<{ edge: CorridorEdge, laneIdx: number }>} */
    const assignments = [];
    /** @type {Array<{ leftY: number, rightY: number, laneIdx: number }>} */
    const placedArms = [];

    for (const edge of sorted) {
      const padMin = edge.yMin - 8;
      const padMax = edge.yMax + 8;
      const leftY = edge.start.x < edge.end.x ? edge.start.y : edge.end.y;
      const rightY = edge.start.x < edge.end.x ? edge.end.y : edge.start.y;

      let chosenLane = -1;
      let bestConflictScore = Infinity;

      for (let l = 0; l < lanes.length; l += 1) {
        const vertConflict = lanes[l].some(
          (iv) => Math.min(iv.yMax, padMax) - Math.max(iv.yMin, padMin) > 0,
        );
        if (vertConflict) continue;

        // Avoid placing a left arm at the same Y to the right of an existing right arm (or vice versa)
        let armConflict = 0;
        for (const p of placedArms) {
          if (Math.abs(leftY - p.rightY) < 8 && l >= p.laneIdx) armConflict += 1;
          if (Math.abs(rightY - p.leftY) < 8 && l <= p.laneIdx) armConflict += 1;
        }
        if (armConflict < bestConflictScore) {
          bestConflictScore = armConflict;
          chosenLane = l;
          if (armConflict === 0) break;
        }
      }

      if (chosenLane === -1 || bestConflictScore > 0) {
        // Prefer a fresh conflict-free lane when all existing lanes collide on a horizontal arm
        const newLane = lanes.length;
        let newArmConflict = 0;
        for (const p of placedArms) {
          if (Math.abs(leftY - p.rightY) < 8 && newLane >= p.laneIdx) newArmConflict += 1;
        }
        if (chosenLane === -1 || newArmConflict < bestConflictScore) {
          chosenLane = newLane;
          lanes.push([]);
        }
      }

      lanes[chosenLane].push({ yMin: padMin, yMax: padMax });
      assignments.push({ edge, laneIdx: chosenLane });
      placedArms.push({ leftY, rightY, laneIdx: chosenLane });
    }

    // Order vertical bus lanes along X using 2-opt crossing minimization so nested descending/ascending
    // bundles take strictly crossing-free PCB-style tracks (upper descending edge takes farther-right lane, etc.)
    const totalLanes = lanes.length;
    const lanePerm = Array.from({ length: totalLanes }, (_, i) => i);

    if (totalLanes > 1) {
      const edgeMeta = assignments.map(({ edge, laneIdx }) => {
        const leftY = edge.start.x < edge.end.x ? edge.start.y : edge.end.y;
        const rightY = edge.start.x < edge.end.x ? edge.end.y : edge.start.y;
        return {
          laneIdx,
          leftY,
          rightY,
          yLo: Math.min(leftY, rightY),
          yHi: Math.max(leftY, rightY),
        };
      });

      /** @param {number[]} perm */
      const countLaneCrossings = (perm) => {
        const rankOf = new Array(totalLanes);
        for (let pos = 0; pos < perm.length; pos += 1) {
          rankOf[perm[pos]] = pos;
        }
        let cross = 0;
        for (let i = 0; i < edgeMeta.length; i += 1) {
          const a = edgeMeta[i];
          const rA = rankOf[a.laneIdx];
          for (let j = i + 1; j < edgeMeta.length; j += 1) {
            const b = edgeMeta[j];
            const rB = rankOf[b.laneIdx];
            if (rA === rB) continue;
            const leftEdge = rA < rB ? a : b;
            const rightEdge = rA < rB ? b : a;
            // Left lane's right-arm crosses right lane's vertical riser?
            if (leftEdge.rightY > rightEdge.yLo + 1 && leftEdge.rightY < rightEdge.yHi - 1) {
              cross += 1;
            }
            // Right lane's left-arm crosses left lane's vertical riser?
            if (rightEdge.leftY > leftEdge.yLo + 1 && rightEdge.leftY < leftEdge.yHi - 1) {
              cross += 1;
            }
          }
        }
        return cross;
      };

      let bestCross = countLaneCrossings(lanePerm);
      let improved = true;
      let passes = 0;
      while (improved && passes < 16 && bestCross > 0) {
        improved = false;
        passes += 1;
        for (let i = 0; i < lanePerm.length; i += 1) {
          for (let j = i + 1; j < lanePerm.length; j += 1) {
            const tmp = lanePerm[i];
            lanePerm[i] = lanePerm[j];
            lanePerm[j] = tmp;
            const c = countLaneCrossings(lanePerm);
            if (c < bestCross) {
              bestCross = c;
              improved = true;
            } else {
              lanePerm[j] = lanePerm[i];
              lanePerm[i] = tmp;
            }
          }
        }
      }
    }

    const laneSlotPos = new Array(totalLanes);
    for (let pos = 0; pos < lanePerm.length; pos += 1) {
      laneSlotPos[lanePerm[pos]] = pos;
    }

    // Pack vertical risers into a compact central Manhattan bus (14-18px pitch),
    // leaving two wide vertical-wire-FREE label runways on the left and right sides of the bus!
    const centerBusX = (safeMinX + safeMaxX) / 2;
    const maxBusW = Math.min(availW * 0.42, Math.max(availW - 220, availW * 0.28));
    const lanePitch =
      totalLanes <= 1 ? 0 : Math.min(18, Math.max(12, maxBusW / Math.max(1, totalLanes - 1)));
    const busStartX = centerBusX - ((totalLanes - 1) * lanePitch) / 2;

    for (const { edge, laneIdx } of assignments) {
      const orderedPos = laneSlotPos[laneIdx] ?? laneIdx;
      const laneX = Math.round((busStartX + orderedPos * lanePitch) * 10) / 10;
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
 * @param {{ direction?: 'LR' | 'TB', dirHints?: Map<string, 'up' | 'down' | 'left' | 'right'> }} [options]
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

  distributeConnectorPorts(connectors, nodeById, direction, options.dirHints);

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
        getNormalizedRect(src),
        getNormalizedRect(dst),
      );

    routedList.push({ connector: conn, path: fullPath });
    for (let i = 0; i < fullPath.length - 1; i += 1) {
      usedSegments.push({ a: fullPath[i], b: fullPath[i + 1] });
    }
  }

  nudgeParallelSegments(routedList, obstacles, new Set(corridorRouted.keys()));

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
 * @param {{
 *   direction?: 'LR' | 'TB',
 *   kind?: string,
 *   skipNodeLayout?: boolean,
 *   dirHints?: Map<string, 'up' | 'down' | 'left' | 'right'>
 * }} [options]
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

    assignSugiyamaPositions(layoutNodes, boundConnectors, {
      direction,
      kind: options.kind,
      dirHints: options.dirHints,
    });

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

  return routeConnectorsCleanly(cloned, { direction, dirHints: options.dirHints });
}

const INTERACTIVE_ELLIPSE_TYPES = new Set([
  'ellipse',
  'uml_usecase',
  'dfd_yd_process',
  'erd_chen_attribute',
  'erd_chen_key_attr',
  'erd_chen_multi_attr',
  'erd_chen_derived_attr',
]);

/**
 * Symmetric side picker for live interactive node dragging/resizing.
 * Always selects the pair of faces with the cleanest separation between src and dst.
 * @param {import('../types/schema.js').BoardElement} src
 * @param {import('../types/schema.js').BoardElement} dst
 * @returns {{ startSide: import('../types/schema.js').PortSide, endSide: import('../types/schema.js').PortSide }}
 */
function pickInteractiveSides(src, dst) {
  const rS = getNormalizedRect(src);
  const rD = getNormalizedRect(dst);
  const sCx = rS.x + rS.width / 2;
  const sCy = rS.y + rS.height / 2;
  const dCx = rD.x + rD.width / 2;
  const dCy = rD.y + rD.height / 2;
  const dx = dCx - sCx;
  const dy = dCy - sCy;

  const horizGap = dx >= 0 ? rD.x - (rS.x + rS.width) : rS.x - (rD.x + rD.width);
  const vertGap = dy >= 0 ? rD.y - (rS.y + rS.height) : rS.y - (rD.y + rD.height);

  if (horizGap >= vertGap) {
    return dx >= 0
      ? { startSide: 'right', endSide: 'left' }
      : { startSide: 'left', endSide: 'right' };
  }
  return dy >= 0
    ? { startSide: 'bottom', endSide: 'top' }
    : { startSide: 'top', endSide: 'bottom' };
}

/**
 * Project a normalized (rx, ry) coordinate on a cardinal side onto exact ellipse perimeter if needed.
 * @param {import('../types/schema.js').BoardElement} node
 * @param {import('../types/schema.js').PortSide} side
 * @param {number} t Position along side in [0, 1]
 * @returns {{ rx: number, ry: number }}
 */
function computeSideAnchorNormalized(node, side, t) {
  let rx = side === 'left' ? 0 : side === 'right' ? 1 : t;
  let ry = side === 'top' ? 0 : side === 'bottom' ? 1 : t;

  if (INTERACTIVE_ELLIPSE_TYPES.has(node.type)) {
    if (side === 'left' || side === 'right') {
      const dyNorm = (ry - 0.5) * 2;
      const dxHalf = 0.5 * Math.sqrt(Math.max(0, 1 - dyNorm * dyNorm));
      rx = side === 'left' ? 0.5 - dxHalf : 0.5 + dxHalf;
    } else {
      const dxNorm = (rx - 0.5) * 2;
      const dyHalf = 0.5 * Math.sqrt(Math.max(0, 1 - dxNorm * dxNorm));
      ry = side === 'top' ? 0.5 - dyHalf : 0.5 + dyHalf;
    }
  }

  return {
    rx: Math.round(rx * 1000) / 1000,
    ry: Math.round(ry * 1000) / 1000,
  };
}

/**
 * Automatically adjust connector anchor sides, port distribution, waypoints, and label positions
 * whenever one or more bound components are moved, resized, rotated, or nudged.
 *
 * - Untouched connectors remain completely preserved.
 * - Connectors whose BOTH endpoints moved together can be skipped via `skipConnectorIds`.
 * - In `fast: true` mode (during 60fps pointer drag), updates anchor sides/ports immediately and
 *   clears stale waypoints so `computeConnectorPath` draws crisp live orthogonal/straight/curved lines.
 * - In `fast: false` mode (on pointerup, arrow nudge, resize commit), runs obstacle-avoiding
 *   corridor/A* routing, parallel lane separation, and collision-free label placement.
 *
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @param {Set<string>} affectedNodeIds
 * @param {{ fast?: boolean, skipConnectorIds?: Set<string> }} [options]
 * @returns {import('../types/schema.js').BoardElement[]}
 */
export function rerouteAffectedConnectors(elements, affectedNodeIds, options = {}) {
  if (!affectedNodeIds || affectedNodeIds.size === 0) return elements;
  const fast = Boolean(options.fast);
  const skipConnectorIds = options.skipConnectorIds || new Set();

  /** @type {Set<string>} */
  const affectedConnectorIds = new Set();
  for (const el of elements) {
    if (el.type !== 'connector' || el.locked || skipConnectorIds.has(el.id)) continue;
    const sHit = Boolean(el.startBinding && affectedNodeIds.has(el.startBinding.elementId));
    const eHit = Boolean(el.endBinding && affectedNodeIds.has(el.endBinding.elementId));
    if (sHit || eHit) {
      affectedConnectorIds.add(el.id);
    }
  }

  if (affectedConnectorIds.size === 0) return elements;

  const nextElements = elements.map((el) =>
    affectedConnectorIds.has(el.id) ? structuredClone(el) : el,
  );
  const nodeById = new Map(
    nextElements.filter((e) => isConnectableElement(e)).map((e) => [e.id, e]),
  );
  const affectedConnectors = nextElements.filter((e) => affectedConnectorIds.has(e.id));

  // Count how many connectors link each unordered node pair so parallel straight lines stay separated
  /** @type {Map<string, number>} */
  const pairCounts = new Map();
  for (const el of nextElements) {
    if (el.type !== 'connector' || !el.startBinding || !el.endBinding) continue;
    const a = el.startBinding.elementId;
    const b = el.endBinding.elementId;
    const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`;
    pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
  }

  /**
   * @typedef {{
   *   connector: import('../types/schema.js').BoardElement,
   *   which: 'start' | 'end',
   *   side: import('../types/schema.js').PortSide,
   *   sortKey: number,
   *   isAffected: boolean
   * }} InteractiveSlot
   */
  /** @type {Map<string, InteractiveSlot[]>} */
  const sideGroups = new Map();
  /** @type {Set<string>} */
  const touchedGroupKeys = new Set();

  // 1. Recompute optimal sides for every affected connector
  for (const conn of affectedConnectors) {
    const src = conn.startBinding ? nodeById.get(conn.startBinding.elementId) : null;
    const dst = conn.endBinding ? nodeById.get(conn.endBinding.elementId) : null;

    // Single-bound connector (one endpoint bound to moved shape, other endpoint free-floating)
    if (src && !dst && conn.startBinding) {
      const freeEnd = { x: conn.x + conn.width, y: conn.y + conn.height };
      const anchor = projectPointToElementAnchor(freeEnd, src, { threshold: 100000, centerSnapPx: 6 });
      if (anchor) {
        conn.startBinding = {
          elementId: src.id,
          side: anchor.side,
          rx: anchor.rx,
          ry: anchor.ry,
        };
        conn.x = anchor.point.x;
        conn.y = anchor.point.y;
        conn.width = freeEnd.x - anchor.point.x;
        conn.height = freeEnd.y - anchor.point.y;
        conn.waypoints = undefined;
        conn.labelPos = null;
      }
      continue;
    }

    if (!src && dst && conn.endBinding) {
      const freeStart = { x: conn.x, y: conn.y };
      const anchor = projectPointToElementAnchor(freeStart, dst, { threshold: 100000, centerSnapPx: 6 });
      if (anchor) {
        conn.endBinding = {
          elementId: dst.id,
          side: anchor.side,
          rx: anchor.rx,
          ry: anchor.ry,
        };
        conn.width = anchor.point.x - freeStart.x;
        conn.height = anchor.point.y - freeStart.y;
        conn.waypoints = undefined;
        conn.labelPos = null;
      }
      continue;
    }

    if (!src || !dst || !conn.startBinding || !conn.endBinding) continue;

    const rS = getNormalizedRect(src);
    const rD = getNormalizedRect(dst);
    const sCenter = { x: rS.x + rS.width / 2, y: rS.y + rS.height / 2 };
    const dCenter = { x: rD.x + rD.width / 2, y: rD.y + rD.height / 2 };
    const pairKey = src.id < dst.id ? `${src.id}|${dst.id}` : `${dst.id}|${src.id}`;
    const isSingleStraight =
      conn.routing === 'straight' && (pairCounts.get(pairKey) || 1) === 1;

    if (isSingleStraight) {
      const sAnchor = projectPointToElementAnchor(dCenter, src, { threshold: 100000, centerSnapPx: 4 });
      const eAnchor = projectPointToElementAnchor(sCenter, dst, { threshold: 100000, centerSnapPx: 4 });
      if (sAnchor && eAnchor) {
        conn.startBinding = {
          elementId: src.id,
          side: sAnchor.side,
          rx: sAnchor.rx,
          ry: sAnchor.ry,
        };
        conn.endBinding = {
          elementId: dst.id,
          side: eAnchor.side,
          rx: eAnchor.rx,
          ry: eAnchor.ry,
        };
        conn.x = sAnchor.point.x;
        conn.y = sAnchor.point.y;
        conn.width = eAnchor.point.x - sAnchor.point.x;
        conn.height = eAnchor.point.y - sAnchor.point.y;
        conn.waypoints = undefined;
        conn.labelPos = null;
        continue;
      }
    }

    const { startSide, endSide } = pickInteractiveSides(src, dst);
    conn.startBinding = { elementId: src.id, side: startSide, rx: 0.5, ry: 0.5 };
    conn.endBinding = { elementId: dst.id, side: endSide, rx: 0.5, ry: 0.5 };

    const sKey = `${src.id}:${startSide}`;
    const eKey = `${dst.id}:${endSide}`;
    touchedGroupKeys.add(sKey);
    touchedGroupKeys.add(eKey);

    if (!sideGroups.has(sKey)) sideGroups.set(sKey, []);
    if (!sideGroups.has(eKey)) sideGroups.set(eKey, []);

    sideGroups.get(sKey)?.push({
      connector: conn,
      which: 'start',
      side: startSide,
      sortKey: startSide === 'left' || startSide === 'right' ? dCenter.y : dCenter.x,
      isAffected: true,
    });
    sideGroups.get(eKey)?.push({
      connector: conn,
      which: 'end',
      side: endSide,
      sortKey: endSide === 'left' || endSide === 'right' ? sCenter.y : sCenter.x,
      isAffected: true,
    });
  }

  // Register untouched connectors that already occupy any touched (nodeId, side)
  // so newly moved connectors share space cleanly without stacking onto existing ports
  for (const el of nextElements) {
    if (el.type !== 'connector' || affectedConnectorIds.has(el.id)) continue;
    if (el.startBinding) {
      const sKey = `${el.startBinding.elementId}:${el.startBinding.side}`;
      if (touchedGroupKeys.has(sKey)) {
        const dst = el.endBinding ? nodeById.get(el.endBinding.elementId) : null;
        const dPt = dst
          ? { x: dst.x + dst.width / 2, y: dst.y + dst.height / 2 }
          : { x: el.x + el.width, y: el.y + el.height };
        sideGroups.get(sKey)?.push({
          connector: el,
          which: 'start',
          side: el.startBinding.side,
          sortKey: el.startBinding.side === 'left' || el.startBinding.side === 'right' ? dPt.y : dPt.x,
          isAffected: false,
        });
      }
    }
    if (el.endBinding) {
      const eKey = `${el.endBinding.elementId}:${el.endBinding.side}`;
      if (touchedGroupKeys.has(eKey)) {
        const src = el.startBinding ? nodeById.get(el.startBinding.elementId) : null;
        const sPt = src
          ? { x: src.x + src.width / 2, y: src.y + src.height / 2 }
          : { x: el.x, y: el.y };
        sideGroups.get(eKey)?.push({
          connector: el,
          which: 'end',
          side: el.endBinding.side,
          sortKey: el.endBinding.side === 'left' || el.endBinding.side === 'right' ? sPt.y : sPt.x,
          isAffected: false,
        });
      }
    }
  }

  // 2. Distribute port positions cleanly along every touched (nodeId, side)
  for (const [groupKey, slots] of sideGroups.entries()) {
    const nodeId = groupKey.slice(0, groupKey.lastIndexOf(':'));
    const ownerNode = nodeById.get(nodeId);
    if (!ownerNode) continue;

    slots.sort((a, b) => {
      if (Math.abs(a.sortKey - b.sortKey) > 1) return a.sortKey - b.sortKey;
      return a.connector.id.localeCompare(b.connector.id);
    });

    const isOval = INTERACTIVE_ELLIPSE_TYPES.has(ownerNode.type);
    const n = slots.length;
    const margin = n === 2 ? 0.26 : isOval ? 0.18 : 0.14;

    slots.forEach((slot, idx) => {
      if (!slot.isAffected) return;
      const t = n === 1 ? 0.5 : margin + (idx / (n - 1)) * (1 - margin * 2);
      const { rx, ry } = computeSideAnchorNormalized(ownerNode, slot.side, t);
      const binding = slot.which === 'start' ? slot.connector.startBinding : slot.connector.endBinding;
      if (binding) {
        binding.rx = rx;
        binding.ry = ry;
      }
    });
  }

  // Align facing parallel pairs horizontally/vertically when nodes have different heights/widths
  // so opposite links between two nodes stay razor-straight with zero unnecessary bends
  for (const conn of affectedConnectors) {
    if (!conn.startBinding || !conn.endBinding) continue;
    const src = nodeById.get(conn.startBinding.elementId);
    const dst = nodeById.get(conn.endBinding.elementId);
    if (!src || !dst) continue;
    const sSide = conn.startBinding.side;
    const eSide = conn.endBinding.side;
    const sCount = sideGroups.get(`${src.id}:${sSide}`)?.length || 1;
    const eCount = sideGroups.get(`${dst.id}:${eSide}`)?.length || 1;

    if (
      ((sSide === 'right' && eSide === 'left') || (sSide === 'left' && eSide === 'right')) &&
      sCount === eCount &&
      sCount <= 2
    ) {
      const pS = resolveBindingPoint(src, conn.startBinding);
      const pE = resolveBindingPoint(dst, conn.endBinding);
      const rS = getNormalizedRect(src);
      const rD = getNormalizedRect(dst);
      const targetY = rS.height <= rD.height ? pS.y : pE.y;
      const clampedS = Math.max(0.14, Math.min(0.86, (targetY - rS.y) / Math.max(1, rS.height)));
      const clampedE = Math.max(0.14, Math.min(0.86, (targetY - rD.y) / Math.max(1, rD.height)));
      if (Math.abs(rS.y + clampedS * rS.height - (rD.y + clampedE * rD.height)) < 2) {
        const sNorm = computeSideAnchorNormalized(src, sSide, clampedS);
        const eNorm = computeSideAnchorNormalized(dst, eSide, clampedE);
        conn.startBinding.rx = sNorm.rx;
        conn.startBinding.ry = sNorm.ry;
        conn.endBinding.rx = eNorm.rx;
        conn.endBinding.ry = eNorm.ry;
      }
    } else if (
      ((sSide === 'bottom' && eSide === 'top') || (sSide === 'top' && eSide === 'bottom')) &&
      sCount === eCount &&
      sCount <= 2
    ) {
      const pS = resolveBindingPoint(src, conn.startBinding);
      const pE = resolveBindingPoint(dst, conn.endBinding);
      const rS = getNormalizedRect(src);
      const rD = getNormalizedRect(dst);
      const targetX = rS.width <= rD.width ? pS.x : pE.x;
      const clampedS = Math.max(0.14, Math.min(0.86, (targetX - rS.x) / Math.max(1, rS.width)));
      const clampedE = Math.max(0.14, Math.min(0.86, (targetX - rD.x) / Math.max(1, rD.width)));
      if (Math.abs(rS.x + clampedS * rS.width - (rD.x + clampedE * rD.width)) < 2) {
        const sNorm = computeSideAnchorNormalized(src, sSide, clampedS);
        const eNorm = computeSideAnchorNormalized(dst, eSide, clampedE);
        conn.startBinding.rx = sNorm.rx;
        conn.startBinding.ry = sNorm.ry;
        conn.endBinding.rx = eNorm.rx;
        conn.endBinding.ry = eNorm.ry;
      }
    }
  }

  // 3A. Fast live preview during 60fps pointer drag: clear stale waypoints & update endpoints
  if (fast) {
    for (const conn of affectedConnectors) {
      if (!conn.startBinding || !conn.endBinding) continue;
      const src = nodeById.get(conn.startBinding.elementId);
      const dst = nodeById.get(conn.endBinding.elementId);
      if (!src || !dst) continue;
      const start = resolveBindingPoint(src, conn.startBinding);
      const end = resolveBindingPoint(dst, conn.endBinding);
      conn.x = start.x;
      conn.y = start.y;
      conn.width = end.x - start.x;
      conn.height = end.y - start.y;
      conn.waypoints = undefined;
      conn.labelPos = null;
    }
    return nextElements;
  }

  // 3B. Full obstacle-avoiding orthogonal routing + label placement on drag/resize/nudge commit
  const obstacles = nextElements
    .filter((e) => isConnectableElement(e) && !CONTAINER_TYPES.has(e.type))
    .map((e) => ({ id: e.id, rect: getNormalizedRect(e) }));

  // Seed usedSegments with untouched connectors so newly routed wires avoid overlapping them
  /** @type {Array<{ a: Pt, b: Pt }>} */
  const usedSegments = [];
  for (const el of nextElements) {
    if (el.type !== 'connector' || affectedConnectorIds.has(el.id)) continue;
    const pts = [
      { x: el.x, y: el.y },
      ...(el.waypoints || []),
      { x: el.x + el.width, y: el.y + el.height },
    ];
    for (let i = 0; i < pts.length - 1; i += 1) {
      usedSegments.push({ a: pts[i], b: pts[i + 1] });
    }
  }

  const twoBoundAffected = affectedConnectors.filter((c) => c.startBinding && c.endBinding);
  const corridorRouted = routeClearCorridorChannels(twoBoundAffected, nodeById, obstacles);

  /** @type {Array<{ connector: import('../types/schema.js').BoardElement, path: Pt[] }>} */
  const routedList = [];

  for (const conn of twoBoundAffected) {
    const src = conn.startBinding ? nodeById.get(conn.startBinding.elementId) : null;
    const dst = conn.endBinding ? nodeById.get(conn.endBinding.elementId) : null;
    if (!src || !dst || !conn.startBinding || !conn.endBinding) continue;

    const start = resolveBindingPoint(src, conn.startBinding);
    const end = resolveBindingPoint(dst, conn.endBinding);

    if (conn.routing === 'straight' || conn.routing === 'curved') {
      conn.x = start.x;
      conn.y = start.y;
      conn.width = end.x - start.x;
      conn.height = end.y - start.y;
      conn.waypoints = undefined;
      conn.labelPos = null;
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
        getNormalizedRect(src),
        getNormalizedRect(dst),
      );

    routedList.push({ connector: conn, path: fullPath });
    for (let i = 0; i < fullPath.length - 1; i += 1) {
      usedSegments.push({ a: fullPath[i], b: fullPath[i + 1] });
    }
  }

  nudgeParallelSegments(routedList, obstacles, new Set(corridorRouted.keys()));

  for (const { connector, path } of routedList) {
    if (connector.routing === 'straight' || connector.routing === 'curved') continue;
    const clean = simplifyOrthoPath(path);
    const first = clean[0];
    const last = clean[clean.length - 1];
    connector.x = first.x;
    connector.y = first.y;
    connector.width = last.x - first.x;
    connector.height = last.y - first.y;
    const interior = clean.slice(1, -1);
    connector.waypoints = interior.length > 0 ? interior : undefined;
    connector.labelPos = null;
  }

  placeConnectorLabelsCleanly(routedList, obstacles);

  return nextElements;
}

/**
 * Detect strict interior crossing between two line segments.
 * @param {Pt} a1
 * @param {Pt} a2
 * @param {Pt} b1
 * @param {Pt} b2
 * @returns {boolean}
 */
function segmentsStrictlyCross(a1, a2, b1, b2) {
  if (
    Math.max(a1.x, a2.x) <= Math.min(b1.x, b2.x) + 1 ||
    Math.min(a1.x, a2.x) >= Math.max(b1.x, b2.x) - 1 ||
    Math.max(a1.y, a2.y) <= Math.min(b1.y, b2.y) + 1 ||
    Math.min(a1.y, a2.y) >= Math.max(b1.y, b2.y) - 1
  ) {
    return false;
  }
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-4) return false;
  const rx = b1.x - a1.x;
  const ry = b1.y - a1.y;
  const t = (rx * dy2 - ry * dx2) / denom;
  const u = (rx * dy1 - ry * dx1) / denom;
  return t > 0.04 && t < 0.96 && u > 0.04 && u < 0.96;
}

/**
 * Detect collinear overlap between two axis-aligned segments on the same lane.
 * @param {Pt} a1
 * @param {Pt} a2
 * @param {Pt} b1
 * @param {Pt} b2
 * @returns {boolean}
 */
function segmentsCollinearOverlap(a1, a2, b1, b2) {
  const aHoriz = Math.abs(a1.y - a2.y) < 1.5;
  const bHoriz = Math.abs(b1.y - b2.y) < 1.5;
  if (aHoriz && bHoriz && Math.abs(a1.y - b1.y) <= 4) {
    const lo = Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
    const hi = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x));
    return hi - lo > 14;
  }
  const aVert = Math.abs(a1.x - a2.x) < 1.5;
  const bVert = Math.abs(b1.x - b2.x) < 1.5;
  if (aVert && bVert && Math.abs(a1.x - b1.x) <= 4) {
    const lo = Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
    const hi = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y));
    return hi - lo > 14;
  }
  return false;
}

/**
 * Check if a segment passes strictly inside an obstacle rectangle (with small inner margin).
 * @param {Pt} a
 * @param {Pt} b
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @returns {boolean}
 */
function segmentIntersectsNodeBody(a, b, rect) {
  const inset = 3;
  const rx1 = rect.x + inset;
  const ry1 = rect.y + inset;
  const rx2 = rect.x + rect.width - inset;
  const ry2 = rect.y + rect.height - inset;
  if (rx2 <= rx1 || ry2 <= ry1) return false;

  if (Math.max(a.x, b.x) <= rx1 || Math.min(a.x, b.x) >= rx2) return false;
  if (Math.max(a.y, b.y) <= ry1 || Math.min(a.y, b.y) >= ry2) return false;

  // Sample interior points along segment for exact hit check (handles both orthogonal & diagonal lines)
  const steps = Math.max(4, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 14));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    if (px > rx1 && px < rx2 && py > ry1 && py < ry2) {
      return true;
    }
  }
  return false;
}

/**
 * Check if two axis-aligned rectangles overlap.
 * @param {{ x: number, y: number, width: number, height: number }} a
 * @param {{ x: number, y: number, width: number, height: number }} b
 * @returns {boolean}
 */
function rectsOverlapStrict(a, b) {
  return (
    a.x < b.x + b.width - 1 &&
    a.x + a.width > b.x + 1 &&
    a.y < b.y + b.height - 1 &&
    a.y + a.height > b.y + 1
  );
}

/**
 * Build the polyline for any connector element using live bindings and waypoints.
 * @param {import('../types/schema.js').BoardElement} conn
 * @param {Map<string, import('../types/schema.js').BoardElement>} nodeById
 * @returns {Pt[]}
 */
function resolveConnectorAuditPolyline(conn, nodeById) {
  const src = conn.startBinding ? nodeById.get(conn.startBinding.elementId) : null;
  const dst = conn.endBinding ? nodeById.get(conn.endBinding.elementId) : null;
  const start =
    src && conn.startBinding
      ? resolveBindingPoint(src, conn.startBinding)
      : { x: conn.x, y: conn.y };
  const end =
    dst && conn.endBinding
      ? resolveBindingPoint(dst, conn.endBinding)
      : { x: conn.x + conn.width, y: conn.y + conn.height };
  if (conn.waypoints && conn.waypoints.length > 0) {
    return [start, ...conn.waypoints, end];
  }
  return [start, end];
}

/**
 * Audit layout quality and conflicts on a FlowBoard diagram:
 * counts connector crossings, wire-through-node collisions, collinear overlaps,
 * label collisions, total bends, and wire length.
 * @param {import('../types/schema.js').BoardElement[]} elements
 */
export function auditDiagramConflicts(elements) {
  const nodeById = new Map(
    elements.filter((e) => isConnectableElement(e)).map((e) => [e.id, e]),
  );
  const obstacles = elements
    .filter((e) => isConnectableElement(e) && !CONTAINER_TYPES.has(e.type))
    .map((e) => ({ id: e.id, rect: getNormalizedRect(e) }));
  const connectors = elements.filter((e) => e.type === 'connector');

  /** @type {Array<{ conn: import('../types/schema.js').BoardElement, pts: Pt[], ignoreIds: Set<string> }>} */
  const paths = connectors.map((conn) => ({
    conn,
    pts: resolveConnectorAuditPolyline(conn, nodeById),
    ignoreIds: new Set(
      [conn.startBinding?.elementId, conn.endBinding?.elementId].filter(
        /** @type {(v: string | undefined) => v is string} */ ((v) => Boolean(v)),
      ),
    ),
  }));

  let edgeCrossings = 0;
  let segmentOverlaps = 0;
  let nodeHits = 0;
  let totalBends = 0;
  let totalLength = 0;

  for (let i = 0; i < paths.length; i += 1) {
    const p = paths[i];
    totalBends += Math.max(0, p.pts.length - 2);
    for (let s = 0; s < p.pts.length - 1; s += 1) {
      const a = p.pts[s];
      const b = p.pts[s + 1];
      totalLength += Math.hypot(b.x - a.x, b.y - a.y);

      for (const obs of obstacles) {
        if (p.ignoreIds.has(obs.id)) continue;
        if (segmentIntersectsNodeBody(a, b, obs.rect)) {
          nodeHits += 1;
        }
      }
    }

    for (let j = i + 1; j < paths.length; j += 1) {
      const q = paths[j];
      for (let s1 = 0; s1 < p.pts.length - 1; s1 += 1) {
        for (let s2 = 0; s2 < q.pts.length - 1; s2 += 1) {
          if (segmentsStrictlyCross(p.pts[s1], p.pts[s1 + 1], q.pts[s2], q.pts[s2 + 1])) {
            edgeCrossings += 1;
          } else if (segmentsCollinearOverlap(p.pts[s1], p.pts[s1 + 1], q.pts[s2], q.pts[s2 + 1])) {
            segmentOverlaps += 1;
          }
        }
      }
    }
  }

  // Estimate connector label boxes and count label-vs-node & label-vs-label collisions
  /** @type {Array<{ id: string, rect: { x: number, y: number, width: number, height: number } }>} */
  const labelBoxes = [];
  for (const { conn, pts } of paths) {
    if (!conn.text || !conn.text.trim() || pts.length < 2) continue;
    const center = conn.labelPos || pts[Math.floor(pts.length / 2)];
    const w = Math.min(170, Math.max(36, conn.text.trim().length * 6.5 + 12));
    const h = 22;
    labelBoxes.push({
      id: conn.id,
      rect: { x: center.x - w / 2, y: center.y - h / 2, width: w, height: h },
    });
  }

  let labelCollisions = 0;
  for (let i = 0; i < labelBoxes.length; i += 1) {
    for (const obs of obstacles) {
      if (rectsOverlapStrict(labelBoxes[i].rect, obs.rect)) {
        labelCollisions += 1;
      }
    }
    for (let j = i + 1; j < labelBoxes.length; j += 1) {
      if (rectsOverlapStrict(labelBoxes[i].rect, labelBoxes[j].rect)) {
        labelCollisions += 1;
      }
    }
  }

  const score =
    nodeHits * 1000 +
    segmentOverlaps * 600 +
    edgeCrossings * 300 +
    labelCollisions * 150 +
    totalBends * 12 +
    Math.round(totalLength / 80);

  return {
    edgeCrossings,
    nodeHits,
    segmentOverlaps,
    labelCollisions,
    totalBends,
    totalLength: Math.round(totalLength),
    score,
  };
}

/**
 * Infer diagram standard kind from element types so full tidy preserves semantic layout conventions.
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @returns {string}
 */
function inferDiagramKindFromElements(elements) {
  if (elements.some((e) => e.type.startsWith('dfd_'))) return 'dfd';
  if (elements.some((e) => e.type.startsWith('erd_chen_'))) return 'erd_chen';
  if (elements.some((e) => e.type === 'erd_table' || e.type === 'erd_weak_table')) return 'erd';
  if (elements.some((e) => e.type === 'uml_usecase' || e.type === 'uml_actor')) return 'usecase';
  if (elements.some((e) => e.type === 'uml_class' || e.type === 'uml_interface')) return 'class';
  if (elements.some((e) => e.type.startsWith('fc_') || e.type.startsWith('bpmn_'))) return 'flowchart';
  return 'generic';
}

/**
 * Group movable nodes into visual columns (for LR) or rows (for TB) and perform
 * adjacent-pair slot swaps to further reduce connector crossings and bends.
 * @param {import('../types/schema.js').BoardElement[]} candidate
 * @param {'LR' | 'TB'} direction
 */
function optimizeLayerSwaps(candidate, direction) {
  let bestElements = candidate;
  let bestAudit = auditDiagramConflicts(bestElements);
  if (bestAudit.edgeCrossings === 0 && bestAudit.nodeHits === 0 && bestAudit.segmentOverlaps === 0) {
    return { elements: bestElements, audit: bestAudit };
  }

  const movable = bestElements.filter(
    (e) => isConnectableElement(e) && !CONTAINER_TYPES.has(e.type) && !e.locked,
  );
  if (movable.length < 2 || movable.length > 26) {
    return { elements: bestElements, audit: bestAudit };
  }

  // Bucket nodes into same visual column (LR) or row (TB) within 70px band
  /** @type {Array<string[]>} */
  const groups = [];
  const sorted = [...movable].sort((a, b) =>
    direction === 'LR' ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x,
  );
  for (const node of sorted) {
    const primaryCoord = direction === 'LR' ? node.x + node.width / 2 : node.y + node.height / 2;
    const match = groups.find((ids) => {
      const first = bestElements.find((el) => el.id === ids[0]);
      if (!first) return false;
      const firstCoord = direction === 'LR' ? first.x + first.width / 2 : first.y + first.height / 2;
      return Math.abs(primaryCoord - firstCoord) <= 75;
    });
    if (match) match.push(node.id);
    else groups.push([node.id]);
  }

  let improved = true;
  let attempts = 0;
  const maxAttempts = 48;
  while (improved && attempts < maxAttempts) {
    improved = false;
    for (const group of groups) {
      if (group.length < 2 || group.length > 8) continue;
      for (let i = 0; i < group.length - 1 && attempts < maxAttempts; i += 1) {
        for (let j = i + 1; j < group.length && attempts < maxAttempts; j += 1) {
          attempts += 1;
          const trial = bestElements.map((el) => structuredClone(el));
          const nA = trial.find((el) => el.id === group[i]);
          const nB = trial.find((el) => el.id === group[j]);
          if (!nA || !nB) continue;
          // Preserve logical 1.0 -> 2.0 -> 3.0 numbering order for explicitly numbered DFD processes
          if (parseProcessOrderNumber(nA) !== null && parseProcessOrderNumber(nB) !== null) {
            continue;
          }

          // Swap slot centers so differently sized boxes stay centered on their swapped slots
          const aCx = nA.x + nA.width / 2;
          const aCy = nA.y + nA.height / 2;
          const bCx = nB.x + nB.width / 2;
          const bCy = nB.y + nB.height / 2;
          nA.x = Math.round(bCx - nA.width / 2);
          nA.y = Math.round(bCy - nA.height / 2);
          nB.x = Math.round(aCx - nB.width / 2);
          nB.y = Math.round(aCy - nB.height / 2);

          const routed = routeConnectorsCleanly(trial, { direction });
          const trialAudit = auditDiagramConflicts(routed);
          if (trialAudit.score < bestAudit.score) {
            bestElements = routed;
            bestAudit = trialAudit;
            improved = true;
            if (
              bestAudit.edgeCrossings === 0 &&
              bestAudit.nodeHits === 0 &&
              bestAudit.segmentOverlaps === 0
            ) {
              return { elements: bestElements, audit: bestAudit };
            }
          }
        }
      }
    }
  }

  return { elements: bestElements, audit: bestAudit };
}

/**
 * Per-edge crossing polish: for connectors that currently cross other wires or hit nodes,
 * test alternate exit/entry faces pointing generally toward the opposite node (e.g., exiting
 * `left` instead of `bottom` on a top-right corner entity) and keep flips that strictly lower
 * overall diagram conflicts.
 * @param {import('../types/schema.js').BoardElement[]} elements
 */
function optimizeCrossingConnectorSides(elements) {
  let bestElements = elements;
  let bestAudit = auditDiagramConflicts(bestElements);
  if (bestAudit.edgeCrossings === 0 && bestAudit.nodeHits === 0) {
    return { elements: bestElements, audit: bestAudit };
  }

  const nodeById = new Map(
    bestElements.filter((e) => isConnectableElement(e)).map((e) => [e.id, e]),
  );
  const obstacles = bestElements
    .filter((e) => isConnectableElement(e) && !CONTAINER_TYPES.has(e.type))
    .map((e) => ({ id: e.id, rect: getNormalizedRect(e) }));

  // Identify connectors involved in crossings or node collisions
  const connectors = bestElements.filter(
    (e) => e.type === 'connector' && !e.locked && e.routing !== 'straight' && e.startBinding && e.endBinding,
  );
  const polylines = connectors.map((c) => ({
    conn: c,
    pts: resolveConnectorAuditPolyline(c, nodeById),
  }));

  /** @type {Map<string, number>} */
  const conflictDeg = new Map();
  for (let i = 0; i < polylines.length; i += 1) {
    for (let j = i + 1; j < polylines.length; j += 1) {
      let crosses = false;
      for (let s1 = 0; s1 < polylines[i].pts.length - 1 && !crosses; s1 += 1) {
        for (let s2 = 0; s2 < polylines[j].pts.length - 1; s2 += 1) {
          if (
            segmentsStrictlyCross(
              polylines[i].pts[s1],
              polylines[i].pts[s1 + 1],
              polylines[j].pts[s2],
              polylines[j].pts[s2 + 1],
            )
          ) {
            crosses = true;
            break;
          }
        }
      }
      if (crosses) {
        conflictDeg.set(polylines[i].conn.id, (conflictDeg.get(polylines[i].conn.id) || 0) + 1);
        conflictDeg.set(polylines[j].conn.id, (conflictDeg.get(polylines[j].conn.id) || 0) + 1);
      }
    }
  }

  const targetIds = Array.from(conflictDeg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);

  for (const connId of targetIds) {
    const currConn = bestElements.find((e) => e.id === connId);
    if (!currConn || !currConn.startBinding || !currConn.endBinding) continue;
    const src = nodeById.get(currConn.startBinding.elementId);
    const dst = nodeById.get(currConn.endBinding.elementId);
    if (!src || !dst) continue;

    const dx = dst.x + dst.width / 2 - (src.x + src.width / 2);
    const dy = dst.y + dst.height / 2 - (src.y + src.height / 2);

    /** @type {import('../types/schema.js').PortSide[]} */
    const startCandidates = [
      dx >= 0 ? 'right' : 'left',
      dy >= 0 ? 'bottom' : 'top',
    ];
    /** @type {import('../types/schema.js').PortSide[]} */
    const endCandidates = [
      dx >= 0 ? 'left' : 'right',
      dy >= 0 ? 'top' : 'bottom',
    ];

    /** @type {Array<{ a: Pt, b: Pt }>} */
    const otherSegs = [];
    for (const el of bestElements) {
      if (el.type !== 'connector' || el.id === connId) continue;
      const pts = resolveConnectorAuditPolyline(el, nodeById);
      for (let k = 0; k < pts.length - 1; k += 1) {
        otherSegs.push({ a: pts[k], b: pts[k + 1] });
      }
    }

    for (const sSide of startCandidates) {
      for (const eSide of endCandidates) {
        if (sSide === currConn.startBinding.side && eSide === currConn.endBinding.side) continue;

        const trial = bestElements.map((el) => (el.id === connId ? structuredClone(el) : el));
        const tc = trial.find((el) => el.id === connId);
        if (!tc || !tc.startBinding || !tc.endBinding) continue;

        const sAnch = computeSideAnchorNormalized(src, sSide, 0.5);
        const eAnch = computeSideAnchorNormalized(dst, eSide, 0.5);
        tc.startBinding = { elementId: src.id, side: sSide, rx: sAnch.rx, ry: sAnch.ry };
        tc.endBinding = { elementId: dst.id, side: eSide, rx: eAnch.rx, ry: eAnch.ry };

        const startPt = resolveBindingPoint(src, tc.startBinding);
        const endPt = resolveBindingPoint(dst, tc.endBinding);
        const fullPath = routeObstacleAvoidingOrtho(
          startPt,
          endPt,
          sSide,
          eSide,
          obstacles,
          new Set([src.id, dst.id]),
          otherSegs,
          getNormalizedRect(src),
          getNormalizedRect(dst),
        );
        const clean = simplifyOrthoPath(fullPath);
        tc.x = clean[0].x;
        tc.y = clean[0].y;
        tc.width = clean[clean.length - 1].x - clean[0].x;
        tc.height = clean[clean.length - 1].y - clean[0].y;
        const interior = clean.slice(1, -1);
        tc.waypoints = interior.length > 0 ? interior : undefined;

        const trialAudit = auditDiagramConflicts(trial);
        if (trialAudit.score + 40 < bestAudit.score) {
          // Re-place labels cleanly once a strictly better route is accepted
          const routedList = trial
            .filter((e) => e.type === 'connector')
            .map((c) => ({ connector: c, path: resolveConnectorAuditPolyline(c, nodeById) }));
          placeConnectorLabelsCleanly(routedList, obstacles);
          bestElements = trial;
          bestAudit = auditDiagramConflicts(bestElements);
        }
      }
    }
  }

  return { elements: bestElements, audit: bestAudit };
}

/**
 * Pro Conflict-Driven Diagram Tidy Optimizer:
 * Preserves 100% of every component, connector, text, and data flow semantics while
 * eliminating wire/node collisions, collinear overlaps, unnecessary crossings, and label overlaps.
 *
 * Modes:
 * - `'full'`: Re-optimizes component placement, layer ordering, port assignment, orthogonal lanes, and labels.
 * - `'connectors_only'`: Locks all component positions in place and optimizes only connector ports, lanes, and labels.
 *
 * @param {import('../types/schema.js').BoardElement[]} elements
 * @param {{ mode?: 'full' | 'connectors_only' }} [options]
 */
export function tidyDiagramElements(elements, options = {}) {
  const mode = options.mode === 'connectors_only' ? 'connectors_only' : 'full';
  const before = auditDiagramConflicts(elements);
  if (elements.length === 0) {
    return {
      elements: [],
      metrics: { mode, before, after: before },
    };
  }

  const resetUnlockedConnectors = (/** @type {import('../types/schema.js').BoardElement[]} */ els) =>
    els.map((el) => {
      const copy = structuredClone(el);
      if (copy.type === 'connector' && !copy.locked) {
        copy.waypoints = undefined;
        copy.labelPos = null;
      }
      return copy;
    });

  if (mode === 'connectors_only') {
    const cleanBase = resetUnlockedConnectors(elements);
    const unlockedNodeIds = new Set(
      cleanBase.filter((e) => isConnectableElement(e)).map((e) => e.id),
    );
    const candidates = [
      routeConnectorsCleanly(cleanBase, { direction: 'LR' }),
      routeConnectorsCleanly(cleanBase, { direction: 'TB' }),
      rerouteAffectedConnectors(cleanBase, unlockedNodeIds, { fast: false }),
    ];

    let bestEls = candidates[0];
    let bestAudit = auditDiagramConflicts(bestEls);
    for (let i = 1; i < candidates.length; i += 1) {
      const audit = auditDiagramConflicts(candidates[i]);
      if (audit.score < bestAudit.score) {
        bestEls = candidates[i];
        bestAudit = audit;
      }
    }

    const polished = optimizeCrossingConnectorSides(bestEls);
    if (polished.audit.score < bestAudit.score) {
      bestEls = polished.elements;
      bestAudit = polished.audit;
    }

    return {
      elements: bestEls,
      metrics: { mode, before, after: bestAudit },
    };
  }

  // Full mode: evaluate semantic / layered layouts + multi-pass swap search + crossing-edge side polish
  const kind = inferDiagramKindFromElements(elements);
  const baseReset = resetUnlockedConnectors(elements);

  const lrRaw = layoutDiagramElements(baseReset, { direction: 'LR', kind });
  const lrOpt = optimizeLayerSwaps(lrRaw, 'LR');

  let bestEls = lrOpt.elements;
  let bestAudit = lrOpt.audit;

  // Evaluate TB orientation for non-DFD / non-usecase diagrams (flowcharts, ERD, UML class, generic)
  if (kind !== 'usecase' && kind !== 'dfd') {
    const tbRaw = layoutDiagramElements(baseReset, { direction: 'TB', kind });
    const tbOpt = optimizeLayerSwaps(tbRaw, 'TB');
    if (tbOpt.audit.score < bestAudit.score) {
      bestEls = tbOpt.elements;
      bestAudit = tbOpt.audit;
    }
  }

  const polished = optimizeCrossingConnectorSides(bestEls);
  if (polished.audit.score < bestAudit.score) {
    bestEls = polished.elements;
    bestAudit = polished.audit;
  }

  return {
    elements: bestEls,
    metrics: { mode, before, after: bestAudit },
  };
}
