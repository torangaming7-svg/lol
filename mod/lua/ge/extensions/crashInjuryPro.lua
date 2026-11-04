local M = {}

local function isWalkingVehicle(veh)
  if not veh then return false end
  local ok, name = pcall(function() return veh:getJBeamFilename() end)
  return ok and name == 'unicycle'
end

local occupiedCarId = nil

local function vehicleType(veh)
  local ok, t = pcall(function()
    local model = veh.JBeam or (veh.getJBeamFilename and veh:getJBeamFilename())
    if not model or not core_vehicles or not core_vehicles.getModel then return nil end
    local m = core_vehicles.getModel(model)
    return m and m.model and m.model.Type
  end)
  return ok and t or nil
end

local function isPropVehicle(veh)
  if not veh or isWalkingVehicle(veh) then return false end
  local t = vehicleType(veh)
  return t == 'Prop' or t == 'Trailer'
end

local function noteOccupiedCar(veh)
  if veh and not isWalkingVehicle(veh) and not isPropVehicle(veh) then occupiedCarId = veh:getId() end
end

local function uiVehicleId()
  local playerVeh = getPlayerVehicle(0)
  if not playerVeh then return occupiedCarId end
  if isPropVehicle(playerVeh) and occupiedCarId and be:getObjectByID(occupiedCarId) then return occupiedCarId end
  return playerVeh:getId()
end

local function playerDrivingVehicle(objectId)
  local playerVeh = getPlayerVehicle(0)
  if not playerVeh then
    return false, 'no player vehicle', nil
  end
  if playerVeh:getId() ~= objectId then
    if objectId == occupiedCarId and isPropVehicle(playerVeh) then
      return true, nil, playerVeh
    end
    return false, string.format('not the player\'s own vehicle (player=%s)', tostring(playerVeh:getId())), playerVeh
  end
  if isWalkingVehicle(playerVeh) then
    return false, 'player is ON FOOT (walking-mode unicycle) -- being on foot must never produce injuries', playerVeh
  end
  if isPropVehicle(playerVeh) then
    return false, 'player is controlling a prop with nobody inside', playerVeh
  end
  noteOccupiedCar(playerVeh)
  return true, nil, playerVeh
end

local uiAppReadySeen = false
local uiAppReadyAtClock = nil

local sendVehicleInfo
local registerAndFixCockpitVisibilityOnce

local function uiAppReady(edition)
  uiAppReadySeen = true
  uiAppReadyAtClock = os.clockhp()
  log('I', 'crashInjuryPro', string.format(
    'UI APP ALIVE -- the crash-injury UI app has linked and is listening for guihooks payloads (reported edition: %s). Relays below have a real receiver.',
    tostring(edition)))
end

M.uiAppReady = function(edition)
  uiAppReady(edition)

  pcall(registerAndFixCockpitVisibilityOnce)
  noteOccupiedCar(getPlayerVehicle(0))
  local id = uiVehicleId()
  if id and sendVehicleInfo then pcall(sendVehicleInfo, id) end
end

local function onBufferReady(objectId, payload)
  local receivedGxLen = payload and payload.gx and #payload.gx or 0
  local receivedGyLen = payload and payload.gy and #payload.gy or 0
  local receivedGzLen = payload and payload.gz and #payload.gz or 0

  local hop1RelayMs = nil
  if payload and payload.luaSendClockHp then
    hop1RelayMs = (os.clockhp() - payload.luaSendClockHp) * 1000
    payload.hop1RelayMs = hop1RelayMs
  end

  log('D', 'crashInjuryPro', string.format(
    'buffer received from vehicle %s -- sent: samplesBuffered=%s peakResultantG=%s sampleRateHz=%s stopReason=%s | received here: gx=%d gy=%d gz=%d | hop1RelayMs(vehicle->GE, includes vehicle-side serialize() cost)=%s',
    tostring(objectId),
    payload and tostring(payload.samplesBuffered) or 'nil',
    payload and tostring(payload.peakResultantG) or 'nil',
    payload and tostring(payload.sampleRateHz) or 'nil',
    payload and tostring(payload.stopReason) or 'nil',
    receivedGxLen, receivedGyLen, receivedGzLen,
    hop1RelayMs and string.format('%.2f', hop1RelayMs) or 'n/a'))

  if payload and payload.samplesBuffered and receivedGxLen ~= payload.samplesBuffered then
    log('E', 'crashInjuryPro', string.format(
      'HOP 1 TRUNCATION (vehicle -> GE): sent %d samples, this extension only sees %d in payload.gx after obj:queueGameEngineLua()',
      payload.samplesBuffered, receivedGxLen))
  end

  local accepted, rejectReason = playerDrivingVehicle(objectId)
  if not accepted then
    log('I', 'crashInjuryPro', string.format(
      'buffer from vehicle %s DISCARDED -- %s.', tostring(objectId), rejectReason))
    return
  end
  payload.vehicleId = objectId

  if not uiAppReadySeen then
    log('W', 'crashInjuryPro', string.format(
      'DELIVERING TO A UI THAT HAS NEVER REPORTED IN -- guihooks.trigger is about to fire for vehicle %s, but no "UI APP ALIVE" line has appeared this session. Most likely cause: the crash-injury app is not placed on the player\'s current UI layout, so this crash will produce no visible report at all. Auto-registration runs when this extension loads, which for a fresh install is THIS crash -- so the app may appear from the next crash onward.',
      tostring(objectId)))
  end

  guihooks.trigger('CrashInjuryProBufferTest', payload)
