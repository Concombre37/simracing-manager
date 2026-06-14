local sim = ac.getSim()
local sessionStateFile = ac.getFolder(ac.FolderID.ACApps) .. '/../../SimCenter/session_state.json'

local clientName = 'SimCenter'
local sessionEndTime = 0
local lastCheck = 0

function readSessionState()
    local f = io.open(sessionStateFile, 'r')
    if f then
        local content = f:read('*all')
        f:close()
        local ok, data = pcall(function() return JSON.decode(content) end)
        if ok and data then
            clientName = data.clientName or 'SimCenter'
            sessionEndTime = data.endTime or 0
        end
    end
end

function simcenterMain()
    if sim.time - lastCheck > 5 then
        readSessionState()
        lastCheck = sim.time
    end

    local remaining = math.max(0, sessionEndTime - os.time())
    local minutes = math.floor(remaining / 60)
    local seconds = remaining % 60

    ui.beginTransparentWindow('SimCenterOverlay', vec2(50, 50), vec2(400, 120))
    ui.beginOutline()

    ui.pushFont(ui.Font.Huge)
    ui.text('SIM CENTER')
    ui.popFont()

    ui.pushFont(ui.Font.Title)
    ui.text('Pilote: ' .. clientName)
    ui.text(string.format('Temps restant: %02d:%02d', minutes, seconds))
    ui.popFont()

    ui.endOutline(rgbm(0, 0, 0, 1), 2)
    ui.endTransparentWindow()
end
