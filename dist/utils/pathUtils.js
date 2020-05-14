'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const slash_1 = __importDefault(require('slash'))
const querystring_1 = __importDefault(require('querystring'))
exports.queryRE = /\?.*$/
exports.hashRE = /\#.*$/
exports.cleanUrl = (url) =>
  url.replace(exports.hashRE, '').replace(exports.queryRE, '')
exports.resolveRelativeRequest = (importer, id) => {
  const resolved = slash_1.default(
    path_1.default.posix.resolve(path_1.default.dirname(importer), id)
  )
  const queryMatch = id.match(exports.queryRE)
  return {
    url: resolved,
    pathname: exports.cleanUrl(resolved),
    query: queryMatch ? queryMatch[0] : ''
  }
}
exports.parseWithQuery = (id) => {
  const queryMatch = id.match(exports.queryRE)
  if (queryMatch) {
    return {
      path: slash_1.default(exports.cleanUrl(id)),
      query: querystring_1.default.parse(queryMatch[0].slice(1))
    }
  }
  return {
    path: id,
    query: {}
  }
}
const httpRE = /^https?:\/\//
exports.isExternalUrl = (url) => httpRE.test(url)
const imageRE = /\.(png|jpe?g|gif|svg|ico)(\?.*)?$/
const mediaRE = /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/
const fontsRE = /\.(woff2?|eot|ttf|otf)(\?.*)?$/i
/**
 * Check if a file is a static asset that vite can process.
 */
exports.isStaticAsset = (file) => {
  return imageRE.test(file) || mediaRE.test(file) || fontsRE.test(file)
}
/**
 * Check if a request is an import from js instead of a native resource request
 * i.e. differentiate
 * `import('/style.css')`
 * from
 * `<link rel="stylesheet" href="/style.css">`
 *
 * The ?import query is injected by serverPluginModuleRewrite.
 */
exports.isImportRequest = (ctx) => {
  return ctx.query.import != null
}
