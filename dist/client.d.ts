export declare function updateStyle(id: string, url: string): void
export declare const hot: {
  accept(
    id: string,
    deps: string | string[],
    callback?: (modules: object | object[]) => void
  ): void
  dispose(id: string, cb: () => void): void
  on(event: string, cb: () => void): void
}
