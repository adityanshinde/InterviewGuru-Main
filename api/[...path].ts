import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Application } from 'express';
import { createRequire } from 'node:module';

// Vercel emits ESM here; `server.ts` is not a loadable module at runtime. Load the tsup output from `npm run build`.
const require = createRequire(import.meta.url);
const { serverBootstrap } = require('../backend/api/server.cjs') as {
  serverBootstrap: Promise<Application | number>;
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const resolved = await serverBootstrap;

  if (typeof resolved === 'number') {
    res.status(500).json({ error: 'Server bootstrap returned a port instead of an app' });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    res.on('finish', () => resolve());
    res.on('close', () => resolve());

    try {
      resolved(req as any, res as any);
    } catch (error) {
      reject(error);
    }
  });
}
