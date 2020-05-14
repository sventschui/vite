'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const slash_1 = __importDefault(require('slash'))
const fs_1 = require('fs')
const utils_1 = require('./utils')
const serverPluginModuleResolve_1 = require('./server/serverPluginModuleResolve')
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
        fs_1.statSync(cleanId + ext)
        inferredExt = ext
        break
      } catch (e) {
        try {
          // foo -> foo/index.js
          fs_1.statSync(path_1.default.join(cleanId, '/index' + ext))
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
function createResolver(root, resolvers, alias) {
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
