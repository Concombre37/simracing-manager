# ViGEmBus - Driver requis pour PressDriveKey

Le helper `PressDriveKey.exe` utilise [ViGEmBus](https://github.com/nefarius/ViGEmBus) pour creer une manette Xbox 360 virtuelle et envoyer un appui sur le bouton `A` a Assetto Corsa.

## Installation automatique

L'agent `sim-center-agent-win.exe` embarque l'installateur et installe le driver automatiquement au premier demarrage s'il est lance en **administrateur**.

## Installation manuelle

1. Telecharger l'installateur officiel :  
   <https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe>
2. Placer le fichier `ViGEmBus_1.22.0_x64_x86_arm64.exe` dans ce dossier.
3. Executer `install_vigembus.bat` en tant qu'administrateur.
4. Redemarrer le PC si le programme d'installation le demande.

## Verification

Dans PowerShell en administrateur :

```powershell
Get-Service -Name ViGEmBus
```

Le service doit etre present et en cours d'execution (`Running`).

## Liens

- Repository officiel : <https://github.com/nefarius/ViGEmBus>
- Derniere release : <https://github.com/nefarius/ViGEmBus/releases/latest>
