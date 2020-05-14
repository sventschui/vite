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
const buildPluginEsbuild_1 = require('./build/buildPluginEsbuild')
async function resolveConfig(configPath) {
  const start = Date.now()
  let config
  let resolvedPath
  let isTS = false
  if (configPath) {
    resolvedPath = path_1.default.resolve(process.cwd(), configPath)
  } else {
    const jsConfigPath = path_1.default.resolve(process.cwd(), 'vite.config.js')
    if (fs_extra_1.default.existsSync(jsConfigPath)) {
      resolvedPath = jsConfigPath
    } else {
      const tsConfigPath = path_1.default.resolve(
        process.cwd(),
        'vite.config.ts'
      )
      if (fs_extra_1.default.existsSync(tsConfigPath)) {
        isTS = true
        resolvedPath = tsConfigPath
      }
    }
  }
  if (!resolvedPath) {
    return
  }
  try {
    if (!isTS) {
      try {
        config = require(resolvedPath)
      } catch (e) {
        if (
          !/Cannot use import statement|Unexpected token 'export'/.test(
            e.message
          )
        ) {
          throw e
        }
      }
    }
    if (!config) {
      // 2. if we reach here, the file is ts or using es import syntax.
      // transpile es import syntax to require syntax using rollup.
      const rollup = require('rollup')
      const esbuilPlugin = await buildPluginEsbuild_1.createEsbuildPlugin(
        false,
        {}
      )
      const bundle = await rollup.rollup({
        external: (id) =>
          (id[0] !== '.' && !path_1.default.isAbsolute(id)) ||
          id.slice(-5, id.length) === '.json',
        input: resolvedPath,
        treeshake: false,
        plugins: [esbuilPlugin]
      })
      const {
        output: [{ code }]
      } = await bundle.generate({
        exports: 'named',
        format: 'cjs'
      })
      config = await loadConfigFromBundledFile(resolvedPath, code)
    }
    // normalize config root to absolute
    if (config.root && !path_1.default.isAbsolute(config.root)) {
      config.root = path_1.default.resolve(
        path_1.default.dirname(resolvedPath),
        config.root
      )
    }
    // resolve plugins
    if (config.plugins) {
      for (const plugin of config.plugins) {
        config = resolvePlugin(config, plugin)
      }
      // delete plugins so it doesn't get passed to `createServer` as server
      // plugins.
      delete config.plugins
    }
    require('debug')('vite:config')(
      `config resolved in ${Date.now() - start}ms`
    )
    config.__path = resolvedPath
    return config
  } catch (e) {
    console.error(
      chalk_1.default.red(`[vite] failed to load config from ${resolvedPath}:`)
    )
    console.error(e)
    process.exit(1)
  }
}
exports.resolveConfig = resolveConfig
async function loadConfigFromBundledFile(fileName, bundledCode) {
  const extension = path_1.default.extname(fileName)
  const defaultLoader = require.extensions[extension]
  require.extensions[extension] = (module, filename) => {
    if (filename === fileName) {
      module._compile(bundledCode, filename)
    } else {
      defaultLoader(module, filename)
    }
  }
  delete require.cache[fileName]
  const raw = require(fileName)
  const config = raw.__esModule ? raw.default : raw
  require.extensions[extension] = defaultLoader
  return config
}
function resolvePlugin(config, plugin) {
  return {
    ...config,
    alias: {
      ...plugin.alias,
      ...config.alias
    },
    transforms: [...(config.transforms || []), ...(plugin.transforms || [])],
    resolvers: [...(config.resolvers || []), ...(plugin.resolvers || [])],
    configureServer: (ctx) => {
      if (config.configureServer) {
        config.configureServer(ctx)
      }
      if (plugin.configureServer) {
        plugin.configureServer(ctx)
      }
    },
    vueCompilerOptions: {
      ...config.vueCompilerOptions,
      ...plugin.vueCompilerOptions
    },
    rollupInputOptions: {
      ...config.rollupInputOptions,
      ...plugin.rollupInputOptions
    },
    rollupOutputOptions: {
      ...config.rollupOutputOptions,
      ...plugin.rollupOutputOptions
    }
  }
}
