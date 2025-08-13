import React, { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, Thermometer, Droplets, Wind, Calendar, Clock, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { fetchKSFOTemperatureData, type TemperatureData } from './utils/nwsApi';

interface WeatherData {
  temperature: number;
  dewpoint: number;
  windSpeed: number;
  windDirection: number;
  visibility: number;
  ceiling: number;
  conditions: string;
  timestamp: string;
}

interface ForecastData {
  maxTemp: number;
  maxDewpoint: number;
  minRH: number;
  si: number;
  stratusProb: number;
  timestamp: string;
}

const SFOStratusTool: React.FC = () => {
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [temperatureData, setTemperatureData] = useState<TemperatureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' || 
             (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Mock current weather data (in a real app, this would come from an API)
  const mockCurrentWeather: WeatherData = {
    temperature: 58,
    dewpoint: 54,
    windSpeed: 8,
    windDirection: 270,
    visibility: 10,
    ceiling: 800,
    conditions: "Overcast",
    timestamp: new Date().toISOString()
  };

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

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Set mock current weather
      setCurrentWeather(mockCurrentWeather);
      
      // Fetch temperature data from NWS
      const tempData = await fetchKSFOTemperatureData();
      setTemperatureData(tempData);
      
      // Calculate forecast if we have temperature data
      if (tempData.maxTemp !== null && tempData.maxDewpoint !== null) {
        const minRH = Math.round(((tempData.maxDewpoint - tempData.maxTemp) * 4.4) + 100);
        const si = tempData.maxTemp - tempData.maxDewpoint;
        
        // Calculate stratus probability based on SI
        let stratusProb: number;
        if (si < 13) {
          stratusProb = 90;
        } else if (si > 22) {
          stratusProb = 20;
        } else {
          // Linear interpolation between 13 and 22
          stratusProb = Math.round(90 - ((si - 13) / (22 - 13)) * 70);
        }
        
        setForecast({
          maxTemp: tempData.maxTemp,
          maxDewpoint: tempData.maxDewpoint,
          minRH,
          si,
          stratusProb,
          timestamp: tempData.timestamp
        });
      }
      
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch weather data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 15 minutes
    const interval = setInterval(fetchData, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric'
    });
  };

  const getWindDirection = (degrees: number) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
  };

  const getStratusIcon = (probability: number) => {
    if (probability >= 70) return <CloudRain className="w-8 h-8 text-red-500" />;
    if (probability >= 40) return <Cloud className="w-8 h-8 text-yellow-500" />;
    return <Sun className="w-8 h-8 text-green-500" />;
  };

  const getStratusColor = (probability: number) => {
    if (probability >= 70) return 'text-red-600 dark:text-red-400';
    if (probability >= 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getProbabilityBarColor = (probability: number) => {
    if (probability >= 70) return 'bg-red-500';
    if (probability >= 40) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading && !currentWeather) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center transition-colors duration-300">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300 text-lg">Loading weather data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Cloud className="w-12 h-12 text-blue-600 dark:text-blue-400 mr-3" />
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white">SFO Stratus Prediction Tool</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-lg max-w-2xl mx-auto">
            Advanced marine stratus forecasting for San Francisco International Airport using meteorological analysis
          </p>
          
          {/* Controls */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg bg-white dark:bg-gray-700 shadow-md hover:shadow-lg transition-all duration-200"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun className="w-5 h-5 text-yellow-500" /> : <Cloud className="w-5 h-5 text-gray-600" />}
            </button>
            
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              {isOnline ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
            <p className="text-red-700 dark:text-red-300 text-center">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Current Conditions */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">Current Conditions</h2>
              <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(lastUpdated)}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-4 h-4" />
                  {formatTime(lastUpdated)}
                </div>
              </div>
            </div>

            {currentWeather && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Thermometer className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Temperature</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">{currentWeather.temperature}°F</p>
                </div>

                <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Dewpoint</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">{currentWeather.dewpoint}°F</p>
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/30 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Wind className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Wind</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">
                    {getWindDirection(currentWeather.windDirection)} {currentWeather.windSpeed}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">mph</p>
                </div>

                <div className="bg-orange-50 dark:bg-orange-900/30 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Cloud className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Ceiling</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">{currentWeather.ceiling}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">feet</p>
                </div>
              </div>
            )}
          </div>

          {/* Stratus Forecast */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-6">Stratus Forecast</h2>
            
            {loading && (
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-2" />
                <p className="text-gray-600 dark:text-gray-300">Calculating forecast...</p>
              </div>
            )}

            {forecast && (
              <div className="space-y-6">
                {/* Probability Display */}
                <div className="text-center">
                  <div className="flex items-center justify-center mb-4">
                    {getStratusIcon(forecast.stratusProb)}
                    <div className="ml-4">
                      <p className="text-3xl font-bold text-gray-800 dark:text-white">{forecast.stratusProb}%</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Stratus Probability</p>
                    </div>
                  </div>
                  
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 mb-2">
                    <div 
                      className={`h-3 rounded-full transition-all duration-500 ${getProbabilityBarColor(forecast.stratusProb)}`}
                      style={{ width: `${forecast.stratusProb}%` }}
                    ></div>
                  </div>
                  
                  <p className={`text-lg font-semibold ${getStratusColor(forecast.stratusProb)}`}>
                    {forecast.stratusProb >= 70 ? 'High Probability' : 
                     forecast.stratusProb >= 40 ? 'Moderate Probability' : 'Low Probability'}
                  </p>
                </div>

                {/* Meteorological Parameters */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Max Temperature</p>
                    <p className="text-xl font-bold text-gray-800 dark:text-white">{forecast.maxTemp}°F</p>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Max Dewpoint</p>
                    <p className="text-xl font-bold text-gray-800 dark:text-white">{forecast.maxDewpoint}°F</p>
                  </div>
                  
                  <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Min RH</p>
                    <p className="text-xl font-bold text-gray-800 dark:text-white">{forecast.minRH}%</p>
                  </div>
                  
                  <div className="bg-purple-50 dark:bg-purple-900/30 p-4 rounded-lg">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Stability Index</p>
                    <p className="text-xl font-bold text-gray-800 dark:text-white">{forecast.si.toFixed(1)}</p>
                  </div>
                </div>

                {/* SI Scale */}
                {forecast.si !== undefined && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors duration-300">
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600 font-medium">SI &gt; 22: Low Probability (20%)</span>
                      <span className="text-red-600 font-medium">SI &lt; 13: High Probability (90%)</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mt-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          forecast.si < 13 ? 'bg-red-500' : forecast.si > 22 ? 'bg-green-500' : 'bg-yellow-500'
                        }`}
                        style={{ 
                          width: `${Math.max(5, Math.min(95, ((22 - forecast.si) / (22 - 0)) * 100))}%`,
                          marginLeft: forecast.si > 22 ? 'auto' : '0'
                        }}
                      ></div>
                    </div>
                    <div className="flex justify-center mt-2">
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        Current SI: {forecast.si.toFixed(1)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Data Source Information */}
        {temperatureData && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Data Sources</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-gray-600 dark:text-gray-300">
                  {isOnline ? 'Auto-populated from NWS METAR (KSFO) 20Z-24Z window' : 'Offline - Using cached data'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-gray-600 dark:text-gray-300">
                  Last updated: {formatTime(lastUpdated)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Methodology */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-colors duration-300">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Methodology</h3>
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
            <p>• <strong>Stability Index (SI):</strong> Temperature - Dewpoint spread from previous evening's maximum values</p>
            <p>• <strong>Minimum RH:</strong> Calculated using the formula: (Max Dewpoint - Max Temperature) × 4.4 + 100</p>
            <p>• <strong>Stratus Probability:</strong> Based on empirical relationships between SI values and marine stratus occurrence</p>
            <p>• <strong>Data Window:</strong> Uses maximum temperature and dewpoint from 20Z-24Z period (previous evening)</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SFOStratusTool;