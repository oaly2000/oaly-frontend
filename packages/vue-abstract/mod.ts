// deno-lint-ignore-file no-explicit-any
/**
 * 一些用于后台管理系统的组件(强烈推荐使用TSX语法).
 *
 * Some components for management systems.
 *
 * @module
 */

import { computed, defineComponent, h, inject, onUnmounted, provide, shallowRef, watchEffect } from "vue";
import type { FunctionalComponent, InjectionKey, PropType, Ref } from "vue";
import { createSender, type Sender } from "@oaly/mediator";

//#region load data

/**
 * 用于刷新数据 | Used to reload data.
 */
export const LoaderInjectKey = Symbol("LoaderInjectKey") as InjectionKey<Ref<() => Promise<any>>>;

type RemoteValuesProps = { loader: () => Promise<any> };

/**
 * 该组件可以用来加载任意远程数据, 当数据未加载完成时, values为空.
 *
 * It can be used to load any remote data. When the data is not loaded, values is empty.
 *
 * see {@link LoaderInjectKey}
 *
 * ### jsx usage
 * ```tsx
 * <RemoteValues loader={() => {
 *   return Promise.resolve([{ label: "Alpha", value: "a" }, { label: "Beta", value: "b" }])
 * }}>
 *   {({ values }: { values?: Array<{ label: string; value: string }> }) => (
 *     <ElSelect>
 *       {values?.map(({ label, value }) => (
 *         <ElOption key={value} label={label} value={value} />
 *       ))}
 *     </ElSelect>
 *   )}
 * </RemoteValues>
 * ```
 *
 * ### sfc usage
 * ```html
 * <RemoteValues :loader="() => {
 *   return Promise.resolve([{ label: 'Alpha', value: 'a' }, { label: 'Beta', value: 'b' }])
 * }">
 *   <template #default="{ values }">
 *     <ElSelect>
 *       <ElOption v-for="{ label, value } in values ?? []" :key="value" :label="label" :value="value" />
 *     </ElSelect>
 *   </template>
 * </RemoteValues>
 * ```
 */
export const RemoteValues = defineComponent({
  name: "RemoteValues",
  props: {
    loader: {
      type: Function as PropType<() => Promise<any>>,
      required: true,
    },
  },
  setup(props, ctx) {
    const valuesRef = shallowRef<any>(null);
    const loader = computed(() => () => props.loader().then((v: any) => (valuesRef.value = v)));

    watchEffect(() => {
      loader.value();
    });

    provide(LoaderInjectKey, loader);

    return () => ctx.slots.default?.({ values: valuesRef.value });
  },
}) as any as FunctionalComponent<RemoteValuesProps>;

type QueryableRemoteValuesPayload =
  | ["query", any]
  | ["pagination", { page: number; perPage: number }];

/**
 * 将返回值 sender 传递给 {@link QueryableRemoteValues}, 然后就可以通过 sender 发送查询条件和分页以刷新数据
 *
 * Pass the return value 'sender' to the {@link QueryableRemoteValues} and then you can use the 'sender' to send query and pagination to reload values
 *
 * @param id unique id for pub/sub
 */
export const useQueryableRemoteValues = (id: string): Sender<QueryableRemoteValuesPayload, void> =>
  createSender<QueryableRemoteValuesPayload, void>(id);

type QueryableRemoteValuesProps = {
  loader: (query: any, pagination: { page?: number; perPage?: number }) => Promise<any>;
  /**
   * see {@link useQueryableRemoteValues}
   */
  sender: Sender<QueryableRemoteValuesPayload, void>;
};

