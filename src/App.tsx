import React, { useState, useEffect } from 'react';
import { Cloud, Sun, Wind, Thermometer, Gauge, AlertTriangle, Clock, Eye, Moon } from 'lucide-react';

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

interface BurnOffData {
  base: number;
  top: number;
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
    sfo: 1015.0,
    smf: 0,
    acv: 1018.0,
    trend24h: -0.2
  });
  const [baseInversion, setBaseInversion] = useState<number>(1400);
  const [wind2k, setWind2k] = useState<string>('W15');
  const [triggers, setTriggers] = useState<SynopticTrigger>({
    deepeningTrough: false,
    shortwaveTrough: false,
    longWaveTrough: false,
    shallowFront: false
  });
  const [burnOff, setBurnOff] = useState<BurnOffData>({
    base: 800,
    top: 1700
  });
  const [month, setMonth] = useState<string>('July');
  const [afternoonDewpoint, setAfternoonDewpoint] = useState<number>(55);
  const [darkMode, setDarkMode] = useState<boolean>(false);

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
      { si: 9, start: '01Z', end: '21Z', noCigProb: 5.9 },
      { si: 10, start: '01Z', end: '21Z', noCigProb: 11.1 },
      { si: 11, start: '03Z', end: '20Z', noCigProb: 10.7 },
      { si: 12, start: '03Z', end: '19Z', noCigProb: 11.4 },
      { si: 13, start: '06Z', end: '18Z', noCigProb: 20.6 },
      { si: 14, start: '07Z', end: '17Z', noCigProb: 21.5 },
      { si: 15, start: '08Z', end: '17Z', noCigProb: 24.4 },
      { si: 16, start: '09Z', end: '17Z', noCigProb: 20.8 },
      { si: 17, start: '09Z', end: '17Z', noCigProb: 20.0 },
      { si: 18, start: '09Z', end: '17Z', noCigProb: 21.6 },
      { si: 19, start: '10Z', end: '17Z', noCigProb: 23.3 },
      { si: 20, start: '10Z', end: '17Z', noCigProb: 44.4 },
      { si: 21, start: '10Z', end: '17Z', noCigProb: 60.0 },
      { si: 22, start: '10Z', end: '17Z', noCigProb: 75.0 },
      { si: 23, start: '11Z', end: '17Z', noCigProb: 80.0 },
      { si: 24, start: '13Z', end: '17Z', noCigProb: 70.0 },
      { si: 25, start: '13Z', end: '17Z', noCigProb: 83.3 }
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
    return triggers.deepeningTrough || triggers.shortwaveTrough || 
           triggers.longWaveTrough || triggers.shallowFront;
  };

  const getFinalPrediction = () => {
    const si = calculateSI();
    const on = calculateON();
    const off = calculateOFF();
    const siTiming = getSITiming(si);
    const monthlyThresh = getMonthlyThresholds();
    
    let startTime = parseInt(siTiming.start.replace('Z', ''));
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
        reasoning: 'Insufficient inversion height for marine layer development'
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
        startTime = Math.max(1, startTime - Math.round(onPressure.trend24h));
      }
    }

    if (off >= 3.4) {
      probability *= 0.7;
      if (offPressure.trend24h > 0) {
        startTime += Math.round(offPressure.trend24h);
      }
    }

    // Smooth base inversion effects
    if (baseInversion < 1200) {
      let inversionFactor = 1.0;
      let delayHours = 0;
      
      if (baseInversion >= 1000) {
        // Gradual effects from 1200ft to 1000ft
        inversionFactor = 0.8 + (0.2 * (baseInversion - 1000) / 200);
        delayHours = Math.round(2 * (1200 - baseInversion) / 200);
      } else {
        // More significant effects below 1000ft
        inversionFactor = Math.max(0.4, 0.8 * Math.pow(baseInversion / 1000, 0.5));
        delayHours = 2 + Math.round(2 * (1000 - baseInversion) / 500);
      }
      
      probability *= inversionFactor;
      startTime += delayHours;
      warnings.push(`Low inversion height (${baseInversion}ft) ${baseInversion < 1000 ? 'significantly delays' : 'delays'} penetration through gaps`);
    }

    // Synoptic trigger effects
    if (hasTrigger()) {
      startTime = Math.min(startTime, 3);
      probability *= 1.3;
      confidence = 'High';
    }

    // Wind effects
    if (wind2k.startsWith('W') && parseInt(wind2k.slice(1)) > 10) {
      startTime = Math.max(1, startTime - 1);
      probability *= 1.1;
    }

    // SI confidence adjustments
    if (si < 10 || si > 22) confidence = 'High';
    
    probability = Math.min(95, Math.max(5, probability));
    
    return {
      startTime: startTime > 24 ? 'No Event' : `${startTime.toString().padStart(2, '0')}Z`,
      endTime: siTiming.end,
      probability: Math.round(probability),
      confidence,
      warnings,
      reasoning: `SI=${si.toFixed(1)}, ON=${on.toFixed(1)}mb, OFF=${off.toFixed(1)}mb, BI=${baseInversion}ft`
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
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">SFO Marine Layer Forecaster</h1>
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
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Max Temperature (20-24Z) °F
                  </label>
                  <input
                    type="number"
                    value={maxTemp}
                    onChange={(e) => setMaxTemp(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Max Dewpoint (20-24Z) °F
                  </label>
                  <input
                    type="number"
                    value={maxDewpoint}
                    onChange={(e) => setMaxDewpoint(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  />
                </div>
              </div>
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors duration-300">
                <div className="flex justify-between text-sm">
                  <span className="text-green-600 font-medium">SI &gt; 22: Low Probability (21%)</span>
                  <span className="text-red-600 font-medium">SI &lt; 10: High Probability (91%)</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mt-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      si < 10 ? 'bg-red-500' : si > 22 ? 'bg-green-500' : 'bg-yellow-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, ((30 - si) / 20) * 100))}%` }}
                  ></div>
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
                        onChange={(e) => setOffPressure({...offPressure, acv: parseFloat(e.target.value)})}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">SFO (mb)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={offPressure.sfo}
                        onChange={(e) => setOffPressure({...offPressure, sfo: parseFloat(e.target.value)})}
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
                      onChange={(e) => setOffPressure({...offPressure, trend24h: parseFloat(e.target.value)})}
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
                        onChange={(e) => setOnPressure({...onPressure, sfo: parseFloat(e.target.value)})}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">SMF (mb)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={onPressure.smf}
                        onChange={(e) => setOnPressure({...onPressure, smf: parseFloat(e.target.value)})}
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
                      onChange={(e) => setOnPressure({...onPressure, trend24h: parseFloat(e.target.value)})}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg transition-colors duration-300">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>ON ≥ 3.6mb:</strong> Increases stratus likelihood | 
                  <strong> OFF ≥ 3.4mb:</strong> Decreases stratus likelihood
                </p>
              </div>
            </div>

            {/* Environmental Factors */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-5 w-5 text-purple-500" />
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
                    onChange={(e) => setBaseInversion(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {baseInversion < 500 ? '⚠️ No formation' : baseInversion < 1000 ? '⚠️ Delayed' : '✅ Normal'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    2K Winds
                  </label>
                  <input
                    type="text"
                    value={wind2k}
                    onChange={(e) => setWind2k(e.target.value)}
                    placeholder="W15, E08, etc."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  />
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
                  onChange={(e) => setAfternoonDewpoint(parseFloat(e.target.value))}
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
                {hasTrigger() && <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Early Onset Likely ≤03Z</span>}
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={triggers.deepeningTrough}
                    onChange={(e) => setTriggers({...triggers, deepeningTrough: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Deepening Mid-Level Trough</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={triggers.shortwaveTrough}
                    onChange={(e) => setTriggers({...triggers, shortwaveTrough: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Shortwave/Vorticity Maximum</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={triggers.longWaveTrough}
                    onChange={(e) => setTriggers({...triggers, longWaveTrough: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Long-Wave Trough (East of Bay)</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={triggers.shallowFront}
                    onChange={(e) => setTriggers({...triggers, shallowFront: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Shallow Pre-Frontal Boundary</span>
                </label>
              </div>
              
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg transition-colors duration-300">
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  93% of early stratus onset cases (≤03Z) have at least one trigger present
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
                    14Z Base Height (ft)
                  </label>
                  <input
                    type="number"
                    value={burnOff.base}
                    onChange={(e) => setBurnOff({...burnOff, base: parseInt(e.target.value) || 0})}
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
                    onChange={(e) => setBurnOff({...burnOff, top: parseInt(e.target.value) || 0})}
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
              <div className="space-y-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 transition-colors duration-300">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-blue-800 dark:text-blue-300">Onset Time</span>
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{prediction.startTime}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-blue-800 dark:text-blue-300">End Time</span>
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{prediction.endTime}</span>
                  </div>
                </div>

                <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4 transition-colors duration-300">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-orange-800 dark:text-orange-300">SCT Time</span>
                    <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                      +{calculateBurnOffTime(burnOff.base, burnOff.top)}hrs sunrise
                    </span>
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4 transition-colors duration-300">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Analysis</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{prediction.reasoning}</p>
                {hasTrigger() && (
                  <p className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">⚡ Synoptic trigger detected - early onset likely</p>
                )}
              </div>

              {/* Warnings */}
              {prediction.warnings.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-4 transition-colors duration-300">
                  <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Warnings
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