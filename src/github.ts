export interface GitHubItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
}

export interface GitHubRepo {
  owner: string;
  repo: string;
}

const GITHUB_API = 'https://api.github.com';
const RECENT_REPOS_KEY = 'jupytereverywhere:github-recent-repos';
const MAX_RECENT_REPOS = 5;

export function parseRepoInput(input: string): GitHubRepo | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const urlMatch = trimmed.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }
  const slugMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (slugMatch) {
    return { owner: slugMatch[1], repo: slugMatch[2] };
  }
  return null;
}

export async function fetchContents(owner: string, repo: string, path = ''): Promise<GitHubItem[]> {
  const apiPath = path ? `/${path}` : '';
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents${apiPath}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' }
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Repository "${owner}/${repo}" not found or path does not exist.`);
    }
    if (response.status === 403) {
      throw new Error('GitHub API rate limit exceeded. Please try again later.');
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Expected a directory path.');
  }
  return (data as GitHubItem[])
    .filter(item => item.type === 'dir' || (item.type === 'file' && item.name.endsWith('.ipynb')))
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

export function getRecentRepos(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_REPOS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function addRecentRepo(slug: string): void {
  const lower = slug.toLowerCase();
  const recent = getRecentRepos().filter(r => r.toLowerCase() !== lower);
  recent.unshift(slug);
  localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_REPOS)));
}
