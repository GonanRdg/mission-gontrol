# Project tickets

Each agent session has a provider-named ticket button beside PRs. Tickets and PRs share the right pane; opening one hides the other. The terminal stays mounted. The pane can be resized and fills narrow sessions.

## Jira browser

Jira uses a sandboxed Electron browser with its own persistent sign-in session, separate from the PR browser. Sign in with the company account inside the pane. No OAuth application registration or API token is required. Company SSO policies can still restrict embedded-browser sign-in; authenticated Jira access must be verified on the target account.

The settings page opens with the current Mission Gontrol project selected. Each local project stores its own:

- Jira Cloud workspace root, such as `https://company.atlassian.net`.
- Jira project key or exact name, such as `HOPS` or `Example Project`.
- Search expression, such as `billing service*`.
- Search locations: ticket title, description, or both.
- Pending-only option, which excludes Jira’s Done status category.

The search expression follows Jira text-search syntax. It is one expression, rather than comma-separated keywords. Project names and search values are quoted as JQL strings and URL-encoded. Matching either checked location includes a ticket. A project without complete browser settings shows a configuration prompt and does not open a browser. Save persists only the selected local project’s settings; Cancel restores saved values. The preview exposes the generated JQL and can open it externally.

Jira renders the search results, full ticket detail, workflow controls, and comments. The browser toolbar provides Back, Forward, Reload, Search results, and Open ticket/Open search. Jira’s interface handles edits with the signed-in user’s permissions. The application does not scrape ticket content, copy browser cookies into API requests, or invoke the Jira API for this view. Ancestor matching from the API integration does not apply to browser searches.

A selected ticket is identified from `/browse/KEY-123`, issue detail paths, or `selectedIssue=KEY-123` on the configured Jira site. Login pages, another site, and search pages without a selected ticket cannot enable terminal actions. **Add to terminal** pastes `Implement ticket https://company.atlassian.net/browse/KEY-123` without submitting Enter. **Copy link** copies the canonical ticket URL and provides a selectable fallback if clipboard access fails. **Open ticket** opens it externally. A coding agent’s ability to read the link depends on that agent’s own Jira access.

Browser visibility follows pane ownership, settings overlays, modals, and resizing. Hiding and reopening a session preserves its current browser page. Closing the agent session destroys its browser view. Project filters use the local settings table, without a database migration. Browser sign-in data remains in Electron’s dedicated persistent profile; the application does not request or store the account password itself.

## GitHub Issues

GitHub Issues retains the API inbox and reader. It uses the GitHub CLI account on this computer; Connect uses the CLI browser/device OAuth flow. The CLI manages credentials. Switching ticket applications does not sign other applications out of GitHub.

Each local project keeps its own repository and keyword matching rules. Search locations include title, description, labels, repository name, and parent issues. Reads paginate and parent lookup is bounded. Available issue state changes, title/description edits, and plain comments follow provider permissions. Source-context fingerprints reject stale drafts after a source change.

## References

- [Jira search links](https://support.atlassian.com/jira-software-cloud/docs/manage-search-results/)
- [JQL text search](https://support.atlassian.com/jira-software-cloud/docs/search-for-issues-using-the-text-field/)
- [GitHub issue parents](https://docs.github.com/en/rest/issues/sub-issues)
