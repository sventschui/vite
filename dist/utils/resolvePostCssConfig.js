'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
let cachedPostcssConfig
async function loadPostcssConfig(root) {
  if (cachedPostcssConfig !== undefined) {
    return cachedPostcssConfig
  }
  try {
    const load = require('postcss-load-config')
    return (cachedPostcssConfig = await load({}, root))
  } catch (e) {
    return (cachedPostcssConfig = null)
  }
}
exports.loadPostcssConfig = loadPostcssConfig
