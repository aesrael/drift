import http from 'node:http';
import { URL } from 'node:url';

const port = Number(process.env.PORT || 4533);

// ── Rich Curated Audio & Artwork Catalog ──────────────────────────────────────

const AUDIO_STREAMS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3',
];

const COVERS = {
  // Curated hero catalogue (Hendrix & Mayer) at full resolution
  cover0: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/00/67/45/006745f5-95d5-5a06-35ed-d515e9cfd7d8/dj.tbwlxwoh.jpg/1000x1000bb.jpg',
  cover1: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/7a/a0/f4/7aa0f487-f983-390e-73ef-005115eea1e0/dj.oqpplyfm.jpg/1000x1000bb.jpg',
  cover2: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1600&auto=format&fit=crop&q=90',
  cover3: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1600&auto=format&fit=crop&q=90',
  cover4: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&auto=format&fit=crop&q=90',
  cover5: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1600&auto=format&fit=crop&q=90',
  cover6: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=1600&auto=format&fit=crop&q=90',
  cover7: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=1600&auto=format&fit=crop&q=90',
  cover8: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=1600&auto=format&fit=crop&q=90',
  cover9: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=1600&auto=format&fit=crop&q=90',
  cover10: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1600&auto=format&fit=crop&q=90',
  cover11: 'https://images.unsplash.com/photo-1520523839898-507127053c37?w=1600&auto=format&fit=crop&q=90',
  cover12: 'https://images.unsplash.com/photo-1445985543469-433ecba6ce7a?w=1600&auto=format&fit=crop&q=90',
  cover13: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1600&auto=format&fit=crop&q=90',
};

// Curated catalogue placed first so it leads the home page & Recently Added.
// loadTopSongs() writes the live iTunes chart AFTER these slots.
const curatedTrackIds = ['trk-hey-joe', 'trk-purple-haze', 'trk-foxey-lady', 'trk-fire', 'trk-wind-cries-mary', 'trk-manic-depression', 'trk-gravity', 'trk-slow-dancing', 'trk-waiting-world'];

const artists = [
  { id: 'art-hendrix', name: 'The Jimi Hendrix Experience', coverArt: COVERS.cover0, albumCount: 1, songCount: 6 },
  { id: 'art-mayer', name: 'John Mayer', coverArt: COVERS.cover1, albumCount: 1, songCount: 3 },
  { id: 'art-1', name: 'The Weeknd', coverArt: COVERS.cover5, albumCount: 2, songCount: 4 },
  { id: 'art-2', name: 'Daft Punk', coverArt: COVERS.cover3, albumCount: 2, songCount: 4 },
  { id: 'art-3', name: 'Dua Lipa', coverArt: COVERS.cover4, albumCount: 1, songCount: 2 },
  { id: 'art-4', name: 'Arctic Monkeys', coverArt: COVERS.cover8, albumCount: 1, songCount: 2 },
  { id: 'art-5', name: 'Billie Eilish', coverArt: COVERS.cover6, albumCount: 1, songCount: 2 },
  { id: 'art-6', name: 'Kendrick Lamar', coverArt: COVERS.cover13, albumCount: 1, songCount: 2 },
  { id: 'art-7', name: 'Hans Zimmer', coverArt: COVERS.cover9, albumCount: 1, songCount: 2 },
];

