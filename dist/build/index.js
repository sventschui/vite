'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const fs_extra_1 = __importDefault(require('fs-extra'))
const chalk_1 = __importDefault(require('chalk'))
const resolve_from_1 = __importDefault(require('resolve-from'))
const resolver_1 = require('../resolver')
const buildPluginResolve_1 = require('./buildPluginResolve')
const buildPluginHtml_1 = require('./buildPluginHtml')
const buildPluginCss_1 = require('./buildPluginCss')
const buildPluginAsset_1 = require('./buildPluginAsset')
const buildPluginEsbuild_1 = require('./buildPluginEsbuild')
const buildPluginReplace_1 = require('./buildPluginReplace')
const esbuildService_1 = require('../esbuildService')
const transform_1 = require('../transform')
const writeColors = {
  [0 /* JS */]: chalk_1.default.cyan,
  [1 /* CSS */]: chalk_1.default.magenta,
  [2 /* ASSET */]: chalk_1.default.green,
  [3 /* HTML */]: chalk_1.default.blue,
  [4 /* SOURCE_MAP */]: chalk_1.default.gray
}
/**
 * Bundles the app for production.
 * Returns a Promise containing the build result.
 */
async function build(options = {}) {
  if (options.ssr) {
    return ssrBuild({
      ...options,
      ssr: false // since ssrBuild calls build, this avoids an infinite loop.
    })
  }
  const isTest = process.env.NODE_ENV === 'test'
  process.env.NODE_ENV = 'production'
  const start = Date.now()
  const {
    root = process.cwd(),
    base = '/',
    outDir = path_1.default.resolve(root, 'dist'),
    assetsDir = 'assets',
    assetsInlineLimit = 4096,
    alias = {},
    transforms = [],
    resolvers = [],
    vueCompilerOptions,
    rollupInputOptions = {},
    rollupOutputOptions = {},
    rollupPluginVueOptions = {},
    jsx = {},
    emitIndex = true,
    emitAssets = true,
    write = true,
    minify = true,
    silent = false,
    sourcemap = false,
    shouldPreload = null
  } = options
  let spinner
  const msg = 'Building for production...'
  if (!silent) {
    if (process.env.DEBUG || isTest) {
      console.log(msg)
    } else {
      console.log(process.env.NODE_ENV)
      spinner = require('ora')(msg + '\n').start()
    }
  }
  const indexPath = path_1.default.resolve(root, 'index.html')
  const publicBasePath = base.replace(/([^/])$/, '$1/') // ensure ending slash
  const resolvedAssetsPath = path_1.default.join(outDir, assetsDir)
  const cssFileName = 'style.css'
  const resolver = resolver_1.createResolver(root, resolvers, alias)
  const {
    htmlPlugin,
    renderIndex
  } = await buildPluginHtml_1.createBuildHtmlPlugin(
    root,
    indexPath,
    publicBasePath,
    assetsDir,
    assetsInlineLimit,
    resolver,
    shouldPreload
  )
  // lazy require rollup so that we don't load it when only using the dev server
  // importing it just for the types
  const rollup = require('rollup').rollup
  const bundle = await rollup({
    input: path_1.default.resolve(root, 'index.html'),
    preserveEntrySignatures: false,
    ...rollupInputOptions,
    plugins: [
      // user plugins
      ...(rollupInputOptions.plugins || []),
      // vite:resolve
      buildPluginResolve_1.createBuildResolvePlugin(root, resolver),
      // vite:html
      ...(htmlPlugin ? [htmlPlugin] : []),
      // vite:esbuild
      await buildPluginEsbuild_1.createEsbuildPlugin(minify === 'esbuild', jsx),
      // vue
      require('rollup-plugin-vue')({
        ...rollupPluginVueOptions,
        transformAssetUrls: {
          includeAbsolute: true
        },
        preprocessStyles: true,
        preprocessCustomRequire: (id) =>
          require(resolve_from_1.default(root, id)),
        compilerOptions: vueCompilerOptions
      }),
      require('@rollup/plugin-json')(),
      // user transforms
      ...(transforms.length
        ? [transform_1.createBuildJsTransformPlugin(transforms)]
        : []),
      require('@rollup/plugin-node-resolve')({
        rootDir: root,
        extensions: resolver_1.supportedExts
      }),
      // we use a custom replacement plugin because @rollup/plugin-replace
      // performs replacements twice, once at transform and once at renderChunk
      // - which makes it impossible to exclude Vue templates from it since
      // Vue templates are compiled into js and included in chunks.
      buildPluginReplace_1.createReplacePlugin(
        {
          'process.env.NODE_ENV': '"production"',
          __DEV__: 'false',
          __BASE__: JSON.stringify(publicBasePath)
        },
        sourcemap
      ),
      // vite:css
      buildPluginCss_1.createBuildCssPlugin(
        root,
        publicBasePath,
        assetsDir,
        cssFileName,
        !!minify,
        assetsInlineLimit,
        transforms
      ),
      // vite:asset
      buildPluginAsset_1.createBuildAssetPlugin(
        root,
        publicBasePath,
        assetsDir,
        assetsInlineLimit
      ),
      // minify with terser
      // this is the default which has better compression, but slow
      // the user can opt-in to use esbuild which is much faster but results
      // in ~8-10% larger file size.
      ...(minify && minify !== 'esbuild'
        ? [require('rollup-plugin-terser').terser()]
        : [])
    ],
    onwarn(warning, warn) {
      if (warning.code !== 'CIRCULAR_DEPENDENCY') {
        warn(warning)
      }
    }
  })
  const { output } = await bundle.generate({
    format: 'es',
    sourcemap,
    ...rollupOutputOptions
  })
  spinner && spinner.stop()
  const indexHtml = emitIndex ? renderIndex(output, cssFileName) : ''
  if (write) {
    const cwd = process.cwd()
    const writeFile = async (filepath, content, type) => {
      await fs_extra_1.default.ensureDir(path_1.default.dirname(filepath))
      await fs_extra_1.default.writeFile(filepath, content)
      if (!silent) {
        console.log(
          `${chalk_1.default.gray(`[write]`)} ${writeColors[type](
            path_1.default.relative(cwd, filepath)
          )} ${(content.length / 1024).toFixed(2)}kb, brotli: ${(
            require('brotli-size').sync(content) / 1024
          ).toFixed(2)}kb`
        )
      }
    }
    await fs_extra_1.default.remove(outDir)
    await fs_extra_1.default.ensureDir(outDir)
    // write js chunks and assets
    for (const chunk of output) {
      if (chunk.type === 'chunk') {
        // write chunk
        const filepath = path_1.default.join(resolvedAssetsPath, chunk.fileName)
        let code = chunk.code
        if (chunk.map) {
          code += `\n//# sourceMappingURL=${path_1.default.basename(
            filepath
          )}.map`
        }
        await writeFile(filepath, code, 0 /* JS */)
        if (chunk.map) {
          await writeFile(
            filepath + '.map',
            chunk.map.toString(),
            4 /* SOURCE_MAP */
          )
        }
      } else if (emitAssets) {
        // write asset
        const filepath = path_1.default.join(resolvedAssetsPath, chunk.fileName)
        await writeFile(
          filepath,
          chunk.source,
          chunk.fileName.endsWith('.css') ? 1 /* CSS */ : 2 /* ASSET */
        )
      }
    }
    // write html
    if (indexHtml && emitIndex) {
      await writeFile(
        path_1.default.join(outDir, 'index.html'),
        indexHtml,
        3 /* HTML */
      )
    }
    // copy over /public if it exists
    if (emitAssets) {
      const publicDir = path_1.default.resolve(root, 'public')
      if (fs_extra_1.default.existsSync(publicDir)) {
        await fs_extra_1.default.copy(
          publicDir,
          path_1.default.resolve(outDir, 'public')
        )
      }
    }
  }
  if (!silent) {
    console.log(
      `Build completed in ${((Date.now() - start) / 1000).toFixed(2)}s.\n`
    )
  }
  // stop the esbuild service after each build
  esbuildService_1.stopService()
  return {
    assets: output,
    html: indexHtml
  }
}
exports.build = build
/**
 * Bundles the app in SSR mode.
 * - All Vue dependencies are automatically externalized
 * - Imports to dependencies are compiled into require() calls
 * - Templates are compiled with SSR specific optimizations.
 */
