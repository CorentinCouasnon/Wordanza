// Constantes partagées entre toutes les Cloud Functions.
//
// La donnée pure (tables, distributions, coûts, seuils) vit dans
// `shared/gameData.json` à la racine du projet : source de vérité unique,
// consommée à la fois par le client (src/constants/*) et par ce fichier.
// Le JSON est copié en `functions/shared/gameData.json` au déploiement
// (voir `firebase.json` predeploy).
//
// Les fonctions dérivées (drawRandomLetter, getTargetScore, computeNewAP…)
// restent ici : JSON ne peut pas stocker de code. Leurs équivalents client
// vivent dans src/constants/* et src/utils/ap.js (miroir, mais trivial).
//
// Pour le dev local des Cloud Functions (emulators), exécuter :
//   node -e "const fs=require('fs'); fs.mkdirSync('./functions/shared',{recursive:true}); fs.copyFileSync('./shared/gameData.json','./functions/shared/gameData.json')"

'use strict'

// En deploy : functions/shared/gameData.json (copié par predeploy).
// En dev local (emulators), si le miroir n'existe pas on tente le chemin racine.
let DATA
try {
  DATA = require('./shared/gameData.json')
} catch {
  DATA = require('../shared/gameData.json')
}

// ── Matchmaking ──────────────────────────────────────────────────────────────

const HANDICAP_TOLERANCE = DATA.HANDICAP_TOLERANCE
const MAX_WAIT_MS        = DATA.MAX_WAIT_MS

// ── Pearls ───────────────────────────────────────────────────────────────────

// JSON stocke les clés numériques en tant que strings, on reconvertit ici
const PEARL_REWARDS = Object.fromEntries(
  Object.entries(DATA.PEARL_REWARDS).map(([k, v]) => [Number(k), v])
)
const PEARL_PARTICIPATION = DATA.PEARL_PARTICIPATION

function getPearlReward(rank) {
  return rank ? (PEARL_REWARDS[rank] ?? PEARL_PARTICIPATION) : PEARL_PARTICIPATION
}

// ── Handicap ─────────────────────────────────────────────────────────────────

const HANDICAP_TABLE = Object.fromEntries(
  Object.entries(DATA.HANDICAP_TABLE).map(([k, v]) => [Number(k), v])
)

function getTargetScore(totalSkillPoints) {
  const clamped = Math.max(0, Math.min(30, totalSkillPoints))
  return HANDICAP_TABLE[clamped] ?? 650
}

function getTotalSkillPoints(skills) {
  return (skills.speed ?? 0) + (skills.creativity ?? 0) + (skills.wisdom ?? 0)
}

// ── Compétences ───────────────────────────────────────────────────────────────

function getSkillLevelCost(level) {
  return 10 * level * level
}

const SKILL_IDS = DATA.SKILL_IDS
const SKILL_MAX = DATA.SKILL_MAX

// ── Slots de parties simultanées ─────────────────────────────────────────────

const GAME_SLOT_COST       = DATA.GAME_SLOT_COST
const MAX_EXTRA_GAME_SLOTS = DATA.MAX_EXTRA_GAME_SLOTS

// ── Power-ups ────────────────────────────────────────────────────────────────

// On reconstruit POWERUPS avec Infinity (JSON ne supporte pas Infinity, on
// stocke -1 dans le JSON et on convertit ici).
const POWERUPS = Object.fromEntries(
  Object.entries(DATA.POWERUP_COSTS).map(([id, p]) => [
    id,
    { ...p, usesPerGame: p.usesPerGame === -1 ? Infinity : p.usesPerGame },
  ])
)

const SHIELDABLE_POWERUPS = DATA.SHIELDABLE_POWERUPS

// ── Lettres ───────────────────────────────────────────────────────────────────

const LETTER_DISTRIBUTIONS = DATA.LETTER_DISTRIBUTIONS
const VOWELS               = new Set(DATA.VOWELS)

function buildLetterBag(language = 'en') {
  const dist = LETTER_DISTRIBUTIONS[language] ?? LETTER_DISTRIBUTIONS.en
  const bag  = []
  for (const [letter, count] of Object.entries(dist)) {
    for (let i = 0; i < count; i++) bag.push(letter)
  }
  return bag
}

function drawRandomLetter(language = 'en') {
  const bag = buildLetterBag(language)
  return bag[Math.floor(Math.random() * bag.length)]
}

function drawRandomVowel(language = 'en') {
  const bag = buildLetterBag(language).filter(l => VOWELS.has(l))
  return bag[Math.floor(Math.random() * bag.length)]
}

