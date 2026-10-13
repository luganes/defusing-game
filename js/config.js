// ================= Config: constantes compartidas =================
// Sin dependencias. Todo lo demás importa de aquí.

// ----- Online -----
// Nombre de tu "red" de salas: los que tengan este mismo valor ven las mismas 7 salas.
// Cámbialo si algún día quieres salas separadas de otro grupo de amigos.
export const NET_APP = 'luganes';
export const NUM_ROOMS = 7;
// TURN propio (opcional, gratis hasta 20 GB/mes en metered.ca): si las salas no conectan entre
// redes distintas, crea una cuenta, una app y pega aquí su nombre y su API key.
// Ejemplo: { app: 'mijuego', apiKey: 'abc123...' }. Vacío = solo los servidores gratuitos públicos.
export const METERED_TURN = { app: '', apiKey: '' };

// Modelos pesados (más de ~6 MB): pueden salir en la mesa si alguien los elige, pero no
// entre el público (así la partida carga mucho antes por internet, sobre todo en el móvil).
export const HEAVY_MODELS = ['anissa', 'beast', 'blazer', 'daphne', 'eminem', 'epstein', 'franco', 'lamine',
  'lebron2', 'maduro', 'marioobj', 'speed', 'vance', 'putin'];

// ----- Sonido -----
// Vacío = música y efectos generados por el propio juego. Para usar tus archivos:
// { musica: 'Audio/musica.mp3', victoria: 'Audio/victoria.mp3', fiesta: 'Audio/fiesta.mp3', boom: 'Audio/boom.mp3' }
// Canción de victoria de un personaje concreto: añade  winSong: 'Audio/archivo.mp3'  a su línea del ROSTER.
export const AUDIO_FILES = {};

export const css = n => '#' + n.toString(16).padStart(6, '0');

