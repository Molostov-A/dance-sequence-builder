import { createApp } from './app.mjs';
import { readConfig } from './config.mjs';

const config = readConfig();
const { server } = await createApp(config);
server.listen(config.port, config.host, () => console.log(`Dance server listening on port ${config.port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
