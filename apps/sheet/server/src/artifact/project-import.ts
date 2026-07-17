export async function withProjectImportCleanup<T>(input: {
  cleanup: () => void;
  importProject: () => Promise<T>;
}) {
  try {
    return await input.importProject();
  } catch (error) {
    input.cleanup();
    throw error;
  }
}