const albums = [
  { id: 'alb-experienced', name: 'Are You Experienced', artist: 'The Jimi Hendrix Experience', artistId: 'art-hendrix', year: 1967, genre: 'Psychedelic Rock', coverArt: COVERS.cover0, songCount: 6, duration: 1222 },
  { id: 'alb-continuum', name: 'Continuum', artist: 'John Mayer', artistId: 'art-mayer', year: 2006, genre: 'Blues Rock', coverArt: COVERS.cover1, songCount: 3, duration: 699 },
  { id: 'alb-1', name: 'After Hours', artist: 'The Weeknd', artistId: 'art-1', year: 2020, genre: 'R&B / Synthwave', coverArt: COVERS.cover5, songCount: 2, duration: 440 },
  { id: 'alb-2', name: 'Dawn FM', artist: 'The Weeknd', artistId: 'art-1', year: 2022, genre: 'Synth-Pop', coverArt: COVERS.cover10, songCount: 2, duration: 410 },
  { id: 'alb-3', name: 'Discovery', artist: 'Daft Punk', artistId: 'art-2', year: 2001, genre: 'Electronic / French House', coverArt: COVERS.cover3, songCount: 2, duration: 480 },
  { id: 'alb-4', name: 'Random Access Memories', artist: 'Daft Punk', artistId: 'art-2', year: 2013, genre: 'Disco / Funk', coverArt: COVERS.cover2, songCount: 2, duration: 510 },
  { id: 'alb-5', name: 'Future Nostalgia', artist: 'Dua Lipa', artistId: 'art-3', year: 2020, genre: 'Pop / Nu-Disco', coverArt: COVERS.cover4, songCount: 2, duration: 400 },
  { id: 'alb-6', name: 'AM', artist: 'Arctic Monkeys', artistId: 'art-4', year: 2013, genre: 'Indie Rock', coverArt: COVERS.cover8, songCount: 2, duration: 420 },
  { id: 'alb-7', name: 'Hit Me Hard and Soft', artist: 'Billie Eilish', artistId: 'art-5', year: 2024, genre: 'Alternative Pop', coverArt: COVERS.cover6, songCount: 2, duration: 430 },
  { id: 'alb-8', name: 'DAMN.', artist: 'Kendrick Lamar', artistId: 'art-6', year: 2017, genre: 'Hip-Hop', coverArt: COVERS.cover13, songCount: 2, duration: 390 },
  { id: 'alb-9', name: 'Interstellar (OST)', artist: 'Hans Zimmer', artistId: 'art-7', year: 2014, genre: 'Cinematic / Ambient', coverArt: COVERS.cover9, songCount: 2, duration: 520 },
];

