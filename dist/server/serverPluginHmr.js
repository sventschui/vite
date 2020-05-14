'use strict'
// How HMR works
// 1. `.vue` files are transformed into `.js` files before being served
// 2. All `.js` files, before being served, are parsed to detect their imports
//    (this is done in `./serverPluginModuleRewrite.ts`) for module import rewriting.
//    During this we also record the importer/importee relationships which can be used for
//    HMR analysis (we do both at the same time to avoid double parse costs)
// 3. When a `.vue` file changes, we directly read, parse it again and
//    send the client because Vue components are self-accepting by nature
// 4. When a js file changes, it triggers an HMR graph analysis, where we try to
//    walk its importer chains and see if we reach a "HMR boundary". An HMR
//    boundary is either a `.vue` file or a `.js` file that explicitly indicated
//    that it accepts hot updates (by importing from the `/vite/hmr` special module)
// 5. If any parent chain exhausts without ever running into an HMR boundary,
//    it's considered a "dead end". This causes a full page reload.
// 6. If a `.vue` boundary is encountered, we add it to the `vueImports` Set.
// 7. If a `.js` boundary is encountered, we check if the boundary's current
//    child importer is in the accepted list of the boundary (see additional
//    explanation below). If yes, record current child importer in the
//    `jsImporters` Set.
// 8. If the graph walk finished without running into dead ends, send the
//    client to update all `jsImporters` and `vueImporters`.
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const fs_1 = __importDefault(require('fs'))
const ws_1 = __importDefault(require('ws'))
const path_1 = __importDefault(require('path'))
const chalk_1 = __importDefault(require('chalk'))
const hash_sum_1 = __importDefault(require('hash-sum'))
const serverPluginVue_1 = require('./serverPluginVue')
const serverPluginModuleRewrite_1 = require('./serverPluginModuleRewrite')
const parser_1 = require('@babel/parser')
const lru_cache_1 = __importDefault(require('lru-cache'))
const slash_1 = __importDefault(require('slash'))
exports.debugHmr = require('debug')('vite:hmr')
exports.hmrAcceptanceMap = new Map()
exports.importerMap = new Map()
exports.importeeMap = new Map()
// files that are dirty (i.e. in the import chain between the accept boundrary
// and the actual changed file) for an hmr update at a given timestamp.
exports.hmrDirtyFilesMap = new lru_cache_1.default({ max: 10 })
// client and node files are placed flat in the dist folder
exports.hmrClientFilePath = path_1.default.resolve(__dirname, '../client.js')
exports.hmrClientId = 'vite/hmr'
exports.hmrClientPublicPath = `/${exports.hmrClientId}`
exports.hmrPlugin = ({ root, app, server, watcher, resolver, config }) => {
  const hmrClient = fs_1.default
    .readFileSync(exports.hmrClientFilePath, 'utf-8')
    .replace(`__SW_ENABLED__`, String(!!config.serviceWorker))
  app.use(async (ctx, next) => {
    if (ctx.path === exports.hmrClientPublicPath) {
      ctx.type = 'js'
      ctx.status = 200
      ctx.body = hmrClient
    } else {
      return next()
    }
  })
  // start a websocket server to send hmr notifications to the client
  const wss = new ws_1.default.Server({ server })
  const sockets = new Set()
  wss.on('connection', (socket) => {
    exports.debugHmr('ws client connected')
    sockets.add(socket)
    socket.send(JSON.stringify({ type: 'connected' }))
    socket.on('close', () => {
      sockets.delete(socket)
    })
  })
  wss.on('error', (e) => {
    if (e.code !== 'EADDRINUSE') {
      console.error(chalk_1.default.red(`[vite] WebSocket server error:`))
      console.error(e)
    }
  })
  const send = (payload) => {
    const stringified = JSON.stringify(payload, null, 2)
    exports.debugHmr(`update: ${stringified}`)
    sockets.forEach((s) => s.send(stringified))
  }
  watcher.handleVueReload = handleVueReload
  watcher.handleJSReload = handleJSReload
  watcher.send = send
  // exclude files declared as css by user transforms
  const cssTransforms = config.transforms
    ? config.transforms.filter((t) => t.as === 'css')
    : []
  watcher.on('change', async (file) => {
    const timestamp = Date.now()
    if (file.endsWith('.vue')) {
      handleVueReload(file, timestamp)
    } else if (
      file.endsWith('.module.css') ||
      !(file.endsWith('.css') || cssTransforms.some((t) => t.test(file, {})))
    ) {
      // everything except plain .css are considered HMR dependencies.
      // plain css has its own HMR logic in ./serverPluginCss.ts.
      handleJSReload(file, timestamp)
    }
  })
  async function handleVueReload(file, timestamp = Date.now(), content) {
    const publicPath = resolver.fileToRequest(file)
    const cacheEntry = serverPluginVue_1.vueCache.get(file)
    exports.debugHmr(`busting Vue cache for ${file}`)
    serverPluginVue_1.vueCache.del(file)
    const descriptor = await serverPluginVue_1.parseSFC(root, file, content)
    if (!descriptor) {
      // read failed
      return
    }
    const prevDescriptor = cacheEntry && cacheEntry.descriptor
    if (!prevDescriptor) {
      // the file has never been accessed yet
      exports.debugHmr(`no existing descriptor found for ${file}`)
      return
    }
    // check which part of the file changed
    let needReload = false
    let needCssModuleReload = false
    let needRerender = false
    if (!isEqual(descriptor.script, prevDescriptor.script)) {
      needReload = true
    }
    if (!isEqual(descriptor.template, prevDescriptor.template)) {
      needRerender = true
    }
    let didUpdateStyle = false
    const styleId = hash_sum_1.default(publicPath)
    const prevStyles = prevDescriptor.styles || []
    const nextStyles = descriptor.styles || []
    if (
      !needReload &&
      prevStyles.some((s) => s.scoped) !== nextStyles.some((s) => s.scoped)
    ) {
      needReload = true
    }
    // css modules update causes a reload because the $style object is changed
    // and it may be used in JS. It also needs to trigger a vue-style-update
    // event so the client busts the sw cache.
    if (
      prevStyles.some((s) => s.module != null) ||
      nextStyles.some((s) => s.module != null)
    ) {
      needCssModuleReload = true
    }
    // only need to update styles if not reloading, since reload forces
    // style updates as well.
    if (!needReload) {
      nextStyles.forEach((_, i) => {
        if (!prevStyles[i] || !isEqual(prevStyles[i], nextStyles[i])) {
          didUpdateStyle = true
          send({
            type: 'vue-style-update',
            path: publicPath,
            index: i,
            id: `${styleId}-${i}`,
            timestamp
          })
        }
      })
    }
    // stale styles always need to be removed
    prevStyles.slice(nextStyles.length).forEach((_, i) => {
      didUpdateStyle = true
      send({
        type: 'style-remove',
        path: publicPath,
        id: `${styleId}-${i + nextStyles.length}`,
        timestamp
      })
    })
    if (needReload || needCssModuleReload) {
      send({
        type: 'vue-reload',
        path: publicPath,
        timestamp
      })
    } else if (needRerender) {
      send({
        type: 'vue-rerender',
        path: publicPath,
        timestamp
      })
    }
    if (needReload || needRerender || didUpdateStyle) {
      let updateType = needReload ? `reload` : needRerender ? `template` : ``
      if (didUpdateStyle) {
        updateType += ` & style`
      }
      console.log(
        chalk_1.default.green(`[vite:hmr] `) +
          `${path_1.default.relative(root, file)} updated. (${updateType})`
      )
    }
  }
  function handleJSReload(filePath, timestamp = Date.now()) {
    // normal js file, but could be compiled from anything.
    // bust the vue cache in case this is a src imported file
    if (serverPluginVue_1.srcImportMap.has(filePath)) {
      exports.debugHmr(`busting Vue cache for ${filePath}`)
      serverPluginVue_1.vueCache.del(filePath)
    }
    const publicPath = resolver.fileToRequest(filePath)
    const importers = exports.importerMap.get(publicPath)
    if (importers) {
      const vueBoundaries = new Set()
      const jsBoundaries = new Set()
      const dirtyFiles = new Set()
      dirtyFiles.add(publicPath)
      const hasDeadEnd = walkImportChain(
        publicPath,
        importers,
        vueBoundaries,
        jsBoundaries,
        dirtyFiles
      )
      // record dirty files - this is used when HMR requests coming in with
      // timestamp to determine what files need to be force re-fetched
      exports.hmrDirtyFilesMap.set(String(timestamp), dirtyFiles)
      const relativeFile =
        '/' + slash_1.default(path_1.default.relative(root, filePath))
      if (hasDeadEnd) {
        send({
          type: 'full-reload',
          path: publicPath,
          timestamp
        })
        console.log(chalk_1.default.green(`[vite] `) + `page reloaded.`)
      } else {
        vueBoundaries.forEach((vueImporter) => {
          console.log(
            chalk_1.default.green(`[vite:hmr] `) +
              `${vueImporter} reloaded due to change in ${relativeFile}.`
          )
          send({
            type: 'vue-reload',
            path: vueImporter,
            changeSrcPath: publicPath,
            timestamp
          })
        })
        jsBoundaries.forEach((jsImporter) => {
          console.log(
            chalk_1.default.green(`[vite:hmr] `) +
              `${jsImporter} updated due to change in ${relativeFile}.`
          )
          send({
            type: 'js-update',
            path: jsImporter,
            changeSrcPath: publicPath,
            timestamp
          })
        })
      }
    } else {
      exports.debugHmr(`no importers for ${publicPath}.`)
    }
  }
}
function walkImportChain(
  importee,
  importers,
  vueBoundaries,
  jsBoundaries,
  dirtyFiles,
  currentChain = []
) {
  if (isHmrAccepted(importee, importee)) {
    // self-accepting module.
    jsBoundaries.add(importee)
    dirtyFiles.add(importee)
    return false
  }
  let hasDeadEnd = false
  for (const importer of importers) {
    if (importer.endsWith('.vue')) {
      vueBoundaries.add(importer)
      dirtyFiles.add(importer)
      currentChain.forEach((file) => dirtyFiles.add(file))
    } else if (isHmrAccepted(importer, importee)) {
      jsBoundaries.add(importer)
      // js boundaries themselves are not considered dirty
      currentChain.forEach((file) => dirtyFiles.add(file))
    } else {
      const parentImpoters = exports.importerMap.get(importer)
      if (!parentImpoters) {
        hasDeadEnd = true
      } else {
        hasDeadEnd = walkImportChain(
          importer,
          parentImpoters,
          vueBoundaries,
          jsBoundaries,
          dirtyFiles,
          currentChain.concat(importer)
        )
      }
    }
  }
  return hasDeadEnd
}
function isHmrAccepted(importer, dep) {
  const deps = exports.hmrAcceptanceMap.get(importer)
  return deps ? deps.has(dep) : false
}
function isEqual(a, b) {
  if (!a && !b) return true
  if (!a || !b) return false
  if (a.content !== b.content) return false
  const keysA = Object.keys(a.attrs)
  const keysB = Object.keys(b.attrs)
  if (keysA.length !== keysB.length) {
    return false
  }
  return keysA.every((key) => a.attrs[key] === b.attrs[key])
}
function ensureMapEntry(map, key) {
  let entry = map.get(key)
  if (!entry) {
    entry = new Set()
    map.set(key, entry)
  }
  return entry
}
exports.ensureMapEntry = ensureMapEntry
function rewriteFileWithHMR(root, source, importer, resolver, s) {
  const ast = parser_1.parse(source, {
    sourceType: 'module',
    plugins: [
      // by default we enable proposals slated for ES2020.
      // full list at https://babeljs.io/docs/en/next/babel-parser#plugins
      // this should be kept in async with @vue/compiler-core's support range
      'bigInt',
      'optionalChaining',
      'nullishCoalescingOperator'
    ]
  }).program.body
  const registerDep = (e) => {
    const deps = ensureMapEntry(exports.hmrAcceptanceMap, importer)
    const depPublicPath = serverPluginModuleRewrite_1.resolveImport(
      root,
      importer,
      e.value,
      resolver
    )
    deps.add(depPublicPath)
    exports.debugHmr(`        ${importer} accepts ${depPublicPath}`)
    ensureMapEntry(exports.importerMap, depPublicPath).add(importer)
    s.overwrite(e.start, e.end, JSON.stringify(depPublicPath))
  }
  const checkHotCall = (node, isTopLevel = false) => {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'hot'
    ) {
      if (isTopLevel) {
        console.warn(
          chalk_1.default.yellow(
            `[vite warn] HMR API calls in ${importer} should be wrapped in ` +
              `\`if (__DEV__) {}\` conditional blocks so that they can be ` +
              `tree-shaken in production.`
          )
          // TODO generateCodeFrame
        )
      }
      if (node.callee.property.name === 'accept') {
        const args = node.arguments
        // inject the imports's own path so it becomes
        // hot.accept('/foo.js', ['./bar.js'], () => {})
        s.appendLeft(args[0].start, JSON.stringify(importer) + ', ')
        // register the accepted deps
        if (args[0].type === 'ArrayExpression') {
          args[0].elements.forEach((e) => {
            if (e && e.type !== 'StringLiteral') {
              console.error(
                `[vite] HMR syntax error in ${importer}: hot.accept() deps list can only contain string literals.`
              )
            } else if (e) {
              registerDep(e)
            }
          })
        } else if (args[0].type === 'StringLiteral') {
          registerDep(args[0])
        } else if (args[0].type.endsWith('FunctionExpression')) {
          // self accepting, rewrite to inject itself
          // hot.accept(() => {})  -->  hot.accept('/foo.js', '/foo.js', () => {})
          s.appendLeft(args[0].start, JSON.stringify(importer) + ', ')
          ensureMapEntry(exports.hmrAcceptanceMap, importer).add(importer)
        } else {
          console.error(
            `[vite] HMR syntax error in ${importer}: ` +
              `hot.accept() expects a dep string, an array of deps, or a callback.`
          )
        }
      }
      if (node.callee.property.name === 'dispose') {
        // inject the imports's own path to dispose calls as well
        s.appendLeft(node.arguments[0].start, JSON.stringify(importer) + ', ')
      }
    }
  }
  const checkStatements = (node, isTopLevel = false) => {
    if (node.type === 'ExpressionStatement') {
      // top level hot.accept() call
      checkHotCall(node.expression, isTopLevel)
      // __DEV__ && hot.accept()
      if (
        node.expression.type === 'LogicalExpression' &&
        node.expression.operator === '&&' &&
        node.expression.left.type === 'Identifier' &&
        node.expression.left.name === '__DEV__'
      ) {
        checkHotCall(node.expression.right)
      }
    }
    // if (__DEV__) ...
    if (
      node.type === 'IfStatement' &&
      node.test.type === 'Identifier' &&
      node.test.name === '__DEV__'
    ) {
      if (node.consequent.type === 'BlockStatement') {
        node.consequent.body.forEach((s) => checkStatements(s))
      }
      if (node.consequent.type === 'ExpressionStatement') {
        checkHotCall(node.consequent.expression)
      }
    }
  }
  ast.forEach((s) => checkStatements(s, true))
}
exports.rewriteFileWithHMR = rewriteFileWithHMR
