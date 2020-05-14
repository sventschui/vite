'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const pathUtils_1 = require('./pathUtils')
const chalk_1 = __importDefault(require('chalk'))
const fsUtils_1 = require('./fsUtils')
let resolved = undefined
// Resolve the correct `vue` and `@vue.compiler-sfc` to use.
// If the user project has local installations of these, they should be used;
// otherwise, fallback to the dependency of Vite itself.
function resolveVue(root) {
  if (resolved) {
    return resolved
  }
  let vueVersion
  let vuePath
  let compilerPath
  const projectPkg = JSON.parse(
    fsUtils_1.lookupFile(root, ['package.json']) || `{}`
  )
  const isLocal = !!(projectPkg.dependencies && projectPkg.dependencies.vue)
  if (isLocal) {
    // user has local vue, verify that the same version of @vue/compiler-sfc
    // is also installed.
    // vuePath will be undefined in this case since vue itself will be
    // optimized by the deps optimizer and we can just let the resolver locate
    // it.
    try {
      const userVuePkg = pathUtils_1.resolveFrom(root, 'vue/package.json')
      vueVersion = require(userVuePkg).version
      const compilerPkgPath = pathUtils_1.resolveFrom(
        root,
        '@vue/compiler-sfc/package.json'
      )
      const compilerPkg = require(compilerPkgPath)
      if (compilerPkg.version !== vueVersion) {
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
  } else {
    // user has no local vue, use vite's dependency version
    vueVersion = require('vue/package.json').version
    vuePath = require.resolve(
      '@vue/runtime-dom/dist/runtime-dom.esm-bundler.js'
    )
    compilerPath = require.resolve('@vue/compiler-sfc')
  }
  const inferPath = (name) => vuePath && vuePath.replace(/runtime-dom/g, name)
  resolved = {
    version: vueVersion,
    vue: vuePath,
    '@vue/runtime-dom': vuePath,
    '@vue/runtime-core': inferPath('runtime-core'),
    '@vue/reactivity': inferPath('reactivity'),
    '@vue/shared': inferPath('shared'),
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
//# sourceMappingURL=resolveVue.js.map
