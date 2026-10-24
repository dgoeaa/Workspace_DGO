/**
 * Deterministic string ordering for generated files.
 *
 * String.prototype.localeCompare orders by the HOST's locale and ICU build. A file generated
 * on Linux and re-generated on Windows can therefore come out in a different order, and every
 * `--check` stage that compares the two then reports the file as stale when nothing changed.
 * That is exactly what happened: `npm test` passed on Linux and failed on Windows PowerShell
 * with "flow-list-map.json is stale".
 *
 * byteCompare orders by code unit. It is identical on every platform, in every locale.
 * Use it anywhere the result is written to a tracked file.
 */
export const byteCompare = (a, b) => {
  const x = String(a ?? ''), y = String(b ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
};
