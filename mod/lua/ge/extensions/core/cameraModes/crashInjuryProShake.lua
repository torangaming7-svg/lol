local C = {}
C.__index = C

local deg2rad = math.pi / 180
local function clamp(v, lo, hi) return math.min(hi, math.max(lo, v)) end

local SHAKE_MIN_TRIGGER_G = 2.0

local SHAKE_SATURATE_G = 40.0

local SHAKE_MAX_PITCH_DEG = 26
local SHAKE_MAX_YAW_DEG = 18
local SHAKE_MAX_ROLL_DEG = 12
local SHAKE_MAX_POS_M = 0.11

local SHAKE_DURATION_S = 0.42

local SHAKE_CYCLES = 2.4

local ROTATION_SHAKE_MIN_RAD_S = 1.3

local ROTATION_SHAKE_SATURATE_RAD_S = 6.5

local ROTATION_SHAKE_MAX_PITCH_DEG = 10
local ROTATION_SHAKE_MAX_YAW_DEG = 15
local ROTATION_SHAKE_MAX_ROLL_DEG = 20
local ROTATION_SHAKE_MAX_POS_M = 0.09

local ROTATION_SHAKE_FREQ_HZ_PITCH = 6.3
local ROTATION_SHAKE_FREQ_HZ_YAW = 4.7
local ROTATION_SHAKE_FREQ_HZ_ROLL = 8.1

local VERTICAL_SHAKE_MIN_G = 1.5
local VERTICAL_SHAKE_SATURATE_G = 12.0

local VERTICAL_SHAKE_MAX_POS_M = 0.16
local VERTICAL_SHAKE_MAX_PITCH_DEG = 7

function C:init()
  self.isGlobal = true
  self.isFilter = true
  self.hidden = true

  self.runningOrder = 0.65

  self.active = false
  self.elapsed = 0
  self.severity = 0
  self.fwdFrac = 0
  self.rightFrac = 0

  self.vertSeverity = 0

  self.realisticModeEnabled = false

  self.shakeMode = 'realisticOnly'
  self.shakeIntensityFraction = 1.0

  self.rotationApiBroken = false
  self.rotElapsedS = 0

  self.lastVehRot = nil
  self.dynEnabled = true
  self.dynStrength = 0.6
  self.trauma = 0
  self.fovPunch = 0
  self.noiseT = 0

  log('I', 'crashInjuryProShake', 'camera filter loaded (isGlobal/isFilter/runningOrder=' .. tostring(self.runningOrder) .. ') -- confirms this mod-supplied cameraModes file was discovered by core_camera.')
end

function C:setRealisticModeEnabled(enabled)
  self.realisticModeEnabled = enabled and true or false
end

local VALID_SHAKE_MODES = { off = true, realisticOnly = true, always = true }
function C:setShakeSettings(mode, intensityFraction, dynEnabled, dynStrength, bodySway, driverRestraint)
  self.shakeMode = VALID_SHAKE_MODES[mode] and mode or 'realisticOnly'
  self.shakeIntensityFraction = clamp(tonumber(intensityFraction) or 1.0, 0, 2)
  if dynEnabled ~= nil then self.dynEnabled = dynEnabled and true or false end
  if dynStrength ~= nil then self.dynStrength = clamp(tonumber(dynStrength) or 0.6, 0, 1) end
  if bodySway ~= nil then self.bodySway = clamp(tonumber(bodySway) or 0.6, 0, 1) end

  if driverRestraint ~= nil then self.driverRestraint = clamp(math.floor(tonumber(driverRestraint) or 1), 0, 2) end
  log('I', 'crashInjuryProShake', string.format('settings: shake=%s %.0f%% | dynamic camera=%s %.0f%% | body %.0f%% restraint=%d',
    self.shakeMode, self.shakeIntensityFraction * 100, tostring(self.dynEnabled), (self.dynStrength or 0) * 100,
    (self.bodySway or 0) * 100, self.driverRestraint or 1))
end

function C:shakeActive()
  if self.shakeMode == 'off' then return false end

  return true
end

local SPRING_HZ = 3.2
local SPRING_DAMPING = 0.42
local KICK_MAX_PITCH_DEG = 16
local KICK_MAX_YAW_DEG = 10
local KICK_MAX_ROLL_DEG = 12
local KICK_MAX_POS_M = 0.12
local KICK_MAX_DROP_M = 0.15
local ROLL_MIN_RAD_S = 2.6
local ROLL_SAT_RAD_S = 9.0
local ROLL_LEAN_MAX_DEG = 5
local JOLT_RAD_S2 = 60

