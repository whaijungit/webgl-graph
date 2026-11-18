# Portable Knowledge Graph Schema

## Top-Level Document

```json
{
  "schemaVersion": "1.0",
  "title": "Required graph title",
  "description": "Optional scope and caveats",
  "entities": [],
  "relations": [],
  "groups": [],
  "sources": [],
  "attributes": {}
}
```

## Entity

```json
{
  "id": "gene:tp53",
  "type": "gene",
  "name": "TP53",
  "label": "肿瘤抑制基因 TP53",
  "description": "Optional summary",
  "aliases": ["p53"],
  "groupIds": ["tumor-suppression"],
  "sourceIds": ["source-1"],
  "attributes": {
    "chromosome": "17p13.1",
    "externalIds": {
      "ncbiGene": "7157"
    }
  }
}
```

Required fields: `id`, `type`, `name`.

Entity records may represent physical objects, abstract concepts, events,
documents, people, organizations, processes, measurements, or categories.

## Relation

```json
{
  "id": "relation:tp53-mdm2",
  "type": "regulates",
  "source": "gene:tp53",
  "target": "gene:mdm2",
  "label": "调控",
  "directed": true,
  "sourceIds": ["source-1"],
  "attributes": {
    "effect": "activates",
    "condition": "DNA damage response",
    "evidenceStatus": "reported"
  }
}
```

Required fields: `id`, `type`, `source`, `target`.

Use `directed: false` for genuinely symmetric relations. If an application
cannot represent undirected edges, export both directions in its projection and
document that limitation.

## Group

```json
{
  "id": "tumor-suppression",
  "label": "肿瘤抑制",
  "type": "functional-category",
  "description": "Optional group context"
}
```

Groups should represent a natural dimension such as category, subsystem, era,
organism, organization, location, or evidence family. A graph may use several
group dimensions if the schema is extended intentionally, but do not create
groups solely to force a layout.

## Source

```json
{
  "id": "source-1",
  "title": "Source title",
  "publisher": "Publisher or journal",
  "url": "https://example.org/source",
  "accessedAt": "2026-11-18",
  "identifier": "DOI or archive identifier",
  "notes": "What this source supports"
}
```

## Attributes and Qualifiers

Attributes are domain-specific and should preserve semantics:

- measurements: `{ "value": 58.44, "unit": "g/mol" }`
- time: `{ "validFrom": "1644", "validTo": "1912" }`
- location: `{ "location": "Nanchang" }`
- condition: experimental or regulatory context
- evidence: `supported`, `disputed`, `hypothesized`, or `unknown`

Do not encode unitless values when the unit exists.

## Presentation Separation

Canonical graph data must not contain:

- spatial coordinates such as `x`/`y`;
- node radii, icon IDs, colors, themes, z-order;
- camera state;
- renderer-specific LOD flags.

Create a separate projection when a consumer needs those fields.
