/* sky-strings.js: the words the sky module shows, in the site's nine languages.
 * Used by sky-controls.js (the control bar and planetarium mode); sky.js itself stays English and
 * language-free until localizeSky() hands its canvas the translated compass points and names.
 *
 *   import { localizeSky, skyStrings, skyLang } from './sky-strings.js';
 *   localizeSky(sky);                 // canvas labels follow the page language from now on
 *   skyStrings().now                  // "Now", "Jetzt", "現在" ...
 *
 * The language is the page's: the one /i18n/i18n.js last applied (it sets <html lang> and fires
 * "i18n:applied" on document), else a non-English <html lang>, ?lang=, localStorage "wemiller-lang",
 * navigator.languages, and English last. Anything missing from a language falls back to English.
 * Star names are only listed where a language has its own form; the rest keep their IAU names.
 */
export const LANGS = ['en', 'zh-Hans', 'ja', 'de', 'fr', 'es', 'ko', 'pt-BR', 'it'];

const W16 = (n, e, s, w) => [n, n + n + e, n + e, e + n + e, e, e + s + e, s + e, s + s + e, s, s + s + w, s + w, w + s + w, w, w + n + w, n + w, n + n + w];

const en = {
  label: 'Sky controls', now: 'Now', go: 'Go', when: 'Date and time', scrub: 'Time of day', speed: 'Speed',
  speeds: ['Paused', 'Real time', '1 minute a second', '10 minutes a second', '1 hour a second'],
  place: 'Place', lat: 'Latitude', lon: 'Longitude', looking: 'Looking', lookingUp: 'Looking up',
  sky: 'Sky', auto: 'Auto', night: 'Night', day: 'Day', trails: 'Star trails', lines: 'Constellations',
  geoBtn: 'Use my location',
  geoNote: 'Optional. Your browser will ask first. Your location is only used on this page to place the sky, and is never stored or sent anywhere.',
  geoWait: 'Waiting for your browser…', geoUsing: 'Using your location: {pos}.', geoType: 'You can type a latitude and longitude instead.',
  geoErr: { unsupported: 'This browser cannot share a location.', denied: 'Location permission was not given.', unavailable: 'Your location is not available right now.', timeout: 'Finding your location took too long.' },
  aimBtn: 'Aim with my phone', aimStop: 'Stop following',
  aimNote: 'Optional. Point your phone at the sky and the view follows. Its compass and tilt sensors are only read on this page.',
  aimOn: 'Following your phone. Press again to stop.',
  aimErr: { unsupported: 'This device is not reporting a compass direction the page can use.', denied: 'Motion and compass access was not given.' },
  paused: '(paused)', fast: '(fast)',
  look: { day: 'Day', golden: 'Golden hour', civil: 'Civil twilight', nautical: 'Nautical twilight', astronomical: 'Astronomical twilight', night: 'Night' },
  sun: 'Sun', set: '(set)',
  moon: ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'],
  planetarium: 'Planetarium mode', planetariumExit: 'Exit planetarium',
  compass: W16('N', 'E', 'S', 'W'), pos: ['{v}° N', '{v}° S', '{v}° E', '{v}° W'],
  planets: ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'],
  figures: { Ori: 'Orion', UMa: 'Big Dipper', UMi: 'Little Dipper', Cas: 'Cassiopeia', Cyg: 'Cygnus', Lyr: 'Lyra', Aql: 'Aquila', Sco: 'Scorpius', Sgr: 'Teapot', Cru: 'Southern Cross', Cen: 'Pointers', TrA: 'Southern Triangle', Tau: 'Taurus', Aur: 'Auriga', Gem: 'Gemini', CMa: 'Canis Major', CMi: 'Canis Minor', Leo: 'Leo', Boo: 'Boötes', Crv: 'Corvus', Peg: 'Great Square', And: 'Andromeda' },
  stars: {}
};

