const COMMUNITY_DRAGON_BASE_URL =
    'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default';

function getCommunityDragonUrl(imagePath: string): string | null {
    if (!imagePath) return null;

    const prefix = '/lol-game-data/assets/';
    if (!imagePath.startsWith(prefix)) return null;

    const relative = imagePath.slice(prefix.length);
    const lowered = relative.toLowerCase();

    return `${COMMUNITY_DRAGON_BASE_URL}/${lowered}`;
}

export function getChampionNameFromImagePath(imagePath: string): string | null {
    const match = imagePath.match(/\/Characters\/([^/]+)\//);
    return match ? match[1] : null;
}

export function createCDNImageUrl(imagePath: string): string {
    const cdnBaseUrl = '//wsrv.nl/?url=';
    const cdnImagePath = getCommunityDragonUrl(imagePath);

    return `${cdnBaseUrl}${cdnImagePath}`;
}

type SanctumBannerImageInput = {
    bannerSkin: { id: number; name: string };
    bannerBackgroundTexture?: string | null;
};

export function createSanctumBannerImageUrl(
    banner: SanctumBannerImageInput,
    itemType: number,
): string | null {
    const texture = banner.bannerBackgroundTexture;

    if (texture && /\.(?:jpe?g|png)$/i.test(texture)) {
        return createCDNImageUrl(texture);
    }

    if (itemType !== 1) return null;

    const skinId = banner.bannerSkin.id;
    const skinNameMatch = banner.bannerSkin.name.match(/^(.+)Skin(\d+)$/i);

    if (skinNameMatch) {
        const championSlug = skinNameMatch[1].toLowerCase();
        const skinNumber = Number.parseInt(skinNameMatch[2], 10);
        const splashPath = `/lol-game-data/assets/ASSETS/Characters/${championSlug}/Skins/Skin${skinNumber}/Images/${championSlug}_splash_uncentered_${skinNumber}.jpg`;

        return createCDNImageUrl(splashPath);
    }

    const championId = Math.floor(skinId / 1000);
    const splashPath = `/lol-game-data/assets/v1/champion-splashes/uncentered/${championId}/${skinId}.jpg`;

    return createCDNImageUrl(splashPath);
}

// const testEmote =
//     '/lol-game-data/assets/ASSETS/Loadouts/SummonerEmotes/TFT/StandardRewards/4422_The_Boss_Inventory.png';
// const testTile =
//     '/lol-game-data/assets/ASSETS/Characters/Annie/Skins/Skin01/Images/annie_splash_tile_1.jpg';
// const testIcon = '/lol-game-data/assets/v1/profile-icons/5164.jpg';

// console.log(getCommunityDragonUrl(testEmote));
// console.log(getCommunityDragonUrl(testTile));
// console.log(getCommunityDragonUrl(testIcon));

// console.log(createCDNImageUrl(testTile));

const title =
    '/lol-game-data/assets/ASSETS/PlayerTitles/1409_AprilFools_AchievementTitle.svg';
const url = getCommunityDragonUrl(title);
const cdnUrl = createCDNImageUrl(title);
console.log(cdnUrl);
