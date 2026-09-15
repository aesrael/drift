import { getDiscover } from './subsonic';
import { Track } from '../types';

// Optional server extension. Standard Subsonic servers may not provide this.
export async function getDriftRadioRecommendation(): Promise<Track[]> {
  return [];
}

/**
 * Direct: Fetches personalized recommendations from Gorse
 */
export async function getRecommendations(): Promise<Track[]> {
  try {
    return await getDiscover('personal');
  } catch (error) {
    console.warn('Failed to fetch Gorse recommendations', error);
    return [];
  }
}
