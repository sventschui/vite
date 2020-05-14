'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const fs_extra_1 = __importDefault(require('fs-extra'))
const chalk_1 = __importDefault(require('chalk'))
const resolve_from_1 = __importDefault(require('resolve-from'))
const utils_1 = require('../utils')
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
    // speical handling for vue runtime packages
    const vuePaths = utils_1.resolveVue(root)
    if (id in vuePaths) {
      return serve(id, vuePaths[id], 'vue')
    }
    // already resolved and cached
    const cachedPath = exports.idToFileMap.get(id)
    if (cachedPath) {
      return serve(id, cachedPath, 'cached')
    }
    // resolve from web_modules
    try {
      const webModulePath = resolveWebModule(root, id)
      if (webModulePath) {
        return serve(id, webModulePath, 'web_modules')
      }
    } catch (e) {
      console.error(
        chalk_1.default.red(
          `[vite] Error while resolving web_modules with id "${id}":`
        )
      )
      console.error(e)
      ctx.status = 404
    }
    // resolve from node_modules
    try {
      // we land here after a module entry redirect
      // or a direct deep import like 'foo/bar/baz.js'.
      // some packages (i.e. graphql) ship .mjs files with ES exports
      // when a file without an extension was requested, we will try an mjs file first
      // as resolve defaults to the .js extension
      if (path_1.default.extname(id) === '') {
        try {
          return serve(
            id,
            resolve_from_1.default(root, `${id}.mjs`),
            'node_modules'
          )
        } catch (e) {
          // ignore module not found (and all other) errors
        }
      }
      const file = resolve_from_1.default(root, id)
      return serve(id, file, 'node_modules')
    } catch (e) {
      console.error(
        chalk_1.default.red(
          `[vite] Error while resolving node_modules with id "${id}":`
        )
      )
      console.error(e)
      ctx.status = 404
    }
  })
}
const webModulesMap = new Map()
function resolveWebModule(root, id) {
  const cached = webModulesMap.get(id)
  if (cached) {
    return cached
  }
  // id could be a common chunk
  if (!id.endsWith('.js')) id += '.js'
  const webModulePath = path_1.default.join(root, 'web_modules', id)
  if (fs_extra_1.default.existsSync(webModulePath)) {
    webModulesMap.set(id, webModulePath)
    return webModulePath
  }
}
exports.resolveWebModule = resolveWebModule
const idToEntryMap = new Map()
function resolveNodeModuleEntry(root, id) {
  const cached = idToEntryMap.get(id)
  if (cached) {
    return cached
  }
  let pkgPath
  try {
    // see if the id is a valid package name
    pkgPath = resolve_from_1.default(root, `${id}/package.json`)
  } catch (e) {}
  if (pkgPath) {
    // if yes, resolve entry file
    const pkg = require(pkgPath)
    const entryPoint = id + '/' + (pkg.module || pkg.main || 'index.js')
    debug(`(node_module entry) ${id} -> ${entryPoint}`)
    idToEntryMap.set(id, entryPoint)
    return entryPoint
  }
}
exports.resolveNodeModuleEntry = resolveNodeModuleEntry
