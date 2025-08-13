import React, { useState, useEffect } from 'react';
import { Cloud, Thermometer, Droplets, Calculator, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { fetchKSFOTemperatureData, TemperatureData } from './utils/nwsApi';

function App() {
  const [temperatureData, setTemperatureData] = useState<TemperatureData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  // Calculate Stratus Index
  const calculateSI = (maxTemp: number | null, maxDewpoint: number | null): number | null => {
    if (maxTemp === null || maxDewpoint === null) return null;
    return maxTemp - maxDewpoint;
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchKSFOTemperatureData();
      setTemperatureData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const si = calculateSI(temperatureData?.maxTemp || null, temperatureData?.maxDewpoint || null);

  const getProbabilityText = (si: number | null): string => {
    if (si === null) return 'Unable to calculate';
    if (si < 13) return 'High (90%)';
    if (si > 22) return 'Low (20%)';
    return 'Moderate (20-90%)';
  };

  const getProbabilityColor = (si: number | null): string => {
    if (si === null) return 'text-gray-500';
    if (si < 13) return 'text-red-600';
    if (si > 22) return 'text-green-600';
    return 'text-yellow-600';
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Cloud className="w-12 h-12 text-blue-600 mr-3" />
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white">
              SFO Stratus Prediction Tool
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            Marine stratus probability based on temperature-dewpoint spread
          </p>
          
          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="mt-4 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
          >
            {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto">
          {/* Data Source Status */}
          <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md transition-colors duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {error ? (
                  <WifiOff className="w-5 h-5 text-red-500 mr-2" />
                ) : (
                  <Wifi className="w-5 h-5 text-green-500 mr-2" />
                )}
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {temperatureData?.dataSource || 'No data source'}
                </span>
              </div>
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors duration-200"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 rounded-lg">
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Temperature Data Cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Max Temperature Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-300">
              <div className="flex items-center mb-4">
                <Thermometer className="w-8 h-8 text-red-500 mr-3" />
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                  Maximum Temperature
                </h2>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {loading ? (
                  <div className="animate-pulse bg-gray-300 dark:bg-gray-600 h-10 w-20 rounded"></div>
                ) : temperatureData?.maxTemp !== null ? (
                  `${temperatureData?.maxTemp}°F`
                ) : (
                  'N/A'
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                20Z-24Z window
              </p>
            </div>

            {/* Max Dewpoint Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-300">
              <div className="flex items-center mb-4">
                <Droplets className="w-8 h-8 text-blue-500 mr-3" />
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                  Maximum Dewpoint
                </h2>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {loading ? (
                  <div className="animate-pulse bg-gray-300 dark:bg-gray-600 h-10 w-20 rounded"></div>
                ) : temperatureData?.maxDewpoint !== null ? (
                  `${temperatureData?.maxDewpoint}°F`
                ) : (
                  'N/A'
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                20Z-24Z window
              </p>
            </div>
          </div>

          {/* Stratus Index Calculation */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-300">
            <div className="flex items-center mb-6">
              <Calculator className="w-8 h-8 text-purple-500 mr-3" />
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">
                Stratus Index (SI)
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Calculation */}
              <div>
                <div className="text-lg text-gray-700 dark:text-gray-300 mb-4">
                  SI = Max Temperature - Max Dewpoint
                </div>
                <div className="text-lg text-gray-700 dark:text-gray-300 mb-4">
                  SI = {temperatureData?.maxTemp || 'N/A'}°F - {temperatureData?.maxDewpoint || 'N/A'}°F
                </div>
                <div className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                  {loading ? (
                    <div className="animate-pulse bg-gray-300 dark:bg-gray-600 h-12 w-16 rounded"></div>
                  ) : si !== null ? (
                    `${si}°F`
                  ) : (
                    'N/A'
                  )}
                </div>
              </div>

              {/* Probability */}
              <div>
                <div className="text-lg text-gray-700 dark:text-gray-300 mb-2">
                  Stratus Probability:
                </div>
                <div className={`text-2xl font-bold mb-4 ${getProbabilityColor(si)}`}>
                  {getProbabilityText(si)}
                </div>
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

          {/* Methodology */}
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 transition-colors duration-300">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
              Methodology
            </h3>
            <div className="text-gray-700 dark:text-gray-300 space-y-2">
              <p>
                • <strong>Data Source:</strong> NWS METAR observations from San Francisco International Airport (KSFO)
              </p>
              <p>
                • <strong>Time Window:</strong> Maximum temperature and dewpoint from 20Z-24Z (12-4 PM PST/1-5 PM PDT)
              </p>
              <p>
                • <strong>Stratus Index:</strong> Temperature-dewpoint spread during peak heating hours
              </p>
              <p>
                • <strong>Interpretation:</strong> Lower SI values indicate higher probability of marine stratus formation
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;