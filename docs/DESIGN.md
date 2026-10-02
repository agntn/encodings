# Design system

The shared rules (direction, color roles, type, the `console-*` grammar, hero, docs chrome, density, motion, checks) live in the one agntn design system document, kept with the agntn skills until it ships in the shared package. This file records only what encodings owns and where it departs from the shared rules. It does not repeat them.

The instruments encodings owns:

| Instrument | Where | Object |
| --- | --- | --- |
| [LandingHero.vue](app/components/content/LandingHero.vue) | landing, first screen | hero zone, circuit `encode` into the alphabet |
| [LandingAlphabet.vue](app/components/content/LandingAlphabet.vue) | under the hero | `hello world!` through one encoding, the text it wrote, and the encoding's whole alphabet with the characters the text used lit |
| [LandingRotatingCode.vue](app/components/content/LandingRotatingCode.vue) | "Same call, every encoding" | `encode`, `decode`, the round trip and `identify` for the sample, as a file |
| [LandingIdentify.vue](app/components/content/LandingIdentify.vue) | "A guess that shows its work" | identify console: the sample's text through `encodings_identify`, the top three candidates and a tick per encoding that reads it |
| [LandingRegistry.vue](app/components/content/LandingRegistry.vue) | the registry section | every encoding as a grid of cells, one band per group (bit groups, big number, fixed blocks, checksummed words, mail), the walk's encoding and its family on the nodes |
| [LandingToolCall.vue](app/components/content/LandingToolCall.vue) | "Four tools, one executor" | one `encodings_decode` call, full text in the dialog |
| [LandingCustom.vue](app/components/content/LandingCustom.vue) | "Your own encoding is one object" | `octal.ts`, a custom encoding as a file, folded |
| [LandingStart.vue](app/components/content/LandingStart.vue) | closing section | install, notes, first calls as a file |
| [EncodingFacts.vue](app/components/content/EncodingFacts.vue) | every encoding page (`::encoding-facts`) | encoding dossier: ID bar with position, reticle, readout, sample out and back, alphabet, options, access |
| [EncodingRoster.vue](app/components/content/EncodingRoster.vue) | `/encodings` (`::encoding-roster`) | roster of the registry on `UTable`, sortable |
| [EncodingsPlayground.vue](app/components/content/EncodingsPlayground.vue) | `/playground` under the hero zone | request and response instruments for every tool |
| [Landing.takumi.vue](app/components/OgImage/Landing.takumi.vue), [Docs.takumi.vue](app/components/OgImage/Docs.takumi.vue) | OG images | the hero zone in 1200 by 600; a docs page as one instrument, an encoding page with its blurb, family, alphabet size and who uses it |

Labels, families, standards, alphabets, checksums and options come from `create(name).info()` through [encodings.ts](app/utils/encodings.ts); icons, blurbs, groups and who uses an encoding live there too. Every tool text comes from `src/tool-operations.ts` itself.

## Anatomy

