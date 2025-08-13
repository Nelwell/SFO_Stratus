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
  ksfo: number | null;
  kacv: number | null;
  ksmf: number | null;
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

// Parse pressure from METAR raw message
const parsePressureFromMetar = (rawMetar: string): number | null => {
  if (!rawMetar) return null;
  
  // Look for altimeter setting in format A#### (inches Hg * 100)
  const altimeterMatch = rawMetar.match(/A(\d{4})/);
  if (altimeterMatch) {
    const inchesHg = parseInt(altimeterMatch[1]) / 100;
    // Convert inches Hg to millibars: 1 inHg = 33.8639 mb
    const mb = Math.round(inchesHg * 33.8639 * 10) / 10; // Round to 1 decimal
    return mb;
  }
  
  // Look for QNH in format Q#### (millibars)
  const qnhMatch = rawMetar.match(/Q(\d{4})/);
  if (qnhMatch) {
    return parseInt(qnhMatch[1]) / 10; // QNH is in tenths of millibars
  }
  
  return null;
};

// Fetch current pressure data from multiple stations
export const fetchPressureData = async (): Promise<PressureData> => {
  const stations = ['KSFO', 'KACV', 'KSMF'];
  const pressures: { [key: string]: number | null } = {};
  let latestTimestamp = '';
  
  try {
    // Fetch latest observation from each station
    for (const station of stations) {
      try {
        const response = await fetch(
          `https://api.weather.gov/stations/${station}/observations/latest`,
          {
            headers: {
              'User-Agent': 'SFO-Stratus-Tool/1.0 (Weather Forecasting Application)'
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          const rawMessage = data.properties?.rawMessage;
          const timestamp = data.properties?.timestamp;
          
          if (rawMessage) {
            const pressure = parsePressureFromMetar(rawMessage);
            pressures[station.toLowerCase()] = pressure;
            console.log(`${station} pressure: ${pressure} mb from ${rawMessage.substring(0, 50)}...`);
          }
          
          if (timestamp && timestamp > latestTimestamp) {
            latestTimestamp = timestamp;
          }
        } else {
          console.warn(`Failed to fetch ${station} data: ${response.status}`);
          pressures[station.toLowerCase()] = null;
        }
      } catch (error) {
        console.error(`Error fetching ${station} data:`, error);
        pressures[station.toLowerCase()] = null;
      }
    }
    
    return {
      ksfo: pressures.ksfo,
      kacv: pressures.kacv,
      ksmf: pressures.ksmf,
      dataSource: 'NWS METAR (Latest Observations)',
      timestamp: latestTimestamp || new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error fetching pressure data:', error);
    throw error;
  }
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