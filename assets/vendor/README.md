# Vendored third-party code

Libraries served from this repository rather than a CDN.

## alpine-3.14.1.min.js

Alpine.js 3.14.1, `dist/cdn.min.js` from the `alpinejs` package on npm —
byte-identical to what `cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/cdn.min.js`
serves, and pinned to the same version the Feeding Schedule Builder was
written against.

It is vendored, where the export libraries are not, because of what it holds
up. `docx`, `pdfmake`, `jsPDF` and the rest are needed when somebody presses
Export, so a CDN that is slow or blocked costs that one action and
`assets/gt-lazy.js` keeps it off the critical path. Alpine *is* the Feeding
Schedule Builder's user interface: every field is bound with `x-model` and
every panel with `x-show`, so a CDN that fails leaves not a degraded page but
an inert one — placeholder text in boxes that cannot be typed into and a
preview that never renders. A clinical tool on a hospital network should not
have that failure mode, and the portal already made the same call for
Tailwind (see `scripts/build-tailwind.js`).

To update: `npm pack alpinejs@<version>`, take `package/dist/cdn.min.js`,
rename it to match the version, and change the one `<script src>` in
`apps/feeding-schedule-builder/index.html`.
