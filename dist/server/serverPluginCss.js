'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const serverPluginHmr_1 = require('./serverPluginHmr')
const hash_sum_1 = __importDefault(require('hash-sum'))
const utils_1 = require('../utils')
const serverPluginVue_1 = require('./serverPluginVue')
const processedCSS = new Map()
exports.cssPlugin = ({ root, app, watcher, resolver, config }) => {
  app.use(async (ctx, next) => {
    await next()
    // handle .css imports
    if (
      ctx.response.is('css') &&
      // note ctx.body could be null if upstream set status to 304
      ctx.body
    ) {
      if (utils_1.isImportRequest(ctx)) {
        await processCss(ctx)
        // we rewrite css with `?import` to a js module that inserts a style
        // tag linking to the actual raw url
        ctx.type = 'js'
        const id = JSON.stringify(hash_sum_1.default(ctx.path))
        const rawPath = JSON.stringify(ctx.path)
        let code =
          `import { updateStyle } from "${serverPluginHmr_1.hmrClientId}"\n` +
          `updateStyle(${id}, ${rawPath})\n`
        if (ctx.path.endsWith('.module.css')) {
          code += `export default ${JSON.stringify(
            processedCSS.get(ctx.path).modules
          )}`
        }
        ctx.body = code.trim()
      } else {
        // raw request, return compiled css
        if (!processedCSS.has(ctx.path)) {
          await processCss(ctx)
        }
        ctx.type = 'css'
        ctx.body = processedCSS.get(ctx.path).css
      }
    }
  })
  // handle hmr
  const cssTransforms = config.transforms
    ? config.transforms.filter((t) => t.as === 'css')
    : []
  watcher.on('change', (file) => {
    if (file.endsWith('.css') || cssTransforms.some((t) => t.test(file, {}))) {
      if (serverPluginVue_1.srcImportMap.has(file)) {
        // this is a vue src import, skip
        return
      }
      const publicPath = resolver.fileToRequest(file)
      const id = hash_sum_1.default(publicPath)
      // bust process cache
      processedCSS.delete(publicPath)
      // css modules are updated as js
      if (!file.endsWith('.module.css')) {
        watcher.send({
          type: 'style-update',
          id,
          path: publicPath,
          timestamp: Date.now()
        })
      }
    }
  })
  async function processCss(ctx) {
    let css = await utils_1.readBody(ctx.body)
    let modules
    const postcssConfig = await utils_1.loadPostcssConfig(root)
    const expectsModule = ctx.path.endsWith('.module.css')
    // postcss processing
    if (postcssConfig || expectsModule) {
      try {
        css = (
          await require('postcss')([
            ...((postcssConfig && postcssConfig.plugins) || []),
            ...(expectsModule
              ? [
                  require('postcss-modules')({
                    getJSON(_, json) {
                      modules = json
                    }
                  })
                ]
              : [])
          ]).process(css, {
            ...(postcssConfig && postcssConfig.options),
            from: resolver.requestToFile(ctx.path)
          })
        ).css
      } catch (e) {
        console.error(`[vite] error applying postcss transforms: `, e)
      }
    }
    processedCSS.set(ctx.path, {
      css,
      modules
    })
  }
}
