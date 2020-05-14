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
const debug = require('debug')('vite:build:resolve')
exports.createBuildResolvePlugin = (root, resolver) => {
  return {
    name: 'vite:resolve',
    async resolveId(id, importer) {
      const original = id
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
      }
      // fallback to node-resolve becuase alias
      if (id !== original) {
        const resolved = this.resolve(id, importer, { skipSelf: true })
        return resolved || { id }
      }
    },
    load(id) {
      if (id === serverPluginHmr_1.hmrClientId) {
        return `export const hot = {accept(){},dispose(){},on(){}}`
      }
    }
  }
}
//# sourceMappingURL=buildPluginResolve.js.map
