export type TowerDTO = {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    rangeMeters: number;
    active?: boolean | null;
};

export type DroneDTO = {
    id: number;
    name: string;
    latitude?: number | null;
    longitude?: number | null;
    towerId?: number | null;
    status?: string | null;
};

export type WaypointDTO = {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
};
