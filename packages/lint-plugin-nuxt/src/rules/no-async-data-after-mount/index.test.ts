import tsParser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'
import { describe, expect, it } from 'vitest'
import vueParser from 'vue-eslint-parser'
import plugin, { nuxtConfigs } from '../../index.js'

const rule = plugin.rules?.['no-async-data-after-mount']
const languageOptions = { ecmaVersion: 'latest' as const, sourceType: 'module' as const }
const error = (name: string) => ({ messageId: 'afterMount', data: { name } })

describe('no-async-data-after-mount', () => {
  it('is enabled in the recommended app config', () => {
    const enabledRules = nuxtConfigs().flatMap(config => Object.keys(config.rules ?? {}))
    expect(enabledRules).toContain('@nustack/nuxt/no-async-data-after-mount')
  })

  it('allows data composables on initial Nuxt execution paths', () => {
    const tester = new RuleTester({ languageOptions })

    tester.run('no-async-data-after-mount', rule as never, {
      valid: [
        'function setup() { useAsyncData(() => load()) }',
        'const component = { setup: () => useFetch("/api/posts") }',
        'export function usePosts() { return useLazyAsyncData(() => loadPosts()) }',
        'export const usePosts = () => useLazyFetch("/api/posts")',
        'export default defineNuxtPlugin(() => useAsyncData(() => initialize()))',
        'export default defineNuxtRouteMiddleware(() => useFetch("/api/auth"))',
      ],
      invalid: [],
    })
  })

  it('reports calls outside setup and in deferred nested functions', () => {
    const tester = new RuleTester({ languageOptions })

    tester.run('no-async-data-after-mount', rule as never, {
      valid: [],
      invalid: [
        {
          code: 'useAsyncData(() => load())',
          errors: [error('useAsyncData')],
        },
        {
          code: 'function handleClick() { useFetch("/api/posts") }',
          errors: [error('useFetch')],
        },
        {
          code: 'function setup() { onMounted(() => useLazyAsyncData(() => load())) }',
          errors: [error('useLazyAsyncData')],
        },
        {
          code: 'const setup = () => { const handleClick = () => useLazyFetch("/api/posts") }',
          errors: [error('useLazyFetch')],
        },
        {
          code: 'function usePosts() { watch(id, () => useAsyncData(() => load(id.value))) }',
          errors: [error('useAsyncData')],
        },
        {
          code: 'defineNuxtPlugin(() => { nuxtApp.hook("app:mounted", () => useFetch("/api/posts")) })',
          errors: [error('useFetch')],
        },
        {
          code: 'defineNuxtRouteMiddleware(() => { return () => useAsyncData(() => load()) })',
          errors: [error('useAsyncData')],
        },
      ],
    })
  })

  it('recognizes Nuxt imports, aliases, namespaces, and shadowing', () => {
    const tester = new RuleTester({ languageOptions })

    tester.run('no-async-data-after-mount', rule as never, {
      valid: [
        'import { useFetch } from "other"; function handle() { useFetch("/api/posts") }',
        'import { useFetch as request } from "other"; function handle() { request("/api/posts") }',
        'const useFetch = factory; function handle() { useFetch("/api/posts") }',
        'function handle(useAsyncData) { useAsyncData(() => load()) }',
        'function handle() { api.useFetch("/api/posts") }',
        'import * as api from "other"; function handle() { api.useFetch("/api/posts") }',
      ],
      invalid: [
        {
          code: 'import { useFetch as request } from "#app"; function handle() { request("/api/posts") }',
          errors: [error('useFetch')],
        },
        {
          code: 'import { useAsyncData as loadData } from "nuxt/app"; const handle = () => loadData(() => load())',
          errors: [error('useAsyncData')],
        },
        {
          code: 'import * as Nuxt from "#imports"; function handle() { Nuxt.useLazyFetch("/api/posts") }',
          errors: [error('useLazyFetch')],
        },
        {
          code: 'import * as Nuxt from "#app"; function handle() { Nuxt["useLazyAsyncData"](() => load()) }',
          errors: [error('useLazyAsyncData')],
        },
      ],
    })
  })

  it('supports TypeScript expressions', () => {
    const tester = new RuleTester({ languageOptions: { ...languageOptions, parser: tsParser } })

    tester.run('no-async-data-after-mount', rule as never, {
      valid: [
        'const usePosts = () => useAsyncData<Post[]>(() => loadPosts())',
      ],
      invalid: [
        {
          code: 'const handle = () => (useFetch as FetchComposable)<Post[]>("/api/posts")',
          errors: [error('useFetch')],
        },
      ],
    })
  })

  it('distinguishes top-level and deferred calls in Vue setup', () => {
    const tester = new RuleTester({
      languageOptions: {
        ...languageOptions,
        parser: vueParser,
        parserOptions: { parser: tsParser },
      },
    })

    tester.run('no-async-data-after-mount', rule as never, {
      valid: [
        {
          filename: 'posts.vue',
          code: '<script setup lang="ts">const posts = useFetch<Post[]>("/api/posts")</script>',
        },
        {
          filename: 'posts.vue',
          code: '<script lang="ts">export default { setup() { return useAsyncData(() => load()) } }</script>',
        },
      ],
      invalid: [
        {
          filename: 'posts.vue',
          code: '<script setup lang="ts">onMounted(() => useFetch<Post[]>("/api/posts"))</script>',
          errors: [error('useFetch')],
        },
        {
          filename: 'posts.vue',
          code: '<script lang="ts">useAsyncData(() => load())</script><template><div /></template>',
          errors: [error('useAsyncData')],
        },
        {
          filename: 'posts.vue',
          code: '<script>export default { setup() { return { handle: () => useLazyFetch("/api/posts") } } }</script>',
          errors: [error('useLazyFetch')],
        },
      ],
    })
  })
})
