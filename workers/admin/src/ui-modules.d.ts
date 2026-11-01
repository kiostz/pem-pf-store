// Types the admin page files that wrangler's Text rule imports as strings.

declare module '*/ui-dist/admin.html' {
  const text: string // The page, as text.
  export default text
}
declare module '*/ui-dist/admin.js' {
  const text: string // The bundle, as text.
  export default text
}
declare module '*/ui-dist/admin.css' {
  const text: string // The styles, as text.
  export default text
}
