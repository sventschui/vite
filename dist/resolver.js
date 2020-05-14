'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const fs_1 = __importDefault(require('fs'))
const path_1 = __importDefault(require('path'))
const slash_1 = __importDefault(require('slash'))
const utils_1 = require('./utils')
const serverPluginModuleResolve_1 = require('./server/serverPluginModuleResolve')
const depOptimizer_1 = require('./depOptimizer')
const chalk_1 = __importDefault(require('chalk'))
const defaultRequestToFile = (publicPath, root) => {
  if (serverPluginModuleResolve_1.moduleRE.test(publicPath)) {
    const moduleFilePath = serverPluginModuleResolve_1.idToFileMap.get(
      publicPath.replace(serverPluginModuleResolve_1.moduleRE, '')
    )
    if (moduleFilePath) {
      return moduleFilePath
    }
  }
  return path_1.default.join(root, publicPath.slice(1))
}
const defaultFileToRequest = (filePath, root) => {
  const moduleRequest = serverPluginModuleResolve_1.fileToRequestMap.get(
    filePath
  )
  if (moduleRequest) {
    return moduleRequest
  }
  return `/${slash_1.default(path_1.default.relative(root, filePath))}`
}
exports.supportedExts = ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
const debug = require('debug')('vite:resolve')
exports.resolveExt = (id) => {
  const cleanId = utils_1.cleanUrl(id)
  if (!path_1.default.extname(cleanId)) {
    let inferredExt = ''
    for (const ext of exports.supportedExts) {
      try {
        // foo -> foo.js
        fs_1.default.statSync(cleanId + ext)
        inferredExt = ext
        break
      } catch (e) {
        try {
          // foo -> foo/index.js
          fs_1.default.statSync(path_1.default.join(cleanId, '/index' + ext))
          inferredExt = '/index' + ext
          break
        } catch (e) {}
      }
    }
    const queryMatch = id.match(/\?.*$/)
    const query = queryMatch ? queryMatch[0] : ''
    const reoslved = cleanId + inferredExt + query
    debug(`(extension) ${id} -> ${reoslved}`)
    return reoslved
  }
  return id
}
function createResolver(root, resolvers = [], alias = {}) {
  return {
    requestToFile: (publicPath) => {
      let resolved
      for (const r of resolvers) {
        const filepath = r.requestToFile(publicPath, root)
        if (filepath) {
          resolved = filepath
          break
        }
      }
      if (!resolved) {
        resolved = defaultRequestToFile(publicPath, root)
      }
      resolved = exports.resolveExt(resolved)
      return resolved
    },
    fileToRequest: (filePath) => {
      for (const r of resolvers) {
        const request = r.fileToRequest(filePath, root)
        if (request) return request
      }
      return defaultFileToRequest(filePath, root)
    },
    alias: (id) => {
      let aliased = alias[id]
      if (aliased) {
        return aliased
      }
      for (const r of resolvers) {
        aliased = r.alias && r.alias(id)
        if (aliased) {
          return aliased
        }
      }
    }
  }
}
exports.createResolver = createResolver
const deepImportRE = /^([^@][^/]*)\/|^(@[^/]+\/[^/]+)\//
function resolveBareModule(root, id, importer) {
  const optimized = resolveOptimizedModule(root, id)
  if (optimized) {
    return id
  }
  const nodeEntry = resolveNodeModuleEntry(root, id)
  if (nodeEntry) {
    return nodeEntry
  }
  const deepMatch = id.match(deepImportRE)
  if (deepMatch) {
    const depId = deepMatch[1] || deepMatch[2]
    if (resolveOptimizedModule(root, depId)) {
      console.error(
        chalk_1.default.yellow(
          `\n[vite] Avoid deep import "${id}" since "${depId}" is a ` +
            `pre-optimized dependency.\n` +
            `Prefer importing from the module directly.\n` +
            `Importer: ${importer}\n`
        )
      )
    }
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
  const file = path_1.default.join(root, depOptimizer_1.OPTIMIZE_CACHE_DIR, id)
  if (fs_1.default.existsSync(file)) {
    viteOptimizedMap.set(id, file)
    return file
  }
}
exports.resolveOptimizedModule = resolveOptimizedModule
const nodeModulesEntryMap = new Map()
function resolveNodeModuleEntry(root, id) {
  const cached = nodeModulesEntryMap.get(id)
  if (cached) {
    return cached
  }
  let pkgPath
  try {
    // see if the id is a valid package name
    pkgPath = utils_1.resolveFrom(root, `${id}/package.json`)
  } catch (e) {}
  if (pkgPath) {
    // if yes, this is a entry import. resolve entry file
    const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf-8'))
    let entryPoint
    if (pkg.exports) {
      if (typeof pkg.exports === 'string') {
        entryPoint = pkg.exports
      } else if (pkg.exports['.']) {
        if (typeof pkg.exports['.'] === 'string') {
          entryPoint = pkg.exports['.']
        } else {
          entryPoint = pkg.exports['.'].import
        }
      }
    }
    if (!entryPoint) {
      entryPoint = pkg.module || pkg.main || 'index.js'
    }
    entryPoint = path_1.default.posix.join(id, '/', entryPoint)
    debug(`(node_module entry) ${id} -> ${entryPoint}`)
    nodeModulesEntryMap.set(id, entryPoint)
    return entryPoint
  }
}
exports.resolveNodeModuleEntry = resolveNodeModuleEntry
const nodeModulesMap = new Map()
function resolveNodeModule(root, id) {
  const cached = nodeModulesMap.get(id)
  if (cached) {
    return cached
  }
  let resolved
  if (!path_1.default.extname(id)) {
    for (const ext of exports.supportedExts) {
      try {
        resolved = utils_1.resolveFrom(root, id + ext)
      } catch (e) {}
      if (resolved) {
        break
      }
    }
  }
  if (!resolved) {
    try {
      resolved = utils_1.resolveFrom(root, id)
    } catch (e) {}
  }
  nodeModulesMap.set(id, resolved)
  return resolved
}
exports.resolveNodeModule = resolveNodeModule
//# sourceMappingURL=resolver.js.map
