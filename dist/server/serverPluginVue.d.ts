/// <reference types="node" />
import { ServerPlugin } from '.'
import { SFCDescriptor, SFCStyleCompileResults } from '@vue/compiler-sfc'
import LRUCache from 'lru-cache'
export declare const srcImportMap: Map<any, any>
interface CacheEntry {
  descriptor?: SFCDescriptor
  template?: string
  script?: string
  styles: SFCStyleCompileResults[]
}
export declare const vueCache: LRUCache<string, CacheEntry>
export declare const vuePlugin: ServerPlugin
export declare function parseSFC(
  root: string,
  filename: string,
  content?: string | Buffer
): Promise<SFCDescriptor | undefined>
export {}