// Roster: cada personaje lleva `cat` (categoría) y, si es de una serie, `serie`.
// La pantalla de selección los agrupa así en listas plegables (ui.js).
// Las personas reales no llevan serie: salen directamente en su categoría (con `logo` propio).
export const ROSTER = [
  // ----- Anime · Baki
  { name: 'Baki', cat: 'Anime', serie: 'Baki', suit: 0xb02020, skin: 0xe0a880, acc: null, model: 'Models/baki/baki.glb', winSong: 'Audio/baki-victoria.mp3' },
  { name: 'Yujiro', cat: 'Anime', serie: 'Baki', suit: 0x1a1a1a, skin: 0xc98d64, acc: null, model: 'Models/yujiro/yujiro.glb', winSong: 'Audio/baki-victoria.mp3' },
  // ----- Anime · Dragon Ball
  { name: 'Broly', cat: 'Anime', serie: 'Dragon Ball', suit: 0x2a4a2a, skin: 0xc9a06a, acc: null, model: 'Models/broly2/broly2.glb' },
  { name: 'Cell', cat: 'Anime', serie: 'Dragon Ball', suit: 0x3a7a2e, skin: 0x9ab87a, acc: null, model: 'Models/cell/cell.glb' },
  { name: 'Freezer', cat: 'Anime', serie: 'Dragon Ball', suit: 0xe8e8f0, skin: 0xe8e8f0, acc: null, model: 'Models/freezer/freezer.glb' },
  { name: 'Goku', cat: 'Anime', serie: 'Dragon Ball', suit: 0x2a4ad8, skin: 0xf2c9a0, acc: null, model: 'Models/goku/scene.gltf' },
  { name: 'Krilin', cat: 'Anime', serie: 'Dragon Ball', suit: 0xd86420, skin: 0xf2c9a0, acc: null, model: 'Models/krilin/krilin.glb' },
  { name: 'Vegeta', cat: 'Anime', serie: 'Dragon Ball', suit: 0x2a4ad8, skin: 0xf2c9a0, acc: null, model: 'Models/vegeta/vegeta.glb' },
  // ----- Anime · Jujutsu Kaisen
  { name: 'Gojo', cat: 'Anime', serie: 'Jujutsu Kaisen', suit: 0x1a1a2e, skin: 0xf2c9a0, acc: null, model: 'Models/gojo/gojo.glb' },
  { name: 'Megumi', cat: 'Anime', serie: 'Jujutsu Kaisen', suit: 0x23233a, skin: 0xf2c9a0, acc: null, model: 'Models/megumi/megumi.glb' },
  { name: 'Sukuna', cat: 'Anime', serie: 'Jujutsu Kaisen', suit: 0xc9a0a0, skin: 0xf2c9a0, acc: null, model: 'Models/sukuna/sukuna.glb' },
  { name: 'Yuji', cat: 'Anime', serie: 'Jujutsu Kaisen', suit: 0x3a3a4a, skin: 0xf2c9a0, acc: null, model: 'Models/yuji/yuji.glb' },
  // ----- Anime · Naruto
  { name: 'Jiraiya', cat: 'Anime', serie: 'Naruto', suit: 0x8a2a2a, skin: 0xe0b48f, acc: null, model: 'Models/jiraiya/jiraiya.glb' },
  { name: 'Kakashi', cat: 'Anime', serie: 'Naruto', suit: 0x2a3a5a, skin: 0xe0b48f, acc: null, model: 'Models/kakashi/kakashi.glb' },
  { name: 'Madara', cat: 'Anime', serie: 'Naruto', suit: 0x6b1a1a, skin: 0xe0b48f, acc: null, model: 'Models/madara/madara.glb' },
  { name: 'Minato', cat: 'Anime', serie: 'Naruto', suit: 0x2a5a3a, skin: 0xf2c9a0, acc: null, model: 'Models/minato/minato.glb' },
  { name: 'Naruto', cat: 'Anime', serie: 'Naruto', suit: 0xff6a00, skin: 0xf2c9a0, acc: null, model: 'Models/naruto/naruto.glb' },
  { name: 'Sakura', cat: 'Anime', serie: 'Naruto', suit: 0xc94a6a, skin: 0xf2c9a0, acc: null, model: 'Models/sakura/scene.gltf' },
  { name: 'Sasuke', cat: 'Anime', serie: 'Naruto', suit: 0x2a3a6b, skin: 0xe0b48f, acc: null, model: 'Models/sasuke/sasuke.glb' },
  // ----- Videojuegos · GTA San Andreas
  { name: 'Big Smoke', cat: 'Videojuegos', serie: 'GTA San Andreas', suit: 0x2a7a2a, skin: 0x6b4226, acc: null, model: 'Models/bigsmoke/bigsmoke.glb' },
  // ----- Videojuegos · Sonic
  { name: 'Amy', cat: 'Videojuegos', serie: 'Sonic', suit: 0xff8ab8, skin: 0xf2c9a0, acc: null, model: 'Models/amy/amy.glb' },
  { name: 'Knuckles', cat: 'Videojuegos', serie: 'Sonic', suit: 0xcc2222, skin: 0xf2c9a0, acc: null, model: 'Models/knuckles/knuckles.glb' },
  { name: 'Metal Sonic', cat: 'Videojuegos', serie: 'Sonic', suit: 0x2a4a8a, skin: 0x9ab0cc, acc: null, model: 'Models/metalsonic/metalsonic.glb' },
  { name: 'Sonic', cat: 'Videojuegos', serie: 'Sonic', suit: 0x2a6ad8, skin: 0xf2c9a0, acc: null, model: 'Models/sonic/sonic.glb' },
  { name: 'Tails', cat: 'Videojuegos', serie: 'Sonic', suit: 0xe8a020, skin: 0xe8c080, acc: null, model: 'Models/tails/tails.glb' },
  // ----- Videojuegos · Super Mario
  { name: 'Bowser', cat: 'Videojuegos', serie: 'Super Mario', suit: 0x3a6b2a, skin: 0xe8c080, acc: null, model: 'Models/bowser/bowser.glb' },
  { name: 'Daisy', cat: 'Videojuegos', serie: 'Super Mario', suit: 0xe8a020, skin: 0xf2c9a0, acc: null, model: 'Models/daisy/daisy.glb' },
  { name: 'Diddy Kong', cat: 'Videojuegos', serie: 'Super Mario', suit: 0xcc3333, skin: 0xc98d64, acc: null, model: 'Models/diddy/diddy.glb' },
  { name: 'Donkey Kong', cat: 'Videojuegos', serie: 'Super Mario', suit: 0x6b4a2a, skin: 0x8a5a3a, acc: null, model: 'Models/dk/dk.glb' },
  { name: 'Mario', cat: 'Videojuegos', serie: 'Super Mario', suit: 0xd82222, skin: 0xf2c9a0, acc: null, model: 'Models/marioobj/marioobj.glb' },
  { name: 'Peach', cat: 'Videojuegos', serie: 'Super Mario', suit: 0xff9ac8, skin: 0xf2c9a0, acc: null, model: 'Models/peach2/peach2.glb' },
  { name: 'Yoshi', cat: 'Videojuegos', serie: 'Super Mario', suit: 0x35b835, skin: 0xe8e8e8, acc: null, model: 'Models/yoshi/yoshi.glb' },
  // ----- Videojuegos · The Legend of Zelda
  { name: 'Link', cat: 'Videojuegos', serie: 'The Legend of Zelda', suit: 0x2a7a2a, skin: 0xf2c9a0, acc: null, model: 'Models/link/link.glb' },
  // ----- Cómics · DC
  { name: 'Batman', cat: 'Cómics', serie: 'DC', suit: 0x1a1a22, skin: 0xe0b48f, acc: null, model: 'Models/batman/batman.glb' },
  { name: 'Joker', cat: 'Cómics', serie: 'DC', suit: 0x5a2a8a, skin: 0xf2f2f2, acc: null, model: 'Models/joker/joker.glb' },
  { name: 'Superman', cat: 'Cómics', serie: 'DC', suit: 0x2a4ad8, skin: 0xe0b48f, acc: null, model: 'Models/superman/superman.glb' },
  // ----- Cómics · Invencible
  { name: 'Anissa', cat: 'Cómics', serie: 'Invencible', suit: 0x8a2a4a, skin: 0xc98d64, acc: null, model: 'Models/anissa/anissa.glb' },
  { name: 'Atom Eve', cat: 'Cómics', serie: 'Invencible', suit: 0xe8e8e8, skin: 0xf2c9a0, acc: null, model: 'Models/atomeve/atomeve.glb' },
  { name: 'Battle Beast', cat: 'Cómics', serie: 'Invencible', suit: 0x5a6a8a, skin: 0x8a9ab0, acc: null, model: 'Models/beast/beast.glb' },
  { name: 'Conquest', cat: 'Cómics', serie: 'Invencible', suit: 0x6a6a7a, skin: 0xc9b090, acc: null, model: 'Models/conquest/conquest.glb' },
  { name: 'Invencible', cat: 'Cómics', serie: 'Invencible', suit: 0x2a6a8a, skin: 0xf2c9a0, acc: null, model: 'Models/mark/mark.glb' },
  { name: 'Invencible (traje negro)', cat: 'Cómics', serie: 'Invencible', suit: 0x2a6a8a, skin: 0xf2c9a0, acc: null, model: 'Models/wainv/wainv.glb' },
  { name: 'Omni-Man', cat: 'Cómics', serie: 'Invencible', suit: 0xe8e8e8, skin: 0xf2c9a0, acc: null, model: 'Models/omniman/omniman.glb' },
  { name: 'Thragg', cat: 'Cómics', serie: 'Invencible', suit: 0x6a7a8a, skin: 0xb0c0d0, acc: null, model: 'Models/thragg/thragg.glb' },
  // ----- Cómics · Marvel
  { name: 'Hulk', cat: 'Cómics', serie: 'Marvel', suit: 0x3a7a2a, skin: 0x3a7a2a, acc: null, model: 'Models/hulk/hulk.glb' },
  { name: 'Wolverine', cat: 'Cómics', serie: 'Marvel', suit: 0xd8a020, skin: 0xe0b48f, acc: null, model: 'Models/wolverine/wolverine.glb' },
  { name: 'Miles Morales', cat: 'Cómics', serie: 'Marvel', suit: 0x8a1a1a, skin: 0x6b4226, acc: null, model: 'Models/miles/miles.glb' },
  { name: 'Spider-Man', cat: 'Cómics', serie: 'Marvel', suit: 0xcc2222, skin: 0xcc2222, acc: null, model: 'Models/spidey/spidey.glb' },
  { name: 'Spider-Man (Spider-Verse)', cat: 'Cómics', serie: 'Marvel', suit: 0x8a1a2a, skin: 0xe0b48f, acc: null, model: 'Models/spiderverse/spiderverse.glb' },
  { name: 'Thanos', cat: 'Cómics', serie: 'Marvel', suit: 0x5a2a8a, skin: 0x6a4a8a, acc: null, model: 'Models/thanos/thanos.glb' },
  { name: 'Venom', cat: 'Cómics', serie: 'Marvel', suit: 0x1a1a22, skin: 0x1a1a22, acc: null, model: 'Models/venom/venom.glb' },
  // ----- Caricaturas y cine · Avatar
  { name: 'Aang', cat: 'Caricaturas y cine', serie: 'Avatar', suit: 0xd88a2a, skin: 0xf2c9a0, acc: null, model: 'Models/aang/aang.glb' },
  // ----- Caricaturas y cine · Ben 10
  { name: 'Ben 10', cat: 'Caricaturas y cine', serie: 'Ben 10', suit: 0x3a8a2a, skin: 0xf2c9a0, acc: null, model: 'Models/ben10/scene.gltf' },
  // ----- Caricaturas y cine · Bob Esponja
  { name: 'Bob Esponja', cat: 'Caricaturas y cine', serie: 'Bob Esponja', suit: 0xf2e030, skin: 0xf2e030, acc: null, model: 'Models/bob/bob.glb' },
  { name: 'Calamardo', cat: 'Caricaturas y cine', serie: 'Bob Esponja', suit: 0x6aa0b0, skin: 0x6aa0b0, acc: null, model: 'Models/squidward/squidward.glb' },
  { name: 'Patricio', cat: 'Caricaturas y cine', serie: 'Bob Esponja', suit: 0xe88aa0, skin: 0xe88aa0, acc: null, model: 'Models/patrick/patrick.glb' },
  // ----- Caricaturas y cine · El Chavo del 8
  { name: 'Don Ramón', cat: 'Caricaturas y cine', serie: 'El Chavo del 8', suit: 0x3a5a7a, skin: 0xe0b48f, acc: null, model: 'Models/donramon/donramon.glb' },
  { name: 'El Chavo', cat: 'Caricaturas y cine', serie: 'El Chavo del 8', suit: 0x8a6a3a, skin: 0xe8b880, acc: null, model: 'Models/chavo/chavo.glb' },
  // ----- Caricaturas y cine · Johnny Bravo
  { name: 'Johnny Bravo', cat: 'Caricaturas y cine', serie: 'Johnny Bravo', suit: 0x2a2a3a, skin: 0xe8b880, acc: null, model: 'Models/johnny/johnny.glb' },
  // ----- Caricaturas y cine · Las Tortugas Ninja
  { name: 'Donatello', cat: 'Caricaturas y cine', serie: 'Las Tortugas Ninja', suit: 0x6a3a8a, skin: 0x3a7a2e, acc: null, model: 'Models/donatello/donatello.glb' },
  { name: 'Leonardo', cat: 'Caricaturas y cine', serie: 'Las Tortugas Ninja', suit: 0x2a4ad8, skin: 0x3a7a2e, acc: null, model: 'Models/leo/leo.glb' },
  { name: 'Miguel Ángel', cat: 'Caricaturas y cine', serie: 'Las Tortugas Ninja', suit: 0xe8852a, skin: 0x3a7a2e, acc: null, model: 'Models/mike/mike.glb' },
  { name: 'Rafael', cat: 'Caricaturas y cine', serie: 'Las Tortugas Ninja', suit: 0xb02020, skin: 0x3a7a2e, acc: null, model: 'Models/raph/raph.glb' },
  // ----- Caricaturas y cine · Phineas y Ferb
  { name: 'Doofenshmirtz', cat: 'Caricaturas y cine', serie: 'Phineas y Ferb', suit: 0xe8e8e8, skin: 0xd8b090, acc: null, model: 'Models/doof/doof.glb' },
  { name: 'Perry', cat: 'Caricaturas y cine', serie: 'Phineas y Ferb', suit: 0x2aa8a0, skin: 0x2aa8a0, acc: null, model: 'Models/perry/perry.glb' },
  // ----- Caricaturas y cine · Scooby-Doo
  { name: 'Daphne', cat: 'Caricaturas y cine', serie: 'Scooby-Doo', suit: 0x8a2a8a, skin: 0xf2c9a0, acc: null, model: 'Models/daphne/daphne.glb' },
  { name: 'Fred', cat: 'Caricaturas y cine', serie: 'Scooby-Doo', suit: 0xe8e8e8, skin: 0xf2c9a0, acc: null, model: 'Models/fred/scene.gltf', fit: { scale: 94.1 } }, // mide 2 cm: el auto-fit lo descarta
  { name: 'Scooby-Doo', cat: 'Caricaturas y cine', serie: 'Scooby-Doo', suit: 0x8a5a2a, skin: 0x8a5a2a, acc: null, model: 'Models/scooby/scooby.glb' },
  { name: 'Shaggy', cat: 'Caricaturas y cine', serie: 'Scooby-Doo', suit: 0x6a8a2a, skin: 0xf2c9a0, acc: null, model: 'Models/shaggy/shaggy.glb' },
  { name: 'Velma', cat: 'Caricaturas y cine', serie: 'Scooby-Doo', suit: 0xe8852a, skin: 0xf2c9a0, acc: null, model: 'Models/velma/velma.glb' },
  // ----- Caricaturas y cine · Shrek
  { name: 'Shrek', cat: 'Caricaturas y cine', serie: 'Shrek', suit: 0x3a7a2e, skin: 0x6b9a3a, acc: null, model: 'Models/shrek/shrek.glb' },
  // ----- Personas reales
  { name: 'Cristiano Ronaldo', cat: 'Personas reales', logo: 'flag:pt', suit: 0xd8c020, skin: 0xc98d64, acc: null, model: 'Models/cr7/scene.gltf', fit: { turn: -Math.PI / 2 } }, // el archivo mira de lado (+X)
  { name: 'Elon Musk', cat: 'Personas reales', logo: 'logos/tesla.png', suit: 0x1a1a1a, skin: 0xf2c9a0, acc: null, model: 'Models/elon/elon.glb' },
  { name: 'Eminem', cat: 'Personas reales', logo: 'flag:us', suit: 0xe8e8e8, skin: 0xf2c9a0, acc: null, model: 'Models/eminem/eminem.glb' },
  { name: 'Epstein', cat: 'Personas reales', logo: 'flag:us', suit: 0x3a3a4a, skin: 0xe0b48f, acc: null, model: 'Models/epstein/epstein.glb' },
  { name: 'Franco', cat: 'Personas reales', logo: 'flag:es', suit: 0x3a3a4a, skin: 0xe0b48f, acc: null, model: 'Models/franco/franco.glb' },
  { name: 'IShowSpeed', cat: 'Personas reales', logo: 'flag:us', suit: 0x8a2a2a, skin: 0x8a5a3a, acc: null, model: 'Models/speed/speed.glb' },
  { name: 'JD Vance', cat: 'Personas reales', logo: 'flag:us', suit: 0x2a3a5a, skin: 0xf2c9a0, acc: null, model: 'Models/vance/vance.glb' },
  { name: 'Kanye West', cat: 'Personas reales', logo: 'flag:us', suit: 0x8a5a2a, skin: 0x8a5a2a, acc: null, model: 'Models/kanye/kanye.glb' },
  { name: 'Lamine Yamal', cat: 'Personas reales', logo: 'flag:es', suit: 0x8a1f3d, skin: 0x6b4226, acc: null, model: 'Models/lamine/lamine.glb' },
  { name: 'LeBron James', cat: 'Personas reales', logo: 'logos/nba.png', suit: 0x8a1f3d, skin: 0x4a2e1a, acc: null, model: 'Models/lebron2/lebron2.glb' },
  { name: 'Maduro', cat: 'Personas reales', logo: 'flag:ve', suit: 0x2a4a6a, skin: 0xc98d64, acc: null, model: 'Models/maduro/maduro.glb' },
  { name: 'Mark Zuckerberg', cat: 'Personas reales', logo: 'logos/meta.png', suit: 0x6a6a6a, skin: 0xf2c9a0, acc: null, model: 'Models/zuck/scene.gltf' },
  { name: 'Messi', cat: 'Personas reales', logo: 'flag:ar', suit: 0x8a1f3d, skin: 0xe0b48f, acc: null, model: 'Models/messi/messi.glb' },
  { name: 'Netanyahu', cat: 'Personas reales', logo: 'flag:il', suit: 0x2a3a5a, skin: 0xe0b48f, acc: null, model: 'Models/bibi/bibi.glb' },
  { name: 'Nicolas Cage', cat: 'Personas reales', logo: 'flag:us', suit: 0x1a1a22, skin: 0xe0b48f, acc: null, model: 'Models/noir/noir.glb' },
  { name: 'Putin', cat: 'Personas reales', logo: 'flag:ru', suit: 0x23232e, skin: 0xe0b48f, acc: null, model: 'Models/putin/scene.gltf' },
  { name: 'Romeo Santos', cat: 'Personas reales', logo: 'flag:do', suit: 0x8a1a1a, skin: 0x6b4226, acc: null, model: 'Models/blazer/blazer.glb' },
  { name: 'Ronaldinho', cat: 'Personas reales', logo: 'flag:br', suit: 0xd8a020, skin: 0x6b4226, acc: null, model: 'Models/ronaldinho/ronaldinho.glb' },
  { name: 'Taylor Swift', cat: 'Personas reales', logo: 'flag:us', suit: 0xd8d0e8, skin: 0xf2c9a0, acc: null, model: 'Models/taylor/taylor.glb' },
  { name: 'Trump', cat: 'Personas reales', logo: 'flag:us', suit: 0x2a3a6b, skin: 0xe0b48f, acc: null, model: 'Models/trump/trump.glb' },
];

