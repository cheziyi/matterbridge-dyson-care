/**
 * @file apps/frontend/src/theme.ts
 * @description Makes the setup page look like the Matterbridge page it is shown in.
 * @author Calvin Che
 * @license Apache-2.0
 */

/** Take the colours and the font of the Matterbridge page this one is shown in. */
export function adoptHostTheme(): void {
  try {
    if (window.parent === window) return;
    const host = getComputedStyle(window.parent.document.body);
    for (const name of ['--primary-color', '--div-bg-color', '--div-text-color', '--main-bg-color', '--main-label-color', '--div-border-color', '--main-light-color']) {
      const value = host.getPropertyValue(name).trim();
      if (value !== '') document.documentElement.style.setProperty(`--host${name.slice(1)}`, value);
    }
    document.documentElement.style.setProperty('--host-font', host.fontFamily);
  } catch {
    // Opened on its own or from another origin: the page keeps its own colours.
  }
}
