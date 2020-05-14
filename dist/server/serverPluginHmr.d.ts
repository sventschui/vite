import { ServerPlugin } from '.'
import { FSWatcher } from 'chokidar'
import MagicString from 'magic-string'
import { InternalResolver } from '../resolver'
import LRUCache from 'lru-cache'
export declare const debugHmr: any
export declare type HMRWatcher = FSWatcher & {
  handleVueReload: (file: string, timestamp?: number, content?: string) => void
  handleJSReload: (file: string, timestamp?: number) => void
  send: (payload: HMRPayload) => void
}
declare type HMRStateMap = Map<string, Set<string>>
export declare const hmrAcceptanceMap: HMRStateMap
export declare const importerMap: HMRStateMap
export declare const importeeMap: HMRStateMap
export declare const hmrDirtyFilesMap: LRUCache<string, Set<string>>
export declare const hmrClientFilePath: string
export declare const hmrClientId = 'vite/hmr'
export declare const hmrClientPublicPath: string
interface HMRPayload {
  type:
    | 'vue-rerender'
    | 'vue-reload'
    | 'vue-style-update'
    | 'js-update'
    | 'style-update'
    | 'style-remove'
    | 'full-reload'
    | 'sw-bust-cache'
    | 'custom'
  timestamp: number
  path?: string
  changeSrcPath?: string
  id?: string
  index?: number
  customData?: any
}
export declare const hmrPlugin: ServerPlugin
export declare function ensureMapEntry(
  map: HMRStateMap,
  key: string
): Set<string>
export declare function rewriteFileWithHMR(
  root: string,
  source: string,
  importer: string,
  resolver: InternalResolver,
  s: MagicString
): void
export {}
