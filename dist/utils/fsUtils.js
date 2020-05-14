'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const fs_extra_1 = __importDefault(require('fs-extra'))
const lru_cache_1 = __importDefault(require('lru-cache'))
const stream_1 = require('stream')
const serverPluginServeStatic_1 = require('../server/serverPluginServeStatic')
const getETag = require('etag')
const moduleReadCache = new lru_cache_1.default({
  max: 10000
})
/**
 * Read a file with in-memory cache.
 * Also sets approrpriate headers and body on the Koa context.
 */
async function cachedRead(ctx, file) {
  const lastModified = fs_extra_1.default.statSync(file).mtimeMs
  const cached = moduleReadCache.get(file)
  if (ctx) {
    ctx.set('Cache-Control', 'no-cache')
    ctx.type = path_1.default.basename(file)
  }
  if (cached && cached.lastModified === lastModified) {
    if (ctx) {
      ctx.etag = cached.etag
      ctx.lastModified = new Date(cached.lastModified)
      if (
        ctx.__serviceWorker !== true &&
        ctx.get('If-None-Match') === ctx.etag &&
        serverPluginServeStatic_1.seenUrls.has(ctx.url)
      ) {
        ctx.status = 304
      }
      serverPluginServeStatic_1.seenUrls.add(ctx.url)
      ctx.body = cached.content
    }
    return cached.content
  }
  const content = await fs_extra_1.default.readFile(file, 'utf-8')
  const etag = getETag(content)
  moduleReadCache.set(file, {
    content,
    etag,
    lastModified
  })
  if (ctx) {
    ctx.etag = etag
    ctx.lastModified = new Date(lastModified)
    ctx.body = content
    ctx.status = 200
  }
  return content
}
exports.cachedRead = cachedRead
/**
 * Read already set body on a Koa context and normalize it into a string.
 * Useful in post-processing middlewares.
 */
async function readBody(stream) {
  if (stream instanceof stream_1.Readable) {
    return new Promise((resolve, reject) => {
      let res = ''
      stream
        .on('data', (chunk) => (res += chunk))
        .on('error', reject)
        .on('end', () => {
          resolve(res)
        })
    })
  } else {
    return !stream || typeof stream === 'string' ? stream : stream.toString()
  }
}
exports.readBody = readBody
function lookupFile(dir, formats) {
  for (const format of formats) {
    const fullPath = path_1.default.join(dir, format)
    if (fs_extra_1.default.existsSync(fullPath)) {
      return fs_extra_1.default.readFileSync(fullPath, 'utf-8')
    }
  }
  const parentDir = path_1.default.dirname(dir)
  if (parentDir !== dir) {
    return lookupFile(parentDir, formats)
  }
}
exports.lookupFile = lookupFile
//# sourceMappingURL=fsUtils.js.map
