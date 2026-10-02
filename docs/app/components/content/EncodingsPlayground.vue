<script setup lang="ts">
import { EncodingError, create, encodingFamilies, type EncodingInfo } from "@agntn/encodings";
import {
  INPUT_FORMATS,
  MAX_CANDIDATES,
  OUTPUT_FORMATS,
  encodingsDecode,
  encodingsEncode,
  encodingsIdentify,
  encodingsInfo,
  type DecodeDetails,
  type EncodeDetails,
  type IdentifyDetails,
} from "#tool-operations";
import { SAMPLE_INPUT } from "../../composables/useLandingSample";
import { ENCODINGS, SAMPLE_OPTIONS, encodingEntry, familyLabel, overhead } from "../../utils/encodings";
import { optionFlags, shellArg } from "../../utils/format";
import { jsonTokens, shellTokens } from "../../utils/tokens";
import type { ToolName } from "../../utils/tools";

type Operation = "encode" | "decode" | "identify" | "info";

const OPERATIONS: ReadonlyArray<{ key: Operation; label: string; tool: ToolName; about: string }> = [
  {
    key: "encode",
    label: "Encode",
    tool: "encodings_encode",
    about: "Text or bytes in, encoded text out. Options only where the encoding takes them.",
  },
  {
    key: "decode",
    label: "Decode",
    tool: "encodings_decode",
    about: "Encoded text in, bytes out, as text when they read as text. Checksums are checked.",
  },
  {
    key: "identify",
    label: "Identify",
    tool: "encodings_identify",
    about: "A string nobody named. Every encoding that reads it, ranked, with the reasons.",
  },
  {
    key: "info",
    label: "Info",
    tool: "encodings_info",
    about: "The registry: every encoding, one family, or one with its alphabet and options.",
  },
];

/** Strings worth identifying, each a different kind of evidence. */
const IDENTIFY_SAMPLES: ReadonlyArray<{ label: string; text: string; icon: string }> = [
  { label: "base32", text: "MZXW6===", icon: "i-lucide-case-upper" },
  { label: "address", text: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", icon: "i-token-btc" },
  { label: "segwit", text: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", icon: "i-lucide-fingerprint" },
  { label: "jwt", text: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", icon: "i-lucide-link" },
  { label: "ascii85", text: "<~87cURD_*#4DfTZ)+T~>", icon: "i-lucide-file-text" },
  { label: "email", text: "caf=C3=A9 =3D ok=20", icon: "i-lucide-mail" },
];

/** The encodings the chips load, one per family worth showing. */
const CHIPS = ["base64", "base58check", "bech32", "hex", "base32", "ascii85", "base91", "base45"] as const;

const route = useRoute();
const router = useRouter();

const operation = ref<Operation>("encode");
const encodingName = ref<string>("base64");
const input = ref(SAMPLE_INPUT);
const inputFormat = ref<(typeof INPUT_FORMATS)[number]>("utf8");
const text = ref(create("base64").encode(SAMPLE_INPUT));
const outputFormat = ref<(typeof OUTPUT_FORMATS)[number]>("auto");
const unknown = ref(IDENTIFY_SAMPLES[0]!.text);
const limit = ref<string | number>("5");
const describe = ref("");
const family = ref("");
/** Option values as typed, by option name; only the encoding's own reach the call. */
const values = reactive<Record<string, string | boolean>>({});

const entry = computed(() => encodingEntry(encodingName.value) ?? ENCODINGS[0]!);
const optionFields = computed(() => entry.value.info.options);

const encodingItems = computed(() =>
  ENCODINGS.map((row) => ({ label: row.slug, value: row.slug, icon: row.icon })),
);
const inputFormatItems = INPUT_FORMATS.map((value) => ({ label: value, value }));
const outputFormatItems = OUTPUT_FORMATS.map((value) => ({ label: value, value }));
const describeItems = [
  { label: "every encoding", value: "" },
  ...ENCODINGS.map((row) => ({ label: row.slug, value: row.slug, icon: row.icon })),
];
const familyItems = [
  { label: "every family", value: "" },
  ...encodingFamilies.map((key) => ({ label: familyLabel(key), value: key })),
];

/**
 * The option values the call sends: only the encoding's own, typed as it declares them, and only
 * the ones somebody filled in, so a default stays the encoding's default.
 */
const options = computed<Record<string, string | number | boolean>>(() => {
  const out: Record<string, string | number | boolean> = {};
  for (const option of optionFields.value) {
    const value = values[option.name];
    if (value === undefined || value === "") continue;
    if (option.type === "boolean") out[option.name] = value === true;
    else if (option.type === "number") out[option.name] = Number(value);
    else out[option.name] = String(value);
  }
  return out;
});

/** The tool arguments the form builds, the same object an MCP client would send. */
const toolArgs = computed((): Record<string, unknown> => {
  switch (operation.value) {
    case "encode":
      return {
        encoding: encodingName.value,
        input: input.value,
        ...(inputFormat.value === "utf8" ? {} : { inputFormat: inputFormat.value }),
        ...(Object.keys(options.value).length > 0 ? { options: options.value } : {}),
      };
    case "decode":
      return {
        encoding: encodingName.value,
        text: text.value,
        ...(outputFormat.value === "auto" ? {} : { outputFormat: outputFormat.value }),
      };
    case "identify": {
      const count = Number(limit.value);
      return { text: unknown.value, ...(Number.isInteger(count) && count !== 5 ? { limit: count } : {}) };
    }
    case "info":
      if (describe.value) return { encoding: describe.value };
      return family.value ? { family: family.value } : {};
  }
});

interface EncodeAnswer {
  kind: "encode";
  details: EncodeDetails;
  text: string;
}
interface DecodeAnswer {
  kind: "decode";
  details: DecodeDetails;
  text: string;
}
interface IdentifyAnswer {
  kind: "identify";
  details: IdentifyDetails;
  text: string;
}
interface ListAnswer {
  kind: "list";
  infos: EncodingInfo[];
  text: string;
}
interface DescribeAnswer {
  kind: "describe";
  info: EncodingInfo;
  text: string;
}
interface ErrorAnswer {
  kind: "error";
  name: string;
  message: string;
  text: string;
}
type Answer = EncodeAnswer | DecodeAnswer | IdentifyAnswer | ListAnswer | DescribeAnswer | ErrorAnswer;

const current = computed(() => OPERATIONS.find((row) => row.key === operation.value)!);
const position = computed(() => OPERATIONS.findIndex((row) => row.key === operation.value) + 1);

/**
 * Runs the call through the executor the tool runs. Only an `EncodingError` is an answer;
 * anything else is a bug in the library and is rethrown.
 *
 * @param {Operation} op - Which tool.
 * @param {Record<string, unknown>} args - Its arguments.
 * @returns {Answer} What the response instrument shows.
 */
function run(op: Operation, args: Record<string, unknown>): Answer {
  const tool = OPERATIONS.find((row) => row.key === op)!.tool;
  try {
    if (op === "info") {
      const result = encodingsInfo(args);
      const text = result.content[0]!.text;
      return args.encoding
        ? { kind: "describe", info: result.details.encodings[0]!, text }
        : { kind: "list", infos: result.details.encodings, text };
    }
    if (op === "identify") {
      const result = encodingsIdentify(args);
      return { kind: "identify", details: result.details, text: result.content[0]!.text };
    }
    if (op === "decode") {
      const result = encodingsDecode(args);
      return { kind: "decode", details: result.details, text: result.content[0]!.text };
    }
    const result = encodingsEncode(args);
    return { kind: "encode", details: result.details, text: result.content[0]!.text };
  } catch (error) {
    if (!(error instanceof EncodingError)) throw error;
    return {
      kind: "error",
      name: error.name,
      message: error.message,
      text: `${tool} failed: ${error.message}`,
    };
  }
}

/** The answer follows the form a beat behind, so it runs once typing stops, not on every key. */
const request = shallowRef({ op: operation.value, args: toolArgs.value });
let pending: ReturnType<typeof setTimeout> | undefined;
watch([operation, toolArgs], () => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    request.value = { op: operation.value, args: toolArgs.value };
  }, 250);
});
onUnmounted(() => clearTimeout(pending));
const answer = computed(() => run(request.value.op, request.value.args));
const answered = computed(() => OPERATIONS.find((row) => row.key === request.value.op)!);
const answeredEntry = computed(
  () => encodingEntry(String(request.value.args.encoding ?? "")) ?? entry.value,
);

