// Pressure gradient utilities for automated calculation
export interface PressureData {
  timestamp: string;
  pressure: number; // in mb/hPa
  location: string;
}

export interface PressureGradientResult {
  gradient: number; // mb per degree latitude
  dataSource: string;
  timestamp: string;
  locations: string[];
}

// Station coordinates (approximate)
const STATIONS = {
  KSFO: { lat: 37.62, lon: -122.38, name: 'San Francisco' },
  KOAK: { lat: 37.72, lon: -122.22, name: 'Oakland' },
  KSJC: { lat: 37.36, lon: -121.93, name: 'San Jose' },
  KHWD: { lat: 37.66, lon: -122.12, name: 'Hayward' },
  KPAO: { lat: 37.46, lon: -122.11, name: 'Palo Alto' }
};

// Parse METAR for altimeter setting and convert to sea level pressure
const parseAltimeterSetting = (rawMetar: string): number | null => {
  if (!rawMetar) return null;
  
  // Look for altimeter setting in format A#### (inches Hg * 100)
  const altMatch = rawMetar.match(/A(\d{4})/);
  if (altMatch) {
    const inchesHg = parseInt(altMatch[1]) / 100;
    // Convert inches Hg to mb/hPa
    const mb = inchesHg * 33.8639;
    return Math.round(mb * 10) / 10;
  }
  
  return null;
};

// Fetch pressure data from multiple Bay Area stations
const fetchStationPressure = async (stationId: string): Promise<PressureData | null> => {
  try {
    const response = await fetch(
      `https://api.weather.gov/stations/${stationId}/observations/latest`,
      {
        headers: {
          'User-Agent': 'SFO-Stratus-Tool/1.0 (Weather Forecasting Application)'
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const properties = data.properties;
    
    // Try to get pressure from barometricPressure field first
    let pressure: number | null = null;
    
    if (properties.barometricPressure?.value) {
      pressure = Math.round(properties.barometricPressure.value / 100 * 10) / 10; // Convert Pa to mb
    } else if (properties.rawMessage) {
      // Fallback to parsing altimeter setting from raw METAR
      pressure = parseAltimeterSetting(properties.rawMessage);
    }
    
    if (pressure === null) return null;
    
    return {
      timestamp: properties.timestamp,
      pressure,
      location: STATIONS[stationId as keyof typeof STATIONS]?.name || stationId
    };
  } catch (error) {
    console.error(`Error fetching pressure for ${stationId}:`, error);
    return null;
  }
};

// Calculate pressure gradient using multiple stations
export const calculatePressureGradient = async (): Promise<PressureGradientResult> => {
  try {
    // Fetch pressure data from multiple stations
    const stationPromises = Object.keys(STATIONS).map(stationId => 
      fetchStationPressure(stationId)
    );
    
    const results = await Promise.all(stationPromises);
    const validData = results.filter((data): data is PressureData => data !== null);
    
    if (validData.length < 2) {
      throw new Error('Insufficient pressure data from stations');
    }
    
    // Calculate north-south pressure gradient
    // Sort stations by latitude
    const sortedData = validData
      .map(data => ({
        ...data,
        lat: STATIONS[Object.keys(STATIONS).find(key => 
          STATIONS[key as keyof typeof STATIONS].name === data.location
        ) as keyof typeof STATIONS]?.lat || 0
      }))
      .sort((a, b) => b.lat - a.lat); // North to south
    
    if (sortedData.length < 2) {
      throw new Error('Need at least 2 stations for gradient calculation');
    }
    
    // Use northernmost and southernmost stations
    const northStation = sortedData[0];
    const southStation = sortedData[sortedData.length - 1];
    
    const pressureDiff = northStation.pressure - southStation.pressure;
    const latDiff = northStation.lat - southStation.lat;
    
    // Gradient in mb per degree latitude (positive = higher pressure to north)
    const gradient = Math.round((pressureDiff / latDiff) * 10) / 10;
    
    return {
      gradient,
      dataSource: 'NWS METAR Network',
      timestamp: validData[0].timestamp,
      locations: validData.map(d => d.location)
    };
    
  } catch (error) {
    console.error('Error calculating pressure gradient:', error);
    throw error;
  }
};

// Alternative: Scrape from NWS time series (if CORS allows)
export const fetchNWSTimeSeries = async (): Promise<number | null> => {
  try {
    // This would require a CORS proxy or server-side implementation
    // For now, we'll use the METAR approach above
    console.log('NWS time series scraping would require CORS proxy');
    return null;
  } catch (error) {
    console.error('Error fetching NWS time series:', error);
    return null;
  }
};