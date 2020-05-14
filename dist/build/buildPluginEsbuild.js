'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const esbuildService_1 = require('../esbuildService')
exports.createEsbuildPlugin = async (minify, jsx) => {
  const jsxConfig = esbuildService_1.reoslveJsxOptions(jsx)
  return {
    name: 'vite:esbuild',
    async transform(code, id) {
      const isVueTs = /\.vue\?/.test(id) && id.endsWith('lang=ts')
      if (esbuildService_1.tjsxRE.test(id) || isVueTs) {
        return esbuildService_1.transform(
          code,
          id,
          {
            ...jsxConfig,
            ...(isVueTs ? { loader: 'ts' } : null)
          },
          jsx
        )
      }
    },
    async renderChunk(code, chunk) {
      if (minify) {
        return esbuildService_1.transform(code, chunk.fileName, {
          minify: true
        })
      } else {
        return null
      }
    }
  }
}
