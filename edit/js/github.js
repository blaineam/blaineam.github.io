// GitHub REST client. The only host this editor ever talks to besides its own origin is
// https://api.github.com, and the token goes nowhere else. In dry-run mode nothing is sent at
// all: reads come from this site's own files and writes are recorded for display.

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export class BranchMoved extends Error {}

const b64ToBytes = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));
export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
/** The id git gives a file with these contents, so a local copy can be compared with the repo's. */
export async function gitBlobSha(text) {
  const body = typeof text === 'string' ? new TextEncoder().encode(text) : new Uint8Array(text instanceof Blob ? await text.arrayBuffer() : text);
  const head = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length); all.set(head); all.set(body, head.length);
  if (!crypto.subtle) { let h = 0; for (const b of all) h = (h * 31 + b) >>> 0; return 'local-' + h.toString(16); }
  const d = await crypto.subtle.digest('SHA-1', all);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createGitHub({ owner, repo, branch, token }) {
  const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(path.startsWith('http') ? path : base + path, {
        method, cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: {
          Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { throw new GitHubError(0, 'Could not reach GitHub. Check the connection and try again.'); }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const hint = res.status === 401 ? 'GitHub did not accept the token (it may have expired or been revoked).'
        : res.status === 403 ? 'GitHub refused: the token does not have permission for this, or a rate limit was hit.'
        : res.status === 404 ? 'Not found. Either it does not exist or the token cannot see it.'
        : res.status === 409 || res.status === 422 ? 'GitHub rejected the request.' : `GitHub answered ${res.status}.`;
      throw new GitHubError(res.status, `${hint}${data && data.message ? ` (${String(data.message).slice(0, 200)})` : ''}`);
    }
    return data;
  }
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
  const ref = encodeURIComponent(branch);

  return {
    dry: false, owner, repo, branch,
    /** Who the token belongs to and whether it may push here. */
    async verify() {
      const r = await call('GET', '');
      await call('GET', `/git/ref/heads/${enc(branch)}`);    // the branch must exist too
      return { canPush: !!(r.permissions && r.permissions.push), fullName: r.full_name, isPrivate: !!r.private };
    },
    async head() { return (await call('GET', `/git/ref/heads/${enc(branch)}`)).object.sha; },
    async readText(path, at) {
      const r = await call('GET', `/contents/${enc(path)}?ref=${at || ref}`);
      if (Array.isArray(r) || r.type !== 'file') throw new GitHubError(0, `${path} is not a file.`);
      const text = r.content ? new TextDecoder().decode(b64ToBytes(r.content)) : new TextDecoder().decode(b64ToBytes((await call('GET', `/git/blobs/${r.sha}`)).content));
      return { text, sha: r.sha };
    },
    async list(path, at) {
      let r;
      try { r = await call('GET', `/contents/${enc(path)}?ref=${at || ref}`); }
      catch (e) { if (e.status === 404) return []; throw e; }
      return Array.isArray(r) ? r.filter((x) => x.type === 'file').map((x) => x.name) : [];
    },
    /** File name → git blob id for one folder, to tell whether a file here is already there. */
    async shas(path, at) {
      let r;
      try { r = await call('GET', `/contents/${enc(path)}?ref=${at || ref}`); }
      catch (e) { if (e.status === 404) return {}; throw e; }
      return Array.isArray(r) ? Object.fromEntries(r.filter((x) => x.type === 'file').map((x) => [x.name, x.sha])) : {};
    },
    /** The commit a branch points at, or null when there is no such branch. */
    async refSha(name) {
      try { return (await call('GET', `/git/ref/heads/${enc(name)}`)).object.sha; }
      catch (e) { if (e.status === 404) return null; throw e; }
    },
    /**
     * One commit for everything: blobs → tree → commit → move the branch (never forced).
     * changes: [{ path, text } | { path, blob } | { path, remove: true }]
     * `target` is the branch to move (default: the one being edited). `create` makes it, pointing
     * at the new commit. `treeOf` is the commit whose files the changes are laid over (default:
     * the parent); a draft published again to its own branch is laid over the base branch.
     */
    async commit({ parent, treeOf = parent, target = branch, create = false, message, changes, onStep = () => {} }) {
      if (!create) {
        const tip = await this.refSha(target);
        if (tip !== parent) throw new BranchMoved();
      }
      const under = await call('GET', `/git/commits/${treeOf}`);
      const tree = [];
      for (const c of changes) {
        onStep(c.path);
        if (c.remove) tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null });
        else if (c.blob) {
          const b = await call('POST', '/git/blobs', { content: await blobToBase64(c.blob), encoding: 'base64' });
          tree.push({ path: c.path, mode: '100644', type: 'blob', sha: b.sha });
        } else tree.push({ path: c.path, mode: '100644', type: 'blob', content: c.text });
      }
      onStep('commit');
      const t = await call('POST', '/git/trees', { base_tree: under.tree.sha, tree });
      const commit = await call('POST', '/git/commits', { message, tree: t.sha, parents: [parent] });
      try {
        if (create) await call('POST', '/git/refs', { ref: `refs/heads/${target}`, sha: commit.sha });
        else await call('PATCH', `/git/refs/heads/${enc(target)}`, { sha: commit.sha, force: false });
      } catch (e) { if (e.status === 422 || e.status === 409) throw new BranchMoved(); throw e; }
      return commit.sha;
    },
  };
}

