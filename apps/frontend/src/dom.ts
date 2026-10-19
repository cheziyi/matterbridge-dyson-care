/**
 * @file apps/frontend/src/dom.ts
 * @description The one helper the setup page builds its elements with.
 * @author Calvin Che
 * @license Apache-2.0
 */

export type Child = Node | string | false | null | undefined;

/**
 * Create an element.
 *
 * @param tag The tag name.
 * @param props `class`, `on<event>` listeners, and anything else as a property when the element has it, else an attribute.
 * @param children Nodes or text; false, null and undefined are skipped.
 * @returns The element.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') element.className = String(value);
    else if (key === 'html') element.innerHTML = String(value);
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value as EventListener);
    else if (key in element) (element as unknown as Record<string, unknown>)[key] = value;
    else element.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child !== false && child !== null && child !== undefined) element.append(child);
  }
  return element;
}
