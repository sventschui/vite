'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const buildPluginAsset_1 = require('./buildPluginAsset')
const utils_1 = require('../utils')
const debug = require('debug')('vite:build:css')
const urlRE = /(url\(\s*['"]?)([^"')]+)(["']?\s*\))/
exports.createBuildCssPlugin = (
  root,
  publicBase,
  assetsDir,
  cssFileName,
  minify,
  inlineLimit,
  transforms
) => {
  const styles = new Map()
  const assets = new Map()
  transforms = transforms.filter((t) => t.as === 'css')
  return {
    name: 'vite:css',
    async transform(css, id) {
      let transformed = false
      if (transforms.length) {
        const { path, query } = utils_1.parseWithQuery(id)
        for (const t of transforms) {
          if (t.test(path, query)) {
            css = await t.transform(css, true)
            transformed = true
            break
          }
        }
      }
      if (transformed || id.endsWith('.css')) {
        // process url() - register referenced files as assets
        // and rewrite the url to the resolved public path
        if (urlRE.test(css)) {
          const fileDir = path_1.default.dirname(id)
          css = await utils_1.asyncReplace(
            css,
            urlRE,
            async ([matched, before, rawUrl, after]) => {
              if (utils_1.isExternalUrl(rawUrl) || rawUrl.startsWith('data:')) {
                return matched
              }
              const file = path_1.default.join(fileDir, rawUrl)
              const {
                fileName,
                content,
                url
              } = await buildPluginAsset_1.resolveAsset(
                file,
                root,
                publicBase,
                assetsDir,
                inlineLimit
              )
              if (fileName && content) {
                assets.set(fileName, content)
              }
              debug(
                `url(${rawUrl}) -> ${
                  url.startsWith('data:') ? `base64 inlined` : `url(${url})`
                }`
              )
              return `${before}${url}${after}`
            }
          )
        }
        // postcss
        let modules
        const postcssConfig = await utils_1.loadPostcssConfig(root)
        const expectsModule = id.endsWith('.module.css')
        if (postcssConfig || expectsModule) {
          try {
            const result = await require('postcss')([
              ...((postcssConfig && postcssConfig.plugins) || []),
              ...(expectsModule
                ? [
                    require('postcss-modules')({
                      getJSON(_, json) {
                        modules = json
                      }
                    })
                  ]
                : [])
            ]).process(css, {
              ...(postcssConfig && postcssConfig.options),
              from: id
            })
            css = result.css
          } catch (e) {
            console.error(`[vite] error applying postcss transforms: `, e)
          }
        }
        styles.set(id, css)
        return {
          code: modules
            ? `export default ${JSON.stringify(modules)}`
            : '/* css extracted by vite */',
          map: null
        }
      }
    },
    async generateBundle(_options, bundle) {
      let css = ''
      // finalize extracted css
      styles.forEach((s) => {
        css += s
      })
      // minify with cssnano
      if (minify) {
        css = (
          await require('postcss')([require('cssnano')]).process(css, {
            from: undefined
          })
        ).css
      }
      bundle[cssFileName] = {
        isAsset: true,
        type: 'asset',
        fileName: cssFileName,
        source: css
      }
      buildPluginAsset_1.registerAssets(assets, bundle)
    }
  }
}
