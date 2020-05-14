'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const utils_1 = require('../utils')
exports.assetPathPlugin = ({ app }) => {
  app.use(async (ctx, next) => {
    if (utils_1.isStaticAsset(ctx.path) && utils_1.isImportRequest(ctx)) {
      ctx.type = 'js'
      ctx.body = `export default ${JSON.stringify(ctx.path)}`
      return
    }
    return next()
  })
}
