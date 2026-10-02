<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { ENCODINGS, overhead, type EncodingEntry } from "../../utils/encodings";
import { ROSTER_CLASS, ROSTER_TABLE_UI } from "../../utils/roster";

interface Row {
  readonly entry: EncodingEntry;
  readonly slug: string;
  readonly label: string;
  /** Characters in the alphabet. */
  readonly alphabet: number;
  /** Percent longer than the bytes, measured on pseudo-random input. */
  readonly overhead: number;
  readonly checksum: string;
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly standard: string;
}

/** One family only; every encoding when left out. */
const props = defineProps<{ family?: string }>();

/** Every value comes from `info()` or the library itself; the listing order is the default. */
const rows = computed<Row[]>(() =>
  ENCODINGS.filter((entry) => props.family === undefined || entry.info.family === props.family).map(
    (entry) => ({
      entry,
      slug: entry.slug,
      label: entry.info.label,
      alphabet: entry.info.alphabet.length,
      overhead: overhead(entry),
      checksum: entry.info.checksum ? "yes" : "no",
      required: entry.info.options.filter((option) => option.required).map((option) => option.name),
      optional: entry.info.options.filter((option) => !option.required).map((option) => option.name),
      standard: entry.info.standard,
    }),
  ),
);

const sorting = ref<{ id: string; desc: boolean }[]>([]);

const roster = useTemplateRef<HTMLElement>("roster");
useRosterFlip(
  () => roster.value,
  () => sorting.value,
);

const allColumns: TableColumn<Row>[] = [
  { accessorKey: "label", header: "Encoding", sortingFn: "text", meta: { class: { th: "w-[15rem]" } } },
  {
    accessorKey: "alphabet",
    header: "Alphabet",
    sortingFn: "basic",
    meta: { class: { th: "w-[6rem]", td: "@max-[52rem]/roster:justify-self-end" } },
  },
  {
    accessorKey: "overhead",
    header: "Overhead",
    sortingFn: "basic",
    meta: { class: { th: "w-[6.5rem]" } },
  },
  {
    accessorKey: "checksum",
    header: "Checksum",
    sortingFn: "text",
    meta: { class: { th: "w-[6rem]" } },
  },
  {
    id: "options",
    header: "Options",
    enableSorting: false,
    meta: { class: { th: "w-[9rem]", td: "min-w-0" } },
  },
  {
    id: "standard",
    header: "Standard",
    enableSorting: false,
    meta: { class: { th: "w-[11rem]" } },
  },
];

const columns = allColumns;

const order = computed(() => {
  const [first] = sorting.value;
  if (first === undefined) return "listing order";
  const label = allColumns.find(
    (column) => "accessorKey" in column && column.accessorKey === first.id,
  )?.header;
  return `by ${String(label).toLowerCase()} ${first.desc ? "descending" : "ascending"}`;
});
</script>

<template>
  <section ref="roster" class="roster not-prose my-6" aria-label="Encodings">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>
    <header :class="ROSTER_CLASS.bar">
      <span :class="ROSTER_CLASS.title">{{
        family ? `encodings list --family ${family}` : "encodings()"
      }}</span>
      <span :class="ROSTER_CLASS.meta">{{ rows.length }} {{ rows.length === 1 ? "encoding" : "encodings" }} · {{ order }}</span>
    </header>
    <div class="roster-ruler" aria-hidden="true" />
    <UTable
      v-model:sorting="sorting"
      :data="rows"
      :columns="columns"
      :get-row-id="(row) => row.slug"
      :ui="ROSTER_TABLE_UI"
    >
      <template #label-header="{ column }"><RosterSort :column="column" label="Encoding" /></template>
      <template #alphabet-header="{ column }"><RosterSort :column="column" label="Alphabet" /></template>
      <template #overhead-header="{ column }"><RosterSort :column="column" label="Overhead" /></template>
      <template #checksum-header="{ column }"><RosterSort :column="column" label="Checksum" /></template>
      <template #label-cell="{ row }">
        <NuxtLink :to="row.original.entry.to" :class="[ROSTER_CLASS.name, 'max-w-full items-baseline']">
          <UIcon
            :name="row.original.entry.icon"
            class="relative top-0.5 size-3.5 flex-none"
            aria-hidden="true"
          />
          <span class="truncate">{{ row.original.label }}</span>
          <span :class="[ROSTER_CLASS.id, 'flex-none']">{{ row.original.slug }}</span>
        </NuxtLink>
      </template>
      <template #alphabet-cell="{ row }">
        <span class="whitespace-nowrap text-highlighted"
          >{{ row.original.alphabet }}<span class="text-dimmed"> chars</span></span
        >
      </template>
      <template #overhead-cell="{ row }">
        <span class="whitespace-nowrap text-highlighted"
          ><span class="@min-[52rem]/roster:hidden text-dimmed">overhead </span>+{{
            row.original.overhead
          }}%</span
        >
      </template>
      <template #checksum-cell="{ row }">
        <span :class="row.original.checksum === 'yes' ? 'text-highlighted' : 'text-dimmed'"
          ><span class="@min-[52rem]/roster:hidden">checksum </span>{{ row.original.checksum }}</span
        >
      </template>
      <template #options-cell="{ row }">
        <span v-if="row.original.required.length || row.original.optional.length" class="whitespace-nowrap text-muted"
          ><template v-for="(name, index) in row.original.required" :key="name"
            ><span class="text-highlighted">{{ name }}</span
            ><template v-if="index < row.original.required.length - 1 || row.original.optional.length"
              >,
            </template></template
          ><template v-for="(name, index) in row.original.optional" :key="name"
            >{{ name }}<span class="text-dimmed">?</span
            ><template v-if="index < row.original.optional.length - 1">, </template></template
          ></span
        >
        <span v-else class="whitespace-nowrap text-dimmed">no options</span>
      </template>
      <template #standard-cell="{ row }">
        <span :class="ROSTER_CLASS.count"
          ><span :class="ROSTER_CLASS.leader" aria-hidden="true" /><UTooltip :text="row.original.standard"
            ><span class="min-w-0 truncate text-highlighted" tabindex="0">{{
              row.original.standard
            }}</span></UTooltip
          ></span
        >
      </template>
    </UTable>
    <footer :class="ROSTER_CLASS.footer">
      <span>read from the registry in your browser / no network</span>
      <span :class="ROSTER_CLASS.meta">overhead on random bytes · a name with ? is optional</span>
    </footer>
  </section>
</template>
