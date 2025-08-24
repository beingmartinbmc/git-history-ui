# Git History UI

[![npm version](https://badge.fury.io/js/git-history-ui.svg)](https://badge.fury.io/js/git-history-ui)
[![npm downloads](https://img.shields.io/npm/dm/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![npm license](https://img.shields.io/npm/l/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![Node.js version](https://img.shields.io/node/v/git-history-ui.svg)](https://www.npmjs.com/package/git-history-ui)
[![GitHub stars](https://img.shields.io/github/stars/ankit-sharma/git-history-ui.svg)](https://github.com/ankit-sharma/git-history-ui)
[![GitHub issues](https://img.shields.io/github/issues/ankit-sharma/git-history-ui.svg)](https://github.com/ankit-sharma/git-history-ui/issues)

A beautiful, modern web UI for visualizing git history with interactive commit graphs, search, filtering, and diff visualization. Built with Angular and Node.js.

**Author:** Ankit Sharma (ankit.sharma199803@gmail.com)

## 📋 Requirements

- **Node.js**: 18.0.0 or higher
- **Angular**: 20.2.1
- **Git**: Any version (must be in a git repository)

## ✨ Features

- **🎨 Interactive Commit Graph** - Beautiful D3.js-powered visualizations with branch tracking and merge detection
- **🔍 Advanced Search & Filtering** - Search by author, date range, commit message, or specific files
- **📊 Dual View Modes** - Switch between graph view and list view
- **🎨 Color Palette System** - Choose from 6 light and 6 dark themes
- **🌙 Dark/Light Mode** - Toggle between themes with persistent preferences
- **📱 Responsive Design** - Works on desktop and mobile devices
- **⚡ Real-time Search** - Live filtering and search results
- **🔧 Modern Tech Stack** - Angular 20 frontend with Node.js backend

## 🚀 Quick Start (1 Step!)

### Prerequisites
- **Node.js 18.0.0+** - [Download here](https://nodejs.org/)
- **Git repository** - Must be in a git repository

### Step 1: Run the Application
```bash
# Run directly with npx (no installation needed)
npx git-history-ui
```

That's it! 🎉 The application will automatically:
- Start the backend server on port 3000
- Start the frontend server on port 4200
- Open your browser to `http://localhost:4200`

## 📖 Usage Examples

### Basic Usage
```bash
# Run directly with npx (no installation needed)
npx git-history-ui
```

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

### Advanced Usage
```bash
# Use in specific directory
cd /path/to/your/repo
npx git-history-ui

# Use with environment variables
PORT=8080 npx git-history-ui

# Use with different host
HOST=0.0.0.0 npx git-history-ui
```

## 🎯 Key Features Explained

### 📊 Graph View
- **Interactive Commit Graph**: Click any commit node to view details
- **Branch Visualization**: Different colors for different branches
- **Merge Detection**: Purple nodes indicate merge commits
- **Force-Directed Layout**: Automatic positioning for optimal viewing

### 📋 List View  
- **Organized Commit List**: Clean, readable commit information
- **File Change Summary**: See how many files were changed
- **Author & Date Info**: Quick access to commit metadata
- **Search Integration**: Real-time filtering as you type

### 🔍 Search & Filtering
- **Real-time Search**: Search across commit messages, authors, and hashes
- **Date Range Filter**: Use the date picker to filter by specific dates
- **Author Filter**: Dropdown to filter by specific authors
- **File Filter**: Search for commits that touched specific files

### 🎨 Theme System
- **6 Light Themes**: Default, Ocean, Forest, Sunset, Monochrome, Neon
- **6 Dark Themes**: Matching dark versions of all themes
- **Persistent Preferences**: Your theme choice is saved automatically
- **Dark Mode Toggle**: Quick switch between light and dark modes

## 🛠️ Development Setup

### Prerequisites
- **Node.js 18.0.0+** - [Download here](https://nodejs.org/)
- **Git repository** - Must be in a git repository

### Project Structure
```
git-history-ui/
├── frontend/                    # Angular 20 application
│   ├── src/app/
│   │   ├── components/          # UI components
│   │   │   ├── commit-graph/    # D3.js graph visualization
│   │   │   ├── commit-list/     # List view component
│   │   │   ├── commit-detail/   # Commit details modal
│   │   │   └── color-palette-selector/ # Theme selector
│   │   ├── services/            # Angular services
│   │   └── models/              # TypeScript interfaces
│   └── angular.json             # Angular configuration
├── src/backend/                 # Node.js backend
│   ├── server.ts               # Express server
│   └── gitService.ts           # Git operations
├── package.json                # Dependencies and scripts
└── README.md                   # This file
```

## 🎯 Use Cases & Examples

### Code Review Workflow
```bash
# 1. Start the application
npx git-history-ui

# 2. Open http://localhost:4200

# 3. Use the search bar to find specific commits
# Example: Search for "bug fix" or "feature"

# 4. Filter by date to review recent changes
# Use the date picker to select "Last week"

# 5. Switch to graph view to see branch structure
# Click "Graph View" button

# 6. Click any commit to see detailed changes
# View file diffs and commit information
```

### Release Planning
```bash
# 1. Filter commits since last release
# Use date picker to select release date

# 2. Review all changes in list view
# See commit messages and file changes

# 3. Switch to graph view for branch overview
# Identify feature branches and merges

# 4. Copy commit information for release notes
# Manually copy relevant commit details
```

### Bug Investigation
```bash
# 1. Search for specific file changes
# Use file filter: "src/app.js"

# 2. Filter by author if you know who made changes
# Select author from dropdown

# 3. Use date range to narrow down timeframe
# Select date range around when bug appeared

# 4. Review commit details and diffs
# Click commits to see exact changes made
```

## 🔧 Configuration & Customization

### Environment Variables
```bash
# Custom port for backend (default: 3000)
PORT=8080 npm run dev

# Custom host (default: localhost)
HOST=0.0.0.0 npm run dev
```

### Theme Customization
- **Light Themes**: Default, Ocean, Forest, Sunset, Monochrome, Neon
- **Dark Themes**: Matching dark versions of all themes
- **Auto-save**: Your theme preference is automatically saved
- **System Integration**: Respects system dark mode preference

### Browser Compatibility
- **Chrome/Edge**: Full support with all features
- **Firefox**: Full support with all features  
- **Safari**: Full support with all features
- **Mobile**: Basic responsive design support

## 🚀 Development Setup

### For Contributors
```bash
# Clone the repository
git clone https://github.com/ankit-sharma/git-history-ui.git
cd git-history-ui

# Install dependencies
npm install

# Start development servers
npm run dev

# Build for production
npm run build
```

### Docker Deployment (Planned)
```bash
# Build Docker image
docker build -t git-history-ui .

# Run container
docker run -p 3000:3000 git-history-ui
```

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Setup
```bash
# 1. Fork and clone the repository
git clone https://github.com/ankit-sharma/git-history-ui.git
cd git-history-ui

# 2. Install dependencies
npm install

# 3. Start development servers
npm run dev

# 4. Make your changes
# 5. Test your changes
# 6. Submit a pull request
```

### Areas for Contribution
- **UI/UX Improvements**: Better visualizations, animations, or user experience
- **New Features**: Additional filtering options, blame visualization UI, etc.
- **Performance**: Optimize graph rendering, search performance
- **Documentation**: Improve README, add code comments
- **Testing**: Add unit tests, integration tests

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- **[D3.js](https://d3js.org/)** - Beautiful data visualizations
- **[Angular](https://angular.io/)** - Modern frontend framework
- **[simple-git](https://github.com/steveukx/git-js)** - Git operations
- **[Express](https://expressjs.com/)** - Backend server framework

## 🐛 Issues & Support

- **🐛 Bug Reports**: Please include steps to reproduce and browser information
- **💡 Feature Requests**: Describe the use case and expected behavior
- **❓ Questions**: Open a discussion for general questions

## 📊 Project Status

- ✅ **Core Features**: Complete
- ✅ **Dark Mode**: Complete  
- ✅ **Theme System**: Complete
- ✅ **Search & Filtering**: Complete
- ✅ **Commit Graph Visualization**: Complete
- ✅ **Diff Viewer**: Complete
- 🚧 **Performance Optimization**: In Progress
- 📋 **Export Features**: Planned
- 📋 **Blame Visualization**: Backend ready, UI pending
- 📋 **npm Package**: Ready for publishing

---

Made with ❤️ for developers who love beautiful git visualizations
