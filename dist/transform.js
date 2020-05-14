'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const utils_1 = require('./utils')
function normalizeTransforms(transforms) {}
exports.normalizeTransforms = normalizeTransforms
function createServerTransformPlugin(transforms) {
  return ({ app }) => {
    app.use(async (ctx, next) => {
      await next()
      for (const t of transforms) {
        if (t.test(ctx.path, ctx.query)) {
          ctx.type = t.as || 'js'
          if (ctx.body) {
            const code = await utils_1.readBody(ctx.body)
            if (code) {
              ctx.body = await t.transform(code, utils_1.isImportRequest(ctx))
              ctx._transformed = true
            }
          }
        }
      }
    })
  }
}
exports.createServerTransformPlugin = createServerTransformPlugin
function createBuildJsTransformPlugin(transforms) {
  transforms = transforms.filter((t) => t.as === 'js' || !t.as)
  return {
    name: 'vite:transforms',
    async transform(code, id) {
      const { path, query } = utils_1.parseWithQuery(id)
      let result = code
      for (const t of transforms) {
        if (t.test(path, query)) {
          result = await t.transform(result, true)
        }
      }
      return result
    }
  }
}
exports.createBuildJsTransformPlugin = createBuildJsTransformPlugin
//# sourceMappingURL=transform.js.map
