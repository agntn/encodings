# AGENTS.md

Keep AGENTS.md updated with project status.

`@agntn/encodings` encodes, decodes and identifies binary-to-text encodings: hex, binary, octal, decimal, base32 (RFC 4648, its hex alphabet, Crockford, z-base-32), base45, base58 (Bitcoin, Flickr, Ripple, each with or without the Base58Check checksum), base64 (standard and URL alphabets), base85 (RFC 1924, Ascii85, Z85), basE91, bech32 and bech32m, uuencode and Quoted-Printable. Variants are options of their family, not encodings of their own. A library, the `encodings` CLI, an MCP server, Pi and OMP extensions and AI SDK tools. Docs at encodings.agntn.dev, from `docs/` (see `docs/AGENTS.md`).

## Domain

- Every codec is written here from its spec: RFC 4648, RFC 9285, RFC 1924, BIP173, BIP350, ZeroMQ RFC 32, the basE91 reference C code, POSIX uuencode, RFC 2045. No `@scure/base`, `bs58` or other codec library, by design. The one dependency is `@agntn/hashes` for the double SHA-256 of Base58Check, imported from its `./sha2` subpath.
- Codec objects (`base58`, `bech32`, `quotedPrintable`, ...) work on bytes. The registry (`create`, `encode`, `decode`, `encodings`, `register`, `resolveEncoding`) wraps them as `Encoding`, reads strings as UTF-8, checks options against `info().options` and returns `{ bytes, details }`.
- `src/core/radix2.ts` is the one engine for power-of-two alphabets (base32 family, base64 family). Hex and binary have their own small codecs, octal and decimal share `createNumbers` in `src/core/numbers.ts`; base58, base45, base85 and base91 do their own arithmetic.
- Decoding is strict where the spec is (bad characters, wrong padding, impossible lengths, checksums, values out of range) and lenient where real text is wrapped: base32 and base64 skip ASCII whitespace, hex takes either case, spaces and `0x`, Crockford reads its look-alikes, Ascii85 takes `<~ ~>` or not, Quoted-Printable takes a bare CR. Each rule has a test in `test/codecs.test.ts`.
- Errors: `EncodingError` is the base. `DecodeError` (with `encoding` and `index`), `ChecksumError`, `UnknownEncodingError`, `InvalidOptionError`. The CLI prints any `EncodingError` as one line with exit 1 and the MCP adapter turns it into a tool error, so a codec never throws a plain `RangeError` for bad input (Z85 did once).
- `named()` and `shown()` in `src/core/errors.ts` keep invisible and line-breaking characters out of messages: a character outside letters, marks, numbers, punctuation, symbols and space is named by code point only, and `quote()` escapes C1 controls, U+2028, U+2029 and every `Cf` character as UTF-16 `\u` escapes. Tool text and CLI stderr go through them for every value that came from the input.
- `toWords`, `fromWords` and `fromWordsUnsafe` regroup bytes and 5-bit words for formats that borrow bech32's words under another checksum, such as CashAddr. They live on `./bech32` only, not in the root barrel, and `test/index.test.ts` lists them as subpath only.
- `createBase58check(hash, alphabet?)` builds Base58Check over another hash or alphabet: the caller's `hash` runs twice and the first four bytes are the checksum, as `base58` with `check` is `createBase58check(sha256)`. Decred passes `blake256` from `@agntn/hashes/blake256`; the XRP Ledger needs none of it, since `base58` takes `alphabet: "ripple"` with `check`. The hash comes from the caller, so `src/` imports no other hash. An alphabet that isn't 58 distinct characters and a hash under four bytes throw `InvalidOptionError`. It lives on `./base58` only, like the bech32 words.
- `bech32` in the registry prefers the segwit reading: a valid segwit address of the variant `m` picks comes back as its program with `witnessVersion` in `details`, anything else as the bytes its words carry. `segwit.decode` alone takes either variant and checks the version against it.
- A variant is an option of its family, not an encoding: `alphabet` on base32 (`standard`, `hex`, `crockford`, `z`), base58 (`bitcoin`, `flickr`, `ripple`), base64 (`standard`, `url`) and base85 (`rfc1924`, `ascii85`, `z85`), `check` on base58 for Base58Check, `m` on bech32 for Bech32m. The codec objects take the same options; `base32crockford`, `zbase32`, `base58check`, `base58flickr`, `base58ripple`, `ascii85` and `z85` are gone, while `bech32m` stays on `./bech32` as the BIP350 primitive `segwit` uses. `padding` (default true) pads only the two RFC 4648 base32 alphabets and base64; `delimiters` belongs to `ascii85` and throws elsewhere. A string option lists its values in `choices`, and the registry refuses anything else. Every value of `alphabet` is repeated in `ALPHABETS` in `src/tool-contract.ts`, so the schemas load without the codecs, and `test/mcp.test.ts` holds the two together.
- `binary` takes `symbols` (the two characters for 0 and 1, default `01`, never whitespace), `bits` and `order`. Two code points are two symbols, so zero-width ZWNJ and ZWJ work. Otherwise `Intl.Segmenter` splits symbols and text into graphemes, so `♥️` with its U+FE0F is one symbol. `bits` is 1 to 8 per byte and `order` is `msb` or `lsb`, all three marked `decode`. `identify` tries `order=lsb` by itself, since it is a choice, and leaves the free `symbols` and `bits` at their default. A byte too big for `bits` throws `EncodingError` on encode.
- An option marked `decode` in `info().options` changes how text reads, so `decode` takes it too: in the codec, in the registry (`decode(name, text, options)`), on the CLI (`decode --alphabet hex`) and in `encodings_decode`. Any other option is refused there. `identify` tries every combination of those options changed from their default (every other choice, every flipped switch), fewest changes first, and gives the candidate `options` when it needed some (a layer of `peel` too), leaving out a reading whose bytes one with fewer changes already gave, so plain base64 text shows up once. An option marked `checksum` (base58 `check`) counts as a matched checksum when it is on.
- `identify` scores what it can show: a checksum that matched, framing only one encoding writes, decoded text, a small alphabet. It drops candidates that decode to nothing or to the input itself, and Quoted-Printable without an `=XX` escape. It skips the base58 family above 1024 characters, since base58 is quadratic. The confidence ranks; it is not a probability.
- `peel` repeats `identify` one layer at a time. A layer is confirmed by a checksum, framing or at least 8 bytes of readable text (shorter text comes out of plain words by chance), and peeling goes on only from a confirmed text layer. When nothing is confirmed, the best candidate comes last with `confirmed: false`, but only if the text holds a digit and no whitespace (or the guess has an alphabet of 16 or fewer), so plain text ends the peel instead of a base32 guess. `encodings_identify` takes it as `peel` and `limit` then counts layers; the CLI as `identify --peel`. A layer with another under it keeps its text there even with a control character, escaped, since that text is what the next layer reads; a lone candidate with one shows as hex.
- `encodings_encode` and `encodings_decode` pass the codec only the options its encoding declares for that direction and name the rest in the reply. A model with strict function calling (OMP on `openai-codex`) fills every field of the schema, and `options` holds the fields of all encodings, so base91 used to get a bech32 `prefix` and fail. An `alphabet` value of another encoding is set aside the same way and named as `alphabet=<value>`. The library and the CLI still refuse an option the encoding does not take.
- Tool limits live in `src/tool-contract.ts` and are checked twice, in the schema and in the executor: text up to 100000 characters, base58 up to 10000, 20 identify candidates or peeled layers. `src/tool-operations.ts` re-exports them for the docs playground.
- Test vectors: the RFC and BIP vectors in `test/codecs.test.ts`, and outputs of independent implementations frozen in `test/fixtures/references.ts` (base-x 5.0.1, node-base91 0.3.4, base32-encode 2.0.0, CPython 3.12.13 `base64` (including `b85encode`)/`binascii`/`quopri`, base45 0.4.4, pyzmq 27.2.0). A new codec gets the same: a spec vector and a frozen outside reference where one exists.
- `test/bundle.test.ts` builds the current source and bundles every family subpath with rolldown; it fails when one pulls in another family or the registry.

