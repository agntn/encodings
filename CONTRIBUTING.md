# Contributing

## Setup

The commands are in the README. Here's what they don't tell you.

Build before you test. The `encodings mcp` checks in `test/cli.test.ts` start `dist/cli.mjs`. Against the `pnpm dev` stub, three of them fail. The release workflow builds first on the tag for the same reason, and `test/release.test.ts` keeps it honest.

Serving `encodings mcp` from your checkout? The built bin loads that command from `src/`. A change wants a server restart, not a build. Only an edit to `src/cli.ts` itself needs one. That's also why relative imports end in `.ts` and `erasableSyntaxOnly` holds: plain Node runs `src/` as it is.

## Codecs

- Every codec is written here from its spec: the RFC, the BIP, the reference C code. No `@scure/base`, no `bs58`, no codec library at all, and that's the point. The one dependency is `@agntn/hashes`, for the double SHA-256 of Base58Check. `createBase58check` takes any other hash from the caller, so `src/` never imports one.
- A new codec gets a spec vector in `test/codecs.test.ts`. If another implementation exists, freeze its output in `test/fixtures/references.ts` too, with its name and version.
- Strict where the spec is strict, lenient where real text gets wrapped. Every leniency has its own test.
- Bad input throws an `EncodingError` subclass, never a plain `RangeError`. The CLI and the MCP server turn only those into one clean line. Values from the input reach a message through `named()`, `shown()` or `quote()`.
- Input of the wrong type gets the same treatment. Every `encode` and `decode` opens with `requireBytes` or `requireText`. Skip it and an untyped string slips into an encoder and comes out as zeros.
- A variant is an option of its family, not an encoding. A new alphabet goes into its `choices` and into `ALPHABETS` in `src/tool-contract.ts`, and `test/mcp.test.ts` checks the two agree.
- A code page names the character each byte already is, so `charsets` stays out of the registry and `identify` never guesses one. Ori's call, settled in #12.

## Agent tools

- Each tool is declared once in `src/tools.ts`. The MCP server, the site's `/mcp`, both extensions and `src/ai.ts` serve that list, so a fix never lands on one surface only.
- Limits live in `src/tool-contract.ts` and are checked twice, in the schema and again in the executor.

## Docs site

- `docs/` is a member of the root workspace. Workers Builds runs its install there, pnpm walks up to the root lockfile and fills both `node_modules`. Node.js still comes from the root `.node-version` only, not from `engines`. Lose that file and the build quietly runs on Node.js 24.
- Nothing is hoisted, so every package the site imports sits in `docs/package.json`, and `test/docs-dependencies.test.ts` fails on the one you forgot. Versions live in the `deps` and `dev` catalogs of `pnpm-workspace.yaml`: one line moves the library and the site together.
- The site bundles `../src`, and a bare import there resolves from the repo root. `vite.resolve.dedupe` pins the library's runtime deps to the site's copy, so a new import under `src/` goes there and into `docs/package.json`. Does the browser load it? Then `vite.optimizeDeps.include` too.
- Every vector in `content/` came out of the library. Counts come from code through `spellOut`, so `content/` and frontmatter never state one.
- Samples stay deterministic, so the server render and hydration agree: no `Math.random`, no clock inside a computed.
- Text a visitor types is rendered as text. Never `v-html`, never evaluated.
- `public/favicon.svg` is the source. The PNGs and the `.ico` are cut from it with ImageMagick.

## Releasing

There's no release command anymore. Merging a PR is the release command. Every push to `main` refreshes a draft release PR from [uppt](https://github.com/danielroe/uppt). The version comes from the conventional commits, and the notes are already written. Merge it when the version looks right.

That tags `vX.Y.Z` and cuts the GitHub release. Then `release.yml` runs on the tag to test, pack and stage the tarball on npm. Nothing goes public until you approve it on npmjs.com. The notes live in GitHub Releases, and so does every section the old `CHANGELOG.md` had.

Publish failed? `gh workflow run release.yml --ref vX.Y.Z` runs test, pack and publish on the tag again. It runs the tag's own `release.yml`. A workflow fix merged since waits for the next version.
