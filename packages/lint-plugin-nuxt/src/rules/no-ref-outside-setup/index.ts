import type { Context, ESTree, Rule, Visitor } from '@oxlint/plugins'
import { isTransparentExpression, staticPropertyName } from '../../utils/ast.js'
import { docsUrl } from '../../utils/docs-url.js'
import { createImportedCallMatcher } from '../../utils/imports.js'
import { isInRanges, scriptSetupRanges } from '../../utils/vue.js'

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function

function isFunctionNode(node: ESTree.Node): node is FunctionNode {
  return node.type === 'ArrowFunctionExpression'
    || node.type === 'FunctionDeclaration'
    || node.type === 'FunctionExpression'
}

function isSetupFunction(node: FunctionNode): boolean {
  if (node.id?.type === 'Identifier' && node.id.name === 'setup')
    return true

  let expression: ESTree.Node = node
  let parent: ESTree.Node | null = node.parent
  while (isTransparentExpression(parent) && parent.expression === expression) {
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
  create(context: Context): Visitor {
    const sourceCode = context.sourceCode
    const setupRanges = scriptSetupRanges(sourceCode.parserServices)
    const { collectImports, importedCallName } = createImportedCallMatcher(sourceCode, {
      importSources: new Set(['vue']),
      names: new Set(['ref']),
      includeTypeImports: true,
    })

    function isInsideSetupFunction(node: ESTree.CallExpression): boolean {
      for (let ancestor: ESTree.Node | null = node.parent; ancestor; ancestor = ancestor.parent) {
        if (isFunctionNode(ancestor) && isSetupFunction(ancestor))
          return true
      }
      return false
    }

    return {
      Program: collectImports,
      CallExpression(node: ESTree.CallExpression): void {
        if (importedCallName(node) !== 'ref')
          return
        if (isInRanges(node, setupRanges) || isInsideSetupFunction(node))
          return

        context.report({ node: node.callee, messageId: 'outsideSetup' })
      },
    }
  },
}
