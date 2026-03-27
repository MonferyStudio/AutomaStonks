# Automastonks - Documentation Technique Complète

## Vue d'ensemble

**Type :** Jeu d'automatisation 2D (style Factorio/Shapez.io) avec direction artistique Mini Metro/Mini Motorways
**Stack :** TypeScript + Pixi.js v8 + Vite 5
**Cible :** Web (itch.io/GitHub Pages), Desktop (Electron/Tauri), Android (Capacitor)

---

## Architecture Générale

```
┌─────────────────────────────────────────────────────────┐
│                        Game.ts                          │
│             (Contrôleur principal ~1043 lignes)         │
├──────────┬──────────┬──────────┬───────────┬────────────┤
│  World   │   City   │ Factory  │  Economy  │ Transport  │
│  View    │   View   │  View    │           │  (Fleet)   │
├──────────┴──────────┴──────────┴───────────┴────────────┤
│  EventBus (pub/sub typé)  │  TickEngine (10 ticks/s)    │
├───────────────────────────┴─────────────────────────────┤
│  Rendering (Pixi.js v8)  │  Data (JSON)  │  Utils       │
└───────────────────────────┴─────────────────────────────┘
```

**3 niveaux de zoom :**
- **World** (stratégique) → carte globale avec villes connectées
- **City** (macro) → réseau routier, bâtiments, storages, camions
- **Factory** (micro) → belts, machines, production

---

## Structure des dossiers

```
src/
├── main.ts                  Point d'entrée Pixi.js
├── core/                    Systèmes centraux (game loop, events, save, alertes)
├── simulation/              Logique de simulation (factory, belts, machines)
├── economy/                 Argent, marché, shops, quêtes, talents, prix
├── transport/               Flotte de camions et routes inter-bâtiments
├── factory/                 Vue usine (rendu, placement, sélection)
├── world/                   Vue monde (carte, biomes, génération)
├── city/                    Vue ville (layout pré-construit, routes, bâtiments)
├── rendering/               Textures, sprites, caméra, animations
├── ui/                      Interface utilisateur (HUD, panels, popups, fleet)
├── utils/                   Outils (Vector2, Direction, SpatialHash, platform)
├── debug/                   Panel de debug développeur
├── interfaces/              Interfaces partagées (ITickable, ICommand...)
└── data/                    Fichiers JSON de contenu + truckColors.ts
```

---

## Core — Systèmes centraux

### `core/Game.ts` (~1043 lignes)
**Le chef d'orchestre.** Gère tout le cycle de vie du jeu :
- Initialise tous les sous-systèmes (registries, wallet, market, tick engine, fleet)
- Gère les transitions entre les 3 vues (World → City → Factory)
- Crée/détruit les factories et storages à la demande
- Branche les inputs (clavier, souris, resize)
- Auto-save toutes les 30 secondes
- Délègue au GameSaveSystem et AutoSupplySystem
- Intègre le FleetManager pour le transport par camions

### `core/EventBus.ts` (~101 lignes)
**Bus d'événements typé** avec WeakRef pour éviter les fuites mémoire.
Événements émis :
| Événement | Quand |
|-----------|-------|
| `ItemProduced` | Machine produit un item |
| `ItemSold` | Shop vend un item |
| `RecipeDiscovered` | Nouvelle recette trouvée |
| `TickCompleted` | Fin d'un tick de simulation |
| `ViewChanged` | Transition World↔City↔Factory |
| `MoneyChanged` | Coins ou talent modifiés |
| `EntityPlaced/Removed` | Entité ajoutée/retirée du grid |
| `StorageUpdated` | Inventaire storage modifié |
| `QuestCompleted` | Quête terminée |

### `core/TickEngine.ts` (~85 lignes)
**Boucle de simulation à 10 ticks/seconde.**
- Accumulator-based : rattrape jusqu'à 5 ticks de retard
- Fournit `interpolationAlpha` pour le rendu à 60 FPS
- Chaque entité `ITickable` reçoit `onTick(deltaTicks)`

