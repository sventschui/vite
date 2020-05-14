'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const fs_1 = __importDefault(require('fs'))
const path_1 = __importDefault(require('path'))
const optimizer_1 = require('../optimizer')
exports.serviceWorkerPlugin = ({ root, app, watcher, resolver, config }) => {
  const enabled = (config.serviceWorker = !!config.serviceWorker)
  let swScript = fs_1.default
    .readFileSync(
      path_1.default.resolve(__dirname, '../serviceWorker.js'),
      'utf-8'
    )
    .replace(/const __ENABLED__ =.*/, `const __ENABLED__ = ${enabled}`)
    // make sure the sw cache is unique per project
    .replace(
      /const __PROJECT_ROOT__ =.*/,
      `const __PROJECT_ROOT__ = ${JSON.stringify(root)}`
    )
    .replace(
      /const __LOCKFILE_HASH__ =.*/,
      `const __LOCKFILE_HASH__ = ${JSON.stringify(
        optimizer_1.getDepHash(root, config.__path)
      )}`
    )
    // inject server id so the sw cache is invalidated on restart.
    .replace(
      /const __SERVER_ID__ =.*/,
      `const __SERVER_ID__ = ${
        // only inject if caching user files. When caching deps only, only
        // the lockfile change invalidates the cache.
        config.serviceWorker === true ? Date.now() : '0'
      }`
    )
  // enable console logs in debug mode
  if (process.env.DEBUG === 'vite:sw') {
    swScript = swScript.replace(/\/\/ console.log/g, 'console.log')
  }
  watcher.on('unlink', (file) => {
    watcher.send({
      type: 'sw-bust-cache',
      path: resolver.fileToRequest(file),
      timestamp: Date.now()
    })
  })
  // TODO watch lockfile hash
  // - update swScript
  // - notify the client to update the sw
  app.use(async (ctx, next) => {
    // expose config to cachedRead
    ctx.__serviceWorker = enabled
    if (ctx.path === '/sw.js') {
      ctx.type = 'js'
      ctx.status = 200
      ctx.body = swScript
      return
    }
    return next()
  })
}