function C:resetSpring()
  self.sp = { p = 0, y = 0, r = 0, x = 0, f = 0, z = 0 }
  self.sv = { p = 0, y = 0, r = 0, x = 0, f = 0, z = 0 }
end

function C:kick(sev, fwd, right, vert)
  if not self.sp then self:resetSpring() end

  local w = 2 * math.pi * SPRING_HZ

  local s = sev
  self.sv.p = self.sv.p + w * s * fwd * KICK_MAX_PITCH_DEG * deg2rad
  self.sv.y = self.sv.y + w * s * right * KICK_MAX_YAW_DEG * deg2rad
  self.sv.r = self.sv.r + w * s * right * KICK_MAX_ROLL_DEG * deg2rad
  self.sv.x = self.sv.x + w * s * right * KICK_MAX_POS_M
  self.sv.f = self.sv.f + w * s * fwd * KICK_MAX_POS_M
  self.sv.z = self.sv.z - w * (vert or 0) * KICK_MAX_DROP_M

  self.trauma = math.min(1, (self.trauma or 0) + 0.08 + 0.92 * sev)
  self.fovPunch = math.min(16, (self.fovPunch or 0) + 16 * sev)
  self.active = true
end

function C:trigger(pdofDeg, peakGForce, peakGz)
  if not self:shakeActive() then return end
  peakGForce = tonumber(peakGForce) or 0
  if peakGForce < 8.0 then return end

  local sev = clamp(((peakGForce - 8.0) / 50.0) ^ 0.8, 0, 1)
  local pdofRad = (tonumber(pdofDeg) or 0) * deg2rad
  local vertGExcess = math.abs((tonumber(peakGz) or 1.0) - 1.0)
  local vertSev = clamp((vertGExcess - VERTICAL_SHAKE_MIN_G) / (VERTICAL_SHAKE_SATURATE_G - VERTICAL_SHAKE_MIN_G), 0, 1)
  self:kick(sev, math.cos(pdofRad), math.sin(pdofRad), vertSev)
  log('I', 'crashInjuryProShake', string.format('kick: pdofDeg=%.1f peakG=%.1f severity=%.2f vertical=%.2f', tonumber(pdofDeg) or 0, peakGForce, sev, vertSev))
end

function C:angularSpeed(data, dt)
  if self.rotationApiBroken or not data.veh then self.lastVehRot = nil return 0 end
  local ok, curRot = pcall(function() return quat(data.veh:getRotation()) end)
  if not ok or not curRot then
    self.rotationApiBroken = true
    self.lastVehRot = nil
    log('E', 'crashInjuryProShake', 'rotation sway disabled: data.veh:getRotation() failed: ' .. tostring(curRot))
    return 0
  end
  local av = 0
  if self.lastVehRot and dt > 0 then
    local dotVal = clamp(math.abs(curRot:dot(self.lastVehRot)), 0, 1)
    av = (2 * math.acos(dotVal)) / dt
  end
  self.lastVehRot = curRot
  return av
end

local DYN_HZ, DYN_DAMP = 2.1, 0.5
local DYN_MAX_PITCH_DEG, DYN_MAX_ROLL_DEG, DYN_MAX_Z_M = 7, 8, 0.16
local G = 9.81

function C:resetDyn()
  self.dp = { p = 0, r = 0, z = 0, y = 0, x = 0, f = 0 }
  self.dv = { p = 0, r = 0, z = 0, y = 0, x = 0, f = 0 }
  self.aUslow = nil
  self.rumbleE = 0
  self.aS = nil
  self.lastVel = nil
  self.fovSpeed = 0
end

local function dz(v, d)
  if v > d then return v - d elseif v < -d then return v + d end
  return 0
end

local function noise(t, a, b, c)
  return (math.sin(t * a) + 0.6 * math.sin(t * b + 1.3) + 0.35 * math.sin(t * c + 2.1)) / 1.95
end

