/**
 * A tiny, dependency-free schema combinator.
 *
 * Every schema does two things from ONE definition, so they can never drift:
 *   1. validate(value) — runtime check with structured issues (path + code + message)
 *   2. json()          — emit a JSON Schema (draft-07) fragment
 *
 * This is deliberately small — just what the public contracts need. It is not a
 * general-purpose validation library.
 */

export interface SchemaIssue {
  /** JSON pointer-ish path to the offending value, e.g. "/components/2/id". */
  path: string;
  code: string;
  message: string;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: SchemaIssue[] };

export interface Schema<T> {
  /** Phantom type carrier; never read at runtime. */
  readonly _t?: T;
  validate(value: unknown, path: string, issues: SchemaIssue[]): void;
  json(): Record<string, unknown>;
}

/** Marker wrapper so object() knows a field is not required. */
export interface OptionalSchema<T> extends Schema<T | undefined> {
  readonly __optional: true;
  readonly inner: Schema<T>;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

const push = (issues: SchemaIssue[], path: string, code: string, message: string) =>
  issues.push({ path: path || "/", code, message });

const typeName = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v;

export function parse<T>(schema: Schema<T>, value: unknown): ParseResult<T> {
  const issues: SchemaIssue[] = [];
  schema.validate(value, "", issues);
  return issues.length ? { ok: false, issues } : { ok: true, value: value as T };
}

// --- primitives ------------------------------------------------------------

export function str(opts?: { pattern?: RegExp; patternHint?: string }): Schema<string> {
  return {
    validate(v, path, issues) {
      if (typeof v !== "string") return push(issues, path, "type", `expected string, got ${typeName(v)}`);
      if (opts?.pattern && !opts.pattern.test(v)) {
        push(issues, path, "pattern", `'${v}' does not match ${opts.patternHint ?? opts.pattern}`);
      }
    },
    json: () => (opts?.pattern ? { type: "string", pattern: opts.pattern.source } : { type: "string" }),
  };
}

export function num(opts?: { min?: number; max?: number; int?: boolean }): Schema<number> {
  return {
    validate(v, path, issues) {
      if (typeof v !== "number" || Number.isNaN(v)) return push(issues, path, "type", `expected number, got ${typeName(v)}`);
      if (opts?.int && !Number.isInteger(v)) push(issues, path, "int", `expected integer, got ${v}`);
      if (opts?.min != null && v < opts.min) push(issues, path, "min", `must be >= ${opts.min}, got ${v}`);
      if (opts?.max != null && v > opts.max) push(issues, path, "max", `must be <= ${opts.max}, got ${v}`);
    },
    json: () => {
      const j: Record<string, unknown> = { type: opts?.int ? "integer" : "number" };
      if (opts?.min != null) j.minimum = opts.min;
      if (opts?.max != null) j.maximum = opts.max;
      return j;
    },
  };
}

export function bool(): Schema<boolean> {
  return {
    validate(v, path, issues) {
      if (typeof v !== "boolean") push(issues, path, "type", `expected boolean, got ${typeName(v)}`);
    },
    json: () => ({ type: "boolean" }),
  };
}

export function lit<const V extends string | number | boolean>(value: V): Schema<V> {
  return {
    validate(v, path, issues) {
      if (v !== value) push(issues, path, "literal", `expected ${JSON.stringify(value)}, got ${JSON.stringify(v)}`);
    },
    json: () => ({ const: value }),
  };
}

export function enums<const V extends string>(values: readonly V[]): Schema<V> {
  return {
    validate(v, path, issues) {
      if (typeof v !== "string" || !values.includes(v as V)) {
        push(issues, path, "enum", `expected one of ${values.map((x) => `'${x}'`).join(", ")}, got ${JSON.stringify(v)}`);
      }
    },
    json: () => ({ enum: [...values] }),
  };
}

/** Accepts any JSON value (used for free-form props / data / token values). */
export function jsonValue(): Schema<unknown> {
  return {
    validate(v, path, issues) {
      const seen = new WeakSet<object>();
      (function rec(val: unknown, p: string) {
        if (val === null || ["string", "number", "boolean"].includes(typeof val)) return;
        if (Array.isArray(val)) {
          val.forEach((x, i) => rec(x, `${p}/${i}`));
          return;
        }
        if (typeof val === "object") {
          if (seen.has(val as object)) return push(issues, p, "cyclic", "value contains a cycle");
          seen.add(val as object);
          for (const [k, x] of Object.entries(val as object)) rec(x, `${p}/${k}`);
          return;
        }
        push(issues, p, "json", `not a JSON value (${typeName(val)})`);
      })(v, path);
    },
    json: () => ({}),
  };
}

// --- composites ------------------------------------------------------------

export function arr<T>(inner: Schema<T>): Schema<T[]> {
  return {
    validate(v, path, issues) {
      if (!Array.isArray(v)) return push(issues, path, "type", `expected array, got ${typeName(v)}`);
      v.forEach((x, i) => inner.validate(x, `${path}/${i}`, issues));
    },
    json: () => ({ type: "array", items: inner.json() }),
  };
}

/** Object with arbitrary string keys, each value matching `inner`. */
export function record<T>(inner: Schema<T>): Schema<Record<string, T>> {
  return {
    validate(v, path, issues) {
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        return push(issues, path, "type", `expected object, got ${typeName(v)}`);
      }
      for (const [k, x] of Object.entries(v)) inner.validate(x, `${path}/${k}`, issues);
    },
    json: () => ({ type: "object", additionalProperties: inner.json() }),
  };
}

