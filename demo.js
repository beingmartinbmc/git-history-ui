#!/usr/bin/env node

// Simple demo script to test the git-history-ui functionality
const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Git History UI Demo');
console.log('=====================');

// Check if we're in a git repository
try {
  execSync('git status', { stdio: 'pipe' });
  console.log('✅ Git repository detected');
} catch (error) {
  console.log('❌ Not in a git repository');
  console.log('Please run this script from a git repository');
  process.exit(1);
}

// Test the CLI
console.log('\n📋 Testing CLI...');
try {
  const result = execSync('node dist/cli.js --help', { encoding: 'utf8' });
  console.log('✅ CLI help command works');
  console.log(result);
} catch (error) {
  console.log('❌ CLI help command failed');
  console.log(error.message);
}

// Test the server
console.log('\n🌐 Testing server...');
try {
  const server = require('./dist/backend/server');
  console.log('✅ Server module loads successfully');
} catch (error) {
  console.log('❌ Server module failed to load');
  console.log(error.message);
}

console.log('\n🎉 Demo completed!');
console.log('\nTo start the server, run:');
console.log('  npm start');
console.log('\nOr use the CLI:');
console.log('  node dist/cli.js');
