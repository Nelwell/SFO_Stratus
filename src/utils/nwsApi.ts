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
  
  console.log(`Parsing METAR: ${rawMetar}`);
  
  let maxTemp: number | null = null;
  let maxDewpoint: number | null = null;
  
  // Look for RMK section
  const rmkIndex = rawMetar.indexOf('RMK');
  if (rmkIndex === -1) {
    console.log('No RMK section found');
    return { maxTemp: null, maxDewpoint: null };
  }
  
  const remarks = rawMetar.substring(rmkIndex);
  console.log(`Remarks section: ${remarks}`);
  
  // Parse temperature/dewpoint from T group: TXXXXXXXX (where first 4 digits are temp, last 4 are dewpoint in tenths of degrees C)
  const tempDewMatch = remarks.match(/T([01])(\d{3})([01])(\d{3})/);
  if (tempDewMatch) {
    console.log(`Found T group: ${tempDewMatch[0]}`);
    
    // Parse temperature
    const tempSign = tempDewMatch[1] === '1' ? -1 : 1;
    const tempTenths = parseInt(tempDewMatch[2]);
    const tempC = (tempSign * tempTenths) / 10;
    maxTemp = celsiusToFahrenheit(tempC);
    console.log(`Parsed temp: ${tempSign} * ${tempTenths} / 10 = ${tempC}C = ${maxTemp}F`);
    
    // Parse dewpoint
    const dewSign = tempDewMatch[3] === '1' ? -1 : 1;
    const dewTenths = parseInt(tempDewMatch[4]);
    const dewC = (dewSign * dewTenths) / 10;
    maxDewpoint = celsiusToFahrenheit(dewC);
    console.log(`Parsed dewpoint: ${dewSign} * ${dewTenths} / 10 = ${dewC}C = ${maxDewpoint}F`);
  } else {
    console.log('No T group found in remarks');
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

// Check if timestamp is within 19Z-23Z window (accounting for METAR timing ~5min before hour)
const isIn19to23ZWindow = (timestamp: string): boolean => {
  const obsTime = new Date(timestamp);
  const utcHour = obsTime.getUTCHours();
  
  // Just look for hours 19, 20, 21, 22, 23Z
  return utcHour >= 19 && utcHour <= 23;
};

// Check if this is an hourly METAR (issued at 53-59 minutes past the hour)
const isHourlyMetar = (timestamp: string): boolean => {
  const obsTime = new Date(timestamp);
  const minutes = obsTime.getUTCMinutes();
  
  // Hourly METARs are typically issued at 53-59 minutes past the hour
  return minutes >= 53 && minutes <= 59;
};

// Get the date string for the most recent 20Z period for display
const getMostRecent20ZDateString = (): string => {
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  // Find the most recent 20Z period
  let targetDate = new Date(now);
  if (utcHour < 20) {
    // If before 20Z today, use yesterday's 20Z-24Z period
    targetDate.setUTCDate(now.getUTCDate() - 1);
  }
  
  const startDate = targetDate.getUTCDate();
  const endDate = targetDate.getUTCDate(); // Same day since we're not crossing midnight
  
  return `${String(startDate).padStart(2, '0')}20Z-${String(endDate).padStart(2, '0')}24Z`;
};

// Fetch METAR observations from NWS API
export const fetchKSFOTemperatureData = async (): Promise<TemperatureData> => {
  try {
    // Get 24 hours worth of observations (5min intervals = 12 per hour × 24 hours = 288, but use more to be safe)
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
    
    console.log('=== ALL FETCHED OBSERVATIONS ===');
    observations.forEach((obs, index) => {
      console.log(`${index + 1}. ${formatTimestamp(obs.timestamp)} - ${obs.rawMessage?.substring(0, 80)}...`);
    });
    console.log('=== END ALL OBSERVATIONS ===');
    
    if (observations.length === 0) {
      throw new Error('No observations available');
    }
    
    // Filter observations for 19Z-23Z window AND only hourly METARs
    const relevantObs = observations.filter(obs => 
      isIn19to23ZWindow(obs.timestamp) && isHourlyMetar(obs.timestamp)
    );
    
    console.log(`Found ${relevantObs.length} hourly observations in 19Z-23Z window`);
    relevantObs.forEach(obs => {
      console.log(`  - ${formatTimestamp(obs.timestamp)}: ${obs.rawMessage?.substring(0, 50)}...`);
    });
    
    let maxTemp: number | null = null;
    let maxDewpoint: number | null = null;
    let latestTimestamp = '';
    
    // Process each observation in the 19-23Z window
    for (const obs of relevantObs) {
      console.log(`Processing obs at ${formatTimestamp(obs.timestamp)}: ${obs.rawMessage?.substring(0, 50)}...`);
      
      // Try to get max temp from remarks first
      const remarksData = parseMaxFromRemarks(obs.rawMessage || '');
      
      if (remarksData.maxTemp !== null) {
        console.log(`Found remarks temp: ${remarksData.maxTemp}F`);
        maxTemp = maxTemp === null ? remarksData.maxTemp : Math.max(maxTemp, remarksData.maxTemp);
      }
      
      if (remarksData.maxDewpoint !== null) {
        console.log(`Found remarks dewpoint: ${remarksData.maxDewpoint}F`);
        maxDewpoint = maxDewpoint === null ? remarksData.maxDewpoint : Math.max(maxDewpoint, remarksData.maxDewpoint);
      }
      
      // Also check current observation values as backup
      if (obs.temperature?.value !== undefined) {
        const tempF = celsiusToFahrenheit(obs.temperature.value);
        maxTemp = maxTemp === null ? tempF : Math.max(maxTemp, tempF);
      }
      
      if (obs.dewpoint?.value !== undefined) {
        const dewF = celsiusToFahrenheit(obs.dewpoint.value);
        maxDewpoint = maxDewpoint === null ? dewF : Math.max(maxDewpoint, dewF);
      }
      
      // Keep track of latest timestamp
      if (obs.timestamp > latestTimestamp) {
        latestTimestamp = obs.timestamp;
      }
    }
    
    return {
      maxTemp,
      maxDewpoint,
      dataSource: `NWS METAR (KSFO) 20Z-24Z window`,
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

// Interface for pressure data
export interface PressureData {
  station: string;
  pressure: number | null; // in mb
  timestamp: string;
  dataSource: string;
}

// Convert inches of mercury to millibars
const inHgToMb = (inHg: number): number => {
  return Math.round(inHg * 33.8639 * 10) / 10; // Round to 1 decimal place
};

// Parse SLP from METAR remarks (format: SLPxxx where xxx is mb with decimal implied)
const parseSLPFromRemarks = (rawMetar: string): number | null => {
  if (!rawMetar) return null;
  
  // Look for SLP in remarks
  const slpMatch = rawMetar.match(/SLP(\d{3})/);
  if (slpMatch) {
    const slpValue = parseInt(slpMatch[1]);
    // SLP is reported as 3 digits with implied decimal
    // Values 500-999 represent 1050.0-1099.9 mb
    // Values 000-499 represent 1000.0-1049.9 mb
    if (slpValue >= 500) {
      return 1000 + (slpValue / 10);
    } else {
      return 1000 + (slpValue / 10);
    }
  }
  
  return null;
};

// Check if timestamp corresponds to a 6-hourly METAR (23Z, 05Z, 11Z, 17Z)
const is6HourlyMetar = (timestamp: string): boolean => {
  const obsTime = new Date(timestamp);
  const utcHour = obsTime.getUTCHours();
  const minutes = obsTime.getUTCMinutes();
  
  // 6-hourly METARs are at 23Z, 05Z, 11Z, 17Z and issued at 53-59 minutes past the hour
  const is6HourlyHour = [23, 5, 11, 17].includes(utcHour);
  const isHourlyTiming = minutes >= 53 && minutes <= 59;
  
  return is6HourlyHour && isHourlyTiming;
};

// Get the most recent 6-hourly METAR time for reference
const getMostRecent6HourlyTime = (): string => {
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  let targetHour: number;
  if (utcHour >= 23 || utcHour < 5) {
    targetHour = 23;
  } else if (utcHour >= 17) {
    targetHour = 17;
  } else if (utcHour >= 11) {
    targetHour = 11;
  } else {
    targetHour = 5;
  }
  
  // If we're before the target hour today, use yesterday's cycle
  let targetDate = new Date(now);
  if (utcHour < targetHour) {
    if (targetHour === 23) {
      targetDate.setUTCDate(now.getUTCDate() - 1);
    }
  }
  
  return `${String(targetDate.getUTCDate()).padStart(2, '0')}${String(targetHour).padStart(2, '0')}Z`;
};

// Fetch pressure data for a specific station
export const fetchStationPressureData = async (stationId: string): Promise<PressureData> => {
  try {
    const response = await fetch(
      `https://api.weather.gov/stations/${stationId}/observations?limit=200`,
      {
        headers: {
          'User-Agent': 'SFO-Stratus-Tool/1.0 (Weather Forecasting Application)'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`NWS API error for ${stationId}: ${response.status}`);
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
      throw new Error(`No observations available for ${stationId}`);
    }
    
    // Find the most recent 6-hourly METAR
    const sixHourlyObs = observations.filter(obs => is6HourlyMetar(obs.timestamp));
    
    if (sixHourlyObs.length === 0) {
      throw new Error(`No 6-hourly observations found for ${stationId}`);
    }
    
    // Get the most recent one
    const mostRecent = sixHourlyObs[0];
    
    // Try to get pressure from SLP in remarks
    let pressure = parseSLPFromRemarks(mostRecent.rawMessage || '');
    
    // If no SLP found, try to use barometric pressure and convert
    if (pressure === null && mostRecent.rawMessage) {
      // Look for altimeter setting in format Axxxx (inches Hg * 100)
      const altMatch = mostRecent.rawMessage.match(/A(\d{4})/);
      if (altMatch) {
        const altimeterInHg = parseInt(altMatch[1]) / 100;
        pressure = inHgToMb(altimeterInHg);
      }
    }
    
    return {
      station: stationId,
      pressure,
      timestamp: mostRecent.timestamp,
      dataSource: `NWS METAR (${stationId}) 6-hourly`
    };
    
  } catch (error) {
    console.error(`Error fetching pressure data for ${stationId}:`, error);
    throw error;
  }
};

// Fetch pressure data for all three stations
export const fetchAllStationPressureData = async (): Promise<{
  acv: PressureData;
  sfo: PressureData;
  smf: PressureData;
}> => {
  try {
    const [acv, sfo, smf] = await Promise.all([
      fetchStationPressureData('KACV'),
      fetchStationPressureData('KSFO'),
      fetchStationPressureData('KSMF')
    ]);
    
    return { acv, sfo, smf };
  } catch (error) {
    console.error('Error fetching all station pressure data:', error);
    throw error;
  }
};