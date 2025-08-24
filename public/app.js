class GitHistoryUI {
    constructor() {
        this.commits = [];
        this.currentView = 'list';
        this.darkMode = false;
        this.socket = io();
        
        this.initializeEventListeners();
        this.loadCommits();
        this.setupSocket();
        this.initializeDarkMode();
    }

    initializeEventListeners() {
        // View toggles
        document.getElementById('graphView').addEventListener('click', () => this.switchView('graph'));
        document.getElementById('listView').addEventListener('click', () => this.switchView('list'));
        
        // Dark mode toggle
        document.getElementById('darkMode').addEventListener('click', () => this.toggleDarkMode());
        
        // Search and filters
        document.getElementById('search').addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.getElementById('authorFilter').addEventListener('change', (e) => this.handleAuthorFilter(e.target.value));
        document.getElementById('sinceFilter').addEventListener('change', (e) => this.handleSinceFilter(e.target.value));
        document.getElementById('fileFilter').addEventListener('input', (e) => this.handleFileFilter(e.target.value));
        
        // Modal
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        
        // Close modal on outside click
        document.getElementById('commitModal').addEventListener('click', (e) => {
            if (e.target.id === 'commitModal') {
                this.closeModal();
            }
        });
    }

    setupSocket() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
    }

    async loadCommits() {
        try {
            const response = await fetch('/api/commits');
            this.commits = await response.json();
            this.renderCommits();
            this.populateFilters();
            this.hideLoading();
        } catch (error) {
            console.error('Error loading commits:', error);
            this.showError('Failed to load commits');
        }
    }

    async loadCommitsWithFilters(filters = {}) {
        try {
            const params = new URLSearchParams(filters);
            const response = await fetch(`/api/commits?${params}`);
            this.commits = await response.json();
            this.renderCommits();
        } catch (error) {
            console.error('Error loading commits with filters:', error);
        }
    }

    renderCommits() {
        if (this.currentView === 'graph') {
            this.renderGraphView();
        } else {
            this.renderListView();
        }
    }

    renderListView() {
        const container = document.getElementById('commitsList');
        container.innerHTML = '';

        this.commits.forEach(commit => {
            const commitElement = this.createCommitElement(commit);
            container.appendChild(commitElement);
        });
    }

    createCommitElement(commit) {
        const div = document.createElement('div');
        div.className = 'bg-white dark:bg-gray-800 rounded-lg shadow p-4 hover:shadow-md transition-all duration-200 cursor-pointer';
        div.innerHTML = `
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center space-x-2 mb-2">
                        <span class="text-sm font-mono text-gray-500 dark:text-gray-400 transition-colors duration-200">${commit.hash.substring(0, 8)}</span>
                        <span class="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-200">${commit.author}</span>
                        <span class="text-sm text-gray-500 dark:text-gray-500 transition-colors duration-200">${this.formatDate(commit.date)}</span>
                    </div>
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2 transition-colors duration-200">${commit.message}</h3>
                    <div class="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 transition-colors duration-200">
                        <span>${commit.files.length} files changed</span>
                        ${commit.branches.length > 0 ? `<span>Branch: ${commit.branches[0]}</span>` : ''}
                        ${commit.tags.length > 0 ? `<span>Tag: ${commit.tags[0]}</span>` : ''}
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200" onclick="app.showCommitDetails('${commit.hash}')">
                        View
                    </button>
                </div>
            </div>
        `;
        return div;
    }

    renderGraphView() {
        const svg = d3.select('#commitGraph');
        svg.selectAll('*').remove();

        const width = svg.node().getBoundingClientRect().width;
        const height = 600;
        const margin = { top: 20, right: 20, bottom: 20, left: 20 };

        // Get colors based on dark mode
        const colors = this.getGraphColors();

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Create commit nodes
        const nodes = this.commits.map((commit, i) => ({
            id: commit.hash,
            x: (i % 10) * 80 + 40,
            y: Math.floor(i / 10) * 100 + 50,
            commit: commit
        }));

        // Create links between commits
        const links = [];
        for (let i = 1; i < nodes.length; i++) {
            links.push({
                source: nodes[i - 1],
                target: nodes[i]
            });
        }

        // Draw links
        g.selectAll('.link')
            .data(links)
            .enter().append('line')
            .attr('class', 'link')
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y)
            .attr('stroke', colors.link)
            .attr('stroke-width', 2);

        // Draw nodes
        const node = g.selectAll('.commit-node')
            .data(nodes)
            .enter().append('g')
            .attr('class', 'commit-node')
            .attr('transform', d => `translate(${d.x},${d.y})`);

        node.append('circle')
            .attr('r', 8)
            .attr('fill', colors.nodeFill)
            .attr('stroke', colors.nodeStroke)
            .attr('stroke-width', 2);

        node.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', 25)
            .attr('fill', colors.text)
            .attr('class', 'text-xs')
            .text(d => d.commit.hash.substring(0, 6));

        // Add click handlers
        node.on('click', (event, d) => {
            this.showCommitDetails(d.commit.hash);
        });
    }

    async showCommitDetails(hash) {
        try {
            const [commit, diff] = await Promise.all([
                fetch(`/api/commit/${hash}`).then(r => r.json()),
                fetch(`/api/diff/${hash}`).then(r => r.json())
            ]);

            const modal = document.getElementById('commitModal');
            const details = document.getElementById('commitDetails');

            details.innerHTML = `
                <div class="space-y-4">
                    <div class="border-b border-gray-200 dark:border-gray-700 pb-4">
                        <div class="flex items-center space-x-2 mb-2">
                            <span class="text-sm font-mono text-gray-500 dark:text-gray-400 transition-colors duration-200">${commit.hash}</span>
                            <span class="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-200">by ${commit.author}</span>
                            <span class="text-sm text-gray-500 dark:text-gray-500 transition-colors duration-200">${this.formatDate(commit.date)}</span>
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-200">${commit.message}</h3>
                    </div>
                    
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                            <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-3 transition-colors duration-200">Files Changed</h4>
                            <div class="space-y-2">
                                ${commit.files.map(file => `
                                    <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded transition-colors duration-200">
                                        <span class="text-sm text-gray-700 dark:text-gray-300 transition-colors duration-200">${file}</span>
                                        <button class="text-blue-500 hover:text-blue-600 text-sm transition-colors duration-200" onclick="app.showFileDiff('${file}')">
                                            View Diff
                                        </button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div>
                            <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-3 transition-colors duration-200">Diff Summary</h4>
                            <div class="space-y-2">
                                ${diff.map(file => `
                                    <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded transition-colors duration-200">
                                        <div class="text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-200">${file.file}</div>
                                        <div class="text-xs text-gray-500 dark:text-gray-500 transition-colors duration-200">
                                            +${file.additions} -${file.deletions}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading commit details:', error);
            this.showError('Failed to load commit details');
        }
    }

    closeModal() {
        document.getElementById('commitModal').classList.add('hidden');
    }

    switchView(view) {
        this.currentView = view;
        
        // Update button styles with transition classes
        document.getElementById('graphView').className = view === 'graph' 
            ? 'px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200'
            : 'px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200';
        
        document.getElementById('listView').className = view === 'list'
            ? 'px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200'
            : 'px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200';
        
        // Show/hide views
        document.getElementById('graphView').classList.toggle('hidden', view !== 'graph');
        document.getElementById('listView').classList.toggle('hidden', view !== 'list');
        
        this.renderCommits();
    }

    toggleDarkMode() {
        this.darkMode = !this.darkMode;
        document.documentElement.classList.toggle('dark', this.darkMode);
        document.body.classList.toggle('dark', this.darkMode);
        
        // Save preference to localStorage
        localStorage.setItem('darkMode', this.darkMode.toString());
        
        const button = document.getElementById('darkMode');
        button.textContent = this.darkMode ? '☀️' : '🌙';
        
        // Force re-render to ensure all elements get updated dark mode styles
        this.renderCommits();
        
        // If currently in graph view, re-render the graph with new colors
        if (this.currentView === 'graph') {
            this.renderGraphView();
        }
    }

    handleSearch(query) {
        const filtered = this.commits.filter(commit => 
            commit.message.toLowerCase().includes(query.toLowerCase()) ||
            commit.author.toLowerCase().includes(query.toLowerCase()) ||
            commit.hash.toLowerCase().includes(query.toLowerCase())
        );
        this.renderFilteredCommits(filtered);
    }

    handleAuthorFilter(author) {
        if (!author) {
            this.renderCommits();
            return;
        }
        const filtered = this.commits.filter(commit => commit.author === author);
        this.renderFilteredCommits(filtered);
    }

    handleSinceFilter(since) {
        if (!since) {
            this.renderCommits();
            return;
        }
        const filtered = this.commits.filter(commit => new Date(commit.date) >= new Date(since));
        this.renderFilteredCommits(filtered);
    }

    handleFileFilter(file) {
        if (!file) {
            this.renderCommits();
            return;
        }
        const filtered = this.commits.filter(commit => 
            commit.files.some(f => f.toLowerCase().includes(file.toLowerCase()))
        );
        this.renderFilteredCommits(filtered);
    }

    renderFilteredCommits(filtered) {
        if (this.currentView === 'list') {
            const container = document.getElementById('commitsList');
            container.innerHTML = '';
            filtered.forEach(commit => {
                const commitElement = this.createCommitElement(commit);
                container.appendChild(commitElement);
            });
        }
    }

    populateFilters() {
        const authors = [...new Set(this.commits.map(c => c.author))];
        const authorSelect = document.getElementById('authorFilter');
        authorSelect.innerHTML = '<option value="">All authors</option>';
        authors.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            authorSelect.appendChild(option);
        });
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    showError(message) {
        // Simple error display - could be enhanced with a toast notification
        alert(message);
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    initializeDarkMode() {
        // Check if user has a saved preference
        const savedDarkMode = localStorage.getItem('darkMode');
        if (savedDarkMode !== null) {
            this.darkMode = savedDarkMode === 'true';
            if (this.darkMode) {
                document.documentElement.classList.add('dark');
                document.body.classList.add('dark');
                const button = document.getElementById('darkMode');
                button.textContent = '☀️';
            }
        }
    }

    getGraphColors() {
        if (this.darkMode) {
            return {
                link: '#4b5563',        // gray-600 for dark mode
                nodeFill: '#3b82f6',    // blue-500 (same for both modes)
                nodeStroke: '#1e40af',  // blue-700 (same for both modes)
                text: '#9ca3af'         // gray-400 for dark mode
            };
        } else {
            return {
                link: '#cbd5e0',        // gray-300 for light mode
                nodeFill: '#3b82f6',    // blue-500 (same for both modes)
                nodeStroke: '#1e40af',  // blue-700 (same for both modes)
                text: '#6b7280'         // gray-500 for light mode
            };
        }
    }
}

// Initialize the app when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new GitHistoryUI();
});