const de = {
  label: "Himmelssteuerung",
  now: "Jetzt",
  go: "Los",
  when: "Datum und Uhrzeit",
  scrub: "Tageszeit",
  speed: "Tempo",
  speeds: ["Angehalten","Echtzeit","1 Minute pro Sekunde","10 Minuten pro Sekunde","1 Stunde pro Sekunde"],
  place: "Ort",
  lat: "Breite",
  lon: "Länge",
  looking: "Blickrichtung",
  lookingUp: "Blickhöhe",
  sky: "Himmel",
  auto: "Auto",
  night: "Nacht",
  day: "Tag",
  trails: "Sternspuren",
  lines: "Sternbilder",
  geoBtn: "Meinen Standort verwenden",
  geoNote: "Optional. Dein Browser fragt vorher nach. Dein Standort wird nur auf dieser Seite verwendet, um den Himmel auszurichten, und nie gespeichert oder irgendwohin gesendet.",
  geoWait: "Warte auf deinen Browser…",
  geoUsing: "Dein Standort wird verwendet: {pos}.",
  geoType: "Du kannst stattdessen Breite und Länge eingeben.",
  geoErr: {"unsupported":"Dieser Browser kann keinen Standort teilen.","denied":"Die Standortfreigabe wurde nicht erteilt.","unavailable":"Dein Standort ist gerade nicht verfügbar.","timeout":"Die Standortsuche hat zu lange gedauert."},
  aimBtn: "Mit dem Handy zielen",
  aimStop: "Nicht mehr folgen",
  aimNote: "Optional. Richte dein Handy auf den Himmel, und die Ansicht folgt. Kompass und Neigungssensoren werden nur auf dieser Seite ausgelesen.",
  aimOn: "Folgt deinem Handy. Zum Beenden erneut tippen.",
  aimErr: {"unsupported":"Dieses Gerät liefert keine Kompassrichtung, die die Seite nutzen kann.","denied":"Zugriff auf Bewegung und Kompass wurde nicht erteilt."},
  paused: "(angehalten)",
  fast: "(Zeitraffer)",
  look: {"day":"Tag","golden":"Goldene Stunde","civil":"Bürgerliche Dämmerung","nautical":"Nautische Dämmerung","astronomical":"Astronomische Dämmerung","night":"Nacht"},
  sun: "Sonne",
  set: "(untergegangen)",
  moon: ["Neumond","Zunehmende Sichel","Erstes Viertel","Zunehmender Mond","Vollmond","Abnehmender Mond","Letztes Viertel","Abnehmende Sichel"],
  planetarium: "Planetariumsmodus",
  planetariumExit: "Planetarium beenden",
  compass: ["N","NNO","NO","ONO","O","OSO","SO","SSO","S","SSW","SW","WSW","W","WNW","NW","NNW"],
  pos: ["{v}° N","{v}° S","{v}° O","{v}° W"],
  planets: ["Merkur","Venus","Mars","Jupiter","Saturn","Uranus","Neptun"],
  figures: {"Ori":"Orion","UMa":"Großer Wagen","UMi":"Kleiner Wagen","Cas":"Kassiopeia","Cyg":"Schwan","Lyr":"Leier","Aql":"Adler","Sco":"Skorpion","Sgr":"Teekanne","Cru":"Kreuz des Südens","Cen":"Zeigersterne","TrA":"Südliches Dreieck","Tau":"Stier","Aur":"Fuhrmann","Gem":"Zwillinge","CMa":"Großer Hund","CMi":"Kleiner Hund","Leo":"Löwe","Boo":"Bärenhüter","Crv":"Rabe","Peg":"Pegasus-Quadrat","And":"Andromeda"},
  stars: {"Vega":"Wega","Procyon":"Prokyon","Betelgeuse":"Beteigeuze","Polaris":"Polarstern"}
};

const fr = {
  label: "Commandes du ciel",
  now: "Maintenant",
  go: "Aller",
  when: "Date et heure",
  scrub: "Heure",
  speed: "Vitesse",
  speeds: ["En pause","Temps réel","1 minute par seconde","10 minutes par seconde","1 heure par seconde"],
  place: "Lieu",
  lat: "Latitude",
  lon: "Longitude",
  looking: "Direction",
  lookingUp: "Hauteur",
  sky: "Ciel",
  auto: "Auto",
  night: "Nuit",
  day: "Jour",
  trails: "Filés d’étoiles",
  lines: "Constellations",
  geoBtn: "Utiliser ma position",
  geoNote: "Facultatif. Votre navigateur vous demandera d’abord l’autorisation. Votre position sert uniquement à placer le ciel sur cette page ; elle n’est jamais enregistrée ni envoyée.",
  geoWait: "En attente de votre navigateur…",
  geoUsing: "Position utilisée : {pos}.",
  geoType: "Vous pouvez aussi saisir une latitude et une longitude.",
  geoErr: {"unsupported":"Ce navigateur ne peut pas partager de position.","denied":"L’autorisation de localisation n’a pas été accordée.","unavailable":"Votre position n’est pas disponible pour le moment.","timeout":"La recherche de votre position a pris trop de temps."},
  aimBtn: "Viser avec mon téléphone",
  aimStop: "Arrêter le suivi",
  aimNote: "Facultatif. Pointez votre téléphone vers le ciel et la vue le suit. Sa boussole et ses capteurs d’inclinaison ne sont lus que sur cette page.",
  aimOn: "La vue suit votre téléphone. Appuyez à nouveau pour arrêter.",
  aimErr: {"unsupported":"Cet appareil ne fournit pas d’orientation de boussole utilisable par la page.","denied":"L’accès aux capteurs de mouvement et à la boussole n’a pas été accordé."},
  paused: "(en pause)",
  fast: "(accéléré)",
  look: {"day":"Jour","golden":"Heure dorée","civil":"Crépuscule civil","nautical":"Crépuscule nautique","astronomical":"Crépuscule astronomique","night":"Nuit"},
  sun: "Soleil",
  set: "(couchée)",
  moon: ["Nouvelle lune","Premier croissant","Premier quartier","Gibbeuse croissante","Pleine lune","Gibbeuse décroissante","Dernier quartier","Dernier croissant"],
  planetarium: "Mode planétarium",
  planetariumExit: "Quitter le planétarium",
  compass: ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"],
  pos: ["{v}° N","{v}° S","{v}° E","{v}° O"],
  planets: ["Mercure","Vénus","Mars","Jupiter","Saturne","Uranus","Neptune"],
  figures: {"Ori":"Orion","UMa":"Grande Casserole","UMi":"Petite Casserole","Cas":"Cassiopée","Cyg":"Cygne","Lyr":"Lyre","Aql":"Aigle","Sco":"Scorpion","Sgr":"Théière","Cru":"Croix du Sud","Cen":"Pointeurs","TrA":"Triangle austral","Tau":"Taureau","Aur":"Cocher","Gem":"Gémeaux","CMa":"Grand Chien","CMi":"Petit Chien","Leo":"Lion","Boo":"Bouvier","Crv":"Corbeau","Peg":"Carré de Pégase","And":"Andromède"},
  stars: {"Vega":"Véga","Betelgeuse":"Bételgeuse","Altair":"Altaïr","Aldebaran":"Aldébaran","Antares":"Antarès","Regulus":"Régulus","Polaris":"Étoile polaire"}
};

