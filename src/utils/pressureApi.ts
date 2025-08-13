// NWS API utilities for fetching pressure data from multiple stations
export interface PressureObservation {
  timestamp: string;
  pressure: number; // in mb
  stationId: string;
}

export interface PressureGradientData {
  currentOffshore: number; // ACV - SFO
  currentOnshore: number; // SFO - SMF
  trend24hOffshore: number;
  trend24hOnshore: number;
  stations: {
    ACV: { current: number; timestamp: string };
    SFO: { current: number; timestamp: string };
    SMF: { current: number; timestamp: string };
  };
  lastUpdated: string;
}

// Convert pressure from Pa to mb
const paToMb = (pascals: number): number => {
  return Math.round((pascals / 100) * 10) / 10; // Round to 1 decimal
};

// Check if observation is from a 6-hourly METAR time (00Z, 06Z, 12Z, 18Z)
const is6HourlyMetar = (timestamp: string): boolean => {
  const date = new Date(timestamp);
  const hour = date.getUTCHours();
  return hour % 6 === 0; // 00, 06, 12, 18
};

// Fetch pressure observations for a station
const fetchStationPressure = async (stationId: string): Promise<PressureObservation[]> => {
  try {
    const response = await fetch(
      `https://api.weather.gov/stations/${stationId}/observations?limit=20`,
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
    const observations: PressureObservation[] = [];
    
    for (const feature of data.features || []) {
      const props = feature.properties;
      if (props.barometricPressure?.value) {
        observations.push({
          timestamp: props.timestamp,
          pressure: paToMb(props.barometricPressure.value),
          stationId
        });
      }
    }
    
    return observations;
  } catch (error) {
    console.error(`Error fetching pressure data for ${stationId}:`, error);
    throw error;
  }
};

// Get the most recent 6-hourly observation
const getMostRecent6Hourly = (observations: PressureObservation[]): PressureObservation | null => {
  const sixHourlyObs = observations.filter(obs => is6HourlyMetar(obs.timestamp));
  return sixHourlyObs.length > 0 ? sixHourlyObs[0] : null;
};

// Get 6-hourly observation from ~24 hours ago
const get24HourAgo6Hourly = (observations: PressureObservation[]): PressureObservation | null => {
  const now = new Date();
  const target24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  
  const sixHourlyObs = observations.filter(obs => is6HourlyMetar(obs.timestamp));
  
  // Find the observation closest to 24 hours ago
  let closest: PressureObservation | null = null;
  let minDiff = Infinity;
  
  for (const obs of sixHourlyObs) {
    const obsTime = new Date(obs.timestamp);
    const diff = Math.abs(obsTime.getTime() - target24h.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closest = obs;
    }
  }
  
  return closest;
};

// Main function to fetch all pressure gradient data
export const fetchPressureGradientData = async (): Promise<PressureGradientData> => {
  try {
    // Fetch data from all three stations
    const [acvObs, sfoObs, smfObs] = await Promise.all([
      fetchStationPressure('ACV'),
      fetchStationPressure('SFO'),
      fetchStationPressure('SMF')
    ]);
    
    // Get current (most recent 6-hourly) observations
    const currentACV = getMostRecent6Hourly(acvObs);
    const currentSFO = getMostRecent6Hourly(sfoObs);
    const currentSMF = getMostRecent6Hourly(smfObs);
    
    // Get 24-hour ago observations
    const past24ACV = get24HourAgo6Hourly(acvObs);
    const past24SFO = get24HourAgo6Hourly(sfoObs);
    const past24SMF = get24HourAgo6Hourly(smfObs);
    
    // Check for missing data
    const missingStations: string[] = [];
    if (!currentACV) missingStations.push('ACV');
    if (!currentSFO) missingStations.push('SFO');
    if (!currentSMF) missingStations.push('SMF');
    
    if (missingStations.length > 0) {
      throw new Error(`Missing recent METAR data for: ${missingStations.join(', ')}`);
    }
    
    // Calculate current gradients
    const currentOffshore = Math.round((currentACV!.pressure - currentSFO!.pressure) * 10) / 10;
    const currentOnshore = Math.round((currentSFO!.pressure - currentSMF!.pressure) * 10) / 10;
    
    // Calculate 24-hour trends (current gradient - past gradient)
    let trend24hOffshore = 0;
    let trend24hOnshore = 0;
    
    if (past24ACV && past24SFO && past24SMF) {
      const past24Offshore = past24ACV.pressure - past24SFO.pressure;
      const past24Onshore = past24SFO.pressure - past24SMF.pressure;
      
      trend24hOffshore = Math.round((currentOffshore - past24Offshore) * 10) / 10;
      trend24hOnshore = Math.round((currentOnshore - past24Onshore) * 10) / 10;
    }
    
    return {
      currentOffshore,
      currentOnshore,
      trend24hOffshore,
      trend24hOnshore,
      stations: {
        ACV: { 
          current: currentACV!.pressure, 
          timestamp: currentACV!.timestamp 
        },
        SFO: { 
          current: currentSFO!.pressure, 
          timestamp: currentSFO!.timestamp 
        },
        SMF: { 
          current: currentSMF!.pressure, 
          timestamp: currentSMF!.timestamp 
        }
      },
      lastUpdated: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error fetching pressure gradient data:', error);
    throw error;
  }
};

// Format timestamp for display
export const formatPressureTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month} ${hours}${minutes}Z`;
};