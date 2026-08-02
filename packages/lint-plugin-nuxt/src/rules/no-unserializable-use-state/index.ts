import type { Rule } from '@oxlint/plugins'
import { docsUrl } from '../../utils/docs-url.js'

const FUNCTION_NODES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
])

const SERIALIZABLE_CONSTRUCTORS = new Set([
  'Array',
  'ArrayBuffer',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'DataView',
  'Date',
  'Float16Array',
  'Float32Array',
  'Float64Array',
  'Int8Array',
  'Int16Array',
  'Int32Array',
  'Map',
  'Number',
  'Object',
  'RegExp',
  'Set',
  'String',
  'Uint8Array',
  'Uint8ClampedArray',
  'Uint16Array',
  'Uint32Array',
  'URL',
  'URLSearchParams',
])

const TRANSPARENT_EXPRESSION_NODES = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSInstantiationExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
])

function calleeName(node: any): string | undefined {
  if (node.type === 'Identifier')
    return node.name

  if (node.type === 'MemberExpression' && !node.computed
    && node.object.type === 'Identifier' && node.object.name === 'Temporal'
    && node.property.type === 'Identifier') {
    return `Temporal.${node.property.name}`
  }
}

function isSymbolExpression(node: any): boolean {
  if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && node.object.name === 'Symbol')
    return true
  return node.type === 'CallExpression'
    && (calleeName(node.callee) === 'Symbol' || isSymbolExpression(node.callee))
}

function unsupportedType(node: any): string | undefined {
  if (FUNCTION_NODES.has(node.type))
    return 'a function'
  if (node.type === 'ClassExpression')
    return 'a class'
  if (isSymbolExpression(node))
    return 'a symbol'
  if (node.type === 'NewExpression') {
    const name = calleeName(node.callee)
    if (name?.startsWith('Temporal.') || (name && SERIALIZABLE_CONSTRUCTORS.has(name)))
      return
    return name ? `an instance of \`${name}\`` : 'a class instance'
  }
}

function initializer(call: any): any | undefined {
  return call.arguments.find((argument: any, index: number) => index < 2 && FUNCTION_NODES.has(argument.type))
}

export const noUnserializableUseState: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow values that Nuxt cannot serialize in `useState` initializers.',
      url: docsUrl('no-unserializable-use-state'),
    },
    schema: [],
    messages: {
      unserializable: '`useState()` initializes with {{ type }}, which Nuxt\'s default payload serializer cannot serialize.',
    },
  },
  create(context: any) {
    function report(node: any, type: string): void {
      context.report({ node, messageId: 'unserializable', data: { type } })
    }

    function checkObjectKey(property: any): void {
      if (property.computed && isSymbolExpression(property.key))
        report(property.key, 'a symbol-keyed property')
    }

    function checkValue(node: any): void {
      const type = unsupportedType(node)
      if (type) {
        report(node, type)
        return
      }

      if (TRANSPARENT_EXPRESSION_NODES.has(node.type)) {
        checkValue(node.expression)
        return
      }

      switch (node.type) {
        case 'ArrayExpression':
          for (const element of node.elements) {
            if (element)
              checkValue(element.type === 'SpreadElement' ? element.argument : element)
          }
          break
        case 'AssignmentExpression':
        case 'AwaitExpression':
          checkValue(node.type === 'AssignmentExpression' ? node.right : node.argument)
          break
        case 'ConditionalExpression':
          checkValue(node.consequent)
          checkValue(node.alternate)
          break
        case 'LogicalExpression':
          checkValue(node.left)
          checkValue(node.right)
          break
        case 'ObjectExpression':
          for (const property of node.properties) {
            if (property.type === 'SpreadElement') {
              checkValue(property.argument)
              continue
            }
            checkObjectKey(property)
            checkValue(property.value)
          }
          break
        case 'SequenceExpression':
          if (node.expressions.length)
            checkValue(node.expressions.at(-1))
          break
      }
    }

    function checkReturns(node: any): void {
      if (node.type === 'ReturnStatement') {
        if (node.argument)
          checkValue(node.argument)
        return
      }
      if (FUNCTION_NODES.has(node.type))
        return

      const keys = context.sourceCode.visitorKeys[node.type] ?? []
      for (const key of keys) {
        const child = node[key]
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item?.type)
              checkReturns(item)
          }
        }
        else if (child?.type) {
          checkReturns(child)
        }
      }
    }

    return {
      CallExpression(node: any) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'useState')
          return

        const init = initializer(node)
        if (!init)
          return
        if (init.async) {
          report(init, 'a Promise')
          return
        }
        if (init.generator) {
          report(init, 'a generator')
          return
        }
        if (init.body.type === 'BlockStatement')
          checkReturns(init.body)
        else
          checkValue(init.body)
      },
    }
  },
}
