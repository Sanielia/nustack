import type { Rule } from '@oxlint/plugins'
import { staticPropertyName, TRANSPARENT_EXPRESSION_NODES, unwrapExpression } from '../../utils/ast.js'
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
const FUNCTION_NODES = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
])
const NUXT_INITIALIZER_FACTORIES = new Set([
  'defineNuxtPlugin',
  'defineNuxtRouteMiddleware',
])

function functionName(node: any): string | undefined {
  if (node.id?.type === 'Identifier')
    return node.id.name

  let expression = node
  let parent = node.parent
  while (TRANSPARENT_EXPRESSION_NODES.has(parent?.type) && parent.expression === expression) {
    expression = parent
    parent = parent.parent
  }

  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
    return parent.id.name
  if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition') && parent.value === expression)
    return staticPropertyName(parent, true)
}

function isNuxtInitializerCallback(node: any): boolean {
  let expression = node
  let parent = node.parent
  while (TRANSPARENT_EXPRESSION_NODES.has(parent?.type) && parent.expression === expression) {
    expression = parent
    parent = parent.parent
  }

  if (parent?.type !== 'CallExpression' || parent.arguments[0] !== expression)
    return false

  const callee = unwrapExpression(parent.callee)
  return callee.type === 'Identifier' && NUXT_INITIALIZER_FACTORIES.has(callee.name)
}

function isInitialExecutionFunction(node: any): boolean {
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
  create(context: any) {
    const sourceCode = context.sourceCode
    const setupRanges = scriptSetupRanges(sourceCode.parserServices)
    const { collectImports, importedCallName } = createImportedCallMatcher(sourceCode, {
      importSources: NUXT_IMPORT_SOURCES,
      names: ASYNC_DATA_COMPOSABLES,
    })

    function isInitialExecutionContext(node: any): boolean {
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (FUNCTION_NODES.has(ancestor.type))
          return isInitialExecutionFunction(ancestor)
      }
      return isInRanges(node, setupRanges)
    }

    return {
      Program: collectImports,
      CallExpression(node: any) {
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