end

M.onBufferReady = onBufferReady

local function onProvisionalKnockout(objectId, peakResultantG, simTime, knockoutSendClockHp)
  local hop1RelayMs = nil
  if type(knockoutSendClockHp) == 'number' then
    hop1RelayMs = (os.clockhp() - knockoutSendClockHp) * 1000
  end
  log('I', 'crashInjuryPro', string.format(
    'PROVISIONAL KNOCKOUT trigger from vehicle %s: peakResultantG=%.3f simTime=%.3f hop1RelayMs(vehicle->GE)=%s (no pipeline run yet -- this is the raw chassis-g fast path)',
    tostring(objectId), peakResultantG or 0, simTime or 0, hop1RelayMs and string.format('%.2f', hop1RelayMs) or 'n/a'))

  local accepted, rejectReason = playerDrivingVehicle(objectId)
  if not accepted then
    log('I', 'crashInjuryPro', string.format(
      'PROVISIONAL KNOCKOUT from vehicle %s DISCARDED -- %s.', tostring(objectId), rejectReason))
    return
  end

  guihooks.trigger('CrashInjuryProProvisionalKnockout', { vehicleId = objectId, peakResultantG = peakResultantG, simTime = simTime, hop1RelayMs = hop1RelayMs })
end

local function onExposureTick(objectId, payload)
  local accepted, rejectReason = playerDrivingVehicle(objectId)
  if not accepted then

    return
  end
  if type(payload) ~= 'table' then
    log('W', 'crashInjuryPro', string.format('EXPOSURE tick from vehicle %s DISCARDED -- payload was %s, not a table.', tostring(objectId), type(payload)))
    return
  end
  payload.vehicleId = objectId
  guihooks.trigger('CrashInjuryProExposure', payload)
end

M.onExposureTick = onExposureTick

M.onProvisionalKnockout = onProvisionalKnockout

local savedOriginalMasterVolume = nil

local physicsPausedNow = false
local lastAudioStateJson = nil

local function captureOriginalMasterVolumeOnce()
  if savedOriginalMasterVolume ~= nil then return end
  local ok, value = pcall(function() return VariableRegistry.get('$pref::SFX::AudioChannelMaster') end)
  savedOriginalMasterVolume = (ok and type(value) == 'number') and value or 1
end

local function relayNeutralControlState(playerVeh)
  local ok, neutralJson = pcall(function()
    return jsonEncode({ unconscious = false, armsBrokenSides = 0, legDegraded = false, shockSluggish = false })
  end)
  if not ok then return end
  local ok2, escaped = pcall(function() return jsonEncode(neutralJson) end)
  if not ok2 then return end

  playerVeh:queueLuaCommand(string.format(
    'local c = controller.getController(%q) if c then c.setRealisticControlState(%s) end',
    'crashInjuryProRealisticControl', escaped))
end

local function teardownRealisticEffects()
  lastAudioStateJson = nil
  captureOriginalMasterVolumeOnce()
  Engine.Audio.setChannelVolume('AudioChannelMaster', savedOriginalMasterVolume)
  if core_sounds and core_sounds.setAudioBlur then
    core_sounds.setAudioBlur(0)
  end
  local playerVeh = getPlayerVehicle(0)
  if playerVeh then
    if core_sounds and core_sounds.setCabinFilterStrength then
      core_sounds.setCabinFilterStrength(playerVeh:getId(), 0)
    end

    relayNeutralControlState(playerVeh)
  end
