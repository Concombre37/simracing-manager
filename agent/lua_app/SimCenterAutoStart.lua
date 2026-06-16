-- SimCenter AutoStart
-- Passe automatiquement l'ecran "volant rouge" / "appuyez sur une touche"
-- en appelant ac.tryToStart() quand l'agent demande un lancement.

local userProfile = os.getenv("USERPROFILE") or ""
local flagPath = userProfile .. "\\Documents\\Assetto Corsa\\cfg\\simcenter_autostart.flag"

local cooldown = 0

function script.update(dt)
  if cooldown > 0 then
    cooldown = cooldown - dt
    return
  end

  local sim = ac.getSim()
  if not sim.isInMainMenu then
    return
  end

  local f = io.open(flagPath, "r")
  if not f then
    return
  end
  f:close()

  ac.log("[SimCenterAutoStart] Flag detecte, appel de ac.tryToStart(true)")
  local ok, err = pcall(function()
    ac.tryToStart(true)
  end)
  if not ok then
    ac.log("[SimCenterAutoStart] ac.tryToStart a echoue : " .. tostring(err))
  end

  -- Supprime le flag pour eviter les declenchements multiples
  local ok2, err2 = pcall(function()
    os.remove(flagPath)
  end)
  if not ok2 then
    ac.log("[SimCenterAutoStart] Suppression du flag impossible : " .. tostring(err2))
  end

  cooldown = 2
end
