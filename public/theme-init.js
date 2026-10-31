/* global window, document */
// Apply the local visual preference before React or styles paint.
// Keep the allowlist/default in sync with src/theme/theme.ts.
;(function () {
  var preference = 'system'
  try {
    var saved = localStorage.getItem('ejnexa-theme')
    if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved
  } catch { /* Storage can be unavailable in private/restricted browsers. */ }
  var dark = preference === 'dark' || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  var themeColor = document.querySelector('meta[name="theme-color"]')
  if (themeColor) themeColor.content = dark ? '#0b1321' : '#f5f7fb'
})()
