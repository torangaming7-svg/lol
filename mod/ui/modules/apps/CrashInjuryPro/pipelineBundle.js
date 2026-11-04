"use strict";
var CrashInjuryProPipeline = (() => {
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
    POSSIBLE_SUFFIX: () => POSSIBLE_SUFFIX,
    STANDARD_GRAVITY_M_S2: () => STANDARD_GRAVITY_M_S2,
    assertValidTrace: () => assertValidTrace,
    buildInjuryReport: () => buildInjuryReport,
    cfcLowpass: () => cfcLowpass,
    chestRisk: () => chestRisk,
    computeChest3ms: () => computeChest3ms,
    computeDrowningInjuries: () => computeDrowningInjuries,
    computeExposureInjuries: () => computeExposureInjuries,
    computeFemurLoad: () => computeFemurLoad,
    computeFireInjuries: () => computeFireInjuries,
    computeHIC15: () => computeHIC15,
    computeInjuries: () => computeInjuries,
    computeIntrusionInjuriesForEvent: () => computeIntrusionInjuriesForEvent,
    computeOccupantResponse: () => computeOccupantResponse,
    computeRolloverInjuries: () => computeRolloverInjuries,
    computeVerticalLoading: () => computeVerticalLoading,
    deltaVForEvent: () => deltaVForEvent,
    eventResponseWindow: () => eventResponseWindow,
    femurRisk: () => femurRisk,
    headRiskCumulativeNormal: () => headRiskCumulativeNormal,
    mergeIntrusionInjuries: () => mergeIntrusionInjuries,
    pdof: () => pdof,
    presentInjuryPlainLayer: () => presentInjuryPlainLayer,
    progressPatient: () => progressPatient,
    resolveRestraintConfig: () => resolveRestraintConfig,
    resultant: () => resultant,
    sampleInjuryScenario: () => sampleInjuryScenario,
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
    if (!(sampleRateHz > 0) || !Number.isFinite(sampleRateHz)) {
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
    for (let i = 0; i < n; i++) {
      if (![t[i], ax[i], ay[i], az[i]].every(Number.isFinite)) {
        throw new Error(`CrashTrace: non-finite sample at index ${i}`);
      }
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
      magnitudeMs: Math.sqrt(dvx * dvx + dvy * dvy),
      magnitudeWithVerticalMs: Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz)
    };
  }

  var IMPACT_SIDE_SECTOR_HALF_WIDTH_DEG = 22.5;
  function pdof(trace, event) {
    const { dvxMs, dvyMs } = deltaVForEvent(trace, event);
    if (dvxMs === 0 && dvyMs === 0) {
      return { pdofDeg: 0, impactSide: "oblique" };
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

  function eventResponseWindow(trace, event, tailS = 0.25) {
    assertValidTrace(trace);
    assertValidEvent(trace, event);
    if (!Number.isFinite(tailS) || tailS < 0) throw new Error("Response window: tail must be finite and nonnegative");
    const count = event.endIndex - event.startIndex + 1;
    const n = count + Math.ceil(tailS * trace.sampleRateHz);
    const t = new Float64Array(n);
    const ax = new Float64Array(n), ay = new Float64Array(n), az = new Float64Array(n);
    for (let i = 0; i < count; i++) {
      const source = event.startIndex + i;
      t[i] = trace.t[source];
      ax[i] = trace.ax[source];
      ay[i] = trace.ay[source];
      az[i] = trace.az[source];
    }
    for (let i = count; i < n; i++) t[i] = t[count - 1] + (i - count + 1) / trace.sampleRateHz;
    return {
      trace: { sampleRateHz: trace.sampleRateHz, t, ax, ay, az },
      event: { startIndex: 0, endIndex: n - 1, startTimeS: t[0], endTimeS: t[n - 1] }
    };
  }

  var SUBSTEP_STABILITY_MARGIN = 0.1;
  var YIELD_KNEE_FRACTION = 0.5;
  function restraintForceN(state, k, c, anchor, constantForceN, yieldForceN) {
    const raw = -k * (state.z - anchor) - c * state.zdot + constantForceN;
    if (!(yieldForceN < Number.POSITIVE_INFINITY)) return raw;
    const mag = Math.abs(raw);
    const knee = YIELD_KNEE_FRACTION * yieldForceN;
    if (mag <= knee) return raw;
    const excess = (mag - knee) / (yieldForceN - knee);
    return Math.sign(raw) * (knee + (yieldForceN - knee) * Math.tanh(excess));
  }
  function derivative(state, k, c, anchor, constantForceN, massKg, aVehicleSI, yieldForceN) {
    const zAccel = restraintForceN(state, k, c, anchor, constantForceN, yieldForceN) / massKg - aVehicleSI;
    return [state.zdot, zAccel];
  }
  function lerp(a, b, frac) {
    return a + (b - a) * frac;
  }
  function rk4Step(state, k, c, anchor, constantForceN, massKg, aV0, aV1, h, yieldForceN) {
    const aVMid = lerp(aV0, aV1, 0.5);
    const [k1z, k1v] = derivative(state, k, c, anchor, constantForceN, massKg, aV0, yieldForceN);
    const s2 = { z: state.z + h / 2 * k1z, zdot: state.zdot + h / 2 * k1v };
    const [k2z, k2v] = derivative(s2, k, c, anchor, constantForceN, massKg, aVMid, yieldForceN);
    const s3 = { z: state.z + h / 2 * k2z, zdot: state.zdot + h / 2 * k2v };
    const [k3z, k3v] = derivative(s3, k, c, anchor, constantForceN, massKg, aVMid, yieldForceN);
    const s4 = { z: state.z + h * k3z, zdot: state.zdot + h * k3v };
    const [k4z, k4v] = derivative(s4, k, c, anchor, constantForceN, massKg, aV1, yieldForceN);
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
    const yieldForceN = typeof params.bottomOutYieldForceN === "number" && params.bottomOutYieldForceN > 0 ? params.bottomOutYieldForceN : Number.POSITIVE_INFINITY;
    let state = { z: 0, zdot: 0 };
    let phase = "slack";
    let dir = 1;
    let phase2Anchor = 0;
    let phase3Anchor = 0;
    out[0] = 0;
    const occupantAccel = (s, k, c, activeAnchor, constantForceN, yf) => restraintForceN(s, k, c, activeAnchor, constantForceN, yf) / massKg;
    const isDeeplyYielding = (s, k, c, activeAnchor, constantForceN, yf) => yf < Number.POSITIVE_INFINITY && Math.abs(-k * (s.z - activeAnchor) - c * s.zdot + constantForceN) > 5 * yf;
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
      let yf = Number.POSITIVE_INFINITY;
      if (phase === "loadLimit") {
        constantForceN = -dir * params.loadLimiterForceN;
      } else if (phase === "bottomOut") {
        k = bottomOutStiffnessNPerM;
        c = bottomOutDampingNsPerM;
        activeAnchor = phase3Anchor;
        yf = yieldForceN;
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
          state = rk4Step(state, k, c, activeAnchor, constantForceN, massKg, subStart, subEnd, h, yf);
        }
        out[i + 1] = constantForceN / massKg;
        continue;
      }
      let substepIntegral = 0;
      let prevAccel = occupantAccel(state, k, c, activeAnchor, constantForceN, yf);
      let clampedThroughout = isDeeplyYielding(state, k, c, activeAnchor, constantForceN, yf);
      for (let s = 0; s < substeps; s++) {
        const subStart = lerp(aV0, aV1, s / substeps);
        const subEnd = lerp(aV0, aV1, (s + 1) / substeps);
        state = rk4Step(state, k, c, activeAnchor, constantForceN, massKg, subStart, subEnd, h, yf);
        const curAccel = occupantAccel(state, k, c, activeAnchor, constantForceN, yf);
        substepIntegral += 0.5 * (prevAccel + curAccel) * h;
        prevAccel = curAccel;
        clampedThroughout = clampedThroughout && isDeeplyYielding(state, k, c, activeAnchor, constantForceN, yf);
      }
      out[i + 1] = substepIntegral / dt;
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
  var BOTTOM_OUT_YIELD_FORCE_N = {
    head: 15500,
    chest: 28300,
    femur: 12e3
  };
  var RESTRAINT_PARAMS = {
    head: {
      beltedAirbag: { slackDistanceM: 0.05, loadLimiterForceN: 2173.5, rideDownBudgetM: 0.0198, bottomOutNaturalFrequencyRadS: 180, dampingRatio: 1 },

      beltedOnly: { slackDistanceM: 0.071, loadLimiterForceN: 1369.7, rideDownBudgetM: 0.0528, bottomOutNaturalFrequencyRadS: 80, dampingRatio: 1 },

      unbelted: { slackDistanceM: 0.2289, loadLimiterForceN: 2313.5, rideDownBudgetM: 0.0616, bottomOutNaturalFrequencyRadS: 70, dampingRatio: 1.1 }
    },
    chest: {
      beltedAirbag: { slackDistanceM: 0.03, loadLimiterForceN: 5067.9, rideDownBudgetM: 0.0607, bottomOutNaturalFrequencyRadS: 80, dampingRatio: 1 },

      beltedOnly: { slackDistanceM: 0.05, loadLimiterForceN: 6384.1, rideDownBudgetM: 0.0528, bottomOutNaturalFrequencyRadS: 120, dampingRatio: 1 },

      unbelted: { slackDistanceM: 0.2488, loadLimiterForceN: 14012.8, rideDownBudgetM: 0.0983, bottomOutNaturalFrequencyRadS: 70, dampingRatio: 1.2 }
    },

    femur: {
      beltedAirbag: { slackDistanceM: 0.1, loadLimiterForceN: 3e3, rideDownBudgetM: 0.3734, bottomOutNaturalFrequencyRadS: 350, dampingRatio: 1 },

      beltedOnly: { slackDistanceM: 0.1, loadLimiterForceN: 3e3, rideDownBudgetM: 0.3734, bottomOutNaturalFrequencyRadS: 350, dampingRatio: 1 },

      unbelted: { slackDistanceM: 0.35, loadLimiterForceN: 3e3, rideDownBudgetM: 0.11, bottomOutNaturalFrequencyRadS: 300, dampingRatio: 1.1 }
    }
  };
  function getRestraintParams(region, config) {
    const cell = RESTRAINT_PARAMS[region][config];
    if (typeof cell.bottomOutYieldForceN === "number") return cell;
    return { ...cell, bottomOutYieldForceN: BOTTOM_OUT_YIELD_FORCE_N[region] };
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
      femur: computeFemurRegion(trace, event, occupant, restraintConfig, measured.femur),

      seatVerticalG: trace.az.slice(event.startIndex, event.endIndex + 1)
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
    const x = gToSI(trace.ax, startIndex, len);
    const z = gToSI(trace.az, startIndex, len);
    const rearwardContact = x.reduce((sum, a) => sum + a, 0) > 0;
    const axSI = simulateLumpedMassAxis(
      x,
      tEvent,
      massKg,
      rearwardContact ? nonFrontalParams(region, restraintConfig, "rear") : params
    );
    const aySI = simulateLumpedMassAxis(
      gToSI(trace.ay, startIndex, len),
      tEvent,
      massKg,
      nonFrontalParams(region, restraintConfig, "side")
    );
    const azSI = simulateLumpedMassAxis(
      z,
      tEvent,
      massKg,
      nonFrontalParams(region, restraintConfig, z.reduce((sum, a) => sum + a, 0) >= 0 ? "bottom" : "roof")
    );
    return {
      ax: siToG(axSI),
      ay: siToG(aySI),
      az: siToG(azSI),
      measured: false
    };
  }
  function nonFrontalParams(region, config, side) {
    const contactConfig = side === "rear" || side === "bottom" ? "beltedOnly" : config === "unbelted" ? "unbelted" : "beltedOnly";
    const base = getRestraintParams(region, contactConfig);
    if (side === "roof" && region === "head" && config === "unbelted") {
      return {
        ...base,
        slackDistanceM: 0.1,
        rideDownBudgetM: 0.02,
        bottomOutNaturalFrequencyRadS: 140
      };
    }
    return side === "rear" || side === "bottom" ? { ...base, slackDistanceM: 0 } : base;
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
    const azSI = new Float64Array(len);
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

  var VERTICAL_RESPONSE_FREQUENCY_RAD_S = 52.9;
  var VERTICAL_RESPONSE_DAMPING_RATIO = 0.224;
  var VERTICAL_LOADING_CAVEAT = "LOWER FIDELITY: NASA/Brinkley vertical dynamic-response math applied to a chassis-at-seat proxy, not measured pelvis acceleration. Seat compliance, posture and local contact are unmeasured. The index is not a validated automotive AIS or mortality probability; roof contact also requires intrusion assessment.";
  function computeVerticalLoading(seatVerticalG, timeS) {
    if (seatVerticalG.length !== timeS.length || !timeS.length) throw new Error("Vertical loading: invalid channel lengths");
    const w = VERTICAL_RESPONSE_FREQUENCY_RAD_S;
    const d = 2 * VERTICAL_RESPONSE_DAMPING_RATIO * w;
    let q = 0, v = 0, compressionIndex = 0, extensionIndex = 0;
    for (let i = 0; i < timeS.length; i++) {
      if (!Number.isFinite(seatVerticalG[i]) || !Number.isFinite(timeS[i])) throw new Error("Vertical loading: non-finite sample");
      if (!i) continue;
      const dt = timeS[i] - timeS[i - 1];
      if (!(dt > 0)) throw new Error("Vertical loading: time must increase");
      const steps = Math.max(1, Math.ceil(dt * w / 0.1));
      const h = dt / steps;
      for (let j = 0; j < steps; j++) {
        const a0 = (seatVerticalG[i - 1] + (seatVerticalG[i] - seatVerticalG[i - 1]) * j / steps) * STANDARD_GRAVITY_M_S2;
        const a1 = (seatVerticalG[i - 1] + (seatVerticalG[i] - seatVerticalG[i - 1]) * (j + 1) / steps) * STANDARD_GRAVITY_M_S2;
        const am = (a0 + a1) / 2;
        const k1q = v, k1v = a0 - d * v - w * w * q;
        const k2q = v + h * k1v / 2, k2v = am - d * k2q - w * w * (q + h * k1q / 2);
        const k3q = v + h * k2v / 2, k3v = am - d * k3q - w * w * (q + h * k2q / 2);
        const k4q = v + h * k3v, k4v = a1 - d * k4q - w * w * (q + h * k3q);
        q += h * (k1q + 2 * k2q + 2 * k3q + k4q) / 6;
        v += h * (k1v + 2 * k2v + 2 * k3v + k4v) / 6;
        const index = w * w * q / STANDARD_GRAVITY_M_S2;
        compressionIndex = Math.max(compressionIndex, index);
        extensionIndex = Math.max(extensionIndex, -index);
      }
    }
    return { compressionIndex, extensionIndex, caveat: VERTICAL_LOADING_CAVEAT };
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
  var HEAD_AIS6_ESCALATION_PROBABILITY = 0.97;
  var CHEST_AIS5_ESCALATION_PROBABILITY = 0.95;
  var SKULL_FRACTURE_VARIANT_PROBABILITY_BREAKPOINTS = [0.4, 0.75];
  var ABDOMEN_DELTAV_BANDS_MS = [
    { aisLevel: 2, floorMs: 4, ceilingMs: 10, maxProbability: 0.5 },
    { aisLevel: 3, floorMs: 8, ceilingMs: 16, maxProbability: 0.24 },
    { aisLevel: 4, floorMs: 14, ceilingMs: 22, maxProbability: 0.1 }
  ];
  var ABDOMEN_FRONTAL_DELTAV_BANDS_MS = [
    { aisLevel: 2, floorMs: 12, ceilingMs: 20, maxProbability: 0.35 },
    { aisLevel: 3, floorMs: 18, ceilingMs: 28, maxProbability: 0.15 },
    { aisLevel: 4, floorMs: 26, ceilingMs: 36, maxProbability: 0.06 }
  ];
  var NECK_DELTAV_BANDS_MS = [

    { aisLevel: 1, floorMs: 2.5, ceilingMs: 9, maxProbability: 0.72 },
    { aisLevel: 2, floorMs: 11, ceilingMs: 21, maxProbability: 0.25 },

    { aisLevel: 3, floorMs: 18, ceilingMs: 28, maxProbability: 0.18 },
    { aisLevel: 4, floorMs: 26, ceilingMs: 36, maxProbability: 0.04 }
  ];
  var AORTA_DELTAV_BANDS_MS = [
    { aisLevel: 4, floorMs: 14, ceilingMs: 34, maxProbability: 0.22 },
    { aisLevel: 6, floorMs: 22, ceilingMs: 40, maxProbability: 0.12 }
  ];
  var AORTA_DELTAV_BANDS_NON_FRONTAL_MS = [

    { aisLevel: 4, floorMs: 20, ceilingMs: 42, maxProbability: 0.22 },
    { aisLevel: 6, floorMs: 30, ceilingMs: 48, maxProbability: 0.12 }
  ];
  var KIDNEY_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 6, ceilingMs: 14, maxProbability: 0.28 },
    { aisLevel: 3, floorMs: 12, ceilingMs: 20, maxProbability: 0.12 },
    { aisLevel: 4, floorMs: 18, ceilingMs: 26, maxProbability: 0.05 }
  ];
  var KIDNEY_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 16, ceilingMs: 24, maxProbability: 0.14 },
    { aisLevel: 3, floorMs: 22, ceilingMs: 32, maxProbability: 0.06 },
    { aisLevel: 4, floorMs: 30, ceilingMs: 40, maxProbability: 0.02 }
  ];
  var BOWEL_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 14, ceilingMs: 22, maxProbability: 0.16 },
    { aisLevel: 3, floorMs: 20, ceilingMs: 30, maxProbability: 0.07 },
    { aisLevel: 4, floorMs: 28, ceilingMs: 38, maxProbability: 0.025 }
  ];
  var PANCREAS_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 3, floorMs: 26, ceilingMs: 36, maxProbability: 0.06 },
    { aisLevel: 4, floorMs: 34, ceilingMs: 44, maxProbability: 0.02 }
  ];
  var DIAPHRAGM_RUPTURE_MIN_DELTAV_MS = 20;
  var PELVIS_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 8, ceilingMs: 16, maxProbability: 0.45 },
    { aisLevel: 3, floorMs: 14, ceilingMs: 22, maxProbability: 0.2 },
    { aisLevel: 4, floorMs: 20, ceilingMs: 30, maxProbability: 0.08 }
  ];
  var PELVIS_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 20, ceilingMs: 30, maxProbability: 0.22 },
    { aisLevel: 3, floorMs: 28, ceilingMs: 38, maxProbability: 0.09 },
    { aisLevel: 4, floorMs: 36, ceilingMs: 46, maxProbability: 0.03 }
  ];
  var FACIAL_FRACTURE_VARIANT_PROBABILITY_BREAKPOINT = 0.5;
  var DENTAL_INJURY_INCLUSION_PROBABILITY_THRESHOLD = 0.02;
  var SCALP_LACERATION_INCLUSION_PROBABILITY_THRESHOLD = 0.01;
  var ABDOMEN_ORGAN_AIS4_VARIANT_PROBABILITY_BREAKPOINT = 0.6;
  var CHEST_AIS2_VARIANT_PROBABILITY_BREAKPOINT = 0.4;
  var CLAVICLE_FRACTURE_MIN_CHEST_AIS = 2;
  var THORACIC_SPINE_DELTAV_BANDS_MS = [
    { aisLevel: 2, floorMs: 14, ceilingMs: 22, maxProbability: 0.28 },
    { aisLevel: 3, floorMs: 20, ceilingMs: 30, maxProbability: 0.11 },
    { aisLevel: 4, floorMs: 28, ceilingMs: 34, maxProbability: 0.04 }
  ];
  var LUMBAR_SPINE_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 15, ceilingMs: 23, maxProbability: 0.28 },
    { aisLevel: 3, floorMs: 21, ceilingMs: 31, maxProbability: 0.11 },
    { aisLevel: 4, floorMs: 29, ceilingMs: 39, maxProbability: 0.04 }
  ];
  var UPPER_ARM_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 14, ceilingMs: 24, maxProbability: 0.3 },
    { aisLevel: 3, floorMs: 22, ceilingMs: 34, maxProbability: 0.1 },
    { aisLevel: 4, floorMs: 50, ceilingMs: 62, maxProbability: 0.03 }
  ];
  var FOREARM_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 11, ceilingMs: 20, maxProbability: 0.4 },
    { aisLevel: 3, floorMs: 18, ceilingMs: 28, maxProbability: 0.14 },
    { aisLevel: 4, floorMs: 46, ceilingMs: 58, maxProbability: 0.04 }
  ];
  var WRIST_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 9, ceilingMs: 17, maxProbability: 0.35 },
    { aisLevel: 3, floorMs: 15, ceilingMs: 24, maxProbability: 0.12 },
    { aisLevel: 4, floorMs: 42, ceilingMs: 54, maxProbability: 0.03 }
  ];
  var HAND_DELTAV_BANDS_LATERAL_MS = [
    { aisLevel: 2, floorMs: 7, ceilingMs: 14, maxProbability: 0.35 },
    { aisLevel: 3, floorMs: 12, ceilingMs: 20, maxProbability: 0.12 },
    { aisLevel: 4, floorMs: 38, ceilingMs: 50, maxProbability: 0.03 }
  ];
  var FRONTAL_ARM_OFFSET_MS = 6;
  function frontalArmBands(lateral) {
    return lateral.map((b) => ({
      aisLevel: b.aisLevel,
      floorMs: b.floorMs + FRONTAL_ARM_OFFSET_MS,
      ceilingMs: b.ceilingMs + FRONTAL_ARM_OFFSET_MS,
      ...b.maxProbability === void 0 ? {} : { maxProbability: b.maxProbability }
    }));
  }
  var UPPER_ARM_DELTAV_BANDS_FRONTAL_MS = frontalArmBands(UPPER_ARM_DELTAV_BANDS_LATERAL_MS);
  var FOREARM_DELTAV_BANDS_FRONTAL_MS = frontalArmBands(FOREARM_DELTAV_BANDS_LATERAL_MS);
  var WRIST_DELTAV_BANDS_FRONTAL_MS = frontalArmBands(WRIST_DELTAV_BANDS_LATERAL_MS);
  var HAND_DELTAV_BANDS_FRONTAL_MS = frontalArmBands(HAND_DELTAV_BANDS_LATERAL_MS);
  var LOWER_LEG_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 19, ceilingMs: 29, maxProbability: 0.55 },
    { aisLevel: 3, floorMs: 27, ceilingMs: 39, maxProbability: 0.22 },
    { aisLevel: 4, floorMs: 46, ceilingMs: 58, maxProbability: 0.07 }
  ];
  var ANKLE_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 15, ceilingMs: 23, maxProbability: 0.35 },
    { aisLevel: 3, floorMs: 22, ceilingMs: 32, maxProbability: 0.12 },
    { aisLevel: 4, floorMs: 42, ceilingMs: 54, maxProbability: 0.04 }
  ];
  var FOOT_DELTAV_BANDS_FRONTAL_MS = [
    { aisLevel: 2, floorMs: 13, ceilingMs: 20, maxProbability: 0.35 },
    { aisLevel: 3, floorMs: 19, ceilingMs: 28, maxProbability: 0.12 },
    { aisLevel: 4, floorMs: 38, ceilingMs: 50, maxProbability: 0.04 }
  ];
  var RESTRAINT_DELTAV_RIDEDOWN = Object.freeze({
    beltedAirbag: 0.8,
    beltedOnly: 0.86,
    unbelted: 1.18
  });

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
    var _a, _b;
    const raw = bands.map((b) => ({
      aisLevel: b.aisLevel,
      probability: rampProbability(deltaVMs, b.floorMs, b.ceilingMs)
    }));
    const selectedLevel = selectAisLevel(raw).aisLevel;
    const capped = bands.map((b) => {
      var _a2;
      return {
        aisLevel: b.aisLevel,
        probability: rampProbability(deltaVMs, b.floorMs, b.ceilingMs) * ((_a2 = b.maxProbability) != null ? _a2 : 1)
      };
    });
    const ordered = [...capped].sort((a, b) => b.aisLevel - a.aisLevel);
    const chosen = (_a = capped.find((l) => l.aisLevel === selectedLevel)) != null ? _a : capped[0];
    const selected = chosen.probability >= INJURY_INCLUSION_PROBABILITY_THRESHOLD ? chosen : (_b = ordered.find((l) => l.aisLevel <= selectedLevel && l.probability >= INJURY_INCLUSION_PROBABILITY_THRESHOLD)) != null ? _b : chosen;
    return { ...selected, continuousSeverity: expectedAisSeverity(capped) };
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

  var COMPRESSION_REFERENCE = { low: 15.2, high: 22.8 };
  var SEVERITY_MULTIPLIERS = [1, 1.5, 2, 3, 4.2];
  function verticalCompressionInjuries(eventIndex, loading, restraint = "beltedAirbag") {
    const effectiveIndex = loading.compressionIndex * RESTRAINT_DELTAV_RIDEDOWN[restraint];
    const selected = selectAisLevel(SEVERITY_MULTIPLIERS.map((factor, i) => ({
      aisLevel: i + 2,
      probability: rampProbability(effectiveIndex, COMPRESSION_REFERENCE.low * factor, COMPRESSION_REFERENCE.high * factor)
    })));
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return [];
    const descriptions = {
      2: ["Vertebral compression fracture", "A bone in your lower spine is compressed and fractured."],
      3: ["Vertebral burst fracture", "Your lower spine is badly fractured."],
      4: ["Vertebral fracture with cord involvement", "Your spine is broken, and the nerves may be damaged."],
      5: ["Thoracolumbar spinal disruption", "Your spine was crushed by the landing -- this is a life-threatening injury."],
      6: ["Axial crush injury of the torso", "The landing crushed you into the seat -- nobody survives an impact like this one."]
    };
    const level = selected.aisLevel;
    const description = descriptions[level];
    return [{
      eventIndex,
      region: "lumbarSpine",
      aisSeverity: level,
      continuousSeverity: selected.continuousSeverity,
      probability: selected.probability,
      name: description[0],
      plainDescription: description[1],
      clinicalDescription: "Thoracolumbar axial-compression injury candidate from upward seat loading; neurologic involvement is not measured.",
      mechanism: "vertical-seat-spinal-compression",
      lowerFidelity: true,
      caveat: loading.caveat + " UNVERIFIED: the named injury, AIS tier and probability use an engineering severity ramp, not a published spinal risk curve."
    }];
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
    },
    6: {
      name: "Massive craniocerebral disruption",
      clinical: "Massive craniocerebral injury with brainstem involvement -- non-survivable by AIS definition (AIS 6). Reached only at head loading far outside any survivable range; see HEAD_AIS6_ESCALATION_PROBABILITY.",
      plain: "The impact to your head was far beyond what a person can survive."
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
    const escalated6 = selected.aisLevel === 4 && selected.probability >= HEAD_AIS6_ESCALATION_PROBABILITY;
    const aisLevel = escalated6 ? 6 : escalated ? 5 : selected.aisLevel;
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
    },
    5: {
      name: "Bilateral flail chest with massive haemothorax",
      clinical: "Bilateral flail chest with massive haemothorax and pulmonary laceration (AIS 5). Reached only at a 3 ms clip far above the cited 60 g / 20% AIS4 anchor; see CHEST_AIS5_ESCALATION_PROBABILITY.",
      plain: "Your chest was crushed -- both sides of your ribcage are broken and your chest is filling with blood."
    }
  };
  function chestInjury(eventIndex, risks) {
    var _a;
    const chestRisks = risks.filter((r) => r.region === "chest");
    if (chestRisks.length === 0) return null;
    const selected = selectAisLevel(chestRisks.map((r) => ({ aisLevel: r.aisLevel, probability: r.probability })));
    if (selected.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const source = (_a = chestRisks.find((r) => r.aisLevel === selected.aisLevel)) != null ? _a : chestRisks[0];
    const escalated5 = selected.aisLevel === 4 && selected.probability >= CHEST_AIS5_ESCALATION_PROBABILITY;
    const aisLevel = escalated5 ? 5 : selected.aisLevel;
    const desc = aisLevel === 2 ? selectDeterministicVariant(selected.probability, [CHEST_AIS2_VARIANT_PROBABILITY_BREAKPOINT], CHEST_AIS2_VARIANTS) : CHEST_DESCRIPTIONS_3_4[aisLevel];
    if (!desc) throw new Error(`Missing authored chest description for AIS ${aisLevel}`);
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
    1: {
      name: "Whiplash (cervical strain)",
      clinical: "Cervical acceleration/deceleration soft-tissue injury without structural involvement (AIS 1).",
      plain: "Your neck was snapped back and forth -- it is going to be stiff and painful for weeks."
    },
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
    var _a;
    const { eventIndex, impactSide, deltaV, risks } = input;
    const tier = (_a = input.restraint) != null ? _a : "beltedAirbag";
    const rideDown = RESTRAINT_DELTAV_RIDEDOWN[impactSide !== "front" && tier === "beltedAirbag" ? "beltedOnly" : tier];
    const verticalDominant = Math.abs(deltaV.dvzMs) > deltaV.magnitudeMs;
    const verticalWeight = input.verticalLoading ? rampProbability(Math.max(input.verticalLoading.compressionIndex, input.verticalLoading.extensionIndex), 15.2, 22.8) : 1;
    const effectiveMagnitudeMs = verticalDominant ? Math.hypot(deltaV.magnitudeMs, deltaV.dvzMs * verticalWeight) : deltaV.magnitudeMs;
    const occupantDeltaV = {
      dvxMs: deltaV.dvxMs * rideDown,
      dvyMs: deltaV.dvyMs * rideDown,
      dvzMs: deltaV.dvzMs * rideDown,
      magnitudeMs: effectiveMagnitudeMs * rideDown,
      magnitudeWithVerticalMs: deltaV.magnitudeWithVerticalMs * rideDown
    };
    const primaryCandidates = [
      skullFractureInjury(eventIndex, risks),
      brainInjury(eventIndex, risks),
      facialFractureInjury(eventIndex, risks),
      dentalInjury(eventIndex, risks),
      scalpLacerationInjury(eventIndex, risks),
      chestInjury(eventIndex, risks),
      clavicleInjury(eventIndex, risks),
      femurInjury(eventIndex, risks),
      abdomenInjury(eventIndex, impactSide, occupantDeltaV),
      neckInjury(eventIndex, impactSide, occupantDeltaV),
      aortaInjury(eventIndex, impactSide, occupantDeltaV),
      pelvisInjury(eventIndex, impactSide, occupantDeltaV),
      thoracicSpineInjury(eventIndex, impactSide, occupantDeltaV),
      lumbarSpineInjury(eventIndex, impactSide, occupantDeltaV),
      kidneyInjury(eventIndex, impactSide, occupantDeltaV),
      bowelInjury(eventIndex, impactSide, occupantDeltaV),
      pancreasInjury(eventIndex, impactSide, occupantDeltaV),
      upperArmInjury(eventIndex, impactSide, occupantDeltaV),
      forearmInjury(eventIndex, impactSide, occupantDeltaV),
      wristInjury(eventIndex, impactSide, occupantDeltaV),
      handInjury(eventIndex, impactSide, occupantDeltaV),
      lowerLegInjury(eventIndex, impactSide, occupantDeltaV),
      ankleInjury(eventIndex, impactSide, occupantDeltaV),
      footInjury(eventIndex, impactSide, occupantDeltaV)
    ];
    const primaryInjuries = primaryCandidates.filter((injury) => injury !== null);
    if (input.verticalLoading) primaryInjuries.push(...verticalCompressionInjuries(eventIndex, input.verticalLoading, tier));
    const derivedCandidates = [
      lungInjury(eventIndex, primaryInjuries),
      diaphragmInjury(eventIndex, primaryInjuries, occupantDeltaV)
    ];
    const derivedInjuries = derivedCandidates.filter((injury) => injury !== null);
    return [...primaryInjuries, ...derivedInjuries, ...haemorrhageInjuries(eventIndex, primaryInjuries)];
  }
  function computeInjuries(events) {
    return events.flatMap(computeInjuriesForEvent);
  }

  function scenarioDraw(seed, key) {
    let h = (2166136261 ^ seed) >>> 0;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    h ^= h >>> 16;
    h = Math.imul(h, 2146121005);
    h ^= h >>> 15;
    h = Math.imul(h, 2221713035);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  var SCENARIO_SHARED_DRAW_FRACTION = 0.6;
  var SCENARIO_CERTAIN_SELECTION_PROBABILITY = 0.5;
  function sampleInjuryScenario(candidates, seed) {
    if (!Number.isInteger(seed)) throw new Error("Scenario seed must be an integer");
    const selected = candidates.filter((i) => !i.mechanism.startsWith("haemorrhage-from-")).filter((i) => {
      if (!Number.isFinite(i.probability) || i.probability < 0 || i.probability > 1) throw new Error("Invalid injury probability");
      let key = i.mechanism.startsWith("rollover-ejection-") ? "rollover-ejection" : i.mechanism + ":" + i.region;
      if (i.mechanism === "secondary-to-rib-fracture" || i.mechanism === "blowout-diaphragm") {
        const parent = candidates.find((p) => p.eventIndex === i.eventIndex && p.aisSeverity >= 3 && (i.mechanism === "secondary-to-rib-fracture" ? p.mechanism === "blunt-chest-loading" : p.region === "abdomen"));
        if (!parent) return false;
        key = parent.mechanism + ":" + parent.region;
      }
      if (i.probability >= SCENARIO_CERTAIN_SELECTION_PROBABILITY) return true;
      const shared = scenarioDraw(seed, "mix:" + key) < SCENARIO_SHARED_DRAW_FRACTION;
      const u = shared ? scenarioDraw(seed, "event-severity:" + i.eventIndex) : scenarioDraw(seed, key);
      return u < i.probability;
    }).map((i) => ({
      ...i,
      scenarioSelected: true,
      continuousSeverity: i.aisSeverity,
      caveat: i.caveat + " Simulated scenario outcome; original candidate probability retained. Joint injury sampling is UNVERIFIED."
    }));
    const events = new Set(selected.map((i) => i.eventIndex));
    return selected.concat([...events].flatMap((eventIndex) => haemorrhageInjuries(eventIndex, selected)));
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
  var POSSIBLE_PROBABILITY_THRESHOLD = 0.5;
  var POSSIBLE_SUFFIX = " (possible)";
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
  var RTS_PROXY_BY_CONTINUOUS_ISS = Object.freeze([
    Object.freeze({ continuousIss: 0, proxyRts: 7.8408 }),
    Object.freeze({ continuousIss: 9, proxyRts: 6.3 }),
    Object.freeze({ continuousIss: 16, proxyRts: 5.612 }),
    Object.freeze({ continuousIss: 25, proxyRts: 4.88 }),
    Object.freeze({ continuousIss: 41, proxyRts: 4.88 }),
    Object.freeze({ continuousIss: 50, proxyRts: 4.58 }),
    Object.freeze({ continuousIss: 60, proxyRts: 4.58 }),
    Object.freeze({ continuousIss: 75, proxyRts: 4.003 })
  ]);
  var RTS_CONSCIOUSNESS_TO_GCS_CODED = Object.freeze({
    alert: 4,
    confused: 3,
    unresponsive: 1
  });
  var RTS_SHOCK_TO_SBP_CODED = Object.freeze({
    none: 4,
    early: 3,
    decompensated: 2
  });
  var RTS_BREATHING_TO_RR_CODED = Object.freeze({
    normal: 4,
    laboured: 3
  });
  var TRISS_AGE_INDEX_CUTOFF = 55;
  var SURVIVAL_CEILING_CONTROL_POINTS = [
    { severity: 1, ceilingPercent: 100 },

    { severity: 2, ceilingPercent: 97 },

    { severity: 3, ceilingPercent: 90 },

    { severity: 4, ceilingPercent: 70 },

    { severity: 5, ceilingPercent: 40 },

    { severity: 6, ceilingPercent: 5 }

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
    const anatomicSeverities = injuries.filter((injury) => injury.region !== "circulatory").map((injury) => injury.aisSeverity).sort((a, b) => b - a);
    const computedNiss = anatomicSeverities.slice(0, 3).reduce((sum, ais) => sum + ais * ais, 0);
    const niss = ais6Override ? 75 : computedNiss;
    return {
      iss,
      niss,
      isMajorTrauma: iss >= ISS_MAJOR_TRAUMA_THRESHOLD,
      regionSeverities,
      contributingRegions,
      ais6Override
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
    const labouredChest = injuries.some((i) => i.region === "chest" && i.aisSeverity >= 4);
    const labouredAirway = injuries.some((i) => i.region === "lung" && i.aisSeverity >= 2);
    return labouredChest || labouredAirway ? "laboured" : "normal";
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

  function worstAis(injuries, regions) {
    let w = 0;
    for (const i of injuries) if (regions.indexOf(i.region) !== -1 && i.aisSeverity > w) w = i.aisSeverity;
    return w;
  }
  function computeSystemicEffects(injuries, iss) {
    const bloodLoss = bloodLossLevel(injuries);
    let shock = shockLevel(iss, bloodLoss);
    const truncal = worstAis(injuries, ["chest", "abdomen", "pelvis", "femur", "lung", "kidney", "aorta", "diaphragm", "pancreas", "bowel"]);
    if (shock === "none" && truncal >= 3) shock = "early";
    let consciousness = consciousnessLevel(iss, shock);
    const head = worstAis(injuries, ["head"]);
    const cRank = { alert: 0, confused: 1, unresponsive: 2 };
    const headC = head >= 4 || iss.iss >= 45 ? "unresponsive" : head >= 2 ? "confused" : "alert";
    if (cRank[headC] > cRank[consciousness]) consciousness = headC;
    let breathing = breathingStatus(injuries);
    if (worstAis(injuries, ["chest"]) >= 3) breathing = "laboured";
    const pain = painLevel(injuries);
    const vision = visionStatus(injuries);
    const hearing = hearingStatus(injuries);
    let mobility = mobilityStatus(injuries);
    const mRank = { normal: 0, limited: 1, unable: 2 };
    const spine = worstAis(injuries, ["thoracicSpine", "lumbarSpine"]);
    const neck = worstAis(injuries, ["neck"]);
    const lowerLimb = worstAis(injuries, ["lowerLeg", "ankle", "foot"]);
    let mFloor = "normal";
    if (spine >= 2 || neck >= 3 || worstAis(injuries, ["pelvis"]) >= 2 || worstAis(injuries, ["femur"]) >= 2 || lowerLimb >= 3 || head >= 3) mFloor = "unable";
    else if (lowerLimb >= 2 || worstAis(injuries, ["knee"]) >= 2 || head >= 2 || neck >= 2) mFloor = "limited";
    if (mRank[mFloor] > mRank[mobility]) mobility = mFloor;
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

  var SURVIVAL_PROBABILITY_CAVEAT = "UNVERIFIED, simplified: a reduced TRISS (Trauma and Injury Severity Score) calculation -- Boyd et al. 1987 / Schluter 2011's published logistic-regression method, using this crash's occupant age and a CONTINUOUS severity figure (Round 14: derived from the same P(AIS>=n) risk curves ISS itself is built from, not the discretised, integer ISS shown elsewhere in this report -- this keeps the percentage smooth across an AIS boundary instead of stepping with it), with the Revised Trauma Score (RTS) component now a PROXY derived from this pipeline's own systemicEffects (consciousness/shock/breathing bridged onto RTS's real GCS/blood-pressure/respiratory-rate coded scale, Round 16 item C.4 -- see constants.ts's RTS_CONSCIOUSNESS_TO_GCS_CODED etc. for the bridge tables, UNVERIFIED and independent of the RTS weights themselves, which ARE cited) rather than held at its maximum. Still not a measured, patient-specific vitals reading -- this pipeline has no GCS/blood-pressure/respiratory-rate simulation, only a qualitative bridge from ISS-derived state -- so this remains an approximation, just one that now responds to how severe the crash's OWN computed systemic state reads instead of assuming best-case vitals unconditionally. A smoothly-ramped, authored ceiling (see constants.ts's SURVIVAL_CEILING_CONTROL_POINTS) applies across the WHOLE severity range, not just the most severe findings -- even with the proxy RTS above, a single very severe finding on an otherwise-normal systemic-state crash can still leave the raw TRISS curve well above what that finding alone should read as, which would badly understate how serious a moderate-to-severe finding actually is.";
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
  function computeContinuousProxyRts(continuousIss) {
    const table = RTS_PROXY_BY_CONTINUOUS_ISS;
    const first = table[0];
    const last = table[table.length - 1];
    if (continuousIss <= first.continuousIss) return first.proxyRts;
    if (continuousIss >= last.continuousIss) return last.proxyRts;
    for (let i = 0; i < table.length - 1; i++) {
      const a = table[i];
      const b = table[i + 1];
      if (continuousIss >= a.continuousIss && continuousIss <= b.continuousIss) {
        const t = (continuousIss - a.continuousIss) / (b.continuousIss - a.continuousIss);
        return a.proxyRts + t * (b.proxyRts - a.proxyRts);
      }
    }
    return last.proxyRts;
  }
  function computeSurvivalProbability(injuries, iss, ageAtLeast55 = false) {
    const ageIndex = ageAtLeast55 ? 1 : 0;
    const continuousIss = computeContinuousIss(injuries);
    const proxyRts = computeContinuousProxyRts(continuousIss);
    const { b0, b1, b2, b3 } = TRISS_BLUNT_COEFFICIENTS;
    const b = b0 + b1 * proxyRts + b2 * continuousIss + b3 * ageIndex;
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
    critical: "These injuries are critical -- survival requires immediate medical attention.",
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

  function presentInjuryPlainLayer(injury) {
    if (injury.scenarioSelected) return injury.plainDescription + " (simulated)";
    if (injury.lowerFidelity) {
      return injury.plainDescription + LOWER_FIDELITY_SUFFIX;
    }
    if (injury.probability >= NEAR_CERTAIN_PROBABILITY_THRESHOLD) {
      return injury.plainDescription;
    }
    if (injury.probability >= POSSIBLE_PROBABILITY_THRESHOLD) {
      return injury.plainDescription + HEDGE_SUFFIX;
    }
    return injury.plainDescription + POSSIBLE_SUFFIX;
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

  var BLOOD_VOLUME_M3_PER_KG = 7e-5;
  var BLEED_M3_PER_S = {
    aorta: 12e-6,
    abdomen: 4e-6,
    pelvis: 4e-6,
    kidney: 15e-7,
    femur: 1e-6,
    external: 1e-7,
    lungSerious: 12e-7,
    organMinor: 3e-7
  };
  var TERMINAL_LOSS_FRACTION = 0.6;
  function estimateBleedingRateM3S(injuries, externalControlled = false) {
    var _a;
    const sources =  new Map();
    for (const i of injuries) {
      if (/^(fire-|drowning-|haemorrhage-)/.test(i.mechanism) || i.region === "circulatory") continue;
      let rate = 0;
      if (i.region === "aorta") rate = BLEED_M3_PER_S.aorta;
      else if (i.region === "abdomen" && i.aisSeverity >= 3) rate = BLEED_M3_PER_S.abdomen;
      else if (i.region === "pelvis" && i.aisSeverity >= 3) rate = BLEED_M3_PER_S.pelvis;
      else if (i.region === "kidney" && i.aisSeverity >= 3) rate = BLEED_M3_PER_S.kidney;
      else if (i.region === "femur" && i.aisSeverity >= 3) rate = BLEED_M3_PER_S.femur;
      else if (/laceration/i.test(i.name) && !externalControlled) rate = BLEED_M3_PER_S.external;

      else if (i.region === "lung" && i.aisSeverity >= 3) rate = BLEED_M3_PER_S.lungSerious;
      else if (i.region === "chest" && i.aisSeverity >= 4) rate = BLEED_M3_PER_S.lungSerious;
      else if (i.region === "lung" && i.aisSeverity >= 2) rate = BLEED_M3_PER_S.organMinor;
      else if (i.region === "abdomen" && i.aisSeverity === 2) rate = BLEED_M3_PER_S.organMinor;
      else if ((i.region === "bowel" || i.region === "pancreas" || i.region === "kidney") && i.aisSeverity >= 2) rate = BLEED_M3_PER_S.organMinor;
      else if (i.region === "pelvis" && i.aisSeverity === 2) rate = BLEED_M3_PER_S.organMinor;
      rate *= 1 + Math.max(0, i.aisSeverity - 3) * 0.5;
      sources.set(i.region, Math.max((_a = sources.get(i.region)) != null ? _a : 0, rate));
    }
    return [...sources.values()].reduce((a, b) => a + b, 0);
  }
  function progressPatient(report, injuries, previous, env) {
    var _a, _b, _c, _d;
    for (const value of [env.elapsedS, previous.bloodLostM3, (_a = env.fireDoseS) != null ? _a : 0, (_b = env.submergedS) != null ? _b : 0]) {
      if (!Number.isFinite(value) || value < 0) throw new Error("Invalid patient time, dose or blood loss");
    }
    if (!Number.isFinite(env.massKg) || env.massKg <= 0) throw new Error("Invalid patient mass");
    const volume = env.massKg * BLOOD_VOLUME_M3_PER_KG;
    const rate = estimateBleedingRateM3S(injuries, env.externalBleedingControlled);
    const bloodLostM3 = Math.min(volume, previous.bloodLostM3 + rate * env.elapsedS);
    const fraction = bloodLostM3 / volume;
    const bleedReserve = Math.max(0, 1 - (fraction / TERMINAL_LOSS_FRACTION) ** 2);
    const fireReserve = Math.max(0, 1 - (((_c = env.fireDoseS) != null ? _c : 0) / 120) ** 2);
    const waterReserve = Math.max(0, 1 - (Math.max(0, ((_d = env.submergedS) != null ? _d : 0) - 20) / 280) ** 2);
    const proposed = report.survival.survivalProbabilityPercent * bleedReserve * fireReserve * waterReserve;
    const percent = previous.dead ? 0 : Math.min(previous.lowestSurvivalPercent, Math.max(0, Math.round(proposed)));
    const dead = previous.dead || report.survival.hasAis6 || percent === 0;
    const critical = dead || report.survival.hasAis5Plus || fraction >= 0.3 || percent < 50 || injuries.some((i) => i.region === "aorta" || i.region === "pelvis" && i.aisSeverity >= 4);
    const outlook = dead ? "notSurvivable" : critical ? "critical" : report.iss.isMajorTrauma ? "seriousButLikelySurvivable" : "likelySurvivable";
    const systemicEffects = computeSystemicEffects(injuries.filter((i) => !i.mechanism.startsWith("haemorrhage-from-")), report.iss);
    const loss = fraction >= 0.3 ? "severe" : fraction >= 0.15 ? "moderate" : "none";
    systemicEffects.bloodLoss = {
      ...systemicEffects.bloodLoss,
      level: loss,
      plainDescription: rate > 0 ? "Bleeding is continuing; blood loss is accumulating." : "No ongoing bleeding source is modeled."
    };
    if (fraction >= 0.3) systemicEffects.shock = { ...systemicEffects.shock, level: "decompensated", plainDescription: "Blood loss is causing severe shock." };
    if (fraction >= 0.4 || dead) systemicEffects.consciousness = { ...systemicEffects.consciousness, level: "unresponsive", plainDescription: "You are unresponsive." };
    if (systemicEffects.consciousness.level === "unresponsive") systemicEffects.selfExtract = { level: "unable", plainDescription: "You cannot get out without assistance." };
    const survival = {
      ...report.survival,
      outlook,
      survivalProbabilityPercent: dead ? 0 : percent,
      plainSummary: dead ? "The simulated occupant has died." : critical ? "Critical injuries or deterioration: urgent rescue and trauma care are needed." : report.survival.plainSummary,
      survivalProbabilityCaveat: report.survival.survivalProbabilityCaveat + " Scenario estimate with UNVERIFIED untreated bleeding and exposure progression; not a clinical survival probability."
    };
    const recovery = dead ? { ...report.recovery, weeks: null } : report.recovery;
    return {
      report: { ...report, survival, systemicEffects, recovery },
      state: { bloodLostM3, lowestSurvivalPercent: survival.survivalProbabilityPercent, dead },
      bleedingRateM3S: rate
    };
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

  var FIRE_MINIMUM_INTENSITY = 0.15;
  var FIRE_MINIMUM_SECONDS = 1.5;
  var TBSA_PERCENT_PER_SECOND = 2.5;
  var BAUX_INHALATION_PENALTY = 17;
  var BAUX_LD50 = 110;
  var BAUX_UNSURVIVABLE = 140;
  var FIRE_SKIN_BANDS = [
    { aisLevel: 1, floorSeconds: 1.5, ceilingSeconds: 3 },
    { aisLevel: 2, floorSeconds: 3, ceilingSeconds: 8 },
    { aisLevel: 3, floorSeconds: 8, ceilingSeconds: 20 }
  ];
  var FIRE_DEEP_TISSUE_BANDS = [
    { aisLevel: 2, floorSeconds: 7, ceilingSeconds: 14 },
    { aisLevel: 3, floorSeconds: 14, ceilingSeconds: 28 },
    { aisLevel: 4, floorSeconds: 28, ceilingSeconds: 50 }
  ];
  var FIRE_AIRWAY_BANDS = [
    { aisLevel: 2, floorSeconds: 4, ceilingSeconds: 10 },
    { aisLevel: 3, floorSeconds: 10, ceilingSeconds: 22 },
    { aisLevel: 4, floorSeconds: 22, ceilingSeconds: 40 }
  ];
  var FIRE_INHALATION_INJURY_SECONDS = 10;
  var FIRE_SKIN_REGIONS = [
    { region: "head", part: "face" },
    { region: "forearm", part: "forearm" },
    { region: "hand", part: "hand" },
    { region: "chest", part: "chest" },
    { region: "lowerLeg", part: "lower leg" }
  ];
  var FIRE_DEEP_REGIONS = [
    { region: "forearm", part: "forearm" },
    { region: "lowerLeg", part: "lower leg" },
    { region: "chest", part: "chest" }
  ];
  var DROWNING_BREATH_HOLD_SECONDS = 20;
  var DROWNING_AIR_HUNGER_BANDS = [
    { aisLevel: 1, floorSeconds: 20, ceilingSeconds: 25 },
    { aisLevel: 2, floorSeconds: 25, ceilingSeconds: 40 }
  ];
  var DROWNING_ASPIRATION_BANDS = [
    { aisLevel: 3, floorSeconds: 38, ceilingSeconds: 55 },
    { aisLevel: 4, floorSeconds: 55, ceilingSeconds: 85 },
    { aisLevel: 5, floorSeconds: 85, ceilingSeconds: 130 }
  ];
  var DROWNING_HYPOXIC_BRAIN_BANDS = [
    { aisLevel: 3, floorSeconds: 55, ceilingSeconds: 85 },
    { aisLevel: 4, floorSeconds: 85, ceilingSeconds: 130 },
    { aisLevel: 5, floorSeconds: 130, ceilingSeconds: 200 }
  ];
  var DROWNING_ARREST_BANDS = [
    { aisLevel: 4, floorSeconds: 100, ceilingSeconds: 150 },
    { aisLevel: 5, floorSeconds: 150, ceilingSeconds: 220 }
  ];
  var DROWNING_UNSURVIVABLE_SECONDS = 300;
  var EXPOSURE_FATAL_AIS = 6;

  function bandedProbability(bands, seconds, scale = 1) {
    return selectAisLevel(
      bands.map((b) => ({
        aisLevel: b.aisLevel,
        probability: Math.min(1, rampProbability(seconds, b.floorSeconds, b.ceilingSeconds) * scale)
      }))
    );
  }
  function build(eventIndex, region, aisSeverity, continuousSeverity, probability, name, clinical, plain, mechanism, caveat) {
    return {
      eventIndex,
      region,
      aisSeverity,
      continuousSeverity,
      probability,
      name,
      clinicalDescription: clinical,
      plainDescription: plain,
      mechanism,
      lowerFidelity: true,
      caveat
    };
  }
  function burnedAreaPercent(exposure) {
    if (exposure.intensity < FIRE_MINIMUM_INTENSITY) return 0;
    return Math.min(100, exposure.secondsExposed * exposure.intensity * TBSA_PERCENT_PER_SECOND);
  }
  function revisedBauxScore(exposure) {
    const age = typeof exposure.occupantAge === "number" ? exposure.occupantAge : 35;
    const effectiveSeconds = exposure.secondsExposed * exposure.intensity;
    const inhalation = effectiveSeconds >= FIRE_INHALATION_INJURY_SECONDS ? BAUX_INHALATION_PENALTY : 0;
    return age + burnedAreaPercent(exposure) + inhalation;
  }
  function fireCaveat(exposure, mechanism) {
    return `LOWER FIDELITY: derived from how long the occupant has been exposed to fire (${exposure.secondsExposed.toFixed(1)}s at intensity ${exposure.intensity.toFixed(2)}), reported by the consuming mod's own fire detection, not by this library. Burned area (${burnedAreaPercent(exposure).toFixed(0)}% TBSA) and the revised Baux score (${revisedBauxScore(exposure).toFixed(0)}; published LD50 ~${BAUX_LD50}) are computed from that exposure using a CITED mortality score, but the rate at which burned area accumulates -- and the ${mechanism} band boundaries -- are UNVERIFIED engineering judgment (see constants.ts). Treat as directional, not a validated probability.`;
  }
  function computeFireInjuries(exposure) {
    if (exposure.intensity < FIRE_MINIMUM_INTENSITY) return [];
    const effectiveSeconds = exposure.secondsExposed * exposure.intensity;
    if (effectiveSeconds < FIRE_MINIMUM_SECONDS) return [];
    const injuries = [];
    const baux = revisedBauxScore(exposure);
    const skin = bandedProbability(FIRE_SKIN_BANDS, effectiveSeconds);
    if (skin.probability >= INJURY_INCLUSION_PROBABILITY_THRESHOLD) {
      const ais = skin.aisLevel;
      for (const { region, part } of FIRE_SKIN_REGIONS) {
        injuries.push(build(
          exposure.eventIndex,
          region,
          ais,
          skin.continuousSeverity,
          skin.probability,
          ais >= 3 ? `Full-thickness burn (${part})` : `Burn to the ${part}`,
          `${ais >= 3 ? "Full-thickness" : ais === 2 ? "Partial-thickness" : "Superficial"} burn to the ${part} (AIS ${ais}).`,
          ais >= 3 ? `The fire burned right through the skin on your ${part}.` : `The fire burned the skin on your ${part}.`,
          `fire-skin-${region}`,
          fireCaveat(exposure, "skin burn")
        ));
      }
    }
    const deep = bandedProbability(FIRE_DEEP_TISSUE_BANDS, effectiveSeconds);
    if (deep.probability >= INJURY_INCLUSION_PROBABILITY_THRESHOLD) {
      const ais = deep.aisLevel;
      for (const { region, part } of FIRE_DEEP_REGIONS) {
        injuries.push(build(
          exposure.eventIndex,
          region,
          ais,
          deep.continuousSeverity,
          deep.probability,
          `Deep burn into muscle (${part})`,
          `Burn extending through skin into underlying muscle of the ${part} (AIS ${ais}).`,
          `The burn on your ${part} has gone past the skin into the muscle.`,
          `fire-deep-${region}`,
          fireCaveat(exposure, "deep tissue burn")
        ));
      }
    }
    const airway = bandedProbability(FIRE_AIRWAY_BANDS, effectiveSeconds);
    if (airway.probability >= INJURY_INCLUSION_PROBABILITY_THRESHOLD) {
      const ais = airway.aisLevel;
      injuries.push(build(
        exposure.eventIndex,
        "lung",
        ais,
        airway.continuousSeverity,
        airway.probability,
        "Inhalation injury (hot gas and smoke)",
        `Thermal and smoke inhalation injury to the airway and lungs (AIS ${ais}).`,
        "You have been breathing smoke and hot air. Your throat and lungs are burned.",
        "fire-inhalation",
        fireCaveat(exposure, "inhalation injury")
      ));
    }
    if (baux >= BAUX_LD50) {
      const fatal = baux >= BAUX_UNSURVIVABLE;
      const ais = fatal ? EXPOSURE_FATAL_AIS : 5;
      const probability = fatal ? 1 : Math.min(1, (baux - BAUX_LD50) / (BAUX_UNSURVIVABLE - BAUX_LD50) + 0.5);
      injuries.push(build(
        exposure.eventIndex,
        "circulatory",
        ais,
        expectedAisSeverity([{ aisLevel: ais, probability }]),
        probability,
        fatal ? "Burns over almost the whole body" : "Extensive burns",
        `Burns over ${burnedAreaPercent(exposure).toFixed(0)}% of total body surface; revised Baux ${baux.toFixed(0)} (published LD50 ~${BAUX_LD50}${fatal ? `, ${BAUX_UNSURVIVABLE}+ treated here as currently untreatable` : ""}) (AIS ${ais}).`,
        fatal ? "You have been burned over almost your whole body. This is not survivable." : "You have been burned over a large part of your body.",
        "fire-extensive-burns",
        fireCaveat(exposure, "extensive burns")
      ));
    }
    return injuries;
  }
  function drowningCaveat(exposure, mechanism) {
    return `LOWER FIDELITY: derived from submersion duration (${exposure.secondsSubmerged.toFixed(0)}s), reported by the consuming mod's own water detection, not by this library. Submersion duration IS the strongest published predictor of drowning outcome, and the overall shape here follows the published duration bands (see constants.ts); the exact second each ${mechanism} band starts, and the AIS level assigned to it, are UNVERIFIED engineering judgment. Treat as directional, not a validated probability.`;
  }
  function computeDrowningInjuries(exposure) {
    if (!exposure.fullySubmerged) return [];
    const seconds = exposure.secondsSubmerged;
    if (seconds <= DROWNING_BREATH_HOLD_SECONDS) return [];
    const injuries = [];
    const hunger = bandedProbability(DROWNING_AIR_HUNGER_BANDS, seconds);
    if (hunger.probability >= INJURY_INCLUSION_PROBABILITY_THRESHOLD) {
      const ais = hunger.aisLevel;
      injuries.push(build(
        exposure.eventIndex,
        "lung",
        ais,
        hunger.continuousSeverity,
        hunger.probability,
        "Air hunger (cannot breathe)",
        `Involuntary breathing movements and laryngospasm from breath-hold past voluntary limit (AIS ${ais}).`,
        "You can't breathe. Your body is trying to inhale and there is no air.",
        "drowning-air-hunger",
        drowningCaveat(exposure, "air hunger")
      ));
    }
    const aspiration = bandedProbability(DROWNING_ASPIRATION_BANDS, seconds);
    if (aspiration.probability >= INJURY_INCLUSION_PROBABILITY_THRESHOLD) {
      const ais = aspiration.aisLevel;
      injuries.push(build(
        exposure.eventIndex,
        "lung",
        ais,
        aspiration.continuousSeverity,
        aspiration.probability,
        "Water in the lungs (aspiration)",
        `Aspiration of water with loss of gas exchange (AIS ${ais}).`,
        "Your lungs are filling with water.",
        "drowning-aspiration",
        drowningCaveat(exposure, "aspiration")
      ));
    }
    const brain = bandedProbability(DROWNING_HYPOXIC_BRAIN_BANDS, seconds);
    if (brain.probability >= INJURY_INCLUSION_PROBABILITY_THRESHOLD) {
      const ais = brain.aisLevel;
      injuries.push(build(
        exposure.eventIndex,
        "head",
        ais,
        brain.continuousSeverity,
        brain.probability,
        "Hypoxic brain injury",
        `Cerebral hypoxia from sustained submersion (AIS ${ais}).`,
        "Your brain has been without oxygen for too long.",
        "drowning-hypoxic-brain",
        drowningCaveat(exposure, "hypoxic brain injury")
      ));
    }
    const arrest = bandedProbability(DROWNING_ARREST_BANDS, seconds);
    if (arrest.probability >= INJURY_INCLUSION_PROBABILITY_THRESHOLD) {
      const ais = arrest.aisLevel;
      injuries.push(build(
        exposure.eventIndex,
        "circulatory",
        ais,
        arrest.continuousSeverity,
        arrest.probability,
        "Circulatory arrest from hypoxia",
        `Hypoxic circulatory arrest following prolonged submersion (AIS ${ais}).`,
        "Your heart has stopped from lack of oxygen.",
        "drowning-arrest",
        drowningCaveat(exposure, "circulatory arrest")
      ));
    }
    if (seconds >= DROWNING_UNSURVIVABLE_SECONDS) {
      injuries.push(build(
        exposure.eventIndex,
        "head",
        EXPOSURE_FATAL_AIS,
        expectedAisSeverity([{ aisLevel: EXPOSURE_FATAL_AIS, probability: 1 }]),
        1,
        "Drowned",
        `Submersion beyond ${Math.round(DROWNING_UNSURVIVABLE_SECONDS / 60)} minutes (AIS 6, currently untreatable).`,
        "You were under water too long.",
        "drowning-fatal",
        drowningCaveat(exposure, "non-survivable submersion")
      ));
    }
    return injuries;
  }
  function computeExposureInjuries(fire, drowning) {
    const out = [];
    if (fire) out.push(...computeFireInjuries(fire));
    if (drowning) out.push(...computeDrowningInjuries(drowning));
    return out;
  }

  var ROLLOVER_EJECTION_UNBELTED_FLOOR_TURNS = 1;
  var ROLLOVER_EJECTION_UNBELTED_CEILING_TURNS = 6;
  var ROLLOVER_EJECTION_UNBELTED_MAX_PROBABILITY = 0.9;
  var ROLLOVER_EJECTION_BELTED_FLOOR_TURNS = 2;
  var ROLLOVER_EJECTION_BELTED_CEILING_TURNS = 10;
  var ROLLOVER_EJECTION_BELTED_MAX_PROBABILITY = 0.03;
  var ROLLOVER_EJECTION_INJURIES = [
    { region: "head", aisLevel: 5, conditional: 0.9, part: "head" },
    { region: "chest", aisLevel: 4, conditional: 0.85, part: "chest" },
    { region: "abdomen", aisLevel: 3, conditional: 0.7, part: "abdomen" },
    { region: "neck", aisLevel: 4, conditional: 0.6, part: "neck" },
    { region: "pelvis", aisLevel: 3, conditional: 0.6, part: "pelvis" }
  ];
  var ROLLOVER_INTERIOR_HEAD_BANDS = [
    { aisLevel: 2, floorQuarterTurns: 0.8, ceilingQuarterTurns: 1.5 },
    { aisLevel: 3, floorQuarterTurns: 1.4, ceilingQuarterTurns: 3 },
    { aisLevel: 4, floorQuarterTurns: 3, ceilingQuarterTurns: 7 }
  ];
  var ROLLOVER_INTERIOR_CHEST_BANDS = [
    { aisLevel: 2, floorQuarterTurns: 0.9, ceilingQuarterTurns: 2 },
    { aisLevel: 3, floorQuarterTurns: 2, ceilingQuarterTurns: 5 }
  ];
  var ROLLOVER_INTERIOR_SPINE_BANDS = [
    { aisLevel: 2, floorQuarterTurns: 1, ceilingQuarterTurns: 3 },
    { aisLevel: 3, floorQuarterTurns: 3, ceilingQuarterTurns: 8 }
  ];
  var ROLLOVER_INTERIOR_LIMB_RAMPS = [

    { aisLevel: 1, floorQuarterTurns: 0.75, ceilingQuarterTurns: 1.6 },
    { aisLevel: 2, floorQuarterTurns: 1.2, ceilingQuarterTurns: 3.5 },
    { aisLevel: 3, floorQuarterTurns: 4, ceilingQuarterTurns: 10 }
  ];
  var ROLLOVER_LIMB_EXPOSURE = [
    { region: "forearm", part: "forearm", weight: 1, side: "arm" },
    { region: "wrist", part: "wrist", weight: 0.9, side: "arm" },
    { region: "hand", part: "hand", weight: 0.85, side: "arm" },
    { region: "upperArm", part: "upper arm", weight: 0.8, side: "arm" },
    { region: "lowerLeg", part: "lower leg", weight: 0.85, side: "leg" },
    { region: "knee", part: "knee", weight: 0.75, side: "leg" },
    { region: "ankle", part: "ankle", weight: 0.6, side: "leg" }
  ];
  var ROLLOVER_BELTED_LIMB_SCALE = 0.35;
  var ROLLOVER_ROOF_CONTACT_HEAD_SCALE = 1.45;
  var ROLLOVER_ROOF_CONTACT_NECK_SCALE = 1.5;
  var ROLLOVER_NO_ROOF_CONTACT_SCALE = 0.55;
  var ROLLOVER_STRUCK_SIDE_LIMB_SCALE = 1.4;
  var ROLLOVER_FAR_SIDE_LIMB_SCALE = 0.85;
  var ROLLOVER_STRUCK_SIDE_CHEST_SCALE = 1.3;
  var ROLLOVER_BELTED_NECK_BANDS = [
    { aisLevel: 2, floorQuarterTurns: 1.8, ceilingQuarterTurns: 4.5 },
    { aisLevel: 3, floorQuarterTurns: 4.5, ceilingQuarterTurns: 12 }
  ];
  var ROLLOVER_BELTED_HEAD_BANDS = [
    { aisLevel: 2, floorQuarterTurns: 2, ceilingQuarterTurns: 5 },
    { aisLevel: 3, floorQuarterTurns: 6, ceilingQuarterTurns: 15 }
  ];
  var ROLLOVER_ROLL_RATE_MIN_SCALE = 0.55;
  var ROLLOVER_ROLL_RATE_MAX_SCALE = 1.75;
  var ROLLOVER_ROLL_RATE_LOW_DEG_S = 90;
  var ROLLOVER_ROLL_RATE_HIGH_DEG_S = 700;
  var ROLLCAGE_ROOF_MECHANISM_SCALE = 0.6;
  var ROLLCAGE_INTERIOR_MECHANISM_SCALE = 0.9;
  var ROLLCAGE_REQUIRES_BELT = true;
  var ROLLOVER_MINIMUM_QUARTER_TURNS = 0.75;

  function rollRateScale(peakRollRateDegS) {
    if (!(peakRollRateDegS > 0)) return ROLLOVER_ROLL_RATE_MIN_SCALE;
    const span = ROLLOVER_ROLL_RATE_HIGH_DEG_S - ROLLOVER_ROLL_RATE_LOW_DEG_S;
    const t = Math.min(1, Math.max(0, (peakRollRateDegS - ROLLOVER_ROLL_RATE_LOW_DEG_S) / span));
    return ROLLOVER_ROLL_RATE_MIN_SCALE + t * (ROLLOVER_ROLL_RATE_MAX_SCALE - ROLLOVER_ROLL_RATE_MIN_SCALE);
  }
  function attitudeScales(rollover) {
    const knowsRoof = typeof rollover.roofContact === "boolean";
    const roof = knowsRoof ? rollover.roofContact === true : null;
    const head = roof === null ? 1 : roof ? ROLLOVER_ROOF_CONTACT_HEAD_SCALE : ROLLOVER_NO_ROOF_CONTACT_SCALE;
    const neck = roof === null ? 1 : roof ? ROLLOVER_ROOF_CONTACT_NECK_SCALE : ROLLOVER_NO_ROOF_CONTACT_SCALE;
    const side = rollover.sideContact;
    const struck = side === -1 ? "left" : side === 1 ? "right" : null;
    return {
      head,
      neck,
      chest: struck ? ROLLOVER_STRUCK_SIDE_CHEST_SCALE : 1,
      strikeSideArm: struck ? ROLLOVER_STRUCK_SIDE_LIMB_SCALE : 1,
      farSideArm: struck ? ROLLOVER_FAR_SIDE_LIMB_SCALE : 1,
      struckSideLabel: struck
    };
  }
  function ejectionProbability(rollover) {
    const { belted, quarterTurns } = rollover;
    const floor = belted ? ROLLOVER_EJECTION_BELTED_FLOOR_TURNS : ROLLOVER_EJECTION_UNBELTED_FLOOR_TURNS;
    const ceiling = belted ? ROLLOVER_EJECTION_BELTED_CEILING_TURNS : ROLLOVER_EJECTION_UNBELTED_CEILING_TURNS;
    const max = belted ? ROLLOVER_EJECTION_BELTED_MAX_PROBABILITY : ROLLOVER_EJECTION_UNBELTED_MAX_PROBABILITY;
    return rampProbability(quarterTurns, floor, ceiling) * max;
  }
  var EJECTION_INTERIOR_EXCLUSION = 0.6;
  var CAVEAT_PREFIX = "LOWER FIDELITY: no criterion or published risk curve in this pipeline covers rollover loading. ";
  function caveatFor(rollover, mechanism, tableName) {
    return `${CAVEAT_PREFIX}This finding comes from a measured rollover (${rollover.quarterTurns.toFixed(1)} quarter turns, peak roll rate ${rollover.peakRollRateDegS.toFixed(0)} deg/s, ${rollover.belted ? "belted" : "UNBELTED"}${rollover.rollCage ? ", roll cage fitted" : ""}), both numbers reported by the consuming mod's own vehicle-Lua roll tracking, not this library, applied to an UNVERIFIED quarter-turn severity ramp (${tableName} in constants.ts) for the ${mechanism} mechanism. The published material behind this module constrains the belted/unbelted RATIO and the endpoints, not the shape between them. Treat as directional/plausibility-level only, not a validated probability.`;
  }
  function buildBandedInjury(rollover, region, part, bands, tableName, mechanism, scale, wording) {
    const level = selectAisLevel(
      bands.map((b) => ({
        aisLevel: b.aisLevel,
        probability: Math.min(1, rampProbability(rollover.quarterTurns, b.floorQuarterTurns, b.ceilingQuarterTurns) * scale)
      }))
    );
    if (level.probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) return null;
    const ais = level.aisLevel;
    const desc = wording[ais];
    if (!desc) throw new Error(`Missing authored rollover description for AIS ${ais}`);
    return {
      eventIndex: rollover.eventIndex,
      region,
      aisSeverity: ais,
      continuousSeverity: level.continuousSeverity,
      probability: level.probability,
      name: desc.name,
      clinicalDescription: desc.clinical,
      plainDescription: desc.plain,
      mechanism: `rollover-${mechanism}-${region}`,
      lowerFidelity: true,
      caveat: caveatFor(rollover, mechanism, tableName)
    };
  }
  function wordingFor(part, mechanismPlain) {
    const Part = `${part[0].toUpperCase()}${part.slice(1)}`;
    return {
      1: {
        name: `${Part} injury (rollover, minor)`,
        clinical: `Soft-tissue ${part} injury -- bruising, sprain or laceration -- from ${mechanismPlain} during a rollover (AIS 1).`,
        plain: `Rolling threw your ${part} around -- it is bruised and painful but not broken.`
      },
      2: {
        name: `${Part} injury (rollover, minor)`,
        clinical: `Minor ${part} injury from ${mechanismPlain} during a rollover (AIS 2).`,
        plain: `You were knocked about as the car rolled -- your ${part} took some of it.`
      },
      3: {
        name: `${Part} injury (rollover, serious)`,
        clinical: `Serious ${part} injury from ${mechanismPlain} during a rollover (AIS 3).`,
        plain: `The car rolling threw you hard into it -- your ${part} took a serious hit.`
      },
      4: {
        name: `${Part} injury (rollover, severe)`,
        clinical: `Severe ${part} injury from ${mechanismPlain} during a rollover (AIS 4).`,
        plain: `The roll battered you badly -- your ${part} is seriously hurt.`
      }
    };
  }
  function ejectionInjuries(rollover) {
    const pEject = ejectionProbability(rollover);
    if (pEject <= 0) return [];
    const out = [];
    for (const spec of ROLLOVER_EJECTION_INJURIES) {
      const probability = pEject * spec.conditional;
      if (probability < INJURY_INCLUSION_PROBABILITY_THRESHOLD) continue;
      const continuousSeverity = expectedAisSeverity([{ aisLevel: spec.aisLevel, probability }]);
      const Part = `${spec.part[0].toUpperCase()}${spec.part.slice(1)}`;
      out.push({
        eventIndex: rollover.eventIndex,
        region: spec.region,
        aisSeverity: spec.aisLevel,
        continuousSeverity,
        probability,
        name: `${Part} injury (thrown from the vehicle)`,
        clinicalDescription: `Severe ${spec.part} injury consistent with occupant ejection during a rollover (AIS ${spec.aisLevel}).`,
        plainDescription: spec.part === "head" ? "You were thrown out of the car as it rolled and hit the ground head-first." : `You were thrown out of the car as it rolled -- your ${spec.part} took the impact with the ground.`,
        mechanism: `rollover-ejection-${spec.region}`,
        lowerFidelity: true,
        caveat: caveatFor(rollover, "ejection", "ROLLOVER_EJECTION_INJURIES")
      });
    }
    return out;
  }
  function computeRolloverInjuries(rollover) {
    if (rollover.contactConfirmed === false) return [];
    if (!(rollover.quarterTurns >= ROLLOVER_MINIMUM_QUARTER_TURNS)) return [];
    const rate = rollRateScale(rollover.peakRollRateDegS);
    const cageHelps = rollover.rollCage && (!ROLLCAGE_REQUIRES_BELT || rollover.belted);
    const interiorScale = rate * (cageHelps ? ROLLCAGE_INTERIOR_MECHANISM_SCALE : 1);
    const roofScale = rate * (cageHelps ? ROLLCAGE_ROOF_MECHANISM_SCALE : 1);
    const attitude = attitudeScales(rollover);
    const injuries = [];
    const addLimbs = (baseScale, mechanism, mechanismPlain) => {
      for (const limb of ROLLOVER_LIMB_EXPOSURE) {
        const sideScale = limb.side === "arm" ? attitude.strikeSideArm : 1;
        const scale = baseScale * limb.weight * sideScale;
        const label = attitude.struckSideLabel && limb.side === "arm" ? `${attitude.struckSideLabel} ${limb.part}` : limb.part;
        const injury = buildBandedInjury(
          rollover,
          limb.region,
          label,
          ROLLOVER_INTERIOR_LIMB_RAMPS,
          "ROLLOVER_INTERIOR_LIMB_RAMPS",
          mechanism,
          scale,
          wordingFor(label, mechanismPlain)
        );
        if (injury) injuries.push(injury);
      }
    };
    if (!rollover.belted) {
      injuries.push(...ejectionInjuries(rollover));
      const scale = interiorScale * (1 - EJECTION_INTERIOR_EXCLUSION * ejectionProbability(rollover));
      const add = (region, part, bands, table, attitudeScale = 1) => {
        const injury = buildBandedInjury(rollover, region, part, bands, table, "interior contact", scale * attitudeScale, wordingFor(part, "being thrown against the interior"));
        if (injury) injuries.push(injury);
      };
      add("head", "head", ROLLOVER_INTERIOR_HEAD_BANDS, "ROLLOVER_INTERIOR_HEAD_BANDS", attitude.head);
      add("chest", "chest", ROLLOVER_INTERIOR_CHEST_BANDS, "ROLLOVER_INTERIOR_CHEST_BANDS", attitude.chest);
      add("thoracicSpine", "spine", ROLLOVER_INTERIOR_SPINE_BANDS, "ROLLOVER_INTERIOR_SPINE_BANDS");
      add("neck", "neck", ROLLOVER_BELTED_NECK_BANDS, "ROLLOVER_BELTED_NECK_BANDS", attitude.neck);
      addLimbs(scale, "interior contact", "being thrown against the interior");
    } else {
      injuries.push(...ejectionInjuries(rollover));
      const add = (region, part, bands, table, attitudeScale = 1) => {
        const injury = buildBandedInjury(rollover, region, part, bands, table, "roof-to-ground loading", roofScale * attitudeScale, wordingFor(part, "the roof and ground loading you in your seat"));
        if (injury) injuries.push(injury);
      };
      add("neck", "neck", ROLLOVER_BELTED_NECK_BANDS, "ROLLOVER_BELTED_NECK_BANDS", attitude.neck);
      add("head", "head", ROLLOVER_BELTED_HEAD_BANDS, "ROLLOVER_BELTED_HEAD_BANDS", attitude.head);
      addLimbs(
        roofScale * ROLLOVER_BELTED_LIMB_SCALE,
        "roof-to-ground loading",
        "the cabin turning over around you"
      );
    }
    return injuries;
  }
  return __toCommonJS(generated_entry_exports);
})();
