local SimCenterManager = {}
local commandsDir = ac.getFolder(ac.FolderID.Documents) .. "/Assetto Corsa/cfg/SimCenterManager"
local commandFile = commandsDir .. "/command.txt"
local statusFile = commandsDir .. "/status.txt"
local lastCommandId = nil

local function parseCommand(path)
  local file = io.open(path, "r")
  if not file then return nil end
  local data = {}
  for line in file:lines() do
    local key, value = line:match("^([^=]+)=(.*)$")
    if key then data[key] = value end
  end
  file:close()
  return data
end

local function writeStatus(path, data)
  local file = io.open(path, "w")
  if not file then return end
  for k, v in pairs(data) do
    file:write(k .. "=" .. tostring(v) .. "\n")
  end
  file:close()
end

function SimCenterManager.update(dt)
  local cmd = parseCommand(commandFile)
  if cmd and cmd.id and cmd.id ~= lastCommandId then
    lastCommandId = cmd.id
    SimCenterManager.execute(cmd)
  end

  writeStatus(statusFile, {
    inMainMenu = ac.getSim().isInMainMenu and 1 or 0,
    isOnlineRace = ac.getSim().isOnlineRace and 1 or 0,
    timestamp = os.time(),
  })
end

function SimCenterManager.execute(cmd)
  ac.log("SimCenterManager command: " .. tostring(cmd.type))
  if cmd.type == "autoStart" then
    ac.tryToStart(true)
  elseif cmd.type == "teleportToPits" then
    ac.tryToTeleportToPits()
  elseif cmd.type == "idealLine" then
    ac.trySimKeyPressCommand("Ideal Line")
  elseif cmd.type == "autoShifter" then
    ac.trySimKeyPressCommand("Auto Shifter")
  elseif cmd.type == "quit" then
    ac.shutdownAssettoCorsa()
  elseif cmd.type == "recenterVR" then
    for _ = 1, 4 do
      ac.recenterVR()
    end
  end
end

return SimCenterManager
