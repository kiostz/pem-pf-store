// Types the `?raw` imports of source files that tests read as text.

declare module '*?raw' { // Any `?raw` import.
  const text: string // The file, as text.
  export default text // The module's only export.
}
