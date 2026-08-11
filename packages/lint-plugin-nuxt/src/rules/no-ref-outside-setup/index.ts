import type { Context, ESTree, Rule, Visitor } from '@oxlint/plugins'
import type { FunctionNode, NamedIdentifier } from '../../utils/ast.js'
import {
  functionBindingIdentifier,
  isFunctionNode,
  staticPropertyName,
  transparentExpressionContext,
} from '../../utils/ast.js'
import { docsUrl } from '../../utils/docs-url.js'
import { createImportedCallMatcher } from '../../utils/imports.js'
import { findVariable } from '../../utils/scope.js'
import { isInRanges, scriptSetupRanges } from '../../utils/vue.js'

const COMPONENT_FACTORIES = new Set(['defineComponent', 'defineNuxtComponent'])
const COMPONENT_IMPORT_SOURCES = new Set(['vue', '#app', '#imports', 'nuxt/app'])
const REF_IMPORT_SOURCES = new Set(['vue'])
const REF_NAMES = new Set(['ref'])
type ComponentFactoryName = (call: ESTree.CallExpression) => string | undefined

function isComponentFactoryCall(node: ESTree.Node | null, argument: ESTree.Node, factoryName: ComponentFactoryName): boolean {
  if (node?.type !== 'CallExpression' || node.arguments[0] !== argument)
    return false
  return factoryName(node) !== undefined
}

function isComponentObjectReference(
  sourceCode: Context['sourceCode'],
  identifier: NamedIdentifier,
  factoryName: ComponentFactoryName,
  seen: Set<NamedIdentifier>,
): boolean {
  const { expression, parent } = transparentExpressionContext(identifier)
  if (isComponentFactoryCall(parent, expression, factoryName))
    return true
  if (parent?.type === 'ExportDefaultDeclaration')
    return true
  if (parent?.type === 'ExportSpecifier' && parent.local === expression)
    return true
  if (parent?.type !== 'VariableDeclarator' || parent.init !== expression || parent.id.type !== 'Identifier')
    return false

  const alias = parent.id as NamedIdentifier
  if (seen.has(alias))
    return false
  seen.add(alias)
  const variable = findVariable(sourceCode, alias, alias.name)
  return variable?.references.some(reference =>
    isComponentObjectReference(sourceCode, reference.identifier as NamedIdentifier, factoryName, seen)) ?? false
}

function isExportedComponentObject(
  sourceCode: Context['sourceCode'],
  node: ESTree.ObjectExpression,
  factoryName: ComponentFactoryName,
): boolean {
  const { expression, parent } = transparentExpressionContext(node)
  if (isComponentFactoryCall(parent, expression, factoryName))
    return true

  if (parent?.type === 'ExportDefaultDeclaration')
    return true
  if (parent?.type !== 'VariableDeclarator' || parent.init !== expression || parent.id.type !== 'Identifier')
    return false
  if (parent.parent?.type === 'VariableDeclaration' && parent.parent.parent?.type === 'ExportNamedDeclaration')
    return true

  const variable = findVariable(sourceCode, parent.id, parent.id.name)
  const seen = new Set([parent.id as NamedIdentifier])
  return variable?.references.some(reference =>
    isComponentObjectReference(sourceCode, reference.identifier as NamedIdentifier, factoryName, seen)) ?? false
}

function isComponentSetupProperty(
  sourceCode: Context['sourceCode'],
  parent: ESTree.Node | null,
  expression: ESTree.Node,
  factoryName: ComponentFactoryName,
): boolean {
  return parent?.type === 'Property'
    && parent.value === expression
    && staticPropertyName(parent as ESTree.ObjectProperty, true) === 'setup'
    && parent.parent?.type === 'ObjectExpression'
    && isExportedComponentObject(sourceCode, parent.parent, factoryName)
}

function isComponentSetupReference(
  sourceCode: Context['sourceCode'],
  identifier: NamedIdentifier,
  factoryName: ComponentFactoryName,
  seen: Set<NamedIdentifier>,
): boolean {
  const { expression, parent } = transparentExpressionContext(identifier)
  if (isComponentFactoryCall(parent, expression, factoryName))
    return true
  if (parent?.type === 'VariableDeclarator' && parent.init === expression && parent.id.type === 'Identifier') {
    const alias = parent.id as NamedIdentifier
    if (seen.has(alias))
      return false
    seen.add(alias)
    const variable = findVariable(sourceCode, alias, alias.name)
    return variable?.references.some(reference =>
      isComponentSetupReference(sourceCode, reference.identifier as NamedIdentifier, factoryName, seen)) ?? false
  }
  return isComponentSetupProperty(sourceCode, parent, expression, factoryName)
}

function isUnsafeSetupReference(
  sourceCode: Context['sourceCode'],
  identifier: NamedIdentifier,
  seen: Set<NamedIdentifier>,
): boolean {
  const { expression, parent } = transparentExpressionContext(identifier)
  if (parent?.type === 'CallExpression')
    return parent.callee === expression || parent.arguments.includes(expression as ESTree.Argument)
  if (parent?.type !== 'VariableDeclarator' || parent.init !== expression || parent.id.type !== 'Identifier')
    return false

  const alias = parent.id as NamedIdentifier
  if (seen.has(alias))
    return false
  seen.add(alias)
  const variable = findVariable(sourceCode, alias, alias.name)
  return variable?.references.some(reference =>
    isUnsafeSetupReference(sourceCode, reference.identifier as NamedIdentifier, seen)) ?? false
}

function isSetupFunction(
  sourceCode: Context['sourceCode'],
  node: FunctionNode,
  factoryName: ComponentFactoryName,
): boolean {
  const { expression, parent } = transparentExpressionContext(node)

  if (isComponentFactoryCall(parent, expression, factoryName))
    return true

  if (isComponentSetupProperty(sourceCode, parent, expression, factoryName))
    return true

  const identifier = functionBindingIdentifier(node)
  if (!identifier)
    return false
  const variable = findVariable(sourceCode, identifier, identifier.name)
  const references = variable?.references ?? []
  return references.some(reference =>
    isComponentSetupReference(sourceCode, reference.identifier as NamedIdentifier, factoryName, new Set([identifier])))
  && !references.some(reference =>
    isUnsafeSetupReference(sourceCode, reference.identifier as NamedIdentifier, new Set([identifier])))
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
      importSources: REF_IMPORT_SOURCES,
      names: REF_NAMES,
      includeTypeImports: true,
    })
    const { collectImports: collectComponentImports, importedCallName: componentFactoryName } = createImportedCallMatcher(sourceCode, {
      importSources: COMPONENT_IMPORT_SOURCES,
      names: COMPONENT_FACTORIES,
    })

    function isInsideSetupFunction(node: ESTree.CallExpression): boolean {
      for (let ancestor: ESTree.Node | null = node.parent; ancestor; ancestor = ancestor.parent) {
        if (isFunctionNode(ancestor) && isSetupFunction(sourceCode, ancestor, componentFactoryName))
          return true
      }
      return false
    }

    return {
      Program(node: ESTree.Program): void {
        collectImports(node)
        collectComponentImports(node)
      },
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