const es = {
  label: "Controles del cielo",
  now: "Ahora",
  go: "Ir",
  when: "Fecha y hora",
  scrub: "Hora del día",
  speed: "Velocidad",
  speeds: ["En pausa","Tiempo real","1 minuto por segundo","10 minutos por segundo","1 hora por segundo"],
  place: "Lugar",
  lat: "Latitud",
  lon: "Longitud",
  looking: "Dirección",
  lookingUp: "Altura",
  sky: "Cielo",
  auto: "Auto",
  night: "Noche",
  day: "Día",
  trails: "Estelas de estrellas",
  lines: "Constelaciones",
  geoBtn: "Usar mi ubicación",
  geoNote: "Opcional. Tu navegador te preguntará primero. Tu ubicación solo se usa en esta página para situar el cielo y nunca se guarda ni se envía a ningún sitio.",
  geoWait: "Esperando a tu navegador…",
  geoUsing: "Usando tu ubicación: {pos}.",
  geoType: "También puedes escribir una latitud y una longitud.",
  geoErr: {"unsupported":"Este navegador no puede compartir la ubicación.","denied":"No se concedió el permiso de ubicación.","unavailable":"Tu ubicación no está disponible en este momento.","timeout":"Encontrar tu ubicación tardó demasiado."},
  aimBtn: "Apuntar con mi móvil",
  aimStop: "Dejar de seguir",
  aimNote: "Opcional. Apunta tu móvil al cielo y la vista lo sigue. Su brújula y sus sensores de inclinación solo se leen en esta página.",
  aimOn: "Siguiendo tu móvil. Pulsa de nuevo para parar.",
  aimErr: {"unsupported":"Este dispositivo no proporciona una dirección de brújula que la página pueda usar.","denied":"No se concedió acceso al movimiento y la brújula."},
  paused: "(en pausa)",
  fast: "(acelerado)",
  look: {"day":"Día","golden":"Hora dorada","civil":"Crepúsculo civil","nautical":"Crepúsculo náutico","astronomical":"Crepúsculo astronómico","night":"Noche"},
  sun: "Sol",
  set: "(puesta)",
  moon: ["Luna nueva","Luna creciente","Cuarto creciente","Gibosa creciente","Luna llena","Gibosa menguante","Cuarto menguante","Luna menguante"],
  planetarium: "Modo planetario",
  planetariumExit: "Salir del planetario",
  compass: ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"],
  pos: ["{v}° N","{v}° S","{v}° E","{v}° O"],
  planets: ["Mercurio","Venus","Marte","Júpiter","Saturno","Urano","Neptuno"],
  figures: {"Ori":"Orión","UMa":"Carro Mayor","UMi":"Carro Menor","Cas":"Casiopea","Cyg":"Cisne","Lyr":"Lira","Aql":"Águila","Sco":"Escorpio","Sgr":"Tetera","Cru":"Cruz del Sur","Cen":"Punteros","TrA":"Triángulo Austral","Tau":"Tauro","Aur":"Auriga","Gem":"Géminis","CMa":"Can Mayor","CMi":"Can Menor","Leo":"Leo","Boo":"Boyero","Crv":"Cuervo","Peg":"Cuadrado de Pegaso","And":"Andrómeda"},
  stars: {"Sirius":"Sirio","Canopus":"Canopo","Arcturus":"Arturo","Procyon":"Proción","Aldebaran":"Aldebarán","Spica":"Espiga","Pollux":"Pólux","Regulus":"Régulo","Castor":"Cástor","Polaris":"Estrella Polar"}
};

