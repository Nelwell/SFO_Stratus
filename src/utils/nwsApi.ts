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
  
  // Parse temperature/dewpoint from T group: TXXXXXXXX (where first 4 digits are temp, last 4 are dewpoint in tenths of degrees C)
  const tempDewMatch = remarks.match(/T([01])(\d{3})([01])(\d{3})/);
  if (tempDewMatch) {
    // Parse temperature
    const tempSign = tempDewMatch[1] === '1' ? -1 : 1;
    const tempTenths = parseInt(tempDewMatch[2]);
    const tempC = (tempSign * tempTenths) / 10;
    maxTemp = celsiusToFahrenheit(tempC);
    
    // Parse dewpoint
    const dewSign = tempDewMatch[3] === '1' ? -1 : 1;
    const dewTenths = parseInt(tempDewMatch[4]);
    const dewC = (dewSign * dewTenths) / 10;
    maxDewpoint = celsiusToFahrenheit(dewC);
  }
  
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
const isIn20to00ZWindow = (timestamp: string, windowStart: Date): boolean => {
  const obsTime = new Date(timestamp);
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCHours(windowEnd.getUTCHours() + 4); // 4 hours later (20Z to 00Z next day)
  
  return obsTime >= windowStart && obsTime <= windowEnd;
};

// Find the most recent 20Z start time
const findMostRecent20Z = (): Date => {
  const now = new Date();
  const currentHour = now.getUTCHours();
  
  // If it's currently between 00Z-19Z, use yesterday's 20Z
  // If it's currently 20Z or later, use today's 20Z
  const targetDate = new Date(now);
  
  if (currentHour < 20) {
    // Use yesterday's 20Z
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }
  
  targetDate.setUTCHours(20, 0, 0, 0);
  return targetDate;
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
    
    // Find the most recent 20Z and filter observations for that 20-00Z window
    const windowStart = findMostRecent20Z();
    const relevantObs = observations.filter(obs => isIn20to00ZWindow(obs.timestamp, windowStart));
    
    let maxTemp: number | null = null;
    let maxDewpoint: number | null = null;
    let latestTimestamp = '';
    
    // Process each observation in the 20-00Z window
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
      dataSource: `NWS METAR (KSFO) ${windowStart.getUTCDate().toString().padStart(2, '0')}${windowStart.getUTCHours().toString().padStart(2, '0')}Z-${String(windowStart.getUTCDate() + (windowStart.getUTCHours() === 20 ? 1 : 0)).padStart(2, '0')}00Z`,
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
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}${minutes}Z`;
};