/**
 * see {@link useQueryableRemoteValues}
 *
 * 这个组件是对 {@link RemoteValues} 的封装，用法一致.
 *
 * This component is a wrapper for {@link RemoteValues}, the usage is the same.
 *
 * ### jsx usage
 * ```tsx
 * import { createSender } from "@oaly/mediator";
 *
 * const sender = useQueryableRemoteValues("app");
 *
 * const dataSource = Array.from({ length: 100 }).map((_, index) => ({
 *   id: index,
 *   name: "用户-" + (index > 50 ? "A-" : "") + Math.floor(index / 6) + index,
 *   age: 18 + Math.floor(index / 4)
 * }));
 *
 * const loader = async (query: (typeof dataSource)[number], pagination) => {
 *   console.log("loading...", query, pagination);
 *
 *   const filtered = dataSource
 *     .filter((x) => (query.name ? x.name.includes(query.name) : true))
 *     .filter((x) => (query.age !== undefined ? x.age === query.age : true));
 *   const total = filtered.length;
 *
 *   const page = pagination.page ?? 1;
 *   const perPage = pagination.perPage ?? 10;
 *
 *   const result = {
 *     records: filtered.slice((page - 1) * perPage, page * perPage),
 *     total,
 *     perPage,
 *     page
 *   };
 *
 *   return result;
 * }
 *
 * // ...
 * <QueryableRemoteValues sender={sender} loader={loader}>
 *   {({ values }) => <pre>{JSON.stringify(values, null, 2)}</pre>}
 * </QueryableRemoteValues>
 * ```
 *
 * ### sfc usage
 * ```html
 * <QueryableRemoteValues :sender="sender" :loader="loader">
 *   <template #default="{ values }">
 *     <pre>{{ JSON.stringify(values, null, 2) }}</pre>
 *   </template>
 * </QueryableRemoteValues>
 * ```
 */
export const QueryableRemoteValues = defineComponent({
  name: "QueryableRemoteValues",
  props: {
    loader: {
      type: Function as PropType<(query: any, pagination: { page?: number; perPage?: number }) => Promise<any>>,
      required: true,
    },
    sender: {
      type: Object as PropType<Sender<QueryableRemoteValuesPayload, void>>,
      required: true,
    },
  },
  setup(props, ctx) {
    const queryRef = shallowRef({});
    const paginationRef = shallowRef({});

    const loaderRef = computed(() => () => props.loader(queryRef.value, paginationRef.value));

    onUnmounted(
      props.sender.subscribe((payload: QueryableRemoteValuesPayload) => {
        if (payload[0] === "pagination") {
          paginationRef.value = payload[1];
        } else if (payload[0] === "query") {
          queryRef.value = payload[1];
        }
      }),
    );

    return () => h(RemoteValues, { loader: loaderRef.value }, ctx.slots);
  },
}) as any as FunctionalComponent<QueryableRemoteValuesProps>;

//#endregion

//#region permission control

export const ClaimsInjectKey = Symbol("ClaimsInjectKey") as InjectionKey<Ref<Array<string[] | string>>>;

type RequireClaimsProps = {
  /**
   * ```ts
   * // or
   * [["role:sa", "role:admin"]]
   *
   * // and
   * ["role:admin", "permission:edit"]
   * ```
   */
  claims: Array<string[] | string>;
  /**
   * @default "hide"
   */
  mode?: "disable" | "hide";
};

/**
 * 该组件可用于按钮/输入框的权限控制.
 *
 * It can be used to control the permission of buttons/inputs.
 *
 * see {@link ClaimsInjectKey}
 *
 * ### jsx usage
 * ```tsx
 * <RequireClaims claims={["role:admin"]} mode="disable">
 *  {({ forbidden }) => <button disabled={forbidden}>Submit</button>}
 * </RequireClaims>
 * ```
 *
 * ### sfc usage
 * ```html
 * <RequireClaims :claims="['role:admin']" mode="disable">
 *  <template #default="{ forbidden }">
 *    <button :disabled="forbidden">Submit</button>
 *  </template>
 * </RequireClaims>
 * ```
 */
export const RequireClaims = defineComponent({
  name: "RequireClaims",
  props: {
    claims: {
      type: Array as PropType<Array<string[] | string>>,
      required: true,
    },
    mode: {
      type: String as PropType<"disable" | "hide">,
      default: "hide",
    },
  },
  setup(props, ctx) {
    const providedClaims = inject(ClaimsInjectKey);
    if (!providedClaims) throw new Error("'claims' is not provided");

    const forbidden = computed(() => {
      let result = true;
      for (const claims of props.claims) {
        if (Array.isArray(claims)) {
          result = claims.some((c) => providedClaims.value.includes(c));
        } else result = providedClaims.value.includes(claims);
        if (!result) break;
      }
      return result;
    });

    return () => props.mode === "disable" ? ctx.slots.default?.({ forbidden: forbidden.value }) : null;
  },
}) as any as FunctionalComponent<RequireClaimsProps>;

//#endregion
