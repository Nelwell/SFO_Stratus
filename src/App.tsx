import React, { useState, useEffect } from 'react';
import { Cloud, Thermometer, Droplets, Wind, BarChart3, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { fetchKSFOTemperatureData, TemperatureData, formatTimestamp } from './utils/nwsApi';

interface WeatherData {
  temperature: number;
  dewpoint: number;
  dataSource: string;
  timestamp: string;
}

const App: React.Component = () => {
  const [isDark, setIsDark] = useState(false);
  const [temperature, setTemperature] = useState<number>(65);
  const [dewpoint, setDewpoint] = useState<number>(55);
  const [pressureGradient, setPressureGradient] = useState<number>(0);
  const [windSpeed, setWindSpeed] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Toggle dark mode
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Auto-fetch weather data on component mount
  useEffect(() => {
    fetchWeatherData();
  }, []);

  const fetchWeatherData = async () => {
    if (!isOnline) {
      setError('No internet connection available');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const data = await fetchKSFOTemperatureData();
      
      if (data.maxTemp !== null && data.maxDewpoint !== null) {
        setTemperature(data.maxTemp);
        setDewpoint(data.maxDewpoint);
        setWeatherData({
          temperature: data.maxTemp,
          dewpoint: data.maxDewpoint,
          dataSource: data.dataSource,
          timestamp: data.timestamp
        });
      } else {
        setError('Temperature or dewpoint data not available in METAR remarks');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather data');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate Showalter Index
  const calculateSI = (temp: number, dewpoint: number, pressureGrad: number, wind: number): number => {
    // Enhanced SI calculation incorporating all factors
    const tempDiff = temp - dewpoint;
    const baseIndex = 35 - (temp * 0.3) - (dewpoint * 0.2);
    const pressureAdjustment = pressureGrad * 2;
    const windAdjustment = wind * 0.1;
    
    return Math.round((baseIndex + pressureAdjustment - windAdjustment) * 10) / 10;
  };

  const si = calculateSI(temperature, dewpoint, pressureGradient, windSpeed);

  // Determine stratus probability based on SI
  const getStratusProbability = (si: number): { probability: number; level: string; color: string } => {
    if (si < 13) return { probability: 90, level: 'High', color: 'text-red-600' };
    if (si < 16) return { probability: 70, level: 'Moderate-High', color: 'text-orange-600' };
    if (si < 19) return { probability: 50, level: 'Moderate', color: 'text-yellow-600' };
    if (si < 22) return { probability: 30, level: 'Low-Moderate', color: 'text-blue-600' };
    return { probability: 20, level: 'Low', color: 'text-green-600' };
  };

  const { probability, level, color } = getStratusProbability(si);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-3">
            <Cloud className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
              SFO Stratus Prediction Tool
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {isOnline ? (
                <Wifi className="w-5 h-5 text-green-600" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-600" />
              )}
              <span className={`text-sm ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-lg bg-white dark:bg-gray-700 shadow-md hover:shadow-lg transition-all duration-200"
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Weather Data Status */}
        {weatherData && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center space-x-2 text-green-800 dark:text-green-200">
              <Wifi className="w-4 h-4" />
              <span className="text-sm font-medium">
                Auto-populated from {weatherData.dataSource} - Last updated: {formatTimestamp(weatherData.timestamp)}
              </span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center space-x-2 text-red-800 dark:text-red-200">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Parameters */}
          <div className="space-y-6">
            {/* Temperature Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
              <div className="flex items-center space-x-3 mb-4">
                <Thermometer className="w-6 h-6 text-red-500" />
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Temperature</h2>
                <button
                  onClick={fetchWeatherData}
                  disabled={isLoading || !isOnline}
                  className="ml-auto p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-4 h-4 text-blue-600 dark:text-blue-400 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Maximum Temperature (°F)
                  </label>
                  <input
                    type="number"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                    min="0"
                    max="120"
                  />
                </div>
              </div>
            </div>

            {/* Dewpoint Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
              <div className="flex items-center space-x-3 mb-4">
                <Droplets className="w-6 h-6 text-blue-500" />
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Dewpoint</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Maximum Dewpoint (°F)
                  </label>
                  <input
                    type="number"
                    value={dewpoint}
                    onChange={(e) => setDewpoint(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                    min="0"
                    max="100"
                  />
                </div>
              </div>
            </div>

            {/* Pressure Gradient Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
              <div className="flex items-center space-x-3 mb-4">
                <BarChart3 className="w-6 h-6 text-purple-500" />
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Pressure Gradient</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    SFO - SAC Pressure Difference (mb)
                  </label>
                  <input
                    type="number"
                    value={pressureGradient}
                    onChange={(e) => setPressureGradient(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                    min="-20"
                    max="20"
                    step="0.1"
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Positive values indicate higher pressure at Sacramento
                </p>
              </div>
            </div>

            {/* Wind Speed Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
              <div className="flex items-center space-x-3 mb-4">
                <Wind className="w-6 h-6 text-green-500" />
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Wind Speed</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Average Wind Speed (knots)
                  </label>
                  <input
                    type="number"
                    value={windSpeed}
                    onChange={(e) => setWindSpeed(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-300"
                    min="0"
                    max="50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-6">
            {/* Showalter Index Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
              <div className="flex items-center space-x-3 mb-4">
                <Cloud className="w-6 h-6 text-indigo-500" />
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Showalter Index</h2>
              </div>
              <div className="text-center">
                <div className="text-6xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">
                  {si}
                </div>
                <div className="text-lg text-gray-600 dark:text-gray-400">
                  Modified Showalter Index
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

            {/* Stratus Probability Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
              <div className="flex items-center space-x-3 mb-4">
                <Cloud className="w-6 h-6 text-gray-500" />
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Stratus Probability</h2>
              </div>
              <div className="text-center">
                <div className={`text-6xl font-bold mb-2 ${color}`}>
                  {probability}%
                </div>
                <div className={`text-xl font-semibold mb-4 ${color}`}>
                  {level} Probability
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all duration-500 ${
                      probability >= 70 ? 'bg-red-500' :
                      probability >= 50 ? 'bg-orange-500' :
                      probability >= 30 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${probability}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Interpretation Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Interpretation</h2>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>
                    <strong>Temperature-Dewpoint Spread:</strong> {(temperature - dewpoint).toFixed(1)}°F
                    {temperature - dewpoint < 5 && " (Favorable for stratus formation)"}
                  </p>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>
                    <strong>Pressure Gradient:</strong> {pressureGradient > 0 ? "Onshore flow" : pressureGradient < 0 ? "Offshore flow" : "Neutral"}
                    {pressureGradient > 2 && " (Strong marine influence)"}
                  </p>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>
                    <strong>Wind Speed:</strong> {windSpeed} knots
                    {windSpeed < 5 && " (Light winds favor stratus)"}
                    {windSpeed > 15 && " (Strong winds may prevent stratus)"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>SFO Stratus Prediction Tool - Enhanced Showalter Index Model</p>
          <p className="mt-1">Based on temperature, dewpoint, pressure gradient, and wind speed analysis</p>
        </div>
      </div>
    </div>
  );
};

export default App;