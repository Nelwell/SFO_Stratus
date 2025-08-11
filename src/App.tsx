import React, { useState, useEffect } from 'react';
import { Cloud, Sun, Wind, TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Sunrise calculation function
const calculateSunrise = (lat: number, lon: number, date: Date): string => {
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
  const P = Math.asin(0.39795 * Math.cos(0.98563 * (dayOfYear - 173) * Math.PI / 180));
  const argument = -Math.tan(lat * Math.PI / 180) * Math.tan(P);
  
  if (argument < -1 || argument > 1) {
    return "N/A"; // Polar day/night
  }
  
  const sunrise = 12 - 12 * Math.acos(argument) / Math.PI;
  const utcSunrise = sunrise - (lon / 15); // Convert to UTC
  
  const hours = Math.floor(utcSunrise);
  const minutes = Math.round((utcSunrise - hours) * 60);
  
  return `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}Z`;
};

// Round to nearest half hour
const roundToNearestHalfHour = (hours: number): number => {
  return Math.round(hours * 2) / 2;
};

// Format decimal hours to HHMM
const formatTime = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h.toString().padStart(2, '0')}${m.toString().padStart(2, '0')}Z`;
};

export default function App() {
  const [acv, setAcv] = useState(1013);
  const [sfo, setSfo] = useState(1019);
  const [acvTrend, setAcvTrend] = useState(-0.2);
  const [sfoOnshore, setSfoOnshore] = useState(1015);
  const [smf, setSmf] = useState(1011);
  const [smfTrend, setSmfTrend] = useState(0.5);
  const [temp850, setTemp850] = useState(12);
  const [temp925, setTemp925] = useState(15);
  const [surfaceTemp, setSurfaceTemp] = useState(18);
  const [dewPoint, setDewPoint] = useState(16);
  const [windSpeed, setWindSpeed] = useState(8);
  const [windDirection, setWindDirection] = useState(270);
  const [visibility, setVisibility] = useState(10);
  const [currentWeather, setCurrentWeather] = useState('clear');

  // Calculate gradients
  const offshoreGradient = acv - sfo;
  const onshoreGradient = sfoOnshore - smf;
  
  // Calculate temperature differences
  const inversion850 = temp850 - surfaceTemp;
  const inversion925 = temp925 - surfaceTemp;
  const dewPointSpread = surfaceTemp - dewPoint;

  // Stratus likelihood calculation
  const calculateStratusLikelihood = () => {
    let score = 0;
    
    // Offshore gradient (ACV - SFO)
    if (offshoreGradient >= 3.6) score += 2;
    else if (offshoreGradient >= 1.0) score += 1;
    else if (offshoreGradient <= -3.4) score -= 2;
    else if (offshoreGradient <= -1.0) score -= 1;
    
    // Onshore gradient (SFO - SMF)
    if (onshoreGradient >= 4.0) score += 2;
    else if (onshoreGradient >= 2.0) score += 1;
    else if (onshoreGradient <= -2.0) score -= 1;
    
    // Temperature inversions
    if (inversion850 >= 8) score += 2;
    else if (inversion850 >= 4) score += 1;
    
    if (inversion925 >= 6) score += 1;
    
    // Moisture
    if (dewPointSpread <= 2) score += 2;
    else if (dewPointSpread <= 4) score += 1;
    
    // Wind
    if (windSpeed <= 5 && windDirection >= 240 && windDirection <= 300) score += 1;
    
    return Math.max(0, Math.min(10, score + 5));
  };

  const stratusLikelihood = calculateStratusLikelihood();

  // Timing calculations
  const timingTable = {
    0: { onset: null, end: null },
    1: { onset: null, end: null },
    2: { onset: 4.0, end: 8.5 },
    3: { onset: 3.5, end: 9.0 },
    4: { onset: 3.0, end: 9.5 },
    5: { onset: 2.5, end: 10.0 },
    6: { onset: 2.0, end: 10.5 },
    7: { onset: 1.5, end: 11.0 },
    8: { onset: 1.0, end: 11.5 },
    9: { onset: 0.5, end: 12.0 },
    10: { onset: 0.0, end: 12.5 }
  };

  const timing = timingTable[stratusLikelihood as keyof typeof timingTable];
  const onsetTime = timing.onset !== null ? formatTime(roundToNearestHalfHour(timing.onset)) : 'N/A';
  const endTime = timing.end !== null ? formatTime(roundToNearestHalfHour(timing.end)) : 'N/A';

  // Calculate sunrise for SFO
  const today = new Date();
  const sunriseTime = calculateSunrise(37.6213, -122.3790, today);

  const getGradientColor = (value: number, type: 'offshore' | 'onshore') => {
    if (type === 'offshore') {
      if (value >= 3.6) return 'text-blue-400';
      if (value <= -3.4) return 'text-green-400';
      return 'text-yellow-400';
    } else {
      if (value >= 4.0) return 'text-blue-400';
      if (value <= -2.0) return 'text-green-400';
      return 'text-yellow-400';
    }
  };

  const getGradientIcon = (value: number, type: 'offshore' | 'onshore') => {
    if (type === 'offshore') {
      if (value >= 3.6) return <TrendingUp className="w-4 h-4" />;
      if (value <= -3.4) return <TrendingDown className="w-4 h-4" />;
      return <Minus className="w-4 h-4" />;
    } else {
      if (value >= 4.0) return <TrendingUp className="w-4 h-4" />;
      if (value <= -2.0) return <TrendingDown className="w-4 h-4" />;
      return <Minus className="w-4 h-4" />;
    }
  };

  const getLikelihoodColor = (score: number) => {
    if (score >= 8) return 'text-red-400';
    if (score >= 6) return 'text-orange-400';
    if (score >= 4) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getLikelihoodText = (score: number) => {
    if (score >= 8) return 'Very High';
    if (score >= 6) return 'High';
    if (score >= 4) return 'Moderate';
    if (score >= 2) return 'Low';
    return 'Very Low';
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-3">
            <Cloud className="w-10 h-10 text-blue-400" />
            Marine Stratus Forecast Tool
          </h1>
          <p className="text-gray-400">San Francisco Bay Area Marine Layer Prediction</p>
        </div>

        {/* Pressure Gradients */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Wind className="w-6 h-6 text-blue-400" />
            Pressure Gradients
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Offshore Gradient */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-medium">Offshore (ACV - SFO)</h3>
                <span className={`font-bold text-xl flex items-center gap-1 ${getGradientColor(offshoreGradient, 'offshore')}`}>
                  {getGradientIcon(offshoreGradient, 'offshore')}
                  {offshoreGradient > 0 ? '+' : ''}{offshoreGradient.toFixed(1)}mb
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">ACV (mb)</label>
                  <input
                    type="number"
                    value={acv}
                    onChange={(e) => setAcv(Number(e.target.value))}
                    className="w-full bg-gray-700 rounded px-3 py-2 text-white"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SFO (mb)</label>
                  <input
                    type="number"
                    value={sfo}
                    onChange={(e) => setSfo(Number(e.target.value))}
                    className="w-full bg-gray-700 rounded px-3 py-2 text-white"
                    step="0.1"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">24hr Trend (mb)</label>
                <input
                  type="number"
                  value={acvTrend}
                  onChange={(e) => setAcvTrend(Number(e.target.value))}
                  className="w-full bg-gray-700 rounded px-3 py-2 text-white"
                  step="0.1"
                />
              </div>
            </div>

            {/* Onshore Gradient */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-medium">Onshore (SFO - SMF)</h3>
                <span className={`font-bold text-xl flex items-center gap-1 ${getGradientColor(onshoreGradient, 'onshore')}`}>
                  {getGradientIcon(onshoreGradient, 'onshore')}
                  {onshoreGradient > 0 ? '+' : ''}{onshoreGradient.toFixed(1)}mb
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SFO (mb)</label>
                  <input
                    type="number"
                    value={sfoOnshore}
                    onChange={(e) => setSfoOnshore(Number(e.target.value))}
                    className="w-full bg-gray-700 rounded px-3 py-2 text-white"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SMF (mb)</label>
                  <input
                    type="number"
                    value={smf}
                    onChange={(e) => setSmf(Number(e.target.value))}
                    className="w-full bg-gray-700 rounded px-3 py-2 text-white"
                    step="0.1"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">24hr Trend (mb)</label>
                <input
                  type="number"
                  value={smfTrend}
                  onChange={(e) => setSmfTrend(Number(e.target.value))}
                  className="w-full bg-gray-700 rounded px-3 py-2 text-white"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* Gradient Interpretation */}
          <div className="mt-4 p-4 bg-gray-700 rounded-lg text-sm">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <span className="text-blue-400">ON ≥ 3.6mb:</span> Increases stratus likelihood |{' '}
                <span className="text-green-400">OFF ≤ -3.4mb:</span> Decreases stratus likelihood
              </div>
              <div>
                <span className="text-blue-400">ON ≥ 4.0mb:</span> Increases stratus likelihood |{' '}
                <span className="text-green-400">OFF ≤ -2.0mb:</span> Decreases stratus likelihood
              </div>
            </div>
          </div>
        </div>

        {/* Temperature Profile */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Temperature Profile</h2>
          
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">850mb Temp (°C)</label>
              <input
                type="number"
                value={temp850}
                onChange={(e) => setTemp850(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">925mb Temp (°C)</label>
              <input
                type="number"
                value={temp925}
                onChange={(e) => setTemp925(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Surface Temp (°C)</label>
              <input
                type="number"
                value={surfaceTemp}
                onChange={(e) => setSurfaceTemp(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Dew Point (°C)</label>
              <input
                type="number"
                value={dewPoint}
                onChange={(e) => setDewPoint(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-white"
              />
            </div>
          </div>

          <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-gray-700 rounded">
              <span className="text-gray-400">850mb Inversion:</span>
              <span className={`ml-2 font-semibold ${inversion850 >= 8 ? 'text-red-400' : inversion850 >= 4 ? 'text-yellow-400' : 'text-green-400'}`}>
                {inversion850 > 0 ? '+' : ''}{inversion850.toFixed(1)}°C
              </span>
            </div>
            <div className="p-3 bg-gray-700 rounded">
              <span className="text-gray-400">925mb Inversion:</span>
              <span className={`ml-2 font-semibold ${inversion925 >= 6 ? 'text-yellow-400' : 'text-green-400'}`}>
                {inversion925 > 0 ? '+' : ''}{inversion925.toFixed(1)}°C
              </span>
            </div>
            <div className="p-3 bg-gray-700 rounded">
              <span className="text-gray-400">Dew Point Spread:</span>
              <span className={`ml-2 font-semibold ${dewPointSpread <= 2 ? 'text-red-400' : dewPointSpread <= 4 ? 'text-yellow-400' : 'text-green-400'}`}>
                {dewPointSpread.toFixed(1)}°C
              </span>
            </div>
          </div>
        </div>

        {/* Surface Conditions */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Surface Conditions</h2>
          
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Wind Speed (kt)</label>
              <input
                type="number"
                value={windSpeed}
                onChange={(e) => setWindSpeed(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Wind Direction (°)</label>
              <input
                type="number"
                value={windDirection}
                onChange={(e) => setWindDirection(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-white"
                min="0"
                max="360"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Visibility (sm)</label>
              <input
                type="number"
                value={visibility}
                onChange={(e) => setVisibility(Number(e.target.value))}
                className="w-full bg-gray-700 rounded px-3 py-2 text-white"
                step="0.1"
              />
            </div>
          </div>
        </div>

        {/* Forecast Summary */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Sun className="w-6 h-6 text-yellow-400" />
            Forecast Summary
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="p-4 bg-gray-700 rounded-lg">
                <h3 className="text-lg font-medium mb-2">Stratus Likelihood</h3>
                <div className="flex items-center gap-3">
                  <div className={`text-3xl font-bold ${getLikelihoodColor(stratusLikelihood)}`}>
                    {stratusLikelihood}/10
                  </div>
                  <div className={`text-lg ${getLikelihoodColor(stratusLikelihood)}`}>
                    {getLikelihoodText(stratusLikelihood)}
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-700 rounded-lg">
                <h3 className="text-lg font-medium mb-2">Timing</h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-gray-400">Onset:</span>
                    <span className="ml-2 font-semibold text-blue-400">{onsetTime}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Burn-off:</span>
                    <span className="ml-2 font-semibold text-orange-400">{endTime}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">SFO Sunrise:</span>
                    <span className="ml-2 font-semibold text-yellow-400">{sunriseTime}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-gray-700 rounded-lg">
              <h3 className="text-lg font-medium mb-3">Key Factors</h3>
              <div className="space-y-2 text-sm">
                <div className={`flex items-center gap-2 ${offshoreGradient >= 3.6 ? 'text-red-400' : offshoreGradient <= -3.4 ? 'text-green-400' : 'text-yellow-400'}`}>
                  <div className="w-2 h-2 rounded-full bg-current"></div>
                  Offshore Gradient: {offshoreGradient > 0 ? '+' : ''}{offshoreGradient.toFixed(1)}mb
                </div>
                <div className={`flex items-center gap-2 ${onshoreGradient >= 4.0 ? 'text-red-400' : onshoreGradient <= -2.0 ? 'text-green-400' : 'text-yellow-400'}`}>
                  <div className="w-2 h-2 rounded-full bg-current"></div>
                  Onshore Gradient: {onshoreGradient > 0 ? '+' : ''}{onshoreGradient.toFixed(1)}mb
                </div>
                <div className={`flex items-center gap-2 ${inversion850 >= 8 ? 'text-red-400' : inversion850 >= 4 ? 'text-yellow-400' : 'text-green-400'}`}>
                  <div className="w-2 h-2 rounded-full bg-current"></div>
                  850mb Inversion: {inversion850 > 0 ? '+' : ''}{inversion850.toFixed(1)}°C
                </div>
                <div className={`flex items-center gap-2 ${dewPointSpread <= 2 ? 'text-red-400' : dewPointSpread <= 4 ? 'text-yellow-400' : 'text-green-400'}`}>
                  <div className="w-2 h-2 rounded-full bg-current"></div>
                  Moisture: {dewPointSpread.toFixed(1)}°C spread
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}