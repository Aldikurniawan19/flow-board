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
});
