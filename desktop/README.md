# Desktop host reference

The WebView2 host packages an already-built `mwg` game as a Windows application while
retaining its local-file asset model. It is intentionally separate from the npm package:
the game stays a normal web build, and the host is a thin native shell.

## WebView2 (Windows)

Build a game first, then point the host at its generated `index.html`:

```powershell
npm run example:tower-defense:build
dotnet run --project desktop/webview2/MwgDesktop.csproj -- examples/tower-defense/dist/index.html
```

`dotnet publish -c Release -r win-x64 --self-contained true` produces a distributable
host. WebView2 Runtime is included with current Windows installations; distribute its
Evergreen Bootstrapper for older machines.

The first positional argument is resolved to an absolute `file://` URI. This means compiled
resources still work without a web server. Do not point the host at source HTML that uses
development-only Vite imports.

## Chromium alternative

For a Chromium-bundled desktop build, package the same `dist/` folder with Electron or
Tauri. Keep the browser entry local and avoid introducing HTTP-only loading paths. The
framework's `AssetStream` can then prefetch and unload ordinary asynchronous assets, while
the compiled-resource path remains the fallback for direct `file://` launches.
