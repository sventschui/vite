import sfcCompiler from '@vue/compiler-sfc'
interface ResolvedVuePaths {
  vue: string | undefined
  '@vue/runtime-dom': string | undefined
  '@vue/runtime-core': string | undefined
  '@vue/reactivity': string | undefined
  '@vue/shared': string | undefined
  compiler: string
  version: string
  isLocal: boolean
}
export declare function resolveVue(root: string): ResolvedVuePaths
export declare function resolveCompiler(cwd: string): typeof sfcCompiler
export {}