async function ssrBuild(options = {}) {
  const {
    rollupInputOptions,
    rollupOutputOptions,
    rollupPluginVueOptions
  } = options
  return build({
    outDir: path_1.default.resolve(options.root || process.cwd(), 'dist-ssr'),
    assetsDir: '.',
    ...options,
    rollupPluginVueOptions: {
      ...rollupPluginVueOptions,
      target: 'node'
    },
    rollupInputOptions: {
      ...rollupInputOptions,
      external: resolveExternal(
        rollupInputOptions && rollupInputOptions.external
      )
    },
    rollupOutputOptions: {
      ...rollupOutputOptions,
      format: 'cjs',
      exports: 'named'
    },
    emitIndex: false,
    emitAssets: false,
    minify: false
  })
}
exports.ssrBuild = ssrBuild
function resolveExternal(userExternal) {
  const required = ['vue', /^@vue\//]
  if (!userExternal) {
    return required
  }
  if (Array.isArray(userExternal)) {
    return [...required, ...userExternal]
  } else if (typeof userExternal === 'function') {
    return (src, importer, isResolved) => {
      if (src === 'vue' || /^@vue\//.test(src)) {
        return true
      }
      return userExternal(src, importer, isResolved)
    }
  } else {
    return [...required, userExternal]
  }
}
