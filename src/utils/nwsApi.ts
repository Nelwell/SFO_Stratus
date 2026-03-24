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
  timestamp: string;       // latest METAR timestamp in the window
  fetchedAt: string;       // when the page actually fetched this data
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
    const tempSign = tempDewMatch[1] === '1' ? -1 : 1;
    const tempTenths = parseInt(tempDewMatch[2]);
    const tempC = (tempSign * tempTenths) / 10;
    maxTemp = celsiusToFahrenheit(tempC);
    
    const dewSign = tempDewMatch[3] === '1' ? -1 : 1;
    const dewTenths = parseInt(tempDewMatch[4]);
    const dewC = (dewSign * dewTenths) / 10;
    maxDewpoint = celsiusToFahrenheit(dewC);
  }
  
  return { maxTemp, maxDewpoint };
};

// Get current dewpoint from main METAR observation
const getCurrentDewpoint = (observation: MetarObservation): number | null => {
  if (observation.dewpoint?.value != null && Number.isFinite(observation.dewpoint.value)) {
    return celsiusToFahrenheit(observation.dewpoint.value);
  }
  return null;
};

// Get yesterday's UTC date (the target for the most recently completed 20-24Z window).
// The 20-24Z window for a given date completes at 00Z the next day.
// At any point during "today" in UTC, the most recently COMPLETED window is yesterday's.
// At 00Z, "yesterday" flips to the day whose window just finished — so it stays correct.
const getTargetDate = (): { year: number; month: number; day: number } => {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return {
    year: yesterday.getUTCFullYear(),
    month: yesterday.getUTCMonth(),
    day: yesterday.getUTCDate()
  };
};

// Check if an observation falls within yesterday's 20-24Z window
// METARs are timestamped ~53-59 min before the valid hour, so:
//   1953Z → valid 20Z METAR → hour=19, min=53-59 → include
//   2356Z → valid 00Z/24Z METAR → hour=23, min=53-59 → include
const isInTargetWindow = (timestamp: string, target: { year: number; month: number; day: number }): boolean => {
  const obs = new Date(timestamp);
  
  // Must match the target calendar date
  if (obs.getUTCFullYear() !== target.year ||
      obs.getUTCMonth() !== target.month ||
      obs.getUTCDate() !== target.day) {
    return false;
  }
  
  const hour = obs.getUTCHours();
  const min = obs.getUTCMinutes();
  
  // Only hourly METARs (issued at 53-59 minutes past the hour)
  if (min < 53 || min > 59) return false;
  
  // Hours 19-23 capture the 20Z through 00Z/24Z METARs
  return hour >= 19 && hour <= 23;
};

// Fetch METAR observations from NWS API
export const fetchKSFOTemperatureData = async (): Promise<TemperatureData> => {
  try {
    // 500 obs at 5-min intervals ≈ 41 hours — ensures yesterday's 20Z data is available
    const response = await fetch(
      'https://api.weather.gov/stations/KSFO/observations?limit=500',
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
    
    // Pin to yesterday's UTC date — ensures both values come from the same
    // completed 20-24Z window and today's data can't bleed in
    const target = getTargetDate();
    const targetLabel = `${target.year}-${String(target.month + 1).padStart(2, '0')}-${String(target.day).padStart(2, '0')}`;
    
    const relevantObs = observations.filter(obs => isInTargetWindow(obs.timestamp, target));
    
    console.log(`Target date: ${targetLabel} | Found ${relevantObs.length} hourly METARs in 20-24Z window`);
    relevantObs.forEach(obs => {
      console.log(`  - ${formatTimestamp(obs.timestamp)}: ${obs.rawMessage?.substring(0, 60)}`);
    });
    
    let maxTemp: number | null = null;
    let maxDewpoint: number | null = null;
    let latestTimestamp = '';
    
    // Process each METAR in yesterday's 20-24Z window
    for (const obs of relevantObs) {
      // Try to get max temp from remarks first
      const remarksData = parseMaxFromRemarks(obs.rawMessage || '');
      
      if (remarksData.maxTemp !== null) {
        maxTemp = maxTemp === null ? remarksData.maxTemp : Math.max(maxTemp, remarksData.maxTemp);
      }
      
      if (remarksData.maxDewpoint !== null) {
        maxDewpoint = maxDewpoint === null ? remarksData.maxDewpoint : Math.max(maxDewpoint, remarksData.maxDewpoint);
      }
      
      // Also check current observation values as backup (guard against null/NaN from API)
      if (obs.temperature?.value != null && Number.isFinite(obs.temperature.value)) {
        const tempF = celsiusToFahrenheit(obs.temperature.value);
        maxTemp = maxTemp === null ? tempF : Math.max(maxTemp, tempF);
      }
      
      if (obs.dewpoint?.value != null && Number.isFinite(obs.dewpoint.value)) {
        const dewF = celsiusToFahrenheit(obs.dewpoint.value);
        maxDewpoint = maxDewpoint === null ? dewF : Math.max(maxDewpoint, dewF);
      }
      
      // Keep track of latest timestamp
      if (obs.timestamp > latestTimestamp) {
        latestTimestamp = obs.timestamp;
      }
    }
    
    console.log(`Result: Max Temp=${maxTemp}°F, Max Dewpoint=${maxDewpoint}°F from ${targetLabel} 20-24Z`);
    
    return {
      maxTemp,
      maxDewpoint,
      dataSource: `NWS METAR (KSFO) ${targetLabel} 20-24Z`,
      timestamp: latestTimestamp || new Date().toISOString(),
      fetchedAt: new Date().toISOString()
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