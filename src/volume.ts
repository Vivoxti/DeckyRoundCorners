import { classMap } from "@decky/ui";
import { useEffect, useState } from "react";

// Steam's volume popin slides down over the top-left corner when the volume
// buttons are pressed. Its element is always mounted in the header and drops
// a "hidden" class while shown. Two CSS modules name these classes; only one
// is used by the element. Class names can change with Steam updates.
type PopinClasses = { VolumePopin: string, VolumePopinHidden: string };
let candidates: PopinClasses[] = [];
try {
  candidates = classMap
    .filter((module) => module.VolumePopin && module.VolumePopinHidden)
    .map(({ VolumePopin, VolumePopinHidden }) => ({ VolumePopin, VolumePopinHidden }));
} catch (error) {
  console.warn("[Round Corners] Volume popin classes not found", error);
}

/** Whether the volume popin is shown, from class changes on its one element. */
export function useVolumePopinShown(document: Document): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // The observer comes from the SP window that owns the popin.
    const Observer = document.defaultView?.MutationObserver;
    if (!candidates.length || !Observer) return;
    let popin: Element | undefined, hidden = "";
    const update = () => setShown(Boolean(popin && !popin.classList.contains(hidden)));
    const watch = new Observer(update);
    const attach = () => {
      for (const classes of candidates) {
        popin = document.getElementsByClassName(classes.VolumePopin)[0];
        if (!popin) continue;
        hidden = classes.VolumePopinHidden;
        watch.observe(popin, { attributes: true, attributeFilter: ["class"] });
        update();
        return true;
      }
      return false;
    };
    // The header may render after the corners; wait for it only until then.
    const wait = new Observer(() => { if (attach()) wait.disconnect(); });
    if (!attach()) wait.observe(document.body, { childList: true, subtree: true });
    return () => { wait.disconnect(); watch.disconnect(); };
  }, [document]);
  return shown;
}