let tracks = [
  { id: 'trk-1', parent: 'alb-1', isDir: false, title: 'Blinding Lights', artist: 'The Weeknd', artistId: 'art-1', album: 'After Hours', albumId: 'alb-1', year: 2020, genre: 'Synthwave', duration: 200, track: 1, coverArt: COVERS.cover5, contentType: 'audio/mpeg', suffix: 'mp3', size: 5200000, streamIndex: 0, starred: '2024-01-01T00:00:00Z' },
  { id: 'trk-2', parent: 'alb-1', isDir: false, title: 'Save Your Tears', artist: 'The Weeknd', artistId: 'art-1', album: 'After Hours', albumId: 'alb-1', year: 2020, genre: 'Synthwave', duration: 215, track: 2, coverArt: COVERS.cover5, contentType: 'audio/mpeg', suffix: 'mp3', size: 5400000, streamIndex: 1, starred: '2024-01-02T00:00:00Z' },
  { id: 'trk-3', parent: 'alb-2', isDir: false, title: 'Take My Breath', artist: 'The Weeknd', artistId: 'art-1', album: 'Dawn FM', albumId: 'alb-2', year: 2022, genre: 'Synth-Pop', duration: 220, track: 1, coverArt: COVERS.cover10, contentType: 'audio/mpeg', suffix: 'mp3', size: 5600000, streamIndex: 2 },
  { id: 'trk-4', parent: 'alb-2', isDir: false, title: 'Sacrifice', artist: 'The Weeknd', artistId: 'art-1', album: 'Dawn FM', albumId: 'alb-2', year: 2022, genre: 'Synth-Pop', duration: 190, track: 2, coverArt: COVERS.cover10, contentType: 'audio/mpeg', suffix: 'mp3', size: 4900000, streamIndex: 3 },
  { id: 'trk-5', parent: 'alb-3', isDir: false, title: 'One More Time', artist: 'Daft Punk', artistId: 'art-2', album: 'Discovery', albumId: 'alb-3', year: 2001, genre: 'Electronic', duration: 320, track: 1, coverArt: COVERS.cover3, contentType: 'audio/mpeg', suffix: 'mp3', size: 7800000, streamIndex: 4, starred: '2024-01-03T00:00:00Z' },
  { id: 'trk-6', parent: 'alb-3', isDir: false, title: 'Harder, Better, Faster, Stronger', artist: 'Daft Punk', artistId: 'art-2', album: 'Discovery', albumId: 'alb-3', year: 2001, genre: 'Electronic', duration: 224, track: 2, coverArt: COVERS.cover3, contentType: 'audio/mpeg', suffix: 'mp3', size: 5700000, streamIndex: 5 },
  { id: 'trk-7', parent: 'alb-4', isDir: false, title: 'Get Lucky', artist: 'Daft Punk', artistId: 'art-2', album: 'Random Access Memories', albumId: 'alb-4', year: 2013, genre: 'Disco', duration: 248, track: 1, coverArt: COVERS.cover2, contentType: 'audio/mpeg', suffix: 'mp3', size: 6100000, streamIndex: 6, starred: '2024-01-04T00:00:00Z' },
  { id: 'trk-8', parent: 'alb-4', isDir: false, title: 'Instant Crush', artist: 'Daft Punk', artistId: 'art-2', album: 'Random Access Memories', albumId: 'alb-4', year: 2013, genre: 'Indie Pop', duration: 337, track: 2, coverArt: COVERS.cover2, contentType: 'audio/mpeg', suffix: 'mp3', size: 8100000, streamIndex: 7 },
  { id: 'trk-9', parent: 'alb-5', isDir: false, title: 'Levitating', artist: 'Dua Lipa', artistId: 'art-3', album: 'Future Nostalgia', albumId: 'alb-5', year: 2020, genre: 'Pop', duration: 203, track: 1, coverArt: COVERS.cover4, contentType: 'audio/mpeg', suffix: 'mp3', size: 5100000, streamIndex: 8, starred: '2024-01-05T00:00:00Z' },
  { id: 'trk-10', parent: 'alb-5', isDir: false, title: 'Don\'t Start Now', artist: 'Dua Lipa', artistId: 'art-3', album: 'Future Nostalgia', albumId: 'alb-5', year: 2020, genre: 'Nu-Disco', duration: 183, track: 2, coverArt: COVERS.cover4, contentType: 'audio/mpeg', suffix: 'mp3', size: 4700000, streamIndex: 9 },
  { id: 'trk-11', parent: 'alb-6', isDir: false, title: 'Do I Wanna Know?', artist: 'Arctic Monkeys', artistId: 'art-4', album: 'AM', albumId: 'alb-6', year: 2013, genre: 'Indie Rock', duration: 272, track: 1, coverArt: COVERS.cover8, contentType: 'audio/mpeg', suffix: 'mp3', size: 6600000, streamIndex: 10 },
  { id: 'trk-12', parent: 'alb-6', isDir: false, title: 'R U Mine?', artist: 'Arctic Monkeys', artistId: 'art-4', album: 'AM', albumId: 'alb-6', year: 2013, genre: 'Indie Rock', duration: 201, track: 2, coverArt: COVERS.cover8, contentType: 'audio/mpeg', suffix: 'mp3', size: 5000000, streamIndex: 11 },
  { id: 'trk-13', parent: 'alb-7', isDir: false, title: 'LUNCH', artist: 'Billie Eilish', artistId: 'art-5', album: 'Hit Me Hard and Soft', albumId: 'alb-7', year: 2024, genre: 'Alternative Pop', duration: 180, track: 1, coverArt: COVERS.cover6, contentType: 'audio/mpeg', suffix: 'mp3', size: 4500000, streamIndex: 12 },
  { id: 'trk-14', parent: 'alb-7', isDir: false, title: 'BIRDS OF A FEATHER', artist: 'Billie Eilish', artistId: 'art-5', album: 'Hit Me Hard and Soft', albumId: 'alb-7', year: 2024, genre: 'Alternative Pop', duration: 194, track: 2, coverArt: COVERS.cover6, contentType: 'audio/mpeg', suffix: 'mp3', size: 4800000, streamIndex: 13, starred: '2024-01-06T00:00:00Z' },
  { id: 'trk-15', parent: 'alb-8', isDir: false, title: 'HUMBLE.', artist: 'Kendrick Lamar', artistId: 'art-6', album: 'DAMN.', albumId: 'alb-8', year: 2017, genre: 'Hip-Hop', duration: 177, track: 1, coverArt: COVERS.cover13, contentType: 'audio/mpeg', suffix: 'mp3', size: 4400000, streamIndex: 14 },
  { id: 'trk-16', parent: 'alb-9', isDir: false, title: 'Cornfield Chase', artist: 'Hans Zimmer', artistId: 'art-7', album: 'Interstellar (OST)', albumId: 'alb-9', year: 2014, genre: 'Cinematic', duration: 126, track: 1, coverArt: COVERS.cover9, contentType: 'audio/mpeg', suffix: 'mp3', size: 3200000, streamIndex: 15 },
  { id: 'trk-hey-joe', parent: 'alb-experienced', isDir: false, title: 'Hey Joe', artist: 'The Jimi Hendrix Experience', artistId: 'art-hendrix', album: 'Are You Experienced', albumId: 'alb-experienced', year: 1967, genre: 'Psychedelic Rock', duration: 210, track: 1, coverArt: COVERS.cover0, contentType: 'audio/mpeg', suffix: 'mp3', size: 5100000, streamIndex: 0, starred: '2024-01-10T00:00:00Z' },
  { id: 'trk-purple-haze', parent: 'alb-experienced', isDir: false, title: 'Purple Haze', artist: 'The Jimi Hendrix Experience', artistId: 'art-hendrix', album: 'Are You Experienced', albumId: 'alb-experienced', year: 1967, genre: 'Psychedelic Rock', duration: 171, track: 2, coverArt: COVERS.cover0, contentType: 'audio/mpeg', suffix: 'mp3', size: 4300000, streamIndex: 4, starred: '2024-01-11T00:00:00Z' },
  { id: 'trk-foxey-lady', parent: 'alb-experienced', isDir: false, title: 'Foxey Lady', artist: 'The Jimi Hendrix Experience', artistId: 'art-hendrix', album: 'Are You Experienced', albumId: 'alb-experienced', year: 1967, genre: 'Psychedelic Rock', duration: 195, track: 3, coverArt: COVERS.cover0, contentType: 'audio/mpeg', suffix: 'mp3', size: 4800000, streamIndex: 6 },
  { id: 'trk-fire', parent: 'alb-experienced', isDir: false, title: 'Fire', artist: 'The Jimi Hendrix Experience', artistId: 'art-hendrix', album: 'Are You Experienced', albumId: 'alb-experienced', year: 1967, genre: 'Psychedelic Rock', duration: 173, track: 4, coverArt: COVERS.cover0, contentType: 'audio/mpeg', suffix: 'mp3', size: 4200000, streamIndex: 8 },
  { id: 'trk-wind-cries-mary', parent: 'alb-experienced', isDir: false, title: 'The Wind Cries Mary', artist: 'The Jimi Hendrix Experience', artistId: 'art-hendrix', album: 'Are You Experienced', albumId: 'alb-experienced', year: 1967, genre: 'Psychedelic Rock', duration: 231, track: 5, coverArt: COVERS.cover0, contentType: 'audio/mpeg', suffix: 'mp3', size: 5600000, streamIndex: 10 },
  { id: 'trk-manic-depression', parent: 'alb-experienced', isDir: false, title: 'Manic Depression', artist: 'The Jimi Hendrix Experience', artistId: 'art-hendrix', album: 'Are You Experienced', albumId: 'alb-experienced', year: 1967, genre: 'Psychedelic Rock', duration: 210, track: 6, coverArt: COVERS.cover0, contentType: 'audio/mpeg', suffix: 'mp3', size: 5100000, streamIndex: 12 },
  { id: 'trk-gravity', parent: 'alb-continuum', isDir: false, title: 'Gravity', artist: 'John Mayer', artistId: 'art-mayer', album: 'Continuum', albumId: 'alb-continuum', year: 2006, genre: 'Blues Rock', duration: 240, track: 1, coverArt: COVERS.cover1, contentType: 'audio/mpeg', suffix: 'mp3', size: 5700000, streamIndex: 3, starred: '2024-01-12T00:00:00Z' },
  { id: 'trk-slow-dancing', parent: 'alb-continuum', isDir: false, title: 'Slow Dancing in a Burning Room', artist: 'John Mayer', artistId: 'art-mayer', album: 'Continuum', albumId: 'alb-continuum', year: 2006, genre: 'Blues Rock', duration: 257, track: 2, coverArt: COVERS.cover1, contentType: 'audio/mpeg', suffix: 'mp3', size: 6100000, streamIndex: 7 },
  { id: 'trk-waiting-world', parent: 'alb-continuum', isDir: false, title: 'Waiting on the World to Change', artist: 'John Mayer', artistId: 'art-mayer', album: 'Continuum', albumId: 'alb-continuum', year: 2006, genre: 'Blues Rock', duration: 202, track: 3, coverArt: COVERS.cover1, contentType: 'audio/mpeg', suffix: 'mp3', size: 4900000, streamIndex: 11 },
];

