import {
    createCDNImageUrl,
    getChampionNameFromImagePath,
} from './lib/images.ts';
import { supabase } from './lib/supabase.ts';
import type {
    CatalogItemRecord,
    RawSkinsById,
    RawSkin,
    RawChampion,
    RawSkinline,
    ChampionRecord,
    SkinlineRecord,
    RawFinisher,
    RawIcon,
    RawEmote,
    RawWard,
    RawUniverse,
    UniverseRecord,
} from './lib/types.ts';
import fs from 'fs';
import { refreshPublicApi } from './lib/refreshPublicApi.ts';
import { DiscordLogger } from './lib/discordLogger.ts';

const logger = new DiscordLogger('processStaticData');

const skinlineJsonData = fs.readFileSync('data/source/skinlines.json', 'utf8');
const skinlines: RawSkinline[] = JSON.parse(skinlineJsonData);
const universeJsonData = fs.readFileSync('data/source/universes.json', 'utf8');
const universes: RawUniverse[] = JSON.parse(universeJsonData);

const championJsonData = fs.readFileSync(
    'data/source/champion-summary.json',
    'utf8',
);
const champions: RawChampion[] = JSON.parse(championJsonData);
const MIN_CHAMPION_ID = 1;
const MAX_DATABASE_CHAMPION_ID = 32767;

// helpers
function normalizeChampionKey(key: string): string {
    return key.trim().toLowerCase();
}

function isDatabaseChampion(champion: RawChampion): boolean {
    return (
        champion.id >= MIN_CHAMPION_ID &&
        champion.id <= MAX_DATABASE_CHAMPION_ID
    );
}

function ChampionDictionary(): Map<string, number> {
    const championDictionary = new Map<string, number>();
    for (const champ of champions) {
        if (!isDatabaseChampion(champ)) continue;
        championDictionary.set(normalizeChampionKey(champ.alias), champ.id);
    }

    return championDictionary;
}

function ExcludedChampionAliases(): Set<string> {
    return new Set(
        champions
            .filter(
                (champion) =>
                    champion.id > 0 && !isDatabaseChampion(champion),
            )
            .map((champion) => normalizeChampionKey(champion.alias)),
    );
}

function UniverseDictionary(): Map<number, number> {
    const universeDictionary = new Map<number, number>();
    for (const universe of universes) {
        for (const skinSetId of universe.skinSets) {
            universeDictionary.set(skinSetId, universe.id);
        }
    }

    return universeDictionary;
}

// processing functions
function processChampions(): ChampionRecord[] {
    const reducedChamps = champions
        .filter(isDatabaseChampion)
        .map((champ) => ({
            id: champ.id,
            Slug: champ.alias,
            Name: champ.name,
            ImageURL: createCDNImageUrl(champ.squarePortraitPath),
        }));
    return reducedChamps;
}

function processSkinlines(
    universeDictionary: Map<number, number>,
): SkinlineRecord[] {
    const reducedSkinlines = skinlines
        .filter((skinline) => skinline.id > 0)
        .map((skinline) => ({
            id: skinline.id,
            Name: skinline.name,
            UniverseID: universeDictionary.get(skinline.id) || 0,
        }));
    return reducedSkinlines;
}

function processUniverses(): UniverseRecord[] {
    const reducedUniverses = universes.map((universe) => ({
        id: universe.id,
        Name: universe.name,
    }));
    return reducedUniverses;
}

function processFinishers(): CatalogItemRecord[] {
    const jsonData = fs.readFileSync('data/source/finishers.json', 'utf8');
    const finisherJson: RawFinisher[] = JSON.parse(jsonData);
    const finishers: CatalogItemRecord[] = finisherJson.map((finisher) => ({
        ItemType: 5,
        RiotItemID: finisher.itemId,
        Name: finisher.translatedName,
        ChampionID: null,
        SkinlineID: null,
        ImageURL: createCDNImageUrl(finisher.iconPath),
        ItemID: finisher.contentId,
        ParentItemID: null,
        SortSection: 5,
    }));
    return finishers;
}

