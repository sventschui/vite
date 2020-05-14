import { ResolvedConfig } from './config'
export interface DepOptimizationOptions {
  /**
   * Only optimize explicitly listed dependencies.
   */
  include?: string[]
  /**
   * Do not optimize these dependencies.
   */
  exclude?: string[]
  /**
   * Automatically run `vite optimize` on server start?
   * @default true
   */
  auto?: boolean
}
export declare const OPTIMIZE_CACHE_DIR = 'node_modules/.vite_opt_cache'
export declare function optimizeDeps(
  config: ResolvedConfig & {
    force?: boolean
  },
  asCommand?: boolean
): Promise<void>
export declare function getDepHash(
  root: string,
  configPath: string | undefined
): string
