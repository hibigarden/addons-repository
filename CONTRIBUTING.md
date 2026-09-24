# Contributing addons

1. Put one addon in `addons/<id>/`, where `<id>` matches its
   `hibi-addon.json` ID. Include a user-facing `README.md`, a copy of the MIT
   `LICENSE`, and every file needed to install it, including its compiled entry
   file. Hibi installs only this folder, so its license notice must travel with
   it.
2. Add one entry to `catalog.json` with the addon's `id`, `name`,
   `description`, `version`, `apiVersion`, `kind`, `authors`, and `path` (for
   example, `addons/hello`). Keep those details in sync with
   `hibi-addon.json`. Use an ID that does not conflict with a built-in addon.

   ```json
   [{
     "id": "hello",
     "name": "Hello",
     "description": "A greeting addon.",
     "version": "1.0.0",
     "apiVersion": 2,
     "kind": "extension",
     "authors": [{ "displayName": "Your name" }],
     "path": "addons/hello"
   }]
   ```
3. Test the folder using Hibi's **Install addon…** command. Enable it, use it,
   disable it, and check that its README explains those steps. Hibi does not
   run build scripts during installation; native handlers cannot be sideloaded.
4. Open a pull request describing what the addon does and how you tested it.

Follow Hibi's [addon development guides](https://github.com/schmayterling/hibi/tree/main/docs/development/addons)
for package format and API details.

Contributions here must be releasable under this repository's MIT license.
Submit code you own or have permission to relicense. In particular, copying
code from Hibi's AGPL-3.0 repository requires permission from every relevant
copyright holder before it can be published here as MIT. Keep upstream credits
and required license notices for any reused material.