let playlists = [
  {
    id: 'pl-top-10',
    name: 'Top 10 Global Charts',
    songCount: 10,
    duration: 2263,
    coverArt: COVERS.cover4,
    entry: tracks.slice(0, 10),
  },
  {
    id: 'pl-drift-night',
    name: 'Night Drive & Drift',
    songCount: 8,
    duration: 1870,
    coverArt: COVERS.cover5,
    entry: tracks.filter(t => ['Synthwave', 'Synth-Pop', 'Electronic', 'Disco'].includes(t.genre)),
  },
  {
    id: 'pl-chill-vibes',
    name: 'Chill & Ambient Focus',
    songCount: 6,
    duration: 1450,
    coverArt: COVERS.cover11,
    entry: tracks.filter(t => ['Alternative Pop', 'Cinematic', 'Indie Pop'].includes(t.genre)),
  },
  {
    id: 'pl-hendrix',
    name: 'Jimi Hendrix Essentials',
    songCount: 6,
    duration: 1190,
    coverArt: COVERS.cover0,
    entry: tracks.filter(t => t.artistId === 'art-hendrix'),
  },
  {
    id: 'pl-mayer',
    name: 'John Mayer: Continuum',
    songCount: 3,
    duration: 699,
    coverArt: COVERS.cover1,
    entry: tracks.filter(t => t.artistId === 'art-mayer'),
  },
];

