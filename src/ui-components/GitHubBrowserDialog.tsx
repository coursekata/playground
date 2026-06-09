import React, { useState } from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { fetchContents, parseRepoInput, getRecentRepos, addRecentRepo } from '../github';
import type { GitHubItem } from '../github';

interface BreadcrumbItem {
  name: string;
  path: string;
}

interface GitHubBrowserProps {
  onSelect: (url: string) => void;
}

function GitHubBrowser({ onSelect }: GitHubBrowserProps): React.ReactElement {
  const [recentRepos, setRecentRepos] = useState<string[]>(getRecentRepos);
  const [repoInput, setRepoInput] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [items, setItems] = useState<GitHubItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const loadPath = async (
    o: string,
    r: string,
    path: string,
    crumbs: BreadcrumbItem[]
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    setSelectedPath(null);
    try {
      const result = await fetchContents(o, r, path);
      setItems(result);
      setBreadcrumbs(crumbs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (slug?: string): Promise<void> => {
    const input = slug ?? repoInput;
    const parsed = parseRepoInput(input);
    if (!parsed) {
      setError('Enter a valid GitHub repository (e.g. "owner/repo").');
      return;
    }
    const repoSlug = `${parsed.owner}/${parsed.repo}`;
    addRecentRepo(repoSlug);
    setRecentRepos(getRecentRepos());
    setRepoInput(repoSlug);
    setOwner(parsed.owner);
    setRepo(parsed.repo);
    setError(null);
    await loadPath(parsed.owner, parsed.repo, '', [{ name: repoSlug, path: '' }]);
  };

  const handleDirClick = (item: GitHubItem): void => {
    void loadPath(owner, repo, item.path, [...breadcrumbs, { name: item.name, path: item.path }]);
  };

  const handleFileClick = (item: GitHubItem): void => {
    if (!item.download_url) {
      return;
    }
    setSelectedPath(item.path);
    onSelect(item.download_url);
  };

  const handleBreadcrumbClick = (crumb: BreadcrumbItem, index: number): void => {
    void loadPath(owner, repo, crumb.path, breadcrumbs.slice(0, index + 1));
  };

  const showRecent = recentRepos.length > 0;

  return (
    <div className="je-GitHubBrowser">
      <div className="je-GitHubBrowser-input-row">
        <input
          className="je-GitHubBrowser-input"
          type="text"
          placeholder="owner/repo or GitHub URL"
          value={repoInput}
          onChange={e => setRepoInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              void handleOpen();
            }
          }}
          autoFocus
        />
        <button
          className="je-GitHubBrowser-browse-btn"
          onClick={() => void handleOpen()}
          disabled={loading}
        >
          Open
        </button>
      </div>

      {showRecent && (
        <div className="je-GitHubBrowser-recent">
          <span className="je-GitHubBrowser-recent-label">Recent:</span>
          {recentRepos.map(r => (
            <span
              key={r}
              className="je-GitHubBrowser-recent-item"
              onClick={() => void handleOpen(r)}
            >
              {r}
            </span>
          ))}
        </div>
      )}

      {breadcrumbs.length > 0 && (
        <div className="je-GitHubBrowser-breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={`${crumb.path}-${i}`}>
              {i > 0 && <span className="je-GitHubBrowser-sep"> / </span>}
              {i === 0 ? (
                <span className="je-GitHubBrowser-repo-label">{crumb.name}</span>
              ) : (
                <span
                  className="je-GitHubBrowser-crumb"
                  onClick={() => handleBreadcrumbClick(crumb, i)}
                >
                  {crumb.name}
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="je-GitHubBrowser-list">
        {loading && <div className="je-GitHubBrowser-message">Loading&hellip;</div>}
        {!loading && error && <div className="je-GitHubBrowser-error">{error}</div>}
        {!loading && !error && items.length === 0 && breadcrumbs.length > 0 && (
          <div className="je-GitHubBrowser-message">No notebooks found here.</div>
        )}
        {!loading &&
          items.map(item => (
            <div
              key={item.path}
              className={[
                'je-GitHubBrowser-item',
                `je-GitHubBrowser-item--${item.type}`,
                selectedPath === item.path ? 'je-GitHubBrowser-item--selected' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => (item.type === 'dir' ? handleDirClick(item) : handleFileClick(item))}
            >
              {item.name}
              {item.type === 'dir' ? '/' : ''}
            </div>
          ))}
      </div>
    </div>
  );
}

export class GitHubBrowserWidget extends ReactWidget {
  public onFileSelected: ((url: string) => void) | null = null;

  protected render(): React.ReactElement {
    return (
      <GitHubBrowser
        onSelect={url => {
          if (this.onFileSelected) {
            this.onFileSelected(url);
          }
        }}
      />
    );
  }
}
