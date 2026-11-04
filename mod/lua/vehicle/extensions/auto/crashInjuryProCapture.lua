local M = {}

local moduleActive = true
local moduleInactiveReason = nil

local STANDARD_GRAVITY_M_S2 = 9.80665

local CAPTURE_ON_PEAK_THRESHOLD_G = 5.0

local CAPTURE_ON_ONSET_RATE_G_PER_S = 220

local ONSET_WINDOW_SAMPLES = 20

local TRIGGER_CONFIRM_STEPS = 6

local PULSE_END_RESULTANT_G = 1.5
local PULSE_END_DEBOUNCE_S = 0.10

local STOP_SPEED_THRESHOLD_MS = 0.3
local STOP_DEBOUNCE_S = 0.5

local MAX_SAMPLES = 16000

local MAX_CHUNK_DURATION_S = 0.35

local KNOCKOUT_TRIGGER_PEAK_G = 26.0

local KNOCKOUT_RESET_G = 3.0

local knockoutArmed = true

local SHAKE_TRIGGER_MIN_G = 2.0

local SHAKE_RESET_G = 1.5

local SHAKE_PEAK_TRACK_STEPS = 40

local shakeArmed = true
local shakeTracking = false
local shakeTrackSteps = 0
local shakePeakG = 0
local shakePeakGx = 0
local shakePeakGy = 0

local shakePeakGz = 0

local function resetShakeTracking()
  shakeArmed = true
  shakeTracking = false
  shakeTrackSteps = 0
  shakePeakG = 0
  shakePeakGx = 0
  shakePeakGy = 0
  shakePeakGz = 0
end

local function instantPdofDeg(gx, gy)
  local bearingDeg = math.atan2(-gy, gx) * 180 / math.pi
  local pdofDeg = (bearingDeg + 180) % 360
  if pdofDeg < 0 then pdofDeg = pdofDeg + 360 end
  return pdofDeg
end

local function sendShakeTrigger()
  local pdofDeg = instantPdofDeg(shakePeakGx, shakePeakGy)
  obj:queueGameEngineLua(string.format(
    'extensions.crashInjuryPro.onImpactShakeRaw(%d, %.2f, %.3f, %.3f, %.6f)',
    obj:getId(), pdofDeg, shakePeakG, shakePeakGz, os.clockhp()))
end

local INTRUSION_NODE_SEARCH_RADIUS_M = 1.2

local INTRUSION_CAPTURE_TRIGGER_DEPTH_M = 0.04

local intrusionRoofNodeIds, intrusionDoorNodeIds, intrusionDashNodeIds = {}, {}, {}
local intrusionSeatCentroid = nil
local intrusionTrackingAvailable = false

local function nodeGroupContainsSubstring(node, substrLower)
  local g = node.group
  if type(g) == 'table' then
    for _, name in pairs(g) do
      if type(name) == 'string' and string.find(string.lower(name), substrLower, 1, true) then
        return true
      end
    end
    return false
  elseif type(g) == 'string' then
    return string.find(string.lower(g), substrLower, 1, true) ~= nil
  end
  return false
end