const genres = [
  { value: 'Synthwave', songCount: 4, albumCount: 2 },
  { value: 'Electronic', songCount: 4, albumCount: 2 },
  { value: 'Pop', songCount: 3, albumCount: 2 },
  { value: 'Indie Rock', songCount: 2, albumCount: 1 },
  { value: 'Alternative Pop', songCount: 2, albumCount: 1 },
  { value: 'Hip-Hop', songCount: 1, albumCount: 1 },
  { value: 'Cinematic', songCount: 1, albumCount: 1 },
  { value: 'Disco', songCount: 1, albumCount: 1 },
  { value: 'Psychedelic Rock', songCount: 6, albumCount: 1 },
  { value: 'Blues Rock', songCount: 3, albumCount: 1 },
];

const sampleLyrics = {
  'trk-1': {
    artist: 'The Weeknd',
    title: 'Blinding Lights',
    synced: true,
    value: "I've been on my own for long enough\nMaybe you can show me how to love, maybe\nI'm going through withdrawals\nYou don't even have to do too much\nYou can turn me on with just a touch, baby\n\nI look around and Sin City's cold and empty\nNo one's around to judge me\nI can't see clearly when you're gone\n\nI said, ooh, I'm blinded by the lights\nNo, I can't sleep until I feel your touch\nI said, ooh, I'm drowning in the night\nOh, when I'm like this, you're the one I trust",
  },
  'trk-5': {
    artist: 'Daft Punk',
    title: 'One More Time',
    synced: true,
    value: "One more time, we're gonna celebrate\nOh yeah, all right, don't stop the dancing\nOne more time, we're gonna celebrate\nOh yeah, all right, don't stop the dancing\n\nMusic's got me feeling so free\nWe're gonna celebrate\nCelebrate and dance so free\nOne more time",
  },
  'trk-9': {
    artist: 'Dua Lipa',
    title: 'Levitating',
    synced: true,
    value: "If you wanna run away with me, I know a galaxy\nAnd I can take you for a ride\nI had a premonition that we fell into a rhythm\nWhere the music don't stop for life\n\nGlitter in the sky, glitter in my eyes\nShining just the way I like\nIf you're feeling like you need a little bit of company\nYou met me at the perfect time\n\nYou want me, I want you, baby\nMy sugarboo, I'm levitating",
  },
  'trk-hey-joe': {
    artist: 'The Jimi Hendrix Experience',
    title: 'Hey Joe',
    synced: true,
    value: "Hey Joe, where you goin' with that gun in your hand?\nHey Joe, I said where you goin' with that gun in your hand?\nI'm goin' down to shoot my old lady\nYou know I caught her messin' round with another man\n\nI ain't gonna tell you no lie\nI ain't gonna tell you no lie\n\nHey Joe, I said where you goin' with that gun in your hand?\nI'm goin' down to shoot my old lady\nYou know I caught her messin' round with another man\nAnd that ain't too cool",
  },
  'trk-gravity': {
    artist: 'John Mayer',
    title: 'Gravity',
    synced: true,
    value: "Gravity is working against me\nAnd gravity wants to bring me down\nBut I'll never know what makes this man\nWith all the love that his heart can stand\nDream of ways to throw it all away\n\nGravity is working against me\nAnd gravity wants to bring me down\n\nOh, twice as much ain't twice as good\nAnd can't sustain like one half could\nIt's wanting more that pulls me down\nAnd oh, gravity wants to bring me down",
  },
};

