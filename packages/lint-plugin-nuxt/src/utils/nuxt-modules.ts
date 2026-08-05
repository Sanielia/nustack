import { staticLiteralString } from './ast.js'

export interface NuxtModuleEntry {
  name: string
  node: any
}

export function nuxtModuleEntry(element: any): NuxtModuleEntry | undefined {
  const name = staticLiteralString(element)
  if (name !== undefined)
    return { name, node: element }
  if (element?.type !== 'ArrayExpression' || element.elements.length === 0)
    return

  const first = element.elements[0]
  const firstName = staticLiteralString(first)
  if (firstName !== undefined)
    return { name: firstName, node: first }
}