end

M.onVehicleResetted = function(id)
  local playerVeh = getPlayerVehicle(0)
  if playerVeh and uiVehicleId() == id then

    pcall(function() guihooks.trigger('CrashInjuryProVehicleReset', { objID = id }) end)
    teardownRealisticEffects()
  end
end

M.onVehicleSwitched = function(oldId, newId, player)
  teardownRealisticEffects()
  local oldVeh = oldId and oldId >= 0 and be:getObjectByID(oldId) or nil
  local newVeh = newId and newId >= 0 and be:getObjectByID(newId) or nil
  if oldVeh and not occupiedCarId then noteOccupiedCar(oldVeh) end
  if newVeh and isPropVehicle(newVeh) and occupiedCarId and be:getObjectByID(occupiedCarId) then
    log('I', 'crashInjuryPro', string.format('PROP CONTROL: player took over %s; injuries still follow the occupied car %s.', tostring(newId), tostring(occupiedCarId)))
    return
  end
  if newVeh then noteOccupiedCar(newVeh) end
  if newId and newId >= 0 then pcall(sendVehicleInfo, newId) end
end

local UNCONSCIOUS_MIN_BLUR = 0.85
local UNCONSCIOUS_MASTER_VOLUME_MULT = 0.35

local function setRealisticAudioState(jsonStr)
  lastAudioStateJson = jsonStr

  if physicsPausedNow then return end
  local ok, state = pcall(jsonDecode, jsonStr, 'crashInjuryPro.setRealisticAudioState')
  if not ok or not state then
    log('E', 'crashInjuryPro', 'setRealisticAudioState: failed to decode state JSON: ' .. tostring(jsonStr))
    return
  end

  captureOriginalMasterVolumeOnce()

  if state.dead then
    Engine.Audio.setChannelVolume('AudioChannelMaster', 0)
    return
  end

  local blur = clamp(state.blur or 0, 0, 1)
  local volumeMult = clamp(state.volumeMult == nil and 1 or state.volumeMult, 0, 1)
  if state.unconscious then
    blur = math.max(blur, UNCONSCIOUS_MIN_BLUR)
    volumeMult = math.min(volumeMult, UNCONSCIOUS_MASTER_VOLUME_MULT)
  end

  Engine.Audio.setChannelVolume('AudioChannelMaster', savedOriginalMasterVolume * volumeMult)
  if core_sounds and core_sounds.setAudioBlur then
    core_sounds.setAudioBlur(blur)
  end

  local playerVeh = getPlayerVehicle(0)
  if playerVeh and core_sounds and core_sounds.setCabinFilterStrength then
    core_sounds.setCabinFilterStrength(playerVeh:getId(), blur)
  end
end

M.setRealisticAudioState = setRealisticAudioState

M.onPhysicsPaused = function()
  if physicsPausedNow then return end
  physicsPausedNow = true
  if savedOriginalMasterVolume ~= nil then
    pcall(function() Engine.Audio.setChannelVolume('AudioChannelMaster', savedOriginalMasterVolume) end)
    pcall(function() if core_sounds and core_sounds.setAudioBlur then core_sounds.setAudioBlur(0) end end)
  end
end
M.onPhysicsUnpaused = function()
  if not physicsPausedNow then return end
  physicsPausedNow = false
  if lastAudioStateJson then setRealisticAudioState(lastAudioStateJson) end
end

local function setRealisticControlState(jsonStr)
  local playerVeh = getPlayerVehicle(0)
  if not playerVeh then return end

  local ok, escaped = pcall(function() return jsonEncode(jsonStr) end)
  if not ok then
    log('E', 'crashInjuryPro', 'setRealisticControlState: failed to re-encode state for relay: ' .. tostring(jsonStr))
    return
  end

  playerVeh:queueLuaCommand(string.format(
    'local c = controller.getController(%q) if c then c.setRealisticControlState(%s) end',
    'crashInjuryProRealisticControl', escaped))
end

M.setRealisticControlState = setRealisticControlState

local function triggerImpactShake(pdofDeg, peakGForce, peakGz)
  local ok, err = pcall(function()
    core_camera.globalCameraFunction('crashInjuryProShake', 'trigger', pdofDeg, peakGForce, peakGz)
  end)
  if not ok then
    log('E', 'crashInjuryPro', 'triggerImpactShake: core_camera call failed: ' .. tostring(err))
  end
end

