<script setup lang="ts">
import { tokens } from "../../utils/tokens";

const { copied, copy } = useCopied();

/** An encoding of your own: the Encoding shape every built-in has, then register. */
const FILE = [
  'import { DecodeError, encode, identify, register, type Encoding } from "@agntn/encodings";',
  "",
  "const octal: Encoding = {",
  '  name: "octal",',
  "  info: () => ({",
  '    name: "octal",',
  '    label: "Octal",',
  '    description: "Three octal digits per byte, the way od -b prints them",',
  '    family: "octal",',
  '    standard: "od -b",',
  '    alphabet: "01234567",',
  "    checksum: false,",
  "    padding: false,",
  "    options: [],",
  "  }),",
  "  encode: (input) =>",
  '    Array.from(typeof input === "string" ? new TextEncoder().encode(input) : input, (byte) =>',
  '      byte.toString(8).padStart(3, "0"),',
  '    ).join(" "),',
  "  decode(text) {",
  "    const groups = text.trim().split(/\\s+/u);",
  "    if (groups.some((group) => !/^[0-3][0-7]{2}$/u.test(group))) {",
  '      throw new DecodeError("octal", "every byte is three digits, 000 to 377");',
  "    }",
  "    return { bytes: Uint8Array.from(groups, (group) => Number.parseInt(group, 8)), details: {} };",
  "  },",
  "};",
  "",
  "register(octal);",
  'encode("octal", "hi");                // "150 151"',
  'identify("150 151")[0]?.encoding;    // "octal"',
] as const;

/**
 * What the panel shows: the shape the section is about, with `info`, `encode` and `decode` folded
 * the way an editor folds them. Copy hands out `FILE`, every line.
 */
const LINES = [
  ...FILE.slice(0, 4),
  "  info: () => ({ /* label, family, standard, alphabet, options */ }),",
  "  encode: (input) => /* three octal digits per byte, spaced */,",
  "  decode(text) { /* split, check 000 to 377, parseInt */ },",
  "};",
  ...FILE.slice(28),
] as const;
</script>

<template>
  <section class="tool-console landing-custom" aria-label="An encoding of your own">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title"><span class="console-tag">File</span>octal.ts</span>
      <span class="console-meta">folded · copy is whole</span>
      <span class="console-mark" aria-hidden="true" />
      <UButton
        color="neutral"
        variant="subtle"
        :icon="copied === 'octal' ? 'i-lucide-check' : 'i-lucide-copy'"
        :label="copied === 'octal' ? 'copied' : 'copy'"
        :aria-label="copied === 'octal' ? 'Copied' : 'Copy octal.ts'"
        @click="copy('octal', FILE.join('\n'))"
      />
    </header>
    <div class="console-ruler" aria-hidden="true" />

    <div class="custom-body">
      <!-- prettier-ignore -->
      <pre class="console-snippet console-lines"><code><span v-for="(line, index) in LINES" :key="index"><span v-for="(token, part) in tokens(line)" :key="part" :class="token.cls">{{ token.text }}</span></span></code></pre>
    </div>
  </section>
</template>

<style scoped>
.custom-body {
  padding: 14px 20px 18px;
}
/* Breaks only between words: a string split at any character is hard to read. */
.custom-body > .console-snippet {
  overflow-wrap: break-word;
}
@media (width < 400px) {
  .custom-body {
    padding-inline: 14px;
  }
}
</style>
