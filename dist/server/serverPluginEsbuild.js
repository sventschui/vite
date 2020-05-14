'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const esbuildService_1 = require('../esbuildService')
const utils_1 = require('../utils')
exports.esbuildPlugin = ({ app, config }) => {
  const jsxConfig = esbuildService_1.reoslveJsxOptions(config.jsx)
  app.use(async (ctx, next) => {
    // intercept and return vue jsx helper import
    if (ctx.path === esbuildService_1.vueJsxPublicPath) {
      await utils_1.cachedRead(ctx, esbuildService_1.vueJsxFilePath)
    }
    await next()
    if (ctx.body && esbuildService_1.tjsxRE.test(ctx.path)) {
      ctx.type = 'js'
      const src = await utils_1.readBody(ctx.body)
      let { code, map } = await esbuildService_1.transform(
        src,
        ctx.path,
        jsxConfig,
        config.jsx
      )
      if (map) {
        code += utils_1.genSourceMapString(map)
      }
      ctx.body = code
    }
  })
}
//# sourceMappingURL=serverPluginEsbuild.js.map