const it = {
  label: "Controlli del cielo",
  now: "Adesso",
  go: "Vai",
  when: "Data e ora",
  scrub: "Ora del giorno",
  speed: "Velocità",
  speeds: ["In pausa","Tempo reale","1 minuto al secondo","10 minuti al secondo","1 ora al secondo"],
  place: "Luogo",
  lat: "Latitudine",
  lon: "Longitudine",
  looking: "Direzione",
  lookingUp: "Altezza",
  sky: "Cielo",
  auto: "Auto",
  night: "Notte",
  day: "Giorno",
  trails: "Scie stellari",
  lines: "Costellazioni",
  geoBtn: "Usa la mia posizione",
  geoNote: "Facoltativo. Il browser te lo chiederà prima. La tua posizione viene usata solo in questa pagina per orientare il cielo e non viene mai salvata né inviata altrove.",
  geoWait: "In attesa del browser…",
  geoUsing: "Uso la tua posizione: {pos}.",
  geoType: "Puoi anche inserire latitudine e longitudine a mano.",
  geoErr: {"unsupported":"Questo browser non può condividere la posizione.","denied":"Il permesso di accesso alla posizione non è stato concesso.","unavailable":"La tua posizione non è disponibile al momento.","timeout":"La ricerca della posizione ha richiesto troppo tempo."},
  aimBtn: "Punta con il telefono",
  aimStop: "Smetti di seguire",
  aimNote: "Facoltativo. Punta il telefono verso il cielo e la vista lo segue. La bussola e i sensori di inclinazione vengono letti solo in questa pagina.",
  aimOn: "La vista segue il telefono. Premi di nuovo per fermarla.",
  aimErr: {"unsupported":"Questo dispositivo non fornisce una direzione della bussola utilizzabile dalla pagina.","denied":"L’accesso a movimento e bussola non è stato concesso."},
  paused: "(in pausa)",
  fast: "(accelerato)",
  look: {"day":"Giorno","golden":"Ora d’oro","civil":"Crepuscolo civile","nautical":"Crepuscolo nautico","astronomical":"Crepuscolo astronomico","night":"Notte"},
  sun: "Sole",
  set: "(tramontata)",
  moon: ["Luna nuova","Luna crescente","Primo quarto","Gibbosa crescente","Luna piena","Gibbosa calante","Ultimo quarto","Luna calante"],
  planetarium: "Modalità planetario",
  planetariumExit: "Esci dal planetario",
  compass: ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"],
  pos: ["{v}° N","{v}° S","{v}° E","{v}° O"],
  planets: ["Mercurio","Venere","Marte","Giove","Saturno","Urano","Nettuno"],
  figures: {"Ori":"Orione","UMa":"Grande Carro","UMi":"Piccolo Carro","Cas":"Cassiopea","Cyg":"Cigno","Lyr":"Lira","Aql":"Aquila","Sco":"Scorpione","Sgr":"Teiera","Cru":"Croce del Sud","Cen":"Puntatori","TrA":"Triangolo Australe","Tau":"Toro","Aur":"Auriga","Gem":"Gemelli","CMa":"Cane Maggiore","CMi":"Cane Minore","Leo":"Leone","Boo":"Boote","Crv":"Corvo","Peg":"Quadrato di Pegaso","And":"Andromeda"},
  stars: {"Sirius":"Sirio","Canopus":"Canopo","Arcturus":"Arturo","Procyon":"Procione","Pollux":"Polluce","Regulus":"Regolo","Castor":"Castore","Polaris":"Stella Polare"}
};