function processIcons(): CatalogItemRecord[] {
    const jsonData = fs.readFileSync('data/source/icons.json', 'utf8');
    const iconJson: RawIcon[] = JSON.parse(jsonData);

    const icons: CatalogItemRecord[] = iconJson.map((icon) => ({
        ItemType: 4,
        RiotItemID: icon.id,
        Name: icon.title,
        ChampionID: null,
        SkinlineID: null,
        ImageURL: createCDNImageUrl(icon.imagePath),
        ItemID: icon.contentId,
        ParentItemID: icon.contentId,
        SortSection: 4,
    }));
    return icons;
}

function processEmotes(): CatalogItemRecord[] {
    const jsonData = fs.readFileSync('data/source/emotes.json', 'utf8');
    const emoteJson: RawEmote[] = JSON.parse(jsonData);

    const emotes: CatalogItemRecord[] = emoteJson.map((emote) => ({
        ItemType: 3,
        RiotItemID: emote.id,
        Name: emote.name,
        ChampionID: null,
        SkinlineID: null,
        ImageURL: createCDNImageUrl(emote.inventoryIcon),
        ItemID: emote.contentId,
        ParentItemID: emote.contentId,
        SortSection: 3,
    }));
    return emotes;
}

function processWards(): CatalogItemRecord[] {
    const jsonData = fs.readFileSync('data/source/wards.json', 'utf8');
    const wardJson: RawWard[] = JSON.parse(jsonData);

    const wards: CatalogItemRecord[] = wardJson.map((ward) => ({
        ItemType: 6,
        RiotItemID: ward.id,
        Name: ward.name,
        ChampionID: null,
        SkinlineID: null,
        ImageURL: createCDNImageUrl(ward.wardImagePath),
        ItemID: ward.contentId,
        ParentItemID: ward.contentId,
        SortSection: 6,
    }));
    return wards;
}

function processSkins(
    ChampionDict: Map<string, number>,
    excludedChampionAliases: Set<string>,
): CatalogItemRecord[] {
    const jsonData = fs.readFileSync('data/source/skins.json', 'utf8');

    const skinJson: RawSkinsById = JSON.parse(jsonData);
    const skins: RawSkin[] = Object.values(skinJson);

    const reducedSkins: CatalogItemRecord[] = skins.flatMap((skin: RawSkin) => {
        const rawChromas = skin.chromas ?? [];
        const hasChromas = rawChromas.length > 0;
        if (skin.isBase && !hasChromas) {
            return [];
        }

        const champion = getChampionNameFromImagePath(skin.tilePath);
        if (!champion) {
            console.warn(
                `Could not determine champion for skin: ${skin.name} (ID: ${skin.id})`,
            );
            logger.warn(
                `Could not determine champion for skin: ${skin.name} (ID: ${skin.id}).`,
            );
            return [];
        }

        const championKey = normalizeChampionKey(champion);
        if (excludedChampionAliases.has(championKey)) {
            return [];
        }

        const championID = ChampionDict.get(championKey);
        if (!championID) {
            console.warn(
                `Could not determine champion ID for skin: ${skin.name} (ID: ${skin.id})`,
            );
            logger.warn(
                `Could not determine champion ID for skin: ${skin.name} (ID: ${skin.id}).`,
            );
            return [];
        }

        const baseImageUrl = createCDNImageUrl(skin.tilePath);
        if (!baseImageUrl) {
            console.warn(
                `Could not create image URL for skin: ${skin.name} (ID: ${skin.id})`,
            );
            logger.warn(
                `Could not create image URL for skin: ${skin.name} (ID: ${skin.id}).`,
            );
            return [];
        }

        const skinlineId = skin.skinLines ? skin.skinLines[0]?.id : null;

        const baseSkin: CatalogItemRecord = {
            ItemType: 1,
            RiotItemID: skin.id,
            Name: skin.name,
            ChampionID: championID,
            SkinlineID: skinlineId,
            ImageURL: baseImageUrl,
            ItemID: skin.contentId,
            ParentItemID: skin.contentId,
            SortSection: 1,
        };

        const chromas: CatalogItemRecord[] = [];

        if (hasChromas) {
            for (const chroma of rawChromas) {
                const chromaURL = createCDNImageUrl(chroma.tilePath);
                if (!chromaURL) {
                    console.warn(
                        `Could not create image URL for chroma: ${chroma.id} of skin: ${skin.name} (ID: ${skin.id})`,
                    );
                    logger.warn(
                        `Could not create image URL for chroma: ${chroma.id} of skin: ${skin.name} (ID: ${skin.id}).`,
                    );
                    continue;
                }

                const chromaSkin: CatalogItemRecord = {
                    ItemType: 2,
                    RiotItemID: chroma.id,
                    Name: chroma.name,
                    ChampionID: championID,
                    SkinlineID: skinlineId,
                    ImageURL: chromaURL,
                    ItemID: chroma.contentId,
                    ParentItemID: skin.isBase
                        ? chroma.contentId
                        : baseSkin.ItemID,
                    SortSection: 1,
                };

                chromas.push(chromaSkin);
            }
        }

        return skin.isBase ? chromas : [baseSkin, ...chromas];
    });

    return reducedSkins;
}

