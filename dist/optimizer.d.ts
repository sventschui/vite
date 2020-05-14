import { ResolvedConfig } from './config'
export interface OptimizeOptions extends ResolvedConfig {
  force?: boolean
}
export declare function optimize(config: OptimizeOptions): Promise<void>
export declare function getDepHash(
  root: string,
  configPath: string | undefined
): string
