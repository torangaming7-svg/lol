local M = {}

local MAX_SAMPLES = 8000

local PAIRS = {
  {"ciOcc_chest_c", "p7l", 0.3708},
  {"ciOcc_chest_l", "p7l", 0.2314},
  {"ciOcc_pelvis_c", "p3l", 0.4575},
  {"ciOcc_pelvis_c", "ciOcc_chest_c", 0.4427},
  {"ciOcc_pelvis_front", "ciOcc_pelvis_back", 0.3298},
  {"ciOcc_chest_front", "ciOcc_chest_back", 0.3396},
  {"ciOcc_pelvis_front", "ciOcc_chest_front", 0.4460},
  {"ciOcc_pelvis_back", "ciOcc_chest_back", 0.4494},
}

_G.ciDepthProbe = _G.ciDepthProbe or {
  recording = false,
  buffer = {},
  tElapsed = 0,
}

local nameToCid = nil

local function buildNameToCid()
  local t = {}
  for _, n in pairs(v.data.nodes) do
    if n.name then t[n.name] = n.cid end
  end
  return t
end

local function onPhysicsStep(dtPhys)
  local probe = _G.ciDepthProbe
  if not probe.recording then return end
  if #probe.buffer >= MAX_SAMPLES then
    probe.recording = false
    return
  end
  if not nameToCid then nameToCid = buildNameToCid() end
  probe.tElapsed = probe.tElapsed + dtPhys
  local sample = {t = probe.tElapsed}
  for i, p in ipairs(PAIRS) do
    local ca, cb = nameToCid[p[1]], nameToCid[p[2]]
    if ca and cb then
      local pa, pb = obj:getNodePosition(ca), obj:getNodePosition(cb)
      sample[i] = math.sqrt((pa.x - pb.x) ^ 2 + (pa.y - pb.y) ^ 2 + (pa.z - pb.z) ^ 2)
    end
  end
  table.insert(probe.buffer, sample)
end

local function onExtensionLoaded()
  enablePhysicsStepHook()
end

M.onExtensionLoaded = onExtensionLoaded
M.onPhysicsStep = onPhysicsStep

return M
