import { startServer } from './server';

async function main() {
  try {
    console.log('🚀 Starting Git History UI Development Server...');
    await startServer(3000, 'localhost');
    console.log('✅ Development server running at http://localhost:3000');
  } catch (error) {
    console.error('❌ Error starting development server:', error);
    process.exit(1);
  }
}

main();
