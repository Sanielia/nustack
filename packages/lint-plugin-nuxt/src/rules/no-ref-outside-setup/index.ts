import type { Rule } from '@oxlint/plugins'
import { staticPropertyName, TRANSPARENT_EXPRESSION_NODES } from '../../utils/ast.js'
import { docsUrl } from '../../utils/docs-url.js'
import { createImportedCallMatcher } from '../../utils/imports.js'
import { isInRanges, scriptSetupRanges } from '../../utils/vue.js'

const FUNCTION_NODES = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
])

function isSetupFunction(node: any): boolean {
  if (node.id?.type === 'Identifier' && node.id.name === 'setup')
    return true

  let expression = node
  let parent = node.parent
  while (TRANSPARENT_EXPRESSION_NODES.has(parent?.type) && parent.expression === expression) {
    expression = parent
    parent = parent.parent
  }

  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
    return parent.id.name === 'setup'
  if (parent?.type === 'Property' && parent.value === expression) {
    return staticPropertyName(parent, true) === 'setup'
  }

  return false
}

export const noRefOutsideSetup: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Vue refs outside `<script setup>` or a `setup()` function.',
      url: docsUrl('no-ref-outside-setup'),
    },
    schema: [],
    messages: {
      outsideSetup: '`ref()` outside `<script setup>` or `setup()` can create state shared across server requests. Use an SSR-safe `useState()` composable instead.',
    },
  },
  create(context: any) {
    const sourceCode = context.sourceCode
    const setupRanges = scriptSetupRanges(sourceCode.parserServices)
    const { collectImports, importedCallName } = createImportedCallMatcher(sourceCode, {
      importSources: new Set(['vue']),
      names: new Set(['ref']),
      includeTypeImports: true,
    })

    function isInsideSetupFunction(node: any): boolean {
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (FUNCTION_NODES.has(ancestor.type) && isSetupFunction(ancestor))
          return true
      }
      return false
    }

    return {
      Program: collectImports,
      CallExpression(node: any) {
        if (importedCallName(node) !== 'ref')
          return
        if (isInRanges(node, setupRanges) || isInsideSetupFunction(node))
          return

        context.report({ node: node.callee, messageId: 'outsideSetup' })
      },
    }
  },
}
