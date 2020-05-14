import { Plugin } from 'rollup'
import { Transform } from '../config'
export declare const createBuildCssPlugin: (
  root: string,
  publicBase: string,
  assetsDir: string,
  cssFileName: string,
  minify: boolean,
  inlineLimit: number,
  transforms: Transform[]
) => Plugin
