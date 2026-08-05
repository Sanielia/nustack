export const TRANSPARENT_EXPRESSION_NODES = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSInstantiationExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
])

export function unwrapExpression(node: any): any {
  while (TRANSPARENT_EXPRESSION_NODES.has(node?.type))
    node = node.expression
  return node
}

export function staticLiteralString(node: any): string | undefined {
  return node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : undefined
}

export function staticKeyName(key: any): string | undefined {
  if (key?.type === 'Identifier')
    return key.name
  return staticLiteralString(key)
}

export function staticPropertyName(node: any, literalRequiresComputed = false): string | undefined {
  const property = node?.key ?? node?.property
  if (node?.computed && property?.type === 'Identifier')
    return
  if (literalRequiresComputed && !node?.computed && property?.type === 'Literal')
    return
  return staticKeyName(property)
}

interface StaticStringOptions {
  fallbackToRaw?: boolean
  unwrap?: boolean
}

export function staticString(node: any, options: StaticStringOptions = {}): string | undefined {
  const expression = options.unwrap ? unwrapExpression(node) : node
  const literal = staticLiteralString(expression)
  if (literal !== undefined)
    return literal
  if (expression?.type !== 'TemplateLiteral' || expression.expressions.length > 0)
    return

  const quasi = expression.quasis[0]?.value
  return quasi?.cooked ?? (options.fallbackToRaw ? quasi?.raw : undefined)
}
