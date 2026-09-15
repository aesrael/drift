export function formatTotalDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }
  return `${minutes} min`;
}

export function calculateTotalDuration(tracks: { duration: number }[]): number {
  return tracks.reduce((total, track) => total + track.duration, 0);
}