/** The same call as one CLI line. */
const cliLine = computed(() => {
  switch (operation.value) {
    case "encode": {
      const flags = [
        inputFormat.value === "utf8" ? "" : `--input-format ${inputFormat.value}`,
        optionFlags(options.value),
      ].filter(Boolean);
      return [`encodings encode ${encodingName.value} ${shellArg(input.value)}`, ...flags].join(" ");
    }
    case "decode": {
      const output = outputFormat.value === "hex" || outputFormat.value === "base64" ? ` -o ${outputFormat.value}` : "";
      return `encodings decode ${encodingName.value} ${shellArg(text.value)}${output}`;
    }
    case "identify": {
      const count = Number(limit.value);
      return `encodings identify ${shellArg(unknown.value)}${Number.isInteger(count) && count !== 5 ? ` -n ${count}` : ""}`;
    }
    case "info":
      if (describe.value) return `encodings list ${describe.value}`;
      return family.value ? `encodings list --family ${family.value}` : "encodings list";
  }
});

/** The same call as a tool invocation, the JSON an MCP client sends. */
const toolCall = computed(() =>
  JSON.stringify({ name: current.value.tool, arguments: toolArgs.value }, null, 2),
);

/** The call in short form for the response bar. */
const call = computed(() => {
  const args = request.value.args;
  if (request.value.op === "info") {
    const target = args.encoding ?? args.family;
    return `${answered.value.tool}(${target ? `"${String(target)}"` : ""})`;
  }
  if (request.value.op === "identify") return `${answered.value.tool}(${JSON.stringify(args.text)})`;
  const value = request.value.op === "decode" ? args.text : args.input;
  return `${answered.value.tool}("${String(args.encoding)}", ${JSON.stringify(value)})`;
});
const responseTitle = computed(() => `${answered.value.tool}(${JSON.stringify(request.value.args)})`);

/** What the decoded text carried besides data, on one line. */
function carried(details: Readonly<Record<string, string | number>>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
}

/** What the tool takes, for the error state. */
const takes = computed(() => Object.keys(toolArgs.value).join(", ") || "no arguments");

/** One cursor sweep and scan per answer text, not per keystroke. */
const scan = ref(0);
watch(
  () => answer.value.text,
  () => {
    scan.value += 1;
  },
);

