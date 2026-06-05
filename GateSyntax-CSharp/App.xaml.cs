using System;
using System.IO;
using System.Windows;

namespace GateSyntax;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var uiDir = Path.Combine(AppContext.BaseDirectory, "UI");
        if (!Directory.Exists(uiDir))
            uiDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "UI");

        var window = GateSyntaxBuilder.FromDirectory(uiDir).Build();
        window.Show();
        MainWindow = window;
    }
}
