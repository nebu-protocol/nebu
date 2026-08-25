# Gellix (licensed font)

Gellix is a commercial typeface and is not bundled with this repo.
Place your licensed files here to activate it site-wide:

- Gellix-Regular.woff2   (400)
- Gellix-Medium.woff2    (500)
- Gellix-SemiBold.woff2  (600)
- Gellix-Bold.woff2      (700)

Then uncomment the Gellix @font-face block at the top of
src/app/globals.css. Until then the UI uses Geist and no font requests
are made (an active @font-face for missing files would 404 on every page).
