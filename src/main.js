// main.js — the ONLY place the Phaser.Game is constructed. Runtime origin: http, plain ES modules,
// Phaser 4.1.0 vendored at lib/. See specs/engine/architecture.md.

import Phaser from '../lib/phaser.esm.min.js';
import { VIEW_W, VIEW_H, SIM_HZ, DEBUG } from './config.js';

import { SystemScene } from './scenes/SystemScene.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { RunScene } from './scenes/RunScene.js';
import { HudScene } from './scenes/HudScene.js';
import { PauseScene } from './scenes/PauseScene.js';
import { RewardScene } from './scenes/RewardScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { RunEndScene } from './scenes/RunEndScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { CreditsScene } from './scenes/CreditsScene.js';
import { ConfirmScene } from './scenes/ConfirmScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#0b0a10',
  width: VIEW_W,
  height: VIEW_H,
  // Integer zoom is applied by platform/display.js (scale.setZoom(k) on resize). NONE honours zoom.
  scale: { mode: Phaser.Scale.NONE, width: VIEW_W, height: VIEW_H, zoom: 1 },
  pixelArt: true,                 // antialias off + roundPixels on (verified in the 4.1.0 build)
  render: { pixelArt: true, antialias: false, roundPixels: true },
  input: { gamepad: false, keyboard: true, mouse: true, touch: false },   // pads: platform/gamepad.js (one Gamepad-API boundary)
  disableContextMenu: true,
  physics: {
    default: 'arcade',
    // One clock: the gameplay sim runs on Arcade's 'worldstep' (architecture §4).
    arcade: { fps: SIM_HZ, fixedStep: true, gravity: { x: 0, y: 0 }, debug: false },
  },
  audio: { disableWebAudio: false },
  // SystemScene FIRST: it samples input before any other scene updates, and it never stops.
  scene: [
    SystemScene, BootScene, TitleScene, RunScene, HudScene,
    PauseScene, RewardScene, ShopScene, RunEndScene, SettingsScene, CreditsScene, ConfirmScene,
  ],
};

const game = new Phaser.Game(config);

// Craft-verification / console hooks (no gameplay code reads these).
window.__SW__ = window.__SW__ || {};
window.__SW__.game = game;
window.__SW__.debug = DEBUG;
export default game;
