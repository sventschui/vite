import { ServerPlugin } from '.'
export declare const idToFileMap: Map<any, any>
export declare const fileToRequestMap: Map<any, any>
export declare const moduleRE: RegExp
export declare const moduleResolvePlugin: ServerPlugin
export declare function resolveWebModule(
  root: string,
  id: string
): string | undefined
export declare function resolveNodeModuleEntry(
  root: string,
  id: string
): string | undefined
