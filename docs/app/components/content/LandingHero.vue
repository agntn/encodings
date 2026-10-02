<script setup lang="ts">
import { version } from "../../../../package.json";
import type { LandingSample } from "../../composables/useLandingSample";
import { CHECKSUM_COUNT, ENCODINGS, FAMILIES } from "../../utils/encodings";
import { TOOLS } from "../../utils/tools";

defineProps<{ sample: LandingSample; samples: readonly LandingSample[] }>();
const emit = defineEmits<{ step: [delta: number]; pause: [paused: boolean] }>();

const INSTALL = "pnpm add @agntn/encodings";
const { copied, copy } = useCopied();
</script>

<template>
  <header class="encodings-hero hero-page">
    <div class="hero-zone">
      <span class="hero-cross hero-cross-tl" aria-hidden="true">+</span>
      <span class="hero-cross hero-cross-tr" aria-hidden="true">+</span>
      <span class="hero-bracket hero-bracket-l" aria-hidden="true" />
      <span class="hero-bracket hero-bracket-r" aria-hidden="true" />

      <p class="console-id">
        <span class="console-id-tag">ID</span>
        <span>@agntn/encodings</span>
        <span class="console-id-sep" aria-hidden="true">/</span>
        <span>v{{ version }}</span>
      </p>

      <h1 class="hero-title">Decode it. <span>Don't eyeball it.</span></h1>
      <p class="hero-lead">
        Ask a model what a base58 string says and it reads the vibe. This reads the bytes. Base64,
        base58 with its checksum, bech32 down to the witness program, and the rest. Written from
        the RFCs and BIPs. One call in TypeScript, the terminal and your agent. No network, nothing
        to configure.
      </p>

      <dl class="hero-metrics">
        <div>
          <dt>Encodings</dt>
          <dd>{{ ENCODINGS.length }}</dd>
          <dd class="hero-metric-sub">in {{ FAMILIES.length }} families</dd>
        </div>
        <div>
          <dt>With checksum</dt>
          <dd>{{ CHECKSUM_COUNT }}</dd>
          <dd class="hero-metric-sub">{{ TOOLS.length }} agent tools on top</dd>
        </div>
        <div>
          <dt>Network calls</dt>
          <dd class="hero-metric-accent">0</dd>
          <dd class="hero-metric-sub">every value computed in place</dd>
        </div>
      </dl>

      <div class="console-actions">
        <UButton
          to="/guide"
          color="primary"
          variant="solid"
          trailing-icon="i-lucide-arrow-right"
          label="Get started"
        />
        <UButton
          to="https://github.com/agntn/encodings"
          target="_blank"
          color="neutral"
          variant="outline"
          icon="i-simple-icons-github"
          label="Star on GitHub"
        />
      </div>
      <div class="console-install">
        <span class="console-install-tag">Install</span>
        <code><span class="console-install-prompt">$</span> {{ INSTALL }}</code>
        <UButton
          color="neutral"
          variant="subtle"
          :icon="copied === 'install' ? 'i-lucide-check' : 'i-lucide-copy'"
          :aria-label="copied === 'install' ? 'Copied' : 'Copy install command'"
          @click="copy('install', INSTALL)"
        />
      </div>
    </div>

    <!-- One text through one encoding, against every character the encoding can write. -->
    <div class="hero-instrument">
      <svg class="hero-circuit" viewBox="0 0 160 56" aria-hidden="true">
        <path class="hero-circuit-rail" d="M80 0V16L96 32V56" />
        <path :key="sample.entry.slug" class="hero-circuit-live" d="M80 0V16L96 32V56" pathLength="1" />
        <path class="hero-circuit-seg" d="M96 38V48" />
        <rect class="hero-circuit-node" x="92.5" y="52.5" width="7" height="7" />
      </svg>
      <span class="hero-circuit-tag" aria-hidden="true">encode</span>
      <LandingAlphabet :sample="sample" :samples="samples" @step="emit('step', $event)" @pause="emit('pause', $event)" />
    </div>
  </header>
</template>
