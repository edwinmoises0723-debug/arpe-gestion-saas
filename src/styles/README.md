# EJNEXA visual system

- `tokens.css`: shared typography, spacing, radii, elevation, focus and legacy aliases.
- `themes.css`: semantic light/dark roles. Use `--color-text-*`, surface/border roles, `--color-brand-primary` / `--color-brand-accent`, and paired status foreground/surface roles in domain CSS. Use `--color-brand-solid` + `--color-on-solid` for filled actions.
- `ThemeProvider` / `useTheme`: local visual preference (`light`, `dark`, `system`), resolved theme and setter. `ejnexa-theme` contains no business/user data. System changes are observed without reload. Unavailable storage falls back gracefully.
- `public/theme-init.js`: applies the same allowlist and default before React paints. Its parity is tested. It does not contact a service.
- `.public-catalog` and `.client-document`: explicit light commercial boundaries. Preserve tenant colors, paper backgrounds and export/print behavior. Never theme official raster assets or financial calculations.

Domain files own layout and component states; avoid a second parallel set of dark selectors. Use chart roles for data graphics and semantic status roles for status. Respect reduced motion and retain visible focus. Only actual pending request prices receive the pending presentation; legitimate numeric zeros remain numbers.