local GROUP_SAMPLE_LIMIT = 12
local function sampleAllGroupNames(nodeCount)
  local seen = {}
  local out = {}
  for i = 0, nodeCount - 1 do
    local node = v.data.nodes[i]
    if node then
      local g = node.group
      if type(g) == 'table' then
        for _, name in pairs(g) do
          if type(name) == 'string' and name ~= '' and not seen[name] then
            seen[name] = true
            out[#out + 1] = name
            if #out >= GROUP_SAMPLE_LIMIT then return out end
          end
        end
      elseif type(g) == 'string' and g ~= '' and not seen[g] then
        seen[g] = true
        out[#out + 1] = g
        if #out >= GROUP_SAMPLE_LIMIT then return out end
      end
    end
  end
  return out
end

local function classifyIntrusionNodes()
  intrusionRoofNodeIds, intrusionDoorNodeIds, intrusionDashNodeIds = {}, {}, {}
  intrusionTrackingAvailable = false

  local ok, nodeCount = pcall(function() return obj:getNodeCount() end)
  if not ok or not nodeCount or nodeCount == 0 or not v or not v.data or not v.data.nodes then
    log('W', 'crashInjuryProCapture', string.format(
      'INTRUSION: tracking unavailable -- obj:getNodeCount()/v.data.nodes not accessible on this vehicle (ok=%s nodeCount=%s).',
      tostring(ok), tostring(nodeCount)))
    return
  end

  local seatSumX, seatSumY, seatSumZ, seatCount = 0, 0, 0, 0
  local roofCandidates, doorCandidates, dashCandidates = {}, {}, {}

  for i = 0, nodeCount - 1 do
    local node = v.data.nodes[i]
    if node and node.pos then
      if nodeGroupContainsSubstring(node, 'seat') then
        seatSumX, seatSumY, seatSumZ = seatSumX + node.pos.x, seatSumY + node.pos.y, seatSumZ + node.pos.z
        seatCount = seatCount + 1
      end
      if nodeGroupContainsSubstring(node, 'roof') then roofCandidates[#roofCandidates + 1] = i end
      if nodeGroupContainsSubstring(node, 'door') then doorCandidates[#doorCandidates + 1] = i end
      if nodeGroupContainsSubstring(node, 'dash') then dashCandidates[#dashCandidates + 1] = i end
    end
  end

  log('I', 'crashInjuryProCapture', string.format(
    'INTRUSION: raw node-group scan (BEFORE the occupant-radius filter, %d total nodes on this vehicle) -- seat=%d roof=%d door=%d dash=%d candidates found by substring match.',
    nodeCount, seatCount, #roofCandidates, #doorCandidates, #dashCandidates))

  if seatCount == 0 then
    local sample = sampleAllGroupNames(nodeCount)
    log('W', 'crashInjuryProCapture', 'INTRUSION: tracking unavailable -- no node group tag on this vehicle contains "seat", cannot locate an occupant reference point. '
      .. 'Sample of this vehicle\'s own group tags (up to ' .. GROUP_SAMPLE_LIMIT .. '), to check the real naming convention: ' .. table.concat(sample, ', '))

    log('W', 'crashInjuryProCapture', 'INTRUSION: NOT-WIRED RELAY -- the GE side classified this vehicle correctly before cleanup, but the vehicle side never requests that data and exposes no receiveGroupClassification() to receive it. Intrusion is therefore inert on this vehicle regardless of how hard it is crushed. Known gap, tracked separately -- not a fault in this load.')
    return
  end

  local ox, oy, oz = seatSumX / seatCount, seatSumY / seatCount, seatSumZ / seatCount

  intrusionSeatCentroid = { x = ox, y = oy, z = oz }
  local radiusSq = INTRUSION_NODE_SEARCH_RADIUS_M * INTRUSION_NODE_SEARCH_RADIUS_M

  local function keepWithinRadius(candidates, out)
    for _, i in ipairs(candidates) do
      local p = v.data.nodes[i].pos
      local dx, dy, dz = p.x - ox, p.y - oy, p.z - oz
      if (dx * dx + dy * dy + dz * dz) <= radiusSq then out[#out + 1] = i end
    end
  end
  keepWithinRadius(roofCandidates, intrusionRoofNodeIds)
  keepWithinRadius(doorCandidates, intrusionDoorNodeIds)
  keepWithinRadius(dashCandidates, intrusionDashNodeIds)

  intrusionTrackingAvailable = (#intrusionRoofNodeIds > 0) or (#intrusionDoorNodeIds > 0) or (#intrusionDashNodeIds > 0)

  log('I', 'crashInjuryProCapture', string.format(
    'INTRUSION: occupant reference point = (%.3f, %.3f, %.3f) [vehicle-local, averaged from %d "seat"-tagged node spawn positions].',
    ox, oy, oz, seatCount))

  if #roofCandidates > 0 and #intrusionRoofNodeIds == 0 then
    log('W', 'crashInjuryProCapture', string.format('INTRUSION: %d roof-tagged node(s) found, but NONE within %.1fm of the occupant reference point -- radius filter is excluding all of them.', #roofCandidates, INTRUSION_NODE_SEARCH_RADIUS_M))
  end
  if #doorCandidates > 0 and #intrusionDoorNodeIds == 0 then
    log('W', 'crashInjuryProCapture', string.format('INTRUSION: %d door-tagged node(s) found, but NONE within %.1fm of the occupant reference point -- radius filter is excluding all of them.', #doorCandidates, INTRUSION_NODE_SEARCH_RADIUS_M))
  end
  if #dashCandidates > 0 and #intrusionDashNodeIds == 0 then
    log('W', 'crashInjuryProCapture', string.format('INTRUSION: %d dash-tagged node(s) found, but NONE within %.1fm of the occupant reference point -- radius filter is excluding all of them.', #dashCandidates, INTRUSION_NODE_SEARCH_RADIUS_M))
  end
  if #roofCandidates == 0 then
    local sample = sampleAllGroupNames(nodeCount)
    log('W', 'crashInjuryProCapture', 'INTRUSION: zero nodes with a group tag containing "roof" anywhere on this vehicle. Sample of its real group tags: ' .. table.concat(sample, ', '))
  end
  if #doorCandidates == 0 then
    local sample = sampleAllGroupNames(nodeCount)
    log('W', 'crashInjuryProCapture', 'INTRUSION: zero nodes with a group tag containing "door" anywhere on this vehicle. Sample of its real group tags: ' .. table.concat(sample, ', '))
  end
  if #dashCandidates == 0 then
    local sample = sampleAllGroupNames(nodeCount)
    log('W', 'crashInjuryProCapture', 'INTRUSION: zero nodes with a group tag containing "dash" anywhere on this vehicle. Sample of its real group tags: ' .. table.concat(sample, ', '))
  end

  log('I', 'crashInjuryProCapture', string.format(
    'INTRUSION: node classification FINAL (after %.1fm occupant-radius filter): roof=%d door=%d dash=%d tracked nodes -- tracking %s',
    INTRUSION_NODE_SEARCH_RADIUS_M, #intrusionRoofNodeIds, #intrusionDoorNodeIds, #intrusionDashNodeIds,
    intrusionTrackingAvailable and 'ENABLED' or 'DISABLED (no matching roof/door/dash nodes found near the occupant reference point)'))
end

local roofPeakDepthM, roofPeakVelocityMs = 0, 0
local doorPeakDepthM, doorPeakVelocityMs = 0, 0
local dashPeakDepthM, dashPeakVelocityMs = 0, 0
local prevRoofDepthM, prevDoorDepthM, prevDashDepthM = 0, 0, 0

local function resetIntrusionTracking()
  roofPeakDepthM, roofPeakVelocityMs = 0, 0
  doorPeakDepthM, doorPeakVelocityMs = 0, 0
  dashPeakDepthM, dashPeakVelocityMs = 0, 0
  prevRoofDepthM, prevDoorDepthM, prevDashDepthM = 0, 0, 0
end

local function trackNodeGroupIntrusion(nodeIds, prevDepthM, peakDepthM, peakVelocityMs, dtPhys)
  local n = #nodeIds
  if n == 0 then return prevDepthM, peakDepthM, peakVelocityMs end
  local sumDx, sumDy, sumDz = 0, 0, 0
  for _, cid in ipairs(nodeIds) do
    local spawn = v.data.nodes[cid].pos
    local live = obj:getNodePosition(cid)
    sumDx = sumDx + (live.x - spawn.x)
    sumDy = sumDy + (live.y - spawn.y)
    sumDz = sumDz + (live.z - spawn.z)
  end
  local dx, dy, dz = sumDx / n, sumDy / n, sumDz / n
  local depthM = math.sqrt(dx * dx + dy * dy + dz * dz)
  if depthM > peakDepthM then peakDepthM = depthM end
  if dtPhys > 0 then
    local velocityMs = math.abs(depthM - prevDepthM) / dtPhys
    if velocityMs > peakVelocityMs then peakVelocityMs = velocityMs end
  end
  return depthM, peakDepthM, peakVelocityMs
end

local crushZones = {
  available = false,
  names = { 'FL', 'FR', 'RL', 'RR', 'SFL', 'SFR', 'SRL', 'SRR', 'ROOFL', 'ROOFR', 'GHL', 'GHR', 'ROOFRL', 'ROOFRR', 'FC', 'RC', 'TPL', 'TPR' },
  nodes = {},
  spawn = {},
  axis = {},
  last = {},
  lengthM = 0, widthM = 0,
  BAND_M = 0.55,
  SIDE_BAND_M = 0.32,
  ROOF_BAND_M = 0.20,

  GH_BAND_M = 0.40,

  TP_AHEAD_M = 0.40,
  TP_BEHIND_M = 1.05,
  TP_FLAP_VERTICAL_M = 0.60,
  MAX_NODES_PER_ZONE = 24,
  PERCENTILE = 0.70,

  SIDE_PERCENTILE = 0.85,
  FLAP_VERTICAL_M = 0.35,
}

local function crushVec(p) return { x = p.x, y = p.y, z = p.z } end
local function crushSub(a, b) return { x = a.x - b.x, y = a.y - b.y, z = a.z - b.z } end
local function crushDot(a, b) return a.x * b.x + a.y * b.y + a.z * b.z end
local function crushCross(a, b)
  return { x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x }
end
local function crushNorm(a)
  local m = math.sqrt(crushDot(a, a))
  if m < 1e-6 then return nil end
  return { x = a.x / m, y = a.y / m, z = a.z / m }
end

function crushZones.frame(refP, backP, upP)
  local fwd = crushNorm(crushSub(refP, backP))
  local upRaw = crushSub(upP, refP)
  if not fwd then return nil end
  local k = crushDot(upRaw, fwd)
  local up = crushNorm({ x = upRaw.x - fwd.x * k, y = upRaw.y - fwd.y * k, z = upRaw.z - fwd.z * k })
  if not up then return nil end
  return { origin = refP, fwd = fwd, left = crushCross(up, fwd), up = up }
end

function crushZones.project(fr, p)
  local d = crushSub(p, fr.origin)
  return crushDot(d, fr.fwd), crushDot(d, fr.left), crushDot(d, fr.up)
end

function crushZones.classify()
  local cz = crushZones
  cz.available = false
  cz.nodes, cz.spawn, cz.last = {}, {}, {}
  cz.hold = {}
  local ok, err = pcall(function()
    local nodeCount = obj:getNodeCount()
    local refs = v.data.refNodes and v.data.refNodes[0]
    if not nodeCount or nodeCount == 0 or not refs or not v.data.nodes then
      error('no nodes or reference nodes')
    end
    local N = v.data.nodes
    cz.refCid, cz.backCid, cz.upCid = refs.ref, refs.back, refs.up
    local fr = cz.frame(crushVec(N[refs.ref].pos), crushVec(N[refs.back].pos), crushVec(N[refs.up].pos))
    if not fr then error('degenerate reference frame') end

    local function dist(a, b) local d = crushSub(crushVec(a), crushVec(b)); return math.sqrt(crushDot(d, d)) end
    cz.refDist = { dist(N[refs.ref].pos, N[refs.back].pos), dist(N[refs.ref].pos, N[refs.up].pos), dist(N[refs.back].pos, N[refs.up].pos) }

    local wheelBalls = {}
    if v.data.wheels then
      for _, w in pairs(v.data.wheels) do
        if type(w) == 'table' and w.node1 and w.node2 and N[w.node1] and N[w.node2] then
          local a, b = N[w.node1].pos, N[w.node2].pos
          local r = (tonumber(w.radius) or 0.35) + 0.10
          wheelBalls[#wheelBalls + 1] = { x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, z = (a.z + b.z) / 2, r2 = r * r }
        end
      end
    end

    local pts = {}
    local fMin, fMax = math.huge, -math.huge
    local ls, us = {}, {}
    for cid = 0, nodeCount - 1 do
      local node = N[cid]
      if node and node.pos and node.wheelID == nil and cid ~= refs.ref and cid ~= refs.back and cid ~= refs.up then
        local p = node.pos
        local inWheel = false
        for _, wb in ipairs(wheelBalls) do
          local dx, dy, dz = p.x - wb.x, p.y - wb.y, p.z - wb.z
          if dx * dx + dy * dy + dz * dz <= wb.r2 then inWheel = true break end
        end
        if not inWheel then
          local f, l, u = cz.project(fr, crushVec(p))
          pts[#pts + 1] = { cid = cid, f = f, l = l, u = u }
          if f < fMin then fMin = f end
          if f > fMax then fMax = f end
          ls[#ls + 1] = l
          us[#us + 1] = u
        end
      end
    end
    if #pts < 20 then error('only ' .. #pts .. ' usable body nodes') end

    table.sort(ls)
    local lLeft = ls[math.max(1, math.floor(#ls * 0.97))]
    local lRight = ls[math.max(1, math.ceil(#ls * 0.03))]
    local lCentre = (lLeft + lRight) / 2
    cz.lCentre = lCentre
    local halfW = (lLeft - lRight) / 2
    cz.lengthM, cz.widthM = fMax - fMin, lLeft - lRight

    local fMid = (fMin + fMax) / 2
    local sideSplit = fMid - 0.30
    local centreGap = 0.15 * halfW

    table.sort(us)
    local uTop = us[math.max(1, math.floor(#us * 0.97))]
    local lenM = fMax - fMin
    local roofFront, roofRear = fMid + 0.22 * lenM, fMid - 0.25 * lenM
    local ghFront, ghRear = fMid + 0.25 * lenM, fMid - 0.05 * lenM

    local tpAxle = {}
    for _, wb in ipairs(wheelBalls) do
      local wf, wl = cz.project(fr, { x = wb.x, y = wb.y, z = wb.z })
      if wf > fMid then
        local key = (wl - lCentre) >= 0 and 'L' or 'R'
        if tpAxle[key] == nil or wf > tpAxle[key] then tpAxle[key] = wf end
      end
    end
    local buckets = {}
    for _, name in ipairs(cz.names) do buckets[name] = {} end
    for _, q in ipairs(pts) do
      local lr = q.l - lCentre
      local left = lr > centreGap
      local right = lr < -centreGap
      if (left or right) and q.f >= sideSplit and q.u < uTop - cz.GH_BAND_M then
        local ax = tpAxle[left and 'L' or 'R']
        local fHi = ax and (ax - cz.TP_AHEAD_M) or (fMid + 0.24 * lenM)
        local fLo = ax and (ax - cz.TP_BEHIND_M) or (fMid + 0.10 * lenM)
        if q.f <= fHi and q.f >= fLo then
          local b = left and buckets.TPL or buckets.TPR
          b[#b + 1] = q
        end
      end
      if q.u >= uTop - cz.ROOF_BAND_M and q.f <= roofFront and q.f >= roofRear then

        if q.f >= sideSplit then
          if left then buckets.ROOFL[#buckets.ROOFL + 1] = q elseif right then buckets.ROOFR[#buckets.ROOFR + 1] = q end
        else
          if left then buckets.ROOFRL[#buckets.ROOFRL + 1] = q elseif right then buckets.ROOFRR[#buckets.ROOFRR + 1] = q end
        end
      elseif q.u >= uTop - cz.GH_BAND_M and q.f <= ghFront and q.f >= ghRear then
        if left then buckets.GHL[#buckets.GHL + 1] = q elseif right then buckets.GHR[#buckets.GHR + 1] = q end
      elseif q.f >= fMax - cz.BAND_M then
        if left then buckets.FL[#buckets.FL + 1] = q elseif right then buckets.FR[#buckets.FR + 1] = q end

        if math.abs(lr) <= 0.45 * halfW then buckets.FC[#buckets.FC + 1] = q end
      elseif q.f <= fMin + cz.BAND_M then
        if left then buckets.RL[#buckets.RL + 1] = q elseif right then buckets.RR[#buckets.RR + 1] = q end
        if math.abs(lr) <= 0.45 * halfW then buckets.RC[#buckets.RC + 1] = q end
      else
        local nearLeft = q.l >= lLeft - cz.SIDE_BAND_M
        local nearRight = q.l <= lRight + cz.SIDE_BAND_M
        local frontHalf = q.f >= sideSplit
        if nearLeft then
          local b = frontHalf and buckets.SFL or buckets.SRL
          b[#b + 1] = q
        elseif nearRight then
          local b = frontHalf and buckets.SFR or buckets.SRR
          b[#b + 1] = q
        end
      end
    end
    cz.axis = { TPL = 'f+', TPR = 'f+', FC = 'f+', RC = 'f-', FL = 'f+', FR = 'f+', RL = 'f-', RR = 'f-', SFL = 'l+', SRL = 'l+', SFR = 'l-', SRR = 'l-',
      ROOFL = 'u-', ROOFR = 'u-', GHL = 'gh', GHR = 'gh', ROOFRL = 'u-', ROOFRR = 'u-' }
    local counts = {}
    for _, name in ipairs(cz.names) do
      local b = buckets[name]

      local ax = cz.axis[name]
      table.sort(b, function(p1, p2)
        if ax == 'f+' then return p1.f > p2.f end
        if ax == 'f-' then return p1.f < p2.f end
        if ax == 'l+' then return p1.l > p2.l end
        if ax == 'u-' then return p1.u > p2.u end
        if ax == 'gh' then return (p1.f + p1.u) > (p2.f + p2.u) end
        return p1.l < p2.l
      end)
      local keepIds, keepSpawn = {}, {}
      local stride = math.max(1, #b / cz.MAX_NODES_PER_ZONE)
      local idx = 1
      while idx <= #b and #keepIds < cz.MAX_NODES_PER_ZONE do
        local q = b[math.floor(idx)]
        keepIds[#keepIds + 1] = q.cid
        keepSpawn[#keepSpawn + 1] = { f = q.f, l = q.l, u = q.u }
        idx = idx + stride
      end
      cz.nodes[name], cz.spawn[name], cz.last[name] = keepIds, keepSpawn, 0
      counts[#counts + 1] = name .. '=' .. #keepIds
    end
    local okFront = #cz.nodes.FL >= 3 and #cz.nodes.FR >= 3
    local okRear = #cz.nodes.RL >= 3 and #cz.nodes.RR >= 3
    cz.available = okFront or okRear
    log('I', 'crashInjuryProCapture', string.format(
      'CRUSH ZONES: %s -- length=%.2fm width=%.2fm, %d body nodes (wheels excluded: %d wheel volumes), zone nodes %s',
      cz.available and 'ENABLED' or 'DISABLED (too few nodes in the corner bands)',
      cz.lengthM, cz.widthM, #pts, #wheelBalls, table.concat(counts, ' ')))
  end)
  if not ok then
    cz.available = false
    log('W', 'crashInjuryProCapture', 'CRUSH ZONES: unavailable on this vehicle -- ' .. tostring(err))
  end
end

function crushZones.measure()
  local cz = crushZones
  if not cz.available then return cz.last end
  local ok, err = pcall(function()
    local pRef, pBack, pUp = crushVec(obj:getNodePosition(cz.refCid)),
      crushVec(obj:getNodePosition(cz.backCid)), crushVec(obj:getNodePosition(cz.upCid))

    if cz.refDist then
      local function dist(a, b) local d = crushSub(a, b); return math.sqrt(crushDot(d, d)) end
      local now = { dist(pRef, pBack), dist(pRef, pUp), dist(pBack, pUp) }
      for i = 1, 3 do
        local s0 = cz.refDist[i]
        if s0 and s0 > 0.05 and math.abs(now[i] - s0) > math.max(0.10, 0.12 * s0) then
          if not cz.frameBrokenLogged then
            cz.frameBrokenLogged = true
            log('W', 'crashInjuryProCapture', string.format('CRUSH ZONES: reference frame bent (%.2f m -> %.2f m) -- keeping the last good crush readings.', s0, now[i]))
          end
          return
        end
      end
    end
    local fr = cz.frame(pRef, pBack, pUp)
    if not fr then return end
    for _, name in ipairs(cz.names) do
      local ids, sp, ax = cz.nodes[name], cz.spawn[name], cz.axis[name]
      local vals = {}
      for i = 1, #ids do
        local f, l, u = cz.project(fr, crushVec(obj:getNodePosition(ids[i])))
        local d

        local tpZone = (name == 'TPL' or name == 'TPR')
        local flap = ax ~= 'u-' and ax ~= 'gh' and math.abs(u - sp[i].u) > (tpZone and cz.TP_FLAP_VERTICAL_M or cz.FLAP_VERTICAL_M)

        local lat = 0
        if ax == 'gh' then
          local side = (sp[i].l - (cz.lCentre or 0)) >= 0 and 1 or -1
          if (l - sp[i].l) * side > 0.30 or (sp[i].u - u) > 1.15 then flap = true end
        elseif ax == 'u-' then
          lat = math.abs(l - sp[i].l)
          if lat > 0.90 or (sp[i].u - u) > 1.15 then flap = true end
        end

        local sideZone = (name == 'SFL' or name == 'SFR' or name == 'SRL' or name == 'SRR')
        if not flap and sideZone then
          local out = (ax == 'l+') and (l - sp[i].l) or (sp[i].l - l)
          if out > 0.15 then flap = true end
        end
        if flap then d = nil
        elseif ax == 'f+' then d = sp[i].f - f
        elseif ax == 'f-' then d = f - sp[i].f
        elseif ax == 'l+' then d = sp[i].l - l
        elseif ax == 'u-' then
          d = sp[i].u - u
          if d > 0.08 and lat > 0.10 then d = d + math.min(0.5 * (lat - 0.10), 0.6 * d) end
        elseif ax == 'gh' then
          local back, down = math.max(0, sp[i].f - f), math.max(0, sp[i].u - u)
          d = math.sqrt(back * back + down * down)
        else d = l - sp[i].l end

        if d ~= nil then
          if d > 1.6 then d = 0 end
          if d < -0.5 then d = -0.5 end
          vals[#vals + 1] = d
        end
      end

      if #vals > 0 and #vals >= math.max(3, math.floor(#ids * 0.3)) then
        table.sort(vals)
        local pct = (name == 'SFL' or name == 'SFR' or name == 'SRL' or name == 'SRR'
          or name == 'TPL' or name == 'TPR') and cz.SIDE_PERCENTILE or cz.PERCENTILE
        local v70 = vals[math.max(1, math.min(#vals, math.ceil(#vals * pct)))]
        cz.last[name] = math.max(0, v70)
        cz.raw = cz.raw or {}
        cz.raw[name] = v70
      elseif #ids == 0 then
        cz.last[name] = 0
      end

    end

    if cz.raw then
      for _, pair in ipairs({ { 'SFL', 'SFR' }, { 'SRL', 'SRR' } }) do
        local l, r = cz.raw[pair[1]], cz.raw[pair[2]]
        if l ~= nil and r ~= nil then
          local w = math.max(0, l + r)
          if l >= r then cz.last[pair[1]], cz.last[pair[2]] = w, 0
          else cz.last[pair[1]], cz.last[pair[2]] = 0, w end
        end
      end
    end

    cz.hold = cz.hold or {}

    for _, name in ipairs({ 'SFL', 'SFR', 'SRL', 'SRR' }) do
      local cur = cz.last[name] or 0
      local held = cz.hold[name] or 0
      if cur >= 0.03 and cur > held then cz.hold[name] = cur; held = cur end
      if held > cur then cz.last[name] = held end
    end
  end)
  if not ok then log('W', 'crashInjuryProCapture', 'CRUSH ZONES: measurement failed -- ' .. tostring(err)) end
  return cz.last
end

local capturing = false
local buf_t, buf_gx, buf_gy, buf_gz

local contactTelemetry = {baselineZ={}, support={}, groundedTurns=0, groundedPeakRate=0,
  pollInS=0, contact=false, contactKnown=false, graceS=0}
contactTelemetry.measureCrush = crushZones.measure
contactTelemetry.resetCrushHold = function()
  crushZones.hold = {}
  for _, name in ipairs(crushZones.names) do crushZones.last[name] = 0 end
  if crushZones.raw then crushZones.raw = {} end
end

local function readSupportG(gx, gy, gz, upZ)
  local gravity = -obj:getGravity() / STANDARD_GRAVITY_M_S2
  local ok, support = pcall(function()
    local refs = v.data.refNodes[0]
    local mass = v.data.nodes[refs.ref].nodeWeight
    local x = obj:getNodeForceNonInertial(refs.ref, refs.left) / mass / STANDARD_GRAVITY_M_S2
    local y = obj:getNodeForceNonInertial(refs.ref, refs.back) / mass / STANDARD_GRAVITY_M_S2
    local z = obj:getNodeForceNonInertial(refs.ref, refs.up) / mass / STANDARD_GRAVITY_M_S2
    return math.sqrt(x*x + y*y + z*z)
  end)
  if ok and support == support then return support, upZ * gravity end

  local mixed = math.sqrt(gx*gx + gy*gy + gz*gz)
  if contactTelemetry.contactKnown and not contactTelemetry.contact and mixed < 1.2 then mixed = 0 end
  return mixed, upZ * gravity
end

local function pollGroundContact(dt)
  contactTelemetry.pollInS = contactTelemetry.pollInS - dt
  contactTelemetry.graceS = math.max(0, contactTelemetry.graceS - dt)
  if contactTelemetry.pollInS > 0 then return end

  contactTelemetry.pollInS = 0.01
  local ok, hit = pcall(function()
    for id, node in pairs(v.data.nodes) do
      if obj:isNodeColliding(node.cid or id) then return true end
    end
    return false
  end)
  contactTelemetry.contactKnown = ok
  contactTelemetry.contact = ok and hit or false
  if not ok and not contactTelemetry.warned then
    contactTelemetry.warned = true
    log('W', 'crashInjuryProCapture', 'Ground contact API unavailable: rollover contact injuries disabled; acceleration and intrusion capture remain active.')
  end
  if contactTelemetry.contact then contactTelemetry.graceS = 0.02 end
end
local sampleCount = 0
local peakResultantG = 0
local captureStartSimTime = 0
local simTime = 0

local function updateCaptureLead(gx, gy, gz, supportG, baselineZ, dt)
  local c = contactTelemetry
  c.lead = c.lead or {}
  c.leadNext = c.leadNext or 1
  c.leadCount = c.leadCount or 0
  local capacity = math.max(2, math.min(600, math.ceil(0.06 / math.max(dt, 0.0001))))
  if c.leadCapacity ~= capacity then
    c.lead, c.leadNext, c.leadCount, c.leadCapacity = {}, 1, 0, capacity
  end

  local okV, vel = pcall(obj.getVelocity, obj)
  c.lead[c.leadNext] = {time=simTime, gx=gx, gy=gy, gz=gz, support=supportG, baseline=baselineZ,
    vx=(okV and vel and vel.x) or nil, vy=(okV and vel and vel.y) or nil,
    vz=(okV and vel and vel.z) or nil}
  c.leadNext = c.leadNext % capacity + 1
  c.leadCount = math.min(capacity, c.leadCount + 1)
  local unsupported = supportG < 0.35 and (not c.contactKnown or not c.contact)
  if unsupported then
    c.flightS = (c.flightS or 0) + dt
    if c.flightS >= 0.05 then c.landingArmed = true end
  else

    if (c.flightS or 0) >= 0.05 then
      c.lastFlightS, c.lastFlightEndT = c.flightS, simTime
    end
    c.flightS = 0
  end
  local landed = c.landingArmed and not unsupported and supportG >= 0.35
  if landed then c.landingArmed = false end
  return landed
end
local belowStopSpeedFor = 0
local belowPulseEndFor = 0
local physicsDtMeasured = 0
local triggerConfirmCount = 0

local onsetRing = {}
for i = 1, ONSET_WINDOW_SAMPLES do onsetRing[i] = 1.0 end
local onsetRingPos = 1

local ROLLOVER_CAPTURE_TRIGGER_QUARTER_TURNS = 1.0
local QUARTER_TURN_RAD = math.pi / 2

local ROLLOVER_IN_PROGRESS_RATE_DEG_S = 25
local ROLLOVER_UPRIGHT_ANGLE_RAD = 0.35
local ROLLOVER_RESET_UPRIGHT_TIME_S = 2.0

local ROLLOVER_MAX_PLAUSIBLE_RATE_DEG_S = 3000
local rollGlitchSteps = 0
local rollTrackingAvailable = true
local rollHavePrevAngle = false
local rollPrevAngleRad = 0
local rollAccumRad = 0
local rollPeakAbsAccumRad = 0
local rollPeakRateDegS = 0
local rollCurrentRateDegS = 0
local rollUprightForS = 0

local rollClaimedQuarterTurns = 0

local rollCapturePeakRateDegS = 0

local ROLLOVER_ROOF_CONTACT_UP_Z = -0.5
local ROLLOVER_SIDE_CONTACT_MAX_UP_Z = 0.5

local ROLLOVER_SIDE_SIGN_DEADBAND = 0.25

local rollContactConfirmed = false
local rollRoofContactSeen = false
local rollSideContactSign = 0
local rollWorstUpZ = 1.0
local rollSideLogged = false

local rollCagePresent = false

local function detectRollCage()
  rollCagePresent = false
  local ok, nodeCount = pcall(function() return obj:getNodeCount() end)
  if not ok or not nodeCount or nodeCount == 0 or not v or not v.data or not v.data.nodes then
    log('W', 'crashInjuryProCapture', 'ROLLCAGE: cannot scan nodes -- assuming no cage.')
    return
  end
  local matched = nil
  for i = 0, nodeCount - 1 do
    local node = v.data.nodes[i]
    if node and nodeGroupContainsSubstring(node, 'cage') then
      matched = i
      break
    end
  end
  rollCagePresent = matched ~= nil
  log('I', 'crashInjuryProCapture', string.format(
    'ROLLCAGE: %s (matched on node group containing "cage"%s). A cage reduces the roof-crush mechanism in the injury model; it does NOT reduce ejection risk.',
    rollCagePresent and 'PRESENT' or 'not present',
    matched and (', first match node ' .. tostring(matched)) or ''))
end

local function readRollAngleRad()
  local ok, angle, upZ, rightZ = pcall(function()
    local f = obj:getDirectionVector()
    local u = obj:getDirectionVectorUp()

    local r = f.x * u.y - f.y * u.x
    return math.atan2(r, u.z), u.z, r
  end)
  if not ok or angle == nil or angle ~= angle then return nil end
  return angle, upZ, rightZ
end

local function resetRollTracking()
  rollGlitchSteps = 0
  rollHavePrevAngle = false
  rollAccumRad = 0
  rollPeakAbsAccumRad = 0
  rollPeakRateDegS = 0
  rollCurrentRateDegS = 0
  rollUprightForS = 0
  rollClaimedQuarterTurns = 0
  rollContactConfirmed = false
  rollRoofContactSeen = false
  rollSideContactSign = 0
  rollWorstUpZ = 1.0
  rollSideLogged = false
  contactTelemetry.groundedTurns = 0
  contactTelemetry.groundedNetRad, contactTelemetry.groundedPeakRad = 0, 0
  contactTelemetry.groundedPeakRate = 0
  contactTelemetry.graceS = 0
end

local function trackRoll(dtPhys, resultantG)
  if not rollTrackingAvailable then return end
  local angle, upZ, rightZ = readRollAngleRad()
  if capturing and upZ ~= nil and resultantG ~= nil and resultantG > (contactTelemetry.impactPeakG or 0) then
    contactTelemetry.impactPeakG = resultantG
    contactTelemetry.impactUpZ = upZ
  end
  if angle == nil then
    rollTrackingAvailable = false
    log('W', 'crashInjuryProCapture', 'ROLLOVER: obj:getDirectionVector()/getDirectionVectorUp() unavailable on this vehicle -- rollover detection disabled. Collision and intrusion capture are unaffected.')
    return
  end

  if not rollHavePrevAngle then
    rollPrevAngleRad = angle
    rollHavePrevAngle = true
    return
  end

  local delta = angle - rollPrevAngleRad

  if delta > math.pi then
    delta = delta - 2 * math.pi
  elseif delta < -math.pi then
    delta = delta + 2 * math.pi
  end
  rollPrevAngleRad = angle

  if dtPhys > 0 and math.abs(delta) * (180 / math.pi) / dtPhys > ROLLOVER_MAX_PLAUSIBLE_RATE_DEG_S then
    rollGlitchSteps = rollGlitchSteps + 1
    if rollGlitchSteps == 1 then
      log('W', 'crashInjuryProCapture', string.format(
        'ROLLOVER: discarded an implausible roll step (%.0f deg/s over %.4fs). The roll angle is ill-conditioned near vertical pitch; tracking re-syncs next step. Logged once per roll.',
        math.abs(delta) * (180 / math.pi) / dtPhys, dtPhys))
    end
    return
  end

  rollAccumRad = rollAccumRad + delta

  local absAccum = math.abs(rollAccumRad)
  local peakBefore = rollPeakAbsAccumRad
  if absAccum > rollPeakAbsAccumRad then rollPeakAbsAccumRad = absAccum end

  if dtPhys > 0 then
    local rateDegS = math.abs(delta) * (180 / math.pi) / dtPhys
    rollCurrentRateDegS = rateDegS
    if rateDegS > rollPeakRateDegS then rollPeakRateDegS = rateDegS end
  end

  if contactTelemetry.graceS > 0 then
    rollContactConfirmed = true

    contactTelemetry.groundedNetRad = (contactTelemetry.groundedNetRad or 0) + delta
    local gAbs = math.abs(contactTelemetry.groundedNetRad)
    local gPeak = contactTelemetry.groundedPeakRad or 0
    if gAbs > gPeak then
      contactTelemetry.groundedTurns = contactTelemetry.groundedTurns + (gAbs - gPeak) / QUARTER_TURN_RAD
      contactTelemetry.groundedPeakRad = gAbs
    end
    contactTelemetry.groundedPeakRate = math.max(contactTelemetry.groundedPeakRate, rollCurrentRateDegS)
    if upZ ~= nil then
      if upZ < rollWorstUpZ then rollWorstUpZ = upZ end
      if upZ <= ROLLOVER_ROOF_CONTACT_UP_Z then rollRoofContactSeen = true end

      if math.abs(upZ) < ROLLOVER_SIDE_CONTACT_MAX_UP_Z and rightZ ~= nil then

        if rightZ < -ROLLOVER_SIDE_SIGN_DEADBAND then
          rollSideContactSign = 1
        elseif rightZ > ROLLOVER_SIDE_SIGN_DEADBAND then
          rollSideContactSign = -1
        end
        if not rollSideLogged and rollSideContactSign ~= 0 then
          rollSideLogged = true
          log('I', 'crashInjuryProCapture', string.format(
            'ROLLOVER attitude: %s side struck the ground (upZ=%.2f rightZ=%.2f). If that is the wrong side, flip the two rightZ comparisons in trackRoll() -- convention is documented there. Logged once per roll.',
            rollSideContactSign == -1 and 'LEFT' or 'RIGHT', upZ, rightZ))
        end
      end
    end
  end

  if math.abs(angle) < ROLLOVER_UPRIGHT_ANGLE_RAD then
    rollUprightForS = rollUprightForS + dtPhys
    if rollUprightForS >= ROLLOVER_RESET_UPRIGHT_TIME_S and rollPeakAbsAccumRad > 0 then
      resetRollTracking()
    end
  else
    rollUprightForS = 0
  end
end

local function rollQuarterTurns()

  return contactTelemetry.groundedTurns
end

local function rollUnclaimedQuarterTurns()
  local unclaimed = rollQuarterTurns() - rollClaimedQuarterTurns
  if unclaimed < 0 then return 0 end
  return unclaimed
end

local EXPOSURE_TICK_INTERVAL_S = 0.5
local EXPOSURE_IDLE_RESET_S = 3.0

local fireDetectorName = nil
local waterDetectorName = nil
local fireDetector = nil
local waterDetector = nil

local fireSecondsExposed = 0
local fireIntensity = 0
local fireClearFor = 0
local submergedSeconds = 0
local fullySubmerged = false
local waterClearFor = 0
local exposureSinceTick = 0
local exposureDebugOverride = nil

local function resetExposure()
  contactTelemetry.fireDoseS = 0
  fireSecondsExposed = 0
  fireIntensity = 0
  fireClearFor = 0
  submergedSeconds = 0
  fullySubmerged = false
  waterClearFor = 0
  exposureSinceTick = 0
  exposureDebugOverride = nil
end

local FIRE_CANDIDATES = {
  {

    name = 'fire.hotNodes / flammableNodes fraction',
    fn = function()
      if type(fire) ~= 'table' or type(fire.hotNodes) ~= 'table' then return nil end
      local hot = 0
      for _ in pairs(fire.hotNodes) do hot = hot + 1 end
      if hot == 0 then return 0 end
      local flammable = 0
      if type(fire.flammableNodes) == 'table' then
        for _ in pairs(fire.flammableNodes) do flammable = flammable + 1 end
      end
      if flammable == 0 then return 1 end

      return math.min(1, (hot / flammable) / 0.25)
    end,
  },
  {
    name = 'fire.vehicleIsBurning()',
    fn = function()
      if type(fire) ~= 'table' or type(fire.vehicleIsBurning) ~= 'function' then return nil end
      return fire.vehicleIsBurning() and 1 or 0
    end,
  },
  {
    name = 'fire.getVehicleBurningNodeCount()/node count',
    fn = function()
      if type(fire) ~= 'table' or type(fire.getVehicleBurningNodeCount) ~= 'function' then return nil end
      local burning = fire.getVehicleBurningNodeCount()
      local total = obj:getNodeCount()
      if not burning or not total or total == 0 then return nil end

      return math.min(1, (burning / total) / 0.25)
    end,
  },
  {
    name = 'obj:getNodeHeat() max over nodes',
    fn = function()
      if type(obj.getNodeHeat) ~= 'function' then return nil end
      local count = obj:getNodeCount()
      if not count or count == 0 then return nil end
      local hottest = 0
      local step = math.max(1, math.floor(count / 64))
      for i = 0, count - 1, step do
        local h = obj:getNodeHeat(i)
        if type(h) == 'number' and h > hottest then hottest = h end
      end

      return math.min(1, hottest / 400)
    end,
  },
}

local SEATED_HEAD_ABOVE_SEAT_M = 0.65
local function occupantHeadHeightM()
  if intrusionSeatCentroid and type(intrusionSeatCentroid.z) == 'number' then
    return intrusionSeatCentroid.z + SEATED_HEAD_ABOVE_SEAT_M
  end
  return SEATED_HEAD_ABOVE_SEAT_M
end

local WATER_CANDIDATES = {
  {

    name = 'obj:inWater() over the vehicle roofline',
    fn = function()
      if type(obj.inWater) ~= 'function' then return nil end
      if type(obj.getNodePosition) ~= 'function' then return nil end
      local count = obj:getNodeCount()
      if not count or count == 0 then return nil end
      local step = math.max(1, math.floor(count / 240))

      local zs, cids = {}, {}
      for i = 0, count - 1, step do
        local pos = obj:getNodePosition(i)
        if pos then
          zs[#zs + 1] = pos.z
          cids[#cids + 1] = i
        end
      end
      if #zs == 0 then return nil end
      local maxZ, minZ = zs[1], zs[1]
      for k = 2, #zs do
        if zs[k] > maxZ then maxZ = zs[k] end
        if zs[k] < minZ then minZ = zs[k] end
      end

      local extent = maxZ - minZ

      local lo = extent > 0.05 and (minZ + extent * 0.55) or maxZ
      local hi = extent > 0.05 and (minZ + extent * 0.85) or maxZ
      local upper, wetUpper = 0, 0
      for k = 1, #zs do
        if zs[k] >= lo and zs[k] <= hi then
          upper = upper + 1
          if obj:inWater(cids[k]) then wetUpper = wetUpper + 1 end
        end
      end
      if upper == 0 then return nil end

      return (wetUpper / upper) >= 0.6
    end,
  },
  {
    name = 'obj:getSurfaceWaterLevel() vs occupant height',
    fn = function()
      if type(obj.getSurfaceWaterLevel) ~= 'function' then return nil end
      local level = obj:getSurfaceWaterLevel()
      if type(level) ~= 'number' then return nil end
      local pos = obj:getPosition()
      if not pos then return nil end

      return (pos.z + occupantHeadHeightM()) < level
    end,
  },
  {
    name = 'obj:getNodeDepth() max over nodes',
    fn = function()
      if type(obj.getNodeDepth) ~= 'function' then return nil end
      local count = obj:getNodeCount()
      if not count or count == 0 then return nil end
      local deepest = 0
      local step = math.max(1, math.floor(count / 64))
      for i = 0, count - 1, step do
        local d = obj:getNodeDepth(i)
        if type(d) == 'number' and d > deepest then deepest = d end
      end
      return deepest > 0.5
    end,
  },
  {
    name = 'water.isUnderwater()',
    fn = function()
      if type(water) ~= 'table' or type(water.isUnderwater) ~= 'function' then return nil end
      return water.isUnderwater() and true or false
    end,
  },
}

local function probeDetector(label, candidates)
  for _, candidate in ipairs(candidates) do
    local ok, value = pcall(candidate.fn)
    if ok and value ~= nil then
      log('I', 'crashInjuryProCapture', string.format(
        'EXPOSURE: %s detector bound to %s (first reading: %s).', label, candidate.name, tostring(value)))
      return candidate.name, candidate.fn
    end
    log('D', 'crashInjuryProCapture', string.format(
      'EXPOSURE: %s candidate %s did not bind (ok=%s value=%s).', label, candidate.name, tostring(ok), tostring(value)))
  end
  log('W', 'crashInjuryProCapture', string.format(
    'EXPOSURE: NO %s detector bound on this build -- %s injuries are disabled. Crash, intrusion and rollover capture are unaffected. ' ..
    'The candidates tried are listed at debug level just above; send that log if this should be working.', label, label))
  return nil, nil
end

local function probeExposureDetectors()
  fireDetectorName, fireDetector = probeDetector('fire', FIRE_CANDIDATES)
  waterDetectorName, waterDetector = probeDetector('water', WATER_CANDIDATES)
end

local EXPOSURE_REPROBE_INTERVAL_S = 2.0
local EXPOSURE_REPROBE_WINDOW_S = 30.0
local exposureReprobeSince = 0
local exposureReprobeElapsed = 0

local function maybeReprobeExposure(elapsed)
  if fireDetector and waterDetector then return end
  if exposureReprobeElapsed >= EXPOSURE_REPROBE_WINDOW_S then return end
  exposureReprobeElapsed = exposureReprobeElapsed + elapsed
  exposureReprobeSince = exposureReprobeSince + elapsed
  if exposureReprobeSince < EXPOSURE_REPROBE_INTERVAL_S then return end
  exposureReprobeSince = 0
  if not fireDetector then
    fireDetectorName, fireDetector = probeDetector('fire', FIRE_CANDIDATES)
    if fireDetector then
      log('I', 'crashInjuryProCapture', 'EXPOSURE: fire detector bound on a LATE re-probe -- the load-time probe ran before the game\'s fire module was ready.')
    end
  end
  if not waterDetector then
    waterDetectorName, waterDetector = probeDetector('water', WATER_CANDIDATES)
    if waterDetector then
      log('I', 'crashInjuryProCapture', 'EXPOSURE: water detector bound on a LATE re-probe -- the load-time probe ran before the game\'s water primitive was ready.')
    end
  end
end

local function sendExposureTick()
  obj:queueGameEngineLua(string.format(
    'extensions.crashInjuryPro.onExposureTick(%d, %s)',
    obj:getId(), serialize({
      simulationTimeS = simTime,
      fireDoseS = contactTelemetry.fireDoseS or 0,
      fireAvailable = fireDetector ~= nil or exposureDebugOverride ~= nil,
      fireSecondsExposed = fireSecondsExposed,
      fireIntensity = fireIntensity,
      waterAvailable = waterDetector ~= nil or exposureDebugOverride ~= nil,
      submergedSeconds = submergedSeconds,
      fullySubmerged = fullySubmerged,
      fireDetector = fireDetectorName or 'none',
      waterDetector = waterDetectorName or 'none',
    })))
end

local function trackExposure(dtPhys)
  exposureSinceTick = exposureSinceTick + dtPhys
  if exposureSinceTick < EXPOSURE_TICK_INTERVAL_S then return end
  local elapsed = exposureSinceTick
  exposureSinceTick = 0

  maybeReprobeExposure(elapsed)

  local intensity, submerged = 0, false

  if exposureDebugOverride then
    intensity = exposureDebugOverride.fireIntensity or 0
    submerged = exposureDebugOverride.submerged and true or false
  else
    if fireDetector then
      local ok, value = pcall(fireDetector)
      if ok and type(value) == 'number' then intensity = math.max(0, math.min(1, value)) end
    end
    if waterDetector then
      local ok, value = pcall(waterDetector)
      if ok then submerged = value and true or false end
    end
  end

  if intensity > 0 then
    contactTelemetry.fireDoseS = (contactTelemetry.fireDoseS or 0) + intensity * elapsed
    fireSecondsExposed = fireSecondsExposed + elapsed
    fireIntensity = math.max(fireIntensity, intensity)
    fireClearFor = 0
  else
    fireClearFor = fireClearFor + elapsed
    if fireClearFor >= EXPOSURE_IDLE_RESET_S and fireSecondsExposed > 0 then
      log('I', 'crashInjuryProCapture', string.format('EXPOSURE: fire clock reset after %.1fs clear (was %.1fs exposed).', fireClearFor, fireSecondsExposed))
      fireSecondsExposed, fireIntensity = 0, 0
    end
  end

  if submerged then
    if submergedSeconds == 0 then
      log('I', 'crashInjuryProCapture', 'EXPOSURE: occupants\' heads are under water -- drowning clock started.')
    end
    submergedSeconds = submergedSeconds + elapsed
    fullySubmerged = true
    waterClearFor = 0
  else
    waterClearFor = waterClearFor + elapsed
    if waterClearFor >= EXPOSURE_IDLE_RESET_S and submergedSeconds > 0 then
      log('I', 'crashInjuryProCapture', string.format('EXPOSURE: water clock reset after %.1fs clear (was %.1fs submerged).', waterClearFor, submergedSeconds))
      submergedSeconds, fullySubmerged = 0, false
    end
  end

  sendExposureTick()
end

local function resetCapture()
  capturing = false
  buf_t, buf_gx, buf_gy, buf_gz = {}, {}, {}, {}
  contactTelemetry.baselineZ, contactTelemetry.support = {}, {}
  sampleCount = 0
  peakResultantG = 0
  contactTelemetry.impactPeakG, contactTelemetry.impactUpZ = 0, nil
  captureStartSimTime = 0
  belowStopSpeedFor = 0
  belowPulseEndFor = 0
  triggerConfirmCount = 0
  resetIntrusionTracking()

  rollCapturePeakRateDegS = 0
end

local function startCapture(resultantG, onsetRateGPerS)
  resetCapture()
  capturing = true
  captureStartSimTime = simTime
  local c = contactTelemetry
  c.firstChunk = true
  c.peakAtT = simTime
  c.crushNextT = 0
  c.preImpactVz = nil

  c.preVel = nil
  c.trueDvMax = 0

  for i = 1, (c.leadCount or 0) - 1 do
    local index = ((c.leadNext - c.leadCount + i - 2) % c.leadCapacity) + 1
    local sample = c.lead[index]
    if sample and i == 1 then
      c.preImpactVz = sample.vz
      if sample.vx and sample.vy and sample.vz then c.preVel = {sample.vx, sample.vy, sample.vz} end
    end
    if sample and sample.time > (c.lastSentTime or -math.huge) then
      if sampleCount == 0 then captureStartSimTime = sample.time end
      sampleCount = sampleCount + 1
      buf_t[sampleCount] = sample.time - captureStartSimTime
      buf_gx[sampleCount], buf_gy[sampleCount], buf_gz[sampleCount] = sample.gx, sample.gy, sample.gz
      c.baselineZ[sampleCount], c.support[sampleCount] = sample.baseline, sample.support
      peakResultantG = math.max(peakResultantG, math.sqrt(sample.gx^2 + sample.gy^2 + sample.gz^2))
    end
  end

  rollCapturePeakRateDegS = rollPeakRateDegS
  log('I', 'crashInjuryProCapture', string.format(
    'capture started: triggerDynamicG=%.3f triggerOnsetRateGPerS=%.1f (gates: three-axis peak>=%.1fg, onsetRate>=%.1fg/s)',
    resultantG, onsetRateGPerS, CAPTURE_ON_PEAK_THRESHOLD_G, CAPTURE_ON_ONSET_RATE_G_PER_S))
end

local function sendBuffer(reason)
  local sampleRateHz = physicsDtMeasured > 0 and (1 / physicsDtMeasured) or 0
  contactTelemetry.lastSentTime = simTime

  log('I', 'crashInjuryProCapture', string.format(
    'buffer sent (%s): samplesBuffered=%d peakResultantG=%.3f sampleRateHz(measured)=%.1f durationS=%.3f trueDv=%.1fmph',
    reason, sampleCount, peakResultantG, sampleRateHz, sampleCount > 0 and (sampleCount / sampleRateHz) or 0,
    (contactTelemetry.trueDvMax or 0) / 0.44704))

  log('I', 'crashInjuryProCapture', string.format(
    'INTRUSION peak this buffer: roof depthM=%.3f velocityMs=%.2f | door depthM=%.3f velocityMs=%.2f | dash depthM=%.3f velocityMs=%.2f (tracking %s, roofNodes=%d doorNodes=%d dashNodes=%d)',
    roofPeakDepthM, roofPeakVelocityMs, doorPeakDepthM, doorPeakVelocityMs, dashPeakDepthM, dashPeakVelocityMs,
    intrusionTrackingAvailable and 'available' or 'UNAVAILABLE (see load-time INTRUSION log lines for why)',
    #intrusionRoofNodeIds, #intrusionDoorNodeIds, #intrusionDashNodeIds))

  log('I', 'crashInjuryProCapture', string.format(
    'ROLLOVER this buffer: quarterTurns=%.2f peakRollRateDegS=%.0f rollCage=%s groundContact=%s roofContact=%s side=%s worstUpZ=%.2f (tracking %s)',
    rollQuarterTurns(), math.max(rollCapturePeakRateDegS, rollPeakRateDegS),
    tostring(rollCagePresent),

    tostring(rollContactConfirmed), tostring(rollRoofContactSeen),
    rollSideContactSign == -1 and 'left' or (rollSideContactSign == 1 and 'right' or 'none'),
    rollWorstUpZ,
    rollTrackingAvailable and 'available' or 'UNAVAILABLE'))

  local crushRaw = crushZones.measure()

  local crush = {}
  for k, v in pairs(crushRaw or {}) do crush[k] = v end
  local fc, rc = (crush.FC or 0) * 0.8, (crush.RC or 0) * 0.8
  if fc > (crush.FL or 0) then crush.FL = fc end
  if fc > (crush.FR or 0) then crush.FR = fc end
  if rc > (crush.RL or 0) then crush.RL = rc end
  if rc > (crush.RR or 0) then crush.RR = rc end
  log('I', 'crashInjuryProCapture', string.format(
    'CRUSH this buffer (m, inward): FL=%.3f FR=%.3f RL=%.3f RR=%.3f (centre F=%.3f R=%.3f) | side front L=%.3f R=%.3f rear L=%.3f R=%.3f | roof L=%.3f R=%.3f rear L=%.3f R=%.3f | pillars L=%.3f R=%.3f | footwell L=%.3f R=%.3f | flight before=%.2fs ended %.2fs ago (tracking %s)',
    crush.FL or 0, crush.FR or 0, crush.RL or 0, crush.RR or 0, crush.FC or 0, crush.RC or 0,
    crush.SFL or 0, crush.SFR or 0, crush.SRL or 0, crush.SRR or 0,
    crush.ROOFL or 0, crush.ROOFR or 0, crush.ROOFRL or 0, crush.ROOFRR or 0, crush.GHL or 0, crush.GHR or 0, crush.TPL or 0, crush.TPR or 0,
    contactTelemetry.lastFlightS or 0,
    contactTelemetry.lastFlightEndT and (simTime - contactTelemetry.lastFlightEndT) or -1,
    crushZones.available and 'available' or 'UNAVAILABLE (see load-time CRUSH ZONES line)'))

  local payload = {
    samplesBuffered = sampleCount,
    peakResultantG = peakResultantG,
    sampleRateHz = sampleRateHz,
    stopReason = reason,
    t = buf_t,
    gx = buf_gx,
    gy = buf_gy,
    gz = buf_gz,
    baselineGz = contactTelemetry.baselineZ,
    supportG = contactTelemetry.support,

    luaSendClockHp = os.clockhp(),

    intrusionTrackingAvailable = intrusionTrackingAvailable,
    intrusionRoofDepthM = roofPeakDepthM,
    intrusionRoofVelocityMs = roofPeakVelocityMs,
    intrusionDoorDepthM = doorPeakDepthM,
    intrusionDoorVelocityMs = doorPeakVelocityMs,
    intrusionDashDepthM = dashPeakDepthM,
    intrusionDashVelocityMs = dashPeakVelocityMs,

    rolloverTrackingAvailable = rollTrackingAvailable,

    rolloverQuarterTurns = rollQuarterTurns(),
    rolloverPeakRollRateDegS = contactTelemetry.groundedPeakRate,
    rolloverContactConfirmed = rollContactConfirmed,
    rolloverRoofContact = rollRoofContactSeen,
    rolloverSideContact = rollSideContactSign,
    rolloverWorstUpZ = rollWorstUpZ,
    rolloverRawQuarterTurns = rollPeakAbsAccumRad / QUARTER_TURN_RAD,
    rollCagePresent = rollCagePresent,

    impactUpZ = contactTelemetry.impactUpZ,

    preImpactVzMs = contactTelemetry.preImpactVz,

    trueDvMaxMs = contactTelemetry.preVel and contactTelemetry.trueDvMax or nil,

    postImpactVzMs = (function() local ok, v = pcall(function() return obj:getVelocity().z end); return ok and v or nil end)(),
    firstChunkOfCapture = contactTelemetry.firstChunk == true,

    crushTrackingAvailable = crushZones.available,
    crushFrontLeftM = crush.FL or 0,
    crushFrontRightM = crush.FR or 0,
    crushRearLeftM = crush.RL or 0,
    crushRearRightM = crush.RR or 0,
    crushSideFrontLeftM = crush.SFL or 0,
    crushSideFrontRightM = crush.SFR or 0,
    crushSideRearLeftM = crush.SRL or 0,
    crushSideRearRightM = crush.SRR or 0,
    crushRoofLeftM = crush.ROOFL or 0,
    crushRoofRearLeftM = crush.ROOFRL or 0,
    crushRoofRearRightM = crush.ROOFRR or 0,
    crushRoofRightM = crush.ROOFR or 0,
    crushGreenhouseLeftM = crush.GHL or 0,
    crushGreenhouseRightM = crush.GHR or 0,
    crushFootwellLeftM = crush.TPL or 0,
    crushFootwellRightM = crush.TPR or 0,

    flightBeforeS = contactTelemetry.lastFlightS or 0,
    flightEndT = contactTelemetry.lastFlightEndT or -1,
    flightEndedAgoS = contactTelemetry.lastFlightEndT and (simTime - contactTelemetry.lastFlightEndT) or -1,
  }

  obj:queueGameEngineLua(string.format(
    'extensions.crashInjuryPro.onBufferReady(%d, %s)',
    obj:getId(), serialize(payload)))

  contactTelemetry.impactPeakG, contactTelemetry.impactUpZ = 0, nil
  contactTelemetry.preImpactVz = nil
  contactTelemetry.firstChunk = false
  contactTelemetry.earlyQuietS = 0
end

local function finishCapture(reason)
  capturing = false
  sendBuffer(reason)

  rollClaimedQuarterTurns = rollQuarterTurns()
  resetCapture()
end

local function flushChunk()
  sendBuffer('chunk-flush')
  rollClaimedQuarterTurns = rollQuarterTurns()
  buf_t, buf_gx, buf_gy, buf_gz = {}, {}, {}, {}
  contactTelemetry.baselineZ, contactTelemetry.support = {}, {}
  sampleCount = 0
  peakResultantG = 0
  captureStartSimTime = simTime
  resetIntrusionTracking()
end

local CAP_K = {
  STANDARD_GRAVITY_M_S2 = STANDARD_GRAVITY_M_S2,
  CAPTURE_ON_PEAK_THRESHOLD_G = CAPTURE_ON_PEAK_THRESHOLD_G,
  CAPTURE_ON_ONSET_RATE_G_PER_S = CAPTURE_ON_ONSET_RATE_G_PER_S,
  ONSET_WINDOW_SAMPLES = ONSET_WINDOW_SAMPLES,
  TRIGGER_CONFIRM_STEPS = TRIGGER_CONFIRM_STEPS,
  PULSE_END_RESULTANT_G = PULSE_END_RESULTANT_G,
  PULSE_END_DEBOUNCE_S = PULSE_END_DEBOUNCE_S,
  STOP_SPEED_THRESHOLD_MS = STOP_SPEED_THRESHOLD_MS,
  STOP_DEBOUNCE_S = STOP_DEBOUNCE_S,
  MAX_SAMPLES = MAX_SAMPLES,
  MAX_CHUNK_DURATION_S = MAX_CHUNK_DURATION_S,
  KNOCKOUT_TRIGGER_PEAK_G = KNOCKOUT_TRIGGER_PEAK_G,
  KNOCKOUT_RESET_G = KNOCKOUT_RESET_G,
  SHAKE_TRIGGER_MIN_G = SHAKE_TRIGGER_MIN_G,
  SHAKE_RESET_G = SHAKE_RESET_G,
  SHAKE_PEAK_TRACK_STEPS = SHAKE_PEAK_TRACK_STEPS,
  INTRUSION_CAPTURE_TRIGGER_DEPTH_M = INTRUSION_CAPTURE_TRIGGER_DEPTH_M,
  ROLLOVER_CAPTURE_TRIGGER_QUARTER_TURNS = ROLLOVER_CAPTURE_TRIGGER_QUARTER_TURNS,
  ROLLOVER_IN_PROGRESS_RATE_DEG_S = ROLLOVER_IN_PROGRESS_RATE_DEG_S,

  SETTLED_CHUNK_PEAK_G = 5.0,
  ROLL_RATE_GLITCH_DEG_S = 1500,
}

local function onPhysicsStep(dtPhys)

  if not moduleActive then return end

  simTime = simTime + dtPhys
  physicsDtMeasured = dtPhys

  local ffi = sensors.ffiSensors
  local axRaw, ayRaw, azRaw = ffi.sensorX, ffi.sensorY, ffi.sensorZnonInertial
  local gx = axRaw / CAP_K.STANDARD_GRAVITY_M_S2
  local gy = ayRaw / CAP_K.STANDARD_GRAVITY_M_S2
  local gz = azRaw / CAP_K.STANDARD_GRAVITY_M_S2
  local resultantG = math.sqrt(gx * gx + gy * gy + gz * gz)

  pollGroundContact(dtPhys)
  local supportG, baselineZ = readSupportG(gx, gy, gz, obj:getDirectionVectorUp().z)
  local landingTriggered = updateCaptureLead(gx, gy, gz, supportG, baselineZ, dtPhys)

  local horizontalG = math.sqrt(gx * gx + gy * gy + (gz-baselineZ)^2)
  if supportG < 0.35 then horizontalG = 0 end

  if resultantG >= CAP_K.KNOCKOUT_TRIGGER_PEAK_G then
    if knockoutArmed then
      knockoutArmed = false
      obj:queueGameEngineLua(string.format(
        'extensions.crashInjuryPro.onProvisionalKnockout(%d, %.3f, %.6f, %.6f)',
        obj:getId(), resultantG, simTime, os.clockhp()))
    end
  elseif resultantG < CAP_K.KNOCKOUT_RESET_G then
    knockoutArmed = true
  end

  if resultantG >= CAP_K.SHAKE_TRIGGER_MIN_G then
    if shakeArmed then
      shakeArmed = false
      shakeTracking = true
      shakeTrackSteps = 0
      shakePeakG, shakePeakGx, shakePeakGy, shakePeakGz = resultantG, gx, gy, gz
    elseif shakeTracking then
      shakeTrackSteps = shakeTrackSteps + 1
      if resultantG > shakePeakG then
        shakePeakG, shakePeakGx, shakePeakGy, shakePeakGz = resultantG, gx, gy, gz
      end
      if shakeTrackSteps >= CAP_K.SHAKE_PEAK_TRACK_STEPS then
        sendShakeTrigger()
        shakeTracking = false
      end
    end
  elseif resultantG < CAP_K.SHAKE_RESET_G then
    if shakeTracking then
      sendShakeTrigger()
      shakeTracking = false
    end
    shakeArmed = true
  end

  if intrusionTrackingAvailable then
    prevRoofDepthM, roofPeakDepthM, roofPeakVelocityMs = trackNodeGroupIntrusion(intrusionRoofNodeIds, prevRoofDepthM, roofPeakDepthM, roofPeakVelocityMs, dtPhys)
    prevDoorDepthM, doorPeakDepthM, doorPeakVelocityMs = trackNodeGroupIntrusion(intrusionDoorNodeIds, prevDoorDepthM, doorPeakDepthM, doorPeakVelocityMs, dtPhys)
    prevDashDepthM, dashPeakDepthM, dashPeakVelocityMs = trackNodeGroupIntrusion(intrusionDashNodeIds, prevDashDepthM, dashPeakDepthM, dashPeakVelocityMs, dtPhys)
  end

  trackRoll(dtPhys, resultantG)

  trackExposure(dtPhys)

  local windowOldest = onsetRing[onsetRingPos]
  local windowDurationS = CAP_K.ONSET_WINDOW_SAMPLES * dtPhys
  local onsetRateGPerS = windowDurationS > 0 and ((horizontalG - windowOldest) / windowDurationS) or 0
  onsetRing[onsetRingPos] = horizontalG
  onsetRingPos = onsetRingPos % CAP_K.ONSET_WINDOW_SAMPLES + 1

  if not capturing then

    local intrusionTriggered = intrusionTrackingAvailable and (
      roofPeakDepthM >= CAP_K.INTRUSION_CAPTURE_TRIGGER_DEPTH_M or
      doorPeakDepthM >= CAP_K.INTRUSION_CAPTURE_TRIGGER_DEPTH_M or
      dashPeakDepthM >= CAP_K.INTRUSION_CAPTURE_TRIGGER_DEPTH_M)

    local rolloverTriggered = rollTrackingAvailable and rollUnclaimedQuarterTurns() >= CAP_K.ROLLOVER_CAPTURE_TRIGGER_QUARTER_TURNS

    if landingTriggered then
      log('I', 'crashInjuryProCapture', 'LANDING: support restored after free flight; capturing landing independently of onset rate.')
      startCapture(horizontalG, onsetRateGPerS)
    elseif rolloverTriggered then
      log('I', 'crashInjuryProCapture', string.format(
        'ROLLOVER triggered a capture on its own (new quarterTurns=%.2f since last report, total=%.2f, trigger=%.2f, peakRollRateDegS=%.0f) -- accel-independent path.',
        rollUnclaimedQuarterTurns(), rollQuarterTurns(), CAP_K.ROLLOVER_CAPTURE_TRIGGER_QUARTER_TURNS, rollPeakRateDegS))
      startCapture(horizontalG, onsetRateGPerS)
    elseif intrusionTriggered then
      log('I', 'crashInjuryProCapture', string.format(
        'INTRUSION triggered a capture on its own (roofDepthM=%.3f doorDepthM=%.3f dashDepthM=%.3f, trigger=%.3fm) -- accel-independent path.',
        roofPeakDepthM, doorPeakDepthM, dashPeakDepthM, CAP_K.INTRUSION_CAPTURE_TRIGGER_DEPTH_M))
      startCapture(horizontalG, onsetRateGPerS)

      prevRoofDepthM, roofPeakDepthM, roofPeakVelocityMs = trackNodeGroupIntrusion(intrusionRoofNodeIds, prevRoofDepthM, roofPeakDepthM, roofPeakVelocityMs, dtPhys)
      prevDoorDepthM, doorPeakDepthM, doorPeakVelocityMs = trackNodeGroupIntrusion(intrusionDoorNodeIds, prevDoorDepthM, doorPeakDepthM, doorPeakVelocityMs, dtPhys)
      prevDashDepthM, dashPeakDepthM, dashPeakVelocityMs = trackNodeGroupIntrusion(intrusionDashNodeIds, prevDashDepthM, dashPeakDepthM, dashPeakVelocityMs, dtPhys)
    elseif horizontalG >= CAP_K.CAPTURE_ON_PEAK_THRESHOLD_G and onsetRateGPerS >= CAP_K.CAPTURE_ON_ONSET_RATE_G_PER_S then
      triggerConfirmCount = triggerConfirmCount + 1
      if triggerConfirmCount >= CAP_K.TRIGGER_CONFIRM_STEPS then
        startCapture(horizontalG, onsetRateGPerS)
      else
        return
      end
    else
      triggerConfirmCount = 0
      return
    end
  end

  sampleCount = sampleCount + 1
  buf_t[sampleCount] = simTime - captureStartSimTime
  buf_gx[sampleCount] = gx
  buf_gy[sampleCount] = gy
  buf_gz[sampleCount] = gz
  contactTelemetry.baselineZ[sampleCount] = baselineZ
  contactTelemetry.support[sampleCount] = supportG
  if resultantG > peakResultantG then peakResultantG = resultantG; contactTelemetry.peakAtT = simTime end

  if sampleCount >= CAP_K.MAX_SAMPLES then
    finishCapture('max-samples-cap')
    return
  end

  local stillRolling = rollTrackingAvailable and rollCurrentRateDegS >= CAP_K.ROLLOVER_IN_PROGRESS_RATE_DEG_S

    and rollCurrentRateDegS < CAP_K.ROLL_RATE_GLITCH_DEG_S

  if resultantG < CAP_K.PULSE_END_RESULTANT_G and not stillRolling then
    belowPulseEndFor = belowPulseEndFor + dtPhys
    if belowPulseEndFor >= CAP_K.PULSE_END_DEBOUNCE_S then
      finishCapture('pulse-end')
      return
    end
  else
    belowPulseEndFor = 0
  end

  local speed = obj:getVelocity():length()
  if speed < CAP_K.STOP_SPEED_THRESHOLD_MS then
    belowStopSpeedFor = belowStopSpeedFor + dtPhys
    if belowStopSpeedFor >= CAP_K.STOP_DEBOUNCE_S then
      finishCapture('at-rest')
      return
    end
  else
    belowStopSpeedFor = 0
  end

  if capturing then
    local okV, vel = pcall(obj.getVelocity, obj)
    if okV and vel then
      local c = contactTelemetry
      if not c.preVel then c.preVel = {vel.x, vel.y, vel.z} end
      local dx, dy, dz = vel.x - c.preVel[1], vel.y - c.preVel[2], vel.z - c.preVel[3]
      local d = math.sqrt(dx * dx + dy * dy + dz * dz)
      if d > (c.trueDvMax or 0) then c.trueDvMax = d end
    end
  end
  if capturing and simTime >= (contactTelemetry.crushNextT or 0) then
    contactTelemetry.crushNextT = simTime + 0.02
    contactTelemetry.measureCrush()
  end

  if capturing and (simTime - captureStartSimTime) >= 0.08
      and peakResultantG >= ((contactTelemetry.firstChunk and not stillRolling) and 6 or 8) then

    if simTime - (contactTelemetry.peakAtT or simTime) >= 0.04
        and resultantG < math.max(4, peakResultantG * 0.3) then
      contactTelemetry.timeQuietS = (contactTelemetry.timeQuietS or 0) + dtPhys
      if contactTelemetry.timeQuietS >= 0.015 then
        contactTelemetry.timeQuietS = 0
        flushChunk()
        return
      end
    else
      contactTelemetry.timeQuietS = 0
    end
  end

  if capturing and not stillRolling and peakResultantG >= 10
      and (simTime - captureStartSimTime) >= 0.10 then

    if resultantG < math.max(4, peakResultantG * 0.25) then
      contactTelemetry.earlyQuietS = (contactTelemetry.earlyQuietS or 0) + dtPhys
      if contactTelemetry.earlyQuietS >= 0.025 then
        flushChunk()
        return
      end
    else
      contactTelemetry.earlyQuietS = 0
    end
  end

  if capturing and (simTime - captureStartSimTime) >= CAP_K.MAX_CHUNK_DURATION_S then
    if peakResultantG < CAP_K.SETTLED_CHUNK_PEAK_G and not stillRolling then
      finishCapture('settled')
    else
      flushChunk()
    end
  end
end

local function isOccupantVehicle()
  local ok, name = pcall(function() return v.data and v.data.information and v.data.information.name end)
  return ok and type(name) == 'string' and name:find('Occupant Ragdoll', 1, true) ~= nil
end

local function isWalkingUnicycle()
  local ok, name = pcall(function() return v.data and v.data.information and v.data.information.name end)
  return ok and name == 'Unicycle'
end

local UNIVERSAL_DUMMY_DRIVER_NODE_PREFIX = 'Dummy1_'

local function detectOccupantDataTier()
  local ok, nodeCount = pcall(function() return obj:getNodeCount() end)
  if not ok or not nodeCount or nodeCount == 0 or not v or not v.data or not v.data.nodes then
    log('I', 'crashInjuryProCapture', 'OCCUPANT DATA TIER: 2 (seat-node estimation) -- node table not accessible on this vehicle to check for a Tier 1 source.')
    return
  end

  for i = 0, nodeCount - 1 do
    local node = v.data.nodes[i]
    if node and type(node.name) == 'string'
        and node.name:sub(1, #UNIVERSAL_DUMMY_DRIVER_NODE_PREFIX) == UNIVERSAL_DUMMY_DRIVER_NODE_PREFIX then
      log('I', 'crashInjuryProCapture', string.format(
        'OCCUPANT DATA TIER: 1 (Agent_Y Universal Dummy detected) -- found node "%s" on this vehicle. Detection only -- no capture logic reads from it yet.',
        node.name))
      return
    end
  end

  log('I', 'crashInjuryProCapture', 'OCCUPANT DATA TIER: 2 (seat-node estimation) -- no Universal Dummy node names found on this vehicle.')
end

local function readableVehicleName()
  local ok, name = pcall(function() return v.data and v.data.information and v.data.information.name end)
  if not ok then return 'unreadable' end
  if type(name) == 'string' then return name end
  if type(name) == 'table' then

    local parts, n = {}, 0
    for _, value in pairs(name) do
      if type(value) == 'string' then
        n = n + 1
        parts[n] = value
        if n >= 3 then break end
      end
    end
    if n > 0 then return '[multi-part: ' .. table.concat(parts, ' / ') .. ' ...]' end
    return '[multi-part, no string entries]'
  end
  return tostring(name)
end

local function vehicleIdentityString()
  local id = select(2, pcall(function() return obj:getId() end))
  local nodes = select(2, pcall(function() return obj:getNodeCount() end))
  return string.format('objId=%s name=%s nodeCount=%s',
    tostring(id), readableVehicleName(), tostring(nodes))
end

local function onExtensionLoaded()

  if isOccupantVehicle() then
    moduleActive = false
    moduleInactiveReason = 'occupant prototype'
    log('I', 'crashInjuryProCapture', string.format(
      'SKIPPED on this vehicle -- occupant prototype detected (v.data.information.name). No capture, no realisticControl, no input attachment. %s',
      vehicleIdentityString()))
    return
  end

  if isWalkingUnicycle() then
    moduleActive = false
    moduleInactiveReason = 'walking mode (unicycle)'
    log('I', 'crashInjuryProCapture', string.format(
      'SKIPPED on this vehicle -- WALKING MODE (BeamNG unicycle). No capture, no knockout, no shake, no realisticControl: being on foot must never produce injuries. %s',
      vehicleIdentityString()))
    return
  end

  moduleActive = true
  moduleInactiveReason = nil
  resetCapture()
  enablePhysicsStepHook()
  physicsDtMeasured = obj:getPhysicsDt() or 0
  log('I', 'crashInjuryProCapture', string.format(
    'ACTIVE on this vehicle -- physics-step hook enabled, obj:getPhysicsDt()=%.6fs (%.1fHz measured). %s',
    physicsDtMeasured, physicsDtMeasured > 0 and (1 / physicsDtMeasured) or 0,
    vehicleIdentityString()))

  classifyIntrusionNodes()
  crushZones.classify()
  detectRollCage()
  probeExposureDetectors()

  detectOccupantDataTier()

  if controller and controller.getController and not controller.getController('crashInjuryProRealisticControl') then
    controller.loadControllerExternal('crashInjuryProRealisticControl', 'crashInjuryProRealisticControl', {})
    log('I', 'crashInjuryProCapture', 'crashInjuryProRealisticControl controller attached (Realistic Mode Stage 3, vehicle control degradation).')
  end

  pcall(function()
    local id = obj:getId()
    obj:queueGameEngineLua(string.format(
      "local v = getPlayerVehicle(0) if v and v:getId() == %d then guihooks.trigger('CrashInjuryProVehicleReset', { objID = %d, reload = true }) end", id, id))
  end)
end

local function onReset()
  if not moduleActive then return end
  resetCapture()
  resetRollTracking()
  contactTelemetry.pollInS = 0
  contactTelemetry.contact, contactTelemetry.contactKnown = false, false
  contactTelemetry.lead, contactTelemetry.leadCount, contactTelemetry.leadNext = {}, 0, 1
  contactTelemetry.flightS, contactTelemetry.landingArmed, contactTelemetry.lastSentTime = 0, false, nil
  contactTelemetry.lastFlightS, contactTelemetry.lastFlightEndT = 0, nil
  knockoutArmed = true
  resetShakeTracking()
  resetExposure()

  contactTelemetry.resetCrushHold()

  pcall(function()
    local id = obj:getId()
    obj:queueGameEngineLua(string.format(
      "local v = getPlayerVehicle(0) if v and v:getId() == %d then guihooks.trigger('CrashInjuryProVehicleReset', { objID = %d }) end", id, id))
  end)
end

M.onExtensionLoaded = onExtensionLoaded
M.onReset = onReset
M.onPhysicsStep = onPhysicsStep

M.debugSetExposure = function(fireIntensityValue, submergedValue)
  if fireIntensityValue == nil and submergedValue == nil then

    resetExposure()
    log('I', 'crashInjuryProCapture', 'EXPOSURE: manual override CLEARED -- back to the real detectors, clocks reset.')
    return
  end
  exposureDebugOverride = { fireIntensity = tonumber(fireIntensityValue) or 0, submerged = submergedValue and true or false }
  log('I', 'crashInjuryProCapture', string.format(
    'EXPOSURE: manual override SET -- fireIntensity=%.2f submerged=%s. Clocks run from here exactly as they would from a real detector.',
    exposureDebugOverride.fireIntensity, tostring(exposureDebugOverride.submerged)))
end

return M
