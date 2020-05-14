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
    // resolve from vite optimized modules
    const optimized = resolveOptimizedModule(root, id)
    if (optimized) {
      return serve(id, optimized, 'optimized')
    }
    // resolve from web_modules
    const webModulePath = resolveWebModule(root, id)
    if (webModulePath) {
      return serve(id, webModulePath, 'web_modules')
    }
    const nodeModulePath = resolveNodeModule(root, id)
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
function resolveBareModule(root, id) {
  const optimized = resolveOptimizedModule(root, id)
  if (optimized) {
    return id + '.js'
  }
  const web = resolveWebModule(root, id)
  if (web) {
    return id + '.js'
  }
  const nodeEntry = resolveNodeModule(root, id)
  if (nodeEntry) {
    return nodeEntry
  }
  return id
}
exports.resolveBareModule = resolveBareModule
const viteOptimizedMap = new Map()
function resolveOptimizedModule(root, id) {
  const cached = viteOptimizedMap.get(id)
  if (cached) {
    return cached
  }
  if (!id.endsWith('.js')) id += '.js'
  const file = path_1.default.join(root, `node_modules`, `.vite`, id)
  if (fs_extra_1.default.existsSync(file)) {
    viteOptimizedMap.set(id, file)
    return file
  }
}
exports.resolveOptimizedModule = resolveOptimizedModule
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
const nodeModulesMap = new Map()
function resolveNodeModule(root, id) {
  const cached = nodeModulesMap.get(id)
  if (cached) {
    return cached
  }
  let pkgPath
  try {
    // see if the id is a valid package name
    pkgPath = resolve_from_1.default(root, `${id}/package.json`)
  } catch (e) {}
  if (pkgPath) {
    // if yes, this is a entry import. resolve entry file
    const pkg = require(pkgPath)
    const entryPoint = id + '/' + (pkg.module || pkg.main || 'index.js')
    debug(`(node_module entry) ${id} -> ${entryPoint}`)
    nodeModulesMap.set(id, entryPoint)
    return entryPoint
  } else {
    // possibly a deep import
    try {
      return resolve_from_1.default(root, id)
    } catch (e) {}
    // no match and no ext, try all exts
    if (!path_1.default.extname(id)) {
      for (const ext of resolver_1.supportedExts) {
        try {
          return resolve_from_1.default(root, id + ext)
        } catch (e) {}
      }
    }
  }
}
