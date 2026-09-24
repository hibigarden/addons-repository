# Hibi addon repository

Community addons live here, separate from the addons bundled with Hibi. Each
`addons/<id>/` folder is one ready-to-install addon. `catalog.json` lists the
folders for the Hibi addon browser and [hibi.garden/addons](https://www.hibi.garden/addons/).

The catalog is empty until the first addon is published.

To make an addon, read Hibi's [sideloading guide](https://github.com/schmayterling/hibi/blob/main/docs/development/addons/sideloading.md).
The addon folder needs `hibi-addon.json`, its own `README.md` and `LICENSE`,
and a compiled entry file. Hibi does not build addons during installation. See
[CONTRIBUTING.md](CONTRIBUTING.md) before submitting one.

Repository code is licensed under [MIT](LICENSE). Addons must retain any
required upstream copyright and license notices.
