// ================= Arranque =================
// Lógica en js/game.js · salas y red en js/session.js + js/net.js · 3D en js/world.js
// DOM en js/ui.js · sonido en js/audio.js · arte en js/art.js · config en js/config.js

import { init } from './js/world.js';
import { wireUI } from './js/ui.js';

init();
wireUI();
