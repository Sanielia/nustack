import type { Rule } from '@oxlint/plugins'
import { docsUrl } from '../../utils/docs-url.js'
import { basename } from '../../utils/path.js'

const IGNORED_CONFIG_KEYS: Record<string, string> = {
  nitro: 'nitro',
  postcss: 'postcss',
  vite: 'vite',
  webpack: 'webpack',
}

const IGNORED_CONFIG_PATTERN = /^(nitro|postcss|vite|webpack)\.config\.(?:js|mjs|cjs|ts|mts|cts)$/

export const noIgnoredConfigFiles: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow external configuration files that Nuxt ignores.',
      url: docsUrl('no-ignored-config-files'),
    },
    schema: [],
    messages: {
      ignoredConfig: '`{{ filename }}` is ignored by Nuxt. Move this configuration to the `{{ key }}` key in `nuxt.config`.',
    },
  },
  createOnce(context: any) {
    return {
      Program(node: any) {
        const filename = basename(context.physicalFilename || context.filename)
        const configName = IGNORED_CONFIG_PATTERN.exec(filename)?.[1]
        const key = configName ? IGNORED_CONFIG_KEYS[configName] : undefined
        if (!key)
          return

        context.report({
          node,
          messageId: 'ignoredConfig',
          data: { filename, key },
        })
      },
    }
  },
}
