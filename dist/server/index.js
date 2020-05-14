'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const http_1 = __importDefault(require('http'))
const koa_1 = __importDefault(require('koa'))
const chokidar_1 = __importDefault(require('chokidar'))
const resolver_1 = require('../resolver')
const serverPluginModuleRewrite_1 = require('./serverPluginModuleRewrite')
const serverPluginModuleResolve_1 = require('./serverPluginModuleResolve')
const serverPluginVue_1 = require('./serverPluginVue')
const serverPluginHmr_1 = require('./serverPluginHmr')
const serverPluginServeStatic_1 = require('./serverPluginServeStatic')
const serverPluginJson_1 = require('./serverPluginJson')
const serverPluginCss_1 = require('./serverPluginCss')
const serverPluginAssets_1 = require('./serverPluginAssets')
const serverPluginEsbuild_1 = require('./serverPluginEsbuild')
const transform_1 = require('../transform')
const serverPluginServiceWorker_1 = require('./serverPluginServiceWorker')
var serverPluginModuleRewrite_2 = require('./serverPluginModuleRewrite')
exports.rewriteImports = serverPluginModuleRewrite_2.rewriteImports
function createServer(config = {}) {
  const {
    root = process.cwd(),
    plugins = [],
    resolvers = [],
    alias = {},
    transforms = []
  } = config
  const app = new koa_1.default()
  const server = http_1.default.createServer(app.callback())
  const watcher = chokidar_1.default.watch(root, {
    ignored: [/node_modules/]
  })
  const resolver = resolver_1.createResolver(root, resolvers, alias)
  const context = {
    root,
    app,
    server,
    watcher,
    resolver,
    config
  }
  const resolvedPlugins = [
    ...plugins,
    serverPluginServiceWorker_1.serviceWorkerPlugin,
    serverPluginHmr_1.hmrPlugin,
    serverPluginModuleRewrite_1.moduleRewritePlugin,
    serverPluginModuleResolve_1.moduleResolvePlugin,
    serverPluginVue_1.vuePlugin,
    serverPluginEsbuild_1.esbuildPlugin,
    serverPluginJson_1.jsonPlugin,
    serverPluginCss_1.cssPlugin,
    serverPluginAssets_1.assetPathPlugin,
    ...(transforms.length
      ? [transform_1.createServerTransformPlugin(transforms)]
      : []),
    serverPluginServeStatic_1.serveStaticPlugin
  ]
  resolvedPlugins.forEach((m) => m(context))
  return server
}
exports.createServer = createServer
