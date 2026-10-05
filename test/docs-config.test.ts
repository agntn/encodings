import { describe, expect, it, vi } from "vite-plus/test";

interface RouteRule {
  readonly redirect?: unknown;
  readonly prerender?: boolean;
}

/* Nuxt auto-imports `defineNuxtConfig`, which only hands the config back. */
vi.stubGlobal("defineNuxtConfig", (config: unknown) => config);

/* A URL, not a literal path, so tsc leaves the Nuxt globals of the config alone. */
const configUrl = new URL("../docs/nuxt.config.ts", import.meta.url).href;

describe("docs route rules", () => {
  it("keeps every redirect out of the prerender, so the worker answers it with a 301", async () => {
    const { default: config } = (await import(configUrl)) as {
      readonly default: { readonly routeRules: Readonly<Record<string, RouteRule>> };
    };
    const redirects = Object.entries(config.routeRules).filter(
      ([, rule]) => rule.redirect !== undefined,
    );
    expect(redirects.length).toBeGreaterThan(0);
    expect(redirects.filter(([, rule]) => rule.prerender !== false).map(([path]) => path)).toEqual(
      [],
    );
  });
});
