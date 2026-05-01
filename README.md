# Git History UI

[![npm version](https://badge.fury.io/js/git-history-ui.svg)](https://badge.fury.io/js/git-history-ui)
[![npm downloads](https://img.shields.io/npm/dm/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![npm license](https://img.shields.io/npm/l/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![npm bundle size](https://img.shields.io/bundlephobia/min/git-history-ui.svg)](https://bundlephobia.com/result?p=git-history-ui)
[![GitHub stars](https://img.shields.io/github/stars/beingmartinbmc/git-history-ui.svg)](https://github.com/beingmartinbmc/git-history-ui)
[![GitHub issues](https://img.shields.io/github/issues/beingmartinbmc/git-history-ui.svg)](https://github.com/beingmartinbmc/git-history-ui/issues)

A beautiful, modern web UI for visualizing git history with interactive commit graphs, search, filtering, and diff visualization. Built with Angular and Node.js.

## 🚀 Quick Start

```bash
# Run directly with npx (no installation needed)
npx git-history-ui@latest
```

That's it! The application will start on `http://localhost:3000` and open your browser automatically.

## ✨ Features

- **🎨 Interactive Commit Graph** - Theme-aware canvas swim-lanes with lane guides, branch/tag pills, hover states, and selection emphasis
- **🔍 Advanced Search & Filtering** - Search by author, date, commit message, or files
- **📊 Dual View Modes** - Switch between graph view and list view
- **🌙 Dark/Light/System Mode** - Toggle manually or follow your OS preference
- **📱 Responsive Design** - Works on desktop and mobile

## 📖 Usage

### CLI Options
```bash
# Custom port
npx git-history-ui@latest --port 8080

# Filter by specific file
npx git-history-ui@latest --file src/app.js

# Filter by author
npx git-history-ui@latest --author "your-name"

# Filter by date range
npx git-history-ui@latest --since 2024-01-01

# Don't auto-open browser
npx git-history-ui@latest --no-open

# Show help
npx git-history-ui@latest --help
```

## 🏭 Production

### Build for Production
```bash
# Build both backend and frontend
npm run build:production

# Start production server
npm run start:production
```

### Docker
```bash
# Build and run with Docker
docker build -t git-history-ui .
docker run -p 3000:3000 git-history-ui
```

## 🛠️ Development

### Setup
```bash
# Clone and install
git clone https://github.com/ankit-sharma/git-history-ui.git
cd git-history-ui
npm install

# Start development servers
npm run dev
```

### Testing
```bash
# Run backend tests
npm test

# Run frontend tests
cd frontend && npm test
```

## 📋 Requirements

- **Node.js**: 20.19.0 or higher, or 22.12.0 or higher
- **Git**: Any version (must be in a git repository)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

Made with ❤️ for developers who love beautiful git visualizations
