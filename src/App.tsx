import React, { useState, useEffect } from 'react';
import { Cloud, Thermometer, Droplets, Wind, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { fetchKSFOTemperatureData, fetchAllStationPressureData, formatTimestamp, type TemperatureData, type PressureData } from './utils/nwsApi';

function App() {
  // Existing state variables
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [maxTemp, setMaxTemp] = useState<string>('');
  const [maxDewpoint, setMaxDewpoint] = useState<string>('');
  const [acvPressure, setAcvPressure] = useState<string>('');
  const [sfoPressure, setSfoPressure] = useState<string>('');
  const [smfPressure, setSmfPressure] = useState<string>('');
  
  // Auto-population state
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [dataStatus, setDataStatus] = useState<string>('');
  
  // Pressure gradient auto-fill state
  const [pressureLoading, setPressureLoading] = useState(false);
  const [pressureStatus, setPressureStatus] = useState<string>('');

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Auto-populate temperature data
  const handleAutoPopulate = async () => {
    setIsLoading(true);
    setDataStatus('Fetching data...');
    
    try {
      const data: TemperatureData = await fetchKSFOTemperatureData();
      
      if (data.maxTemp !== null) {
        setMaxTemp(data.maxTemp.toString());
      }
      
      if (data.maxDewpoint !== null) {
        setMaxDewpoint(data.maxDewpoint.toString());
      }
      
      setLastUpdated(new Date().toLocaleString());
      setDataStatus(`✓ Auto-populated from ${data.dataSource}`);
      
    } catch (error) {
      console.error('Auto-populate error:', error);
      setDataStatus(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-populate pressure data
  const fetchPressureData = async () => {
    setPressureLoading(true);
    setPressureStatus('Fetching pressure data...');
    
    try {
      const data = await fetchAllStationPressureData();
      
      // Set pressure values
      if (data.acv.pressure !== null) {
        setAcvPressure(data.acv.pressure.toString());
      }
      if (data.sfo.pressure !== null) {
        setSfoPressure(data.sfo.pressure.toString());
      }
      if (data.smf.pressure !== null) {
        setSmfPressure(data.smf.pressure.toString());
      }
      
      // Create status message with timestamps
      const timestamps = [
        `ACV: ${formatTimestamp(data.acv.timestamp)}`,
        `SFO: ${formatTimestamp(data.sfo.timestamp)}`,
        `SMF: ${formatTimestamp(data.smf.timestamp)}`
      ].join(', ');
      
      setPressureStatus(`✓ Auto-populated from 6-hourly METARs (${timestamps})`);
      
    } catch (error) {
      console.error('Pressure fetch error:', error);
      setPressureStatus(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setPressureLoading(false);
    }
  };

  // Calculate values
  const maxTempNum = parseFloat(maxTemp) || 0;
  const maxDewpointNum = parseFloat(maxDewpoint) || 0;
  const acvPressureNum = parseFloat(acvPressure) || 0;
  const sfoPressureNum = parseFloat(sfoPressure) || 0;
  const smfPressureNum = parseFloat(smfPressure) || 0;

  // Calculate Stratus Index (SI)
  const si = maxTempNum - maxDewpointNum;

  // Calculate pressure gradients
  const offshoreGradient = acvPressureNum - sfoPressureNum;
  const onshoreGradient = sfoPressureNum - smfPressureNum;

  // Determine stratus probability
  const getStratusProbability = () => {
    if (si < 13) return { text: 'High (90%)', color: 'text-red-600' };
    if (si > 22) return { text: 'Low (20%)', color: 'text-green-600' };
    return { text: 'Moderate', color: 'text-yellow-600' };
  };

  const stratusProbability = getStratusProbability();

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-3">
            <Cloud className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              SFO Stratus Prediction Tool
            </h1>
          </div>
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>

        {/* Temperature Data Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 transition-colors duration-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
              <Thermometer className="w-5 h-5 mr-2 text-orange-500" />
              Temperature Data
            </h2>
            <div className="flex items-center space-x-2">
              {dataStatus && (
                <div className="flex items-center space-x-1">
                  {dataStatus.startsWith('✓') ? (
                    <Wifi className="w-4 h-4 text-green-500" />
                  ) : dataStatus.startsWith('✗') ? (
                    <WifiOff className="w-4 h-4 text-red-500" />
                  ) : null}
                  <span className={`text-xs ${
                    dataStatus.startsWith('✓') ? 'text-green-600 dark:text-green-400' :
                    dataStatus.startsWith('✗') ? 'text-red-600 dark:text-red-400' :
                    'text-gray-600 dark:text-gray-400'
                  }`}>
                    {dataStatus}
                  </span>
                </div>
              )}
              <button
                onClick={handleAutoPopulate}
                disabled={isLoading}
                className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm rounded-md transition-colors duration-200"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Loading...' : 'Auto-populate'}</span>
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Max Temperature (°F)
              </label>
              <input
                type="number"
                value={maxTemp}
                onChange={(e) => setMaxTemp(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-colors duration-200"
                placeholder="Enter max temperature"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Max Dewpoint (°F)
              </label>
              <input
                type="number"
                value={maxDewpoint}
                onChange={(e) => setMaxDewpoint(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-colors duration-200"
                placeholder="Enter max dewpoint"
              />
            </div>
          </div>
          
          {dataStatus && (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
              <Wifi className="w-3 h-3 mr-1" />
              Auto-populated from NWS METAR (KSFO) 20Z-24Z window
            </div>
          )}
        </div>

        {/* Pressure Gradients Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 transition-colors duration-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
              <Wind className="w-5 h-5 mr-2 text-blue-500" />
              Pressure Gradients
            </h2>
            <div className="flex items-center space-x-2">
              {pressureStatus && (
                <div className="flex items-center space-x-1">
                  {pressureStatus.startsWith('✓') ? (
                    <Wifi className="w-4 h-4 text-green-500" />
                  ) : pressureStatus.startsWith('✗') ? (
                    <WifiOff className="w-4 h-4 text-red-500" />
                  ) : null}
                  <span className={`text-xs ${
                    pressureStatus.startsWith('✓') ? 'text-green-600 dark:text-green-400' :
                    pressureStatus.startsWith('✗') ? 'text-red-600 dark:text-red-400' :
                    'text-gray-600 dark:text-gray-400'
                  }`}>
                    {pressureStatus}
                  </span>
                </div>
              )}
              <button
                onClick={fetchPressureData}
                disabled={pressureLoading}
                className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm rounded-md transition-colors duration-200"
              >
                <RefreshCw className={`w-3 h-3 ${pressureLoading ? 'animate-spin' : ''}`} />
                <span>{pressureLoading ? 'Loading...' : 'Auto-fill'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Offshore (ACV - SFO) <span className={`${offshoreGradient < 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {offshoreGradient.toFixed(1)}mb
                </span>
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ACV (mb)
                  </label>
                  <input
                    type="number"
                    value={acvPressure}
                    onChange={(e) => setAcvPressure(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-colors duration-200"
                    placeholder="1013"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    SFO (mb)
                  </label>
                  <input
                    type="number"
                    value={sfoPressure}
                    onChange={(e) => setSfoPressure(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-colors duration-200"
                    placeholder="1019"
                  />
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Onshore (SFO - SMF) <span className={`${onshoreGradient > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {onshoreGradient.toFixed(1)}mb
                </span>
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    SFO (mb)
                  </label>
                  <input
                    type="number"
                    value={sfoPressure}
                    onChange={(e) => setSfoPressure(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-colors duration-200"
                    placeholder="1015"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    SMF (mb)
                  </label>
                  <input
                    type="number"
                    value={smfPressure}
                    onChange={(e) => setSmfPressure(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-colors duration-200"
                    placeholder="1011"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Results Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Droplets className="w-5 h-5 mr-2 text-blue-500" />
            Stratus Forecast
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  SI = {si.toFixed(1)}°F
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Stratus Index (Max Temp - Max Dewpoint)
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
              </div>
            </div>
            
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${
                stratusProbability.text.includes('High') ? 'bg-red-50 dark:bg-red-900/20' :
                stratusProbability.text.includes('Low') ? 'bg-green-50 dark:bg-green-900/20' :
                'bg-yellow-50 dark:bg-yellow-900/20'
              }`}>
                <div className={`text-2xl font-bold ${stratusProbability.color}`}>
                  {stratusProbability.text}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Stratus Probability
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="font-medium text-gray-900 dark:text-white">Offshore</div>
                  <div className={`text-lg font-bold ${offshoreGradient < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {offshoreGradient.toFixed(1)}mb
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="font-medium text-gray-900 dark:text-white">Onshore</div>
                  <div className={`text-lg font-bold ${onshoreGradient > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {onshoreGradient.toFixed(1)}mb
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>SFO Stratus Prediction Tool - Based on meteorological analysis</p>
          {lastUpdated && (
            <p className="mt-1">Last updated: {lastUpdated}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;