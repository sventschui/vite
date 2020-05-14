import { Plugin } from 'rollup'
export declare const createEsbuildPlugin: (
  minify: boolean,
  jsx:
    | 'vue'
    | 'preact'
    | 'react'
    | {
        factory?: string | undefined
        fragment?: string | undefined
      }
    | undefined
) => Promise<Plugin>