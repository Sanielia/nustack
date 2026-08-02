import tsParser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'
import { describe, expect, it } from 'vitest'
import vueParser from 'vue-eslint-parser'
import plugin, { nuxtConfigs } from '../../index.js'

const rule = plugin.rules?.['no-ref-outside-setup']
const languageOptions = { ecmaVersion: 'latest' as const, sourceType: 'module' as const }
const error = { messageId: 'outsideSetup' }

describe('no-ref-outside-setup', () => {
  it('is enabled in the recommended app config', () => {
    const enabledRules = nuxtConfigs().flatMap(config => Object.keys(config.rules ?? {}))
    expect(enabledRules).toContain('@nustack/nuxt/no-ref-outside-setup')
  })

  it('reports ref calls in every non-setup expression context', () => {
    const tester = new RuleTester({ languageOptions })

    tester.run('no-ref-outside-setup', rule as never, {
      valid: [
        'const unrelated = api.ref({})',
        'const ref = factory; ref({})',
        'function setup() { const state = ref({}) }',
        'const setup = () => ref({})',
        'const component = { setup: () => ref({}) }',
        'const component = { setup() { callback(() => ref({})) } }',
        'const component = { ["setup"]: function () { return ref({}) } }',
      ],
      invalid: [
        { code: 'const state = ref({})', errors: [error] },
        { code: 'export const state = ref({})', errors: [error] },
        { code: 'state = ref({})', errors: [error] },
        { code: 'consume(ref({}))', errors: [error] },
        { code: 'const values = [condition ? ref({}) : fallback]', errors: [error] },
        { code: 'const values = { state: ref({}) }', errors: [error] },
        { code: 'function createState() { return ref({}) }', errors: [error] },
        { code: 'export const useState = () => ref({})', errors: [error] },
        { code: 'ref({}); ref({})', errors: [error, error] },
      ],
    })
  })

  it('recognizes Vue imports, aliases, namespaces, and shadowing', () => {
    const tester = new RuleTester({ languageOptions })

    tester.run('no-ref-outside-setup', rule as never, {
      valid: [
        'import { ref as createRef } from "other"; createRef({})',
        'import * as Vue from "other"; Vue.ref({})',
        'import { ref as vueRef } from "vue"; function setup() { vueRef({}) }',
        'import * as Vue from "vue"; const component = { setup() { Vue["ref"]({}) } }',
        'import { ref } from "vue"; function create(ref) { return ref({}) }',
      ],
      invalid: [
        { code: 'import { ref as vueRef } from "vue"; vueRef({})', errors: [error] },
        { code: 'vueRef({}); import { ref as vueRef } from "vue"', errors: [error] },
        { code: 'import * as Vue from "vue"; Vue.ref({})', errors: [error] },
        { code: 'import * as Vue from "vue"; Vue["ref"]({})', errors: [error] },
      ],
    })
  })

  it('supports TypeScript ref calls', () => {
    const tester = new RuleTester({ languageOptions: { ...languageOptions, parser: tsParser } })

    tester.run('no-ref-outside-setup', rule as never, {
      valid: [
        'const setup = function setup() { return ref<State>({ count: 0 }) }',
        'const setup = (() => ref<State>({ count: 0 })) satisfies SetupFunction',
      ],
      invalid: [
        {
          code: 'export const state = ref<State>({ count: 0 } satisfies State)',
          errors: [error],
        },
        {
          code: 'import { ref as vueRef } from "vue"; (vueRef as RefFactory)({})',
          errors: [error],
        },
      ],
    })
  })

  it('distinguishes Vue script and script setup blocks', () => {
    const tester = new RuleTester({
      languageOptions: {
        ...languageOptions,
        parser: vueParser,
        parserOptions: { parser: tsParser },
      },
    })

    tester.run('no-ref-outside-setup', rule as never, {
      valid: [
        {
          filename: 'state.vue',
          code: '<script setup lang="ts">const state = ref({}); callback(() => ref({}))</script>',
        },
        {
          filename: 'state.vue',
          code: '<script lang="ts">export default { setup() { return { state: ref({}) } } }</script>',
        },
      ],
      invalid: [
        {
          filename: 'state.vue',
          code: '<script lang="ts">export const state = ref({})</script><template><div /></template>',
          errors: [error],
        },
        {
          filename: 'state.vue',
          code: '<script>const state = ref({})</script><script setup>const local = ref({})</script>',
          errors: [error],
        },
      ],
    })
  })
})
