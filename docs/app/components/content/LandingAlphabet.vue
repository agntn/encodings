<script setup lang="ts">
import { SAMPLE_INPUT, type LandingSample } from "../../composables/useLandingSample";
import { ENCODINGS, familyLabel, registryPosition } from "../../utils/encodings";
import { optionLiteral } from "../../utils/format";

const props = defineProps<{ sample: LandingSample; samples: readonly LandingSample[] }>();
const emit = defineEmits<{ step: [delta: number]; pause: [paused: boolean] }>();

const { copied, copy } = useCopied();

const entry = computed(() => props.sample.entry);
const optionsArg = computed(() =>
  Object.keys(props.sample.options).length > 0 ? `, ${optionLiteral(props.sample.options)}` : "",
);
const call = computed(
  () => `encode("${entry.value.slug}", "${SAMPLE_INPUT}"${optionsArg.value})`,
);

/** The input as one cell per byte; every byte of the sample is ASCII, so a byte is a character. */
const inputCells = [...SAMPLE_INPUT];
const bytes = new TextEncoder().encode(SAMPLE_INPUT).length;

/** The output on one line: uuencode and Quoted-Printable break lines, shown as ↵. */
const outLine = computed(() => props.sample.text.replace(/\n$/u, "").replaceAll("\n", "↵"));
const outLength = computed(() => props.sample.text.replaceAll(/\s/gu, "").length);

/** The widest alphabet in the walk: the grid keeps room for it, so the band never jumps. */
const widest = Math.max(...props.samples.map((sample) => sample.cells.length));
const slots = computed(() =>
  Array.from({ length: widest }, (_, index) => props.sample.cells[index]),
);

/** What the text carries besides data: a checksum, padding, or neither. */
const guard = computed(() => {
  if (entry.value.info.checksum) return { label: "Checksum", value: "verified on decode" };
  if (entry.value.info.padding) return { label: "Padding", value: "= to a whole block" };
  return { label: "Padding", value: "none" };
});

/** One tick per registered encoding, the sample's family open. */
const ticks = computed(() =>
  ENCODINGS.map((encoding) => ({
    slug: encoding.slug,
    open: encoding.info.family === entry.value.info.family,
  })),
);
const kin = computed(() => ticks.value.filter((tick) => tick.open).length);
</script>

