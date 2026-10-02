<script setup lang="ts">
import { create } from "@agntn/encodings";
import { SAMPLE_INPUT } from "../../composables/useLandingSample";
import {
  ENCODINGS,
  SAMPLE_OPTIONS,
  alphabetCells,
  alphabetSize,
  checksumOption,
  codecExport,
  encodingEntry,
  familyLabel,
  overhead,
  registryPosition,
} from "../../utils/encodings";
import { optionFlags, optionLiteral, shellArg } from "../../utils/format";
import { toolText } from "../../utils/tools";

const props = defineProps<{ name: string }>();

const entry = computed(() => encodingEntry(props.name));
const position = computed(() => registryPosition(props.name));
const sampleOptions = computed(() => (entry.value ? (SAMPLE_OPTIONS[entry.value.slug] ?? {}) : {}));

/** The options in the order `info()` declares them. */
const options = computed(() =>
  (entry.value?.info.options ?? []).map((option) => ({
    ...option,
    requirement: option.required
      ? "required"
      : option.default === undefined || option.default === ""
        ? "optional"
        : `default ${option.default}`,
  })),
);
/** Other encodings in the same family, as links. */
const kin = computed(() =>
  ENCODINGS.filter(
    (encoding) => encoding.info.family === entry.value?.info.family && encoding.slug !== props.name,
  ),
);

/** The sample written in this encoding and read back, computed here with the page's own options. */
const sample = computed(() => {
  if (!entry.value) return undefined;
  const encoding = create(entry.value.slug);
  const text = encoding.encode(SAMPLE_INPUT, sampleOptions.value);
  const { bytes, details } = encoding.decode(text);
  return {
    text,
    line: text.replace(/\n$/u, "").replaceAll("\n", "↵"),
    back: new TextDecoder().decode(bytes),
    details: Object.entries(details)
      .map(([key, value]) => `${key} ${value}`)
      .join(", "),
  };
});
const used = computed(() => new Set(sample.value?.text ?? ""));
const cells = computed(() =>
  entry.value
    ? alphabetCells(entry.value.info).map((character) => ({ character, used: used.value.has(character) }))
    : [],
);
const call = computed(() => {
  const literal = optionLiteral(sampleOptions.value);
  return `encode("${props.name}", "${SAMPLE_INPUT}"${literal ? `, ${literal}` : ""})`;
});
const guard = computed(() => {
  if (!entry.value) return "";
  if (entry.value.info.checksum) return "checked on decode";
  const option = checksumOption(entry.value.info);
  if (option) return `with ${option}`;
  return entry.value.info.padding ? "= to a whole block" : "none";
});

const cli = computed(() => {
  if (!entry.value) return "";
  const flags = optionFlags(sampleOptions.value);
  return `encodings encode ${entry.value.slug} ${shellArg(SAMPLE_INPUT)}${flags ? ` ${flags}` : ""}`;
});
const subpath = computed(() =>
  entry.value ? `import { ${codecExport(entry.value)} } from "@agntn/encodings/${entry.value.info.family}"` : "",
);
const playground = computed(() => {
  if (!entry.value) return "/playground";
  const query = new URLSearchParams({ op: "encode", encoding: entry.value.slug, input: SAMPLE_INPUT });
  for (const [name, value] of Object.entries(sampleOptions.value)) query.set(name, String(value));
  return `/playground?${query.toString()}`;
});

const text = computed(() => (entry.value ? toolText("encodings_info", { encoding: entry.value.slug }) : ""));
const title = computed(() => `encodings_info("${props.name}")`);
</script>

