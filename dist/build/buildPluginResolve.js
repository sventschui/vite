'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const fs_extra_1 = __importDefault(require('fs-extra'))
const serverPluginHmr_1 = require('../server/serverPluginHmr')
const resolveVue_1 = require('../utils/resolveVue')
const serverPluginModuleResolve_1 = require('../server/serverPluginModuleResolve')
const debug = require('debug')('vite:build:resolve')
exports.createBuildResolvePlugin = (root, resolver) => {
  return {
    name: 'vite:resolve',
    async resolveId(id) {
      id = resolver.alias(id) || id
      if (id === serverPluginHmr_1.hmrClientId) {
        return serverPluginHmr_1.hmrClientId
      }
      if (id === 'vue' || id.startsWith('@vue/')) {
        const vuePaths = resolveVue_1.resolveVue(root)
        if (id in vuePaths) {
          return vuePaths[id]
        }
      }
      if (id.startsWith('/')) {
        const resolved = resolver.requestToFile(id)
        if (fs_extra_1.default.existsSync(resolved)) {
          debug(id, `-->`, resolved)
          return resolved
        }
      } else if (!id.startsWith('.')) {
        const webModulePath = await serverPluginModuleResolve_1.resolveWebModule(
          root,
          id
        )
        if (webModulePath) {
          return webModulePath
        }
      }
      // fallback to node-resolve
    },
    load(id) {
      if (id === serverPluginHmr_1.hmrClientId) {
        return `export const hot = {accept(){},dispose(){},on(){}}`
      }
    }
  }
}
