# `@nustack/nuxt/no-ignored-config-files`

Disallow external configuration files that Nuxt ignores.

Nuxt uses `nuxt.config` as its single source of truth and does not read several
configuration files that their underlying tools commonly use. Keeping configuration in
one of these files makes it look active even though Nuxt silently skips it.

| Ignored file | Configure in `nuxt.config` |
|---|---|
| `nitro.config.{js,mjs,cjs,ts,mts,cts}` | `nitro` key |
| `postcss.config.{js,mjs,cjs,ts,mts,cts}` | `postcss` key |
| `vite.config.{js,mjs,cjs,ts,mts,cts}` | `vite` key |
| `webpack.config.{js,mjs,cjs,ts,mts,cts}` | `webpack` key |

See Nuxt's [External Configuration Files](https://nuxt.com/docs/4.x/getting-started/configuration#external-configuration-files) documentation.

## Incorrect

```ts
// vite.config.ts — ignored by Nuxt
export default defineConfig({
  build: {
    sourcemap: true,
  },
})
```

## Correct

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  vite: {
    build: {
      sourcemap: true,
    },
  },
})
```
