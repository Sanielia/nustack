// FIXME: This rule should be removed after migration to oxlint, because `statusText` property is deprecated and oxlint detects it properly

import type { Rule } from '@oxlint/plugins'
import { docsUrl } from '../../utils/docs-url.js'

const CREATE_ERROR_IMPORT_SOURCES = new Set(['#app', '#imports', 'h3', 'nuxt/app'])
const INVALID_STATUS_TEXT_CHARACTER_RE = /[^\t\u0020-\u007E]/u
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
  const key = node.key ?? node.property
  if (!node.computed && key?.type === 'Identifier')
    return key.name
  if (key?.type === 'Literal' && typeof key.value === 'string')
    return key.value
}

function staticString(node: any): string | undefined {
  const expression = unwrapExpression(node)
  if (expression?.type === 'Literal' && typeof expression.value === 'string')
    return expression.value
  if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0)
    return expression.quasis[0]?.value.cooked ?? undefined
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

export const noInvalidStatusText: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow non-HTTP-compliant characters in `createError()` status text.',
      url: docsUrl('no-invalid-status-text'),
    },
    schema: [],
    messages: {
      invalidStatusText: '`statusText` may contain only horizontal tabs, spaces, and visible ASCII characters. Use `message` for detailed, multi-line, or non-ASCII content.',
    },
  },
  create(context: any) {
    const sourceCode = context.sourceCode
    const importedCreateErrors = new Set<any>()
    const importedNamespaces = new Set<any>()

    function collectImports(program: any): void {
      for (const node of program.body) {
        if (node.type !== 'ImportDeclaration' || !CREATE_ERROR_IMPORT_SOURCES.has(String(node.source.value)))
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
          if (importedName === 'createError')
            importedCreateErrors.add(specifier.local)
        }
      }
    }

    function isCreateErrorCall(node: any): boolean {
      const callee = unwrapExpression(node.callee)
      if (callee?.type === 'Identifier') {
        const variable = findVariable(sourceCode, callee, callee.name)
        if (variable) {
          if (variable.identifiers?.some((identifier: any) => importedCreateErrors.has(identifier)))
            return true
          return callee.name === 'createError' && variable.defs?.length === 0
        }
        return callee.name === 'createError'
      }

      if (callee?.type !== 'MemberExpression' || propertyName(callee) !== 'createError')
        return false

      const object = unwrapExpression(callee.object)
      if (object?.type !== 'Identifier')
        return false
      const variable = findVariable(sourceCode, object, object.name)
      return variable?.identifiers?.some((identifier: any) => importedNamespaces.has(identifier)) ?? false
    }

    return {
      Program: collectImports,
      CallExpression(node: any) {
        if (!isCreateErrorCall(node))
          return

        const details = unwrapExpression(node.arguments[0])
        if (details?.type !== 'ObjectExpression')
          return

        for (const property of details.properties) {
          if (property.type !== 'Property' || property.kind !== 'init' || propertyName(property) !== 'statusText')
            continue

          const value = staticString(property.value)
          if (value !== undefined && INVALID_STATUS_TEXT_CHARACTER_RE.test(value)) {
            context.report({
              node: property.value,
              messageId: 'invalidStatusText',
            })
          }
        }
      },
    }
  },
}