### `core/CommandHistory.ts` (~51 lignes)
**Undo/redo** via le pattern Command (ICommand: execute/undo).
- Pile undo + pile redo
- Utilisé par PlacementSystem pour placer/retirer des entités

### `core/GameSaveSystem.ts` (~417 lignes)
**Sauvegarde complète** du jeu :
- Sérialise : wallet, factories, storages, quêtes, talents, villes débloquées, flotte
- Système de `pendingSave` : conserve les données des villes non visitées
- Quick save (localStorage) + export/import JSON

### `core/SaveManager.ts` (~93 lignes)
**Wrapper localStorage** avec système de slots nommés et métadonnées (timestamp, playtime).

### `core/AutoSupplySystem.ts` (~73 lignes)
**Logistique automatique** à chaque tick :
- Auto-sell : vend tout ce qui sort des output ports au Shop
- Auto-supply : alimente les input ports depuis les storages de la ville (1 item/tick)

### `core/BorderContextComputer.ts` (~176 lignes)
**Calcul du contexte frontière** d'une factory : quels voisins (routes, bâtiments, hors-limites) entourent le slot dans la ville.
- Mode auto : calcule depuis les voisins du layout de la ville
- Mode manuel : utilise les `manualBorder` définis sur le slot (pour les maps Tiled)

### `core/AlertMonitor.ts` (~160 lignes)
**Moniteur d'alertes** : détecte les problèmes dans les factories et notifie le joueur (machines bloquées, ports sans filtre, etc.).

### `core/ObjectPool.ts` (~43 lignes)
**Pool d'objets réutilisables** pour éviter le GC sur les sprites fréquents.

---

## Simulation — Logique du jeu

### `simulation/Factory.ts` (~707 lignes)
**Cœur de la simulation.** Chaque factory est une grille de cellules :
- Grid basée sur SpatialHash pour O(1) lookups
- Polyomino définit la forme de la factory (cellules valides)
- Contient : belts, machines, IOPorts, tunnels, exchangers
- `onTick()` : déplace items sur belts, met à jour machines
- `updateBeltShapes()` : recalcule les formes des belts (droite/courbe) et auto-connecte les dead-ends
- Sérialisation complète pour save/load

