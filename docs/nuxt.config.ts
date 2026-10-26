import { resolve } from "node:path";
import { encodingsTheme } from "./shiki-theme";

/** Bundled from the checkout's sources: no dist/, and its imports resolve from the root. */
const librarySource = resolve(import.meta.dirname, "../src");

/** Runtime deps under src/index.ts and src/tools.ts, installed here so they resolve from docs/node_modules. */
const libraryDependencies = ["@agntn/hashes", "@agntn/tools"];

/** A page that moved for good. Prerendered, it'd be a refresh page answering 200, not a 301. */
function moved(to: string) {
  return { redirect: { to, statusCode: 301 }, prerender: false } as const;
}

export default defineNuxtConfig({
  extends: ["docus"],
  alias: {
    "@agntn/encodings": resolve(librarySource, "index.ts"),
    /** The text the agent tools answer with; it imports nothing beyond the library. */
    "#tool-operations": resolve(librarySource, "tool-operations.ts"),
  },
  vite: {
    build: { target: "es2024" },
    resolve: {
      /** Bare imports in ../src resolve upwards from the importer and skip docs/node_modules. */
      dedupe: libraryDependencies,
    },
    optimizeDeps: {
      include: ["@agntn/hashes/sha2"],
    },
  },
  devtools: { enabled: false },
  telemetry: false,
  site: {
    url: "https://encodings.agntn.dev",
    name: "@agntn/encodings",
  },
  /** The playground has no markdown twin, so agents get the page itself, not a `/raw` 404. */
  agentDiscovery: {
    excludePrefixes: { extend: ["/playground"] },
  },
  /** Docus lists `content/` only and leaves app routes out, so the Vue pages come from here. */
  sitemap: {
    sources: ["/api/__sitemap__/pages"],
  },
  llms: {
    domain: "https://encodings.agntn.dev",
    title: "@agntn/encodings",
    description:
      "Encode, decode and identify base64, base58, Base58Check, bech32, bech32m, base32, Ascii85, Z85, basE91 and the rest of the registry, written from the specs, as a library, a CLI, an MCP server and Pi and OMP extensions. Computed locally.",
    sections: [
      {
        title: "MCP Server",
        description: "The tools of `encodings mcp` and the page tools of this site over Streamable HTTP.",
        links: [
          {
            title: "MCP endpoint",
            href: "https://encodings.agntn.dev/mcp",
            description:
              "Add it to any MCP client as an HTTP server, for example `claude mcp add --transport http encodings https://encodings.agntn.dev/mcp`.",
          },
        ],
      },
      {
        title: "Playground",
        description: "Encode, decode, identify and list the encodings, in the browser.",
        links: [
          {
            title: "Playground",
            href: "https://encodings.agntn.dev/playground",
            description: "The library running in the page: encodings_encode, encodings_decode, encodings_identify and encodings_info.",
          },
        ],
      },
      /** Spelled out, or agent discovery sees the links above and leaves every content page out. */
      {
        title: "Guide",
        contentCollection: "docs",
        contentFilters: [{ field: "path", operator: "LIKE", value: "/guide%" }],
      },
      {
        title: "Encodings",
        contentCollection: "docs",
        contentFilters: [{ field: "path", operator: "LIKE", value: "/encodings%" }],
      },
    ],
  },
  /** Docus pages define their own OG images; the alt text is the one thing they leave unset. */
  ogImage: {
    defaults: {
      alt: "@agntn/encodings: encode, decode and identify, computed locally",
    },
  },
  icon: {
    clientBundle: {
      icons: [
        "lucide:activity",
        "lucide:arrow-down",
        "lucide:arrow-left",
        "lucide:arrow-right",
        "lucide:arrow-right-left",
        "lucide:arrow-up",
        "lucide:arrow-up-right",
        "lucide:binary",
        "lucide:blocks",
        "lucide:book-open",
        "lucide:bot",
        "lucide:calculator",
        "lucide:chart-column",
        "lucide:check",
        "lucide:check-circle",
        "lucide:chevron-down",
        "lucide:chevron-left",
        "lucide:chevron-right",
        "lucide:chevrons-up-down",
        "lucide:circle-alert",
        "lucide:circle-check",
        "lucide:circle-x",
        "lucide:columns-3",
        "lucide:copy",
        "lucide:disc-3",
        "lucide:expand",
        "lucide:external-link",
        "lucide:flask-conical",
        "lucide:flip-horizontal-2",
        "lucide:grid-2x2",
        "lucide:grid-3x3",
        "lucide:hash",
        "lucide:key-round",
        "lucide:keyboard",
        "lucide:library",
        "lucide:link",
        "lucide:list-ordered",
        "lucide:plus",
        "lucide:radio",
        "lucide:rotate-ccw",
        "lucide:rotate-ccw-key",
        "lucide:split",
        "lucide:square-sigma",
        "lucide:table",
        "lucide:terminal",
        "lucide:x",
        "simple-icons:github",
        "simple-icons:npm",
        "vscode-icons:file-type-js",
        "vscode-icons:file-type-json",
        "vscode-icons:file-type-shell",
        "vscode-icons:file-type-typescript",
      ],
    },
  },
  colorMode: {
    preference: "dark",
  },
  app: {
    head: {
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
      meta: [
        { name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#0b0d10" },
        { name: "theme-color", media: "(prefers-color-scheme: light)", content: "#eef1f4" },
        { name: "apple-mobile-web-app-title", content: "encodings" },
        { name: "author", content: "oritwoen" },
        { property: "og:locale", content: "en_US" },
      ],
    },
  },
  /** Variants became options of their family; their old pages point at the section there. */
  routeRules: {
    "/encodings/base32hex": moved("/encodings/base32#the-hex-alphabet"),
    "/encodings/base32-crockford": moved("/encodings/base32#the-crockford-alphabet"),
    "/encodings/z-base-32": moved("/encodings/base32#the-z-alphabet"),
    "/encodings/base58check": moved("/encodings/base58#base58check"),
    "/encodings/base58-flickr": moved("/encodings/base58#the-flickr-alphabet"),
    "/encodings/base58-ripple": moved("/encodings/base58#the-ripple-alphabet"),
    "/encodings/base64url": moved("/encodings/base64#the-url-alphabet"),
    "/encodings/ascii85": moved("/encodings/base85#the-ascii85-alphabet"),
    "/encodings/z85": moved("/encodings/base85#the-z85-alphabet"),
    "/encodings/bech32m": moved("/encodings/bech32#bech32m"),
  },
  nitro: {
    preset: "cloudflare_module",
    /** One MCP SDK copy, or `agents` fails the toolkit's server on its `instanceof` check. */
    alias: {
      "@modelcontextprotocol/sdk": resolve(
        import.meta.dirname,
        "node_modules/@modelcontextprotocol/sdk/dist/esm",
      ),
    },
    compatibilityDate: "2026-09-03",
    /** Nitro compiles the server bundle for ES2019 unless told otherwise; the library uses BigInt. */
    esbuild: { options: { target: "es2024" } },
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
  /** Nuxt's own prerender option. The same keys under `nitro.prerender` are deprecated. */
  prerender: {
    crawlLinks: true,
    routes: ["/", "/playground", "/sitemap.xml", "/robots.txt", "/llms.txt", "/llms-full.txt"],
  },
  compatibilityDate: "2026-09-03",
  /** Fonts live in public/fonts and app/assets/fonts.css, where nuxt-og-image reads them from. */
  css: ["~/assets/fonts.css"],
  fonts: {
    families: [
      { name: "Figtree", provider: "local", weights: [400, 500] },
      { name: "Fira Code", provider: "local", weights: [400, 500] },
    ],
  },
  content: {
    database: {
      type: "d1",
      bindingName: "DB",
    },
    build: {
      markdown: {
        highlight: {
          theme: {
            default: encodingsTheme,
            light: encodingsTheme,
            dark: encodingsTheme,
          },
        },
      },
    },
  },
});
