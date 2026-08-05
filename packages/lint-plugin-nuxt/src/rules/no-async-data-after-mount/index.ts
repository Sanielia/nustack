import type { Context, ESTree, Rule, Visitor } from '@oxlint/plugins'
import { isTransparentExpression, staticPropertyName, unwrapExpression } from '../../utils/ast.js'
import { docsUrl } from '../../utils/docs-url.js'
import { createImportedCallMatcher } from '../../utils/imports.js'
import { isInRanges, scriptSetupRanges } from '../../utils/vue.js'

const ASYNC_DATA_COMPOSABLES = new Set([
  'useAsyncData',
  'useFetch',
  'useLazyAsyncData',
  'useLazyFetch',
])

const NUXT_IMPORT_SOURCES = new Set(['#app', '#imports', 'nuxt/app'])
const NUXT_INITIALIZER_FACTORIES = new Set([
  'defineNuxtPlugin',
  'defineNuxtRouteMiddleware',
])

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function

function isFunctionNode(node: ESTree.Node): node is FunctionNode {
  return node.type === 'ArrowFunctionExpression'
    || node.type === 'FunctionDeclaration'
    || node.type === 'FunctionExpression'
}

function functionName(node: FunctionNode): string | undefined {
  if (node.id?.type === 'Identifier')
    return node.id.name

  let expression: ESTree.Node = node
  let parent: ESTree.Node | null = node.parent
  while (isTransparentExpression(parent) && parent.expression === expression) {
    expression = parent
    parent = parent.parent
  }

  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
    return parent.id.name
  if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition') && parent.value === expression)
    return staticPropertyName(parent, true)
}

function isNuxtInitializerCallback(node: FunctionNode): boolean {
  let expression: ESTree.Node = node
  let parent: ESTree.Node | null = node.parent
  while (isTransparentExpression(parent) && parent.expression === expression) {
    expression = parent
    parent = parent.parent
  }

  if (parent?.type !== 'CallExpression' || parent.arguments[0] !== expression)
    return false

  const callee = unwrapExpression(parent.callee)
  return callee.type === 'Identifier' && NUXT_INITIALIZER_FACTORIES.has(callee.name)
}

function isInitialExecutionFunction(node: FunctionNode): boolean {
  const name = functionName(node)
  return name === 'setup' || /^use[A-Z0-9]/.test(name ?? '') || isNuxtInitializerCallback(node)
}

export const noAsyncDataAfterMount: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Nuxt data composables in callbacks that can run after component setup.',
      url: docsUrl('no-async-data-after-mount'),
    },
    schema: [],
    messages: {
      afterMount: '`{{ name }}()` can run after the component has mounted and cannot be awaited during setup. Move it to setup or use `$fetch()` for requests triggered later.',
    },
  },
  create(context: Context): Visitor {
    const sourceCode = context.sourceCode
    const setupRanges = scriptSetupRanges(sourceCode.parserServices)
    const { collectImports, importedCallName } = createImportedCallMatcher(sourceCode, {
      importSources: NUXT_IMPORT_SOURCES,
      names: ASYNC_DATA_COMPOSABLES,
    })

    function isInitialExecutionContext(node: ESTree.CallExpression): boolean {
      for (let ancestor: ESTree.Node | null = node.parent; ancestor; ancestor = ancestor.parent) {
        if (isFunctionNode(ancestor))
          return isInitialExecutionFunction(ancestor)
      }
      return isInRanges(node, setupRanges)
    }

    return {
      Program: collectImports,
      CallExpression(node: ESTree.CallExpression): void {
        const name = importedCallName(node)
        if (!name || isInitialExecutionContext(node))
          return

        context.report({
          node: node.callee,
          messageId: 'afterMount',
          data: { name },
        })
      },
    }
  },
}
