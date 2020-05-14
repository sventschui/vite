'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const slash_1 = __importDefault(require('slash'))
const lru_cache_1 = __importDefault(require('lru-cache'))
const magic_string_1 = __importDefault(require('magic-string'))
const es_module_lexer_1 = require('es-module-lexer')
const serverPluginHmr_1 = require('./serverPluginHmr')
const utils_1 = require('../utils')
const chalk_1 = __importDefault(require('chalk'))
const serverPluginModuleResolve_1 = require('./serverPluginModuleResolve')
const debug = require('debug')('vite:rewrite')
const rewriteCache = new lru_cache_1.default({ max: 1024 })
// Plugin for rewriting served js.
// - Rewrites named module imports to `/@modules/:id` requests, e.g.
//   "vue" => "/@modules/vue"
// - Rewrites HMR `hot.accept` calls to inject the file's own path. e.g.
//   `hot.accept('./dep.js', cb)` -> `hot.accept('/importer.js', './dep.js', cb)`
// - Also tracks importer/importee relationship graph during the rewrite.
//   The graph is used by the HMR plugin to perform analysis on file change.
exports.moduleRewritePlugin = ({ root, app, watcher, resolver, config }) => {
  // bust module rewrite cache on file change
  watcher.on('change', (file) => {
    const publicPath = resolver.fileToRequest(file)
    debug(`${publicPath}: cache busted`)
    rewriteCache.del(publicPath)
  })
  // inject __DEV__ and process.env.NODE_ENV flags
  // since some ESM builds expect these to be replaced by the bundler
  const devInjectionCode =
    `\n<script>\n` +
    `window.__DEV__ = true\n` +
    `window.__BASE__ = '/'\n` +
    `window.__SW_ENABLED__ = ${!!config.serviceWorker}\n` +
    `window.process = { env: { NODE_ENV: 'development' }}\n` +
    `</script>` +
    `\n<script type="module" src="${serverPluginHmr_1.hmrClientPublicPath}"></script>\n`
  const scriptRE = /(<script\b[^>]*>)([\s\S]*?)<\/script>/gm
  const srcRE = /\bsrc=(?:"([^"]+)"|'([^']+)'|([^'"\s]+)\b)/
  app.use(async (ctx, next) => {
    await next()
    if (ctx.status === 304) {
      return
    }
    if (ctx.path === '/index.html') {
      const html = await utils_1.readBody(ctx.body)
      if (html && rewriteCache.has(html)) {
        debug('/index.html: serving from cache')
        ctx.body = rewriteCache.get(html)
      } else if (ctx.body) {
        await es_module_lexer_1.init
        let hasInjectedDevFlag = false
        const importer = '/index.html'
        ctx.body = html.replace(scriptRE, (matched, openTag, script) => {
          const devFlag = hasInjectedDevFlag ? `` : devInjectionCode
          hasInjectedDevFlag = true
          if (script) {
            return `${devFlag}${openTag}${rewriteImports(
              root,
              script,
              importer,
              resolver
            )}</script>`
          } else {
            const srcAttr = openTag.match(srcRE)
            if (srcAttr) {
              // register script as a import dep for hmr
              const importee = utils_1.cleanUrl(
                slash_1.default(
                  path_1.default.resolve('/', srcAttr[1] || srcAttr[2])
                )
              )
              serverPluginHmr_1.debugHmr(
                `        ${importer} imports ${importee}`
              )
              serverPluginHmr_1
                .ensureMapEntry(serverPluginHmr_1.importerMap, importee)
                .add(importer)
            }
            return `${devFlag}${matched}`
          }
        })
        rewriteCache.set(html, ctx.body)
        return
      }
    }
    // we are doing the js rewrite after all other middlewares have finished;
    // this allows us to post-process javascript produced by user middlewares
    // regardless of the extension of the original files.
    if (
      ctx.body &&
      ctx.response.is('js') &&
      !ctx.url.endsWith('.map') &&
      // skip internal client
      !ctx.path.startsWith(serverPluginHmr_1.hmrClientPublicPath) &&
      // only need to rewrite for <script> part in vue files
      !((ctx.path.endsWith('.vue') || ctx.vue) && ctx.query.type != null)
    ) {
      const content = await utils_1.readBody(ctx.body)
      if (!ctx.query.t && rewriteCache.has(content)) {
        debug(`(cached) ${ctx.url}`)
        ctx.body = rewriteCache.get(content)
      } else {
        await es_module_lexer_1.init
        ctx.body = rewriteImports(
          root,
          content,
          ctx.path,
          resolver,
          ctx.query.t
        )
        rewriteCache.set(content, ctx.body)
      }
    } else {
      debug(`(skipped) ${ctx.url}`)
    }
  })
}
function rewriteImports(root, source, importer, resolver, timestamp) {
  if (typeof source !== 'string') {
    source = String(source)
  }
  try {
    let imports = []
    try {
      imports = es_module_lexer_1.parse(source)[0]
    } catch (e) {
      console.error(
        chalk_1.default.yellow(
          `[vite] failed to parse ${chalk_1.default.cyan(
            importer
          )} for import rewrite.\nIf you are using ` +
            `JSX, make sure to named the file with the .jsx extension.`
        )
      )
    }
    if (imports.length) {
      debug(`${importer}: rewriting`)
      const s = new magic_string_1.default(source)
      let hasReplaced = false
      const prevImportees = serverPluginHmr_1.importeeMap.get(importer)
      const currentImportees = new Set()
      serverPluginHmr_1.importeeMap.set(importer, currentImportees)
      for (let i = 0; i < imports.length; i++) {
        const { s: start, e: end, d: dynamicIndex } = imports[i]
        let id = source.substring(start, end)
        let hasLiteralDynamicId = false
        if (dynamicIndex >= 0) {
          const literalIdMatch = id.match(/^(?:'([^']+)'|"([^"]+)")$/)
          if (literalIdMatch) {
            hasLiteralDynamicId = true
            id = literalIdMatch[1] || literalIdMatch[2]
          }
        }
        if (dynamicIndex === -1 || hasLiteralDynamicId) {
          // do not rewrite external imports
          if (utils_1.isExternalUrl(id)) {
            continue
          }
          let resolved
          if (id === serverPluginHmr_1.hmrClientId) {
            resolved = serverPluginHmr_1.hmrClientPublicPath
            if (!/.vue$|.vue\?type=/.test(importer)) {
              // the user explicit imports the HMR API in a js file
              // making the module hot.
              serverPluginHmr_1.rewriteFileWithHMR(
                root,
                source,
                importer,
                resolver,
                s
              )
              // we rewrite the hot.accept call
              hasReplaced = true
            }
          } else {
            resolved = exports.resolveImport(
              root,
              importer,
              id,
              resolver,
              timestamp
            )
          }
          if (resolved !== id) {
            debug(`    "${id}" --> "${resolved}"`)
            s.overwrite(
              start,
              end,
              hasLiteralDynamicId ? `'${resolved}'` : resolved
            )
            hasReplaced = true
          }
          // save the import chain for hmr analysis
          const importee = utils_1.cleanUrl(resolved)
          if (
            importee !== importer &&
            // no need to track hmr client or module dependencies
            importee !== serverPluginHmr_1.hmrClientPublicPath
          ) {
            currentImportees.add(importee)
            serverPluginHmr_1.debugHmr(
              `        ${importer} imports ${importee}`
            )
            serverPluginHmr_1
              .ensureMapEntry(serverPluginHmr_1.importerMap, importee)
              .add(importer)
          }
        } else {
          console.log(`[vite] ignored dynamic import(${id})`)
        }
      }
      // since the importees may have changed due to edits,
      // check if we need to remove this importer from certain importees
      if (prevImportees) {
        prevImportees.forEach((importee) => {
          if (!currentImportees.has(importee)) {
            const importers = serverPluginHmr_1.importerMap.get(importee)
            if (importers) {
              importers.delete(importer)
            }
          }
        })
      }
      if (!hasReplaced) {
        debug(`    no imports rewritten.`)
      }
      return hasReplaced ? s.toString() : source
    } else {
      debug(`${importer}: no imports found.`)
    }
    return source
  } catch (e) {
    console.error(
      `[vite] Error: module imports rewrite failed for ${importer}.\n`,
      e
    )
    debug(source)
    return source
  }
}
exports.rewriteImports = rewriteImports
const bareImportRE = /^[^\/\.]/
const fileExtensionRE = /\.\w+$/
const jsSrcRE = /\.(?:(?:j|t)sx?|vue)$/
exports.resolveImport = (root, importer, id, resolver, timestamp) => {
  id = resolver.alias(id) || id
  if (bareImportRE.test(id)) {
    // directly resolve bare module names to its entry path so that relative
    // imports from it (including source map urls) can work correctly
    const isWebModule = !!serverPluginModuleResolve_1.resolveWebModule(root, id)
    return `/@modules/${
      isWebModule
        ? id
        : serverPluginModuleResolve_1.resolveNodeModuleEntry(root, id) || id
    }`
  } else {
    let { pathname, query } = utils_1.resolveRelativeRequest(importer, id)
    // append an extension to extension-less imports
    if (!fileExtensionRE.test(pathname)) {
      const file = resolver.requestToFile(pathname)
      const indexMatch = file.match(/\/index\.\w+$/)
      if (indexMatch) {
        pathname = pathname.replace(/\/(index)?$/, '') + indexMatch[0]
      } else {
        pathname += path_1.default.extname(file)
      }
    }
    // mark non-src imports
    if (!jsSrcRE.test(pathname)) {
      query += `${query ? `&` : `?`}import`
    }
    // force re-fetch dirty imports by appending timestamp
    if (timestamp) {
      const dirtyFiles = serverPluginHmr_1.hmrDirtyFilesMap.get(timestamp)
      // only force re-fetch if this is a marked dirty file (in the import
      // chain of the changed file) or a vue part request (made by a dirty
      // vue main request)
      if ((dirtyFiles && dirtyFiles.has(pathname)) || /\.vue\?type/.test(id)) {
        query += `${query ? `&` : `?`}t=${timestamp}`
      }
    }
    return pathname + query
  }
}