- **Alphabet.** Bar `Call encode("<name>", "hello world!")` with the options where the encoding needs them, meta `<family> · 12 / 20`. The subject band's left column holds the encoding (reticle, `Encoding / <family>`, label, blurb; every sample's name block hidden in the same cell, so the band keeps one height) and under it the board: rule `Alphabet [ what it writes, the sample's characters lit ]`, an `In` tape with one boxed cell per byte, an `Out` line with the text in the accent (line breaks shown as `↵`), then one cell per alphabet character, 32 to a row (16 under 640px), a used character open in the accent. The grid keeps room for the widest alphabet in the walk, Quoted-Printable's 96, so the band never jumps. Readout: size in bytes and characters, overhead in the accent with how much of the alphabet the sample used, padding or checksum, who uses it or the standard; a tick per registered encoding with the sample's family open. Footer: link to the encoding page, previous and next.
- **Identify.** Bar `Call encodings_identify("<text>")`, meta `ranked`. Subject: `Guess / <score>`, the best candidate and whether it's the encoding that wrote the text, the reasons as a sentence. Readout: three rows always (an empty one says `no other reading`), each the encoding, what it decodes to and its score as a badge, the sample's own encoding on the accent edge; a tick per registered encoding, open where it decodes the text. `03 Full tool response` is the `encodings_identify` text.
- **Encoding dossier.** ID bar with the name and `17 / 20`, meta `<family> · <n> characters`. Subject: reticle, `Encoding / <family>`, label, blurb. Readout: overhead in the accent, checksum or padding, standard, who uses it or the family size; a tick per encoding with the family open. Bands `Sample [ encode(...), computed here ]` (out, back with any details, then the alphabet grid with the sample's characters lit), `Options [ as info() declares them ]` where there are any, and `Access [ library · CLI · playground ]` as leads (the family subpath import, the CLI line, the playground, a `Kin` lead to the rest of the family), then `03 Full tool response` with the `encodings_info` text.
- **Registry.** Bar `Call encodings()`, meta the count and the number of groups. One band per group under a rule title with its size and what the group does (the sentence hides under 640px), then a cell per encoding (glyph, name, node): the walk's encoding a filled node on an accent edge, its family an accent outlined node, everything else quiet.
- **Roster.** Columns encoding (glyph, label, boxed name), alphabet, overhead on random bytes, checksum, options (required bright, optional with `?`), the standard behind a leader with the whole text in the tooltip.
- **Playground.** Request: every tool as a lead, fields as `USelectMenu`, `UTextarea`, `UInput` and `UCheckbox` with variant `none` in the readout, option fields only for an encoding that declares them, `limit` empty with the default of the mode as its placeholder, `peel` as a checkbox, one chip per encoding as `UButton` variant `chip` (one per kind of evidence for identify), CLI and tool JSON with copy. Response: a subject band per answer kind (encoded text with size and overhead, decoded value with what the text carried, a ranking with a `decode` button that carries the text along, the peeled layers outermost first with a `guess` badge on an unbacked last one and a `decode` button that carries the layer above along, listing rows, one encoding's options, error), `03 Full tool response`, footer to the encoding page and the guide.

## Motion

| Change | Motion |
| --- | --- |
| landing sample advances (4.2 s, paused on hover and focus) | ruler cursor once, scan and reticle arcs, readout rows slide in, alphabet cells drop in 4 ms apart, file name rolls, circuit runs once |
| playground answer changes | cursor and scan once per answer text, 250 ms after the form stops changing |
| reduced motion | no walk; manual previous and next still work |

## Differences

Departures from the shared rules, recorded for the shared package:

- The hero instrument is an alphabet, not a record dossier: the domain is text made of a fixed set of characters, so the first screen shows which of them one sample uses. It works for every encoding, base58 and basE91 included, where a picture of regrouped bits would not.
- The registry groups by mechanism, not by family. Most families have one member, so a band per family would be a band of single cells.
- One docs section for the encodings, no tabs per family: a couple dozen entries, under the point where a section splits.
- No network call anywhere: every instrument computes in the browser from the library, and every footer that names locality says `no network`.
- The version comes from the root `package.json`; there's no data version.
- The OG images ship local Figtree and Fira Code TTFs, the keys mechanism.
- There's no `public/image.png`, since `package.json` points Pi at no image.

## Checks

Beyond the shared checks: `/`, `/encodings`, `/encodings/bech32`, `/encodings/quoted-printable` and `/playground` with a deep link for every tool (`?op=decode&encoding=base58check&text=1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb`, `?op=encode&encoding=bech32&input=gm&prefix=test`, `?op=identify&text=MZXW6%3D%3D%3D`, `?op=identify&text=5958523059574e7249474630494752686432343d&peel=true`, `?op=info&encoding=uuencode`) at 1440, 1024 and 390 px, no horizontal scroll at 320 px, and `/llms-full.txt` answering 200.