## Status

- Node.js 26 is the minimum and the only version CI tests and releases on.
- Stable TypeScript 7 typechecking and declaration builds are complete and verified.
- Direct dependencies and pnpm are updated to their latest stable releases and verified.
- npm publishing uses GitHub Actions OIDC trusted publishing without a long-lived registry token.
- A failed Publish run is recovered with `gh workflow run publish.yml --ref main -f tag=vX.Y.Z`, not a rerun: a rerun takes `publish.yml` from the tag's commit, so a workflow fix merged since never reaches it. The dispatch checks out `refs/tags/<tag>`, so a branch name typed as the tag fails the checkout instead of publishing `main` under the bumped version. `test/release.test.ts` pins that ref.
- A publishable Pi extension with isolated typechecking is complete and verified.
- A publishable OMP extension sharing the isolated typechecking setup is complete and verified.
- `pnpm typecheck` covers `test/` through `test/tsconfig.json`, after the build, since tests import the extensions and their `dist` types. Vitest only strips types, so nothing checked the tests before.
- The OMP extension imports nothing from `@oh-my-pi/pi-coding-agent` at runtime: `@agntn/tools/omp` draws the status line with the host `theme` and the `Text` the host hands over as `pi.pi.Text`. Compiled OMP injects no `/tui`, so `renderStatusLine` from there stopped the extension loading; the unit test still throws on that import.
- Each tool is declared once in `src/tools.ts` with `defineTool` from `@agntn/tools`, and the MCP server, both extensions and `src/ai.ts` take that list through its adapters. The executors in `src/tool-operations.ts` load on the first call, so the extensions register without loading the library. Schemas take `Type` from `@agntn/tools`, never from `typebox`: OMP rewrites a bare `typebox` import to its own facade, and `Value.Check` then accepts anything.
- The manifest has no `typebox`, zod or `@modelcontextprotocol/sdk` 1.x left. MCP runs on `@modelcontextprotocol/server` 2.x, and Pi 0.99 stopped warning about `typebox` in `dependencies`.
- A tool executor throws when it can't answer, and its `ToolResult` has no `isError`. The Pi adapter keeps its default `failures: "throw"`, since Pi up to 0.98 records every returned value as a successful call. The MCP adapter turns the throw into a sanitized `isError` result.
- MCP error text and OMP renderer text go through `sanitizeLine` from `@agntn/tools`, which replaces `[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]` with spaces. U+2028 and U+2029 are not `Cc`, `JSON.stringify` leaves them literal, and most renderers still break a line on them. `Cf` covers bidi overrides and isolates, zero-width characters and tag characters, which make a line read differently from its bytes; it handles a single line, so dropping ZWJ and ZWNJ costs nothing there.
- A local MCP server needs a restart, not `pnpm build`: inside a checkout `dist/cli.mjs` loads the `mcp` command from `src/` (see Conventions). `test/cli.test.ts` proves both modes and each guard. Its load hook writes the module list to a file: stderr written in an exit handler stops at about 146 KB in a pipe, so a long checkout path cut the JSON.
- Extension tests go through `test/fixtures/`: Pi's own loader and runner for Pi, a strict OMP host double that throws by name on any member the test did not stub. The OMP package root ships TypeScript inside `node_modules`, so Node cannot load its real loader.
- `pnpm release` and the Publish workflow build before `pnpm test`, as CI does. The `mcp` checks in `test/cli.test.ts` start `dist/cli.mjs`, so testing first ran them against a stale build, or skipped them on a clean runner. `test/release.test.ts` fails when either order flips.
- The CLI keeps citty's colors out of pipes, files and terminals without color support.
- `src/cli.ts` reads the arguments before citty does and stops at the first one that starts with a dash but names no option of the command, with one line that points at `--`. citty takes encoded text such as `-_8` for flags, and a flag named `_` overwrites its positionals and crashes it with a `TypeError`.
- Linting and formatting consume the shared `@agntn/ox` policy.
- `vp fmt` skips the root `CHANGELOG.md`. changelogen writes two spaces after the ⚠️ of a breaking entry and oxfmt wants one, so the check failed after every breaking release. The pattern is anchored, so a nested `CHANGELOG.md` is still formatted.
- `pnpm-workspace.yaml` exempts `@agntn/*` from `minimumReleaseAge`. A clean frozen install rejects a lockfile entry younger than a day, so CI failed for a day after every sibling release. The scope pattern also covers the next package and version, which an exact entry does not.
- The toolchain runs on Vite+ 1.0 for lint, fmt and test, and CI installs through `voidzero-dev/setup-vp`. The build went back to obuild, like `@agntn/puzzles`, `@agntn/keys` and `@agntn/hashes`: the same `dist/` files and exports as `vp pack`, with less JS.

