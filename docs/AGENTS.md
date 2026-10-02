# docs/

Docus site for `@agntn/encodings` at encodings.agntn.dev. Markdown lives in `content/`. The playground is a Vue page that imports the library into the browser. There's no server API, because the library needs none.

## Layout

```
docs/
├── DESIGN.md                      # the instruments this site owns and where it departs from the agntn design system
├── nuxt.config.ts                 # extends: ['docus'], cloudflare_module preset (Workers), @agntn/encodings and #tool-operations aliased to ../src
├── shiki-theme.ts                 # code block theme, every colour a --shiki-token-* variable from app.css
├── app/app.config.ts              # title, github, theme, the Nuxt UI variants in the instrument grammar
├── app/app.css                    # theme tokens, the shared `console-*` and `hero-*` grammar, `encodings-*` classes
├── app/components/                # Docus overrides: header, tabs, sidebar, table of contents, page links, surround, callout
├── app/components/content/        # MDC components (`::landing-home`, `::encoding-facts`, `::encoding-roster`), the landing instruments, Prose* overrides, EncodingsPlayground
├── app/components/OgImage/        # Docs.takumi and Landing.takumi override the Docus OG templates
├── app/assets/fonts.css           # @font-face for the TTFs served from public/fonts (site and OG images)
├── app/composables/               # useLandingSample (one clock for every live panel), useSubNavigation, useCopied, useRosterFlip
├── app/utils/                     # encodings table (icons, blurbs, groups, overhead over the library's info()), tools (the agent tools' text), tokens, roster, formatting
├── app/pages/playground.vue       # playground, own route outside the docs layout, its own useSeo and OG image
├── server/routes/sitemap.xml.ts   # Docus sitemap plus the Vue pages it cannot see
├── public/                        # fonts, favicon.svg and the icons and manifest cut from it
├── content/index.md               # landing
├── content/1.guide/               # getting started, encoding and decoding, checksums, identify, CLI, agents, custom, playground
└── content/2.encodings/           # overview, one page per encoding in listing order
```

## Commands

```bash
pnpm install          # from docs/, the repo root needs no install or build first
pnpm dev              # http://localhost:3000
pnpm build            # Cloudflare Workers output in .output/, content routes prerendered
pnpm deploy           # build, then wrangler deploy to encodings.agntn.dev
```

Deployment: Workers Builds with root directory `docs`. It installs `docs/` and nothing else, and that's enough, because the library comes from `../src` (next paragraph). Nitro preset `cloudflare_module`. Nuxt Content wants a D1 binding named `DB`. `wrangler.jsonc` carries it plus the `NUXT_SITE_URL` var. No KV binding. Nothing is fetched, so nothing is cached.

`@agntn/encodings` is an alias in `nuxt.config.ts` for `../src/index.ts`, and `#tool-operations` for `../src/tool-operations.ts`. Vite bundles the checkout's sources for the browser and Nitro gets the same alias for the prerender, so `dist/` and the root `node_modules` are never touched. Nothing under `src/` imports `node:*`. One npm import does sit in that graph: `src/core/base58.ts` takes `hash256` from `@agntn/hashes/sha2` for Base58Check. That's why `docs/package.json` pins `@agntn/hashes` to the root's version and `nuxt.config.ts` lists it in `vite.resolve.dedupe` and `@agntn/hashes/sha2` in `vite.optimizeDeps.include`. Vite resolves a bare import in `../src` from the repo root upward, never from `docs/node_modules`. A new npm import under `src/` needs the same three entries or it breaks the deploy. Bump the pin together with the root's.

`pnpm-workspace.yaml` exempts `@agntn/*` from `minimumReleaseAge`, since a clean frozen install rejects a sibling released less than a day ago.

Two resolution traps, both because the repo root is its own pnpm workspace:

- `pnpm-workspace.yaml` sets `shamefullyHoist: true`. Without it `docs/node_modules` holds only direct dependencies, Node walks up to the root `node_modules`, and the server bundle can end up with a second copy of Vue.
- `nuxt.config.ts` pins `workspaceDir` to `docs/`, disables devtools and telemetry, and adds `../src` to `vite.server.fs.allow`, since `pnpm dev` couldn't load the library otherwise.

