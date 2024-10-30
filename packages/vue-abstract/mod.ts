// deno-lint-ignore-file no-explicit-any
/**
 * @example RemoteValues
 * ```tsx
 * <RemoteValues loader={() => Promise.resolve([{ label: "Alpha", value: "a" }, { label: "Beta", value: "b" }])}>
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
 * @module
 */

import { computed, defineComponent, h, onUnmounted, provide, shallowRef, watchEffect } from "vue";
import type { FunctionalComponent, InjectionKey, PropType, Ref } from "vue";
import { createSender, type Sender } from "@oaly/mediator";

/**
 * 用于刷新数据 | Used to reload data.
 */
export const LoaderInjectKey = Symbol("LoaderInjectKey") as InjectionKey<Ref<() => Promise<any>>>;

type RemoteValuesProps = { loader: () => Promise<any> };

/**
 * @slot default: ({ values }: { values: any }) => VNode
 *
 * see {@link LoaderInjectKey}
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
    const valuesRef = shallowRef<any>();
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
        loaderRef.value();
      }),
    );

    return () => h(RemoteValues, { loader: loaderRef.value }, ctx.slots);
  },
}) as any as FunctionalComponent<QueryableRemoteValuesProps>;