M.triggerImpactShake = triggerImpactShake

local function onImpactShakeRaw(objectId, pdofDeg, peakGForce, peakGz, shakeSendClockHp)

  local accepted = playerDrivingVehicle(objectId)
  if not accepted then return end

  if false and type(shakeSendClockHp) == 'number' then
    local shakeRelayMs = (os.clockhp() - shakeSendClockHp) * 1000
    log('I', 'crashInjuryPro', string.format(
      'LATENCY shake relay (vehicle Lua peak-found -> GE Lua onImpactShakeRaw, independent of buffer/pipeline): %.2fms.',
      shakeRelayMs))
  end
  triggerImpactShake(pdofDeg, peakGForce, peakGz)

  if type(peakGForce) == 'number' and peakGForce >= 9 then
    pcall(function() guihooks.trigger('CrashInjuryProImpact', { peakG = peakGForce, pdofDeg = pdofDeg }) end)
  end
end

M.onImpactShakeRaw = onImpactShakeRaw

local function setRealisticModeEnabled(enabled)
  local ok, err = pcall(function()
    core_camera.globalCameraFunction('crashInjuryProShake', 'setRealisticModeEnabled', enabled and true or false)
  end)
  if not ok then
    log('E', 'crashInjuryPro', 'setRealisticModeEnabled: core_camera call failed: ' .. tostring(err))
  end
end

M.setRealisticModeEnabled = setRealisticModeEnabled

local function setShakeSettings(mode, intensityFraction, dynEnabled, dynStrength, bodySway, driverRestraint)
  local ok, err = pcall(function()
    core_camera.globalCameraFunction('crashInjuryProShake', 'setShakeSettings', mode, intensityFraction, dynEnabled, dynStrength, bodySway, driverRestraint)
  end)
  if not ok then
    log('E', 'crashInjuryPro', 'setShakeSettings: core_camera call failed: ' .. tostring(err))
  end
end

M.setShakeSettings = setShakeSettings

local function findAppEntry(layout, appName)
  if not layout or type(layout.apps) ~= 'table' then return nil, nil end
  for i, entry in ipairs(layout.apps) do
    if entry and entry.appName == appName then return entry, i end
  end
  return nil, nil
end

