export function assertCollectionHasSuccess(sourceCount, sourceErrors, outputPath) {
  if (sourceCount > 0 && sourceErrors.length < sourceCount) return;

  const details = sourceErrors.map(({ source, error }) => `${source}: ${error}`).join('; ');
  throw new Error(`All ${sourceCount} sources failed; refusing to overwrite ${outputPath}${details ? `. ${details}` : ''}`);
}
