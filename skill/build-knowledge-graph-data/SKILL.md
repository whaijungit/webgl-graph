---
name: build-knowledge-graph-data
description: Create or revise portable, source-grounded knowledge graph datasets containing entities, typed relations, evidence, and optional groups for any domain. Use for chemistry, biology, history, organizations, software, or other entity-relationship modeling; not for implementing a specific renderer.
metadata:
  short-description: Build any-domain knowledge graph data
---

# Build Knowledge Graph Data

Convert domain knowledge into a portable entity-relationship dataset that can be
validated, exchanged, and adapted to any visualization or database. The skill is
domain-independent: people, organizations, materials, cells, genes, historical
periods, software, services, events, concepts, and mixed-domain graphs are all
in scope.

## Outcome

Produce a JSON `knowledge-graph.json` containing:

- typed entities with stable IDs;
- typed relations with explicit direction and meaning;
- optional taxonomy or subsystem groups;
- source records and evidence links;
- temporal, quantitative, or contextual qualifiers where needed;
- no renderer coordinates, icon IDs, or visual styling in the canonical graph.

Read [references/data-model.md](references/data-model.md) for the schema.
Consult [references/domain-patterns.md](references/domain-patterns.md) for the
current subject area. Read [references/source-quality.md](references/source-quality.md)
when factual accuracy matters.

For agents that consume plain-text instructions instead of a skill folder, use
[portable/UNIVERSAL_INSTRUCTIONS.md](portable/UNIVERSAL_INSTRUCTIONS.md) as a
self-contained prompt and schema. It intentionally has no platform, repository,
tool, or renderer dependency.

## Workflow

1. State the graph's scope and the question traversal should answer.
2. Identify entity types and relation types before creating records.
3. Decide whether each relation is directed, undirected, hierarchical,
   compositional, temporal, causal, regulatory, or merely associative.
4. Collect evidence and source metadata. Do not invent missing facts,
   quantities, causality, hierarchy, dates, or identities.
5. Assign stable namespaced IDs such as `compound:sodium-chloride`,
   `cell:mitochondrion`, `gene:tp53`, `dynasty:qing`, or `service:payments`.
6. Write entities, relations, groups, and sources using the portable schema.
7. Put domain measurements into `attributes` with explicit units and qualifiers.
8. Preserve multiple parents, cycles, disconnected components, and mixed
   directed/undirected relations when the domain requires them.
9. Validate the JSON with the bundled validator.
10. Only when a target application is specified, create a separate adapter or
    projection from the canonical graph to that application's schema.

## Canonical Structure

```json
{
  "schemaVersion": "1.0",
  "title": "Graph title",
  "entities": [
    {
      "id": "namespace:item",
      "type": "entity_type",
      "name": "Display name",
      "label": "Optional descriptive label",
      "description": "Optional context",
      "groupIds": ["group-id"],
      "sourceIds": ["source-id"],
      "attributes": {}
    }
  ],
  "relations": [
    {
      "id": "relation:stable-id",
      "type": "relation_type",
      "source": "namespace:item",
      "target": "namespace:other",
      "label": "Human-readable relation",
      "directed": true,
      "sourceIds": ["source-id"],
      "attributes": {}
    }
  ],
  "groups": [],
  "sources": []
}
```

See the full field contract in [references/data-model.md](references/data-model.md)
and use [assets/knowledge-graph-template.json](assets/knowledge-graph-template.json)
as a starting point.

## Relationship Design

Use relation `type` as a stable machine-readable identifier and `label` as a
human-readable description. Direction must reflect domain meaning:

- containment: `contains`, `part_of`
- composition: `composed_of`, `constituent_of`
- hierarchy: `parent_of`, `child_of`
- dependency: `depends_on`
- chronology: `preceded_by`, `succeeded_by`
- regulation: `activates`, `represses`, `modulates`
- expression: `encodes`, `expressed_as`
- ownership/control: `owns`, `controls`, `reports_to`
- generic association: `associated_with`, only when no precise relation is known

Do not collapse different semantic relationships into one generic edge. For
example, structural containment and gene regulation should remain separate.

## Quality Rules

- Entity and relation IDs must be unique.
- Relation endpoints must resolve to entities.
- Source references must resolve to `sources[].id`.
- Use qualifiers rather than silently dropping context:
  `validFrom`, `validTo`, `location`, `condition`, `evidenceStatus`.
- Use attributes with units for measurements; never hide units in prose-only
  numeric labels.
- Keep uncertain claims explicitly marked or omit them.
- Do not infer sensitive personal attributes.
- Keep canonical data free of `x`, `y`, `size`, `iconId`, color, theme, and
  renderer-specific fields.

## Validation

Run:

```bash
node scripts/validate-knowledge-graph.mjs path/to/knowledge-graph.json
```

For data that should be strictly free of presentation fields:

```bash
node scripts/validate-knowledge-graph.mjs path/to/knowledge-graph.json --strict-presentation
```

Validation does not replace source review. Check disputed or high-risk facts
against the underlying sources before delivery.
