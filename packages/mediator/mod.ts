// deno-lint-ignore-file no-explicit-any
/**
 * A lightweight pub/sub.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 *
 * Deno.test("sender", async (t) => {
 *    const sender = createSender<string, number>('parse');
 *
 *    const unsubscribe = sender.subscribe((payload) => Number(payload));
 *
 *    const result = await sender.publish('123');
 *
 *    assertEquals(result, 123);
 *
 *    unsubscribe();
 *
 *    assertEquals(sender.publish('123'), undefined);
 * })
 * ```
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 *
 * Deno.test("notifier", async (t) => {
 *   const notifier = createNotifier<string>('');
 *   const collect1 = [] as string[];
 *   const collect2 = [] as number[];
 *
 *   const unsubscribe = mergeSubscriptions(
 *     notifier.subscribe((payload) => {
 *       collect1.push(payload);
 *     }),
 *     notifier.subscribe((payload) => {
 *       collect2.push(payload.length);
 *     })
 *   );
 *
 *   notifier.publish('123');
 *
 *   assertEquals(collect1, ['123']);
 *   assertEquals(collect2, [3]);
 *
 *   unsubscribe();
 *
 *   notifier.publish('123');
 *
 *   assertEquals(collect1, ['123']);
 *   assertEquals(collect2, [3]);
 * });
 * ```
 * @module
 */

type MaybePromise<T> = T | Promise<T>;

type Handler<Payload = any, Result = any> = (payload: Payload) => MaybePromise<Result>;

export type Sender<P = any, R = any> = {
  subscribe: (handler: Handler<P, R>) => () => void;
  publish: (payload: P) => MaybePromise<R> | void;
};

export type Notifier<P = any> = { subscribe: (handler: Handler<P, void>) => () => void; publish: (payload: P) => MaybePromise<void> };

const registry = new Map<string, Handler | Handler[]>();

/**
 * @internal
 *
 * 类型不安全, 因此不作为公共API
 *
 * It is type unsafe.
 */
const subscribe = <Payload, Result>(cmd: string, handler: Handler<Payload, Result>, multicast = false) => {
  multicast ? registry.set(cmd, [...((registry.get(cmd) as Handler[]) || []), handler]) : registry.set(cmd, handler);
  return () => {
    multicast ? (registry.get(cmd) as Handler[]).splice((registry.get(cmd) as Handler[]).indexOf(handler), 1) : registry.delete(cmd);
  };
};

/**
 * Unicast | 单播
 */
export function createSender<Payload, Result>(cmd: string): Sender<Payload, Result> {
  return {
    subscribe: (handler: Handler<Payload, Result>) => subscribe(cmd, handler, false),
    publish: (payload: Payload) => {
      return (registry.get(cmd) as Handler<Payload, Result>)?.(payload);
    },
  };
}

/**
 * Multicast | 多播
 */
export function createNotifier<Payload>(cmd: string): Notifier<Payload> {
  return {
    subscribe: (handler: Handler<Payload, void>) => subscribe(cmd, handler, true),
    publish: async (payload: Payload) => {
      const results = (registry.get(cmd) as Handler<Payload, void>[] | undefined)?.map((h) => h(payload));
      results && (await Promise.allSettled(results));
    },
  };
}

export function mergeSubscriptions(...manyUnsub: (() => void)[]): () => void {
  return () => {
    for (const unsub of manyUnsub) unsub();
  };
}