export function optional<T>(inner: Schema<T>): OptionalSchema<T> {
  return {
    __optional: true,
    inner,
    validate(v, path, issues) {
      if (v !== undefined) inner.validate(v, path, issues);
    },
    json: () => inner.json(),
  };
}

const isOptional = (s: Schema<unknown>): s is OptionalSchema<unknown> =>
  (s as Partial<OptionalSchema<unknown>>).__optional === true;

type Shape = Record<string, Schema<unknown>>;

type ObjectType<S extends Shape> = {
  [K in keyof S as S[K] extends OptionalSchema<unknown> ? K : never]?: Infer<S[K]>;
} & {
  [K in keyof S as S[K] extends OptionalSchema<unknown> ? never : K]: Infer<S[K]>;
};

/**
 * Strict object: rejects unknown keys by default. This is what makes "reject
 * malformed top-level shapes before business logic" real.
 */
export function obj<S extends Shape>(
  shape: S,
  opts?: { strict?: boolean },
): Schema<ObjectType<S>> {
  const strict = opts?.strict !== false;
  return {
    validate(v, path, issues) {
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        return push(issues, path, "type", `expected object, got ${typeName(v)}`);
      }
      const o = v as Record<string, unknown>;
      for (const [key, sch] of Object.entries(shape)) {
        const childPath = `${path}/${key}`;
        if (!(key in o) || o[key] === undefined) {
          if (!isOptional(sch)) push(issues, childPath, "required", `missing required field '${key}'`);
          continue;
        }
        sch.validate(o[key], childPath, issues);
      }
      if (strict) {
        for (const key of Object.keys(o)) {
          if (!(key in shape)) push(issues, `${path}/${key}`, "unrecognized-key", `unknown field '${key}'`);
        }
      }
    },
    json: () => {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, sch] of Object.entries(shape)) {
        properties[key] = sch.json();
        if (!isOptional(sch)) required.push(key);
      }
      const j: Record<string, unknown> = { type: "object", properties, additionalProperties: !strict };
      if (required.length) j.required = required;
      return j;
    },
  };
}

export function union<T extends readonly Schema<unknown>[]>(
  schemas: T,
): Schema<Infer<T[number]>> {
  return {
    validate(v, path, issues) {
      for (const s of schemas) {
        const local: SchemaIssue[] = [];
        s.validate(v, path, local);
        if (local.length === 0) return; // matched a branch
      }
      push(issues, path, "union", `did not match any allowed shape`);
    },
    json: () => ({ anyOf: schemas.map((s) => s.json()) }),
  };
}

/** Lazy reference for recursive schemas. Emits a JSON Schema $ref by name. */
export function lazy<T>(name: string, thunk: () => Schema<T>): Schema<T> {
  return {
    validate: (v, path, issues) => thunk().validate(v, path, issues),
    json: () => ({ $ref: `#/$defs/${name}` }),
  };
}

/** Wrap a root schema into a draft-07 document, with optional named $defs. */
export function jsonSchemaDocument(
  schema: Schema<unknown>,
  opts: { id: string; title: string; defs?: Record<string, Schema<unknown>> },
): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: opts.id,
    title: opts.title,
    ...schema.json(),
  };
  if (opts.defs) {
    doc.$defs = Object.fromEntries(Object.entries(opts.defs).map(([k, s]) => [k, s.json()]));
  }
  return doc;
}
