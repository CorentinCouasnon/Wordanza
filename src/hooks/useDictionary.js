// Hook pour charger et interroger le dictionnaire de mots.
//
// Le dictionnaire est un fichier JSON (tableau de mots en majuscules)
// chargé une seule fois au montage du composant.
// On le stocke dans un Set pour des lookups O(1).
//
// En Phase 1 : on utilise un petit dictionnaire de test embarqué.
// En Phase 6 : on chargera le vrai fichier JSON par langue.

import { useState, useEffect, useRef } from 'react'

// Dictionnaire de test embarqué, utilisé si le fichier JSON n'est pas encore présent.
// Contient ~400 mots anglais courants pour permettre de tester le jeu.
const TEST_DICTIONARY = new Set([
  // 2 lettres
  'AB','AD','AE','AG','AH','AI','AL','AM','AN','AR','AS','AT','AW','AX','AY',
  'BA','BE','BI','BO','BY',
  'DA','DE','DO',
  'ED','EF','EH','EL','EM','EN','ER','ES','ET','EX',
  'FA','FE',
  'GI','GO',
  'HA','HE','HI','HM','HO',
  'ID','IF','IN','IS','IT',
  'JO',
  'KA','KI',
  'LA','LI','LO',
  'MA','ME','MI','MM','MO','MU','MY',
  'NA','NE','NO','NU',
  'OD','OE','OF','OH','OI','OM','ON','OP','OR','OS','OW','OX','OY',
  'PA','PE','PI',
  'QI',
  'RE',
  'SH','SI','SO',
  'TA','TI','TO',
  'UH','UM','UN','UP','US','UT',
  'WE','WO',
  'XI','XU',
  'YA','YE','YO',
  'ZA',
  // 3 lettres
  'ACE','ACT','ADD','AGE','AGO','AID','AIM','AIR','ALL','AND','ANT','APE','APT',
  'ARC','ARE','ARK','ARM','ART','ASH','ASK','ATE','AWE','AXE',
  'BAD','BAG','BAN','BAR','BAT','BAY','BED','BEG','BET','BID','BIG','BIT','BOW',
  'BOX','BOY','BUD','BUG','BUN','BUS','BUT','BUY',
  'CAB','CAM','CAN','CAP','CAR','CAT','COP','COT','COW','CRY','CUB','CUP','CUT',
  'DAB','DAD','DAM','DAY','DEN','DEW','DID','DIG','DIM','DIP','DOE','DOG','DOT',
  'DRY','DUB','DUG','DUO','DYE',
  'EAR','EAT','EEL','EGG','ELK','ELM','EMU','END','ERA','EVE','EWE','EYE',
  'FAD','FAN','FAR','FAT','FAX','FAY','FED','FEW','FIG','FIN','FIT','FIX','FLY',
  'FOB','FOE','FOG','FON','FOR','FOX','FRY','FUB','FUD','FUN','FUR',
  'GAB','GAG','GAL','GAP','GAS','GAY','GEL','GEM','GET','GIG','GIN','GNU','GOB',
  'GOD','GOT','GUM','GUN','GUT','GUY','GYM',
  'HAD','HAM','HAS','HAT','HAY','HEN','HEW','HID','HIM','HIS','HIT','HOB','HOD',
  'HOG','HOP','HOT','HOW','HUB','HUG','HUH','HUM','HUT',
  'ICE','ICY','ILL','IMP','INK','INN','ION','IRE','IRK',
  'JAB','JAG','JAM','JAR','JAW','JAY','JET','JIG','JOB','JOG','JOT','JOY','JUG',
  'JUT',
  'KEG','KID','KIT',
  'LAB','LAD','LAG','LAP','LAW','LAX','LAY','LEA','LED','LEG','LET','LID','LIE',
  'LIT','LOG','LOT','LOW',
  'MAD','MAN','MAP','MAR','MAT','MAW','MAY','MEN','MET','MID','MIX','MOB','MOD',
  'MOM','MOP','MOW','MUD','MUG','MUM',
  'NAB','NAG','NAP','NAY','NET','NEW','NIP','NIT','NOB','NOD','NOR','NOT','NOW',
  'NUB','NUN','NUT',
  'OAF','OAK','OAR','OAT','ODD','ODE','OFF','OFT','OHM','OIL','OLD','OPT','ORB',
  'ORE','OUR','OUT','OWE','OWL','OWN',
  'PAD','PAL','PAN','PAP','PAR','PAT','PAW','PAY','PEA','PEG','PEN','PEP','PET',
  'PEW','PIE','PIG','PIN','PIP','PIT','PIX','PLY','POD','POP','POT','POW','PRY',
  'PUB','PUG','PUN','PUP','PUS','PUT',
  'RAG','RAM','RAN','RAP','RAT','RAW','RAY','RED','RID','RIG','RIM','RIP','ROB',
  'ROD','ROT','ROW','RUB','RUG','RUM','RUN','RUT','RYE',
  'SAC','SAD','SAG','SAP','SAT','SAW','SAY','SEA','SET','SEW','SHY','SIN','SIP',
  'SIR','SIT','SIX','SKI','SKY','SLY','SOB','SOD','SON','SOP','SOT','SOW','SOY',
  'SPA','SPY','STY','SUB','SUM','SUN','SUP',
  'TAB','TAD','TAN','TAP','TAR','TAT','TAX','TEA','TEN','THE','TIE','TIN','TIP',
  'TOE','TOM','TON','TOO','TOP','TOT','TOW','TOY','TUB','TUG','TUN','TWO',
  'URN','USE',
  'VAN','VAT','VET','VIA','VIE','VOW',
  'WAD','WAG','WAR','WAS','WAX','WEB','WED','WIG','WIN','WIT','WOE','WOK','WON',
  'WOO','WOW',
  'YAK','YAM','YAP','YAW','YEA','YEW','YOW',
  'ZAG','ZAP','ZED','ZEN','ZIT','ZOO',
  // 4+ lettres
  'ABLE','ABLY','ACHE','ACID','ACRE','AGES','AIMS','AIDE','AILS','AIMS','AIRS',
  'ALSO','ALTO','AMEN','AMID','ANAL','ANTE','ANTI','APEX','ARCH','AREA','ARIA',
  'ARID','ARKS','ARMS','ARMY','ARTS','ARTY','AVER','AVID','AVOW','AWED','AWRY',
  'BABY','BACK','BAIL','BAIT','BAKE','BALD','BALE','BALL','BALM','BAND','BANE',
  'BANG','BANK','BARE','BARK','BARN','BASE','BASH','BASK','BASS','BATE','BATH',
  'BATS','BAWL','BEAD','BEAK','BEAM','BEAN','BEAR','BEAT','BEEF','BEEN','BEER',
  'BELL','BELT','BEND','BENT','BEST','BIKE','BILE','BILL','BIND','BIRD','BITE',
  'BLOT','BLOW','BLUE','BLUR','BOAT','BOLD','BONE','BOOK','BOOT','BORE','BORN',
  'BOTH','BREW','BRIM','BULL','BURN','BURP',
  'CAGE','CAKE','CALL','CALM','CAME','CANE','CARD','CARE','CART','CASE','CASH',
  'CAST','CAVE','CELL','CHAT','CHEW','CHIN','CHIP','CHOP','CITE','CITY','CLAM',
  'CLAP','CLAW','CLAY','CLOD','CLOP','CLOT','CLUB','CLUE','COAL','COAT','CODE',
  'COIL','COIN','COLD','COME','COOK','COOL','COPY','CORD','CORE','CORK','CORN',
  'COST','COZY','CRAM','CREW','CROP','CROW','CUBE','CURE','CURL',
  'DAMP','DARE','DARK','DART','DASH','DATA','DATE','DEAD','DEAL','DEAR','DEED',
  'DEEP','DENY','DESK','DIAL','DIRT','DISK','DIVE','DOCK','DOES','DONE','DOOM',
  'DOOR','DOSE','DOVE','DOWN','DRAG','DRAW','DREW','DRIP','DROP','DRUM','DUCK',
  'DUEL','DULL','DUMB','DUMP','DUNE','DUSK','DUST','DUTY',
  'EACH','EARL','EARN','EASE','EAST','EASY','EDGE','EMIT','EPIC','EVEN','EVER',
  'EVIL','EXAM',
  'FACE','FACT','FAIL','FAIR','FAKE','FALL','FAME','FARE','FARM','FAST','FATE',
  'FEAT','FEEL','FEET','FELL','FELT','FILE','FILL','FILM','FIND','FINE','FIRE',
  'FIRM','FISH','FIST','FLAG','FLAT','FLAW','FLED','FLEW','FLIP','FLOCK','FLOW',
  'FOAM','FOLD','FOLK','FOND','FONT','FOOD','FOOL','FOOT','FORD','FORE','FORK',
  'FORM','FORT','FOUL','FOUR','FREE','FROG','FROM','FUEL','FULL',
  'GAIN','GALE','GALL','GAZE','GEAR','GIFT','GIRL','GIVE','GLAD','GLEE','GLOB',
  'GLOW','GLUE','GLUM','GOAL','GOAT','GOLD','GOLF','GONE','GOOD','GORE','GOWN',
  'GRAB','GRAM','GRAY','GREW','GRID','GRIM','GRIN','GRIP','GRIT','GROW','GRUB',
  'GULL','GULP','GUST',
  'HACK','HAIL','HAIR','HALF','HALL','HALT','HAND','HANG','HARD','HARE','HARM',
  'HARP','HART','HATE','HAVE','HAWK','HEAL','HEAP','HEAR','HEAT','HEEL','HELD',
  'HELM','HELP','HERB','HERD','HERE','HERO','HIGH','HILL','HINT','HIRE','HOLD',
  'HOLE','HOLY','HOME','HOPE','HORN','HOUR','HUGE','HULL','HUMP','HUNG','HUNT',
  'HURL','HURT',
  'IDEA','IDLE','IRIS','IRON','ISLE',
  'JACK','JADE','JAIL','JEAN','JEST','JOIN','JOKE','JOLT','JUMP','JUST',
  'KEEN','KEEP','KILL','KIND','KING','KNOB','KNOT','KNOW',
  'LACK','LAID','LAME','LAMP','LAND','LANE','LARK','LASH','LAST','LATE','LAUD',
  'LAWN','LEAD','LEAF','LEAN','LEAP','LEND','LENS','LEST','LEVY','LICK','LIFE',
  'LIFT','LIKE','LIME','LIMP','LINE','LINK','LION','LIST','LIVE','LOAD','LOAM',
  'LOAN','LOCK','LOFT','LONE','LONG','LOOK','LOOP','LORE','LORN','LOSS','LOST',
  'LOUD','LOVE','LUCK','LULL','LUMP','LUNG','LURE','LURK','LUST',
  'MADE','MAIL','MAIN','MAKE','MALE','MALL','MANE','MARK','MARSH','MAST','MATE',
  'MAZE','MEAL','MEAN','MEAT','MEND','MERE','MESH','MILD','MILE','MILK','MILL',
  'MIME','MIND','MINE','MINT','MIRE','MISS','MOAN','MOAT','MOCK','MODE','MOLE',
  'MOLT','MONK','MOOD','MOON','MOOR','MORE','MOSS','MOST','MOTH','MUCK','MULE',
  'MUSE','MUST',
  'NAIL','NAME','NEAR','NEAT','NEED','NEST','NEWS','NEXT','NICE','NICK','NINE',
  'NODE','NONE','NOON','NORM','NOSE','NOTE','NOUN',
  'OATH','OBEY','ONCE','ONLY','OPEN','OVER','OWED',
  'PACE','PACK','PAGE','PAIN','PAIR','PALE','PALM','PAVE','PEAK','PEAR','PEEL',
  'PEER','PERK','PETAL','PICK','PIER','PILE','PINE','PINK','PIPE','PLAN','PLAY',
  'PLEA','PLOD','PLOT','PLOW','PLUG','PLUM','PLUS','POEM','POET','POLE','POLL',
  'POND','POOL','POOR','PORE','POSE','POST','POUR','PRAY','PREY','PROD','PROP',
  'PULL','PUMP','PURE','PUSH',
  'RACK','RAIN','RAKE','RAMP','RANG','RANK','RANT','RASH','RASP','READ','REAL',
  'REAP','REEL','REND','RENT','REST','RICE','RICH','RIDE','RIFE','RIFT','RING',
  'RIOT','RIPE','RISE','RISK','RITE','ROAD','ROAM','ROAR','ROBE','ROCK','RODE',
  'ROLE','ROLL','ROOF','ROOK','ROOM','ROOT','ROPE','ROSE','ROSY','ROUT','ROVE',
  'RUIN','RULE','RUSH','RUST',
  'SACK','SAFE','SAGE','SAIL','SALT','SAME','SAND','SANE','SANG','SANK','SASH',
  'SAVE','SCAN','SCAR','SEAL','SEAM','SEAT','SEED','SEEK','SEEM','SEEN','SELF',
  'SELL','SEND','SENT','SHED','SHIN','SHIP','SHOP','SHOT','SHOW','SHUT','SICK',
  'SIGN','SILK','SILL','SILT','SING','SINK','SIZE','SKIN','SKIP','SLAM','SLAP',
  'SLIM','SLIP','SLIT','SLOB','SLOT','SLUG','SLUM','SNAP','SNIP','SNOW','SOAK',
  'SOAP','SOAR','SOCK','SOFT','SOIL','SOLD','SOLE','SOME','SONG','SOON','SORE',
  'SORT','SOUL','SOUP','SOUR','SPAN','SPAR','SPIN','SPIT','SPOT','SPUR','STAR',
  'STAY','STEM','STEP','STIR','STOP','STOW','STUB','STUD','STUN','SUCK','SUIT',
  'SULK','SURE','SURF','SWAM','SWAN','SWAP','SWIM',
  'TACK','TAIL','TALE','TALK','TALL','TAME','TANG','TANK','TAPE','TART','TASK',
  'TEAM','TEAR','TEED','TELL','TEND','TENT','TERM','TEST','THAN','THAT','THEM',
  'THEN','THEY','THIN','THIS','TICK','TIDE','TILT','TIME','TOAD','TOLD','TOLL',
  'TOMB','TONE','TOOK','TOOL','TORE','TOSS','TOUR','TOWN','TRAP','TRIM','TRIP',
  'TROD','TROT','TROY','TRUE','TUCK','TUFT','TUNE','TURF','TURN','TUSK','TWIN',
  'TWIT',
  'UGLY','UNDO','UNIT','UPON','URGE','USED',
  'VAIN','VALE','VANE','VAST','VEIL','VEIN','VERY','VEST','VIEW','VILE','VINE',
  'VOID','VOLT','VOTE',
  'WADE','WAGE','WAIL','WAIT','WAKE','WALK','WALL','WAND','WANT','WARD','WARM',
  'WARN','WART','WASH','WAVE','WEAK','WEAL','WEAN','WEED','WEEK','WELD','WELL',
  'WELT','WENT','WERE','WEST','WHAT','WHEN','WHIM','WHIP','WHOM','WICK','WIDE',
  'WILE','WILT','WIND','WINE','WING','WINK','WIRE','WISE','WISH','WITH','WOKE',
  'WOLF','WOMB','WOOD','WOOL','WORD','WORE','WORK','WORM','WORN','WOVE','WREN',
  'WRIT',
  'YARD','YARN','YAWN','YEAR','YELL','YOKE','YORE','YOUR',
  'ZEAL','ZERO','ZEST','ZINC','ZONE',
  // 5+ lettres courantes
  'ABUSE','ACUTE','ADMIT','ADOPT','ADULT','AFTER','AGAIN','AGENT','AGREE','AHEAD',
  'ALARM','ALBUM','ALERT','ALGAE','ALIEN','ALIGN','ALIKE','ALIVE','ALLEY','ALLOW',
  'ALONE','ALONG','ALOUD','AMBER','AMEND','AMINO','AMONG','ANGEL','ANGER','ANGLE',
  'ANGRY','ANNEX','ANTIC','ANVIL','AORTA','APART','APPLE','APPLY','ARENA','ARGUE',
  'ARISE','ARMOR','AROMA','AROSE','ARRAY','ARROW','ASSET','ATLAS','ATONE','ATTIC',
  'AUDIT','AVAIL','AVOID','AWAIT','AWAKE','AWARD','AWARE',
  'BADGE','BADLY','BAGEL','BASIC','BASIN','BASIS','BEACH','BEAST','BEGIN','BELOW',
  'BENCH','BERRY','BEVEL','BIRTH','BISON','BITCH','BLADE','BLAME','BLAND','BLANK',
  'BLAST','BLAZE','BLEAT','BLEND','BLESS','BLIND','BLINK','BLOCK','BLOOD','BLOOM',
  'BLOWN','BOARD','BONUS','BOOST','BOOTH','BOUND','BRACE','BRAIN','BRAND','BRAVE',
  'BREAK','BREED','BRICK','BRIDE','BRIEF','BRING','BRISK','BROAD','BROKE','BROOD',
  'BROOK','BRUSH','BRUTE','BUILD','BUILT','BULGE','BULLY','BUNCH','BURST','BUYER',
  'CABIN','CAMEL','CANDY','CARGO','CARRY','CATCH','CAUSE','CEDAR','CHAIN','CHAIR',
  'CHALK','CHAOS','CHARM','CHART','CHASE','CHEAP','CHEAT','CHECK','CHEEK','CHEER',
  'CHESS','CHEST','CHIEF','CHILD','CHILL','CHOIR','CHUNK','CIVIC','CIVIL','CLAIM',
  'CLASH','CLASP','CLASS','CLEAN','CLEAR','CLERK','CLICK','CLIFF','CLIMB','CLING',
  'CLOCK','CLONE','CLOSE','CLOTH','CLOUD','COACH','COBRA','COMET','COMIC','COMMA',
  'CORAL','COUNT','COURT','COVER','CRAFT','CRANE','CRASH','CREAK','CREAM','CREED',
  'CREEK','CREEP','CRIME','CRISP','CROSS','CROWN','CRUEL','CRUSH','CURVE','CYCLE',
  'DAILY','DANCE','DEATH','DELTA','DENSE','DEPOT','DERBY','DEPTH','DEVIL','DIGIT',
  'DIRTY','DITCH','DIVER','DIZZY','DOGMA','DOUBT','DOUGH','DRAFT','DRAIN','DRAKE',
  'DRANK','DRAPE','DRAWL','DREAD','DREAM','DRESS','DRIFT','DRILL','DRINK','DRIVE',
  'DRONE','DROVE','DRYER','DWARF','DWELL','DYING',
  'EAGER','EAGLE','EARLY','EARTH','EIGHT','ELECT','ELITE','EMAIL','EMPTY','ENEMY',
  'ENJOY','ENTER','ENTRY','EQUAL','ERROR','EVENT','EVERY','EXACT','EXIST','EXTRA',
  'FABLE','FAINT','FAITH','FANCY','FATAL','FAULT','FEAST','FENCE','FERRY','FEVER',
  'FIBER','FIELD','FIERY','FIFTH','FIFTY','FIGHT','FINAL','FIRST','FIXED','FLAME',
  'FLARE','FLASH','FLASK','FLECK','FLESH','FLOCK','FLOOD','FLOOR','FLORA','FLOUR',
  'FLUTE','FOCAL','FORCE','FORGE','FORTH','FORUM','FOUND','FRAME','FRANK','FRAUD',
  'FRESH','FRONT','FROST','FROZE','FRUIT','FUNDS','FUNKY','FUNNY','FUTON',
  'GAUGE','GHOST','GIANT','GIVEN','GIZMO','GLAND','GLARE','GLASS','GLIDE','GLOSS',
  'GLOVE','GOING','GRACE','GRADE','GRAIN','GRAND','GRANT','GRAPE','GRASP','GRASS',
  'GRAVE','GREAT','GREEN','GREET','GRIEF','GRIND','GROAN','GROSS','GROUP','GROUT',
  'GROVE','GROWN','GUARD','GUAVA','GUIDE','GUILE','GUISE','GULCH','GUSTO',
  'HABIT','HAPPY','HARSH','HASTE','HAVEN','HEART','HEAVY','HENCE','HIPPO','HONEY',
  'HONOR','HORSE','HOTEL','HOUSE','HUMAN','HUMOR','HURRY',
  'ICING','IMAGE','IMPLY','INDEX','INFER','INNER','INPUT','INTER','INTRO','ISSUE',
  'JAPAN','JEWEL','JOINT','JOKER','JUDGE','JUICE','JUICY','JUMPY','JUNGLE',
  'KAYAK','KEBAB','KNEEL','KNIFE','KNOCK','KNOWN',
  'LABEL','LANCE','LAPSE','LARGE','LASER','LATCH','LATER','LATTE','LAYER','LEARN',
  'LEASE','LEAST','LEAVE','LEDGE','LEGAL','LEMON','LEVEL','LIGHT','LIMIT','LINER',
  'LIVER','LOCAL','LODGE','LOFTY','LOGIC','LOOSE','LOVER','LOWER','LOYAL','LUCID',
  'LUCKY','LUNAR','LUSTY',
  'MAGIC','MAJOR','MAKER','MANOR','MAPLE','MARCH','MARRY','MATCH','MAYOR','MERCY',
  'MERGE','MERIT','METAL','MIGHT','MINOR','MINUS','MIRTH','MISER','MOIST','MONEY',
  'MONTH','MORAL','MOTEL','MOTOR','MOTTO','MOUNT','MOUSE','MOUTH','MOVIE','MUDDY',
  'MULCH','MUSIC',
  'NAIVE','NERVE','NEVER','NIGHT','NINJA','NOBLE','NOISE','NORTH','NOTCH','NURSE',
  'NYMPH',
  'OCCUR','OCEAN','OFFER','OFTEN','OLIVE','ONSET','OPTIC','ORDER','ORGAN','OTHER',
  'OTTER','OUTER','OWNER',
  'PAINT','PANEL','PANIC','PAPER','PARTY','PATCH','PAUSE','PEACE','PEACH','PEARL',
  'PEDAL','PENNY','PERCH','PERIL','PHASE','PHONE','PHOTO','PIANO','PILOT','PINCH',
  'PIXEL','PIZZA','PLACE','PLAIN','PLANE','PLANT','PLATE','PLAZA','PLEAD','PLEAT',
  'PLUCK','PLUME','PLUMP','PLUNK','POINT','POISE','POKER','POLAR','POLKA','POPPY',
  'PORCH','PORKY','POWER','PRESS','PRICE','PRIDE','PRIME','PRINT','PRIZE','PROBE',
  'PRONE','PROOF','PROSE','PROUD','PROVE','PROWL','PROXY','PULSE','PURSE','PUSHY',
  'QUEEN','QUERY','QUEST','QUEUE','QUICK','QUIET','QUOTA','QUOTE',
  'RADAR','RADIO','RAISE','RALLY','RANCH','RANGE','RAPID','RATIO','REACH','REACT',
  'REALM','REBEL','REFER','REIGN','RELAX','RELAY','REMIT','REPAY','REPLY','RERUN',
  'RIDER','RIDGE','RIFLE','RIGHT','RISKY','RIVAL','RIVER','RIVET','ROBIN','ROCKY',
  'ROMAN','ROUND','ROUTE','ROWDY','ROYAL','RUGBY','RULER',
  'SADLY','SAINT','SAUCE','SCALE','SCALP','SCAMP','SCENE','SCONE','SCOPE','SCORE',
  'SCOUT','SCREW','SCRUB','SEIZE','SENSE','SERVE','SHAFT','SHAKE','SHALL','SHAME',
  'SHAPE','SHARE','SHARK','SHARP','SHAVE','SHAWL','SHEEP','SHEEN','SHEER','SHEET',
  'SHELF','SHELL','SHIFT','SHIRT','SHOCK','SHORE','SHORT','SHOUT','SHOVE','SIGHT',
  'SILLY','SINCE','SIXTY','SKATE','SKILL','SKULL','SLANT','SLAVE','SLEEP','SLEET',
  'SLEPT','SLICE','SLIDE','SLOPE','SLOTH','SMALL','SMART','SMASH','SMELL','SMILE',
  'SMOKE','SNAIL','SNAKE','SNARE','SNEAK','SOLAR','SOLVE','SORRY','SOUTH','SPACE',
  'SPARE','SPARK','SPAWN','SPEAR','SPEED','SPEND','SPENT','SPICE','SPIKE','SPINE',
  'SPITE','SPLIT','SPOKE','SPOON','SPORT','SPRAY','SQUAT','SQUAD','STAIN','STAIR',
  'STAKE','STALE','STALK','STAMP','STAND','STANK','STARK','STATE','STAVE','STEAL',
  'STEAM','STEEL','STEEP','STEER','STERN','STICK','STIFF','STILL','STOCK','STOMP',
  'STONE','STOOD','STORM','STORY','STOUT','STOVE','STRAP','STRAW','STRAY','STRIP',
  'STRUM','STUCK','STUDY','STUFF','STUMP','STYLE','SUITE','SUNNY','SUPER','SURGE',
  'SWAMP','SWEAR','SWEAT','SWEEP','SWEET','SWEPT','SWIFT','SWIPE','SWIRL','SWORE',
  'SWORN','SWUNG',
  'TABLE','TABOO','TALON','TASTE','TAUNT','TEACH','TENSE','TENTH','THEIR','THERE',
  'THESE','THICK','THING','THINK','THIRD','THOSE','THREE','THREW','THROW','THUMP',
  'TIARA','TIGER','TIGHT','TIMER','TIRED','TITLE','TODAY','TOKEN','TOTAL','TOUCH',
  'TOUGH','TOWEL','TOWER','TOXIC','TRACE','TRACK','TRADE','TRAIL','TRAIN','TRAIT',
  'TRAMP','TRAWL','TREAD','TREND','TRIAL','TRIBE','TRICK','TRIED','TROOP','TRUCK',
  'TRULY','TRUMP','TRUNK','TRUSS','TRUST','TRUTH','TUMOR','TUNER','TUNIC','TWEAK',
  'TWIST','TYING',
  'ULCER','ULTRA','UNCLE','UNDER','UNDUE','UNIFY','UNION','UNTIL','UPPER','UPSET',
  'URBAN','USHER','USUAL','UTTER',
  'VAGUE','VALID','VALOR','VALUE','VALVE','VAPOR','VAULT','VICAR','VIGOR','VIRAL',
  'VIRUS','VISIT','VISTA','VITAL','VIVID','VOCAL','VODKA','VOICE','VOTER',
  'WAIST','WALTZ','WASTE','WATCH','WATER','WEAVE','WEDGE','WEIGH','WEIRD','WHALE',
  'WHEAT','WHEEL','WHERE','WHILE','WHINE','WHITE','WHOLE','WHOSE','WITTY','WOMAN',
  'WOMEN','WORLD','WORRY','WORSE','WORST','WORTH','WOULD','WOUND','WRATH','WRECK',
  'WRING','WRONG','WROTE',
  'YACHT','YEARN','YEAST','YIELD','YOUNG','YOUTH','YUMMY',
  'ZEBRA','ZILCH',
])

