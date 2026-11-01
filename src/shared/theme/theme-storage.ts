// The buyer's saved theme pick in localStorage, read and written without ever throwing, so blocked storage cannot break the page.

export type ThemeChoice = 'system' | 'light' | 'dark' // the three picks of the theme control
export const THEME_STORAGE_KEY = 'pem-pf-store:theme' // the key; index.html's inline script reads the same one

/**
 * Reads the saved pick.
 * @return the saved choice, or 'system' when nothing valid is saved or storage throws
 */
export function readThemeChoice(): ThemeChoice {
  try {
    // storage may throw when blocked
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) // the raw saved text
    return stored === 'light' || stored === 'dark' ? stored : 'system' // anything else is System
  } catch {
    return 'system' // blocked storage: the page still works on System
  }
}

/**
 * Saves the pick; a blocked or full storage is ignored because the pick still holds for this page.
 * @param choice the pick to remember on this device
 */
export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    // storage may throw when blocked or full
    window.localStorage.setItem(THEME_STORAGE_KEY, choice) // remembered for the next visit
  } catch {
    // Storage refused: nothing to do, the attribute on <html> carries the pick for this visit.
  }
}
