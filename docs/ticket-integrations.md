# Repo tickets

Each agent session has a provider-named ticket button beside PRs. The button shows or hides a resizable inbox and reading pane on the right. PRs and tickets share that space; opening one hides the other. The terminal remains mounted. Ticket selection and pane width belong to the session.

The inbox reads pending work for the local repo’s configured Jira project or GitHub repository. Search filters the loaded matches. **Search more tickets** reads another provider page, including when a page contains no keyword matches. Ancestor search is bounded; the pane identifies incomplete ancestor checks rather than treating them as a complete search.

**Add to terminal** pastes `Implement ticket <ticket URL>` into the owning terminal without submitting Enter. **Copy link** uses the clipboard and offers a separate selectable link if clipboard access fails. **Open ticket** uses the app’s external-browser path.

The reader exposes available workflow transitions, title and description editing, comments, and editing the connected user’s own plain comments. Provider permissions determine which actions are available. Title-only Jira edits preserve the original rich description. Editing a Jira description replaces it with plain paragraphs; the editor explains this before saving. Rich Jira comments open externally for editing so mentions, formatting, and attachments remain intact. Comments beyond the first provider page remain available in the external ticket. Reads and writes bind to a source-context fingerprint; changing sites or repo filters invalidates old drafts instead of targeting a same-numbered ticket elsewhere.

## Settings

The **Tickets** settings page opens with the current Mission Gontrol project selected. Each local project keeps its own Jira project or GitHub repository, keywords, and matching rules, with separate filters for each provider. Switching projects loads that project's saved filters in its ticket pane. The project selector also lets you configure another project without navigating away. The account connection remains application-wide; connecting applies the provider/site selection.

- **Workspace URL** is the company Jira Cloud root, such as `https://company.atlassian.net`.
- **Project / Repository** lists results available to the connected account. Search narrows the discovery results.
- **Keywords** is a comma-separated list shared by every enabled search location.
- Title and description use case-insensitive phrase matching. Labels and metadata use complete-value matching.
- **Selected metadata field** is optional. Fields come from the chosen Jira project; a team-defined Repository custom field is not assumed to be universal.
- **Also check parent stories and epics** applies the same rules to ancestors. Direct matches take precedence over inherited matches. GitHub sub-issue parents use the parent-issue endpoint.
- **Preview matches** reads a bounded provider page with the unsaved filters. **Save** persists the filters; **Cancel** restores their saved values.

Filter storage uses the existing local settings table. No database migration is required.

## Jira OAuth configuration

Jira Cloud uses an application-owned OAuth 2.0 authorization-code integration. The app maintainer provisions `MC_JIRA_OAUTH_CLIENT_ID` and `MC_JIRA_OAUTH_CLIENT_SECRET` in the local server environment. The registered callback is exactly:

```
http://127.0.0.1:53683/callback
```

The integration requests `read:jira-work`, `read:jira-user`, `write:jira-work`, and `offline_access`. It selects the authorized site whose root matches Workspace URL. The loopback listener binds only to `127.0.0.1`, expires after ten minutes, and consumes a random one-use state before exchanging the authorization code.

Tokens remain server-side, encrypted with AES-GCM in an owner-only file in the user-data directory. The encryption key lives in macOS Keychain, scoped to the application data directory; there is no file-key fallback when Keychain is unavailable. Existing file keys migrate into Keychain before removal. Jira credential persistence currently requires macOS. Refresh-token rotation is serialized. Disconnecting cancels an outstanding authorization and clears the local tokens. Tokens and client secrets are never returned by the settings API.

A build without the OAuth app configuration presents the integration as unavailable for sign-in. The client secret is a maintainer-provisioned server credential; it does not belong in repository files, renderer bundles, or published desktop JavaScript. A broadly distributed deployment needs secure credential provisioning or a server-mediated token exchange. End users should not be instructed to create individual 3LO applications.

## GitHub account

GitHub Issues uses GitHub CLI’s account on this computer. **Connect with GitHub** uses its browser/device OAuth flow when no account is present and displays the device code. The CLI manages its credentials; Mission Gontrol does not copy them into application settings. Switching providers does not sign other applications out of GitHub.

## References

- [Jira OAuth integration](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- [Jira enhanced issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- [Jira project fields](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-fields/)
- [GitHub issue parents](https://docs.github.com/en/rest/issues/sub-issues)