## Live values

- Every value on the landing, in the roster and on the encoding pages comes from the library at render time. `ENCODINGS` in `app/utils/encodings.ts` maps the built-in names through `create(name).info()`. An encoding added to the library needs one line in `BUILTINS`, `PRESENTATION` and `GROUP_OF`; the types require all three, and dev warns when `BUILTINS` drifts from `encodings()`.
- `useLandingSample` encodes `hello world!` with every encoding for the alphabet panel, the round trip file, the identify console and the tool call. Twelve bytes, so Z85 takes it and base32 still pads.
- `overhead()` encodes 600 pseudo-random bytes and measures the text. 600 is where the ratio has settled and base58, which is quadratic, still costs a couple of milliseconds.
- Every text a tool would hand a model, in the `03 Full tool response` rows and the playground, comes from `src/tool-operations.ts` through the `#tool-operations` alias. The page runs the executors the MCP server runs, not a copy. `src/tool-operations.ts` re-exports `INPUT_FORMATS`, `OUTPUT_FORMATS` and the limits for the playground.
- Counts in prose (the headline, the OG image, the SEO description, the playground) come from `ENCODINGS.length`, `CHECKSUM_COUNT` and `GROUPS` through `spellOut`. Frontmatter and `content/` can't call a function, so they never state a count. `::encoding-roster` goes where a list would.
- The samples are deterministic, so SSR and the client agree and hydration doesn't flicker. Keep it that way. No `Math.random`, no clock inside a computed.
- `EncodingsPlayground.vue` reads the deep link through a `watch(route.query)` registered in `onMounted` that fires once. A prerendered page hydrates with an empty `route.query` and Nuxt restores the address only afterwards. It writes state back with `router.replace` on every change and runs a call 250 ms after the form stops changing.
- The playground catches `EncodingError` and shows the class name and the message. Anything else is a bug in the library and belongs there, not in a try/catch here.
- The octal file on the landing (`LandingCustom.vue`) is a literal. Its comments `"150 151"` and `"octal"` were checked by running the file against the library; check them again if you touch it.

## SEO

- `seo.schema` in `app/app.config.ts` emits the landing JSON-LD: `WebSite`, the agntn `Organization` as publisher, and a free `SoftwareApplication` with `sameAs` on GitHub and npm.
- `server/routes/sitemap.xml.ts` wraps the Docus sitemap and appends the Vue pages listed in `PAGES`; a new page under `app/pages/` goes there too.
- `public/favicon.svg` is the source, the PNGs and the `.ico` are cut from it with ImageMagick.

## OG images

- `app/components/OgImage/Docs.takumi.vue` and `Landing.takumi.vue` override the Docus templates and are rendered by Takumi at build time. Takumi has no CSS variables, so the theme colours are repeated there as literals. An encoding page's card is built from its `info()`, not from the description.
- `app/assets/fonts.css` declares the Figtree and Fira Code TTFs in `public/fonts`, which is where nuxt-og-image reads them.
- Descriptions go without commas and without a trailing period: Docus puts them in the OG file name, where a comma is a separator and `..png` is skipped without a word. A `: ` in a frontmatter description is a YAML mapping and the page vanishes from the prerender.

## Constraints

- Text a visitor types into the playground is rendered as text, through interpolation or a `<pre>`. Never `v-html`, never evaluate.
- The sidebar takes a guide page's icon from `NAV_ICONS` in `app/composables/useSubNavigation.ts`, not from its frontmatter, so a new page goes there too.
- Every vector quoted in `content/` came out of the library in `src/`. Check a new one the same way, and against an outside reference where one exists.
- No bold run at the start of a list item in `content/`. With remark-mdc 3.11.1 and mdast-util-to-markdown 2.1.3 the `/llms-full.txt` serializer recursed until the stack ran out on `- **A matching checksum.** …` in the identify guide, and the prerender logged a 500 for that file while every page rendered fine. Check `curl -s -o /dev/null -w '%{http_code}' localhost:<port>/llms-full.txt` after adding emphasis to a list.
- The site makes no network request for its own work and stays that way. The footer says so.
