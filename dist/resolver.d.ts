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
export declare function createResolver(
  root: string,
  resolvers: Resolver[],
  alias: Record<string, string>
): InternalResolver
