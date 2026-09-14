# Desktop host reference

The WebView2 host packages an already-built `mwg` game as a Windows application while
retaining its local-file asset model. It is intentionally separate from the npm package:
the game stays a normal web build, and the host is a thin native shell.

Two WebView2 hosts live here, for two different jobs - both are `net8.0-windows`, need
the .NET 8 SDK (`winget install Microsoft.DotNet.SDK.8` if `dotnet --version` doesn't
already report 8.x), and rely on the WebView2 Runtime already bundled with current
Windows installations (distribute its Evergreen Bootstrapper for older machines).

## `desktop/MwgDesktopHost` - the reference host (`npm run desktop:build`/`desktop:run`)

The canonical, npm-wired host, targeting the same `tower-defense` reference build the
Capacitor Android route (`npm run cap:add:android`) also uses:

```powershell
npm run desktop:build   # mobile:build (builds tower-defense) + dotnet build
npm run desktop:run     # mobile:build + dotnet run
```

It serves the built game through `CoreWebView2.SetVirtualHostNameToFolderMapping` - a real
`https://mwg.local/` origin WebView2 maps to the built game's own folder - rather than a
plain `file://` navigation, which is what makes `assets.fetchWithByteProgress` (or a
WebSocket multiplayer connection, or any other real network call) work at all inside this
host. The game's own build is otherwise unchanged.

## `desktop/webview2` - a plain `file://` host for any built game

A simpler, generic host: point it at any game's own generated `index.html` and it opens
that page directly, no fixed reference example, no virtual host:

```powershell
npm run example:tower-defense:build
dotnet run --project desktop/webview2/MwgDesktop.csproj -- examples/tower-defense/dist/index.html
```

`dotnet publish -c Release -r win-x64 --self-contained true` produces a distributable
host.

The first positional argument is resolved to an absolute `file://` URI. This means compiled
resources still work without a web server. Do not point the host at source HTML that uses
development-only Vite imports, and don't expect `fetch`/XHR-based capabilities (byte-progress
loading, WebSocket multiplayer) to work here - `file://` blocks those; use
`desktop/MwgDesktopHost`'s virtual-host mapping when a game needs them.

## Chromium alternative

For a Chromium-bundled desktop build, package the same `dist/` folder with Electron or
Tauri. Keep the browser entry local and avoid introducing HTTP-only loading paths. The
framework's `AssetStream` can then prefetch and unload ordinary asynchronous assets, while
the compiled-resource path remains the fallback for direct `file://` launches.
