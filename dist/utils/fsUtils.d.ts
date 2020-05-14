/// <reference types="node" />
import { Context } from 'koa'
import { Readable } from 'stream'
/**
 * Read a file with in-memory cache.
 * Also sets approrpriate headers and body on the Koa context.
 */
export declare function cachedRead(
  ctx: Context | null,
  file: string
): Promise<string>
/**
 * Read already set body on a Koa context and normalize it into a string.
 * Useful in post-processing middlewares.
 */
export declare function readBody(
  stream: Readable | Buffer | string | null
): Promise<string | null>
export declare function lookupFile(
  dir: string,
  formats: string[]
): string | undefined
