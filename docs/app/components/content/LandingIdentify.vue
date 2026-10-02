<script setup lang="ts">
import { encodings } from "@agntn/encodings";
import type { LandingSample } from "../../composables/useLandingSample";
import { clip } from "../../utils/format";
import { identifyAnswer } from "../../utils/tools";

const props = defineProps<{ sample: LandingSample }>();
const emit = defineEmits<{ pause: [paused: boolean] }>();

const slug = computed(() => props.sample.entry.slug);
const text = computed(() => props.sample.text);

/** The ranking `encodings_identify` hands a model, from the executor the tool runs. */
const answer = computed(() => identifyAnswer(text.value, 3));
/** Every encoding that reads the text at all, for the gauge. */
const readers = computed(() => identifyAnswer(text.value, 20).candidates.map((candidate) => candidate.encoding));
const best = computed(() => answer.value.candidates[0]);

/** Three rows always, so the console keeps one height; a missing candidate is an empty row. */
const rows = computed(() =>
  Array.from({ length: 3 }, (_, index) => {
    const candidate = answer.value.candidates[index];
    if (!candidate) return undefined;
    const shown = candidate.text === undefined ? `hex ${candidate.hex}` : JSON.stringify(candidate.text);
    return { ...candidate, shown: clip(shown, 48), full: shown, hit: candidate.encoding === slug.value };
  }),
);

const ticks = computed(() =>
  encodings().map((name) => ({ name, open: readers.value.includes(name) })),
);

const title = computed(() => `encodings_identify(${JSON.stringify(text.value)})`);
const verdict = computed(() => {
  if (!best.value) return { label: "nobody", rest: "reads it" };
  return best.value.encoding === slug.value
    ? { label: best.value.encoding, rest: "it is" }
    : { label: best.value.encoding, rest: `ties with ${slug.value}` };
});
const about = computed(() => {
  if (!best.value) return "No encoding turns this text into anything but itself. Plain text is plain text.";
  const reasons = best.value.reasons.join(", ");
  return reasons ? `${reasons.charAt(0).toUpperCase()}${reasons.slice(1)}.` : "Only the alphabet fits, nothing more.";
});
const playground = computed(() => `/playground?op=identify&text=${encodeURIComponent(text.value)}`);
</script>

<template>
  <section
    class="tool-console landing-identify"
    aria-label="One encoded text, and the encodings that read it"
    @mouseenter="emit('pause', true)"
    @mouseleave="emit('pause', false)"
    @focusin="emit('pause', true)"
    @focusout="emit('pause', false)"
  >
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>
    <header class="console-bar">
      <UTooltip :text="title">
        <span class="console-title verify-call" tabindex="0"
          ><span class="console-tag">Call</span>encodings_identify(<span class="tok-str">{{
            JSON.stringify(text)
          }}</span>)</span
        >
      </UTooltip>
      <span class="console-meta">ranked</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="slug" class="console-cursor" />
    </div>

    <!-- The best guess on the crosses grid, then the top three and a tick per encoding that reads the text. -->
    <div class="verify-subject">
      <div :key="slug" class="console-scan" aria-hidden="true" />
      <div class="verify-identity">
        <ConsoleReticle :key="slug" icon="i-lucide-scan-search" />
        <div class="verify-name">
          <span class="console-label">Guess / <span class="console-label-key">{{ best?.confidence ?? "none" }}</span></span>
          <h3>
            <span class="verify-hit">{{ verdict.label }}</span>, {{ verdict.rest }}
          </h3>
          <p class="console-about identify-about">{{ about }}</p>
        </div>
      </div>
      <div class="console-readout">
        <ol :key="slug" class="console-animate verify-rows">
          <li
            v-for="(row, index) in rows"
            :key="row?.encoding ?? `empty-${index}`"
            :data-hit="row?.hit ? '' : undefined"
            :style="{ animationDelay: `${index * 45}ms` }"
          >
            <template v-if="row">
              <span class="verify-encoding">{{ row.encoding }}</span>
              <UTooltip :text="row.full">
                <span class="verify-expected" tabindex="0">{{ row.shown }}</span>
              </UTooltip>
              <UBadge :color="row.hit ? 'primary' : 'neutral'" variant="outline" :label="row.confidence.toFixed(3)" />
            </template>
            <span v-else class="verify-encoding identify-empty">no other reading</span>
          </li>
        </ol>
        <div
          class="console-gauge"
          :aria-label="`${readers.length} of ${ticks.length} encodings decode this text`"
        >
          <span class="console-ticks" aria-hidden="true">
            <span
              v-for="(tick, index) in ticks"
              :key="tick.name"
              :class="tick.open ? 'console-tick-open' : 'console-tick-closed'"
              :style="{ animationDelay: `${index * 12}ms` }"
            />
          </span>
          <span class="console-gauge-read">{{ readers.length }} of {{ ticks.length }} read it</span>
        </div>
      </div>
    </div>

    <ConsoleResponse :title="title" :text="answer.text" />

    <footer class="console-footer console-footer-plain">
      <span>In your browser / no network</span>
      <NuxtLink :to="playground" class="verify-link"
        ><span aria-hidden="true">→ </span>identify your own string</NuxtLink
      >
    </footer>
  </section>
</template>

<style scoped>
.verify-call {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.verify-subject {
  position: relative;
  display: grid;
  gap: 16px;
  padding: 18px 20px 20px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Cpath d='M16 18h4m-2-2v4' fill='none' stroke='%23818a94' stroke-opacity='.1'/%3E%3C/svg%3E");
  background-size: 36px 36px;
  background-position: 24px 20px;
}
.verify-subject > :not(.console-scan) {
  position: relative;
}
.verify-identity {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
}
.verify-name {
  min-width: 0;
}
.verify-name h3 {
  margin: 4px 0 6px;
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 400;
  line-height: 1.25;
  color: var(--ui-text-highlighted);
}
.verify-hit {
  color: var(--console-accent);
}
.verify-name .console-about {
  font-size: 14px;
}
.verify-rows {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
/* One row per candidate: the encoding, what it decodes to on one line, the score. The sample's own encoding carries the accent edge. */
.verify-rows > li {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  font-size: 12px;
}
.verify-rows > li + li {
  border-top: 1px solid var(--console-line);
}
.verify-rows > li[data-hit] {
  background: color-mix(in srgb, var(--ui-primary) 5%, var(--ui-bg));
  box-shadow: inset 2px 0 0 var(--console-accent);
}
.verify-encoding {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-dimmed);
}
.verify-expected {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
}
.identify-about {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.identify-empty {
  grid-column: 1 / -1;
  min-height: 22px;
  line-height: 22px;
}
.verify-link {
  margin-left: auto;
  color: var(--ui-text-highlighted);
}
.verify-link:hover {
  color: var(--console-accent);
}
.verify-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 3px;
}
@media (width < 400px) {
  .verify-subject {
    padding-inline: 14px;
  }
  .verify-identity {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
  }
}
</style>
