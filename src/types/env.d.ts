declare var process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};

declare module 'node:fs' {
  export function existsSync(p: string): boolean;
  export function mkdirSync(p: string, options?: { recursive?: boolean }): void;
  export function readFileSync(p: string, encoding: string): string;
  const fsDefault: {
    existsSync: typeof existsSync;
    mkdirSync: typeof mkdirSync;
    readFileSync: typeof readFileSync;
  };
  export default fsDefault;
}

declare module 'node:path' {
  export function dirname(p: string): string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  const pathDefault: {
    dirname: typeof dirname;
    resolve: typeof resolve;
    join: typeof join;
  };
  export default pathDefault;
}

declare module 'node:crypto' {
  export function randomUUID(): string;
  export function randomBytes(size: number): { toString(enc: string): string };
  export function createHash(alg: string): {
    update(data: string): { digest(enc: string): string };
  };
  const cryptoDefault: {
    randomUUID: typeof randomUUID;
    randomBytes: typeof randomBytes;
    createHash: typeof createHash;
  };
  export default cryptoDefault;
}

declare module 'node:sqlite' {
  export interface StatementSync {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare module 'express' {
  export interface CookieOptions {
    httpOnly?: boolean;
    sameSite?: 'lax' | 'strict' | 'none' | boolean;
    secure?: boolean;
    path?: string;
    maxAge?: number;
  }
  export interface Request {
    method: string;
    path: string;
    protocol: string;
    ip?: string;
    body: unknown;
    params: Record<string, string>;
    cookies?: Record<string, unknown>;
    user?: { id: string; name: string; email: string };
    get(header: string): string | undefined;
  }
  export interface Response {
    status(code: number): Response;
    json(body: unknown): Response;
    end(): Response;
    sendFile(filePath: string): void;
    setHeader(name: string, value: string): void;
    cookie(name: string, value: string, options?: CookieOptions): Response;
    clearCookie(name: string, options?: CookieOptions): Response;
  }
  export type NextFunction = (err?: unknown) => void;
  export type RequestHandler = (req: Request, res: Response, next: NextFunction) => unknown;
  export type ErrorRequestHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => unknown;

  export interface Router {
    use(...handlers: unknown[]): Router;
    get(path: string | RegExp, ...handlers: RequestHandler[]): Router;
    post(path: string | RegExp, ...handlers: RequestHandler[]): Router;
    put(path: string | RegExp, ...handlers: RequestHandler[]): Router;
    delete(path: string | RegExp, ...handlers: RequestHandler[]): Router;
  }
  export interface Express extends Router {
    (req: unknown, res: unknown): unknown;
    set(setting: string, val: unknown): void;
    disable(setting: string): void;
    listen(port: number, host: string, cb?: () => void): unknown;
  }
  function express(): Express;
  namespace express {
    function Router(): Router;
    function json(options?: { limit?: string }): RequestHandler;
    function static(root: string): RequestHandler;
  }
  export default express;
}

declare module 'cookie-parser' {
  import type { RequestHandler } from 'express';
  export default function cookieParser(): RequestHandler;
}

declare module 'pg' {
  export interface QueryResult<T = Record<string, any>> {
    rows: T[];
    rowCount: number | null;
  }
  export interface PoolConfig {
    connectionString?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean };
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }
  export class Pool {
    constructor(config?: PoolConfig);
    query<T = Record<string, any>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
    end(): Promise<void>;
  }
}

declare module 'supertest' {
  interface SupertestRequest {
    set(headers: Record<string, string>): SupertestRequest;
    set(name: string, value: string): SupertestRequest;
    send(body: unknown): SupertestRequest;
    then: Promise<{ status: number; body: any; headers: Record<string, any> }>['then'];
  }
  interface SupertestAgent {
    get(url: string): SupertestRequest;
    post(url: string): SupertestRequest;
    put(url: string): SupertestRequest;
    delete(url: string): SupertestRequest;
  }
  function request(app: unknown): SupertestAgent;
  namespace request {
    function agent(app: unknown): SupertestAgent;
  }
  export default request;
}
