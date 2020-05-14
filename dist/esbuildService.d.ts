import { TransformOptions } from 'esbuild'
import { SharedConfig } from './config'
export declare const tjsxRE: RegExp
export declare const vueJsxPublicPath = '/vite/jsx'
export declare const vueJsxFilePath: string
export declare function reoslveJsxOptions(
  options?: SharedConfig['jsx']
): Pick<TransformOptions, 'jsxFactory' | 'jsxFragment'> | undefined
export declare const stopService: () => void
export declare const transform: (
  src: string,
  file: string,
  options?: TransformOptions,
  jsxOption?:
    | 'vue'
    | 'preact'
    | 'react'
    | {
        factory?: string | undefined
        fragment?: string | undefined
      }
    | undefined
) => Promise<{
  code: string
  map: string | undefined
}>