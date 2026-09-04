import { VEHICLE_CATALOG } from './vehicleCatalog';

/**
 * Model names by make — names only, no body type claimed.
 *
 * <p>This is the second half of the split that `vehicleMakes.js` started, and
 * for the same reason. `VEHICLE_CATALOG` maps make → model → body type, and
 * every row in it is an assertion the parts map depends on: "a Vios is a
 * sedan". Those have to be right, which is why that table only covers what
 * people actually drive here.
 *
 * <p>A model name is not an assertion about anything. Listing "G-Class" under
 * Mercedes-Benz says only that the car exists, so this list can be as wide as
 * the road without putting a wrong body type behind anybody's parts diagram.
 * A model picked from here that the catalogue does not know simply leaves the
 * body type to be answered, which is the same path an unlisted model has
 * always taken.
 *
 * <p>Scope, stated plainly: the makes people here plausibly own, with the
 * models those makes actually sell, including the motorcycle brands. It is not
 * every model ever built worldwide — that is not something anyone can produce
 * accurately, and a picker full of half-remembered names is worse than a text
 * box, because a wrong name picked from a list looks verified. Anything absent
 * is still typed and saved exactly as written.
 *
 * <p>Where a make already appears in `VEHICLE_CATALOG`, its catalogue models
 * come first and keep their commonality order; anything added here follows.
 */
