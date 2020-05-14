'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const chalk_1 = __importDefault(require('chalk'))
let cachedPostcssConfig
async function loadPostcssConfig(root) {
  if (cachedPostcssConfig !== undefined) {
    return cachedPostcssConfig
  }
  try {
    const load = require('postcss-load-config')
    return (cachedPostcssConfig = await load({}, root))
  } catch (e) {
    if (!/No PostCSS Config found/.test(e.message)) {
      console.error(chalk_1.default.red(`[vite] Error loading postcss config:`))
      console.error(e)
    }
    return (cachedPostcssConfig = null)
  }
}
exports.loadPostcssConfig = loadPostcssConfig
//# sourceMappingURL=resolvePostCssConfig.js.map
