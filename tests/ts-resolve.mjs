// Node's ESM resolver wants explicit file extensions, while the app source
// uses the extensionless relative imports that bundlers expect. This hook
// bridges the two so tests can import application modules unchanged.

export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[a-z0-9]+$/i.test(specifier);

  if (relative && !hasExtension) {
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        // Fall through and let the original specifier report the failure.
      }
    }
  }

  return nextResolve(specifier, context);
}