// Copia barajada (Fisher-Yates): mesas y figurantes distintos en cada partida.
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Animaciones de Mixamo (FBX "Without Skin") en la carpeta Animations/.
// Para añadir más: descarga el FBX, ponlo en Animations/ y añade su ruta en el grupo que toque.
export const ANIMS = {
  sentado: { // en la mesa, en bucle; se elige al azar y va cambiando
    tranquilo: ['Animations/Sitting Talking.fbx', 'Animations/Sitting Talking (1).fbx'],
    molesto: ['Animations/Sitting Disbelief.fbx'],
    alterado: ['Animations/Sitting Disbelief (1).fbx'],
  },
  // Cuando alguien ATACA a otro (Attack, Favor, pareja o trío): una vez y vuelven a sentarse
  ataque: [ // quien ataca: gesto hacia su víctima (los de pie se levantan de la silla para hacerlo)
    'Animations/Aim Pistol.fbx',   // sentado, apuntando
    'Animations/Baseball Hit.fbx',
    'Animations/Golf Drive.fbx',
    'Animations/Punching Bag.fbx',
    'Animations/Drop Kick.fbx',
  ],
  reaccion: [ // la víctima, sentada
    'Animations/Sitting Disbelief (2).fbx',
    'Animations/Sitting Disapproval.fbx',
  ],
  mesa: [ // el resto de la mesa, algo más sencillo
    'Animations/Sitting Clap.fbx',
  ],
  baile: [ // victoria: el ganador baila uno ÚNICO; el público usa los demás
    'Animations/Breakdance 1990.fbx',
    'Animations/Breakdance Freeze Var 2.fbx',
    'Animations/Breakdance Freezes.fbx',
    'Animations/Breakdance Uprock Var 2.fbx',
    'Animations/Brooklyn Uprock.fbx',
    'Animations/Dancing Twerk.fbx',
    'Animations/Flair.fbx',
    'Animations/Hip Hop Dancing.fbx',
    'Animations/Northern Soul Spin Combo.fbx',
    'Animations/Rumba Dancing.fbx',
    'Animations/Salsa Dancing.fbx',
    'Animations/Salsa Dancing2.fbx',
    'Animations/Shuffling.fbx',
  ],
  muerte: [ // al explotar
    'Animations/Falling Back Death.fbx',
    // 'Animations/Flying Back Death.fbx', // OJO: este archivo es el twerk otra vez; vuelve a descargarlo
  ],
  celebra: [], // público celebrando (aplausos, vítores...): se suman a los bailes del público
};

