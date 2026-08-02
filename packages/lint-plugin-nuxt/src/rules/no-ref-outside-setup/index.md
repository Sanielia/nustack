# `@nustack/nuxt/no-ref-outside-setup`

Disallow Vue `ref()` calls outside `<script setup>` or a component `setup()` function.

Nuxt server-renders multiple requests in the same process. A ref created at module scope is therefore shared across requests, which can leak user state and retain data in memory. Create request-safe shared state with `useState` instead.

Incorrect:

```ts
export const state = ref({})

export const useProjectState = () => ref({})
```

Correct:

```ts
export const useProjectState = () => useState('project-state', () => ({}))
```

```vue
<script setup lang="ts">
const localState = ref({})
</script>
```

```ts
export default defineComponent({
  setup() {
    const localState = ref({})
    return { localState }
  },
})
```

The rule recognizes Nuxt's auto-imported `ref`, named imports (including aliases) from `vue`, and `ref` accessed through a Vue namespace import. It does not report unrelated functions or object methods named `ref`.

See [Nuxt's state management best practices](https://nuxt.com/docs/4.x/getting-started/state-management#best-practices).
