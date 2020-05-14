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
const resolve_from_1 = __importDefault(require('resolve-from'))
const resolver_1 = require('./resolver')
async function optimize(config) {
  // scan lockfile
  const root = config.root || process.cwd()
  const cacheDir = path_1.default.join(root, `node_modules`, `.vite`)
  const hashPath = path_1.default.join(cacheDir, 'hash')
  const depHash = getDepHash(root, config.__path)
  if (!config.force) {
    let prevhash
    try {
      prevhash = await fs_extra_1.default.readFile(hashPath, 'utf-8')
    } catch (e) {}
    // hash is consistent, no need to re-bundle
    if (prevhash === depHash) {
      console.log('hash is consistent. skipping.')
      return
    }
  }
  await fs_extra_1.default.remove(cacheDir)
  await fs_extra_1.default.ensureDir(cacheDir)
  await fs_extra_1.default.writeFile(hashPath, depHash)
  const pkg = lookupFile(root, [`package.json`])
  if (!pkg) {
    console.log(`package.json not found. skipping.`)
    return
  }
  const deps = JSON.parse(pkg).dependencies || {}
  const depKeys = Object.keys(deps)
  if (!depKeys.length) {
    console.log(`no dependencies listed in package.json. skipping.`)
    return
  }
  console.log(`optimizing dependencies...`)
  const entriesToNameMap = new Map()
  depKeys.forEach((id) => {
    // TODO:
    // - check if the package is installed
    // - check if it has module entry
    // - if it has module entry, scan it with es-module-lexer to see if it
    //   imports other files
    // - if it does, bundle it...
    // Problem: users may do deep import from dependencies which are not
    // bundled, e.g. lodash-es/cloneDeep <-- maybe we still need a scan? But
    // the scan would be quite expensive...
    entriesToNameMap.set(resolve_from_1.default(root, id), id)
  })
  const rollup = require('rollup')
  const bundle = await rollup.rollup({
    input: depKeys,
    plugins: [
      require('@rollup/plugin-node-resolve')({
        rootDir: root,
        extensions: resolver_1.supportedExts
      }),
      require('@rollup/plugin-commonjs')({
        sourceMap: false
      })
    ],
    onwarn(warning, warn) {
      if (warning.code !== 'CIRCULAR_DEPENDENCY') {
        warn(warning)
      }
    }
  })
  const { output } = await bundle.generate({
    format: 'es'
  })
  for (const chunk of output) {
    if (chunk.type === 'chunk') {
      const id = entriesToNameMap.get(chunk.facadeModuleId)
      const fileName = id ? id + '.js' : chunk.fileName
      await fs_extra_1.default.writeFile(
        path_1.default.join(cacheDir, fileName),
        chunk.code
      )
    }
  }
}
exports.optimize = optimize
const lockfileFormats = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'package.json'
]
let cachedHash
function getDepHash(root, configPath) {
  if (cachedHash) {
    return cachedHash
  }
  let content = lookupFile(root, lockfileFormats) || ''
  // also take config into account
  if (configPath) {
    content += fs_extra_1.default.readFileSync(configPath, 'utf-8')
  }
  return crypto_1.createHash('sha1').update(content).digest('base64')
}
exports.getDepHash = getDepHash
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
