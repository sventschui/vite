'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const chalk_1 = __importDefault(require('chalk'))
const path_1 = __importDefault(require('path'))
const resolveVue_1 = require('../utils/resolveVue')
const hash_sum_1 = __importDefault(require('hash-sum'))
const lru_cache_1 = __importDefault(require('lru-cache'))
const serverPluginHmr_1 = require('./serverPluginHmr')
const resolve_from_1 = __importDefault(require('resolve-from'))
const utils_1 = require('../utils')
const esbuildService_1 = require('../esbuildService')
const querystring_1 = __importDefault(require('querystring'))
const serverPluginServeStatic_1 = require('./serverPluginServeStatic')
const debug = require('debug')('vite:sfc')
const getEtag = require('etag')
exports.srcImportMap = new Map()
exports.vueCache = new lru_cache_1.default({
  max: 65535
})
exports.vuePlugin = ({ root, app, resolver, watcher, config }) => {
  const etagCacheCheck = (ctx) => {
    ctx.etag = getEtag(ctx.body)
    // only add 304 tag check if not using service worker to cache user code
    if (!config.serviceWorker) {
      ctx.status =
        serverPluginServeStatic_1.seenUrls.has(ctx.url) &&
        ctx.etag === ctx.get('If-None-Match')
          ? 304
          : 200
      serverPluginServeStatic_1.seenUrls.add(ctx.url)
    }
  }
  app.use(async (ctx, next) => {
    if (!ctx.path.endsWith('.vue') && !ctx.vue) {
      return next()
    }
    const query = ctx.query
    const publicPath = ctx.path
    let filename = resolver.requestToFile(publicPath)
    // upstream plugins could've already read the file
    const descriptor = await parseSFC(root, filename, ctx.body)
    if (!descriptor) {
      debug(`${ctx.url} - 404`)
      ctx.status = 404
      return
    }
    if (!query.type) {
      if (descriptor.script && descriptor.script.src) {
        filename = await resolveSrcImport(descriptor.script, ctx, resolver)
      }
      ctx.type = 'js'
      ctx.body = await compileSFCMain(descriptor, filename, publicPath)
      return etagCacheCheck(ctx)
    }
    if (query.type === 'template') {
      const templateBlock = descriptor.template
      if (templateBlock.src) {
        filename = await resolveSrcImport(templateBlock, ctx, resolver)
      }
      ctx.type = 'js'
      ctx.body = compileSFCTemplate(
        root,
        templateBlock,
        filename,
        publicPath,
        descriptor.styles.some((s) => s.scoped),
        config.vueCompilerOptions
      )
      return etagCacheCheck(ctx)
    }
    if (query.type === 'style') {
      const index = Number(query.index)
      const styleBlock = descriptor.styles[index]
      if (styleBlock.src) {
        filename = await resolveSrcImport(styleBlock, ctx, resolver)
      }
      const result = await compileSFCStyle(
        root,
        styleBlock,
        index,
        filename,
        publicPath
      )
      if (query.module != null) {
        ctx.type = 'js'
        ctx.body = `export default ${JSON.stringify(result.modules)}`
      } else {
        ctx.type = 'css'
        ctx.body = result.code
      }
      return etagCacheCheck(ctx)
    }
    // TODO custom blocks
  })
  // handle HMR for <style src="xxx.css">
  // it cannot be handled as simple css import because it may be scoped
  watcher.on('change', (file) => {
    const styleImport = exports.srcImportMap.get(file)
    if (styleImport) {
      exports.vueCache.del(file)
      const publicPath = utils_1.cleanUrl(styleImport)
      const index = querystring_1.default.parse(styleImport.split('?', 2)[1])
        .index
      console.log(
        chalk_1.default.green(`[vite:hmr] `) + `${publicPath} updated. (style)`
      )
      watcher.send({
        type: 'vue-style-update',
        path: publicPath,
        index: Number(index),
        id: `${hash_sum_1.default(publicPath)}-${index}`,
        timestamp: Date.now()
      })
    }
  })
}
async function resolveSrcImport(block, ctx, resolver) {
  const importer = ctx.path
  const importee = utils_1.resolveRelativeRequest(importer, block.src).url
  const filename = resolver.requestToFile(importee)
  await utils_1.cachedRead(ctx, filename)
  block.content = ctx.body
  // register HMR import relationship
  serverPluginHmr_1.debugHmr(`        ${importer} imports ${importee}`)
  serverPluginHmr_1
    .ensureMapEntry(serverPluginHmr_1.importerMap, importee)
    .add(ctx.path)
  exports.srcImportMap.set(filename, ctx.url)
  return filename
}
async function parseSFC(root, filename, content) {
  let cached = exports.vueCache.get(filename)
  if (cached && cached.descriptor) {
    debug(`${filename} parse cache hit`)
    return cached.descriptor
  }
  if (!content) {
    try {
      content = await utils_1.cachedRead(null, filename)
    } catch (e) {
      return
    }
  }
  if (typeof content !== 'string') {
    content = content.toString()
  }
  const start = Date.now()
  const { parse, generateCodeFrame } = resolveVue_1.resolveCompiler(root)
  const { descriptor, errors } = parse(content, {
    filename,
    sourceMap: true
  })
  if (errors.length) {
    console.error(chalk_1.default.red(`\n[vite] SFC parse error: `))
    errors.forEach((e) => {
      console.error(
        chalk_1.default.underline(
          `${filename}:${e.loc.start.line}:${e.loc.start.column}`
        )
      )
      console.error(chalk_1.default.yellow(e.message))
      console.error(
        generateCodeFrame(content, e.loc.start.offset, e.loc.end.offset) + `\n`
      )
    })
  }
  cached = cached || { styles: [] }
  cached.descriptor = descriptor
  exports.vueCache.set(filename, cached)
  debug(`${filename} parsed in ${Date.now() - start}ms.`)
  return descriptor
}
exports.parseSFC = parseSFC
async function compileSFCMain(descriptor, filePath, publicPath) {
  let cached = exports.vueCache.get(filePath)
  if (cached && cached.script) {
    return cached.script
  }
  let code = ''
  if (descriptor.script) {
    let content = descriptor.script.content
    if (descriptor.script.lang === 'ts') {
      content = (
        await esbuildService_1.transform(content, publicPath, { loader: 'ts' })
      ).code
    }
    code += content.replace(`export default`, 'const __script =')
  } else {
    code += `const __script = {}`
  }
  const id = hash_sum_1.default(publicPath)
  let hasScoped = false
  let hasCSSModules = false
  if (descriptor.styles) {
    code += `\nimport { updateStyle } from "${serverPluginHmr_1.hmrClientId}"\n`
    descriptor.styles.forEach((s, i) => {
      const styleRequest = publicPath + `?type=style&index=${i}`
      if (s.scoped) hasScoped = true
      if (s.module) {
        if (!hasCSSModules) {
          code += `\nconst __cssModules = __script.__cssModules = {}`
          hasCSSModules = true
        }
        const styleVar = `__style${i}`
        const moduleName = typeof s.module === 'string' ? s.module : '$style'
        code += `\nimport ${styleVar} from ${JSON.stringify(
          styleRequest + '&module'
        )}`
        code += `\n__cssModules[${JSON.stringify(moduleName)}] = ${styleVar}`
      }
      code += `\nupdateStyle("${id}-${i}", ${JSON.stringify(styleRequest)})`
    })
    if (hasScoped) {
      code += `\n__script.__scopeId = "data-v-${id}"`
    }
  }
  if (descriptor.template) {
    code += `\nimport { render as __render } from ${JSON.stringify(
      publicPath + `?type=template`
    )}`
    code += `\n__script.render = __render`
  }
  code += `\n__script.__hmrId = ${JSON.stringify(publicPath)}`
  code += `\n__script.__file = ${JSON.stringify(filePath)}`
  code += `\nexport default __script`
  if (descriptor.script) {
    code += utils_1.genSourceMapString(descriptor.script.map)
  }
  cached = cached || { styles: [] }
  cached.script = code
  exports.vueCache.set(filePath, cached)
  return code
}
function compileSFCTemplate(
  root,
  template,
  filename,
  publicPath,
  scoped,
  userOptions
) {
  let cached = exports.vueCache.get(filename)
  if (cached && cached.template) {
    debug(`${publicPath} template cache hit`)
    return cached.template
  }
  const start = Date.now()
  const { compileTemplate, generateCodeFrame } = resolveVue_1.resolveCompiler(
    root
  )
  const { code, map, errors } = compileTemplate({
    source: template.content,
    filename,
    inMap: template.map,
    transformAssetUrls: {
      base: path_1.default.posix.dirname(publicPath)
    },
    compilerOptions: {
      ...userOptions,
      scopeId: scoped ? `data-v-${hash_sum_1.default(publicPath)}` : null,
      runtimeModuleName: '/@modules/vue'
    },
    preprocessLang: template.lang,
    preprocessCustomRequire: (id) => require(resolve_from_1.default(root, id))
  })
  if (errors.length) {
    console.error(
      chalk_1.default.red(`\n[vite] SFC template compilation error: `)
    )
    errors.forEach((e) => {
      if (typeof e === 'string') {
        console.error(e)
      } else {
        console.error(
          chalk_1.default.underline(
            `${filename}:${e.loc.start.line}:${e.loc.start.column}`
          )
        )
        console.error(chalk_1.default.yellow(e.message))
        const original = template.map.sourcesContent[0]
        console.error(
          generateCodeFrame(original, e.loc.start.offset, e.loc.end.offset) +
            `\n`
        )
      }
    })
  }
  const finalCode = code + utils_1.genSourceMapString(map)
  cached = cached || { styles: [] }
  cached.template = finalCode
  exports.vueCache.set(filename, cached)
  debug(`${publicPath} template compiled in ${Date.now() - start}ms.`)
  return finalCode
}
async function compileSFCStyle(root, style, index, filename, publicPath) {
  let cached = exports.vueCache.get(filename)
  const cachedEntry = cached && cached.styles && cached.styles[index]
  if (cachedEntry) {
    debug(`${publicPath} style cache hit`)
    return cachedEntry
  }
  const start = Date.now()
  const id = hash_sum_1.default(publicPath)
  const postcssConfig = await utils_1.loadPostcssConfig(root)
  const { compileStyleAsync, generateCodeFrame } = resolveVue_1.resolveCompiler(
    root
  )
  const result = await compileStyleAsync({
    source: style.content,
    filename,
    id: `data-v-${id}`,
    scoped: style.scoped != null,
    modules: style.module != null,
    preprocessLang: style.lang,
    preprocessCustomRequire: (id) => require(resolve_from_1.default(root, id)),
    ...(postcssConfig
      ? {
          postcssOptions: postcssConfig.options,
          postcssPlugins: postcssConfig.plugins
        }
      : {})
  })
  if (result.errors.length) {
    console.error(chalk_1.default.red(`\n[vite] SFC style compilation error: `))
    result.errors.forEach((e) => {
      if (typeof e === 'string') {
        console.error(e)
      } else {
        const lineOffset = style.loc.start.line - 1
        if (e.line && e.column) {
          console.log(
            chalk_1.default.underline(
              `${filename}:${e.line + lineOffset}:${e.column}`
            )
          )
        } else {
          console.log(chalk_1.default.underline(filename))
        }
        const filenameRE = new RegExp(
          '.*' +
            path_1.default
              .basename(filename)
              .replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&') +
            '(:\\d+:\\d+:\\s*)?'
        )
        const cleanMsg = e.message.replace(filenameRE, '')
        console.error(chalk_1.default.yellow(cleanMsg))
        if (e.line && e.column && cleanMsg.split(/\n/g).length === 1) {
          const original = style.map.sourcesContent[0]
          const offset =
            original
              .split(/\r?\n/g)
              .slice(0, e.line + lineOffset - 1)
              .map((l) => l.length)
              .reduce((total, l) => total + l + 1, 0) +
            e.column -
            1
          console.error(generateCodeFrame(original, offset, offset + 1)) + `\n`
        }
      }
    })
  }
  cached = cached || { styles: [] }
  cached.styles[index] = result
  exports.vueCache.set(filename, cached)
  debug(`${publicPath} style compiled in ${Date.now() - start}ms`)
  return result
}
