#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import { startServer } from './backend/server';

const program = new Command();

program
  .name('git-history-ui')
  .description('Beautiful git history visualization in your browser')
  .version('1.0.0');

program
  .option('-p, --port <number>', 'port to run server on', '3000')
  .option('-f, --file <path>', 'show history only for a specific file')
  .option('-s, --since <ref>', 'show commits since a specific reference (e.g., v2.0.0)')
  .option('-a, --author <name>', 'filter commits by author')
  .option('--no-open', 'do not automatically open browser')
  .option('--host <host>', 'host to bind to', 'localhost');

program.parse();

const options = program.opts();

async function main() {
  try {
    console.log(chalk.blue('🚀 Starting Git History UI...'));
    
    const port = parseInt(options.port);
    const serverUrl = `http://${options.host}:${port}`;
    
    // Start the server
    await startServer(port, options.host);
    
    console.log(chalk.green(`✅ Server running at ${serverUrl}`));
    
    if (options.open !== false) {
      console.log(chalk.yellow('🌐 Opening browser...'));
      await open(serverUrl);
    }
    
    console.log(chalk.cyan('\n📝 Usage:'));
    console.log(chalk.white('  • Use the search bar to filter commits'));
    console.log(chalk.white('  • Click on commits to view diffs'));
    console.log(chalk.white('  • Use the graph view to see branch structure'));
    console.log(chalk.white('  • Press Ctrl+C to stop the server'));
    
  } catch (error) {
    console.error(chalk.red('❌ Error starting server:'), error);
    process.exit(1);
  }
}

main();