const response = (body) => JSON.stringify({
  'subsonic-response': {
    status: 'ok',
    version: '1.16.1',
    type: 'mock',
    serverVersion: 'DriftMock/2.0',
    ...body,
  },
});

const send = (res, body, type = 'application/json') => {
  res.writeHead(200, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
  });
  res.end(type === 'application/json' ? response(body) : body);
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
    });
    return res.end();
  }

  const u = new URL(req.url, `http://${req.headers.host}`);
  const method = u.pathname.split('/').pop()?.replace(/\.view$/, '');
  const id = u.searchParams.get('id');
  const query = (u.searchParams.get('query') || u.searchParams.get('any') || '').toLowerCase().trim();

  // 1. Auth & Ping
  if (method === 'ping') {
    return send(res, { ping: { status: 'ok' } });
  }

  // 2. Playback / Streaming
  if (method === 'stream') {
    const track = tracks.find(t => t.id === id) || tracks[0];
    const streamUrl = AUDIO_STREAMS[track.streamIndex % AUDIO_STREAMS.length];
    res.writeHead(302, {
      Location: streamUrl,
      'Access-Control-Allow-Origin': '*',
    });
    return res.end();
  }

  // 3. Cover Art
  if (method === 'getCoverArt') {
    const coverUrl = COVERS[id] || tracks.find(t => t.id === id || t.coverArt === id)?.coverArt || albums.find(a => a.id === id)?.coverArt || COVERS.cover2;
    res.writeHead(302, {
      Location: coverUrl,
      'Access-Control-Allow-Origin': '*',
    });
    return res.end();
  }

  // 4. Now Playing
  if (method === 'getNowPlaying') {
    return send(res, { nowPlaying: { entry: tracks.slice(0, 3) } });
  }

  // 5. Artists
  if (method === 'getArtists') {
    const indexMap = {};
    for (const art of artists) {
      const letter = art.name[0].toUpperCase();
      if (!indexMap[letter]) indexMap[letter] = [];
      indexMap[letter].push(art);
    }
    const indexList = Object.keys(indexMap).sort().map(name => ({
      name,
      artist: indexMap[name],
    }));
    return send(res, { artists: { index: indexList } });
  }

  if (method === 'getArtist') {
    const artist = artists.find(a => a.id === id) || artists[0];
    const artistAlbums = albums.filter(a => a.artistId === artist.id);
    return send(res, { artist: { ...artist, album: artistAlbums } });
  }

  if (method === 'getArtistInfo' || method === 'getArtistInfo2') {
    const artist = artists.find(a => a.id === id) || artists[0];
    return send(res, {
      artistInfo2: {
        biography: `${artist.name} is a renowned artist celebrated for innovative sound design and chart-topping productions.`,
        largeImageUrl: artist.coverArt,
        mediumImageUrl: artist.coverArt,
        smallImageUrl: artist.coverArt,
      },
    });
  }

  // 6. Albums
  if (method === 'getAlbums' || method === 'getAlbumList' || method === 'getAlbumList2') {
    return send(res, {
      albumList2: { album: albums },
      albumList: { album: albums },
    });
  }

  if (method === 'getAlbum') {
    const album = albums.find(a => a.id === id) || albums[0];
    const albumTracks = tracks.filter(t => t.albumId === album.id);
    return send(res, { album: { ...album, song: albumTracks } });
  }

  if (method === 'getAlbumInfo' || method === 'getAlbumInfo2') {
    const album = albums.find(a => a.id === id) || albums[0];
    return send(res, {
      albumInfo: {
        notes: `Release year ${album.year}. Genre: ${album.genre}. Features standout tracks and master quality production.`,
      },
    });
  }

  // 7. Discovery, Top Songs, Random Songs
  if (method === 'getTopSongs') {
    const count = Number(u.searchParams.get('count') || 10);
    return send(res, { topSongs: { song: tracks.slice(0, count) } });
  }

  if (method === 'getRecentSongs') {
    const size = Number(u.searchParams.get('size') || 10);
    const curated = tracks.filter(t => curatedTrackIds.includes(t.id));
    const rest = tracks.filter(t => !curatedTrackIds.includes(t.id)).sort(() => 0.5 - Math.random());
    const song = [...curated, ...rest].slice(0, size);
    return send(res, { randomSongs: { song }, topSongs: { song }, song });
  }

  if (method === 'getRandomSongs' || method === 'getDiscover') {
    const size = Number(u.searchParams.get('size') || 10);
    const shuffled = [...tracks].sort(() => 0.5 - Math.random()).slice(0, size);
    return send(res, {
      randomSongs: { song: shuffled },
      song: shuffled,
    });
  }

  if (method === 'getStarred' || method === 'getStarred2') {
    const starredSongs = tracks.filter(t => Boolean(t.starred));
    return send(res, {
      starred2: {
        song: starredSongs,
        album: albums.slice(0, 2),
        artist: artists.slice(0, 2),
      },
    });
  }

  // 8. Playlists
  if (method === 'getPlaylists') {
    return send(res, { playlists: { playlist: playlists } });
  }

  if (method === 'getPlaylist') {
    const playlist = playlists.find(p => p.id === id) || playlists[0];
    return send(res, { playlist });
  }

  if (method === 'createPlaylist') {
    const name = u.searchParams.get('name') || 'New Playlist';
    const newPl = {
      id: `pl-${Date.now()}`,
      name,
      songCount: 0,
      duration: 0,
      coverArt: COVERS.cover2,
      entry: [],
    };
    playlists.push(newPl);
    return send(res, { playlist: newPl });
  }

  if (method === 'deletePlaylist') {
    playlists = playlists.filter(p => p.id !== id);
    return send(res, {});
  }

  if (method === 'updatePlaylist') {
    const playlistId = u.searchParams.get('playlistId') || id;
    const playlist = playlists.find(p => p.id === playlistId);
    if (playlist) {
      const songIdToAdd = u.searchParams.get('songIdToAdd');
      if (songIdToAdd) {
        const trk = tracks.find(t => t.id === songIdToAdd);
        if (trk) {
          playlist.entry = playlist.entry || [];
          playlist.entry.push(trk);
          playlist.songCount = playlist.entry.length;
          playlist.duration += trk.duration;
        }
      }
      const songIndexToRemove = u.searchParams.get('songIndexToRemove');
      if (songIndexToRemove !== null && songIndexToRemove !== undefined) {
        const idx = Number(songIndexToRemove);
        if (playlist.entry && playlist.entry[idx]) {
          playlist.duration -= playlist.entry[idx].duration;
          playlist.entry.splice(idx, 1);
          playlist.songCount = playlist.entry.length;
        }
      }
    }
    return send(res, {});
  }

  // 9. Genres
  if (method === 'getGenres') {
    return send(res, { genres: { genre: genres } });
  }

  if (method === 'getSongsByGenre') {
    const genre = u.searchParams.get('genre') || '';
    const filtered = tracks.filter(t => t.genre.toLowerCase().includes(genre.toLowerCase()));
    return send(res, { songsByGenre: { song: filtered.length ? filtered : tracks.slice(0, 5) } });
  }

  // 10. Search
  if (method === 'search2' || method === 'search3') {
    const matchingSongs = tracks.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.artist.toLowerCase().includes(query) ||
      t.album.toLowerCase().includes(query) ||
      t.genre.toLowerCase().includes(query)
    );
    const matchingAlbums = albums.filter(a =>
      a.name.toLowerCase().includes(query) ||
      a.artist.toLowerCase().includes(query) ||
      a.genre.toLowerCase().includes(query)
    );
    const matchingArtists = artists.filter(a =>
      a.name.toLowerCase().includes(query)
    );

    return send(res, {
      searchResult3: {
        song: matchingSongs.length ? matchingSongs : tracks.slice(0, 4),
        album: matchingAlbums.length ? matchingAlbums : albums.slice(0, 2),
        artist: matchingArtists.length ? matchingArtists : artists.slice(0, 2),
      },
    });
  }

  // 11. Lyrics
  if (method === 'getLyrics') {
    const lyricData = sampleLyrics[id] || {
      artist: tracks.find(t => t.id === id)?.artist || 'SoundHelix',
      title: tracks.find(t => t.id === id)?.title || 'Instrumental Track',
      synced: false,
      value: 'Instrumental composition — feel the rhythm and enjoy the drive.',
    };
    return send(res, { lyrics: lyricData });
  }

  // 12. Star / Unstar
  if (method === 'star') {
    const trk = tracks.find(t => t.id === id);
    if (trk) trk.starred = new Date().toISOString();
    return send(res, {});
  }

  if (method === 'unstar') {
    const trk = tracks.find(t => t.id === id);
    if (trk) delete trk.starred;
    return send(res, {});
  }

  // 13. Scrobble
  if (method === 'scrobble') {
    return send(res, {});
  }

  return send(res, {});
});

