export type SourceRange = [number, number]

export function scriptSetupRanges(services: any): SourceRange[] {
  if (typeof services?.getDocumentFragment !== 'function')
    return []

  const ranges: SourceRange[] = []
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

export function isInRanges(node: any, ranges: SourceRange[]): boolean {
  const start = node.range?.[0]
  return typeof start === 'number' && ranges.some(([from, to]) => from <= start && start < to)
}
