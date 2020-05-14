'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const magic_string_1 = __importDefault(require('magic-string'))
const filter = /\.(j|t)sx?$/
exports.createReplacePlugin = (replacements, sourcemap) => {
  const pattern = new RegExp(
    '\\b(' +
      Object.keys(replacements)
        .map((str) => {
          return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')
        })
        .join('|') +
      ')\\b',
    'g'
  )
  return {
    name: 'vite:replace',
    transform(code, id) {
      if (filter.test(id)) {
        const s = new magic_string_1.default(code)
        let hasReplaced = false
        let match
        while ((match = pattern.exec(code))) {
          hasReplaced = true
          const start = match.index
          const end = start + match[0].length
          const replacement = replacements[match[1]]
          s.overwrite(start, end, replacement)
        }
        if (!hasReplaced) {
          return null
        }
        const result = { code: s.toString() }
        if (sourcemap) {
          result.map = s.generateMap({ hires: true })
        }
        return result
      }
    }
  }
}
