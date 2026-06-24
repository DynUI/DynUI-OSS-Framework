/**
 * Minimal JSON value type used across all contracts.
 * Contracts are transport-neutral: everything serializes to JSON so it can cross
 * the wire between the design tool, the registry, the generation service, and the
 * native renderer.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
