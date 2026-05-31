/** GitHub Pages 等で末尾スラッシュの有無に依存しないアプリ基底パス */
export function appBasePathFromLocation(pathname: string): string {
  let path = pathname;
  if (path.endsWith('/index.html')) {
    path = path.slice(0, -'index.html'.length);
  } else if (!path.endsWith('/')) {
    const lastSlash = path.lastIndexOf('/');
    const tail = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
    const looksLikeFile = tail.includes('.');
    if (looksLikeFile && lastSlash >= 0) {
      path = path.slice(0, lastSlash + 1);
    } else {
      path = `${path}/`;
    }
  }
  if (!path.endsWith('/')) {
    path += '/';
  }
  return path;
}

/** サンプル fetch 用の絶対 URL 基底（末尾 `/` 付き） */
export function resolveAppBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.href) {
    const path = appBasePathFromLocation(window.location.pathname);
    return `${window.location.origin}${path}`;
  }
  const viteBase = import.meta.env.BASE_URL ?? '/';
  return new URL(viteBase, 'http://localhost/').href;
}

export function sampleBaseUrlForSampleDir(sampleDir: string): string {
  return new URL(`samples/${sampleDir}/`, resolveAppBaseUrl()).href;
}

/** リリースノート HTML（`public/changelog.html`）の URL */
export function changelogPageUrl(): string {
  return new URL('changelog.html', resolveAppBaseUrl()).href;
}
