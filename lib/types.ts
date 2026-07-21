// imported data types
export type RawSkin = {
    id: number;
    contentId: string;
    isBase: boolean;
    name: string;
    tilePath: string;
    skinLines?: Array<{ id: number }> | null;
    chromas?: RawChroma[] | null;
};

export type RawChampion = {
    id: number;
    name: string;
    alias: string;
    squarePortraitPath: string;
};

export type RawSkinline = {
    id: number;
    name: string;
};

export type RawUniverse = {
    id: number;
    name: string;
    skinSets: number[];
};

export type RawChroma = {
    id: number;
    name: string;
    tilePath: string;
    contentId: string;
};

export type RawFinisher = {
    itemId: number;
    translatedName: string;
    iconPath: string;
    contentId: string;
};

export type RawSkinsById = Record<string, RawSkin>;

export type price = {
    cost: number;
    currency: string;
    discount: number;
};

export type RawCatalogSale = {
    active: boolean;
    inventoryType: string;
    inactiveDate: string | null;
    itemId: number;
    prices: price[];
    sale: {
        endDate: Date;
        prices: price[];
        startDate: Date;
    } | null;
    releaseDate: string;
    subInventoryType: string;
    tags: string[];
};

export type RawMythicSale = {
    startTime: string;
    endTime: string;
    catalogEntries: Array<{
        displayMetadata: {
            type?: string;
            shoppefront?: {
                bundleType?: string;
            };
        };
        name: string;
        id: string;
        endTime: string;
        purchaseUnits: Array<{
            fulfillment: {
                itemId: string;
                name: string;
            };
            paymentOptions?: Array<{
                payments: Array<{
                    finalDelta: number;
                    name: string;
                }>;
            }>;
        }>;
    }>;
    displayMetadata: {
        shoppefront: {
            categories: string[];
        };
    };
};

export type RawSanctumBanner = {
    bannerSkin: {
        id: number;
        name: string;
        rarity: 'kExalted' | 'kMythic';
    };
    startDate: number;
    endDate: number;
    chasePityThreshold: number;
    highlightPityThreshold: number;
    bannerBackgroundTexture?: string | null;
};

export type RawYourShopStatus = {
    endTime: string;
    hubEnabled: boolean;
    name: string;
    startTime: string;
};

export type RawIcon = {
    id: number;
    contentId: string;
    title: string;
    imagePath: string;
};

export type RawWard = {
    id: number;
    contentId: string;
    name: string;
    wardImagePath: string;
};

export type RawEmote = {
    id: number;
    contentId: string;
    name: string;
    inventoryIcon: string;
};

// database types
export type CatalogItemRecord = {
    ItemID: string;
    ItemType: number;
    RiotItemID: number;
    ChampionID: number | null;
    Name: string;
    SkinlineID: number | null;
    ImageURL: string;
    ParentItemID: string | null;
    SortSection: number;
};

export type CatalogSaleRecord = {
    RiotItemID: number;
    SaleStartAt: Date;
    SaleEndAt: Date;
    ItemType: number;
    NormalPrice: number;
    SalePrice: number;
    PercentOff: number;
    Currency: string;
    IsActive: boolean;
    Limited: boolean;
};

export type sectionType = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'FEATURED';

export type MythicSaleRecord = {
    OfferID: string;
    SaleStartAt: Date;

    PrimaryItemID: string;
    SaleEndAt: Date;
    Price: number;
    Currency: string;
    IsActive: boolean;
    Section: sectionType;

    IsBundle: boolean;
    IncludedItems: string[];
    BundleType: string | null;
};

export type SanctumSaleRecord = {
    RiotItemID: number;
    ItemType: number;
    SaleStartAt: Date;
    SaleEndAt: Date;
    Rarity: 'EXALTED' | 'MYTHIC_VARIANT';
    ChasePityThreshold: number;
    BannerImageURL: string | null;
    IsActive: boolean;
};

export type YourShopSaleRecord = {
    ShopName: string;
    SaleStartAt: Date;
    SaleEndAt: Date;
    HubEnabled: boolean;
    IsActive: boolean;
};

export type ChampionRecord = {
    id: number;
    Slug: string;
    Name: string;
    ImageURL: string;
};

export type SkinlineRecord = {
    id: number;
    Name: string;
    UniverseID: number;
};

export type UniverseRecord = {
    id: number;
    Name: string;
};
