'use strict'
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod }
  }
Object.defineProperty(exports, '__esModule', { value: true })
const path_1 = __importDefault(require('path'))
const fs_extra_1 = __importDefault(require('fs-extra'))
const pathUtils_1 = require('../utils/pathUtils')
const buildPluginAsset_1 = require('./buildPluginAsset')
const compiler_dom_1 = require('@vue/compiler-dom')
const magic_string_1 = __importDefault(require('magic-string'))
exports.createBuildHtmlPlugin = async (
  root,
  indexPath,
  publicBasePath,
  assetsDir,
  inlineLimit,
  resolver,
  shouldPreload
) => {
  if (!indexPath || !fs_extra_1.default.existsSync(indexPath)) {
    return {
      renderIndex: (...args) => '',
      htmlPlugin: null
    }
  }
  const rawHtml = await fs_extra_1.default.readFile(indexPath, 'utf-8')
  let { html: processedHtml, js } = await compileHtml(
    root,
    rawHtml,
    publicBasePath,
    assetsDir,
    inlineLimit,
    resolver
  )
  const htmlPlugin = {
    name: 'vite:html',
    async load(id) {
      if (id === indexPath) {
        return js
      }
    }
  }
  const injectCSS = (html, filename) => {
    const tag = `<link rel="stylesheet" href="${publicBasePath}${path_1.default.posix.join(
      assetsDir,
      filename
    )}">`
    if (/<\/head>/.test(html)) {
      return html.replace(/<\/head>/, `${tag}\n</head>`)
    } else {
      return tag + '\n' + html
    }
  }
  const injectScript = (html, filename) => {
    filename = pathUtils_1.isExternalUrl(filename)
      ? filename
      : `${publicBasePath}${path_1.default.posix.join(assetsDir, filename)}`
    const tag = `<script type="module" src="${filename}"></script>`
    if (/<\/body>/.test(html)) {
      return html.replace(/<\/body>/, `${tag}\n</body>`)
    } else {
      return html + '\n' + tag
    }
  }
  const injectPreload = (html, filename) => {
    filename = pathUtils_1.isExternalUrl(filename)
      ? filename
      : `${publicBasePath}${path_1.default.posix.join(assetsDir, filename)}`
    const tag = `<link rel="modulepreload" href="${filename}" />`
    if (/<\/head>/.test(html)) {
      return html.replace(/<\/head>/, `${tag}\n</head>`)
    } else {
      return tag + '\n' + html
    }
  }
  const renderIndex = (bundleOutput, cssFileName) => {
    // inject css link
    processedHtml = injectCSS(processedHtml, cssFileName)
    // inject js entry chunks
    for (const chunk of bundleOutput) {
      if (chunk.type === 'chunk') {
        if (chunk.isEntry) {
          processedHtml = injectScript(processedHtml, chunk.fileName)
        } else if (shouldPreload && shouldPreload(chunk)) {
          processedHtml = injectPreload(processedHtml, chunk.fileName)
        }
      }
    }
    return processedHtml
  }
  return {
    renderIndex,
    htmlPlugin
  }
}
// this extends the config in @vue/compiler-sfc with <link href>
const assetAttrsConfig = {
  link: ['href'],
  video: ['src', 'poster'],
  source: ['src'],
  img: ['src'],
  image: ['xlink:href', 'href'],
  use: ['xlink:href', 'href']
}
// compile index.html to a JS module, importing referenced assets
// and scripts
const compileHtml = async (
  root,
  html,
  publicBasePath,
  assetsDir,
  inlineLimit,
  resolver
) => {
  // @vue/compiler-core doesn't like lowercase doctypes
  html = html.replace(/<!doctype\s/i, '<!DOCTYPE ')
  const ast = compiler_dom_1.parse(html)
  let js = ''
  const s = new magic_string_1.default(html)
  const assetUrls = []
  const viteHtmlTrasnfrom = (node) => {
    if (node.type === 1 /* ELEMENT */) {
      if (node.tag === 'script') {
        let shouldRemove = true
        const srcAttr = node.props.find(
          (p) => p.type === 6 /* ATTRIBUTE */ && p.name === 'src'
        )
        if (srcAttr && srcAttr.value) {
          if (!pathUtils_1.isExternalUrl(srcAttr.value.content)) {
            // <script type="module" src="..."/>
            // add it as an import
            js += `\nimport ${JSON.stringify(srcAttr.value.content)}`
          } else {
            shouldRemove = false
          }
        } else if (node.children.length) {
          // <script type="module">...</script>
          // add its content
          // TODO: if there are multiple inline module scripts on the page,
          // they should technically be turned into separate modules, but
          // it's hard to imagine any reason for anyone to do that.
          js += `\n` + node.children[0].content.trim() + `\n`
        }
        if (shouldRemove) {
          // remove the script tag from the html. we are going to inject new
          // ones in the end.
          s.remove(node.loc.start.offset, node.loc.end.offset)
        }
      }
      // For asset references in index.html, also generate an import
      // statement for each - this will be handled by the asset plugin
      const assetAttrs = assetAttrsConfig[node.tag]
      if (assetAttrs) {
        for (const p of node.props) {
          if (
            p.type === 6 /* ATTRIBUTE */ &&
            p.value &&
            assetAttrs.includes(p.name) &&
            !pathUtils_1.isExternalUrl(p.value.content)
          ) {
            const url = pathUtils_1.cleanUrl(p.value.content)
            js += `\nimport ${JSON.stringify(url)}`
            if (pathUtils_1.isStaticAsset(url)) {
              assetUrls.push(p)
            }
          }
        }
      }
    }
  }
  compiler_dom_1.transform(ast, {
    nodeTransforms: [viteHtmlTrasnfrom]
  })
  // for each encountered asset url, rewrite original html so that it
  // references the post-build location.
  for (const attr of assetUrls) {
    const value = attr.value
    const { url } = await buildPluginAsset_1.resolveAsset(
      resolver.requestToFile(value.content),
      root,
      publicBasePath,
      assetsDir,
      inlineLimit
    )
    s.overwrite(value.loc.start.offset, value.loc.end.offset, url)
  }
  return {
    html: s.toString(),
    js
  }
}
