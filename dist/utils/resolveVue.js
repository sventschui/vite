'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const resolve_from_1 = __importDefault(require('resolve-from'))
const chalk_1 = __importDefault(require('chalk'))
let resolved = undefined
// Resolve the correct `vue` and `@vue.compiler-sfc` to use.
// If the user project has local installations of these, they should be used;
// otherwise, fallback to the dependency of Vite itself.
function resolveVue(root) {
  if (resolved) {
    return resolved
  }
  let runtimeDomPath
  let compilerPath
  let isLocal = true
  let vueVersion
  try {
    // see if user has local vue installation
    const userVuePkg = resolve_from_1.default(root, 'vue/package.json')
    vueVersion = require(userVuePkg).version
    // as long as vue is present,
    // dom, core and reactivity are guarunteed to coexist
    runtimeDomPath = resolve_from_1.default(
      root,
      '@vue/runtime-dom/dist/runtime-dom.esm-bundler.js'
    )
    // also resolve matching sfc compiler
    try {
      const compilerPkgPath = resolve_from_1.default(
        root,
        '@vue/compiler-sfc/package.json'
      )
      const compilerPkg = require(compilerPkgPath)
      if (compilerPkg.version !== require(userVuePkg).version) {
        throw new Error()
      }
      compilerPath = path_1.default.join(
        path_1.default.dirname(compilerPkgPath),
        compilerPkg.main
      )
    } catch (e) {
      // user has local vue but has no compiler-sfc
      console.error(
        chalk_1.default.red(
          `[vite] Error: a local installation of \`vue\` is detected but ` +
            `no matching \`@vue/compiler-sfc\` is found. Make sure to install ` +
            `both and use the same version.`
        )
      )
      compilerPath = require.resolve('@vue/compiler-sfc')
    }
  } catch (e) {
    // user has no local vue, use vite's dependency version
    isLocal = false
    vueVersion = require('vue/package.json').version
    runtimeDomPath = require.resolve(
      '@vue/runtime-dom/dist/runtime-dom.esm-bundler.js'
    )
    compilerPath = require.resolve('@vue/compiler-sfc')
  }
  resolved = {
    version: vueVersion,
    vue: runtimeDomPath,
    '@vue/runtime-dom': runtimeDomPath,
    '@vue/runtime-core': runtimeDomPath.replace(/runtime-dom/g, 'runtime-core'),
    '@vue/reactivity': runtimeDomPath.replace(/runtime-dom/g, 'reactivity'),
    '@vue/shared': runtimeDomPath.replace(/runtime-dom/g, 'shared'),
    compiler: compilerPath,
    isLocal
  }
  return resolved
}
exports.resolveVue = resolveVue
function resolveCompiler(cwd) {
  return require(resolveVue(cwd).compiler)
}
exports.resolveCompiler = resolveCompiler