<template>
  <section v-if="entry && sample" class="tool-console console-wide not-prose my-6" aria-label="Encoding record">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title"
        ><span class="console-tag">ID</span>{{ entry.slug
        }}<span class="console-file"
          >{{ String(position).padStart(2, "0") }} / {{ ENCODINGS.length }}</span
        ></span
      >
      <span class="console-meta">{{ entry.info.family }} · {{ alphabetSize(entry.info) }} characters</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true"><span class="console-cursor" /></div>

    <div class="console-band console-subject-band">
      <div class="console-scan" aria-hidden="true" />
      <div class="console-identity-block">
        <ConsoleReticle :key="entry.slug" :icon="entry.icon" />
        <div class="console-name">
          <span class="console-label">Encoding / {{ familyLabel(entry.info.family) }}</span>
          <h3>{{ entry.info.label }}</h3>
          <p class="console-about">{{ entry.blurb }}.</p>
        </div>
      </div>

      <div class="console-readout">
        <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
          <circle cx="3" cy="12" r="2.5" />
          <path d="M5.5 12H14L22 20H32" />
        </svg>
        <dl class="console-readout-rows">
          <div>
            <dt>Overhead</dt>
            <dd class="console-accent">
              <span class="facts-line">+{{ overhead(entry) }}% on random bytes</span>
            </dd>
          </div>
          <div>
            <dt>{{ entry.info.checksum || checksumOption(entry.info) ? "Checksum" : "Padding" }}</dt>
            <dd>
              <span class="facts-line" :class="{ 'facts-none': guard === 'none' }">{{ guard }}</span>
            </dd>
          </div>
          <div>
            <dt>Standard</dt>
            <dd>
              <UTooltip :text="entry.info.standard">
                <span class="facts-line" tabindex="0">{{ entry.info.standard }}</span>
              </UTooltip>
            </dd>
          </div>
          <div>
            <dt>{{ entry.usedBy ? "Used by" : "Family" }}</dt>
            <dd>
              <UTooltip v-if="entry.usedBy" :text="entry.usedBy">
                <span class="facts-line" tabindex="0">{{ entry.usedBy }}</span>
              </UTooltip>
              <span v-else class="facts-line">{{ kin.length + 1 }} in {{ entry.info.family }}</span>
            </dd>
          </div>
        </dl>
        <div class="console-gauge" :aria-label="`${kin.length + 1} of ${ENCODINGS.length} encodings in this family`">
          <span class="console-ticks" aria-hidden="true">
            <span
              v-for="(other, index) in ENCODINGS"
              :key="other.slug"
              :class="other.info.family === entry.info.family ? 'console-tick-open' : 'console-tick-closed'"
              :style="{ animationDelay: `${index * 12}ms` }"
            />
          </span>
          <span class="console-gauge-read">family {{ kin.length + 1 }} / {{ ENCODINGS.length }}</span>
        </div>
      </div>
    </div>

    <div class="console-band">
      <p class="console-label console-rule-title">
        <span
          >Sample <span aria-hidden="true">[ {{ call }}, computed here ]</span></span
        >
        <span class="console-mark" aria-hidden="true" />
      </p>
      <dl class="facts-sample">
        <div>
          <dt><span class="console-tag">Out</span></dt>
          <dd>
            <UTooltip :text="sample.line">
              <span class="facts-line facts-value" tabindex="0">{{ sample.line }}</span>
            </UTooltip>
          </dd>
        </div>
        <div>
          <dt><span class="console-tag">Back</span></dt>
          <dd>
            <span class="facts-line facts-value facts-back"
              >{{ JSON.stringify(sample.back) }}<span v-if="sample.details" class="facts-dim">
                · {{ sample.details }}</span
              ></span
            >
          </dd>
        </div>
      </dl>
      <div class="facts-alphabet" role="img" :aria-label="`${alphabetSize(entry.info)}-character alphabet`">
        <span
          v-for="(cell, index) in cells"
          :key="index"
          class="facts-glyph"
          :data-used="cell.used ? '' : undefined"
          >{{ cell.character === " " ? "␠" : cell.character }}</span
        >
      </div>
    </div>

    <div v-if="options.length" class="console-band">
      <p class="console-label console-rule-title">
        <span>Options <span aria-hidden="true">[ as info() declares them ]</span></span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <dl class="facts-options">
        <div v-for="option in options" :key="option.name">
          <dt>
            <code>{{ option.name }}</code>
            <span class="facts-type">{{ option.type }}</span>
          </dt>
          <dd class="facts-requirement" :data-required="option.required ? '' : undefined">
            {{ option.requirement }}
          </dd>
          <dd class="facts-description">{{ option.description }}</dd>
        </div>
      </dl>
    </div>

    <div class="console-band">
      <p class="console-label console-rule-title">
        <span>Access <span aria-hidden="true">[ library · CLI · playground ]</span></span>
        <span class="console-mark" aria-hidden="true" />
      </p>
      <dl class="facts-leads">
        <dd class="console-lead">
          <span class="console-tag">Import</span>
          <UTooltip :text="subpath">
            <code class="facts-code" tabindex="0"
              ><span class="tok-kw">import</span> { {{ codecExport(entry) }} } from
              <span class="tok-str">"@agntn/encodings/{{ entry.info.family }}"</span></code
            >
          </UTooltip>
          <span class="console-leader" aria-hidden="true" />
        </dd>
        <dd class="console-lead">
          <span class="console-tag">CLI</span>
          <UTooltip :text="cli">
            <code class="facts-code" tabindex="0"><span class="tok-fn">encodings</span> {{ cli.slice(10) }}</code>
          </UTooltip>
          <span class="console-leader" aria-hidden="true" />
        </dd>
        <dd class="console-lead">
          <span class="console-tag">Try</span>
          <NuxtLink :to="playground"
            >playground<span class="facts-dim"> with the sample above</span></NuxtLink
          >
          <span class="console-leader" aria-hidden="true" />
        </dd>
        <dd v-if="kin.length" class="console-lead">
          <span class="console-tag">Kin</span>
          <span class="facts-kin"
            ><template v-for="(other, index) in kin.slice(0, 4)" :key="other.slug"
              ><NuxtLink :to="other.to">{{ other.slug }}</NuxtLink
              ><template v-if="index < Math.min(kin.length, 4) - 1">, </template></template
            ><span v-if="kin.length > 4" class="facts-dim"> +{{ kin.length - 4 }}</span></span
          >
          <span class="console-leader" aria-hidden="true" />
        </dd>
      </dl>
    </div>

    <ConsoleResponse :title="title" :text="text" />

    <footer class="console-footer console-footer-plain">
      <ul class="console-links">
        <li>
          <NuxtLink to="/encodings"><span aria-hidden="true">→ </span>All encodings</NuxtLink>
        </li>
        <li>
          <NuxtLink to="/guide/encoding"><span aria-hidden="true">→ </span>Encoding and decoding</NuxtLink>
        </li>
      </ul>
      <span class="console-meta">in your browser / no network</span>
    </footer>
  </section>
