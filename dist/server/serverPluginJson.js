'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const utils_1 = require('../utils')
exports.jsonPlugin = ({ app }) => {
  app.use(async (ctx, next) => {
    await next()
    // handle .json imports
    // note ctx.body could be null if upstream set status to 304
    if (
      ctx.path.endsWith('.json') &&
      utils_1.isImportRequest(ctx) &&
      ctx.body
    ) {
      ctx.type = 'js'
      ctx.body = `export default ${await utils_1.readBody(ctx.body)}`
    }
  })
}