export const VEHICLE_MODELS = {
  'Alfa Romeo': ['Giulia', 'Stelvio', 'Tonale', 'Giulietta', '4C'],
  'Aston Martin': ['DB11', 'DB12', 'Vantage', 'DBX', 'DBS'],
  Audi: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8', 'e-tron', 'Q4 e-tron', 'TT', 'R8', 'RS3', 'RS5', 'S3', 'S5'],
  Aprilia: ['RS 660', 'RSV4', 'Tuono 660', 'SR 160', 'SXR 160', 'Tuareg 660'],
  BAIC: ['BJ40', 'X55', 'X7', 'U5 Plus', 'M50S'],
  Bajaj: ['Pulsar NS160', 'Pulsar NS200', 'Pulsar RS200', 'Dominar 400', 'CT125', 'Boxer'],
  Benelli: ['TNT 135', 'TNT 300', 'Leoncino 250', 'Leoncino 500', 'TRK 502', '502C', 'Imperiale 400'],
  Bentley: ['Continental GT', 'Flying Spur', 'Bentayga'],
  BMW: ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '7 Series', 'X1', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'i4', 'iX', 'i7', 'M2', 'M3', 'M4', 'M5', 'R 1250 GS', 'S 1000 RR', 'G 310 R', 'F 900 R'],
  Buick: ['Encore', 'Enclave', 'Envision', 'Regal'],
  Cadillac: ['Escalade', 'CT4', 'CT5', 'XT4', 'XT5', 'XT6', 'Lyriq'],
  'Can-Am': ['Ryker', 'Spyder F3', 'Spyder RT', 'Outlander', 'Maverick'],
  CFMoto: ['150NK', '250NK', '300NK', '400NK', '650NK', '650MT', '700CL-X', '800MT', 'Papio'],
  Changan: ['Alsvin', 'CS35 Plus', 'CS55 Plus', 'CS75 Plus', 'Hunter', 'Eado'],
  Chrysler: ['300', 'Pacifica', 'Voyager'],
  Citroën: ['C3', 'C3 Aircross', 'C4', 'C5 Aircross', 'Berlingo', 'C5 X'],
  Cupra: ['Formentor', 'Leon', 'Born', 'Ateca'],
  Dacia: ['Sandero', 'Duster', 'Logan', 'Jogger', 'Spring'],
  Daewoo: ['Matiz', 'Nubira', 'Lanos', 'Espero', 'Leganza'],
  Daihatsu: ['Terios', 'Sirion', 'Ayla', 'Xenia', 'Gran Max', 'Rocky'],
  Datsun: ['Go', 'Go+', 'Redi-Go', 'Sunny', '240Z'],
  DFSK: ['Glory 580', 'Glory 500', 'Super Cab', 'Gelora'],
  Dodge: ['Charger', 'Challenger', 'Durango', 'Journey', 'Hornet'],
  Dongfeng: ['Rich 6', 'Glory 580', 'Forthing T5', 'Nammi'],
  Ducati: ['Monster', 'Panigale V2', 'Panigale V4', 'Scrambler Icon', 'Multistrada V4', 'Diavel', 'Hypermotard', 'DesertX', 'Streetfighter V4'],
  Ferrari: ['296 GTB', 'F8 Tributo', 'Roma', 'SF90 Stradale', 'Purosangue', '812 Superfast', 'Portofino'],
  Fiat: ['500', '500X', 'Panda', 'Tipo', 'Ducato', 'Doblo'],
  Fuso: ['Canter', 'Fighter', 'Rosa', 'Super Great'],
  GAC: ['GS3', 'GS4', 'GS8', 'GN6', 'GN8', 'Emkoo', 'Empow'],
  Genesis: ['G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80'],
  GMC: ['Sierra', 'Yukon', 'Terrain', 'Acadia', 'Canyon', 'Hummer EV'],
  'Great Wall': ['Wingle 5', 'Wingle 7', 'Poer', 'Cannon'],
  'Harley-Davidson': ['Sportster S', 'Iron 883', 'Nightster', 'Street Bob', 'Fat Boy', 'Heritage Classic', 'Road King', 'Street Glide', 'Road Glide', 'Pan America'],
  Haval: ['H6', 'Jolion', 'H9', 'Dargo'],
  Hero: ['Hunk 160R', 'Xpulse 200', 'Glamour', 'Splendor', 'Dash'],
  Hino: ['300 Series', '500 Series', '700 Series', 'Dutro'],
  Hummer: ['H1', 'H2', 'H3'],
  Husqvarna: ['Svartpilen 401', 'Vitpilen 401', 'Norden 901', 'FE 350', 'TE 300'],
  Infiniti: ['Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'],
  Jaguar: ['XE', 'XF', 'F-Pace', 'E-Pace', 'I-Pace', 'F-Type'],
  JAC: ['S4', 'S7', 'T6', 'T8', 'JS4', 'Sunray'],
  Jeep: ['Wrangler', 'Gladiator', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Avenger'],
  Jetour: ['Dashing', 'X70', 'X70 Plus', 'X90 Plus', 'T2'],
  Kawasaki: ['Barako II', 'CT125', 'Rouser NS160', 'Rouser NS200', 'Ninja 400', 'Ninja ZX-4R', 'Ninja ZX-6R', 'Ninja ZX-10R', 'Z400', 'Z650', 'Z900', 'Versys 650', 'W175', 'KLX150', 'Dominar 400'],
  KTM: ['Duke 200', 'Duke 250', 'Duke 390', 'RC 200', 'RC 390', 'Adventure 250', 'Adventure 390', '790 Duke', '890 Adventure', 'EXC 300'],
  Kymco: ['Like 150', 'Downtown 250', 'AK 550', 'X-Town 250', 'Agility 125', 'Racing S 150'],
  Lada: ['Niva', 'Granta', 'Vesta', 'Largus'],
  Lamborghini: ['Huracan', 'Revuelto', 'Urus', 'Aventador'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Range Rover Velar'],
  Lexus: ['IS', 'ES', 'LS', 'UX', 'NX', 'RX', 'GX', 'LX', 'LM', 'RC', 'LC', 'RZ'],
  Lincoln: ['Navigator', 'Aviator', 'Nautilus', 'Corsair'],
  Lotus: ['Emira', 'Eletre', 'Evora', 'Elise', 'Exige'],
  Mahindra: ['Scorpio', 'Scorpio-N', 'Thar', 'XUV700', 'XUV300', 'Bolero', 'Pik Up'],
  Maserati: ['Ghibli', 'Levante', 'Grecale', 'MC20', 'Quattroporte'],
  Maxus: ['T60', 'T90', 'G10', 'D60', 'V80', 'Mifa 9'],
  McLaren: ['720S', '750S', 'Artura', 'GT', '765LT'],
  'Mercedes-Benz': ['A-Class', 'B-Class', 'C-Class', 'E-Class', 'S-Class', 'CLA', 'CLS', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'G-Class', 'V-Class', 'Vito', 'Sprinter', 'SL', 'AMG GT', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'Maybach S-Class', 'Maybach GLS'],
  MINI: ['Cooper', 'Cooper S', 'Countryman', 'Clubman', 'Convertible', 'John Cooper Works'],
  Mitsuoka: ['Buddy', 'Viewt', 'Rock Star'],
  'Moto Guzzi': ['V7', 'V9', 'V85 TT', 'Griso'],
  Motorstar: ['MSX 125', 'Cafe 400', 'Xplorer 200', 'Star-X 150', 'Bumblebee'],
  'MV Agusta': ['Brutale 800', 'F3 800', 'Dragster', 'Turismo Veloce'],
  Neta: ['V', 'U', 'S', 'GT'],
  NIO: ['ES6', 'ES8', 'ET5', 'ET7', 'EC6'],
  Omoda: ['C5', 'E5', 'C7'],
  Opel: ['Corsa', 'Astra', 'Mokka', 'Crossland', 'Grandland'],
  Perodua: ['Myvi', 'Axia', 'Bezza', 'Aruz', 'Ativa', 'Alza'],
  Peugeot: ['208', '2008', '308', '3008', '5008', 'Partner', 'Traveller', 'Landtrek'],
  Piaggio: ['Liberty 150', 'Medley 150', 'Beverly 300', 'MP3'],
  Polestar: ['2', '3', '4'],
  Pontiac: ['Firebird', 'GTO', 'Trans Am', 'Solstice'],
  Porsche: ['911', '718 Cayman', '718 Boxster', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
  Proton: ['Saga', 'Persona', 'X50', 'X70', 'Exora', 'Iriz'],
  RAM: ['1500', '2500', '3500', 'ProMaster'],
  Renault: ['Kwid', 'Duster', 'Captur', 'Koleos', 'Clio', 'Megane', 'Triber', 'Kiger'],
  'Rolls-Royce': ['Ghost', 'Phantom', 'Cullinan', 'Spectre', 'Wraith'],
  Rover: ['75', '45', '25', 'Mini'],
  'Royal Enfield': ['Classic 350', 'Hunter 350', 'Meteor 350', 'Bullet 350', 'Himalayan', 'Interceptor 650', 'Continental GT 650', 'Scram 411'],
  Rusi: ['Classic 150', 'Sniper 150', 'Vintage 200', 'Aveyron 250', 'RM 150', 'TX 125'],
  Saab: ['9-3', '9-5', '900'],
  SEAT: ['Ibiza', 'Leon', 'Ateca', 'Arona', 'Tarraco'],
  Sherco: ['SE 300', 'SEF 450', 'ST 125'],
  'Škoda': ['Fabia', 'Octavia', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq', 'Enyaq'],
  SkyGo: ['Explorer 150', 'Nova 125', 'Sniper 135', 'Skymax 110'],
  SsangYong: ['Tivoli', 'Korando', 'Rexton', 'Musso', 'Actyon'],
  SYM: ['Jet 14', 'Symphony ST', 'Cruisym 150', 'Husky 125', 'Sport Rider 125'],
  Tata: ['Nexon', 'Punch', 'Harrier', 'Safari', 'Tiago', 'Altroz', 'Ace'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
  Triumph: ['Bonneville T120', 'Speed Twin', 'Street Triple', 'Speed Triple', 'Tiger 900', 'Trident 660', 'Scrambler 900', 'Rocket 3'],
  TVS: ['Apache RTR 160', 'Apache RTR 200', 'Raider 125', 'Ntorq 125', 'Jupiter', 'Sport'],
  Vespa: ['Primavera', 'Sprint', 'GTS', 'LX 150', 'S 125'],
  VinFast: ['VF 3', 'VF 5', 'VF 6', 'VF 7', 'VF 8', 'VF 9'],
  Volkswagen: ['Polo', 'Golf', 'Jetta', 'Passat', 'Tiguan', 'Touareg', 'T-Cross', 'Santana', 'Lavida', 'Lamando', 'Caddy', 'Transporter', 'ID.4'],
  Volvo: ['S60', 'S90', 'V60', 'XC40', 'XC60', 'XC90', 'EX30', 'EX90', 'C40'],
  Wuling: ['Almaz', 'Confero', 'Cortez', 'Air EV', 'Bingo'],
  Xpeng: ['G6', 'G9', 'P7', 'X9'],
  Yamaha: ['Mio i 125', 'Mio Sporty', 'Mio Gear', 'Mio Aerox', 'Aerox 155', 'NMAX 155', 'XMAX 300', 'Sniper 155', 'MT-03', 'MT-07', 'MT-09', 'YZF-R3', 'YZF-R15', 'YZF-R7', 'Tenere 700', 'Vega Force', 'Sight'],
  Zeekr: ['001', '007', 'X', '009'],
  Abarth: ['595', '695', '500e', '124 Spider'],
  AC: ['Cobra', 'Ace', 'Aceca'],
  Acura: ['ILX', 'TLX', 'RDX', 'MDX', 'RSX', 'NSX', 'Integra', 'ZDX'],
  Aion: ['S', 'S Plus', 'Y Plus', 'V', 'LX', 'Hyptec HT'],
  Aiways: ['U5', 'U6'],
  Alpina: ['B3', 'B4', 'B5', 'B7', 'XD3'],
  Alpine: ['A110', 'A290'],
  Arcfox: ['Alpha S', 'Alpha T', 'Kaola'],
  Ariel: ['Atom', 'Nomad'],
  'Ashok Leyland': ['Dost', 'Bada Dost', 'Partner', 'Boss', 'Viking'],
  Aurus: ['Senat', 'Komendant'],
  Austin: ['Mini', 'Metro', 'Montego', 'Maestro', 'Healey'],
  Avatr: ['11', '12', '07'],
  Baojun: ['510', '530', '730', 'Yep', 'Valli'],
  Bestune: ['T77', 'T99', 'B70', 'T55', 'Pony'],
  Beta: ['RR 300', 'RR 125', 'Xtrainer', 'Alp 200'],
  Bimota: ['Tesi H2', 'KB4', 'DB7'],
  Borgward: ['BX5', 'BX7', 'BX6'],
  Brixton: ['Crossfire 500', 'Cromwell 1200', 'Felsberg 125', 'Sunray 125'],
  Bugatti: ['Chiron', 'Veyron', 'Mistral', 'Tourbillon'],
  Caterham: ['Seven 170', 'Seven 275', 'Seven 360', 'Seven 620'],
  DAF: ['XF', 'CF', 'LF', 'XG'],
  Denza: ['D9', 'N7', 'N8', 'Z9'],
  'DS Automobiles': ['DS 3', 'DS 4', 'DS 7', 'DS 9'],
  Eicher: ['Pro 2049', 'Pro 3015', 'Skyline Pro'],
  Exeed: ['TXL', 'VX', 'LX', 'RX'],
  FAW: ['Bestune T77', 'Besturn B70', 'Tiger', 'Blue Route'],
  Fisker: ['Ocean', 'Karma'],
  'Force Motors': ['Traveller', 'Gurkha', 'Trax', 'Urbania'],
  Freightliner: ['Cascadia', 'M2 106', 'Business Class', 'Sprinter'],
  GasGas: ['EC 300', 'MC 250', 'ES 700', 'SM 700'],
  GAZ: ['Gazelle', 'Sobol', 'Volga', 'Next'],
  Haima: ['7X', '8S', 'M6', 'S5'],
  Haojue: ['DR160', 'DR300', 'TR300', 'KA150', 'Lucky 125'],
  Holden: ['Commodore', 'Colorado', 'Astra', 'Captiva', 'Barina'],
  Hongqi: ['H5', 'H9', 'HS5', 'HS7', 'E-HS9'],
  Hyosung: ['GV125', 'GV250', 'GT250R', 'Aquila 250'],
  Indian: ['Scout', 'Chief', 'Chieftain', 'Roadmaster', 'FTR', 'Springfield'],
  'Iran Khodro': ['Samand', 'Dena', 'Runna', 'Peugeot Pars'],
  Iveco: ['Daily', 'Eurocargo', 'S-Way', 'Stralis'],
  Jaecoo: ['J7', 'J8', 'J6'],
  Jawa: ['42', '350', 'Perak', 'Yezdi Roadster'],
  Jetta: ['VA3', 'VS5', 'VS7'],
  JMC: ['Vigus', 'Grand Avenue', 'Carrying', 'Baodian'],
  Karma: ['Revero', 'GS-6'],
  Keeway: ['RKF 125', 'RKS 150', 'K-Light 202', 'Superlight 200', 'Vieste 300'],
  Kenworth: ['T680', 'T880', 'W900', 'T370'],
  KGM: ['Torres', 'Tivoli', 'Korando', 'Rexton', 'Musso', 'Actyon'],
  Koenigsegg: ['Jesko', 'Gemera', 'Regera', 'Agera'],
  Lancia: ['Ypsilon', 'Delta', 'Thema'],
  Leapmotor: ['C10', 'C11', 'T03', 'B10'],
  'Li Auto': ['L6', 'L7', 'L8', 'L9', 'Mega'],
  Lifan: ['KPR 200', 'KP 150', 'X60', '620'],
  Loncin: ['CR9', 'GP150', 'Voge 300R'],
  Lucid: ['Air', 'Gravity'],
  Luxgen: ['U6', 'U7', 'S5', 'n7'],
  'Lynk & Co': ['01', '02', '03', '05', '06', '09'],
  Mack: ['Anthem', 'Pinnacle', 'Granite', 'LR'],
  MAN: ['TGX', 'TGS', 'TGM', 'TGL', 'TGE'],
  Maybach: ['S-Class', 'GLS', '57', '62'],
  Mercury: ['Grand Marquis', 'Cougar', 'Mountaineer', 'Milan'],
  Morgan: ['Plus Four', 'Plus Six', 'Super 3'],
  Norton: ['Commando 961', 'V4SV', 'Atlas'],
  Oldsmobile: ['Cutlass', 'Alero', 'Bravada', 'Aurora'],
  Ora: ['Good Cat', 'Funky Cat', 'Ballet Cat', '03'],
  Pagani: ['Huayra', 'Zonda', 'Utopia'],
  Peterbilt: ['579', '389', '567', '520'],
  Polaris: ['Sportsman', 'RZR', 'Ranger', 'Slingshot'],
  'QJ Motor': ['SRK 400', 'SRV 300', 'SRT 500', 'SRC 250'],
  Rimac: ['Nevera', 'Concept One'],
  Rivian: ['R1T', 'R1S', 'EDV'],
  Roewe: ['RX5', 'i5', 'Marvel R', 'RX9'],
  Saturn: ['Ion', 'Vue', 'Aura', 'Sky'],
  Scania: ['R Series', 'S Series', 'P Series', 'G Series'],
  Scion: ['tC', 'xB', 'xD', 'FR-S', 'iA'],
  Seres: ['3', '5', '7', 'Aito M5'],
  Skywell: ['ET5', 'HT-i'],
  Smart: ['Fortwo', 'Forfour', '#1', '#3'],
  Soueast: ['DX3', 'DX5', 'DX7', 'S06'],
  SWM: ['SuperDual 650', 'RS 300R', 'Gran Milano 440', 'Varez 125'],
  Tank: ['300', '400', '500', '700'],
  UAZ: ['Patriot', 'Hunter', 'Pickup', 'Buhanka'],
  Vauxhall: ['Corsa', 'Astra', 'Mokka', 'Crossland', 'Grandland', 'Vivaro'],
  Venucia: ['D60', 'T60', 'T90', 'Star'],
  Voge: ['300R', '300RR', '500R', '525DSX', '650DSX', 'SR4'],
  Wey: ['Coffee 01', 'Coffee 02', 'Mocha', 'Latte'],
  Yutong: ['ZK6122', 'T7', 'E12', 'U11'],
  Zongshen: ['RX3', 'RX4', 'Cyclone RA2', 'ZS150'],
  Zotye: ['T600', 'T700', 'Z300', 'Damai X5'],
  Zontes: ['ZT155-U', 'ZT310-R', 'ZT350-T', 'ZT125-U'],
};

/**
 * Names people actually use, mapped to the model they mean.
 *
 * <p>Nobody types "G-Class". They type "G-Wagon", and a search that only reads
 * the official name tells them their car is not in a list it is sitting in --
 * the same failure the accent folding fixed for Citroën, arriving by a
 * different route.
 *
 * <p>Search only. The value saved is always the official name, so one car is
 * never filed under two spellings.
 */
export const MODEL_ALIASES = {
  'G-Class': 'G-Wagon G Wagon Gelandewagen',
  'Range Rover Evoque': 'Evoque',
  'Range Rover Sport': 'RR Sport',
  'Range Rover Velar': 'Velar',
  '911': 'Carrera Turbo S',
  'Aerox 155': 'NVX',
  'Mio Aerox': 'NVX',
  'Iron 883': 'Sportster 883',
  'AMG GT': 'GT Coupe',
  'Maybach S-Class': 'Maybach',
  'Hummer EV': 'Hummer',
  'John Cooper Works': 'JCW',
  'Interceptor 650': 'INT 650',
  'Grand Cherokee': 'Jeep GC',
  'Model 3': 'Tesla 3',
  'Model Y': 'Tesla Y',
};

/**
 * Every model offered for a make: the catalogue's first, then the rest.
 *
 * <p>Catalogue models keep their order — it is by how common they are on the
 * road here, which is what a picker should show before anything is typed.
 */
export function modelsFor(make) {
  const catalogue = Object.keys(VEHICLE_CATALOG[make] ?? {});
  const extra = (VEHICLE_MODELS[make] ?? []).filter((model) => !catalogue.includes(model));
  return [...catalogue, ...extra];
}

/** Whether picking a model under this make can fill the body type in. */
export function makeDerivesBodyType(make) {
  return Object.prototype.hasOwnProperty.call(VEHICLE_CATALOG, make);
}
