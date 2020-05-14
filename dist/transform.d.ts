import { ServerPlugin } from './server'
import { Plugin as RollupPlugin } from 'rollup'
export interface Transform {
  /**
   * @default 'js'
   */
  as?: 'js' | 'css'
  test: (
    path: string,
    query: Record<string, string | string[] | undefined>
  ) => boolean
  transform: (code: string, isImport: boolean) => string | Promise<string>
}
export declare function normalizeTransforms(transforms: Transform[]): void
export declare function createServerTransformPlugin(
  transforms: Transform[]
): ServerPlugin
export declare function createBuildJsTransformPlugin(
  transforms: Transform[]
): RollupPlugin
