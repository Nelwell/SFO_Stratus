import React, { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, Thermometer, Wind, Gauge, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { fetchKSFOTemperatureData, fetchAllStationPressureData, formatTimestamp, type TemperatureData, type PressureData } from './utils/nwsApi';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [maxTemp, setMaxTemp] = useState<string>('');
  const [maxDewpoint, setMaxDewpoint] = useState<string>('');
  const [acvPressure, setAcvPressure] = useState<string>('');
  const [sfoPressure, setSfoPressure] = useState<string>('');
  const [smfPressure, setSmfPressure] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [pressureLoading, setPressureLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pressureError, setPressureError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [pressureLastUpdated, setPressureLastUpdated] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-fetch temperature data on component mount
  useEffect(() => {
    fetchTemperatureData();
  }, []);

  const fetchTemperatureData = async () => {
    if (!isOnline) {
      setError('No internet connection available');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const data: TemperatureData = await fetchKSFOTemperatureData();
      
      if (data.maxTemp !== null) {
        setMaxTemp(data.maxTemp.toString());
      }
      if (data.maxDewpoint !== null) {
        setMaxDewpoint(data.maxDewpoint.toString());
      }
      
      setLastUpdated(new Date().toLocaleString());
    } catch (err) {
      console.error('Temperature fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch temperature data');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPressureData = async () => {
    if (!isOnline) {
      setPressureError('No internet connection available');
      return;
    }

    setPressureLoading(true);
    setPressureError(null);
    
    try {
      const data = await fetchAllStationPressureData();
      
      if (data.acv.pressure !== null) {
        setAcvPressure(data.acv.pressure.toString());
      }
      if (data.sfo.pressure !== null) {
        setSfoPressure(data.sfo.pressure.toString());
      }
      if (data.smf.pressure !== null) {
        setSmfPressure(data.smf.pressure.toString());
      }
      
      setPressureLastUpdated(new Date().toLocaleString());
    } catch (err) {
      console.error('Pressure fetch error:', err);
      setPressureError(err instanceof Error ? err.message : 'Failed to fetch pressure data');
    } finally {
      setPressureLoading(false);
    }
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Calculate Showalter Index
  const calculateSI = () => {
    const temp = parseFloat(maxTemp);
    const dewpoint = parseFloat(maxDewpoint);
    
    if (isNaN(temp) || isNaN(dewpoint)) return null;
    
    return Math.round((temp - dewpoint) * 10) / 10;
  };

  // Calculate pressure gradients
  const calculateOffshoreGradient = () => {
    const acv = parseFloat(acvPressure);
    const sfo = parseFloat(sfoPressure);
    
    if (isNaN(acv) || isNaN(sfo)) return null;
    
    return Math.round((acv - sfo) * 10) / 10;
  };

  const calculateOnshoreGradient = () => {
    const sfo = parseFloat(sfoPressure);
    const smf = parseFloat(smfPressure);
    
    if (isNaN(sfo) || isNaN(smf)) return null;
    
    return Math.round((sfo - smf) * 10) / 10;
  };

  const si = calculateSI();
  const offshoreGradient = calculateOffshoreGradient();
  const onshoreGradient = calculateOnshoreGradient();

  // Determine stratus probability based on SI and gradients
  const getStratusProbability = () => {
    if (si === null) return null;
    
    let probability = 50; // Base probability
    
    // SI contribution (primary factor)
    if (si < 13) {
      probability = 90;
    } else if (si > 22) {
      probability = 20;
    } else {
      // Linear interpolation between 13 and 22
      probability = 90 - ((si - 13) / (22 - 13)) * 70;
    }
    
    // Pressure gradient adjustments (secondary factors)
    if (offshoreGradient !== null) {
      if (offshoreGradient < -2) probability += 10; // Strong offshore gradient increases probability
      if (offshoreGradient > 2) probability -= 10; // Onshore gradient decreases probability
    }
    
    if (onshoreGradient !== null) {
      if (onshoreGradient > 2) probability += 5; // Onshore gradient increases probability slightly
      if (onshoreGradient < -2) probability -= 5; // Offshore gradient decreases probability slightly
    }
    
    return Math.max(0, Math.min(100, Math.round(probability)));
  };

  const stratusProbability = getStratusProbability();

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white transition-colors duration-300">
              SFO Stratus Prediction Tool
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2 transition-colors duration-300">
              Marine layer forecasting for San Francisco International Airport
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
              isOnline 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            } transition-colors duration-300`}>
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all duration-300 border border-gray-200 dark:border-gray-700"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? (
                <Sun className="w-5 h-5 text-yellow-500" />
              ) : (
                <Cloud className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Temperature Data Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg transition-colors duration-300">
                  <Thermometer className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-300">
                    Temperature Data
                  </h2>
                  <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-300">
                    <Wifi className="w-3 h-3" />
                    <span>Auto-populated from NWS METAR (KSFO) 20Z-24Z window</span>
                  </div>
                </div>
              </div>
              <button
                onClick={fetchTemperatureData}
                disabled={isLoading || !isOnline}
                className="p-2 bg-blue-50 dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-lg transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Refresh temperature data"
              >
                <RefreshCw className={`w-5 h-5 text-blue-600 dark:text-blue-400 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                  Maximum Temperature (°F)
                </label>
                <input
                  type="number"
                  value={maxTemp}
                  onChange={(e) => setMaxTemp(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  placeholder="Enter max temperature"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                  Maximum Dewpoint (°F)
                </label>
                <input
                  type="number"
                  value={maxDewpoint}
                  onChange={(e) => setMaxDewpoint(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                  placeholder="Enter max dewpoint"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg transition-colors duration-300">
                  <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}

              {lastUpdated && (
                <div className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">
                  Last updated: {lastUpdated}
                </div>
              )}
            </div>
          </div>

          {/* Pressure Gradients Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg transition-colors duration-300">
                  <Gauge className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-300">
                    Pressure Gradients
                  </h2>
                </div>
              </div>
              <button
                onClick={fetchPressureData}
                disabled={pressureLoading || !isOnline}
                className="px-4 py-2 bg-purple-50 dark:bg-purple-900 hover:bg-purple-100 dark:hover:bg-purple-800 rounded-lg transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-purple-600 dark:text-purple-400"
              >
                {pressureLoading ? (
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : (
                  'Auto-fill'
                )}
              </button>
            </div>

            <div className="space-y-6">
              {/* Gradient Results */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors duration-300">
                  <div className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">Offshore (ACV - SFO)</div>
                  <div className={`text-2xl font-bold ${
                    offshoreGradient === null ? 'text-gray-400' : 
                    offshoreGradient < 0 ? 'text-green-600' : 'text-red-600'
                  } transition-colors duration-300`}>
                    {offshoreGradient !== null ? `${offshoreGradient > 0 ? '+' : ''}${offshoreGradient}mb` : '--'}
                  </div>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors duration-300">
                  <div className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">Onshore (SFO - SMF)</div>
                  <div className={`text-2xl font-bold ${
                    onshoreGradient === null ? 'text-gray-400' : 
                    onshoreGradient > 0 ? 'text-red-600' : 'text-green-600'
                  } transition-colors duration-300`}>
                    {onshoreGradient !== null ? `${onshoreGradient > 0 ? '+' : ''}${onshoreGradient}mb` : '--'}
                  </div>
                </div>
              </div>

              {/* Pressure Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                      ACV (mb)
                    </label>
                    <input
                      type="number"
                      value={acvPressure}
                      onChange={(e) => setAcvPressure(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                      placeholder="1013"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                      SFO (mb)
                    </label>
                    <input
                      type="number"
                      value={sfoPressure}
                      onChange={(e) => setSfoPressure(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                      placeholder="1019"
                      step="0.1"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                      SFO (mb)
                    </label>
                    <input
                      type="number"
                      value={sfoPressure}
                      onChange={(e) => setSfoPressure(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                      placeholder="1015"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                      SMF (mb)
                    </label>
                    <input
                      type="number"
                      value={smfPressure}
                      onChange={(e) => setSmfPressure(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                      placeholder="1011"
                      step="0.1"
                    />
                  </div>
                </div>
              </div>

              {pressureError && (
                <div className="p-3 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg transition-colors duration-300">
                  <p className="text-red-600 dark:text-red-400 text-sm">{pressureError}</p>
                </div>
              )}

              {pressureLastUpdated && (
                <div className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">
                  Last updated: {pressureLastUpdated}
                </div>
              )}
            </div>
          </div>

          {/* Showalter Index Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg transition-colors duration-300">
                <Wind className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-300">
                  Showalter Index
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">
                  Temperature - Dewpoint spread
                </p>
              </div>
            </div>

            <div className="text-center">
              <div className="text-6xl font-bold mb-4 transition-colors duration-300">
                <span className={
                  si === null ? 'text-gray-400' :
                  si < 13 ? 'text-red-500' :
                  si > 22 ? 'text-green-500' :
                  'text-yellow-500'
                }>
                  {si !== null ? si.toFixed(1) : '--'}
                </span>
              </div>
              <div className="text-lg text-gray-600 dark:text-gray-400 transition-colors duration-300">
                {si !== null ? `${maxTemp}°F - ${maxDewpoint}°F = ${si.toFixed(1)}` : 'Enter temperature data'}
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
              </div>
            </div>
          </div>

          {/* Stratus Probability Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg transition-colors duration-300">
                <CloudRain className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-300">
                  Stratus Probability
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">
                  Marine layer formation likelihood
                </p>
              </div>
            </div>

            <div className="text-center">
              <div className="text-6xl font-bold mb-4 transition-colors duration-300">
                <span className={
                  stratusProbability === null ? 'text-gray-400' :
                  stratusProbability >= 70 ? 'text-red-500' :
                  stratusProbability >= 40 ? 'text-yellow-500' :
                  'text-green-500'
                }>
                  {stratusProbability !== null ? `${stratusProbability}%` : '--%'}
                </span>
              </div>
              
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">
                <div className="flex justify-between">
                  <span>Showalter Index:</span>
                  <span className="font-medium">{si !== null ? si.toFixed(1) : '--'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Offshore Gradient:</span>
                  <span className="font-medium">{offshoreGradient !== null ? `${offshoreGradient}mb` : '--'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Onshore Gradient:</span>
                  <span className="font-medium">{onshoreGradient !== null ? `${onshoreGradient}mb` : '--'}</span>
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors duration-300">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                  Probability Scale
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                  <div 
                    className={`h-3 rounded-full transition-all duration-500 ${
                      stratusProbability === null ? 'bg-gray-400' :
                      stratusProbability >= 70 ? 'bg-red-500' :
                      stratusProbability >= 40 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${stratusProbability || 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1 transition-colors duration-300">
                  <span>Low (0%)</span>
                  <span>Moderate (50%)</span>
                  <span>High (100%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-gray-500 dark:text-gray-400 text-sm transition-colors duration-300">
          <p>
            Data sourced from National Weather Service METAR observations. 
            This tool is for educational and planning purposes only.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;