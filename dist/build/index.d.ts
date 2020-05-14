import { RollupOutput } from 'rollup'
import { BuildConfig } from '../config'
export interface BuildResult {
  html: string
  assets: RollupOutput['output']
}
/**
 * Bundles the app for production.
 * Returns a Promise containing the build result.
 */
export declare function build(options?: BuildConfig): Promise<BuildResult>
/**
 * Bundles the app in SSR mode.
 * - All Vue dependencies are automatically externalized
 * - Imports to dependencies are compiled into require() calls
 * - Templates are compiled with SSR specific optimizations.
 */
export declare function ssrBuild(options?: BuildConfig): Promise<BuildResult>
