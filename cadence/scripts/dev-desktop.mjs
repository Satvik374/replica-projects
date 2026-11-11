// Starts Vite, waits for it, then launches Electron pointed at the dev server.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '0.0.0.0', port: 5173 } });
await server.listen();
const info = server.httpServer?.address();
const port = typeof info === 'object' && info ? info.port : 5173;
const url = `http://localhost:${port}`;

const electron = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron', '.'],
  { stdio: 'inherit', env: { ...process.env, CADENCE_DEV_URL: url } },
);

electron.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
