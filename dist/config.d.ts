import { ServerPlugin } from './server'
import { Resolver } from './resolver'
import { Options as RollupPluginVueOptions } from 'rollup-plugin-vue'
import { CompilerOptions } from '@vue/compiler-sfc'
import {
  InputOptions as RollupInputOptions,
  OutputOptions as RollupOutputOptions,
  OutputChunk
} from 'rollup'
import { Transform } from './transform'
export { Resolver, Transform }
/**
 * Options shared between server and build.
 */
export interface SharedConfig {
  /**
   * Project root directory. Can be an absolute path, or a path relative from
   * the location of the config file itself.
   * @default process.cwd()
   */
  root?: string
  /**
   * Import alias. Can only be exact mapping, does not support wildcard syntax.
   */
  alias?: Record<string, string>
  /**
   * Custom file transforms.
   */
  transforms?: Transform[]
  /**
   * Resolvers to map dev server public path requests to/from file system paths,
   * and optionally map module ids to public path requests.
   */
  resolvers?: Resolver[]
  /**
   * Options to pass to @vue/compiler-dom
   */
  vueCompilerOptions?: CompilerOptions
  /**
   * Configure what to use for jsx factory and fragment.
   * @default
   * {
   *   factory: 'React.createElement',
   *   fragment: 'React.Fragment'
   * }
   */
  jsx?:
    | 'vue'
    | 'preact'
    | 'react'
    | {
        factory?: string
        fragment?: string
      }
}
export interface ServerConfig extends SharedConfig {
  /**
   * Whether to use a Service Worker to cache served code. This can greatly
   * improve full page reload performance, but requires a Service Worker
   * update + reload on each server restart.
   *
   * @default false
   */
  serviceWorker?: boolean
  plugins?: ServerPlugin[]
}
export interface BuildConfig extends SharedConfig {
  /**
   * Base public path when served in production.
   * @default '/'
   */
  base?: string
  /**
   * Directory relative from `root` where build output will be placed. If the
   * directory exists, it will be removed before the build.
   * @default 'dist'
   */
  outDir?: string
  /**
   * Directory relative from `outDir` where the built js/css/image assets will
   * be placed.
   * @default 'assets'
   */
  assetsDir?: string
  /**
   * Static asset files smaller than this number (in bytes) will be inlined as
   * base64 strings. Default limit is `4096` (4kb). Set to `0` to disable.
   * @default 4096
   */
  assetsInlineLimit?: number
  /**
   * Whether to generate sourcemap
   * @default false
   */
  sourcemap?: boolean
  /**
   * Set to `false` to dsiable minification, or specify the minifier to use.
   * Available options are 'terser' or 'esbuild'.
   * @default 'terser'
   */
  minify?: boolean | 'terser' | 'esbuild'
  /**
   * Build for server-side rendering
   * @default false
   */
  ssr?: boolean
  /**
   * Will be passed to rollup.rollup()
   * https://rollupjs.org/guide/en/#big-list-of-options
   */
  rollupInputOptions?: RollupInputOptions
  /**
   * Will be passed to bundle.generate()
   * https://rollupjs.org/guide/en/#big-list-of-options
   */
  rollupOutputOptions?: RollupOutputOptions
  /**
   * Will be passed to rollup-plugin-vue
   * https://github.com/vuejs/rollup-plugin-vue/blob/next/src/index.ts
   */
  rollupPluginVueOptions?: Partial<RollupPluginVueOptions>
  /**
   * Whether to log asset info to console
   * @default false
   */
  silent?: boolean
  /**
   * Whether to write bundle to disk
   * @default true
   */
  write?: boolean
  /**
   * Whether to emit index.html
   * @default true
   */
  emitIndex?: boolean
  /**
   * Whether to emit assets other than JavaScript
   * @default true
   */
  emitAssets?: boolean
  /**
   * Predicate function that determines wheter a link rel=modulepreload shall be
   * added to the index.html for the chunk passed in
   */
  shouldPreload?: (chunk: OutputChunk) => boolean
}
export interface UserConfig
  extends BuildConfig,
    Pick<ServerConfig, 'serviceWorker'> {
  plugins?: Plugin[]
  configureServer?: ServerPlugin
}
export interface Plugin
  extends Pick<
    UserConfig,
    | 'alias'
    | 'transforms'
    | 'resolvers'
    | 'configureServer'
    | 'vueCompilerOptions'
    | 'rollupInputOptions'
    | 'rollupOutputOptions'
  > {}
export declare function resolveConfig(
  configPath: string | undefined
): Promise<UserConfig | undefined>