/**
 * Picks an encoding and loads the sample for the operation on screen.
 *
 * @param {string} slug - A built-in name.
 */
function loadSample(slug: string) {
  encodingName.value = slug;
  for (const key of Object.keys(values)) delete values[key];
  const sample = (SAMPLE_OPTIONS as Record<string, Record<string, string | number | boolean>>)[slug] ?? {};
  for (const [key, value] of Object.entries(sample)) values[key] = typeof value === "boolean" ? value : String(value);
  input.value = SAMPLE_INPUT;
  inputFormat.value = "utf8";
  text.value = create(slug).encode(SAMPLE_INPUT, sample);
}

/**
 * Picks an encoding from the select: the sample follows only when the field still holds another
 * encoding's sample, so text somebody typed stays.
 *
 * @param {string} slug - A built-in name.
 */
function selectEncoding(slug: string) {
  const previous = encodingName.value;
  const previousSample = create(previous).encode(SAMPLE_INPUT, SAMPLE_OPTIONS[previous as keyof typeof SAMPLE_OPTIONS] ?? {});
  if (operation.value === "decode" && text.value !== previousSample) {
    encodingName.value = slug;
    return;
  }
  loadSample(slug);
}

/**
 * Takes an identify candidate into decode, with the text it was found in.
 *
 * @param {string} slug - The candidate's encoding.
 */
function decodeCandidate(slug: string) {
  encodingName.value = slug;
  for (const key of Object.keys(values)) delete values[key];
  text.value = unknown.value;
  outputFormat.value = "auto";
  operation.value = "decode";
}

const { copied, copy } = useCopied();

/** Query in, state out. Only values the form knows are read, the rest of the query is ignored. */
function readQuery(query: Record<string, unknown>) {
  const op = String(query.op ?? "");
  if (OPERATIONS.some((row) => row.key === op)) operation.value = op as Operation;
  const name = String(query.encoding ?? "");
  const known = encodingEntry(name);
  if (known && op === "info") describe.value = name;
  else if (known) encodingName.value = name;
  if (typeof query.family === "string" && (encodingFamilies as readonly string[]).includes(query.family)) {
    family.value = query.family;
  }
  if (typeof query.input === "string") input.value = query.input;
  if (typeof query.text === "string") {
    if (op === "identify") unknown.value = query.text;
    else text.value = query.text;
  }
  if (typeof query.limit === "string") limit.value = query.limit;
  const inFormat = String(query.inputFormat ?? "");
  if ((INPUT_FORMATS as readonly string[]).includes(inFormat)) {
    inputFormat.value = inFormat as (typeof INPUT_FORMATS)[number];
  }
  const outFormat = String(query.outputFormat ?? "");
  if ((OUTPUT_FORMATS as readonly string[]).includes(outFormat)) {
    outputFormat.value = outFormat as (typeof OUTPUT_FORMATS)[number];
  }
  for (const option of known?.info.options ?? []) {
    const value = query[option.name];
    if (typeof value !== "string") continue;
    values[option.name] = option.type === "boolean" ? value === "true" : value;
  }
  request.value = { op: operation.value, args: toolArgs.value };
}

const shareQuery = computed(() => {
  const query: Record<string, string> = { op: operation.value };
  for (const [name, value] of Object.entries(toolArgs.value)) {
    if (name === "options") {
      for (const [option, setting] of Object.entries(value as Record<string, unknown>)) {
        query[option] = String(setting);
      }
    } else {
      query[name] = String(value);
    }
  }
  return query;
});

/**
 * Deep link once after mount. A prerendered page hydrates with an empty `route.query` and Nuxt
 * restores the address only afterwards, so the first non-empty query is read once, whichever
 * comes first.
 */
function applyDeepLink() {
  const stop = watch(
    () => route.query,
    (query) => {
      readQuery(query as Record<string, unknown>);
      stop();
    },
    { once: true, flush: "post" },
  );
  if (Object.keys(route.query).length > 0) {
    stop();
    readQuery(route.query as Record<string, unknown>);
  }
}

onMounted(() => {
  applyDeepLink();
  watch(shareQuery, (query) => {
    void router.replace({ query });
  });
});

const shareLink = computed(() => {
  if (!import.meta.client) return "";
  const url = new URL(window.location.href);
  url.search = new URLSearchParams(shareQuery.value).toString();
  return url.toString();
});

const identifyLimit = MAX_CANDIDATES;
</script>

