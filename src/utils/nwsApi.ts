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
  offshoreGradient: number | null;
  onshoreGradient: number | null;
  offshore24hrTrend: number | null;
  onshore24hrTrend: number | null;
  dataSource: string;
  timestamp: string;
}

interface StationPressure {
  station: string;
  pressure: number; // in mb
  timestamp: string;
}

// Convert Celsius to Fahrenheit
const celsiusToFahrenheit = (celsius: number): number => {
  return Math.round((celsius * 9/5) + 32);
};

// Convert inches of mercury to millibars
const inHgToMb = (inHg: number): number => {
  return Math.round(inHg * 33.8639 * 10) / 10;
};

// Get the most recent 6-hourly time (00Z, 06Z, 12Z, 18Z)
const getMostRecent6HourlyTime = (currentTime: Date): Date => {
  const utcHour = currentTime.getUTCHours();
  const sixHourlyHours = [0, 6, 12, 18];
  
  // Find the most recent 6-hourly hour
  let targetHour = 18; // default to 18Z
  for (let i = sixHourlyHours.length - 1; i >= 0; i--) {
    if (utcHour >= sixHourlyHours[i]) {
      targetHour = sixHourlyHours[i];
      break;
    }
  }
  
  const targetTime = new Date(currentTime);
  targetTime.setUTCHours(targetHour, 0, 0, 0);
  
  // If we haven't reached the target hour today, use yesterday's
  if (targetTime > currentTime) {
    targetTime.setUTCDate(targetTime.getUTCDate() - 1);
  }
  
  return targetTime;
};

// Check if observation is within 1 hour of target time
const isNearTargetTime = (obsTime: Date, targetTime: Date): boolean => {
  const diffMs = Math.abs(obsTime.getTime() - targetTime.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours <= 1;
};

// Fetch pressure data from a station
const fetchStationPressure = async (stationId: string, targetTime: Date): Promise<StationPressure | null> => {
  try {
    // Get observations from 2 hours before to 2 hours after target time
    const startTime = new Date(targetTime.getTime() - 2 * 60 * 60 * 1000);
    const endTime = new Date(targetTime.getTime() + 2 * 60 * 60 * 1000);
    
    const response = await fetch(
      `https://api.weather.gov/stations/${stationId}/observations?start=${startTime.toISOString()}&end=${endTime.toISOString()}`,
      {
        headers: {
          'User-Agent': 'SFO-Stratus-Tool/1.0 (Weather Forecasting Application)'
        }
      }
    );
    
    if (!response.ok) {
      console.warn(`Failed to fetch data for ${stationId}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const observations = data.features || [];
    
    // Find observation closest to target time
    let closestObs = null;
    let closestDiff = Infinity;
    
    for (const feature of observations) {
      const obsTime = new Date(feature.properties.timestamp);
      const pressure = feature.properties.barometricPressure?.value;
      
      if (pressure && isNearTargetTime(obsTime, targetTime)) {
        const diff = Math.abs(obsTime.getTime() - targetTime.getTime());
        if (diff < closestDiff) {
          closestDiff = diff;
          closestObs = {
            station: stationId,
            pressure: inHgToMb(pressure / 3386.39), // Convert Pa to inHg then to mb
            timestamp: feature.properties.timestamp
          };
        }
      }
    }
    
    return closestObs;
  } catch (error) {
    console.warn(`Error fetching pressure data for ${stationId}:`, error);
    return null;
  }
};

// Calculate pressure gradients
const calculateGradients = (sfoPress: number, oakPress: number, sjcPress: number): { offshore: number; onshore: number } => {
  // Offshore gradient: SFO - OAK (positive means higher pressure at SFO)
  const offshore = sfoPress - oakPress;
  
  // Onshore gradient: SJC - SFO (positive means higher pressure inland)
  const onshore = sjcPress - sfoPress;
  
  return {
    offshore: Math.round(offshore * 10) / 10,
    onshore: Math.round(onshore * 10) / 10
  };
};

// Fetch pressure gradient data
export const fetchPressureGradients = async (): Promise<PressureData> => {
  try {
    const currentTime = new Date();
    const recentTime = getMostRecent6HourlyTime(currentTime);
    const past24Time = new Date(recentTime.getTime() - 24 * 60 * 60 * 1000);
    
    // Station IDs for the three locations
    const stations = ['KSFO', 'KOAK', 'KSJC'];
    
    // Fetch current pressures
    const currentPressures = await Promise.all(
      stations.map(station => fetchStationPressure(station, recentTime))
    );
    
    // Fetch 24-hour ago pressures
    const past24Pressures = await Promise.all(
      stations.map(station => fetchStationPressure(station, past24Time))
    );
    
    const [sfoNow, oakNow, sjcNow] = currentPressures;
    const [sfo24, oak24, sjc24] = past24Pressures;
    
    let offshoreGradient: number | null = null;
    let onshoreGradient: number | null = null;
    let offshore24hrTrend: number | null = null;
    let onshore24hrTrend: number | null = null;
    
    // Calculate current gradients
    if (sfoNow && oakNow && sjcNow) {
      const currentGradients = calculateGradients(sfoNow.pressure, oakNow.pressure, sjcNow.pressure);
      offshoreGradient = currentGradients.offshore;
      onshoreGradient = currentGradients.onshore;
    }
    
    // Calculate 24-hour trends
    if (sfoNow && oakNow && sjcNow && sfo24 && oak24 && sjc24) {
      const currentGradients = calculateGradients(sfoNow.pressure, oakNow.pressure, sjcNow.pressure);
      const past24Gradients = calculateGradients(sfo24.pressure, oak24.pressure, sjc24.pressure);
      
      offshore24hrTrend = Math.round((currentGradients.offshore - past24Gradients.offshore) * 10) / 10;
      onshore24hrTrend = Math.round((currentGradients.onshore - past24Gradients.onshore) * 10) / 10;
    }
    
    return {
      offshoreGradient,
      onshoreGradient,
      offshore24hrTrend,
      onshore24hrTrend,
      dataSource: 'NWS METAR (KSFO/KOAK/KSJC)',
      timestamp: recentTime.toISOString()
    };
    
  } catch (error) {
    console.error('Error fetching pressure gradient data:', error);
    throw error;
  }
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