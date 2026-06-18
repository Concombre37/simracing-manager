-- SimCenterManager CSP Lua app
-- Auto-starts AC when a server join is pending, handles remote commands, and streams telemetry.

local commandsDir = ac.getFolder(ac.FolderID.Documents) .. "/Assetto Corsa/cfg/SimCenterManager"
local commandFile = commandsDir .. "/command.txt"
local statusFile = commandsDir .. "/status.txt"
local joinFlagFile = commandsDir .. "/join.flag"
local stationFile = commandsDir .. "/station.txt"

local lastCommandId = nil
local joinAutoStartCooldown = 0

local telemetryEnabled = false
local telemetryCooldown = 0
local telemetryRate = 0.1
local telemetryUdp = nil
local telemetryHost = "127.0.0.1"
local telemetryPort = 19900
local cachedStationId = nil
local updateCount = 0
local lastMarkerAt = 0

local function writeMarkerFile(name, content)
  local f = io.open(commandsDir .. "/" .. name, "w")
  if f then
    f:write(tostring(content or os.time()))
    f:close()
  end
end

writeMarkerFile("lua_loaded.txt", os.time() .. " v2.0.24")

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

local function writeFileAtomic(path, content)
  local tmp = path .. ".tmp"
  local file = io.open(tmp, "w")
  if not file then
    ac.log("[SimCenterManager] Failed to open tmp file: " .. tmp)
    return false
  end
  file:write(content)
  file:close()

  -- Try atomic rename; on Windows this can fail if the target is opened by another process.
  pcall(function() os.remove(path) end)
  local ok = pcall(function() os.rename(tmp, path) end)
  if ok then return true end

  -- Fallback: direct overwrite.
  file = io.open(path, "w")
  if file then
    file:write(content)
    file:close()
    return true
  end

  ac.log("[SimCenterManager] Failed to write telemetry file: " .. path)
  return false
end

local function flagExists(path)
  local file = io.open(path, "r")
  if file then file:close() return true end
  return false
end

local function removeFlag(path)
  pcall(function() os.remove(path) end)
end

local function readStationId()
  if cachedStationId then return cachedStationId end
  local file = io.open(stationFile, "r")
  if not file then return nil end
  cachedStationId = file:read("*l") or ""
  file:close()
  cachedStationId = cachedStationId:gsub("^%s+", ""):gsub("%s+$", "")
  if cachedStationId == "" then cachedStationId = nil end
  return cachedStationId
end

local function toJson(value)
  local t = type(value)
  if t == "number" or t == "boolean" then
    return tostring(value)
  elseif t == "string" then
    return "\"" .. value:gsub('\\', '\\\\'):gsub('"', '\\"') .. "\""
  elseif t == "table" then
    local isArray = true
    local n = 0
    for k, _ in pairs(value) do
      n = n + 1
      if type(k) ~= "number" or k ~= n then
        isArray = false
        break
      end
    end
    local parts = {}
    if isArray then
      for _, v in ipairs(value) do
        table.insert(parts, toJson(v))
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      for k, v in pairs(value) do
        table.insert(parts, "\"" .. tostring(k) .. "\":" .. toJson(v))
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

local function ensureTelemetryUdp()
  if telemetryUdp then return true end
  local ok, socket = pcall(function() return require("socket").udp() end)
  if not ok or not socket then
    ac.log("[SimCenterManager] Failed to create UDP socket: " .. tostring(socket))
    return false
  end
  telemetryUdp = socket
  return true
end

local function sendTelemetry(sim, car)
  local stationId = readStationId()
  if not stationId then return end
  if not ensureTelemetryUdp() then return end

  local pos = car.position or { x = 0, y = 0, z = 0 }
  local payload = {
    stationId = stationId,
    timestamp = math.floor(sim.timestampMs or (os.time() * 1000)),
    isInMainMenu = sim.isInMainMenu == true,
    isSessionStarted = sim.isSessionStarted == true,
    isOnlineRace = sim.isOnlineRace == true,
    speedKmh = car.speedKmh or 0,
    rpm = car.rpm or 0,
    gear = car.gear or 0,
    throttle = car.gas or 0,
    brake = car.brake or 0,
    steering = car.steer or 0,
    lapTimeMs = car.lapTimeMs or car.lapTime or 0,
    lastLapMs = car.lastLapTimeMs or car.lastLapTime or 0,
    bestLapMs = car.bestLapTimeMs or car.bestLapTime or 0,
    lapCount = car.lapCount or 0,
    position = car.racePosition or car.position or 0,
    trackPosition = car.splinePosition or 0,
    worldPosition = { x = pos.x or 0, y = pos.y or 0, z = pos.z or 0 },
  }

  local ok, json = pcall(function() return toJson(payload) end)
  if not ok or not json then
    ac.log("[SimCenterManager] JSON encode failed: " .. tostring(json))
    return
  end

  -- Also persist to a file as a fallback / debug source.
  local fileOk = writeFileAtomic(commandsDir .. "/telemetry.json", json)
  if fileOk then
    ac.log("[SimCenterManager] Telemetry file written")
  else
    ac.log("[SimCenterManager] Telemetry file write failed")
  end

  local sent, err = pcall(function() telemetryUdp:sendto(json, telemetryHost, telemetryPort) end)
  if not sent then
    ac.log("[SimCenterManager] Telemetry UDP send error: " .. tostring(err))
  end
