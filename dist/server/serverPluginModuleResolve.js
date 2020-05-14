'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const chalk_1 = __importDefault(require('chalk'))
const utils_1 = require('../utils')
const url_1 = require('url')
const resolver_1 = require('../resolver')
const debug = require('debug')('vite:resolve')
exports.idToFileMap = new Map()
exports.fileToRequestMap = new Map()
exports.moduleRE = /^\/@modules\//
const getDebugPath = (root, p) => {
  const relative = path_1.default.relative(root, p)
  return relative.startsWith('..') ? p : relative
}
// plugin for resolving /@modules/:id requests.
exports.moduleResolvePlugin = ({ root, app, watcher }) => {
  const vueResolved = utils_1.resolveVue(root)
  app.use(async (ctx, next) => {
    if (!exports.moduleRE.test(ctx.path)) {
      return next()
    }
    const id = ctx.path.replace(exports.moduleRE, '')
    ctx.type = 'js'
    const serve = async (id, file, type) => {
      exports.idToFileMap.set(id, file)
      exports.fileToRequestMap.set(file, ctx.path)
      debug(`(${type}) ${id} -> ${getDebugPath(root, file)}`)
      await utils_1.cachedRead(ctx, file)
      // resolved module file is outside of root dir, but is not in node_modules.
      // this is likely a linked monorepo/workspace, watch the file for HMR.
      if (!file.startsWith(root) && !/node_modules/.test(file)) {
        watcher.add(file)
      }
      await next()
    }
    // speical handling for vue runtime in case it's not installed
    if (!vueResolved.isLocal && id in vueResolved) {
      return serve(id, vueResolved[id], 'non-local vue')
    }
    // already resolved and cached
    const cachedPath = exports.idToFileMap.get(id)
    if (cachedPath) {
      return serve(id, cachedPath, 'cached')
    }
    // resolve from vite optimized modules
    const optimized = resolver_1.resolveOptimizedModule(root, id)
    if (optimized) {
      return serve(id, optimized, 'optimized')
    }
    const nodeModulePath = resolver_1.resolveNodeModule(root, id)
    if (nodeModulePath) {
      return serve(id, nodeModulePath, 'node_modules')
    }
    const importer = new url_1.URL(ctx.get('referer')).pathname
    console.error(
      chalk_1.default.red(
        `[vite] Failed to resolve module import "${id}". ` +
          `(imported by ${importer})`
      )
    )
    ctx.status = 404
  })
}
//# sourceMappingURL=serverPluginModuleResolve.js.map