function drawRandomConsonant(language = 'en') {
  const bag = buildLetterBag(language).filter(l => !VOWELS.has(l))
  return bag[Math.floor(Math.random() * bag.length)]
}

function drawMultipleLetters(count, language = 'en') {
  return Array.from({ length: count }, () => drawRandomLetter(language))
}

// ── Action Points ────────────────────────────────────────────────────────────

const AP_MAX = DATA.AP_MAX

function getCurrentAP(apStored, lastApUpdate) {
  const elapsedMs = Math.max(0, Date.now() - (lastApUpdate ?? Date.now()))
  const minutes   = Math.floor(elapsedMs / 60_000)
  return Math.min(AP_MAX, (apStored ?? 0) + minutes)
}

// Déduit `cost` AP des PA courants. Préserve la fraction de minute en cours
// (recule lastApUpdate de `remainingMs`) pour éviter la dérive entre joueurs.
function computeNewAP(apStored, lastApUpdate, cost) {
  const current   = getCurrentAP(apStored, lastApUpdate)
  const newStore  = Math.max(0, current - cost)
  const elapsedMs = Math.max(0, Date.now() - (lastApUpdate ?? Date.now()))
  const remainMs  = elapsedMs % 60_000
  return { apStored: newStore, lastApUpdate: Date.now() - remainMs }
}

// ── Bots ──────────────────────────────────────────────────────────────────────

const BOT_NAMES = DATA.BOT_NAMES

function randomBotName(usedNames = []) {
  const available = BOT_NAMES.filter(n => !usedNames.includes(n))
  const pool      = available.length > 0 ? available : BOT_NAMES
  return pool[Math.floor(Math.random() * pool.length)]
}

// ── Fin de partie automatique ────────────────────────────────────────────────

/**
 * Si une seule personne est encore en lice (non `finished`) dans `players`, on
 * la marque automatiquement comme terminée avec son score courant et le rang
 * suivant. Évite d'obliger le dernier joueur à jouer seul : il reçoit ses
 * perles normalement (pas marqué `forfeited`) via onGameEnd.
 * Retourne un nouveau tableau si une modification a eu lieu, sinon l'original.
 */
function autoFinishLastPlayer(players) {
  const remaining = (players ?? []).filter(p => !p.finished)
  if (remaining.length !== 1) return players
  const alreadyFinishedCount = players.length - 1
  return players.map(p => {
    if (p.finished) return p
    return {
      ...p,
      finished:   true,
      rank:       alreadyFinishedCount + 1,
      finishedAt: Date.now(),
    }
  })
}

// ── Construction des entrées joueurs ─────────────────────────────────────────

/**
 * Construit l'objet joueur stocké dans players[] d'une partie.
 * Miroir de buildPlayerEntry dans src/services/gameService.js.
 */
function buildPlayerEntry(userId, displayName, skills = {}) {
  const creativity = skills.creativity ?? 0
  const wisdom     = skills.wisdom     ?? 0

  return {
    userId,
    displayName,
    score:             0,
    targetScore:       getTargetScore(getTotalSkillPoints(skills)),
    apStored:          160 + wisdom * 20,
    lastApUpdate:      Date.now(),
    hand:              [],
    handSize:          6 + creativity,
    finished:          false,
    rank:              null,
    finishedAt:        null,
    pearlsDistributed: false,
    shieldActive:      false,
    powerupUsage:      {},
  }
}

/**
 * Construit l'objet joueur pour un bot.
 * Miroir de buildBotPlayerEntry dans src/services/gameService.js.
 */
function buildBotPlayerEntry(displayName, language = 'en') {
  const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const entry = buildPlayerEntry(botId, displayName, {})
  return {
    ...entry,
    isBot: true,
    hand:  drawMultipleLetters(entry.handSize, language),
  }
}

module.exports = {
  HANDICAP_TOLERANCE,
  MAX_WAIT_MS,
  PEARL_REWARDS,
  PEARL_PARTICIPATION,
  getPearlReward,
  HANDICAP_TABLE,
  getTargetScore,
  getTotalSkillPoints,
  getSkillLevelCost,
  SKILL_IDS,
  SKILL_MAX,
  POWERUPS,
  SHIELDABLE_POWERUPS,
  GAME_SLOT_COST,
  MAX_EXTRA_GAME_SLOTS,
  LETTER_DISTRIBUTIONS,
  VOWELS,
  drawMultipleLetters,
  drawRandomLetter,
  drawRandomVowel,
  drawRandomConsonant,
  AP_MAX,
  getCurrentAP,
  computeNewAP,
  BOT_NAMES,
  randomBotName,
  buildPlayerEntry,
  buildBotPlayerEntry,
  autoFinishLastPlayer,
}
