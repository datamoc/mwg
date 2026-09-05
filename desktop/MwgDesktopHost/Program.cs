using Microsoft.Web.WebView2.WinForms;

namespace MwgDesktopHost;

/// <summary>
/// A minimal WebView2 host for item 136 of ROADMAP.md: proving a game built by this project's
/// own vite/emit-page pipeline runs unmodified inside a native Windows shell, the same way
/// item 110 proved it inside a Capacitor shell.
///
/// This loads the built game's own index.html directly via a `file://` navigation - the
/// point being that nothing about the game's build changes for this host. It is a reference
/// and a build/run smoke test, not a shipping installer: no packaging, code signing, or
/// update mechanism is attempted here, per the item's own "start with a documented reference
/// host and build/run smoke test" scope.
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

		form.Load += (_, _) => webView.Source = new Uri(gamePage);

		Application.Run(form);
	}
}
