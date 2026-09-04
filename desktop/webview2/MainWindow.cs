using System;
using System.Windows;
using Microsoft.Web.WebView2.Wpf;

namespace MwgDesktop;

internal sealed class MainWindow : Window
{
    public MainWindow(Uri gamePage)
    {
        Title = "mwg game";
        Width = 1280;
        Height = 800;
        MinWidth = 640;
        MinHeight = 480;

        var browser = new WebView2();
        Content = browser;
        Loaded += async (_, _) =>
        {
            await browser.EnsureCoreWebView2Async();
            browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.Source = gamePage;
        };
    }
}
