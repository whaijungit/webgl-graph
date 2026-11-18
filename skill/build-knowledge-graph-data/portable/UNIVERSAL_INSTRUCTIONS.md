# Universal Knowledge Graph Data Instructions

Use this document with any AI agent or assistant that accepts text instructions.
No platform-specific file format, renderer, SDK, or repository is required.

## Goal

Convert verified domain knowledge into a portable `knowledge-graph.json`
containing entities, typed relations, groups, sources, and optional contextual
attributes.

The same model must work for any subject, including chemistry, biology,
medicine, history, people, organizations, software, services, events,
mathematics, law, logistics, and mixed-domain graphs.

## Required Output

```json
{
  "schemaVersion": "1.0",
  "title": "Graph title",
  "description": "Scope, method, and caveats",
  "entities": [
    {
      "id": "namespace:item",
      "type": "entity_type",
      "name": "Canonical name",
      "label": "Optional display label",
      "description": "Optional summary",
      "aliases": [],
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
  "groups": [
    {
      "id": "group-id",
      "label": "Group label",
      "type": "category",
      "description": "Optional group context"
    }
  ],
  "sources": [
    {
      "id": "source-id",
      "title": "Source title",
      "publisher": "Publisher",
      "url": "https://example.org/source",
      "accessedAt": "2026-11-18",
      "identifier": "DOI or archive ID",
      "notes": "Claims supported by this source"
    }
  ],
  "attributes": {}
}
```

Required top-level fields: `schemaVersion`, `title`, `entities`, `relations`.

Required entity fields: `id`, `type`, `name`.

Required relation fields: `id`, `type`, `source`, `target`.

## Procedure

1. State the graph scope and the question traversal should answer.
2. Define entity types and relation types before writing records.
3. Identify whether each relation is directed, undirected, hierarchical,
   compositional, temporal, causal, regulatory, or merely associative.
4. Gather evidence. Do not invent facts, quantities, dates, ranks, identities,
   causal links, or hierarchy.
5. Use stable namespaced IDs:
   `compound:sodium-chloride`, `cell:mitochondrion`, `gene:tp53`,
   `dynasty:qing`, `person:zhou-enlai`, `service:payments`.
6. Write entities first, then relations, then groups and sources.
7. Put measurements and qualifiers in `attributes`, with explicit units.
8. Preserve real structure: DAGs, cycles, multiple parents, disconnected
   components, and mixed directed/undirected relations are valid.
9. Keep coordinates, icons, colors, camera state, and renderer styling out of
   the canonical graph.
10. Validate all IDs, endpoints, groups, and source references before delivery.

## Relation Direction

Every directed relation must read naturally from `source` to `target`.

| Domain | Preferred relation types |
| --- | --- |
| hierarchy | `parent_of`, `reports_to`, `superior_of` |
| containment | `contains`, `part_of` |
| composition | `composed_of`, `constituent_of` |
| chronology | `preceded_by`, `succeeded_by` |
| dependency | `depends_on`, `imports`, `calls` |
| chemistry | `bonded_to`, `reacts_with`, `catalyzes`, `derived_from` |
| biology | `expressed_as`, `encodes`, `regulates`, `located_in` |
| gene regulation | `activates`, `represses`, `modulates`, `co_expresses_with` |
| ownership/control | `owns`, `controls`, `governs`, `vassal_of` |
| general association | `associated_with`, only when no precise relation is known |

Do not collapse separate semantics into one edge. Structural containment, gene
expression, regulatory influence, and chronology must remain separate relation
types.

## Data Quality

- Entity IDs and relation IDs are unique.
- Every relation endpoint resolves to an entity.
- Every `groupIds` and `sourceIds` reference resolves.
- Record aliases and disputes explicitly.
- Use `attributes.evidenceStatus` values such as `supported`, `reported`,
  `disputed`, `hypothesized`, or `unknown`.
- Use `validFrom`, `validTo`, `location`, `condition`, and experimental context
  when they materially affect meaning.
- Use attributes such as `{ "value": 58.44, "unit": "g/mol" }`; never omit units.
- Do not infer sensitive personal details.
- Split an unbounded topic into a scoped subgraph that remains readable.

## Validation Checklist

- JSON parses.
- `schemaVersion` is `"1.0"`.
- Required fields exist.
- IDs are unique within their collections.
- Relation endpoints exist.
- Group and source references exist.
- No duplicate relations unless intentional.
- No presentation coordinates or styling fields.
- All high-risk facts are supported by listed sources.

## Optional Tool-Assisted Validation

If Node.js is available and the skill files are present:

```bash
node scripts/validate-knowledge-graph.mjs knowledge-graph.json --strict-presentation
```

If not, apply the checklist manually.

## Request Patterns

Use the same instructions for prompts such as:

- “Build a graph of the composition and reactions of common sodium salts.”
- “Map cell structures, organelles, and gene-expression relationships.”
- “Create a gene regulatory network with evidence and conditions.”
- “Build a Chinese dynasty succession graph with political-control relations.”
- “Map an organization’s command chain with dated appointments.”
- “Create a software dependency graph from these package records.”
