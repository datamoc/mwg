using System;
using System.IO;
using System.Windows;

namespace MwgDesktop;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length != 1)
        {
            MessageBox.Show("Pass the built game's index.html as the only argument.", "mwg desktop host");
            return;
        }

        var page = Path.GetFullPath(args[0]);
        if (!File.Exists(page))
        {
            MessageBox.Show($"Game page was not found:\n{page}", "mwg desktop host");
            return;
        }

        var app = new Application();
        app.Run(new MainWindow(new Uri(page)));
    }
}