async function loadTopSongs() {
  const endpoint = 'https://itunes.apple.com/us/rss/topsongs/limit=10/json';
  try {
    const result = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!result.ok) throw new Error(`iTunes HTTP ${result.status}`);
    const payload = await result.json();
    const entries = (payload.feed?.entry || []).filter(entry => entry['im:name']?.label);
    if (!entries.length) throw new Error('iTunes returned no songs');

    const coverFor = entry =>
      [...(entry['im:image'] || [])].sort((a, b) => Number(b.attributes?.height || 0) - Number(a.attributes?.height || 0))[0]?.label || COVERS.cover2;

    // Live chart fills the post-curated slots so the curated catalogue stays first.
    const curatedArtistCount = artists.filter(a => a.id === 'art-hendrix' || a.id === 'art-mayer').length;
    const curatedAlbumCount = albums.filter(a => a.id === 'alb-experienced' || a.id === 'alb-continuum').length;

    entries.slice(0, 10).forEach((entry, index) => {
      const track = tracks[index];
      const artistName = entry['im:artist']?.label || 'Unknown Artist';
      const albumName = entry['im:collection']?.['im:name']?.label || 'Top Songs';
      const artwork = coverFor(entry);
      track.title = entry['im:name'].label;
      track.artist = artistName;
      track.album = albumName;
      track.year = new Date().getFullYear();
      track.genre = 'Top Songs';
      track.coverArt = artwork;
      track.artistId = `itunes-art-${index}`;
      track.albumId = `itunes-alb-${index}`;
      track.parent = track.albumId;
      track.streamIndex = index;
      albums[curatedAlbumCount + index] = {
        ...albums[curatedAlbumCount + index], id: track.albumId, name: albumName, artist: artistName,
        artistId: track.artistId, year: track.year, genre: 'Top Songs', coverArt: artwork,
        songCount: 1, duration: track.duration,
      };
      artists[curatedArtistCount + index] = {
        ...artists[curatedArtistCount + index], id: track.artistId, name: artistName, coverArt: artwork,
        albumCount: 1, songCount: 1,
      };
    });
    albums.splice(curatedAlbumCount + 10);
    artists.splice(curatedArtistCount + 10);
    playlists[0].entry = tracks.slice(0, 10);
    playlists[0].songCount = playlists[0].entry.length;
    playlists[0].coverArt = tracks[0].coverArt;
    console.log('✓ Loaded top 10 real songs/artwork from the public iTunes RSS feed.');
  } catch (error) {
    console.warn(`! Could not load live chart data (${error.message}); using bundled fallback catalog.`);
  }
}

loadTopSongs().finally(() => server.listen(port, '0.0.0.0', () => {
  console.log(`\n🎵 Drift Subsonic Demo Server running at http://0.0.0.0:${port}`);
  console.log(`📡 Local / Android Emulator Base URL: http://10.0.2.2:${port}`);
  console.log(`✨ Loaded ${tracks.length} tracks, ${albums.length} albums, ${artists.length} artists, ${playlists.length} playlists.`);
}));
