# PressDriveKey

Helper Windows qui cree une manette Xbox 360 virtuelle via [ViGEmBus](https://github.com/nefarius/ViGEmBus) et appuie sur le bouton `A` pour faire disparaitre l'ecran "volant rouge" d'Assetto Corsa.

## Prerequis

- SDK .NET 6.0 ou plus : <https://dotnet.microsoft.com/download>
- Driver ViGEmBus installe sur le poste (voir `../ViGEmBus/`).

## Compilation

### Avec PowerShell

```powershell
cd agent/tools/PressDriveKey
.\publish.ps1
```

### Avec le batch

```batch
cd agent/tools/PressDriveKey
publish.bat
```

### Manuellement

```bash
cd agent/tools/PressDriveKey
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o ../../tools
```

Le binaire `PressDriveKey.exe` est genere dans `agent/tools/` et automatiquement embraque dans l'agent final par `pkg`.

## Utilisation

```batch
PressDriveKey.exe --window "Assetto Corsa" --delay 25000 --press 300 --repeat 3 --interval 2000 --log "C:\logs\press.log"
```

## Arguments

| Argument | Description | Defaut |
|----------|-------------|--------|
| `--window` | Titre de la fenetre a attendre | `Assetto Corsa` |
| `--window-timeout` | Timeout d'attente de la fenetre (s) | `120` |
| `--delay` | Delai apres detection de la fenetre (ms) | `25000` |
| `--press` | Duree de l'appui sur le bouton (ms) | `300` |
| `--repeat` | Nombre d'appuis | `3` |
| `--interval` | Intervalle entre deux appuis (ms) | `2000` |
| `--log` | Fichier de log | - |
