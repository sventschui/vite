export interface Resolver {
  requestToFile(publicPath: string, root: string): string | undefined
  fileToRequest(filePath: string, root: string): string | undefined
  alias?(id: string): string | undefined
}
export interface InternalResolver {
  requestToFile(publicPath: string): string
  fileToRequest(filePath: string): string
  alias(id: string): string | undefined
}
export declare const supportedExts: string[]
export declare const resolveExt: (id: string) => string
export declare function createResolver(
  root: string,
  resolvers?: Resolver[],
  alias?: Record<string, string>
): InternalResolver
export declare function resolveBareModule(
  root: string,
  id: string,
  importer: string
): any
export declare function resolveOptimizedModule(
  root: string,
  id: string
): string | undefined
export declare function resolveNodeModuleEntry(root: string, id: string): any
export declare function resolveNodeModule(
  root: string,
  id: string
): string | undefined