### `simulation/Machine.ts` (~381 lignes)
**Unité de production** avec machine d'états :
```
idle → waiting_input → processing → output_ready → blocked
                                         ↓
                                    (output libre)
                                         ↓
                                       idle
```
- Cherche une recette via RecipeRegistry (correspondance exacte des inputs)
- Si aucune recette → produit du **Dust** (signal d'erreur)
- Slots d'entrée/sortie multiples

### `simulation/Belt.ts` (~173 lignes)
**Convoyeur** transportant 1 item à la fois :
- 3 tiers (vitesse 1/2/4 progress par tick)
- Progress 0→10, transfert au belt suivant quand progress = 10
- Formes : `straight`, `curve_cw`, `curve_ccw` (calculées automatiquement)

### `simulation/Grid.ts` (~111 lignes)
**Grille spatiale** avec masque de forme :
- Vérifie les bornes via un Set de positions valides (from Polyomino)
- `canPlace()` / `place()` / `remove()` pour les entités
- `getExteriorBorderCells()` pour l'UI de placement

### `simulation/Polyomino.ts` (~153 lignes)
**Formes connectées** (polyominos) :
- Normalisation (origin 0,0), rotation 90°/180°/270°, miroir
- Validation de connectivité (BFS)
- Bounding box max 5×5
- Factory method `fromPattern()` pour créer depuis de l'ASCII art

### `simulation/Storage.ts` (~165 lignes)
**Inventaire** avec capacité pondérée :
- `storageWeight` par ressource (clou = 0.25, table = 12)
- Capacité = cellCount × 1000 × (1 + upgradeLevel)
- 5 niveaux d'upgrade (5k → 250k coins)
- Stock orders : auto-achat depuis le marché (1 item/tick)

### `simulation/Resource.ts` (~40 lignes)
**Définition des ressources** et registre :
- `ItemCategoryType` : solid | liquid | fragile | bulky (transport)
- `ResourceOrigin` : natural | processed | manufactured | waste
- `ResourceMaterial` : wood | metal | food | fluid | misc
- `storageWeight` : coût en espace dans un storage

### `simulation/Recipe.ts` (~17 lignes)
**Définition d'une recette** : machineType, inputs[], outputs[], processingTicks.

### `simulation/RecipeRegistry.ts` (~76 lignes)
**Recherche de recettes** par type de machine + inputs exacts. Cache les résultats.

### `simulation/RecipeBook.ts` (~36 lignes)
**Livre de recettes découvertes.** Set de recipeId débloqués par le joueur.

### `simulation/Exchanger.ts` (~160 lignes)
**Échangeur 1×2** (inspiré de l'échangeur Factorio) : remplace Splitter + Merger en une seule entité.
- 2 lanes d'entrée + 2 lanes de sortie
- 3 modes : alternate (round-robin), filter (par ressource), ratio (proportionnel)
- Rétrocompatible save : accepte les types 'exchanger', 'splitter', 'merger' à la désérialisation

### `simulation/Tunnel.ts` (~143 lignes)
**Transport longue distance** : paire entrée/sortie avec distance variable et 3 tiers.

### `simulation/Dust.ts` (~17 lignes)
**Déchet** produit quand une recette invalide est tentée. Encourage l'expérimentation.

### `simulation/ItemStack.ts` (~21 lignes)
**Pile d'items** : resourceId + quantity.

### `simulation/StateMachine.ts` (~60 lignes)
**Machine d'états générique** réutilisée par Machine.

### `simulation/FactoryBorderContext.ts` (~41 lignes)
**Structure de données** décrivant les bords d'une factory (quels côtés ont des routes, buildings voisins).

### `simulation/PolyominoRegistry.ts` (~82 lignes)
**Registre de formes** polyomino chargées depuis JSON, accessibles par id ou taille.

---

## Economy — Système économique

### `economy/Wallet.ts` (~69 lignes)
**Portefeuille** du joueur : coins (monnaie) + talent (points de talent).
Émet `MoneyChanged` à chaque transaction.

### `economy/Market.ts` (~52 lignes)
**Marché d'achat** : prix = basePrice × modifier. Débite le wallet.

### `economy/Shop.ts` (~41 lignes)
**Boutique de vente** : le joueur vend ses items produits. Crédite le wallet.

### `economy/CityShop.ts` (~96 lignes)
**Shop rattaché à une ville** : gestion des stocks et prix pour un slot shop spécifique dans le layout.

### `economy/PriceEngine.ts` (~149 lignes)
**Moteur de prix dynamique** : calcule les prix d'achat/vente en fonction de l'offre et la demande. Fluctuations et tendances.

### `economy/QuestManager.ts`
**Système de quêtes** : conditions (produire X items, vendre Y coins), récompenses (coins, talent).
Écoute les événements EventBus pour tracker la progression.

### `economy/TalentTree.ts`
**Arbre de talents** : nœuds avec prérequis, coûts en talent, effets (bonus vitesse, capacité, prix).

---

## Transport — Flotte de camions

### `transport/FleetManager.ts` (~658 lignes)
**Gestionnaire de flotte** : orchestre tous les camions et routes de la ville.
- Création/suppression de routes entre bâtiments (factory, storage, shop)
- Assignation de camions aux routes
- Pathfinding sur le réseau routier de la ville
- Simulation du mouvement des camions (chargement, transit, déchargement)
- Gestion du cargo (items transportés)
- Sérialisation complète pour save/load

### `transport/Truck.ts` (~125 lignes)
**Camion** : entité mobile transportant des items entre bâtiments.
- Machine d'états : loading → in_transit → unloading → returning
- Cargo avec capacité limitée
- Position interpolée pour le rendu fluide
- Sprite directionnel (4 directions)

### `transport/TruckRoute.ts` (~92 lignes)
**Route de camion** : définit un trajet entre un bâtiment source et destination.
- Chemin calculé sur le réseau routier
- Filtre de ressources (quels items transporter)
- Statistiques de transport

---

## Factory — Vue usine

### `factory/FactoryView.ts`
**Vue principale** de l'intérieur d'une usine : conteneur Pixi, caméra, rendu.

### `factory/FactoryRenderer.ts`
**Rendu des entités** : belts animés, machines, ports, tunnels, items sur belts.

### `factory/PlacementSystem.ts`
**Système de placement** : drag pour poser des belts, clic pour machines.
- Supporte le retraçage de belts (changer l'orientation d'un belt existant)
- Commandes undo/redo (PlaceBeltCommand, ReorientBeltCommand, RemoveEntityCommand)

### `factory/SelectionSystem.ts`
**Sélection rectangulaire** pour copier/coller des groupes d'entités.

### `factory/IOPort.ts` (~64 lignes)
**Ports d'entrée/sortie** sur les bords de la factory :
- Input : reçoit des items depuis les storages de la ville
- Output : envoie des items vers le Shop
- Buffer unique (1 item) avec filtre de ressource configurable

---

## World — Vue monde

### `world/WorldView.ts`
**Vue stratégique** : carte du monde avec villes et connexions.

### `world/WorldRenderer.ts`
**Rendu de la carte** : tuiles de terrain, icônes de villes.

### `world/WorldMap.ts` (~77 lignes)
**Structure de données** : collection de villes + connexions entre elles.

### `world/WorldGenerator.ts`
**Génération procédurale** du monde : placement des villes, biomes, connexions.

### `world/BiomeMap.ts`
**Attribution des biomes** basée sur le bruit de Perlin.

### `world/CityType.ts`
**Types de villes** : forest, coastal, industrial, agricultural, mining, metropolis.

### `world/PerlinNoise.ts`
**Bruit de Perlin** pour la génération procédurale.

---

## City — Vue ville

Les villes sont **pré-construites** via Tiled/Aseprite et stockées en JSON. Il n'y a pas de génération procédurale de villes.

### `city/CityView.ts` (~224 lignes)
**Vue macro** d'une ville : layout, routes, bâtiments, camions.
- Gère les clics (achat de slots, ouverture de factories/storages/shops)
- Tooltips d'achat et de camion
- Mode sélection de bâtiment (pour les routes de camion)
- Intègre FleetManager et TickEngine

### `city/CityRenderer.ts` (~568 lignes)
**Rendu du layout** : routes (spritesheet bitmask), bâtiments (spritesheets), camions.
- Rendu des routes par bitmask UDLR (16 variantes)
- Rendu des bâtiments avec tuiles auto-connectées (base + inner corners)
- Rendu des camions avec sprites directionnels et décalage de voie (conduite à droite)
- Textes flottants (FloatingTextManager)
- `setBgColor()`/`getBgColor()` pour la couleur de fond par ville

### `city/CitySlot.ts` (~170 lignes)
**Emplacement de bâtiment** dans le layout :
- Type : `factory | shop | storage`
- Position, polyomino (forme), taille intérieure, coût
- État d'achat, nom optionnel, bordures manuelles
- `slotKey` : identifiant unique (`${slotType}_${slotIndex}`)
- Sérialisation/désérialisation depuis JSON

### `city/CityLayoutData.ts` / `city/CityLayoutLoader.ts`
**Sérialisation et chargement** des layouts de villes depuis JSON.
- `CityLayoutData` : format brut du JSON (slots, roads, dimensions, cameraBounds)
- `deserializeCityLayout()` : reconstruit les objets `CitySlot`, `RoadNetwork`, etc.
- `CityLayoutLoader` : charge les JSON via `import.meta.glob` (Vite eager import)
- Plus de fallback procédural : erreur si aucun JSON trouvé

### `city/RoadNetwork.ts`
**Réseau routier** : pathfinding entre les bâtiments. Utilisé par le FleetManager pour calculer les trajets des camions.

---

## Rendering — Moteur de rendu

### `rendering/TextureCache.ts` (~123 lignes)
**Cache centralisé** de toutes les textures :
- Spritesheet belt (8 frames d'animation 32×32)
- Textures de murs, fond, ports, machines
- Spritesheet routes (road_spritesheet.png — grille 4×4 de 32×32, 16 frames via bitmask UDLR)
- Spritesheet ville (Bramfeld.png — bâtiments auto-tilés)
- Sprites camions (small_truck.png, medium_truck.png — 4 directions)

### `rendering/EntityGraphicsFactory.ts`
**Création de graphiques** pour chaque entité (belt droit/courbe, tunnel, exchanger).
Gère les rotations/flips des sprites de courbe.

### `rendering/SpriteFactory.ts`
**Factory de sprites** Pixi.js depuis les textures cachées.

### `rendering/TileResolver.ts`
**Résolution de tuiles** par connectivité des voisins :
- `getRoadSpriteInfo(u,d,l,r)` : lookup bitmask UDLR → frame index dans road_spritesheet (16 variantes, 0 rotation)
- `getBuildingTileIndices(u,d,l,r,diagTL,diagTR,diagBL,diagBR)` : sélection de tuiles de bâtiment (base + inner corners overlay)

### `rendering/CameraController.ts`
**Contrôle caméra** : pan (drag), zoom (molette), avec limites et bounds configurables.

### `rendering/AnimationManager.ts`
**Gestionnaire d'animations** de sprites.

### `rendering/PolyominoRenderer.ts`
**Rendu de contours** de polyominos pour le placement preview.

---

## UI — Interface utilisateur

| Fichier | Rôle |
|---------|------|
| `UIManager.ts` | Coordinateur central de tous les panels UI |
| `HUD.ts` | Affichage tête haute (coins, ville courante) |
| `Toolbar.ts` | Barre d'outils factory (belt/machine/exchanger/tunnel/port) |
| `CityToolbar.ts` | Barre d'outils ville (fleet, market board) |
| `RecipeBookUI.ts` | Affichage du livre de recettes découvertes |
| `MarketUI.ts` | Interface d'achat au marché |
| `MarketBoardUI.ts` | Tableau des prix du marché (offre/demande) |
| `ShopUI.ts` | Interface de vente dans un shop |
| `QuestPanel.ts` | Liste des quêtes et progression |
| `StorageUI.ts` | Affichage inventaire d'un storage |
| `StatsPanel.ts` | Statistiques de production |
| `EntryConfigUI.ts` | Configuration des ports I/O (filtre ressource) |
| `FleetUI.ts` (~812 lignes) | Gestion complète de la flotte de camions (routes, assignation) |
| `Tooltip.ts` | Infobulles au survol |
| `PurchaseTooltip.ts` | Aperçu d'achat de slot |
| `TruckTooltip.ts` | Infobulle d'un camion (cargo, destination) |
| `DropdownMenu.ts` | Menu hamburger (save/export/reset) |
| `Tutorial.ts` | Tutoriel/indices à l'écran |
| `NotificationSystem.ts` | Notifications en jeu (toasts) |
| `FloatingTextManager.ts` | Textes flottants animés sur la carte ("+15 coins") |
| `InputPopup.ts` | Popup de saisie texte générique |
| `ItemPickerUI.ts` (~412 lignes) | Sélecteur d'items/ressources avec filtres et recherche |
| `itemVisual.ts` | Rendu visuel d'un item (icône + nom) |
| `closeButton.ts` | Bouton de fermeture réutilisable |

---

## Utils — Utilitaires

### `utils/Vector2.ts` (~49 lignes)
Vecteur 2D : add, subtract, equals, rotate90CW/CCW, manhattanDistance, toKey/fromKey.

### `utils/Direction.ts` (~49 lignes)
Enum directionnel (Up/Right/Down/Left) + helpers : directionToVector, opposite, rotateCW/CCW.

### `utils/Constants.ts` (~48 lignes)
Constantes globales :
- `TICK_RATE = 10` (ticks/seconde)
- `FACTORY_CELL_RATIO = 5` (1 cellule ville = 5×5 cellules factory)
- `COLORS` : palette dark theme (#1a1a2e, #16213e, #1c2541)
- `BELT_TIERS` : vitesse et coût par tier
- `TUNNEL_TIERS` : portée et coût par tier

### `utils/SpatialHash.ts` (~59 lignes)
Hash spatial O(1) : position → entité. Support requêtes de voisinage.

### `utils/formatNumber.ts` (~34 lignes)
Formatage grands nombres : 1000 → 1K, 1000000 → 1M, jusqu'à 1e303.

### `utils/platform.ts`
Détection de plateforme (web, Electron, Capacitor) pour adapter le comportement.

### `utils/responsive.ts`
Utilitaires de responsive design pour adapter l'UI aux différentes tailles d'écran.

---

## Debug

### `debug/DebugPanel.ts`
**Panel de debug développeur** : inspection et édition en temps réel du layout de la ville.
- Paint mode : placer/supprimer des routes, bâtiments (factory/shop/storage)
- Configuration des slots : coût, nom, taille intérieure, bordures manuelles
- Édition de la bgColor de la ville
- Export/import des layouts en JSON
- Pas de génération procédurale (villes construites manuellement)

---

## Interfaces partagées

| Interface | Fichier | Méthodes | Utilisé par |
|-----------|---------|----------|-------------|
| `ITickable` | interfaces/ITickable.ts | sleeping, onTick(dt), wake/sleep | Machine, Storage, Factory |
| `IRenderable` | interfaces/IRenderable.ts | isDirty, displayObject, render() | Tous les renderers |
| `ISerializable<T>` | interfaces/ISerializable.ts | serialize(): T, deserialize(T) | Wallet, QuestManager, TalentTree |
| `IGridPlaceable` | interfaces/IGridPlaceable.ts | position, getCells() | Belt, Machine, Exchanger, Tunnel, IOPort |
| `ICommand` | interfaces/ICommand.ts | description, execute(), undo() | PlaceBeltCommand, ReorientBeltCommand, etc. |

---

## Fichiers de données (src/data/)

### `resources.json` — 25 ressources
Chaque ressource a : id, name, color, shape, category (transport), origin, material, storageWeight, basePrice, sellPrice, tier.

| Tier | Exemples |
|------|----------|
| 0 (brut) | wood_log, wheat, water, iron_ore, tomato, olive, sand, stone, copper_ore |
| 1 (transformé) | plank, flour, iron_ingot, dough, nail, screw, sawdust, copper_bar, glass, beam |
| 2 (produit fini) | chair, table, bread, iron_plate, copper_plate, paper, stone_brick |

### `recipes.json` — 20 recettes
8 types de machines : cut, press, cook, mix, extract, assemble, smelt, slice.

| Recette | Machine | Input → Output |
|---------|---------|----------------|
| cut_log_to_planks | cut | 1 wood_log → 2 plank |
| press_log_to_sawdust | press | 1 wood_log → 3 sawdust |
| press_olive_to_oil | press | 1 olive → 1 olive_oil |
| smelt_iron_ore | smelt | 1 iron_ore → 1 iron_ingot |
| mix_flour_water | mix | 1 flour + 1 water → 1 dough |
| cook_dough_to_bread | cook | 1 dough → 1 bread |
| assemble_chair | assemble | 2 plank + 2 nail → 1 chair |
| assemble_table | assemble | 3 plank + 2 screw → 1 table |
| *(+ 12 autres recettes)* | | |

### `machines.json` — 8 machines
Chaque machine a : type d'opération, taille, slots I/O, couleur, coût.

### `polyominos.json` — 30+ formes
Catégories : monomino (1), domino (2), tromino (3), tetromino (4), pentomino (5), hexomino (6).

### `itemCategories.json` — 3 axes de catégorisation
- **Transport** : solid, liquid, fragile, bulky
- **Origin** : natural, processed, manufactured, waste
- **Material** : wood, metal, food, fluid, misc

### `shops.json` — Définition des shops
Configuration des boutiques : items vendus, prix, stocks.

### `truckColors.ts` — Couleurs des camions
Palette de couleurs assignées aux camions pour les distinguer visuellement.

### `vehicles.json` — Types de véhicules
Définition des types de véhicules (capacité, vitesse, catégories transportables).

### `talents.json` — Arbre de talents
Nœuds avec prérequis, coûts, effets (bonus vitesse, capacité, prix).

### `quests.json` — Quêtes
Conditions (produire/vendre/découvrir) + récompenses.

### `cityTypes.json` — 6 types de villes
Forest, Coastal, Industrial, Agricultural, Mining, Metropolis.

### `worldCities.json` — Villes pré-générées
Données de la carte du monde.

### `cities/city_bramfeld.json` — Layout de ville
Layout pré-construit de la ville Bramfeld (Tiled/Aseprite → JSON).

---

## Sprites (public/sprites/)

```
sprites/
├── factory/                 Intérieur d'usine
│   ├── belt_straight.png      Spritesheet 256×32 (8 frames animation)
│   ├── belt_curve.png         Spritesheet 256×32 (8 frames animation)
│   ├── belt_entry.png         Port d'entrée 32×32
│   ├── belt_exit.png          Port de sortie 32×32
│   ├── wall_cell.png          Mur de factory 32×32
│   ├── background_cell.png    Sol de factory 32×32
│   └── machine_cutter.png     Sprite machine cutter
├── city/                    Vue ville
│   ├── road_spritesheet.png   Grille 4×4 de 32×32 (16 variantes routes)
│   ├── Bramfeld.png           Spritesheet bâtiments ville Bramfeld
│   ├── small_truck.png        Petit camion (4 directions)
│   └── medium_truck.png       Camion moyen (4 directions)
└── items/                   Sprites d'items
    ├── metal/                 Minerais et métaux
    │   ├── copper_bar.png
    │   ├── copper_ore.png
    │   ├── copper_plate.png
    │   ├── copper_wire.png
    │   ├── iron_bar.png
    │   ├── iron_ore.png
    │   ├── iron_plate.png
    │   └── nails.png
    ├── stone/                 Pierre et dérivés
    │   ├── glass.png
    │   ├── sand.png
    │   ├── stone.png
    │   └── stone_brick.png
    └── wood/                  Bois et dérivés
        ├── beam.png
        ├── paper.png
        ├── plank.png
        └── wood_log.png
```

---

## Patterns architecturaux

| Pattern | Utilisation |
|---------|-------------|
| **EventBus (pub/sub)** | Découplage entre systèmes (production → UI, vente → wallet) |
| **State Machine** | Machine (idle→processing→output), Truck (loading→transit→unloading) |
| **Command** | Undo/redo de placement (PlaceBelt, PlaceExchanger, RemoveEntity) |
| **Registry** | ResourceRegistry, RecipeRegistry, PolyominoRegistry |
| **Spatial Hash** | O(1) lookup sur grille (Grid, SpatialHash) |
| **Object Pool** | Réutilisation de sprites pour éviter le GC |
| **Data-Driven** | Tout le contenu en JSON, zéro hardcode de recettes/ressources |
| **Bitmask Lookup** | Résolution de tuiles routes par clé UDLR 4 bits → frame index O(1) |
| **Context Pattern** | GameSaveSystem reçoit un contexte mutable (Maps partagées) |
| **SlotKey Identity** | `${slotType}_${slotIndex}` pour identifier les slots de manière unique |

---

## Commandes de build

```bash
npm run dev       # Serveur de développement Vite
npm run build     # Build production (tsc + vite build)
npm run preview   # Preview du build production
```

---

## Statistiques

- **Fichiers TypeScript :** 102
- **Fichiers JSON data :** 12 (dont 1 city layout)
- **Sprites :** 27 (7 factory + 4 city + 16 items)
- **Bundle optimisé :** ~638KB (main chunk)
