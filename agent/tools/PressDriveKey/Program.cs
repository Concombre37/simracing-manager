using Nefarius.ViGEm.Client;
using Nefarius.ViGEm.Client.Targets.Xbox360;
using System.Runtime.InteropServices;

namespace PressDriveKey;

class Program
{
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    static int Main(string[] args)
    {
        var options = Options.Parse(args);
        try
        {
            Log(options.LogPath, $"Demarrage de PressDriveKey (args: {string.Join(' ', args)})");

            using var client = new ViGEmClient();
            var controller = client.CreateXbox360Controller();
            controller.Connect();
            Log(options.LogPath, "Manette Xbox 360 virtuelle connectee (ViGEmBus).");

            // Attente de la fenetre Assetto Corsa
            IntPtr hwnd = IntPtr.Zero;
            Log(options.LogPath, $"Attente de la fenetre '{options.WindowTitle}'...");
            for (int i = 0; i < options.WindowTimeoutSec; i++)
            {
                hwnd = FindWindow(null, options.WindowTitle);
                if (hwnd != IntPtr.Zero)
                {
                    Log(options.LogPath, $"Fenetre trouvee apres {i}s.");
                    break;
                }
                Thread.Sleep(1000);
            }

            if (hwnd == IntPtr.Zero)
            {
                Log(options.LogPath, $"ERREUR: fenetre '{options.WindowTitle}' non trouvee apres {options.WindowTimeoutSec}s.");
                return 1;
            }

            // Delai supplementaire pour le chargement du circuit
            if (options.DelayMs > 0)
            {
                Log(options.LogPath, $"Attente {options.DelayMs}ms avant d'appuyer...");
                Thread.Sleep(options.DelayMs);
            }

            // Appuis repetes sur le bouton A
            for (int i = 0; i < options.Repeat; i++)
            {
                Log(options.LogPath, $"Appui sur A ({i + 1}/{options.Repeat}).");
                controller.SetButtonState(Xbox360Button.A, true);
                Thread.Sleep(options.PressMs);
                controller.SetButtonState(Xbox360Button.A, false);

                if (i < options.Repeat - 1)
                {
                    Thread.Sleep(options.IntervalMs);
                }
            }

            Log(options.LogPath, "Sequence terminee avec succes.");
            return 0;
        }
        catch (Exception ex)
        {
            Log(options.LogPath, $"ERREUR: {ex}");
            return 1;
        }
    }

    static void Log(string? logPath, string message)
    {
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [PressDriveKey] {message}";
        try
        {
            Console.WriteLine(line);
        }
        catch { }

        if (!string.IsNullOrWhiteSpace(logPath))
        {
            try
            {
                File.AppendAllText(logPath, line + Environment.NewLine);
            }
            catch { }
        }
    }

    record Options(
        string WindowTitle = "Assetto Corsa",
        int WindowTimeoutSec = 120,
        int DelayMs = 25000,
        int PressMs = 300,
        int Repeat = 3,
        int IntervalMs = 2000,
        string? LogPath = null
    )
    {
        public static Options Parse(string[] args)
        {
            var options = new Options();
            for (int i = 0; i < args.Length; i++)
            {
                var arg = args[i].ToLowerInvariant();
                switch (arg)
                {
                    case "--window":
                        if (i + 1 < args.Length) options = options with { WindowTitle = args[++i] };
                        break;
                    case "--window-timeout":
                        if (i + 1 < args.Length && int.TryParse(args[++i], out var wt)) options = options with { WindowTimeoutSec = wt };
                        break;
                    case "--delay":
                        if (i + 1 < args.Length && int.TryParse(args[++i], out var d)) options = options with { DelayMs = d };
                        break;
                    case "--press":
                        if (i + 1 < args.Length && int.TryParse(args[++i], out var p)) options = options with { PressMs = p };
                        break;
                    case "--repeat":
                        if (i + 1 < args.Length && int.TryParse(args[++i], out var r)) options = options with { Repeat = r };
                        break;
                    case "--interval":
                        if (i + 1 < args.Length && int.TryParse(args[++i], out var iv)) options = options with { IntervalMs = iv };
                        break;
                    case "--log":
                        if (i + 1 < args.Length) options = options with { LogPath = args[++i] };
                        break;
                }
            }
            return options;
        }
    }
}