local cockpitFixRan = false
registerAndFixCockpitVisibilityOnce = function()
  if cockpitFixRan then return end
  if not extensions.ui_appLayouts then
    log('W', 'crashInjuryPro', 'auto-register/cockpit-fix: extensions.ui_appLayouts not available -- skipping.')
    return
  end
  local ok, layouts = pcall(function() return extensions.ui_appLayouts.getAvailableLayouts() end)
  if not ok or type(layouts) ~= 'table' then
    log('W', 'crashInjuryPro', 'auto-register/cockpit-fix: getAvailableLayouts() failed or returned nothing -- will retry when the UI app links.')
    return
  end
  cockpitFixRan = true

  local addedCount, addFailedCount = 0, 0
  local cockpitFixedCount, cockpitOkCount, cockpitFailedCount = 0, 0, 0

  for _, layout in ipairs(layouts) do
    if layout and layout.filename then
      local entry, idx = findAppEntry(layout, 'crashInjuryPro')
      if not entry then

        local addOk, err = pcall(function()
          extensions.ui_appLayouts.addApp(layout.filename, 'crashInjuryPro', nil)
        end)
        if addOk then
          addedCount = addedCount + 1
        else
          addFailedCount = addFailedCount + 1
          log('E', 'crashInjuryPro', string.format(
            'auto-register into layout "%s" (%s) failed: %s', tostring(layout.title), tostring(layout.filename), tostring(err)))
        end
      elseif type(entry.settings) == 'table' and entry.settings.noCockpit == true then
        local newSettings = {}
        for k, v in pairs(entry.settings) do newSettings[k] = v end
        newSettings.noCockpit = false
        local patchOk, err = pcall(function()
          extensions.ui_appLayouts.applySettingsPatch(layout.filename, idx - 1, newSettings)
        end)
        if patchOk then
          cockpitFixedCount = cockpitFixedCount + 1
          log('I', 'crashInjuryPro', string.format(
            'cockpit-visibility fix: layout "%s" (%s) had noCockpit=true on crashInjuryPro\'s entry -- patched to false.',
            tostring(layout.title), tostring(layout.filename)))
        else
          cockpitFailedCount = cockpitFailedCount + 1
          log('E', 'crashInjuryPro', string.format(
            'cockpit-visibility fix FAILED on layout "%s" (%s): %s', tostring(layout.title), tostring(layout.filename), tostring(err)))
        end
      else
        cockpitOkCount = cockpitOkCount + 1
      end
    end
  end

  log('I', 'crashInjuryPro', string.format(
    'auto-register/cockpit-fix: %d layout(s) -- %d newly added, %d add failures | of the rest: %d needed a noCockpit fix (now applied), %d already correct, %d patch failures.',
    #layouts, addedCount, addFailedCount, cockpitFixedCount, cockpitOkCount, cockpitFailedCount))
end

local function onExtensionLoadedWithDiagnostics()
  local vehCount = 0
  local ok = pcall(function()
    local all = getAllVehicles and getAllVehicles() or {}
    for _ in ipairs(all) do vehCount = vehCount + 1 end
  end)

  log('I', 'crashInjuryPro', string.format(
    'GE EXTENSION LOADED (lazy -- something just indexed extensions.crashInjuryPro for the first time this session). Vehicles already in the level at this moment: %s.',
    ok and tostring(vehCount) or 'unknown'))

  if ok and vehCount > 0 then
    log('W', 'crashInjuryPro', string.format(
      'LOAD-ORDER GAP -- %d vehicle(s) were already loaded before this extension was. onJbeamLoadingPhase2 is only delivered to already-loaded extensions, so those vehicles never had their roof/door/dash/seat node groups classified, and cannot be re-classified now (BeamNG strips node.group during load). Intrusion is inert on them for the rest of this session. Reloading the vehicle re-runs the classification.',
      vehCount))
  end

  registerAndFixCockpitVisibilityOnce()
end

M.onExtensionLoaded = onExtensionLoadedWithDiagnostics

local pendingGroupClassification = {}

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

local vehicleLayoutById = {}
local collectVehicleLayout

local function groupNamesOf(node)
  local g, out = node.group, {}
  if type(g) == 'table' then
    for _, name in pairs(g) do if type(name) == 'string' then out[#out + 1] = name end end
  elseif type(g) == 'string' then out[1] = g end
  return out
end

local function nodeXYZ(node)
  local p = node.pos
  if type(p) == 'table' or type(p) == 'cdata' or type(p) == 'userdata' then
    local ok, x, y, z = pcall(function() return p.x, p.y, p.z end)
    if ok and type(x) == 'number' then return x, y, z end
  end
  if type(node.posX) == 'number' then return node.posX, node.posY, node.posZ end
  return nil
end

collectVehicleLayout = function(objID, vehicle, vehicleConfig)
  local ok, err = pcall(function()
    local seatPts, seatGroups, cage = {}, {}, false
    local cageWhy = nil
    local groupBox = {}
    for _, node in pairs(vehicle.nodes or {}) do
      if type(node) == 'table' then
        for _, name in ipairs(groupNamesOf(node)) do
          local lname = string.lower(name)
          if string.find(lname, 'cage', 1, true) or string.find(lname, 'rollbar', 1, true) then cage = true; cageWhy = cageWhy or ('node group ' .. lname) end
          if string.find(lname, 'seat', 1, true) and not string.find(lname, 'seatbelt', 1, true) then
            local x, y = nodeXYZ(node)
            if x then
              seatPts[#seatPts + 1] = { x = x, y = y }
              local b = groupBox[name]
              if not b then b = { sx = 0, sy = 0, n = 0, minX = math.huge, maxX = -math.huge, minY = math.huge, maxY = -math.huge }; groupBox[name] = b end
              b.sx, b.sy, b.n = b.sx + x, b.sy + y, b.n + 1
              if x < b.minX then b.minX = x end
              if x > b.maxX then b.maxX = x end
              if y < b.minY then b.minY = y end
              if y > b.maxY then b.maxY = y end
            end
            seatGroups[name] = true
          end
        end
      end
    end

    local partNames = {}
    local function addParts(t)
      if type(t) ~= 'table' then return end
      for slot, part in pairs(t) do
        if type(part) == 'string' and part ~= '' then partNames[#partNames + 1] = string.lower(tostring(slot) .. ' ' .. part) end
      end
    end
    if type(vehicleConfig) == 'table' then addParts(vehicleConfig.parts) end
    if type(vehicle.slotPartMap) == 'table' then addParts(vehicle.slotPartMap) end
    for _, p in ipairs(partNames) do

      local partOnly = string.match(p, '%s(%S+)$') or p
      partOnly = string.gsub(partOnly, '^.*/', '')
      if (string.find(partOnly, 'cage', 1, true) or string.find(partOnly, 'rollbar', 1, true) or string.find(partOnly, 'roll_bar', 1, true))
          and not string.find(partOnly, 'none', 1, true) then
        if not string.find(p, 'nocage', 1, true) and not string.find(p, 'no_cage', 1, true) then cage = true; cageWhy = p end
      end
    end

    local front, rear, known = 0, 0, false

    local groups, umbrellas = {}, {}
    for name, b in pairs(groupBox) do
      if b.n >= 2 then
        local g = { name = name, cy = b.sy / b.n, w = b.maxX - b.minX, h = b.maxY - b.minY }
        if g.h > 0.9 then umbrellas[#umbrellas + 1] = g else groups[#groups + 1] = g end
      end
    end
    local oneBigGroup = #groups == 0 and #umbrellas > 0
    for _, u in ipairs(umbrellas) do
      log('I', 'crashInjuryPro', string.format('VEHICLE LAYOUT: long seat group %s (%.2f m deep, %.2f m wide) read as a container, not one seat', u.name, u.h, u.w))
    end
    if #groups >= 1 and not oneBigGroup then
      known = true
      table.sort(groups, function(a, b) return a.cy < b.cy end)
      local rowsG, cur = {}, { groups[1] }
      for i = 2, #groups do
        if groups[i].cy - groups[i - 1].cy > 0.45 then rowsG[#rowsG + 1] = cur; cur = {} end
        cur[#cur + 1] = groups[i]
      end
      rowsG[#rowsG + 1] = cur
      local function seatsInRow(r)
        local n = 0
        for _, g in ipairs(r) do n = n + ((g.w >= 0.9) and 2 or 1) end
        return math.min(2, n)
      end
      front = seatsInRow(rowsG[1])
      rear = rowsG[2] and seatsInRow(rowsG[2]) or 0

      if front < 2 then known, front, rear = false, 0, 0 end

      if known and rear == 0 then
        local frontCy = 0
        for _, g in ipairs(rowsG[1]) do frontCy = frontCy + g.cy end
        frontCy = frontCy / #rowsG[1]
        local behind, minX, maxX = 0, math.huge, -math.huge
        for _, pt in ipairs(seatPts) do
          if pt.y > frontCy + 0.75 then
            behind = behind + 1
            if pt.x < minX then minX = pt.x end
            if pt.x > maxX then maxX = pt.x end
          end
        end
        if behind >= 4 then rear = (maxX - minX >= 0.6) and 2 or 1 end
      end
    end

    for _, p in ipairs(partNames) do
      if string.find(p, 'seats_r', 1, true) or string.find(p, 'seat_r', 1, true) or string.find(p, 'rearseat', 1, true)
          or string.find(p, 'rear_seat', 1, true) or string.find(p, 'seats_rear', 1, true) then
        if rear == 0 and not known then rear = 2 end
      end
    end

    local driverSide, driverHow = nil, 'default'
    local sideOk, sideErr = pcall(function()
      local leftSign = 1
      local rn = vehicle.refNodes and (vehicle.refNodes[0] or vehicle.refNodes[1])
      if type(rn) == 'table' and rn.left ~= nil and rn.ref ~= nil and vehicle.nodes then
        local nl, nr = vehicle.nodes[rn.left], vehicle.nodes[rn.ref]
        if nl and nr then
          local lx = nodeXYZ(nl)
          local rx = nodeXYZ(nr)
          if lx and rx and math.abs(lx - rx) > 0.05 then leftSign = (lx - rx) > 0 and 1 or -1 end
        end
      end
      local sx, sn = 0, 0
      for _, node in pairs(vehicle.nodes or {}) do
        if type(node) == 'table' then
          for _, name in ipairs(groupNamesOf(node)) do
            local lname = string.lower(name)
            if string.find(lname, 'steer', 1, true) and not string.find(lname, 'rack', 1, true) and not string.find(lname, 'hub', 1, true) then
              local x = nodeXYZ(node)
              if x then sx, sn = sx + x, sn + 1 end
              break
            end
          end
        end
      end
      local x = nil

      if type(vehicle.props) == 'table' then
        local px, pn = 0, 0
        for _, pr in pairs(vehicle.props) do
          if type(pr) == 'table' then
            local fn = string.lower(tostring(pr.func or ''))
            local mesh = string.lower(tostring(pr.mesh or ''))
            if fn == 'steering' and not string.find(mesh, 'rack', 1, true) then
              local idRef = pr.idRef
              local node = idRef ~= nil and vehicle.nodes and vehicle.nodes[idRef] or nil
              local nx = node and nodeXYZ(node) or nil
              if nx then

                px, pn = px + nx, pn + 1
              end
            end
          end
        end
        if pn >= 1 and math.abs(px / pn) > 0.20 then x, driverHow = px / pn, 'steering wheel prop' end
      end
      if not x and sn >= 2 and math.abs(sx / sn) > 0.15 then x, driverHow = sx / sn, 'steering wheel' end
      if not x and type(vehicle.camerasInternal) == 'table' then
        local best = nil
        for k, c in pairs(vehicle.camerasInternal) do
          if type(c) == 'table' then
            local cx = tonumber(c.x) or (type(c.pos) == 'table' and tonumber(c.pos.x)) or nil
            local nm = string.lower(tostring(c.name or c.camName or k or ''))
            if cx and (not best or string.find(nm, 'driver', 1, true)) then best = cx end
          end
        end
        if best and math.abs(best) > 0.15 then x, driverHow = best, 'driver camera' end
      end
      if x then driverSide = (x * leftSign > 0) and 'left' or 'right' end
    end)
    if not sideOk then log('W', 'crashInjuryPro', 'VEHICLE LAYOUT: driver side check failed -- ' .. tostring(sideErr)) end
    local names = {}
    for name in pairs(seatGroups) do names[#names + 1] = name end
    vehicleLayoutById[objID] = {
      model = tostring(vehicle.model or (vehicle.information and vehicle.information.name) or '?'),
      seatsKnown = known, frontSeats = front, rearSeats = rear, rollCage = cage, partsKnown = #partNames > 0,
      driverSide = driverSide,
    }
    log('I', 'crashInjuryPro', string.format('VEHICLE LAYOUT: driver sits on the %s (from the %s)', tostring(driverSide or 'left'), driverHow))
    log('I', 'crashInjuryPro', string.format(
      'VEHICLE LAYOUT: %s (objID=%d) seats front=%d rear=%d (known=%s, %d seat nodes, groups: %s; %d parts) rollCage=%s',
      tostring(vehicleLayoutById[objID].model), objID, front, rear, tostring(known), #seatPts,
      table.concat(names, ','), #partNames, tostring(cage) .. (cageWhy and (' (' .. cageWhy .. ')') or '')))
  end)
  if not ok then log('W', 'crashInjuryPro', 'VEHICLE LAYOUT: failed -- ' .. tostring(err)) end
end

local function vehicleYear(veh)
  local ok, year = pcall(function()
    local model = veh.JBeam or (veh.getJBeamFilename and veh:getJBeamFilename())
    if not model or not core_vehicles or not core_vehicles.getModel then return nil end
    local m = core_vehicles.getModel(model)
    if not m then return nil end
    local cfgName = nil
    local pc = veh.partConfig
    if type(pc) == 'string' then cfgName = string.match(pc, '([^/\\]+)%.pc$') end
    local years = nil
    if cfgName and m.configs and m.configs[cfgName] then years = m.configs[cfgName].Years end
    years = years or (m.model and m.model.Years)
    if type(years) == 'table' then return tonumber(years.min) or tonumber(years.max) end
    return nil
  end)
  return ok and year or nil
end

sendVehicleInfo = function(objID)
  local veh = objID and be:getObjectByID(objID)
  if not veh then return end

  if not vehicleLayoutById[objID] then
    pcall(function()
      local vm = core_vehicle_manager
      local vd = vm and vm.getVehicleData and vm.getVehicleData(objID)
      if vd and type(vd.vdata) == 'table' then
        collectVehicleLayout(objID, vd.vdata, vd.config or vd.vdata.config)
        if vehicleLayoutById[objID] then
          log('I', 'crashInjuryPro', 'VEHICLE LAYOUT: read late from the vehicle manager (the car was loaded before this extension).')
        end
      end
    end)
  end
  local layout = vehicleLayoutById[objID] or {}
  local info = {
    objID = objID,
    model = layout.model or tostring(veh.JBeam),
    year = vehicleYear(veh),
    seatsKnown = layout.seatsKnown == true,
    frontSeats = layout.frontSeats or 0,
    rearSeats = layout.rearSeats or 0,
    rollCage = layout.rollCage == true,
    partsKnown = layout.partsKnown == true,
    driverSide = layout.driverSide,
  }
  guihooks.trigger('CrashInjuryProVehicleInfo', info)
  log('I', 'crashInjuryPro', string.format('VEHICLE INFO -> UI: %s year=%s seats %s+%s (known=%s) rollCage=%s',
    tostring(info.model), tostring(info.year), tostring(info.frontSeats), tostring(info.rearSeats),
    tostring(info.seatsKnown), tostring(info.rollCage)))
end

M.requestVehicleInfo = function()
  noteOccupiedCar(getPlayerVehicle(0))
  local id = uiVehicleId()
  if id then sendVehicleInfo(id) end
end

local function classifyAndStoreGroups(loadingProgress, objID, vehicle, unifyJournal, vehicleConfig, vars)
  local ok, err = pcall(function()
    if not vehicle or type(vehicle.nodes) ~= 'table' then
      log('W', 'crashInjuryPro', 'INTRUSION RELAY: vehicle.nodes not present at onJbeamLoadingPhase2 -- nothing to classify.')
      return
    end

    local seatCids, roofCids, doorCids, dashCids = {}, {}, {}, {}
    for _, node in pairs(vehicle.nodes) do
      if type(node) == 'table' and type(node.cid) == 'number' then
        if nodeGroupContainsSubstring(node, 'seat') then seatCids[#seatCids + 1] = node.cid end
        if nodeGroupContainsSubstring(node, 'roof') then roofCids[#roofCids + 1] = node.cid end
        if nodeGroupContainsSubstring(node, 'door') then doorCids[#doorCids + 1] = node.cid end
        if nodeGroupContainsSubstring(node, 'dash') then dashCids[#dashCids + 1] = node.cid end
      end
    end

    pendingGroupClassification[objID] = {
      seatCids = seatCids, roofCids = roofCids, doorCids = doorCids, dashCids = dashCids,
    }
    collectVehicleLayout(objID, vehicle, vehicleConfig)

    log('I', 'crashInjuryPro', string.format(
      'INTRUSION RELAY: classified vehicle=%s (objID=%d) BEFORE cleanup strips node.group -- seat=%d roof=%d door=%d dash=%d node(s) by group-name substring match. Awaiting requestGroupClassification() from the vehicle side.',
      tostring(vehicle.model), objID, #seatCids, #roofCids, #doorCids, #dashCids))
  end)
  if not ok then
    log('E', 'crashInjuryPro', 'INTRUSION RELAY: classifyAndStoreGroups failed: ' .. tostring(err))
  end
end

M.onJbeamLoadingPhase2 = classifyAndStoreGroups

local function requestGroupClassification(objID)
  local data = pendingGroupClassification[objID]
  pendingGroupClassification[objID] = nil

  local veh = be:getObjectByID(objID)
  if not veh then
    log('W', 'crashInjuryPro', string.format('INTRUSION RELAY: requestGroupClassification(%d) -- no such vehicle object, cannot relay.', objID))
    return
  end

  local ok, encoded = pcall(function()
    return serialize(data or { seatCids = {}, roofCids = {}, doorCids = {}, dashCids = {} })
  end)
  if not ok then
    log('E', 'crashInjuryPro', 'INTRUSION RELAY: requestGroupClassification serialize failed: ' .. tostring(encoded))
    return
  end

  veh:queueLuaCommand(string.format(
    'local c = extensions.auto_crashInjuryProCapture if c and c.receiveGroupClassification then c.receiveGroupClassification(%s) end',
    encoded))
end

M.requestGroupClassification = requestGroupClassification

local function clearPendingClassification(whenLabel)
  local n = 0
  for _ in pairs(pendingGroupClassification) do n = n + 1 end
  pendingGroupClassification = {}
  log('I', 'crashInjuryPro', string.format(
    'LIFECYCLE (%s): cleared %d stale pending node-group classification entr%s. GE-side state is otherwise preserved across the transition; every vehicle re-loads its own capture module fresh on spawn.',
    whenLabel, n, n == 1 and 'y' or 'ies'))
end

M.onClientStartMission = function(levelPath)
  log('I', 'crashInjuryPro', string.format('LIFECYCLE: level starting (%s). GE extension survived the transition and is still loaded.', tostring(levelPath)))
  clearPendingClassification('level start')
end

M.onClientEndMission = function(levelPath)
  log('I', 'crashInjuryPro', string.format('LIFECYCLE: level ending (%s).', tostring(levelPath)))
  clearPendingClassification('level end')
end

return M