// upsert functions

async function upsertCatalogItems(
    items: CatalogItemRecord[],
    itemGroup: string,
) {
    const { error } = await supabase
        .from('CatalogItem')
        .upsert(items, { onConflict: 'ItemType,RiotItemID' });

    if (error) {
        throw new Error(`Failed to upsert ${itemGroup}: ${error.message}`);
    } else {
        console.log(`Inserted/Updated ${itemGroup} successfully.`);
    }
}

async function upsertChampionData(champions: ChampionRecord[]) {
    const { error } = await supabase
        .from('Champion')
        .upsert(champions, { onConflict: 'id' });
    if (error) {
        throw new Error(`Failed to upsert champion data: ${error.message}`);
    } else {
        console.log(`Inserted/Updated champion data successfully.`);
    }
}

async function upsertUniverseData(universes: UniverseRecord[]) {
    const { error } = await supabase
        .from('Universe')
        .upsert(universes, { onConflict: 'id' });
    if (error) {
        throw new Error(`Failed to upsert universe data: ${error.message}`);
    } else {
        console.log(`Inserted/Updated universe data successfully.`);
    }
}

async function upsertSkinlineData(skinlines: SkinlineRecord[]) {
    const { error } = await supabase
        .from('Skinline')
        .upsert(skinlines, { onConflict: 'id' });
    if (error) {
        throw new Error(`Failed to upsert skinline data: ${error.message}`);
    } else {
        console.log(`Inserted/Updated skinline data successfully.`);
    }
}

async function main() {
    const ChampionDict = ChampionDictionary();
    const excludedChampionAliases = ExcludedChampionAliases();
    const UniverseDict = UniverseDictionary();

    const processedChampions = processChampions();
    await upsertChampionData(processedChampions);

    const processedUniverses = processUniverses();
    await upsertUniverseData(processedUniverses);

    const processedSkinlines = processSkinlines(UniverseDict);
    await upsertSkinlineData(processedSkinlines);

    const processedSkins = processSkins(
        ChampionDict,
        excludedChampionAliases,
    );
    await upsertCatalogItems(processedSkins, 'skins and chromas');

    const processedFinishers = processFinishers();
    await upsertCatalogItems(processedFinishers, 'finishers');

    const processedIcons = processIcons();
    await upsertCatalogItems(processedIcons, 'icons');

    const processedEmotes = processEmotes();
    await upsertCatalogItems(processedEmotes, 'emotes');

    const processedWards = processWards();
    await upsertCatalogItems(processedWards, 'wards');

    await refreshPublicApi(logger);
}
main()
    .then(async () => {
        await logger.finish();
    })
    .catch(async (error: unknown) => {
        console.error('Unexpected error during static data processing:', error);
        await logger.error(
            'Unexpected error during static data processing.',
        );
        await logger.finish();
        process.exitCode = 1;
    });
