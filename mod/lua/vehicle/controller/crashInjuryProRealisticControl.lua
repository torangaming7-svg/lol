local M = {}
M.type = "auxiliary"
M.defaultOrder = 705

local state = {
  unconscious = false,
  armsBrokenSides = 0,
  legDegraded = false,
  shockSluggish = false,

  medKitBusy = false
}

local steeringLagValue = 0
local throttleLagValue = 0
local brakeLagValue = 0

local ARM_STEERING_RANGE_MULT = 0.55
local ARM_STEERING_LAG_RATE = 3
local LEG_PEDAL_MAX_MULT = 0.6
local LEG_PEDAL_LAG_RATE = 4
local SHOCK_SLUGGISH_MULT = 0.7

local function setRealisticControlState(jsonStr)
  local ok, decoded = pcall(jsonDecode, jsonStr, "crashInjuryProRealisticControl.setRealisticControlState")
  if not ok or not decoded then
    log("E", "crashInjuryProRealisticControl", "setRealisticControlState: failed to decode: " .. tostring(jsonStr))
    return
  end
  state.unconscious = decoded.unconscious == true
  state.armsBrokenSides = decoded.armsBrokenSides or 0
  state.legDegraded = decoded.legDegraded == true
  state.shockSluggish = decoded.shockSluggish == true
  state.medKitBusy = decoded.medKitBusy == true
end

local function lerpTo(current, target, dt, rate)
  local a = math.min(1, dt * rate)
  return current + (target - current) * a
end

local function updateGFX(dt)
  if not playerInfo.anyPlayerSeated then return end
  if ai.isDriving() then return end

  if not (state.unconscious or state.medKitBusy or state.armsBrokenSides > 0 or state.legDegraded or state.shockSluggish) then

    steeringLagValue, throttleLagValue, brakeLagValue = 0, 0, 0
    return
  end

  if state.unconscious or state.medKitBusy then
    input.event("steering", 0, 0, nil, nil, nil, "local")
    input.event("throttle", 0, 0, nil, nil, nil, "local")
    input.event("brake", 0, 0, nil, nil, nil, "local")
    electrics.values.throttle = 0
    electrics.values.brake = 0
    steeringLagValue, throttleLagValue, brakeLagValue = 0, 0, 0
    return
  end

  local rawSteering = input.state.steering.val or 0
  local rawThrottle = input.state.throttle.val or 0
  local rawBrake = input.state.brake.val or 0

  local steeringOut = rawSteering
  if state.armsBrokenSides >= 2 then
    steeringOut = 0
    steeringLagValue = 0
  elseif state.armsBrokenSides == 1 then
    local target = clamp(rawSteering, -1, 1) * ARM_STEERING_RANGE_MULT
    steeringLagValue = lerpTo(steeringLagValue, target, dt, ARM_STEERING_LAG_RATE)
    steeringOut = steeringLagValue
  end

  local throttleOut, brakeOut = rawThrottle, rawBrake
  if state.legDegraded then
    local throttleTarget = clamp(rawThrottle, 0, 1) * LEG_PEDAL_MAX_MULT
    local brakeTarget = clamp(rawBrake, 0, 1) * LEG_PEDAL_MAX_MULT
    throttleLagValue = lerpTo(throttleLagValue, throttleTarget, dt, LEG_PEDAL_LAG_RATE)
    brakeLagValue = lerpTo(brakeLagValue, brakeTarget, dt, LEG_PEDAL_LAG_RATE)
    throttleOut, brakeOut = throttleLagValue, brakeLagValue
  end

  if state.shockSluggish then
    steeringOut = steeringOut * SHOCK_SLUGGISH_MULT
    throttleOut = throttleOut * SHOCK_SLUGGISH_MULT
    brakeOut = brakeOut * SHOCK_SLUGGISH_MULT
  end

  if steeringOut ~= rawSteering then
    input.event("steering", steeringOut, 0, nil, nil, nil, "local")
  end
  if throttleOut ~= rawThrottle or brakeOut ~= rawBrake then
    input.event("throttle", throttleOut, 0, nil, nil, nil, "local")
    input.event("brake", brakeOut, 0, nil, nil, nil, "local")

    electrics.values.throttle = throttleOut
    electrics.values.brake = brakeOut
  end
end

local function init(jbeamData)
  state.unconscious = false
  state.armsBrokenSides = 0
  state.legDegraded = false
  state.shockSluggish = false
  state.medKitBusy = false
  steeringLagValue, throttleLagValue, brakeLagValue = 0, 0, 0
end

local function reset(jbeamData)
  init(jbeamData)
end

M.init = init
M.reset = reset
M.updateGFX = updateGFX
M.setRealisticControlState = setRealisticControlState

return M
