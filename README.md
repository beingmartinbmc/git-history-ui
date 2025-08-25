# Git History UI

A beautiful, modern web UI for visualizing git history with interactive commit graphs, search, filtering, and diff visualization. Built with Angular and Node.js.

## 🚀 Quick Start

```bash
# Run directly with npx (no installation needed)
npx git-history-ui
```

That's it! The application will start on `http://localhost:3000` and open your browser automatically.

## ✨ Features

- **🎨 Interactive Commit Graph** - D3.js-powered visualizations with branch tracking
- **🔍 Advanced Search & Filtering** - Search by author, date, commit message, or files
- **📊 Dual View Modes** - Switch between graph view and list view
- **🎨 Color Palette System** - 6 light and 6 dark themes
- **🌙 Dark/Light Mode** - Toggle between themes
- **📱 Responsive Design** - Works on desktop and mobile

## 📖 Usage

### CLI Options
```bash
# Custom port
npx git-history-ui --port 8080

# Filter by specific file
npx git-history-ui --file src/app.js

# Filter by author
npx git-history-ui --author "your-name"

# Filter by date range
npx git-history-ui --since 2024-01-01

# Don't auto-open browser
npx git-history-ui --no-open

# Show help
npx git-history-ui --help
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

- **Node.js**: 18.0.0 or higher
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
