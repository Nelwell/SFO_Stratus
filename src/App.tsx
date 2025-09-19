import React, { useState, useEffect } from 'react';
import { Cloud, Sun, Wind, Thermometer, Gauge, AlertTriangle, Clock, Moon, Globe, RefreshCw, Wifi } from 'lucide-react';
import { fetchKSFOTemperatureData, formatTimestamp, type TemperatureData } from './utils/nwsApi';

// Use the element directly, not the event (prevents pooled-event nulls)
const getFloat = (el: HTMLInputElement, fallback = 0) => {
  const n = el.valueAsNumber;
  return Number.isFinite(n) ? n : fallback;
};

const getInt = (el: HTMLInputElement, fallback = 0) => {
  const n = el.valueAsNumber;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

// SFO coordinates for sunrise calculation
const SFO_LAT = 37.61961;
const SFO_LON = -122.36558;

interface PressureData {
  sfo: number;
  smf: number;
  acv: number;
  trend24h: number;
}

interface SynopticTrigger {
  deepeningTrough: boolean;
  shortwaveTrough: boolean;
  longWaveTrough: boolean;
  shallowFront: boolean;
}

interface SynopticPattern {
  thermalLow: boolean;
  surfaceHigh: boolean;
  upperRidge: boolean;
  upperTrough: boolean;
  cutoffLow: boolean;
}

interface BurnOffData {
  base: number;
  top: number;
}

interface WindData {
  direction: number;
  speed: number;
}
function App() {
  const [maxTemp, setMaxTemp] = useState<number>(75);
  const [maxDewpoint, setMaxDewpoint] = useState<number>(58);
  const [onPressure, setOnPressure] = useState<PressureData>({
    sfo: 1015.0,
    smf: 1011.0,
    acv: 0,
    trend24h: 0.5
  });
  const [offPressure, setOffPressure] = useState<PressureData>({
    sfo: 1019.0,
    smf: 0,
    acv: 1013.0,
    trend24h: -0.2
  });
  const [baseInversion, setBaseInversion] = useState<number>(1400);
  const [wind2k, setWind2k] = useState<WindData>({ direction: 270, speed: 15 });
  const [triggers, setTriggers] = useState<SynopticTrigger>({
    deepeningTrough: false,
    shortwaveTrough: false,
    longWaveTrough: false,
    shallowFront: false
  });
  const [selectedTrigger, setSelectedTrigger] = useState<string>('');
  const [synopticPatterns, setSynopticPatterns] = useState<SynopticPattern>({
    thermalLow: false,
    surfaceHigh: false,
    upperRidge: false,
    upperTrough: false,
    cutoffLow: false
  });
  const [burnOff, setBurnOff] = useState<BurnOffData>({
    base: 800,
    top: 1700
  });
  const [month, setMonth] = useState<string>('July');
  const [afternoonDewpoint, setAfternoonDewpoint] = useState<number>(55);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [temperatureData, setTemperatureData] = useState<TemperatureData | null>(null);
  const [isLoadingTemps, setIsLoadingTemps] = useState<boolean>(false);
  const [tempDataError, setTempDataError] = useState<string | null>(null);

// Returns sunrise time at SFO in Z (e.g., "1355Z")
const getSunriseTime = (opts?: { dayOffset?: number }) => {
  const dayOffset = opts?.dayOffset ?? 0; // use 1 for "tomorrow"
  // Choose the date in UTC
  const now = new Date();
  const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset));

  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();

  // Julian Day (UTC, 0h)
  const a = Math.floor((14 - m) / 12);
  const y2 = y - a;
  const m2 = m + 12 * a - 3;
  const jd = d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) + 1721119;

  // Days since J2000.0
  const n = jd - 2451545.0;

  // Mean longitude (deg) and mean anomaly (rad)
  const Ldeg = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;

  // Ecliptic longitude (rad)
  const lambda = (Ldeg + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;

  // Right ascension & declination
  const obliq = 23.439 * Math.PI / 180; // obliquity
  const alpha = Math.atan2(Math.cos(obliq) * Math.sin(lambda), Math.cos(lambda)); // rad
  const delta = Math.asin(Math.sin(obliq) * Math.sin(lambda)); // rad

  // Equation of Time (minutes) -- all in degrees; NO longitude here
  const alphaDeg = (alpha * 180) / Math.PI;
  const LdegNorm = (Ldeg + 360) % 360;
  const eqTime = 4 * (LdegNorm - 0.0057183 - ((alphaDeg + 360) % 360));
  // Normalize to [-20, +20]ish
  const eqTimeNorm = ((eqTime + 720) % 1440) - 720;

  // Sunrise hour angle (rad) with refraction + solar radius (~ -0.833°)
  const lat = SFO_LAT * Math.PI / 180;
  const h0 = (-0.833) * Math.PI / 180;
  const cosH0 = (Math.sin(h0) - Math.sin(lat) * Math.sin(delta)) / (Math.cos(lat) * Math.cos(delta));
  // Clamp numeric noise
  const H0 = Math.acos(Math.min(1, Math.max(-1, cosH0))); // rad

  // Solar noon (minutes from 00Z) and sunrise time
  // Longitude term (deg): west negative; this formula handles the sign correctly
  const solarNoonMin = 720 - 4 * SFO_LON - eqTimeNorm;           // minutes from 00Z
  const sunriseMin = solarNoonMin - (4 * (H0 * 180 / Math.PI));   // subtract hour angle in minutes

  // Convert to HHMMZ
  const mins = ((Math.round(sunriseMin) % 1440) + 1440) % 1440; // keep in [0,1440)
  const hh = Math.floor(mins / 60);
  const mm = Math.floor(mins % 60);
  return `${hh.toString().padStart(2, '0')}${mm.toString().padStart(2, '0')}Z`;
};

  // // Calculate sunrise time for SFO
  // const getSunriseTime = () => {
  //   const now = new Date();
  //   const year = now.getUTCFullYear();
  //   const month = now.getUTCMonth() + 1;
  //   const day = now.getUTCDate();
    
  //   // Julian day calculation
  //   const a = Math.floor((14 - month) / 12);
  //   const y = year - a;
  //   const m = month + 12 * a - 3;
  //   const jd = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + 1721119;
    
  //   // Solar calculations
  //   const n = jd - 2451545.0;
  //   const L = (280.460 + 0.9856474 * n) % 360;
  //   const g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;
  //   const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
    
  //   const alpha = Math.atan2(Math.cos(23.439 * Math.PI / 180) * Math.sin(lambda), Math.cos(lambda));
  //   const delta = Math.asin(Math.sin(23.439 * Math.PI / 180) * Math.sin(lambda));
    
  //   const latRad = SFO_LAT * Math.PI / 180;
  //   const hourAngle = Math.acos(-Math.tan(latRad) * Math.tan(delta));
    
  //   // Time calculations
  //   const eqTime = 4 * (L * Math.PI / 180 - 0.0057183 - alpha + SFO_LON * Math.PI / 180);
  //   const sunriseMinutes = 720 - 4 * SFO_LON - eqTime - 4 * hourAngle * 180 / Math.PI;
    
  //   const sunriseHours = Math.floor(sunriseMinutes / 60) % 24;
  //   const sunriseMin = Math.floor(sunriseMinutes % 60);
    
  //   return `${sunriseHours.toString().padStart(2, '0')}${sunriseMin.toString().padStart(2, '0')}Z`;
  // };

  // Fetch temperature data from NWS API
  const loadTemperatureData = async () => {
    setIsLoadingTemps(true);
    setTempDataError(null);
    
    try {
      const data = await fetchKSFOTemperatureData();
      setTemperatureData(data);
      
      // Auto-populate fields if data is available
      if (data.maxTemp !== null) {
        setMaxTemp(data.maxTemp);
      }
      if (data.maxDewpoint !== null) {
        setMaxDewpoint(data.maxDewpoint);
      }
    } catch (error) {
      setTempDataError(error instanceof Error ? error.message : 'Failed to fetch temperature data');
      console.error('Temperature data fetch error:', error);
    } finally {
      setIsLoadingTemps(false);
    }
  };

  // Load temperature data on component mount
  useEffect(() => {
    loadTemperatureData();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const calculateSI = () => maxTemp - maxDewpoint;
  const calculateON = () => onPressure.sfo - onPressure.smf;
  const calculateOFF = () => offPressure.acv - offPressure.sfo;

  const getSITiming = (si: number) => {
    const timingTable = [
      { si: 9, start: 1, end: 21, noCigProb: 5.9 },
      { si: 10, start: 1, end: 21, noCigProb: 11.1 },
      { si: 11, start: 3, end: 20, noCigProb: 10.7 },
      { si: 12, start: 3, end: 19, noCigProb: 11.4 },
      { si: 13, start: 6, end: 18, noCigProb: 20.6 },
      { si: 14, start: 7, end: 17, noCigProb: 21.5 },
      { si: 15, start: 8, end: 17, noCigProb: 24.4 },
      { si: 16, start: 9, end: 17, noCigProb: 20.8 },
      { si: 17, start: 9, end: 17, noCigProb: 20.0 },
      { si: 18, start: 9, end: 17, noCigProb: 21.6 },
      { si: 19, start: 10, end: 17, noCigProb: 23.3 },
      { si: 20, start: 10, end: 17, noCigProb: 44.4 },
      { si: 21, start: 10, end: 17, noCigProb: 60.0 },
      { si: 22, start: 10, end: 17, noCigProb: 75.0 },
      { si: 23, start: 11, end: 17, noCigProb: 80.0 },
      { si: 24, start: 13, end: 17, noCigProb: 70.0 },
      { si: 25, start: 13, end: 17, noCigProb: 83.3 }
    ];

    if (si < 9) return timingTable[0];
    if (si > 25) return timingTable[timingTable.length - 1];
    
    const exact = timingTable.find(t => t.si === Math.round(si));
    if (exact) return exact;
    
    const lower = timingTable.filter(t => t.si <= si).pop();
    const upper = timingTable.find(t => t.si > si);
    
    if (!lower) return timingTable[0];
    if (!upper) return timingTable[timingTable.length - 1];
    
    return lower;
  };

  const roundToNearestHalfHour = (time: number) => {
    return Math.round(time * 2) / 2;
  };

  const formatTime = (time: number) => {
    const hours = Math.floor(time);
    const minutes = (time - hours) * 60;
    return `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}Z`;
  };

  const getMonthlyThresholds = () => {
    const thresholds = {
      'May': { onMin: 3.5, offMax: -5.0 },
      'June': { onMin: 3.5, offMax: -5.5 },
      'July': { onMin: 3.5, offMax: -6.0 },
      'August': { onMin: 3.0, offMax: -6.0 },
      'September': { onMin: 2.5, offMax: -6.0 }
    };
    return thresholds[month as keyof typeof thresholds] || thresholds['July'];
  };

  const calculateBurnOffTime = (base: number, top: number) => {
    const thickness = top - base;
    const burnRate = 200; // ft/hr
    const hoursToScatter = thickness / burnRate;
    const totalHours = top / burnRate;
    return Math.round(hoursToScatter * 10) / 10;
  };

  const hasTrigger = () => {
    return selectedTrigger !== '';
  };

  const getSynopticPatternEffects = () => {
    let probabilityMultiplier = 1.0;
    let timingAdjustment = 0;
    let effects = [];

    // Surface patterns
    if (synopticPatterns.thermalLow) {
      probabilityMultiplier *= 1.25;
      timingAdjustment -= 1;
      effects.push('Thermal low enhances onshore flow');
    }

    if (synopticPatterns.surfaceHigh) {
      if (synopticPatterns.thermalLow) {
        // Optimal pattern: surface high offshore + thermal low inland
        probabilityMultiplier *= 1.15;
        timingAdjustment -= 0.5;
        effects.push('Surface high offshore strengthens pressure gradient');
      } else {
        // Surface high without thermal low can suppress marine layer
        probabilityMultiplier *= 0.85;
        effects.push('Surface high may suppress marine layer without thermal low');
      }
    }

    // Upper-level patterns
    if (synopticPatterns.upperRidge) {
      probabilityMultiplier *= 1.2;
      effects.push('Upper ridge enhances subsidence and inversion strength');
    }

    if (synopticPatterns.upperTrough) {
      probabilityMultiplier *= 1.3;
      timingAdjustment -= 1;
      effects.push('Upper trough thickens marine layer and raises base inversion');
    }

    if (synopticPatterns.cutoffLow) {
      probabilityMultiplier *= 1.2;
      timingAdjustment -= 0.5;
      effects.push('Cutoff low enhances marine layer thickness');
    }

    // Interaction effects
    if (synopticPatterns.upperRidge && synopticPatterns.thermalLow) {
      probabilityMultiplier *= 1.1; // Additional boost for optimal combination
      effects.push('Upper ridge + thermal low: optimal marine layer pattern');
    }

    if (synopticPatterns.upperTrough && synopticPatterns.thermalLow) {
      probabilityMultiplier *= 1.1; // Additional boost for trough + thermal low
      effects.push('Upper trough + thermal low: enhanced marine layer penetration');
    }
    return { probabilityMultiplier, timingAdjustment, effects };
  };

  const getFinalPrediction = () => {
    const si = calculateSI();
    const on = calculateON();
    const off = calculateOFF();
    const siTiming = getSITiming(si);
    const monthlyThresh = getMonthlyThresholds();
    const synopticEffects = getSynopticPatternEffects();
    
    let startTime = siTiming.start;
    let endTime = siTiming.end;
    let probability = 100 - siTiming.noCigProb;
    let confidence = 'Medium';
    let warnings = [];

    // Base conditions that prevent formation
    if (baseInversion < 500) {
      return {
        startTime: 'No Event',
        endTime: 'N/A',
        probability: 5,
        confidence: 'High',
        warnings: ['Base inversion below 500ft prevents stratus formation'],
        reasoning: `SI=${si.toFixed(1)}, ON=${on.toFixed(1)}mb, OFF=${off.toFixed(1)}mb, BI=${baseInversion}ft`,
        synopticEffects: synopticEffects.effects
      };
    }

    // Smooth dewpoint reduction (starts reducing at 45°F, severe reduction below 42°F)
    if (afternoonDewpoint < 45) {
      let dewpointFactor = 1.0;
      if (afternoonDewpoint >= 42) {
        // Gradual reduction from 45°F to 42°F
        dewpointFactor = 0.3 + (0.7 * (afternoonDewpoint - 42) / 3);
      } else {
        // Severe reduction below 42°F
        dewpointFactor = Math.max(0.05, 0.3 * Math.pow((afternoonDewpoint - 35) / 7, 2));
      }
      probability *= dewpointFactor;
      
      if (afternoonDewpoint < 42) {
        warnings.push(`Minimum afternoon dewpoint (${afternoonDewpoint}°F) well below 42°F threshold - stratus very improbable`);
        confidence = 'High';
      } else {
        warnings.push(`Minimum afternoon dewpoint (${afternoonDewpoint}°F) approaching 42°F threshold - reduced probability`);
      }
    }

    // Smooth monthly threshold checks for onshore gradient
    if (on < monthlyThresh.onMin + 0.5) {
      let onFactor = 1.0;
      if (on >= monthlyThresh.onMin) {
        // Gradual reduction in the 0.5mb buffer zone
        onFactor = 0.3 + (0.7 * (on - monthlyThresh.onMin) / 0.5);
      } else {
        // More severe reduction below threshold
        onFactor = Math.max(0.1, 0.3 * Math.pow(Math.max(0, on) / monthlyThresh.onMin, 1.5));
      }
      probability *= onFactor;
      warnings.push(`Onshore gradient (${on.toFixed(1)}mb) ${on < monthlyThresh.onMin ? 'below' : 'near'} ${monthlyThresh.onMin}mb ${month} threshold`);
    }

    // Smooth monthly threshold checks for offshore gradient (note: offMax is negative)
    if (off > monthlyThresh.offMax - 0.5) {
      let offFactor = 1.0;
      if (off <= monthlyThresh.offMax) {
        // Gradual reduction in the 0.5mb buffer zone above threshold
        offFactor = 0.2 + (0.8 * (monthlyThresh.offMax - off) / 0.5);
      } else {
        // More severe reduction above threshold (less negative = worse)
        offFactor = Math.max(0.05, 0.2 * Math.pow(Math.abs(monthlyThresh.offMax) / Math.max(0.1, Math.abs(off)), 1.5));
      }
      probability *= offFactor;
      warnings.push(`Offshore gradient (${off.toFixed(1)}mb) ${off > monthlyThresh.offMax ? 'above' : 'near'} ${monthlyThresh.offMax}mb ${month} threshold`);
    }

    // Pressure gradient adjustments
    if (on >= 3.6) {
      probability *= 1.2;
      if (onPressure.trend24h > 0) {
        startTime = Math.max(1, startTime - onPressure.trend24h);
      }
    }

    if (off >= 3.4) {
      probability *= 0.7;
      if (offPressure.trend24h > 0) {
        startTime += offPressure.trend24h;
      }
    }

    // Smooth base inversion effects
    if (baseInversion < 1200) {
      let inversionFactor = 1.0;
      let delayHours = 0;
      
      if (baseInversion >= 1000) {
        // Gradual effects from 1200ft to 1000ft
        inversionFactor = 0.8 + (0.2 * (baseInversion - 1000) / 200);
        delayHours = 2 * (1200 - baseInversion) / 200;
      } else {
        // More significant effects below 1000ft
        inversionFactor = Math.max(0.4, 0.8 * Math.pow(baseInversion / 1000, 0.5));
        delayHours = 2 + 2 * (1000 - baseInversion) / 500;
      }
      
      probability *= inversionFactor;
      startTime += delayHours;
      warnings.push(`Low inversion height (${baseInversion}ft) ${baseInversion < 1000 ? 'significantly delays' : 'delays'} penetration through gaps`);
    }

    // Synoptic trigger effects
    if (hasTrigger()) {
      startTime = Math.max(1, Math.min(startTime, 3));
      probability *= 1.3;
      confidence = 'High';
    }

    // Apply synoptic pattern effects
    probability *= synopticEffects.probabilityMultiplier;
    startTime += synopticEffects.timingAdjustment;
    endTime += synopticEffects.timingAdjustment * 0.5; // End time less affected by synoptic patterns
    startTime = Math.max(1, startTime); // Ensure minimum start time of 1Z

    // Wind effects
    if ((wind2k.direction >= 240 && wind2k.direction <= 300) && wind2k.speed > 10) {
      startTime = Math.max(1, startTime - 1);
      probability *= 1.1;
    }

    // SI confidence adjustments
    if (si < 10 || si > 22) confidence = 'High';
    
    probability = Math.min(95, Math.max(5, probability));
    
    // Round times to nearest half hour
    const roundedStartTime = roundToNearestHalfHour(startTime);
    const roundedEndTime = roundToNearestHalfHour(endTime);
    
    // Calculate time windows (±1 hour for onset, ±0.5 hour for end)
    const onsetWindow = {
      earliest: Math.max(1, roundedStartTime - 1),
      latest: roundedStartTime + 1,
      mostProbable: roundedStartTime
    };
    
    const endWindow = {
      earliest: roundedEndTime - 0.5,
      latest: roundedEndTime + 0.5,
      mostProbable: roundedEndTime
    };
    
    // Calculate burn-off time from sunrise
    const burnOffHours = calculateBurnOffTime(burnOff.base, burnOff.top);
    
    return {
      onsetWindow,
      endWindow,
      burnOffHours,
      probability: Math.round(probability),
      confidence,
      warnings,
      reasoning: `SI=${si.toFixed(1)}, ON=${on.toFixed(1)}mb, OFF=${off.toFixed(1)}mb, BI=${baseInversion}ft`,
      synopticEffects: synopticEffects.effects
    };
  };

  const prediction = getFinalPrediction();
  const si = calculateSI();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:from-gray-900 dark:via-gray-800 dark:to-slate-900 transition-colors duration-300">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Cloud className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">SFO Stratus Prediction Tool</h1>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="ml-4 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <Sun className="h-5 w-5 text-yellow-500" />
              ) : (
                <Moon className="h-5 w-5 text-gray-600" />
              )}
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Advanced stratus onset and burn-off prediction tool based on the Cohen-Lau methodology
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Input Panels */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Stratus Index */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">
              <div className="flex items-center gap-2 mb-4">
                <Thermometer className="h-5 w-5 text-red-500" />
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Stratus Index (SI)</h2>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 ml-auto">{si.toFixed(1)}</span>
                <button
                  onClick={loadTemperatureData}
                  disabled={isLoadingTemps}
                  className="ml-2 p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors duration-200 disabled:opacity-50"
                  title="Refresh temperature data from NWS"
                >
                  <RefreshCw className={`h-4 w-4 text-blue-600 dark:text-blue-400 ${isLoadingTemps ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              {/* Temperature data status */}
              {temperatureData && (
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg transition-colors duration-300">
                  <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-300">
                    <Wifi className="h-4 w-4" />
                    <span className="font-medium">Auto-populated from {temperatureData.dataSource}</span>
                  </div>
                  <div className="text-xs text-green-700 dark:text-green-400 mt-1">
                    Last updated: {formatTimestamp(temperatureData.timestamp)}
                  </div>
                  {temperatureData.maxTemp !== null && (
                    <div className="text-xs text-green-700 dark:text-green-400">
                      Max Temp: {temperatureData.maxTemp}°F | Max Dewpoint: {temperatureData.maxDewpoint || 'N/A'}°F
                    </div>
                  )}
                </div>
              )}
              
              {tempDataError && (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg transition-colors duration-300">
                  <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Unable to fetch live data</span>
                  </div>
                  <div className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                    {tempDataError} - Using manual input
                  </div>
                </div>
              )}
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Max Temperature (20-24Z) °F {temperatureData?.maxTemp && <span className="text-green-600 text-xs">(Auto)</span>}
                  </label>
                  <input
                    type="number"
                    value={maxTemp}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxTemp(getFloat(e.currentTarget))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Max Dewpoint (20-24Z) °F {temperatureData?.maxDewpoint && <span className="text-green-600 text-xs">(Auto)</span>}
                  </label>
                  <input
                    type="number"
                    value={maxDewpoint}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxDewpoint(getFloat(e.currentTarget))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  />
                </div>
              </div>
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors duration-300">
                <div className="flex justify-between text-sm">
                  <span className="text-green-600 font-medium">SI &gt; 22: Low Probability (20%)</span>
                  <span className="text-red-600 font-medium">SI &lt; 13: High Probability (90%)</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mt-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      si < 13 ? 'bg-red-500' : si > 22 ? 'bg-green-500' : 'bg-yellow-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, ((30 - si) / 23) * 100))}%` }}
                  ></div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">SI Onset:</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{formatTime(getSITiming(si).start)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">SI End:</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{formatTime(getSITiming(si).end)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pressure Gradients */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">
              <div className="flex items-center gap-2 mb-4">
                <Gauge className="h-5 w-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Pressure Gradients</h2>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    Offshore (ACV - SFO)
                    <span className={`text-lg font-bold ${
                      calculateOFF() >= -3.0 ? 'text-red-600' :
                      calculateOFF() >= -4.0 ? 'text-orange-600' :
                      calculateOFF() >= -5.0 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>{calculateOFF().toFixed(1)}mb</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">ACV (mb)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={offPressure.acv}
                        onChange={(e) => { const v = getFloat(e.currentTarget); setOffPressure(p => ({ ...p, acv: v })); }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">SFO (mb)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={offPressure.sfo}
                        onChange={(e) => { const v = getFloat(e.currentTarget); setOffPressure(p => ({ ...p, sfo: v })); }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">24hr Trend (mb)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={offPressure.trend24h}
                      onChange={(e) => { const v = getFloat(e.currentTarget); setOffPressure(p => ({ ...p, trend24h: v })); }}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    Onshore (SFO - SMF)
                    <span className={`text-lg font-bold ${
                      calculateON() >= 4.0 ? 'text-red-600' :
                      calculateON() >= 3.6 ? 'text-orange-600' :
                      calculateON() >= 3.0 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>{calculateON().toFixed(1)}mb</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">SFO (mb)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={onPressure.sfo}
                        onChange={(e) => { const v = getFloat(e.currentTarget); setOnPressure(p => ({ ...p, sfo: v })); }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">SMF (mb)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={onPressure.smf}
                        onChange={(e) => { const v = getFloat(e.currentTarget); setOnPressure(p => ({ ...p, smf: v })); }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">24hr Trend (mb)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={onPressure.trend24h}
                      onChange={(e) => { const v = getFloat(e.currentTarget); setOnPressure(p => ({ ...p, trend24h: v })); }}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg transition-colors duration-300">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>ON ≥ 3.6mb:</strong> Increases stratus likelihood | 
                  <strong> OFF ≤ -3.4mb:</strong> Decreases stratus likelihood
                </p>
              </div>
            </div>

            {/* Environmental Factors */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="h-5 w-5 text-green-500" />
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Environmental Factors</h2>
              </div>
              
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Base Inversion (ft)
                  </label>
                  <input
                    type="number"
                    value={baseInversion}
                    onChange={(e) => setBaseInversion(getInt(e.currentTarget))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {baseInversion < 500 ? '⚠️ No formation' : baseInversion < 1000 ? '⚠️ Delayed' : '✅ Normal'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    2K Winds (Direction °, Speed KT)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="0"
                      max="360"
                      step="10"
                      value={wind2k.direction}
                      onChange={(e) => { const v = getInt(e.currentTarget); setWind2k(w => ({ ...w, direction: v })); }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                    />
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={wind2k.speed}
                      onChange={(e) => { const v = getInt(e.currentTarget); setWind2k(w => ({ ...w, speed: v })); }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Month
                  </label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  >
                    <option value="May">May</option>
                    <option value="June">June</option>
                    <option value="July">July</option>
                    <option value="August">August</option>
                    <option value="September">September</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Minimum Afternoon Dewpoint °F
                </label>
                <input
                  type="number"
                  value={afternoonDewpoint}
                  onChange={(e) => setAfternoonDewpoint(getFloat(e.currentTarget))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                />
                {afternoonDewpoint < 42 && (
                  <p className="text-red-600 text-sm mt-1">⚠️ Below 42°F makes stratus improbable</p>
                )}
              </div>
            </div>

            {/* Synoptic Triggers */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Synoptic Triggers</h2>
                {hasTrigger() && <span className="text-sm bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-1 rounded">Early Onset More Likely ≤03Z</span>}
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-200">
                  <input
                    type="radio"
                    name="synopticTrigger"
                    value="deepeningTrough"
                    checked={selectedTrigger === 'deepeningTrough'}
                    onChange={(e) => setSelectedTrigger(e.target.checked ? e.target.value : '')}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Deepening Mid-Level Trough</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-200">
                  <input
                    type="radio"
                    name="synopticTrigger"
                    value="shortwaveTrough"
                    checked={selectedTrigger === 'shortwaveTrough'}
                    onChange={(e) => setSelectedTrigger(e.target.checked ? e.target.value : '')}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Shortwave/Vorticity Maximum</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-200">
                  <input
                    type="radio"
                    name="synopticTrigger"
                    value="longWaveTrough"
                    checked={selectedTrigger === 'longWaveTrough'}
                    onChange={(e) => setSelectedTrigger(e.target.checked ? e.target.value : '')}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Long-Wave Trough (East of Bay)</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-200">
                  <input
                    type="radio"
                    name="synopticTrigger"
                    value="shallowFront"
                    checked={selectedTrigger === 'shallowFront'}
                    onChange={(e) => setSelectedTrigger(e.target.checked ? e.target.value : '')}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Shallow Pre-Frontal Boundary</span>
                </label>
              </div>
              
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg transition-colors duration-300">
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  93% of early stratus onset cases (≤03Z) had one of these triggers present
                </p>
              </div>
            </div>

            {/* Synoptic Patterns */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">
              <div className="flex items-center gap-2 mb-4">
                <Wind className="h-5 w-5 text-purple-500" />
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Synoptic Patterns</h2>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">Multiple selections allowed</span>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Surface Patterns</h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-200">
                      <input
                        type="checkbox"
                        checked={synopticPatterns.thermalLow}
                        onChange={(e) => setSynopticPatterns({...synopticPatterns, thermalLow: e.target.checked})}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Thermal Low (Central Valley)</span>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-200">
                      <input
                        type="checkbox"
                        checked={synopticPatterns.surfaceHigh}
                        onChange={(e) => setSynopticPatterns({...synopticPatterns, surfaceHigh: e.target.checked})}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Surface High (Offshore)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upper-Level Patterns</h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-200">
                      <input
                        type="checkbox"
                        checked={synopticPatterns.upperRidge}
                        onChange={(e) => setSynopticPatterns({...synopticPatterns, upperRidge: e.target.checked})}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Upper Ridge</span>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-200">
                      <input
                        type="checkbox"
                        checked={synopticPatterns.upperTrough}
                        onChange={(e) => setSynopticPatterns({...synopticPatterns, upperTrough: e.target.checked})}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Upper Trough</span>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-200">
                      <input
                        type="checkbox"
                        checked={synopticPatterns.cutoffLow}
                        onChange={(e) => setSynopticPatterns({...synopticPatterns, cutoffLow: e.target.checked})}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Cutoff Low</span>
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg transition-colors duration-300">
                <p className="text-sm text-purple-800 dark:text-purple-300">
                  <strong>Optimal Pattern:</strong> Upper ridge + thermal low + offshore surface high enhances marine layer formation
                </p>
              </div>
            </div>
            {/* Burn-Off Analysis */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">
              <div className="flex items-center gap-2 mb-4">
                <Sun className="h-5 w-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Cohen Burn-Off Analysis</h2>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    14Z Ceiling Base Height (ft)
                  </label>
                  <input
                    type="number"
                    value={burnOff.base}
                    onChange={(e) => { const v = getInt(e.currentTarget); setBurnOff(b => ({ ...b, base: v })); }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cloud Top (ft)
                  </label>
                  <input
                    type="number"
                    value={burnOff.top}
                    onChange={(e) => { const v = getInt(e.currentTarget); setBurnOff(b => ({ ...b, top: v })); }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  />
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg transition-colors duration-300">
                <p className="text-sm text-orange-800 dark:text-orange-300">
                  <strong>Estimated SCT Time:</strong> {calculateBurnOffTime(burnOff.base, burnOff.top)} hours after sunrise
                  <br />
                  <strong>Burn Rate:</strong> ~200 ft/hr | <strong>Thickness:</strong> {burnOff.top - burnOff.base}ft
                </p>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 sticky top-6 transition-colors duration-300">
              <div className="flex items-center gap-2 mb-6">
                <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Forecast Summary</h2>
              </div>

              {/* Probability Gauge */}
              <div className="text-center mb-6">
                <div className="relative inline-block">
                  <div className="w-32 h-32 rounded-full border-8 border-gray-200 relative">
                    <div 
                      className={`absolute inset-0 rounded-full border-8 border-transparent ${
                        prediction.probability > 70 ? 'border-red-500' :
                        prediction.probability > 40 ? 'border-yellow-500' : 'border-green-500'
                      }`}
                      style={{
                        background: `conic-gradient(${
                          prediction.probability > 70 ? '#ef4444' :
                          prediction.probability > 40 ? '#f59e0b' : '#10b981'
                        } ${prediction.probability * 3.6}deg, #e5e7eb 0deg)`
                      }}
                    ></div>
                    <div className="absolute inset-4 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center transition-colors duration-300">
                      <span className="text-2xl font-bold text-gray-800 dark:text-white">{prediction.probability}%</span>
                    </div>
                  </div>
                </div>
                <p className="text-lg font-semibold mt-2 text-gray-700 dark:text-gray-300">Stratus Probability</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Confidence: {prediction.confidence}</p>
              </div>

              {/* Timing Results */}
              <div className="space-y-3 mb-6">
                {prediction.onsetWindow.mostProbable <= 24 ? (
                  <>
                    <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 transition-colors duration-300">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-blue-800 dark:text-blue-300">Onset Window</span>
                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {formatTime(prediction.onsetWindow.earliest)}-{formatTime(prediction.onsetWindow.latest)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-blue-700 dark:text-blue-400">Most Probable</span>
                        <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                          {formatTime(prediction.onsetWindow.mostProbable)}
                        </span>
                      </div>
                    </div>

                    <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4 transition-colors duration-300">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-green-800 dark:text-green-300">End Window</span>
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">
                          {formatTime(prediction.endWindow.earliest)}-{formatTime(prediction.endWindow.latest)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-green-700 dark:text-green-400">Most Probable</span>
                        <span className="text-xl font-bold text-green-600 dark:text-green-400">
                          {formatTime(prediction.endWindow.mostProbable)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-4 transition-colors duration-300">
                    <div className="text-center">
                      <span className="text-xl font-bold text-red-600 dark:text-red-400">No Stratus Event Expected</span>
                    </div>
                  </div>
                )}

                <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4 transition-colors duration-300">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-orange-800 dark:text-orange-300">Burn-Off (SCT)</span>
                    <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                      Sunrise + {prediction.burnOffHours}hrs
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-orange-200 dark:border-orange-700">
                    <span className="text-sm text-orange-700 dark:text-orange-400">SFO Sunrise</span>
                    <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                      {getSunriseTime()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4 transition-colors duration-300">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Analysis</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{prediction.reasoning}</p>
                {hasTrigger() && (
                  <p className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">⚡ Synoptic trigger detected - early onset more likely</p>
                )}
                {prediction.synopticEffects && prediction.synopticEffects.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Synoptic Pattern Effects:</p>
                    {prediction.synopticEffects.map((effect, idx) => (
                      <p key={idx} className="text-xs text-purple-600 dark:text-purple-400">• {effect}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Warnings */}
              {prediction.warnings.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-4 transition-colors duration-300">
                  <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Notice!
                  </h3>
                  <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
                    {prediction.warnings.map((warning, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-red-500 dark:text-red-400 mt-0.5">•</span>
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Based on Cohen-Lau SFO Marine Layer Study (1991-1994) • 613 case dataset</p>
        </div>
      </div>
    </div>
  );
}

export default App;