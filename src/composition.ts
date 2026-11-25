import { findModuleExport, findVar } from "@decky/ui";

// Steam's notification composition keeps the UI visible without taking input.
// This internal hook can change with Steam updates. Never use SetComposition
// directly: Steam's hook owns the request and releases it on unmount. The
// name labels the request in Steam's composition log.
type CompositionHook = (state: number, name: string) => void;

// The hook adds, changes and removes one request. The store behind it calls
// the same methods and is told apart by the map of all requests it keeps.
function isCompositionHook(candidate: unknown): candidate is CompositionHook {
  if (typeof candidate !== "function") return false;

  const source = Function.prototype.toString.call(candidate);

  return (
    ["Add", "Change", "Remove"].every((operation) =>
      source.includes(`${operation}MinimumCompositionStateRequest`),
    ) && !source.includes("m_mapCompositionStateRequests")
  );
}

export function findCompositionHook(): CompositionHook | undefined {
  try {
    // Steam builds bundled with webpack export the hook.
    const exported = findModuleExport(isCompositionHook);

    if (exported) return exported;

    // Steam builds made of ES modules (beta since November 2026) keep it
    // inside its module. Decky Loader 3 cannot look there.
    if (typeof findVar !== "function") return undefined;

    return findVar(isCompositionHook);
  } catch (error) {
    console.warn("[Round Corners] Composition discovery failed", error);
    return undefined;
  }
}