const ptBR = {
  label: "Controles do céu",
  now: "Agora",
  go: "Ir",
  when: "Data e hora",
  scrub: "Hora do dia",
  speed: "Velocidade",
  speeds: ["Pausado","Tempo real","1 minuto por segundo","10 minutos por segundo","1 hora por segundo"],
  place: "Local",
  lat: "Latitude",
  lon: "Longitude",
  looking: "Direção",
  lookingUp: "Altura",
  sky: "Céu",
  auto: "Auto",
  night: "Noite",
  day: "Dia",
  trails: "Rastros de estrelas",
  lines: "Constelações",
  geoBtn: "Usar minha localização",
  geoNote: "Opcional. Seu navegador vai pedir permissão antes. Sua localização só é usada nesta página para posicionar o céu e nunca é armazenada nem enviada a lugar nenhum.",
  geoWait: "Aguardando seu navegador…",
  geoUsing: "Usando sua localização: {pos}.",
  geoType: "Você também pode digitar uma latitude e uma longitude.",
  geoErr: {"unsupported":"Este navegador não consegue compartilhar a localização.","denied":"A permissão de localização não foi concedida.","unavailable":"Sua localização não está disponível no momento.","timeout":"Encontrar sua localização demorou demais."},
  aimBtn: "Apontar com o celular",
  aimStop: "Parar de seguir",
  aimNote: "Opcional. Aponte o celular para o céu e a visualização acompanha. A bússola e os sensores de inclinação só são lidos nesta página.",
  aimOn: "Seguindo seu celular. Toque de novo para parar.",
  aimErr: {"unsupported":"Este dispositivo não informa uma direção de bússola que a página possa usar.","denied":"O acesso ao movimento e à bússola não foi concedido."},
  paused: "(pausado)",
  fast: "(acelerado)",
  look: {"day":"Dia","golden":"Hora dourada","civil":"Crepúsculo civil","nautical":"Crepúsculo náutico","astronomical":"Crepúsculo astronômico","night":"Noite"},
  sun: "Sol",
  set: "(abaixo do horizonte)",
  moon: ["Lua nova","Lua crescente","Quarto crescente","Crescente gibosa","Lua cheia","Minguante gibosa","Quarto minguante","Lua minguante"],
  planetarium: "Modo planetário",
  planetariumExit: "Sair do planetário",
  compass: ["N","NNE","NE","ENE","L","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"],
  pos: ["{v}° N","{v}° S","{v}° L","{v}° O"],
  planets: ["Mercúrio","Vênus","Marte","Júpiter","Saturno","Urano","Netuno"],
  figures: {"Ori":"Órion","UMa":"Grande Carro","UMi":"Pequeno Carro","Cas":"Cassiopeia","Cyg":"Cisne","Lyr":"Lira","Aql":"Águia","Sco":"Escorpião","Sgr":"Bule","Cru":"Cruzeiro do Sul","Cen":"Guardiões","TrA":"Triângulo Austral","Tau":"Touro","Aur":"Cocheiro","Gem":"Gêmeos","CMa":"Cão Maior","CMi":"Cão Menor","Leo":"Leão","Boo":"Boieiro","Crv":"Corvo","Peg":"Quadrado de Pégaso","And":"Andrômeda"},
  stars: {"Sirius":"Sírius","Capella":"Capela","Procyon":"Prócion","Aldebaran":"Aldebarã","Spica":"Espiga","Pollux":"Pólux","Regulus":"Régulo","Polaris":"Estrela Polar"}
};

