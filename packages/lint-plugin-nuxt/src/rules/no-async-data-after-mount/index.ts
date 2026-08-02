import type { Rule } from '@oxlint/plugins'
import { docsUrl } from '../../utils/docs-url.js'

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
const TRANSPARENT_EXPRESSION_NODES = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSInstantiationExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
])
const NUXT_INITIALIZER_FACTORIES = new Set([
  'defineNuxtPlugin',
  'defineNuxtRouteMiddleware',
])

function unwrapExpression(node: any): any {
  while (TRANSPARENT_EXPRESSION_NODES.has(node?.type))
    node = node.expression
  return node
}

function propertyName(node: any): string | undefined {
  const property = node.key ?? node.property
  if (!node.computed && property?.type === 'Identifier')
    return property.name
  if (node.computed && property?.type === 'Literal' && typeof property.value === 'string')
    return property.value
}

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
    return propertyName(parent)
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

function scriptSetupRanges(services: any): Array<[number, number]> {
  if (typeof services?.getDocumentFragment !== 'function')
    return []

  const ranges: Array<[number, number]> = []
  for (const child of services.getDocumentFragment()?.children ?? []) {
    if (child.type !== 'VElement' || child.rawName !== 'script')
      continue
    if (!child.startTag.attributes.some((attribute: any) =>
      attribute.type === 'VAttribute'
      && !attribute.directive
      && attribute.key.name === 'setup',
    )) { continue }

    const contentStart = child.startTag.range?.[1]
    const contentEnd = child.endTag?.range?.[0] ?? child.range?.[1]
    if (typeof contentStart === 'number' && typeof contentEnd === 'number')
      ranges.push([contentStart, contentEnd])
  }
  return ranges
}

function isInScriptSetup(node: any, ranges: Array<[number, number]>): boolean {
  const start = node.range?.[0]
  return typeof start === 'number' && ranges.some(([from, to]) => from <= start && start < to)
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

    function isInitialExecutionContext(node: any): boolean {
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (FUNCTION_NODES.has(ancestor.type))
          return isInitialExecutionFunction(ancestor)
      }
      return isInScriptSetup(node, setupRanges)
    }

    return {
      Program: collectNuxtImports,
      CallExpression(node: any) {
        const name = composableName(node)
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
