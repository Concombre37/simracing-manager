"""Execute the shipped CSP app in LuaJIT with strict API and in-memory files."""
from pathlib import Path
import unittest
from lupa.luajit21 import LuaRuntime


class AutoDriveTest(unittest.TestCase):
    def setUp(self):
        self.lua = LuaRuntime()
        self.lua.execute('''
          files = {}; logs = {}; clock = 0; starts = 0
          menu = true; online = true; failStart = false
          os.preciseClock = function() return clock end
          os.remove = function(p) files[p] = nil; return true end
          os.rename = function(a,b) files[b] = files[a]; files[a] = nil; return true end
          io.open = function(p, mode)
            if mode == 'r' and not files[p] then return nil end
            if mode == 'w' then files[p] = '' end
            return {
              write = function(_, s) files[p] = files[p] .. s end,
              close = function() end,
              read = function() return files[p] end,
              lines = function() return string.gmatch(files[p], '[^\\n]+') end
            }
          end
          sim = setmetatable({}, {__index = function(_, k)
            if k == 'isInMainMenu' then return menu end
            if k == 'isOnlineRace' then return online end
            if k == 'focusedCar' then return 0 end
            if k == 'timestampMs' then return clock * 1000 end
            error('StateSim has no member ' .. k)
          end})
          ac = {
            FolderID = {Documents = 1}, getFolder = function() return '/docs' end,
            getSim = function() return sim end, getCar = function() return {} end,
            log = function(s) table.insert(logs, s) end,
            tryToStart = function()
              starts = starts + 1
              if failStart then error('Drive unavailable') end
            end
          }
          package.preload['socket'] = function() return {udp = function()
            return {sendto = function() end, close = function() end}
          end} end
          script = {}
          base = '/docs/Assetto Corsa/cfg/SimCenterManager/'
          files[base .. 'join.flag'] = '1'
          files[base .. 'station.txt'] = 'pod01'
        ''')
        self.lua.execute((Path(__file__).parents[1] / 'lua_app/SimCenterManager/SimCenterManager.lua').read_text(encoding='utf-8'))

    def tick(self, time):
        self.lua.globals().clock = time
        self.lua.execute('script.update(0)')

    def test_online_menu_retries_with_zero_simulation_dt(self):
        for time in [0, .1, .5, 1]:
            self.tick(time)
        self.assertEqual(self.lua.globals().starts, 3)
        self.assertTrue(self.lua.eval("files[base .. 'join.flag'] ~= nil"))
        self.assertIsNone(self.lua.eval("files[base .. 'lua_error.txt']"))

    def test_transient_menu_exit_does_not_cancel_drive(self):
        self.tick(0)
        self.lua.globals().menu = False
        self.tick(.1)
        self.lua.globals().menu = True
        self.tick(.6)
        self.assertEqual(self.lua.globals().starts, 2)
        self.lua.globals().menu = False
        self.tick(1)
        self.tick(2.1)
        self.assertIsNone(self.lua.eval("files[base .. 'join.flag']"))
        self.assertIsNone(self.lua.eval("files[base .. 'lua_error.txt']"))
        self.assertIsNotNone(self.lua.eval("files[base .. 'telemetry.json']"))
        self.lua.globals().menu = True
        self.tick(3)
        self.assertEqual(self.lua.globals().starts, 2)

    def test_drive_failure_is_reported_and_retried(self):
        self.lua.globals().failStart = True
        self.tick(0)
        self.assertIn('Drive unavailable', self.lua.eval("files[base .. 'lua_error.txt']"))
        self.lua.globals().failStart = False
        self.tick(.5)
        self.assertEqual(self.lua.globals().starts, 2)


if __name__ == '__main__':
    unittest.main()
