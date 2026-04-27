import { startServer } from './server';

async function main() {
  try {
    const { url, close } = await startServer(3000, 'localhost');
    // eslint-disable-next-line no-console
    console.log(`git-history-ui dev server running at ${url}`);
    const shutdown = () => close().then(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start dev server:', error);
    process.exit(1);
  }
}

main();
