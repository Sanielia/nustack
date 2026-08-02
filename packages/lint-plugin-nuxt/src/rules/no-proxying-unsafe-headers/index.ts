import type { Rule } from '@oxlint/plugins'
import { docsUrl } from '../../utils/docs-url.js'

const UNSAFE_HEADERS = new Set([
  'host',
  'accept',
  'content-length',
  'content-md5',
  'content-type',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'cf-connecting-ip',
  'cf-ray',
])

function staticString(node: any): string | null {
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value

  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? null

  return null
}

export const noProxyingUnsafeHeaders: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow proxying unsafe request headers with `useRequestHeaders()`.',
      url: docsUrl('no-proxying-unsafe-headers'),
    },
    schema: [],
    messages: {
      unsafeHeader: '`{{ header }}` is not safe to proxy. Only forward the client headers that the target API needs.',
    },
  },
  createOnce(context: any) {
    return {
      CallExpression(node: any) {
        if (
          node.callee?.type !== 'Identifier'
          || node.callee.name !== 'useRequestHeaders'
          || node.arguments[0]?.type !== 'ArrayExpression'
        ) {
          return
        }

        for (const element of node.arguments[0].elements) {
          const header = staticString(element)
          if (header !== null && UNSAFE_HEADERS.has(header.toLowerCase())) {
            context.report({
              node: element,
              messageId: 'unsafeHeader',
              data: { header },
            })
          }
        }
      },
    }
  },
}