/** Same interface, but reads this site's own files and only records what a commit would send. */
export function createDryRun({ owner, repo, branch }) {
  const base = `${API}/repos/${owner}/${repo}`;
  const local = async (path) => {
    const res = await fetch(new URL('../' + path, location.href), { cache: 'no-store' });
    if (!res.ok) throw new GitHubError(res.status, `Could not read ${path} from this site (${res.status}).`);
    return res;
  };
  return {
    dry: true, owner, repo, branch, log: [],
    async verify() { return { canPush: true, fullName: `${owner}/${repo}`, isPrivate: false }; },
    async head() { return 'dry-run-head'; },
    async readText(path) { const text = await (await local(path)).text(); return { text, sha: await gitBlobSha(text) }; },
    async list(path) {
      if (path === 'slides') { try { return Object.keys(await (await local('slides/thumbs/manifest.json')).json()); } catch { return []; } }
      // A local static server (python -m http.server and the like) lists a folder as links.
      try {
        const html = await (await local(path.replace(/\/?$/, '/'))).text();
        if (!/<(ul|pre|table)/i.test(html)) return [];
        return [...html.matchAll(/href="([^"?#]+)"/g)].map((m) => decodeURIComponent(m[1])).filter((n) => n && !n.endsWith('/') && !n.includes('/') && !n.startsWith('.'));
      } catch { return []; }
    },
    async shas() { return {}; },
    async refSha() { return null; },
    async commit({ parent, treeOf = parent, target = branch, create = false, message, changes, onStep = () => {} }) {
      const log = this.log = [];
      const rec = (method, path, body, note) => log.push({ method, url: base + path, body, note });
      if (create) rec('GET', `/git/ref/heads/${target}`, null, 'Does that branch exist yet? (Here it is assumed not to.)');
      else rec('GET', `/git/ref/heads/${target}`, null, 'Is the branch still where it was when the files were loaded?');
      rec('GET', `/git/commits/${treeOf}`, null, 'Find the tree of that commit.');
      const tree = [];
      for (const c of changes) {
        onStep(c.path);
        if (c.remove) tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null });
        else if (c.blob) {
          const b64 = await blobToBase64(c.blob);
          rec('POST', '/git/blobs', { content: `${b64.slice(0, 48)}… (${b64.length.toLocaleString('en')} base64 characters)`, encoding: 'base64' }, `Upload ${c.path} (${c.blob.size.toLocaleString('en')} bytes, ${c.blob.type}).`);
          tree.push({ path: c.path, mode: '100644', type: 'blob', sha: `<sha of the blob for ${c.path}>` });
        } else tree.push({ path: c.path, mode: '100644', type: 'blob', content: c.text });
      }
      rec('POST', '/git/trees', { base_tree: '<tree of that commit>', tree }, 'One tree holding every changed file.');
      rec('POST', '/git/commits', { message, tree: '<sha of the new tree>', parents: [parent] }, 'The commit.');
      if (create) rec('POST', '/git/refs', { ref: `refs/heads/${target}`, sha: '<sha of the new commit>' }, `Create the branch ${target}, pointing at the new commit. ${branch} is not touched.`);
      else rec('PATCH', `/git/refs/heads/${target}`, { sha: '<sha of the new commit>', force: false }, 'Move the branch forward. Never forced: if the branch moved, GitHub refuses and the editor reloads and reapplies.');
      return null;
    },
  };
}
