using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MwgDesktopHost;

/// <summary>
/// A minimal WebView2 host for item 136 of ROADMAP.md: proving a game built by this project's
/// own vite/emit-page pipeline runs unmodified inside a native Windows shell, the same way
/// item 110 proved it inside a Capacitor shell.
///
/// Serves the built game through <c>SetVirtualHostNameToFolderMapping</c> rather than a plain
/// `file://` navigation - a real `https://` origin WebView2 maps straight to this folder on
/// disk, with none of `file://`'s restrictions (no `fetch`/XHR, no same-origin `<img>`/WebGL
/// for local files). The game's own build stays untouched either way - only which URL loads
/// it changes - but the virtual host is what makes item 137's `assets.fetchWithByteProgress`
/// (or a WebSocket multiplayer connection, or any other real network call) actually work
/// inside this host at all, closing the exact gap item 137 named: "nothing here runs inside
/// such a host yet to give that number meaning". It is a reference and a build/run smoke
/// test, not a shipping installer: no packaging, code signing, or update mechanism is
/// attempted here, per the item's own "start with a documented reference host and build/run
/// smoke test" scope.
/// </summary>
internal static class Program
{
	/// <summary>
	/// Walks up from the executable's own folder looking for the built example this host
	/// loads, rather than a hardcoded relative path count - resilient to Debug/Release/
	/// self-contained output depth, which the exact folder count is not.
	/// </summary>
	private static string FindGamePage()
	{
		const string relative = "examples/tower-defense/dist/index.html";
		var dir = new DirectoryInfo(AppContext.BaseDirectory);

		while (dir is not null)
		{
			var candidate = Path.Combine(dir.FullName, relative.Replace('/', Path.DirectorySeparatorChar));
			if (File.Exists(candidate)) return candidate;
			dir = dir.Parent;
		}

		throw new FileNotFoundException(
			$"could not find {relative} above {AppContext.BaseDirectory} - run `npm run example:tower-defense:build` first"
		);
	}

	[STAThread]
	private static void Main()
	{
		ApplicationConfiguration.Initialize();

		var gamePage = FindGamePage();

		var webView = new WebView2 { Dock = DockStyle.Fill };
		var form = new Form
		{
			Text = "mwg desktop host (WebView2 reference)",
			Width = 900,
			Height = 700,
		};
		form.Controls.Add(webView);

		form.Load += async (_, _) =>
		{
			await webView.EnsureCoreWebView2Async();
			var gameFolder = Path.GetDirectoryName(gamePage)!;
			webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
				"mwg.local", gameFolder, CoreWebView2HostResourceAccessKind.Allow
			);
			webView.Source = new Uri("https://mwg.local/index.html");
		};

		Application.Run(form);
	}
}