function C:update(data)
  if data.openxrSessionRunning then return true end
  local dt = data.dt or data.dtReal or 0
  if not self.sp then self:resetSpring() end
  if not self.dp then self:resetDyn() end
  local shakeOn = self:shakeActive() and self.shakeIntensityFraction > 0
  local dynOn = self.dynEnabled and (self.dynStrength or 0) > 0 and data.veh ~= nil

  local shakeM = shakeOn and clamp(self.shakeIntensityFraction or 1, 0, 2) or 0
  local av = self:angularSpeed(data, dt)
  if dt <= 0 or dt > 0.25 then self.lastAv = av return true end

  local pitch, yaw, roll = 0, 0, 0
  local ox, of, oz = 0, 0, 0
  local fovAdd = 0

  if shakeOn then
    local leanTarget = 0
    if av > ROLL_MIN_RAD_S then
      local rs = clamp((av - ROLL_MIN_RAD_S) / (ROLL_SAT_RAD_S - ROLL_MIN_RAD_S), 0, 1)
      leanTarget = rs * ROLL_LEAN_MAX_DEG * deg2rad
      self.rollT = (self.rollT or 0) + dt
      self.active = true
    end
    local jolt = self.lastAv and math.abs(av - self.lastAv) / dt or 0
    if self.lastAv and (av > ROLL_MIN_RAD_S or self.lastAv > ROLL_MIN_RAD_S) and jolt > JOLT_RAD_S2 then
      local js = clamp((jolt - JOLT_RAD_S2) / (JOLT_RAD_S2 * 5), 0, 1) * 0.6
      local a = (self.rollT or 0) * 2.3
      self:kick(js, math.sin(a), math.cos(a * 1.3), js * 0.5)
    end
    if self.active then
      local w = 2 * math.pi * SPRING_HZ
      local k, c = w * w, 2 * SPRING_DAMPING * w
      local steps = math.max(1, math.ceil(dt / 0.008))
      local h = dt / steps
      local target = { p = 0, y = 0, r = leanTarget, x = 0, f = 0, z = 0 }
      for _ = 1, steps do
        for key, x in pairs(self.sp) do
          local v = self.sv[key]
          v = v + (-k * (x - target[key]) - c * v) * h
          self.sv[key] = v
          self.sp[key] = x + v * h
        end
      end
      local moving = false
      for key, x in pairs(self.sp) do
        if math.abs(x - target[key]) > 1e-4 or math.abs(self.sv[key]) > 1e-3 then moving = true break end
      end
      local m = self.shakeIntensityFraction
      pitch, yaw, roll = pitch + self.sp.p * m, yaw + self.sp.y * m, roll + self.sp.r * m
      ox, of, oz = ox + self.sp.x * m, of + self.sp.f * m, oz + self.sp.z * m

      self.noiseT = (self.noiseT or 0) + dt
      local tr = (self.trauma or 0)
      if tr > 0.001 then
        local t2 = tr * tr * m
        local t = self.noiseT
        pitch = pitch + t2 * 7 * deg2rad * noise(t, 71, 113, 167)
        yaw = yaw + t2 * 5 * deg2rad * noise(t, 83, 127, 151)
        roll = roll + t2 * 6 * deg2rad * noise(t, 61, 97, 139)
        ox = ox + t2 * 0.05 * noise(t, 89, 131, 173)
        oz = oz + t2 * 0.05 * noise(t, 67, 109, 157)
        self.trauma = math.max(0, tr - dt * 1.1)
      end
      if (self.fovPunch or 0) > 0.01 then
        fovAdd = fovAdd - self.fovPunch * m
        self.fovPunch = self.fovPunch * math.exp(-dt * 6)
      else
        self.fovPunch = 0
      end
      if not moving and leanTarget == 0 and (self.trauma or 0) <= 0.001 and (self.fovPunch or 0) <= 0.01 then
        self.active = false
        self:resetSpring()
      end
    end
  else
    self.active = false
    self.trauma = 0
    self.fovPunch = 0
    self:resetSpring()
  end
  self.lastAv = av

  if dynOn then
    local okV, vel = pcall(function() return data.veh:getVelocity() end)
    local okF, fwd = pcall(function() return data.veh:getDirectionVector() end)
    local okU, up = pcall(function() return data.veh:getDirectionVectorUp() end)
    if okV and vel and okF and fwd and okU and up then
      vel = vec3(vel)
      fwd = vec3(fwd):normalized()
      up = vec3(up):normalized()
      if self.lastVel then
        local a = (vel - self.lastVel) / dt
        local mag = a:length()
        if mag > 400 then a = vec3(0, 0, 0) end

        local aUraw = clamp(a:dot(up), -6 * G, 6 * G)
        self.aUslow = (self.aUslow or aUraw) + (aUraw - (self.aUslow or aUraw)) * math.min(1, dt * 3)
        local hp = (aUraw - self.aUslow) / G
        self.rumbleE = (self.rumbleE or 0) + (hp * hp - (self.rumbleE or 0)) * math.min(1, dt * 4)

        local spike = mag > 3 * G
        if mag > 4 * G and mag <= 400 then a = a * (4 * G / mag) end
        if not self.aS then self.aS = a end
        if not spike then self.aS = self.aS + (a - self.aS) * math.min(1, dt * 7) end
      end
      self.lastVel = vel
      local aS = self.aS or vec3(0, 0, 0)
      local right = fwd:cross(up):normalized()
      local aF, aR, aU = aS:dot(fwd) / G, aS:dot(right) / G, aS:dot(up) / G
      local tgt = {
        p = clamp(-dz(aF, 0.15) * 1.8, -4, 4) * deg2rad,
        r = clamp(dz(aR, 0.15) * 2.0, -4, 4) * deg2rad,

        z = clamp(-dz(aU, 0.3) * 0.05, -0.14, 0.14),
        y = 0, x = 0, f = 0,
      }

      local camName = nil
      pcall(function() camName = core_camera.getActiveCamName() end)
      local sway = self.bodySway or 0.6
      if camName == 'driver' and sway > 0 then
        local rest = self.driverRestraint or 1
        local kLat = rest == 0 and 0.11 or (rest == 2 and 0.012 or 0.035)
        local kFwd = rest == 0 and 0.14 or (rest == 2 and 0.01 or 0.03)
        local kTilt = rest == 0 and 7 or (rest == 2 and 1 or 2.5)
        tgt.x = clamp(-dz(aR, 0.1) * kLat, -0.22, 0.22) * sway
        tgt.f = clamp(-dz(aF, 0.1) * kFwd, -0.22, 0.22) * sway
        tgt.r = tgt.r + clamp(-dz(aR, 0.1) * kTilt, -8, 8) * deg2rad * sway
      end
      if av > 2.2 and shakeM > 0 then
        local rs = clamp((av - 2.2) / 6, 0, 1) * math.min(shakeM, 1.5)
        self.dynRollT = (self.dynRollT or 0) + dt
        tgt.r = tgt.r + rs * 5 * deg2rad * math.sin(self.dynRollT * 2.4)
        tgt.y = rs * 3 * deg2rad * math.sin(self.dynRollT * 1.7 + 0.8)
      else
        self.dynRollT = 0
      end
      local w = 2 * math.pi * DYN_HZ
      local k, c = w * w, 2 * DYN_DAMP * w
      local steps = math.max(1, math.ceil(dt / 0.008))
      local h = dt / steps
      for _ = 1, steps do
        for key, x in pairs(self.dp) do
          local v = self.dv[key]
          v = v + (-k * (x - tgt[key]) - c * v) * h
          self.dv[key] = v
          self.dp[key] = x + v * h
        end
      end
      local m2 = self.dynStrength or 0.6
      pitch, roll, yaw = pitch + self.dp.p * m2, roll + self.dp.r * m2, yaw + self.dp.y * m2
      oz = oz + self.dp.z * math.min(shakeM, 1.5)
      ox, of = ox + self.dp.x, of + self.dp.f
      local rumble = math.sqrt(math.max(0, self.rumbleE or 0))

      local ru = clamp((rumble - 0.45) / 1.2, 0, 1) * shakeM
      if ru > 0.001 and vel:length() > 3 then
        self.noiseT = (self.noiseT or 0) + dt
        local t = self.noiseT
        pitch = pitch + ru * 1.0 * deg2rad * noise(t, 53, 89, 131)
        roll = roll + ru * 0.8 * deg2rad * noise(t, 47, 79, 121)
        oz = oz + ru * 0.015 * noise(t, 59, 97, 143)
      end
      local speed = vel:length()
      local fs = clamp((speed - 12) / 55, 0, 1) * 7 * m2
      self.fovSpeed = (self.fovSpeed or 0) + (fs - (self.fovSpeed or 0)) * math.min(1, dt * 1.5)
      fovAdd = fovAdd + self.fovSpeed
    end
  elseif self.aS or self.lastVel then
    self:resetDyn()
  end

  if pitch == 0 and yaw == 0 and roll == 0 and ox == 0 and of == 0 and oz == 0 and fovAdd == 0 then return true end
  local q = quat(0, 0, 0, 1)
  q = quatFromEuler(0, 0, yaw) * q
  q = quatFromEuler(0, roll, 0) * q
  q = quatFromEuler(pitch, 0, 0) * q
  data.res.rot = q * data.res.rot
  local off = vec3(ox, of, oz)
  local okRot, rotated = pcall(function() return data.res.rot * off end)
  data.res.pos = data.res.pos + ((okRot and rotated) or off)
  if fovAdd ~= 0 and type(data.res.fov) == 'number' then
    data.res.fov = clamp(data.res.fov + fovAdd, 10, 150)
  end
  return true
end

function C:onVehicleSwitched()
  self.active = false
  self:resetDyn()
  self.lastVehRot = nil
  self.lastAv = nil
  self:resetSpring()
end

return function(...)
  local o = ... or {}
  setmetatable(o, C)
  o:init()
  return o
end