export function useDictionary(language) {
  const [loadedLanguage, setLoadedLanguage] = useState(null)
  const [dictionary, setDictionary] = useState(null)

  // Derived synchronously: true whenever `language` differs from what's actually
  // loaded. Avoids any window where a stale dictionary would pass validation.
  const loading = language !== loadedLanguage

  useEffect(() => {
    if (!language) return

    // Prevents a slow fetch for a previous language from overwriting a faster
    // fetch for the current one (e.g. en.json completing after fr.json).
    let cancelled = false

    async function loadDictionary() {
      try {
        const response = await fetch(`/dictionaries/${language}.json`)
        if (cancelled) return
        if (response.ok) {
          const words = await response.json()
          if (cancelled) return
          setDictionary(new Set(words.map(w => w.toUpperCase())))
        } else {
          console.warn(`Dictionary file for "${language}" not found, using test dictionary.`)
          setDictionary(TEST_DICTIONARY)
        }
      } catch {
        if (cancelled) return
        console.warn('Could not load dictionary file, using test dictionary.')
        setDictionary(TEST_DICTIONARY)
      }
      setLoadedLanguage(language)
    }

    loadDictionary()
    return () => { cancelled = true }
  }, [language])

  // Fonction de validation d'un mot
  function isValidWord(word) {
    if (!dictionary || loading) return false
    return dictionary.has(word.toUpperCase())
  }

  return { dictionary, loading, isValidWord }
}
