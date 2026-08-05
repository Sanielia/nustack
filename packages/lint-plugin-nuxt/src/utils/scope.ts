import type { ESTree, Scope, SourceCode, Variable } from '@oxlint/plugins'

export function findVariable(sourceCode: SourceCode, node: ESTree.Node, name: string): Variable | undefined {
  let scope: Scope | null = sourceCode.getScope(node)
  while (scope) {
    const variable = scope.set?.get(name)
    if (variable)
      return variable
    scope = scope.upper
  }
}
