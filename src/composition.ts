import { findModuleExport } from "@decky/ui";

// Steam's notification composition keeps the UI visible without taking input.
// This internal hook can change with Steam updates. Never use SetComposition
// directly: Steam's hook owns the request and releases it on unmount. The
// name labels the request in Steam's composition log.
export function findCompositionHook(): ((state: number, name: string) => void) | undefined {
  try {
    return findModuleExport((candidate: unknown) => {
      if (typeof candidate !== "function") return false;
      const source = Function.prototype.toString.call(candidate);
      return ["Add", "Change", "Remove"].every((operation) =>
        source.includes(`${operation}MinimumCompositionStateRequest`),
      ) && !source.includes("m_mapCompositionStateRequests");
    });
  } catch (error) {
    console.warn("[Round Corners] Composition discovery failed", error);
    return undefined;
  }
}
