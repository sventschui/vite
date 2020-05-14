'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const fs_extra_1 = __importDefault(require('fs-extra'))
const path_1 = __importDefault(require('path'))
const crypto_1 = require('crypto')
const resolver_1 = require('./resolver')
const build_1 = require('./build')
const utils_1 = require('./utils')
const es_module_lexer_1 = require('es-module-lexer')
const chalk_1 = __importDefault(require('chalk'))
const KNOWN_IGNORE_LIST = new Set(['tailwindcss'])
exports.OPTIMIZE_CACHE_DIR = `node_modules/.vite_opt_cache`
async function optimizeDeps(config, asCommand = false) {
  const debug = require('debug')('vite:optimize')
  const log = asCommand ? console.log : debug
  const root = config.root || process.cwd()
  // warn presence of web_modules
  if (fs_extra_1.default.existsSync(path_1.default.join(root, 'web_modules'))) {
    console.warn(
      chalk_1.default.yellow(
        `[vite] vite 0.15 has built-in dependency pre-bundling and resolving ` +
          `from web_modules is no longer supported.`
      )
    )
  }
  const cacheDir = path_1.default.join(root, exports.OPTIMIZE_CACHE_DIR)
  const hashPath = path_1.default.join(cacheDir, 'hash')
  const depHash = getDepHash(root, config.__path)
  if (!config.force) {
    let prevhash
    try {
      prevhash = await fs_extra_1.default.readFile(hashPath, 'utf-8')
    } catch (e) {}
    // hash is consistent, no need to re-bundle
    if (prevhash === depHash) {
      log('Hash is consistent. Skipping. Use --force to override.')
      return
    }
  }
  await fs_extra_1.default.remove(cacheDir)
  await fs_extra_1.default.ensureDir(cacheDir)
  const pkg = utils_1.lookupFile(root, [`package.json`])
  if (!pkg) {
    log(`package.json not found. Skipping.`)
    return
  }
  const deps = Object.keys(JSON.parse(pkg).dependencies || {})
  if (!deps.length) {
    await fs_extra_1.default.writeFile(hashPath, depHash)
    log(`No dependencies listed in package.json. Skipping.`)
    return
  }
  const resolver = resolver_1.createResolver(
    root,
    config.resolvers,
    config.alias
  )
  const { include, exclude } = config.optimizeDeps || {}
  // Determine deps to optimize. The goal is to only pre-bundle deps that falls
  // under one of the following categories:
  // 1. Is CommonJS module
  // 2. Has imports to relative files (e.g. lodash-es, lit-html)
  // 3. Has imports to bare modules that are not in the project's own deps
  //    (i.e. esm that imports its own dependencies, e.g. styled-components)
  await es_module_lexer_1.init
  const qualifiedDeps = deps.filter((id) => {
    console.log(id)
    if (include && !include.includes(id)) {
      debug(`skipping ${id} (not included)`)
      return false
    }
    if (exclude && exclude.includes(id)) {
      debug(`skipping ${id} (excluded)`)
      return false
    }
    if (KNOWN_IGNORE_LIST.has(id)) {
      debug(`skipping ${id} (internal excluded)`)
      return false
    }
    const entry = resolver_1.resolveNodeModuleEntry(root, id)
    if (!entry) {
      debug(`skipping ${id} (cannot resolve entry)`)
      return false
    }
    if (!resolver_1.supportedExts.includes(path_1.default.extname(entry))) {
      debug(`skipping ${id} (entry is not js)`)
      return false
    }
    const content = fs_extra_1.default.readFileSync(
      utils_1.resolveFrom(root, entry),
      'utf-8'
    )
    const [imports, exports] = es_module_lexer_1.parse(content)
    if (!exports.length) {
      debug(`optimizing ${id} (no exports, likely commonjs)`)
      // no exports, likely a commonjs module
      return true
    }
    for (const { s, e } of imports) {
      let i = content.slice(s, e).trim()
      i = resolver.alias(i) || i
      if (i.startsWith('.')) {
        debug(`optimizing ${id} (contains relative imports)`)
        return true
      }
      if (!deps.includes(i)) {
        debug(`optimizing ${id} (imports sub dependencies)`)
        return true
      }
    }
    debug(`skipping ${id} (single esm file, doesn't need optimization)`)
  })
  if (!qualifiedDeps.length) {
    await fs_extra_1.default.writeFile(hashPath, depHash)
    log(`No listed dependency requires optimization. Skipping.`)
    return
  }
  if (!asCommand) {
    // This is auto run on server start - let the user know that we are
    // pre-optimizing deps
    console.log(
      chalk_1.default.greenBright(`[vite] Optimizable dependencies detected.`)
    )
  }
  let spinner
  const msg = asCommand
    ? `Pre-bundling dependencies to speed up dev server page load...`
    : `Pre-bundling them to speed up dev server page load...\n` +
      `(this will be run only when your dependencies have changed)`
  if (process.env.DEBUG || process.env.NODE_ENV === 'test') {
    console.log(msg)
  } else {
    spinner = require('ora')(msg + '\n').start()
  }
  try {
    // Non qualified deps are marked as externals, since they will be preserved
    // and resolved from their original node_modules locations.
    const preservedDeps = deps.filter((id) => !qualifiedDeps.includes(id))
    const input = qualifiedDeps.reduce((entries, name) => {
      entries[name] = name
      return entries
    }, {})
    const rollup = require('rollup')
    const bundle = await rollup.rollup({
      input,
      external: preservedDeps,
      treeshake: { moduleSideEffects: 'no-external' },
      onwarn(warning, warn) {
        if (warning.code !== 'CIRCULAR_DEPENDENCY') {
          warn(warning)
        }
      },
      ...config.rollupInputOptions,
      plugins: await build_1.createBaseRollupPlugins(root, resolver, config)
    })
    const { output } = await bundle.generate({
      ...config.rollupOutputOptions,
      format: 'es',
      exports: 'named',
      chunkFileNames: 'common/[name]-[hash].js'
    })
    spinner && spinner.stop()
    const optimized = []
    for (const chunk of output) {
      if (chunk.type === 'chunk') {
        const fileName = chunk.fileName
        const filePath = path_1.default.join(cacheDir, fileName)
        await fs_extra_1.default.ensureDir(path_1.default.dirname(filePath))
        await fs_extra_1.default.writeFile(filePath, chunk.code)
        if (!fileName.startsWith('common/')) {
          optimized.push(fileName.replace(/\.js$/, ''))
        }
      }
    }
    console.log(
      `Optimized modules:\n${optimized
        .map((id) => chalk_1.default.yellowBright(id))
        .join(`, `)}`
    )
    await fs_extra_1.default.writeFile(hashPath, depHash)
  } catch (e) {
    spinner && spinner.stop()
    if (asCommand) {
      throw e
    } else {
      console.error(
        chalk_1.default.red(`[vite] Dep optimization failed with error:`)
      )
      console.error(e)
      console.log()
      console.log(
        chalk_1.default.yellow(
          `Tip: You can configure what deps to include/exclude for optimization\n` +
            `using the \`optimizeDeps\` option in the Vite config file.`
        )
      )
    }
  }
}
exports.optimizeDeps = optimizeDeps
const lockfileFormats = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
let cachedHash
function getDepHash(root, configPath) {
  if (cachedHash) {
    return cachedHash
  }
  let content = utils_1.lookupFile(root, lockfileFormats) || ''
  const pkg = JSON.parse(utils_1.lookupFile(root, [`package.json`]) || '{}')
  content += JSON.stringify(pkg.dependencies)
  // also take config into account
  if (configPath) {
    content += fs_extra_1.default.readFileSync(configPath, 'utf-8')
  }
  return crypto_1.createHash('sha1').update(content).digest('base64')
}
exports.getDepHash = getDepHash
//# sourceMappingURL=depOptimizer.js.map