<template>
  <section
    class="tool-console console-wide landing-alphabet"
    aria-label="One text through one encoding, against the encoding's alphabet"
    @mouseenter="emit('pause', true)"
    @mouseleave="emit('pause', false)"
    @focusin="emit('pause', true)"
    @focusout="emit('pause', false)"
  >
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <UTooltip :text="call">
        <span class="console-title alphabet-call" tabindex="0"
          ><span class="console-tag">Call</span>encode(<span class="tok-str"
            >"{{ entry.slug }}"</span
          >, <span class="tok-str">"{{ SAMPLE_INPUT }}"</span>{{ optionsArg }})</span
        >
      </UTooltip>
      <span class="console-meta"
        >{{ familyLabel(entry.info.family).toLowerCase() }} ·
        {{ String(registryPosition(entry.slug)).padStart(2, "0") }} / {{ ENCODINGS.length }}</span
      >
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="entry.slug" class="console-cursor" />
    </div>

    <div class="console-band console-subject-band alphabet-subject">
      <div :key="entry.slug" class="console-scan" aria-hidden="true" />
      <div class="alphabet-left">
        <div class="console-identity-block">
          <ConsoleReticle :key="entry.slug" :icon="entry.icon" />
          <!-- Every sample's name sits in the same cell, hidden, so the band keeps the tallest one's height. -->
          <div class="alphabet-names">
            <div
              v-for="other in samples"
              :key="other.entry.slug"
              class="console-name"
              :class="{ 'alphabet-sizer': other.entry.slug !== entry.slug }"
              :aria-hidden="other.entry.slug !== entry.slug ? 'true' : undefined"
            >
              <span class="console-label"
                >Encoding / <span class="console-label-key">{{ other.entry.info.family }}</span></span
              >
              <h3>{{ other.entry.info.label }}</h3>
              <p class="console-about">{{ other.entry.blurb }}.</p>
            </div>
          </div>
        </div>

        <div class="alphabet-board">
          <p class="console-label console-rule-title">
            <span>Alphabet <span aria-hidden="true">[ what it writes, the sample's characters lit ]</span></span>
            <span class="console-mark" aria-hidden="true" />
            <UButton
              color="neutral"
              variant="subtle"
              :icon="copied === 'text' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'text' ? 'copied' : 'copy'"
              :aria-label="copied === 'text' ? 'Copied' : 'Copy the encoded text'"
              @click="copy('text', sample.text)"
            />
          </p>

          <div class="alphabet-row">
            <span class="console-tag">In</span>
            <span class="alphabet-cells" :aria-label="SAMPLE_INPUT">
              <span
                v-for="(cell, index) in inputCells"
                :key="index"
                class="alphabet-cell"
                :data-blank="cell === ' ' ? '' : undefined"
                aria-hidden="true"
                >{{ cell === " " ? "·" : cell }}</span
              >
            </span>
            <span class="alphabet-count">{{ bytes }} bytes</span>
          </div>
          <div class="alphabet-row">
            <span class="console-tag alphabet-tag-out">Out</span>
            <UTooltip :text="outLine">
              <span :key="entry.slug" class="alphabet-text" tabindex="0">{{ outLine }}</span>
            </UTooltip>
            <span class="alphabet-count">{{ outLength }} chars</span>
          </div>

          <div
            :key="entry.slug"
            class="alphabet-grid"
            role="img"
            :aria-label="`${sample.usedCount} of ${sample.cells.length} alphabet characters used`"
          >
            <span
              v-for="(cell, index) in slots"
              :key="index"
              class="alphabet-glyph"
              :data-state="cell === undefined ? 'none' : cell.used ? 'used' : 'idle'"
              :style="{ animationDelay: `${Math.min(index * 4, 600)}ms` }"
              >{{ cell?.character === " " ? "␠" : cell?.character }}</span
            >
          </div>
        </div>
      </div>

      <div class="console-readout">
        <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
          <circle cx="3" cy="12" r="2.5" />
          <path d="M5.5 12H14L22 20H32" />
        </svg>
        <dl :key="entry.slug" class="console-readout-rows console-animate">
          <div>
            <dt>Size</dt>
            <dd>
              <span class="alphabet-line">{{ bytes }} bytes → {{ outLength }} chars</span>
            </dd>
          </div>
          <div>
            <dt>Overhead</dt>
            <dd class="console-accent">
              <span class="alphabet-line"
                >{{ sample.overhead >= 0 ? "+" : "" }}{{ sample.overhead }}% ·
                {{ sample.usedCount }} of {{ sample.cells.length }} used</span
              >
            </dd>
          </div>
          <div>
            <dt>{{ guard.label }}</dt>
            <dd>
              <span class="alphabet-line" :class="{ 'alphabet-none': guard.value === 'none' }">{{
                guard.value
              }}</span>
            </dd>
          </div>
          <div>
            <dt>{{ entry.usedBy ? "Used by" : "Standard" }}</dt>
            <dd>
              <UTooltip :text="entry.usedBy ?? entry.info.standard">
                <span class="alphabet-line" tabindex="0">{{
                  entry.usedBy ?? entry.info.standard
                }}</span>
              </UTooltip>
            </dd>
          </div>
        </dl>
        <div class="console-gauge" :aria-label="`${kin} of ${ENCODINGS.length} encodings in this family`">
          <span class="console-ticks" aria-hidden="true">
            <span
              v-for="(tick, index) in ticks"
              :key="tick.slug"
              :class="tick.open ? 'console-tick-open' : 'console-tick-closed'"
              :style="{ animationDelay: `${index * 12}ms` }"
            />
          </span>
          <span class="console-gauge-read">family {{ kin }} / {{ ENCODINGS.length }}</span>
        </div>
      </div>
    </div>

    <footer class="console-footer console-footer-plain">
      <NuxtLink :to="entry.to" class="alphabet-link"
        ><span aria-hidden="true">→ </span>{{ entry.info.label }}<span> · {{ entry.to }}</span></NuxtLink
      >
      <div class="console-controls" aria-label="Sample encodings">
        <UButton
          color="neutral"
          variant="subtle"
          square
          icon="i-lucide-chevron-left"
          aria-label="Previous encoding"
          @click="emit('step', -1)"
        />
        <span>Encode</span>
        <UButton
          color="neutral"
          variant="subtle"
          square
          icon="i-lucide-chevron-right"
          aria-label="Next encoding"
          @click="emit('step', 1)"
        />
      </div>
    </footer>
  </section>
</template>

<style scoped>
.alphabet-call {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alphabet-names {
  display: grid;
  min-width: 0;
}
.alphabet-names > .console-name {
  grid-area: 1 / 1;
}
.alphabet-sizer {
  visibility: hidden;
}
.alphabet-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alphabet-none {
  color: var(--ui-text-dimmed);
}
.landing-alphabet :deep(.console-readout-rows > div) {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
/* The left column: the encoding, then the sample in and out and the alphabet right under it. */
.alphabet-left {
  display: grid;
  gap: 18px;
  min-width: 0;
}
.alphabet-board {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.alphabet-board > .console-rule-title {
  margin: 0 0 2px;
}
.alphabet-row {
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.alphabet-row > .console-tag {
  justify-self: start;
  margin: 0;
}
.alphabet-tag-out {
  color: var(--console-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--console-accent) 55%, transparent);
}
.alphabet-cells {
  display: flex;
  gap: 3px;
  min-width: 0;
  overflow: hidden;
  mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent);
}
.alphabet-cell {
  display: grid;
  flex: none;
  place-items: center;
  min-width: 20px;
  height: 24px;
  padding: 0 3px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ui-text-muted);
  background: var(--ui-bg);
  box-shadow: inset 0 0 0 1px var(--console-line);
}
.alphabet-cell[data-blank] {
  color: var(--ui-text-dimmed);
  box-shadow: inset 0 0 0 1px var(--ui-border-muted);
}
.alphabet-text {
  display: block;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: pre;
  color: var(--console-accent);
}
.alphabet-count {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  white-space: nowrap;
  color: var(--ui-text-dimmed);
}
/* One cell per alphabet character, 32 to a row; a character the sample used is open in the accent. */
.alphabet-grid {
  display: grid;
  grid-template-columns: repeat(32, minmax(0, 1fr));
  gap: 2px;
  margin-top: 8px;
}
.alphabet-glyph {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  animation: alphabet-in 0.24s ease-out both;
}
.alphabet-glyph[data-state="idle"] {
  color: var(--ui-text-dimmed);
  background: color-mix(in srgb, var(--ui-text-muted) 10%, var(--ui-bg));
}
.alphabet-glyph[data-state="used"] {
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 0 0 1px var(--console-accent);
  background: color-mix(in srgb, var(--console-accent) 26%, var(--ui-bg));
}
.alphabet-glyph[data-state="none"] {
  animation: none;
}
@keyframes alphabet-in {
  from {
    transform: translateY(-3px);
  }
}
/* Side by side, the readout runs as tall as the board beside it; stacked, it keeps its own height. */
@container (width >= 46rem) {
  .alphabet-subject > .console-readout {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    align-self: stretch;
  }
  .alphabet-subject .console-readout-rows {
    grid-auto-rows: minmax(2.5rem, 1fr);
  }
  .alphabet-subject .console-readout-rows > div {
    align-items: center;
  }
}
.alphabet-link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.alphabet-link > span:last-child {
  color: var(--ui-text-dimmed);
}
.alphabet-link:hover {
  color: var(--console-accent);
}
.alphabet-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 3px;
}
@media (width < 640px) {
  .alphabet-board > .console-rule-title > .console-mark {
    display: none;
  }
  .alphabet-grid {
    grid-template-columns: repeat(16, minmax(0, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .alphabet-glyph {
    animation: none;
  }
}
</style>
