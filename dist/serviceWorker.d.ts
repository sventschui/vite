declare const __ENABLED__ = true
declare const __PROJECT_ROOT__ = '/'
declare const __SERVER_ID__ = 1
declare const __LOCKFILE_HASH__ = 'a'
declare const USER_CACHE_NAME: string
declare const DEPS_CACHE_NAME: string
declare const sw: ServiceWorkerGlobalScope
declare const depsRE: RegExp
declare const hmrClientPath = '/vite/hmr'
declare const hmrRequestRE: RegExp
declare function tryCache(req: Request, cacheName: string): Promise<Response>