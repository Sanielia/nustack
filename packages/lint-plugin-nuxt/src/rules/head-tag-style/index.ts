import type { Rule } from '@oxlint/plugins'
import { docsUrl } from '../../utils/docs-url.js'

interface Options {
  variant?: 'useHead' | 'components'
}

const HEAD_COMPONENTS = new Set([
  'Base',
  'Body',
  'Head',
  'Html',
  'Link',
  'Meta',
  'NoScript',
  'Style',
  'Title',
])

export const headTagStyle: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce a consistent Nuxt head-tag style using either `useHead` or template components.',
      url: docsUrl('head-tag-style'),
    },
    schema: [{
      type: 'object',
      properties: {
        variant: { enum: ['useHead', 'components'] },
      },
      additionalProperties: false,
    }],
    messages: {
      preferComponents: 'Use Nuxt head components instead of `useHead()`.',
      preferUseHead: 'Use `useHead()` instead of the `<{{ name }}>` head component.',
    },
  },
  create(context: any) {
    const variant = (context.options?.[0] as Options | undefined)?.variant ?? 'useHead'

    if (variant === 'components') {
      return {
        CallExpression(node: any) {
          if (node.callee.type === 'Identifier' && node.callee.name === 'useHead')
            context.report({ node: node.callee, messageId: 'preferComponents' })
        },
      }
    }

    const services = context.sourceCode.parserServices
    if (typeof services?.defineTemplateBodyVisitor !== 'function')
      return {}

    return services.defineTemplateBodyVisitor({
      VElement(node: any) {
        const name = node.rawName
        if (HEAD_COMPONENTS.has(name)) {
          context.report({
            loc: node.startTag.loc,
            messageId: 'preferUseHead',
            data: { name },
          })
        }
      },
    })
  },
}
