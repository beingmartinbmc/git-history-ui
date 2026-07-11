# Privacy

The extension reads the current GitHub URL to build a local
`git-history-ui://` deep link. It does not read repository contents, collect
analytics, inject remote code, or send browsing data to the project.

The optional hosted-instance URL is stored with `chrome.storage.sync`. Depending
on your browser and sync settings, Chrome may synchronize that URL through
browser or Google account infrastructure. When you explicitly click its link,
the repository URL and selected pull request or commit are sent to that
configured http(s) instance. Review that instance's privacy policy before using
it.