</template>

<style scoped>
.facts-none {
  color: var(--ui-text-dimmed);
}
/* Values stay on one line for every encoding; the whole value is in the tooltip. */
.facts-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
section :deep(.console-readout-rows > div) {
  grid-template-columns: 6.5rem minmax(0, 1fr);
}
/* One row per sample line: the tag, then the value on one line with the rest in the tooltip. */
.facts-sample {
  display: grid;
  gap: 6px;
  margin: 0;
}
.facts-sample > div {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}
.facts-sample dt > .console-tag {
  margin: 0;
}
.facts-sample dd {
  min-width: 0;
  margin: 0;
}
.facts-value {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ui-text-highlighted);
}
/* One row per option: the name and its type, whether it is required, then what it does in the reading face. */
.facts-options {
  display: grid;
  margin: 0;
}
.facts-options > div {
  display: grid;
  grid-template-columns: 11rem 7.5rem minmax(0, 1fr);
  gap: 4px 16px;
  align-items: baseline;
  padding: 8px 0;
}
.facts-options > div + div {
  border-top: 1px solid var(--console-line);
}
.facts-options dt {
  display: flex;
  gap: 8px;
  align-items: baseline;
  min-width: 0;
}
.facts-options code {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ui-text-highlighted);
}
.facts-type {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}
.facts-requirement {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.facts-requirement[data-required] {
  color: var(--console-accent);
}
.facts-description {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ui-text-muted);
}
.facts-back {
  color: var(--ui-text-muted);
}
/* Every character the encoding writes, the sample's ones open in the accent. */
.facts-alphabet {
  display: grid;
  grid-template-columns: repeat(32, minmax(0, 1fr));
  gap: 2px;
  margin-top: 14px;
}
.facts-glyph {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  color: var(--ui-text-dimmed);
  background: color-mix(in srgb, var(--ui-text-muted) 10%, var(--ui-bg));
}
.facts-glyph[data-used] {
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 0 0 1px var(--console-accent);
  background: color-mix(in srgb, var(--console-accent) 26%, var(--ui-bg));
}
.facts-code {
  min-width: 0;
  overflow: hidden;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.facts-dim {
  color: var(--ui-text-dimmed);
}
.console-lead > a:hover .facts-dim {
  color: inherit;
}
.facts-kin {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.facts-kin a:hover {
  color: var(--console-accent);
}
.facts-leads {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: 0 28px;
  margin: 0;
}
.facts-leads > .console-lead {
  margin: 0 0 8px;
  flex-wrap: nowrap;
  min-width: 0;
}
@media (width < 640px) {
  .facts-leads .console-leader {
    display: none;
  }
  .facts-options > div {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .facts-description {
    grid-column: 1 / -1;
  }
  .facts-alphabet {
    grid-template-columns: repeat(16, minmax(0, 1fr));
  }
}
</style>
