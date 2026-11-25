import { classMap, findScopeDetailsByVar } from "@decky/ui";
import { useEffect, useState } from "react";

// Steam's volume popin slides down over the top-left corner when the volume
// buttons are pressed. Its element is always mounted in the header and drops
// a "hidden" class while shown. Class names can change with Steam updates.
type PopinClasses = { VolumePopin: string; VolumePopinHidden: string };

// The popin requests composition under this name.
const POPIN_REQUEST = /["'`]VolumePopin["'`]/;

// Its root element: className: cx(popinClass, { [hiddenClass]: !shown }, ...).
const POPIN_CLASS_NAME = /className:[\w$]+\(([\w$]+),\{\[([\w$]+)\]:!/;

/** Webpack builds: two CSS modules name these classes; only one is used by the element. */
function findCssModuleClasses(): PopinClasses[] {
  return classMap
    .filter((module) => module.VolumePopin && module.VolumePopinHidden)
    .map(({ VolumePopin, VolumePopinHidden }) => ({ VolumePopin, VolumePopinHidden }));
}

/**
 * ES module builds (beta since November 2026) inline CSS module classes as
 * strings in the popin component's module, so they are read from the
 * variables its className refers to. Decky Loader 3 has no module scopes.
 */
function findInlinedClasses(): PopinClasses[] {
  if (typeof findScopeDetailsByVar !== "function") return [];

  const [scope, component] = findScopeDetailsByVar((variable: unknown) => {
    if (typeof variable !== "function") return false;

    const source = Function.prototype.toString.call(variable);

    return POPIN_REQUEST.test(source) && POPIN_CLASS_NAME.test(source);
  });

  if (!scope || !component) return [];

  // The filter above has already matched this source.
  const source = Function.prototype.toString.call(component);
  const [, popinVariable, hiddenVariable] = source.match(POPIN_CLASS_NAME)!;

  const VolumePopin = scope[popinVariable];
  const VolumePopinHidden = scope[hiddenVariable];

  if (typeof VolumePopin !== "string" || typeof VolumePopinHidden !== "string") return [];

  return [{ VolumePopin, VolumePopinHidden }];
}

let candidates: PopinClasses[] = [];

/** Whether Steam is an ES module build, found by the popin's inlined classes. */
export let popinClassesInlined = false;

try {
  candidates = findCssModuleClasses();

  if (!candidates.length) {
    candidates = findInlinedClasses();
    popinClassesInlined = candidates.length > 0;
  }
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

    let popin: Element | undefined;
    let hidden = "";

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
    const wait = new Observer(() => {
      if (attach()) {
        wait.disconnect();
      }
    });

    if (!attach()) {
      wait.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      wait.disconnect();
      watch.disconnect();
    };
  }, [document]);

  return shown;
}
