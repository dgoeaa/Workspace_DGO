// Content types for every extension either local server can be asked for.
//
// This was a literal inside scripts/dev-server.mjs. It moved here when
// scripts/run-platform.mjs gained a static server of its own: two maps would have drifted,
// and the way they drift is silent. A missing entry does not throw — the file is served as
// application/octet-stream, and a browser refuses to execute an ES module delivered under
// that type. The platform then boots to an empty shell with a console error naming a MIME
// type rather than the file that is missing from this map.
//
// Adding a file type the applications load means adding it here, once, for both servers.

export const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.pdf': 'application/pdf', '.md': 'text/plain; charset=utf-8',
});

/** The content type for a path, or the type that makes a browser refuse to execute it. */
export function contentType(filePath) {
  const dot = filePath.lastIndexOf('.');
  return (dot === -1 ? null : MIME[filePath.slice(dot).toLowerCase()]) || 'application/octet-stream';
}
