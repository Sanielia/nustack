import { staticPropertyName, unwrapExpression } from './ast.js'
import { findVariable } from './scope.js'

interface ImportedCallMatcherOptions {
  importSources: ReadonlySet<string>
  names: ReadonlySet<string>
  includeTypeImports?: boolean
}

export function createImportedCallMatcher(sourceCode: any, options: ImportedCallMatcherOptions): {
  collectImports: (program: any) => void
  importedCallName: (call: any) => string | undefined
} {
  const importedNames = new Map<any, string>()
  const importedNamespaces = new Set<any>()

  function collectImports(program: any): void {
    for (const node of program.body) {
      if (node.type !== 'ImportDeclaration' || !options.importSources.has(String(node.source.value)))
        continue
      if (!options.includeTypeImports && node.importKind === 'type')
        continue

      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          importedNamespaces.add(specifier.local)
          continue
        }
        if (specifier.type !== 'ImportSpecifier' || (!options.includeTypeImports && specifier.importKind === 'type'))
          continue

        const importedName = specifier.imported.type === 'Identifier'
          ? specifier.imported.name
          : String(specifier.imported.value)
        if (options.names.has(importedName))
          importedNames.set(specifier.local, importedName)
      }
    }
  }

  function importedCallName(call: any): string | undefined {
    const callee = unwrapExpression(call.callee)
    if (callee?.type === 'Identifier') {
      const variable = findVariable(sourceCode, callee, callee.name)
      if (variable) {
        const identifier = variable.identifiers?.find((item: any) => importedNames.has(item))
        const importedName = importedNames.get(identifier)
        if (importedName)
          return importedName
        if (variable.defs?.length !== 0)
          return
      }

      return options.names.has(callee.name) ? callee.name : undefined
    }
    if (callee?.type !== 'MemberExpression')
      return

    const name = staticPropertyName(callee)
    if (!name || !options.names.has(name))
      return

    const object = unwrapExpression(callee.object)
    if (object?.type !== 'Identifier')
      return
    const variable = findVariable(sourceCode, object, object.name)
    return variable?.identifiers?.some((identifier: any) => importedNamespaces.has(identifier))
      ? name
      : undefined
  }

  return { collectImports, importedCallName }
}
