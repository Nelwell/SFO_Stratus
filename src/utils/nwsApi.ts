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

export interface PressureData {
  acv: number | null;
  sfo: number | null;
  smf: number | null;
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
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}${minutes}Z`;
};

// Parse SLP (Sea Level Pressure) from METAR remarks
const parseSLPFromRemarks = (rawMetar: string): number | null => {
  if (!rawMetar) return null;
  
  // Look for RMK section
  const rmkIndex = rawMetar.indexOf('RMK');
  if (rmkIndex === -1) return null;
  
  const remarks = rawMetar.substring(rmkIndex);
  
  // Parse SLP from remarks: SLP followed by 3 digits (e.g., SLP146 = 1014.6 mb)
  const slpMatch = remarks.match(/SLP(\d{3})/);
  if (slpMatch) {
    const slpValue = parseInt(slpMatch[1]);
    // Convert to millibars: if < 500, add 1000; if >= 500, add 900
    return slpValue < 500 ? 1000 + (slpValue / 10) : 900 + (slpValue / 10);
  }
  
  return null;
};

// Fetch pressure data from multiple stations
export const fetchPressureData = async (): Promise<PressureData> => {
  const stations = ['ACV', 'KSFO', 'SMF'];
  const pressureData: { [key: string]: number | null } = {
    acv: null,
    sfo: null,
    smf: null
  };
  
  let latestTimestamp = '';
  
  try {
    // Fetch data from all three stations
    const promises = stations.map(async (station) => {
      try {
        const stationCode = station === 'KSFO' ? 'KSFO' : `K${station}`;
        const response = await fetch(
          `https://api.weather.gov/stations/${stationCode}/observations?limit=10`,
          {
            headers: {
              'User-Agent': 'SFO-Stratus-Tool/1.0 (Weather Forecasting Application)'
            }
          }
        );
        
        if (!response.ok) {
          console.warn(`Failed to fetch data for ${station}: ${response.status}`);
          return { station, pressure: null, timestamp: '' };
        }
        
        const data = await response.json();
        const observations = data.features || [];
        
        // Look for the most recent observation with SLP data
        for (const obs of observations) {
          const rawMessage = obs.properties.rawMessage;
          const slp = parseSLPFromRemarks(rawMessage);
          
          if (slp !== null) {
            return {
              station,
              pressure: Math.round(slp * 10) / 10, // Round to 1 decimal place
              timestamp: obs.properties.timestamp
            };
          }
        }
        
        return { station, pressure: null, timestamp: '' };
      } catch (error) {
        console.warn(`Error fetching ${station} data:`, error);
        return { station, pressure: null, timestamp: '' };
      }
    });
    
    const results = await Promise.all(promises);
    
    // Process results
    results.forEach(result => {
      const stationKey = result.station.toLowerCase().replace('k', '');
      pressureData[stationKey] = result.pressure;
      
      if (result.timestamp > latestTimestamp) {
        latestTimestamp = result.timestamp;
      }
    });
    
    return {
      acv: pressureData.acv,
      sfo: pressureData.sfo,
      smf: pressureData.smf,
      dataSource: 'NWS METAR (ACV/SFO/SMF)',
      timestamp: latestTimestamp || new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error fetching pressure data:', error);
    throw error;
  }
};