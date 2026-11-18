#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const inputPath = process.argv[2];
const strictPresentation = process.argv.includes("--strict-presentation");
if (!inputPath) {
  console.error(
    "Usage: node validate-knowledge-graph.mjs <knowledge-graph.json> [--strict-presentation]",
  );
  process.exit(2);
}

const graph = JSON.parse(await readFile(inputPath, "utf8"));
const errors = [];
const warnings = [];

if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
  errors.push("Root must be a JSON object.");
} else {
  if (graph.schemaVersion !== "1.0") {
    errors.push('schemaVersion must be "1.0".');
  }
  if (typeof graph.title !== "string" || graph.title.trim() === "") {
    errors.push("title must be a non-empty string.");
  }
  for (const field of ["entities", "relations"]) {
    if (!Array.isArray(graph[field])) {
      errors.push(`${field} must be an array.`);
    }
  }
  for (const field of ["groups", "sources"]) {
    if (graph[field] != null && !Array.isArray(graph[field])) {
      errors.push(`${field} must be an array when present.`);
    }
  }
}

const entities = Array.isArray(graph?.entities) ? graph.entities : [];
const relations = Array.isArray(graph?.relations) ? graph.relations : [];
const groups = Array.isArray(graph?.groups) ? graph.groups : [];
const sources = Array.isArray(graph?.sources) ? graph.sources : [];
const entityIds = new Set();
const relationIds = new Set();
const groupIds = new Set();
const sourceIds = new Set();
const relationKeys = new Set();

function checkIds(record, listName, index, set) {
  if (!record || typeof record.id !== "string" || record.id.length === 0) {
    errors.push(`${listName}[${index}].id is required.`);
  } else if (set.has(record.id)) {
    errors.push(`Duplicate ${listName} id: ${record.id}`);
  } else {
    set.add(record.id);
  }
}

function checkSourceRefs(record, location) {
  if (record?.sourceIds == null) return;
  if (!Array.isArray(record.sourceIds)) {
    errors.push(`${location}.sourceIds must be an array.`);
    return;
  }
  for (const sourceId of record.sourceIds) {
    if (!sourceIds.has(sourceId)) {
      errors.push(`${location} references unknown source ${sourceId}.`);
    }
  }
}

function checkPresentationFields(record, location) {
  for (const field of [
    "x",
    "y",
    "size",
    "radius",
    "iconId",
    "color",
    "style",
    "zIndex",
  ]) {
    if (record?.[field] !== undefined) {
      const message = `${location} contains presentation field ${field}.`;
      (strictPresentation ? errors : warnings).push(message);
    }
  }
}

for (const [index, group] of groups.entries()) {
  checkIds(group, "groups", index, groupIds);
}

for (const [index, source] of sources.entries()) {
  checkIds(source, "sources", index, sourceIds);
  if (typeof source?.title !== "string" || source.title.trim() === "") {
    warnings.push(`sources[${index}].title is empty.`);
  }
}

for (const [index, entity] of entities.entries()) {
  checkIds(entity, "entities", index, entityIds);
  if (typeof entity?.type !== "string" || entity.type.length === 0) {
    errors.push(`entities[${index}].type is required.`);
  }
  if (typeof entity?.name !== "string" || entity.name.length === 0) {
    errors.push(`entities[${index}].name is required.`);
  }
  if (entity?.groupIds != null) {
    if (!Array.isArray(entity.groupIds)) {
      errors.push(`entities[${index}].groupIds must be an array.`);
    } else {
      for (const groupId of entity.groupIds) {
        if (!groupIds.has(groupId)) {
          errors.push(
            `Entity ${entity.id} references unknown group ${groupId}.`,
          );
        }
      }
    }
  }
  checkSourceRefs(entity, `entities[${index}]`);
  checkPresentationFields(entity, `Entity ${entity.id ?? index}`);
}

const indegree = new Map([...entityIds].map((id) => [id, 0]));
for (const [index, relation] of relations.entries()) {
  checkIds(relation, "relations", index, relationIds);
  if (typeof relation?.type !== "string" || relation.type.length === 0) {
    errors.push(`relations[${index}].type is required.`);
  }
  if (typeof relation?.source !== "string" || relation.source.length === 0) {
    errors.push(`relations[${index}].source is required.`);
  } else if (!entityIds.has(relation.source)) {
    errors.push(`relations[${index}] has unknown source ${relation.source}.`);
  }
  if (typeof relation?.target !== "string" || relation.target.length === 0) {
    errors.push(`relations[${index}].target is required.`);
  } else if (!entityIds.has(relation.target)) {
    errors.push(`relations[${index}] has unknown target ${relation.target}.`);
  }
  if (
    relation?.directed !== undefined &&
    typeof relation.directed !== "boolean"
  ) {
    errors.push(`relations[${index}].directed must be boolean.`);
  }
  if (relation?.source === relation?.target) {
    warnings.push(`Relation ${relation.id} is a self-loop.`);
  }
  const key = [
    relation?.source,
    relation?.target,
    relation?.type,
  ].join("\u0000");
  if (relationKeys.has(key)) {
    warnings.push(
      `Duplicate relation ${relation?.source} -> ${relation?.target} (${relation?.type}).`,
    );
  }
  relationKeys.add(key);
  checkSourceRefs(relation, `relations[${index}]`);
  checkPresentationFields(relation, `Relation ${relation.id ?? index}`);
  if (relation?.directed !== false && indegree.has(relation?.target)) {
    indegree.set(relation.target, indegree.get(relation.target) + 1);
  }
}

const roots = [...indegree]
  .filter(([, degree]) => degree === 0)
  .map(([id]) => id);

console.log(
  JSON.stringify(
    {
      schemaVersion: graph?.schemaVersion ?? null,
      entities: entities.length,
      relations: relations.length,
      groups: groups.length,
      sources: sources.length,
      rootCandidates: roots.length,
      firstRoots: roots.slice(0, 10),
      errors,
      warnings,
    },
    null,
    2,
  ),
);

if (errors.length > 0) process.exit(1);
