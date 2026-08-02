import type { Rule } from '@oxlint/plugins'
import { docsUrl } from '../../utils/docs-url.js'

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

function unwrapExpression(node: any): any {
  while (TRANSPARENT_EXPRESSION_NODES.has(node?.type))
    node = node.expression
  return node
}

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
    return propertyName(parent) === 'setup'
  }

  return false
}

function isScriptSetupCall(node: any, scriptSetupRanges: Array<[number, number]>): boolean {
  const start = node.range?.[0]
  return typeof start === 'number'
    && scriptSetupRanges.some(([contentStart, contentEnd]) => contentStart <= start && start < contentEnd)
}

function scriptSetupRanges(services: any): Array<[number, number]> {
  if (typeof services?.getDocumentFragment !== 'function')
    return []

  const document = services.getDocumentFragment()
  const ranges: Array<[number, number]> = []

  for (const child of document?.children ?? []) {
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

function findVariable(sourceCode: any, node: any, name: string): any | undefined {
  let scope = sourceCode.getScope(node)
  while (scope) {
    const variable = scope.set?.get(name)
    if (variable)
      return variable
    scope = scope.upper
  }
}

function propertyName(node: any): string | undefined {
  const property = node.key ?? node.property
  if (!node.computed && property.type === 'Identifier')
    return property.name
  if (node.computed && property.type === 'Literal' && typeof property.value === 'string')
    return property.value
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
    const importedRefs = new Set<any>()
    const importedVueNamespaces = new Set<any>()

    function collectVueImports(program: any): void {
      for (const node of program.body) {
        if (node.type !== 'ImportDeclaration' || node.source.value !== 'vue')
          continue

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            importedVueNamespaces.add(specifier.local)
            continue
          }
          if (specifier.type !== 'ImportSpecifier')
            continue

          const importedName = specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value
          if (importedName === 'ref')
            importedRefs.add(specifier.local)
        }
      }
    }

    function isVueRefCall(node: any): boolean {
      const callee = unwrapExpression(node.callee)

      if (callee.type === 'Identifier') {
        const variable = findVariable(sourceCode, callee, callee.name)
        if (variable) {
          return (variable?.identifiers?.some((identifier: any) => importedRefs.has(identifier)) ?? false)
            || (callee.name === 'ref' && variable.defs?.length === 0)
        }
        return callee.name === 'ref'
      }

      if (callee.type !== 'MemberExpression' || propertyName(callee) !== 'ref')
        return false

      const object = unwrapExpression(callee.object)
      if (object.type !== 'Identifier')
        return false
      const variable = findVariable(sourceCode, object, object.name)
      return variable?.identifiers?.some((identifier: any) => importedVueNamespaces.has(identifier)) ?? false
    }

    function isInsideSetupFunction(node: any): boolean {
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (FUNCTION_NODES.has(ancestor.type) && isSetupFunction(ancestor))
          return true
      }
      return false
    }

    return {
      Program: collectVueImports,
      CallExpression(node: any) {
        if (!isVueRefCall(node))
          return
        if (isScriptSetupCall(node, setupRanges) || isInsideSetupFunction(node))
          return

        context.report({ node: node.callee, messageId: 'outsideSetup' })
      },
    }
  },
}
