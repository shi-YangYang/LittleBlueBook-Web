import type { ValidationError } from '@nestjs/common';

const SAFE_FIELD_SEGMENT = /^(?:[A-Za-z_][A-Za-z0-9_]*|\d+)$/u;
const RESERVED_FIELD_SEGMENTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);
const MAX_REASONABLE_ARRAY_LENGTH = 0xffff_ffff;

export const MAX_VALIDATION_ERROR_DEPTH = 32;
export const MAX_VALIDATION_ERROR_NODES = 1_024;
export const MAX_VALIDATION_ERROR_CHILD_SLOTS = 1_024;

type TraversalState = {
  readonly fields: Set<string>;
  readonly visited: WeakSet<object>;
  visitedNodeCount: number;
  visitedChildSlotCount: number;
  limitExceeded: boolean;
};

type PropertyRead =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false };

function readProperty(target: object, property: PropertyKey): PropertyRead {
  try {
    return { ok: true, value: Reflect.get(target, property) };
  } catch {
    return { ok: false };
  }
}

function isRecordNode(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  try {
    return !Array.isArray(value);
  } catch {
    return false;
  }
}

function asArray(value: unknown): readonly unknown[] | undefined {
  try {
    return Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function readArrayLength(value: readonly unknown[]): number | undefined {
  const result = readProperty(value, 'length');
  return result.ok &&
    typeof result.value === 'number' &&
    Number.isFinite(result.value) &&
    Number.isSafeInteger(result.value) &&
    result.value >= 0 &&
    result.value <= MAX_REASONABLE_ARRAY_LENGTH
    ? result.value
    : undefined;
}

function isSafeFieldSegment(segment: unknown): segment is string {
  return (
    typeof segment === 'string' &&
    segment.length > 0 &&
    segment.length <= 64 &&
    SAFE_FIELD_SEGMENT.test(segment) &&
    !RESERVED_FIELD_SEGMENTS.has(segment.toLowerCase())
  );
}

function reserveChildSlots(
  children: readonly unknown[],
  state: TraversalState,
): number | undefined {
  const childCount = readArrayLength(children);
  if (
    childCount === undefined ||
    childCount > MAX_VALIDATION_ERROR_CHILD_SLOTS - state.visitedChildSlotCount
  ) {
    state.limitExceeded = true;
    return undefined;
  }

  state.visitedChildSlotCount += childCount;
  return childCount;
}

function visitValidationError(
  candidate: unknown,
  parentSegments: readonly string[],
  depth: number,
  state: TraversalState,
): void {
  if (state.limitExceeded) {
    return;
  }

  if (depth > MAX_VALIDATION_ERROR_DEPTH) {
    state.limitExceeded = true;
    return;
  }

  state.visitedNodeCount += 1;
  if (state.visitedNodeCount > MAX_VALIDATION_ERROR_NODES) {
    state.limitExceeded = true;
    return;
  }

  if (!isRecordNode(candidate) || state.visited.has(candidate)) {
    return;
  }
  state.visited.add(candidate);

  const propertyResult = readProperty(candidate, 'property');
  if (!propertyResult.ok) {
    return;
  }
  const segment = propertyResult.value;
  if (!isSafeFieldSegment(segment)) {
    return;
  }

  const childrenResult = readProperty(candidate, 'children');
  if (!childrenResult.ok) {
    return;
  }
  const children = asArray(childrenResult.value) ?? [];
  const childCount = reserveChildSlots(children, state);
  if (childCount === undefined) {
    return;
  }

  const segments = [...parentSegments, segment];
  const constraintsResult = readProperty(candidate, 'constraints');
  const hasConstraints =
    constraintsResult.ok && Boolean(constraintsResult.value);
  if (hasConstraints || childCount === 0) {
    state.fields.add(segments.join('.'));
  }

  for (let index = 0; index < childCount; index += 1) {
    const childResult = readProperty(children, index);
    if (!childResult.ok) {
      continue;
    }
    visitValidationError(childResult.value, segments, depth + 1, state);
    if (state.limitExceeded) {
      return;
    }
  }
}

export function extractValidationFieldPaths(
  errors: readonly ValidationError[],
): string[] {
  const rootErrors = asArray(errors);
  if (rootErrors === undefined) {
    return [];
  }
  const rootCount = readArrayLength(rootErrors);
  if (rootCount === undefined || rootCount > MAX_VALIDATION_ERROR_NODES) {
    return [];
  }

  const state: TraversalState = {
    fields: new Set<string>(),
    visited: new WeakSet<object>(),
    visitedNodeCount: 0,
    visitedChildSlotCount: 0,
    limitExceeded: false,
  };

  for (let index = 0; index < rootCount; index += 1) {
    const errorResult = readProperty(rootErrors, index);
    if (!errorResult.ok) {
      continue;
    }
    visitValidationError(errorResult.value, [], 1, state);
    if (state.limitExceeded) {
      return [];
    }
  }

  return [...state.fields].sort();
}
