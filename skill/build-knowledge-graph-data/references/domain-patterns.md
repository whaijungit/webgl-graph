# Domain Patterns

Use these as starting ontologies, then adapt to the user's scope.

## People, Organizations, and Command Chains

- Entities: people, offices, organizations, units, events.
- Relations: `commands`, `reports_to`, `appointed_as`, `member_of`, `succeeded_by`.
- Avoid implying command over a person when they only share a committee.
- Preserve temporal qualifiers such as `after`, `acting`, or `concurrent`.

## Chemistry and Materials

- Entities: elements, ions, molecules, compounds, mixtures, phases.
- Relations: `contains`, `bonded_to`, `reacts_with`, `catalyzes`, `derived_from`.
- Composition is not hierarchy by rank; it is whole-to-constituent.
- Do not infer stoichiometric quantities unless supplied.

## Biology and Cells

- Structural: `organism -> system -> organ -> tissue -> cell -> organelle`.
- Molecular: `cell -> pathway -> gene -> transcript -> protein`.
- Expression: `gene -> transcript`, `transcript -> protein`;
  `regulator -> target` with `activates`, `represses`, or `modulates`.
- Do not merge structural containment and functional regulation into one edge.

## History and Dynasties

- Nodes: polities, dynasties, rulers, periods, events.
- Edges: `preceded_by`, `succeeded_by`, `ruled`, `vassal_of`, `part_of`.
- Chronology and political control are different dimensions; group them
  separately when both are present.

## Software and Services

- Entities: packages, modules, services, datastores, owners.
- Relations: `depends_on`, `imports`, `calls`, `publishes_to`, `owns`.
- Do not encode runtime traffic volume as a structural dependency unless the
  metric is clearly defined.

## Gene Expression and Networks

- Keep entity type and relation type explicit.
- `co_expresses_with` is undirected in interpretation; if the schema requires a
  directed edge, add both directions or document the limitation.
- Expression arrows and regulatory arrows must not reuse the same relation label.