const ja = {
  label: "星空の操作",
  now: "現在",
  go: "移動",
  when: "日時",
  scrub: "時刻",
  speed: "速度",
  speeds: ["停止","実時間","1秒で1分","1秒で10分","1秒で1時間"],
  place: "場所",
  lat: "緯度",
  lon: "経度",
  looking: "方位",
  lookingUp: "高度",
  sky: "空",
  auto: "自動",
  night: "夜",
  day: "昼",
  trails: "星の軌跡",
  lines: "星座線",
  geoBtn: "現在地を使う",
  geoNote: "任意です。最初にブラウザが確認します。位置情報はこのページで星空を合わせるためだけに使われ、保存や送信は一切されません。",
  geoWait: "ブラウザの応答を待っています…",
  geoUsing: "現在地を使用しています：{pos}。",
  geoType: "緯度と経度を直接入力することもできます。",
  geoErr: {"unsupported":"このブラウザは位置情報を共有できません。","denied":"位置情報の使用が許可されませんでした。","unavailable":"現在、位置情報を取得できません。","timeout":"現在地の取得に時間がかかりすぎました。"},
  aimBtn: "スマホを空に向ける",
  aimStop: "追従を停止",
  aimNote: "任意です。スマートフォンを空に向けると表示が追従します。コンパスと傾きセンサーの値はこのページ内でのみ読み取られます。",
  aimOn: "スマートフォンに追従しています。もう一度押すと停止します。",
  aimErr: {"unsupported":"このデバイスは、ページで使えるコンパスの方位を提供していません。","denied":"モーションとコンパスへのアクセスが許可されませんでした。"},
  paused: "（停止中）",
  fast: "（早送り）",
  look: {"day":"昼","golden":"ゴールデンアワー","civil":"常用薄明","nautical":"航海薄明","astronomical":"天文薄明","night":"夜"},
  sun: "太陽",
  set: "（沈んでいます）",
  moon: ["新月","三日月","上弦の月","十三夜月","満月","寝待月","下弦の月","有明月"],
  planetarium: "プラネタリウムモード",
  planetariumExit: "プラネタリウムを終了",
  compass: ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"],
  pos: ["北緯{v}°","南緯{v}°","東経{v}°","西経{v}°"],
  planets: ["水星","金星","火星","木星","土星","天王星","海王星"],
  figures: {"Ori":"オリオン座","UMa":"北斗七星","UMi":"小北斗七星","Cas":"カシオペヤ座","Cyg":"はくちょう座","Lyr":"こと座","Aql":"わし座","Sco":"さそり座","Sgr":"ティーポット","Cru":"南十字星","Cen":"ポインター","TrA":"みなみのさんかく座","Tau":"おうし座","Aur":"ぎょしゃ座","Gem":"ふたご座","CMa":"おおいぬ座","CMi":"こいぬ座","Leo":"しし座","Boo":"うしかい座","Crv":"からす座","Peg":"ペガススの大四辺形","And":"アンドロメダ座"},
  stars: {"Sirius":"シリウス","Canopus":"カノープス","Arcturus":"アークトゥルス","Rigil Kentaurus":"リギル・ケンタウルス","Vega":"ベガ","Capella":"カペラ","Rigel":"リゲル","Procyon":"プロキオン","Achernar":"アケルナル","Betelgeuse":"ベテルギウス","Hadar":"ハダル","Altair":"アルタイル","Aldebaran":"アルデバラン","Antares":"アンタレス","Spica":"スピカ","Pollux":"ポルックス","Fomalhaut":"フォーマルハウト","Mimosa":"ミモザ","Deneb":"デネブ","Acrux":"アクルックス","Regulus":"レグルス","Adhara":"アダーラ","Gacrux":"ガクルックス","Shaula":"シャウラ","Bellatrix":"ベラトリックス","Elnath":"エルナト","Castor":"カストル","Polaris":"北極星"}
};

const zhHans = {
  label: "星空控制",
  now: "现在",
  go: "前往",
  when: "日期和时间",
  scrub: "时刻",
  speed: "速度",
  speeds: ["暂停","实时","每秒 1 分钟","每秒 10 分钟","每秒 1 小时"],
  place: "地点",
  lat: "纬度",
  lon: "经度",
  looking: "朝向",
  lookingUp: "仰角",
  sky: "天空",
  auto: "自动",
  night: "夜晚",
  day: "白天",
  trails: "星轨",
  lines: "星座连线",
  geoBtn: "使用我的位置",
  geoNote: "可选。浏览器会先征求你的同意。你的位置仅在本页面用于定位星空，不会被保存或发送到任何地方。",
  geoWait: "正在等待浏览器…",
  geoUsing: "正在使用你的位置：{pos}。",
  geoType: "你也可以直接输入纬度和经度。",
  geoErr: {"unsupported":"此浏览器无法共享位置。","denied":"未获得位置权限。","unavailable":"暂时无法获取你的位置。","timeout":"获取位置超时。"},
  aimBtn: "用手机瞄准",
  aimStop: "停止跟随",
  aimNote: "可选。将手机对准天空，画面会随之移动。指南针和倾斜传感器的数据只在本页面读取。",
  aimOn: "正在跟随你的手机。再按一次即可停止。",
  aimErr: {"unsupported":"此设备没有提供页面可用的指南针方向。","denied":"未获得运动和指南针的访问权限。"},
  paused: "（已暂停）",
  fast: "（快进）",
  look: {"day":"白天","golden":"黄金时刻","civil":"民用晨昏蒙影","nautical":"航海晨昏蒙影","astronomical":"天文晨昏蒙影","night":"夜晚"},
  sun: "太阳",
  set: "（已落下）",
  moon: ["新月","蛾眉月","上弦月","盈凸月","满月","亏凸月","下弦月","残月"],
  planetarium: "天象仪模式",
  planetariumExit: "退出天象仪",
  compass: ["北","北东北","东北","东东北","东","东东南","东南","南东南","南","南西南","西南","西西南","西","西西北","西北","北西北"],
  pos: ["北纬{v}°","南纬{v}°","东经{v}°","西经{v}°"],
  planets: ["水星","金星","火星","木星","土星","天王星","海王星"],
  figures: {"Ori":"猎户座","UMa":"北斗七星","UMi":"小北斗","Cas":"仙后座","Cyg":"天鹅座","Lyr":"天琴座","Aql":"天鹰座","Sco":"天蝎座","Sgr":"茶壶","Cru":"南十字","Cen":"南门二与马腹一","TrA":"南三角座","Tau":"金牛座","Aur":"御夫座","Gem":"双子座","CMa":"大犬座","CMi":"小犬座","Leo":"狮子座","Boo":"牧夫座","Crv":"乌鸦座","Peg":"飞马大四边形","And":"仙女座"},
  stars: {"Sirius":"天狼星","Canopus":"老人星","Arcturus":"大角星","Rigil Kentaurus":"南门二","Vega":"织女星","Capella":"五车二","Rigel":"参宿七","Procyon":"南河三","Achernar":"水委一","Betelgeuse":"参宿四","Hadar":"马腹一","Altair":"牛郎星","Aldebaran":"毕宿五","Antares":"心宿二","Spica":"角宿一","Pollux":"北河三","Fomalhaut":"北落师门","Mimosa":"十字架三","Deneb":"天津四","Acrux":"十字架二","Regulus":"轩辕十四","Adhara":"弧矢七","Gacrux":"十字架一","Shaula":"尾宿八","Bellatrix":"参宿五","Elnath":"五车五","Castor":"北河二","Polaris":"北极星"}
};

