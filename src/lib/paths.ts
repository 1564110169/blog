const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');

export function link(path = '/') {
  if (/^https?:\/\//.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedPath === '/') return baseUrl || '/';
  return `${baseUrl}${normalizedPath}`;
}

export function asset(path: string) {
  return link(path);
}
