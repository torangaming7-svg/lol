
var CrashInjuryPipeline = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  
  var generated_entry_exports = {};
  __export(generated_entry_exports, {
    CFC: () => CFC,
    HEDGE_SUFFIX: () => HEDGE_SUFFIX,
    ISS_MAJOR_TRAUMA_THRESHOLD: () => ISS_MAJOR_TRAUMA_THRESHOLD,
    LOWER_FIDELITY_SUFFIX: () => LOWER_FIDELITY_SUFFIX,
    STANDARD_GRAVITY_M_S2: () => STANDARD_GRAVITY_M_S2,
    assertValidTrace: () => assertValidTrace,
    buildInjuryReport: () => buildInjuryReport,
    cfcLowpass: () => cfcLowpass,
    chestRisk: () => chestRisk,
    computeChest3ms: () => computeChest3ms,
    computeFemurLoad: () => computeFemurLoad,
    computeHIC15: () => computeHIC15,
    computeInjuries: () => computeInjuries,
    computeIntrusionInjuriesForEvent: () => computeIntrusionInjuriesForEvent,
    computeOccupantResponse: () => computeOccupantResponse,
    deltaVForEvent: () => deltaVForEvent,
    femurRisk: () => femurRisk,
    headRiskCumulativeNormal: () => headRiskCumulativeNormal,
    mergeIntrusionInjuries: () => mergeIntrusionInjuries,
    pdof: () => pdof,
    presentInjuryPlainLayer: () => presentInjuryPlainLayer,
    resolveRestraintConfig: () => resolveRestraintConfig,
    resultant: () => resultant,
    segmentEvents: () => segmentEvents,
    selectAisLevelFromDeltaVBands: () => selectAisLevelFromDeltaVBands
  });

  
  function resultant(ax, ay, az) {
    const n = ax.length;
    if (ay.length !== n || az.length !== n) {
      throw new Error(`resultant: channel length mismatch (ax=${n}, ay=${ay.length}, az=${az.length})`);
    }
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = ax[i];
      const y = ay[i];
      const z = az[i];
      out[i] = Math.sqrt(x * x + y * y + z * z);
    }
    return out;
  }

  
  var STANDARD_GRAVITY_M_S2 = 9.80665;
  var CFC_ANGULAR_FREQUENCY_SCALE_FACTOR = 2.0775;
  var CFC_MIN_SAMPLE_RATE_MULTIPLE = 10;
  var CFC = {
    CFC_60: 60,
    CFC_180: 180,
    CFC_600: 600,
    CFC_1000: 1e3
  };

  
  function cfcLowpass(signal, sampleRateHz, cfc) {
    if (!(sampleRateHz > 0)) {
      throw new Error(`cfcLowpass: sampleRateHz must be > 0, got ${sampleRateHz}`);
    }
    if (!(cfc > 0)) {
      throw new Error(`cfcLowpass: cfc must be > 0, got ${cfc}`);
    }
    const minRequiredSampleRateHz = CFC_MIN_SAMPLE_RATE_MULTIPLE * cfc;
    const degraded = sampleRateHz < minRequiredSampleRateHz;
    const appliedCfc = degraded ? sampleRateHz / CFC_MIN_SAMPLE_RATE_MULTIPLE : cfc;
    const dataQuality = {
      requestedCfc: cfc,
      appliedCfc,
      sampleRateHz,
      minRequiredSampleRateHz,
      degraded,
      note: degraded ? `Sample rate (${sampleRateHz} Hz) is below the SAE J211-1 (1995) \xA79.2 minimum (${minRequiredSampleRateHz} Hz) required for CFC${cfc}. Filtered at CFC${appliedCfc.toFixed(1)} instead -- the highest class this sample rate legally supports. A lower CFC applies heavier smoothing, which attenuates short-duration peaks: any criterion computed from this signal that depends on a peak value (e.g. HIC) will be biased LOW, not high. Treat results derived from this channel as UNDERESTIMATING injury severity, never overestimating it.` : `Sample rate (${sampleRateHz} Hz) meets the SAE J211-1 (1995) \xA79.2 minimum (${minRequiredSampleRateHz} Hz) for CFC${cfc}. No degradation.`
    };
    if (signal.length < 3) {
      return { signal: signal.slice(), dataQuality };
    }
    const coeffs = cfcCoefficients(sampleRateHz, appliedCfc);
    const forward = runRecursive(signal, coeffs);
    const forwardReversed = reverseCopy(forward);
    const backward = runRecursive(forwardReversed, coeffs);
    return { signal: reverseCopy(backward), dataQuality };
  }
  function cfcCoefficients(sampleRateHz, cfc) {
    const T = 1 / sampleRateHz;
    const wd = 2 * Math.PI * cfc * CFC_ANGULAR_FREQUENCY_SCALE_FACTOR;
    const wa = Math.sin(wd * T / 2) / Math.cos(wd * T / 2);
    const wa2 = wa * wa;
    const denom = 1 + Math.SQRT2 * wa + wa2;
    const a0 = wa2 / denom;
    const a1 = 2 * a0;
    const a2 = a0;
    const b1 = -2 * (wa2 - 1) / denom;
    const b2 = (-1 + Math.SQRT2 * wa - wa2) / denom;
    return { a0, a1, a2, b1, b2 };
  }
  function runRecursive(x, c) {
    const n = x.length;
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const xi = x[i];
      const xim1 = i >= 1 ? x[i - 1] : xi;
      const xim2 = i >= 2 ? x[i - 2] : xi;
      const yim1 = i >= 1 ? y[i - 1] : xi;
      const yim2 = i >= 2 ? y[i - 2] : xi;
      y[i] = c.a0 * xi + c.a1 * xim1 + c.a2 * xim2 + c.b1 * yim1 + c.b2 * yim2;
    }
    return y;
  }
  function reverseCopy(x) {
    const n = x.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = x[n - 1 - i];
    }
    return out;
  }

  
  var DEFAULT_SEGMENTATION_CONFIG = {
    onThresholdG: 1.5,
    offThresholdG: 1.2,
    minGapMs: 100,
    minEventDurationMs: 5
  };
  function segmentEvents(timeS, sampleRateHz, resultantG, options = {}) {
    var _a, _b, _c, _d;
    const onThreshold = (_a = options.onThresholdG) != null ? _a : DEFAULT_SEGMENTATION_CONFIG.onThresholdG;
    const offThreshold = (_b = options.offThresholdG) != null ? _b : DEFAULT_SEGMENTATION_CONFIG.offThresholdG;
    const minGapMs = (_c = options.minGapMs) != null ? _c : DEFAULT_SEGMENTATION_CONFIG.minGapMs;
    const minEventDurationMs = (_d = options.minEventDurationMs) != null ? _d : DEFAULT_SEGMENTATION_CONFIG.minEventDurationMs;
    if (offThreshold > onThreshold) {
      throw new Error(
        `segmentEvents: offThresholdG (${offThreshold}) must be <= onThresholdG (${onThreshold})`
      );
    }
    const n = resultantG.length;
    if (n !== timeS.length) {
      throw new Error(`segmentEvents: resultantG length (${n}) must match timeS length (${timeS.length})`);
    }
    if (!(sampleRateHz > 0)) {
      throw new Error(`segmentEvents: sampleRateHz must be > 0, got ${sampleRateHz}`);
    }
    const dtMs = 1e3 / sampleRateHz;
    const minGapSamples = Math.max(1, Math.round(minGapMs / dtMs));
    const minEventSamples = Math.max(1, Math.round(minEventDurationMs / dtMs));
    const rawEvents = [];
    let inEvent = false;
    let eventStart = 0;
    let quietStreak = 0;
    for (let i = 0; i < n; i++) {
      const level = resultantG[i];
      if (!inEvent) {
        if (level >= onThreshold) {
          inEvent = true;
          eventStart = i;
          quietStreak = 0;
        }
      } else if (level < offThreshold) {
        quietStreak++;
        if (quietStreak >= minGapSamples) {
          rawEvents.push({ start: eventStart, end: i - quietStreak });
          inEvent = false;
          quietStreak = 0;
        }
      } else {
        quietStreak = 0;
      }
    }
    if (inEvent) {
      rawEvents.push({ start: eventStart, end: n - 1 });
    }
    return rawEvents.filter((e) => e.end - e.start + 1 >= minEventSamples).map(
      (e) => ({
        startIndex: e.start,
        endIndex: e.end,
        startTimeS: timeS[e.start],
        endTimeS: timeS[e.end]
      })
    );
  }

  
  function assertValidTrace(trace) {
    const { t, ax, ay, az, sampleRateHz } = trace;
    if (!(sampleRateHz > 0)) {
      throw new Error(`CrashTrace: sampleRateHz must be > 0, got ${sampleRateHz}`);
    }
    const n = t.length;
    if (ax.length !== n || ay.length !== n || az.length !== n) {
      throw new Error(
        `CrashTrace: channel length mismatch (t=${n}, ax=${ax.length}, ay=${ay.length}, az=${az.length})`
      );
    }
    if (n === 0) {
      throw new Error("CrashTrace: trace is empty");
    }
    for (let i = 1; i < n; i++) {
      if (!(t[i] > t[i - 1])) {
        throw new Error(`CrashTrace: t must be strictly increasing (violated at index ${i})`);
      }
    }
  }
  function assertValidEvent(trace, event) {
    const n = trace.t.length;
    const { startIndex, endIndex } = event;
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
      throw new Error(`ImpactEvent: startIndex/endIndex must be integers, got ${startIndex}/${endIndex}`);
    }
    if (startIndex < 0 || endIndex >= n || startIndex > endIndex) {
      throw new Error(
        `ImpactEvent: index range [${startIndex}, ${endIndex}] is invalid for a trace of length ${n}`
      );
    }
  }

  
  function deltaVForEvent(trace, event) {
    assertValidTrace(trace);
    assertValidEvent(trace, event);
    const { t, ax, ay, az } = trace;
    let dvx = 0;
    let dvy = 0;
    let dvz = 0;
    for (let i = event.startIndex; i < event.endIndex; i++) {
      const dt = t[i + 1] - t[i];
      dvx += 0.5 * (ax[i] + ax[i + 1]) * STANDARD_GRAVITY_M_S2 * dt;
      dvy += 0.5 * (ay[i] + ay[i + 1]) * STANDARD_GRAVITY_M_S2 * dt;
      dvz += 0.5 * (az[i] + az[i + 1]) * STANDARD_GRAVITY_M_S2 * dt;
    }
    return {
      dvxMs: dvx,
      dvyMs: dvy,
      dvzMs: dvz,
      magnitudeMs: Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz)
    };
  }

  
  var IMPACT_SIDE_SECTOR_HALF_WIDTH_DEG = 22.5;
  function pdof(trace, event) {
    const { dvxMs, dvyMs } = deltaVForEvent(trace, event);
    if (dvxMs === 0 && dvyMs === 0) {
      return { pdofDeg: 0, impactSide: "front" };
    }
    const deltaVBearingDeg = clockBearingDeg(dvxMs, dvyMs);
    const pdofDeg = normalizeDeg(deltaVBearingDeg + 180);
    return { pdofDeg, impactSide: classifyImpactSide(pdofDeg) };
  }
  function clockBearingDeg(vx, vy) {
    const rad = Math.atan2(-vy, vx);
    return normalizeDeg(rad * 180 / Math.PI);
  }
  function normalizeDeg(deg) {
    return (deg % 360 + 360) % 360;
  }
  function classifyImpactSide(pdofDeg) {
    const d = normalizeDeg(pdofDeg);
    const hw = IMPACT_SIDE_SECTOR_HALF_WIDTH_DEG;
    if (d <= hw || d >= 360 - hw) return "front";
    if (Math.abs(d - 90) <= hw) return "right";
    if (Math.abs(d - 180) <= hw) return "rear";
    if (Math.abs(d - 270) <= hw) return "left";
    return "oblique";
  }

  
  var SUBSTEP_STABILITY_MARGIN = 0.1; 
  function derivative(state, k, c, anchor, constantForceN, massKg, aVehicleSI) {
    const zAccel = (-k * (state.z - anchor) - c * state.zdot + constantForceN) / massKg - aVehicleSI;
    return [state.zdot, zAccel];
  }
  function lerp(a, b, frac) {
    return a + (b - a) * frac;
  }
  function rk4Step(state, k, c, anchor, constantForceN, massKg, aV0, aV1, h) {
    const aVMid = lerp(aV0, aV1, 0.5);
    const [k1z, k1v] = derivative(state, k, c, anchor, constantForceN, massKg, aV0);
    const s2 = { z: state.z + h / 2 * k1z, zdot: state.zdot + h / 2 * k1v };
    const [k2z, k2v] = derivative(s2, k, c, anchor, constantForceN, massKg, aVMid);
    const s3 = { z: state.z + h / 2 * k2z, zdot: state.zdot + h / 2 * k2v };
    const [k3z, k3v] = derivative(s3, k, c, anchor, constantForceN, massKg, aVMid);
    const s4 = { z: state.z + h * k3z, zdot: state.zdot + h * k3v };
    const [k4z, k4v] = derivative(s4, k, c, anchor, constantForceN, massKg, aV1);
    return {
      z: state.z + h / 6 * (k1z + 2 * k2z + 2 * k3z + k4z),
      zdot: state.zdot + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
    };
  }
  function requiredSubsteps(dt, stiffnessNPerM, massKg) {
    if (stiffnessNPerM <= 0) return 1;
    const omegaN = Math.sqrt(stiffnessNPerM / massKg);
    if (omegaN === 0) return 1;
    return Math.max(1, Math.ceil(dt * omegaN / SUBSTEP_STABILITY_MARGIN));
  }
  function simulateLumpedMassAxis(aVehicleSI, timeS, massKg, params) {
    const n = aVehicleSI.length;
    if (timeS.length !== n) {
      throw new Error(`simulateLumpedMassAxis: aVehicleSI length (${n}) must match timeS length (${timeS.length})`);
    }
    if (!(massKg > 0)) {
      throw new Error(`simulateLumpedMassAxis: massKg must be > 0, got ${massKg}`);
    }
    const out = new Float64Array(n);
    if (n === 0) return out;
    const bottomOutStiffnessNPerM = massKg * params.bottomOutNaturalFrequencyRadS * params.bottomOutNaturalFrequencyRadS;
    const bottomOutDampingNsPerM = 2 * params.dampingRatio * massKg * params.bottomOutNaturalFrequencyRadS;
    let state = { z: 0, zdot: 0 };
    let phase = "slack";
    let dir = 1;
    let phase2Anchor = 0;
    let phase3Anchor = 0;
    out[0] = 0;
    const occupantAccel = (s, k, c, activeAnchor, constantForceN) => (-k * (s.z - activeAnchor) - c * s.zdot + constantForceN) / massKg;
    for (let i = 0; i < n - 1; i++) {
      if (phase === "slack" && Math.abs(state.z) >= params.slackDistanceM) {
        phase = "loadLimit";
        dir = Math.sign(state.z) || 1;
        phase2Anchor = dir * params.slackDistanceM;
      }
      if (phase === "loadLimit") {
        const traveledM = Math.abs(state.z - phase2Anchor);
        const arrested = state.zdot * dir <= 0;
        if (traveledM >= params.rideDownBudgetM || arrested) {
          phase = "bottomOut";
          phase3Anchor = state.z;
        }
      }
      let k = 0;
      let c = 0;
      let activeAnchor = 0;
      let constantForceN = 0;
      if (phase === "loadLimit") {
        constantForceN = -dir * params.loadLimiterForceN;
      } else if (phase === "bottomOut") {
        k = bottomOutStiffnessNPerM;
        c = bottomOutDampingNsPerM;
        activeAnchor = phase3Anchor;
      }
      const dt = timeS[i + 1] - timeS[i];
      const substeps = requiredSubsteps(dt, k, massKg);
      const h = dt / substeps;
      const aV0 = aVehicleSI[i];
      const aV1 = aVehicleSI[i + 1];
      if (k === 0) {
        for (let s = 0; s < substeps; s++) {
          const subStart = lerp(aV0, aV1, s / substeps);
          const subEnd = lerp(aV0, aV1, (s + 1) / substeps);
          state = rk4Step(state, k, c, activeAnchor, constantForceN, massKg, subStart, subEnd, h);
        }
        out[i + 1] = constantForceN / massKg;
        continue;
      }
      let substepIntegral = 0;
      let prevAccel = occupantAccel(state, k, c, activeAnchor, constantForceN);
      for (let s = 0; s < substeps; s++) {
        const subStart = lerp(aV0, aV1, s / substeps);
        const subEnd = lerp(aV0, aV1, (s + 1) / substeps);
        state = rk4Step(state, k, c, activeAnchor, constantForceN, massKg, subStart, subEnd, h);
        const curAccel = occupantAccel(state, k, c, activeAnchor, constantForceN);
        substepIntegral += 0.5 * (prevAccel + curAccel) * h;
        prevAccel = curAccel;
      }
      out[i + 1] = 2 * substepIntegral / dt - out[i];
    }
    return out;
  }

  
  function resolveRestraintConfig(occupant) {
    if (!occupant.belted) return "unbelted";
    return occupant.airbag ? "beltedAirbag" : "beltedOnly";
  }
  var REGION_MASS_FRACTION = {
    head: 0.084,
    
    chest: 0.35,
    
    femur: 0.1
    
  };
  var RESTRAINT_PARAMS = {
    head: {
      beltedAirbag: { slackDistanceM: 0.05, loadLimiterForceN: 2173.5, rideDownBudgetM: 0.0198, bottomOutNaturalFrequencyRadS: 120, dampingRatio: 1 },
      
      beltedOnly: { slackDistanceM: 0.071, loadLimiterForceN: 1369.7, rideDownBudgetM: 0.0528, bottomOutNaturalFrequencyRadS: 80, dampingRatio: 1 },
      
      unbelted: { slackDistanceM: 0.35, loadLimiterForceN: 4500, rideDownBudgetM: 0.12, bottomOutNaturalFrequencyRadS: 90, dampingRatio: 1.1 }
      
    },
    chest: {
      beltedAirbag: { slackDistanceM: 0.03, loadLimiterForceN: 5067.9, rideDownBudgetM: 0.0607, bottomOutNaturalFrequencyRadS: 80, dampingRatio: 1 },
      
      beltedOnly: { slackDistanceM: 0.05, loadLimiterForceN: 6384.1, rideDownBudgetM: 0.0528, bottomOutNaturalFrequencyRadS: 120, dampingRatio: 1 },
      
      unbelted: { slackDistanceM: 0.3, loadLimiterForceN: 5911.2, rideDownBudgetM: 0.24, bottomOutNaturalFrequencyRadS: 110, dampingRatio: 1.2 }
      
    },
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    femur: {
      beltedAirbag: { slackDistanceM: 0.1, loadLimiterForceN: 2012.5, rideDownBudgetM: 0.3734, bottomOutNaturalFrequencyRadS: 350, dampingRatio: 1 },
      
      beltedOnly: { slackDistanceM: 0.1, loadLimiterForceN: 2012.5, rideDownBudgetM: 0.3734, bottomOutNaturalFrequencyRadS: 350, dampingRatio: 1 },
      
      unbelted: { slackDistanceM: 0.35, loadLimiterForceN: 3e3, rideDownBudgetM: 0.11, bottomOutNaturalFrequencyRadS: 300, dampingRatio: 1.1 }
      
    }
    
  };
  function getRestraintParams(region, config) {
    return RESTRAINT_PARAMS[region][config];
  }
  function getEffectiveMassKg(region, occupant) {
    return occupant.massKg * REGION_MASS_FRACTION[region];
  }

  
  function computeOccupantResponse(trace, event, occupant, measured = {}) {
    assertValidTrace(trace);
    assertValidEvent(trace, event);
    const restraintConfig = resolveRestraintConfig(occupant);
    return {
      head: computeRegion("head", trace, event, occupant, restraintConfig, measured.head),
      chest: computeRegion("chest", trace, event, occupant, restraintConfig, measured.chest),
      femur: computeFemurRegion(trace, event, occupant, restraintConfig, measured.femur)
    };
  }
  function computeRegion(region, trace, event, occupant, restraintConfig, measurement) {
    if (measurement) {
      return sliceMeasurement(measurement, event);
    }
    return simulateRegion(region, trace, event, occupant, restraintConfig);
  }
  function sliceMeasurement(measurement, event) {
    const { startIndex, endIndex } = event;
    const len = endIndex - startIndex + 1;
    if (measurement.ax.length <= endIndex || measurement.ay.length <= endIndex || measurement.az.length <= endIndex) {
      throw new Error(
        `computeOccupantResponse: measured region data (length ${measurement.ax.length}) does not cover event index range [${startIndex}, ${endIndex}]`
      );
    }
    return {
      ax: measurement.ax.slice(startIndex, startIndex + len),
      ay: measurement.ay.slice(startIndex, startIndex + len),
      az: measurement.az.slice(startIndex, startIndex + len),
      measured: true
    };
  }
  function simulateRegion(region, trace, event, occupant, restraintConfig) {
    const { startIndex, endIndex } = event;
    const len = endIndex - startIndex + 1;
    const tEvent = trace.t.slice(startIndex, startIndex + len);
    const massKg = getEffectiveMassKg(region, occupant);
    const params = getRestraintParams(region, restraintConfig);
    const axSI = simulateLumpedMassAxis(gToSI(trace.ax, startIndex, len), tEvent, massKg, params);
    const aySI = simulateLumpedMassAxis(gToSI(trace.ay, startIndex, len), tEvent, massKg, params);
    const azSI = simulateLumpedMassAxis(gToSI(trace.az, startIndex, len), tEvent, massKg, params);
    return {
      ax: siToG(axSI),
      ay: siToG(aySI),
      az: siToG(azSI),
      measured: false
    };
  }
  function computeFemurRegion(trace, event, occupant, restraintConfig, measurement) {
    if (measurement) {
      return sliceForceMeasurement(measurement, event);
    }
    return simulateFemurForce(trace, event, occupant, restraintConfig);
  }
  function sliceForceMeasurement(measurement, event) {
    const { startIndex, endIndex } = event;
    const len = endIndex - startIndex + 1;
    if (measurement.ax.length <= endIndex || measurement.ay.length <= endIndex || measurement.az.length <= endIndex) {
      throw new Error(
        `computeOccupantResponse: measured femur force data (length ${measurement.ax.length}) does not cover event index range [${startIndex}, ${endIndex}]`
      );
    }
    return {
      ax: measurement.ax.slice(startIndex, startIndex + len),
      ay: measurement.ay.slice(startIndex, startIndex + len),
      az: measurement.az.slice(startIndex, startIndex + len),
      measured: true
    };
  }
  function simulateFemurForce(trace, event, occupant, restraintConfig) {
    const { startIndex, endIndex } = event;
    const len = endIndex - startIndex + 1;
    const tEvent = trace.t.slice(startIndex, startIndex + len);
    const massKg = getEffectiveMassKg("femur", occupant);
    const params = getRestraintParams("femur", restraintConfig);
    const axSI = simulateLumpedMassAxis(gToSI(trace.ax, startIndex, len), tEvent, massKg, params);
    const aySI = simulateLumpedMassAxis(gToSI(trace.ay, startIndex, len), tEvent, massKg, params);
    const azSI = simulateLumpedMassAxis(gToSI(trace.az, startIndex, len), tEvent, massKg, params);
    return {
      ax: accelSIToForceN(axSI, massKg),
      ay: accelSIToForceN(aySI, massKg),
      az: accelSIToForceN(azSI, massKg),
      measured: false
    };
  }
  function accelSIToForceN(accelSI, massKg) {
    const out = new Float64Array(accelSI.length);
    for (let i = 0; i < accelSI.length; i++) {
      out[i] = accelSI[i] * massKg;
    }
    return out;
  }
  function gToSI(channel, startIndex, len) {
    const out = new Float64Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = channel[startIndex + i] * STANDARD_GRAVITY_M_S2;
    }
    return out;
  }
  function siToG(channelSI) {
    const out = new Float64Array(channelSI.length);
    for (let i = 0; i < channelSI.length; i++) {
      out[i] = channelSI[i] / STANDARD_GRAVITY_M_S2;
    }
    return out;
  }

  
  var HIC15_WINDOW_S = 0.015;
  var CHEST_3MS_WINDOW_S = 3e-3;

  
  var EXPECTED_NOMINAL_SAMPLE_RATE_HZ = 2e3;
  function classifyCriterionDataQuality(cfc) {
    const expectedFloorCfc = Math.min(cfc.requestedCfc, EXPECTED_NOMINAL_SAMPLE_RATE_HZ / CFC_MIN_SAMPLE_RATE_MULTIPLE);
    const worseThanBaseline = cfc.appliedCfc < expectedFloorCfc;
    const note = worseThanBaseline ? `Sample rate (${cfc.sampleRateHz} Hz) is below this library's documented ~${EXPECTED_NOMINAL_SAMPLE_RATE_HZ}Hz expected input: applied CFC${cfc.appliedCfc.toFixed(1)} is worse than the ~CFC${expectedFloorCfc.toFixed(1)} floor that rate alone would already cause for a CFC${cfc.requestedCfc} request. This is unusual for this library's intended data source, not expected baseline degradation.` : cfc.degraded ? `Sample rate (${cfc.sampleRateHz} Hz) causes expected baseline degradation to CFC${cfc.appliedCfc.toFixed(1)} for a CFC${cfc.requestedCfc} request -- normal at this library's documented ~${EXPECTED_NOMINAL_SAMPLE_RATE_HZ}Hz expected input, not a warning-worthy condition on its own.` : `No degradation: sample rate (${cfc.sampleRateHz} Hz) meets the CFC${cfc.requestedCfc} minimum.`;
    return { cfc, baselineDegradation: cfc.degraded, worseThanBaseline, note };
  }

  
  function hicFromResultant(resultantG, t, windowS) {
    const n = resultantG.length;
    if (t.length !== n) {
      throw new Error(`hicFromResultant: length mismatch (resultantG=${n}, t=${t.length})`);
    }
    if (n < 2) {
      throw new Error(`hicFromResultant: need at least 2 samples, got ${n}`);
    }
    if (!(windowS > 0)) {
      throw new Error(`hicFromResultant: windowS must be > 0, got ${windowS}`);
    }
    for (let i = 1; i < n; i++) {
      if (!(t[i] > t[i - 1])) {
        throw new Error(`hicFromResultant: t must be strictly increasing (violated at index ${i})`);
      }
    }
    const cumInt = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const dt = t[i] - t[i - 1];
      cumInt[i] = cumInt[i - 1] + 0.5 * (resultantG[i - 1] + resultantG[i]) * dt;
    }
    let bestValue = -Infinity;
    let bestT1 = t[0];
    let bestT2 = t[1];
    for (let i = 0; i < n - 1; i++) {
      const ti = t[i];
      for (let j = i + 1; j < n; j++) {
        const dt = t[j] - ti;
        if (dt > windowS) break;
        const avg = (cumInt[j] - cumInt[i]) / dt;
        const value = dt * Math.pow(avg, 2.5);
        if (value > bestValue) {
          bestValue = value;
          bestT1 = ti;
          bestT2 = t[j];
        }
      }
    }
    if (bestValue === -Infinity) {
      throw new Error(
        `hicFromResultant: no sample pair fits within windowS=${windowS}s -- sample spacing exceeds the requested clip window (min spacing ${t[1] - t[0]}s at the first pair). Increase the sample rate or the window.`
      );
    }
    return { hic: bestValue, t1S: bestT1, t2S: bestT2 };
  }
  function computeHicWithWindow(head, t, sampleRateHz, windowS) {
    const res = resultant(head.ax, head.ay, head.az);
    const { signal: filtered, dataQuality } = cfcLowpass(res, sampleRateHz, CFC.CFC_1000);
    const { hic, t1S, t2S } = hicFromResultant(filtered, t, windowS);
    return { hicIndex: hic, t1S, t2S, windowS, dataQuality: classifyCriterionDataQuality(dataQuality) };
  }
  function computeHIC15(head, t, sampleRateHz) {
    return computeHicWithWindow(head, t, sampleRateHz, HIC15_WINDOW_S);
  }

  
  var CHEST_ACCELERATION_CFC = CFC.CFC_180;
  var DURATION_ACCUMULATION_EPSILON_S = 1e-9;
  function chest3msFromResultant(resultantG, t, windowS) {
    const n = resultantG.length;
    if (t.length !== n) {
      throw new Error(`chest3msFromResultant: length mismatch (resultantG=${n}, t=${t.length})`);
    }
    if (n < 2) {
      throw new Error(`chest3msFromResultant: need at least 2 samples, got ${n}`);
    }
    if (!(windowS > 0)) {
      throw new Error(`chest3msFromResultant: windowS must be > 0, got ${windowS}`);
    }
    for (let i = 1; i < n; i++) {
      if (!(t[i] > t[i - 1])) {
        throw new Error(`chest3msFromResultant: t must be strictly increasing (violated at index ${i})`);
      }
    }
    const totalDurationS = t[n - 1] - t[0];
    if (totalDurationS < windowS) {
      throw new Error(
        `chest3msFromResultant: trace duration (${totalDurationS}s) is shorter than windowS=${windowS}s -- cannot accumulate a cumulative ${windowS}s exceedance from a shorter trace.`
      );
    }
    const dt = new Float64Array(n);
    dt[0] = (t[1] - t[0]) / 2;
    dt[n - 1] = (t[n - 1] - t[n - 2]) / 2;
    for (let i = 1; i < n - 1; i++) {
      dt[i] = (t[i + 1] - t[i - 1]) / 2;
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => resultantG[b] - resultantG[a]);
    let accumulated = 0;
    for (const idx of order) {
      accumulated += dt[idx];
      if (accumulated >= windowS - DURATION_ACCUMULATION_EPSILON_S) {
        return { chest3msG: resultantG[idx] };
      }
    }
    throw new Error("chest3msFromResultant: internal error -- cumulative duration never reached windowS despite sufficient total trace duration.");
  }
  function computeChest3ms(chest, t, sampleRateHz) {
    const res = resultant(chest.ax, chest.ay, chest.az);
    const { signal: filtered, dataQuality } = cfcLowpass(res, sampleRateHz, CHEST_ACCELERATION_CFC);
    const { chest3msG } = chest3msFromResultant(filtered, t, CHEST_3MS_WINDOW_S);
    return { chest3msG, windowS: CHEST_3MS_WINDOW_S, dataQuality: classifyCriterionDataQuality(dataQuality) };
  }

  
  var FEMUR_FORCE_CFC = CFC.CFC_600;
  function femurForceFromResultant(resultantN, t) {
    const n = resultantN.length;
    if (t.length !== n) {
      throw new Error(`femurForceFromResultant: length mismatch (resultantN=${n}, t=${t.length})`);
    }
    if (n < 1) {
      throw new Error(`femurForceFromResultant: need at least 1 sample, got ${n}`);
    }
    let bestForce = resultantN[0];
    let bestT = t[0];
    for (let i = 1; i < n; i++) {
      if (resultantN[i] > bestForce) {
        bestForce = resultantN[i];
        bestT = t[i];
      }
    }
    return { forceN: bestForce, tS: bestT };
  }
  function computeFemurLoad(femur, t, sampleRateHz) {
    const res = resultant(femur.ax, femur.ay, femur.az);
    const { signal: filtered, dataQuality } = cfcLowpass(res, sampleRateHz, FEMUR_FORCE_CFC);
    const { forceN, tS } = femurForceFromResultant(filtered, t);
    return { femurForceIndexN: forceN, tPeakS: tS, dataQuality: classifyCriterionDataQuality(dataQuality) };
  }

  
  var ERF_A1 = 0.254829592;
  var ERF_A2 = -0.284496736;
  var ERF_A3 = 1.421413741;
  var ERF_A4 = -1.453152027;
  var ERF_A5 = 1.061405429;
  var ERF_P = 0.3275911;
  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + ERF_P * ax);
    const poly = ((((ERF_A5 * t + ERF_A4) * t + ERF_A3) * t + ERF_A2) * t + ERF_A1) * t;
    const y = 1 - poly * Math.exp(-ax * ax);
    return sign * y;
  }
  function standardNormalCDF(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  
  var HEAD_RISK_CUMULATIVE_NORMAL = {
    2: { mu: 6.96352, sigma: 0.84664 },
    
    3: { mu: 7.45231, sigma: 0.73998 },
    
    4: { mu: 7.65605, sigma: 0.6058 }
    
  };
  var CHEST_RISK_AIS4_ANCHOR_G = 60;
  var CHEST_RISK_AIS4_ANCHOR_PROBABILITY = 0.2;
  var CHEST_RISK_AIS4_LOGISTIC_SLOPE_PER_G = 0.05;
  var CHEST_RISK_SUB_AIS4_ANCHORS = {
    2: { anchorG: 35, anchorProbability: 0.1 },
    
    3: { anchorG: 50, anchorProbability: 0.15 }
    
  };
  var FEMUR_RISK_FRACTURE_ANCHOR_N = 8900;
  var FEMUR_RISK_FRACTURE_ANCHOR_PROBABILITY = 0.5;
  var FEMUR_RISK_LOGISTIC_SLOPE_PER_N = 8e-4;

  
  var CUMULATIVE_NORMAL_CAVEAT = "Coefficients are from a cited NHTSA source (Eppinger et al. 1999, Figure 2-3), but published secondary sources disagree on whether they were fit against HIC15 or the legacy HIC36 formulation -- not resolved against a firsthand read of the primary report. Separately, this pipeline's hicIndex input is a CFC1000-degraded, pipeline-internal value (see HicResult.hicIndex in src/criteria/hic.ts), not a standard-bandwidth HIC15/HIC36 measurement, and is systematically biased LOW relative to one -- so this probability is a floor on true risk, not a point estimate.";
  function headRiskCumulativeNormal(hicIndex, aisLevel) {
    if (!(hicIndex >= 0)) {
      throw new Error(`headRiskCumulativeNormal: hicIndex must be >= 0, got ${hicIndex}`);
    }
    const { mu, sigma } = HEAD_RISK_CUMULATIVE_NORMAL[aisLevel];
    const z = (Math.log(hicIndex) - mu) / sigma;
    const probability = standardNormalCDF(z);
    return {
      probability,
      aisLevel,
      region: "head",
      curve: "head-cumulative-normal-eppinger",
      verified: true,
      caveat: CUMULATIVE_NORMAL_CAVEAT
    };
  }

  
  var CHEST_RISK_AIS4_CAVEAT = `The 60g/20% anchor point is cited (NHTSA 2001, via IIHS "Guidelines for Rating Injury Measures", June 2009), but the logistic curve's slope is an UNVERIFIED engineering placeholder -- only the anchor is evidence-based, the shape of the curve around it is not. No acceleration-based, age-modulated chest risk curve exists in the available literature to derive a better slope from (published curves of that kind key off chest wall deflection, which this pipeline's occupant model does not produce).`;
  function chestRiskSubAis4Caveat(aisLevel) {
    return `UNVERIFIED: unlike the AIS>=4 curve, this AIS>=${aisLevel} curve has NO cited reference point at all -- both its anchor (chest3msG, probability) and its slope are engineering placeholders chosen only to sit below the cited 60g/20% AIS>=4 anchor and keep the three chest curves strictly ordered (see CHEST_RISK_SUB_AIS4_ANCHORS in constants.ts). Do not read this as evidence-based. This pipeline's chest3msG input is not CFC-degraded at ~2000Hz (see chest3ms.ts), so unlike head/femur there is no additional degradation-bias caveat stacked on top of this one -- the anchor/slope uncertainty is this curve's only caveat, but it is a larger one than AIS>=4's.`;
  }
  function anchoredLogistic(x, anchorX, anchorP, slopePerUnit) {
    const anchorOdds = anchorP / (1 - anchorP);
    const odds = anchorOdds * Math.exp(slopePerUnit * (x - anchorX));
    return odds / (1 + odds);
  }
  function chestRisk(chest3msG, aisLevel = 4) {
    if (!(chest3msG >= 0)) {
      throw new Error(`chestRisk: chest3msG must be >= 0, got ${chest3msG}`);
    }
    if (aisLevel === 4) {
      const probability2 = anchoredLogistic(chest3msG, CHEST_RISK_AIS4_ANCHOR_G, CHEST_RISK_AIS4_ANCHOR_PROBABILITY, CHEST_RISK_AIS4_LOGISTIC_SLOPE_PER_G);
      return {
        probability: probability2,
        aisLevel: 4,
        region: "chest",
        curve: "chest-anchored-logistic",
        verified: false,
        caveat: CHEST_RISK_AIS4_CAVEAT
      };
    }
    const { anchorG, anchorProbability } = CHEST_RISK_SUB_AIS4_ANCHORS[aisLevel];
    const probability = anchoredLogistic(chest3msG, anchorG, anchorProbability, CHEST_RISK_AIS4_LOGISTIC_SLOPE_PER_G);
    return {
      probability,
      aisLevel,
      region: "chest",
      curve: `chest-anchored-logistic-unverified-ais${aisLevel}`,
      verified: false,
      caveat: chestRiskSubAis4Caveat(aisLevel)
    };
  }

  
  var FEMUR_RISK_CAVEAT = `The 8900N/50% anchor is cited (SAE 770925, 1977, average static femur fracture force), but the logistic curve's slope is an UNVERIFIED engineering placeholder -- the anchor fixes only where the curve is centered, not how steeply it rises. The source describes fracture generically, not a specific AIS sub-level; this curve reports P(AIS>=2) as this library's own judgment-call mapping of "fracture" to an AIS threshold, not something SAE 770925 itself specifies -- a real femur shaft fracture can code AIS 2 or AIS 3 depending on severity/compounding. Separately, this pipeline's femurForceIndexN input is a CFC600-degraded, pipeline-internal value (see FemurLoadResult.femurForceIndexN in src/criteria/femurLoad.ts), not a standard-comparable force measurement, and is systematically biased LOW relative to one -- so this probability is a floor on true risk, not a point estimate.`;
  function anchoredLogistic2(x, anchorX, anchorP, slopePerUnit) {
    const anchorOdds = anchorP / (1 - anchorP);
    const odds = anchorOdds * Math.exp(slopePerUnit * (x - anchorX));
    return odds / (1 + odds);
  }
  function femurRisk(femurForceIndexN) {
    if (!(femurForceIndexN >= 0)) {
      throw new Error(`femurRisk: femurForceIndexN must be >= 0, got ${femurForceIndexN}`);
    }
    const probability = anchoredLogistic2(
      femurForceIndexN,
      FEMUR_RISK_FRACTURE_ANCHOR_N,
      FEMUR_RISK_FRACTURE_ANCHOR_PROBABILITY,
      FEMUR_RISK_LOGISTIC_SLOPE_PER_N
    );
    return {
      probability,
      aisLevel: 2,
      region: "femur",
      curve: "femur-anchored-logistic",
      verified: false,
      caveat: FEMUR_RISK_CAVEAT
    };
  }

  
  var INJURY_INCLUSION_PROBABILITY_THRESHOLD = 0.05;
  var AIS_LEVEL_SELECTION_PROBABILITY_THRESHOLD = 0.5;
  var FEMUR_AIS3_ESCALATION_PROBABILITY = 0.85;
  var FEMUR_AIS2_VARIANT_PROBABILITY_BREAKPOINT = 0.45;
  var FEMUR_AIS3_VARIANT_PROBABILITY_BREAKPOINT = 0.92;
  var HEAD_AIS5_ESCALATION_PROBABILITY = 0.85;
  var SKULL_FRACTURE_VARIANT_PROBABILITY_BREAKPOINTS = [0.4, 0.75];
  var ABDOMEN_DELTAV_BANDS_MS = [
    { aisLevel: 2, floorMs: 4, ceilingMs: 10 },
    { aisLevel: 3, floorMs: 8, ceilingMs: 16 },
    { aisLevel: 4, floorMs: 14, ceilingMs: 22 }
  ];
  var ABDOMEN_FRONTAL_DELTAV_BANDS_MS = [
    { aisLevel: 2, floorMs: 12, ceilingMs: 20 },
    { aisLevel: 3, floorMs: 18, ceilingMs: 28 },
    { aisLevel: 4, floorMs: 26, ceilingMs: 36 }
  ];
  var NECK_DELTAV_BANDS_MS = [
    { aisLevel: 2, floorMs: 11, ceilingMs: 21 },
    { aisLevel: 3, floorMs: 18, ceilingMs: 28 },
    { aisLevel: 4, floorMs: 26, ceilingMs: 36 }
  ];
  var AORTA_DELTAV_BANDS_MS = [
    { aisLevel: 4, floorMs: 14, ceilingMs: 22 },
    { aisLevel: 6, floorMs: 22, ceilingMs: 30 }
  ];
  var AORTA_DELTAV_BANDS_NON_FRONTAL_MS = [
    { aisLevel: 4, floorMs: 20, ceilingMs: 30 },
    { aisLevel: 6, floorMs: 30, ceilingMs: 40 }
  ];
  var KIDNEY_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 6, ceilingMs: 14 },
    { aisLevel: 3, floorMs: 12, ceilingMs: 20 },
    { aisLevel: 4, floorMs: 18, ceilingMs: 26 }
  ];
  var KIDNEY_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 16, ceilingMs: 24 },
    { aisLevel: 3, floorMs: 22, ceilingMs: 32 },
    { aisLevel: 4, floorMs: 30, ceilingMs: 40 }
  ];
  var BOWEL_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 14, ceilingMs: 22 },
    { aisLevel: 3, floorMs: 20, ceilingMs: 30 },
    { aisLevel: 4, floorMs: 28, ceilingMs: 38 }
  ];
  var PANCREAS_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 3, floorMs: 26, ceilingMs: 36 },
    { aisLevel: 4, floorMs: 34, ceilingMs: 44 }
  ];
  var DIAPHRAGM_RUPTURE_MIN_DELTAV_MS = 20;
  var PELVIS_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 8, ceilingMs: 16 },
    { aisLevel: 3, floorMs: 14, ceilingMs: 22 },
    { aisLevel: 4, floorMs: 20, ceilingMs: 30 }
  ];
  var PELVIS_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 20, ceilingMs: 30 },
    { aisLevel: 3, floorMs: 28, ceilingMs: 38 },
    { aisLevel: 4, floorMs: 36, ceilingMs: 46 }
  ];
  var FACIAL_FRACTURE_VARIANT_PROBABILITY_BREAKPOINT = 0.5;
  var DENTAL_INJURY_INCLUSION_PROBABILITY_THRESHOLD = 0.02;
  var SCALP_LACERATION_INCLUSION_PROBABILITY_THRESHOLD = 0.01;
  var ABDOMEN_ORGAN_AIS4_VARIANT_PROBABILITY_BREAKPOINT = 0.6;
  var CHEST_AIS2_VARIANT_PROBABILITY_BREAKPOINT = 0.4;
  var CLAVICLE_FRACTURE_MIN_CHEST_AIS = 2;
  var THORACIC_SPINE_DELTAV_BANDS_MS = [
    { aisLevel: 2, floorMs: 14, ceilingMs: 22 },
    { aisLevel: 3, floorMs: 20, ceilingMs: 30 },
    { aisLevel: 4, floorMs: 28, ceilingMs: 34 }
  ];
  var LUMBAR_SPINE_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 15, ceilingMs: 23 },
    { aisLevel: 3, floorMs: 21, ceilingMs: 31 },
    { aisLevel: 4, floorMs: 29, ceilingMs: 39 }
  ];
  var UPPER_ARM_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 14, ceilingMs: 24 },
    { aisLevel: 3, floorMs: 22, ceilingMs: 34 },
    { aisLevel: 4, floorMs: 50, ceilingMs: 62 }
  ];
  var FOREARM_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 11, ceilingMs: 20 },
    { aisLevel: 3, floorMs: 18, ceilingMs: 28 },
    { aisLevel: 4, floorMs: 46, ceilingMs: 58 }
  ];
  var WRIST_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 9, ceilingMs: 17 },
    { aisLevel: 3, floorMs: 15, ceilingMs: 24 },
    { aisLevel: 4, floorMs: 42, ceilingMs: 54 }
  ];
  var HAND_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 7, ceilingMs: 14 },
    { aisLevel: 3, floorMs: 12, ceilingMs: 20 },
    { aisLevel: 4, floorMs: 38, ceilingMs: 50 }
  ];
  var FRONTAL_ARM_OFFSET_MS = 6;
  function frontalArmBands(lateral) {
    return lateral.map((b) => ({ aisLevel: b.aisLevel, floorMs: b.floorMs + FRONTAL_ARM_OFFSET_MS, ceilingMs: b.ceilingMs + FRONTAL_ARM_OFFSET_MS }));
  }
  var UPPER_ARM_DELTAV_BANDS_FRONTAL_MS = frontalArmBands(UPPER_ARM_DELTAV_BANDS_LATERAL_MS);
  var FOREARM_DELTAV_BANDS_FRONTAL_MS = frontalArmBands(FOREARM_DELTAV_BANDS_LATERAL_MS);
  var WRIST_DELTAV_BANDS_FRONTAL_MS = frontalArmBands(WRIST_DELTAV_BANDS_LATERAL_MS);
  var HAND_DELTAV_BANDS_FRONTAL_MS = frontalArmBands(HAND_DELTAV_BANDS_LATERAL_MS);
  var LOWER_LEG_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 19, ceilingMs: 29 },
    { aisLevel: 3, floorMs: 27, ceilingMs: 39 },
    { aisLevel: 4, floorMs: 46, ceilingMs: 58 }
  ];
  var ANKLE_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 15, ceilingMs: 23 },
    { aisLevel: 3, floorMs: 22, ceilingMs: 32 },
    { aisLevel: 4, floorMs: 42, ceilingMs: 54 }
  ];
  var FOOT_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 13, ceilingMs: 20 },
    { aisLevel: 3, floorMs: 19, ceilingMs: 28 },
    { aisLevel: 4, floorMs: 38, ceilingMs: 50 }
  ];

  
  function expectedAisSeverity(levels) {
    if (levels.length === 0) return 1;
    const byLevel = new Map(levels.map((l) => [l.aisLevel, l.probability]));
    const maxLevel = Math.max(...levels.map((l) => l.aisLevel));
    let sum = 0;
    let carry = 0;
    for (let level = maxLevel; level >= 2; level--) {
      const known = byLevel.get(level);
      if (known !== void 0) carry = known;
      sum += carry;
    }
    return 1 + sum;
  }
  function selectAisLevel(levels) {
    if (levels.length === 0) {
      throw new Error("selectAisLevel: levels must be non-empty");
    }
    const sorted = [...levels].sort((a, b) => a.aisLevel - b.aisLevel);
    let selected = sorted[0];
    for (const level of sorted) {
      if (level.probability >= AIS_LEVEL_SELECTION_PROBABILITY_THRESHOLD) {
        selected = level;
      }
    }
    return { ...selected, continuousSeverity: expectedAisSeverity(levels) };
  }
  function rampProbability(x, floor, ceiling) {
    if (ceiling <= floor) {
      throw new Error(`rampProbability: ceiling (${ceiling}) must be > floor (${floor})`);
    }
    if (x <= floor) return 0;
    if (x >= ceiling) return 1;
    return (x - floor) / (ceiling - floor);
  }
  function selectAisLevelFromDeltaVBands(deltaVMs, bands) {
    const levels = bands.map((b) => ({ aisLevel: b.aisLevel, probability: rampProbability(deltaVMs, b.floorMs, b.ceilingMs) }));
    return selectAisLevel(levels);
  }
  function selectDeterministicVariant(value, breakpoints, variants) {
    if (variants.length === 0) {
      throw new Error("selectDeterministicVariant: variants must be non-empty");
    }
    if (breakpoints.length !== variants.length - 1) {
      throw new Error(
        `selectDeterministicVariant: breakpoints.length (${breakpoints.length}) must be variants.length-1 (${variants.length - 1})`
      );
    }
    let index = 0;
    for (const breakpoint of breakpoints) {
      if (value >= breakpoint) index++;
      else break;
    }
    return variants[index];
  }

  
  var SKULL_FRACTURE_VARIANTS = [
    { name: "Skull fracture (hairline)", clinical: "Hairline, non-displaced fracture of the skull, jaw region (AIS 2).", plain: "You have a hairline crack across your jaw." },
    { name: "Skull fracture (frontal)", clinical: "Closed, simple fracture of the skull, frontal bone (AIS 2).", plain: "You have a fracture across your forehead." },
    { name: "Skull fracture (zygomatic)", clinical: "Closed, simple fracture of the skull, zygomatic (cheekbone) region (AIS 2).", plain: "Your cheekbone is shattered." }
  ];
  var BRAIN_DESCRIPTIONS = {
    2: {
      name: "Concussion",
      clinical: "Mild traumatic brain injury (concussion) with transient loss of consciousness or disorientation (AIS 2).",
      plain: "You are concussed."
    },
    3: {
      name: "Cerebral contusion",
      clinical: "Cerebral contusion -- bruising of brain tissue on the brain surface (AIS 3).",
      plain: "Your brain is bruised."
    },
    4: {
      name: "Subdural haematoma",
      clinical: "Subdural haematoma -- bleeding between the brain and its outer covering, compressing brain tissue (AIS 4).",
      plain: "You are bleeding inside your skull, and it is pressing on your brain."
    },
    5: {
      name: "Diffuse axonal injury",
      clinical: "Diffuse axonal injury -- widespread shearing of nerve fibres from severe rotational/deceleration loading (AIS 5).",
      plain: "Your brain suffered the most severe kind of injury there is -- widespread damage to the nerve fibres throughout it."
    }
  };
  function skullFractureInjury(eventIndex, risks) {
    const source = risks.find((r) => r.region === "head" && r.aisLevel === 2);
    if (!source || source.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = selectDeterministicVariant(source.probability, SKULL_FRACTURE_VARIANT_PROBABILITY_BREAKPOINTS, SKULL_FRACTURE_VARIANTS);
    return {
      eventIndex,
      region: "head",
      aisSeverity: 2,
      
      
      
      
      continuousSeverity: 1 + source.probability,
      probability: source.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: "skull-fracture",
      lowerFidelity: false,
      caveat: source.caveat,
      sourceCurve: source.curve
    };
  }
  function brainInjury(eventIndex, risks) {
    var _a, _b, _c, _d;
    const headRisks = risks.filter((r) => r.region === "head");
    if (headRisks.length === 0) return null;
    const selected = selectAisLevel(headRisks.map((r) => ({ aisLevel: r.aisLevel, probability: r.probability })));
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const source = (_a = headRisks.find((r) => r.aisLevel === selected.aisLevel)) != null ? _a : headRisks[0];
    const escalated = selected.aisLevel === 4 && selected.probability >= HEAD_AIS5_ESCALATION_PROBABILITY;
    const aisLevel = escalated ? 5 : selected.aisLevel;
    const desc = (_b = BRAIN_DESCRIPTIONS[aisLevel]) != null ? _b : BRAIN_DESCRIPTIONS[2];
    const p4 = (_d = (_c = headRisks.find((r) => r.aisLevel === 4)) == null ? void 0 : _c.probability) != null ? _d : 0;
    const escalationFraction = Math.max(0, Math.min(1, (p4 - HEAD_AIS5_ESCALATION_PROBABILITY) / (1 - HEAD_AIS5_ESCALATION_PROBABILITY)));
    const continuousSeverity = selected.continuousSeverity + escalationFraction;
    return {
      eventIndex,
      region: "head",
      aisSeverity: aisLevel,
      continuousSeverity,
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: "traumatic-brain-injury",
      lowerFidelity: false,
      caveat: escalated ? `${source.caveat} ADDITIONALLY: the AIS5 (diffuse axonal injury) escalation above is this module's own heuristic reading of the AIS>=4 curve's probability against HEAD_AIS5_ESCALATION_PROBABILITY, not a separately cited AIS>=5 curve -- no such curve exists anywhere in this pipeline (Eppinger only fits AIS>=2/3/4). See that constant's doc comment for the full reasoning.` : source.caveat,
      sourceCurve: source.curve
    };
  }

  
  var CHEST_AIS2_VARIANTS = [
    { name: "Single rib fracture", clinical: "Fracture of a single rib, without flail segment (AIS 2).", plain: "You broke a rib." },
    { name: "Sternal fracture", clinical: "Fracture of the sternum, without flail segment (AIS 2).", plain: "Your breastbone is fractured." }
  ];
  var CHEST_DESCRIPTIONS_3_4 = {
    3: {
      name: "Multiple rib fractures",
      clinical: "Multiple rib fractures, without flail segment (AIS 3).",
      plain: "You broke several ribs."
    },
    4: {
      name: "Flail chest with pulmonary contusion",
      clinical: "Flail chest with pulmonary contusion (AIS 4).",
      plain: "Your ribs broke and your lung was bruised -- breathing is going to be hard."
    }
  };
  function chestInjury(eventIndex, risks) {
    var _a;
    const chestRisks = risks.filter((r) => r.region === "chest");
    if (chestRisks.length === 0) return null;
    const selected = selectAisLevel(chestRisks.map((r) => ({ aisLevel: r.aisLevel, probability: r.probability })));
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const source = (_a = chestRisks.find((r) => r.aisLevel === selected.aisLevel)) != null ? _a : chestRisks[0];
    const aisLevel = selected.aisLevel;
    const desc = aisLevel === 2 ? selectDeterministicVariant(selected.probability, [CHEST_AIS2_VARIANT_PROBABILITY_BREAKPOINT], CHEST_AIS2_VARIANTS) : CHEST_DESCRIPTIONS_3_4[aisLevel];
    const lowerFidelity = aisLevel !== 4;
    return {
      eventIndex,
      region: "chest",
      aisSeverity: aisLevel,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: "blunt-chest-loading",
      lowerFidelity,
      caveat: lowerFidelity ? `${source.caveat} ADDITIONALLY: this AIS${aisLevel} finding is at a chest severity level with NO cited reference point at all (unlike AIS>=4's real 60g/20% anchor) -- see CHEST_RISK_SUB_AIS4_ANCHORS in src/risk/constants.ts. Treat as directional/plausibility-level only.` : source.caveat,
      sourceCurve: source.curve
    };
  }

  
  var FEMUR_AIS2_VARIANTS = [
    { name: "Femoral shaft fracture (hairline)", clinical: "Hairline, non-displaced fracture of the femoral shaft (AIS 2).", plain: "Your femur has a hairline crack." },
    { name: "Femoral shaft fracture (simple)", clinical: "Closed, simple femoral shaft fracture (AIS 2).", plain: "Your femur is broken -- a clean break." }
  ];
  var FEMUR_AIS3_VARIANTS = [
    { name: "Femoral shaft fracture (displaced/comminuted)", clinical: "Displaced or comminuted femoral shaft fracture (AIS 3).", plain: "Your femur is badly broken -- shattered, not just cracked." },
    { name: "Femoral shaft fracture (open/compound)", clinical: "Open (compound) fracture of the femoral shaft -- bone visible through the skin (AIS 3).", plain: "Your femur is shattered, and the broken bone has come through the skin." }
  ];
  function femurInjury(eventIndex, risks) {
    const femurRisks = risks.filter((r) => r.region === "femur");
    if (femurRisks.length === 0) return null;
    const source = femurRisks.reduce((best, r) => r.probability > best.probability ? r : best);
    if (source.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const aisLevel = source.probability >= FEMUR_AIS3_ESCALATION_PROBABILITY ? 3 : 2;
    const escalationFraction = Math.max(0, Math.min(1, (source.probability - FEMUR_AIS3_ESCALATION_PROBABILITY) / (1 - FEMUR_AIS3_ESCALATION_PROBABILITY)));
    const continuousSeverity = 1 + source.probability + escalationFraction;
    const desc = aisLevel === 2 ? selectDeterministicVariant(source.probability, [FEMUR_AIS2_VARIANT_PROBABILITY_BREAKPOINT], FEMUR_AIS2_VARIANTS) : selectDeterministicVariant(source.probability, [FEMUR_AIS3_VARIANT_PROBABILITY_BREAKPOINT], FEMUR_AIS3_VARIANTS);
    return {
      eventIndex,
      region: "femur",
      aisSeverity: aisLevel,
      continuousSeverity,
      probability: source.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: "axial-femur-loading",
      lowerFidelity: false,
      caveat: source.caveat,
      sourceCurve: source.curve
    };
  }

  
  function lateralDescriptions(organ, probability) {
    const cap = organ === "spleen" ? "Splenic" : "Hepatic";
    const ais4Variants = [
      { name: `${cap} major laceration`, clinical: `Major laceration of the ${organ} with significant hemorrhage (AIS 4).`, plain: `Your ${organ} tore badly -- this is severe internal bleeding.` },
      { name: `${cap} rupture`, clinical: `Rupture of the ${organ} with significant hemorrhage (AIS 4).`, plain: `Your ${organ} ruptured -- this is severe internal bleeding.` }
    ];
    return {
      2: { name: `${cap} contusion`, clinical: `Contusion of the ${organ} (AIS 2).`, plain: `Your ${organ} was bruised.` },
      3: { name: `${cap} laceration`, clinical: `Laceration of the ${organ}, no major hemorrhage (AIS 3).`, plain: `Your ${organ} tore -- you are bleeding internally.` },
      4: selectDeterministicVariant(probability, [ABDOMEN_ORGAN_AIS4_VARIANT_PROBABILITY_BREAKPOINT], ais4Variants)
    };
  }
  function frontalDescriptions(probability) {
    const ais4Variants = [
      { name: "Major abdominal organ laceration", clinical: "Major laceration of an abdominal organ, unspecified, with significant hemorrhage (AIS 4).", plain: "Something in your abdomen has torn badly -- this is severe internal bleeding." },
      { name: "Abdominal organ rupture", clinical: "Rupture of an abdominal organ, unspecified, with significant hemorrhage (AIS 4).", plain: "Something in your abdomen has ruptured -- this is severe internal bleeding." }
    ];
    return {
      2: { name: "Abdominal organ contusion", clinical: "Contusion of an abdominal organ, unspecified (AIS 2).", plain: "Your abdomen took a hard hit -- something in there is bruised." },
      3: { name: "Abdominal organ laceration", clinical: "Laceration of an abdominal organ, unspecified, no major hemorrhage (AIS 3).", plain: "Something in your abdomen has torn -- you are bleeding internally." },
      4: selectDeterministicVariant(probability, [ABDOMEN_ORGAN_AIS4_VARIANT_PROBABILITY_BREAKPOINT], ais4Variants)
    };
  }
  function abdomenInjury(eventIndex, impactSide, deltaV) {
    if (impactSide === "left" || impactSide === "right") {
      const organ = impactSide === "left" ? "spleen" : "liver";
      const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, ABDOMEN_DELTAV_BANDS_MS);
      if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
      const desc = lateralDescriptions(organ, selected.probability)[selected.aisLevel];
      return {
        eventIndex,
        region: "abdomen",
        aisSeverity: selected.aisLevel,
        continuousSeverity: selected.continuousSeverity,
        
        probability: selected.probability,
        name: desc.name,
        clinicalDescription: desc.clinical,
        plainDescription: desc.plain,
        mechanism: `lateral-compression-${organ}`,
        lowerFidelity: true,
        caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the abdomen in this pipeline (the viscous criterion, which real abdominal injury risk curves are keyed to, is not modelled). This finding is derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) and impactSide ('${impactSide}') against an UNVERIFIED engineering-heuristic severity banding (see ABDOMEN_DELTAV_BANDS_MS in constants.ts), not a criterion value run through a published risk curve. Treat as directional/plausibility-level only, not a validated probability.`
      };
    }
    if (impactSide === "front") {
      const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, ABDOMEN_FRONTAL_DELTAV_BANDS_MS);
      if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
      const desc = frontalDescriptions(selected.probability)[selected.aisLevel];
      return {
        eventIndex,
        region: "abdomen",
        aisSeverity: selected.aisLevel,
        continuousSeverity: selected.continuousSeverity,
        
        probability: selected.probability,
        name: desc.name,
        clinicalDescription: desc.clinical,
        plainDescription: desc.plain,
        mechanism: "frontal-restraint-compression-abdomen",
        lowerFidelity: true,
        caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the abdomen in this pipeline (the viscous criterion, which real abdominal injury risk curves are keyed to, is not modelled). This finding is derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) on a FRONTAL impact against an UNVERIFIED engineering-heuristic severity banding (see ABDOMEN_FRONTAL_DELTAV_BANDS_MS in constants.ts), not a criterion value run through a published risk curve. Unlike a lateral impact, a frontal impact gives no directional signal to identify WHICH organ (spleen vs. liver) was involved, so this finding deliberately does not name one. Treat as directional/plausibility-level only, not a validated probability.`
      };
    }
    return null;
  }

  
  var NECK_DESCRIPTIONS = {
    2: {
      name: "Cervical sprain/strain",
      clinical: "Cervical spine sprain/strain with structural involvement (AIS 2).",
      plain: "Your neck was badly wrenched."
    },
    3: {
      name: "Cervical vertebral fracture",
      clinical: "Cervical vertebral fracture without cord compromise (AIS 3).",
      plain: "A bone in your neck is fractured."
    },
    4: {
      name: "Cervical fracture with cord involvement",
      clinical: "Cervical vertebral fracture with probable spinal cord involvement (AIS 4).",
      plain: "Your neck is broken, and your spinal cord may be damaged."
    }
  };
  function neckInjury(eventIndex, impactSide, deltaV) {
    var _a;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, NECK_DELTAV_BANDS_MS);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = (_a = NECK_DESCRIPTIONS[selected.aisLevel]) != null ? _a : NECK_DESCRIPTIONS[2];
    return {
      eventIndex,
      region: "neck",
      aisSeverity: selected.aisLevel,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: "cervical-spine-deceleration",
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the neck in this pipeline (Nij, which real cervical injury risk curves are keyed to, is not modelled). This finding is derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) against an UNVERIFIED engineering-heuristic severity banding (see NECK_DELTAV_BANDS_MS in constants.ts) -- impactSide ('${impactSide}') is recorded but does not currently affect the banding (see neckInjury.ts's doc comment). Treat as directional/plausibility-level only, not a validated probability.`
    };
  }

  
  var AORTA_DESCRIPTIONS = {
    4: {
      name: "Partial aortic tear",
      clinical: "Partial-thickness (intimal) tear of the thoracic aorta -- survivable with immediate surgical repair (AIS 4).",
      plain: "The wall of your aorta tore partway through -- without surgery immediately, you will bleed out."
    },
    6: {
      name: "Aortic transection",
      clinical: "Complete transection of the thoracic aorta -- immediately or rapidly fatal (AIS 6).",
      plain: "You would not have survived this -- the aorta tore on impact."
    }
  };
  function aortaInjury(eventIndex, impactSide, deltaV) {
    var _a;
    const isFrontal = impactSide === "front";
    const bands = isFrontal ? AORTA_DELTAV_BANDS_MS : AORTA_DELTAV_BANDS_NON_FRONTAL_MS;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, bands);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = (_a = AORTA_DESCRIPTIONS[selected.aisLevel]) != null ? _a : AORTA_DESCRIPTIONS[4];
    return {
      eventIndex,
      region: "aorta",
      aisSeverity: selected.aisLevel,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: "deceleration-aortic",
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the thoracic aorta in this pipeline. This finding is derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) on a${isFrontal ? " frontal" : `n ${impactSide}`} impact against an UNVERIFIED engineering-heuristic severity banding (see AORTA_DELTAV_BANDS_MS${isFrontal ? "" : "_NON_FRONTAL"} in constants.ts), not a criterion value run through a published risk curve. Treat as directional/plausibility-level only, not a validated probability.` + (isFrontal ? "" : " Non-frontal aortic injury uses a deliberately HIGHER deltaV threshold than frontal -- frontal deceleration is the classic, most-studied mechanism for this injury; the ordering (frontal most sensitive) has real anatomic grounding, the exact non-frontal threshold values do not.")
    };
  }

  
  var HAEMORRHAGE_DESCRIPTIONS = {
    massive: {
      name: "Massive haemorrhage",
      clinical: "Massive haemorrhage secondary to major vascular injury.",
      plain: "You are bleeding catastrophically."
    },
    internal: {
      name: "Internal haemorrhage",
      clinical: "Internal haemorrhage secondary to abdominal organ injury.",
      plain: "You are bleeding internally."
    },
    significant: {
      name: "Significant blood loss",
      clinical: "Significant blood loss secondary to long-bone fracture.",
      plain: "You are losing a significant amount of blood from your leg."
    }
  };
  function buildHaemorrhage(eventIndex, kind, source) {
    const desc = HAEMORRHAGE_DESCRIPTIONS[kind];
    return {
      eventIndex,
      region: "circulatory",
      aisSeverity: source.aisSeverity,
      continuousSeverity: source.continuousSeverity,
      
      probability: source.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: `haemorrhage-from-${source.region}`,
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: derived by clinical inference from the ${source.region} injury above ("${source.name}"), not from a dedicated haemorrhage criterion or risk curve -- this pipeline has neither. Severity and probability are inherited directly from the source injury, not independently assessed. Treat as a directional flag that bleeding is clinically expected, not a quantified blood-loss estimate.`
    };
  }
  function haemorrhageInjuries(eventIndex, injuries) {
    const results = [];
    for (const injury of injuries) {
      if (injury.eventIndex !== eventIndex) continue;
      if (injury.region === "aorta") {
        results.push(buildHaemorrhage(eventIndex, "massive", injury));
      } else if (injury.region === "pelvis" && injury.aisSeverity >= 4) {
        results.push(buildHaemorrhage(eventIndex, "massive", injury));
      } else if (injury.region === "abdomen" && injury.aisSeverity >= 3) {
        results.push(buildHaemorrhage(eventIndex, "internal", injury));
      } else if (injury.region === "femur" && injury.aisSeverity === 3) {
        results.push(buildHaemorrhage(eventIndex, "significant", injury));
      }
    }
    return results;
  }

  
  var LUNG_CAVEAT = "LOWER FIDELITY: no dedicated criterion exists for the lung in this pipeline. Derived entirely from this event's OWN already-computed chest injury severity (a real, criterion-backed finding) -- not an independent measurement of the lung itself. Pulmonary contusion/pneumothorax are real, common complications of the rib fractures chest injury already reports, but their presence here is inferred, not separately confirmed. Treat as directional/plausibility-level only.";
  function lungInjury(eventIndex, eventInjuries) {
    const chest = eventInjuries.find((i) => i.region === "chest");
    if (!chest || chest.aisSeverity < 3) return null;
    const isFlail = chest.aisSeverity >= 4;
    const name = isFlail ? "Pneumothorax" : "Pulmonary contusion";
    const clinical = isFlail ? "Pneumothorax -- collapsed lung secondary to rib fracture puncturing the pleura (AIS 4)." : "Pulmonary contusion -- bruised lung tissue from blunt chest trauma (AIS 3).";
    const plain = isFlail ? "One of your lungs has collapsed -- a broken rib punctured it." : "Your lung is bruised from the impact.";
    return {
      eventIndex,
      region: "lung",
      aisSeverity: isFlail ? 4 : 3,
      continuousSeverity: chest.continuousSeverity,
      
      probability: chest.probability,
      name,
      clinicalDescription: clinical,
      plainDescription: plain,
      mechanism: "secondary-to-rib-fracture",
      lowerFidelity: true,
      caveat: LUNG_CAVEAT
    };
  }
  function kidneyDescriptions(sideLabel, probability) {
    const noun = sideLabel ? `${sideLabel} kidney` : "kidney";
    const ais4Variants = [
      { name: "Major renal laceration", clinical: `Major laceration of the ${noun} with significant hemorrhage (AIS 4).`, plain: `Your ${noun} tore badly -- this is severe internal bleeding.` },
      { name: "Renal rupture", clinical: `Rupture of the ${noun} with significant hemorrhage (AIS 4).`, plain: `Your ${noun} ruptured -- this is severe internal bleeding.` }
    ];
    return {
      2: { name: "Renal contusion", clinical: `Contusion of the ${noun} (AIS 2).`, plain: `Your ${noun} was bruised.` },
      3: { name: "Renal laceration", clinical: `Laceration of the ${noun}, no major hemorrhage (AIS 3).`, plain: `Your ${noun} tore -- you are bleeding internally.` },
      4: selectDeterministicVariant(probability, [ABDOMEN_ORGAN_AIS4_VARIANT_PROBABILITY_BREAKPOINT], ais4Variants)
    };
  }
  function kidneyInjury(eventIndex, impactSide, deltaV) {
    const sideLabel = impactSide === "left" ? "left" : impactSide === "right" ? "right" : null;
    if (impactSide !== "left" && impactSide !== "right" && impactSide !== "front") return null;
    const bands = impactSide === "front" ? KIDNEY_DELTAV_BANDS_FRONTAL_MS : KIDNEY_DELTAV_BANDS_LATERAL_MS;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, bands);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = kidneyDescriptions(sideLabel, selected.probability)[selected.aisLevel];
    return {
      eventIndex,
      region: "kidney",
      aisSeverity: selected.aisLevel,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: impactSide === "front" ? "frontal-restraint-compression-kidney" : `lateral-compression-kidney`,
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the kidney in this pipeline. Derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) and impactSide ('${impactSide}') against an UNVERIFIED engineering-heuristic severity banding (see KIDNEY_DELTAV_BANDS_LATERAL_MS/KIDNEY_DELTAV_BANDS_FRONTAL_MS in constants.ts), not a criterion value run through a published risk curve. Treat as directional/plausibility-level only.`
    };
  }
  var BOWEL_DESCRIPTIONS = {
    2: { name: "Bowel contusion", clinical: "Contusion of the bowel wall, seatbelt-syndrome mechanism (AIS 2).", plain: "Your gut took a hard hit from the belt -- it is bruised." },
    3: { name: "Bowel perforation", clinical: "Perforation of the bowel wall, seatbelt-syndrome mechanism (AIS 3).", plain: "Your bowel has been torn open -- this needs surgery." },
    4: { name: "Major bowel injury with mesenteric tear", clinical: "Bowel perforation with mesenteric vascular injury (AIS 4).", plain: "Your bowel is badly torn, and the blood supply to it is damaged too." }
  };
  function bowelInjury(eventIndex, impactSide, deltaV) {
    if (impactSide !== "front") return null;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, BOWEL_DELTAV_BANDS_FRONTAL_MS);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = BOWEL_DESCRIPTIONS[selected.aisLevel];
    return {
      eventIndex,
      region: "bowel",
      aisSeverity: selected.aisLevel,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: "seatbelt-syndrome-bowel",
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the bowel in this pipeline. Derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) on a frontal impact ("seatbelt syndrome" -- lap-belt compression against the spine) against an UNVERIFIED engineering-heuristic severity banding (see BOWEL_DELTAV_BANDS_FRONTAL_MS in constants.ts), not a criterion value run through a published risk curve. Treat as directional/plausibility-level only.`
    };
  }
  var PANCREAS_DESCRIPTIONS = {
    3: { name: "Pancreatic contusion", clinical: "Contusion/minor laceration of the pancreas, direct epigastric compression mechanism (AIS 3).", plain: "You took a direct hit to the upper abdomen -- your pancreas is bruised." },
    4: { name: "Major pancreatic laceration", clinical: "Major laceration of the pancreas with ductal involvement (AIS 4).", plain: "Your pancreas is badly torn -- this is a serious injury." }
  };
  function pancreasInjury(eventIndex, impactSide, deltaV) {
    var _a;
    if (impactSide !== "front") return null;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, PANCREAS_DELTAV_BANDS_FRONTAL_MS);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = (_a = PANCREAS_DESCRIPTIONS[selected.aisLevel]) != null ? _a : PANCREAS_DESCRIPTIONS[3];
    return {
      eventIndex,
      region: "pancreas",
      aisSeverity: selected.aisLevel,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: "frontal-epigastric-compression-pancreas",
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the pancreas in this pipeline. Derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) on a frontal impact (direct epigastric/steering-column compression) against an UNVERIFIED engineering-heuristic severity banding (see PANCREAS_DELTAV_BANDS_FRONTAL_MS in constants.ts), not a criterion value run through a published risk curve. Pancreatic injury from blunt trauma is rare and requires unusually direct, severe compression -- treat as directional/plausibility-level only.`
    };
  }
  function diaphragmInjury(eventIndex, eventInjuries, deltaV) {
    const abdomen = eventInjuries.find((i) => i.region === "abdomen" && i.aisSeverity >= 3);
    if (!abdomen) return null;
    if (deltaV.magnitudeMs < DIAPHRAGM_RUPTURE_MIN_DELTAV_MS) return null;
    return {
      eventIndex,
      region: "diaphragm",
      aisSeverity: 3,
      continuousSeverity: abdomen.continuousSeverity,
      
      probability: abdomen.probability,
      name: "Diaphragm rupture",
      clinicalDescription: "Traumatic rupture of the diaphragm from a sudden rise in intra-abdominal pressure (AIS 3).",
      plainDescription: "The impact was hard enough to tear your diaphragm.",
      mechanism: "blowout-diaphragm",
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the diaphragm in this pipeline, and this is not even an independent deltaV-band estimate like this event's other organ findings -- it is derived PURELY from co-occurring with an already-computed abdomen injury at AIS>=3 in this same event (a sudden intra-abdominal pressure spike severe enough to injure the abdomen that directly, at deltaV ${deltaV.magnitudeMs.toFixed(1)} m/s, is the same mechanism that could rupture the diaphragm) plus a minimum deltaV floor. Treat as directional/plausibility-level only, weaker grounding than this pipeline's independent deltaV-band organ findings.`
    };
  }

  
  var PELVIS_DESCRIPTIONS = {
    2: {
      name: "Stable pelvic fracture",
      clinical: "Stable fracture of the pelvic ring, single break, minimal displacement (AIS 2).",
      plain: "Your pelvis is fractured."
    },
    3: {
      name: "Unstable pelvic ring fracture",
      clinical: "Unstable pelvic ring fracture, multiple breaks with displacement (AIS 3).",
      plain: "Your pelvis is badly broken -- the whole ring is unstable."
    },
    4: {
      name: "Open-book pelvic fracture with major haemorrhage",
      clinical: "Open-book pelvic fracture with major pelvic vascular injury (AIS 4).",
      plain: "Your pelvis has been torn open, and you are bleeding severely from it."
    }
  };
  function pelvisInjury(eventIndex, impactSide, deltaV) {
    var _a;
    if (impactSide !== "left" && impactSide !== "right" && impactSide !== "front") return null;
    const isLateral = impactSide === "left" || impactSide === "right";
    const bands = isLateral ? PELVIS_DELTAV_BANDS_LATERAL_MS : PELVIS_DELTAV_BANDS_FRONTAL_MS;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, bands);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = (_a = PELVIS_DESCRIPTIONS[selected.aisLevel]) != null ? _a : PELVIS_DESCRIPTIONS[2];
    return {
      eventIndex,
      region: "pelvis",
      aisSeverity: selected.aisLevel,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: isLateral ? "lateral-compression-pelvis" : "frontal-indirect-pelvis",
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the pelvis in this pipeline. This finding is derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) on a${isLateral ? ` ${impactSide}` : " frontal"} impact against an UNVERIFIED engineering-heuristic severity banding (see PELVIS_DELTAV_BANDS_${isLateral ? "LATERAL" : "FRONTAL"}_MS in constants.ts), not a criterion value run through a published risk curve. Treat as directional/plausibility-level only, not a validated probability.`
    };
  }

  
  function headAis2Risk(risks) {
    return risks.find((r) => r.region === "head" && r.aisLevel === 2);
  }
  var FACIAL_FRACTURE_VARIANTS = [
    { name: "Nasal fracture", clinical: "Closed fracture of the nasal bone (AIS 2).", plain: "Your nose is broken." },
    { name: "Orbital socket fracture", clinical: "Fracture of the orbital socket (blowout fracture) (AIS 2).", plain: "The bone around your eye socket is fractured." }
  ];
  function facialFractureInjury(eventIndex, risks) {
    const source = headAis2Risk(risks);
    if (!source || source.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = selectDeterministicVariant(source.probability, [FACIAL_FRACTURE_VARIANT_PROBABILITY_BREAKPOINT], FACIAL_FRACTURE_VARIANTS);
    return {
      eventIndex,
      region: "head",
      aisSeverity: 2,
      continuousSeverity: 1 + source.probability,
      
      probability: source.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: "blunt-facial-impact",
      lowerFidelity: true,
      caveat: "LOWER FIDELITY: no dedicated facial-injury criterion exists in this pipeline. This finding is derived from the SAME head region AIS>=2 risk result skull fracture uses (src/risk/headRisk.ts) -- it is not an independent measurement, and will always co-occur with skull fracture as a result (a real simplification: real crashes can fracture one without the other). Which facial bone is named is a deterministic reading of that same probability, not a separately validated finding."
    };
  }
  var DENTAL_DESCRIPTION = {
    name: "Dental injury",
    clinical: "Traumatic dental injury -- one or more teeth fractured or avulsed (AIS 1).",
    plain: "You have lost or broken some teeth."
  };
  function dentalInjury(eventIndex, risks) {
    const source = headAis2Risk(risks);
    if (!source || source.probability < DENTAL_INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    return {
      eventIndex,
      region: "head",
      aisSeverity: 1,
      continuousSeverity: 1 + source.probability,
      
      probability: source.probability,
      name: DENTAL_DESCRIPTION.name,
      clinicalDescription: DENTAL_DESCRIPTION.clinical,
      plainDescription: DENTAL_DESCRIPTION.plain,
      mechanism: "blunt-facial-impact-dental",
      lowerFidelity: true,
      caveat: "LOWER FIDELITY: no dedicated dental-injury criterion exists in this pipeline. Derived from the same head region AIS>=2 risk result skull fracture uses, but included at a LOWER probability floor (DENTAL_INJURY_INCLUSION_PROBABILITY_THRESHOLD) than that injury, since real dental injury is common even in impacts too mild to fracture the skull. Treat as directional/plausibility-level only."
    };
  }
  var SCALP_LACERATION_DESCRIPTION = {
    name: "Scalp laceration",
    clinical: "Laceration of the scalp, soft tissue only, no skull involvement (AIS 1).",
    plain: "You have a cut on your scalp."
  };
  function scalpLacerationInjury(eventIndex, risks) {
    const source = headAis2Risk(risks);
    if (!source || source.probability < SCALP_LACERATION_INCLUSION_PROBABILITY_THRESHOLD) return null;
    return {
      eventIndex,
      region: "head",
      aisSeverity: 1,
      continuousSeverity: 1 + source.probability,
      
      probability: source.probability,
      name: SCALP_LACERATION_DESCRIPTION.name,
      clinicalDescription: SCALP_LACERATION_DESCRIPTION.clinical,
      plainDescription: SCALP_LACERATION_DESCRIPTION.plain,
      mechanism: "blunt-head-impact-scalp",
      lowerFidelity: true,
      caveat: "LOWER FIDELITY: no dedicated soft-tissue-injury criterion exists in this pipeline. Derived from the same head region AIS>=2 risk result skull fracture uses, but included at the LOWEST probability floor of any head sub-injury in this module (SCALP_LACERATION_INCLUSION_PROBABILITY_THRESHOLD), since a soft-tissue cut needs the least force of any head finding modeled here. Treat as directional/plausibility-level only."
    };
  }

  
  var SPINE_DESCRIPTIONS = {
    2: { name: "Vertebral compression fracture", clinical: "Compression fracture of a vertebral body, stable, no cord involvement (AIS 2).", plain: "A bone in your spine is fractured." },
    3: { name: "Vertebral burst fracture", clinical: "Burst fracture of a vertebral body, unstable (AIS 3).", plain: "Your spine is badly fractured -- the bone has shattered." },
    4: { name: "Vertebral fracture with cord involvement", clinical: "Vertebral fracture with probable spinal cord involvement (AIS 4).", plain: "Your spine is broken, and your spinal cord may be damaged." }
  };
  function thoracicSpineInjury(eventIndex, impactSide, deltaV) {
    var _a;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, THORACIC_SPINE_DELTAV_BANDS_MS);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = (_a = SPINE_DESCRIPTIONS[selected.aisLevel]) != null ? _a : SPINE_DESCRIPTIONS[2];
    return {
      eventIndex,
      region: "thoracicSpine",
      aisSeverity: selected.aisLevel,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical.replace("vertebral", "thoracic vertebral"),
      plainDescription: desc.plain,
      mechanism: "thoracic-spine-deceleration",
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the thoracic spine in this pipeline. This finding is derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) against an UNVERIFIED engineering-heuristic severity banding (see THORACIC_SPINE_DELTAV_BANDS_MS in constants.ts) -- impactSide ('${impactSide}') is recorded but does not currently affect the banding, same simplification neckInjury.ts already carries. Treat as directional/plausibility-level only, not a validated probability.`
    };
  }
  function lumbarSpineInjury(eventIndex, impactSide, deltaV) {
    var _a;
    if (impactSide !== "front") return null;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, LUMBAR_SPINE_DELTAV_BANDS_FRONTAL_MS);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = (_a = SPINE_DESCRIPTIONS[selected.aisLevel]) != null ? _a : SPINE_DESCRIPTIONS[2];
    return {
      eventIndex,
      region: "lumbarSpine",
      aisSeverity: selected.aisLevel,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical.replace("vertebral", "lumbar vertebral"),
      plainDescription: desc.plain,
      mechanism: "seatbelt-flexion-distraction-lumbar",
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the lumbar spine in this pipeline. This finding is derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) on a FRONTAL impact (lap-belt flexion-distraction, "Chance fracture" mechanism) against an UNVERIFIED engineering-heuristic severity banding (see LUMBAR_SPINE_DELTAV_BANDS_FRONTAL_MS in constants.ts), not a criterion value run through a published risk curve. Treat as directional/plausibility-level only, not a validated probability.`
    };
  }

  
  function armDescriptions(part, sideLabel) {
    const noun = sideLabel ? `${sideLabel} ${part}` : `your ${part}`;
    const Noun = sideLabel ? `${sideLabel[0].toUpperCase()}${sideLabel.slice(1)} ${part}` : `${part[0].toUpperCase()}${part.slice(1)}`;
    return {
      2: { name: `${Noun} fracture (simple)`, clinical: `Closed, simple fracture of the ${part}${sideLabel ? ` (${sideLabel})` : ""} (AIS 2).`, plain: `Your ${noun.replace(/^your /, "")} is broken.` },
      3: { name: `${Noun} fracture (displaced/comminuted)`, clinical: `Displaced or comminuted fracture of the ${part}${sideLabel ? ` (${sideLabel})` : ""} (AIS 3).`, plain: `Your ${noun.replace(/^your /, "")} is badly broken -- shattered, not just cracked.` },
      4: { name: `${Noun} -- open fracture with vascular injury`, clinical: `Open fracture of the ${part}${sideLabel ? ` (${sideLabel})` : ""} with major vascular injury; traumatic partial amputation cannot be ruled out (AIS 4).`, plain: `Your ${noun.replace(/^your /, "")} is torn open, and it's bleeding badly.` }
    };
  }
  function legDescriptions(part) {
    return {
      2: { name: `${part[0].toUpperCase()}${part.slice(1)} fracture (simple)`, clinical: `Closed, simple fracture of the ${part} (AIS 2).`, plain: `Your ${part} is broken.` },
      3: { name: `${part[0].toUpperCase()}${part.slice(1)} fracture (displaced/comminuted)`, clinical: `Displaced or comminuted fracture of the ${part} (AIS 3).`, plain: `Your ${part} is badly broken -- shattered, not just cracked.` },
      4: { name: `${part[0].toUpperCase()}${part.slice(1)} -- open fracture with vascular injury`, clinical: `Open fracture of the ${part} with major vascular injury; traumatic partial amputation cannot be ruled out (AIS 4).`, plain: `Your ${part} is torn open, and it's bleeding badly.` }
    };
  }
  function buildLateralArmInjury(eventIndex, region, part, mechanism, bandTableName, bands, impactSide, deltaV) {
    if (impactSide !== "left" && impactSide !== "right") return null;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, bands);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const level = selected.aisLevel;
    const desc = armDescriptions(part, impactSide)[level];
    return {
      eventIndex,
      region,
      aisSeverity: level,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism,
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the ${part} in this pipeline. This finding is derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) on a ${impactSide} impact (door/side-structure intrusion) against an UNVERIFIED engineering-heuristic severity banding (see ${bandTableName} in constants.ts), not a criterion value run through a published risk curve. Treat as directional/plausibility-level only, not a validated probability.`
    };
  }
  function buildFrontalArmInjury(eventIndex, region, part, mechanism, bandTableName, bands, impactSide, deltaV) {
    if (impactSide !== "front" && impactSide !== "oblique") return null;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, bands);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const level = selected.aisLevel;
    const desc = armDescriptions(part, null)[level];
    return {
      eventIndex,
      region,
      aisSeverity: level,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism,
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the ${part} in this pipeline. This finding is derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) on a ${impactSide} impact (bracing against the wheel/dash, or airbag-deployment force into a braced limb) against an UNVERIFIED engineering-heuristic severity banding (see ${bandTableName} in constants.ts, deliberately less sensitive than the lateral direct-crush table for the same region), not a criterion value run through a published risk curve. Treat as directional/plausibility-level only, not a validated probability.`
    };
  }
  function buildFrontalLegInjury(eventIndex, region, part, mechanism, bandTableName, bands, impactSide, deltaV) {
    if (impactSide !== "front" && impactSide !== "oblique") return null;
    const selected = selectAisLevelFromDeltaVBands(deltaV.magnitudeMs, bands);
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const level = selected.aisLevel;
    const desc = legDescriptions(part)[level];
    return {
      eventIndex,
      region,
      aisSeverity: level,
      continuousSeverity: selected.continuousSeverity,
      
      probability: selected.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism,
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no dedicated injury criterion exists for the ${part} in this pipeline. This finding is derived only from event deltaV magnitude (${deltaV.magnitudeMs.toFixed(1)} m/s) on a ${impactSide} impact (footwell intrusion) against an UNVERIFIED engineering-heuristic severity banding (see ${bandTableName} in constants.ts), not a criterion value run through a published risk curve. Treat as directional/plausibility-level only, not a validated probability.`
    };
  }
  function upperArmInjury(eventIndex, impactSide, deltaV) {
    var _a;
    return (_a = buildLateralArmInjury(eventIndex, "upperArm", "upper arm", "lateral-compression-upperArm", "UPPER_ARM_DELTAV_BANDS_LATERAL_MS", UPPER_ARM_DELTAV_BANDS_LATERAL_MS, impactSide, deltaV)) != null ? _a : buildFrontalArmInjury(eventIndex, "upperArm", "upper arm", "frontal-bracing-upperArm", "UPPER_ARM_DELTAV_BANDS_FRONTAL_MS", UPPER_ARM_DELTAV_BANDS_FRONTAL_MS, impactSide, deltaV);
  }
  function forearmInjury(eventIndex, impactSide, deltaV) {
    var _a;
    return (_a = buildLateralArmInjury(eventIndex, "forearm", "forearm", "lateral-compression-forearm", "FOREARM_DELTAV_BANDS_LATERAL_MS", FOREARM_DELTAV_BANDS_LATERAL_MS, impactSide, deltaV)) != null ? _a : buildFrontalArmInjury(eventIndex, "forearm", "forearm", "frontal-bracing-forearm", "FOREARM_DELTAV_BANDS_FRONTAL_MS", FOREARM_DELTAV_BANDS_FRONTAL_MS, impactSide, deltaV);
  }
  function wristInjury(eventIndex, impactSide, deltaV) {
    var _a;
    return (_a = buildLateralArmInjury(eventIndex, "wrist", "wrist", "lateral-compression-wrist", "WRIST_DELTAV_BANDS_LATERAL_MS", WRIST_DELTAV_BANDS_LATERAL_MS, impactSide, deltaV)) != null ? _a : buildFrontalArmInjury(eventIndex, "wrist", "wrist", "frontal-bracing-wrist", "WRIST_DELTAV_BANDS_FRONTAL_MS", WRIST_DELTAV_BANDS_FRONTAL_MS, impactSide, deltaV);
  }
  function handInjury(eventIndex, impactSide, deltaV) {
    var _a;
    return (_a = buildLateralArmInjury(eventIndex, "hand", "hand", "lateral-compression-hand", "HAND_DELTAV_BANDS_LATERAL_MS", HAND_DELTAV_BANDS_LATERAL_MS, impactSide, deltaV)) != null ? _a : buildFrontalArmInjury(eventIndex, "hand", "hand", "frontal-bracing-hand", "HAND_DELTAV_BANDS_FRONTAL_MS", HAND_DELTAV_BANDS_FRONTAL_MS, impactSide, deltaV);
  }
  function lowerLegInjury(eventIndex, impactSide, deltaV) {
    return buildFrontalLegInjury(eventIndex, "lowerLeg", "lower leg", "frontal-footwell-lowerLeg", "LOWER_LEG_DELTAV_BANDS_FRONTAL_MS", LOWER_LEG_DELTAV_BANDS_FRONTAL_MS, impactSide, deltaV);
  }
  function ankleInjury(eventIndex, impactSide, deltaV) {
    return buildFrontalLegInjury(eventIndex, "ankle", "ankle", "frontal-footwell-ankle", "ANKLE_DELTAV_BANDS_FRONTAL_MS", ANKLE_DELTAV_BANDS_FRONTAL_MS, impactSide, deltaV);
  }
  function footInjury(eventIndex, impactSide, deltaV) {
    return buildFrontalLegInjury(eventIndex, "foot", "foot", "frontal-footwell-foot", "FOOT_DELTAV_BANDS_FRONTAL_MS", FOOT_DELTAV_BANDS_FRONTAL_MS, impactSide, deltaV);
  }

  
  var CLAVICLE_DESCRIPTION = {
    name: "Clavicle fracture",
    clinical: "Closed fracture of the clavicle (AIS 2).",
    plain: "Your collarbone is broken."
  };
  function clavicleInjury(eventIndex, risks) {
    const source = risks.find((r) => r.region === "chest" && r.aisLevel === CLAVICLE_FRACTURE_MIN_CHEST_AIS);
    if (!source || source.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    return {
      eventIndex,
      region: "chest",
      aisSeverity: 2,
      continuousSeverity: 1 + source.probability,
      
      probability: source.probability,
      name: CLAVICLE_DESCRIPTION.name,
      clinicalDescription: CLAVICLE_DESCRIPTION.clinical,
      plainDescription: CLAVICLE_DESCRIPTION.plain,
      mechanism: "blunt-chest-loading-clavicle",
      lowerFidelity: true,
      caveat: "LOWER FIDELITY: no dedicated clavicle-injury criterion exists in this pipeline. Derived from the SAME chest region AIS>=2 risk result chestInjury.ts uses -- it is not an independent measurement, and co-occurs with whatever chestInjury.ts itself reports for this event rather than replacing it."
    };
  }

  
  function computeInjuriesForEvent(input) {
    const { eventIndex, impactSide, deltaV, risks } = input;
    const primaryCandidates = [
      skullFractureInjury(eventIndex, risks),
      brainInjury(eventIndex, risks),
      facialFractureInjury(eventIndex, risks),
      dentalInjury(eventIndex, risks),
      scalpLacerationInjury(eventIndex, risks),
      chestInjury(eventIndex, risks),
      clavicleInjury(eventIndex, risks),
      femurInjury(eventIndex, risks),
      abdomenInjury(eventIndex, impactSide, deltaV),
      neckInjury(eventIndex, impactSide, deltaV),
      aortaInjury(eventIndex, impactSide, deltaV),
      pelvisInjury(eventIndex, impactSide, deltaV),
      thoracicSpineInjury(eventIndex, impactSide, deltaV),
      lumbarSpineInjury(eventIndex, impactSide, deltaV),
      kidneyInjury(eventIndex, impactSide, deltaV),
      bowelInjury(eventIndex, impactSide, deltaV),
      pancreasInjury(eventIndex, impactSide, deltaV),
      upperArmInjury(eventIndex, impactSide, deltaV),
      forearmInjury(eventIndex, impactSide, deltaV),
      wristInjury(eventIndex, impactSide, deltaV),
      handInjury(eventIndex, impactSide, deltaV),
      lowerLegInjury(eventIndex, impactSide, deltaV),
      ankleInjury(eventIndex, impactSide, deltaV),
      footInjury(eventIndex, impactSide, deltaV)
    ];
    const primaryInjuries = primaryCandidates.filter((injury) => injury !== null);
    const derivedCandidates = [
      lungInjury(eventIndex, primaryInjuries),
      diaphragmInjury(eventIndex, primaryInjuries, deltaV)
    ];
    const derivedInjuries = derivedCandidates.filter((injury) => injury !== null);
    return [...primaryInjuries, ...derivedInjuries, ...haemorrhageInjuries(eventIndex, primaryInjuries)];
  }
  function computeInjuries(events) {
    return events.flatMap(computeInjuriesForEvent);
  }

  
  var INJURY_REGION_TO_ISS_REGION = {
    head: "headOrNeck",
    neck: "headOrNeck",
    chest: "chest",
    aorta: "chest",
    abdomen: "abdomen",
    femur: "extremities",
    
    
    
    
    
    
    
    
    
    kidney: "abdomen",
    bowel: "abdomen",
    pancreas: "abdomen",
    lung: "chest",
    diaphragm: "chest",
    
    
    
    
    pelvis: "extremities",
    
    
    
    
    
    
    
    thoracicSpine: "chest",
    lumbarSpine: "abdomen",
    
    
    upperArm: "extremities",
    forearm: "extremities",
    wrist: "extremities",
    hand: "extremities",
    lowerLeg: "extremities",
    ankle: "extremities",
    foot: "extremities",
    
    
    knee: "extremities"
  };
  var ISS_MAJOR_TRAUMA_THRESHOLD = 16;
  var SURVIVAL_CRITICAL_ISS_THRESHOLD = 50;
  var NEAR_CERTAIN_PROBABILITY_THRESHOLD = 0.8;
  var HEDGE_SUFFIX = " (likely)";
  var LOWER_FIDELITY_SUFFIX = " (uncertain -- no direct measurement for this)";
  var CONSCIOUSNESS_RANK = {
    alert: 0,
    confused: 1,
    unresponsive: 2
  };
  var SHOCK_RANK = {
    none: 0,
    early: 1,
    decompensated: 2
  };
  var BLOOD_LOSS_RANK = {
    none: 0,
    moderate: 1,
    severe: 2
  };
  var PAIN_SCORE_BANDS = [
    { level: "none", floorScore: 0 },
    { level: "moderate", floorScore: 1 },
    { level: "severe", floorScore: 5 },
    { level: "excruciating", floorScore: 10 }
  ];
  var VISION_HEAD_AIS_THRESHOLDS = { blurred: 3, lost: 5 };
  var HEARING_HEAD_AIS_THRESHOLDS = { muffled: 2, lost: 4 };
  var MOBILITY_FEMUR_AIS_THRESHOLDS = { limited: 2, unable: 3 };
  var MOBILITY_NECK_CORD_INVOLVEMENT_AIS = 4;
  var MOBILITY_RANK = {
    normal: 0,
    limited: 1,
    unable: 2
  };
  var TRISS_BLUNT_COEFFICIENTS = Object.freeze({
    b0: -0.4499,
    b1: 0.8085,
    
    b2: -0.0835,
    
    b3: -1.743
    
  });
  var TRISS_RTS_ASSUMED_NORMAL = 7.8408;
  var TRISS_AGE_INDEX_CUTOFF = 55;
  var SURVIVAL_CEILING_CONTROL_POINTS = [
    { severity: 1, ceilingPercent: 100 },
    
    { severity: 2, ceilingPercent: 92 },
    
    { severity: 3, ceilingPercent: 72 },
    
    { severity: 4, ceilingPercent: 50 },
    
    { severity: 5, ceilingPercent: 28 },
    
    { severity: 6, ceilingPercent: 3 }
    
  ];
  var NHTSA_MAIS_MEDICAL_COST_USD = Object.freeze({
    0: 0,
    1: 3104,
    2: 19847,
    3: 58728,
    4: 165588,
    5: 417701,
    6: 5e5
    
  });
  var RECOVERY_WEEKS_TABLE = Object.freeze({
    head: Object.freeze({ 1: 1, 2: 2, 3: 8, 4: 26, 5: 52 }),
    chest: Object.freeze({ 1: 2, 2: 6, 3: 10, 4: 16, 5: 26 }),
    spine: Object.freeze({ 1: 3, 2: 8, 3: 16, 4: 52, 5: 78 }),
    majorFracture: Object.freeze({ 1: 4, 2: 18, 3: 26, 4: 40, 5: 52 }),
    minorFracture: Object.freeze({ 1: 2, 2: 6, 3: 12, 4: 20, 5: 30 }),
    organ: Object.freeze({ 1: 2, 2: 6, 3: 10, 4: 16, 5: 26 })
  });

  
  var ALL_ISS_BODY_REGIONS = ["headOrNeck", "face", "chest", "abdomen", "extremities", "external"];
  function computeISS(injuries) {
    const regionSeverities = ALL_ISS_BODY_REGIONS.map((region) => ({ region, maxAisSeverity: 0 }));
    const byRegion = new Map(regionSeverities.map((r) => [r.region, r]));
    let ais6Override = false;
    for (const injury of injuries) {
      if (injury.aisSeverity === 6) {
        ais6Override = true;
      }
      if (injury.region === "circulatory") continue;
      const issRegion = INJURY_REGION_TO_ISS_REGION[injury.region];
      const entry = byRegion.get(issRegion);
      if (injury.aisSeverity > entry.maxAisSeverity) {
        entry.maxAisSeverity = injury.aisSeverity;
      }
    }
    const topThree = [...regionSeverities].sort((a, b) => b.maxAisSeverity - a.maxAisSeverity).slice(0, 3);
    const contributingRegions = topThree.filter((r) => r.maxAisSeverity > 0).map((r) => r.region);
    const computedIss = topThree.reduce((sum, r) => sum + r.maxAisSeverity * r.maxAisSeverity, 0);
    const iss = ais6Override ? 75 : computedIss;
    return {
      iss,
      isMajorTrauma: iss >= ISS_MAJOR_TRAUMA_THRESHOLD,
      regionSeverities,
      contributingRegions,
      ais6Override
    };
  }

  
  var SURVIVAL_PROBABILITY_CAVEAT = "UNVERIFIED, simplified: a reduced TRISS (Trauma and Injury Severity Score) calculation -- Boyd et al. 1987 / Schluter 2011's published logistic-regression method, using this crash's occupant age and a CONTINUOUS severity figure (Round 14: derived from the same P(AIS>=n) risk curves ISS itself is built from, not the discretised, integer ISS shown elsewhere in this report -- this keeps the percentage smooth across an AIS boundary instead of stepping with it), with the Revised Trauma Score (RTS) component held at its normal/maximum value because this pipeline does not model the physiological vitals (GCS, blood pressure, respiratory rate) RTS needs. That makes this a best-case figure conditioned on anatomic injury burden alone, not a true patient-specific prediction -- a real occupant in physiological shock would score lower. A smoothly-ramped, authored ceiling (see constants.ts's SURVIVAL_CEILING_CONTROL_POINTS) applies across the WHOLE severity range, not just the most severe findings -- the raw TRISS curve alone stays above ~90% survival across nearly its entire domain (RTS held at maximum has that effect), which would badly understate how serious a moderate-to-severe finding actually is.";
  function computeContinuousIss(injuries) {
    var _a;
    const regionMax =  new Map();
    for (const injury of injuries) {
      if (injury.region === "circulatory") continue;
      const issRegion = INJURY_REGION_TO_ISS_REGION[injury.region];
      if (!issRegion) continue;
      const current = (_a = regionMax.get(issRegion)) != null ? _a : 0;
      if (injury.continuousSeverity > current) regionMax.set(issRegion, injury.continuousSeverity);
    }
    const topThree = [...regionMax.values()].sort((a, b) => b - a).slice(0, 3);
    return topThree.reduce((sum, v) => sum + v * v, 0);
  }
  function smoothCeilingPercent(maxContinuousSeverity) {
    const points = SURVIVAL_CEILING_CONTROL_POINTS;
    if (maxContinuousSeverity <= points[0].severity) return points[0].ceilingPercent;
    const last = points[points.length - 1];
    if (maxContinuousSeverity >= last.severity) return last.ceilingPercent;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (maxContinuousSeverity >= a.severity && maxContinuousSeverity <= b.severity) {
        const t = (maxContinuousSeverity - a.severity) / (b.severity - a.severity);
        return a.ceilingPercent + t * (b.ceilingPercent - a.ceilingPercent);
      }
    }
    return last.ceilingPercent;
  }
  function computeSurvivalProbability(injuries, iss, ageAtLeast55 = false) {
    void iss;
    const ageIndex = ageAtLeast55 ? 1 : 0;
    const continuousIss = computeContinuousIss(injuries);
    const { b0, b1, b2, b3 } = TRISS_BLUNT_COEFFICIENTS;
    const b = b0 + b1 * TRISS_RTS_ASSUMED_NORMAL + b2 * continuousIss + b3 * ageIndex;
    const ps = 1 / (1 + Math.exp(-b));
    let percent = ps * 100;
    const maxContinuousSeverity = injuries.reduce((max, injury) => Math.max(max, injury.continuousSeverity), 0);
    percent = Math.min(percent, smoothCeilingPercent(maxContinuousSeverity));
    percent = Math.max(0, Math.min(100, percent));
    return { percent: Math.round(percent), caveat: SURVIVAL_PROBABILITY_CAVEAT };
  }

  
  var PLAIN_SUMMARY = {
    likelySurvivable: "These injuries are serious but not expected to be life-threatening.",
    seriousButLikelySurvivable: "These are serious injuries, but survivable with prompt trauma care.",
    critical: "These injuries are critical -- survival is uncertain even with immediate trauma care.",
    notSurvivable: "These injuries would not have been survivable."
  };
  var SURVIVAL_VERDICT_CAVEAT = `UNVERIFIED -- the weakest link in this pipeline: mapping ISS and AIS>=5 presence to a survival outlook is a qualitative judgment call, not a validated mortality-probability model. Published ISS-vs-mortality relationships vary substantially by patient population, era, and trauma-center care quality, which is why this is reported as one of four qualitative bands. A numeric survivalProbabilityPercent is ALSO reported alongside this outlook (see survivalProbabilityCaveat for that figure's own, more specific, caveats) -- the two are computed independently, not one derived from the other. AIS 6 is a partial exception to the outlook's own weakness -- it is DEFINED (AIS 2005 coding) as "maximal, currently untreatable," closer to a coding-scale fact than a probability estimate, so the notSurvivable outlook for an AIS6 injury rests on firmer ground than the other three bands.`;
  function computeSurvivalVerdict(injuries, iss, ageAtLeast55 = false) {
    const hasAis5Plus = injuries.some((i) => i.aisSeverity >= 5);
    const hasAis6 = iss.ais6Override || injuries.some((i) => i.aisSeverity === 6);
    let outlook;
    if (hasAis6) {
      outlook = "notSurvivable";
    } else if (hasAis5Plus || iss.iss >= SURVIVAL_CRITICAL_ISS_THRESHOLD) {
      outlook = "critical";
    } else if (iss.isMajorTrauma) {
      outlook = "seriousButLikelySurvivable";
    } else {
      outlook = "likelySurvivable";
    }
    const technicalSummary = `ISS ${iss.iss}${iss.ais6Override ? " (AIS6 override)" : ""} -- ${iss.isMajorTrauma ? "at/above" : "below"} the conventional major-trauma threshold (ISS>=16); ${hasAis5Plus ? "at least one AIS>=5 injury present" : "no AIS>=5 injury present"}.`;
    const survivalProbability = computeSurvivalProbability(injuries, iss, ageAtLeast55);
    return {
      outlook,
      survivalProbabilityPercent: survivalProbability.percent,
      survivalProbabilityCaveat: survivalProbability.caveat,
      iss: iss.iss,
      isMajorTrauma: iss.isMajorTrauma,
      hasAis5Plus,
      hasAis6,
      plainSummary: PLAIN_SUMMARY[outlook],
      technicalSummary,
      caveat: SURVIVAL_VERDICT_CAVEAT
    };
  }

  
  var SYSTEMIC_EFFECTS_CAVEAT = "UNVERIFIED -- qualitative clinical inference, not a measured value: no criterion or risk curve in this pipeline measures consciousness, shock, blood loss, breathing, pain, vision, hearing, mobility, or self-extraction capability directly. Derived from ISS plus the crash's own already-computed injuries (circulatory/chest for the original four axes; head/femur/neck for pain/vision/hearing/mobility -- see each axis's own derivation in systemicEffects.ts) via engineering-judgment banding, loosely evocative of real trauma staging concepts (e.g. ATLS hemorrhagic shock classes' rough compensated -> decompensated progression) but NOT derived from ATLS or any other cited clinical staging system. No axis here is ever a numeric 1-10 scale. Treat as directional/plausibility-level only.";
  var CONSCIOUSNESS_PLAIN = {
    alert: "You are alert and aware of what is happening around you.",
    confused: "You are dazed and struggling to think clearly.",
    unresponsive: "You are not responding to anything around you."
  };
  var SHOCK_PLAIN = {
    none: "Your body is coping with these injuries -- you are not in shock.",
    early: "Your body is starting to struggle to keep up with these injuries.",
    decompensated: "Your body can no longer compensate for these injuries -- you are in shock."
  };
  var BLOOD_LOSS_PLAIN = {
    none: "You have not lost a significant amount of blood.",
    moderate: "You have lost a moderate amount of blood.",
    severe: "You have lost a severe, life-threatening amount of blood."
  };
  var BREATHING_PLAIN = {
    normal: "Your breathing is unaffected.",
    laboured: "Your breathing is difficult and laboured."
  };
  var PAIN_PLAIN = {
    none: "You are not in any significant pain.",
    moderate: "You are in real pain.",
    severe: "You are in severe pain.",
    excruciating: "The pain is excruciating -- almost unbearable."
  };
  var VISION_PLAIN = {
    normal: "Your vision is unaffected.",
    blurred: "Your vision is blurred.",
    lost: "You cannot see."
  };
  var HEARING_PLAIN = {
    normal: "Your hearing is unaffected.",
    muffled: "Your ears are ringing and sounds are muffled.",
    lost: "You cannot hear anything."
  };
  var MOBILITY_PLAIN = {
    normal: "You can move normally.",
    limited: "You can move, but it is painful and limited.",
    unable: "You cannot move."
  };
  var SELF_EXTRACT_PLAIN = {
    able: "You could get yourself out of the vehicle.",
    wouldStruggle: "You could get yourself out of the vehicle, but it would be a struggle.",
    unable: "You could not get yourself out of the vehicle without help."
  };
  function bloodLossLevel(injuries) {
    const circulatory = injuries.filter((i) => i.region === "circulatory");
    if (circulatory.length === 0) return "none";
    const worst = Math.max(...circulatory.map((i) => i.aisSeverity));
    return worst >= 4 ? "severe" : "moderate";
  }
  function shockLevel(iss, bloodLoss) {
    const issRank = iss.iss >= SURVIVAL_CRITICAL_ISS_THRESHOLD ? 2 : iss.iss >= ISS_MAJOR_TRAUMA_THRESHOLD ? 1 : 0;
    const rank = Math.max(BLOOD_LOSS_RANK[bloodLoss], issRank);
    return ["none", "early", "decompensated"][rank];
  }
  function consciousnessLevel(iss, shock) {
    const issRank = iss.iss >= SURVIVAL_CRITICAL_ISS_THRESHOLD ? 2 : iss.iss >= ISS_MAJOR_TRAUMA_THRESHOLD ? 1 : 0;
    const rank = Math.max(SHOCK_RANK[shock], issRank);
    return ["alert", "confused", "unresponsive"][rank];
  }
  function breathingStatus(injuries) {
    const laboured = injuries.some((i) => i.region === "chest" && i.aisSeverity >= 4);
    return laboured ? "laboured" : "normal";
  }
  function painScore(injuries) {
    var _a;
    const worstByRegion =  new Map();
    for (const injury of injuries) {
      if (injury.region === "circulatory") continue;
      const current = (_a = worstByRegion.get(injury.region)) != null ? _a : 0;
      if (injury.aisSeverity > current) worstByRegion.set(injury.region, injury.aisSeverity);
    }
    let score = 0;
    for (const worst of worstByRegion.values()) score += worst;
    return score;
  }
  function painLevel(injuries) {
    const score = painScore(injuries);
    let selected = "none";
    for (const band of PAIN_SCORE_BANDS) {
      if (score >= band.floorScore) selected = band.level;
    }
    return selected;
  }
  function worstHeadAis(injuries) {
    const headInjuries = injuries.filter((i) => i.region === "head");
    return headInjuries.length === 0 ? 0 : Math.max(...headInjuries.map((i) => i.aisSeverity));
  }
  function visionStatus(injuries) {
    const worst = worstHeadAis(injuries);
    if (worst >= VISION_HEAD_AIS_THRESHOLDS.lost) return "lost";
    if (worst >= VISION_HEAD_AIS_THRESHOLDS.blurred) return "blurred";
    return "normal";
  }
  function hearingStatus(injuries) {
    const worst = worstHeadAis(injuries);
    if (worst >= HEARING_HEAD_AIS_THRESHOLDS.lost) return "lost";
    if (worst >= HEARING_HEAD_AIS_THRESHOLDS.muffled) return "muffled";
    return "normal";
  }
  function mobilityStatus(injuries) {
    const femurInjuries = injuries.filter((i) => i.region === "femur");
    const worstFemur = femurInjuries.length === 0 ? 0 : Math.max(...femurInjuries.map((i) => i.aisSeverity));
    const femurRank = worstFemur >= MOBILITY_FEMUR_AIS_THRESHOLDS.unable ? MOBILITY_RANK.unable : worstFemur >= MOBILITY_FEMUR_AIS_THRESHOLDS.limited ? MOBILITY_RANK.limited : MOBILITY_RANK.normal;
    const hasCordInvolvement = injuries.some((i) => i.region === "neck" && i.aisSeverity >= MOBILITY_NECK_CORD_INVOLVEMENT_AIS);
    const neckRank = hasCordInvolvement ? MOBILITY_RANK.unable : MOBILITY_RANK.normal;
    const rank = Math.max(femurRank, neckRank);
    return ["normal", "limited", "unable"][rank];
  }
  function selfExtractCapability(mobility, consciousness) {
    const rank = Math.max(MOBILITY_RANK[mobility], CONSCIOUSNESS_RANK[consciousness]);
    return ["able", "wouldStruggle", "unable"][rank];
  }
  function computeSystemicEffects(injuries, iss) {
    const bloodLoss = bloodLossLevel(injuries);
    const shock = shockLevel(iss, bloodLoss);
    const consciousness = consciousnessLevel(iss, shock);
    const breathing = breathingStatus(injuries);
    const pain = painLevel(injuries);
    const vision = visionStatus(injuries);
    const hearing = hearingStatus(injuries);
    const mobility = mobilityStatus(injuries);
    const selfExtract = selfExtractCapability(mobility, consciousness);
    return {
      consciousness: { level: consciousness, plainDescription: CONSCIOUSNESS_PLAIN[consciousness] },
      shock: { level: shock, plainDescription: SHOCK_PLAIN[shock] },
      bloodLoss: { level: bloodLoss, plainDescription: BLOOD_LOSS_PLAIN[bloodLoss] },
      breathing: { level: breathing, plainDescription: BREATHING_PLAIN[breathing] },
      pain: { level: pain, plainDescription: PAIN_PLAIN[pain] },
      vision: { level: vision, plainDescription: VISION_PLAIN[vision] },
      hearing: { level: hearing, plainDescription: HEARING_PLAIN[hearing] },
      mobility: { level: mobility, plainDescription: MOBILITY_PLAIN[mobility] },
      selfExtract: { level: selfExtract, plainDescription: SELF_EXTRACT_PLAIN[selfExtract] },
      lowerFidelity: true,
      caveat: SYSTEMIC_EFFECTS_CAVEAT
    };
  }

  
  function presentInjuryPlainLayer(injury) {
    if (injury.lowerFidelity) {
      return injury.plainDescription + LOWER_FIDELITY_SUFFIX;
    }
    if (injury.probability >= NEAR_CERTAIN_PROBABILITY_THRESHOLD) {
      return injury.plainDescription;
    }
    return injury.plainDescription + HEDGE_SUFFIX;
  }

  
  var MEDICAL_COST_CAVEAT = "Medical + emergency-service unit cost by MAIS (Maximum Abbreviated Injury Scale), 2010 dollars -- NHTSA's Blincoe et al. crash-costing methodology (DOT HS 812 013, 2015 revision), the MEDICAL + EMS component specifically, not the comprehensive figure (which additionally bakes in lost productivity, legal/insurance administration, and a quality-of-life valuation running to millions per serious injury -- this is actual treatment expenditure only). Looked up by this occupant's single WORST injury (MAIS), which is how the source table is defined and meant to be used, not summed across every injury present -- a genuine limitation for a crash with several serious-but-not-worst injuries, which this figure will understate relative to the true total cost of care. The MAIS1-5 figures are SINGLE-SOURCE (one web search, not independently re-confirmed -- see constants.ts) and the fatal figure is this pipeline's own authored estimate, not an NHTSA number at all.";
  function computeMedicalCostEstimate(injuries) {
    const mais = injuries.length === 0 ? 0 : Math.max(...injuries.map((injury) => injury.aisSeverity));
    const costUsd = NHTSA_MAIS_MEDICAL_COST_USD[mais];
    return { costUsd, mais, caveat: MEDICAL_COST_CAVEAT };
  }

  
  var RECOVERY_TIME_CAVEAT = "Estimated weeks until the single LONGEST-recovering injury present has recovered -- concurrent injuries heal in parallel, not in series, so this is a maximum across injuries, not a sum. See constants.ts's RECOVERY_WEEKS_TABLE for the three cited clinical anchors (CDC on concussion, AMA on rib fracture, general orthopedic sources on femur fracture); every other body-region/severity combination is an authored, UNVERIFIED extrapolation from those anchors, not an independently cited figure.";
  var REGION_TO_RECOVERY_CLASS = {
    head: "head",
    neck: "spine",
    
    chest: "chest",
    aorta: "organ",
    
    abdomen: "organ",
    femur: "majorFracture",
    kidney: "organ",
    bowel: "organ",
    pancreas: "organ",
    lung: "chest",
    diaphragm: "organ",
    pelvis: "majorFracture",
    
    thoracicSpine: "spine",
    lumbarSpine: "spine",
    upperArm: "majorFracture",
    forearm: "majorFracture",
    wrist: "minorFracture",
    hand: "minorFracture",
    lowerLeg: "majorFracture",
    ankle: "minorFracture",
    foot: "minorFracture",
    knee: "minorFracture"
  };
  function computeRecoveryTimeEstimate(injuries) {
    var _a, _b;
    let worst = null;
    for (const injury of injuries) {
      if (injury.region === "circulatory") continue;
      if (injury.aisSeverity === 6) {
        return { weeks: null, worstRegion: null, caveat: RECOVERY_TIME_CAVEAT };
      }
      const recoveryClass = REGION_TO_RECOVERY_CLASS[injury.region];
      const weeks = RECOVERY_WEEKS_TABLE[recoveryClass][injury.aisSeverity];
      if (weeks !== void 0 && (worst === null || weeks > worst.weeks)) {
        worst = { weeks, region: injury.region };
      }
    }
    return { weeks: (_a = worst == null ? void 0 : worst.weeks) != null ? _a : 0, worstRegion: (_b = worst == null ? void 0 : worst.region) != null ? _b : null, caveat: RECOVERY_TIME_CAVEAT };
  }

  
  function presentInjury(injury) {
    return {
      region: injury.region,
      plainDescription: presentInjuryPlainLayer(injury),
      technical: {
        name: injury.name,
        aisSeverity: injury.aisSeverity,
        probability: injury.probability,
        clinicalDescription: injury.clinicalDescription,
        mechanism: injury.mechanism,
        lowerFidelity: injury.lowerFidelity,
        caveat: injury.caveat,
        
        
        
        
        
        
        ...injury.sourceCurve !== void 0 ? { sourceCurve: injury.sourceCurve } : {}
      }
    };
  }
  function buildInjuryReport(injuries, events, occupantAge) {
    for (const injury of injuries) {
      if (!Number.isInteger(injury.eventIndex) || injury.eventIndex < 0 || injury.eventIndex >= events.length) {
        throw new Error(`buildInjuryReport: injury.eventIndex ${injury.eventIndex} is out of range for ${events.length} event(s)`);
      }
    }
    const eventReports = events.map((event, eventIndex) => {
      const eventInjuries = injuries.filter((injury) => injury.eventIndex === eventIndex).map(presentInjury);
      return { eventIndex, event, injuries: eventInjuries };
    });
    const iss = computeISS(injuries);
    const ageAtLeast55 = typeof occupantAge === "number" && occupantAge >= TRISS_AGE_INDEX_CUTOFF;
    const survival = computeSurvivalVerdict(injuries, iss, ageAtLeast55);
    const systemicEffects = computeSystemicEffects(injuries, iss);
    const cost = computeMedicalCostEstimate(injuries);
    const recovery = computeRecoveryTimeEstimate(injuries);
    return { events: eventReports, iss, survival, systemicEffects, cost, recovery };
  }

  
  var ROOF_CONTACT_FLOOR_M = 0.08;
  var ROOF_HEAD_VELOCITY_BANDS_MS = [
    { aisLevel: 2, floorMs: 1.5, ceilingMs: 3 },
    { aisLevel: 3, floorMs: 3, ceilingMs: 5 },
    { aisLevel: 4, floorMs: 5.5, ceilingMs: 8 }
  ];
  var ROOF_NECK_VELOCITY_BANDS_MS = [
    { aisLevel: 2, floorMs: 2.5, ceilingMs: 4.5 },
    { aisLevel: 3, floorMs: 4.5, ceilingMs: 7 },
    { aisLevel: 4, floorMs: 7.5, ceilingMs: 10 }
  ];
  var DOOR_CONTACT_FLOOR_M = 0.1;
  var DOOR_CHEST_VELOCITY_BANDS_MS = [
    { aisLevel: 2, floorMs: 2, ceilingMs: 3.5 },
    { aisLevel: 3, floorMs: 3.5, ceilingMs: 5.5 },
    { aisLevel: 4, floorMs: 6, ceilingMs: 8.5 }
  ];
  var DOOR_PELVIS_VELOCITY_BANDS_MS = [
    { aisLevel: 2, floorMs: 2, ceilingMs: 3.5 },
    { aisLevel: 3, floorMs: 3.5, ceilingMs: 5.5 },
    { aisLevel: 4, floorMs: 6, ceilingMs: 8.5 }
  ];
  var DOOR_ABDOMEN_VELOCITY_BANDS_MS = [
    { aisLevel: 2, floorMs: 2.2, ceilingMs: 3.8 },
    { aisLevel: 3, floorMs: 3.8, ceilingMs: 6 },
    { aisLevel: 4, floorMs: 6.5, ceilingMs: 9 }
  ];
  var DASH_CONTACT_FLOOR_M = 0.06;
  var DASH_KNEE_VELOCITY_BANDS_MS = [
    { aisLevel: 2, floorMs: 1.8, ceilingMs: 3.2 },
    { aisLevel: 3, floorMs: 3.2, ceilingMs: 5 },
    { aisLevel: 4, floorMs: 5.5, ceilingMs: 8 }
  ];
  var DASH_FEMUR_VELOCITY_BANDS_MS = [
    { aisLevel: 2, floorMs: 2.5, ceilingMs: 4 },
    { aisLevel: 3, floorMs: 4, ceilingMs: 6 },
    { aisLevel: 4, floorMs: 6.5, ceilingMs: 9 }
  ];

  
  function regionDescriptions(part, sideLabel, mechanismLabel) {
    const noun = sideLabel ? `${sideLabel} ${part}` : `your ${part}`;
    const Noun = sideLabel ? `${sideLabel[0].toUpperCase()}${sideLabel.slice(1)} ${part}` : `${part[0].toUpperCase()}${part.slice(1)}`;
    return {
      2: {
        name: `${Noun} contact injury (${mechanismLabel}, minor)`,
        clinical: `Minor contact injury to the ${part}${sideLabel ? ` (${sideLabel})` : ""} from ${mechanismLabel} (AIS 2).`,
        plain: `Something in the car pushed into your ${noun.replace(/^your /, "")}.`
      },
      3: {
        name: `${Noun} contact injury (${mechanismLabel}, serious)`,
        clinical: `Serious contact injury to the ${part}${sideLabel ? ` (${sideLabel})` : ""} from ${mechanismLabel} (AIS 3).`,
        plain: `The car's structure crushed into your ${noun.replace(/^your /, "")}, hard.`
      },
      4: {
        name: `${Noun} contact injury (${mechanismLabel}, severe)`,
        clinical: `Severe contact injury to the ${part}${sideLabel ? ` (${sideLabel})` : ""} from ${mechanismLabel} (AIS 4).`,
        plain: `The car's structure was driven violently into your ${noun.replace(/^your /, "")}.`
      }
    };
  }
  function buildContactInjury(eventIndex, spec, sideLabel, mechanismLabel, bandTableName, zone, measurement, contactFloorM) {
    if (measurement.depthM < contactFloorM) return null;
    const level = selectAisLevel(spec.bands.map((b) => ({ aisLevel: b.aisLevel, probability: rampProbability(measurement.peakVelocityMs, b.floorMs, b.ceilingMs) })));
    if (level.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const desc = regionDescriptions(spec.part, sideLabel, mechanismLabel)[level.aisLevel];
    return {
      eventIndex,
      region: spec.region,
      aisSeverity: level.aisLevel,
      continuousSeverity: level.continuousSeverity,
      
      probability: level.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: `intrusion-${zone}-${spec.region}`,
      lowerFidelity: true,
      caveat: `LOWER FIDELITY: no criterion or published risk curve exists for structural-intrusion contact in this pipeline. This finding is derived only from measured ${zone} intrusion (depth ${measurement.depthM.toFixed(2)}m, peak velocity ${measurement.peakVelocityMs.toFixed(1)}m/s, both reported by the consuming mod's own vehicle-Lua node-displacement channel, not this library) against an UNVERIFIED engineering-heuristic contact-floor + velocity banding (see ${bandTableName} in constants.ts). Treat as directional/plausibility-level only, not a validated probability.`
    };
  }
  function computeZoneInjuries(eventIndex, impactSide, measurement) {
    const struckSide = impactSide === "left" || impactSide === "right" ? impactSide : null;
    if (measurement.zone === "roof") {
      return [
        buildContactInjury(eventIndex, { region: "head", part: "head", bands: ROOF_HEAD_VELOCITY_BANDS_MS }, null, "roof crush", "ROOF_HEAD_VELOCITY_BANDS_MS", "roof", measurement, ROOF_CONTACT_FLOOR_M),
        buildContactInjury(eventIndex, { region: "neck", part: "neck", bands: ROOF_NECK_VELOCITY_BANDS_MS }, null, "roof crush (axial neck loading)", "ROOF_NECK_VELOCITY_BANDS_MS", "roof", measurement, ROOF_CONTACT_FLOOR_M)
      ].filter((i) => i !== null);
    }
    if (measurement.zone === "door") {
      return [
        buildContactInjury(eventIndex, { region: "chest", part: "chest", bands: DOOR_CHEST_VELOCITY_BANDS_MS }, struckSide, "door intrusion", "DOOR_CHEST_VELOCITY_BANDS_MS", "door", measurement, DOOR_CONTACT_FLOOR_M),
        buildContactInjury(eventIndex, { region: "pelvis", part: "pelvis", bands: DOOR_PELVIS_VELOCITY_BANDS_MS }, struckSide, "door intrusion", "DOOR_PELVIS_VELOCITY_BANDS_MS", "door", measurement, DOOR_CONTACT_FLOOR_M),
        buildContactInjury(eventIndex, { region: "abdomen", part: "abdomen", bands: DOOR_ABDOMEN_VELOCITY_BANDS_MS }, struckSide, "door intrusion", "DOOR_ABDOMEN_VELOCITY_BANDS_MS", "door", measurement, DOOR_CONTACT_FLOOR_M)
      ].filter((i) => i !== null);
    }
    return [
      buildContactInjury(eventIndex, { region: "knee", part: "knee", bands: DASH_KNEE_VELOCITY_BANDS_MS }, null, "dash/footwell intrusion", "DASH_KNEE_VELOCITY_BANDS_MS", "dash", measurement, DASH_CONTACT_FLOOR_M),
      buildContactInjury(eventIndex, { region: "femur", part: "femur", bands: DASH_FEMUR_VELOCITY_BANDS_MS }, null, "dash/footwell intrusion", "DASH_FEMUR_VELOCITY_BANDS_MS", "dash", measurement, DASH_CONTACT_FLOOR_M)
    ].filter((i) => i !== null);
  }
  function computeIntrusionInjuriesForEvent(eventIndex, impactSide, measurements) {
    return measurements.flatMap((m) => computeZoneInjuries(eventIndex, impactSide, m));
  }

  
  function mergeIntrusionInjuries(inertialInjuries, intrusionInjuries) {
    const inertialByRegion = groupByRegion(inertialInjuries);
    const intrusionByRegion = groupByRegion(intrusionInjuries);
    const regions =  new Set([...inertialByRegion.keys(), ...intrusionByRegion.keys()]);
    const merged = [];
    for (const region of regions) {
      const inertialSet = inertialByRegion.get(region);
      const intrusionSet = intrusionByRegion.get(region);
      if (inertialSet && !intrusionSet) {
        merged.push(...inertialSet);
      } else if (intrusionSet && !inertialSet) {
        merged.push(...intrusionSet);
      } else if (inertialSet && intrusionSet) {
        merged.push(...worstSide(inertialSet) >= worstSide(intrusionSet) ? inertialSet : intrusionSet);
      }
    }
    return merged;
  }
  function groupByRegion(injuries) {
    const map =  new Map();
    for (const injury of injuries) {
      const existing = map.get(injury.region);
      if (existing) existing.push(injury);
      else map.set(injury.region, [injury]);
    }
    return map;
  }
  function worstSide(injuries) {
    let best = 0;
    for (const injury of injuries) {
      const score = injury.aisSeverity + injury.probability * 0.5;
      if (score > best) best = score;
    }
    return best;
  }
  return __toCommonJS(generated_entry_exports);
})();
