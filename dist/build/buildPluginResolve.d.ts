import { Plugin } from 'rollup'
import { InternalResolver } from '../resolver'
export declare const createBuildResolvePlugin: (
  root: string,
  resolver: InternalResolver
) => Plugin
