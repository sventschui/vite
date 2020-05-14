/// <reference types="node" />
import { Server } from 'http'
import Koa from 'koa'
import { InternalResolver } from '../resolver'
import { HMRWatcher } from './serverPluginHmr'
import { ServerConfig } from '../config'
export { rewriteImports } from './serverPluginModuleRewrite'
export declare type ServerPlugin = (ctx: ServerPluginContext) => void
export interface ServerPluginContext {
  root: string
  app: Koa
  server: Server
  watcher: HMRWatcher
  resolver: InternalResolver
  config: ServerConfig & {
    __path?: string
  }
}
export declare function createServer(config?: ServerConfig): Server
