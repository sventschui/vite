import postcssrc from 'postcss-load-config'
declare type Result = ReturnType<typeof postcssrc> extends Promise<infer T>
  ? T
  : never
export declare function loadPostcssConfig(root: string): Promise<Result | null>
export {}
