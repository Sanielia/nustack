import type { Rule } from '@oxlint/plugins'
import { docsUrl } from '../../utils/docs-url.js'

const ASYNC_DATA_COMPOSABLES = new Set([
  'useAsyncData',
  'useLazyAsyncData',
])
const NUXT_IMPORT_SOURCES = new Set(['#app', '#imports', 'nuxt/app'])
const TRANSPARENT_EXPRESSION_NODES = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSInstantiationExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
])

function unwrapExpression(node: any): any {
  while (TRANSPARENT_EXPRESSION_NODES.has(node?.type))
    node = node.expression
  return node
}

function propertyName(node: any): string | undefined {
  const property = node.property
  if (!node.computed && property?.type === 'Identifier')
    return property.name
  if (node.computed && property?.type === 'Literal' && typeof property.value === 'string')
    return property.value
}

function findVariable(sourceCode: any, node: any, name: string): any | undefined {
  let scope = sourceCode.getScope(node)
  while (scope) {
    const variable = scope.set?.get(name)
    if (variable)
      return variable
    scope = scope.upper
  }
}

function isEmptyString(node: any): boolean {
  const expression = unwrapExpression(node)
  if (expression?.type === 'Literal')
    return expression.value === ''
  return expression?.type === 'TemplateLiteral'
    && expression.expressions.length === 0
    && expression.quasis[0]?.value.cooked === ''
}

export const noEmptyAsyncDataKey: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow empty explicit keys in Nuxt async-data composables.',
      url: docsUrl('no-empty-async-data-key'),
    },
    schema: [],
    messages: {
      emptyKey: '`{{ name }}` key must be a non-empty string. Pass a non-empty string as the first argument to `{{ name }}()`.',
    },
  },
  create(context: any) {
    const sourceCode = context.sourceCode
    const importedComposables = new Map<any, string>()
    const importedNamespaces = new Set<any>()

    function collectNuxtImports(program: any): void {
      for (const node of program.body) {
        if (node.type !== 'ImportDeclaration' || !NUXT_IMPORT_SOURCES.has(String(node.source.value)))
          continue
        if (node.importKind === 'type')
          continue

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            importedNamespaces.add(specifier.local)
            continue
          }
          if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type')
            continue

          const importedName = specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : String(specifier.imported.value)
          if (ASYNC_DATA_COMPOSABLES.has(importedName))
            importedComposables.set(specifier.local, importedName)
        }
      }
    }

    function composableName(node: any): string | undefined {
      const callee = unwrapExpression(node.callee)
      if (callee.type === 'Identifier') {
        const variable = findVariable(sourceCode, callee, callee.name)
        if (variable) {
          for (const identifier of variable.identifiers ?? []) {
            const importedName = importedComposables.get(identifier)
            if (importedName)
              return importedName
          }
          return ASYNC_DATA_COMPOSABLES.has(callee.name) && variable.defs?.length === 0
            ? callee.name
            : undefined
        }
        return ASYNC_DATA_COMPOSABLES.has(callee.name) ? callee.name : undefined
      }

      if (callee.type !== 'MemberExpression')
        return
      const name = propertyName(callee)
      if (!name || !ASYNC_DATA_COMPOSABLES.has(name))
        return

      const object = unwrapExpression(callee.object)
      if (object.type !== 'Identifier')
        return
      const variable = findVariable(sourceCode, object, object.name)
      return variable?.identifiers?.some((identifier: any) => importedNamespaces.has(identifier))
        ? name
        : undefined
    }

    return {
      Program: collectNuxtImports,
      CallExpression(node: any) {
        const name = composableName(node)
        const key = node.arguments[0]
        if (!name || !key || key.type === 'SpreadElement' || !isEmptyString(key))
          return

        context.report({
          node: key,
          messageId: 'emptyKey',
          data: { name },
        })
      },
    }
  },
}
