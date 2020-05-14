export declare function genSourceMapString(
  map: object | string | undefined
): string
export declare function asyncReplace(
  input: string,
  re: RegExp,
  replacer: (match: RegExpExecArray) => string | Promise<string>
): Promise<string>
