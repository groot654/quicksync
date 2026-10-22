import { vi } from "vitest";

export type QueryResult = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number | null;
};

export type RecordedQuery = {
  table: string;
  calls: Array<[method: string, ...args: unknown[]]>;
};

/**
 * Minimal chainable stand-in for the Supabase query builder. Every call is recorded;
 * awaiting the chain (or calling single/maybeSingle) resolves to the next queued result.
 */
export function createFakeSupabase(results: QueryResult[]) {
  const queue = [...results];
  const queries: RecordedQuery[] = [];

  const from = vi.fn((table: string) => {
    const query: RecordedQuery = { table, calls: [] };
    queries.push(query);

    const resolveNext = () => {
      const next = queue.shift() ?? { data: null, error: null };
      return Promise.resolve({ data: null, error: null, count: null, ...next });
    };

    const builder: Record<string, unknown> = {};
    for (const method of [
      "select",
      "insert",
      "delete",
      "update",
      "eq",
      "gt",
      "lt",
      "or",
      "order",
      "limit",
      "in",
    ]) {
      builder[method] = (...args: unknown[]) => {
        query.calls.push([method, ...args]);
        return builder;
      };
    }
    builder.single = () => {
      query.calls.push(["single"]);
      return resolveNext();
    };
    builder.maybeSingle = () => {
      query.calls.push(["maybeSingle"]);
      return resolveNext();
    };
    builder.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => resolveNext().then(onFulfilled, onRejected);

    return builder;
  });

  return { client: { from } as never, from, queries };
}

export function callsOf(query: RecordedQuery, method: string) {
  return query.calls.filter(([name]) => name === method).map(([, ...args]) => args);
}
