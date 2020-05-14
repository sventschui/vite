'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
function genSourceMapString(map) {
  if (!map) {
    return ''
  }
  if (typeof map !== 'string') {
    map = JSON.stringify(map)
  }
  return `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(
    map
  ).toString('base64')}`
}
exports.genSourceMapString = genSourceMapString
async function asyncReplace(input, re, replacer) {
  let match
  let remaining = input
  let rewritten = ''
  while ((match = re.exec(remaining))) {
    rewritten += remaining.slice(0, match.index)
    rewritten += await replacer(match)
    remaining = remaining.slice(match.index + match[0].length)
  }
  rewritten += remaining
  return rewritten
}
exports.asyncReplace = asyncReplace
//# sourceMappingURL=transformUtils.js.map