end

local function closeTelemetryUdp()
  if telemetryUdp then
    pcall(function() telemetryUdp:close() end)
    telemetryUdp = nil
  end
end

local function executeCommand(cmd)
  ac.log("SimCenterManager command: " .. tostring(cmd.type))
  if cmd.type == "autoStart" then
    pcall(function() ac.tryToStart(true) end)
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
  elseif cmd.type == "joinServer" then
    local host = cmd.host or "127.0.0.1"
    local port = tonumber(cmd.port) or 9600
    local password = cmd.password or ""
    ac.log("Joining server " .. host .. ":" .. tostring(port))
    if ac.joinOnlineRace then
      pcall(function() ac.joinOnlineRace(host, port, password) end)
    else
      pcall(function() ac.tryToStart(true) end)
    end
  end
end

ac.log("[SimCenterManager] Lua app loaded, version 2.0.24")

local function scriptUpdate(dt)
  local sim = ac.getSim()
  local carIndex = sim.focusedCar or 0
  local car = ac.getCar(carIndex)
  if not car and carIndex ~= 0 then
    car = ac.getCar(0)
    carIndex = 0
  end

  -- Auto-start when joining a server and AC has reached the main menu.
  if flagExists(joinFlagFile) then
    if sim.isInMainMenu then
      joinAutoStartCooldown = joinAutoStartCooldown - dt
      if joinAutoStartCooldown <= 0 then
        ac.log("[SimCenterManager] Join flag detected, auto-starting")
        pcall(function() ac.tryToStart(true) end)
        joinAutoStartCooldown = 0.5
      end
    elseif sim.isOnlineRace then
      -- We successfully joined the online race, remove the flag.
      removeFlag(joinFlagFile)
      joinAutoStartCooldown = 0
    end
  end

  -- Process remote commands from the agent.
  local cmd = parseCommand(commandFile)
  if cmd and cmd.id and cmd.id ~= lastCommandId then
    lastCommandId = cmd.id
    executeCommand(cmd)
  end

  -- Telemetry lifecycle: stream whenever the player is in a driving session.
  local isSession = not sim.isInMainMenu or (sim.isSessionStarted == true)
  local canStream = car ~= nil and isSession
  updateCount = updateCount + 1
  if updateCount - lastMarkerAt > 300 then
    lastMarkerAt = updateCount
    writeMarkerFile("lua_update.txt",
      updateCount ..
      " idx=" .. tostring(carIndex) ..
      " menu=" .. tostring(sim.isInMainMenu) ..
      " session=" .. tostring(sim.isSessionStarted) ..
      " online=" .. tostring(sim.isOnlineRace) ..
      " car=" .. tostring(car and true) ..
      " stream=" .. tostring(canStream))
  end
  if canStream then
    if not telemetryEnabled then
      telemetryEnabled = true
      telemetryCooldown = 0
      ac.log("[SimCenterManager] Telemetry enabled (in session). car=" .. tostring(car and true) .. " menu=" .. tostring(sim.isInMainMenu))
    end
  else
    if telemetryEnabled then
      telemetryEnabled = false
      closeTelemetryUdp()
      ac.log("[SimCenterManager] Telemetry disabled (main menu or no car). car=" .. tostring(car and true) .. " menu=" .. tostring(sim.isInMainMenu))
    end
  end

  if telemetryEnabled then
    telemetryCooldown = telemetryCooldown - dt
    if telemetryCooldown <= 0 then
      sendTelemetry(sim, car)
      telemetryCooldown = telemetryRate
    end
  end

  -- Report basic status back to the agent.
  writeStatus(statusFile, {
    inMainMenu = sim.isInMainMenu and 1 or 0,
    isOnlineRace = sim.isOnlineRace and 1 or 0,
    timestamp = os.time(),
  })
end

function script.update(dt)
  local ok, err = pcall(scriptUpdate, dt)
  if not ok then
    ac.log("[SimCenterManager] ERROR in script.update: " .. tostring(err))
    writeMarkerFile("lua_error.txt", tostring(err))
  end
end
