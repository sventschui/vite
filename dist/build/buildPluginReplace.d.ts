import { Plugin } from 'rollup'
export declare const createReplacePlugin: (
  replacements: Record<string, string>,
  sourcemap: boolean
) => Plugin