const ko = {
  label: "하늘 제어",
  now: "지금",
  go: "이동",
  when: "날짜와 시간",
  scrub: "시각",
  speed: "속도",
  speeds: ["일시 정지","실시간","1초에 1분","1초에 10분","1초에 1시간"],
  place: "위치",
  lat: "위도",
  lon: "경도",
  looking: "방위",
  lookingUp: "고도",
  sky: "하늘",
  auto: "자동",
  night: "밤",
  day: "낮",
  trails: "별 궤적",
  lines: "별자리",
  geoBtn: "내 위치 사용",
  geoNote: "선택 사항입니다. 브라우저가 먼저 허용 여부를 묻습니다. 위치 정보는 이 페이지에서 하늘을 맞추는 데만 사용되며, 저장되거나 어디로도 전송되지 않습니다.",
  geoWait: "브라우저 응답을 기다리는 중…",
  geoUsing: "현재 위치를 사용 중입니다: {pos}.",
  geoType: "위도와 경도를 직접 입력하실 수도 있습니다.",
  geoErr: {"unsupported":"이 브라우저는 위치를 공유할 수 없습니다.","denied":"위치 권한이 허용되지 않았습니다.","unavailable":"지금은 위치를 확인할 수 없습니다.","timeout":"위치를 찾는 데 시간이 너무 오래 걸렸습니다."},
  aimBtn: "휴대폰으로 조준",
  aimStop: "따라가기 중지",
  aimNote: "선택 사항입니다. 휴대폰을 하늘로 향하면 화면이 따라 움직입니다. 나침반과 기울기 센서 값은 이 페이지에서만 읽습니다.",
  aimOn: "휴대폰 방향을 따라가는 중입니다. 다시 누르면 중지합니다.",
  aimErr: {"unsupported":"이 기기는 페이지에서 사용할 수 있는 나침반 방향을 제공하지 않습니다.","denied":"동작 및 나침반 접근이 허용되지 않았습니다."},
  paused: "(일시 정지)",
  fast: "(빠르게)",
  look: {"day":"낮","golden":"골든아워","civil":"시민박명","nautical":"항해박명","astronomical":"천문박명","night":"밤"},
  sun: "태양",
  set: "(지평선 아래)",
  moon: ["삭","초승달","상현달","차가는 볼록달","보름달","기우는 볼록달","하현달","그믐달"],
  planetarium: "플라네타리움 모드",
  planetariumExit: "플라네타리움 종료",
  compass: ["북","북북동","북동","동북동","동","동남동","남동","남남동","남","남남서","남서","서남서","서","서북서","북서","북북서"],
  pos: ["북위 {v}°","남위 {v}°","동경 {v}°","서경 {v}°"],
  planets: ["수성","금성","화성","목성","토성","천왕성","해왕성"],
  figures: {"Ori":"오리온자리","UMa":"북두칠성","UMi":"작은 북두칠성","Cas":"카시오페이아자리","Cyg":"백조자리","Lyr":"거문고자리","Aql":"독수리자리","Sco":"전갈자리","Sgr":"찻주전자","Cru":"남십자성","Cen":"지시별","TrA":"남쪽삼각형자리","Tau":"황소자리","Aur":"마차부자리","Gem":"쌍둥이자리","CMa":"큰개자리","CMi":"작은개자리","Leo":"사자자리","Boo":"목동자리","Crv":"까마귀자리","Peg":"페가수스 사각형","And":"안드로메다자리"},
  stars: {"Sirius":"시리우스","Canopus":"카노푸스","Arcturus":"아크투루스","Rigil Kentaurus":"리길 켄타우루스","Vega":"베가","Capella":"카펠라","Rigel":"리겔","Procyon":"프로키온","Achernar":"아케르나르","Betelgeuse":"베텔게우스","Hadar":"하다르","Altair":"알타이르","Aldebaran":"알데바란","Antares":"안타레스","Spica":"스피카","Pollux":"폴룩스","Fomalhaut":"포말하우트","Mimosa":"미모사","Deneb":"데네브","Acrux":"아크룩스","Regulus":"레굴루스","Adhara":"아다라","Gacrux":"가크룩스","Shaula":"샤울라","Bellatrix":"벨라트릭스","Elnath":"엘나트","Castor":"카스토르","Polaris":"북극성"}
};

