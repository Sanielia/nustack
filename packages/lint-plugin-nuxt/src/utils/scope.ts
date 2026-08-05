export function findVariable(sourceCode: any, node: any, name: string): any | undefined {
  let scope = sourceCode.getScope(node)
  while (scope) {
    const variable = scope.set?.get(name)
    if (variable)
      return variable
    scope = scope.upper
  }
}
