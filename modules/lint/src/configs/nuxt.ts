import type { Linter } from 'eslint'
import type { NustackContext } from '../context'
import type { ConcernOptions } from '../utils'
import { nuxtConfigs } from '@nustackjs/lint-plugin-nuxt'
import { resolveConcernRules } from '../utils'

export interface NuxtConcernOptions extends ConcernOptions {
  /** Constructors handled by project-specific Nuxt payload reducers. */
  payloadSerializableConstructors?: string[]
}

export function nuxtConfig(
  context: NustackContext,
  options: NuxtConcernOptions = {},
): Linter.Config[] {
  return nuxtConfigs({
    variant: 'recommended',
    autoImports: context.autoImports,
    components: context.components,
    payloadSerializableConstructors: options.payloadSerializableConstructors,
    rules: resolveConcernRules(options),
  })
}