// Orden en que se muestran las categorías en la selección.
export const CATEGORIES = ['Anime', 'Videojuegos', 'Cómics', 'Caricaturas y cine', 'Personas reales'];

// Logos: cada serie usa el archivo de logos/ indicado aquí; las personas reales llevan
// `logo` propio (archivo de logos/ o bandera "flag:xx", que se dibuja en js/icons.js).
// Si un archivo no existe, la tarjeta muestra iniciales y la etiqueta 3D solo el nombre.
// Personas reales sin logo de empresa: bandera de su país.
export const SERIES_LOGO = {
  'Baki': 'logos/baki.png', 'Dragon Ball': 'logos/dragon-ball.png', 'Jujutsu Kaisen': 'logos/jujutsu-kaisen.png', 'Naruto': 'logos/naruto.png',
  'Super Mario': 'logos/super-mario.png', 'Sonic': 'logos/sonic.png', 'The Legend of Zelda': 'logos/zelda.png',
  'GTA San Andreas': 'logos/gta-san-andreas.png',
  'Marvel': 'logos/marvel.png', 'DC': 'logos/dc.png', 'Invencible': 'logos/invencible.png',
  'Las Tortugas Ninja': 'logos/tortugas-ninja.png', 'Bob Esponja': 'logos/bob-esponja.png', 'Scooby-Doo': 'logos/scooby-doo.png',
  'Phineas y Ferb': 'logos/phineas-y-ferb.png', 'El Chavo del 8': 'logos/el-chavo.png', 'Avatar': 'logos/avatar.png',
  'Johnny Bravo': 'logos/johnny-bravo.png', 'Shrek': 'logos/shrek.png', 'Ben 10': 'logos/ben-10.png',
};
export const logoOf = p => p.logo || SERIES_LOGO[p.serie] || null;

