// NWS API utilities for fetching METAR data and parsing remarks
export interface MetarObservation {
  timestamp: string;
  textDescription: string;
  temperature?: {
    value: number;
    unitCode: string;
  };
  dewpoint?: {
    value: number;
    unitCode: string;
  };
  rawMessage?: string;
}

export interface TemperatureData {
  maxTemp: number | null;
  maxDewpoint: number | null;
  dataSource: string;
  timestamp: string;
}

// Convert Celsius to Fahrenheit
const celsiusToFahrenheit = (celsius: number): number => {
  return Math.round((celsius * 9/5) + 32);
};

// Parse MAX temperatures from METAR remarks section
const parseMaxFromRemarks = (rawMetar: string): { maxTemp: number | null; maxDewpoint: number | null } => {
  if (!rawMetar) return { maxTemp: null, maxDewpoint: null };
  
  let maxTemp: number | null = null;
  let maxDewpoint: number | null = null;
  
  // Look for RMK section
  const rmkIndex = rawMetar.indexOf('RMK');
  if (rmkIndex === -1) return { maxTemp: null, maxDewpoint: null };
  
  const remarks = rawMetar.substring(rmkIndex);
  
  // Parse 6-hourly maximum temperature: 4XXXX (where XXXX is temp in tenths of degrees C)
  const maxTempMatch = remarks.match(/4(\d{4})/);
  if (maxTempMatch) {
    const tempTenthsC = parseInt(maxTempMatch[1]);
    // Handle negative temperatures (if first digit is 1, it's negative)
    const tempC = tempTenthsC >= 1000 ? -(tempTenthsC - 1000) / 10 : tempTenthsC / 10;
    maxTemp = celsiusToFahrenheit(tempC);
  }
  
  // Parse 6-hourly minimum temperature: 5XXXX (we'll use this as a fallback for dewpoint estimation)
  // Note: METAR doesn't typically include max dewpoint in remarks, so we'll use current dewpoint
  // from the main observation as the best available proxy
  
  return { maxTemp, maxDewpoint };
};

// Get current dewpoint from main METAR observation
const getCurrentDewpoint = (observation: MetarObservation): number | null => {
  if (observation.dewpoint?.value !== undefined) {
    const dewpointC = observation.dewpoint.value;
    return celsiusToFahrenheit(dewpointC);
  }
  return null;
};

// Check if timestamp is within 20-24Z window (considering it might be from previous day)
const isIn20to24ZWindow = (timestamp: string): boolean => {
  const obsTime = new Date(timestamp);
  const utcHour = obsTime.getUTCHours();
  
  // 20-24Z window
  return utcHour >= 20 || utcHour <= 23;
};

// Fetch METAR observations from NWS API
export const fetchKSFOTemperatureData = async (): Promise<TemperatureData> => {
  try {
    // Get last 24 hours of observations to ensure we capture 20-24Z window
    const response = await fetch(
      'https://api.weather.gov/stations/KSFO/observations?limit=50',
      {
        headers: {
          'User-Agent': 'SFO-Stratus-Tool/1.0 (Weather Forecasting Application)'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`NWS API error: ${response.status}`);
    }
    
    const data = await response.json();
    const observations: MetarObservation[] = data.features?.map((feature: any) => ({
      timestamp: feature.properties.timestamp,
      textDescription: feature.properties.textDescription,
      temperature: feature.properties.temperature,
      dewpoint: feature.properties.dewpoint,
      rawMessage: feature.properties.rawMessage
    })) || [];
    
    if (observations.length === 0) {
      throw new Error('No observations available');
    }
    
    // Filter observations for 20-24Z window from the last day or two
    const relevantObs = observations.filter(obs => isIn20to24ZWindow(obs.timestamp));
    
    let maxTemp: number | null = null;
    let maxDewpoint: number | null = null;
    let latestTimestamp = '';
    
    // Process each observation in the 20-24Z window
    for (const obs of relevantObs) {
      // Try to get max temp from remarks first
      const remarksData = parseMaxFromRemarks(obs.rawMessage || '');
      
      if (remarksData.maxTemp !== null) {
        maxTemp = Math.max(maxTemp || -999, remarksData.maxTemp);
      }
      
      // For dewpoint, use the highest current dewpoint observed in the window
      // since METAR remarks don't typically include max dewpoint
      const currentDewpoint = getCurrentDewpoint(obs);
      if (currentDewpoint !== null) {
        maxDewpoint = Math.max(maxDewpoint || -999, currentDewpoint);
      }
      
      // Keep track of latest timestamp
      if (obs.timestamp > latestTimestamp) {
        latestTimestamp = obs.timestamp;
      }
    }
    
    // Fallback: if no remarks data, use regular temperature observations
    if (maxTemp === null) {
      for (const obs of relevantObs) {
        if (obs.temperature?.value !== undefined) {
          const tempF = celsiusToFahrenheit(obs.temperature.value);
          maxTemp = Math.max(maxTemp || -999, tempF);
        }
      }
    }
    
    return {
      maxTemp,
      maxDewpoint,
      dataSource: 'NWS METAR (KSFO)',
      timestamp: latestTimestamp || new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error fetching KSFO temperature data:', error);
    throw error;
  }
};

// Format timestamp for display
export const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
};