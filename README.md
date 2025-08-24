# Git History UI

A beautiful, lightweight CLI tool that spins up a local web UI for visualizing git history with commit graphs, search, and diff visualization.

## ✨ Features

- **Commit Graph Visualization** - Beautiful D3.js-powered commit graphs showing branches and merges
- **Search & Filter** - Search by author, date, commit message, or files touched
- **Diff Viewer** - In-browser diff visualization with syntax highlighting
- **Blame Visualization** - See who changed what and when
- **Tag & Release Timelines** - Visualize releases and tags
- **Dark Mode** - Beautiful dark theme for better viewing experience
- **Real-time Updates** - Live updates via WebSocket
- **Lightweight** - Works via npx, no installation required
- **Angular 20 Frontend** - Latest stable Angular with modern, component-based UI and TypeScript

## 🚀 Quick Start

```bash
# Start UI for current repository
npx git-history-ui

# Show history only for a specific file
npx git-history-ui --file src/app.js

# Show commits since last tag
npx git-history-ui --since v2.0.0

# Filter by author
npx git-history-ui --author "beingmartinbmc"

# Custom port
npx git-history-ui --port 8080

# Don't auto-open browser
npx git-history-ui --no-open
```

## 🛠️ Development

### Prerequisites

- Node.js 16+
- Git repository

### Setup

```bash
# Clone the repository
git clone https://github.com/beingmartinbmc/git-history-ui.git
cd git-history-ui

# Install dependencies
npm install

# Build the project
npm run build

# Start development server
npm run dev
```

### Project Structure

```
git-history-ui/
├── src/
│   ├── cli.ts              # CLI entry point
│   └── backend/
│       ├── server.ts       # Express server
│       └── gitService.ts   # Git operations
├── frontend/               # Angular 20 application
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/ # Angular components
│   │   │   ├── services/   # Angular services
│   │   │   └── models/     # TypeScript interfaces
│   │   └── styles.css      # Custom CSS
│   └── angular.json        # Angular configuration
├── dist/                   # Compiled output
└── package.json
```

## 🎨 UI Features

### Graph View
- Interactive commit graph with D3.js
- Branch visualization
- Merge commit highlighting
- Click to view commit details

### List View
- Clean, organized commit list
- File change summaries
- Author and date information
- Quick access to diffs

### Search & Filters
- Real-time search across commit messages
- Filter by author
- Filter by date range
- Filter by specific files

### Commit Details
- Full commit information
- File change list
- Diff visualization
- Blame information

## 🔧 Configuration

The tool automatically detects your git repository and provides sensible defaults. You can customize:

- **Port**: Default 3000, customizable via `--port`
- **Host**: Default localhost, customizable via `--host`
- **Auto-open**: Automatically opens browser, disable with `--no-open`

## 🎯 Use Cases

- **Code Reviews**: Quickly browse through recent changes
- **Release Planning**: Visualize changes since last release
- **Bug Investigation**: Find when and who introduced changes
- **Documentation**: Generate beautiful commit history reports
- **Team Collaboration**: Share commit history with team members

## 🚀 Deployment

### Local Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Docker (Coming Soon)
```bash
docker run -p 3000:3000 git-history-ui
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- [D3.js](https://d3js.org/) for beautiful visualizations
- [Angular](https://angular.io/) for the modern frontend framework
- [simple-git](https://github.com/steveukx/git-js) for git operations
- [Socket.IO](https://socket.io/) for real-time updates

## 🐛 Issues & Support

Found a bug? Have a feature request? Please open an issue on GitHub!

---

Made with ❤️ for developers who love beautiful git visualizations
