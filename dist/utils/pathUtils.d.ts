import { Context } from 'koa'
export declare const resolveFrom: (root: string, id: string) => string
export declare const queryRE: RegExp
export declare const hashRE: RegExp
export declare const cleanUrl: (url: string) => string
export declare const resolveRelativeRequest: (
  importer: string,
  id: string
) => {
  url: string
  pathname: string
  query: string
}
export declare const parseWithQuery: (
  id: string
) => {
  path: string
  query: Record<string, string | string[] | undefined>
}
export declare const isExternalUrl: (url: string) => boolean
/**
 * Check if a file is a static asset that vite can process.
 */
export declare const isStaticAsset: (file: string) => boolean
/**
 * Check if a request is an import from js instead of a native resource request
 * i.e. differentiate
 * `import('/style.css')`
 * from
 * `<link rel="stylesheet" href="/style.css">`
 *
 * The ?import query is injected by serverPluginModuleRewrite.
 */
export declare const isImportRequest: (ctx: Context) => boolean