<template>
  <div class="playground">
    <form class="tool-console console-wide" @submit.prevent>
      <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
      <span class="console-cross console-cross-br" aria-hidden="true">+</span>
      <header class="console-bar">
        <span class="console-title"
          ><span class="console-tag">Call</span>{{ current.tool
          }}<span class="console-file"
            >{{ String(position).padStart(2, "0") }} / {{ OPERATIONS.length }}</span
          ></span
        >
        <span class="console-meta" aria-label="Supported hosts: MCP, Pi, OMP and the AI SDK"
          >MCP · Pi · OMP · AI SDK</span
        >
        <span class="console-mark" aria-hidden="true" />
      </header>
      <div class="console-ruler" aria-hidden="true"><span class="console-cursor" /></div>

      <div class="console-band playground-band-first playground-columns">
        <div class="playground-column">
          <p class="console-label console-rule-title">
            <span
              >Operation <span aria-hidden="true">[ {{ OPERATIONS.length }} ]</span></span
            >
            <span class="console-mark" aria-hidden="true" />
          </p>
          <div role="group" aria-label="Operation" class="playground-ops console-draw">
            <button
              v-for="(row, index) in OPERATIONS"
              :key="row.key"
              type="button"
              class="console-lead"
              :aria-pressed="operation === row.key"
              @click="operation = row.key"
            >
              <span class="console-tag">{{ row.label }}</span>
              <span>{{ row.tool }}</span>
              <span
                class="console-leader"
                aria-hidden="true"
                :style="{ animationDelay: `${index * 60}ms` }"
              />
            </button>
          </div>
          <p class="console-about playground-tool-about">{{ current.about }}</p>
        </div>

        <div class="playground-column">
          <p class="console-label console-rule-title">
            <span
              >Input <span aria-hidden="true">[ {{ Object.keys(toolArgs).length || "no" }}
                {{ Object.keys(toolArgs).length === 1 ? "argument" : "arguments" }} ]</span></span
            >
            <span class="console-mark" aria-hidden="true" />
          </p>

          <div class="console-readout">
            <dl v-if="operation === 'info'" class="console-readout-rows">
              <div>
                <dt><label for="playground-describe">encoding</label></dt>
                <dd>
                  <USelectMenu
                    id="playground-describe"
                    v-model="describe"
                    :items="describeItems"
                    value-key="value"
                    variant="none"
                    class="w-full"
                  />
                </dd>
              </div>
              <div>
                <dt><label for="playground-family">family</label></dt>
                <dd>
                  <USelectMenu
                    id="playground-family"
                    v-model="family"
                    :items="familyItems"
                    value-key="value"
                    variant="none"
                    :search-input="false"
                    :disabled="describe !== ''"
                    class="w-full"
                  />
                </dd>
              </div>
            </dl>
            <dl v-else-if="operation === 'identify'" class="console-readout-rows">
              <div>
                <dt><label for="playground-unknown">text</label></dt>
                <dd>
                  <UTextarea
                    id="playground-unknown"
                    v-model="unknown"
                    variant="none"
                    :rows="1"
                    autoresize
                    :maxrows="6"
                    placeholder="a string as you found it"
                    spellcheck="false"
                    autocomplete="off"
                    class="w-full"
                  />
                </dd>
              </div>
              <div>
                <dt><label for="playground-limit">limit</label></dt>
                <dd>
                  <UInput
                    id="playground-limit"
                    v-model="limit"
                    type="number"
                    min="1"
                    :max="identifyLimit"
                    variant="none"
                    class="w-full"
                  />
                </dd>
              </div>
            </dl>
            <dl v-else class="console-readout-rows">
              <div>
                <dt><label for="playground-encoding">encoding</label></dt>
                <dd>
                  <USelectMenu
                    id="playground-encoding"
                    :model-value="entry.slug"
                    :items="encodingItems"
                    value-key="value"
                    variant="none"
                    :icon="entry.icon"
                    class="w-full"
                    @update:model-value="selectEncoding($event as string)"
                  />
                </dd>
              </div>
              <template v-if="operation === 'encode'">
                <div>
                  <dt><label for="playground-input">input</label></dt>
                  <dd>
                    <UTextarea
                      id="playground-input"
                      v-model="input"
                      variant="none"
                      :rows="1"
                      autoresize
                      :maxrows="6"
                      spellcheck="false"
                      autocomplete="off"
                      class="w-full"
                    />
                  </dd>
                </div>
                <div>
                  <dt><label for="playground-input-format">inputFormat</label></dt>
                  <dd>
                    <USelectMenu
                      id="playground-input-format"
                      v-model="inputFormat"
                      :items="inputFormatItems"
                      value-key="value"
                      variant="none"
                      :search-input="false"
                      class="w-full"
                    />
                  </dd>
                </div>
                <div v-for="option in optionFields" :key="option.name">
                  <dt>
                    <label :for="`playground-option-${option.name}`">{{ option.name }}</label>
                  </dt>
                  <dd>
                    <UCheckbox
                      v-if="option.type === 'boolean'"
                      :id="`playground-option-${option.name}`"
                      :model-value="values[option.name] === undefined ? option.default === true : values[option.name] === true"
                      :label="option.description"
                      @update:model-value="values[option.name] = $event === true"
                    />
                    <UInput
                      v-else
                      :id="`playground-option-${option.name}`"
                      v-model="values[option.name] as string"
                      :type="option.type === 'number' ? 'number' : 'text'"
                      variant="none"
                      :placeholder="option.default === undefined ? option.description : `default ${option.default}`"
                      spellcheck="false"
                      autocomplete="off"
                      class="w-full"
                    />
                  </dd>
                </div>
              </template>
              <template v-else>
                <div>
                  <dt><label for="playground-text">text</label></dt>
                  <dd>
                    <UTextarea
                      id="playground-text"
                      v-model="text"
                      variant="none"
                      :rows="1"
                      autoresize
                      :maxrows="6"
                      spellcheck="false"
                      autocomplete="off"
                      class="w-full"
                    />
                  </dd>
                </div>
                <div>
                  <dt><label for="playground-output-format">outputFormat</label></dt>
                  <dd>
                    <USelectMenu
                      id="playground-output-format"
                      v-model="outputFormat"
                      :items="outputFormatItems"
                      value-key="value"
                      variant="none"
                      :search-input="false"
                      class="w-full"
                    />
                  </dd>
                </div>
              </template>
            </dl>
          </div>

          <div
            v-if="operation === 'identify'"
            class="playground-chips"
            role="group"
            aria-label="Sample strings"
          >
            <UButton
              v-for="sample in IDENTIFY_SAMPLES"
              :key="sample.label"
              :color="unknown === sample.text ? 'primary' : 'neutral'"
              variant="chip"
              :icon="sample.icon"
              :label="sample.label"
              :aria-pressed="unknown === sample.text"
              @click="unknown = sample.text"
            />
          </div>
          <div
            v-else-if="operation !== 'info'"
            class="playground-chips"
            role="group"
            aria-label="Sample encodings"
          >
            <UButton
              v-for="slug in CHIPS"
              :key="slug"
              :color="entry.slug === slug ? 'primary' : 'neutral'"
              variant="chip"
              :icon="encodingEntry(slug)?.icon"
              :label="slug"
              :aria-pressed="entry.slug === slug"
              @click="loadSample(slug)"
            />
          </div>

          <p class="playground-note">
            <template v-if="operation === 'decode'"
              >A chip loads <code>{{ SAMPLE_INPUT }}</code> in that encoding. Change one character
              of the base58check or bech32 one and watch the checksum say no.</template
            >
            <template v-else-if="operation === 'identify'"
              >Each sample is a different kind of evidence: padding, a checksum, a segwit program,
              JSON hiding in base64url, delimiters, escapes. Decode a candidate and it carries the
              text along.</template
            >
            <template v-else-if="operation === 'info'"
              >Pick an encoding to see its alphabet and options the way a model sees them before
              its first call.</template
            >
            <template v-else
              >A chip loads the encoding with <code>{{ SAMPLE_INPUT }}</code>. Bech32 needs a
              prefix, so its chip brings <code>hi</code>.</template
            >
          </p>
        </div>
      </div>

      <div class="console-band playground-columns">
        <div class="playground-column">
          <p class="console-label console-rule-title">
            <span>CLI <span aria-hidden="true">[ same call ]</span></span>
            <span class="console-mark" aria-hidden="true" />
            <UButton
              color="neutral"
              variant="subtle"
              :icon="copied === 'cli' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'cli' ? 'copied' : 'copy'"
              :aria-label="copied === 'cli' ? 'Copied' : 'Copy the CLI line'"
              @click="copy('cli', cliLine)"
            />
          </p>
          <!-- prettier-ignore -->
          <pre class="console-snippet"><code><span class="playground-prompt">$ </span><span v-for="(token, index) in shellTokens(cliLine)" :key="index" :class="token.cls">{{ token.text }}</span></code></pre>
        </div>
        <div class="playground-column">
          <p class="console-label console-rule-title">
            <span>Tool <span aria-hidden="true">[ what an MCP client sends ]</span></span>
            <span class="console-mark" aria-hidden="true" />
            <UButton
              color="neutral"
              variant="subtle"
              :icon="copied === 'tool' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'tool' ? 'copied' : 'copy'"
              :aria-label="copied === 'tool' ? 'Copied' : 'Copy the tool call'"
              @click="copy('tool', toolCall)"
            />
          </p>
          <!-- prettier-ignore -->
          <pre class="console-snippet"><code><span v-for="(token, index) in jsonTokens(toolCall)" :key="index" :class="token.cls">{{ token.text }}</span></code></pre>
        </div>
      </div>

      <footer class="console-footer console-footer-plain">
        <ul class="console-links">
          <li>
            <button type="button" @click="copy('link', shareLink)">
              <span aria-hidden="true">→ </span
              >{{ copied === "link" ? "permalink copied" : "copy the permalink" }}
            </button>
          </li>
        </ul>
        <span class="console-meta">every state is a link</span>
      </footer>
    </form>

    <!-- The call runs from the request down into the response, the way the zone's circuit runs into the request. -->
    <div class="playground-link" aria-hidden="true">
      <svg :key="scan" class="hero-circuit" viewBox="0 0 160 56">
        <path class="hero-circuit-rail" d="M80 0V16L96 32V56" />
        <path class="hero-circuit-live" d="M80 0V16L96 32V56" pathLength="1" />
        <path class="hero-circuit-seg" d="M96 38V48" />
        <rect class="hero-circuit-node" x="92.5" y="52.5" width="7" height="7" />
      </svg>
      <span class="hero-circuit-tag">answer</span>
    </div>

    <section class="tool-console console-wide" aria-live="polite">
      <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
      <span class="console-cross console-cross-br" aria-hidden="true">+</span>
      <header class="console-bar">
        <UTooltip :text="responseTitle">
          <span class="console-title playground-call" tabindex="0"
            ><span class="console-tag">{{ answered.label }}</span>{{ call }}</span
          >
        </UTooltip>
        <span v-if="answer.kind === 'encode'" class="console-meta"
          >{{ answer.details.byteLength }} bytes · {{ answer.details.text.length }} chars</span
        >
        <span v-else-if="answer.kind === 'decode'" class="console-meta"
          >{{ answer.details.byteLength }} bytes · {{ answer.details.format }}</span
        >
        <span v-else-if="answer.kind === 'identify'" class="console-meta"
          >{{ answer.details.candidates.length }} candidates · best first</span
        >
        <span v-else-if="answer.kind === 'list'" class="console-meta"
          >{{ answer.infos.length }} encodings · listing order</span
        >
        <span v-else-if="answer.kind === 'describe'" class="console-meta"
          >{{ answer.info.family }} · {{ answer.info.alphabet.length }} characters</span
        >
        <span v-else class="console-meta">{{ answer.name }}</span>
        <span class="console-mark" aria-hidden="true" />
      </header>
      <div class="console-ruler" aria-hidden="true">
        <span :key="scan" class="console-cursor" />
      </div>

      <template v-if="answer.kind === 'encode'">
        <div class="console-band console-subject-band">
          <div :key="scan" class="console-scan" aria-hidden="true" />
          <div class="console-identity-block">
            <ConsoleReticle :key="answeredEntry.slug" :icon="answeredEntry.icon" />
            <div class="console-name">
              <span class="console-label"
                >Encode / <span class="console-label-key">{{ answeredEntry.slug }}</span></span
              >
              <h3>{{ answeredEntry.info.label }}</h3>
              <p class="console-about">{{ answeredEntry.blurb }}.</p>
            </div>
          </div>
          <div class="console-readout">
            <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
              <circle cx="3" cy="12" r="2.5" />
              <path d="M5.5 12H14L22 20H32" />
            </svg>
            <dl :key="scan" class="console-readout-rows console-animate">
              <div>
                <dt>Size</dt>
                <dd class="console-accent">
                  {{ answer.details.byteLength }} bytes → {{ answer.details.text.length }} chars
                </dd>
              </div>
              <div>
                <dt>Overhead</dt>
                <dd>+{{ overhead(answeredEntry) }}% on random bytes</dd>
              </div>
              <div>
                <dt>{{ answeredEntry.info.checksum ? "Checksum" : "Padding" }}</dt>
                <dd>
                  {{
                    answeredEntry.info.checksum
                      ? "checked on decode"
                      : answeredEntry.info.padding
                        ? "= to a whole block"
                        : "none"
                  }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <div class="console-band">
          <p class="console-label console-rule-title">
            <span>Text <span aria-hidden="true">[ content[0].text, after the header ]</span></span>
            <span class="console-mark" aria-hidden="true" />
            <UButton
              color="neutral"
              variant="subtle"
              :icon="copied === 'out' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'out' ? 'copied' : 'copy'"
              :aria-label="copied === 'out' ? 'Copied' : 'Copy the encoded text'"
              @click="copy('out', answer.details.text)"
            />
          </p>
          <pre :key="scan" class="console-snippet playground-output"><code>{{ answer.details.text }}</code></pre>
        </div>
      </template>

      <template v-else-if="answer.kind === 'decode'">
        <div class="console-band console-subject-band">
          <div :key="scan" class="console-scan" aria-hidden="true" />
          <div class="console-identity-block">
            <ConsoleReticle :key="answeredEntry.slug" :icon="answeredEntry.icon" />
            <div class="console-name">
              <span class="console-label"
                >Decode / <span class="console-label-key">{{ answeredEntry.slug }}</span></span
              >
              <h3>{{ answeredEntry.info.label }}</h3>
              <p class="console-about">
                {{
                  answeredEntry.info.checksum
                    ? "The checksum matched, so these are the bytes the writer meant."
                    : `${answeredEntry.blurb}.`
                }}
              </p>
            </div>
          </div>
          <div class="console-readout">
            <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
              <circle cx="3" cy="12" r="2.5" />
              <path d="M5.5 12H14L22 20H32" />
            </svg>
            <dl :key="scan" class="console-readout-rows console-animate">
              <div>
                <dt>Bytes</dt>
                <dd class="console-accent">{{ answer.details.byteLength }} as {{ answer.details.format }}</dd>
              </div>
              <div>
                <dt>Carried</dt>
                <dd>
                  <span v-if="carried(answer.details.details)" class="playground-line">{{
                    carried(answer.details.details)
                  }}</span>
                  <span v-else class="playground-none">nothing but data</span>
                </dd>
              </div>
              <div>
                <dt>Hex</dt>
                <dd>
                  <UTooltip :text="answer.details.hex">
                    <span class="playground-line" tabindex="0">{{ answer.details.hex || "empty" }}</span>
                  </UTooltip>
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <div class="console-band">
          <p class="console-label console-rule-title">
            <span>Value <span aria-hidden="true">[ {{ answer.details.format }} ]</span></span>
            <span class="console-mark" aria-hidden="true" />
            <UButton
              color="neutral"
              variant="subtle"
              :icon="copied === 'out' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'out' ? 'copied' : 'copy'"
              :aria-label="copied === 'out' ? 'Copied' : 'Copy the decoded value'"
              @click="copy('out', answer.details.value)"
            />
          </p>
          <pre :key="scan" class="console-snippet playground-output"><code>{{ answer.details.value }}</code></pre>
        </div>
      </template>

      <template v-else-if="answer.kind === 'identify'">
        <div class="console-band console-subject-band">
          <div :key="scan" class="console-scan" aria-hidden="true" />
          <div class="console-identity-block">
            <ConsoleReticle
              :key="answer.details.candidates[0]?.encoding ?? 'none'"
              :icon="encodingEntry(answer.details.candidates[0]?.encoding ?? '')?.icon ?? 'i-lucide-scan-search'"
            />
            <div class="console-name">
              <span class="console-label"
                >Guess /
                <span class="console-label-key">{{
                  answer.details.candidates[0]?.confidence ?? "none"
                }}</span></span
              >
              <h3 :class="{ 'playground-invalid': answer.details.candidates.length === 0 }">
                {{ answer.details.candidates[0]?.encoding ?? "Nothing reads it" }}
              </h3>
              <p class="console-about">
                {{
                  answer.details.candidates[0]?.reasons.join(", ") ||
                  (answer.details.candidates.length === 0
                    ? "No encoding turns this into anything but itself."
                    : "Only the alphabet fits. Weak, but it decodes.")
                }}
              </p>
            </div>
          </div>
          <div class="console-readout">
            <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
              <circle cx="3" cy="12" r="2.5" />
              <path d="M5.5 12H14L22 20H32" />
            </svg>
            <dl :key="scan" class="console-readout-rows console-animate">
              <div>
                <dt>Candidates</dt>
                <dd class="console-accent">{{ answer.details.candidates.length }}</dd>
              </div>
              <div>
                <dt>Checksum</dt>
                <dd>
                  {{
                    answer.details.candidates.some((candidate) => candidate.reasons.includes("checksum matches"))
                      ? "one matches"
                      : "none"
                  }}
                </dd>
              </div>
              <div>
                <dt>As text</dt>
                <dd>
                  {{ answer.details.candidates.filter((candidate) => candidate.text !== undefined).length }}
                  read as text
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <ol
          v-if="answer.details.candidates.length > 0"
          :key="scan"
          class="console-rows console-animate playground-candidates"
        >
          <li
            v-for="(candidate, index) in answer.details.candidates"
            :key="candidate.encoding"
            :style="{ animationDelay: `${Math.min(index * 30, 600)}ms` }"
          >
            <NuxtLink :to="`/encodings/${candidate.encoding}`" class="playground-list-name">{{
              candidate.encoding
            }}</NuxtLink>
            <span class="playground-line playground-none"
              >{{ candidate.confidence.toFixed(3) }} ·
              {{ candidate.text === undefined ? `hex ${candidate.hex}` : JSON.stringify(candidate.text) }}</span
            >
            <UButton
              color="neutral"
              variant="subtle"
              trailing-icon="i-lucide-arrow-right"
              label="decode"
              :aria-label="`Decode with ${candidate.encoding}`"
              @click="decodeCandidate(candidate.encoding)"
            />
          </li>
        </ol>
      </template>

      <ol
        v-else-if="answer.kind === 'list'"
        :key="scan"
        class="console-rows console-animate playground-list"
      >
        <li
          v-for="(info, index) in answer.infos"
          :key="info.name"
          :style="{ animationDelay: `${Math.min(index * 30, 600)}ms` }"
        >
          <NuxtLink :to="`/encodings/${info.name}`" class="playground-list-name">{{ info.name }}</NuxtLink>
          <span class="playground-none">{{ info.family }}</span>
          <span>{{ info.alphabet.length }} chars</span>
          <span :class="info.checksum ? 'playground-valid' : 'playground-none'">{{
            info.checksum ? "checksum" : info.padding ? "padded" : "unpadded"
          }}</span>
        </li>
      </ol>

      <template v-else-if="answer.kind === 'describe'">
        <div class="console-band console-subject-band">
          <div :key="scan" class="console-scan" aria-hidden="true" />
          <div class="console-identity-block">
            <ConsoleReticle :key="answer.info.name" :icon="encodingEntry(answer.info.name)?.icon ?? 'i-lucide-binary'" />
            <div class="console-name">
              <span class="console-label">Encoding / {{ familyLabel(answer.info.family) }}</span>
              <h3>{{ answer.info.label }}</h3>
              <p class="console-about">{{ answer.info.description }}</p>
            </div>
          </div>
          <div class="console-readout">
            <svg class="console-link" viewBox="0 0 32 40" fill="none" aria-hidden="true">
              <circle cx="3" cy="12" r="2.5" />
              <path d="M5.5 12H14L22 20H32" />
            </svg>
            <dl :key="scan" class="console-readout-rows console-animate">
              <div>
                <dt>Alphabet</dt>
                <dd class="console-accent">{{ answer.info.alphabet.length }} characters</dd>
              </div>
              <div>
                <dt>Standard</dt>
                <dd>
                  <UTooltip :text="answer.info.standard">
                    <span class="playground-line" tabindex="0">{{ answer.info.standard }}</span>
                  </UTooltip>
                </dd>
              </div>
              <div>
                <dt>Options</dt>
                <dd>{{ answer.info.options.length || "none" }}</dd>
              </div>
            </dl>
          </div>
        </div>
        <ol v-if="answer.info.options.length" :key="scan" class="console-rows console-animate playground-options">
          <li v-for="option in answer.info.options" :key="option.name">
            <code>{{ option.name }}</code>
            <span :class="option.required ? 'playground-valid' : 'playground-none'">{{
              option.required
                ? "required"
                : option.default === undefined || option.default === ""
                  ? "optional"
                  : `default ${option.default}`
            }}</span>
            <span class="playground-option-about">{{ option.description }}</span>
          </li>
        </ol>
      </template>

      <div v-else class="console-band console-subject-band">
        <div :key="scan" class="console-scan" aria-hidden="true" />
        <div class="console-identity-block">
          <ConsoleReticle :key="answer.name" icon="i-lucide-circle-alert" />
          <div class="console-name">
            <span class="console-label">Error / thrown</span>
            <h3 class="console-name-mono playground-invalid">{{ answer.name }}</h3>
            <p class="console-about">{{ answer.message }}</p>
          </div>
        </div>
        <div class="console-readout">
          <dl class="console-readout-rows">
            <div>
              <dt>Tool</dt>
              <dd>{{ answered.tool }}</dd>
            </div>
            <div>
              <dt>Sent</dt>
              <dd>
                <span class="playground-line">{{ takes }}</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <ConsoleResponse :title="responseTitle" :text="answer.text" />

      <footer class="console-footer console-footer-plain">
        <ul class="console-links">
          <li v-if="answer.kind === 'encode' || answer.kind === 'decode' || answer.kind === 'describe'">
            <NuxtLink :to="answeredEntry.to"
              ><span aria-hidden="true">→ </span>{{ answeredEntry.info.label }}</NuxtLink
            >
          </li>
          <li>
            <NuxtLink
              :to="
                answered.key === 'identify'
                  ? '/guide/identify'
                  : answered.key === 'info'
                    ? '/encodings'
                    : answeredEntry.info.checksum
                      ? '/guide/checksums'
                      : '/guide/encoding'
              "
              ><span aria-hidden="true">→ </span>How it works</NuxtLink
            >
          </li>
        </ul>
        <span class="console-meta">in your browser / no network</span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.playground {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}
/* The link between the two instruments: the zone's circuit, standing on its own 56 px of height. */
.playground-link {
  position: relative;
  height: 56px;
}
.playground-link > .hero-circuit {
  bottom: 0;
}
.playground-link > .hero-circuit-tag {
  bottom: 18px;
}
/* One track by default: an implicit auto track would grow to the widest chip row and push the page sideways. */
.playground-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px 48px;
}
.playground-column {
  min-width: 0;
}
@media (width >= 56rem) {
  .playground-columns {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
@media (width >= 80rem) {
  .playground-ops {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
/* The playground carries more rows than a dossier, so its bands breathe a little wider. */
.playground .console-bar {
  padding-block: 12px;
}
.playground .console-band {
  padding: 22px 24px 24px;
}
.playground .console-rule-title {
  margin-bottom: 18px;
}
.playground .console-readout-rows > div {
  padding: 12px 16px;
}
.playground-prompt {
  color: var(--ui-text-dimmed);
}
.playground .console-snippet {
  padding: 12px 16px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.playground .console-footer {
  padding: 14px 24px;
}
.playground .console-rows li {
  padding: 12px 24px;
}
.playground-band-first {
  border-top: 0;
}
.playground-tool-about {
  margin-top: 20px;
  font-size: 14px;
}
.playground-ops {
  display: grid;
  gap: 0 40px;
  margin-top: -12px;
}
.playground-ops .console-lead {
  margin-top: 12px;
  padding: 2px 0;
}
.playground-ops .console-lead > span:not(.console-tag, .console-leader) {
  white-space: nowrap;
  color: var(--ui-text-muted);
}
.playground-ops .console-lead[aria-pressed="true"] > span:not(.console-tag, .console-leader),
.playground-ops .console-lead:hover > span:not(.console-tag, .console-leader) {
  color: var(--ui-text-highlighted);
}
.playground-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}
.playground-note {
  margin: 16px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.7;
  color: var(--ui-text-muted);
}
.playground-call {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playground-none {
  color: var(--ui-text-dimmed);
}
.playground-valid {
  color: var(--console-accent);
}
.playground-invalid {
  color: var(--encodings-del);
}
.playground-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The answer as a value, whole and wrapped: a long text never scrolls the page. */
.playground-output {
  max-height: 16rem;
  overflow-y: auto;
  white-space: pre-wrap;
  color: var(--ui-text-highlighted);
}
/* One row per encoding of the listing: the name as a link, family, alphabet size, checksum. */
.playground-list li {
  grid-template-columns: minmax(0, 12rem) minmax(0, 10rem) 6rem minmax(0, 1fr);
}
.playground-list-name {
  color: var(--ui-text-highlighted);
}
.playground-list-name:hover {
  color: var(--console-accent);
}
/* One row per candidate: the encoding, its score and value, the decode button. */
.playground-candidates li {
  grid-template-columns: minmax(0, 10rem) minmax(0, 1fr) auto;
  align-items: center;
}
/* One row per option of one encoding: the name, whether it is required, what it does. */
.playground-options li {
  grid-template-columns: 9rem 8rem minmax(0, 1fr);
}
.playground-options code {
  font-family: var(--font-mono);
  color: var(--ui-text-highlighted);
}
.playground-option-about {
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--ui-text-muted);
}
@media (width < 640px) {
  .playground-options li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .playground-option-about {
    grid-column: 1 / -1;
  }
  .playground-list li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .playground-list li > span:nth-of-type(1) {
    display: none;
  }
  .playground-candidates li {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .playground-candidates li > .playground-line {
    display: none;
  }
}
@media (width < 400px) {
  /* The label column fits the longest label, `inputEncoding`, with room to spare. */
  .playground .console-readout-rows > div {
    grid-template-columns: 6.25rem minmax(0, 1fr);
    gap: 8px;
    padding: 10px 12px;
  }
  .playground .console-band,
  .playground .console-footer,
  .playground .console-rows li {
    padding-inline: 14px;
  }
}
</style>
