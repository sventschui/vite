'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const send = require('koa-send')
const debug = require('debug')('vite:history')
exports.seenUrls = new Set()
exports.serveStaticPlugin = ({ root, app, resolver, config }) => {
  app.use((ctx, next) => {
    // short circuit requests that have already been explicitly handled
    if (ctx.body || ctx.status !== 404) {
      return
    }
    return next()
  })
  // history API fallback
  app.use((ctx, next) => {
    if (ctx.method !== 'GET') {
      debug(`not redirecting ${ctx.url} (not GET)`)
      return next()
    }
    const accept = ctx.headers && ctx.headers.accept
    if (typeof accept !== 'string') {
      debug(`not redirecting ${ctx.url} (no headers.accept)`)
      return next()
    }
    if (accept.includes('application/json')) {
      debug(`not redirecting ${ctx.url} (json)`)
      return next()
    }
    if (!(accept.includes('text/html') || accept.includes('*/*'))) {
      debug(`not redirecting ${ctx.url} (not accepting html)`)
      return next()
    }
    const ext = path_1.default.extname(ctx.path)
    if (ext && !accept.includes('text/html')) {
      debug(`not redirecting ${ctx.url} (has file extension)`)
      return next()
    }
    debug(`redirecting ${ctx.url} to /index.html`)
    ctx.url = '/index.html'
    return next()
  })
  if (!config.serviceWorker) {
    app.use(async (ctx, next) => {
      await next()
      // the first request to the server should never 304
      if (exports.seenUrls.has(ctx.url) && ctx.fresh) {
        ctx.status = 304
      }
      exports.seenUrls.add(ctx.url)
    })
  }
  app.use(require('koa-etag')())
  app.use((ctx, next) => {
    const redirect = resolver.requestToFile(ctx.path)
    if (!redirect.startsWith(root)) {
      // resolver resolved to a file that is outside of project root,
      // manually send here
      return send(ctx, redirect, { root: '/' })
    }
    return next()
  })
  app.use(require('koa-static')(root))
}
//# sourceMappingURL=serverPluginServeStatic.js.map
