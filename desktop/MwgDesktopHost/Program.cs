using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MwgDesktopHost;

/// <summary>
/// A minimal WebView2 host for item 136 of ROADMAP.md: proving a game built by this project's
/// own vite/emit-page pipeline runs unmodified inside a native Windows shell, the same way
/// item 110 proved it inside a Capacitor shell. It is also the host a game that merely *uses*
/// mwg runs: pass the built page as the first argument and it loads that game instead of this
/// repository's own example. See desktop/README.md for both, including where a project outside
/// this repository gets these files, since `desktop/` is not part of the npm package.
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
	/// This repository's own build/run smoke test, loaded when no argument names a page.
	/// </summary>
	private const string SmokeTestPage = "examples/tower-defense/dist/index.html";

	/// <summary>
	/// Walks up from the executable's own folder looking for the built example this host
	/// loads, rather than a hardcoded relative path count - resilient to Debug/Release/
	/// self-contained output depth, which the exact folder count is not.
	/// </summary>
	private static string FindSmokeTestPage()
	{
		var dir = new DirectoryInfo(AppContext.BaseDirectory);

		while (dir is not null)
		{
			var candidate = Path.Combine(dir.FullName, SmokeTestPage.Replace('/', Path.DirectorySeparatorChar));
			if (File.Exists(candidate)) return candidate;
			dir = dir.Parent;
		}

		throw new FileNotFoundException(
			$"no page was named, and {SmokeTestPage} was not found above {AppContext.BaseDirectory} - " +
			"pass the built game's index.html, or run `npm run example:tower-defense:build` first"
		);
	}

	/// <summary>
	/// The page to load: the first argument when given, resolved against the directory this
	/// host was launched from, otherwise this repository's own smoke test. Either way the
	/// page's own folder becomes the virtual host's root, so it has to be the game's built
	/// `dist/` folder, not its source.
	/// </summary>
	private static string ResolveGamePage(string[] args)
	{
		if (args.Length > 0)
		{
			var page = Path.GetFullPath(args[0]);
			if (!File.Exists(page)) throw new FileNotFoundException($"the game page was not found: {page}");
			return page;
		}

		return FindSmokeTestPage();
	}

	[STAThread]
	private static void Main(string[] args)
	{
		ApplicationConfiguration.Initialize();

		string gamePage;
		try
		{
			gamePage = ResolveGamePage(args);
		}
		catch (FileNotFoundException error)
		{
			MessageBox.Show(error.Message, "mwg desktop host");
			return;
		}

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
			var pageName = Uri.EscapeDataString(Path.GetFileName(gamePage));
			webView.Source = new Uri($"https://mwg.local/{pageName}");
		};

		Application.Run(form);
	}
}