## Stack

- **Runtime**: Node.js >= 26
- **Language**: TypeScript (strict)
- **Toolchain**: Vite+ (`vp`), one `vite.config.ts` for test, lint and fmt
- **Build**: obuild from `build.config.ts`, one bundle for all five entries, chunks under `dist/_chunks/` with stable names
- **Test**: `vp test` (bundled Vitest, API from `vite-plus/test`)
- **Lint**: `vp lint` + `vp fmt` (Oxlint + Oxfmt) through `@agntn/ox`
- **Typecheck**: tsc (native TypeScript 7)
- **Release**: changelogen
- **Package manager**: pnpm

## Scripts

- `pnpm dev` - `obuild --stub`, so `dist` re-exports `src`. The three `mcp` bundle checks in `test/cli.test.ts` fail against it; run them after a real build
- `pnpm build` - production build
- `pnpm test` - run tests once
- `pnpm test:watch` - run tests in watch mode
- `pnpm lint` - lint + format check
- `pnpm fmt` - auto-fix lint + format
- `pnpm typecheck` - type checking
- `pnpm release` - build, test against that build, and release, in CI's order

## Structure

```
src/core/                - codecs, registry, identify, errors, types
src/<family>.ts          - one subpath per family: binary, octal, decimal, hex, base32, base45, base58, base64, base85, base91, bech32, uuencode, quoted-printable
src/tools.ts             - the four tool definitions; tool-operations.ts runs them, tool-contract.ts holds the limits
src/commands/            - encode, decode, identify, list, mcp
docs/                    - Docus site for encodings.agntn.dev
test/                    - tests
test/fixtures/           - typed Pi and OMP extension test hosts, frozen outputs of other implementations
packages/omp/extensions/ - OMP extension sources shipped with the package
packages/pi/extensions/  - Pi extension sources shipped with the package
dist/                    - build output (generated)
```

## Conventions

- ESM only (`"type": "module"`)
- Exports use `.d.mts` / `.mjs` extensions
- Strict TypeScript (all strict checks enabled)
- No `as any`, `@ts-ignore`, or `@ts-expect-error`
- Local MCP from source: `src/cli.ts` imports the `mcp` command from a runtime URL of `src/commands/mcp.ts` when the bin is built, `ENCODINGS_DIST` is not `1`, the path has no `node_modules` segment (Node refuses to strip types there) and the file exists (the npm package ships only `dist`). Otherwise it takes the bundled command. Every runtime import on that path is a `dependency`, so no devDependency guard. Only an edit to `src/cli.ts` itself still needs a build. Relative imports end in `.ts` and `erasableSyntaxOnly` holds, or plain Node cannot run `src/`.

## Status

- Pull requests and issues use short, freeform descriptions focused on why a change is needed or what went wrong.