/** Every language's words. English is complete; the others fall back to it key by key. */
export const STRINGS = { en, 'zh-Hans': zhHans, ja, de, fr, es, ko, 'pt-BR': ptBR, it };

/** 'JA', 'pt', 'zh-CN' -> one of LANGS, or null. Same rules as /i18n/i18n.js. */
export function normalizeLang(code) {
  if (!code) return null;
  const lower = String(code).toLowerCase();
  for (const l of LANGS) if (l.toLowerCase() === lower) return l;
  const primary = lower.split('-')[0];
  if (primary === 'zh') return 'zh-Hans';
  if (primary === 'pt') return 'pt-BR';
  for (const l of LANGS) if (l.toLowerCase().split('-')[0] === primary) return l;
  return null;
}

const hasDOM = typeof document !== 'undefined';
let applied = null;                 // what i18n.js last applied, once it has told us
const subs = new Set();
if (hasDOM) document.addEventListener('i18n:applied', (e) => {
  const next = normalizeLang((e.detail && e.detail.lang) || document.documentElement.lang);
  if (!next) return;
  applied = next;
  for (const fn of Array.from(subs)) { try { fn(next); } catch (err) { /* one listener must not stop the rest */ } }
});

/** The language the sky should speak right now (one of LANGS). */
export function skyLang() {
  if (applied) return applied;
  if (!hasDOM) return 'en';
  const html = normalizeLang(document.documentElement.lang);
  if (html && html !== 'en') return html;       // baked-in pages say "en" until i18n.js runs, so "en" proves nothing
  let v = null;
  try { v = normalizeLang(new URLSearchParams(location.search).get('lang')); } catch (e) { /* no URL */ }
  if (v) return v;
  try { v = normalizeLang(localStorage.getItem('wemiller-lang')); } catch (e) { /* storage blocked */ }
  if (v) return v;
  const nav = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
  for (const n of nav) { v = normalizeLang(n); if (v) return v; }
  return 'en';
}

const cache = {};
/** The words for a language (default: the page's), with English filling any gap. */
export function skyStrings(lang) {
  const l = normalizeLang(lang) || skyLang();
  if (cache[l]) return cache[l];
  const own = STRINGS[l] || en, out = { lang: l };
  for (const k in en) {
    const a = en[k], b = own[k];
    out[k] = b === undefined ? a : (a && typeof a === 'object' && !Array.isArray(a)) ? Object.assign({}, a, b) : b;
  }
  return (cache[l] = out);
}

/** Run fn(lang) whenever the page language changes. Returns a function that stops it. */
export function onSkyLang(fn) { subs.add(fn); return () => subs.delete(fn); }

/** "35.7° N", "北緯35.7°": a latitude or longitude in words, for the status messages. */
export function skyPosition(lat, lon, lang) {
  const s = skyStrings(lang);
  const n = (v) => { try { return Math.abs(v).toLocaleString(s.lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); } catch (e) { return Math.abs(v).toFixed(1); } };
  return s.pos[lat >= 0 ? 0 : 1].replace('{v}', n(lat)) + ', ' + s.pos[lon >= 0 ? 2 : 3].replace('{v}', n(lon));
}

const done = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
/**
 * Make the canvas speak the page language: compass points on the horizon, planet, star and
 * constellation names. Keeps following language changes. Safe to call more than once.
 * @param {{view: object}} sky  what createSky() returned
 * @returns {Function} stop following (the labels go back to English)
 */
export function localizeSky(sky) {
  const view = sky && sky.view;
  if (!view || typeof view.setStrings !== 'function') return () => {};
  if (done && done.has(view)) return done.get(view);
  const apply = () => {
    const s = skyStrings();
    view.setStrings(s.lang === 'en' ? null : { compass: s.compass.filter((_, i) => i % 2 === 0), planets: s.planets, stars: s.stars, figures: s.figures });
  };
  apply();
  const off = onSkyLang(apply), stop = () => { off(); if (done) done.delete(view); view.setStrings(null); };
  if (done) done.set(view, stop);
  return stop;
}

if (typeof window !== 'undefined') window.SkyStrings = { LANGS, STRINGS, skyLang, skyStrings, onSkyLang, skyPosition, localizeSky, normalizeLang };