export const TABLE_R = 2.1, SEAT_R = 3.3, CARD_W = 0.62, CARD_H = 0.88;

// MAPA DE ASIENTOS (única fuente de verdad): mesa en 0,0. Tú al sur (P1),
// resto en sentido horario. Avatares, sillas, abanicos, flechas y explosiones
// usan SIEMPRE estas coordenadas: imposible que discrepen.
export const SEATS = [
  { x: 0, z: 2.45 },   // P1 (tú) pegado a la mesa para verte bien
  { x: 3.3, z: 0 },    // P2 este
  { x: 0, z: -3.3 },   // P3 norte, al fondo
  { x: -3.3, z: 0 },   // P4 oeste
];
export const seatAngle = p => Math.atan2(SEATS[p].x, SEATS[p].z);

export const CATS = ['Taco Cat', 'Melon Cat', 'Hairy Cat', 'Beardy Cat', 'Rainbow Cat'];
export const WANTED_OPTS = ['Skip', 'Attack', 'Favor', 'Shuffle', 'See Future', 'Nope', 'Defuse'];

// Tu asiento: SOLO ves tus frentes. Los rivales son dorso por AMBAS caras
// (aunque orbits detrás de ellos nunca ves sus dibujos; en multiplayer el servidor
// además solo enviará tu mano a tu navegador).
export const MY_SEAT = 0;
