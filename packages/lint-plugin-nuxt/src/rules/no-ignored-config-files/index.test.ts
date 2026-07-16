import { RuleTester } from 'eslint'
import { describe, expect, it } from 'vitest'
import plugin, { nuxtConfigs } from '../../index.js'

const rule = plugin.rules?.['no-ignored-config-files']
const CONFIG_KEYS = {
  nitro: 'nitro',
  postcss: 'postcss',
  vite: 'vite',
  webpack: 'webpack',
}
const CONFIG_EXTENSIONS = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts']

describe('no-ignored-config-files', () => {
  it('reports external configuration files ignored by Nuxt', () => {
    const tester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } })

    tester.run('no-ignored-config-files', rule as never, {
      valid: [
        { code: 'export default {}', filename: 'nuxt.config.ts' },
        { code: 'export default {}', filename: 'vitest.config.ts' },
        { code: 'export default {}', filename: 'postcss.config.json' },
        { code: 'export default {}', filename: 'vite.config.jsx' },
      ],
      invalid: Object.entries(CONFIG_KEYS).flatMap(([configName, key]) =>
        CONFIG_EXTENSIONS.map(extension => ({
          code: 'export default {}',
          filename: `apps/site/${configName}.config.${extension}`,
          errors: [{
            messageId: 'ignoredConfig',
            data: { filename: `${configName}.config.${extension}`, key },
          }],
        }))),
    })
  })

  it('is scoped to ignored config files in the recommended config only', () => {
    const recommended = nuxtConfigs()
    const externalConfig = recommended.find(config => config.name === 'nustack/nuxt/external-config')

    expect(externalConfig?.files).toEqual([
      '**/nitro.config.{js,mjs,cjs,ts,mts,cts}',
      '**/postcss.config.{js,mjs,cjs,ts,mts,cts}',
      '**/vite.config.{js,mjs,cjs,ts,mts,cts}',
      '**/webpack.config.{js,mjs,cjs,ts,mts,cts}',
    ])
    expect(externalConfig?.rules?.['@nustack/nuxt/no-ignored-config-files']).toBe('error')
    expect(nuxtConfigs({ variant: 'minimal' }).some(config => config.name === 'nustack/nuxt/external-config')).toBe(false)
  })
})
