<script setup lang="ts">
import { SAMPLE_INPUT } from "../../composables/useLandingSample";
import { CHECKSUM_COUNT, ENCODINGS, GROUPS } from "../../utils/encodings";
import { spellOut, spellOutCapital } from "../../utils/format";
import { TOOLS } from "../../utils/tools";

const { samples, paused, current, step } = useLandingSample();
</script>

<template>
  <div class="encodings-landing not-prose">
    <LandingHero :sample="current" :samples="samples" @step="step" @pause="paused = $event" />

    <LandingFeature
      title="Same call, every encoding"
      to="/guide/encoding"
      link="Encoding and decoding"
      :checks="[
        'encode(name, input) and decode(name, text). That\'s the whole API you need on day one',
        'Strings go in as UTF-8. A Uint8Array goes in as it is',
        'Names forgive you: Base 64, base_64 and b64 all find base64',
      ]"
    >
      Pick a name, hand it bytes, get text back. Then do it backwards. This file walks through
      {{ samples.length }} encodings and none of it is a recording. Your browser runs every line
      with the same TypeScript the package ships. Round trip true, every time? That's the whole
      point. Bech32 is the fun one, its prefix comes back in details instead of hiding in the bytes.
      <template #visual>
        <LandingRotatingCode :sample="current" @step="step" @pause="paused = $event" />
      </template>
    </LandingFeature>

    <LandingFeature
      title="A guess that shows its work"
      to="/guide/identify"
      link="Identify"
      :checks="[
        'A checksum that matches beats everything. Base58Check and bech32 prove themselves',
        'Then framing: padding that fits, <~ ~>, a begin line, =XX escapes',
        'Then text that reads like text, then the smaller alphabet',
      ]"
      reverse
    >
      Someone pastes <code class="encodings-code">MZXW6===</code> and asks what it is. A model
      squints and says base64, probably. <code class="encodings-code">identify</code> tries every
      encoding it knows and ranks the ones that actually decode. Each score comes with its reasons,
      so you can disagree with it. The confidence ranks, it doesn't promise. And when nothing
      fits? It says so, instead of inventing an answer.
      <template #visual>
        <LandingIdentify :sample="current" @pause="paused = $event" />
      </template>
    </LandingFeature>

    <section class="encodings-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-20 sm:px-12 lg:px-16">
        <div class="max-w-2xl">
          <h2 class="text-2xl font-medium tracking-tight text-highlighted sm:text-[1.75rem]">
            {{ spellOutCapital(ENCODINGS.length) }} encodings, {{ spellOut(GROUPS.length) }} ways
            to spell bytes
          </h2>
          <p class="mt-4 text-sm leading-6 text-muted">
            Bit groups, where every character carries the same few bits. Base58, which treats the
            whole input as one huge number. Fixed blocks like Ascii85 and basE91. Bech32, where a
            checksum catches your typos for you. And two mail formats older than most of the
            internet. {{ spellOutCapital(CHECKSUM_COUNT) }} of them check themselves on decode. Every
            one written from its RFC, BIP or reference code, with no codec library underneath.
          </p>
          <p class="landing-entry">
            <span class="console-tag">Import</span>
            <code>import { encodings, create } from "@agntn/encodings"</code>
          </p>
        </div>
        <LandingRegistry :sample="current" class="mt-10" @pause="paused = $event" />
      </div>
    </section>

    <LandingFeature
      :title="`${spellOutCapital(TOOLS.length)} tools, one executor`"
      to="/guide/agents"
      link="MCP, Pi, OMP and AI SDK"
      :checks="[
        TOOLS.join(', '),
        'A misspelled argument is an error, not a silent default',
        'Bytes come back as text when they read as text, as hex when they don\'t',
      ]"
      reverse
    >
      Ask a model to decode base58 and it decodes the vibe. Give it
      <code class="encodings-code">encodings_decode</code> and it decodes the string.
      <code class="encodings-code">encodings mcp</code>, the Pi and OMP extensions and
      <code class="encodings-code">@agntn/encodings/ai</code> all call the same executors. This page
      runs them too, so the dialog shows exactly what a model reads for
      <code class="encodings-code">"{{ SAMPLE_INPUT }}"</code>.
      <template #visual>
        <LandingToolCall :sample="current" @pause="paused = $event" />
      </template>
    </LandingFeature>

    <LandingFeature
      title="Your own encoding is one object"
      to="/guide/custom"
      link="Custom encodings"
      :checks="[
        'A name, info(), encode and decode. That\'s the Encoding interface',
        'register(encoding) and encode, decode and the tools see it',
        'identify tries it too, no extra wiring',
      ]"
    >
      Need octal because some puzzle printed <code class="encodings-code">od -b</code> output? Write
      the object, register it, and the registry treats it like a built-in. Even
      <code class="encodings-code">identify</code> picks it up. No plugin manifest, no base class
      to fight. Throw a <code class="encodings-code">DecodeError</code> for text that's wrong, and
      the CLI and the MCP server report it like one of their own. The alphabet you declare even
      feeds the small alphabet score.
      <template #visual>
        <LandingCustom />
      </template>
    </LandingFeature>

    <section class="encodings-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-20 sm:px-12 lg:px-16">
        <LandingStart />
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing-entry {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 20px 0 0;
  min-width: 0;
}
.landing-entry > .console-tag {
  flex: none;
  margin: 0;
}
.landing-entry > code {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
</style>
